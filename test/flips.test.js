import test from 'node:test';
import assert from 'node:assert/strict';

import { bazaarSellers, FLIP_FRESH_MS } from '../src/core/flips.js';
const NOW = 1_800_000_000_000;
const row = (sellerId, price, qty, agoMs = 60_000, sellerName = 'S' + sellerId) => ({ sellerId: String(sellerId), sellerName, price, qty, dataAt: NOW - agoMs });

test('bazaar sellers: cheapest first, your own listing left out, old ones marked stale', () => {
    const rows = [row(2, 72000, 56), row(1, 70000, 26), row(9, 69000, 5), row(3, 71800, 1018, FLIP_FRESH_MS + 1)];
    const out = bazaarSellers(rows, { selfId: '9', now: NOW });
    assert.deepEqual(out.map((r) => r.sellerId), ['1', '3', '2']);
    assert.deepEqual(out.map((r) => r.stale), [false, true, false]);
    // No id known: nothing is left out.
    assert.equal(bazaarSellers(rows, { now: NOW }).length, 4);
});
