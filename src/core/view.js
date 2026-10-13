// The view: everything the hub's pages and the box on Torn's pages show, worked out once from what the engine holds.
// Pure: the engine hands in settings, the stock count, prices, the points market, the books and the open trades;
// out comes one plain object. No page, no storage, no clock of its own. The pages only format it.

import { SETS, setStock, autoTargets, setMarketValue, setValue, ratePrice, rateSet, tradeOffer, takeOutMessage, forumText, postBehind, thanksMessage, threadCheck, moneyShare, shortName, setByKey } from './sets.js';
import { setsCtx, buysFrom } from './settings.js';
import { safeWorth, pieceBrings, tradeMargin, placeMargin } from './margin.js';
import { fillPlan, fillList, stopsOf, runView, runOrder, onList, listAfterRun, cheapPieces, placeOf, addAll, smallPiece } from './shopping.js';
import { listPrice, priceLevels, usualLevel, pointsCheap } from './points.js';
import { avgBook, heldByDay, mugCheck, profitBuckets, profitSum, runningTotal, poolSum, poolSetCost, poolEach, poolAdd, BOOK_ABOUT } from './books.js';
import { judgeSet, usualSell, setMakes, makesLines } from './setjudge.js';
import { cautiousPrice, liveTable, safeTable, rateKey, othersPay, rateShort, BID_KEEPS_MS } from './sellrate.js';
import { shortlists } from './shortlist.js';
import { lotTable, lotSpan, lotSize, sellPlan } from './lots.js';
import { hotListings, shopVerdict, shareCovers } from './verdict.js';
import { tradeTurn, agoWords } from './trades.js';
import { listDiff, desiredList, owedPieces, listMatches, listedUntil, listLink } from './tw3b-list.js';

/** Your thread on Torn's forums, when Torn said which forum it is in ('' else: no link is guessed). */
const vwThreadUrl = (t) => (t && t.id != null && t.forum != null ? `https://www.torn.com/forums.php#/p=threads&f=${encodeURIComponent(t.forum)}&t=${encodeURIComponent(t.id)}` : '');

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
const vwLineG = { best: '', ok: 'room', thin: 'thin', loss: 'no' };
/** A swap is "about" when over this share of what its pieces cost is an estimate. */
const VW_ABOUT_SET = 0.1;

/** What you still need of every piece, counted by what its set makes at the cheapest listings that count. */
function vwMarks(pieces, rowsOf) {
    const out = { best: 0, ok: 0, thin: 0, none: 0 };
    for (const p of pieces || []) {
        let left = vwWhole(p.need);
        if (!left) continue;
        for (const o of rowsOf(p.id)) {
            if (!left || !p.mk) break;
            const cls = setMakes(p.mk, o.price).cls;
            if (cls === 'loss') break;
            const q = Math.min(left, vwWhole(o.qty));
            out[cls] += q;
            left -= q;
        }
        out.none += left;
    }
    return out;
}
/** The stops of the list the dashboard names under "Do now": as many as its card ever has room for. */
const VW_FIRST_STOPS = 12;

/**
 * @param i {
 *   now, settings (archiveSettings)
 *   held(id), stockAt            the stock count and when Torn's inventory was last read (0 = never)
 *   mv(id)                       Torn's market value
 *   offers(id), pricesAt         bazaar and Item Market listings of a piece, cheapest first or not
 *   priced(id)                   (optional) whether the piece's listings were read at all
 *   topBid(id)                   { pct, name, price, at } the best any other buyer pays, as a percent of market value, in
 *                                dollars, and when it was read - or null
 *   rate                         the price table fixed for the hour (core/sellrate.js fixTable), or null: then what
 *                                you pay is worked out now
 *   listings, pointsAt           the points market (points.js parsePointsMarket)
 *   days, wallDays               the lowest listing and the first wall by day (points.js recordPrice)
 *   lots, mineLots               lots.js's record, and your own lots [{ points, wait }] (your sales of the week)
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
    // A row that was not looked at lately (`ok: false`, engine/state.js COUNT_MS) is shown, after the checked ones,
    // and counts for nothing: no list, no "Do now", no "cheapest". It is asked of Torn first (buy.check).
    // A row in a place you do not buy from (settings.from: `out: true`) is shown too, after the ones you do, and
    // counts for no list either. It still counts as a price: a set's cost, the day's lowest, "Open your shop?".
    //
    // The in-between layer (1.3.0). `i.offers(id)` is the whole pile of a piece, cheapest first, sorted by the
    // engine only when an answer moved it (engine/state.js pileOf); its rows are shared and never written on here.
    // From it a shortlist per piece is kept (core/shortlist.js): the list, the deals and "Sold by" read that.
    const pileMemo = new Map();
    const inPlace = buysFrom(settings);
    const isOut = (o) => !!o.out || !inPlace(o);
    const pile = (id) => {
        const k = String(id);
        if (!pileMemo.has(k)) {
            const rows = (i.offers && i.offers(id)) || [];
            // The engine hands them in sorted; a caller that does not gets them sorted here, once.
            let sorted = true;
            for (let n = 1; n < rows.length && sorted; n++) if (rows[n].price < rows[n - 1].price) sorted = false;
            pileMemo.set(k, sorted ? rows : [...rows].sort((a, b) => a.price - b.price));
        }
        return pileMemo.get(k);
    };
    const pileLive = (id) => pile(id).filter((o) => o.price > 0 && o.qty > 0);
    let short = new Map();
    const offersOf = (id) => (short.get(String(id)) || { rows: [] }).rows;
    const checkedAll = (id) => offersOf(id).filter((o) => o.ok !== false);
    const checkedOf = (id) => offersOf(id).filter((o) => o.ok !== false && !o.out);

    // ---- the points price --------------------------------------------------------------------------------------------
    const price = listPrice(i.listings || [], settings.pointsRule);
    const pointsPrice = price ? price.price : 0;
    const level = usualLevel(i.days || [], now);
    const cheap = pointsCheap(price ? price.lowest : 0, level);

    // ---- the books ---------------------------------------------------------------------------------------------------
    const pointsHeld = money.points == null ? null : vwWhole(money.points);
    // A swap booked before 1.3.0 does not say how much of its cost was an estimate: it is "about" for as long as
    // the pool of its set still holds units never seen bought (F1).
    const estNow = {};
    for (const s of SETS) {
        let n = 0;
        let est = 0;
        for (const p of s.pieces) { const c = (i.pool || {})[String(p.id)]; if (c) { n += c.n; est += c.est; } }
        estNow[s.key] = n ? est / n : 0;
    }
    const bookIn = (i.book || []).map((e) => (e.kind === 'made' && e.est == null ? { ...e, est: estNow[e.set] || 0 } : e));
    const plain = avgBook(bookIn, pointsPrice);
    const before = pointsHeld == null ? null : Math.max(0, pointsHeld - plain.left);
    // With a cost typed for them, the points you had before open the book - as many as they were when the book
    // began: what you hold now, less every point made since, plus every point sold or used since. (Until 1.2.3 the
    // book was opened with what is left of them NOW, and the sales that had already taken some took them again.)
    const flow = vwSum(i.book || [], (e) => (e.kind === 'made' ? -1 : 1) * vwWhole(e.points));
    const opened = pointsHeld == null ? 0 : Math.max(0, pointsHeld + flow);
    const book = settings.beforeEach > 0 && opened ? avgBook(bookIn, pointsPrice, { points: opened, each: settings.beforeEach }) : plain;
    const pool = poolSum(i.pool);
    const cash = money.onHand == null && money.vault == null ? null : vwWhole(money.onHand) + vwWhole(money.vault);
    const share = moneyShare({ pieces: pool.cost, points: book.cost, cash: money.onHand, vault: money.vault });

    // ---- the sets and their pieces -----------------------------------------------------------------------------------
    const cartList = i.cart || [];
    // While a run is on a line keeps the units you took on it (it says "took 5 of 5" until Next), and those units
    // are in your stock: what is still to buy is the list less what was taken.
    const leftList = i.run && i.run.on ? listAfterRun(cartList, i.run) : cartList;
    const sets = [];
    const pieces = [];
    const heldOf = (set) => { const m = {}; for (const p of set.pieces) m[p.id] = vwWhole(i.held(p.id)); return m; };
    // "From my cash": one purse for all the sets - your cash, no more than keeps sets and points under their share
    // of your money - spent on the pieces you do not hold yet.
    const room = settings.shareMax > 0 ? Math.max(0, share.total * settings.shareMax / 100 - share.inSets) : Infinity;
    const budget = cash == null ? null : Math.min(cash, room);
    // One idea of what a point is worth (core/sellrate.js): the lower of today's price and the price you usually
    // sell points for. Every limit rests on it - what you pay your sellers, a piece's worth, the cart's Buy line.
    // What a set BRINGS on the screen stays at today's price.
    const usual = usualSell(i.book || [], level, now);
    const caut = cautiousPrice(pointsPrice, usual.price);
    // What you pay your sellers: each set at the lower of your rate and its own ceiling. While your shop is open
    // the engine fixes that table for an hour (`i.rate`); inside the hour it only comes down, when the points
    // price falls under your least profit - worked out here as well, so no page ever shows a price over it.
    const live = liveTable(on, mv, settings.pct, settings.least, caut);
    const fixedIn = settings.open && i.rate && i.rate.key === rateKey(settings) && on.every((s) => i.rate.sets && i.rate.sets[s.key]) ? i.rate : null;
    const fixed = fixedIn ? safeTable(fixedIn, on, caut.price, now) : null;
    const payTable = fixed || live;
    const payOf = (id) => { const p = payTable.pay[id]; return p == null ? ratePrice(mv(id), settings.pct) : p; };
    const auto = settings.targetMode === 'number' ? null : autoTargets(on, heldOf, budget, payOf);
    // While a list is on hand, the sets it was made for stay: your money moves with every buy and sale (and Torn
    // says so a minute before your stock does), and a list whose numbers move under you cannot be bought.
    const kept = auto && i.kept ? i.kept : null;
    const leastUp = 1 + Math.max(0, vwNum(settings.least)) / 100;
    // Every set judged first: what of each piece's listings is Buy, Stretch or No thanks, on the SET they finish.
    const judged = [];
    const shortIn = [];
    for (const set of on) {
        const heldMap = heldOf(set);
        const target = kept && Number.isInteger(kept[set.key]) ? kept[set.key] : auto ? auto[set.key] : settings.target;
        const stock = setStock(set, heldMap, target);
        const guide = new Map(set.pieces.map((p) => [String(p.id), safeWorth(p.id, mv, caut.price, settings.least)]));
        // Buy: the set pays at the lower of the two points prices. Stretch: it pays only at the higher one.
        const o = {
            target: stock.target, held: (id) => heldMap[id], avg: (id) => poolEach(i.pool, id), guide: (id) => guide.get(String(id)) || 0,
            more: caut.high > caut.price ? set.points * (caut.high - caut.price) / leastUp : 0,
            perMore: set.points / leastUp, priceNow: caut.price,
        };
        const live = new Map(set.pieces.map((p) => [String(p.id), pileLive(p.id)]));
        // On the rows that count (a list is made of these), and on every row where you buy, checked or not (what
        // a list would hold if every row shown were true: its bazaars are the ones to ask Torn about next).
        const judge = judgeSet(set, { ...o, rows: (id) => live.get(String(id)).filter((r) => r.ok !== false && !isOut(r)) });
        const wishJ = judgeSet(set, { ...o, rows: (id) => live.get(String(id)).filter((r) => !isOut(r)) });
        // What the set makes with a listing (1.4.0, setjudge.js setMakes): the set's points at the cautious price,
        // less what the rest of the set costs, less the listing. `lineT`: a listing under it is shown and may go on
        // a list by hand - the set still profits, or the judge keeps it. Over it, it is a loss and not drawn.
        const makes = new Map();
        const valueC = set.points * caut.price;
        for (const p of stock.pieces) {
            const j = judge.pieces.get(String(p.id));
            const worth = guide.get(String(p.id)) || 0;
            const mk = worth > 0 && valueC > 0 ? { others: j.others, value: valueC, least: settings.least, worth, keep: j.lineS } : null;
            const lines = mk ? makesLines(mk) : { ok: j.line, show: j.lineS };
            makes.set(String(p.id), { mk, okLine: lines.ok, lineT: Math.max(j.lineS, lines.show) });
        }
        judged.push({ set, heldMap, stock, guide, judge, wishJ, makes });
        for (const p of stock.pieces) {
            const j = judge.pieces.get(String(p.id));
            const w = wishJ.pieces.get(String(p.id));
            shortIn.push({ id: p.id, need: p.need, take: Math.min(p.need, j.buy + j.fin), takeLine: j.takeLine, line: Math.max(j.line, makes.get(String(p.id)).okLine), lineS: Math.max(makes.get(String(p.id)).lineT, w.lineS), worth: guide.get(String(p.id)) || 0, small: smallPiece(p.id, set.pieces, mv) });
        }
    }
    const cartAt = new Map();
    for (const l of cartList) { const k = String(l.id); if (!cartAt.has(k)) cartAt.set(k, new Set()); cartAt.get(k).add(l.place); }
    short = shortlists(shortIn, pileLive, (id) => cartAt.get(String(id)) || null, isOut);
    for (const { set, heldMap, stock, guide, judge, wishJ, makes } of judged) {
        // What a set costs at what you pay and what it leaves at today's points price; `cap` is the ceiling the
        // table was made with, `pct` what you pay, `typed` the most you pay, `down` when it came down this hour.
        const tr = payTable.sets[set.key];
        const atToday = rateSet(set, mv, tr.pct, pointsPrice, settings.least);
        const paidSet = vwSum(set.pieces, (p) => payOf(p.id));
        const rate = {
            ...atToday, cost: paidSet, profit: atToday.value - paidSet, kept: paidSet > 0 ? (atToday.value - paidSet) / paidSet * 100 : 0,
            cap: tr.cap, pct: tr.pct, typed: settings.pct, down: tr.down || null,
            ok: atToday.value > 0 && atToday.market > 0 && tr.cap > 0 && tr.pct <= tr.cap,
        };
        const value = setValue(set, pointsPrice);
        const ladder = setLadder(set, pileLive);
        const mine = stock.pieces.map((p) => {
            const sl = short.get(String(p.id));
            const offers = sl.rows;
            const worth = guide.get(String(p.id)) || 0;
            const j = judge.pieces.get(String(p.id));
            const w = wishJ.pieces.get(String(p.id));
            const take = Math.min(p.need, j.buy + j.fin);
            const mkd = makes.get(String(p.id));
            const pay = payOf(p.id);
            const bid = (i.topBid && i.topBid(p.id)) || null;
            const listed = onList(leftList, p.id);
            const good = offers.filter((o) => o.ok !== false && !o.out && o.price < j.takeLine);
            return {
                ...p, set: set.key, short: shortName(p.name), target: stock.target, mv: mv(p.id), pay, worth,
                // The three groups, on the set (setjudge.js): a row under `line` is Buy, under `lineS` Stretch, else
                // No thanks. `take` units under `takeLine` are what a list takes; `needs`: the points price the
                // dearest Stretch unit needs. `wish`: the same, were every row shown true.
                line: j.line, lineS: j.lineS, take, takeLine: j.takeLine, buyUnits: Math.min(p.need, j.buy), stretchUnits: j.stretch, fin: j.fin, needs: j.needs,
                wish: { take: Math.min(p.need, w.buy + w.fin), takeLine: w.takeLine },
                // Profit per set with a listing of this piece: `mk` is what setMakes takes (null: no points price or
                // no market value - then no listing is marked); under `okLine` the set keeps your least profit;
                // under `lineT` a listing is shown and may be added; at or over it the set loses.
                mk: mkd.mk, okLine: mkd.okLine, lineT: mkd.lineT,
                // A small part of what its set costs (a Kitten, a Sheep): a list goes to its big listings first.
                small: smallPiece(p.id, set.pieces, mv),
                brings: Math.floor(pieceBrings(p.id, mv, pointsPrice)),
                // low: the cheapest where you buy. lowAll: the cheapest anywhere (the day's record, the tape).
                offers, low: offers.find((o) => !o.out) || null, lowAll: sl.lowAll,
                lowBazaar: sl.lowBazaar,
                // What one press of "Add all" on this piece would put on the list.
                more: onList(addAll(leftList, { ...p, worth: j.takeLine, need: take }, good), p.id) - listed,
                // Units that count: under the piece's own share, under the line the set keeps your least at, and
                // from there up to `lineT` (the set profits, under your least).
                under: sl.under, good: sl.good, thin: sl.thin,
                // Rows the shortlist leaves out, said once under the table: over the line, more under it, not
                // checked lately, in a place you do not buy from. `all`: every row there is.
                left: sl.left, all: sl.all,
                // A price read over a day ago counts for nothing (the owner, 2026-10-11: lists over 24 h old do not).
                other: bid && bid.pct > 0 && !(bid.at > 0 && now - bid.at > BID_KEEPS_MS) ? { pct: bid.pct, name: bid.name || '', price: vwNum(bid.price), at: vwNum(bid.at) } : null,
                hist: (((i.hist && i.hist.low) || {})[p.id] || []).slice(-7).map((d) => d.low),
                listed,
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
            // The next set you would finish: what it still has to spare over its listings, in all and a point.
            next: judge.next,
        });
        pieces.push(...mine);
    }
    // The pieces as a list takes them (Buy, and the Stretch that finishes a set), and as "Do now" does.
    const listOf = listPieces(pieces);
    const wishOf = pieces.map((p) => ({ ...p, worth: p.wish.takeLine, need: p.wish.take }));
    const pieceOf = (id) => pieces.find((p) => String(p.id) === String(id)) || null;
    const worthOf = (id) => (pieceOf(id) || {}).worth || 0;
    const fullAll = vwSum(sets, (s) => s.full);
    const needUnits = vwSum(pieces, (p) => p.need);
    const fullAfter = (extra) => Object.fromEntries(sets.map((s) => [s.key, Math.min(...s.pieces.map((p) => p.held + vwWhole(extra(p))))]));

    // ---- buying ------------------------------------------------------------------------------------------------------
    const marginCtx = { mv, pointsPrice, leastPct: settings.least };
    const plan = fillList(listOf, checkedOf);
    const planStops = stopsOf(plan, worthOf);
    // What the list would hold if every row shown were true: the bazaars of it that are not checked are the ones
    // to ask Torn about next. Checked, they count - or are gone, and the next ones are asked.
    const wish = fillPlan(wishOf, (id) => offersOf(id).filter((o) => !o.out));
    const unsure = wish.filter((l) => !l.im && (offersOf(l.id).find((o) => placeOf(o) === l.place) || {}).ok === false);
    const check = [...new Set(unsure.map((l) => String(l.whoId)))];
    const nameOfPiece = (id) => (pieceOf(id) || {}).name || (i.itemName && i.itemName(id)) || 'Item ' + id;
    // The lines of the list that are over the piece's own share: carried by the set's room, or a Stretch.
    const lineGroup = (l) => { const p = pieceOf(l.id); return !p || !p.mk || l.price < p.worth ? '' : vwLineG[setMakes(p.mk, l.price).cls]; };
    // `g` on a line: '' under the piece's own share, 'room' over it while the set keeps your least profit, 'thin'
    // under your least, 'no' a loss (dear now: it leaves at the next read).
    const stops = runOrder(stopsOf(cartList, worthOf), i.run).map((s) => ({ ...s, lines: s.lines.map((l) => ({ ...l, g: lineGroup(l) })), margin: placeMargin(s.lines.map((l) => ({ id: l.id, take: l.q, price: l.price })), marginCtx) }));
    // `took` (line key -> units you took) rides along: the box on a bazaar says it per line.
    const run = { ...runView(i.run, stops), took: (i.run && i.run.took) || {} };
    // Cheaper than you pay your sellers, wherever it is: anyone can buy there and sell to you ("Open your shop?").
    const hot = hotListings(pieces, checkedAll);
    // What "Do now" says to buy, as the list its button makes: under what you pay sellers and under the worth.
    const hotPlan = fillList(cheapPieces(listOf), checkedOf);
    const hotPlanStops = stopsOf(hotPlan, (id) => (pieceOf(id) || {}).pay || 0);
    const leftStops = leftList === cartList ? stops : stopsOf(leftList, worthOf);
    const cartCost = vwSum(leftStops, (s) => s.cost);
    // "it should know how much i paid to complete the set" (the owner, 2026-10-11): what a set costs you a point
    // now (each piece at its average in the pool), and with everything on the list bought.
    let poolAfter = i.pool || {};
    for (const l of leftList) poolAfter = poolAdd(poolAfter, l.id, l.q, l.q * l.price);
    const even = sets.map((s) => {
        const set = setByKey(s.key);
        const from = poolSetCost(i.pool, set);
        const to = leftList.some((l) => l.set === s.key || s.pieces.some((p) => String(p.id) === String(l.id))) ? poolSetCost(poolAfter, set) : 0;
        // `from` / `to` a point (the points market's box), `setFrom` / `setTo` a whole set, `value` what a set's
        // points sell for today.
        return { key: s.key, label: s.label, from: from ? Math.ceil(from / s.points) : 0, to: to ? Math.ceil(to / s.points) : 0, setFrom: Math.round(from), setTo: Math.round(to), value: s.value };
    });
    const depthN = Math.min(...sets.map((s) => s.ladder.length), Infinity);
    const depthX = VW_DEPTH_AT.filter((k) => k <= depthN);
    const buy = {
        plan: {
            units: vwSum(plan, (l) => l.q), need: needUnits, stops: planStops.length, cost: vwSum(planStops, (s) => s.cost),
            full: fullAfter((p) => onList(plan, p.id)),
        },
        stops, run, from: { ...settings.from },
        // Bazaars shown but not checked lately that a list would use (asked of Torn next), and their units.
        check, unsure: vwSum(unsure, (l) => l.q),
        units: vwSum(leftStops, (s) => s.units), cost: cartCost, gain: vwSum(leftStops, (s) => s.gain),
        // The list's capital beside what you have on hand, and what it does to a set's cost a point.
        cash: { onHand: money.onHand == null ? null : vwWhole(money.onHand), vault: money.vault == null ? null : vwWhole(money.vault) },
        even,
        // Units on the list whose set profits under your least.
        thin: vwSum(leftList.filter((l) => lineGroup(l) === 'thin'), (l) => l.q),
        // What you still need, by what its set makes at the cheapest listings: units under the piece's own share,
        // units where the set keeps your least, units under your least, and units with no such listing.
        marks: vwMarks(pieces, checkedOf),
        // `low` / `high`: the two points prices (every limit rests on the lower); `by`: which of them is the lower -
        // 'today' or 'usual'.
        usual: { price: usual.price, from: usual.from, low: caut.price, high: caut.high, by: caut.from },
        // Buys a page told of that Torn's log does not have: taken back, said once.
        back: (i.back || []).map((b) => ({ ...b, name: nameOfPiece(b.id), who: (i.names && i.names(b.whoId)) || '' })),
        full: fullAfter((p) => p.listed),
        left: listAfterRun(cartList, i.run),
        vault: money.onHand == null ? null : Math.max(0, cartCost - vwWhole(money.onHand)),
        hot, hotUnits: vwSum(hot, (h) => h.q), hotStops: new Set(hot.map((h) => (h.im ? 'im' : h.whoId ?? h.who))).size,
        depth: depthX.length >= 2 ? {
            x: depthX, series: sets.map((s) => ({ key: s.key, name: s.label, color: s.color, data: depthX.map((k) => s.ladder[k - 1]) })),
            value: sets[0] ? sets[0].value : 0, safe: sets[0] ? Math.floor(sets[0].points * caut.price / (1 + settings.least / 100)) : 0,
        } : null,
    };

    // ---- the trades open with you ------------------------------------------------------------------------------------
    const stockOf = (set) => { const s = sets.find((x) => x.key === set.key); return { pieces: s ? s.pieces : [] }; };
    const nameOf = (id) => { const p = pieceOf(id); if (p) return p.name; const set = SETS.find((s) => s.pieces.some((x) => String(x.id) === String(id))); return set ? set.pieces.find((x) => String(x.id) === String(id)).name : (i.itemName && i.itemName(id)) || 'Item ' + id; };
    const receipts = (i.w3b && i.w3b.receipts) || new Map();
    const tried = (i.w3b && i.w3b.tried) || {};
    const threadUrl = vwThreadUrl(i.thread);
    const open = (i.trades || []).map((t) => {
        const offer = tradeOffer(t.theirs.map((x) => ({ id: x.id, name: nameOf(x.id), qty: x.qty })), { settings: ctx, stockOf, mv, pct: settings.pct, pay: payOf });
        const margin = tradeMargin(offer, marginCtx);
        const total = offer.all.total;
        const state = tradeTurn(t, total);
        // What the trade still wants of you. Short of it with all your money, the message says budget, else stock.
        const owed = Math.max(0, total - vwWhole(t.myMoney));
        // The sets with a priced piece in this trade: the message names the rate really paid, each set its own
        // when they differ, and the box says when one came down inside the hour.
        const inIt = sets.filter((s) => offer.rows.some((r) => r.each > 0 && s.pieces.some((p) => String(p.id) === String(r.id))));
        return {
            id: t.id, who: t.who, whoId: t.whoId, modified: t.modified, ago: agoWords(t.modified, now), state, readAt: t.readAt || 0,
            rows: offer.rows, items: offer.rows.length, units: offer.all.items, total, needTotal: offer.need.total, needUnits: offer.need.items,
            margin, myMoney: t.myMoney, other: t.other,
            // What to paste to the seller when you will not take all of it ('' when you take it all, 1.4.0).
            message: takeOutMessage(offer, { reason: cash != null && owed > cash ? 'budget' : 'stock' }),
            outUnits: vwSum(offer.rows, (r) => r.qty - r.take),
            paid: rateShort(inIt.map((s) => ({ label: s.label, pct: s.rate.pct }))),
            rateDown: inIt.filter((s) => s.rate.down).map((s) => ({ key: s.key, label: s.label, from: s.rate.down.from, to: s.rate.pct, at: s.rate.down.at, price: s.rate.down.price })),
            // Money to take out of the vault just before you pay: what the trade still wants, over what is on hand.
            // `short`: what on hand and the vault together still lack.
            owed, onHand: money.onHand == null ? null : vwWhole(money.onHand),
            vault: money.onHand == null ? null : Math.max(0, owed - vwWhole(money.onHand)),
            short: money.onHand == null || money.vault == null ? 0 : Math.max(0, owed - cash),
            receipt: receipts.get(String(t.id)) || null,
            after: offer.rows.filter((r) => r.state !== 'other').map((r) => ({ id: r.id, name: r.name, held: r.held, q: r.qty, take: r.take, target: r.target })),
            full: fullAfter((p) => vwSum(offer.rows.filter((r) => String(r.id) === String(p.id)), (r) => r.qty)),
        };
    });
    const mineTurn = open.filter((t) => t.state === 'you');
    const trades = {
        // What they still wait for: money already in a trade is not asked for again.
        open, wait: mineTurn.length, waitMoney: vwSum(mineTurn, (t) => Math.max(0, t.total - vwWhole(t.myMoney))),
        // listed: your list on TornW3B has a price for each of its pieces - a receipt is made from that list.
        // receipt: the one TornW3B has for it, with its link. why: what a try at making it came to, when none
        // was made. thanks: what to send the seller, the receipt's link last.
        finished: (i.finished || []).slice(0, 60).map((f) => {
            const receipt = receipts.get(String(f.id)) || null;
            return {
                ...f, ago: agoWords(f.t, now), rate: f.mv > 0 ? f.paid / f.mv * 100 : 0, receipt,
                why: receipt ? '' : String((tried[f.id] && tried[f.id].why) || ''),
                thanks: receipt && receipt.url ? thanksMessage({ receipt: receipt.url, thread: threadUrl }) : '',
                listed: !!(i.w3b && i.w3b.list) && (f.rows || []).length > 0 && (f.rows || []).every((r) => i.w3b.list.has(String(r.id))),
            };
        }),
        receiptsError: (i.w3b && i.w3b.receiptsError) || '',
    };

    // ---- points ------------------------------------------------------------------------------------------------------
    const levels = priceLevels(i.listings || []);
    let ahead = 0;
    const ladder = levels.slice(0, 14).map((lv) => { const row = { price: lv.price, qty: lv.qty, lots: lv.lots, ahead, wall: !!price && lv.price === price.wall }; ahead += lv.qty; return row; });
    const gone = (i.lots && i.lots.gone) || [];
    const table = lotTable(gone, i.mineLots || [], now, 7, settings.lotMax);
    // What is still yours to list: the book's points, no more than Torn says you hold - a lot on the market has
    // left your balance, and the next lot is planned on what is left.
    const toList = pointsHeld == null ? book.left : Math.min(book.left, pointsHeld);
    const lots = sellPlan(toList, settings.lotMax);
    const nextSize = lots.length ? lotSize(lots[0], settings.lotMax) : null;
    const nextRow = nextSize == null ? null : table.find((r) => r.size === nextSize) || null;
    const mugs = mugCheck(book.rows.filter((r) => r.kind === 'sold').map((r) => ({ id: r.id, t: r.t, got: Math.round(r.mine * r.each) })), i.mugs || [], i.outs || [], i.outsFrom || 0);
    const hold = cheap && settings.cheapRule === 'hold';
    // The sets you made, in money (1.4.0, the owner 2026-10-13: "it should say how much it costs to complete a set
    // not per point"): every swap with what its pieces cost you, in all and a set. `about`: over a tenth of that
    // cost is an estimate (pieces never seen bought).
    const madeRows = book.rows.filter((r) => r.kind === 'made').map((r) => {
        const set = r.set ? setByKey(r.set) : null;
        const n = Math.max(1, Math.round(vwWhole(r.points) / ((set || SETS[0]).points || 1)));
        const spent = Math.round(vwWhole(r.points) * vwNum(r.cost));
        return { t: r.t, set: set ? set.key : '', sets: n, points: vwWhole(r.points), spent, perSet: Math.round(spent / n), each: vwNum(r.cost), about: vwNum(r.est) > VW_ABOUT_SET };
    });
    const madeSets = vwSum(madeRows, (r) => r.sets);
    const points = {
        price: pointsPrice, lowest: price ? price.lowest : 0, wall: price ? price.wall : null, rule: price ? price.rule : settings.pointsRule,
        ahead: price ? price.ahead : 0, at: i.pointsAt || 0, level, cheap, hold, held: pointsHeld, before,
        ladder, table, span: lotSpan(gone, now, 7), lotMax: settings.lotMax,
        // `lots`: how to list what is yours to list, the biggest first, none over your biggest lot. `next`: the
        // lot to list now (what Fill types), `nextWait` what a lot of its size usually waits at the front (null:
        // not seen), `listed`: points of the book that Torn no longer counts as held - on the market.
        sell: {
            points: book.left, least: book.least, loss: !!pointsPrice && book.left > 0 && pointsPrice < book.least,
            toList, listed: book.left - toList, lots, next: lots[0] || 0, nextWait: nextRow ? nextRow.wait : null,
            lands: book.left * pointsPrice,
            profit: book.left && pointsPrice ? book.left * pointsPrice - book.cost : 0,
        },
        // The break-even (C2): what a point you hold cost you against the price now - under it, selling loses
        // `loss` in all - and what a set costs you a point, now and with the list bought. `usual`: what you
        // usually sell a point for.
        even: {
            each: book.left ? Math.ceil(book.each) : 0, now: pointsPrice, usual: usual.price, usualFrom: usual.from,
            loss: pointsPrice > 0 && book.left > 0 && pointsPrice < book.least ? Math.round(book.cost - book.left * pointsPrice) : 0,
            sets: even,
        },
        book: { ...book, rows: book.rows.slice(0, 200) },
        made: { sets: madeSets, spent: book.madeCost, perSet: madeSets ? Math.round(book.madeCost / madeSets) : 0, since: madeRows.length ? Math.min(...madeRows.map((r) => r.t)) : 0, rows: madeRows.slice(0, 200) },
        heldDays: heldByDay(i.book || [], now, 14),
        chart: vwPriceChart(i.days || [], i.wallDays || [], now, level, book.least),
    };

    // ---- my prices ---------------------------------------------------------------------------------------------------
    const forumOf = (open) => forumText({ open, pct: settings.pct, stocks: sets.map((s) => ({ key: s.key, pieces: s.pieces })), sets: on, list: listLink(i.me) });
    const forum = forumOf(settings.open);
    // The post for the other state too: both are yours to copy whatever the shop says (the owner, 2026-10-12:
    // "so i can open and close it by copy paste"). `posted`: which one you copied last, and when.
    forum.other = forumOf(!settings.open);
    forum.posted = i.posted && i.posted.at > 0 ? { at: i.posted.at, open: !!i.posted.open } : null;
    // Only with a thread of yours known: without one there is nothing to edit.
    forum.behind = i.thread && i.thread.title ? postBehind(i.posted, forum.says) : null;
    // The thread names your rate - the most you pay. What you pay today is beside it when it is less.
    const paidRows = sets.map((s) => ({ label: s.label, pct: s.rate.pct }));
    const thread = i.thread && i.thread.title ? { ...i.thread, url: threadUrl, check: threadCheck(i.thread.title, { open: settings.open, pct: settings.pct, paid: paidRows }) } : null;
    const setCost = sets.length ? Math.max(...sets.map((s) => s.rate.cost)) : 0;
    const cover = cash == null ? null : shareCovers(share.total, share.inSets, settings.shareMax, setCost);
    const verdict = shopVerdict({
        open: settings.open, sets: sets.map((s) => ({ ...s.rate, name: s.label })), hot, since: i.hotSince, onList: (key) => cartList.some((l) => l.key === key),
        needUnits, coverSets: cover, now,
    });
    const w3bList = (i.w3b && i.w3b.list) || null;
    // What your list should say: your prices, without the pieces you hold too many of - but the pieces of a
    // trade that just ended stay until its receipt is made (TornW3B makes it from this list).
    const w3bOwed = owedPieces(i.finished, receipts, now);
    const w3bWant = desiredList(pieces, settings.open, w3bOwed);
    const w3bOver = settings.open ? pieces.filter((p) => p.pay > 0 && p.ahead > 0 && !w3bOwed.has(String(p.id))).map((p) => p.short || p.name) : [];
    const w3bDiff = w3bList ? listDiff(w3bList, w3bWant, ALL_PIECE_IDS) : null;
    // What you pay for each piece now, said to the shared server whatever the shop says - closed, it is what you
    // would pay if you opened now (the owner, 2026-10-12: "server should always keep my live pricelist"). `off`: the
    // pieces you hold too many of: not wanted now.
    const saidRows = desiredList(pieces, true, w3bOwed);
    // For whole sets (the owner, 2026-10-12: a friend's Torn Bids sells him "full sets ... so its always complete"):
    // `all` what you pay for EVERY piece, also one you hold too many of - a whole set is paid whole; `sets` how
    // many whole sets you take now: the sets you are still building, no more than your money pays for at these
    // prices; `take` how many of each piece you still take by itself.
    const priced = pieces.filter((p) => p.pay > 0);
    const said = {
        open: !!settings.open, rows: saidRows, off: priced.filter((p) => !saidRows.some((r) => String(r.itemID) === String(p.id))).map((p) => Number(p.id)),
        all: Object.fromEntries(priced.map((p) => [p.id, p.pay])),
        sets: Object.fromEntries(sets.map((s) => {
            const building = Math.max(0, s.target - s.full);
            return [s.key, budget == null || !(s.rate.cost > 0) ? building : Math.min(building, Math.floor(budget / s.rate.cost))];
        })),
        take: Object.fromEntries(priced.map((p) => [p.id, p.need])),
    };
    const rates = [];
    for (let r = 99; r <= 104.001; r += 0.5) rates.push(Math.round(r * 10) / 10);
    const bidOf = (id) => (pieceOf(id) || {}).other || null;
    const prices = {
        // `pct`: the most you pay (what you typed). `paid`: what you pay today, short ("101%", "100.6% to 101%").
        pct: settings.pct, open: settings.open, least: settings.least, paid: rateShort(paidRows), paidRows,
        cap: sets.length ? Math.min(...sets.map((s) => s.rate.cap)) : 0,
        // The table fixed for the hour (null: the shop is closed, or nothing is fixed yet - `sets` then say what
        // you would pay now). `held`: its hour is over and it stands still while a trade is open.
        fixed: fixed ? { at: fixed.at, until: fixed.until, held: !!fixed.held } : null,
        // The points price the table was made at, and where it is from ('today' | 'usual'); today's beside it.
        points: { price: payTable.price, from: payTable.from, today: pointsPrice, usual: usual.price, usualFrom: usual.from },
        // What a fix would take now: the engine fixes the hour's table from this.
        live,
        sets: sets.map((s) => {
            // The piece holding the set back (you hold fewest of it), when its best other buyer pays over your
            // ceiling: only said - you do not pay over the ceiling for it.
            const first = s.pieces.find((p) => p.need > 0) || null;
            const others = othersPay(setByKey(s.key), mv, bidOf, now);
            const firstBid = first && first.other && first.other.at > 0 ? first.other : null;
            return {
                key: s.key, label: s.label, color: s.color, cost: s.rate.cost, profit: s.rate.profit, kept: s.rate.kept, ok: s.rate.ok, cap: s.rate.cap, points: s.points,
                pct: s.rate.pct, typed: settings.pct, capped: s.rate.pct < settings.pct, down: s.rate.down,
                others, short: firstBid && s.rate.cap > 0 && firstBid.pct > s.rate.cap ? { name: first.short, pct: firstBid.pct } : null,
            };
        }),
        verdict, cover, forum, thread, said,
        w3b: {
            known: !!w3bList, at: (i.w3b && i.w3b.listAt) || 0, error: (i.w3b && i.w3b.error) || '', sync: settings.w3bSync,
            diff: w3bDiff, matches: w3bDiff ? listMatches(w3bDiff) : null,
            // want: what the list should say (the engine writes from it). on: how many pieces that is.
            // over: the pieces left off because you hold too many, by name.
            want: w3bWant, on: w3bWant.length, over: w3bOver,
            lastReceiptAt: (i.w3b && i.w3b.lastReceiptAt) || 0, listedUntil: listedUntil((i.w3b && i.w3b.lastReceiptAt) || 0),
        },
        chart: {
            x: rates, least: sets[0] && sets[0].value ? Math.round(sets[0].value - sets[0].value / (1 + settings.least / 100)) : 0,
            series: sets.map((s) => ({ key: s.key, name: s.name, color: s.color, data: rates.map((r) => Math.round(s.value - s.rate.market * r / 100)) })),
        },
    };

    // ---- the ledger --------------------------------------------------------------------------------------------------
    // Pieces that left as themselves (F3): sold in your bazaar, on the Item Market or in a trade - each its own
    // profit or loss against what it had cost you - or given away (shown, and counted for nothing).
    const directRows = [...(i.direct || [])].sort((a, b) => b.t - a.t).map((d) => ({ ...d, name: nameOf(d.itemId), gain: d.give ? 0 : d.got - d.cost }));
    const directSold = directRows.filter((d) => !d.give);
    const days = profitBuckets(book.rows, mugs.rows, now, 'day', 14, directSold);
    const sum14 = profitSum(days);
    const sum7 = profitSum(days.slice(-7));
    const buys = (i.rows || []).filter((r) => r.side === 'buy');
    const soldRows = book.rows.filter((r) => r.kind === 'sold');
    // What the pieces and points you hold would bring today: each piece at its share of a set, each point at the price now.
    const worthNow = Object.entries(i.pool || {}).reduce((s, [id, c]) => s + c.n * pieceBrings(id, mv, pointsPrice), 0) + book.left * pointsPrice;
    const ledger = {
        days, weeks: profitBuckets(book.rows, mugs.rows, now, 'week', 12, directSold), months: profitBuckets(book.rows, mugs.rows, now, 'month', 12, directSold),
        sum: sum14, cum: runningTotal(days),
        notSold: pool.cost + book.cost, notSoldPoints: book.left, poolEst: pool.est, poolUnits: pool.units,
        // F2: the same at what it is worth today (0 while there is no points price), and the difference.
        notSoldWorth: pointsPrice ? Math.round(worthNow) : 0, notSoldDiff: pointsPrice ? Math.round(worthNow) - (pool.cost + book.cost) : 0,
        // F1: a part of what is left rests on an estimated cost (pieces never seen bought), as a share.
        estLeft: pool.cost + book.cost > 0 ? ((i.pool ? Object.entries(i.pool).reduce((s, [, c]) => s + (c.n ? c.cost * c.est / c.n : 0), 0) : 0) + book.cost * book.est) / (pool.cost + book.cost) : 0,
        sold: soldRows.map((r) => {
            const mug = mugs.rows.find((m) => m.saleId === r.id) || null;
            // F4: points of the lot that were yours before the book began: sold, and counted for nothing.
            const before = Math.max(0, vwWhole(r.points) - r.mine);
            return { id: r.id, t: r.t, points: r.mine, each: r.each, got: Math.round(r.mine * r.each), cost: r.cost, gain: r.gain, about: vwNum(r.est) >= BOOK_ABOUT && r.mine > 0, before, beforeGot: Math.round(before * r.each), mug: mug ? { counted: mug.counted, after: mug.after } : null };
        }),
        before: { points: vwSum(soldRows, (r) => Math.max(0, vwWhole(r.points) - r.mine)), got: Math.round(vwSum(soldRows, (r) => Math.max(0, vwWhole(r.points) - r.mine) * r.each)) },
        direct: {
            rows: directRows.slice(0, 200),
            units: vwSum(directSold, (d) => d.qty), got: vwSum(directSold, (d) => d.got), cost: vwSum(directSold, (d) => d.cost), gain: vwSum(directSold, (d) => d.gain),
            given: vwSum(directRows.filter((d) => d.give), (d) => d.qty), givenCost: vwSum(directRows.filter((d) => d.give), (d) => d.cost),
        },
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
    if (hotPlan.length) todo.push({ kind: 'hot', tone: '', n: vwSum(hotPlan, (l) => l.q), stops: hotPlanStops.length, pic: hotPlan[0].id, first: firstStops(hotPlanStops), cost: vwSum(hotPlanStops, (s) => s.cost), full: fullAfter((p) => onList(hotPlan, p.id)) });
    else if (buy.plan.units) todo.push({ kind: 'buy', tone: '', n: buy.plan.units, stops: buy.plan.stops, pic: plan[0].id, first: firstStops(planStops), cost: buy.plan.cost, full: buy.plan.full });
    if (prices.forum.behind) todo.push({ kind: 'post', tone: 'warn', words: prices.forum.behind.words, open: !!settings.open, thread: threadUrl });
    if (fullAll) todo.push({ kind: 'swap', tone: 'brand', n: fullAll, points: vwSum(sets, (s) => s.full * s.points) });
    if (book.left) todo.push(hold ? { kind: 'hold', tone: 'warn', usual: level.lo || 0 } : { kind: 'sell', tone: 'good', n: book.left, price: pointsPrice, each: Math.ceil(book.cost / book.left), loss: pointsPrice > 0 && book.left * pointsPrice < book.cost });

    return {
        at: now,
        ready: i.stockAt > 0 && pieces.some((p) => p.mv > 0),
        settings,
        top: { points: pointsPrice, cheap, usual: level, onHand: money.onHand == null ? null : vwWhole(money.onHand), vault: money.vault == null ? null : vwWhole(money.vault), pricesAt: i.pricesAt || 0, pointsAt: i.pointsAt || 0, stockAt: i.stockAt || 0, stock: i.stock || null },
        nav: { full: fullAll, need: pieces.filter((p) => p.need > 0).length, trades: open.length, hot: trades.wait > 0 },
        shop: { open: settings.open, pct: settings.pct, paid: prices.paid, state: verdict.state, lamp: verdict.lamp },
        sets, pieces, buy, trades, points, prices, ledger,
        dash: {
            full: fullAll, pointsHeld, made: book.left, profit7: sum7.profit, today: days[days.length - 1].profit, todo,
            pays: sets.map((s) => ({ key: s.key, label: s.label, pays: s.pays, priced: s.priced })),
            paysDays: ((i.hist && i.hist.pays) || []).slice(-40),
        },
        stock: { units: pool.units, cost: pool.cost, est: pool.est, made: book.left, sold14: sum14.points },
        share: { ...share, max: settings.shareMax, days: ((i.hist && i.hist.share) || []).slice(-14) },
        tape: pieces.filter((p) => p.lowAll).map((p) => ({ id: p.id, name: p.name, set: p.set, price: p.lowAll.price })),
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

/** The pieces as a list takes them: `take` units, each under `takeLine` - Buy, and the Stretch that finishes a set. */
export const listPieces = (pieces) => (pieces || []).map((p) => ({ ...p, worth: p.takeLine ?? p.worth, need: p.take ?? p.need }));
/** ... and as a list keeps them: a line stays for as long as its set does not lose with it (`lineT`). */
export const keepPieces = (pieces) => (pieces || []).map((p) => ({ ...p, worth: p.lineT ?? p.lineS ?? p.worth }));

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
