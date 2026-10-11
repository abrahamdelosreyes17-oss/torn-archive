/*
 * 3.14.3: Bought since you accepted - its own window while a trade is
 * accepted, and a checklist on Torn's trade page (core/accepted.js boughtSince).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { boughtSince } from '../src/core/accepted.js';
const trade = () => ({
    key: 'id:5001',
    trader: { id: '5001', name: 'KayMalta' },
    at: 1000,
    items: [
        { line: 'flip:870', itemId: '870', name: 'Stealth Virus', units: 6, bid: 1000, kind: 'flip', steps: [{ sellerId: '1', sellerName: 'Havean', qty: 4, price: 800, bought: false }, { sellerId: '2', sellerName: 'Baecon', qty: 2, price: 900, bought: false }] },
        { line: 'flip:206', itemId: '206', name: 'Xanax', units: 3, bid: 500, kind: 'flip', steps: [{ sellerId: '3', sellerName: 'Kingpigg3344', qty: 3, price: 400, bought: false }] },
    ],
});

test('unplanned buys: only what the trader buys; orange while profitable, red at a loss', () => {
    const t = { ...trade(), extra: [
        { itemId: '1', name: 'Hammer', qty: 2, price: 50, bid: 70, at: 5 },
        { itemId: '2', name: 'Dahlia', qty: 1, price: 900, bid: 800, at: 6 },
        { itemId: '3', name: 'Parcel', qty: 1, price: 10, bid: 0, at: 7 },
    ] };
    const b = boughtSince(t);
    assert.deepEqual(b.rows.map((r) => [r.name, r.tone]), [['Hammer', 'extra'], ['Dahlia', 'loss']], 'Parcel: they do not buy it, left off');
    assert.deepEqual(b.rows.map((r) => r.each), [50, 900], 'each at what you paid');
});

import { stockBuys } from '../src/core/accepted.js';
test('unplanned buys are counted from the page the way planned ones are: a card\'s stock dropping', () => {
    const card = (itemId, name, price, qty, extra = {}) => ({ itemId, name, listingPrice: price, qty, ...extra });
    let r = stockBuys({}, [card('1', 'Hammer', 50, 10), card('2', 'Dahlia', 900, 3)]);
    assert.deepEqual(r.bought, [], 'the first read only notes the stock');
    r = stockBuys(r.seen, [card('1', 'Hammer', 50, 7), card('2', 'Dahlia', 900, 3)]);
    assert.deepEqual(r.bought, [{ itemId: '1', name: 'Hammer', price: 50, qty: 3 }], 'Hammer 10 -> 7: you took 3');
    // Gone: only counted when you pressed a button on that card.
    const gone = stockBuys(r.seen, [card('1', 'Hammer', 50, 7)]);
    assert.deepEqual(gone.bought, [], 'Dahlia gone, nothing pressed: someone else - not counted');
    const pressed = stockBuys(r.seen, [card('1', 'Hammer', 50, 7)], new Set(['2|900']));
    assert.deepEqual(pressed.bought, [{ itemId: '2', name: 'Dahlia', price: 900, qty: 3 }]);
    // Torn Archive 1.2.2: gone counts for no more than the number in the Buy box when Torn's Buy was pressed.
    const part = stockBuys({ '2|900': { qty: 2518, itemId: '2', price: 900, name: 'Dahlia' } }, [], new Map([['2|900', 500]]));
    assert.deepEqual(part.bought.map((b) => b.qty), [500], 'a listing of 2,518 gone with 500 typed: 500, never 2,518');
    assert.deepEqual(stockBuys({ '2|900': { qty: 3, itemId: '2', price: 900, name: 'Dahlia' } }, [], new Map([['2|900', 500]])).bought.map((b) => b.qty), [3], 'never more than it had');
    assert.deepEqual(stockBuys({ '2|900': { qty: 3, itemId: '2', price: 900, name: 'Dahlia' } }, [], new Map()).bought, [], 'Buy never pressed: opened, closed, scrolled past - nothing');
    // And a stock that fell counts only on a listing you pressed in: someone else may have bought.
    const fell = { '1|50': { qty: 10, itemId: '1', price: 50, name: 'Hammer' } };
    assert.deepEqual(stockBuys(fell, [card('1', 'Hammer', 50, 4)], new Map(), new Set()).bought, [], 'fell with no press of yours: not your buy');
    assert.deepEqual(stockBuys(fell, [card('1', 'Hammer', 50, 4)], new Map(), new Set(['1|50'])).bought.map((b) => b.qty), [6]);
    assert.equal(stockBuys(fell, [card('1', 'Hammer', 50, 4)], new Map(), new Set()).seen['1|50'].qty, 4, 'its new stock is what the next look starts from');
    // A card whose stock the page does not say is never counted.
    const unknown = stockBuys({ '3|10': { qty: 1, itemId: '3', price: 10, name: 'X' } }, [card('3', 'X', 10, 1, { qtyAssumed: true })]);
    assert.deepEqual(unknown.bought, []);
});
