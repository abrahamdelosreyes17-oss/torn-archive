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
import { hIcon } from './fmt.js';
import { boxClosed, boxAny, boxBazaar, boxTrade, boxMuseum, boxPoints, boxForum } from './box-pages.js';
import { overlayStrips, overlaySide, overlayPlace, OV_WIDTH, OV_BAR, OV_GAP, OV_TOP } from '../core/overlay.js';
import { scanDom } from '../sources/dom/scan.js';
import { setMark, clearSetMarks, museumExchanges, pieceTiles, pointsListing, tradeTheirRows, forumThread, boxTwins } from '../sources/dom/sets-pages.js';
import { writeInputs } from '../sources/dom/fill.js';
import { listingTile, buyBox } from '../sources/dom/buy-box.js';
import { detectPage, PAGE_BAZAAR, PAGE_ITEM_MARKET, isTradePage, isMuseumPage, isPointsMarketPage, isForumPage, bazaarOwnerId, itemMarketUrl, tradeViewUrl, ARCHIVE_PAGE_URL } from '../sources/route.js';
import { bazaarUrl } from '../core/feed.js';
import { buildItemIndex } from '../core/items.js';
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
/** After a press on Torn's page it is looked at again this soon, and once more: Torn redraws in steps. */
const TP_AFTER_PRESS_MS = [150, 700];
const TP_SCAN_MS = 250;
const TP_DONE_MS = 4000;
/** Torn Trading's panel is looked at this often while it is on the page: it can be moved, folded, or come later. */
const TP_OTHER_MS = 1000;
/** The most of the window's height the overlay takes, as Torn Trading's panel. */
const TP_TALL = 0.75;
const TP_TALL_MAX = 640;
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
        exchanges: [], presses: [], pressAt: 0, listing: null, moneyBox: null,
        marked: false, html: '', done: '', doneAt: 0, threadSaid: '',
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
        const html = said.html;
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
        const keys = new Set();
        const many = st.images - images > 1;
        for (const [k, p] of st.pressed) {
            if (t - p.at > TP_PRESS_MS) { st.pressed.delete(k); continue; }
            const top = p.top - (win.scrollY - p.y);
            if (!many && top > -p.h && top < win.innerHeight) keys.add(k);
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
        st.cards = listings;
        st.tiles = listings.map((c) => { const tile = listingTile(c.el); return { tile, input: buyBox(tile) }; });
        const t = now();
        // Another place: nothing seen at the last one is carried over, and Fill all is off.
        if (st.seenPlace !== place) { st.seen = {}; st.seenPlace = place; st.pressed.clear(); st.took = {}; st.said.clear(); st.images = 0; fillAllOff(); }
        const images = doc.querySelectorAll('img[src*="/images/items/"]').length;
        // What you took: a listing's stock that dropped while you were here, or a listing you pressed in that is gone.
        const r = stockBuys(st.seen, listings, pressedGone(t, images));
        st.seen = r.seen;
        st.images = images;
        for (const b of r.bought) {
            const key = String(b.itemId) + '|' + Number(b.price);
            const gone = !r.seen[key];
            st.pressed.delete(key);
            const id = String(b.itemId);
            const nid = note('buy', { t, id, qty: b.qty, price: b.price, whoId });
            st.pend.push({ nid, id, qty: b.qty, t });
            st.took[id] = (st.took[id] || 0) + b.qty;
            say('', `A buy seen on the page: ${b.qty} × ${b.name || 'item ' + id} at $${b.price}`, gone ? 'the listing was gone after your press in its tile' : 'the stock on its listing fell');
        }
        // Held by the hub's view now (it names the notes it has taken), or never taken: no longer added here.
        const taken = new Set((st.shared && st.shared.notes) || []);
        st.pend = st.pend.filter((p) => !taken.has(p.nid) && t - p.t < TP_PEND_MS);
        const pend = {};
        for (const p of st.pend) pend[p.id] = (pend[p.id] || 0) + p.qty;

        const cards = listings.map((c, i) => {
            const input = st.tiles[i].input;
            return { itemId: c.itemId, price: c.listingPrice, qty: c.qtyAssumed ? 0 : c.qty, typed: input ? tpDigits(input.value) : 0, hasBox: !!input };
        });
        let out = boxBazaar(v, cards, place, { pend, took: st.took, fillAll: !!st.fillAll });
        st.fill = out ? out.fill : [];
        // Fill all is on: the boxes that are open now get their numbers, and the box says so in the same look.
        if (st.fillAll && fillAllNow()) {
            cards.forEach((c, i) => { const input = st.tiles[i].input; c.typed = input ? tpDigits(input.value) : 0; });
            out = boxBazaar(v, cards, place, { pend, took: st.took, fillAll: true });
        }
        const marks = new Map((out ? out.marks : []).map((m) => [m.i, m]));
        listings.forEach((c, i) => {
            const m = marks.get(i);
            setMark(c.el, m ? m.text : '', m ? m.state : '');
            setRing(c.el, m ? m.ring : '');
        });
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
            for (const el of doc.querySelectorAll('.tarc-buyhere')) setRing(el, '');
            st.marked = false;
        }
        fillAllOff();
        st.cards = [];
        st.tiles = [];
        st.fill = [];
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
        if (!st.shared) loadShared();
        const fresh = st.shared && t - st.shared.at < VIEW_OLD_MS;
        // A page that is none of ours, or numbers that would be old: the bar alone says which.
        if (!kind || !fresh) {
            if (kind) clear();
            show(null);
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
        show(st.content);
        win.setTimeout(() => show(st.content), TP_DONE_MS + 50);
    }

    const placeNow = () => (st.kind === 'itemmarket' ? IM_PLACE : 'b:' + bazaarOwnerId(st.href));
    const openStop = (stop) => {
        const first = stop.lines[0];
        win.location.assign(stop.im ? itemMarketUrl(first.id, first.name) : bazaarUrl(stop.whoId, first.id, first.price));
    };

    function goNext(v) {
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
            pressIn(target);
            for (const ms of TP_AFTER_PRESS_MS) win.setTimeout(() => later(0), ms);
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

    /** A press of yours in a listing's tile, remembered with where the tile stood. */
    function pressIn(target) {
        const i = st.cards.findIndex((c, k) => (st.tiles[k] && st.tiles[k].tile && st.tiles[k].tile.contains(target)) || (c.el && c.el.contains(target)));
        if (i < 0) return false;
        const r = (st.tiles[i].tile || st.cards[i].el).getBoundingClientRect();
        st.pressed.set(cardKey(st.cards[i]), { at: now(), y: win.scrollY, top: r.top, h: r.height });
        return true;
    }

    function onKey(event) {
        if (!yours(event)) return;
        // Enter in a listing's box is a press there, as a click on its Buy is.
        if (event.key === 'Enter' && (st.kind === 'bazaar' || st.kind === 'itemmarket') && event.target && event.target.closest && !event.target.closest('#tarc-host')) {
            if (pressIn(event.target)) for (const ms of TP_AFTER_PRESS_MS) win.setTimeout(() => later(0), ms);
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
            if (el && el.closest && el.closest('#tarc-host, .tarc-setmark')) continue;
            const nodes = m.type === 'childList' ? [...m.addedNodes, ...m.removedNodes] : [];
            if (nodes.length && nodes.every((x) => x.nodeType === 1 && x.classList && x.classList.contains('tarc-setmark'))) continue;
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
