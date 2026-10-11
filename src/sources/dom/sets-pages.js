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

const OURS = '#tarc-host, .' + SET_MARK_CLASS + ', .' + SET_FILL_CLASS + ', .' + SET_RULE_CLASS;
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
    for (const m of doc.querySelectorAll('.' + SET_MARK_CLASS + ', .' + SET_FILL_CLASS + ', .' + SET_RULE_CLASS)) {
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

/** A box and its hidden twin (Torn's money boxes keep the plain number in one), for writeInputs. */
export function boxTwins(box) {
    const group = box && box.closest && box.closest('.input-money-group');
    return group ? [...group.querySelectorAll('input')] : box ? [box] : [];
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
 * @returns whether the mark is shown
 */
export function markBeside(mark, anchor) {
    const host = mark && mark.parentElement;
    if (!host || !anchor || !anchor.getBoundingClientRect) return false;
    const hide = () => { if (mark.style.visibility !== 'hidden') mark.style.visibility = 'hidden'; return false; };
    if (!setsShown(anchor)) return hide();
    const h = host.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    // The room is the widest thing around the control that starts where its own row starts: Torn's panel.
    let room = h;
    let roomEl = host;
    for (let node = host.parentElement, up = 0; node && up < 6 && node !== host.ownerDocument.body; node = node.parentElement, up += 1) {
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
    spots.push({ left: Math.max(0, Math.min(a.left - h.left, room.right - 6 - width - h.left)), top: a.bottom - h.top + 14 });
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
