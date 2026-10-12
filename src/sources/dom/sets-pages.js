/*
 * Sets on Torn's own pages (3.24.0, mockups Z6-Z10): where things are on the
 * museum, the points market, a trade and a forum thread, and the small marks
 * Torn Archive floats there.
 *
 * The museum, the points market and the forum were never read as markup when
 * this was written - only as text. So nothing here leans on a class name of
 * theirs: a control is found by the words on it (EXCHANGE, ADD LISTING), a
 * piece by its picture (/images/items/{id}/), a box by standing next to its
 * button. Where the page is not what this expects, nothing is found and
 * nothing is marked; the panel's box still says the numbers.
 *
 * It reads the page and adds marks of its own (absolutely placed, they take
 * no room and catch no click). It never presses anything of Torn's.
 */

import { parseTradeItemLine } from './trade.js';
import { holdMarks, releaseMarks } from './float.js';
import { parsePointsRow } from '../../core/points.js';

export const SET_MARK_CLASS = 'tarc-setmark';
export const SET_FILL_CLASS = 'tarc-setfill';
/* A hairline on the top edge of a row of Torn's (the points market). */
export const SET_RULE_CLASS = 'tarc-setrule';
/* Small buttons of ours floating beside one of Torn's money boxes (1.3.7; floating, and so taking no room, since 1.3.8). */
export const SET_FILLROW_CLASS = 'tarc-fillrow';

const OURS = '#tarc-host, .' + SET_MARK_CLASS + ', .' + SET_FILL_CLASS + ', .' + SET_RULE_CLASS + ', .' + SET_FILLROW_CLASS;
const OUR_WORDS = '.' + SET_MARK_CLASS;

function setsShown(el) {
    return Boolean(el && el.getClientRects && el.getClientRects().length);
}

function setsOurs(el) {
    return Boolean(el && el.closest && el.closest(OURS));
}

function setsWords(el) {
    if (!el) return '';
    let raw = String((el.tagName === 'INPUT' ? el.value : el.textContent) || '');
    // A mark of ours inside the element is not its words (a thread's title was read back with its mark in it).
    if (el.tagName !== 'INPUT' && el.querySelectorAll) for (const m of el.querySelectorAll(OUR_WORDS)) raw = raw.replace(m.textContent, '');
    return raw.replace(/\s+/g, ' ').trim();
}

/**
 * A float mark inside one of Torn's elements: made once, its words and state kept up, gone with no words.
 * @param {string} where - '' (the element's top edge, left), 'right' (its right side, centred) or 'under'
 */
export function setMark(host, text, state = '', where = '') {
    if (!host || !host.children) return null;
    let mark = null;
    for (const c of host.children) {
        if (c.classList && c.classList.contains(SET_MARK_CLASS)) {
            mark = c;
            break;
        }
    }
    if (!text) {
        if (mark) {
            mark.remove();
            releaseMarks(host);
        }
        return null;
    }
    if (!mark) {
        mark = host.ownerDocument.createElement('span');
        mark.className = 'tarc-float ' + SET_MARK_CLASS;
        host.appendChild(mark);
        holdMarks(host);
    }
    if (mark.textContent !== text) mark.textContent = text;
    if (mark.dataset.state !== state) mark.dataset.state = state;
    if ((mark.dataset.where || '') !== where) mark.dataset.where = where;
    return mark;
}

/** Every Sets mark and Fill button off the page, and Torn's elements given back as they were. */
export function clearSetMarks(doc = document) {
    for (const m of doc.querySelectorAll('.' + SET_MARK_CLASS + ', .' + SET_FILLROW_CLASS + ', .' + SET_FILL_CLASS + ', .' + SET_RULE_CLASS)) {
        const host = m.parentElement;
        m.remove();
        if (host && !host.querySelector(':scope > .tarc-float')) releaseMarks(host);
    }
}

/** Torn's controls with these words on them (the innermost one of each). */
export function findByWords(doc, re) {
    const found = [];
    for (const el of doc.querySelectorAll('button, input[type="submit"], input[type="button"], a, [role="button"], span.btn, div.btn')) {
        if (setsOurs(el) || !setsShown(el)) continue;
        if (re.test(setsWords(el))) found.push(el);
    }
    return found.filter((el) => !found.some((o) => o !== el && el.contains(o)));
}

/** The text boxes you can see nearest a control: in its form, else in what holds it, a few steps up at most. */
export function boxesNear(el, min = 1) {
    let node = el.form || el.parentElement;
    for (let up = 0; node && up < 6; up += 1, node = node.parentElement) {
        const boxes = [...node.querySelectorAll('input')].filter((i) => /^(text|number|tel|)$/.test(i.getAttribute('type') || '') && setsShown(i) && !setsOurs(i));
        if (boxes.length >= min) return { root: node, boxes };
    }
    return { root: null, boxes: [] };
}

/**
 * A box and its hidden twin (Torn's money boxes keep the plain number in one), for writeInputs.
 * Only the boxes: the group also holds Torn's "$" button (span.input-money-symbol > input.wai-btn, type button -
 * read on the real vault and Item Market 2026-10-12). Until 1.3.8 it was handed over with them, and being the
 * first input you can see it was the one told "typed": Torn's own script on the text box never heard it, so the
 * number stood there without its commas and WITHDRAW / Buy stayed off (the owner: "when i press withdraw, button
 * doesnt pop up. same with item market when filled").
 */
export function boxTwins(box) {
    const group = box && box.closest && box.closest('.input-money-group');
    const isBox = (i) => /^(text|number|tel|hidden|)$/.test(String(i.getAttribute('type') || '').toLowerCase());
    return group ? [...group.querySelectorAll('input')].filter(isBox) : box ? [box] : [];
}

/**
 * The museum's EXCHANGE controls you can see, each with the set it swaps and its "number of sets" box (if any).
 * The set is told by the words around the control ("To exchange a Plushie set for 10 points...").
 * @param sets [{ key, museum }]
 * @returns [{ set, button, box, root }]
 */
export function museumExchanges(doc, sets, hash = '') {
    const out = [];
    for (const button of findByWords(doc, /^exchange$/i)) {
        let key = null;
        let root = null;
        let node = button.parentElement;
        for (let up = 0; node && up < 8 && !key; up += 1, node = node.parentElement) {
            const text = String(node.textContent || '');
            // The whole page names every set: no telling from there.
            if (text.length > 6000) break;
            const hits = sets.filter((s) => new RegExp(s.museum.replace(/\s+set$/i, ''), 'i').test(text));
            if (hits.length === 1) {
                key = hits[0].key;
                root = node;
            } else if (hits.length > 1) break;
        }
        // Not told by the words: by the tab in the address (museum.php#plushie).
        if (!key) {
            const byHash = sets.find((s) => new RegExp('#/?' + s.hash + '\\b', 'i').test(hash || ''));
            if (byHash) key = byHash.key;
        }
        if (!key) continue;
        const near = boxesNear(button, 1);
        out.push({ set: key, button, box: near.boxes[near.boxes.length - 1] || null, root: root || near.root || button.parentElement });
    }
    return out;
}

/**
 * A set's pieces as the page shows them: the element around each piece's picture.
 * @param pieces [{ id }]; @param root where to look (the set's own part of the page, else the page)
 * @returns [{ id, el }]
 */
export function pieceTiles(root, pieces) {
    const out = [];
    for (const p of pieces) {
        const img = [...root.querySelectorAll('img[src*="/images/items/' + p.id + '/"]')].find((i) => setsShown(i) && !setsOurs(i));
        if (!img) continue;
        out.push({ id: p.id, el: img.closest('li') || img.parentElement });
    }
    return out;
}

/** The points market's "Add listing": its button, the Points box and the Price each box. Null when not on the page. */
export function pointsListing(doc) {
    const button = findByWords(doc, /^add listing$/i)[0];
    if (!button) return null;
    const { root, boxes } = boxesNear(button, 2);
    if (boxes.length < 2) return null;
    const label = (i) => [i.name, i.id, i.placeholder, i.getAttribute('aria-label')].join(' ').toLowerCase();
    let price = boxes.find((i) => /price|cost/.test(label(i))) || null;
    let amount = boxes.find((i) => i !== price && /amount|point|quant/.test(label(i))) || null;
    // No name to go by: Torn's order on the page, Points and then Price each.
    if (!price || !amount) {
        amount = boxes[0];
        price = boxes[1];
    }
    return { button, amount, price, root };
}

/** A row's words, cell by cell with a space between (Torn's cells stand side by side with none), ours left out. */
function rowWords(el) {
    const parts = [];
    const walk = (node) => {
        for (const c of node.childNodes) {
            if (c.nodeType === 3) parts.push(c.nodeValue);
            else if (c.nodeType === 1 && !c.matches(OUR_WORDS)) walk(c);
        }
    };
    walk(el);
    return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * The points market's list as the page shows it: [{ el, points, each, total }], cheapest first. A row is told by its
 * own numbers (count x price = total), never by a class name of Torn's. Empty when no rows are found, or when they
 * are not in the order of their prices (then nothing can say where a listing would sit).
 */
export function pointsRows(doc) {
    const found = [];
    for (const el of doc.querySelectorAll('li, tr')) {
        if (setsOurs(el) || !setsShown(el)) continue;
        const text = rowWords(el);
        if (text.length > 400 || !text.includes('$')) continue;
        const row = parsePointsRow(text);
        if (row) found.push({ el, ...row });
    }
    // A row holding another row is the list around it: the innermost ones are the listings.
    const inner = found.filter((r) => !found.some((o) => o !== r && r.el.contains(o.el)));
    const by = new Map();
    for (const r of inner) by.set(r.el.parentElement, [...(by.get(r.el.parentElement) || []), r]);
    const rows = [...by.values()].sort((a, b) => b.length - a.length)[0] || [];
    return rows.every((r, i) => !i || r.each >= rows[i - 1].each) ? rows : [];
}

/**
 * A hairline on the top edge of one of Torn's rows: on the edge between two rows, with no words on it, so it
 * stands on nothing of Torn's. Absolutely placed: it takes no room and catches no click. `on` false takes it away.
 */
export function setRule(host, on, state = '') {
    if (!host || !host.children) return null;
    let rule = null;
    for (const c of host.children) {
        if (c.classList && c.classList.contains(SET_RULE_CLASS)) {
            rule = c;
            break;
        }
    }
    if (!on) {
        if (rule) {
            rule.remove();
            if (!host.querySelector(':scope > .tarc-float')) releaseMarks(host);
        }
        return null;
    }
    if (!rule) {
        // An <i>, not a <span> or a cell: Torn styles the spans of its rows, and the line must take none of that.
        rule = host.ownerDocument.createElement('i');
        rule.className = 'tarc-float ' + SET_RULE_CLASS;
        host.appendChild(rule);
        holdMarks(host);
    }
    if (rule.dataset.state !== state) rule.dataset.state = state;
    return rule;
}

/** Torn's own buttons, links and boxes you can see inside `root`: what a mark of ours never stands on. */
const TORN_CONTROLS = 'a, button, input, select, textarea, label, [role="button"], .btn, .torn-btn';
function tornControls(root) {
    return [...root.querySelectorAll(TORN_CONTROLS)].filter((el) => el.type !== 'hidden' && !setsOurs(el) && setsShown(el));
}

/** Two boxes on the page share some room (`gap`: how near counts as touching). */
export const boxesMeet = (a, b, gap = 3) => a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap;

/**
 * Put a mark of ours beside one of Torn's controls, in the empty room to its right; where that room is too small,
 * under it. By measure only: nothing of Torn's is sized or moved.
 *
 * It never stands on a button, a link or a box of Torn's (the owner, 2026-10-11, on the points market's "Are you
 * sure ...? Yes / No": "this also blocks my buttons"). Where neither place is free of them, and when the control
 * it belongs to is no longer shown, the mark is not shown at all: the box says the same words.
 * @param within Torn's element the mark stays inside; left out, the widest panel around the control
 * @returns whether the mark is shown
 */
export function markBeside(mark, anchor, within = null) {
    const host = mark && mark.parentElement;
    if (!host || !anchor || !anchor.getBoundingClientRect) return false;
    const hide = () => { if (mark.style.visibility !== 'hidden') mark.style.visibility = 'hidden'; return false; };
    if (!setsShown(anchor)) return hide();
    const h = host.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    // The room is the widest thing around the control that starts where its own row starts: Torn's panel.
    let room = h;
    let roomEl = host;
    if (within && within.getBoundingClientRect) { room = within.getBoundingClientRect(); roomEl = within; }
    for (let node = within ? null : host.parentElement, up = 0; node && up < 6 && node !== host.ownerDocument.body; node = node.parentElement, up += 1) {
        const r = node.getBoundingClientRect();
        if (Math.abs(r.left - h.left) > 24) break;
        if (r.width > room.width) { room = r; roomEl = node; }
    }
    const m = mark.getBoundingClientRect();
    const width = m.width;
    const half = (m.height || 22) / 2;
    const fits = a.right + 12 + width <= room.right - 6;
    // Beside the control (when it fits there), else under it; `top` is the mark's middle line.
    const spots = [];
    if (fits) spots.push({ left: a.right - h.left + 12, top: a.top - h.top + a.height / 2 });
    spots.push({ left: Math.max(0, Math.min(a.left - h.left, room.right - 6 - width - h.left)), top: a.bottom - h.top + (half > 11 ? half + 4 : 14) });
    const theirs = tornControls(roomEl).map((el) => el.getBoundingClientRect());
    const free = spots.find((s) => {
        const box = { left: h.left + s.left, right: h.left + s.left + width, top: h.top + s.top - half, bottom: h.top + s.top + half };
        return !theirs.some((r) => boxesMeet(box, r));
    });
    if (!free) return hide();
    const left = Math.round(free.left);
    const top = Math.round(free.top);
    if (mark.style.left !== left + 'px') mark.style.left = left + 'px';
    if (mark.style.top !== top + 'px') mark.style.top = top + 'px';
    if (mark.style.visibility) mark.style.removeProperty('visibility');
    return true;
}

/** The other side's item rows on the trade view: [{ el, name, qty }]. */
export function tradeTheirRows(doc) {
    const box = doc.querySelector('.trade-cont');
    if (!box) return [];
    const out = [];
    for (const li of box.querySelectorAll('.user.right ul.cont > li.color2 ul.desc > li')) {
        const n = li.querySelector('.name');
        const it = n ? parseTradeItemLine(setsWords(n)) : null;
        if (it && !/^no items in trade$/i.test(it.name)) out.push({ el: li, name: it.name, qty: it.qty });
    }
    return out;
}

/** A forum thread, as far as the page says: its id (from the address) and the headings that may be its title. */
export function forumThread(doc, href) {
    const m = String(href || '').match(/[#&?/]t=(\d+)/);
    const titles = [];
    for (const el of doc.querySelectorAll('h1, h2, h3, h4, .title-black, [class*="thread-name"], [class*="threadName"], [class*="thread-title"], [class*="threadTitle"], [class*="subject"]')) {
        if (setsOurs(el) || !setsShown(el)) continue;
        const text = setsWords(el);
        if (text.length >= 5 && text.length <= 200) titles.push({ el, text });
    }
    return { id: m ? m[1] : null, titles, docTitle: String(doc.title || '') };
}

/*
 * 1.3.7 - a trade's money and your vault, read on the real pages 2026-10-12 (the owner's Chrome, looked at only):
 *   a trade, your side:   .trade-cont .user.left ul.cont > li.color1 ul.desc > li   (.name.left "$7,021,632 in trade",
 *                         .del.right the bin; the + stands outside the li)
 *   Add Money:            .init-trade.add-money > .cont-gray > p "You have $<span.money-value>" + form > ul.inputs >
 *                         li > .title "Money:" + .input-money-group (inline-block; the li is far wider than it)
 *   your vault:           .vault-wrap > form.vault-cont.left (.wvalue: in the vault; .cont > .input-money-group +
 *                         WITHDRAW) and form.vault-cont.right.deposit-box (.dvalue: on you)
 */
const setsMoney = (el) => (el ? Number(setsWords(el).replace(/[^\d]/g, '')) || 0 : null);
const shownMoneyBox = (root) => (root ? [...root.querySelectorAll('input.input-money')].find((i) => i.type !== 'hidden' && setsShown(i) && !setsOurs(i)) || null : null);

/** Your own money row in a trade (Torn's "$... in trade" / "No money in trade" line), null when it is not there. */
export function tradeMyMoneyRow(doc) {
    const li = doc.querySelector('.trade-cont .user.left ul.cont > li.color1 ul.desc > li');
    return li && setsShown(li) ? li : null;
}

/** Torn's own button of a form as it stands on the page, whether it can be pressed or not. */
function tornButtonOf(form) {
    return form ? [...form.querySelectorAll('input[type="submit"], button[type="submit"]')].find((b) => !setsOurs(b) && setsShown(b)) || null : null;
}

/** Torn's own button of a form (WITHDRAW, DEPOSIT, Change): null when it is not there or cannot be pressed now. */
export function tornSubmit(form) {
    const btn = form ? [...form.querySelectorAll('input.torn-btn[type="submit"], button.torn-btn[type="submit"], input[type="submit"], button[type="submit"]')].find((b) => !setsOurs(b) && setsShown(b)) || null : null;
    if (!btn) return null;
    const wrap = btn.closest('.btn-wrap');
    const off = btn.disabled || btn.classList.contains('disabled') || (wrap && wrap.classList.contains('disabled'));
    return off ? null : btn;
}

/** Torn's Add Money step: { form, group, box, line, onHand } - its money box, the list it stands in, "You have $..." as said there. */
export function tradeMoneyForm(doc) {
    const form = doc.querySelector('.init-trade.add-money form');
    const box = shownMoneyBox(form);
    const group = box && box.closest('.input-money-group');
    if (!group) return null;
    return { form, group, box, line: group.closest('li') || group.parentElement, anchor: group, onHand: setsMoney(doc.querySelector('.init-trade.add-money .money-value')) };
}

/** Your vault's Withdraw form: { group, box, line, vault, onHand } - what is in the vault and on you, as the page says. */
export function vaultWithdraw(doc) {
    const form = doc.querySelector('.vault-wrap form.vault-cont.left');
    const box = shownMoneyBox(form);
    const group = box && box.closest('.input-money-group');
    if (!group) return null;
    return { form, group, box, line: group.closest('.cont') || group.parentElement, anchor: tornButtonOf(form) || group, vault: setsMoney(form.querySelector('.wvalue')), onHand: setsMoney(doc.querySelector('.vault-wrap .dvalue')) };
}

/** Your vault's Deposit form: { form, group, box, line, onHand }. */
export function vaultDepositForm(doc) {
    const form = doc.querySelector('.vault-wrap form.vault-cont.right');
    const box = shownMoneyBox(form);
    const group = box && box.closest('.input-money-group');
    if (!group) return null;
    return { form, group, box, line: group.closest('.cont') || group.parentElement, anchor: tornButtonOf(form) || group, onHand: setsMoney(form.querySelector('.dvalue')) };
}

/**
 * Small buttons of ours beside one of Torn's controls. They float: absolutely placed inside `host`, so they take
 * no room and nothing of Torn's moves (the owner, 2026-10-12, on the line 1.3.7 put under his vault's box: "i dont
 * like it takes up torn page space ... either bring to front, to the side, or just a small button"). Placed by
 * measure (markBeside): in the empty room right of `anchor`, else just under it, never on a control of Torn's and
 * never outside `within`; where neither place is free they are not shown, and the box says the same.
 * Made once, kept up when the buttons change, gone with `spec` null.
 * @param host    Torn's element they are placed in (it is given back as it was when they go)
 * @param spec    { buttons: [{ label, amount, state, title }], link: { label, href } | null } | null
 * @param onPress (button, element, event) => void
 * @param anchor  Torn's control they stand beside (host when left out)
 * @param within  Torn's element they stay inside (the widest panel around host when left out)
 */
export function setFills(host, spec, onPress, anchor = null, within = null) {
    if (!host || !host.children) return null;
    let row = null;
    for (const c of host.children) {
        if (c.classList && c.classList.contains(SET_FILLROW_CLASS)) {
            row = c;
            break;
        }
    }
    const empty = !spec || (!(spec.buttons || []).length && !spec.link);
    if (empty) {
        if (row) {
            row.remove();
            if (!host.querySelector(':scope > .tarc-float')) releaseMarks(host);
        }
        return null;
    }
    const doc = host.ownerDocument;
    if (!row) {
        row = doc.createElement('span');
        row.className = 'tarc-float ' + SET_FILLROW_CLASS;
        host.appendChild(row);
        holdMarks(host);
    }
    row.tarcPress = onPress || null;
    const sig = JSON.stringify(spec);
    if (row.dataset.sig !== sig) {
        row.dataset.sig = sig;
        row.textContent = '';
        for (const b of spec.buttons || []) {
            const el = doc.createElement('button');
            el.type = 'button';
            el.className = SET_FILL_CLASS;
            el.textContent = b.label;
            if (b.short) el.dataset.short = b.short;
            if (b.state) el.dataset.state = b.state;
            if (b.title) el.title = b.title;
            el.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (row.tarcPress) row.tarcPress(b, el, e);
            });
            row.appendChild(el);
        }
        if (spec.link) {
            const a = doc.createElement('a');
            a.className = SET_FILL_CLASS;
            a.href = spec.link.href;
            a.target = '_blank';
            a.rel = 'noopener';
            a.textContent = spec.link.label;
            row.appendChild(a);
        }
    }
    // One line, never wider than Torn's own panel: where the words do not fit (your vault's half is 392 wide on
    // the real page, and four sums with their words are more), the buttons keep the sum and the word is their
    // title; the box beside the page names each sum.
    const roomWidth = (within || host).getBoundingClientRect().width - 12;
    if (roomWidth > 0 && row.getBoundingClientRect().width > roomWidth) {
        for (const el of row.children) if (el.dataset.short) el.textContent = el.dataset.short;
    }
    markBeside(row, anchor || host, within);
    return row;
}
