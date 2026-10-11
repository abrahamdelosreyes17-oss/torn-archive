import { test } from 'node:test';
import assert from 'node:assert/strict';

import { STOCK_EMPTY, stockApply, stockInventory, stockHeld, stockAge, seenWaiting, stockReady, eventsFromRows, eventFromSeen } from '../src/core/stock.js';
import { poolEach } from '../src/core/books.js';
import { SETS } from '../src/core/sets.js';

const MIN = 60000;
const T0 = Date.UTC(2026, 9, 10, 12);
const flower = SETS.find((s) => s.key === 'flower');
const ids = flower.pieces.map((p) => String(p.id));
const mv = () => 20000;

test('Torn\'s inventory opens the count, and units never seen bought stand at the market value', () => {
    assert.equal(stockReady(STOCK_EMPTY), false);
    const s = stockInventory(STOCK_EMPTY, { 263: 3, 260: 10 }, T0, ids, mv);
    assert.equal(stockReady(s), true);
    assert.equal(s.held[263], 3);
    assert.equal(s.held[264], 0);
    assert.deepEqual(s.pool[263], { n: 3, cost: 60000, est: 3 });
});

test('a buy counts once, and brings its cost', () => {
    let s = stockInventory(STOCK_EMPTY, { 263: 3 }, T0, ids, mv);
    const buy = { key: 'row:1:0', t: T0 + MIN, id: '263', d: 5, paid: 70000 };
    s = stockApply(s, [buy]).state;
    s = stockApply(s, [buy]).state;
    assert.equal(s.held[263], 8);
    assert.equal(poolEach(s.pool, 263), 130000 / 8);
    assert.equal(stockApply(s, [buy]).state, s, 'nothing new: the same state');
});

test('Torn\'s count is not taken for a piece something happened to within the hour', () => {
    let s = stockInventory(STOCK_EMPTY, { 263: 3, 260: 10 }, T0, ids, mv);
    s = stockApply(s, [{ key: 'b', t: T0 + 10 * MIN, id: '263', d: 5, paid: 70000 }]).state;
    // Read 20 minutes later: Torn may still say 3 for the crocus. The dahlia changed (a gift, say): taken.
    s = stockInventory(s, { 263: 3, 260: 12 }, T0 + 20 * MIN, ids, mv);
    assert.equal(s.held[263], 8);
    assert.equal(s.held[260], 12);
    assert.equal(s.pool[260].est, 12);
    // Two hours on, Torn's count is the truth again.
    s = stockInventory(s, { 263: 7, 260: 12 }, T0 + 130 * MIN, ids, mv);
    assert.equal(s.held[263], 7);
    assert.equal(s.pool[263].n, 7);
});

test('a set swapped takes one of each piece and says what they cost', () => {
    const inv = Object.fromEntries(ids.map((id) => [id, 4]));
    let s = stockInventory(STOCK_EMPTY, inv, T0, ids, mv);
    const r = stockApply(s, [{ key: 'log:9', t: T0 + MIN, swap: 'flower', sets: 3 }], mv);
    s = r.state;
    assert.deepEqual(r.made, [{ key: 'log:9', t: T0 + MIN, set: 'flower', sets: 3, points: 30, cost: 3 * 11 * 20000 }]);
    assert.equal(s.held[263], 1);
    assert.equal(s.pool[263].n, 1);
    // More sets than the pool ever saw: the missing units stand at the market value.
    const more = stockApply(s, [{ key: 'log:10', t: T0 + 2 * MIN, swap: 'flower', sets: 2 }], mv);
    assert.equal(more.made[0].cost, 2 * 11 * 20000);
    assert.equal(more.state.held[263], 0);
    assert.equal(stockApply(s, [{ key: 'x', t: T0 + 3 * MIN, swap: 'nothing', sets: 2 }], mv).made.length, 0);
});

test('a buy seen on the page counts at once, and leaves when the log has been read past it', () => {
    const s = stockInventory(STOCK_EMPTY, { 263: 3 }, T0, ids, mv);
    const seen = [{ t: T0 + MIN, id: 263, qty: 4 }];
    const swaps = [{ t: T0 + 2 * MIN, set: 'flower', sets: 1 }];
    assert.equal(stockHeld(s, seen, [], 0)(263), 7);
    assert.equal(stockHeld(s, seen, [], T0 + MIN + 30000)(263), 7, 'the log may lag: still counted');
    assert.equal(stockHeld(s, seen, [], T0 + 3 * MIN)(263), 3, 'the log has it now');
    assert.equal(stockHeld(s, seen, swaps, 0)(263), 6);
    assert.equal(stockHeld(s, [], swaps, 0)(260), 0, 'never under nothing');
    assert.equal(seenWaiting(seen, T0 + 3 * MIN).length, 0);
});

test('the Ledger\'s rows become stock events, pieces only', () => {
    const rows = [
        { id: 'a:0', t: T0, itemId: '263', qty: 4, each: 14000, side: 'buy' },
        { id: 'b:0', t: T0, itemId: '206', qty: 1, each: 830000, side: 'buy' },
        { id: 'trade:5:out:0', t: T0, itemId: '263', qty: 2, each: 15000, side: 'sell' },
        { id: 'trade:6:out:0', t: T0, itemId: '260', qty: 1, each: 0, side: 'give' },
    ];
    const ev = eventsFromRows(rows, new Set(ids));
    assert.deepEqual(ev.map((e) => [e.key, e.id, e.d, e.paid]), [['row:a:0', '263', 4, 56000], ['row:trade:5:out:0', '263', -2, 0], ['row:trade:6:out:0', '260', -1, 0]]);
});

test('when Torn counted: trusted once two reads carried the same time, and from then Torn\'s count wins the moment it is newer than your last buy', () => {
    let s = stockInventory(STOCK_EMPTY, { 263: 3 }, T0, ids, mv, T0 - 10 * MIN);
    assert.equal(stockAge(s).tornAt, 0, 'one read: a time that may only say "now" is not trusted');
    s = stockInventory(s, { 263: 3 }, T0 + 5 * MIN, ids, mv, T0 - 10 * MIN);
    assert.equal(stockAge(s).tornAt, T0 - 10 * MIN, 'it stood still between two reads: that is when Torn counted');
    assert.equal(stockAge(s).nextAt, T0 + 50 * MIN, 'and Torn counts again an hour after');
    s = stockApply(s, [{ key: 'b', t: T0 + 6 * MIN, id: '263', d: 5, paid: 70000 }]).state;
    assert.equal(stockAge(s).since, 1, 'one piece is carried by us since Torn counted');
    // Torn's old count, read again: the buy is not in it, and ours stands.
    s = stockInventory(s, { 263: 3 }, T0 + 10 * MIN, ids, mv, T0 - 10 * MIN);
    assert.equal(s.held[263], 8);
    // Torn counted anew, after the buy: taken at once - not an hour after the buy, as before.
    s = stockInventory(s, { 263: 9 }, T0 + 51 * MIN, ids, mv, T0 + 50 * MIN);
    assert.equal(s.held[263], 9);
    assert.equal(stockAge(s).since, 0);
    // A log row of something that happened before Torn counted, read late: Torn's count had it.
    s = stockApply(s, [{ key: 'late', t: T0 + 40 * MIN, id: '263', d: 2, paid: 1 }]).state;
    assert.equal(s.held[263], 9);
    // A time that moves with every read was only ever "now": never trusted, the older rule holds.
    let n = stockInventory(STOCK_EMPTY, { 263: 3 }, T0, ids, mv, T0);
    n = stockInventory(n, { 263: 3 }, T0 + 5 * MIN, ids, mv, T0 + 5 * MIN);
    assert.equal(stockAge(n).tornAt, 0);
});

test('a buy seen on the page, with no log to wait for: counted itself, once, and not added on top again', () => {
    let s = stockInventory(STOCK_EMPTY, { 263: 3 }, T0, ids, mv);
    const buy = { t: T0 + MIN, id: '263', qty: 4, price: 14000, whoId: '9' };
    s = stockApply(s, eventFromSeen(buy), mv).state;
    s = stockApply(s, eventFromSeen(buy), mv).state;
    assert.equal(s.held[263], 7);
    assert.equal(s.pool[263].n, 7, 'what it cost is in the pool');
    assert.equal(stockHeld(s, [{ ...buy, counted: true }], [], 0)(263), 7, 'counted: not waiting for a log');
    assert.equal(stockHeld(s, [buy], [], 0)(263), 11, 'not marked counted, it would wait for one');
});
