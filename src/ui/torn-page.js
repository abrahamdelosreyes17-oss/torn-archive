// Torn Archive on Torn's own pages: an overlay beside the page, and marks on the things it is about.
//
// The overlay is on every page of Torn's: folded it is one bar (what there is to know, Open, + / –), and it
// unfolds by itself where it has something to say. It stands only in the empty window beside Torn's content, on
// the right or on the left: you drag it by its bar, and it stays where you left it. The backtick key folds and
// unfolds it. Torn Trading's panel on the same page comes first: it keeps its place and that key, and the Archive
// goes over it or under it in its column, never beside it and never on top of it.
//
// A Torn tab never asks Torn's API or TornW3B anything. It shows what the Archive's own tab worked out (shared
// through storage), reads the page in front of you, and tells the Archive's tab what it saw: a buy on a bazaar,
// a press of EXCHANGE, your thread's title.
//
// It never presses anything of Torn's. A Fill button of the box types a number into Torn's own box, only on
// your press and only on the page you are looking at; you press Buy, EXCHANGE, ADD LISTING, Change and Accept.
// The marks take no room and catch no click. Beside Torn Trading's own panel it is shown all the same.
//
// On a bazaar the box is a checklist: what to buy here, what you hold of each piece, and a tick the moment you
// buy. The listings to buy are ringed as Torn Trading rings one. "Fill all" is one press of yours: from then on,
// on that page, each listing's number is typed into its own quantity box - the ones that are open now, and each
// other one as you open it or scroll to it (Torn draws only the listings near the screen, and the script never
// scrolls for you). You press Buy on each. Typing sends nothing to Torn.

import { gmGet, gmSet, gmOnChange, gmCopy, gmOpenTab } from '../platform/gm.js';
import { MARKS_CSS } from './marks-css.js';
import { BOX_CSS, BOX_MARKS_CSS, BOX_GAP } from './box-css.js';
import { hIcon, hMoney, hNum } from './fmt.js';
import { boxClosed, boxAny, boxBazaar, boxStock, boxTrade, boxMuseum, boxPoints, boxForum, boxLate } from './box-pages.js';
import { overlayStrips, overlaySide, overlayPlace, OV_WIDTH, OV_BAR, OV_GAP, OV_TOP } from '../core/overlay.js';
import { scanDom } from '../sources/dom/scan.js';
import { setMark, setRule, markBeside, clearSetMarks, museumExchanges, pieceTiles, pointsListing, pointsRows, tradeTheirRows, forumThread, boxTwins } from '../sources/dom/sets-pages.js';
import { writeInputs } from '../sources/dom/fill.js';
import { listingTile, buyBox, openBuyMenus, tileHolds } from '../sources/dom/buy-box.js';
import { detectPage, PAGE_BAZAAR, PAGE_ITEM_MARKET, isTradePage, isMuseumPage, isPointsMarketPage, isForumPage, bazaarOwnerId, itemMarketUrl, tradeViewUrl, ARCHIVE_PAGE_URL } from '../sources/route.js';
import { bazaarUrl } from '../core/feed.js';
import { buildItemIndex, findItemByName } from '../core/items.js';
import { stockBuys } from '../core/accepted.js';
import { SETS, threadCheck, isBuyingTitle } from '../core/sets.js';
import { IM_PLACE } from '../core/shopping.js';
import { tradingOnPage, shouldMarkSeen, TRADING_SEEN_KEY, TRADING_LOOK_EVERY_MS, TRADING_HOST_IDS } from '../core/turns.js';

/** What the Archive's own tab shares with Torn's tabs: { at, v } (core/view.js viewForTabs). */
export const SHARED_VIEW_KEY = 'view';
/** What Torn's tabs tell the Archive's tab: [{ id, t, kind, what }]. */
export const SHARED_NOTES_KEY = 'notes';
export const NOTES_KEEP_MS = 10 * 60 * 1000;
/** A view older than this says so instead of showing its numbers. */
export const VIEW_OLD_MS = 15 * 60 * 1000;
/**
 * A press in a listing's tile counts for a listing that then vanishes, for this long (as Torn Trading's
 * STOCK_PRESS_MS: typing a number, Buy, then Torn's own "are you sure" take longer than a few seconds).
 */
const TP_PRESS_MS = 90 * 1000;
/** A buy seen here is shown on this page at once, until the hub's view holds it - or this long, if it never does. */
const TP_PEND_MS = 3 * 60 * 1000;
/**
 * The buys seen in a tab that still wait for the hub: [{ nid, id, qty, t }]. One leaves when the hub's view names
 * its note (`taken`), or when a view worked out more than TP_PEND_MS after it still does not.
 * @param viewAt when the hub worked out the view this tab holds
 */
/** A bazaar's page is told to the hub again after this long, though nothing on it changed: its rows stay checked. */
export const TP_SHOP_EVERY_MS = 60 * 1000;
const TP_PIECES = new Set(SETS.flatMap((s) => s.pieces.map((p) => String(p.id))));

/**
 * The set pieces a bazaar's page shows with a price and a stock: [{ id, price, qty }], a piece listed twice at its
 * cheaper price. A card whose stock is not stated (its Buy box is open and says none) is left out: it says nothing.
 */
export function shopSeen(listings) {
    const by = new Map();
    for (const c of listings || []) {
        const id = String(c && c.itemId);
        const price = Math.floor(Number(c && c.listingPrice)) || 0;
        const qty = c && !c.qtyAssumed ? Math.floor(Number(c.qty)) || 0 : 0;
        if (!TP_PIECES.has(id) || !(price > 1) || !(qty > 0)) continue;
        if (!by.has(id) || price < by.get(id).price) by.set(id, { id, price, qty });
    }
    return [...by.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}

export function pendLeft(pend, taken, viewAt) {
    return (pend || []).filter((p) => !taken.has(p.nid) && !(viewAt - p.t > TP_PEND_MS));
}
/** After a press on Torn's page it is looked at again this soon, and once more: Torn redraws in steps. */
const TP_AFTER_PRESS_MS = [150, 700];
const TP_SCAN_MS = 250;
const TP_DONE_MS = 4000;
/** Torn Trading's panel is looked at this often while it is on the page: it can be moved, folded, or come later. */
const TP_OTHER_MS = 1000;
/** The most of the window's height the overlay takes, as Torn Trading's panel. */
const TP_TALL = 0.75;
const TP_TALL_MAX = 640;
/* Your stock, on its own: its width, and the least height worth showing it in. */
const TS_WIDTH = 300;
const TS_MIN_H = 160;
/** Where you left the overlay: { side, left, top }. Folded or not: 'boxOpen' where it has something to say, 'boxOpenAny' elsewhere. */
const TP_POS_KEY = 'boxPos';

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

/** A note for the Archive's tab, added to the shared queue. @returns its id: the shared view names the notes it holds. */
export function pushNote(tabId, kind, what, now = Date.now()) {
    const q = gmGet(SHARED_NOTES_KEY, []);
    const list = (Array.isArray(q) ? q : []).filter((n) => n && now - n.t < NOTES_KEEP_MS);
    const id = tabId + ':' + now.toString(36) + ':' + Math.random().toString(36).slice(2, 6);
    list.push({ id, t: now, kind, what });
    gmSet(SHARED_NOTES_KEY, list.slice(-80));
    return id;
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
        cards: [], tiles: [], seen: {}, seenPlace: '', pressed: new Map(), images: 0,
        // What this tab saw you buy here: `pend` until the hub's view holds it, `took` for as long as you stay.
        pend: [], took: {}, fillAll: null, fill: [], said: new Set(),
        exchanges: [], presses: [], pressAt: 0, listing: null, imNext: null, moneyBox: null, tradeRows: null, tradeAsked: 0, shopSig: '', shopAt: 0,
        marked: false, html: '', done: '', doneAt: 0, threadSaid: '',
        // Torn's elements holding a note of ours beside a control: the ones of the last look, and of this one.
        notes: new Set(), notesNow: new Set(),
        // Your stock on its own: what this tab adds to the view (buys seen, numbers typed), and its fold.
        live: null, stockOut: null, stockHtml: '', stockOpen: gmGet('stockOpen', true) !== false,
        // The listing a link of ours named: brought into view once, pulsing until you press anything.
        arrived: '', pulseOff: '',
        open: gmGet('boxOpen', true) !== false, openAny: gmGet('boxOpenAny', false) === true, pinned: false, room: true, timer: 0,
        content: null, has: false, pos: gmGet(TP_POS_KEY, null), strips: { left: null, right: null }, mid: 0, at: null, other: '', drawn: '',
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
        + `<div class="ta" hidden><div class="ta-h" title="Torn Archive: drag to move"><span class="mark">${hIcon('brand')}</span><b>Torn Archive</b><span class="w"></span>`
        + `<button class="open" data-act="hub" title="Open Torn Archive in a new tab">Open</button><button data-act="fold">–</button></div><div class="ta-b"></div></div>`
        + `<div class="ta ts" hidden><div class="ta-h" title="Your stock, as you buy"><span class="mark">${hIcon('brand')}</span><b>Your stock</b><span class="w"></span><button data-act="stock-fold">–</button></div><div class="ta-b"></div></div>`
        + `<button class="pill" hidden data-act="unfold" title="Show Torn Archive"><span class="mark">${hIcon('brand')}</span><span class="pw"></span></button>`;
    doc.body.appendChild(host);
    const box = root.querySelector('.ta');
    const body = root.querySelector('.ta-b');
    const head = root.querySelector('.ta-h');
    const whereEl = root.querySelector('.w');
    const openBtn = root.querySelector('.open');
    const foldBtn = root.querySelector('[data-act="fold"]');
    const pill = root.querySelector('.pill');
    const pillWords = root.querySelector('.pw');
    const stockBox = root.querySelector('.ts');
    const stockBody = stockBox.querySelector('.ta-b');
    const stockWords = stockBox.querySelector('.w');
    const stockFold = stockBox.querySelector('[data-act="stock-fold"]');

    // ---- where it stands ------------------------------------------------------------------------------------------

    /** Torn's content on this page, left edge to right edge: the selectors Torn Trading's panel fits itself by. */
    function tornSides() {
        let parts = [doc.querySelector('.content-wrapper'), doc.getElementById('sidebarroot'), doc.getElementById('sidebar')].filter(Boolean);
        if (!parts.length) parts = [doc.querySelector('#mainContainer') || doc.querySelector('[role="main"]')].filter(Boolean);
        const rects = parts.map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
        return rects.length ? { left: Math.min(...rects.map((r) => r.left)), right: Math.max(...rects.map((r) => r.right)) } : { left: null, right: null };
    }

    /** Torn Trading's panel on this page, where it shows one. Looked at, never touched: it keeps its place. */
    function tradingRect() {
        const other = doc.getElementById(TRADING_HOST_IDS[0]);
        const panel = other && other.shadowRoot ? other.shadowRoot.querySelector('.ttv2-panel') : null;
        const r = panel ? panel.getBoundingClientRect() : null;
        return r && r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width } : null;
    }

    const isOpen = () => (st.has ? st.open : st.openAny);

    /** Beside Torn's content, on the side you left it; with no room on either side it is a pill you open yourself. */
    function place() {
        const sides = tornSides();
        const other = tradingRect();
        st.strips = overlayStrips({ winW: win.innerWidth, left: sides.left, right: sides.right });
        st.mid = sides.left == null ? win.innerWidth / 2 : (sides.left + sides.right) / 2;
        st.other = other ? [other.left, other.top, other.right, other.bottom].map(Math.round).join() : '';
        const cap = Math.max(OV_BAR, Math.min(win.innerHeight * TP_TALL, TP_TALL_MAX));
        // Measured whole: a `bar` left from the last place hides the body and would measure it as nothing, and
        // the bar itself can be two lines on a narrow strip.
        const open = isOpen() && !box.hidden;
        box.classList.remove('bar', 'folded');
        const barH = Math.max(OV_BAR, head.offsetHeight + 2);
        const want = open ? head.offsetHeight + body.scrollHeight + 2 : barH;
        box.classList.toggle('folded', !isOpen());
        st.at = overlayPlace({ pos: st.pos, strips: st.strips, winH: win.innerHeight, want, cap, other });
        st.room = !!st.at;
        // No room: opened from its pill it stands at the window's edge, over Torn's page, until you fold it.
        const width = Math.min(OV_WIDTH, win.innerWidth - 2 * BOX_GAP);
        const at = st.at || { left: win.innerWidth - width - BOX_GAP, top: OV_TOP, width, maxHeight: Math.max(OV_BAR, win.innerHeight - OV_TOP - BOX_GAP), bar: false };
        box.style.setProperty('--left', at.left + 'px');
        box.style.setProperty('--top', at.top + 'px');
        box.style.setProperty('--width', at.width + 'px');
        box.style.setProperty('--max-h', Math.max(at.maxHeight, barH) + 'px');
        box.classList.toggle('bar', !!at.bar);
    }

    /**
     * Draw the overlay. What this page has to say (a bazaar, a trade, the museum...) is its content; null on a page
     * that is none of ours: there it is the bar, with your sets under it when you unfold it.
     */
    function show(content) {
        st.content = content && content.html ? content : null;
        st.has = !!st.content;
        const fresh = st.shared && now() - st.shared.at < VIEW_OLD_MS;
        const said = st.content || (fresh ? boxAny(st.shared.v) : boxClosed(String(gmGet('key.limited', '') || '').trim() !== '', !!st.shared));
        const open = isOpen();
        const other = tradingOnPage(doc);
        // With no room beside Torn's page it stays a pill until you press it: it would cover the page.
        const away = !st.room && !st.pinned;
        // Unfolded, the bar names the place only: the count is in the body under it, and is not said twice.
        const words = (open ? said.where : said.head || said.where) || '';
        box.hidden = away;
        pill.hidden = !away;
        box.classList.toggle('folded', !open);
        openBtn.classList.toggle('go', !!said.go);
        if (whereEl.textContent !== words) whereEl.textContent = words;
        // The pill is the overlay at its smallest: it says what the folded bar would.
        const small = said.head || said.where || 'Torn Archive';
        if (pillWords.textContent !== small) pillWords.textContent = small;
        // Numbers from the hub are on show (this page's, or your sets): if it has gone quiet, that is said first.
        const html = (st.content || fresh ? boxLate(st.shared.at, now()) : '') + said.html;
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
        // Measured again only when what is drawn changed: its place depends on its height.
        const drawn = [away, open, st.has, words].join('|') + html;
        if (st.drawn !== drawn) {
            st.drawn = drawn;
            const was = st.room;
            place();
            if (was !== st.room) { st.drawn = ''; show(content); return; }
        }
        // The + / – after the place is known: unfolded with room for the bar only, it says why.
        const stuck = open && !!st.at && st.at.bar;
        foldBtn.textContent = open && !stuck ? '–' : '+';
        foldBtn.title = stuck ? (st.at.by === 'over' ? 'No room to unfold here: fold the panel under it first' : st.at.by === 'under' ? 'No room to unfold here: fold the panel over it first' : 'No room to unfold here: drag it up') : (open ? 'Fold' : 'Unfold') + (other ? '' : ' (backtick key)');
    }

    /**
     * Your stock on its own, while you buy: on the side of Torn's page the box is not on, and only where that side
     * has room - it never stands over Torn's page. With no room the box's own checklist says what you hold.
     */
    function showStock(out) {
        st.stockOut = out;
        const side = st.at && st.at.side === 'left' ? 'right' : 'left';
        const strip = out && st.at && !box.hidden ? st.strips[side] : null;
        const width = strip ? Math.min(TS_WIDTH, strip.width) : 0;
        const left = strip ? (side === 'left' ? strip.to - width : strip.from) : 0;
        let room = win.innerHeight - OV_TOP - BOX_GAP;
        const other = strip ? tradingRect() : null;
        if (other && other.left < left + width && other.right > left) room = other.top - OV_TOP - OV_GAP;
        if (!strip || room < TS_MIN_H) { stockBox.hidden = true; return; }
        stockBox.hidden = false;
        stockBox.classList.toggle('folded', !st.stockOpen);
        stockBox.classList.toggle('alarm', out.over.length > 0);
        if (stockWords.textContent !== out.head) stockWords.textContent = out.head;
        if (st.stockHtml !== out.html) {
            st.stockHtml = out.html;
            const top = stockBody.scrollTop;
            stockBody.innerHTML = out.html;
            stockBody.scrollTop = top;
        }
        stockFold.textContent = st.stockOpen ? '–' : '+';
        stockBox.style.setProperty('--left', left + 'px');
        stockBox.style.setProperty('--top', OV_TOP + 'px');
        stockBox.style.setProperty('--width', width + 'px');
        stockBox.style.setProperty('--max-h', room + 'px');
    }

    /** Fold or unfold, remembered: apart for the pages where it has something to say and for the rest. */
    function setOpen(on) {
        if (st.has) { st.open = on; gmSet('boxOpen', on); } else { st.openAny = on; gmSet('boxOpenAny', on); }
        if (!on) st.pinned = false;
        show(st.content);
    }

    /** Drag by the bar, to the right or to the left of Torn's content. A press that does not move unfolds a folded bar. */
    function enableDrag() {
        let start = null;
        head.addEventListener('pointerdown', (event) => {
            if (event.button !== 0 || !st.at) return;
            if (event.target.closest && event.target.closest('button, a, input')) return;
            const r = box.getBoundingClientRect();
            start = { x: event.clientX, y: event.clientY, left: r.left, top: r.top, moved: false };
            try { if (head.setPointerCapture) head.setPointerCapture(event.pointerId); } catch { /* a pointer the browser does not track: the drag still follows its moves */ }
        });
        head.addEventListener('pointermove', (event) => {
            if (!start) return;
            const dx = event.clientX - start.x;
            const dy = event.clientY - start.y;
            if (!start.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
            start.moved = true;
            box.classList.add('drag');
            const left = start.left + dx;
            const side = overlaySide(left + box.offsetWidth / 2, st.strips, st.mid);
            if (!side) return;
            st.pos = { side, left: Math.round(left), top: Math.round(start.top + dy) };
            place();
        });
        const end = (event) => {
            if (!start) return;
            const { moved } = start;
            start = null;
            box.classList.remove('drag');
            if (head.hasPointerCapture && head.hasPointerCapture(event.pointerId)) head.releasePointerCapture(event.pointerId);
            if (moved && st.at && st.pos) {
                // Where you let go, kept inside the window: the bar's own place, also when it stands unfolded upward.
                st.pos = { side: st.at.side, left: st.at.left, top: Math.min(Math.max(0, st.pos.top), Math.max(0, win.innerHeight - OV_BAR - OV_GAP)) };
                gmSet(TP_POS_KEY, st.pos);
                place();
            } else if (!moved && !isOpen()) {
                setOpen(true);
            }
        };
        head.addEventListener('pointerup', end);
        head.addEventListener('pointercancel', end);
    }
    enableDrag();

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
    /** One line for the hub's log (it is in the zip), said once per page of this tab: what the page was seen to hold. */
    const say = (once, what, detail = '') => {
        if (once) { if (st.said.has(once)) return; st.said.add(once); }
        note('say', { what, detail });
    };

    // ---- each page -----------------------------------------------------------------------------------------------

    const cardKey = (c) => String(c.itemId) + '|' + Number(c.listingPrice);

    /** The ring Torn Trading puts on a listing to buy, on ours: '' takes it off. */
    function setRing(el, ring) {
        if (!el || !el.classList) return;
        if (!ring) {
            if (el.classList.contains('tarc-buyhere')) { el.classList.remove('tarc-buyhere'); el.removeAttribute('data-tarc-ring'); }
            return;
        }
        if (!el.classList.contains('tarc-buyhere')) el.classList.add('tarc-buyhere');
        if (el.getAttribute('data-tarc-ring') !== ring) el.setAttribute('data-tarc-ring', ring);
    }

    /**
     * A listing that is gone was bought by you only when you pressed in its tile a moment ago AND it would still be
     * on the screen where it stood: Torn takes the listings you scroll away from out of the page itself, and a
     * filter or a sort takes many out at once.
     */
    function pressedGone(t, images) {
        const keys = new Map();
        const many = st.images - images > 1;
        for (const [k, p] of st.pressed) {
            if (t - p.at > TP_PRESS_MS) { st.pressed.delete(k); continue; }
            // Its tile is still on the page, with its card or its buy form: opened, not bought out.
            if (tileHolds(p.tile)) continue;
            // Only Torn's own Buy, pressed in the open form, buys: the number in its box then is the most you took.
            if (!p.buy || !(p.typed > 0)) continue;
            const top = p.top - (win.scrollY - p.y);
            if (!many && top > -p.h && top < win.innerHeight) keys.set(k, p.typed);
        }
        return keys;
    }

    /** Fill all, while it is on: each listing's number into its own open box, once (again only when the number changed and you left ours). */
    function fillAllNow() {
        const fa = st.fillAll;
        if (!fa) return 0;
        let typed = 0;
        for (const f of st.fill) {
            const input = st.tiles[f.i] ? st.tiles[f.i].input : null;
            if (!input || !input.isConnected) continue;
            const had = fa.done.get(input);
            if (had && (had.n === f.n || tpDigits(input.value) !== had.n)) continue;
            fa.done.set(input, { was: had ? had.was : input.value, n: f.n });
            writeInputs(boxTwins(input), String(f.n));
            typed += 1;
        }
        return typed;
    }

    function fillAllOff() {
        const fa = st.fillAll;
        st.fillAll = null;
        if (!fa) return;
        // Put back what was there, where the number is still ours.
        for (const [input, rec] of fa.done) if (input.isConnected && tpDigits(input.value) === rec.n) writeInputs(boxTwins(input), rec.was);
    }

    function onBazaar(v, kind) {
        const place = kind === 'itemmarket' ? IM_PLACE : 'b:' + bazaarOwnerId(st.href);
        const whoId = kind === 'itemmarket' ? '' : bazaarOwnerId(st.href);
        const { listings } = scanDom(kind === 'itemmarket' ? PAGE_ITEM_MARKET : PAGE_BAZAAR, doc, { index: st.index });
        // A listing whose Buy box is open: Torn puts its buy form where the card was, so the scan by pictures does
        // not find it. It is the same listing still, at the same price, and its box is the one Fill types into.
        const menus = openBuyMenus(doc);
        for (const m of menus) {
            const item = findItemByName(st.index, m.name);
            if (!item || listings.some((c) => c.el && m.tile.contains(c.el) && String(c.itemId) === String(item.id))) continue;
            listings.push({ el: m.el, itemId: item.id, name: item.name, listingPrice: m.price, qty: m.qty, qtyAssumed: !m.qty, menu: true });
        }
        if (menus.length) say('menu', 'A Buy box open on a listing', `read as the same listing: ${menus[0].name} at $${menus[0].price}, ${menus[0].qty || 'stock not said'} in stock, its number box ${menus[0].input ? 'found' : 'NOT found'}`);
        st.cards = listings;
        st.tiles = listings.map((c) => { const tile = c.menu ? c.el : listingTile(c.el); return { tile, input: buyBox(tile) }; });
        const t = now();
        // Another place: nothing seen at the last one is carried over, and Fill all is off.
        if (st.seenPlace !== place) { st.seen = {}; st.seenPlace = place; st.pressed.clear(); st.took = {}; st.said.clear(); st.images = 0; fillAllOff(); }
        const images = doc.querySelectorAll('img[src*="/images/items/"]').length;
        // What you took: a listing's stock that dropped while you were here, or a listing you pressed in that is gone.
        const before = st.seen;
        const goneNow = pressedGone(t, images);
        const r = stockBuys(before, listings, goneNow, new Set(st.pressed.keys()));
        // A listing whose tile is still there but says nothing just now (Torn's own words after a buy stand in
        // it): its last stock is kept, so the buy shows as that stock falling when the card is back.
        for (const [k, p] of st.pressed) if (!r.seen[k] && before[k] && tileHolds(p.tile)) r.seen[k] = before[k];
        st.seen = r.seen;
        st.images = images;
        for (const b of r.bought) {
            const key = String(b.itemId) + '|' + Number(b.price);
            const gone = !r.seen[key];
            st.pressed.delete(key);
            const id = String(b.itemId);
            const nid = note('buy', { t, id, qty: b.qty, price: b.price, whoId, im: kind === 'itemmarket' });
            st.pend.push({ nid, id, qty: b.qty, t });
            st.took[id] = (st.took[id] || 0) + b.qty;
            say('', `A buy seen on the page: ${b.qty} × ${b.name || 'item ' + id} at $${b.price}`, gone ? `the listing was gone after you pressed Buy with ${goneNow.get(key)} in its box` : 'the stock on its listing fell after your press in it');
        }
        // What this bazaar's page shows of your pieces, told to the hub: the page in front of you is the newest look
        // at a bazaar there is (as Torn Trading lets the page correct its list). Told when it changes, and once a
        // minute while you stand here. After the buys above: what it shows is the bazaar after them.
        if (kind === 'bazaar' && whoId) {
            const shop = shopSeen(listings);
            const sig = whoId + '|' + shop.map((x) => x.id + ':' + x.price + ':' + x.qty).join(',');
            if (shop.length && (sig !== st.shopSig || t - st.shopAt > TP_SHOP_EVERY_MS)) {
                st.shopSig = sig;
                st.shopAt = t;
                note('shop', { t, whoId, items: shop });
            }
        }
        // Held by the hub's view now (it names the notes it has taken), or never taken: no longer added here.
        const taken = new Set((st.shared && st.shared.notes) || []);
        // A view worked out well after the buy that still does not name it never will. A hub that is closed makes
        // no new view: the buy then stays in this tab's numbers (until 1.2.3 it left after three minutes, and the
        // count fell back to what it was before you bought).
        st.pend = pendLeft(st.pend, taken, st.shared ? st.shared.at : 0);
        const pend = {};
        for (const p of st.pend) pend[p.id] = (pend[p.id] || 0) + p.qty;

        const cards = listings.map((c, i) => {
            const input = st.tiles[i].input;
            return { itemId: c.itemId, price: c.listingPrice, qty: c.qtyAssumed ? 0 : c.qty, typed: input ? tpDigits(input.value) : 0, hasBox: !!input };
        });
        // The Item Market's page is of one piece: its address names it, also while no listing is drawn yet.
        const itemId = kind === 'itemmarket' ? (st.href.match(/[#&?/]itemID=(\d+)/i) || [])[1] || '' : '';
        let out = boxBazaar(v, cards, place, { pend, took: st.took, fillAll: !!st.fillAll, itemId });
        st.fill = out ? out.fill : [];
        const typedOf = () => { const by = {}; for (const c of cards) if (c.hasBox && c.typed > 0) by[c.itemId] = (by[c.itemId] || 0) + c.typed; return by; };
        st.live = { pend, typed: typedOf(), here: cards.map((c) => c.itemId) };
        // Fill all is on: the boxes that are open now get their numbers, and the box says so in the same look.
        if (st.fillAll && fillAllNow()) {
            cards.forEach((c, i) => { const input = st.tiles[i].input; c.typed = input ? tpDigits(input.value) : 0; });
            out = boxBazaar(v, cards, place, { pend, took: st.took, fillAll: true, itemId });
            st.live.typed = typedOf();
        }
        st.imNext = out ? out.imNext || null : null;
        const marks = new Map((out ? out.marks : []).map((m) => [m.i, m]));
        listings.forEach((c, i) => {
            // Nothing of ours on Torn's open buy form: it is where you type and press.
            const m = c.menu ? null : marks.get(i);
            setMark(c.el, m ? m.text : '', m ? m.state : '');
            setRing(c.el, m ? m.ring : '');
        });
        // Opened from a link of ours that names a listing (the hub's "Sold by", a stop of your run): that listing
        // pulses, and the page is brought to it once when it is on the page. A press of yours ends it.
        const named = (() => { try { const u = new URL(st.href); return { id: u.searchParams.get('ttItem') || '', price: Number(u.searchParams.get('ttPrice')) || 0 }; } catch { return { id: '', price: 0 }; } })();
        let aim = null;
        for (const c of listings) {
            if (c.menu || !c.el) continue;
            const is = !!named.id && st.pulseOff !== st.href && String(c.itemId) === named.id && (!named.price || Number(c.listingPrice) === named.price) && !aim;
            if (is) aim = c.el;
            if (c.el.hasAttribute('data-tarc-pulse') !== is) c.el.toggleAttribute('data-tarc-pulse', is);
        }
        if (aim && st.arrived !== st.href) {
            st.arrived = st.href;
            const r = aim.getBoundingClientRect();
            if ((r.top < 0 || r.bottom > win.innerHeight) && aim.scrollIntoView) aim.scrollIntoView({ block: 'center', behavior: 'smooth' });
            say('aim', 'Opened from a link that names a listing', 'the listing is on the page: it pulses');
        }
        if (listings.length) {
            const first = st.tiles[0];
            say('cards', `A ${kind === 'itemmarket' ? 'page of the Item Market' : 'bazaar'}: ${listings.length} set piece${listings.length === 1 ? '' : 's'} on the page`, 'the tile around a listing: ' + (first.tile === listings[0].el ? 'the card itself' : (first.tile.className || first.tile.tagName)) + '; the card: ' + (String(listings[0].el.className || '').replace(/\s*tarc-\S+/g, '') || listings[0].el.tagName));
            const open = st.tiles.find((x) => x.input);
            if (open) say('box', 'A quantity box was found in a listing', 'its class: ' + (open.input.className || '(none)') + '; its type: ' + open.input.type);
        }
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
        // The rows as this tab saw them on the trade's own view: the add-money step shows none to compare.
        if (rows.length) st.tradeRows = { id, t: now(), rows: rows.map((r) => ({ name: r.name, qty: r.qty })) };
        const known = st.tradeRows && st.tradeRows.id === id && now() - st.tradeRows.t < VIEW_OLD_MS ? st.tradeRows.rows : null;
        const out = boxTrade(v, t, rows, step, !!money, known);
        // Not the trade the hub read (or not read at all): the hub is asked to read it now, at most every 20 s.
        if (((out && out.changed) || (!t && rows.length)) && now() - (st.tradeAsked || 0) > 20000) { st.tradeAsked = now(); note('trade', { id }); }
        if (out && out.changed) st.moneyBox = null;
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

    /**
     * A note of ours beside one of Torn's controls (ADD LISTING, EXCHANGE). It lives only as long as that control is
     * on the page: when Torn swaps its form for "Are you sure ...? Yes / No", the next look finds no control, names
     * no note here, and scan() takes the old one away - it used to stay where it was, on top of Yes and No.
     */
    function noteBeside(host, text, state, anchor) {
        const mark = setMark(host, text, state, 'note');
        if (!mark) return;
        st.notesNow.add(host);
        markBeside(mark, anchor);
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
        // Mockup Z6: more sets typed than you hold is said beside Torn's button. Torn's box is never changed for you.
        for (const ex of found) {
            const s = v.sets.find((x) => x.key === ex.set);
            const host = ex.root || ex.button.parentElement;
            if (!s || !ex.box || !host) continue;
            const full = Math.max(0, s.full - (off[s.key] || 0));
            const over = tpDigits(ex.box.value) > full;
            noteBeside(host, over ? (full ? `You hold ${hNum(full)} full ${full === 1 ? 'set' : 'sets'}` : 'No full set yet') : '', 'bad', ex.button);
        }
        return boxMuseum(v, found.map((f) => ({ set: f.set, hasBox: !!f.box })), off);
    }

    /**
     * The points market (mockup Z7): what the price in Torn's box is, said beside ADD LISTING, and a hairline in
     * Torn's list where that listing would sit - and above which a price is cheap, or a loss. The hairline is on
     * the edge between two rows and carries no words (the owner, 2026-10-11: a line with words on it "blocks the
     * torn page"). Read only: the boxes are looked at as you type, never written here.
     */
    function onPoints(v) {
        const l = pointsListing(doc);
        st.listing = l;
        const rows = pointsRows(doc);
        say('pm', 'The points market, as this tab sees it', `${l ? 'the Points and Price boxes found' : 'the Points and Price boxes NOT found'} · ${rows.length ? `${rows.length} rows of the list read, from ${hMoney(rows[0].each)}` : 'no row of the list could be read: no line is drawn'}`);
        const typed = l ? { amount: tpDigits(l.amount.value), price: tpDigits(l.price.value) } : null;
        const out = boxPoints(v, !!l, { typed, rows: rows.map((r) => ({ points: r.points, each: r.each })) });
        const lines = new Map(out.marks.map((m) => [m.i, m]));
        rows.forEach((r, i) => {
            const m = lines.get(i);
            setRule(r.el, !!m, m ? m.state : '');
        });
        if (l && l.root) noteBeside(l.root, out.note ? out.note.text : '', out.note ? out.note.state : '', l.button);
        return out;
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
            for (const el of doc.querySelectorAll('.tarc-buyhere')) setRing(el, '');
            st.marked = false;
        }
        fillAllOff();
        for (const el of doc.querySelectorAll('[data-tarc-pulse]')) el.removeAttribute('data-tarc-pulse');
        st.live = null;
        st.cards = [];
        st.tiles = [];
        st.fill = [];
        st.exchanges = [];
        st.listing = null;
        st.imNext = null;
        st.moneyBox = null;
        st.notes = new Set();
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
        if (!st.shared) loadShared();
        const fresh = st.shared && t - st.shared.at < VIEW_OLD_MS;
        // A page that is none of ours, or numbers that would be old: the bar alone says which.
        if (!kind || !fresh) {
            if (kind) clear();
            show(null);
            showStock(null);
            return;
        }
        const v = st.shared.v;
        let out = null;
        st.notesNow = new Set();
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
        // A note whose control this look did not find is taken off the page.
        for (const host of st.notes) if (!st.notesNow.has(host)) setMark(host, '', '', 'note');
        st.notes = st.notesNow;
        show(out);
        showStock((kind === 'bazaar' || kind === 'itemmarket') && st.live ? boxStock(v, st.live) : null);
    }

    function later(ms = TP_SCAN_MS) {
        if (st.timer) return;
        st.timer = win.setTimeout(scan, ms);
    }

    // ---- presses in the box --------------------------------------------------------------------------------------

    function done(key) {
        st.done = key;
        st.doneAt = now();
        show(st.content);
        win.setTimeout(() => show(st.content), TP_DONE_MS + 50);
    }

    const placeNow = () => (st.kind === 'itemmarket' ? IM_PLACE : 'b:' + bazaarOwnerId(st.href));
    const openStop = (stop) => {
        const first = stop.lines[0];
        win.location.assign(stop.im ? itemMarketUrl(first.id, first.name) : bazaarUrl(stop.whoId, first.id, first.price));
    };

    function goNext(v) {
        // The Item Market, with a piece of your list still unvisited: its page, and the run stays on this stop.
        if (st.kind === 'itemmarket' && st.imNext) { win.location.assign(itemMarketUrl(st.imNext.id, st.imNext.name)); return; }
        const stops = v.buy.run.stops;
        const at = stops.findIndex((s) => s.place === placeNow());
        const next = at >= 0 ? stops[at + 1] || null : null;
        note('act', { name: 'run', args: ['next'] });
        if (next) openStop(next);
    }

    /** The run's stop, from a page that is not it: opened on your press, and the run stays where it is. */
    function goStop(v) {
        const cur = v.buy.run.stops.find((s) => s.state === 'cur');
        if (cur && cur.place !== placeNow()) openStop(cur);
    }

    function press(btn) {
        const act = btn.dataset.act;
        const val = btn.dataset.v || '';
        const n = tpDigits(btn.dataset.n);
        const v = st.shared ? st.shared.v : null;
        if (act === 'fold') { if (!(isOpen() && st.at && st.at.bar)) setOpen(!isOpen()); return; }
        if (act === 'unfold') { st.pinned = true; setOpen(true); return; }
        if (act === 'stock-fold') { st.stockOpen = !st.stockOpen; gmSet('stockOpen', st.stockOpen); showStock(st.stockOut); return; }
        if (act === 'hub') { gmOpenTab(ARCHIVE_PAGE_URL); return; }
        if (act === 'copy') { if (gmCopy(val)) done('copy:' + val); return; }
        if (act === 'open-trade') { win.location.assign(tradeViewUrl(val)); return; }
        if (!v) return;
        if (act === 'run-start') { note('act', { name: 'run', args: ['start'] }); done('run-start:'); return; }
        if (act === 'run-stop') { note('act', { name: 'run', args: ['stop'] }); return; }
        if (act === 'run-next') { goNext(v); return; }
        if (act === 'run-go') { goStop(v); return; }
        // Fill: a number typed into Torn's own box, on this press. Nothing of Torn's is pressed.
        if (act === 'fill-all') {
            // On from this press, on this page only; a second press puts back what was there.
            if (st.fillAll) fillAllOff();
            else if (st.kind === 'bazaar' || st.kind === 'itemmarket') {
                st.fillAll = { done: new Map() };
                say('', 'Fill all pressed', `${st.fill.length} listing${st.fill.length === 1 ? '' : 's'} to type into, ${st.tiles.filter((x) => x.input).length} quantity box${st.tiles.filter((x) => x.input).length === 1 ? '' : 'es'} open`);
            }
            later(0);
        } else if (act === 'fill-card') {
            const tile = st.tiles[Number(val)];
            const input = tile && tile.input && tile.input.isConnected ? tile.input : null;
            if (input && n > 0) { writeInputs(boxTwins(input), String(n)); done('fill-card:' + val); later(0); }
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
        // A press anywhere in a listing's tile (its Buy box is beside the card, not in it): the listing may vanish
        // because you bought it out.
        if (st.kind === 'bazaar' || st.kind === 'itemmarket') {
            // Any press of yours on the page: the listing a link named stops pulsing.
            if (st.pulseOff !== st.href) { st.pulseOff = st.href; for (const el of doc.querySelectorAll('[data-tarc-pulse]')) el.removeAttribute('data-tarc-pulse'); }
            pressIn(target);
            for (const ms of TP_AFTER_PRESS_MS) win.setTimeout(() => later(0), ms);
            return;
        }
        // The points market and the museum: a press of yours may swap Torn's form for its "Are you sure ...?" by
        // showing and hiding what is already there, which no change of the page's nodes tells us. Looked at once.
        if (st.kind === 'points' || st.kind === 'museum') for (const ms of TP_AFTER_PRESS_MS) win.setTimeout(() => later(0), ms);
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

    /** A press of yours in a listing's tile, remembered with where the tile stood. */
    function pressIn(target, enter = false) {
        const i = st.cards.findIndex((c, k) => (st.tiles[k] && st.tiles[k].tile && st.tiles[k].tile.contains(target)) || (c.el && c.el.contains(target)));
        if (i < 0) return false;
        const r = (st.tiles[i].tile || st.cards[i].el).getBoundingClientRect();
        const el = st.tiles[i].tile || st.cards[i].el;
        // Torn's own Buy in the open form (or Enter in its box): the only press that buys, with the number in the box.
        const menu = target.closest ? target.closest('[class*="buyMenu"]') : null;
        const button = target.closest ? target.closest('button') : null;
        const label = button ? String(button.getAttribute('aria-label') || button.textContent || '').trim() : '';
        const box = menu ? buyBox(menu) : null;
        const key = cardKey(st.cards[i]);
        const had = st.pressed.get(key);
        let buy = !!(menu && ((button && /^buy\b/i.test(label)) || (enter && box && box.contains(target))));
        let typed = buy && box ? tpDigits(box.value) : 0;
        // A press on Torn's Close takes the buy back; any other press in the tile (a "Yes" Torn may ask for) keeps it.
        if (!buy && had && had.buy && !(button && /^(close|no|cancel)\b/i.test(label))) { buy = true; typed = had.typed; }
        // The tile itself is kept: a listing is gone only when its tile is (a buy form in it is the listing, open).
        st.pressed.set(key, { at: now(), y: win.scrollY, top: r.top, h: r.height, tile: (el.closest && el.closest('[class*="item___"]')) || el, buy, typed });
        return true;
    }

    function onKey(event) {
        if (!yours(event)) return;
        // Enter in a listing's box is a press there, as a click on its Buy is.
        if (event.key === 'Enter' && (st.kind === 'bazaar' || st.kind === 'itemmarket') && event.target && event.target.closest && !event.target.closest('#tarc-host')) {
            if (pressIn(event.target, true)) for (const ms of TP_AFTER_PRESS_MS) win.setTimeout(() => later(0), ms);
            return;
        }
        if (event.key !== 'n' && event.key !== 'N' && event.key !== '`') return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const el = event.target;
        if (el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName || ''))) return;
        if (event.key === '`') {
            // Torn Trading's panel on this page keeps the key: ours is folded with its own + and –.
            if (!tradingOnPage(doc) && (st.room || st.pinned)) setOpen(!isOpen());
            return;
        }
        if (!st.shared || (st.kind !== 'bazaar' && st.kind !== 'itemmarket')) return;
        const v = st.shared.v;
        const here = v.buy.run.stops.find((s) => s.place === placeNow());
        if (here && here.state === 'cur') goNext(v);
        else goStop(v);
    }

    doc.addEventListener('click', onClick, true);
    doc.addEventListener('keydown', onKey, true);
    // A number typed into a card's box: its mark says at once when it is more than you need.
    const onInput = (event) => {
        // The points market and the museum: a number typed into Torn's box is judged as you type.
        if (st.kind === 'points' || st.kind === 'museum') { later(120); return; }
        if (st.kind !== 'bazaar' && st.kind !== 'itemmarket') return;
        // Typed by you outside every listing (the bazaar's own search): listings that go now were filtered, not bought.
        const el = event.target;
        if (yours(event) && el && el.closest && !el.closest('#tarc-host') && !st.tiles.some((x) => x.tile && x.tile.contains(el))) st.pressed.clear();
        later(120);
    };
    doc.addEventListener('input', onInput, true);

    // ---- when to look again ---------------------------------------------------------------------------------------

    const mo = new win.MutationObserver((list) => {
        // Our own marks changing is not the page changing.
        for (const m of list) {
            const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
            if (el && el.closest && el.closest('#tarc-host, .tarc-setmark, .tarc-setrule')) continue;
            const nodes = m.type === 'childList' ? [...m.addedNodes, ...m.removedNodes] : [];
            if (nodes.length && nodes.every((x) => x.nodeType === 1 && x.classList && (x.classList.contains('tarc-setmark') || x.classList.contains('tarc-setrule')))) continue;
            later();
            return;
        }
    });
    mo.observe(doc.body, { childList: true, characterData: true, subtree: true });
    const onHash = () => later(0);
    const onResize = () => { st.drawn = ''; later(0); };
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
        // Torn's own page may have moved under us (its sidebar, a page of another width).
        if (!box.hidden) place();
        // Looked at again only when something of ours changed: the page's own changes are seen as they happen.
        if (had !== (st.shared ? st.shared.at : 0) || win.location.href !== st.href) later(0);
    }
    const lookTimer = win.setInterval(look, TRADING_LOOK_EVERY_MS);
    // Torn Trading's panel moved, folded, came or went: the Archive makes room at once.
    const otherTimer = win.setInterval(() => {
        if (doc.hidden || (!doc.getElementById(TRADING_HOST_IDS[0]) && !st.other)) return;
        const r = tradingRect();
        const sig = r ? [r.left, r.top, r.right, r.bottom].map(Math.round).join() : '';
        if (sig !== st.other) { st.drawn = ''; show(st.content); }
    }, TP_OTHER_MS);

    place();
    loadShared();
    look();
    later(0);

    return {
        scan,
        stop() {
            win.clearInterval(lookTimer);
            win.clearInterval(otherTimer);
            if (st.timer) win.clearTimeout(st.timer);
            mo.disconnect();
            doc.removeEventListener('click', onClick, true);
            doc.removeEventListener('keydown', onKey, true);
            doc.removeEventListener('input', onInput, true);
            win.removeEventListener('hashchange', onHash);
            win.removeEventListener('popstate', onHash);
            win.removeEventListener('resize', onResize);
            clearSetMarks(doc);
            for (const el of doc.querySelectorAll('.tarc-buyhere')) setRing(el, '');
            host.remove();
            style.remove();
        },
        version,
    };
}
