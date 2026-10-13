// What you pay your sellers (the owner, 2026-10-12): the ceiling applied by itself (R1), one cautious points price
// for sellers and for the cart's Buy line (R2), the table fixed for an hour (R3), down at once when points fall
// (R4), the rate really paid in the trade message and beside the thread (R5, R7). The pure parts and the view; the
// engine's part is at the foot of engine.test.js, the pages' in next-pages.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SETS, ratePrice, setMarketValue, threadCheck } from '../src/core/sets.js';
import { cautiousPrice, rateCeiling, paidRate, rateKey, liveTable, fixTable, safeTable, othersPay, rateWords, rateShort, RATE_HOUR_MS, BID_KEEPS_MS } from '../src/core/sellrate.js';
import { safeWorth } from '../src/core/margin.js';
import { archiveView } from '../src/core/view.js';
import { archiveSettings } from '../src/core/settings.js';
import { fixtureInput } from './fixture-view.js';

const NOW = Date.UTC(2026, 9, 12, 13, 0);
const HOUR = 3600000;
const DAY = 86400000;
const [PLUSH, FLOWER] = SETS;
// A made-up market: every plushie $1,000 (a set $13,000), every flower $1,300 (a set $14,300). Ten points a set.
const mv = (id) => (PLUSH.pieces.some((p) => String(p.id) === String(id)) ? 1000 : FLOWER.pieces.some((p) => String(p.id) === String(id)) ? 1300 : 0);
const piece = (v, id) => v.pieces.find((p) => String(p.id) === String(id));
const setOf = (v, key) => v.prices.sets.find((s) => s.key === key);
/** The points market with one wall: the price the view takes is a dollar under it. */
const wall = (price) => [{ id: 'a', cost: price + 1, qty: 9000 }];
/** The made-up desk with nothing sold lately and the points price as given: no usual selling price of your own. */
const deskAt = (price, over = {}) => fixtureInput(NOW, { listings: wall(price), book: [], days: [], wallDays: [], ...over });

// ---- the pure parts ------------------------------------------------------------------------------------------------

test('R2. a cautious points price: the lower of today\'s and what you usually sell for; today\'s when no usual price is known', () => {
    assert.deepEqual(cautiousPrice(31098, 31004), { price: 31004, from: 'usual', today: 31098, usual: 31004, high: 31098 });
    assert.deepEqual(cautiousPrice(30400, 31004), { price: 30400, from: 'today', today: 30400, usual: 31004, high: 31004 });
    assert.deepEqual(cautiousPrice(30400, 0), { price: 30400, from: 'today', today: 30400, usual: 0, high: 30400 });
    assert.equal(cautiousPrice(0, 31004).price, 0, 'no points price read: nothing is known');
});

test('R1. what you pay is the lower of the most you pay and the set\'s own ceiling - each set its own', () => {
    // Ten points at $1,400 bring $14,000. With a least profit of 2% a plushie set may cost $13,725: 105.5% of its
    // $13,000. A flower set, $14,300 at market value, may cost the same $13,725: 95.9%.
    assert.equal(rateCeiling(13000, 14000, 2), 105.5);
    assert.equal(rateCeiling(14300, 14000, 2), 95.9);
    assert.equal(rateCeiling(0, 14000, 2), 0);
    assert.equal(paidRate(101, 105.5), 101);
    assert.equal(paidRate(101, 95.9), 95.9);
    assert.equal(paidRate(101, 0), 101, 'no ceiling known: the most you pay');
    const live = liveTable(SETS, mv, 101, 2, cautiousPrice(1400, 0));
    assert.equal(live.ok, true);
    assert.deepEqual([live.sets.plushie.pct, live.sets.plushie.cap, live.sets.flower.pct, live.sets.flower.cap], [101, 105.5, 95.9, 95.9]);
    for (const p of PLUSH.pieces) assert.equal(live.pay[p.id], 1010);
    for (const p of FLOWER.pieces) assert.equal(live.pay[p.id], ratePrice(1300, 95.9));
    // The whole set at what is paid still leaves the least profit.
    const cost = FLOWER.pieces.reduce((s, p) => s + live.pay[p.id], 0);
    assert.ok((14000 - cost) / cost * 100 >= 2, 'a flower set at the ceiling keeps 2%');
    // No points price: no ceiling, the most you pay, and not a table to fix.
    const none = liveTable(SETS, mv, 101, 2, cautiousPrice(0, 0));
    assert.deepEqual([none.ok, none.sets.plushie.pct, none.sets.plushie.cap, none.pay[PLUSH.pieces[0].id]], [false, 101, 0, 1010]);
});

test('R3 + R4. a table fixed for the hour only ever comes down: at once when the points price falls under your least profit, never up', () => {
    const key = rateKey(archiveSettings({ pct: 101, least: 2 }));
    const table = fixTable(liveTable(SETS, mv, 101, 2, cautiousPrice(1400, 0)), key, NOW);
    assert.deepEqual([table.at, table.until, table.rev, table.held, table.key], [NOW, NOW + RATE_HOUR_MS, NOW, false, key]);
    // Points rise: the same table, the very object - nothing is worked out for it, nothing is written.
    assert.equal(safeTable(table, SETS, 1500, NOW + 600000), table);
    assert.equal(safeTable(table, SETS, 1400, NOW + 600000), table);
    // Points fall to $1,300: ten bring $13,000, a plushie set may cost $12,745 = 98.0%. The plushies come down.
    const at = NOW + 20 * 60000;
    const down = safeTable(table, SETS, 1300, at);
    assert.notEqual(down, table);
    assert.deepEqual([down.sets.plushie.pct, down.sets.plushie.down], [98, { at, from: 101, price: 1300 }]);
    assert.equal(down.pay[PLUSH.pieces[0].id], 980);
    assert.deepEqual([down.at, down.until, down.rev], [NOW, NOW + RATE_HOUR_MS, at], 'the hour is not begun again; what was written is out of date');
    // The flowers were at their ceiling already and come down with it.
    assert.equal(down.sets.flower.pct, rateCeiling(14300, 13000, 2));
    // Points back up inside the hour: it stays down. A second fall names the rate the hour began with.
    assert.equal(safeTable(down, SETS, 1400, at + 60000), down);
    const again = safeTable(down, SETS, 1250, at + 120000);
    assert.equal(again.sets.plushie.down.from, 101);
    assert.equal(safeTable(null, SETS, 1300, at), null);
    assert.equal(safeTable(table, SETS, 0, at), table, 'no points price read: nothing is judged');
});

test('R3. the settings a table rests on: your rate, your least profit, the sets you trade', () => {
    const a = rateKey(archiveSettings({ pct: 101, least: 2 }));
    assert.equal(rateKey(archiveSettings({ pct: 101, least: 2, open: false, target: 9 })), a, 'nothing else moves it');
    assert.notEqual(rateKey(archiveSettings({ pct: 101.5, least: 2 })), a);
    assert.notEqual(rateKey(archiveSettings({ pct: 101, least: 3 })), a);
    assert.notEqual(rateKey(archiveSettings({ pct: 101, least: 2, which: { plushie: true, flower: false } })), a);
});

test('R6. what others pay for a set: each piece at its best other buyer, summed - a cheap piece far over does not move it; old prices do not count', () => {
    const bids = Object.fromEntries(PLUSH.pieces.map((p) => [p.id, { price: 1020, at: NOW - 2 * HOUR }]));
    assert.deepEqual(othersPay(PLUSH, mv, (id) => bids[id], NOW), { pct: 102, pieces: 13, of: 13, at: NOW - 2 * HOUR });
    // One piece at 126% of its $1,000 on a $13,000 set: 102.0% becomes 103.8%, not 126%.
    bids[PLUSH.pieces[0].id] = { price: 1260, at: NOW - 5 * HOUR };
    assert.deepEqual(othersPay(PLUSH, mv, (id) => bids[id], NOW), { pct: 103.8, pieces: 13, of: 13, at: NOW - 5 * HOUR });
    // Read over a day ago: it counts for nothing, and the answer says how many pieces it rests on.
    bids[PLUSH.pieces[0].id] = { price: 1260, at: NOW - BID_KEEPS_MS - 1 };
    assert.deepEqual(othersPay(PLUSH, mv, (id) => bids[id], NOW), { pct: 102, pieces: 12, of: 13, at: NOW - 2 * HOUR });
    assert.equal(othersPay(PLUSH, mv, () => null, NOW), null);
});

test('R7. the rate in words: one rate, or each set its own', () => {
    assert.equal(rateWords([{ label: 'Plushie', pct: 101 }, { label: 'Flower', pct: 101 }]), '101% of market value');
    assert.equal(rateWords([{ label: 'Plushie', pct: 100.6 }, { label: 'Flower', pct: 101 }]), '100.6% of market value for plushies and 101% for flowers');
    assert.equal(rateWords([]), '');
    assert.equal(rateShort([{ label: 'Plushie', pct: 101 }, { label: 'Flower', pct: 101 }]), '101%');
    assert.equal(rateShort([{ label: 'Plushie', pct: 101 }, { label: 'Flower', pct: 100.6 }]), '100.6% to 101%');
});

test('R7. your thread: the title names the most you pay; when you pay less today, the check says so', () => {
    const paid = [{ label: 'Plushie', pct: 100.6 }, { label: 'Flower', pct: 101 }];
    const c = threadCheck('[OPEN] Buying Plushies & Flowers · 101%', { open: true, pct: 101, paid });
    assert.deepEqual([c.state, c.says.pct, rateShort(c.paid)], ['under', 101, '100.6% to 101%']);
    assert.equal(threadCheck('[OPEN] Buying Plushies & Flowers · 101%', { open: true, pct: 101, paid: [{ label: 'Plushie', pct: 101 }] }).state, 'match');
    assert.equal(threadCheck('[OPEN] Buying Plushies & Flowers · 100%', { open: true, pct: 101, paid }).state, 'rate', 'a title that does not name your rate is said first');
    assert.equal(threadCheck('[CLOSED] Buying Plushies · 101%', { open: false, pct: 101, paid }).state, 'match');
});

// ---- the view ------------------------------------------------------------------------------------------------------

test('R1. the view: with points low, every price of yours is at the set\'s ceiling - the Prices table, the TornW3B list, a trade, "Do now"', () => {
    const base = archiveView(deskAt(31500));
    assert.ok(base.prices.sets.every((s) => s.pct === 101 && !s.capped && s.cap > 101), 'at $31,500 a point 101% is under both ceilings');
    assert.equal(piece(base, 274).pay, ratePrice(34600, 101));

    // Points at $30,000: ten bring $300,000. Each set's ceiling is its own.
    const input = deskAt(30000, { w3b: { list: new Map(), listAt: NOW, receipts: new Map(), lastReceiptAt: 0, error: '' } });
    const v = archiveView(input);
    for (const set of SETS) {
        const cap = rateCeiling(setMarketValue(set, input.mv), 300000, 2);
        const s = setOf(v, set.key);
        assert.ok(cap < 101, set.key + ' is capped in this market: ' + cap);
        assert.deepEqual([s.pct, s.cap, s.capped, s.typed], [cap, cap, true, 101]);
        let cost = 0;
        for (const p of set.pieces) { assert.equal(piece(v, p.id).pay, ratePrice(input.mv(p.id), cap), p.name); cost += piece(v, p.id).pay; }
        assert.equal(s.cost, cost);
        assert.ok(s.profit / s.cost * 100 >= 1.9, 'a ' + set.key + ' set at what you pay keeps your least profit: ' + (s.profit / s.cost * 100));
    }
    assert.notEqual(setOf(v, 'plushie').pct, setOf(v, 'flower').pct, 'plushies and flowers differ');
    // What is sent to TornW3B is what you pay.
    const sent = new Map(v.prices.w3b.diff.set.map((x) => [String(x.itemID), x.price]));
    // (1.3.3: a piece you hold too many of is left off the list.)
    assert.ok(v.pieces.some((p) => !(p.ahead > 0)));
    for (const p of v.pieces) assert.equal(sent.get(String(p.id)), p.ahead > 0 ? undefined : p.pay, p.name);
    // A trade is priced at it, and its message names the rate really paid - each set its own.
    const t = v.trades.open.find((x) => x.id === '9001');
    for (const r of t.rows.filter((x) => x.state !== 'other')) assert.equal(r.each, piece(v, r.id).pay, r.name);
    // (1.4.0: the message no longer names a rate - it asks for what you do not take to come out. The rate really
    // paid is on the trade itself, each set its own.)
    assert.equal(t.paid, [setOf(v, 'plushie').pct, setOf(v, 'flower').pct].sort((a, b) => a - b).join('% to ') + '%');
    assert.ok(!/[%$]/.test(t.message));
    assert.equal(t.margin.state, 'ok', 'a trade at the ceiling keeps your least profit');
    // "Open your shop?" no longer says the rate is too high: it is never paid.
    assert.equal(v.prices.verdict.checks.leaves.ok, true);
    assert.notEqual(v.prices.verdict.state, 'low');
    // The top bar's shop says what you pay.
    assert.equal(v.shop.paid, rateShort(v.prices.sets));
    assert.equal(v.shop.pct, 101);
});

test('R2. the view: one points price for sellers and for the cart - a piece\'s worth, the Buy line and the ceiling all rest on the lower one', () => {
    // You sold points at $30,500 last week; today they stand at $31,000.
    const book = [{ id: 's1', t: NOW - 3 * DAY, kind: 'sold', points: 500, each: 30500, set: null }];
    const input = deskAt(31000, { book });
    const v = archiveView(input);
    assert.deepEqual([v.points.price, v.buy.usual.price, v.buy.usual.low, v.buy.usual.high, v.buy.usual.by], [31000, 30500, 30500, 31000, 'usual']);
    assert.equal(piece(v, 274).worth, safeWorth(274, input.mv, 30500, 2), 'the worth of a piece is at the lower price');
    assert.equal(setOf(v, 'plushie').cap, rateCeiling(setMarketValue(PLUSH, input.mv), 305000, 2));
    assert.deepEqual([v.prices.points.price, v.prices.points.from, v.prices.points.today], [30500, 'usual', 31000]);
    // What a set brings on the screen stays at today's price: only the limits move.
    assert.equal(v.sets[0].value, 310000);
    assert.equal(piece(v, 274).brings, Math.floor(310000 * 34600 / setMarketValue(PLUSH, input.mv)));
    // The other way round: today under what you usually sell for. The lower one is today's, and a Stretch is what
    // pays only at the usual price - as before.
    const w = archiveView(deskAt(30500, { book: [{ id: 's1', t: NOW - 3 * DAY, kind: 'sold', points: 500, each: 31000, set: null }] }));
    assert.deepEqual([w.buy.usual.low, w.buy.usual.high, w.buy.usual.by], [30500, 31000, 'today']);
    assert.equal(piece(w, 274).worth, piece(v, 274).worth, 'the same lower price, the same worth');
    // No usual price known: today's, and no Stretch.
    const n = archiveView(deskAt(31000));
    assert.deepEqual([n.buy.usual.low, n.buy.usual.high, n.buy.usual.by], [31000, 31000, 'today']);
    assert.equal(n.pieces.reduce((s, p) => s + p.stretchUnits, 0), 0);
});

test('R3 + R4 + R5. the view: a fixed table is what you pay until its hour ends - up or sideways nothing moves; a fall brings it down at once', () => {
    const settings = deskAt(31500).settings;
    const fixed = fixTable(archiveView(deskAt(31500)).prices.live, rateKey(settings), NOW - 20 * 60000);
    assert.equal(fixed.sets.plushie.pct, 101);
    // Market values moved and points fell a little since the fix: the fixed prices stand.
    const baseMv = deskAt(31500).mv;
    const moved = (id) => Math.round(baseMv(id) * 1.03);
    const v = archiveView(deskAt(31200, { rate: fixed, mv: moved }));
    assert.equal(piece(v, 274).pay, ratePrice(34600, 101), 'the price fixed, not 101% of the new market value');
    assert.deepEqual([v.prices.fixed.at, v.prices.fixed.until, v.prices.fixed.held], [fixed.at, fixed.at + RATE_HOUR_MS, false]);
    assert.deepEqual([setOf(v, 'plushie').pct, setOf(v, 'plushie').down], [101, null]);
    // What a fix would take now is beside it, for the engine: the new market values, and their own ceiling.
    const capOn = (points) => Math.min(101, rateCeiling(PLUSH.pieces.reduce((s, p) => s + moved(p.id), 0), points * 10, 2));
    assert.ok(capOn(31200) < 101);
    assert.equal(v.prices.live.pay[274], ratePrice(moved(274), capOn(31200)));
    // Points fall to $30,000 inside the hour: down to the ceiling at once, on the table's own market values.
    const f = archiveView(deskAt(30000, { rate: fixed }));
    const cap = rateCeiling(setMarketValue(PLUSH, deskAt(1).mv), 300000, 2);
    assert.deepEqual([setOf(f, 'plushie').pct, setOf(f, 'plushie').down.from, setOf(f, 'plushie').down.price], [cap, 101, 30000]);
    assert.equal(piece(f, 274).pay, ratePrice(34600, cap));
    // A trade open then says the rate came down.
    const t = f.trades.open.find((x) => x.id === '9001');
    assert.deepEqual(t.rateDown.map((d) => [d.label, d.from, d.to]), [['Plushie', 101, cap], ['Flower', 101, setOf(f, 'flower').pct]]);
    assert.deepEqual(v.trades.open[0].rateDown, []);
    // A table made for other settings, or a closed shop: not used - the view says what you would pay now.
    const other = archiveView(deskAt(31500, { rate: { ...fixed, key: 'something else' }, mv: moved }));
    assert.equal(other.prices.fixed, null);
    assert.equal(piece(other, 274).pay, ratePrice(moved(274), capOn(31500)));
    const closed = deskAt(31500, { rate: fixed, mv: moved });
    closed.settings = archiveSettings({ ...closed.settings, open: false });
    assert.equal(archiveView(closed).prices.fixed, null);
});

test('R6. the view: what others pay for a set, and the piece holding it back when its buyer pays over your ceiling', () => {
    const input = deskAt(30000);
    const short = input.held;
    // Every piece has a buyer at 98% of market value, read two hours ago - under both ceilings; the Panda (the
    // piece you are shortest of) has one at 105%.
    input.topBid = (id) => ({ price: Math.round(input.mv(id) * (Number(id) === 274 ? 1.05 : 0.98)), pct: Number(id) === 274 ? 105 : 98, name: 'Buyer', at: NOW - 2 * HOUR });
    const v = archiveView(input);
    const s = setOf(v, 'plushie');
    assert.equal(short(274), 12, 'the Panda is the plushie you hold fewest of');
    assert.ok(s.cap > 98 && s.cap < 105);
    assert.deepEqual([s.others.pieces, s.others.of, s.others.at], [13, 13, NOW - 2 * HOUR]);
    assert.ok(s.others.pct > 98 && s.others.pct < 99, 'the set, not the one piece: ' + s.others.pct);
    assert.deepEqual(s.short, { name: 'Panda', pct: 105 });
    assert.equal(setOf(v, 'flower').short, null, 'the flower you are shortest of has no buyer over your ceiling');
    assert.equal(setOf(v, 'flower').others.pct, 98);
    // Prices read over a day ago: nothing is said.
    input.topBid = (id) => ({ price: input.mv(id), pct: 100, name: 'Buyer', at: NOW - 2 * DAY });
    assert.deepEqual([setOf(archiveView(input), 'plushie').others, setOf(archiveView(input), 'plushie').short], [null, null]);
});
