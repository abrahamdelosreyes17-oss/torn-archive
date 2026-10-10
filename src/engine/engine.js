// The engine: asks Torn and TornW3B for what is due, folds each answer into the state (state.js), keeps the shopping
// list and the run, and answers the hub's buttons. One engine runs, in the Archive's own tab; Torn's pages only
// show what it worked out. Everything outside (keys, storage, the clock, the clients) is handed in, so the whole
// loop runs in a test on stand-ins. Nothing here presses, buys, posts or sends anything on Torn.

import {
    engineLoad, ENGINE_PARTS, ENGINE_PIECES, BACKFILL_MS, foldItems, foldSummary, foldListings, foldMarket, foldShop, foldBids, foldPoints, foldMoney,
    foldInventory, foldLog, foldLogTypes, outLogTypes, logTypesAsked, foldTradeList, foldTradeOpen, foldTradeFinished, tradeHasPieces, foldThreads,
    foldOwnList, foldReceipt, recordDay, engineInput, offersOf, noteSeenBuy, noteSwap, noteThread, mvOf, foldServer, serverEmpty,
} from './state.js';
import { serverShop, serverListReadAt, serverMarketIn, SERVER_QUIET_MS, SERVER_BOUGHT_MS, SERVER_SYNC_MS } from '../core/server.js';
import { archiveView, viewPiece, setsTraded, ALL_PIECE_IDS } from '../core/view.js';
import { fillPlan, toggleLine, dropLine, refreshList, stopsOf, runStart, runNext, runTook, runAt, RUN_IDLE, placeOf, lineKey, listAfterRun, IM_PLACE } from '../core/shopping.js';
import { hotSince } from '../core/verdict.js';
import { pointsLogTypes } from '../core/points.js';
import { desiredList, listDiff, listMatches, putBody, receiptBody, readReceipt, receiptsByTrade } from '../core/tw3b-list.js';
import { tradeNotice } from '../core/trades.js';
import { fetchItems, fetchItemMarket, fetchInventory, fetchPointsMarket, fetchMoney, fetchLogTypes } from '../api/torn.js';
import { fetchLedgerKeyInfo, isFullKey, fetchLogPage, fetchTradesPage, fetchTradesOpen, fetchTrade } from '../api/ledger.js';
import { fetchW3bSummary, fetchW3bListings, fetchW3bItemTraders } from '../api/w3b.js';
import { KEY_DEAD_CODES } from '../api/client.js';

const EG_MIN = 60000;
const EG_HOUR = 3600000;
const EG_DAY = 86400000;

/** How often each thing is read. The pieces' prices follow the setting (1, 2, 5 or 10 minutes). */
export const READ_EVERY = Object.freeze({
    self: 6 * EG_HOUR, items: EG_HOUR, types: 7 * EG_DAY, log: 2 * EG_MIN, finished: 5 * EG_MIN, inventory: EG_HOUR,
    money: EG_MIN, points: EG_MIN, trades: EG_MIN, thread: 10 * EG_MIN, ownList: 10 * EG_MIN, receipts: 30 * EG_MIN, bids: 6 * EG_HOUR,
});
/** A read that failed is tried again after this long. */
export const RETRY_MS = EG_MIN;
/** A piece you do not need is priced this many times less often than one you do. */
export const IDLE_TIMES = 10;
/** TornW3B's full listing of an item is scarce (1,000 a day): never more than this many an hour, across all pieces. */
export const LISTINGS_PER_HOUR = 38;
/** A piece's listing is read again after this long even when its cheapest price has not moved. */
export const LISTING_STALE_MS = 20 * EG_MIN;
/** How many reads of one kind may be on their way at once. */
const EG_FLIGHT = { market: 3, shops: 2, listings: 1, bids: 1 };
/** TornW3B refuses a burst: its reads of one kind are started this far apart, however many are due. */
const EG_GAP_MS = { listings: 7000, bids: 5000 };
/** With no history to wait for after this long, the count starts from Torn's inventory anyway. */
const EG_HISTORY_WAIT_MS = 3 * EG_MIN;
/** Log pages read in one go, and finished trades read in full in one go. */
const EG_LOG_PAGES = 5;
const EG_TRADES_FULL = 8;
/** Bazaars confirmed with Torn itself each round: the stops of your list and the cheapest places first. */
const EG_SHOPS = 12;
const EG_SYNC_GAP_MS = 2 * EG_MIN;

const egMsg = (error) => String((error && error.message) || error || '');
const egLocal = (error) => !!(error && (error.local || error.takingTurns));

/**
 * @param env {
 *   now()                          the clock
 *   load(part), save(part, value)  storage, one value per part of the state (and 'w3bHour', 'keyState')
 *   settings()                     core/settings.js archiveSettings()
 *   torn, full, w3b, own           the clients (api/client.js, api/ledger.js, api/w3b.js, api/tw3b-own.js)
 *   hasKey(kind)                   'limited' | 'full' | 'w3b'
 *   paused()                       true: nothing is asked (main.js never pauses; Torn Trading only changes the limits)
 *   say(kind, what, detail)        one line for the problem log
 *   changed()                      something the screen shows has changed
 *   notify(notice)                 a new trade: { title, body, tradeId }
 *   kick()                         (optional) a read came back: step again now, not at the next tick
 * }
 */
export function makeEngine(env) {
    const stored = {};
    for (const part of ENGINE_PARTS) stored[part] = env.load(part);
    const S = engineLoad(stored);
    const dirty = new Set();
    const due = {};
    const busy = {};
    const said = new Set();
    const off = new Set();
    const per = { market: {}, listings: {}, shops: {}, bids: {} };
    const flying = { market: 0, shops: 0, listings: 0, bids: 0 };
    const gapUntil = {};
    const started = env.now();
    let hour = (env.load('w3bHour') || []).filter((t) => Number.isFinite(t));
    let keyState = { limited: {}, full: {}, w3b: {}, ...(env.load('keyState') || {}) };
    let cache = null;
    let syncAt = 0;
    const flags = { w3b: false, receipt: null };

    const touch = (...parts) => { for (const p of parts) dirty.add(p); cache = null; };
    const settings = () => env.settings();
    const sayOnce = (kind, what, detail = null) => { if (said.has(kind)) return; said.add(kind); env.say('note', what, detail); };
    // A tab out of view ticks as rarely as once a minute: what waited for room is asked for as soon as a read comes back.
    const again = () => { if (env.kick) env.kick(); };

    function flush() {
        for (const part of dirty) env.save(part, S[part]);
        dirty.clear();
    }

    /** The view, worked out at most once per change. */
    function view() {
        const now = env.now();
        if (cache && now - cache.at < 5000) return cache.view;
        const v = archiveView(engineInput(S, settings(), now));
        const hot = hotSince(S.hot, v.buy.hot, now);
        if (JSON.stringify(hot) !== JSON.stringify(S.hot)) { S.hot = hot; dirty.add('hot'); }
        cache = { at: now, view: v };
        return v;
    }

    function setKeyState(kind, patch) {
        keyState = { ...keyState, [kind]: { ...keyState[kind], ...patch } };
        env.save('keyState', keyState);
        cache = null;
    }

    /** A key Torn refuses for good: said on its box, and not used again until it is changed. */
    function keyFailed(kind, error) {
        const code = error && Number(error.code);
        if (!KEY_DEAD_CODES.has(code)) return false;
        setKeyState(kind, { ok: false, error: egMsg(error) || 'Torn refused this key' });
        return true;
    }
    const keyOk = (kind) => env.hasKey(kind) && !keyState[kind].error;

    // ---- one read, with its bookkeeping -------------------------------------------------------------------------------

    function run(name, every, fn, { key = 'limited' } = {}) {
        if (busy[name] || off.has(name)) return;
        const now = env.now();
        if (now < (due[name] || 0)) return;
        busy[name] = true;
        due[name] = now + every;
        Promise.resolve()
            .then(fn)
            .catch((error) => {
                // Refused here (paused, or our own limit): not a problem, asked again when there is room.
                due[name] = env.now() + (egLocal(error) && error.retryAt ? Math.max(5000, error.retryAt - env.now()) : RETRY_MS);
                if (egLocal(error)) return;
                if (key) keyFailed(key, error);
                sayOnce(name + '-failed', 'Could not read: ' + name, egMsg(error));
            })
            .finally(() => { busy[name] = false; flush(); env.changed(); again(); });
    }

    // ---- who you are, items, your money ---------------------------------------------------------------------------------

    async function readSelf() {
        const info = await fetchLedgerKeyInfo(env.torn);
        if (info.level != null && info.level < 3) { setKeyState('limited', { ok: false, error: 'not a Limited key' }); return; }
        if (info.userId && info.userId !== S.self.id) { S.self = { ...S.self, id: info.userId }; touch('self'); }
        setKeyState('limited', { ok: true, error: '' });
    }

    async function readFullKey() {
        const info = await fetchLedgerKeyInfo(env.full);
        if (!isFullKey(info)) { setKeyState('full', { ok: false, error: 'not a Full key' }); return; }
        if (S.self.id && info.userId && info.userId !== S.self.id) { setKeyState('full', { ok: false, error: "another player's key" }); return; }
        setKeyState('full', { ok: true, error: '' });
    }

    async function readItems() {
        const raw = await fetchItems(env.torn);
        if (!foldItems(S, raw, env.now())) throw new Error("Torn's item list came back without the set pieces.");
        touch('items');
    }

    async function readMoney() {
        const m = await fetchMoney(env.torn);
        if (!foldMoney(S, m, env.now())) { off.add('money'); sayOnce('money-shape', "Torn's answer for your money has none of the names known", 'it has: ' + ((m && m.keys) || []).join(', ')); return; }
        touch('money');
    }

    async function readPoints() {
        const json = await fetchPointsMarket(env.torn);
        if (!foldPoints(S, json, env.now())) { sayOnce('points-empty', 'The points market came back with no listing that could be read', 'the answer has: ' + Object.keys(json || {}).slice(0, 8).join(', ')); return; }
        touch('points');
    }

    async function readInventory() {
        // Where Torn wants a category named, only the two that hold set pieces are asked for.
        const rows = await fetchInventory(env.torn, { categories: ['Plushie', 'Flower'], byCategoryFirst: true });
        foldInventory(S, rows, env.now());
        touch('stock');
    }

    // ---- your log and your trades ---------------------------------------------------------------------------------------

    async function readTypes() {
        const json = await fetchLogTypes(env.torn);
        const types = pointsLogTypes(json);
        foldLogTypes(S, types, outLogTypes(json), env.now());
        touch('types');
        const missing = ['made', 'sold', 'used'].filter((k) => !types[k].length);
        if (missing.length) sayOnce('types', "Torn's list of log types names none for: " + missing.join(', '), JSON.stringify(types.titles).slice(0, 300));
    }

    async function readLog() {
        const now = env.now();
        const types = logTypesAsked(S.types);
        const use = { tag: 't.setslog', priority: 'low' };
        const gap = S.log.gap || null;
        const from = gap ? gap.from : S.log.from || Math.floor((now - BACKFILL_MS) / 1000);
        const priceNow = S.points.listings.length ? S.points.listings[0].cost : 0;
        let to = gap ? gap.to : null;
        let newest = S.log.newest || 0;
        for (let page = 0; page < EG_LOG_PAGES; page++) {
            const rows = await fetchLogPage(env.full, { from, to, types, use });
            const res = foldLog(S, rows, { now, priceNow });
            for (const u of res.unread) sayOnce('log-row-' + u.type, 'A log row of type ' + u.type + ' ("' + u.title + '") could not be read', 'its data has: ' + u.keys.join(', '));
            newest = Math.max(newest, res.newest);
            // A full page: older rows of the same stretch wait behind it.
            if (rows.length < 100 || !res.oldest) { to = null; break; }
            to = res.oldest - 1;
        }
        // Bought at a stop of the run: counted there.
        countRun();
        if (to != null) {
            // More rows in this stretch than one go reads: the next go carries on from here, at once.
            S.log = { ...S.log, gap: { from, to }, newest, at: now };
            due.log = 0;
        } else {
            S.log = { ...S.log, gap: null, newest, from: newest || from, until: now, at: now, backfilled: true };
        }
        touch('log', 'book', 'ledger', 'outs', 'stock', 'run');
    }

    async function readTrades() {
        const now = env.now();
        const use = { tag: 't.setslog', priority: 'normal' };
        const list = await fetchTradesOpen(env.torn, { use });
        const res = foldTradeList(S, list, now);
        touch('trades', 'names');
        if (res.closed.length) due.finished = 0;
        const fresh = new Set(res.fresh.map((t) => t.id));
        for (const id of res.read.slice(0, EG_TRADES_FULL)) {
            const t = foldTradeOpen(S, await fetchTrade(env.torn, id, use));
            touch('trades');
            if (!t || !fresh.has(id) || !tradeHasPieces(t)) continue;
            const shown = view().trades.open.find((x) => x.id === id);
            env.notify({ ...tradeNotice(t, shown ? shown.items : t.theirs.length, shown ? shown.total : 0), tradeId: id });
        }
    }

    async function readFinished() {
        const now = env.now();
        const use = { tag: 't.setslog', priority: 'low' };
        const from = S.ledger.tradesFrom || Math.floor((now - BACKFILL_MS) / 1000);
        const list = await fetchTradesPage(env.torn, { from, use });
        let newest = from;
        let read = 0;
        let left = false;
        for (const x of list) {
            if (!x || x.id == null) continue;
            const done = Number(x.completed_at ?? x.timestamp ?? x.modified_at) || 0;
            if (S.ledger.tradeIds.includes(String(x.id))) { newest = Math.max(newest, done); continue; }
            if (read >= EG_TRADES_FULL) { left = true; break; }
            read += 1;
            foldTradeFinished(S, await fetchTrade(env.torn, x.id, use), now);
            newest = Math.max(newest, done);
        }
        countRun();
        S.ledger = { ...S.ledger, tradesFrom: newest, tradesAt: now, tradesBackfilled: S.ledger.tradesBackfilled || (!left && list.length < 100) };
        touch('ledger', 'trades', 'outs', 'stock', 'names');
        // More of them wait: the next go follows at once.
        if (left || list.length >= 100) due.finished = 0;
    }

    // ---- prices of the pieces -------------------------------------------------------------------------------------------

    async function readSummary() {
        foldSummary(S, await fetchW3bSummary(env.w3b, { tag: 'w.summary' }), env.now());
        touch('summary');
    }

    const pieceIds = () => setsTraded(settings()).flatMap((s) => s.pieces.map((p) => String(p.id)));

    function each(kind, ids, everyOf, fn, key = 'limited') {
        const now = env.now();
        const list = ids.filter((id) => !(per[kind][id] && per[kind][id].busy) && now >= ((per[kind][id] && per[kind][id].due) || 0));
        for (const id of list) {
            if (flying[kind] >= EG_FLIGHT[kind] || now < (gapUntil[kind] || 0)) return;
            if (EG_GAP_MS[kind]) gapUntil[kind] = now + EG_GAP_MS[kind];
            flying[kind] += 1;
            per[kind][id] = { busy: true, due: now + everyOf(id) };
            Promise.resolve()
                .then(() => fn(id))
                .catch((error) => {
                    per[kind][id].due = env.now() + (egLocal(error) && error.retryAt ? Math.max(5000, error.retryAt - env.now()) : RETRY_MS);
                    if (egLocal(error)) return;
                    if (key) keyFailed(key, error);
                    sayOnce(kind + '-failed', 'Could not read: ' + kind, egMsg(error));
                })
                .finally(() => { flying[kind] -= 1; per[kind][id].busy = false; flush(); env.changed(); again(); });
        }
    }

    function readMarkets(v) {
        const every = settings().readMin * EG_MIN;
        const need = new Map(v.pieces.map((p) => [String(p.id), p.need]));
        const ids = pieceIds().sort((a, b) => (need.get(b) || 0) - (need.get(a) || 0));
        each('market', ids, (id) => (need.get(id) > 0 ? every : every * IDLE_TIMES), async (id) => {
            const r = await fetchItemMarket(env.torn, id, { limit: 20, tag: 't.sets', priority: 'low' });
            foldMarket(S, id, r.listings, env.now());
            touch('offers');
        });
    }

    /** The piece whose bazaars are most worth a look: never read, then one whose cheapest price moved, then the oldest. */
    function listingDue(v) {
        const now = env.now();
        hour = hour.filter((t) => now - t < EG_HOUR);
        if (hour.length >= LISTINGS_PER_HOUR) return [];
        const rank = (p) => {
            const o = S.offers[String(p.id)] || {};
            const low = S.summary.low[String(p.id)] || 0;
            if (!o.bazAt) return 4;
            const moved = low > 0 && low !== o.bazLow && S.summary.at > o.bazAt;
            if (moved && p.need > 0 && low < p.worth) return 3;
            if (moved && p.need > 0) return 2;
            // Read by another PC of ours lately: the server has those bazaars, and reads them from Torn itself.
            const read = serverListReadAt(o.bazAt, p.id, serverOn(now) ? S.server.dir : null);
            if (now - read.at > LISTING_STALE_MS * (p.need > 0 ? 1 : IDLE_TIMES) + read.wait) return 1;
            return 0;
        };
        return v.pieces.map((p) => ({ id: String(p.id), r: rank(p), need: p.need })).filter((x) => x.r > 0).sort((a, b) => b.r - a.r || b.need - a.need).map((x) => x.id);
    }

    function readListings(v) {
        each('listings', listingDue(v), () => 30000, async (id) => {
            // Counted whether it was answered or not; a refusal of our own making (never sent) is not.
            const count = () => { hour.push(env.now()); env.save('w3bHour', hour); };
            const r = await fetchW3bListings(env.w3b, id, { tag: 'w.sets' }).catch((error) => { if (!egLocal(error)) count(); throw error; });
            count();
            foldListings(S, id, r.listings, env.now());
            touch('offers', 'names');
            tidyList();
        }, null);
    }

    /** The bazaars to confirm with Torn itself: the run's stop, the stops of your list, the listings under your rate, the cheapest of what you need. */
    function shopsWanted(v) {
        const ids = [];
        const add = (id) => { if (id != null && id !== '' && !ids.includes(String(id))) ids.push(String(id)); };
        const cur = v.buy.run.stops.find((s) => s.state === 'cur');
        if (cur && !cur.im) add(cur.whoId);
        for (const s of v.buy.stops) if (!s.im) add(s.whoId);
        for (const h of v.buy.hot) if (!h.im) add(h.whoId);
        for (const p of v.pieces) if (p.need > 0) for (const o of p.offers.slice(0, 2)) if (o.src !== 'market' && o.price < p.worth) add(o.whoId);
        return ids.slice(0, EG_SHOPS);
    }

    /** The server answered lately: what it holds is in step with Torn. */
    const serverOn = (now) => S.server.at > 0 && now - S.server.at < SERVER_QUIET_MS;

    /** Of those, the ones to ask Torn for here: a bazaar the server read from Torn within the time is not asked again. */
    function shopsDue(v) {
        const now = env.now();
        const every = settings().readMin * EG_MIN;
        const cur = v.buy.run.stops.find((s) => s.state === 'cur');
        return shopsWanted(v).filter((id) => {
            const theirs = serverShop(S.server.shops, id);
            return !(theirs && now - theirs.at < (cur && String(cur.whoId) === id ? Math.min(every, 30000) : every));
        });
    }

    function readShops(v) {
        const every = settings().readMin * EG_MIN;
        const cur = v.buy.run.stops.find((s) => s.state === 'cur');
        each('shops', shopsDue(v), (id) => (cur && String(cur.whoId) === id ? Math.min(every, 30000) : every), async (id) => {
            const json = await env.torn.get('v2/user', { selections: 'bazaar', id }, { tag: 't.sets', priority: 'normal' });
            if (!foldShop(S, id, json, env.now())) { sayOnce('shop-shape', "Torn's answer for a bazaar had no bazaar in it", 'it has: ' + Object.keys(json || {}).slice(0, 8).join(', ')); return; }
            touch('shops');
            tidyList();
        });
    }

    function readBids() {
        each('bids', pieceIds().filter((id) => !(S.bids[id] && env.now() - S.bids[id].at < READ_EVERY.bids)), () => READ_EVERY.bids, async (id) => {
            const r = await fetchW3bItemTraders(env.w3b, id, { tag: 'w.buyers' });
            foldBids(S, id, r.traders, env.now());
            touch('bids');
        }, null);
    }

    /** The list against the newest listings: what is gone or no longer worth it comes off; nothing is ever added. */
    function tidyList() {
        if (!S.cart.length) return;
        cache = null;
        const v = view();
        const res = refreshList(S.cart, v.pieces, (id) => offersOf(S, id, env.now()));
        if (res.dropped.length || JSON.stringify(res.cart) !== JSON.stringify(S.cart)) { S.cart = res.cart; touch('cart'); }
    }

    /** What you bought since the run began, counted on its lines: from the pages you bought on and from Torn's log. */
    function countRun() {
        if (!S.run.on && !S.run.done) return;
        const began = S.run.began || 0;
        const got = new Map();
        const add = (key, qty) => got.set(key, (got.get(key) || 0) + qty);
        for (const r of S.ledger.rows) {
            if (r.side !== 'buy' || !(r.t >= began)) continue;
            if (r.venue === 'bazaar' && r.who) add(lineKey(r.itemId, 'b:' + r.who), r.qty);
            else if (r.venue === 'market') add(lineKey(r.itemId, IM_PLACE), r.qty);
        }
        const seen = new Map();
        for (const b of S.seen) if (b.t >= began && b.whoId) seen.set(lineKey(b.id, 'b:' + b.whoId), (seen.get(lineKey(b.id, 'b:' + b.whoId)) || 0) + b.qty);
        let run = S.run;
        for (const l of S.cart) run = runTook(run, l.key, Math.max(got.get(l.key) || 0, seen.get(l.key) || 0));
        if (run !== S.run) { S.run = run; touch('run'); }
    }

    // ---- your thread, your TornW3B list ----------------------------------------------------------------------------------

    async function readThread() {
        const json = await env.torn.get('v2/user/forumthreads', { limit: 50 }, { tag: 't.sets', priority: 'low' });
        foldThreads(S, json, env.now());
        touch('thread');
    }

    async function readOwnList() {
        try {
            foldOwnList(S, await env.own.readList(), env.now());
        } catch (error) {
            if (!egLocal(error)) S.w3b = { ...S.w3b, error: egMsg(error) };
            touch('w3b');
            throw error;
        }
        touch('w3b');
    }

    async function readReceipts() {
        const rows = await env.own.receipts();
        setKeyState('w3b', { ok: true, error: '' });
        const known = new Set(S.w3b.receipts.map(([, r]) => String(r.id)));
        let read = 0;
        for (const r of rows) {
            if (!r || r.id == null || known.has(String(r.id)) || read >= 5) continue;
            read += 1;
            const one = await env.own.receipt(r.id);
            for (const [tid, rec] of receiptsByTrade([one])) {
                const at = Date.parse(rec.at) || Number(rec.at) * 1000 || env.now();
                S.w3b = { ...S.w3b, receipts: [...S.w3b.receipts.filter(([id]) => id !== tid), [tid, { id: rec.id, total: rec.total, url: '', at }]].slice(-300), lastReceiptAt: Math.max(S.w3b.lastReceiptAt, at) };
            }
        }
        S.w3b = { ...S.w3b, receiptsAt: env.now() };
        touch('w3b');
    }

    /** Your list on TornW3B brought to your rate: only the set pieces are set or taken off, nothing else is touched. */
    async function sendList() {
        const v = view();
        if (!v.ready || !S.w3b.list) throw new Error('Your list on TornW3B has not been read yet.');
        const diff = listDiff(new Map(S.w3b.list), desiredList(v.pieces, v.settings.open), ALL_PIECE_IDS);
        if (listMatches(diff)) return;
        syncAt = env.now();
        await env.own.putList(putBody(diff));
        setKeyState('w3b', { ok: true, error: '' });
        foldOwnList(S, await env.own.readList(), env.now());
        touch('w3b');
    }

    function w3bFailed(error) {
        if (egLocal(error)) return;
        if (error && error.http === 401) setKeyState('w3b', { ok: false, error: 'TornW3B does not know this key' });
        S.w3b = { ...S.w3b, error: egMsg(error) };
        touch('w3b');
        env.say('note', 'TornW3B: your own list or receipts', egMsg(error));
    }

    // ---- the loop ---------------------------------------------------------------------------------------------------------

    /** Every few seconds, and when a read comes back: whatever is due is asked for. Nothing without a key. */
    function step() {
        if (env.paused()) return;
        const now = env.now();
        if (!env.hasKey('limited') || keyState.limited.error) { stepOwn(now); return; }
        run('self', READ_EVERY.self, readSelf);
        if (!S.self.id) return;
        run('items', READ_EVERY.items, readItems);
        if (!S.items.at) return;
        const s = settings();
        const full = keyOk('full');
        if (full && keyState.full.ok == null) run('fullKey', READ_EVERY.self, readFullKey, { key: 'full' });
        if (full && keyState.full.ok) {
            if (now - S.types.at > READ_EVERY.types) run('types', RETRY_MS, readTypes);
            if (S.types.at) run('log', READ_EVERY.log, readLog, { key: 'full' });
        }
        run('finished', READ_EVERY.finished, readFinished);
        // The count starts from Torn's inventory, after the history is in: your newest buys say what the pieces cost.
        const fullPending = full && keyState.full.ok == null;
        const history = S.ledger.tradesBackfilled && !fullPending && (!(full && keyState.full.ok) || S.log.backfilled);
        if (history || S.stock.invAt || now - started > EG_HISTORY_WAIT_MS) run('inventory', READ_EVERY.inventory, readInventory);
        run('money', READ_EVERY.money, readMoney);
        run('points', READ_EVERY.points, readPoints);
        run('trades', READ_EVERY.trades, readTrades);
        run('summary', s.readMin * EG_MIN, readSummary, { key: null });
        run('thread', READ_EVERY.thread, readThread);
        const v = view();
        readMarkets(v);
        if (S.summary.at) readListings(v);
        readShops(v);
        readBids();
        stepOwn(now);
        if (v.ready && now - (due.day || 0) > 0) { due.day = now + EG_MIN; recordDay(S, v, now); touch('hist'); }
        flush();
    }

    function stepOwn(now) {
        if (!keyOk('w3b') || !S.self.id) return;
        run('ownList', READ_EVERY.ownList, () => readOwnList().catch((e) => { w3bFailed(e); throw e; }), { key: null });
        run('receipts', READ_EVERY.receipts, () => readReceipts().catch((e) => { w3bFailed(e); throw e; }), { key: null });
        const s = settings();
        if (!s.w3bSync || !S.w3b.list || flags.w3b || now - syncAt < EG_SYNC_GAP_MS) return;
        const v = view();
        if (!v.ready || !v.prices.w3b.diff || v.prices.w3b.matches) return;
        flags.w3b = true;
        sendList().catch(w3bFailed).finally(() => { flags.w3b = false; flush(); env.changed(); });
    }

    // ---- the shared server ------------------------------------------------------------------------------------------------

    /**
     * What Torn Archive tells the shared server (core/server.js serverBody takes it): the bazaars it knows sell a
     * piece, the ones on your list and under your rate, what each piece is worth to you, what you just bought at a
     * bazaar, and which of TornW3B's lists it read.
     */
    function serverWant() {
        const now = env.now();
        const v = view();
        const me = String(S.self.id);
        const sellers = new Set();
        const dir = [];
        for (const id of ENGINE_PIECES) {
            const o = S.offers[id];
            if (!o) continue;
            if (o.bazAt) dir.push([Number(id), o.bazAt]);
            for (const r of o.baz || []) if (String(r.whoId) !== me) sellers.add(Number(r.whoId));
        }
        const mv = mvOf(S);
        const worth = {};
        for (const id of ENGINE_PIECES) {
            const p = viewPiece(v, id);
            // A piece of a set you do not trade is still watched, at its market value: the server sends only what is named.
            const w = (p && p.worth) || mv(id);
            if (w > 0) worth[id] = w;
        }
        const bought = [];
        for (const r of S.ledger.rows) if (r.side === 'buy' && r.venue === 'bazaar' && r.who && now - r.t < SERVER_BOUGHT_MS) bought.push({ whoId: r.who, id: r.itemId, qty: r.qty, price: r.each, t: r.t });
        // Seen on the page and not in the log yet.
        for (const b of S.seen) if (b.whoId && b.t > S.log.until && now - b.t < SERVER_BOUGHT_MS) bought.push({ whoId: b.whoId, id: b.id, qty: b.qty, price: b.price, t: b.t });
        return { sellers: [...sellers], looking: shopsWanted(v).map(Number), worth, bought, dir, need: v.pieces.filter((p) => p.need > 0).map((p) => Number(p.id)) };
    }

    /** One answer of the shared server. */
    function serverTook(answer, got) {
        foldServer(S, answer, got);
        touch('server');
        // The two markets as the server read them: taken when newer than what is held, and then not asked of Torn
        // here until the server's read has had its time (one more exchange is allowed for it to come).
        const theirs = serverMarketIn(answer, ENGINE_PIECES, got);
        const slack = SERVER_SYNC_MS + 5000;
        if (theirs.points && theirs.points.at > (S.points.at || 0) && foldPoints(S, theirs.points.json, theirs.points.at)) {
            touch('points');
            due.points = Math.max(due.points || 0, theirs.points.at + READ_EVERY.points + slack);
        }
        if (theirs.market.length) {
            const v = view();
            const every = settings().readMin * EG_MIN;
            for (const m of theirs.market) {
                const o = S.offers[m.id];
                if (o && o.imAt >= m.at) continue;
                foldMarket(S, m.id, m.listings, m.at);
                touch('offers');
                const p = viewPiece(v, m.id);
                const next = m.at + (p && p.need > 0 ? Math.max(every, 60000) : every * IDLE_TIMES) + slack;
                const had = per.market[m.id];
                if (!(had && had.busy)) per.market[m.id] = { busy: false, due: Math.max((had && had.due) || 0, next) };
            }
        }
        tidyList();
        flush();
        env.changed();
        again();
    }

    /** The server is off, or another one: what it said goes. */
    function serverForget() {
        S.server = serverEmpty();
        touch('server');
        flush();
        env.changed();
    }

    /** "Read now": everything is due. */
    function readNow() {
        for (const k of Object.keys(due)) due[k] = 0;
        for (const kind of Object.keys(per)) if (kind !== 'listings' && kind !== 'bids') for (const id of Object.keys(per[kind])) per[kind][id].due = 0;
        said.clear();
        off.clear();
        step();
    }

    /** A key was pasted, changed or forgotten. */
    function keyChanged(kind) {
        setKeyState(kind, { ok: null, error: '' });
        said.clear();
        off.clear();
        if (kind === 'limited') { due.self = 0; due.items = 0; }
        if (kind === 'full') { due.fullKey = 0; due.types = 0; due.log = 0; }
        if (kind === 'w3b') { due.ownList = 0; due.receipts = 0; }
        step();
    }

    // ---- the hub's buttons ------------------------------------------------------------------------------------------------

    const stops = () => { const v = view(); return stopsOf(S.cart, (id) => (viewPiece(v, id) || {}).worth || 0); };
    const idle = () => { S.run = { ...RUN_IDLE }; };

    const actions = {
        cart(itemId, place) {
            const p = viewPiece(view(), itemId);
            const offer = p && p.offers.find((o) => placeOf(o) === place);
            if (!offer) return;
            S.cart = toggleLine(S.cart, p, offer);
            idle();
            touch('cart', 'run');
        },
        drop(key) { S.cart = dropLine(S.cart, key); idle(); touch('cart', 'run'); },
        makeList() { const v = view(); S.cart = fillPlan(v.pieces, (id) => offersOf(S, id, env.now())); idle(); touch('cart', 'run'); },
        clearList() { S.cart = []; idle(); touch('cart', 'run'); },
        run(op) {
            const list = stops();
            if (op === 'start') S.run = { ...runStart(list), began: env.now() };
            else if (op === 'stop') idle();
            else {
                countRun();
                S.run = runNext(S.run, list);
                // Over: what you took leaves the list, what you skipped stays on it.
                if (S.run.done) S.cart = listAfterRun(S.cart, S.run);
            }
            touch('cart', 'run');
            // The stop you are sent to is confirmed with Torn at once.
            const at = runAt(S.run, stops());
            const cur = at >= 0 ? stops()[at] : null;
            if (cur && !cur.im && per.shops[String(cur.whoId)]) per.shops[String(cur.whoId)].due = 0;
        },
        read: readNow,
        w3b(op) {
            if (flags.w3b) return;
            flags.w3b = true;
            (op === 'send' ? sendList() : readOwnList()).catch(w3bFailed).finally(() => { flags.w3b = false; flush(); env.changed(); });
        },
        receipt(tradeId) {
            const id = String(tradeId);
            const f = S.trades.finished.find((x) => x.id === id);
            if (!f || flags.receipt) return;
            flags.receipt = id;
            env.own.makeReceipt(receiptBody(id, f.rows || [], f.whoId))
                .then((json) => {
                    const r = readReceipt(json, f.paid);
                    foldReceipt(S, id, r, env.now());
                    touch('w3b');
                    if (!r.ok) env.say('note', "TornW3B's receipt differs from what you paid", 'trade ' + id + ': theirs ' + r.total + ', yours ' + f.paid + (r.missing.length ? ', not on your list: ' + r.missing.join(', ') : ''));
                })
                .catch(w3bFailed)
                .finally(() => { flags.receipt = null; flush(); env.changed(); });
        },
    };

    function act(name, ...args) {
        if (!actions[name]) return false;
        actions[name](...args);
        flush();
        env.changed();
        return true;
    }

    /** What a Torn page saw: a buy on a bazaar, a press of EXCHANGE, your thread's title. */
    function note(kind, what) {
        const now = env.now();
        if (kind === 'buy') { noteSeenBuy(S, what, now); countRun(); touch('seen', 'run'); }
        else if (kind === 'swap') { noteSwap(S, what, now); touch('swaps', 'book'); }
        else if (kind === 'thread') { noteThread(S, what, now); touch('thread'); }
        flush();
        env.changed();
    }

    return {
        state: S, step, view, act, note, readNow, keyChanged, flush, serverWant, serverTook, serverForget,
        serverMark: () => ({ seq: S.server.seq, seenAt: S.server.seenAt }),
        keys: () => keyState,
        busy: () => ({ ...flags }),
        mv: mvOf(S),
        /** Whether the settings changed something the reads depend on. */
        settingsChanged() { cache = null; syncAt = 0; },
    };
}

/** Every piece id, for callers that only have the engine. */
export const ENGINE_ALL_PIECES = ENGINE_PIECES;
