/*
 * The main flip and its cover (3.14, the owner, 2026-09-28): "the MAIN flip
 * is the big earner... extra items are only cover"; "1 item 1 bazaar best,
 * 1 item 3 bazaars sure, 5 bazaars max for the main flip"; "I'll flip lets
 * say 5 extra items, not max, but soft cap".
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { pickBazaars } from '../src/core/flips.js';
const s = (price, qty, who = 'S' + price) => ({ sellerId: who, sellerName: who, price, qty, stale: false });
const sellersOf = (steps) => new Set(steps.map((st) => st.sellerId));

test('bazaars you visit anyway cost no new stop', () => {
    const rows = [s(100, 5, 'x'), s(100, 5, 'y'), s(100, 5, 'Route')];
    const p = pickBazaars(rows, 200, { maxUnits: 5, maxStops: 3, maxNew: 0, free: new Set(['Route']) });
    assert.deepEqual([...sellersOf(p.steps)], ['Route']);
    assert.equal(p.newStops, 0);
});

// Mil-Soul (2026-09-28): the desk showed Small First Aid Kit +$2,308 as the
// main item and Gentleman Cache +$55,349 as an extra.
const MILSOUL = [
    { itemId: 'kit', bid: 330, sellers: [s(250, 29, 'k1')] },
    { itemId: 'cache', bid: 60000, sellers: [s(55000, 11, 'c1')] },
];
const fast = () => 'fast';
