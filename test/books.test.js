import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    poolAdd, poolTake, poolMatch, poolEach, poolSum, poolSetCost, poolSwap,
    avgBook, heldByDay, mugCheck, profitBuckets, profitSum, runningTotal,
} from '../src/core/books.js';

const DAY = 86400000;
const T0 = Date.UTC(2026, 9, 5, 12);   // Monday 5 Oct 2026, noon
const pair = { key: 'pair', pieces: [{ id: 1 }, { id: 2 }] };

test('the pool keeps an average, and units leave at it', () => {
    let pool = poolAdd({}, 1, 10, 1000);
    pool = poolAdd(pool, 1, 10, 3000);
    assert.equal(poolEach(pool, 1), 200);
    const took = poolTake(pool, 1, 5);
    assert.equal(took.cost, 1000);
    assert.equal(took.units, 5);
    assert.deepEqual(took.pool[1], { n: 15, cost: 3000, est: 0 });
    assert.equal(poolTake(pool, 1, 99).units, 20, 'never more than it holds');
    assert.equal(poolTake(pool, 7, 1).units, 0);
    assert.equal(poolAdd(pool, 1, 0, 500), pool, 'no units, nothing changes');
});

test('the pool is brought to what you hold: unseen units at the value of the day', () => {
    let pool = poolAdd({}, 1, 4, 400);
    pool = poolMatch(pool, (id) => ({ 1: 10, 2: 3 }[id]), () => 150, [1, 2]);
    assert.deepEqual(pool[1], { n: 10, cost: 400 + 6 * 150, est: 6 });
    assert.deepEqual(pool[2], { n: 3, cost: 450, est: 3 });
    pool = poolMatch(pool, (id) => ({ 1: 5, 2: 0 }[id]), () => 150, [1, 2]);
    assert.equal(pool[1].n, 5);
    assert.equal(pool[1].est, 5);
    assert.equal(pool[2], undefined);
    assert.deepEqual(poolSum(pool), { units: 5, cost: 650, est: 5 });
});

test('a set costs its pieces at their averages, and a swap takes them out', () => {
    let pool = poolAdd(poolAdd({}, 1, 4, 400), 2, 2, 600);
    assert.equal(poolSetCost(pool, pair), 400);
    assert.equal(poolSetCost(poolAdd({}, 1, 4, 400), pair), 0, 'a piece with no cost: it cannot be said');
    const swap = poolSwap(pool, pair, 3);
    assert.equal(swap.sets, 2, 'the pool holds two of the second piece');
    assert.equal(swap.cost, 800);
    assert.deepEqual(swap.pool, { 1: { n: 2, cost: 200, est: 0 } });
    pool = swap.pool;
    assert.equal(poolSwap(pool, pair, 1).sets, 0);
});

const entries = [
    { id: 'a', t: T0, kind: 'made', points: 100, each: 30000 },
    { id: 'b', t: T0 + 1000, kind: 'made', points: 100, each: 29000 },
    { id: 'c', t: T0 + 2000, kind: 'sold', points: 50, each: 31000 },
    { id: 'd', t: T0 + 3000, kind: 'used', points: 50, each: 31000 },
    { id: 'e', t: T0 + 4000, kind: 'made', points: 100, each: 28000 },
    { id: 'f', t: T0 + DAY, kind: 'sold', points: 250, each: 30000 },
];

test('the points book: a sale takes points out at the average, used points leave at cost', () => {
    const b = avgBook(entries.slice(0, 5), 31000);
    // 200 points at an average of 29,500; 50 sold at 31,000: +75,000.
    assert.equal(b.profitSold, 75000);
    assert.equal(b.sold, 50);
    assert.equal(b.soldCost, 50 * 29500);
    assert.equal(b.used, 50);
    assert.equal(b.usedCost, 50 * 29500, 'not a profit and not a loss');
    // 100 left at 29,500 + 100 made at 28,000.
    assert.equal(b.left, 200);
    assert.equal(b.each, 28750);
    assert.equal(b.least, 28751);
    assert.equal(b.value, 200 * 31000);
    assert.equal(b.rows[0].id, 'e', 'newest first');
    assert.equal(b.rows.find((r) => r.id === 'c').cost, 29500);
});

test('points sold beyond the book were yours before: they count for nothing', () => {
    const b = avgBook(entries, 0);
    const last = b.rows[0];
    assert.equal(last.mine, 200);
    assert.equal(last.gain, 200 * (30000 - 28750));
    assert.equal(b.left, 0);
    assert.equal(b.cost, 0);
    assert.equal(b.least, 0);
});

test('a typed cost puts the points you had before into the book', () => {
    const b = avgBook([entries[0], { id: 's', t: T0 + 5, kind: 'sold', points: 100, each: 30000 }], 0, { points: 100, each: 20000 });
    assert.equal(b.rows[0].cost, 25000);
    assert.equal(b.profitSold, 500000);
    assert.equal(b.left, 100);
    assert.equal(avgBook([], 0, { points: 100, each: 0 }).left, 0, 'no cost typed: left alone');
});

test('points held, by day', () => {
    const days = heldByDay(entries, T0 + DAY, 3);
    assert.deepEqual(days.map((d) => [d.day, d.left]), [['2026-10-04', 0], ['2026-10-05', 200], ['2026-10-06', 0]]);
});

test('a mug counts only for the points money still on hand', () => {
    const sales = [{ id: 's1', t: T0, got: 3000000 }, { id: 's2', t: T0 + 4 * 3600000, got: 2000000 }];
    const outs = [{ t: T0 + 600000, amount: 3000000 }];
    const mugs = [
        { id: 'm0', t: T0 - 5000, by: 'A', taken: 40000 },                    // before any sale
        { id: 'm1', t: T0 + 3600000, by: 'B', taken: 90000 },                 // the sale was banked
        { id: 'm2', t: T0 + 4 * 3600000 + 660000, by: 'C', taken: 612000 },   // eleven minutes after the second sale
        { id: 'm3', t: T0 + 5 * 3600000, by: 'D', taken: 5000000 },           // more than was left on hand
    ];
    const r = mugCheck(sales, mugs, outs);
    const by = Object.fromEntries(r.rows.map((x) => [x.id, x]));
    assert.equal(by.m0.counted, 0);
    assert.equal(by.m1.counted, 0);
    assert.equal(by.m2.counted, 612000);
    assert.equal(by.m2.saleId, 's2');
    assert.equal(by.m2.after, 660000);
    assert.equal(by.m2.onHand, 2000000);
    assert.equal(by.m3.counted, 2000000 - 612000, 'only what was points money');
    assert.equal(r.counted, 2000000);
    assert.equal(r.left, 2);
    assert.equal(r.rows[0].id, 'm3', 'newest first');
});

test('profit lands on the day the points sold, less the buy-mug of that day', () => {
    const book = avgBook(entries);
    const mugs = mugCheck([], [], []).rows.concat([{ id: 'm', t: T0 + DAY + 60000, counted: 100000 }]);
    const days = profitBuckets(book.rows, mugs, T0 + DAY, 'day', 3);
    assert.deepEqual(days.map((d) => d.day), ['2026-10-04', '2026-10-05', '2026-10-06']);
    assert.equal(days[1].sold, 75000);
    assert.equal(days[1].points, 50);
    assert.equal(days[2].sold, 250000);
    assert.equal(days[2].mug, -100000);
    assert.equal(days[2].profit, 150000);
    assert.deepEqual(runningTotal(days), [0, 75000, 225000]);
    const sum = profitSum(days);
    assert.equal(sum.profit, 225000);
    assert.equal(sum.points, 250);
    assert.equal(sum.cost, sum.got - sum.sold);
});

test('weeks start on Monday and months on the 1st, Torn time', () => {
    const rows = avgBook(entries).rows;
    const weeks = profitBuckets(rows, [], T0 + DAY, 'week', 2);
    assert.deepEqual(weeks.map((w) => w.day), ['2026-09-28', '2026-10-05']);
    assert.equal(weeks[1].sold, 325000);
    const months = profitBuckets(rows, [], T0 + DAY, 'month', 3);
    assert.deepEqual(months.map((m) => m.day), ['2026-08-01', '2026-09-01', '2026-10-01']);
    assert.equal(months[2].sold, 325000);
});
