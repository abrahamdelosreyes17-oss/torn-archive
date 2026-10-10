/*
 * 3.22.2: more bought from a planned listing than the plan asked. The friend,
 * 2026-10-04 (3.22.0): 508 Kitten Plushies in his items, the trade page
 * offering "Fill 28 for MrReeko" - "it misses some stuff that I add along the
 * line for the trader that are still profitable but not in the flip plan ...
 * include them also on Fill all". And his "2 errors today": TornExchange's
 * slow list of active traders, twice.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { lateButHeld } from '../src/core/errlog.js';
const trade = () => ({
    key: 'id:9',
    trader: { id: '9', name: 'MrReeko' },
    itemId: '215',
    at: 1_000_000,
    items: [
        { line: 'flip:215', itemId: '215', name: 'Kitten Plushie', units: 28, bid: 601, kind: 'flip', sent: false, steps: [{ sellerId: '4', sellerName: 'Cat', qty: 28, price: 501, bought: false }] },
    ],
});

test('TornExchange\'s slow list of active traders: a note while the last list is held, an error without one', () => {
    const late = { reason: 'no answer in 90 s' };
    assert.equal(lateButHeld('active_traders', late, true), true);
    assert.equal(lateButHeld('active_traders', late, false), false, 'nothing held: it is a failure');
    assert.equal(lateButHeld('active_traders', { reason: 'no connection' }, true), false);
    assert.equal(lateButHeld('active_traders', { http: 500 }, true), false);
    assert.equal(lateButHeld('all_best_listings', late, true), false, 'only the list that is slow by nature');
});
