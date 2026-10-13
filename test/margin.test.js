import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SETS, rateSet, ratePrice, setStock, tradeOffer, setMarketValue } from '../src/core/sets.js';
import { pieceBrings, safeWorth, safeWorths, leavesOf, mendRate, tradeMargin, placeMargin, marginWords } from '../src/core/margin.js';

const plush = SETS.find((s) => s.key === 'plushie');
const flower = SETS.find((s) => s.key === 'flower');
// Every piece at a round market value, so a set is easy to sum: 13 plushies = $260,000, 11 flowers = $220,000.
const mv = () => 20000;

test('a piece brings its share of the set at the points price', () => {
    // 10 points at $31,200 = $312,000 over 13 equal pieces.
    assert.equal(pieceBrings(274, mv, 31200), 24000);
    assert.equal(pieceBrings(206, mv, 31200), 0, 'not a set piece');
    assert.equal(pieceBrings(274, () => 0, 31200), 0, 'no market value yet');
});

test('safe worth is what a piece brings less the least profit, and a set of them keeps it', () => {
    assert.equal(safeWorth(274, mv, 31200, 0), 24000);
    // 24,000 / 1.04 = 23,076.9 -> 23,076
    assert.equal(safeWorth(274, mv, 31200, 4), 23076);
    const worths = safeWorths(plush, mv, 31200, 4);
    assert.equal(worths.size, 13);
    const cost = [...worths.values()].reduce((a, b) => a + b, 0);
    assert.ok((312000 - cost) / cost * 100 >= 4, 'a set bought at safe worth keeps 4%');
});

test('a piece at its safe worth is not taken, one dollar under is', () => {
    const worth = safeWorth(274, mv, 31200, 2);
    const at = leavesOf([{ id: 274, qty: 1, each: worth + 1 }], mv, 31200, 2);
    const under = leavesOf([{ id: 274, qty: 1, each: worth }], mv, 31200, 2);
    assert.equal(at.ok, false);
    assert.equal(under.ok, true);
});

test('a set at the cap is safe and a tenth of a percent over is not', () => {
    const price = 31200;
    const cap = rateSet(plush, mv, 101, price, 2).cap;
    assert.equal(mendRate([plush], mv, price, 2), cap);
    const lines = (pct) => plush.pieces.map((p) => ({ id: p.id, qty: 1, each: ratePrice(mv(p.id), pct) }));
    assert.equal(leavesOf(lines(cap), mv, price, 2).ok, true);
    assert.equal(leavesOf(lines(Math.round((cap + 0.1) * 10) / 10), mv, price, 2).ok, false);
});

test('the points price falling turns an open trade amber, with the rate that mends it', () => {
    const settings = { on: true, which: { plushie: true, flower: true } };
    const held = {};
    const stockOf = (set) => setStock(set, held, 10);
    const items = [{ id: 274, name: 'Panda Plushie', qty: 5 }, { id: 263, name: 'Crocus', qty: 3 }, { id: 206, name: 'Xanax', qty: 1 }];
    const offer = tradeOffer(items, { settings, stockOf, mv, pct: 101 });
    // 101% of $20,000 = $20,200 a piece. At $27,000 a point a plushie brings $20,769: +2.8%.
    const fine = tradeMargin(offer, { mv, pointsPrice: 27000, leastPct: 2 });
    assert.equal(fine.state, 'ok');
    assert.equal(fine.mend, 0);
    assert.deepEqual(fine.others, ['Xanax']);
    assert.equal(fine.all.units, 8);
    assert.equal(fine.all.paid, 8 * 20200);
    // The price fell to $26,400: a plushie brings $20,307, +0.5% - still a gain, under the least profit.
    // (The crocus still carry the mixed trade: flowers are the cheaper set here. One sum, so it stays 'ok'.)
    assert.equal(tradeMargin(offer, { mv, pointsPrice: 26400, leastPct: 2 }).state, 'ok');
    const pandas = tradeOffer([items[0]], { settings, stockOf, mv, pct: 101 });
    const fell = tradeMargin(pandas, { mv, pointsPrice: 26400, leastPct: 2 });
    assert.equal(fell.state, 'under');
    assert.ok(fell.all.leaves > 0);
    assert.ok(fell.mend > 0 && fell.mend < 101, 'a lower rate mends it');
    assert.equal(fell.mend, rateSet(plush, mv, 101, 26400, 2).cap);
    assert.ok(rateSet(flower, mv, 101, 26400, 2).cap > fell.mend, 'only the sets in the trade set the rate');
    // Lower still and it is a loss.
    assert.equal(tradeMargin(pandas, { mv, pointsPrice: 25000, leastPct: 2 }).state, 'loss');
});

test('units you do not need hold money until their set fills', () => {
    const settings = { on: true, which: { plushie: true, flower: true } };
    const held = { 274: 8 };
    const stockOf = (set) => setStock(set, held, 10);
    const offer = tradeOffer([{ id: 274, name: 'Panda Plushie', qty: 5 }], { settings, stockOf, mv, pct: 100 });
    const m = tradeMargin(offer, { mv, pointsPrice: 27000, leastPct: 0 });
    assert.equal(m.need.units, 2);
    assert.equal(m.held, 3 * 20000);
});

test('nothing priced says nothing', () => {
    const m = tradeMargin({ rows: [{ id: 206, name: 'Xanax', qty: 1, each: 0, state: 'other' }] }, { mv, pointsPrice: 27000, leastPct: 2 });
    assert.equal(m.state, 'none');
    assert.equal(marginWords(m.all), '');
});

test('a place that sells: the line counts what you would take there', () => {
    const m = placeMargin([{ id: 274, take: 4, price: 19000 }, { id: 263, take: 2, price: 21000 }], { mv, pointsPrice: 27000, leastPct: 2 });
    assert.equal(m.units, 6);
    assert.equal(m.paid, 4 * 19000 + 2 * 21000);
    assert.equal(marginWords(m), 'profit +$' + m.leaves.toLocaleString('en-US') + ', ' + m.pct.toFixed(1) + '%');
    assert.equal(setMarketValue(plush, mv), 260000);
});
