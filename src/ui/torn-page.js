// Torn Archive on Torn's own pages: a small box beside the page, and marks on the things it is about.
//
// A Torn tab never asks Torn's API or TornW3B anything. It shows what the Archive's own tab worked out (shared
// through storage), reads the page in front of you, and tells the Archive's tab what it saw: a buy on a bazaar,
// a press of EXCHANGE, your thread's title.
//
// It never presses anything of Torn's. A Fill button of the box types a number into Torn's own box, only on
// your press and only on the page you are looking at; you press Buy, EXCHANGE, ADD LISTING, Change and Accept.
// The marks take no room and catch no click. Beside Torn Trading's own panel it is shown all the same.

import { gmGet, gmSet, gmOnChange, gmCopy, gmOpenTab } from '../platform/gm.js';
import { MARKS_CSS } from './marks-css.js';
import { BOX_CSS, BOX_MARKS_CSS, BOX_WIDTH, BOX_GAP } from './box-css.js';
import { hIcon } from './fmt.js';
import { boxWaiting, boxBazaar, boxTrade, boxMuseum, boxPoints, boxForum } from './box-pages.js';
import { scanDom } from '../sources/dom/scan.js';
import { setMark, clearSetMarks, museumExchanges, pieceTiles, pointsListing, tradeTheirRows, forumThread, boxTwins } from '../sources/dom/sets-pages.js';
import { writeInputs } from '../sources/dom/fill.js';
import { detectPage, PAGE_BAZAAR, PAGE_ITEM_MARKET, isTradePage, isMuseumPage, isPointsMarketPage, isForumPage, bazaarOwnerId, itemMarketUrl, tradeViewUrl, ARCHIVE_PAGE_URL } from '../sources/route.js';
import { bazaarUrl } from '../core/feed.js';
import { buildItemIndex } from '../core/items.js';
import { stockBuys } from '../core/accepted.js';
import { SETS, threadCheck, isBuyingTitle } from '../core/sets.js';
import { IM_PLACE } from '../core/shopping.js';
import { tradingOnPage, shouldMarkSeen, TRADING_SEEN_KEY, TRADING_LOOK_EVERY_MS } from '../core/turns.js';

/** What the Archive's own tab shares with Torn's tabs: { at, v } (core/view.js viewForTabs). */
export const SHARED_VIEW_KEY = 'view';
/** What Torn's tabs tell the Archive's tab: [{ id, t, kind, what }]. */
export const SHARED_NOTES_KEY = 'notes';
export const NOTES_KEEP_MS = 10 * 60 * 1000;
/** A view older than this says so instead of showing its numbers. */
export const VIEW_OLD_MS = 15 * 60 * 1000;
/** A press on a card's Buy counts for a card that then vanishes, for this long. */
const TP_PRESS_MS = 20 * 1000;
const TP_SCAN_MS = 250;
const TP_DONE_MS = 4000;

const tpDigits = (v) => Number(String(v == null ? '' : v).replace(/[^\d]/g, '')) || 0;

/** The page a Torn address is, for the box: '' when it is none of ours. */
export function tornPageKind(href) {
    if (isMuseumPage(href)) return 'museum';
    if (isPointsMarketPage(href)) return 'points';
    if (isTradePage(href)) return 'trade';
    if (isForumPage(href)) return 'forum';
    const page = detectPage(href);
    if (page === PAGE_BAZAAR) return bazaarOwnerId(href) ? 'bazaar' : '';
    if (page === PAGE_ITEM_MARKET) return 'itemmarket';
    return '';
}

/** A note for the Archive's tab, added to the shared queue. */
export function pushNote(tabId, kind, what, now = Date.now()) {
    const q = gmGet(SHARED_NOTES_KEY, []);
    const list = (Array.isArray(q) ? q : []).filter((n) => n && now - n.t < NOTES_KEEP_MS);
    list.push({ id: tabId + ':' + now.toString(36) + ':' + Math.random().toString(36).slice(2, 6), t: now, kind, what });
    gmSet(SHARED_NOTES_KEY, list.slice(-80));
}

/**
 * Put the Archive on one of Torn's pages.
 * @param doc    the document
 * @param tabId  this tab's id
 * @param scripted the test page only: presses made by a script count as yours. Never set by the script itself.
 * @returns { scan(), stop() }
 */
export function mountTornPage(doc, { tabId, version = '', scripted = false } = {}) {
    const win = doc.defaultView;
    // Only a press of your own counts: a click made by a script on the page is not one.
    const yours = (event) => scripted || event.isTrusted === true;
    const now = () => Date.now();
    const st = {
        shared: null, index: null, indexAt: 0, kind: '', href: '',
        cards: [], seen: {}, seenPlace: '', pressed: new Map(),
        exchanges: [], presses: [], pressAt: 0, listing: null, moneyBox: null,
        marked: false, html: '', done: '', doneAt: 0, threadSaid: '',
        open: gmGet('boxOpen', true) !== false, pinned: false, room: true, timer: 0,
    };

    // ---- our own elements ----------------------------------------------------------------------------------------

    const style = doc.createElement('style');
    style.id = 'tarc-marks';
    style.textContent = MARKS_CSS + BOX_MARKS_CSS;
    (doc.head || doc.documentElement).appendChild(style);

    const host = doc.createElement('div');
    host.id = 'tarc-host';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${BOX_CSS}</style>`
        + `<div class="ta" hidden><div class="ta-h"><span class="mark">${hIcon('brand')}</span><b>Torn Archive</b><span class="w"></span>`
        + `<button data-act="hub" title="Open Torn Archive">↗</button><button data-act="fold" title="Put the box away">–</button></div><div class="ta-b"></div></div>`
        + `<button class="pill" hidden data-act="unfold" title="Show Torn Archive's box"><span class="mark">${hIcon('brand')}</span><span class="pw"></span></button>`;
    doc.body.appendChild(host);
    const box = root.querySelector('.ta');
    const body = root.querySelector('.ta-b');
    const whereEl = root.querySelector('.w');
    const pill = root.querySelector('.pill');
    const pillWords = root.querySelector('.pw');

    /** Where the box goes: beside Torn's content when the window has the room, else it is a pill you open yourself. */
    function place() {
        const main = doc.querySelector('#mainContainer') || doc.querySelector('.content-wrapper') || doc.querySelector('[role="main"]');
        const right = main ? main.getBoundingClientRect().right : 0;
        const free = win.innerWidth - right;
        st.room = !main || free >= BOX_WIDTH + 2 * BOX_GAP;
        if (main && st.room) {
            box.style.setProperty('--left', Math.round(right + BOX_GAP) + 'px');
            box.style.setProperty('--right', 'auto');
        } else {
            box.style.setProperty('--left', 'auto');
            box.style.setProperty('--right', BOX_GAP + 'px');
        }
    }

    function show(content) {
        const html = content ? content.html : '';
        if (!html) {
            box.hidden = true;
            pill.hidden = true;
            st.html = '';
            return;
        }
        // With no room beside Torn's page the box stays away until you press its pill: it would cover the page.
        const open = st.open && (st.room || st.pinned);
        box.hidden = !open;
        pill.hidden = open;
        if (whereEl.textContent !== content.where) whereEl.textContent = content.where;
        if (pillWords.textContent !== content.where) pillWords.textContent = content.where || 'Torn Archive';
        if (st.html !== html) {
            st.html = html;
            const top = body.scrollTop;
            body.innerHTML = html;
            body.scrollTop = top;
        }
        const done = st.done && now() - st.doneAt < TP_DONE_MS ? st.done : '';
        for (const b of body.querySelectorAll('button[data-act]')) {
            const key = b.dataset.act + ':' + (b.dataset.v || '');
            if (key === done) b.dataset.done = '1'; else delete b.dataset.done;
        }
    }

    // ---- the shared view -----------------------------------------------------------------------------------------

    function loadShared() {
        const s = gmGet(SHARED_VIEW_KEY, null);
        st.shared = s && s.v && s.v.pieces && s.v.sets ? s : null;
        if (st.shared && st.indexAt !== st.shared.at) {
            st.index = buildItemIndex(Object.fromEntries(st.shared.v.pieces.map((p) => [String(p.id), { name: p.name }])));
            st.indexAt = st.shared.at;
        }
    }

    const note = (kind, what) => pushNote(tabId, kind, what, now());

    // ---- each page -----------------------------------------------------------------------------------------------

    function cardBox(el) {
        return el ? el.querySelector('input:not([type="hidden"]):not([type="checkbox"])') : null;
    }

    function onBazaar(v, kind) {
        const place = kind === 'itemmarket' ? IM_PLACE : 'b:' + bazaarOwnerId(st.href);
        const { listings } = scanDom(kind === 'itemmarket' ? PAGE_ITEM_MARKET : PAGE_BAZAAR, doc, { index: st.index });
        st.cards = listings;
        // What you took: a card's stock that dropped while you were here, or a card you pressed Buy on that is gone.
        if (st.seenPlace !== place) { st.seen = {}; st.seenPlace = place; st.pressed.clear(); }
        const t = now();
        for (const [k, at] of st.pressed) if (t - at > TP_PRESS_MS) st.pressed.delete(k);
        const r = stockBuys(st.seen, listings, new Set(st.pressed.keys()));
        st.seen = r.seen;
        for (const b of r.bought) {
            st.pressed.delete(String(b.itemId) + '|' + Number(b.price));
            note('buy', { t, id: String(b.itemId), qty: b.qty, price: b.price, whoId: kind === 'itemmarket' ? '' : bazaarOwnerId(st.href) });
        }
        const cards = listings.map((c) => {
            const input = cardBox(c.el);
            return { itemId: c.itemId, price: c.listingPrice, qty: c.qtyAssumed ? 0 : c.qty, typed: input ? tpDigits(input.value) : 0, hasBox: !!input };
        });
        const out = boxBazaar(v, cards, place);
        const marks = new Map((out ? out.marks : []).map((m) => [m.i, m]));
        listings.forEach((c, i) => {
            const m = marks.get(i);
            setMark(c.el, m ? m.text : '', m ? m.state : '');
        });
        return out;
    }

    function onTrade(v) {
        const id = (st.href.match(/[#&?]ID=(\d+)/i) || [])[1] || '';
        const step = /step=addmoney/i.test(st.href) ? 'addmoney' : 'view';
        const rows = tradeTheirRows(doc);
        const t = id ? v.trades.open.find((x) => String(x.id) === id) || null : null;
        const money = step === 'addmoney' ? [...doc.querySelectorAll('.input-money-group input.input-money, input.input-money')].find((i) => i.type !== 'hidden' && i.getClientRects().length && !i.closest('#tarc-host')) || null : null;
        st.moneyBox = money;
        if (!id) return null;
        const out = boxTrade(v, t, rows, step, !!money);
        const marks = new Map((out ? out.marks : []).map((m) => [m.i, m]));
        rows.forEach((row, i) => {
            const m = marks.get(i);
            setMark(row.el, m ? m.text : '', m ? m.state : '', 'right');
        });
        return out;
    }

    const pieceWords = (p) => (p.need > 0 ? `${p.held.toLocaleString('en-US')} · need ${p.need.toLocaleString('en-US')}` : p.ahead > 0 ? `${p.held.toLocaleString('en-US')} · ${p.ahead.toLocaleString('en-US')} ahead` : `${p.held.toLocaleString('en-US')} ✓`);

    function swapsSince(at) {
        const off = {};
        for (const p of st.presses) if (p.t > at) off[p.set] = (off[p.set] || 0) + p.sets;
        return off;
    }

    function onMuseum(v) {
        const found = museumExchanges(doc, SETS, win.location.hash);
        st.exchanges = found;
        const off = swapsSince(st.shared.at);
        for (const s of v.sets) {
            const ex = found.find((f) => f.set === s.key) || null;
            if (found.length && !ex) continue;
            const less = off[s.key] || 0;
            for (const tile of pieceTiles(ex && ex.root ? ex.root : doc, s.pieces)) {
                const p = s.pieces.find((x) => String(x.id) === String(tile.id));
                if (!p) continue;
                // Sets swapped since the view was worked out come off what you hold; the target stays.
                const target = p.held + p.need - p.ahead;
                const held = Math.max(0, p.held - less);
                const live = { held, need: Math.max(0, target - held), ahead: Math.max(0, held - target) };
                setMark(tile.el, pieceWords(live), p.top ? 'top' : live.need > 0 ? '' : live.ahead > 0 ? 'ahead' : 'ok');
            }
        }
        return boxMuseum(v, found.map((f) => ({ set: f.set, hasBox: !!f.box })), off);
    }

    function onPoints(v) {
        st.listing = pointsListing(doc);
        return boxPoints(v, !!st.listing);
    }

    function onForum(v) {
        const th = forumThread(doc, st.href);
        const pr = v.prices;
        const mine = pr.thread && pr.thread.id != null ? String(pr.thread.id) : '';
        const exact = th.titles.find((t) => t.text === pr.forum.title) || null;
        if (!exact && !(th.id && mine === th.id)) return null;
        const title = exact || th.titles.find((t) => isBuyingTitle(t.text)) || null;
        if (!title) return null;
        // The thread's title as the page shows it: told once per title, so the hub's check is of now.
        const said = (th.id || '') + '|' + title.text;
        if (st.threadSaid !== said) {
            st.threadSaid = said;
            note('thread', { id: th.id, title: title.text });
        }
        const out = boxForum(v, title.text, threadCheck(title.text, { open: pr.open, pct: pr.pct }));
        setMark(title.el, out.titleMark.text, out.titleMark.state, 'right');
        return out;
    }

    // ---- one look at the page ------------------------------------------------------------------------------------

    function clear() {
        if (st.marked) {
            clearSetMarks(doc);
            st.marked = false;
        }
        st.cards = [];
        st.exchanges = [];
        st.listing = null;
        st.moneyBox = null;
    }

    function scan() {
        st.timer = 0;
        const t = now();
        st.href = win.location.href;
        const kind = tornPageKind(st.href);

        if (kind !== st.kind) {
            clear();
            st.kind = kind;
            st.seen = {};
            st.seenPlace = '';
        }
        if (!kind) {
            show(null);
            return;
        }
        if (!st.shared) loadShared();
        const fresh = st.shared && t - st.shared.at < VIEW_OLD_MS;
        if (!fresh) {
            clear();
            show(kind === 'museum' || kind === 'points' || (kind === 'trade' && /ID=\d+/i.test(st.href)) ? { ...boxWaiting(!!st.shared), where: '' } : null);
            return;
        }
        const v = st.shared.v;
        let out = null;
        try {
            if (kind === 'bazaar' || kind === 'itemmarket') out = onBazaar(v, kind);
            else if (kind === 'trade') out = onTrade(v);
            else if (kind === 'museum') out = onMuseum(v);
            else if (kind === 'points') out = onPoints(v);
            else if (kind === 'forum') out = onForum(v);
            st.marked = true;
        } catch (error) {
            win.console.error('[Torn Archive] page', kind, error);
            out = null;
        }
        show(out);
    }

    function later(ms = TP_SCAN_MS) {
        if (st.timer) return;
        st.timer = win.setTimeout(scan, ms);
    }

    // ---- presses in the box --------------------------------------------------------------------------------------

    function done(key) {
        st.done = key;
        st.doneAt = now();
        show({ html: st.html, where: whereEl.textContent });
        win.setTimeout(() => show(st.html ? { html: st.html, where: whereEl.textContent } : null), TP_DONE_MS + 50);
    }

    function goNext(v) {
        const stops = v.buy.run.stops;
        const place = st.kind === 'itemmarket' ? IM_PLACE : 'b:' + bazaarOwnerId(st.href);
        const at = stops.findIndex((s) => s.place === place);
        const next = at >= 0 ? stops[at + 1] || null : null;
        note('act', { name: 'run', args: ['next'] });
        if (!next) return;
        const first = next.lines[0];
        win.location.assign(next.im ? itemMarketUrl(first.id, first.name) : bazaarUrl(next.whoId, first.id, first.price));
    }

    function press(btn) {
        const act = btn.dataset.act;
        const val = btn.dataset.v || '';
        const n = tpDigits(btn.dataset.n);
        const v = st.shared ? st.shared.v : null;
        if (act === 'fold') { st.open = false; st.pinned = false; gmSet('boxOpen', false); later(0); return; }
        if (act === 'unfold') { st.open = true; st.pinned = true; gmSet('boxOpen', true); later(0); return; }
        if (act === 'hub') { gmOpenTab(ARCHIVE_PAGE_URL); return; }
        if (act === 'copy') { if (gmCopy(val)) done('copy:' + val); return; }
        if (act === 'open-trade') { win.location.assign(tradeViewUrl(val)); return; }
        if (!v) return;
        if (act === 'run-start') { note('act', { name: 'run', args: ['start'] }); done('run-start:'); return; }
        if (act === 'run-stop') { note('act', { name: 'run', args: ['stop'] }); return; }
        if (act === 'run-next') { goNext(v); return; }
        // Fill: a number typed into Torn's own box, on this press. Nothing of Torn's is pressed.
        if (act === 'fill-card') {
            const card = st.cards[Number(val)];
            const input = card && card.el && card.el.isConnected ? cardBox(card.el) : null;
            if (input && n > 0) { writeInputs([input], String(n)); done('fill-card:' + val); later(0); }
        } else if (act === 'fill-money') {
            if (st.moneyBox && st.moneyBox.isConnected && tpDigits(val) > 0) { writeInputs(boxTwins(st.moneyBox), String(tpDigits(val))); done('fill-money:' + val); }
        } else if (act === 'fill-museum') {
            const ex = st.exchanges.find((x) => x.set === val && x.box && x.box.isConnected);
            if (ex && n > 0) { writeInputs([ex.box], String(n)); done('fill-museum:' + val); }
        } else if (act === 'fill-points') {
            const l = st.listing;
            if (l && l.amount.isConnected && l.price.isConnected && tpDigits(val) > 0 && n > 0) {
                writeInputs(boxTwins(l.amount), String(tpDigits(val)));
                writeInputs(boxTwins(l.price), String(n));
                done('fill-points:' + val);
            }
        }
    }

    root.addEventListener('click', (event) => {
        const btn = event.target.closest && event.target.closest('[data-act]');
        if (btn && yours(event)) press(btn);
    });

    // ---- what you do on Torn's page, watched and never done for you ----------------------------------------------

    function onClick(event) {
        if (!yours(event) || !st.shared) return;
        const target = event.target;
        if (!target || !target.closest || target.closest('#tarc-host')) return;
        // A press on a card's own button: the card may vanish because you bought it out.
        if (st.kind === 'bazaar' || st.kind === 'itemmarket') {
            const card = st.cards.find((c) => c.el && c.el.contains(target));
            if (card && target.closest('button, [role="button"], input[type="submit"]')) st.pressed.set(String(card.itemId) + '|' + Number(card.listingPrice), now());
            later(600);
            return;
        }
        // A press of Torn's EXCHANGE, by you: told to the hub, which writes the points into your book at cost.
        if (st.kind === 'museum') {
            const ex = st.exchanges.find((x) => x.button && x.button.isConnected && (x.button === target || x.button.contains(target)));
            if (!ex) return;
            const t = now();
            const set = st.shared.v.sets.find((s) => s.key === ex.set);
            if (!set) return;
            const full = Math.max(0, set.full - (swapsSince(st.shared.at)[set.key] || 0));
            const typed = ex.box ? tpDigits(ex.box.value) : 1;
            // Nothing typed, or more than you hold: Torn refuses it, and nothing is written. One press, written once.
            if (!(typed >= 1) || typed > full || t - st.pressAt < 3000) return;
            st.pressAt = t;
            st.presses = [...st.presses.filter((p) => t - p.t < 6 * 3600 * 1000), { t, set: set.key, sets: typed }];
            note('swap', { t, set: set.key, sets: typed });
            later(0);
        }
    }

    function onKey(event) {
        if (!yours(event) || (event.key !== 'n' && event.key !== 'N')) return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const el = event.target;
        if (el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName || ''))) return;
        if (!st.shared || (st.kind !== 'bazaar' && st.kind !== 'itemmarket')) return;
        const v = st.shared.v;
        const place = st.kind === 'itemmarket' ? IM_PLACE : 'b:' + bazaarOwnerId(st.href);
        const here = v.buy.run.stops.find((s) => s.place === place);
        if (here && here.state === 'cur') goNext(v);
    }

    doc.addEventListener('click', onClick, true);
    doc.addEventListener('keydown', onKey, true);
    // A number typed into a card's box: its mark says at once when it is more than you need.
    const onInput = () => { if (st.kind === 'bazaar' || st.kind === 'itemmarket') later(120); };
    doc.addEventListener('input', onInput, true);

    // ---- when to look again ---------------------------------------------------------------------------------------

    const mo = new win.MutationObserver((list) => {
        // Our own marks changing is not the page changing.
        for (const m of list) {
            const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
            if (el && el.closest && el.closest('#tarc-host, .tarc-setmark')) continue;
            const nodes = m.type === 'childList' ? [...m.addedNodes, ...m.removedNodes] : [];
            if (nodes.length && nodes.every((x) => x.nodeType === 1 && x.classList && x.classList.contains('tarc-setmark'))) continue;
            later();
            return;
        }
    });
    mo.observe(doc.body, { childList: true, characterData: true, subtree: true });
    const onHash = () => later(0);
    const onResize = () => { place(); later(0); };
    win.addEventListener('hashchange', onHash);
    win.addEventListener('popstate', onHash);
    win.addEventListener('resize', onResize);
    const reload = () => { loadShared(); later(0); };
    gmOnChange(SHARED_VIEW_KEY, reload);

    // Torn Trading on this page: said to every tab, so the Archive's own tab shares the limits with it.
    function look() {
        const t = now();
        const had = st.shared ? st.shared.at : 0;
        if (tradingOnPage(doc) && shouldMarkSeen(gmGet(TRADING_SEEN_KEY, 0), t)) gmSet(TRADING_SEEN_KEY, t);
        // The view is re-read here too where the host cannot tell us it changed.
        loadShared();
        // Looked at again only when something of ours changed: the page's own changes are seen as they happen.
        if (had !== (st.shared ? st.shared.at : 0) || win.location.href !== st.href) later(0);
    }
    const lookTimer = win.setInterval(look, TRADING_LOOK_EVERY_MS);

    place();
    loadShared();
    look();
    later(0);

    return {
        scan,
        stop() {
            win.clearInterval(lookTimer);
            if (st.timer) win.clearTimeout(st.timer);
            mo.disconnect();
            doc.removeEventListener('click', onClick, true);
            doc.removeEventListener('keydown', onKey, true);
            doc.removeEventListener('input', onInput, true);
            win.removeEventListener('hashchange', onHash);
            win.removeEventListener('popstate', onHash);
            win.removeEventListener('resize', onResize);
            clearSetMarks(doc);
            host.remove();
            style.remove();
        },
        version,
    };
}
