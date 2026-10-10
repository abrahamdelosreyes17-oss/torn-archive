/*
 * 3.14: the desk follows the #1 flip until you pick; the possible flips are
 * read before an idle trade's items; a trade you start on (or pin) holds
 * still - only prices and profit move (core/desk.js, core/held.js).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { nextW3bRead } from '../src/core/desk.js';
const f = (itemId) => ({ itemId });

const due = (set) => (id) => set.has(id);

test('the possible flips are read before an idle trade\'s items; a trade under way first', () => {
    const p = { picked: 'desk', live: ['t1'], wanted: ['t2'], candidates: ['c1'], pinned: ['p1'], list: null, turn: 1, due: due(new Set(['t1', 't2', 'c1', 'p1'])) };
    // Nobody working on the trade: the flips first (3.13 read the trade's items first, always).
    assert.deepEqual(nextW3bRead({ ...p, active: false }), { kind: 'bazaars', id: 'c1' });
    assert.deepEqual(nextW3bRead({ ...p, active: true }), { kind: 'bazaars', id: 't1' });
    // The flips done: then the idle trade's unread items, then pinned trades'.
    assert.deepEqual(nextW3bRead({ ...p, active: false, due: due(new Set(['t2', 'p1'])) }), { kind: 'bazaars', id: 't2' });
    assert.deepEqual(nextW3bRead({ ...p, active: false, due: due(new Set(['p1'])) }), { kind: 'bazaars', id: 'p1' });
    // The summary and the item on the desk come first; lists take turns with the flips.
    assert.deepEqual(nextW3bRead({ ...p, summaryDue: true }), { kind: 'summary' });
    assert.deepEqual(nextW3bRead({ ...p, due: due(new Set(['desk', 'c1'])) }), { kind: 'bazaars', id: 'desk' });
    assert.deepEqual(nextW3bRead({ ...p, active: false, list: 'L', turn: 0 }), { kind: 'list', id: 'L' });
    assert.equal(nextW3bRead({ ...p, due: () => false }), null);
});

const CHOSEN = {
    key: 'id:5001',
    buyer: { id: '5001', name: 'KayMalta', price: 1157499 },
    main: '870',
    flips: [
        { itemId: '870', name: 'Stealth Virus', bid: 1157499, units: 42, role: 'main', kind: 'normal', steps: [{ sellerId: 'A', sellerName: 'A', qty: 30, price: 809351 }, { sellerId: 'B', sellerName: 'B', qty: 12, price: 812000 }] },
        { itemId: '1006', name: 'Dahlia', bid: 1500, units: 25, role: 'extra', kind: 'fast', steps: [{ sellerId: 'A', sellerName: 'A', qty: 25, price: 1100 }] },
        { itemId: '1010', name: 'Lollipop', bid: 400, units: 1, role: 'extra', kind: 'fast', estimated: true, steps: [{ sellerId: null, sellerName: null, qty: 1, price: 300 }] },
    ],
};
const row = (sellerId, price, qty) => ({ sellerId, sellerName: sellerId, price, qty, stale: false });
