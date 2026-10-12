// The engine: asks Torn and TornW3B for what is due, folds each answer into the state (state.js), keeps the shopping
// list and the run, and answers the hub's buttons. One engine runs, in the Archive's own tab; Torn's pages only
// show what it worked out. Everything outside (keys, storage, the clock, the clients) is handed in, so the whole
// loop runs in a test on stand-ins. Nothing here presses, buys, posts or sends anything on Torn.

import {
    engineLoad, ENGINE_PARTS, ENGINE_PIECES, BACKFILL_MS, foldItems, foldSummary, foldListings, foldMarket, foldShop, foldBids, foldPoints, foldMoney,
    foldInventory, foldLog, foldLogTypes, outLogTypes, logTypeGroups, foldTradeList, foldTradeOpen, foldTradeFinished, tradeHasPieces, foldThreads,
    foldOwnList, foldReceipt, recordDay, engineInput, pileOf, notePage, noteSeenBuy, noteSwap, noteThread, mvOf, foldServer, serverEmpty, settleMugs,
    judgeSeen, enBump, tradesOdd, foldTradeReprice,
} from './state.js';
import { serverShop, serverListReadAt, serverMarketIn, SERVER_QUIET_MS, SERVER_BOUGHT_MS, SERVER_SYNC_MS } from '../core/server.js';
import { archiveView, viewPiece, setsTraded, ALL_PIECE_IDS, listPieces, keepPieces } from '../core/view.js';
import { fillPlan, fillList, toggleLine, dropLine, refreshList, stopsOf, runStart, runNext, runTook, runAt, runView, runOrder, RUN_IDLE, placeOf, lineKey, listAfterRun, IM_PLACE, cheapPieces, addAll, dropPiece, dropPlaces } from '../core/shopping.js';
import { buysFrom } from '../core/settings.js';
import { hotSince } from '../core/verdict.js';
import { stockAge } from '../core/stock.js';
import { pointsLogTypes } from '../core/points.js';
import { listDiff, listMatches, putBody, receiptBody, readReceipt, receiptOf, receiptsWith, claimReceipts, RECEIPT_FORMS, RECEIPT_OWED_MS } from '../core/tw3b-list.js';
import { tradeNotice } from '../core/trades.js';
import { rateKey, fixTable, safeTable } from '../core/sellrate.js';
import { fetchItems, fetchItemMarket, fetchInventory, fetchPointsMarket, fetchMoney, fetchLogTypes } from '../api/torn.js';
import { fetchLedgerKeyInfo, isFullKey, fetchLogPage, fetchTradesPage, fetchTradesOpen, fetchTrade } from '../api/ledger.js';
import { fetchW3bSummary, fetchW3bListings, fetchW3bItemTraders } from '../api/w3b.js';
import { KEY_DEAD_CODES } from '../api/client.js';

const EG_MIN = 60000;
const EG_HOUR = 3600000;
const EG_DAY = 86400000;

/** How often each thing is read. The pieces' prices follow the setting (1, 2, 5 or 10 minutes). */
export const READ_EVERY = Object.freeze({
    self: 6 * EG_HOUR, items: EG_HOUR, types: 7 * EG_DAY, log: 2 * EG_MIN, finished: 5 * EG_MIN, inventory: 5 * EG_MIN,
    money: EG_MIN, points: EG_MIN, trades: EG_MIN, thread: 10 * EG_MIN, ownList: 5 * EG_MIN, receipts: 30 * EG_MIN, bids: 6 * EG_HOUR,
});
// The inventory: everything else is worked out from it, so it is asked before anything that can wait ('high').
// Torn counts it once an hour for each category and its answer says when it counted: it is asked again the moment
// that hour is over (EG_INV_AFTER_MS past it), when you make a list or start a run, a little after a buy, and
// every five minutes besides - two requests each time.
const EG_INV_AFTER_MS = 5000;
const EG_INV_AFTER_BUY_MS = 30000;
/** After a buy seen on a page your log is asked this long after it, each time: Torn's log is the judge of the buy (state.js judgeSeen). */
const EG_LOG_AFTER_BUY_MS = [5000, 20000, 65000];
/**
 * The calm pace (1.3.0; the owner: "calm automatic is fine"). What decides which reads are due is worked out from
 * a view no older than this, not afresh after every answer: on 2026-10-11 the hub stood frozen 38 minutes of a day
 * working the view out after each of thousands of reads. A buy, a press, a note from a Torn tab or a read that
 * concerns your list still works it out at once.
 */
export const EG_CALM_MS = 3000;
/** An old trade that priced a piece oddly is read again, this many a go (state.js tradesOdd). */
const EG_REPRICE_AT_ONCE = 3;
/** "Read" on your stock asks Torn at most this often. */
const EG_STOCK_PRESS_MS = 10000;
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
/** A finished trade gets its receipt by itself this long after it ended (TornW3B lets a receipt be put right for 6 hours). */
const EG_RECEIPT_WITHIN_MS = RECEIPT_OWED_MS;
/** ... tried this many times at most, this far apart. */
const EG_RECEIPT_TRIES = 3;
const EG_RECEIPT_GAP_MS = 5 * EG_MIN;
/** A read TornW3B refuses outright (401, 403) is not asked again every minute. */
const EG_REFUSED_RETRY_MS = 30 * EG_MIN;
/** Bazaars confirmed with Torn itself each round: the stops of your list and the cheapest places first. */
const EG_SHOPS = 12;
/** ... or this share of what Torn allows you a minute, when that is more (alone on the key: about 34 of 85). */
const EG_SHOPS_SHARE = 0.4;
/** A read of Torn's made this lately is the newest there is: "Read now" does not ask for it again. */
const EG_JUST_READ_MS = 45000;
/** The piece open on the hub: this many rows of its "Sold by" table are confirmed with Torn, while it was looked at this lately. */
const EG_LOOK_ROWS = 14;
/** How often one finished trade is asked for before it is left out and said. */
const EG_TRADE_TRIES = 3;
/** How far before the last finished trade read the list is asked from, in seconds (readFinished). */
const EG_TRADES_BACK_S = 24 * 3600;
const EG_LOOK_MS = 10 * EG_MIN;
const EG_SYNC_GAP_MS = 2 * EG_MIN;
/** After a write your list is read once more this much later: TornW3B may still answer the list as it was. */
const EG_LIST_AGAIN_MS = EG_MIN;
/**
 * How the Archive writes your list. A list last written another way is written in full once, so every price on
 * it is as this one says: 2 = with TornW3B's inflation protection on.
 */
const EG_LIST_FORM = 2;

const egMsg = (error) => String((error && error.message) || error || '');
const egLocal = (error) => !!(error && (error.local || error.takingTurns));
/** The shape of something sent - names and kinds, no value - for the problem log. */
const egShape = (v) => (Array.isArray(v) ? '[' + (v.length ? egShape(v[0]) : '') + '] x ' + v.length : v && typeof v === 'object' ? '{ ' + Object.entries(v).map(([k, x]) => k + ': ' + egShape(x)).join(', ') + ' }' : typeof v);
/** Words joined into as few log lines as hold them: a line of the problem log keeps 300 characters. */
function egLines(words, room = 250) {
    const out = [];
    let line = '';
    for (const w of words) {
        if (line && line.length + 2 + w.length > room) { out.push(line); line = ''; }
        line += (line ? ', ' : '') + w;
    }
    if (line) out.push(line);
    return out;
}

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
    /** The view last worked out, whatever has changed since: what the calm pace reads (calm). */
    let last = null;
    /** The list is to be checked against the listings at the next calm pass (tidySoon). */
    let tidyDue = false;
    let tidyAt = 0;
    /** When your log is asked for after a buy seen on a page (EG_LOG_AFTER_BUY_MS). */
    let logSoon = [];
    /** Finished trades Torn would not hand over, and how often (readFinished). */
    const tradeFails = {};
    /** The piece open on the hub's "Sold by" table (shopsWanted). Not kept: the next look says it again. */
    let looked = { id: '', at: 0 };
    let syncAt = 0;
    // Why the list was last not written by itself (said when it changes, not every step), and the request TornW3B
    // called wrong: the same one is not sent by itself again.
    let syncWhy = '';
    let listRefused = '';
    // The write TornW3B took while its list still read differently after it: not sent by itself a second time.
    let listStuck = '';
    /** Your receipts were read from TornW3B since this tab began: none is made by itself before (it may be there). */
    let receiptsSeen = false;
    // `held`: why your list differs and is not being written by itself ('' while it is written, or matches).
    const flags = { w3b: false, receipt: null, held: '' };

    const touch = (...parts) => { for (const p of parts) dirty.add(p); cache = null; };
    const settings = () => env.settings();
    const sayOnce = (kind, what, detail = null) => { if (said.has(kind)) return; said.add(kind); env.say('note', what, detail); };
    // A tab out of view ticks as rarely as once a minute: what waited for room is asked for as soon as a read comes back.
    const again = () => { if (env.kick) env.kick(); };

    function flush() {
        for (const part of dirty) env.save(part, S[part]);
        dirty.clear();
    }

    /** The view, worked out at most once per change. Timed for the speed log: the next zip shows what it took. */
    function view() {
        const now = env.now();
        if (cache && now - cache.at < 5000) return cache.view;
        const work = () => archiveView(engineInput(S, settings(), now, { logRead: logRead() }));
        const v = env.timed ? env.timed('engine', work) : work();
        const hot = hotSince(S.hot, v.buy.hot, now);
        if (JSON.stringify(hot) !== JSON.stringify(S.hot)) { S.hot = hot; dirty.add('hot'); }
        if (settleMugs(S, v.ledger.mugs.rows, now)) dirty.add('ledger');
        cache = { at: now, view: v };
        last = cache;
        return v;
    }

    /** The view as the calm pace takes it: the one last worked out while it is no older than EG_CALM_MS. */
    function calm() {
        const now = env.now();
        if (cache && now - cache.at < 5000) return cache.view;
        if (last && now >= last.at && now - last.at < EG_CALM_MS) return last.view;
        return view();
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
                const refused = error && (error.http === 401 || error.http === 403);
                due[name] = env.now() + (egLocal(error) && error.retryAt ? Math.max(5000, error.retryAt - env.now()) : refused ? Math.max(RETRY_MS, Math.min(every, EG_REFUSED_RETRY_MS)) : RETRY_MS);
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
        if (info.userId && info.userId !== S.self.id) { S.self = { ...S.self, id: info.userId }; enBump(S, null); touch('self'); }
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
        let tornAt = 0;
        const rows = await fetchInventory(env.torn, { categories: ['Plushie', 'Flower'], byCategoryFirst: true, priority: 'high', onStamp: (sec) => { tornAt = tornAt ? Math.min(tornAt, sec * 1000) : sec * 1000; } });
        const had = S.stock.tornAt || 0;
        foldInventory(S, rows, env.now(), tornAt);
        touch('stock', 'book');
        tidySoon(true);
        // Torn's next count, asked for as it is made.
        const age = stockAge(S.stock);
        if (age.nextAt > env.now()) due.inventory = Math.min(due.inventory || Infinity, age.nextAt + EG_INV_AFTER_MS);
        if (tornAt && tornAt !== had && env.say) env.say('note', 'Torn counted your items at ' + new Date(tornAt).toISOString().slice(11, 19) + ' UTC', age.tornAt ? null : 'that time is not trusted until a second read carries the same one');
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
        // A few kinds in a request, each sort by itself (state.js logTypeGroups says why).
        const groups = logTypeGroups(S.types);
        const use = { tag: 't.setslog', priority: 'low' };
        const gap = S.log.gap || null;
        const from = gap ? gap.from : S.log.from || Math.floor((now - BACKFILL_MS) / 1000);
        const priceNow = S.points.listings.length ? S.points.listings[0].cost : 0;
        const got = { ...(S.log.got || {}) };
        let newest = S.log.newest || 0;
        let pages = 0;
        // Where this go stopped short: the request it was on, and how far back it had come.
        let left = null;
        for (let g = gap && gap.g < groups.length ? gap.g : 0; g < groups.length && !left; g++) {
            let to = gap && gap.g === g ? gap.to : null;
            for (;;) {
                if (pages >= EG_LOG_PAGES) { left = { g, to }; break; }
                pages += 1;
                // Torn's `from` is "after this time": the second already read is asked for again, so a row written in it
                // after the last read is not lost (a row is taken once, by its id).
                const rows = await fetchLogPage(env.full, { from: Math.max(0, from - 1), to, types: groups[g].ids, use });
                const res = foldLog(S, rows, { now, priceNow });
                for (const u of res.unread) sayOnce('log-row-' + u.type, 'A log row of type ' + u.type + ' ("' + u.title + '") could not be read', 'its data has: ' + u.keys.join(', '));
                newest = Math.max(newest, res.newest);
                got[groups[g].name] = (got[groups[g].name] || 0) + rows.length;
                // A full page: older rows of the same stretch wait behind it.
                if (rows.length < 100 || !res.oldest) break;
                // `to` is "up to and including": the page's oldest second is asked for again, the rows of it that did
                // not fit come with the next page. A page that is one second from end to end cannot be split so.
                to = res.oldest === res.newest || res.oldest === to ? res.oldest - 1 : res.oldest;
            }
        }
        if (left) {
            // More rows in this stretch than one go reads: the next go carries on from here, at once.
            S.log = { ...S.log, gap: { from, to: left.to, g: left.g }, newest, got, at: now };
            due.log = 0;
        } else {
            S.log = { ...S.log, gap: null, newest, got, from: newest || from, until: now, at: now, backfilled: true };
            // Once per page load, for the zip: what Torn's log has brought, by sort.
            sayOnce('log-read', 'Your log, read through', groups.map((x) => x.name).filter((n, i, a) => a.indexOf(n) === i).map((n) => n + ': ' + (got[n] || 0) + ' rows').join(' · '));
            judgeBuys();
        }
        // Bought at a stop of the run: counted there.
        countRun();
        // 'seen': a buy tied to its log row is stored so. (Until 1.3.0 it was not, and after a reload the same buy
        // came off its seller's listing twice.)
        touch('log', 'book', 'ledger', 'outs', 'stock', 'run', 'seen', 'swaps');
        tidySoon(true);
    }

    /**
     * Torn's log is the judge of what a page saw: a buy it does not have, read a minute past it, is taken back
     * everywhere - and said, once, in the log and on the screen.
     */
    function judgeBuys() {
        const back = judgeSeen(S, env.now());
        if (!back.length) return;
        const nameOf = (id) => (S.items.list[String(id)] || [])[0] || 'item ' + id;
        for (const b of back) env.say('note', 'Not a buy after all: taken back', b.qty + ' x ' + nameOf(b.id) + (b.im ? ' on the Item Market' : ' at bazaar ' + b.whoId) + ', seen ' + new Date(b.t).toISOString().slice(11, 19) + " UTC. Torn's log, read past it, has no such buy.");
        touch('seen');
    }

    async function readTrades() {
        const now = env.now();
        const use = { tag: 't.setslog', priority: 'normal' };
        const list = await fetchTradesOpen(env.torn, { use });
        // The first look ever tells of nothing: those trades were open before Torn Archive was there.
        const first = !(S.trades.seen && S.trades.seen.began) || !Array.isArray(S.trades.told);
        const res = foldTradeList(S, list, now);
        touch('trades', 'names');
        if (res.closed.length) due.finished = 0;
        if (!Array.isArray(S.trades.told)) S.trades = { ...S.trades, told: [] };
        for (const id of res.read.slice(0, EG_TRADES_FULL)) {
            const t = foldTradeOpen(S, await fetchTrade(env.torn, id, use), env.now());
            touch('trades');
            // Told of once, when its pieces are in - which is after it was opened, often minutes after.
            if (!t || !tradeHasPieces(t) || S.trades.told.includes(id)) continue;
            S.trades = { ...S.trades, told: [...S.trades.told, id].slice(-400) };
            if (first) continue;
            cache = null;
            const shown = view().trades.open.find((x) => x.id === id);
            env.notify({ ...tradeNotice(t, shown ? shown.items : t.theirs.length, shown ? shown.total : 0), tradeId: id });
        }
    }

    async function readFinished() {
        const now = env.now();
        const use = { tag: 't.setslog', priority: 'low' };
        const from = S.ledger.tradesFrom || Math.floor((now - BACKFILL_MS) / 1000);
        // Whether Torn's `from` goes by when a trade was finished or when it was opened is not known: a day back is
        // asked for, and a trade is taken once by its id. A full page means a backlog: then from where it stood.
        let list = await fetchTradesPage(env.torn, { from: Math.max(0, from - EG_TRADES_BACK_S), use });
        if (list.length >= 100) list = await fetchTradesPage(env.torn, { from: Math.max(0, from - 1), use });
        let newest = from;
        let read = 0;
        let left = false;
        // The oldest trade that could not be read: the next go starts from it again, so it is not lost.
        let stuck = 0;
        for (const x of list) {
            if (!x || x.id == null) continue;
            const done = Number(x.completed_at ?? x.timestamp ?? x.modified_at) || 0;
            if (S.ledger.tradeIds.includes(String(x.id))) { newest = Math.max(newest, done); continue; }
            if (tradeFails[x.id] >= EG_TRADE_TRIES) { newest = Math.max(newest, done); continue; }
            if (read >= EG_TRADES_FULL) { left = true; break; }
            read += 1;
            let full = null;
            // One trade Torn refuses does not stop the ones after it: until 1.2.2 it did, and every later trade
            // (its pieces, its money) stayed out of the count for as long as that one failed.
            try { full = await fetchTrade(env.torn, x.id, use); } catch (error) {
                tradeFails[x.id] = (tradeFails[x.id] || 0) + 1;
                if (tradeFails[x.id] >= EG_TRADE_TRIES) env.say('note', 'A finished trade could not be read from Torn, and is left out', `trade ${x.id}: ${egMsg(error)}`);
                else stuck = stuck ? Math.min(stuck, done || from) : done || from;
                continue;
            }
            foldTradeFinished(S, full, now);
            newest = Math.max(newest, done);
        }
        if (stuck) newest = Math.min(newest, Math.max(from, stuck - 1));
        // Once: old trades that priced a piece with a whole trade's money (until 1.3.0 anything in a trade that was
        // not a set piece took none of the money) are read again and priced as they are now.
        if (!S.ledger.repriced && !left) {
            const odd = tradesOdd(S);
            for (const id of odd.slice(0, EG_REPRICE_AT_ONCE)) {
                let full = null;
                try { full = await fetchTrade(env.torn, id, use); } catch { full = null; }
                const n = foldTradeReprice(S, id, full);
                if (n) env.say('note', 'An old trade priced again', 'trade ' + id + ': ' + n + ' row(s) - its money is shared over everything that was in it');
            }
            if (odd.length <= EG_REPRICE_AT_ONCE) S.ledger = { ...S.ledger, repriced: true };
            else due.finished = 0;
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
            tidySoon(false);
        }, null);
    }

    /** The bazaars to confirm with Torn itself: the run's stop, the stops of your list, the listings under your rate, the cheapest of what you need. */
    function shopsWanted(v) {
        const ids = [];
        const add = (id) => { if (id != null && id !== '' && !ids.includes(String(id))) ids.push(String(id)); };
        const cur = v.buy.run.stops.find((s) => s.state === 'cur');
        if (cur && !cur.im) add(cur.whoId);
        // The piece open on the hub's "Sold by" table: every bazaar the table shows is asked of Torn itself, so no
        // row there is TornW3B's older copy for longer than one round (the owner, 2026-10-11: "i press read now as
        // well, its still stale items, and non existent items").
        const seen = looked.id && env.now() - looked.at < EG_LOOK_MS ? viewPiece(v, looked.id) : null;
        const extra = seen ? seen.offers.slice(0, EG_LOOK_ROWS).filter((o) => o.src !== 'market').length : 0;
        if (seen) for (const o of seen.offers.slice(0, EG_LOOK_ROWS)) if (o.src !== 'market') add(o.whoId);
        if (extra) {
            const rest = [];
            const more = (id) => { if (id != null && id !== '' && !ids.includes(String(id)) && !rest.includes(String(id))) rest.push(String(id)); };
            for (const s of v.buy.stops) if (!s.im) more(s.whoId);
            for (const id of v.buy.check || []) more(id);
            for (const h of v.buy.hot) if (!h.im) more(h.whoId);
            for (const p of v.pieces) if (p.need > 0) for (const o of p.offers.slice(0, 2)) if (o.src !== 'market' && !o.out && o.price < p.worth) more(o.whoId);
            return [...ids, ...rest.slice(0, shopsCap())];
        }
        for (const s of v.buy.stops) if (!s.im) add(s.whoId);
        // The bazaars a list would use that are shown but not checked: checked, they count.
        for (const id of v.buy.check || []) add(id);
        for (const h of v.buy.hot) if (!h.im) add(h.whoId);
        for (const p of v.pieces) if (p.need > 0) for (const o of p.offers.slice(0, 2)) if (o.src !== 'market' && !o.out && o.price < p.worth) add(o.whoId);
        return ids.slice(0, shopsCap());
    }

    /** How many bazaars are kept checked with Torn at once. */
    const shopsCap = () => Math.max(EG_SHOPS, Math.floor((Number(env.torn && env.torn.maxPerMinute) || 0) * EG_SHOPS_SHARE));

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
        const stops = v.buy.run.stops;
        const cur = stops.find((s) => s.state === 'cur');
        // While a run is on, the stop you stand on and the one after it go ahead of every other read (A5).
        const next = cur ? stops[stops.indexOf(cur) + 1] : null;
        const first = new Set([cur, next].filter((s) => s && !s.im).map((s) => String(s.whoId)));
        each('shops', shopsDue(v), (id) => (cur && String(cur.whoId) === id ? Math.min(every, 30000) : every), async (id) => {
            const json = await env.torn.get('v2/user', { selections: 'bazaar', id }, { tag: 't.sets', priority: first.has(id) ? 'high' : 'normal' });
            if (!foldShop(S, id, json, env.now())) { sayOnce('shop-shape', "Torn's answer for a bazaar had no bazaar in it", 'it has: ' + Object.keys(json || {}).slice(0, 8).join(', ')); return; }
            touch('shops');
            // A bazaar of your list: the list follows at once. Any other: at the next calm pass.
            tidySoon(S.cart.some((l) => String(l.whoId) === String(id)));
        });
    }

    function readBids() {
        each('bids', pieceIds().filter((id) => !(S.bids[id] && env.now() - S.bids[id].at < READ_EVERY.bids)), () => READ_EVERY.bids, async (id) => {
            const r = await fetchW3bItemTraders(env.w3b, id, { tag: 'w.buyers' });
            foldBids(S, id, r.traders, env.now());
            touch('bids');
        }, null);
    }

    /**
     * The list against the newest listings and your stock: what is gone, no longer worth it or already bought
     * comes off; nothing is ever added. While a run is on, a line keeps what you took on it until Next.
     */
    function tidyList() {
        tidyDue = false;
        tidyAt = env.now();
        if (!S.cart.length) return;
        cache = null;
        const v = view();
        const took = S.run.on ? (key) => (S.run.took || {})[key] : null;
        // A line stays while its listing is under the Stretch line of its piece (view.js keepPieces). The whole
        // pile is asked, as the layer keeps it: a line's bazaar may be off the shortlist.
        const res = refreshList(S.cart, keepPieces(v.pieces), (id) => pileOf(S, id, env.now()), took);
        if (res.dropped.length || JSON.stringify(res.cart) !== JSON.stringify(S.cart)) { S.cart = res.cart; touch('cart'); }
        // Every line gone under a run (sold to someone else, or dear now): there is nowhere left to go.
        if (!S.cart.length && S.run.on) { S.run = { ...RUN_IDLE }; touch('run'); }
    }

    /**
     * The list checked after a read. `concerns`: the read was of something the list rests on (a bazaar on it,
     * your stock, your log, what a page showed) - checked at once. Else at the next calm pass (step): the list
     * shows nothing wrong meanwhile, only something a few seconds old.
     */
    function tidySoon(concerns) {
        if (!S.cart.length) return;
        if (concerns) tidyList(); else tidyDue = true;
    }

    /**
     * "Sets to build from my cash" is worked out from your money, and your money moves with every buy and sale. So
     * the number is kept as it was when the list was made, for as long as there is a list - and worked out afresh
     * when the list is made again, is empty, or a setting it rests on changes.
     */
    function planKeep() {
        const s = settings();
        const key = JSON.stringify([s.targetMode, s.which, s.pct, s.shareMax]);
        const none = () => { if (S.plan.targets) { S.plan = { targets: null, at: 0, key: '' }; touch('plan'); } };
        if (!S.cart.length || s.targetMode === 'number') { none(); return; }
        if (S.plan.targets && S.plan.key === key) return;
        none();
        const v = view();
        if (!v.ready) return;
        const targets = {};
        for (const p of v.pieces) targets[p.set] = p.target;
        S.plan = { targets, at: env.now(), key };
        touch('plan');
    }

    /** Your log is read (a Full key Torn takes): a buy seen on a page waits for its log row. Else the page is all there is. */
    const logRead = () => keyOk('full') && keyState.full.ok === true;

    /** What you bought since the run began, counted on its lines: from the pages you bought on and from Torn's log. */
    function countRun() {
        if (!S.run.on) return;
        const began = S.run.began || 0;
        const got = new Map();
        const add = (key, qty) => got.set(key, (got.get(key) || 0) + qty);
        for (const r of S.ledger.rows) {
            if (r.side !== 'buy' || !(r.t >= began)) continue;
            if (r.venue === 'bazaar' && r.who) add(lineKey(r.itemId, 'b:' + r.who), r.qty);
            else if (r.venue === 'market') add(lineKey(r.itemId, IM_PLACE), r.qty);
        }
        const seen = new Map();
        for (const b of S.seen) {
            // A buy the log does not have was not one (state.js judgeSeen): it is on no line.
            if (b.no) continue;
            // A buy seen on the Item Market's page is on its one line; a bazaar's on that bazaar's.
            const key = b.t >= began ? (b.im ? lineKey(b.id, IM_PLACE) : b.whoId ? lineKey(b.id, 'b:' + b.whoId) : null) : null;
            if (key) seen.set(key, (seen.get(key) || 0) + b.qty);
        }
        // Counted afresh each time from what is on record since the run began: a buy taken back comes off its line
        // again. (Until 1.3.0 the larger count ever seen stood - and a false "bought" with it.)
        const took = {};
        for (const l of S.cart) { const n = Math.max(got.get(l.key) || 0, seen.get(l.key) || 0); if (n > 0) took[l.key] = n; }
        if (JSON.stringify(took) !== JSON.stringify(S.run.took || {})) { S.run = { ...S.run, took }; touch('run'); }
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
        if (keyState.w3b.ok !== true || keyState.w3b.error) setKeyState('w3b', { ok: true, error: '' });
        if (S.w3b.receiptsError) S.w3b = { ...S.w3b, receiptsError: '' };
        // A receipt kept without its pieces (as until 1.3.2) is read once more: its pieces say whose trade it is.
        const known = new Set(S.w3b.receipts.filter(([, r]) => Array.isArray(r.rows)).map(([, r]) => String(r.id)));
        let read = 0;
        for (const r of rows) {
            if (!r || r.id == null || known.has(String(r.id)) || read >= 5) continue;
            read += 1;
            const rec = receiptOf(await env.own.receipt(r.id), env.now());
            if (!rec) continue;
            S.w3b = { ...S.w3b, receipts: receiptsWith(S.w3b.receipts, rec).slice(-300), lastReceiptAt: Math.max(S.w3b.lastReceiptAt, rec.at) };
        }
        claimOwn();
        receiptsSeen = true;
        S.w3b = { ...S.w3b, receiptsAt: env.now() };
        touch('w3b');
    }

    /** Receipts no finished trade holds yet go to the trade they are of (core/tw3b-list.js claimReceipts), said once each. */
    function claimOwn() {
        const next = claimReceipts(S.w3b.receipts, S.trades.finished, ALL_PIECE_IDS);
        const moved = next.filter(([key], k) => key !== S.w3b.receipts[k][0]);
        if (!moved.length) return;
        for (const [key, r] of moved) env.say('note', 'A receipt on TornW3B is the one of a finished trade', 'trade ' + key + ' · receipt ' + r.id + (r.tid ? ' · made with the trade number ' + r.tid : ' · made with no trade number') + ' · the same pieces and counts');
        S.w3b = { ...S.w3b, receipts: next };
        touch('w3b');
    }

    // ---- what you pay your sellers, fixed for the hour --------------------------------------------------------------------

    const egMoney = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
    /** Torn's clock, as the pages say it. */
    const egClock = (t) => new Date(t).toISOString().slice(11, 16) + ' TCT';
    /** A trade with a piece of your sets in it is open (and read in full): its total is at the prices of this hour. */
    const tradeOpen = () => S.trades.open.some((t) => (S.trades.full || {})[t.id] != null && tradeHasPieces(t));

    /**
     * What you pay your sellers (core/sellrate.js), kept for an hour while the shop is open - the owner, 2026-10-12:
     * "maybe it checks the points every hour, so we can update every hour if i decide to trade?". Fixed from what
     * the view says a fix would take now (`prices.live`: each set at the lower of your rate and its ceiling, at
     * the cautious points price) - no read of its own. Until the hour ends nothing of it is worked out again;
     * the one thing that moves it is the safety: a points price fallen under your least profit brings it down at
     * once. A trade with set pieces open holds it past the hour (its receipt on TornW3B is made from your list
     * when it ends); the safety still applies. Your own change of rate, least profit or sets fixes at once.
     * Closed: nothing is fixed - the view says what you would pay now.
     */
    function rateKeep(now, v) {
        // The view the calm pace holds was worked out on the table as it stood: after a change the list is compared
        // (stepOwn) on a view worked out anew, or a list matching the old prices would count as written.
        const put = (next) => { S.rate = next; touch('rate'); last = null; };
        const s = settings();
        // A stored table that is not one (no sets, no hour) counts as none: it is fixed anew.
        const t = S.rate.table && S.rate.table.sets && S.rate.table.until > 0 ? S.rate.table : null;
        if (!s.open) {
            if (t || S.rate.sent) put({ table: null, sent: 0 });
            return;
        }
        const live = v.prices && v.prices.live;
        // No ceiling can be said yet (no points price, a market value missing), or the view is from before your
        // press: the next pass decides.
        if (!v.ready || !live || !live.ok || live.pct !== s.pct || live.least !== s.least) return;
        const key = rateKey(s);
        const own = !t || t.key !== key;
        const held = !own && now >= t.until && tradeOpen();
        if (own || (now >= t.until && !held)) {
            const next = fixTable(live, key, now);
            put({ ...S.rate, table: next });
            const sets = Object.entries(next.sets).map(([k, r]) => k + ' ' + r.pct + '% (' + (r.pct < next.pct ? 'its ceiling, under your ' + next.pct + '%' : 'the most that keeps your ' + next.least + '%: ' + r.cap + '%') + ')');
            env.say('note', 'Your prices fixed for an hour', sets.join(' · ') + ' · points ' + egMoney(next.price) + (next.from === 'usual' ? ' (what you usually sell for; ' + egMoney(next.today) + ' today)' : " (today's)") + ' · until ' + egClock(next.until) + (own && t ? ' · your settings changed' : ''));
            return;
        }
        let cur = t;
        if (held && !t.held) {
            cur = { ...t, held: true };
            env.say('note', 'Your prices stand still while a trade is open', 'their hour ended at ' + egClock(t.until) + ': they are fixed anew when no trade with set pieces is open');
        }
        const safe = safeTable(cur, setsTraded(s), live.price, now);
        if (safe !== cur) {
            const sets = Object.entries(safe.sets).filter(([k, r]) => r.down && (!cur.sets[k] || cur.sets[k].pct !== r.pct)).map(([k, r]) => k + ' ' + cur.sets[k].pct + '% to ' + r.pct + '%');
            env.say('note', 'Your prices came down inside the hour', sets.join(' · ') + ' · points fell to ' + egMoney(live.price) + ': over that your least ' + safe.least + '% would be gone' + (safe.held ? '' : ' · fixed anew at ' + egClock(safe.until)));
        }
        if (safe !== t) put({ ...S.rate, table: safe });
    }

    /** The request a write of your list would send now, or why there is none. */
    function listWrite(v = view()) {
        if (!v.ready || !S.w3b.list) return { why: 'your list on TornW3B has not been read yet', unread: true };
        // A list last written another way (EG_LIST_FORM) is written in full once: every price, also one that reads the same.
        const all = !!v.settings.open && (S.w3b.form || 0) !== EG_LIST_FORM;
        // What the list should say is the view's (`want`): your prices of this hour, without the pieces you hold too many of.
        const diff = listDiff(new Map(S.w3b.list), v.prices.w3b.want, ALL_PIECE_IDS, { all });
        if (listMatches(diff)) return { why: v.settings.open ? 'it already matches your rate' : 'your shop is closed: no set piece of yours is on your TornW3B list' };
        // `plain`: the same write without inflation protection, for a TornW3B that calls the first one wrong.
        const inflation = !S.w3b.plain;
        return { diff, body: putBody(diff, { inflation }), plain: inflation && diff.set.length ? putBody(diff, { inflation: false }) : null, closed: !v.settings.open, all };
    }

    /**
     * The write itself. With inflation protection on it is a request TornW3B has not been seen to take (until
     * 1.3.2 it was sent off): called wrong (400), it is sent once more without, and written without from then on.
     */
    async function putOwn(w, by) {
        try {
            return await env.own.putList(w.body);
        } catch (error) {
            if (!(error && error.http === 400) || !w.plain) throw error;
            env.say('note', 'TornW3B refused the write of your list with inflation protection on', by + ' · ' + egMsg(error) + (error.said ? ' · it said: ' + error.said : '') + ' · sent once more without it');
            const answer = await env.own.putList(w.plain);
            S.w3b = { ...S.w3b, plain: true };
            touch('w3b');
            return answer;
        }
    }

    /**
     * Your list on TornW3B brought to your rate: only the set pieces are set or taken off, nothing else is touched.
     * Every write is in the problem log (the owner, 2026-10-12: if TornW3B refuses it, the zip alone must say why):
     * what was sent and what TornW3B answered; on a refusal its words, the request's shape and the whole of what
     * was sent - item ids and prices, which are your public list. Never the key (it rides in a header).
     * @param by 'your press' | 'by itself'
     */
    async function sendList(by = 'your press') {
        const w = listWrite();
        if (w.why) {
            env.say('note', 'Your list was not written to TornW3B', by + ' · ' + w.why);
            if (w.unread) throw new Error('Your list on TornW3B has not been read yet.');
            return;
        }
        syncAt = env.now();
        flags.held = '';
        const sent = w.diff.set.length + ' set, ' + w.diff.remove.length + ' taken off' + (w.closed ? ' · your shop is closed: the set pieces come off your list' : '') + (w.all ? ' · every price, so each has inflation protection on' : '');
        // The prices this write carries: the hour's table as it stands now (rateKeep).
        const rev = S.rate.table ? S.rate.table.rev : 0;
        let answer;
        try {
            answer = await putOwn(w, by);
        } catch (error) {
            if (egLocal(error)) env.say('note', 'Your list was not written to TornW3B', by + ' · ' + egMsg(error));
            else {
                // A request TornW3B calls wrong (400) is the same request the next time: by itself it is not sent
                // again until what would be sent changes. Your own press always sends.
                if (error && error.http === 400) listRefused = JSON.stringify(w.body);
                env.say('note', 'TornW3B refused the write of your list', by + ' · ' + egMsg(error) + (error && error.said ? ' · it said: ' + error.said : '') + ' · sent: ' + sent);
                env.say('note', 'TornW3B refused the write of your list: its shape', egShape(w.body) + (w.diff.remove.length ? ' · the last ' + w.diff.remove.length + ' with itemID only' : ''));
                const parts = [...egLines(w.diff.set.map((s) => s.itemID + ' $' + s.price + (s.was == null ? ' (new)' : ' (was $' + s.was + ')'))).map((l) => 'set: ' + l), ...egLines(w.diff.remove.map((r) => String(r.itemID))).map((l) => 'taken off: ' + l)];
                parts.forEach((l, k) => env.say('note', 'TornW3B refused the write of your list: what was sent, ' + (k + 1) + ' of ' + parts.length, l));
            }
            wrote({ ok: false, by, text: egMsg(error) + (error && error.said ? ' · it said: ' + error.said : '') });
            throw error;
        }
        listRefused = '';
        syncWhy = '';
        if (rev && S.rate.table && S.rate.table.rev === rev && S.rate.sent !== rev) { S.rate = { ...S.rate, sent: rev }; touch('rate'); }
        env.say('note', 'Your list written to TornW3B', by + ' · ' + sent + ' · it answered: ' + (answer == null ? 'nothing that could be read' : JSON.stringify(answer).slice(0, 180)));
        setKeyState('w3b', { ok: true, error: '' });
        if (w.all) S.w3b = { ...S.w3b, form: EG_LIST_FORM };
        foldOwnList(S, await env.own.readList(), env.now());
        touch('w3b');
        // TornW3B may still answer the list as it was a moment ago: read once more soon. A list that reads
        // differently after a write it took is said, with the pieces - and the same write is not sent by itself
        // again (stepOwn), or one price TornW3B reads another way would be written every two minutes for good.
        due.ownList = Math.min(due.ownList || Infinity, env.now() + EG_LIST_AGAIN_MS);
        const left = listWrite();
        listStuck = left.body ? JSON.stringify(left.body) : '';
        if (left.body) {
            const now = new Map(S.w3b.list);
            const lines = egLines([...left.diff.set.map((x) => x.itemID + ' yours $' + x.price + ', reads ' + (now.has(String(x.itemID)) ? '$' + now.get(String(x.itemID)).value : 'no price')), ...left.diff.remove.map((x) => x.itemID + ' still on it')]);
            lines.forEach((l, k) => env.say('note', 'TornW3B took the write and your list there still reads differently, ' + (k + 1) + ' of ' + lines.length, l));
        }
        wrote({ ok: true, by, text: w.diff.set.length + ' set, ' + w.diff.remove.length + ' taken off', left: left.body ? left.diff.set.length + left.diff.remove.length : 0 });
    }

    /**
     * The last write of your list and how it ended, kept: the panel says "sent" or "refused" with its time (the
     * owner, 2026-10-12: "i need to know if it is sending, sent, or refused/error").
     */
    function wrote(w) {
        S.w3b = { ...S.w3b, wrote: { at: env.now(), ...w } };
        touch('w3b');
    }

    /** "Keep it at my rate by itself" is on and nothing is sent: the reason, said once each time it changes. */
    function syncQuiet(why) {
        flags.held = why;
        if (why === syncWhy) return;
        syncWhy = why;
        env.say('note', 'Keeping your TornW3B list at your rate: nothing sent', why);
    }

    /**
     * @param what 'list' (your price list: shown on its panel) or 'receipts' (shown with the receipts)
     * TornW3B refusing the key (401, or 403 "The API key must match the API key linked to this user ID in our
     * database") is said on the key's own box, and nothing of yours is asked of TornW3B again until the key is
     * changed: on 2026-10-11 the badge said "working" all evening while every read of your trades was refused.
     */
    function w3bFailed(error, what = 'list') {
        if (egLocal(error)) return;
        // A 403 that does not name the key (a block, a page that moved) is no verdict on it: asked again later.
        const key403 = !!error && error.http === 403 && /api key|invalid key/i.test(String(error.said || ''));
        if (error && (error.http === 401 || key403)) setKeyState('w3b', { ok: false, error: key403 ? 'TornW3B refuses this key for your Torn id: it is not the one registered there' : 'TornW3B does not know this key' });
        S.w3b = { ...S.w3b, [what === 'receipts' ? 'receiptsError' : 'error']: egMsg(error) };
        touch('w3b');
        // Once for each thing it said: the request itself is in the log every time it fails.
        sayOnce('w3b-' + what + '-' + egMsg(error), what === 'receipts' ? 'TornW3B: your receipts' : 'TornW3B: your own list', egMsg(error) + (error && error.said ? ' · it said: ' + error.said : ''));
    }

    /**
     * A receipt for one finished trade, made on TornW3B from your list there. Its link is kept with the trade:
     * it is what you send the seller. The request goes in the form TornW3B last took, then in the others
     * (core/tw3b-list.js RECEIPT_FORMS) while it calls each wrong (400) - every form's shape is in the log, names
     * and kinds, no value. A press that made nothing says why on the trade's row (`tried[id].why`).
     * @param by 'your press' | 'by itself'
     */
    function makeReceipt(id, by = 'your press') {
        const f = S.trades.finished.find((x) => x.id === id);
        if (!f || flags.receipt) return;
        flags.receipt = id;
        const tried = (patch) => { S.w3b = { ...S.w3b, tried: { ...(S.w3b.tried || {}), [id]: { n: 0, ...((S.w3b.tried || {})[id] || {}), at: env.now(), forms: RECEIPT_FORMS, ...patch } } }; touch('w3b'); };
        const first = Number.isInteger(S.w3b.receiptForm) && S.w3b.receiptForm < RECEIPT_FORMS ? [S.w3b.receiptForm] : [];
        const forms = [...new Set([...first, ...Array(RECEIPT_FORMS).keys()])];
        (async () => {
            let last = null;
            for (const form of forms) {
                const body = receiptBody(id, f.rows || [], f.whoId, form);
                try {
                    const json = await env.own.makeReceipt(body);
                    if (S.w3b.receiptForm !== form) S.w3b = { ...S.w3b, receiptForm: form };
                    return { json, form };
                } catch (e) {
                    last = e;
                    if (!(e && e.http === 400)) break;
                    env.say('note', 'TornW3B called a receipt request wrong', 'trade ' + id + ' · form ' + (form + 1) + ' of ' + RECEIPT_FORMS + ' · sent: ' + egShape(body) + (e.said ? ' · it said: ' + e.said : ''));
                }
            }
            throw last;
        })()
            .then(({ json, form }) => {
                const r = readReceipt(json, f.paid);
                foldReceipt(S, id, { ...r, rows: f.rows || [] }, env.now());
                const { [id]: done, ...rest } = S.w3b.tried || {};
                S.w3b = { ...S.w3b, tried: rest };
                touch('w3b');
                env.say('note', 'Receipt made on TornW3B', by + ' · trade ' + id + ' · form ' + (form + 1) + ' · ' + (r.url || 'its answer named no link: ' + egShape(json)) + ' · its total ' + egMoney(r.total) + ', you paid ' + egMoney(f.paid));
                if (!r.ok) env.say('note', "TornW3B's receipt differs from what you paid", 'trade ' + id + ': theirs ' + r.total + ', yours ' + f.paid + (r.missing.length ? ', not on your list: ' + r.missing.join(', ') : ''));
            })
            .catch((e) => {
                if (egLocal(e)) { tried({ why: egMsg(e) }); return; }
                const wrong = !!e && e.http === 400;
                // Called wrong in every form: not sent by itself for this trade again. Anything else is a verdict
                // on the key, or a failure that may pass (said with your receipts).
                if (wrong) env.say('note', 'TornW3B called the receipt request wrong in every form', 'trade ' + id + ' · it is not sent by itself for this trade again - your own press still sends it');
                else w3bFailed(e, 'receipts');
                tried({ ...(wrong ? { n: EG_RECEIPT_TRIES } : {}), why: (wrong ? 'TornW3B does not take the request' : egMsg(e)) + (e && e.said ? ': ' + String(e.said).slice(0, 80) : '') });
            })
            .finally(() => { flags.receipt = null; flush(); env.changed(); });
    }

    /**
     * A trade that just finished gets its receipt by itself - once your list on TornW3B holds a price for each of
     * its pieces, since TornW3B makes the receipt from that list. Older trades keep their button.
     */
    function autoReceipt(now) {
        // Not before your receipts were read: one made on TornW3B's own page may be this trade's already.
        if (flags.receipt || !S.w3b.list || !receiptsSeen) return;
        claimOwn();
        const have = new Set(S.w3b.receipts.map(([id]) => id));
        const listed = new Map(S.w3b.list);
        const tried = S.w3b.tried || {};
        for (const f of S.trades.finished) {
            if (have.has(f.id) || !(now - f.t < EG_RECEIPT_WITHIN_MS)) continue;
            // What was tried in the request's older forms does not count: the forms have changed since.
            const t = tried[f.id] && tried[f.id].forms === RECEIPT_FORMS ? tried[f.id] : { n: 0, at: 0 };
            if (t.n >= EG_RECEIPT_TRIES || now - t.at < EG_RECEIPT_GAP_MS) continue;
            if (!(f.rows || []).length || !(f.rows || []).every((r) => listed.has(String(r.id)))) continue;
            const kept = Object.fromEntries(Object.entries(tried).filter(([, x]) => now - x.at < 2 * EG_RECEIPT_WITHIN_MS));
            S.w3b = { ...S.w3b, tried: { ...kept, [f.id]: { n: t.n + 1, at: now, forms: RECEIPT_FORMS } } };
            touch('w3b');
            makeReceipt(f.id, 'by itself');
            return;
        }
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
        planKeep();
        const full = keyOk('full');
        // Your inventory first: once the count has begun nothing is asked ahead of it.
        // (It begins after the history is in: your newest buys say what the pieces cost.)
        const fullPending = full && keyState.full.ok == null;
        const history = S.ledger.tradesBackfilled && !fullPending && (!(full && keyState.full.ok) || S.log.backfilled);
        if (history || S.stock.invAt || now - started > EG_HISTORY_WAIT_MS) run('inventory', READ_EVERY.inventory, readInventory);
        if (full && keyState.full.ok == null) run('fullKey', READ_EVERY.self, readFullKey, { key: 'full' });
        if (full && keyState.full.ok) {
            if (now - S.types.at > READ_EVERY.types) run('types', RETRY_MS, readTypes);
            // After a buy seen on a page the log is asked a few seconds, twenty seconds and a minute on.
            if (logSoon.length && now >= logSoon[0] && !busy.log) { logSoon = logSoon.filter((t) => t > now); due.log = 0; }
            if (S.types.at) run('log', READ_EVERY.log, readLog, { key: 'full' });
        }
        run('finished', READ_EVERY.finished, readFinished);
        run('money', READ_EVERY.money, readMoney);
        run('points', READ_EVERY.points, readPoints);
        run('trades', READ_EVERY.trades, readTrades);
        run('summary', s.readMin * EG_MIN, readSummary, { key: null });
        run('thread', READ_EVERY.thread, readThread);
        // The list against what was read since the last pass - not after every answer, but never later than this.
        if (tidyDue && now - tidyAt >= EG_CALM_MS) tidyList();
        const v = calm();
        readMarkets(v);
        if (S.summary.at) readListings(v);
        readShops(v);
        readBids();
        rateKeep(now, v);
        stepOwn(now);
        if (v.ready && now - (due.day || 0) > 0) { due.day = now + EG_MIN; recordDay(S, v, now); touch('hist'); }
        flush();
    }

    function stepOwn(now) {
        const keep = !!settings().w3bSync;
        if (!keep) { syncWhy = ''; flags.held = ''; }
        if (!keyOk('w3b') || !S.self.id) {
            if (keep) syncQuiet(!S.self.id ? 'your Torn id is not known yet' : 'the key you registered on TornW3B is not set, or TornW3B refuses it (its box in Settings says which)');
            return;
        }
        run('ownList', READ_EVERY.ownList, () => readOwnList().catch((e) => { w3bFailed(e); throw e; }), { key: null });
        run('receipts', READ_EVERY.receipts, () => readReceipts().catch((e) => { w3bFailed(e, 'receipts'); throw e; }), { key: null });
        autoReceipt(now);
        if (!keep) return;
        if (!S.w3b.list) { syncQuiet('your list on TornW3B has not been read yet'); return; }
        if (flags.w3b || now - syncAt < EG_SYNC_GAP_MS) return;
        const v = calm();
        if (!v.ready) { syncQuiet('not everything is read yet'); return; }
        // Open: your prices are fixed for an hour (rateKeep), and the list is written whenever it does not say
        // them - each hour when they are fixed anew, at once when the safety brought them down, when a piece
        // comes on or off (you hold too many), and when a price was changed on TornW3B's own page (the owner,
        // 2026-10-12: "i accidentally changed it, and it didnt automatically send it"). Until 1.3.2 it was
        // written once per fixing only: a list changed inside the hour waited for the next one.
        // Closed: the set pieces come off your list, once.
        if (v.settings.open && !S.rate.table) { syncQuiet('your prices are not fixed yet: the points price or a market value is not read'); return; }
        const w = listWrite(v);
        if (!w.body) {
            listStuck = '';
            const t = S.rate.table;
            if (v.settings.open && t && S.rate.sent !== t.rev) { S.rate = { ...S.rate, sent: t.rev }; touch('rate'); }
            syncQuiet(w.why);
            return;
        }
        const sending = JSON.stringify(w.body);
        if (sending === listRefused) { syncQuiet('TornW3B called this same request wrong: it is not sent again by itself until your prices change - your own press still sends it'); return; }
        if (sending === listStuck) { syncQuiet('TornW3B took this same write and its list still reads differently: it is not sent again by itself until something changes - your own press still sends it'); return; }
        flags.w3b = true;
        sendList('by itself').catch(w3bFailed).finally(() => { flags.w3b = false; flush(); env.changed(); });
    }

    // ---- the shared server ------------------------------------------------------------------------------------------------

    /**
     * What Torn Archive tells the shared server (core/server.js serverBody takes it): the bazaars it knows sell a
     * piece, the ones on your list and under your rate, what each piece is worth to you, what you just bought at a
     * bazaar, and which of TornW3B's lists it read.
     */
    function serverWant() {
        const now = env.now();
        const v = calm();
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
        for (const b of S.seen) if (b.whoId && !b.no && b.t > S.log.until && now - b.t < SERVER_BOUGHT_MS) bought.push({ whoId: b.whoId, id: b.id, qty: b.qty, price: b.price, t: b.t });
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
            const v = calm();
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
        // A bazaar of your list among what it read: the list follows at once. Else at the next calm pass.
        const mine = new Set(S.cart.map((l) => String(l.whoId)));
        const named = [...((answer && Array.isArray(answer.reads) ? answer.reads : []).map((r) => r && r.id)), ...((answer && Array.isArray(answer.seen) ? answer.seen : []).map((p) => (Array.isArray(p) ? p[0] : null)))];
        tidySoon(named.some((id) => id != null && mine.has(String(id))));
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

    /** Your items can be asked for: there is a key that works, and Torn has said who you are and what its items are. */
    const canCount = () => !env.paused() && env.hasKey('limited') && !keyState.limited.error && !!S.self.id && !!S.items.at && !!S.stock.invAt;
    let stockAsked = 0;

    /**
     * "Read" on your stock, pressed on a Torn page: your items, and your log where a Full key reads it, ahead of
     * anything else. The prices are left as they are. Not more often than every ten seconds, however it is pressed.
     */
    function readStock() {
        const now = env.now();
        if (now - stockAsked < EG_STOCK_PRESS_MS) return;
        stockAsked = now;
        due.inventory = 0;
        if (logRead()) due.log = 0;
        if (canCount()) run('inventory', READ_EVERY.inventory, readInventory);
        step();
    }

    /** "Read now": everything is due. */
    function readNow() {
        // Nothing looked at before this press counts until it is looked at again (a read of the last moments is
        // the newest Torn has: it stands). The bazaars of your list and the ones a list would use are asked first.
        S.fresh = { since: env.now() - EG_JUST_READ_MS };
        enBump(S, null);
        cache = null;
        last = null;
        for (const k of Object.keys(due)) due[k] = 0;
        for (const kind of Object.keys(per)) if (kind !== 'listings' && kind !== 'bids') for (const id of Object.keys(per[kind])) per[kind][id].due = 0;
        if (looked.id) looked = { ...looked, at: env.now() };
        said.clear();
        off.clear();
        // Your items first: asked ahead of every other read of this press (the owner, 2026-10-11: "if i also press
        // read now, can it prioritize reading my inventory?").
        if (canCount()) run('inventory', READ_EVERY.inventory, readInventory);
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

    const stops = () => { const v = view(); return runOrder(stopsOf(S.cart, (id) => (viewPiece(v, id) || {}).worth || 0), S.run); };
    const idle = () => { S.run = { ...RUN_IDLE }; };
    /** A piece as a list takes it: `take` units, each under `takeLine` (view.js listPieces), and its rows that count. */
    const asListed = (p) => listPieces([p])[0];
    const counting = (p, line) => p.offers.filter((o) => o.ok !== false && !o.out && o.price < line);

    const actions = {
        cart(itemId, place) {
            const p = viewPiece(view(), itemId);
            const offer = p && p.offers.find((o) => placeOf(o) === place);
            if (!offer) return;
            // Your own press: any listing may go on. The Item Market's line is its rows under the Stretch line.
            S.cart = toggleLine(S.cart, { ...p, worth: p.lineS }, offer);
            idle();
            touch('cart', 'run');
        },
        drop(key) { S.cart = dropLine(S.cart, key); idle(); touch('cart', 'run'); },
        // One piece, every listing of it that counts (checked, where you buy, a Buy on its set), in one press. With
        // nothing more to add, the press takes the piece off the list.
        cartAll(itemId) {
            const p = viewPiece(view(), itemId);
            if (!p) return;
            const next = addAll(S.cart, asListed(p), counting(p, p.takeLine));
            S.cart = next.length > S.cart.length ? next : dropPiece(S.cart, itemId);
            idle();
            touch('cart', 'run');
        },
        // A list of one piece alone, in place of the list on hand: every listing of it that counts, cheapest first.
        listOnly(itemId) {
            const p = viewPiece(view(), itemId);
            if (!p) return;
            S.cart = addAll([], asListed(p), counting(p, p.takeLine));
            idle();
            touch('cart', 'run');
            due.inventory = 0;
            if (logRead()) due.log = 0;
        },
        // A list is made from the count as it stands, and Torn is asked for its own at once: the list follows it.
        // `kind` 'hot': only what "Do now" counted - under what you pay your sellers. Else every Buy, and the
        // Stretch that finishes a set. Made from the shortlists the view keeps (core/shortlist.js): the same list
        // the whole pile makes, without sorting it.
        makeList(kind) {
            S.plan = { targets: null, at: 0, key: '' };
            touch('plan');
            const v = view();
            const pieces = listPieces(v.pieces);
            S.cart = fillList(kind === 'hot' ? cheapPieces(pieces) : pieces, (id) => { const p = viewPiece(v, id); return p ? p.offers.filter((o) => o.ok !== false && !o.out) : []; });
            idle();
            touch('cart', 'run');
            due.inventory = 0;
            if (logRead()) due.log = 0;
        },
        clearList() { S.cart = []; idle(); touch('cart', 'run'); },
        // "Copy the post" pressed: what that post says is what your thread is taken to say from now on.
        posted() { S.posted = { ...view().prices.forum.says, at: env.now() }; touch('posted'); },
        // `place` (Next pressed on a Torn page): where you stand. A bazaar of the list that is not the stop the run
        // is on becomes that stop first - you did not follow the order - and Next goes on from there; the stops
        // passed over stay on the list. (Until 1.3.0 Next was only offered on the current stop.)
        run(op, place = null) {
            const list = stops();
            if (op === 'start') { S.run = { ...runStart(list), began: env.now() }; due.inventory = 0; if (logRead()) due.log = 0; }
            else if (op === 'stop') idle();
            else {
                countRun();
                if (S.run.on && place && place !== S.run.place && list.some((s) => s.place === place)) S.run = { ...S.run, place, at: list.findIndex((s) => s.place === place) };
                S.run = runNext(S.run, list);
                // Over: what you took leaves the list, what you skipped stays on it. The run is summed here, once:
                // its counts are of the lines as they were, and those lines are shorter from now on.
                if (S.run.done) {
                    const end = runView(S.run, list);
                    S.cart = listAfterRun(S.cart, S.run);
                    S.run = { ...S.run, took: {}, sum: { got: end.got, units: end.units, skipped: end.skipped } };
                }
            }
            touch('cart', 'run');
            // The stop you are sent to is confirmed with Torn at once.
            const at = runAt(S.run, stops());
            const cur = at >= 0 ? stops()[at] : null;
            if (cur && !cur.im && per.shops[String(cur.whoId)]) per.shops[String(cur.whoId)].due = 0;
        },
        read: readNow,
        readStock,
        // `false`: nothing the screen shows changed - the hub is not drawn again for it (a draw that asked for a
        // look that asked for a draw went round every 60 ms on the Buy page until 1.3.0).
        look(itemId) { const id = String(itemId || ''); if (id === looked.id && env.now() - looked.at < EG_MIN) return false; looked = { id, at: env.now() }; step(); return false; },
        w3b(op) {
            if (flags.w3b) return;
            flags.w3b = true;
            (op === 'send' ? sendList() : readOwnList()).catch(w3bFailed).finally(() => { flags.w3b = false; flush(); env.changed(); });
        },
        receipt(tradeId) { makeReceipt(String(tradeId)); },
    };

    function act(name, ...args) {
        if (!actions[name]) return false;
        // Every press is in the problem log, with when: a press that seemed to do nothing can be found in the zip.
        if (name !== 'look') env.say('note', 'Pressed: ' + name, args.filter((a) => a != null).map(String).join(' ') || null);
        if (actions[name](...args) === false) return true;
        // Your own press is never calm: the next pass decides from a view worked out after it.
        last = null;
        planKeep();
        flush();
        env.changed();
        return true;
    }

    /** What a Torn page saw: a buy on a bazaar, a press of EXCHANGE, your thread's title. */
    /** Your log, asked a few seconds, twenty seconds and a minute from now (only read with a Full key). */
    function askLogSoon(now) {
        if (logRead()) logSoon = [...logSoon.filter((t) => t > now), ...EG_LOG_AFTER_BUY_MS.map((d) => now + d)].sort((a, b) => a - b).slice(-6);
    }

    function note(kind, what) {
        const now = env.now();
        if (kind === 'buy') {
            // What you took is in your stock at once, and off the list (or ticked on it, while a run is on).
            if (noteSeenBuy(S, what, now, { noLog: !logRead() })) {
                touch('seen', 'stock');
                countRun();
                tidyList();
                // Torn's log is the judge of the buy: asked a few seconds, twenty seconds and a minute after it.
                askLogSoon(now);
                due.inventory = Math.min(due.inventory || 0, now + EG_INV_AFTER_BUY_MS);
            }
        // Torn's own Buy pressed on a listing in a Torn tab. Nothing is counted for it - Torn may still ask "are
        // you sure", or refuse - but its log is asked soon after: what was bought is in it. Nothing on the screen
        // changes by the press itself.
        } else if (kind === 'press') { askLogSoon(now); return; }
        // Torn's log has the exchange at once: asked a few seconds after the press, so the count rests on it.
        else if (kind === 'swap') { noteSwap(S, what, now, { noLog: !logRead() }); touch('swaps', 'book', 'stock'); askLogSoon(now); }
        else if (kind === 'thread') { noteThread(S, what, now); touch('thread'); }
        // A Torn tab sees a trade that is not as it was read: read again now, not at the minute.
        else if (kind === 'trade') { due.trades = 0; again(); }
        // A bazaar's own page, in front of you: the newest look at it there is.
        // (Also a listing the page proved gone, a bazaar with nothing in it, and "Gone" pressed on a line.)
        else if (kind === 'shop') { if (notePage(S, what, now)) { cache = null; tidyList(); } }
        // What a Torn tab saw is never calm either.
        last = null;
        flush();
        env.changed();
    }

    return {
        state: S, step, view, calm, act, note, readNow, keyChanged, flush, serverWant, serverTook, serverForget,
        serverMark: () => ({ seq: S.server.seq, seenAt: S.server.seenAt }),
        keys: () => keyState,
        // `wrote`: the last write of your list and how it ended; `next`: when a write by itself may go again.
        busy: () => ({ ...flags, wrote: S.w3b.wrote || null, next: syncAt ? syncAt + EG_SYNC_GAP_MS : 0 }),
        mv: mvOf(S),
        /** Whether the settings changed something the reads depend on. */
        settingsChanged() {
            cache = null;
            // Your own press is never calm: what you pay is fixed from a view worked out after it (rateKeep).
            last = null;
            syncAt = 0;
            // A place switched off ("Buy from") leaves the list at once - but never a line you already took from.
            const left = dropPlaces(S.cart, buysFrom(settings()), (l) => S.run.on && S.run.took && S.run.took[l.key] > 0);
            if (left.length !== S.cart.length) { S.cart = left; idle(); touch('cart', 'run'); }
        },
    };
}

/** Every piece id, for callers that only have the engine. */
export const ENGINE_ALL_PIECES = ENGINE_PIECES;
