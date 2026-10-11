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
export const ENGINE_PARTS = ['self', 'items', 'stock', 'seen', 'swaps', 'offers', 'summary', 'shops', 'bids', 'points', 'money', 'book', 'types', 'log', 'ledger', 'outs', 'trades', 'cart', 'plan', 'run', 'hot', 'thread', 'w3b', 'hist', 'names', 'server'];

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
        bids: {},
        points: { listings: [], at: 0, days: [], wallDays: [], lots: { ...LOTS_EMPTY } },
        money: { points: null, onHand: null, vault: null, at: 0 },
        book: [],
        types: { at: 0, made: [], sold: [], used: [], out: [], titles: {} },
        log: { from: 0, until: 0, at: 0, backfilled: false, madeRead: false },
        ledger: { rows: [], mugs: [], tradeIds: [], tradesFrom: 0, tradesAt: 0, tradesBackfilled: false },
        outs: [],
        trades: { open: [], at: 0, seen: null, finished: [], full: {}, told: null },
        cart: [],
        // How many sets the list on hand was made for ("from my cash"): kept while the list is, see engine planKeep.
        plan: { targets: null, at: 0, key: '' },
        run: { ...RUN_IDLE },
        hot: {},
        thread: null,
        w3b: { list: null, listAt: 0, receipts: [], receiptsAt: 0, lastReceiptAt: 0, error: '', receiptsError: '', tried: {} },
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
    const keys = Object.keys(S.names);
    if (keys.length >= EN_NAMES_KEPT) { const next = {}; for (const k of keys.slice(-Math.floor(EN_NAMES_KEPT / 2))) next[k] = S.names[k]; S.names = next; }
    S.names = { ...S.names, [id]: String(name) };
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
        .filter((r) => r.sellerId !== String(S.self.id) && !(r.dataAt && now - r.dataAt > LISTING_FRESH_MS))
        .slice(0, 40);
    for (const r of rows) enName(S, r.sellerId, r.sellerName);
    const prev = S.offers[id] || {};
    S.offers = { ...S.offers, [id]: { ...prev, baz: rows.map((r) => ({ price: r.price, qty: r.qty, whoId: r.sellerId, at: r.dataAt || now })), bazAt: now, bazLow: enWhole(S.summary.low[id]) } };
}

/** One piece's Item Market listings (api/torn.js fetchItemMarket's `listings`). */
export function foldMarket(S, id, listings, now) {
    const prev = S.offers[id] || {};
    S.offers = { ...S.offers, [id]: { ...prev, im: normalizeItemMarketRows(listings).slice(0, 20), imAt: now } };
}

/**
 * One player's bazaar as Torn itself has it (v2 user?selections=bazaar&id=): fresher than any list of listings.
 * @returns false when the answer has no bazaar in it (nothing is changed)
 */
export function foldShop(S, whoId, json, now) {
    const rows = json && json.bazaar;
    if (!Array.isArray(rows)) return false;
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
    serverTake(shops, { ...answer, reads }, EN_PIECE_SET, (id) => known.has(id), got);
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

/**
 * A piece's listings as the view takes them: its bazaars (Torn's own read of a bazaar, yours or the server's, wins
 * when newer than TornW3B's list), the bazaars only the server knows of, and the Item Market.
 */
export function offersOf(S, id, now) {
    const key = String(id);
    const o = S.offers[key] || {};
    const out = [];
    const done = new Set();
    // `at`: when the bazaar was last looked at, and `from` by whom - 'torn' (Torn itself, by you or the server) or
    // 'w3b' (TornW3B's copy). The screen says both: a row is never shown as newer than it is.
    const add = (whoId, price, units, at, from) => {
        let qty = units;
        // What you were seen buying there since comes off, until the next read shows the bazaar as it is.
        for (const b of S.seen) if (String(b.id) === key && String(b.whoId || '') === String(whoId) && b.t > at) qty -= enWhole(b.qty);
        if (qty > 0) out.push({ price, qty, src: 'bazaar', who: S.names[whoId] || null, whoId, at, from });
    };
    if (o.bazAt && now - o.bazAt < LISTINGS_KEEP_MS) {
        for (const r of o.baz || []) {
            done.add(String(r.whoId));
            const shop = shopNow(S, r.whoId, now);
            // TornW3B's row is as old as TornW3B's own last look at that bazaar, not as new as our asking for its
            // list: Torn's own read wins whenever it is the newer of the two (until 1.2.2 a list asked for after
            // Torn's read brought a sold-out listing back, and a buy of yours with it).
            const rowAt = Math.min(enNum(r.at) || o.bazAt, o.bazAt);
            if (shop && shop.at > rowAt) {
                const it = shop.items[key];
                // Torn says this bazaar no longer has it: sold out or taken down.
                if (it) add(r.whoId, it.price, it.qty, shop.at, 'torn');
            } else {
                add(r.whoId, r.price, r.qty, rowAt, 'w3b');
            }
        }
    }
    // Bazaars you read from Torn yourself that TornW3B's list no longer names (its row grew old, or forty cheaper
    // ones came): they are still there, as Torn last showed them - for as long as a row of TornW3B's would count.
    for (const whoId of Object.keys(S.shops)) {
        if (done.has(whoId) || whoId === String(S.self.id)) continue;
        const shop = shopNow(S, whoId, now);
        const it = shop && now - shop.at < LISTING_FRESH_MS ? shop.items[key] : null;
        if (!it) continue;
        done.add(whoId);
        add(whoId, it.price, it.qty, shop.at, 'torn');
    }
    // Bazaars TornW3B's list does not name, read from Torn by the server.
    for (const s of svIndex(S).get(key) || []) {
        if (done.has(s.whoId) || s.whoId === String(S.self.id)) continue;
        done.add(s.whoId);
        const shop = shopNow(S, s.whoId, now);
        const it = shop && shop.items[key];
        if (it) add(s.whoId, it.price, it.qty, shop.at, 'torn');
    }
    if (o.imAt && now - o.imAt < MARKET_KEEP_MS) for (const l of o.im || []) out.push({ price: l.price, qty: l.qty, src: 'market', at: o.imAt, from: 'torn' });
    return out;
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
    }
    S.stock = stock;
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
    return true;
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
    return fresh;
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
    const applied = enCounting(S) ? stockApply(S.stock, [...enNotCounted(S, eventsFromRows(fresh, EN_PIECE_SET)), ...events], mvOf(S)) : { state: S.stock, made: [] };
    S.stock = applied.state;
    const costBy = new Map(applied.made.map((m) => [m.key, m]));
    for (const { entry, set } of swaps) {
        const made = costBy.get(entry.id);
        // A swap from before the count began: its cost is what a set of it costs you now, or its market value.
        const each = made && made.points ? made.cost / made.points : enSetCost(S, set) / set.points;
        book = bookAdd(book, { ...entry, each: each > 0 ? each : 0 });
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
    // The money you gave is for the set pieces: anything else in the trade takes none of it.
    const rows = rowsFromTrade(trade, S.self.id, (itemId) => (isSetItem(itemId) ? Math.max(1, mv(itemId)) : 0)).filter((r) => isSetItem(r.itemId));
    const t = parseTrade({ trade }, S.self.id);
    if (!t) return false;
    const done = enNum(trade.completed_at || trade.timestamp || trade.modified_at) * 1000 || now;
    if (t.myMoney > 0) enAddOuts(S, [{ id: 'trade:' + id, t: done, amount: t.myMoney }]);
    const fresh = enAddRows(S, rows);
    if (enCounting(S)) S.stock = stockApply(S.stock, eventsFromRows(fresh, EN_PIECE_SET), mv).state;
    const got = t.theirs.filter((x) => isSetItem(x.id));
    if (got.length && t.myMoney > 0) {
        enName(S, t.whoId, t.who);
        const entry = { id, who: t.who, whoId: t.whoId, t: done, units: got.reduce((s, x) => s + x.qty, 0), paid: t.myMoney, mv: got.reduce((s, x) => s + x.qty * mv(x.id), 0), rows: got.map((x) => ({ id: x.id, qty: x.qty })) };
        S.trades = { ...S.trades, finished: [entry, ...S.trades.finished.filter((f) => f.id !== id)].sort((a, b) => b.t - a.t).slice(0, EN_FINISHED_KEPT) };
    }
    return true;
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
    S.w3b = { ...S.w3b, receipts: [...rest, [String(tradeId), { id: receipt.id ?? null, total: enWhole(receipt.total), url: receipt.url || '', at: now }]].slice(-300), lastReceiptAt: Math.max(S.w3b.lastReceiptAt, now) };
}

// ---- What is kept by day -------------------------------------------------------------------------------------------

/** One look at the view into the day's lines: each piece's cheapest, what a set pays, your money's share in sets. */
export function recordDay(S, view, now) {
    const day = enDay(now);
    const low = { ...S.hist.low };
    for (const p of view.pieces || []) {
        if (!p.low) continue;
        const list = (low[p.id] || []).filter((d) => d.day !== day);
        const cur = (low[p.id] || []).find((d) => d.day === day);
        low[p.id] = [...list, { day, low: cur ? Math.min(cur.low, p.low.price) : p.low.price }].slice(-14);
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
        offers: (id) => offersOf(S, id, now),
        priced: (id) => { const o = S.offers[String(id)]; return !!(o && (o.imAt || o.bazAt)) || svIndex(S).has(String(id)); },
        pricesAt: Math.max(S.summary.at || 0, ...Object.values(S.offers).map((o) => Math.max(o.bazAt || 0, o.imAt || 0)), 0),
        topBid: (id) => { const b = S.bids[String(id)]; const v = mv(id); return b && b.price > 0 && v > 0 ? { pct: Math.round(b.price / v * 1000) / 10, name: b.name } : null; },
        listings: S.points.listings, pointsAt: S.points.at, days: S.points.days, wallDays: S.points.wallDays,
        lots: S.points.lots, mineLots: [],
        pool: S.stock.pool, book: S.book,
        mugs: S.ledger.mugs.map((m) => ({ id: m.id, t: m.t, by: (m.who && S.names[m.who]) || '', taken: m.taken })),
        outs: S.outs,
        money: { points: S.money.points, onHand: S.money.onHand, vault: S.money.vault },
        // Only trades read in full, with a piece of your sets on their side.
        trades: S.trades.open.filter((t) => full[t.id] != null && tradeHasPieces(t)),
        finished: S.trades.finished,
        rows: S.ledger.rows,
        cart: S.cart, run: S.run, hotSince: S.hot,
        kept: settings.targetMode !== 'number' && S.cart.length && S.plan && S.plan.targets ? S.plan.targets : null,
        thread: S.thread,
        w3b: { list: S.w3b.list ? new Map(S.w3b.list) : null, listAt: S.w3b.listAt, receipts: new Map(S.w3b.receipts), lastReceiptAt: S.w3b.lastReceiptAt, error: S.w3b.error, receiptsError: S.w3b.receiptsError || '' },
        hist: S.hist,
        names: (id) => S.names[String(id)] || '',
        itemName,
        me: S.self.id,
    };
}

/** The item a set piece belongs to, for callers outside this file. */
export const pieceSet = (id) => setOfItem(id);
