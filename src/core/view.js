// The view: everything the hub's pages and the box on Torn's pages show, worked out once from what the engine holds.
// Pure: the engine hands in settings, the stock count, prices, the points market, the books and the open trades;
// out comes one plain object. No page, no storage, no clock of its own. The pages only format it.

import { SETS, setStock, autoTargets, setMarketValue, setValue, ratePrice, rateSet, tradeOffer, tradeMessage, forumText, threadCheck, moneyShare, shortName, setByKey } from './sets.js';
import { setsCtx } from './settings.js';
import { safeWorth, pieceBrings, tradeMargin, placeMargin, mendRate } from './margin.js';
import { fillPlan, stopsOf, runView, onList, listAfterRun } from './shopping.js';
import { listPrice, priceLevels, usualLevel, pointsCheap } from './points.js';
import { avgBook, heldByDay, mugCheck, profitBuckets, profitSum, runningTotal, poolSum, poolSetCost } from './books.js';
import { lotTable, sellPlan } from './lots.js';
import { hotListings, shopVerdict, shareCovers } from './verdict.js';
import { tradeTurn, agoWords } from './trades.js';
import { listDiff, desiredList, listMatches, listedUntil } from './tw3b-list.js';

const vwNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const vwWhole = (v) => Math.max(0, Math.floor(vwNum(v)));
const vwSum = (xs, f) => (xs || []).reduce((a, x) => a + f(x), 0);
const VW_DAY_MS = 86400000;
const vwDay = (t) => new Date(t).toISOString().slice(0, 10);

/** The two sets' colours and short names, as the pages name them. */
export const SET_LOOK = { plushie: { label: 'Plushie', color: 'var(--s-plush)' }, flower: { label: 'Flower', color: 'var(--s-flower)' } };

/** The sets you trade. */
export const setsTraded = (settings) => SETS.filter((s) => settings.which[s.key] !== false);

/** Every piece id the Archive keeps count of and may put on your TornW3B list: all 24, whatever is switched on. */
export const ALL_PIECE_IDS = SETS.flatMap((s) => s.pieces.map((p) => String(p.id)));

/** The k-th set bought fresh costs the k-th cheapest unit of every piece. @returns [cost of set 1, set 2, ...] */
export function setLadder(set, offersOf, most = 500) {
    const ladders = set.pieces.map((p) => {
        const units = [];
        const all = [...((offersOf && offersOf(p.id)) || [])].filter((o) => o.price > 0 && o.qty > 0).sort((a, b) => a.price - b.price);
        for (const o of all) { for (let k = 0; k < vwWhole(o.qty) && units.length < most; k++) units.push(o.price); if (units.length >= most) break; }
        return units;
    });
    const depth = Math.min(...ladders.map((l) => l.length));
    const out = [];
    for (let k = 0; k < depth; k++) out.push(ladders.reduce((s, l) => s + l[k], 0));
    return out;
}

const VW_DEPTH_AT = [1, 10, 50, 100, 250, 500];
/** The stops of the list the dashboard names under "Do now": as many as its card ever has room for. */
const VW_FIRST_STOPS = 12;

/**
 * @param i {
 *   now, settings (archiveSettings)
 *   held(id), stockAt            the stock count and when Torn's inventory was last read (0 = never)
 *   mv(id)                       Torn's market value
 *   offers(id), pricesAt         bazaar and Item Market listings of a piece, cheapest first or not
 *   priced(id)                   (optional) whether the piece's listings were read at all
 *   topBid(id)                   { pct, name } the best any other buyer pays, as a percent of market value, or null
 *   listings, pointsAt           the points market (points.js parsePointsMarket)
 *   days, wallDays               the lowest listing and the first wall by day (points.js recordPrice)
 *   lots, mineLots               lots.js's record, and your own lots [{ points, wait }]
 *   pool, book, mugs, outs       books.js: the cost pool, the points book's entries, mugs, money that left your hand
 *   money                        { points, onHand, vault }, each null when not read
 *   trades, finished             open trades (trades.js parseTrade) and finished ones [{ id, who, whoId, t, units, paid, mv }]
 *   rows                         the Ledger's rows of pieces (core/ledger.js)
 *   cart, run                    the shopping list and the run (shopping.js)
 *   hotSince                     verdict.js hotSince()
 *   thread                       { id, title, at } your buying thread as Torn has it, or null
 *   w3b                          { list (Map | null), listAt, receipts (Map), lastReceiptAt, error }
 *   hist                         { low: { id: [{ day, low }] }, pays: [{ day, plushie, flower }], share: [{ day, share }] }
 *   names(id)                    a player's name by id, when known
 * }
 */
export function archiveView(i) {
    const now = i.now || Date.now();
    const settings = i.settings;
    const ctx = setsCtx(settings);
    const on = setsTraded(settings);
    const money = i.money || {};
    const mv = (id) => vwWhole(i.mv(id));
    const offersOf = (id) => [...((i.offers && i.offers(id)) || [])].filter((o) => o.price > 0 && o.qty > 0).sort((a, b) => a.price - b.price);

    // ---- the points price --------------------------------------------------------------------------------------------
    const price = listPrice(i.listings || [], settings.pointsRule);
    const pointsPrice = price ? price.price : 0;
    const level = usualLevel(i.days || [], now);
    const cheap = pointsCheap(price ? price.lowest : 0, level);

    // ---- the books ---------------------------------------------------------------------------------------------------
    const pointsHeld = money.points == null ? null : vwWhole(money.points);
    const plain = avgBook(i.book || [], pointsPrice);
    const before = pointsHeld == null ? null : Math.max(0, pointsHeld - plain.left);
    const book = settings.beforeEach > 0 && before ? avgBook(i.book || [], pointsPrice, { points: before, each: settings.beforeEach }) : plain;
    const pool = poolSum(i.pool);
    const cash = money.onHand == null && money.vault == null ? null : vwWhole(money.onHand) + vwWhole(money.vault);
    const share = moneyShare({ pieces: pool.cost, points: book.cost, cash: money.onHand, vault: money.vault });

    // ---- the sets and their pieces -----------------------------------------------------------------------------------
    const cartList = i.cart || [];
    const sets = [];
    const pieces = [];
    const heldOf = (set) => { const m = {}; for (const p of set.pieces) m[p.id] = vwWhole(i.held(p.id)); return m; };
    // "From my cash": one purse for all the sets - your cash, no more than keeps sets and points under their share
    // of your money - spent on the pieces you do not hold yet.
    const room = settings.shareMax > 0 ? Math.max(0, share.total * settings.shareMax / 100 - share.inSets) : Infinity;
    const budget = cash == null ? null : Math.min(cash, room);
    const auto = settings.targetMode === 'number' ? null : autoTargets(on, heldOf, budget, (id) => ratePrice(mv(id), settings.pct));
    // While a list is on hand, the sets it was made for stay: your money moves with every buy and sale (and Torn
    // says so a minute before your stock does), and a list whose numbers move under you cannot be bought.
    const kept = auto && i.kept ? i.kept : null;
    for (const set of on) {
        const heldMap = heldOf(set);
        const rate = rateSet(set, mv, settings.pct, pointsPrice, settings.least);
        const target = kept && Number.isInteger(kept[set.key]) ? kept[set.key] : auto ? auto[set.key] : settings.target;
        const stock = setStock(set, heldMap, target);
        const value = setValue(set, pointsPrice);
        const ladder = setLadder(set, offersOf);
        const mine = stock.pieces.map((p) => {
            const offers = offersOf(p.id);
            const worth = safeWorth(p.id, mv, pointsPrice, settings.least);
            const pay = ratePrice(mv(p.id), settings.pct);
            const under = offers.filter((o) => o.price < worth);
            const bid = (i.topBid && i.topBid(p.id)) || null;
            return {
                ...p, set: set.key, short: shortName(p.name), target: stock.target, mv: mv(p.id), pay, worth,
                brings: Math.floor(pieceBrings(p.id, mv, pointsPrice)),
                offers, low: offers[0] || null, lowBazaar: (offers.find((o) => o.src !== 'market') || {}).price || 0,
                under: { units: vwSum(under, (o) => vwWhole(o.qty)), places: under.length },
                other: bid && bid.pct > 0 ? { pct: bid.pct, name: bid.name || '' } : null,
                hist: (((i.hist && i.hist.low) || {})[p.id] || []).slice(-7).map((d) => d.low),
                listed: onList(cartList, p.id),
            };
        });
        // Shortest first: the piece holding the next set back leads.
        mine.sort((a, b) => a.held - b.held || a.rank - b.rank);
        const own = poolSetCost(i.pool, set);
        sets.push({
            key: set.key, name: set.name, museum: set.museum, hash: set.hash, points: set.points, ...SET_LOOK[set.key],
            full: stock.full, target: stock.target, value, rate, pieces: mine,
            // What a set costs you: from what you paid, or at your rate while there is no buy on record.
            cost: own || rate.cost, costKnown: own > 0,
            // Bought fresh at the cheapest listings now: what one set leaves.
            fresh: ladder.length ? ladder[0] : 0, pays: ladder.length && value ? value - ladder[0] : null,
            // False until every piece's listings were read once: "no price" then means not read yet.
            priced: !i.priced || set.pieces.every((p) => i.priced(p.id)),
            ladder,
            needUnits: vwSum(mine, (p) => p.need),
        });
        pieces.push(...mine);
    }
    const pieceOf = (id) => pieces.find((p) => String(p.id) === String(id)) || null;
    const worthOf = (id) => (pieceOf(id) || {}).worth || 0;
    const fullAll = vwSum(sets, (s) => s.full);
    const needUnits = vwSum(pieces, (p) => p.need);
    const fullAfter = (extra) => Object.fromEntries(sets.map((s) => [s.key, Math.min(...s.pieces.map((p) => p.held + vwWhole(extra(p))))]));

    // ---- buying ------------------------------------------------------------------------------------------------------
    const marginCtx = { mv, pointsPrice, leastPct: settings.least };
    const plan = fillPlan(pieces, offersOf);
    const planStops = stopsOf(plan, worthOf);
    const stops = stopsOf(cartList, worthOf).map((s) => ({ ...s, margin: placeMargin(s.lines.map((l) => ({ id: l.id, take: l.q, price: l.price })), marginCtx) }));
    // `took` (line key -> units you took) rides along: the box on a bazaar says it per line.
    const run = { ...runView(i.run, stops), took: (i.run && i.run.took) || {} };
    const hot = hotListings(pieces, offersOf);
    const cartCost = vwSum(stops, (s) => s.cost);
    const depthN = Math.min(...sets.map((s) => s.ladder.length), Infinity);
    const depthX = VW_DEPTH_AT.filter((k) => k <= depthN);
    const buy = {
        plan: {
            units: vwSum(plan, (l) => l.q), need: needUnits, stops: planStops.length, cost: vwSum(planStops, (s) => s.cost),
            full: fullAfter((p) => onList(plan, p.id)),
        },
        stops, run,
        units: vwSum(stops, (s) => s.units), cost: cartCost, gain: vwSum(stops, (s) => s.gain),
        full: fullAfter((p) => p.listed),
        left: listAfterRun(cartList, i.run),
        vault: money.onHand == null ? null : Math.max(0, cartCost - vwWhole(money.onHand)),
        hot, hotUnits: vwSum(hot, (h) => h.q), hotStops: new Set(hot.map((h) => (h.im ? 'im' : h.whoId ?? h.who))).size,
        depth: depthX.length >= 2 ? {
            x: depthX, series: sets.map((s) => ({ key: s.key, name: s.label, color: s.color, data: depthX.map((k) => s.ladder[k - 1]) })),
            value: sets[0] ? sets[0].value : 0, safe: sets[0] ? Math.floor(sets[0].value / (1 + settings.least / 100)) : 0,
        } : null,
    };

    // ---- the trades open with you ------------------------------------------------------------------------------------
    const stockOf = (set) => { const s = sets.find((x) => x.key === set.key); return { pieces: s ? s.pieces : [] }; };
    const nameOf = (id) => { const p = pieceOf(id); if (p) return p.name; const set = SETS.find((s) => s.pieces.some((x) => String(x.id) === String(id))); return set ? set.pieces.find((x) => String(x.id) === String(id)).name : (i.itemName && i.itemName(id)) || 'Item ' + id; };
    const receipts = (i.w3b && i.w3b.receipts) || new Map();
    const open = (i.trades || []).map((t) => {
        const offer = tradeOffer(t.theirs.map((x) => ({ id: x.id, name: nameOf(x.id), qty: x.qty })), { settings: ctx, stockOf, mv, pct: settings.pct });
        const margin = tradeMargin(offer, marginCtx);
        const total = offer.all.total;
        const state = tradeTurn(t, total);
        return {
            id: t.id, who: t.who, whoId: t.whoId, modified: t.modified, ago: agoWords(t.modified, now), state,
            rows: offer.rows, items: offer.rows.length, units: offer.all.items, total, needTotal: offer.need.total, needUnits: offer.need.items,
            margin, myMoney: t.myMoney, other: t.other,
            message: total ? `Hi! At ${settings.pct}% of market value that is $${total.toLocaleString('en-US')} for all ${offer.all.items.toLocaleString('en-US')}. I will add the money now, thank you.` : '',
            messageNeed: tradeMessage(offer, { open: settings.open }),
            // Money to take out of the vault just before you pay: what the trade still wants, over what is on hand.
            vault: money.onHand == null ? null : Math.max(0, total - t.myMoney - vwWhole(money.onHand)),
            receipt: receipts.get(String(t.id)) || null,
            after: offer.rows.filter((r) => r.state !== 'other').map((r) => ({ id: r.id, name: r.name, held: r.held, q: r.qty, take: r.take, target: r.target })),
            full: fullAfter((p) => vwSum(offer.rows.filter((r) => String(r.id) === String(p.id)), (r) => r.qty)),
        };
    });
    const mineTurn = open.filter((t) => t.state === 'you');
    const trades = {
        open, wait: mineTurn.length, waitMoney: vwSum(mineTurn, (t) => t.total),
        // listed: your list on TornW3B has a price for each of its pieces - a receipt is made from that list.
        finished: (i.finished || []).slice(0, 60).map((f) => ({ ...f, ago: agoWords(f.t, now), rate: f.mv > 0 ? f.paid / f.mv * 100 : 0, receipt: receipts.get(String(f.id)) || null, listed: !!(i.w3b && i.w3b.list) && (f.rows || []).length > 0 && (f.rows || []).every((r) => i.w3b.list.has(String(r.id))) })),
        receiptsError: (i.w3b && i.w3b.receiptsError) || '',
    };

    // ---- points ------------------------------------------------------------------------------------------------------
    const levels = priceLevels(i.listings || []);
    let ahead = 0;
    const ladder = levels.slice(0, 14).map((lv) => { const row = { price: lv.price, qty: lv.qty, lots: lv.lots, ahead, wall: !!price && lv.price === price.wall }; ahead += lv.qty; return row; });
    const table = lotTable((i.lots && i.lots.gone) || [], i.mineLots || [], now);
    const sell = sellPlan(book.left, table);
    const mugs = mugCheck(book.rows.filter((r) => r.kind === 'sold').map((r) => ({ id: r.id, t: r.t, got: Math.round(r.mine * r.each) })), i.mugs || [], i.outs || []);
    const hold = cheap && settings.cheapRule === 'hold';
    const points = {
        price: pointsPrice, lowest: price ? price.lowest : 0, wall: price ? price.wall : null, rule: price ? price.rule : settings.pointsRule,
        ahead: price ? price.ahead : 0, at: i.pointsAt || 0, level, cheap, hold, held: pointsHeld, before,
        ladder, table,
        sell: {
            points: book.left, least: book.least, loss: !!pointsPrice && book.left > 0 && pointsPrice < book.least,
            one: sell.one, quick: sell.quick, lands: book.left * pointsPrice,
            profit: book.left && pointsPrice ? book.left * pointsPrice - book.cost : 0,
        },
        book: { ...book, rows: book.rows.slice(0, 200) },
        heldDays: heldByDay(i.book || [], now, 14),
        chart: vwPriceChart(i.days || [], i.wallDays || [], now, level, book.least),
    };

    // ---- my prices ---------------------------------------------------------------------------------------------------
    const forum = forumText({ open: settings.open, pct: settings.pct, stocks: sets.map((s) => ({ pieces: s.pieces })), sets: on });
    const thread = i.thread && i.thread.title ? { ...i.thread, check: threadCheck(i.thread.title, { open: settings.open, pct: settings.pct }) } : null;
    const setCost = sets.length ? Math.max(...sets.map((s) => s.rate.cost)) : 0;
    const cover = cash == null ? null : shareCovers(share.total, share.inSets, settings.shareMax, setCost);
    const verdict = shopVerdict({
        open: settings.open, sets: sets.map((s) => ({ ...s.rate, name: s.label })), hot, since: i.hotSince, onList: (key) => cartList.some((l) => l.key === key),
        needUnits, coverSets: cover, now,
    });
    const w3bList = (i.w3b && i.w3b.list) || null;
    const w3bDiff = w3bList ? listDiff(w3bList, desiredList(pieces, settings.open), ALL_PIECE_IDS) : null;
    const rates = [];
    for (let r = 99; r <= 104.001; r += 0.5) rates.push(Math.round(r * 10) / 10);
    const prices = {
        pct: settings.pct, open: settings.open, least: settings.least,
        cap: mendRate(on, mv, pointsPrice, settings.least),
        sets: sets.map((s) => ({ key: s.key, label: s.label, cost: s.rate.cost, profit: s.rate.profit, kept: s.rate.kept, ok: s.rate.ok, cap: s.rate.cap, points: s.points })),
        verdict, cover, forum, thread,
        w3b: {
            known: !!w3bList, at: (i.w3b && i.w3b.listAt) || 0, error: (i.w3b && i.w3b.error) || '', sync: settings.w3bSync,
            diff: w3bDiff, matches: w3bDiff ? listMatches(w3bDiff) : null,
            lastReceiptAt: (i.w3b && i.w3b.lastReceiptAt) || 0, listedUntil: listedUntil((i.w3b && i.w3b.lastReceiptAt) || 0),
        },
        chart: {
            x: rates, least: sets[0] && sets[0].value ? Math.round(sets[0].value - sets[0].value / (1 + settings.least / 100)) : 0,
            series: sets.map((s) => ({ key: s.key, name: s.name, color: s.color, data: rates.map((r) => Math.round(s.value - s.rate.market * r / 100)) })),
        },
    };

    // ---- the ledger --------------------------------------------------------------------------------------------------
    const days = profitBuckets(book.rows, mugs.rows, now, 'day', 14);
    const sum14 = profitSum(days);
    const sum7 = profitSum(days.slice(-7));
    const buys = (i.rows || []).filter((r) => r.side === 'buy');
    const ledger = {
        days, weeks: profitBuckets(book.rows, mugs.rows, now, 'week', 12), months: profitBuckets(book.rows, mugs.rows, now, 'month', 12),
        sum: sum14, cum: runningTotal(days),
        notSold: pool.cost + book.cost, notSoldPoints: book.left, poolEst: pool.est,
        sold: book.rows.filter((r) => r.kind === 'sold').map((r) => {
            const mug = mugs.rows.find((m) => m.saleId === r.id) || null;
            return { id: r.id, t: r.t, points: r.mine, each: r.each, got: Math.round(r.mine * r.each), cost: r.cost, gain: r.gain, mug: mug ? { counted: mug.counted, after: mug.after } : null };
        }),
        buys: [...buys].sort((a, b) => b.t - a.t).slice(0, 300).map((r) => ({ id: r.id, t: r.t, itemId: r.itemId, name: nameOf(r.itemId), qty: r.qty, each: Math.round(r.each), paid: Math.round(r.qty * r.each), venue: r.venue, who: r.whoName || (i.names && i.names(r.who)) || '', rate: mv(r.itemId) ? r.each / mv(r.itemId) * 100 : 0 })),
        where: vwWhere(buys, now, 14),
        swapped: vwSwapped(i.book || [], now, 14),
        sellers: vwSellers(buys, open, nameOf, i.names, now),
        mugs,
    };

    // ---- the dashboard -----------------------------------------------------------------------------------------------
    const todo = [];
    // The stops a thing to do names, the one that saves most first: `gain` is against what the line above them says
    // (what you pay your sellers for the cheap listings, the pieces' worth for the rest).
    const firstStops = (stops) => stops.slice(0, VW_FIRST_STOPS).map((s) => ({ im: s.im, who: s.who, whoId: s.whoId, units: s.units, cost: s.cost, gain: s.gain }));
    if (open.length) todo.push({ kind: 'trades', tone: 'warn', n: open.length, wait: trades.wait, money: trades.waitMoney });
    if (buy.hotUnits) todo.push({ kind: 'hot', tone: '', n: buy.hotUnits, stops: buy.hotStops, pic: hot[0].id, first: firstStops(vwHotStops(hot)), cost: vwSum(hot, (h) => h.q * h.price), full: fullAfter((p) => onList(hot, p.id)) });
    else if (buy.plan.units) todo.push({ kind: 'buy', tone: '', n: buy.plan.units, stops: buy.plan.stops, pic: plan[0].id, first: firstStops(planStops), cost: buy.plan.cost, full: buy.plan.full });
    if (fullAll) todo.push({ kind: 'swap', tone: 'brand', n: fullAll, points: vwSum(sets, (s) => s.full * s.points) });
    if (book.left) todo.push(hold ? { kind: 'hold', tone: 'warn', usual: level.lo || 0 } : { kind: 'sell', tone: 'good', n: book.left, price: pointsPrice });

    return {
        at: now,
        ready: i.stockAt > 0 && pieces.some((p) => p.mv > 0),
        settings,
        top: { points: pointsPrice, cheap, usual: level, onHand: money.onHand == null ? null : vwWhole(money.onHand), vault: money.vault == null ? null : vwWhole(money.vault), pricesAt: i.pricesAt || 0, pointsAt: i.pointsAt || 0, stockAt: i.stockAt || 0, stock: i.stock || null },
        nav: { full: fullAll, need: pieces.filter((p) => p.need > 0).length, trades: open.length, hot: trades.wait > 0 },
        shop: { open: settings.open, pct: settings.pct, state: verdict.state, lamp: verdict.lamp },
        sets, pieces, buy, trades, points, prices, ledger,
        dash: {
            full: fullAll, pointsHeld, made: book.left, profit7: sum7.profit, today: days[days.length - 1].profit, todo,
            pays: sets.map((s) => ({ key: s.key, label: s.label, pays: s.pays, priced: s.priced })),
            paysDays: ((i.hist && i.hist.pays) || []).slice(-40),
        },
        stock: { units: pool.units, cost: pool.cost, est: pool.est, made: book.left, sold14: sum14.points },
        share: { ...share, max: settings.shareMax, days: ((i.hist && i.hist.share) || []).slice(-14) },
        tape: pieces.filter((p) => p.low).map((p) => ({ id: p.id, name: p.name, set: p.set, price: p.low.price })),
    };
}

/** The cheap listings (hotListings) by seller: how many pieces, what they cost, how far under what you pay sellers. */
function vwHotStops(hot) {
    const by = new Map();
    for (const h of hot || []) {
        const place = h.im ? 'im' : 'b:' + (h.whoId ?? h.who ?? '');
        if (!by.has(place)) by.set(place, { im: !!h.im, who: h.who, whoId: h.whoId, units: 0, cost: 0, gain: 0 });
        const s = by.get(place);
        s.units += h.q;
        s.cost += h.q * h.price;
        s.gain += h.q * (h.pay - h.price);
    }
    return [...by.values()].sort((a, b) => (a.im - b.im) || b.gain - a.gain);
}

/** The points price by day: the first wall and the lowest listing, the usual range, your least price. */
function vwPriceChart(days, wallDays, now, level, least) {
    const from = vwDay(now - 39 * VW_DAY_MS);
    const low = new Map((days || []).filter((d) => d.day >= from && d.n > 0).map((d) => [d.day, Math.round(d.sum / d.n)]));
    const wall = new Map((wallDays || []).filter((d) => d.day >= from && d.n > 0).map((d) => [d.day, Math.round(d.sum / d.n)]));
    const x = [...new Set([...low.keys(), ...wall.keys()])].sort();
    return {
        x, low: x.map((d) => low.get(d) ?? wall.get(d)), wall: x.map((d) => wall.get(d) ?? low.get(d)),
        usual: level && level.lo ? { lo: level.lo, hi: level.hi } : null, least: least || 0,
    };
}

/** Pieces bought by day and by where: { x: [day], bazaar, market, trade }. */
function vwWhere(buys, now, days) {
    const x = [];
    for (let k = days - 1; k >= 0; k--) x.push(vwDay(now - k * VW_DAY_MS));
    const at = new Map(x.map((d, k) => [d, k]));
    const out = { x, bazaar: x.map(() => 0), market: x.map(() => 0), trade: x.map(() => 0) };
    for (const r of buys) {
        const k = at.get(vwDay(r.t));
        if (k != null && out[r.venue]) out[r.venue][k] += vwWhole(r.qty);
    }
    return out;
}

/** Sets swapped at the museum by day, from the points book: { x, plushie, flower }. */
function vwSwapped(entries, now, days) {
    const x = [];
    for (let k = days - 1; k >= 0; k--) x.push(vwDay(now - k * VW_DAY_MS));
    const at = new Map(x.map((d, k) => [d, k]));
    const out = { x, plushie: x.map(() => 0), flower: x.map(() => 0) };
    for (const e of entries) {
        const set = e.kind === 'made' && e.set ? setByKey(e.set) : null;
        const k = at.get(vwDay(e.t));
        if (set && k != null) out[set.key][k] += Math.round(vwWhole(e.points) / set.points);
    }
    return out;
}

/** Who sells to you: trades, units, what you paid, what they mostly bring, when they last came. */
function vwSellers(buys, open, nameOf, names, now) {
    const by = new Map();
    for (const r of buys) {
        if (r.venue !== 'trade' || !r.who) continue;
        const s = by.get(r.who) || { whoId: r.who, who: r.whoName || (names && names(r.who)) || '', trades: new Set(), units: 0, paid: 0, items: new Map(), last: 0 };
        s.trades.add(String(r.id).split(':')[1]);
        s.units += vwWhole(r.qty);
        s.paid += Math.round(r.qty * r.each);
        s.items.set(r.itemId, (s.items.get(r.itemId) || 0) + vwWhole(r.qty));
        s.last = Math.max(s.last, r.t);
        if (!s.who && r.whoName) s.who = r.whoName;
        by.set(r.who, s);
    }
    const openWith = new Set((open || []).map((t) => String(t.whoId)));
    return [...by.values()].sort((a, b) => b.paid - a.paid).map((s) => ({
        whoId: s.whoId, who: s.who, trades: s.trades.size, units: s.units, paid: s.paid, last: s.last,
        brings: [...s.items].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => shortName(nameOf(id))).join(', '),
        came: openWith.has(String(s.whoId)) ? 'now: a trade is open' : agoWords(s.last, now),
    }));
}

/** A piece's line in the view, by item id. What a mark on a Torn page reads. */
export const viewPiece = (view, itemId) => ((view && view.pieces) || []).find((p) => String(p.id) === String(itemId)) || null;

/** The view as the Torn tabs get it: the long tables left out. */
export function viewForTabs(view) {
    return {
        ...view,
        pieces: view.pieces.map((p) => ({ ...p, offers: p.offers.slice(0, 3), hist: [] })),
        sets: view.sets.map((s) => ({ ...s, pieces: s.pieces.map((p) => ({ id: p.id, name: p.name, short: p.short, held: p.held, need: p.need, ahead: p.ahead, state: p.state, top: p.top })), ladder: [] })),
        points: { ...view.points, book: { ...view.points.book, rows: [] }, heldDays: [], chart: null },
        ledger: null, dash: null,
        buy: { ...view.buy, depth: null },
    };
}
