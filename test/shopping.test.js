import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    IM_PLACE, placeOf, lineKey, onList, fillPlan, toggleLine, dropLine, refreshList, stopsOf,
    RUN_IDLE, runStart, runAt, runNext, runTook, tookAt, runView, listAfterRun,
} from '../src/core/shopping.js';

const panda = { id: 274, name: 'Panda Plushie', set: 'plushie', need: 10, worth: 35000 };
const crocus = { id: 263, name: 'Crocus', set: 'flower', need: 4, worth: 15000 };
const kitten = { id: 215, name: 'Kitten Plushie', set: 'plushie', need: 0, worth: 900 };
const offers = {
    274: [
        { price: 34000, qty: 6, src: 'bazaar', who: 'Bram', whoId: 11 },
        { price: 34500, qty: 3, src: 'market' },
        { price: 34800, qty: 20, src: 'bazaar', who: 'Wren', whoId: 22 },
        { price: 35000, qty: 50, src: 'bazaar', who: 'Dear', whoId: 33 },
    ],
    263: [{ price: 14000, qty: 2, src: 'bazaar', who: 'Wren', whoId: 22 }, { price: 16000, qty: 9, src: 'bazaar', who: 'Bram', whoId: 11 }],
    215: [{ price: 500, qty: 9, src: 'bazaar', who: 'Bram', whoId: 11 }],
};
const offersOf = (id) => offers[id] || [];
const worthOf = (id) => ({ 274: 35000, 263: 15000, 215: 900 }[id] || 0);

test('a place is a bazaar owner or the Item Market', () => {
    assert.equal(placeOf({ src: 'market' }), IM_PLACE);
    assert.equal(placeOf({ src: 'bazaar', whoId: 11, who: 'Bram' }), 'b:11');
    assert.equal(lineKey(274, 'b:11'), '274|b:11');
});

test('fill my stock takes the cheapest units under the safe worth, up to the need', () => {
    const plan = fillPlan([panda, crocus, kitten], offersOf);
    assert.deepEqual(plan.map((l) => [l.key, l.q, l.price]), [
        ['274|b:11', 6, 34000], ['274|im', 3, 34500], ['274|b:22', 1, 34800],
        ['263|b:22', 2, 14000],
    ]);
    assert.equal(onList(plan, 274), 10);
    assert.equal(onList(plan, 263), 2, 'the $16,000 crocus is over its worth: the other two come from sellers');
    assert.equal(onList(plan, 215), 0, 'nothing needed, nothing taken');
});

test('a unit AT its worth is not taken', () => {
    const plan = fillPlan([{ ...panda, need: 100 }], offersOf);
    assert.ok(!plan.some((l) => l.place === 'b:33'));
});

test('Add puts on what you still need; a second press takes it off', () => {
    let cart = toggleLine([], panda, offers[274][2]);
    assert.equal(cart[0].q, 10);
    cart = toggleLine(cart, panda, offers[274][0]);
    assert.equal(cart.length, 1, 'nothing more is needed');
    cart = toggleLine(cart, panda, offers[274][2]);
    assert.deepEqual(cart, []);
    assert.deepEqual(dropLine([{ key: 'a' }, { key: 'b' }], 'a'), [{ key: 'b' }]);
});

test('stops: one per place, bazaars by what they save, the Item Market last', () => {
    const stops = stopsOf(fillPlan([panda, crocus], offersOf), worthOf);
    assert.deepEqual(stops.map((s) => s.place), ['b:11', 'b:22', 'im']);
    assert.equal(stops[0].units, 6);
    assert.equal(stops[0].cost, 6 * 34000);
    assert.equal(stops[0].gain, 6 * 1000);
    assert.equal(stops[1].lines.length, 2, 'Wren sells a panda and two crocus: one visit');
    assert.equal(stops[1].gain, 200 + 2 * 1000);
});

test('the run: Next counts only what you took', () => {
    const cart = fillPlan([panda, crocus], offersOf);
    const stops = stopsOf(cart, worthOf);
    let run = runStart(stops);
    assert.equal(runAt(run, stops), 0);
    run = runTook(run, '274|b:11', 4);
    run = runTook(run, '274|b:11', 2);
    assert.equal(tookAt(run, stops[0]), 4, 'a lagging count never un-buys');
    run = runNext(run, stops);
    assert.equal(run.place, 'b:22');
    let view = runView(run, stops);
    assert.deepEqual(view.stops.map((s) => s.state), ['part', 'cur', '']);
    run = runNext(run, stops);
    run = runTook(run, '274|im', 3);
    run = runNext(run, stops);
    assert.equal(run.on, false);
    view = runView(run, stops);
    assert.deepEqual(view.stops.map((s) => s.state), ['part', 'skip', 'done']);
    assert.equal(view.got, 7);
    assert.equal(view.skipped, 1);
    const left = listAfterRun(cart, run);
    assert.deepEqual(left.map((l) => [l.key, l.q]), [['274|b:11', 2], ['274|b:22', 1], ['263|b:22', 2]]);
});

test('an idle run says nothing', () => {
    const stops = stopsOf(fillPlan([panda], offersOf), worthOf);
    assert.equal(runAt(RUN_IDLE, stops), -1);
    assert.deepEqual(runView(RUN_IDLE, stops).stops.map((s) => s.state), ['', '', '']);
    assert.equal(runStart([]).on, false);
});

test('the run finds its stop again after the list is re-sorted', () => {
    const stops = stopsOf(fillPlan([panda, crocus], offersOf), worthOf);
    const run = runNext(runStart(stops), stops);
    assert.equal(runAt(run, [stops[1], stops[0], stops[2]]), 0);
});

test('a fresh read: gone and dear lines come off, a line shrinks to the stock', () => {
    const cart = fillPlan([panda, crocus], offersOf);
    const now = {
        274: [{ price: 34000, qty: 2, src: 'bazaar', who: 'Bram', whoId: 11 }, { price: 36000, qty: 3, src: 'market' }],
        263: [{ price: 14000, qty: 2, src: 'bazaar', who: 'Wren', whoId: 22 }],
    };
    const { cart: next, dropped } = refreshList(cart, [panda, crocus], (id) => now[id] || []);
    assert.deepEqual(next.map((l) => [l.key, l.q]), [['274|b:11', 2], ['263|b:22', 2]]);
    assert.deepEqual(dropped.map((d) => [d.key, d.why]), [['274|im', 'dear'], ['274|b:22', 'gone']]);
    const enough = refreshList(cart, [{ ...panda, need: 6 }, crocus], offersOf);
    assert.ok(enough.dropped.some((d) => d.why === 'enough'));
});

test('a run is on: a line keeps what you took on it, though your need and the listing both fell by it', () => {
    const line = { key: '274|b:11', id: 274, name: 'Panda Plushie', set: 'plushie', place: 'b:11', im: false, who: 'Bram', whoId: 11, price: 34000, q: 6 };
    // You bought all 6: Bram's listing is gone and you need 4 more. Off a run the line goes; on one it stays, taken.
    assert.deepEqual(refreshList([line], [{ ...panda, need: 4 }], () => []).cart, []);
    const kept = refreshList([line], [{ ...panda, need: 4 }], () => [], () => 6);
    assert.deepEqual(kept.cart.map((l) => [l.key, l.q]), [['274|b:11', 6]]);
    assert.deepEqual(kept.dropped, []);
    // You took 2 of the 6: the 4 left on the listing are still to buy.
    const part = refreshList([line], [{ ...panda, need: 8 }], () => [{ price: 34000, qty: 4, src: 'bazaar', who: 'Bram', whoId: 11 }], () => 2);
    assert.deepEqual(part.cart.map((l) => [l.key, l.q]), [['274|b:11', 6]]);
    // Took 2, and someone else bought the rest: the line is what you took, and nothing more.
    const rest = refreshList([line], [{ ...panda, need: 8 }], () => [], () => 2);
    assert.deepEqual(rest.cart.map((l) => [l.key, l.q]), [['274|b:11', 2]]);
});
