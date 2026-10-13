// What Torn Archive has learned, and how each read is folded into it. Pure: no page, no storage, no clock.
// The engine (engine.js) asks Torn and TornW3B, hands every answer to one of these folds, stores the parts that
// changed, and gives the whole thing to the view (core/view.js) through engineInput().

import { SETS, isSetItem, setOfItem, setByKey, isBuyingTitle } from '../core/sets.js';
import { STOCK_EMPTY, stockApply, stockInventory, stockHeld, stockAge, eventsFromRows, eventFromSeen } from '../core/stock.js';
import { parsePointsMarket, listPrice, recordPrice, bookAdd, bookSettle, entryFromLog } from '../core/points.js';
import { lotsRead, LOTS_EMPTY } from '../core/lots.js';
import { poolSetCost } from '../core/books.js';
import { rowsFromLog, rowsFromTrade, mugFromLog, LOG_BAZAAR_BUY, LOG_BAZAAR_SELL, LOG_MARKET_BUY, LOG_MARKET_SELL, LOG_MUGGED } from '../core/ledger.js';
import { parseTradeList, parseTrade, tradesSeen, tradesClosed } from '../core/trades.js';
import { RUN_IDLE } from '../core/shopping.js';
import { normalizeW3bListings, normalizeItemMarketRows } from '../core/feed.js';
import { mergeInventory } from '../core/inventory.js';
import { parseOwnList } from '../core/tw3b-list.js';
import { serverTake, serverPrune, serverReadKept, serverShop, serverDirIn } from '../core/server.js';

const enNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const enWhole = (v) => Math.max(0, Math.floor(enNum(v)));
const enDay = (t) => new Date(t).toISOString().slice(0, 10);
const EN_MIN = 60000;
const EN_HOUR = 3600000;
const EN_DAY = 86400000;

/** Every piece of both sets, as strings: what the stock count, the prices and the books are kept for. */
export const ENGINE_PIECES = SETS.flatMap((s) => s.pieces.map((p) => String(p.id)));
const EN_PIECE_SET = new Set(ENGINE_PIECES);

/** A bazaar listing TornW3B has not looked at for this long is most likely gone: not advice to act on. */
export const LISTING_FRESH_MS = 30 * EN_MIN;
/** A piece's bazaar listings are dropped when they were read this long ago and never since. */
export const LISTINGS_KEEP_MS = 3 * EN_HOUR;
/** Torn's own read of one bazaar stands for this long. */
export const SHOP_KEEP_MS = EN_HOUR;
/** The Item Market's listings of a piece stand for this long. */
export const MARKET_KEEP_MS = 30 * EN_MIN;
/** How far back the log and the finished trades are read at the first start. */
export const BACKFILL_MS = 14 * EN_DAY;
const EN_ROWS_KEPT = 4000;
const EN_OUTS_KEPT = 1500;
const EN_BOOK_KEPT = 1500;
const EN_FINISHED_KEPT = 200;
const EN_NAMES_KEPT = 1500;
const EN_LOTS_READ = 300;

/** The parts of the state, each stored under its own name: only what changed is written. */
export const ENGINE_PARTS = ['self', 'items', 'stock', 'seen', 'swaps', 'offers', 'summary', 'shops', 'bids', 'points', 'money', 'book', 'types', 'log', 'ledger', 'outs', 'trades', 'cart', 'plan', 'run', 'hot', 'thread', 'posted', 'w3b', 'rate', 'hist', 'names', 'server'];

export function engineEmpty() {
    return {
        self: { id: '', name: '' },
        items: { at: 0, list: {} },
        stock: { ...STOCK_EMPTY },
        seen: [],
        swaps: [],
        offers: {},
        summary: { at: 0, low: {} },
        shops: {},
        // What a bazaar's own page showed in one of your Torn tabs: { whoId: { at, items: { id: { price, qty } } } }.
        // Only the pieces that were on the screen (a bazaar draws its list as you scroll). Not kept over a reload.
        pages: {},
        // "Read now" was pressed then: a row looked at before it does not count until it is looked at again.
        fresh: { since: 0 },
        // The in-between layer (pileOf): each piece's listings sorted once, and again only when an answer changed
        // them. `all` and `by` count the changes; not stored.
        lay: { all: 0, by: {}, piles: new Map() },
        bids: {},
        points: { listings: [], at: 0, days: [], wallDays: [], lots: { ...LOTS_EMPTY } },
        money: { points: null, onHand: null, vault: null, at: 0 },
        book: [],
        types: { at: 0, made: [], sold: [], used: [], out: [], titles: {} },
        log: { from: 0, until: 0, at: 0, backfilled: false, madeRead: false },
        // direct: pieces sold or given away as themselves, each with what it had cost (1.3.0). repriced: the old
        // trade rows were looked through once for a piece priced with a whole trade's money (foldTradeReprice).
        ledger: { rows: [], mugs: [], tradeIds: [], tradesFrom: 0, tradesAt: 0, tradesBackfilled: false, direct: [], repriced: false },
        outs: [],
        trades: { open: [], at: 0, seen: null, finished: [], full: {}, told: null },
        cart: [],
        // How many sets the list on hand was made for ("from my cash"): kept while the list is, see engine planKeep.
        plan: { targets: null, at: 0, key: '' },
        run: { ...RUN_IDLE },
        hot: {},
        thread: null,
        // What the forum post said when you last pressed "Copy the post": { open, pct, struck: [names], at }.
        posted: null,
        w3b: { list: null, listAt: 0, receipts: [], receiptsAt: 0, lastReceiptAt: 0, error: '', receiptsError: '', tried: {} },
        // What you pay your sellers, fixed for the hour (core/sellrate.js fixTable; engine rateKeep). `sent`: the
        // table's `rev` as it was last brought to TornW3B - kept over a reload, so a reload keeps the hour.
        rate: { table: null, sent: 0 },
        hist: { low: {}, pays: [], share: [] },
        names: {},
        server: serverEmpty(),
    };
}

/** What the shared server said, when nothing has been heard from it (core/server.js). */
export function serverEmpty() {
    return { at: 0, seq: 0, seenAt: 0, shops: {}, dir: { reads: {}, turn: { of: 1, me: 0 } } };
}

/** What was stored, laid over a fresh state: a part of the wrong kind is left out. */
/** The mark on a buy seen by a copy that reads Torn's open buy form (1.2.2 on). */
const EN_SEEN_V = 2;

export function engineLoad(stored) {
    const S = engineEmpty();
    for (const part of ENGINE_PARTS) {
        const v = stored && stored[part];
        if (v == null) continue;
        if (Array.isArray(S[part]) ? Array.isArray(v) : typeof v === 'object') S[part] = Array.isArray(v) ? v : { ...S[part], ...v };
    }
    if (!S.thread || !S.thread.title) S.thread = null;
    // 1.2.0 and 1.2.1 took the opening of a listing's Buy box for a buy. What those copies "saw" and was still
    // waiting beside the count is not kept: a real buy is in Torn's log and in its inventory count.
    S.seen = S.seen.filter((b) => b && (b.counted || b.v === EN_SEEN_V));
    // A run that ended under 1.2.1 kept its counts beside a list already made shorter by them: it is let go.
    if (S.run && S.run.done && !S.run.sum) S.run = { on: false, at: 0, took: {}, place: null };
    S.server = { ...S.server, shops: serverReadKept(S.server.shops) };
    if (!Array.isArray(S.ledger.direct)) S.ledger = { ...S.ledger, direct: [] };
    // A day's low of $1 was a locked listing, never a price (kept by copies before 1.3.0).
    const low = {};
    for (const [id, days] of Object.entries((S.hist && S.hist.low) || {})) low[id] = (Array.isArray(days) ? days : []).filter((d) => d && d.low > 1);
    S.hist = { ...S.hist, low };
    return S;
}

// ---- Items ---------------------------------------------------------------------------------------------------------

/** Torn's item database (api/torn.js fetchItems): each item's name and market value. */
export function foldItems(S, raw, now) {
    const list = {};
    for (const [id, item] of Object.entries(raw || {})) {
        if (!item || typeof item.name !== 'string') continue;
        list[id] = [item.name, enWhole(item.market_value)];
    }
    if (!ENGINE_PIECES.some((id) => list[id] && list[id][1] > 0)) return false;
    S.items = { at: now, list };
    return true;
}

export const mvOf = (S) => (id) => { const it = S.items.list[String(id)]; return it ? enWhole(it[1]) : 0; };
export const nameOf = (S) => (id) => { const it = S.items.list[String(id)]; return it ? it[0] : ''; };

function enName(S, id, name) {
    if (!id || !name || S.names[id] === name) return;
    enBump(S, null);
    const keys = Object.keys(S.names);
    if (keys.length >= EN_NAMES_KEPT) { const next = {}; for (const k of keys.slice(-Math.floor(EN_NAMES_KEPT / 2))) next[k] = S.names[k]; S.names = next; }
    S.names = { ...S.names, [id]: String(name) };
}

// ---- The in-between layer: what changed -------------------------------------------------------------------------------

/**
 * A piece's listings changed (`ids`), or everything did (null): its pile is sorted again at the next look (pileOf).
 * Every fold that can move a row says so here; a fold that forgot would show an old row for PILE_MAX_MS at most.
 */
export function enBump(S, ids) {
    const lay = S.lay || (S.lay = { all: 0, by: {}, piles: new Map() });
    if (ids == null) { lay.all += 1; return; }
    for (const id of ids) lay.by[String(id)] = (lay.by[String(id)] || 0) + 1;
}

const EN_REV = new WeakMap();
/** The pieces TornW3B's lists name a bazaar for: whoId -> [piece id]. Worked out once per record of the lists. */
function enRev(S) {
    let rev = EN_REV.get(S.offers);
    if (!rev) {
        rev = new Map();
        for (const [id, o] of Object.entries(S.offers)) for (const r of o.baz || []) { const k = String(r.whoId); if (!rev.has(k)) rev.set(k, []); rev.get(k).push(id); }
        EN_REV.set(S.offers, rev);
    }
    return rev;
}

/** The pieces one bazaar's rows are in: what it held, what it holds, and the lists that name it. */
function enShopPieces(S, whoId, ...items) {
    const out = new Set(enRev(S).get(String(whoId)) || []);
    for (const it of items) for (const id of Object.keys(it || {})) out.add(id);
    const sv = S.server.shops[String(whoId)];
    if (sv) for (const [item] of sv[2]) out.add(String(item));
    return out;
}

// ---- Prices of the pieces ------------------------------------------------------------------------------------------

/** TornW3B's summary: the cheapest bazaar price of every piece, in one request. */
export function foldSummary(S, rows, now) {
    const low = {};
    for (const r of rows || []) if (r && EN_PIECE_SET.has(String(r.itemId)) && r.lowestPrice > 0) low[String(r.itemId)] = r.lowestPrice;
    S.summary = { at: now, low };
}

/** One piece's bazaar listings from TornW3B (the raw rows). Your own bazaar and listings long unseen are left out. */
export function foldListings(S, id, raw, now) {
    const rows = normalizeW3bListings(raw)
        // A price of $1 or less is a locked listing, never a price (1.3.0: a $1 Teddy Bear stood as the day's low).
        .filter((r) => r.sellerId !== String(S.self.id) && r.price > 1 && !(r.dataAt && now - r.dataAt > LISTING_FRESH_MS))
        .slice(0, 40);
    for (const r of rows) enName(S, r.sellerId, r.sellerName);
    const prev = S.offers[id] || {};
    S.offers = { ...S.offers, [id]: { ...prev, baz: rows.map((r) => ({ price: r.price, qty: r.qty, whoId: r.sellerId, at: r.dataAt || now, ch: r.changedAt || 0 })), bazAt: now, bazLow: enWhole(S.summary.low[id]) } };
    enBump(S, [id]);
}

/** One piece's Item Market listings (api/torn.js fetchItemMarket's `listings`). */
export function foldMarket(S, id, listings, now) {
    const prev = S.offers[id] || {};
    S.offers = { ...S.offers, [id]: { ...prev, im: normalizeItemMarketRows(listings).filter((l) => l.price > 1).slice(0, 20), imAt: now } };
    enBump(S, [id]);
}

/**
 * One player's bazaar as Torn itself has it (v2 user?selections=bazaar&id=): fresher than any list of listings.
 * @returns false when the answer has no bazaar in it (nothing is changed)
 */
export function foldShop(S, whoId, json, now) {
    // An empty bazaar has been seen as an empty list. Should Torn ever answer it with nothing under the name, or
    // with a record by id, that is read too: a bazaar with nothing in it is a read, not a failed one.
    const raw = json && typeof json === 'object' && !json.error && 'bazaar' in json ? json.bazaar : undefined;
    const rows = Array.isArray(raw) ? raw : raw === null ? [] : raw && typeof raw === 'object' ? Object.values(raw) : null;
    if (!rows) return false;
    const items = {};
    for (const r of rows) {
        const id = String(enWhole(r && (r.ID ?? r.id ?? r.item_id)));
        const price = enWhole(r && r.price);
        const qty = enWhole(r && (r.quantity ?? r.amount));
        if (!EN_PIECE_SET.has(id) || !(price > 1) || !qty) continue;
        // A bazaar may list one item at two prices: the cheaper one is what you would be buying.
        if (!items[id] || price < items[id].price) items[id] = { price, qty };
    }
    const shops = {};
    for (const [k, v] of Object.entries(S.shops)) if (now - v.at < SHOP_KEEP_MS) shops[k] = v;
    enBump(S, enShopPieces(S, whoId, items, (S.shops[String(whoId)] || {}).items));
    shops[String(whoId)] = { at: now, items };
    S.shops = shops;
    return true;
}

/** The best any other buyer pays for a piece (TornW3B's buyers of an item, highest first). */
export function foldBids(S, id, traders, now) {
    const best = (traders || []).find((t) => t && t.id !== String(S.self.id) && t.price > 0) || null;
    S.bids = { ...S.bids, [id]: { at: now, price: best ? best.price : 0, name: best ? best.name || '' : '' } };
}

// ---- The shared server ---------------------------------------------------------------------------------------------

/**
 * One answer of the shared server (core/server.js): the bazaars it read from Torn since the last one, the ones it
 * read again and found the same, and which of TornW3B's lists the other PCs read.
 * @param got when the answer arrived, by this PC's clock
 */
export function foldServer(S, answer, got) {
    const known = new Set(Object.keys(S.shops));
    for (const o of Object.values(S.offers)) for (const r of o.baz || []) known.add(String(r.whoId));
    // A new record each time: what is worked out from it (svIndex) is kept per record.
    const shops = { ...S.server.shops };
    // Your own bazaar is not a place to buy.
    const reads = (answer && Array.isArray(answer.reads) ? answer.reads : []).filter((r) => !r || String(r.id) !== String(S.self.id));
    // The pieces whose rows this answer can move: of every bazaar it names, what it held and what it holds now.
    const named = [...reads.map((r) => r && r.id), ...(answer && Array.isArray(answer.seen) ? answer.seen : []).map((p) => (Array.isArray(p) ? p[0] : null))].filter((id) => id != null).map(String);
    const moved = new Set();
    for (const id of named) for (const p of enShopPieces(S, id)) moved.add(p);
    serverTake(shops, { ...answer, reads }, EN_PIECE_SET, (id) => known.has(id), got);
    for (const id of named) if (shops[id]) for (const [item] of shops[id][2]) moved.add(String(item));
    enBump(S, moved);
    serverPrune(shops, got);
    S.server = {
        at: got, shops,
        seq: answer && Number.isInteger(answer.seq) ? answer.seq : S.server.seq,
        seenAt: answer && Number.isFinite(answer.now) ? answer.now : S.server.seenAt,
        dir: serverDirIn(answer, S.server.dir, got),
    };
}

const EN_SV_INDEX = new WeakMap();
/** The server's bazaars by piece: piece id -> [{ whoId, at }]. Worked out once per record. */
function svIndex(S) {
    const shops = S.server.shops;
    let index = EN_SV_INDEX.get(shops);
    if (!index) {
        index = new Map();
        for (const [whoId, e] of Object.entries(shops)) {
            for (const [item] of e[2]) {
                const key = String(item);
                if (!index.has(key)) index.set(key, []);
                index.get(key).push({ whoId, at: e[1] });
            }
        }
        EN_SV_INDEX.set(shops, index);
    }
    return index;
}

/** One bazaar as Torn itself last had it, read by you or by the server, whichever is newer: { at, items } or null. */
export function shopNow(S, whoId, now) {
    const own = S.shops[String(whoId)] || null;
    const theirs = serverShop(S.server.shops, whoId);
    const best = own && theirs ? (theirs.at > own.at ? theirs : own) : own || theirs;
    return best && now - best.at < SHOP_KEEP_MS ? best : null;
}

/** Your own buys at a bazaar (seen on its page, or read in your log) are held against its listing for this long. */
export const OWN_KEEP_MS = 3 * EN_HOUR;
/**
 * A look at a bazaar counts as made after your buy only when it is over a minute later: TornW3B's answer is a copy
 * one to three minutes old, and Torn's own is some seconds old. (Measured for Torn Trading, 3.16.4.)
 */
export const OWN_MARGIN_MS = EN_MIN;

const EN_OWN_INDEX = new WeakMap();
/**
 * Your bazaar buys of the last hours, each of them once: Map 'item:who' -> [{ t, qty }]. A buy seen on the page
 * stands until its row in Torn's log is in; from then on the row does (a buy made with no Torn tab of ours open -
 * on a phone, or with the hub closed - is known from the log alone, and until 1.2.3 never came off a listing).
 */
function ownBuys(S, now) {
    const hit = EN_OWN_INDEX.get(S.ledger.rows);
    if (hit && hit.seen === S.seen && now - hit.at < EN_MIN && now >= hit.at) return hit.by;
    const by = new Map();
    const put = (item, who, t, qty) => { const k = item + ':' + who; if (!by.has(k)) by.set(k, []); by.get(k).push({ t, qty }); };
    const claimed = new Set();
    for (const b of S.seen) {
        if (b.logged) claimed.add(b.logged);
        // `no`: Torn's log has no such buy (judgeSeen): nothing came off that listing.
        else if (b.whoId && !b.im && !b.no && now - b.t < OWN_KEEP_MS) put(String(b.id), String(b.whoId), b.t, enWhole(b.qty));
    }
    const rows = S.ledger.rows;
    for (let k = rows.length - 1; k >= 0 && now - rows[k].t < OWN_KEEP_MS; k--) {
        const r = rows[k];
        if (r.side === 'buy' && r.venue === 'bazaar' && r.who) put(String(r.itemId), String(r.who), r.t, enWhole(r.qty));
    }
    EN_OWN_INDEX.set(S.ledger.rows, { seen: S.seen, at: now, by });
    return by;
}

/**
 * Was this look at a bazaar made after `t` - so that it shows what happened then?
 * Torn's own read: over a minute later. TornW3B's row: its check over a minute later AND that check found the bazaar
 * changed since (`ch`, TornW3B's content_updated: its last check that found a change). Its "last checked" alone
 * moves on while its copy is still the old one - so a listing you bought out came back, with your buy in it.
 * (A row kept from before 1.2.3 has no `ch`: its check time alone decides, with the margin.)
 */
function lookedSince(at, ch, from, t) {
    // The bazaar's own page, in front of you: what it shows after your buy is the bazaar after your buy.
    if (from === 'page') return at >= t;
    if (!(at - t > OWN_MARGIN_MS)) return false;
    return from !== 'w3b' || !ch || ch > t;
}

/**
 * A listing COUNTS - goes on a list, into "Do now", is called the cheapest - only when it was looked at this lately.
 * An older row is still shown, apart, as "not checked": it is asked of Torn before anything is made of it.
 * (Torn Trading shows nothing it has not confirmed within two minutes; that is why its finds are true. Here a list
 * of bazaars takes longer to walk than a flip, so the time is longer - and every stop of a list is asked again each
 * minute.)
 */
export const COUNT_MS = 5 * EN_MIN;

/** No row is offered that nobody has looked at for this long: it is most likely gone (1.3.0; a TornW3B row stood up to 3.5 h). */
export const OFFER_KEEP_MS = EN_HOUR;
/**
 * What a bazaar's own page showed stands against a read of Torn's API made less than this long after it: the API
 * is 20 to 40 seconds behind the page (measured 2026-10-10), so a read that close may still be the bazaar as it was.
 */
export const PAGE_STANDS_MS = EN_MIN;

/**
 * What a bazaar's page showed in a Torn tab of yours (the tab's note 'shop'): the pieces on the screen, their price
 * and stock. The newest look there is; a piece NOT on the screen says nothing (the page draws as you scroll).
 * A piece the page PROVED gone - its listing was on the screen and is not, or you said so - comes as `gone`, and
 * a bazaar whose page shows no listing at all as `empty`: every piece of it is gone.
 * @returns false when there was nothing to take
 */
export function notePage(S, what, now) {
    const whoId = String((what && what.whoId) || '');
    const at = Math.min(enNum(what && what.t) || now, now);
    if (!whoId || whoId === String(S.self.id) || !Array.isArray(what.items)) return false;
    const items = {};
    for (const r of what.items) {
        const id = String(r && r.id);
        const price = enWhole(r && r.price);
        const qty = enWhole(r && r.qty);
        if (!EN_PIECE_SET.has(id)) continue;
        if (r && r.gone) { if (!items[id]) items[id] = { price: 0, qty: 0, at }; continue; }
        if (!(price > 1) || !qty) continue;
        if (!items[id] || !items[id].qty || price < items[id].price) items[id] = { price, qty, at };
    }
    const empty = what.empty === true;
    if (!Object.keys(items).length && !empty) return false;
    const pages = {};
    for (const [k, v] of Object.entries(S.pages || {})) if (now - v.at < SHOP_KEEP_MS) pages[k] = v;
    const prev = pages[whoId];
    if (prev && prev.at >= at) return false;
    enBump(S, enShopPieces(S, whoId, items, prev ? prev.items : null));
    // A piece that was on the screen a moment ago and is not now (you scrolled on): its look stays, as old as it is.
    pages[whoId] = empty ? { at, items: {}, empty: true } : { at, items: { ...(prev && !prev.empty ? prev.items : {}), ...items } };
    S.pages = pages;
    return true;
}

/**
 * A piece's listings as the view takes them: its bazaars (Torn's own read of a bazaar, yours or the server's, wins
 * when newer than TornW3B's list; the bazaar's own page in a tab of yours wins over both), the bazaars only the
 * server knows of, and the Item Market.
 * Each row: `at` when it was looked at, `from` by whom, `ok` whether it counts (COUNT_MS, and "Read now").
 * @param ex (optional) { at }: set to the first moment the answer would be another one though nothing was read
 *           (a row grows too old to count, or to be kept): pileOf sorts the piece again then.
 */
export function offersOf(S, id, now, ex = null) {
    const key = String(id);
    const o = S.offers[key] || {};
    const out = [];
    const done = new Set();
    const own = ownBuys(S, now);
    const floor = Math.max(now - COUNT_MS, enNum(S.fresh && S.fresh.since));
    const soon = (t) => { if (ex && t < ex.at) ex.at = t; };
    const shopAt = (whoId) => { const shop = shopNow(S, whoId, now); if (shop) soon(shop.at + SHOP_KEEP_MS); return shop; };
    // `at`: when the bazaar was last looked at, and `from` by whom - 'torn' (Torn itself, by you or the server),
    // 'page' (its own page in a tab of yours) or 'w3b' (TornW3B's copy). The screen says both: a row is never shown
    // as newer than it is.
    const push = (whoId, price, units, at, from, ch) => {
        // Nobody has looked at it for an hour, or it is locked at $1: not offered.
        if (!(now - at < OFFER_KEEP_MS) || !(price > 1)) return;
        soon(at + OFFER_KEEP_MS);
        let qty = units;
        // What you bought there comes off, until a look that can have seen the buy shows the bazaar as it is.
        for (const b of own.get(key + ':' + whoId) || []) if (!lookedSince(at, ch, from, b.t)) { qty -= b.qty; soon(b.t + OWN_KEEP_MS); }
        if (!(qty > 0)) return;
        const ok = at >= floor;
        if (ok) soon(at + COUNT_MS + 1);
        out.push({ price, qty, src: 'bazaar', who: S.names[whoId] || null, whoId, at, from, ok });
    };
    const add = (whoId, price, units, at, from, ch = 0) => {
        const page = (S.pages || {})[whoId];
        let it = page ? page.items[key] : null;
        if (!it && page && page.empty) it = { price: 0, qty: 0, at: page.at };
        if (it && now - it.at < SHOP_KEEP_MS) soon(it.at + SHOP_KEEP_MS);
        // The page in front of you stands against a read of Torn made less than a minute after it - and against
        // TornW3B's copy until TornW3B found the bazaar changed that long after it (its "checked" alone moves on
        // while its copy is still the old one).
        const newer = (from === 'w3b' && ch > 0 ? ch : at) > (it ? it.at : 0) + PAGE_STANDS_MS;
        if (it && !newer && now - it.at < SHOP_KEEP_MS) push(whoId, it.price, it.qty, it.at, 'page', 0);
        else if (units > 0) push(whoId, price, units, at, from, ch);
    };
    if (o.bazAt && now - o.bazAt < LISTINGS_KEEP_MS) {
        soon(o.bazAt + LISTINGS_KEEP_MS);
        for (const r of o.baz || []) {
            done.add(String(r.whoId));
            const shop = shopAt(r.whoId);
            // TornW3B's row is as old as TornW3B's own last look at that bazaar, not as new as our asking for its
            // list: Torn's own read wins whenever it is the newer of the two (until 1.2.2 a list asked for after
            // Torn's read brought a sold-out listing back, and a buy of yours with it).
            const rowAt = Math.min(enNum(r.at) || o.bazAt, o.bazAt);
            // ... and TornW3B's later check counts as newer only when it found the bazaar changed since Torn's read:
            // a check that found nothing new has nothing to say against what Torn itself showed.
            if (shop && (shop.at > rowAt || (r.ch > 0 && !(r.ch > shop.at)))) {
                const it = shop.items[key];
                // Torn says this bazaar no longer has it: sold out or taken down (unless its page showed it since).
                add(String(r.whoId), it ? it.price : 0, it ? it.qty : 0, shop.at, 'torn');
            } else {
                add(String(r.whoId), r.price, r.qty, rowAt, 'w3b', enNum(r.ch));
            }
        }
    }
    // Bazaars you read from Torn yourself that TornW3B's list no longer names (its row grew old, or forty cheaper
    // ones came): they are still there, as Torn last showed them - for as long as a row of TornW3B's would count.
    for (const whoId of Object.keys(S.shops)) {
        if (done.has(whoId) || whoId === String(S.self.id)) continue;
        const shop = shopAt(whoId);
        const fresh = shop && now - shop.at < LISTING_FRESH_MS;
        if (fresh) soon(shop.at + LISTING_FRESH_MS);
        const it = fresh ? shop.items[key] : null;
        if (!it) continue;
        done.add(whoId);
        add(whoId, it.price, it.qty, shop.at, 'torn');
    }
    // Bazaars TornW3B's list does not name, read from Torn by the server.
    for (const s of svIndex(S).get(key) || []) {
        if (done.has(s.whoId) || s.whoId === String(S.self.id)) continue;
        done.add(s.whoId);
        const shop = shopAt(s.whoId);
        const it = shop && shop.items[key];
        if (it) add(s.whoId, it.price, it.qty, shop.at, 'torn');
    }
    // Bazaars known from their own page alone.
    for (const whoId of Object.keys(S.pages || {})) {
        if (done.has(whoId) || whoId === String(S.self.id)) continue;
        add(whoId, 0, 0, 0, 'page');
    }
    if (o.imAt && now - o.imAt < MARKET_KEEP_MS) {
        soon(o.imAt + MARKET_KEEP_MS);
        const ok = o.imAt >= floor;
        if (ok) soon(o.imAt + COUNT_MS + 1);
        for (const l of o.im || []) if (l.price > 1 && l.qty > 0) out.push({ price: l.price, qty: l.qty, src: 'market', at: o.imAt, from: 'torn', ok });
    }
    return out;
}

/** A pile is sorted again after this long whatever happened: no row can stand longer than this through a change the layer was not told of. */
export const PILE_MAX_MS = 30000;

/**
 * The in-between layer: a piece's listings, cheapest first, sorted once and kept until an answer changes them
 * (enBump) or time does (a row too old to count). The rows are shared: nothing may write on them.
 * The owner, 2026-10-11: "we need some sort of intermediary state ... the one that does the hard filtering" - the
 * view's lists read from these through a shortlist (core/shortlist.js) and never sort the whole pile again.
 */
export function pileOf(S, id, now) {
    const key = String(id);
    const lay = S.lay || (S.lay = { all: 0, by: {}, piles: new Map() });
    const ver = lay.all + ':' + (lay.by[key] || 0);
    const had = lay.piles.get(key);
    if (had && had.ver === ver && now >= had.at && now < had.exp && now - had.at < PILE_MAX_MS) return had.rows;
    const ex = { at: Infinity };
    const rows = offersOf(S, id, now, ex).sort((a, b) => a.price - b.price);
    lay.piles.set(key, { ver, at: now, exp: ex.at, rows });
    lay.made = (lay.made || 0) + 1;
    return rows;
}

// ---- The points market, your money ----------------------------------------------------------------------------------

/** @returns false when the answer held no listing that could be read */
export function foldPoints(S, json, now) {
    const listings = parsePointsMarket(json);
    if (!listings.length) return false;
    const price = listPrice(listings, 'wall');
    const near = listings.slice(0, EN_LOTS_READ);
    S.points = {
        listings: listings.slice(0, 150),
        at: now,
        days: recordPrice(S.points.days, now, price.lowest),
        wallDays: recordPrice(S.points.wallDays, now, price.wall || price.lowest),
        lots: lotsRead(S.points.lots, near, now, price.wall || 0),
    };
    return true;
}

/** @returns false when the answer had none of the names known for points, cash and vault */
export function foldMoney(S, m, now) {
    if (!m || (m.points == null && m.onHand == null && m.vault == null)) return false;
    S.money = { points: m.points, onHand: m.onHand, vault: m.vault, at: now };
    return true;
}

// ---- Stock ---------------------------------------------------------------------------------------------------------

/**
 * Torn's inventory (api/torn.js fetchInventory's rows). The first read starts the count: what happened before it is
 * history, and the units held stand at what your newest buys of them cost (the rest at the market value).
 */
export function foldInventory(S, rows, now, tornAt = 0) {
    const inv = {};
    for (const r of mergeInventory(rows)) inv[String(r.id)] = r.qty;
    const mv = mvOf(S);
    const first = !(S.stock.invAt > 0);
    let stock = stockInventory(S.stock, inv, now, ENGINE_PIECES, mv, tornAt);
    if (first) {
        const pool = {};
        for (const id of ENGINE_PIECES) {
            const n = enWhole(stock.held[id]);
            if (!n) continue;
            let left = n;
            let cost = 0;
            for (let k = S.ledger.rows.length - 1; k >= 0 && left > 0; k--) {
                const r = S.ledger.rows[k];
                if (r.side !== 'buy' || String(r.itemId) !== id) continue;
                const take = Math.min(left, enWhole(r.qty));
                cost += take * enNum(r.each);
                left -= take;
            }
            pool[id] = { n, cost: cost + left * mv(id), est: left };
        }
        stock = { ...stock, pool, floor: now };
        // The history is in now. A set swapped before the count began was costed, as its log row was read, at the
        // market value of its pieces (your buys of them may not have been read yet): now it takes what your own buys
        // on record say a set cost you then.
        const buys = enBuysByPiece(S);
        const book = S.book.map((e) => {
            const set = e.kind === 'made' && e.src === 'log' && !e.twin && e.set ? setByKey(e.set) : null;
            const cost = set ? enSetCostAt(set, e.t, buys, mv) : 0;
            return cost > 0 && set.points > 0 ? { ...e, each: cost / set.points } : e;
        });
        if (book.some((e, k) => e !== S.book[k])) S.book = book;
    }
    S.stock = stock;
}

/** Your buys of each piece on record: { itemId: [{ t, qty, each }] }. */
function enBuysByPiece(S) {
    const by = {};
    for (const r of S.ledger.rows) {
        if (r.side !== 'buy' || !(enWhole(r.qty) > 0) || !(enNum(r.each) > 0)) continue;
        (by[String(r.itemId)] = by[String(r.itemId)] || []).push({ t: enNum(r.t), qty: enWhole(r.qty), each: enNum(r.each) });
    }
    return by;
}

/**
 * What a set cost you at a time in the history: each piece at the average of your buys of it up to then - or, with
 * none on record before then, of all your buys of it on record - and at its market value when you bought none.
 */
function enSetCostAt(set, t, buys, mv) {
    const avg = (rows) => { const n = rows.reduce((s, r) => s + r.qty, 0); return n ? rows.reduce((s, r) => s + r.qty * r.each, 0) / n : 0; };
    return set.pieces.reduce((s, p) => {
        const rows = buys[String(p.id)] || [];
        return s + (avg(rows.filter((r) => r.t <= t)) || avg(rows) || mv(p.id));
    }, 0);
}

/**
 * A buy you were seen making on a bazaar page: counted at once.
 * While your log is read it waits beside the count until the log has been read past it (the log has it then).
 * `noLog` (no Full key, so no log): it goes into the count itself, once, as a log row would - Torn's inventory
 * may be an hour behind, and adding it on top for hours would count it twice once the inventory has it.
 * @returns false when it was not taken (not a piece, nothing bought, or told twice)
 */
export function noteSeenBuy(S, buy, now, { noLog = false } = {}) {
    if (!buy || !EN_PIECE_SET.has(String(buy.id)) || !(enWhole(buy.qty) > 0)) return false;
    const row = { t: enNum(buy.t) || now, id: String(buy.id), qty: enWhole(buy.qty), whoId: buy.whoId ? String(buy.whoId) : '', price: enWhole(buy.price), v: EN_SEEN_V, ...(buy.im ? { im: true } : {}) };
    if (S.seen.some((b) => b.t === row.t && b.id === row.id && b.whoId === row.whoId && b.qty === row.qty)) return false;
    if (noLog && enCounting(S)) {
        S.stock = stockApply(S.stock, eventFromSeen(row), mvOf(S)).state;
        row.counted = true;
    } else if (!noLog) {
        // The log was read between the buy and the page's look: its row is in the count already.
        const claimed = new Set(S.seen.map((b) => b.logged).filter(Boolean));
        const r = S.ledger.rows.find((x) => x.side === 'buy' && !claimed.has(x.id) && enSameBuy(row, x, EN_SAME_NOW_MS) && enWhole(x.qty) === row.qty);
        if (r) row.logged = r.id;
    }
    S.seen = [...S.seen.filter((b) => now - b.t < 6 * EN_HOUR), row].slice(-200);
    enBump(S, [row.id]);
    return true;
}

/** Torn's log has a buy at once; a buy a page told of is judged when the log was read this far past it. */
export const SEEN_JUDGE_MS = EN_MIN;

/**
 * Torn's log is the judge of what a page saw (1.3.0). On 2026-10-11 ten of the 56 buys the page told of were not
 * buys at all (134 African Violets four times over): Torn's form had changed after its Buy and nothing was sold.
 * A buy seen on a page whose row is not in the log, though the log has been read a minute past it, is taken back:
 * `no` - out of the stock count, the run, the list and the seller's listing, everywhere at once. Before that it is
 * tied to its row where one is on record after all (a row read while the page's note was on its way).
 * Only with your log read (a Full key); a buy counted with no log to wait for (`counted`) is never judged.
 * @returns the buys taken back
 */
export function judgeSeen(S, now) {
    const until = enNum(S.log.until);
    if (!(until > 0)) return [];
    const open = new Set(S.seen.filter((b) => !b.counted && !b.logged && !b.no && b.t + SEEN_JUDGE_MS < until));
    if (!open.size) return [];
    const claimed = new Set(S.seen.map((b) => b.logged).filter(Boolean));
    const from = Math.min(...[...open].map((b) => b.t)) - EN_SAME_BUY_MS;
    const rows = S.ledger.rows.filter((r) => r.side === 'buy' && r.t >= from && (r.venue === 'bazaar' || r.venue === 'market'));
    const back = [];
    S.seen = S.seen.map((b) => {
        if (!open.has(b)) return b;
        let best = null;
        for (const r of rows) {
            if (claimed.has(r.id) || (r.venue === 'market') !== !!b.im || !enSameBuy(b, r, EN_SAME_BUY_MS)) continue;
            const same = enWhole(r.qty) === b.qty;
            if (!best || same > (enWhole(best.qty) === b.qty) || (same === (enWhole(best.qty) === b.qty) && Math.abs(b.t - r.t) < Math.abs(b.t - best.t))) best = r;
        }
        if (best) { claimed.add(best.id); return { ...b, logged: best.id }; }
        back.push(b);
        return { ...b, no: true, noAt: now };
    });
    enBump(S, back.map((b) => b.id));
    return back;
}

/**
 * A press of EXCHANGE on the museum page: the sets come off the count and their points go into the book at cost.
 * `noLog`: as for a buy seen on a page - with no log to confirm it, the count itself is moved, once.
 */
export function noteSwap(S, press, now, { noLog = false } = {}) {
    const set = press && setByKey(press.set);
    const sets = enWhole(press && press.sets);
    if (!set || !sets) return;
    const t = enNum(press.t) || now;
    const cost = enSetCost(S, set);
    const row = { t, set: set.key, sets };
    if (noLog && enCounting(S)) {
        S.stock = stockApply(S.stock, [{ key: 'seen-swap:' + t + ':' + set.key, t, swap: set.key, sets }], mvOf(S)).state;
        row.counted = true;
    } else if (!noLog) {
        // The log was read between the press and the page's telling of it: its row is in the count already.
        const claimed = new Set(S.swaps.map((p) => p.logged).filter(Boolean));
        const r = S.book.find((e) => e.kind === 'made' && e.src === 'log' && e.set === set.key && !claimed.has(e.id) && Math.abs(e.t - t) < EN_SAME_NOW_MS && e.points === sets * set.points && S.stock.done.includes(e.id));
        if (r) row.logged = r.id;
    }
    S.swaps = [...S.swaps.filter((p) => now - p.t < 6 * EN_HOUR), row].slice(-60);
    S.book = bookAdd(S.book, { id: 'page:' + t, t, kind: 'made', points: sets * set.points, each: cost > 0 ? cost / set.points : 0, set: set.key, src: 'page' }).slice(-EN_BOOK_KEPT);
}

/** A buy seen on a page and counted there is not counted again when the log brings the same buy later. */
const EN_SAME_BUY_MS = 5 * EN_MIN;
/** A buy told by the page after its log row was read: the row is its own only this close to it, with the same number. */
const EN_SAME_NOW_MS = 2 * EN_MIN;
const enSameBuy = (b, r, within) => b.id === String(r.itemId) && Math.abs(b.t - r.t) < within && (!b.whoId || !r.who || b.whoId === String(r.who));

/**
 * A buy seen on a page waits beside the count for its row in Torn's log. The moment that row is in, the row is the
 * buy: what the page saw of it is no longer added on top. (Until 1.2.2 it stayed until the log had been read a
 * minute past it - with the log asked 20 seconds after a buy and then every two minutes, the same buy stood in the
 * count twice for two minutes: "need 141", bought, "141 ahead".) The log's number stands where the page's differs.
 */
function enSeenInLog(S, rows) {
    let seen = S.seen;
    for (const r of rows) {
        if (!r || r.side !== 'buy') continue;
        let k = -1;
        seen.forEach((b, i) => {
            if (b.counted || b.logged || !enSameBuy(b, r, EN_SAME_BUY_MS)) return;
            const better = k < 0 || (b.qty === enWhole(r.qty)) > (seen[k].qty === enWhole(r.qty)) || ((b.qty === enWhole(r.qty)) === (seen[k].qty === enWhole(r.qty)) && Math.abs(b.t - r.t) < Math.abs(seen[k].t - r.t));
            if (better) k = i;
        });
        if (k >= 0) seen = seen.map((b, i) => (i === k ? { ...b, logged: r.id } : b));
    }
    S.seen = seen;
}
/**
 * A press of EXCHANGE seen on a page waits beside the count for its row in Torn's log, as a buy does. The moment
 * that row is in, the row is the exchange: what the page saw of it is no longer taken off on top. (Until 1.3.2 it
 * stayed until the log had been read a minute past the press. The owner, 2026-10-12, made 500 plushie and 500
 * flower sets and pressed Read: the log came inside that minute, every set came off twice, and the page showed 0
 * of every piece while he held 302 Jaguars.) The log's number stands where the page's differs.
 * @param made [{ entry, set }] exchanges this read of the log brought into the count
 */
function enSwapsInLog(S, made) {
    let list = S.swaps;
    for (const { entry, set } of made) {
        if (list.some((p) => p.logged === entry.id)) continue;
        const n = Math.round(entry.points / set.points);
        let k = -1;
        list.forEach((p, i) => {
            if (p.counted || p.logged || p.set !== set.key || Math.abs(p.t - entry.t) >= EN_SAME_BUY_MS) return;
            const better = k < 0 || (p.sets === n) > (list[k].sets === n) || ((p.sets === n) === (list[k].sets === n) && Math.abs(p.t - entry.t) < Math.abs(list[k].t - entry.t));
            if (better) k = i;
        });
        if (k >= 0) list = list.map((p, i) => (i === k ? { ...p, logged: entry.id } : p));
    }
    S.swaps = list;
}
function enNotCounted(S, events) {
    const used = new Set();
    return events.filter((e) => {
        if (!(e.d > 0)) return true;
        const k = S.seen.findIndex((b, i) => b.counted && !used.has(i) && b.id === String(e.id) && b.qty === e.d && Math.abs(b.t - e.t) < EN_SAME_BUY_MS);
        if (k < 0) return true;
        used.add(k);
        return false;
    });
}

// ---- Your log ------------------------------------------------------------------------------------------------------

/** The log types where money leaves your hand for somewhere safe, by their titles (no id is written here). */
export function outLogTypes(json) {
    const raw = json && (json.logtypes || json);
    const out = [];
    if (!raw || typeof raw !== 'object') return out;
    const rows = Array.isArray(raw) ? raw.map((r) => [r && r.id, r && r.title]) : Object.entries(raw);
    for (const [id, t] of rows) {
        const title = String((t && t.title) || t || '');
        if (id == null || !title) continue;
        if ((/\b(vault|bank)\b/i.test(title) && /\b(deposit|invest)/i.test(title)) || (/\btrade\b/i.test(title) && /\bmoney\b/i.test(title) && /\b(add|added|outgoing)\b/i.test(title))) out.push(Number(id));
    }
    return out;
}

const enCounting = (S) => S.stock.invAt > 0;
/** What a set costs you (the cost pool), or its pieces' market value while the pool has not seen them all. */
function enSetCost(S, set) {
    const own = poolSetCost(S.stock.pool, set);
    if (own > 0) return own;
    const mv = mvOf(S);
    return set.pieces.reduce((s, p) => s + mv(p.id), 0);
}

const EN_LEDGER_TYPES = [LOG_BAZAAR_BUY, LOG_MARKET_BUY, LOG_BAZAAR_SELL, LOG_MARKET_SELL];

/** Every log type the engine asks for: buys and sales of items, mugs, points made / sold / used, money put away. */
export function logTypesAsked(types) {
    return [...new Set([...EN_LEDGER_TYPES, LOG_MUGGED, ...(types.made || []), ...(types.sold || []), ...(types.used || []), ...(types.out || [])])];
}

/** Torn's log is asked for this many kinds in one request, at most. */
export const LOG_TYPES_AT_ONCE = 8;

/**
 * The same kinds, as the requests they are asked in: each sort by itself, and never more than LOG_TYPES_AT_ONCE.
 * On the owner's PC (2026-10-11, 1.1.0) one request naming all 18 kinds came back with no row at all for 14
 * days - with a working Full key and hundreds of bazaar buys that day - while Torn Trading, which names 8,
 * gets its rows. That the number was the cause is not proven; asked like this, the log says what each sort
 * brought (engine readLog).
 * @returns [{ name, ids }]
 */
export function logTypeGroups(types) {
    const sorts = [
        ['buys and sales', [...EN_LEDGER_TYPES, LOG_MUGGED]],
        ['points', [...(types.made || []), ...(types.sold || []), ...(types.used || [])]],
        ['money put away', types.out || []],
    ];
    const out = [];
    for (const [name, all] of sorts) {
        const ids = [...new Set(all)];
        for (let i = 0; i < ids.length; i += LOG_TYPES_AT_ONCE) out.push({ name, ids: ids.slice(i, i + LOG_TYPES_AT_ONCE) });
    }
    return out;
}

function enAddRows(S, rows) {
    const have = new Set(S.ledger.rows.map((r) => r.id));
    const fresh = rows.filter((r) => r && !have.has(r.id));
    if (!fresh.length) return [];
    const all = [...S.ledger.rows, ...fresh].sort((a, b) => a.t - b.t || String(a.id).localeCompare(String(b.id))).slice(-EN_ROWS_KEPT);
    S.ledger = { ...S.ledger, rows: all };
    // A buy of yours comes off its seller's listing (ownBuys).
    enBump(S, fresh.filter((r) => r.side === 'buy' && r.venue === 'bazaar').map((r) => r.itemId));
    return fresh;
}

const EN_DIRECT_KEPT = 400;
/**
 * Pieces that left as themselves - sold in your bazaar, on the Item Market or in a trade, or given away - booked
 * with what they had cost you (the pool's average then). Until 1.3.0 they left the pool and the money was nowhere.
 * @param rows the Ledger rows just added
 * @param outs stockApply's `out`
 */
function enAddDirect(S, rows, outs) {
    const by = new Map((rows || []).map((r) => ['row:' + r.id, r]));
    const add = [];
    for (const o of outs || []) {
        const r = by.get(o.key);
        if (!r || !(o.units > 0)) continue;
        const sold = r.side === 'sell';
        add.push({ id: r.id, t: r.t, itemId: String(r.itemId), qty: o.units, got: sold ? Math.round(o.units * enNum(r.each) - enNum(r.fee) * o.units / Math.max(1, enNum(r.qty))) : 0, cost: o.cost, venue: r.venue, give: !sold, est: Math.round(enNum(o.est) * 1000) / 1000 });
    }
    if (add.length) S.ledger = { ...S.ledger, direct: [...(S.ledger.direct || []), ...add].sort((a, b) => a.t - b.t).slice(-EN_DIRECT_KEPT) };
}

/**
 * A mug's verdict (did it take points money, and how much) is kept once it can no longer change: an hour old, the
 * log read past it, and every money row around it still on record. The rows it was judged by are let go later.
 * @param rows the view's ledger.mugs.rows
 * @returns true when a verdict was kept
 */
export function settleMugs(S, rows, now) {
    const from = S.outs.length >= EN_OUTS_KEPT ? enNum(S.outs[0].t) : 0;
    const by = new Map((rows || []).map((r) => [r.id, r]));
    let any = false;
    const mugs = S.ledger.mugs.map((m) => {
        const r = by.get(m.id);
        if (m.kept || !r || !(m.t < now - EN_HOUR) || !(S.log.until >= m.t) || m.t < from) return m;
        any = true;
        return { ...m, kept: { counted: enWhole(r.counted), onHand: enWhole(r.onHand), saleId: r.saleId || null, after: enNum(r.after) } };
    });
    if (any) S.ledger = { ...S.ledger, mugs };
    return any;
}

function enAddOuts(S, outs) {
    if (!outs.length) return;
    const have = new Set(S.outs.map((o) => o.id));
    const fresh = outs.filter((o) => o.amount > 0 && !have.has(o.id));
    if (fresh.length) S.outs = [...S.outs, ...fresh].sort((a, b) => a.t - b.t).slice(-EN_OUTS_KEPT);
}

const enAmount = (data) => {
    for (const k of ['deposited', 'money', 'amount', 'value', 'cost', 'total']) {
        const n = Number(data && data[k]);
        if (Number.isFinite(n) && n > 0) return n;
    }
    return 0;
};

/**
 * One page of your log (Torn's v2 rows, any order).
 * @param ctx { now, priceNow } - priceNow = the points price, for points used
 * @returns { unread: [{ type, title, keys }], newest (s), oldest (s), rows: how many were new to the books }
 */
export function foldLog(S, logRows, ctx) {
    const types = S.types;
    const out = { unread: [], newest: 0, oldest: 0, rows: 0 };
    const pieceRows = [];
    const outs = [];
    const mugs = [];
    const events = [];
    const swaps = [];
    let book = S.book;
    let madeRead = S.log.madeRead;
    for (const row of [...(logRows || [])].sort((a, b) => enNum(a && a.timestamp) - enNum(b && b.timestamp))) {
        if (!row || !row.details) continue;
        const ts = enNum(row.timestamp);
        if (ts) { out.newest = Math.max(out.newest, ts); out.oldest = out.oldest ? Math.min(out.oldest, ts) : ts; }
        const type = Number(row.details.id);
        if (EN_LEDGER_TYPES.includes(type)) {
            const rows = rowsFromLog(row);
            // Money that left your hand: whatever you bought, a set piece or not.
            for (const r of rows) if (r.side === 'buy') outs.push({ id: 'buy:' + r.id, t: r.t, amount: Math.round(r.qty * r.each) });
            pieceRows.push(...rows.filter((r) => isSetItem(r.itemId)));
            continue;
        }
        if (type === LOG_MUGGED) { const m = mugFromLog(row); if (m) mugs.push(m); continue; }
        if ((types.out || []).includes(type)) {
            const amount = enAmount(row.data);
            if (amount) outs.push({ id: 'log:' + row.id, t: ts * 1000, amount });
            else out.unread.push({ type, title: String(row.details.title || ''), keys: Object.keys(row.data || {}).slice(0, 12) });
            continue;
        }
        const entry = entryFromLog(row.id, row, types, { priceNow: ctx.priceNow });
        if (!entry) {
            if ([...types.made, ...types.sold, ...types.used].includes(type)) out.unread.push({ type, title: String(row.details.title || ''), keys: Object.keys(row.data || {}).slice(0, 12) });
            continue;
        }
        if (entry.kind !== 'made') { book = bookAdd(book, entry); continue; }
        madeRead = true;
        const set = entry.set ? setByKey(entry.set) : null;
        if (!set) { out.unread.push({ type, title: String(row.details.title || ''), keys: Object.keys(row.data || {}).slice(0, 12) }); continue; }
        swaps.push({ entry, set });
        events.push({ key: entry.id, t: entry.t, swap: set.key, sets: Math.round(entry.points / set.points) });
    }
    const fresh = enAddRows(S, pieceRows);
    out.rows = fresh.length;
    if (enCounting(S)) enSeenInLog(S, fresh);
    enAddOuts(S, outs);
    if (mugs.length) {
        const have = new Set(S.ledger.mugs.map((m) => m.id));
        const add = mugs.filter((m) => !have.has(m.id)).map((m) => ({ id: m.id, t: m.t, who: m.who, taken: enWhole(m.amount) }));
        if (add.length) S.ledger = { ...S.ledger, mugs: [...S.ledger.mugs, ...add].sort((a, b) => a.t - b.t).slice(-300) };
    }
    // Buys, sales and swaps move the stock count and the cost pool; a swap's points take what its pieces cost.
    // Not before Torn's inventory has been read once: until then the log is history, and the count starts there.
    const applied = enCounting(S) ? stockApply(S.stock, [...enNotCounted(S, eventsFromRows(fresh, EN_PIECE_SET)), ...events], mvOf(S)) : { state: S.stock, made: [], out: [] };
    S.stock = applied.state;
    // An exchange this read brought into the count is the press the page saw of it, not a second one.
    if (applied.made.length) enSwapsInLog(S, swaps.filter((x) => applied.made.some((m) => m.key === x.entry.id)));
    enAddDirect(S, fresh, applied.out);
    const costBy = new Map(applied.made.map((m) => [m.key, m]));
    for (const { entry, set } of swaps) {
        const made = costBy.get(entry.id);
        // A swap from before the count began: its cost is what a set of it costs you now, or its market value.
        const each = made && made.points ? made.cost / made.points : enSetCost(S, set) / set.points;
        book = bookAdd(book, { ...entry, each: each > 0 ? each : 0, ...(made && made.points ? { est: made.est } : {}) });
    }
    const until = out.newest ? Math.max(S.log.until, out.newest * 1000) : S.log.until;
    book = bookSettle(book, madeRead ? Math.max(until, ctx.now - EN_MIN) : 0);
    if (book !== S.book) S.book = book.slice(-EN_BOOK_KEPT);
    S.log = { ...S.log, madeRead };
    return out;
}

/** Torn's list of log types, kept for a week (core/points.js pointsLogTypes plus the money-out types). */
export function foldLogTypes(S, pointsTypes, outTypes, now) {
    S.types = { at: now, made: pointsTypes.made || [], sold: pointsTypes.sold || [], used: pointsTypes.used || [], out: outTypes || [], titles: pointsTypes.titles || {} };
}

// ---- Trades --------------------------------------------------------------------------------------------------------

/**
 * Your open trades, as Torn lists them.
 * @returns { fresh: [trade] new since the last look, closed: [trade] open before and not now, read: [id] to read in full }
 */
export function foldTradeList(S, trades, now) {
    const list = parseTradeList({ trades }, S.self.id);
    for (const t of list) enName(S, t.whoId, t.who);
    const { seen, fresh } = tradesSeen(S.trades.seen, list);
    const closed = tradesClosed(S.trades.open, list);
    const by = new Map(S.trades.open.map((t) => [t.id, t]));
    const full = {};
    const open = [];
    for (const t of list) {
        const had = by.get(t.id);
        open.push(had ? { ...had, modified: t.modified, expires: t.expires } : { ...t, theirs: [], theirMoney: 0, mine: [], myMoney: 0, other: 0 });
        if (had && S.trades.full[t.id] != null) full[t.id] = S.trades.full[t.id];
    }
    // Every open trade is read in full again each round, the one read longest ago first. Torn's `modified_at`
    // does not move when items are put in: the owner's trade of 2026-10-11 was read once, seconds after it was
    // opened and still empty, and - its time never changing - not again for as long as it was open.
    const read = list.map((t) => t.id).sort((a, b) => (full[a] || 0) - (full[b] || 0));
    S.trades = { ...S.trades, open, at: now, seen, full };
    return { fresh, closed, read };
}

/** One open trade read in full (Torn's `trade` object). `full` keeps when: the list above reads the oldest first. */
export function foldTradeOpen(S, trade, now = 0) {
    const t = parseTrade({ trade }, S.self.id);
    if (!t) return null;
    if (!S.trades.open.some((x) => x.id === t.id)) return null;
    S.trades = { ...S.trades, open: S.trades.open.map((x) => (x.id === t.id ? t : x)), full: { ...S.trades.full, [t.id]: now || t.modified || 1 } };
    return t;
}

/** Trades with a piece of your sets on their side: the ones the Archive shows and tells you of. */
export const tradeHasPieces = (t) => !!t && (t.theirs || []).some((x) => isSetItem(x.id));

/** A finished trade read in full: its buys go to the books, the trade to the finished list. */
export function foldTradeFinished(S, trade, now) {
    if (!trade || trade.id == null) return false;
    const id = String(trade.id);
    if (S.ledger.tradeIds.includes(id)) return false;
    S.ledger = { ...S.ledger, tradeIds: [...S.ledger.tradeIds, id].slice(-600) };
    const mv = mvOf(S);
    const rows = enTradeRows(S, trade);
    const t = parseTrade({ trade }, S.self.id);
    if (!t) return false;
    const done = enNum(trade.completed_at || trade.timestamp || trade.modified_at) * 1000 || now;
    if (t.myMoney > 0) enAddOuts(S, [{ id: 'trade:' + id, t: done, amount: t.myMoney }]);
    const fresh = enAddRows(S, rows);
    if (enCounting(S)) {
        const applied = stockApply(S.stock, eventsFromRows(fresh, EN_PIECE_SET), mv);
        S.stock = applied.state;
        enAddDirect(S, fresh, applied.out);
    }
    const got = t.theirs.filter((x) => isSetItem(x.id));
    if (got.length && t.myMoney > 0) {
        enName(S, t.whoId, t.who);
        // What of your money went to the pieces: all of it, unless the trade held other things too.
        const paid = Math.round(rows.filter((r) => r.side === 'buy').reduce((s, r) => s + r.qty * r.each, 0));
        const entry = { id, who: t.who, whoId: t.whoId, t: done, units: got.reduce((s, x) => s + x.qty, 0), paid, mv: got.reduce((s, x) => s + x.qty * mv(x.id), 0), rows: got.map((x) => ({ id: x.id, qty: x.qty })) };
        S.trades = { ...S.trades, finished: [entry, ...S.trades.finished.filter((f) => f.id !== id)].sort((a, b) => b.t - a.t).slice(0, EN_FINISHED_KEPT) };
    }
    return true;
}

/**
 * A trade's rows of set pieces. The money is shared over everything in the trade by Torn's market value. Until
 * 1.3.0 anything that was not a set piece took none of it: a trade for other things with one flower in it priced
 * that flower with the whole trade (the owner's trade of 2026-10-03: one Ceibo Flower at $279,918,109).
 */
function enTradeRows(S, trade) {
    const mv = mvOf(S);
    return rowsFromTrade(trade, S.self.id, (itemId) => Math.max(1, mv(itemId))).filter((r) => isSetItem(r.itemId));
}

/** A trade row prices a piece at over this many times its market value: its trade is read again (enTradeRows). */
export const TRADE_ODD_TIMES = 3;

/** The trades on record that priced a piece far over its market value: their ids, the newest first. */
export function tradesOdd(S) {
    const mv = mvOf(S);
    const ids = new Set();
    for (let k = S.ledger.rows.length - 1; k >= 0; k--) {
        const r = S.ledger.rows[k];
        if (r.venue !== 'trade' || r.side !== 'buy' || r.fixed) continue;
        const v = mv(r.itemId);
        if (v > 0 && enNum(r.each) > v * TRADE_ODD_TIMES) ids.add(String(r.id).split(':')[1]);
    }
    return [...ids];
}

/**
 * A finished trade read again: its rows on record take the price worked out now. Nothing is added and the count
 * is not moved - only what a unit is said to have cost. `fixed` marks a row looked at, right or not.
 * @returns how many rows changed their price
 */
export function foldTradeReprice(S, tradeId, trade) {
    const by = new Map((trade ? enTradeRows(S, trade) : []).map((r) => [r.id, r]));
    const head = 'trade:' + tradeId + ':';
    let n = 0;
    const rows = S.ledger.rows.map((r) => {
        if (!String(r.id).startsWith(head)) return r;
        const now = by.get(r.id);
        if (now && Math.round(now.each) !== Math.round(r.each)) n += 1;
        return { ...r, ...(now ? { each: now.each } : {}), fixed: true };
    });
    S.ledger = { ...S.ledger, rows };
    if (n) {
        const paid = Math.round(rows.filter((r) => String(r.id).startsWith(head) && r.side === 'buy').reduce((s, r) => s + r.qty * r.each, 0));
        S.trades = { ...S.trades, finished: S.trades.finished.map((f) => (f.id === String(tradeId) ? { ...f, paid } : f)) };
    }
    return n;
}

// ---- Your thread, your TornW3B list --------------------------------------------------------------------------------

/** Your own forum threads (v2 user/forumthreads): the newest whose title reads as a buying thread for sets. */
export function foldThreads(S, json, now) {
    const rows = (json && (json.forumThreads || json.forumthreads || json.threads)) || [];
    const mine = (Array.isArray(rows) ? rows : Object.values(rows)).filter((t) => t && t.title && isBuyingTitle(t.title));
    mine.sort((a, b) => enNum(b.last_post_time ?? b.first_post_time) - enNum(a.last_post_time ?? a.first_post_time));
    S.thread = mine.length ? { id: mine[0].id, title: String(mine[0].title), at: now, forum: mine[0].forum_id ?? null } : null;
}

/** The thread's title as read on its own page: newer than the API's. */
export function noteThread(S, thread, now) {
    if (!thread || !thread.title || !isBuyingTitle(thread.title)) return;
    S.thread = { ...(S.thread || {}), id: thread.id ?? (S.thread && S.thread.id) ?? null, title: String(thread.title), at: now };
}

export function foldOwnList(S, json, now) {
    const list = parseOwnList(json);
    S.w3b = { ...S.w3b, list: [...list], listAt: now, error: '' };
}

export function foldReceipt(S, tradeId, receipt, now) {
    const rest = S.w3b.receipts.filter(([id]) => id !== String(tradeId));
    // `rows`: the pieces it was made for; `tid`: the trade number TornW3B has it under (the one it was made with).
    S.w3b = { ...S.w3b, receipts: [...rest, [String(tradeId), { id: receipt.id ?? null, tid: String(tradeId), total: enWhole(receipt.total), url: receipt.url || '', at: now, rows: receipt.rows || [] }]].slice(-300), lastReceiptAt: Math.max(S.w3b.lastReceiptAt, now) };
}

// ---- What is kept by day -------------------------------------------------------------------------------------------

/** One look at the view into the day's lines: each piece's cheapest, what a set pays, your money's share in sets. */
export function recordDay(S, view, now) {
    const day = enDay(now);
    const low = { ...S.hist.low };
    for (const p of view.pieces || []) {
        // The cheapest anywhere, not only where you buy: the record is of the price.
        const lo = p.lowAll || p.low;
        // $1 or less is a locked listing, never a price.
        if (!lo || !(lo.price > 1)) continue;
        const list = (low[p.id] || []).filter((d) => d.day !== day);
        const cur = (low[p.id] || []).find((d) => d.day === day);
        low[p.id] = [...list, { day, low: cur ? Math.min(cur.low, lo.price) : lo.price }].slice(-14);
    }
    let pays = S.hist.pays;
    const paid = {};
    for (const s of view.sets || []) if (s.pays != null) paid[s.key] = s.pays;
    if (Object.keys(paid).length) pays = [...pays.filter((d) => d.day !== day), { ...(pays.find((d) => d.day === day) || {}), day, ...paid }].slice(-40);
    let share = S.hist.share;
    if (view.share && view.share.total > 0) share = [...share.filter((d) => d.day !== day), { day, share: Math.round(view.share.share * 10) / 10 }].slice(-40);
    S.hist = { low, pays, share };
}

// ---- The view's input ----------------------------------------------------------------------------------------------

/** Everything core/view.js's archiveView() takes, from the state. */
export function engineInput(S, settings, now, { logRead = false } = {}) {
    const mv = mvOf(S);
    const itemName = nameOf(S);
    const full = S.trades.full || {};
    return {
        now, settings,
        held: stockHeld(S.stock, S.seen, S.swaps, S.log.until),
        stockAt: S.stock.invAt || 0,
        // How old Torn's own count is, and whether your log carries what happened since.
        stock: { ...stockAge(S.stock), log: !!logRead },
        mv,
        // The in-between layer: every listing of a piece, cheapest first, sorted only when an answer moved it.
        // The rows are shared with the layer: the view reads them and never writes on one.
        offers: (id) => pileOf(S, id, now),
        // Buys a page told of that Torn's log does not have (judgeSeen), for a few minutes: said once on the screen.
        back: S.seen.filter((b) => b.no && now - enNum(b.noAt) < 10 * EN_MIN).map((b) => ({ id: b.id, qty: b.qty, whoId: b.whoId || '', im: !!b.im, t: b.t })),
        direct: S.ledger.direct || [],
        priced: (id) => { const o = S.offers[String(id)]; return !!(o && (o.imAt || o.bazAt)) || svIndex(S).has(String(id)); },
        pricesAt: Math.max(S.summary.at || 0, ...Object.values(S.offers).map((o) => Math.max(o.bazAt || 0, o.imAt || 0)), 0),
        topBid: (id) => { const b = S.bids[String(id)]; const v = mv(id); return b && b.price > 0 && v > 0 ? { pct: Math.round(b.price / v * 1000) / 10, name: b.name, price: b.price, at: b.at } : null; },
        // What you pay your sellers, fixed for the hour (core/sellrate.js): null while nothing is fixed.
        rate: (S.rate && S.rate.table) || null,
        listings: S.points.listings, pointsAt: S.points.at, days: S.points.days, wallDays: S.points.wallDays,
        // Your own lots: the points sales in Torn's log this week. Torn does not say when a lot was listed: no wait.
        lots: S.points.lots, mineLots: (S.book || []).filter((e) => e.kind === 'sold' && now - enNum(e.t) < 7 * 24 * 60 * EN_MIN).map((e) => ({ points: e.points, wait: null })),
        pool: S.stock.pool, book: S.book,
        mugs: S.ledger.mugs.map((m) => ({ id: m.id, t: m.t, by: (m.who && S.names[m.who]) || '', taken: m.taken, ...(m.kept ? { kept: m.kept } : {}) })),
        outs: S.outs,
        // Money rows are kept EN_OUTS_KEPT deep: once that many are held, the oldest is where the record begins.
        outsFrom: S.outs.length >= EN_OUTS_KEPT ? enNum(S.outs[0].t) : 0,
        money: { points: S.money.points, onHand: S.money.onHand, vault: S.money.vault },
        // Only trades read in full, with a piece of your sets on their side.
        trades: S.trades.open.filter((t) => full[t.id] != null && tradeHasPieces(t)).map((t) => ({ ...t, readAt: enNum(full[t.id]) })),
        finished: S.trades.finished,
        rows: S.ledger.rows,
        cart: S.cart, run: S.run, hotSince: S.hot,
        kept: settings.targetMode !== 'number' && S.cart.length && S.plan && S.plan.targets ? S.plan.targets : null,
        thread: S.thread,
        posted: S.posted,
        w3b: { list: S.w3b.list ? new Map(S.w3b.list) : null, listAt: S.w3b.listAt, receipts: new Map(S.w3b.receipts), lastReceiptAt: S.w3b.lastReceiptAt, error: S.w3b.error, receiptsError: S.w3b.receiptsError || '', tried: S.w3b.tried || {} },
        hist: S.hist,
        names: (id) => S.names[String(id)] || '',
        itemName,
        me: S.self.id,
    };
}

/** The item a set piece belongs to, for callers outside this file. */
export const pieceSet = (id) => setOfItem(id);
