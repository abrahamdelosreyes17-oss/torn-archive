/*
 * 3.24.0: Points (core/points.js; the owner, 2026-10-05, mockups Z4 and Z7)
 * - the points market read into price levels, the first wall, the price to
 *   type, the lot, what is usual for the points price, and the points book.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    parsePointsMarket, priceLevels, firstWall, listPrice, goneLots, lotAdvice, recordPrice, usualLevel, pointsCheap, USUAL_DAYS,
    bookAdd, bookState, pointsLogTypes, entryFromLog, parsePointsRow, typedListing, listLines,
} from '../src/core/points.js';

const NOW = Date.UTC(2026, 9, 5, 14, 30);
const DAY = 86400000;

// The market as read in the owner's Chrome, 5 Oct about 14:30 UTC.
const MARKET = {
    pointsmarket: {
        101: { cost: 29999, quantity: 50, total_cost: 1499950 },
        102: { cost: 30000, quantity: 100 }, 103: { cost: 30000, quantity: 100 }, 104: { cost: 30000, quantity: 100 }, 105: { cost: 30000, quantity: 100 },
        106: { cost: 30900, quantity: 1000 },
        107: { cost: 30999, quantity: 1000 }, 108: { cost: 30999, quantity: 1500 },
        109: { cost: 31000, quantity: 2026 }, 110: { cost: 31000, quantity: 300 },
    },
};

test('the points market: listings cheapest first, folded by price', () => {
    const l = parsePointsMarket(MARKET);
    assert.equal(l.length, 10);
    assert.deepEqual(l[0], { id: '101', cost: 29999, qty: 50 });
    assert.deepEqual(priceLevels(l).map((v) => [v.price, v.qty, v.lots]), [[29999, 50, 1], [30000, 400, 4], [30900, 1000, 1], [30999, 2500, 2], [31000, 2326, 2]]);
    assert.deepEqual(parsePointsMarket(null), []);
    assert.deepEqual(parsePointsMarket({ pointsmarket: { 1: { cost: 0, quantity: 5 }, 2: { cost: 2_000_000, quantity: 5 }, 3: null } }), []);
    assert.deepEqual(parsePointsMarket({ pointsmarket: [{ id: 7, price: 31000, amount: 5 }] }), [{ id: '7', cost: 31000, qty: 5 }]);
});

test('the first wall is the first level holding three times everything cheaper; $1 under it, with the points ahead', () => {
    const l = parsePointsMarket(MARKET);
    assert.deepEqual(firstWall(priceLevels(l)), { price: 30000, ahead: 50, index: 1 });
    assert.deepEqual(listPrice(l), { price: 29999, ahead: 0, rule: 'wall', lowest: 29999, wall: 30000 });
    assert.deepEqual(listPrice(l, 'lowest'), { price: 29998, ahead: 0, rule: 'lowest', lowest: 29999, wall: 30000 });
    assert.equal(listPrice([]), null);
    // A few cheap points, then the bulk: the wall is the bulk, however wide or narrow the step in price.
    const book = [[30650, 120], [30700, 300], [30900, 4000], [30999, 6500], [31000, 18400]].map(([cost, qty], i) => ({ id: String(i), cost, qty }));
    assert.deepEqual(firstWall(priceLevels(book)), { price: 30900, ahead: 420, index: 2 });
    assert.deepEqual(listPrice(book), { price: 30899, ahead: 420, rule: 'wall', lowest: 30650, wall: 30900 });
});

test('a book that climbs evenly has no wall: $1 under the lowest', () => {
    const even = [31000, 31010, 31020, 31030, 31040].map((cost, i) => ({ id: String(i), cost, qty: 100 }));
    assert.equal(firstWall(priceLevels(even)), null);
    assert.deepEqual(listPrice(even), { price: 30999, ahead: 0, rule: 'lowest', lowest: 31000, wall: null });
    assert.equal(firstWall(priceLevels(even.slice(0, 2))), null);
});

test('lots: one lot, unless small lots are what has been leaving near your price', () => {
    assert.deepEqual(lotAdvice(120, [], 30899, NOW), { lots: [120], size: 120, seen: null, split: false });
    const big = [100, 300, 500, 500, 1000].map((qty) => ({ cost: 30900, qty, t: NOW - 3600000 }));
    const a = lotAdvice(120, big, 30899, NOW);
    assert.deepEqual([a.lots, a.split], [[120], false]);
    assert.deepEqual(a.seen, { count: 5, lo: 100, hi: 1000 });
    const small = [25, 25, 50, 50, 50, 100].map((qty) => ({ cost: 30800, qty, t: NOW - 3600000 }));
    const b = lotAdvice(120, small, 30899, NOW);
    assert.deepEqual([b.lots, b.size, b.split], [[50, 50, 20], 50, true]);
    // Older than a day, or far over your price: not counted.
    assert.equal(lotAdvice(120, small.map((g) => ({ ...g, t: NOW - 2 * DAY })), 30899, NOW).split, false);
    assert.equal(lotAdvice(120, small.map((g) => ({ ...g, cost: 33000 })), 30899, NOW).split, false);
    assert.deepEqual(lotAdvice(0, small, 30899, NOW).lots, []);
});

test('lots that left the market between two reads', () => {
    const a = parsePointsMarket(MARKET);
    const b = a.filter((l) => l.id !== '101' && l.id !== '106');
    assert.deepEqual(goneLots(a, b, NOW), [{ cost: 29999, qty: 50, t: NOW }, { cost: 30900, qty: 1000, t: NOW }]);
    assert.deepEqual(goneLots([], a, NOW), []);
});

test('what is usual: the last month of daily averages, today left out, and only after five days', () => {
    let days = [];
    for (let d = 6; d >= 1; d--) {
        days = recordPrice(days, NOW - d * DAY, 31000 + d * 100);
        days = recordPrice(days, NOW - d * DAY + 3600000, 31000 + d * 100 + 50);
    }
    days = recordPrice(days, NOW, 30899);
    assert.equal(days.length, 7);
    assert.equal(days[0].n, 2);
    const level = usualLevel(days, NOW);
    assert.deepEqual(level, { lo: 31125, hi: 31625, days: 6 });
    assert.equal(pointsCheap(30899, level), true);
    assert.equal(pointsCheap(31200, level), false);
    const few = usualLevel(days.slice(-4), NOW);
    assert.deepEqual(few, { days: 3 });
    assert.equal(pointsCheap(1, few), false, 'too few days: never called cheap');
    assert.equal(USUAL_DAYS, 5);
    assert.deepEqual(recordPrice(days, NOW, 0), days);
    assert.ok(recordPrice(Array.from({ length: 60 }, (_, i) => ({ day: '2026-07-' + String(i + 10), n: 1, sum: 1, lo: 1, hi: 1 })), NOW, 5).length <= 40);
});

test('the points book: points made carry their cost; sold and used come off the oldest first (mockup Z4)', () => {
    let book = [];
    book = bookAdd(book, { id: 'a', t: 1000, kind: 'made', points: 200, each: 29_800, set: 'plushie', src: 'log' });
    book = bookAdd(book, { id: 'b', t: 2000, kind: 'made', points: 120, each: 29_955, set: 'plushie', src: 'log' });
    book = bookAdd(book, { id: 'c', t: 3000, kind: 'sold', points: 150, each: 31_000, src: 'log' });
    book = bookAdd(book, { id: 'd', t: 4000, kind: 'used', points: 50, each: 30_900, src: 'log' });
    book = bookAdd(book, { id: 'a', t: 1000, kind: 'made', points: 200, each: 1, src: 'log' });
    assert.equal(book.length, 4, 'the same entry is never added twice');
    const s = bookState(book, 30_899);
    assert.deepEqual([s.made, s.sold, s.used, s.left], [320, 150, 50, 120]);
    assert.equal(s.profitSold, 150 * (31_000 - 29_800));
    assert.equal(s.saved, 50 * (30_900 - 29_800));
    assert.equal(s.cost, 120 * 29_955);
    assert.equal(s.least, 29_956);
    assert.equal(s.value, 120 * 30_899);
    assert.equal(s.rows[0].id, 'd', 'newest first');
});

test('the points book: points sold beyond what sets made were yours before - no cost, no profit', () => {
    let book = bookAdd([], { id: 'a', t: 1000, kind: 'made', points: 20, each: 30_000, src: 'log' });
    book = bookAdd(book, { id: 'b', t: 2000, kind: 'sold', points: 100, each: 31_000, src: 'log' });
    const s = bookState(book);
    assert.deepEqual([s.sold, s.left, s.profitSold, s.least], [20, 0, 20_000, 0]);
    assert.equal(s.rows[0].mine, 20);
    assert.deepEqual(bookAdd([], { id: 'x', kind: 'made', points: 0, each: 5 }), []);
    assert.equal(bookState([]).left, 0);
});

test('one exchange seen twice (the press on the museum page, then Torn\'s log) is one entry with the page\'s cost', () => {
    let book = bookAdd([], { id: 'page:1', t: 1_000_000, kind: 'made', points: 120, each: 29_955, set: 'plushie', src: 'page' });
    book = bookAdd(book, { id: 'log:77', t: 1_030_000, kind: 'made', points: 120, each: 0, set: null, src: 'log' });
    assert.equal(book.length, 1);
    assert.deepEqual([book[0].id, book[0].each, book[0].set, book[0].twin], ['log:77', 29_955, 'plushie', 'page:1']);
    // The log read again, and the other order.
    assert.equal(bookAdd(book, { id: 'log:77', t: 1_030_000, kind: 'made', points: 120, each: 0, src: 'log' }).length, 1);
    let other = bookAdd([], { id: 'log:78', t: 2_000_000, kind: 'made', points: 30, each: 0, src: 'log' });
    other = bookAdd(other, { id: 'page:2', t: 2_010_000, kind: 'made', points: 30, each: 29_600, set: 'flower', src: 'page' });
    assert.deepEqual([other.length, other[0].id, other[0].each], [1, 'log:78', 29_600]);
    // A second exchange of the same size a little later is its own entry.
    assert.equal(bookAdd(book, { id: 'page:3', t: 1_060_000, kind: 'made', points: 120, each: 30_000, src: 'page' }).length, 2);
    // Ten minutes apart: two exchanges.
    assert.equal(bookAdd(bookAdd([], { id: 'page:4', t: 0, kind: 'made', points: 10, each: 1, src: 'page' }), { id: 'log:5', t: 600_000, kind: 'made', points: 10, each: 0, src: 'log' }).length, 2);
});

test('Torn\'s log types are found by their titles, and a row is only an entry when it reads with certainty', () => {
    const types = pointsLogTypes({ logtypes: { 7000: 'Museum exchange', 5010: 'Points market buy', 5011: 'Points market sell', 4900: 'Points refill energy', 1225: 'Bazaar buy', 5012: 'Points market add' } });
    assert.deepEqual([types.made, types.sold, types.used], [[7000], [5011], [4900]]);
    assert.deepEqual(pointsLogTypes(null).made, []);
    const ctx = { costOf: (set, points) => (set === 'plushie' ? 29_955 : 0), priceNow: 30_899 };
    assert.deepEqual(entryFromLog('L1', { log: 7000, title: 'Museum exchange', timestamp: 100, data: { points: 120, set: 'Plushie Set' } }, types, ctx), { id: 'log:L1', t: 100_000, kind: 'made', points: 120, each: 29_955, set: 'plushie', src: 'log' });
    assert.deepEqual(entryFromLog('L2', { log: 5011, timestamp: 200, data: { quantity: 120, cost_each: 30_899, cost_total: 3_707_880 } }, types, ctx), { id: 'log:L2', t: 200_000, kind: 'sold', points: 120, each: 30_899, set: null, src: 'log' });
    assert.equal(entryFromLog('L3', { log: 5011, timestamp: 200, data: { points: 100, total_cost: 3_100_000 } }, types, ctx).each, 31_000);
    assert.deepEqual(entryFromLog('L4', { log: 4900, timestamp: 300, data: { points_used: 25 } }, types, ctx), { id: 'log:L4', t: 300_000, kind: 'used', points: 25, each: 30_899, set: null, src: 'log' });
    // Not ours, no points in it, or a price that cannot be one: no entry.
    assert.equal(entryFromLog('L5', { log: 1225, timestamp: 1, data: { points: 5 } }, types, ctx), null);
    assert.equal(entryFromLog('L6', { log: 7000, timestamp: 1, data: {} }, types, ctx), null);
    assert.equal(entryFromLog('L7', { log: 5011, timestamp: 1, data: { quantity: 2, cost_total: 9_000_000 } }, types, ctx), null);
    assert.equal(entryFromLog('L8', null, types, ctx), null);
});

test('points used with no price on record claim no saving and no loss', () => {
    const b = bookState([
        { id: 'a', t: 1, kind: 'made', points: 30, each: 29785 },
        { id: 'b', t: 2, kind: 'used', points: 25, each: 0 },
    ], 30900);
    assert.deepEqual([b.used, b.saved, b.left, b.rows[0].gain], [25, 0, 5, 0]);
});

// ---- a listing as you type it (mockup Z7; the list is the owner's own page, 2026-10-11) -------------------------------

const PAGE_ROWS = [[405, 30893], [1111, 30895], [1111, 30895], [4000, 30898], [4000, 30898], [21, 31000], [100, 31119]].map(([points, each]) => ({ points, each }));

test('a row of Torn\'s points list is told by its own numbers: count x price = total, and nothing else is a row', () => {
    assert.deepEqual(parsePointsRow('Some_Seller 405 $30,893 $12,511,665'), { points: 405, each: 30893, total: 12511665 });
    assert.deepEqual(parsePointsRow('Name2000 [2000001] 1,111 $30,895 $34,324,345 buy'), { points: 1111, each: 30895, total: 34324345 });
    assert.deepEqual(parsePointsRow('x 1 $31,000 $31,000'), { points: 1, each: 31000, total: 31000 });
    // What Torn asks before a buy, written after the row's own numbers, does not change them.
    assert.deepEqual(parsePointsRow('x 21 $31,000 $651,000 Are you sure you want to buy 21 points for $651,000?'), { points: 21, each: 31000, total: 651000 });
    for (const not of ['', 'Name Points Cost Each Total Price Action', 'x 405 $30,893', 'x 400 $30,893 $12,511,665', 'x $30,893 $12,511,665', 'Maximum price each is $100,000. You have 1,183 points available.', 'x 2 $200,000 $400,000']) assert.equal(parsePointsRow(not), null, not);
});

test('a price typed on the points market: what sells before it, and a loss, cheap or more under the lowest than it takes', () => {
    assert.equal(typedListing(PAGE_ROWS, { price: 0, amount: 50 }), null);
    assert.equal(typedListing(PAGE_ROWS, { price: 100001, amount: 50 }), null);
    // $1 under the lowest: first, nothing given away, and with no cost on record nothing is called a loss.
    const first = typedListing(PAGE_ROWS, { price: 30892, amount: 50 });
    assert.deepEqual([first.ahead, first.at, first.past, first.state, first.by, first.under], [0, 0, false, '', null, 0]);
    // At a price others are at: they were there first.
    const same = typedListing(PAGE_ROWS, { price: 30895, amount: 50, least: 29956 });
    assert.deepEqual([same.ahead, same.at, same.state, same.by], [405 + 1111 + 1111, 3, 'good', 30895 - 29955]);
    // Over every row of the page: more sell first than the page shows.
    const past = typedListing(PAGE_ROWS, { price: 32000, amount: 50 });
    assert.deepEqual([past.ahead, past.at, past.past], [10748, null, true]);
    // Under your least price: a loss, whatever else it is.
    const loss = typedListing(PAGE_ROWS, { price: 29900, amount: 120, least: 29956, level: { lo: 31000, hi: 31750 } });
    assert.deepEqual([loss.state, loss.by, loss.under, loss.given], ['loss', -55, 992, 992 * 120]);
    assert.equal(typedListing(PAGE_ROWS, { price: 29955, amount: 1, least: 29956 }).by, 0, 'what they cost: no profit, no loss');
    // A profit, but under the month's level: cheap.
    assert.equal(typedListing(PAGE_ROWS, { price: 30892, amount: 50, least: 29956, level: { lo: 31000, hi: 31750 } }).state, 'cheap');
    // A slip of the finger: far under the lowest.
    const slip = typedListing(PAGE_ROWS, { price: 3089, amount: 50 });
    assert.deepEqual([slip.under, slip.given], [30892 - 3089, (30892 - 3089) * 50]);
    // No list read: the price is still judged against your cost.
    assert.deepEqual([typedListing([], { price: 30000, least: 29956 }).state, typedListing([], { price: 30000 }).past], ['good', false]);
});

test('the lines in the list: above them a price is cheap, or a loss - none where no row is under it, or every row is', () => {
    assert.deepEqual(listLines(PAGE_ROWS, { least: 29956, level: { lo: 31000, hi: 31750 } }), { lossAt: null, cheapAt: 5 });
    assert.deepEqual(listLines(PAGE_ROWS, { least: 30897, level: { lo: 30000 } }), { lossAt: 3, cheapAt: null });
    assert.deepEqual(listLines(PAGE_ROWS, { least: 40000, level: {} }), { lossAt: null, cheapAt: null });
    assert.deepEqual(listLines([], { least: 29956 }), { lossAt: null, cheapAt: null });
});
