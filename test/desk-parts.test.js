// Lot sizes, "Open your shop?", the TornW3B price list and receipt, and the open trades.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LOTS_EMPTY, lotsRead, lotTable, lotSpan, sellPlan, lotsWords, waitWords, lotSizes, lotSize, LOT_SIZES, LOT_MOST } from '../src/core/lots.js';
import { hotListings, hotSince, shopVerdict, shareCovers, HOT_SIT_MS, VERDICT_WORDS } from '../src/core/verdict.js';
import { desiredList, owedPieces, parseOwnList, listDiff, listMatches, putBody, receiptBody, readReceipt, receiptOf, receiptsWith, claimReceipts, receiptLink, receiptIdOf, listedUntil, RECEIPT_FORMS, RECEIPT_OWED_MS } from '../src/core/tw3b-list.js';
import { parseTradeList, parseTrade, tradeTurn, tradesSeen, tradesClosed, agoWords, tradeNotice } from '../src/core/trades.js';

const MIN = 60000;
const T0 = Date.UTC(2026, 9, 10, 12);

// ---- lots ------------------------------------------------------------------------------------------------------------

test('lot sizes: those of the market, none over your biggest lot, and a lot counted under the nearest of them', () => {
    // The owner, 2026-10-13: "50, 100, 200, 500, 1000, 1500, 2000, 2500, and 5000, and 10000 ... i avoid anything bigger than 2k".
    assert.deepEqual(LOT_SIZES, [50, 100, 200, 500, 1000, 1500, 2000, 2500, 5000, 10000]);
    assert.equal(LOT_MOST, 2000);
    assert.deepEqual(lotSizes(), [50, 100, 200, 500, 1000, 1500, 2000]);
    assert.deepEqual(lotSizes(500), [50, 100, 200, 500]);
    assert.deepEqual(lotSizes(10000), LOT_SIZES);
    assert.deepEqual(lotSizes(30), [30], 'a biggest lot under every size is the one size');
    assert.deepEqual(lotSizes(0), lotSizes(LOT_MOST), 'nothing typed: his number');
    // The nearest size; half way between two goes up.
    assert.deepEqual([1, 30, 60, 75, 80, 150, 420, 900, 1250, 1900, 2000].map((n) => lotSize(n)), [50, 50, 50, 100, 100, 200, 500, 1000, 1500, 2000, 2000]);
    assert.equal(lotSize(2001), null, 'over your biggest: "Bigger"');
    assert.equal(lotSize(5000), null);
    assert.equal(lotSize(5000, 5000), 5000);
    assert.equal(lotSize(0), null);
});

test('a lot that was there and is gone is counted, with how long it stood', () => {
    let s = lotsRead(LOTS_EMPTY, [{ id: 'a', cost: 30900, qty: 100 }, { id: 'b', cost: 31000, qty: 400 }], T0, 30900);
    assert.equal(s.gone.length, 0);
    s = lotsRead(s, [{ id: 'b', cost: 31000, qty: 400 }, { id: 'c', cost: 30890, qty: 50 }], T0 + MIN, 30900);
    assert.equal(s.gone.length, 1);
    assert.equal(s.gone[0].wait, null, 'it stood there before the watch began: no wait to tell');
    s = lotsRead(s, [{ id: 'b', cost: 31000, qty: 250 }], T0 + 4 * MIN, 30900);
    const c = s.gone.find((g) => g.qty === 50);
    const part = s.gone.find((g) => g.part);
    assert.equal(c.qty, 50);
    assert.equal(c.wait, 3 * MIN);
    assert.equal(c.front, true);
    assert.deepEqual([part.qty, part.part, part.front], [150, true, false], 'part of a lot sold, over the wall');
    assert.equal(s.seen.b.qty, 250);
});

test('a gap in the watch gives no waits', () => {
    let s = lotsRead(LOTS_EMPTY, [], T0);
    s = lotsRead(s, [{ id: 'a', cost: 1, qty: 10 }], T0 + MIN);
    s = lotsRead(s, [], T0 + 30 * MIN);
    assert.equal(s.gone[0].wait, null);
});

const gone = [
    ...[5, 6, 7].map((m, i) => ({ cost: 30000, qty: 100, t: T0 - i * MIN, wait: m * MIN, front: true })),
    { cost: 30000, qty: 80, t: T0, wait: 99 * MIN, front: false },
    { cost: 30000, qty: 420, t: T0, wait: 48 * MIN, front: true },
    { cost: 30000, qty: 300, t: T0 - 9 * 86400000, wait: MIN, front: true },
];

test('the table: a row for each size of yours and one for the bigger lots; the usual wait at the front, and your own', () => {
    const big = [...gone, { cost: 30000, qty: 5000, t: T0, wait: 9 * MIN, front: true }, { cost: 30000, qty: 2500, t: T0, wait: null, front: true }];
    const t = lotTable(big, [{ points: 100, wait: 6 * MIN }, { points: 90, wait: 17 * MIN }, { points: 420, wait: null }], T0);
    assert.deepEqual(t.map((r) => r.label), ['50', '100', '200', '500', '1,000', '1,500', '2,000', 'Bigger']);
    assert.deepEqual(t.map((r) => r.size), [50, 100, 200, 500, 1000, 1500, 2000, 0]);
    const row = (size) => t.find((r) => r.size === size);
    // Three of 100 and one of 80: the 80 is counted under 100, the nearest size.
    assert.deepEqual([row(100).lots, row(100).points, row(100).wait, row(100).waits], [4, 380, 6 * MIN, 3]);
    assert.deepEqual(row(100).mine, { n: 2, lo: 6 * MIN, hi: 17 * MIN });
    assert.deepEqual([row(500).lots, row(500).wait], [1, 48 * MIN], '420 is counted under 500; the lot of nine days ago is out');
    assert.deepEqual(row(500).mine, { n: 1, lo: null, hi: null });
    assert.deepEqual([row(200).lots, row(200).wait, row(200).mine], [0, null, null]);
    // 2,500 and 5,000 are not sizes of yours: one row, last, and never mixed into 2,000.
    const last = t[t.length - 1];
    assert.deepEqual([last.bigger, last.lots, last.points, last.wait], [true, 2, 7500, 9 * MIN]);
    assert.equal(row(2000).lots, 0);
    // A bigger "biggest lot" in Settings: those sizes get rows of their own.
    const wide = lotTable(big, [], T0, 7, 5000);
    assert.deepEqual(wide.map((r) => r.size), [50, 100, 200, 500, 1000, 1500, 2000, 2500, 5000, 0]);
    assert.deepEqual([wide[7].lots, wide[8].lots, wide[9].lots], [1, 1, 0]);
    // How long the record was watched for: from the first lot gone in the week.
    assert.deepEqual(lotSpan(big, T0), { lots: 7, ms: 2 * MIN });
    assert.deepEqual(lotSpan([], T0), { lots: 0, ms: 0 });
});

test('how to list: the biggest of your sizes first, none over your biggest lot, the odd rest as a lot of its own', () => {
    // The owner's own example, 2026-10-13: 6,620 points, nothing over 2,000.
    assert.deepEqual(sellPlan(6620), [2000, 2000, 2000, 500, 100, 20]);
    assert.equal(lotsWords(sellPlan(6620)), '3 × 2,000 · 1 × 500 · 1 × 100 · 1 × 20');
    assert.deepEqual(sellPlan(420), [200, 200, 20]);
    assert.deepEqual(sellPlan(2000), [2000]);
    assert.deepEqual(sellPlan(40), [40]);
    assert.deepEqual(sellPlan(0), []);
    assert.deepEqual(sellPlan(6620, 1000), [1000, 1000, 1000, 1000, 1000, 1000, 500, 100, 20]);
    assert.deepEqual(sellPlan(12000, 5000), [5000, 5000, 2000]);
    for (const n of [1, 49, 51, 999, 6620, 123457]) assert.equal(sellPlan(n).reduce((a, b) => a + b, 0), n, 'every point is in a lot, none twice');
    assert.ok(sellPlan(123457).every((n) => n <= LOT_MOST));
    assert.equal(lotsWords([420]), '1 × 420');
    assert.equal(lotsWords([]), '');
    assert.equal(waitWords(6 * MIN), '6 min');
    assert.equal(waitWords(130 * MIN), '2 h 10 min');
    assert.equal(waitWords(null), '');
});

// ---- the verdict -----------------------------------------------------------------------------------------------------

const pieces = [{ id: 274, name: 'Panda Plushie', need: 10, pay: 34946 }, { id: 263, name: 'Crocus', need: 4, pay: 14544 }, { id: 215, name: 'Kitten Plushie', need: 0, pay: 919 }];
const offers = {
    274: [{ price: 34900, qty: 6, src: 'bazaar', who: 'Bram', whoId: 11 }, { price: 35400, qty: 9, src: 'market' }],
    263: [{ price: 14390, qty: 12, src: 'bazaar', who: 'Wren', whoId: 22 }],
    215: [{ price: 500, qty: 9, src: 'bazaar', who: 'Bram', whoId: 11 }],
};
const good = { name: 'Plushie', market: 298750, value: 308990, profit: 7252, ok: true, cap: 101.4 };

test('hot listings: what you need, cheaper than you pay sellers', () => {
    const hot = hotListings(pieces, (id) => offers[id]);
    assert.deepEqual(hot.map((h) => [h.key, h.q, h.price]), [['274|b:11', 6, 34900], ['263|b:22', 4, 14390]]);
    const since = hotSince({ '274|b:11': T0 - 99 }, hot, T0);
    assert.deepEqual(since, { '274|b:11': T0 - 99, '263|b:22': T0 });
});

test('closed: a cheaper bazaar says buy first; clear says open', () => {
    const hot = hotListings(pieces, (id) => offers[id]);
    const first = shopVerdict({ open: false, sets: [good], hot, needUnits: 14, coverSets: 890, now: T0 });
    assert.equal(first.state, 'buy-first');
    assert.equal(first.lamp, 'warn');
    assert.deepEqual([first.checks.cheaper.ok, first.checks.cheaper.units, first.checks.cheaper.listings], [false, 10, 2]);
    assert.equal(first.worth, false);
    const clear = shopVerdict({ open: false, sets: [good], hot: [], needUnits: 14, coverSets: 890, now: T0 });
    assert.equal(clear.state, 'open-now');
    assert.equal(clear.lamp, 'ok');
    assert.equal(clear.worth, true);
    assert.ok(VERDICT_WORDS[clear.state]);
});

test('open: a new cheap listing never closes the shop, one left ten minutes turns it amber', () => {
    const hot = hotListings(pieces, (id) => offers[id]);
    const fresh = shopVerdict({ open: true, sets: [good], hot, since: hotSince(null, hot, T0), onList: () => true, needUnits: 14, coverSets: null, now: T0 + MIN });
    assert.equal(fresh.state, 'stay');
    assert.equal(fresh.checks.cheaper.listed, 2);
    assert.equal(fresh.checks.share.sets, null, 'no limit set');
    const sat = shopVerdict({ open: true, sets: [good], hot, since: hotSince(null, hot, T0), needUnits: 14, coverSets: 3, now: T0 + HOT_SIT_MS });
    assert.equal(sat.state, 'stay-buy');
    assert.equal(sat.lamp, 'warn');
    assert.equal(sat.checks.cheaper.sat, 2);
});

test('the rate, the need and the share each stop it', () => {
    const base = { open: false, hot: [], needUnits: 5, coverSets: 2, now: T0 };
    const low = shopVerdict({ ...base, sets: [good, { name: 'Flower', market: 296251, value: 308990, profit: -900, ok: false, cap: 100.2 }] });
    assert.equal(low.state, 'low');
    assert.equal(low.lamp, 'bad');
    assert.deepEqual([low.checks.leaves.name, low.checks.leaves.profit, low.checks.leaves.cap], ['Flower', -900, 100.2]);
    assert.equal(shopVerdict({ ...base, sets: [good], needUnits: 0 }).state, 'full');
    assert.equal(shopVerdict({ ...base, sets: [good], coverSets: 0 }).state, 'share');
    assert.equal(shopVerdict({ ...base, sets: [{ ...good, market: 0 }] }).state, 'no-price');
    assert.equal(shopVerdict({ ...base, sets: [] }).state, 'no-price');
});

test('how many more sets your share covers', () => {
    assert.equal(shareCovers(1000000000, 30000000, 30, 300000), 900);
    assert.equal(shareCovers(1000000000, 400000000, 30, 300000), 0);
    assert.equal(shareCovers(1000000000, 0, 0, 300000), null);
    assert.equal(shareCovers(1000000000, 0, 30, 0), 0);
});

// ---- TornW3B: the price list and the receipt -------------------------------------------------------------------------

test('your list on TornW3B: only your own pieces are set or taken off', () => {
    const want = desiredList(pieces, true);
    assert.deepEqual(want[0], { itemID: 274, price: 34946 });
    const current = parseOwnList({ items: [
        { itemID: 274, pricingType: 'fixed', pricingValue: 34946 },
        { itemID: 263, pricingType: 'market_percentage', pricingValue: 99 },
        { itemID: 206, pricingType: 'fixed', pricingValue: 830000 },
        { itemID: 999 },
    ] });
    assert.equal(current.size, 3);
    const diff = listDiff(current, want, [274, 263, 215, 186]);
    assert.equal(diff.same, 1);
    assert.deepEqual(diff.set, [{ itemID: 263, price: 14544, was: 99 }, { itemID: 215, price: 919, was: null }]);
    assert.deepEqual(diff.remove, []);
    assert.equal(listMatches(diff), false);
    const body = putBody(diff);
    // Inflation protection is on (the owner, 2026-10-12); the same write without it is for a TornW3B that minds.
    assert.deepEqual(body.items[0], { itemID: 263, pricingType: 'fixed', pricingValue: 14544, inflationProtectionEnabled: true, roundToPlace: 0, bulkType: 'none' });
    assert.equal(putBody(diff, { inflation: false }).items[0].inflationProtectionEnabled, false);
    assert.ok(!JSON.stringify(body).includes('206'), 'Xanax is not ours to touch');
    // Every price again, also the one that reads the same: a write that turns something on for the whole list.
    assert.deepEqual(listDiff(current, want, [274, 263, 215, 186], { all: true }).set.map((x) => x.itemID), [274, 263, 215]);
});

test('your list as TornW3B really answers it: a row per item with what it pays now (the zip of 2026-10-12)', () => {
    // 24 prices were written and taken, and the list read back empty: only the documentation's shape was read.
    const real = parseOwnList([
        { itemId: -1, name: 'Plushie Set', buyPrice: 282000, bulkThreshold: null, bulkBuyPrice: null },
        { itemId: 274, name: 'Panda Plushie', buyPrice: 34946, bulkThreshold: null, bulkBuyPrice: null },
        { itemId: 263, name: 'Crocus', buyPrice: 13800, bulkThreshold: null, bulkBuyPrice: null },
        { itemId: 206, name: 'Xanax', buyPrice: 0, bulkThreshold: null, bulkBuyPrice: null },
    ]);
    assert.deepEqual([...real], [['274', { type: 'pays', value: 34946 }], ['263', { type: 'pays', value: 13800 }]], 'no price is not on the list; a whole set is not a piece');
    const diff = listDiff(real, desiredList(pieces, true), [274, 263, 215]);
    assert.equal(diff.same, 1, 'the same dollars read the same');
    assert.deepEqual(diff.set, [{ itemID: 263, price: 14544, was: 13800 }, { itemID: 215, price: 919, was: null }], 'a price changed on the page of TornW3B is seen');
});

test('a piece you hold too many of is not on your list - unless a trade that just ended still needs it for its receipt', () => {
    const stock = [{ id: 274, pay: 34946, ahead: 0 }, { id: 263, pay: 14544, ahead: 12 }, { id: 215, pay: 919, ahead: 3 }];
    assert.deepEqual(desiredList(stock, true).map((x) => x.itemID), [274]);
    assert.deepEqual(desiredList(stock, true, new Set(['215'])).map((x) => x.itemID), [274, 215]);
    assert.deepEqual(desiredList(stock, false, new Set(['215'])), []);
    // On your list from before: it comes off.
    const diff = listDiff(parseOwnList([{ itemId: 274, buyPrice: 34946 }, { itemId: 263, buyPrice: 14544 }]), desiredList(stock, true), [274, 263, 215]);
    assert.deepEqual([diff.same, diff.set, diff.remove], [1, [], [{ itemID: 263, was: 14544 }]]);
});

test('closing takes your pieces off the list and leaves the rest', () => {
    const current = parseOwnList([{ item_id: 274, pricing_type: 'fixed', price: 34946 }, { item_id: 206, price: 830000 }]);
    const diff = listDiff(current, desiredList(pieces, false), [274, 263, 215]);
    assert.deepEqual(diff.remove, [{ itemID: 274, was: 34946 }]);
    assert.deepEqual(putBody(diff), { items: [{ itemID: 274 }] });
    assert.equal(listMatches(listDiff(parseOwnList([]), [], [274])), true);
});

test('a receipt: one line per piece, checked against the sum the Archive worked out', () => {
    const rows = [{ id: 274, qty: 5 }, { id: 274, qty: 2 }, { id: 263, qty: 3 }, { id: 215, qty: 0 }];
    const items = [{ itemID: 274, quantity: 7 }, { itemID: 263, quantity: 3 }];
    // The three forms the request is tried in (1.3.3): which TornW3B takes is not known.
    assert.equal(RECEIPT_FORMS, 3);
    assert.deepEqual(receiptBody('98765', rows, '4242'), { items, tradeID: 98765, buyerPlayerId: 4242, includeMessage: true });
    assert.deepEqual(receiptBody('98765', rows, '4242', 1), { items, tradeID: 98765 });
    assert.deepEqual(receiptBody('98765', rows, '4242', 2), { items, tradeID: '98765' });
    const ok = readReceipt({ receipt: { total_value: 288254, items: [] }, receiptURL: 'https://weav3r.dev/receipt/abc', message: 'hi' }, 288254);
    assert.deepEqual([ok.ok, ok.url, ok.differs, ok.id], [true, 'https://weav3r.dev/receipt/abc', 0, 'abc']);
    const off = readReceipt({ receipt: { total_value: 280000 }, warnings: { notPriced: ['Crocus'] } }, 288254);
    assert.deepEqual([off.ok, off.differs, off.missing, off.url, off.id], [false, -8254, ['Crocus'], '', null]);
    assert.equal(readReceipt(null, 5).ok, false);
    assert.equal(receiptLink('3PMnLXoyyX'), 'https://weav3r.dev/receipt/3PMnLXoyyX');
    assert.equal(receiptIdOf('https://weav3r.dev/receipt/3PMnLXoyyX?x=1'), '3PMnLXoyyX');
    assert.equal(receiptLink(null), '');
});

test('a receipt read from TornW3B: its pieces, its link, and how long TornW3B keeps listing you', () => {
    const one = receiptOf({ id: 'r1', trade_id: 98765, total_value: 5, created_at: '2026-10-12T05:14:36.000Z', items: [{ item_id: 384, quantity: 1241 }, { item_id: 271, quantity: 20 }] });
    assert.deepEqual(one, { id: 'r1', tid: '98765', total: 5, at: Date.UTC(2026, 9, 12, 5, 14, 36), rows: [{ id: 384, qty: 1241 }, { id: 271, qty: 20 }], url: 'https://weav3r.dev/receipt/r1' });
    // Made on the form of TornW3B, which asks for no trade number.
    assert.equal(receiptOf({ id: 'r2', total_value: 5 }, T0).tid, '');
    assert.equal(receiptOf({ id: 'r2', total_value: 5 }, T0).at, T0);
    assert.equal(receiptOf({ total_value: 5 }), null);
    assert.equal(listedUntil(T0), T0 + 7 * 86400000);
    assert.equal(listedUntil(0), 0);
});

test('receipts kept: the same receipt is one entry, and a link kept is never lost to a read without one', () => {
    // Made here: the answer named a link and no id of its own.
    let list = [['7001', { id: null, tid: '7001', total: 500, url: 'https://weav3r.dev/receipt/kept', at: T0, rows: [{ id: 274, qty: 2 }] }]];
    list = receiptsWith(list, receiptOf({ id: 'abc', trade_id: 7001, total_value: 500, items: [{ item_id: 274, quantity: 2 }] }, T0 + MIN));
    assert.equal(list.length, 1);
    assert.deepEqual([list[0][0], list[0][1].id, list[0][1].url], ['7001', 'abc', 'https://weav3r.dev/receipt/kept']);
    // Read again: still one.
    list = receiptsWith(list, receiptOf({ id: 'abc', trade_id: 7001, total_value: 500, items: [{ item_id: 274, quantity: 2 }] }, T0 + 2 * MIN));
    assert.equal(list.length, 1);
    // One made with no trade number is kept under its own id until a trade takes it.
    list = receiptsWith(list, receiptOf({ id: 'zz9', total_value: 9, items: [] }, T0));
    assert.deepEqual(list.map(([k]) => k), ['7001', 'r:zz9']);
});

test('a receipt made on the page of TornW3B goes to the finished trade with the same pieces (2026-10-12)', () => {
    // Torn numbered the trade 13521417 while it was open and 7579996 once it had ended.
    const finished = [
        { id: '7580112', t: T0 + 90 * MIN, rows: [{ id: 384, qty: 60 }, { id: 264, qty: 15 }, { id: 385, qty: 15 }] },
        { id: '7579996', t: T0, rows: [{ id: 384, qty: 1241 }, { id: 271, qty: 20 }, { id: 269, qty: 35 }] },
        { id: '7576951', t: T0 - 600 * MIN, rows: [{ id: 384, qty: 340 }, { id: 274, qty: 38 }] },
    ];
    const ids = [384, 264, 385, 271, 269, 274];
    const made = { id: '3PMnLXoyyX', tid: '13521417', total: 84214845, at: T0 + 23 * MIN, url: 'https://weav3r.dev/receipt/3PMnLXoyyX', rows: [{ id: 269, qty: 35 }, { id: 384, qty: 1241 }, { id: 271, qty: 20 }, { id: 206, qty: 3 }] };
    const out = claimReceipts([['13521417', made]], finished, ids);
    assert.deepEqual(out.map(([k]) => k), ['7579996'], 'the pieces and counts are the same: Xanax on the receipt is not looked at');
    assert.equal(out[0][1].url, 'https://weav3r.dev/receipt/3PMnLXoyyX');
    // A trade that has its receipt takes no second one; other counts are another trade; a day apart is too far.
    assert.deepEqual(claimReceipts([['7579996', made], ['x', { ...made, id: 'other' }]], finished, ids).map(([k]) => k), ['7579996', 'x']);
    assert.deepEqual(claimReceipts([['x', { ...made, rows: [{ id: 384, qty: 1240 }] }]], finished, ids).map(([k]) => k), ['x']);
    assert.deepEqual(claimReceipts([['x', { ...made, at: T0 + 25 * 60 * MIN }]], finished, ids).map(([k]) => k), ['x']);
    // One kept without its pieces (as until 1.3.2) is no trade's until it is read again.
    assert.deepEqual(claimReceipts([['13521417', { id: '3PMnLXoyyX', total: 1, url: '', at: T0 }]], finished, ids).map(([k]) => k), ['13521417']);
});

test('the pieces of a trade that just ended stay on your list until its receipt is made', () => {
    const finished = [{ id: '1', t: T0, rows: [{ id: 274, qty: 3 }] }, { id: '2', t: T0, rows: [{ id: 263, qty: 1 }] }, { id: '3', t: T0 - RECEIPT_OWED_MS, rows: [{ id: 215, qty: 1 }] }];
    assert.deepEqual([...owedPieces(finished, new Map([['2', {}]]), T0 + MIN)], ['274']);
});

// ---- trades ----------------------------------------------------------------------------------------------------------

const ME = 100;
const raw = {
    id: 555, description: '', completed_at: null, expires_at: 1791000000, modified_at: 1790990000,
    user: { id: ME, name: 'Me' }, trader: { id: 7, name: 'Garrett89' },
    items: [
        { user_id: 7, type: 'Item', details: { id: 274, uid: null, amount: 20 } },
        { user_id: 7, type: 'Item', details: { id: 274, uid: null, amount: 2 } },
        { user_id: 7, type: 'Item', details: { id: 263, uid: null, amount: 7 } },
        { user_id: ME, type: 'Money', details: { amount: 500000 } },
        { user_id: 7, type: 'Property', details: { id: 1, happiness: 100 } },
    ],
};

test('Torn\'s trades are read by who is the other side', () => {
    const list = parseTradeList({ trades: [raw, { ...raw, id: 556, user: { id: 9, name: 'Pellam' }, trader: { id: ME, name: 'Me' } }] }, ME);
    assert.deepEqual(list.map((t) => [t.id, t.who, t.whoId]), [['555', 'Garrett89', '7'], ['556', 'Pellam', '9']]);
    assert.equal(list[0].modified, 1790990000000);
    const t = parseTrade({ trade: raw }, ME);
    assert.deepEqual(t.theirs, [{ id: 274, qty: 22 }, { id: 263, qty: 7 }]);
    assert.deepEqual([t.myMoney, t.theirMoney, t.other, t.mine.length], [500000, 0, 1, 0]);
    assert.equal(parseTrade({}, ME), null);
});

test('whose turn it is', () => {
    const t = parseTrade({ trade: raw }, ME);
    assert.equal(tradeTurn(t, 0), 'new');
    assert.equal(tradeTurn(t, 870000), 'you');
    assert.equal(tradeTurn(t, 500000), 'them');
});

test('a new trade is told once, and never on the first look', () => {
    const a = { id: '1', who: 'A' };
    const b = { id: '2', who: 'B' };
    let r = tradesSeen(null, [a]);
    assert.deepEqual(r.fresh, []);
    r = tradesSeen(r.seen, [a, b]);
    assert.deepEqual(r.fresh, [b]);
    r = tradesSeen(r.seen, [a, b]);
    assert.deepEqual(r.fresh, []);
    assert.deepEqual(tradesClosed([a, b], [b]), [a]);
});

test('the words of a notice and of an age', () => {
    assert.deepEqual(tradeNotice({ who: 'Isolde_M' }, 3, 838000), { title: 'Isolde_M opened a trade with you', body: '3 items · $838,000 at your prices' });
    assert.equal(tradeNotice({ who: '' }, 0, 0).body, 'Nothing in it yet');
    assert.equal(agoWords(T0 - 30000, T0), 'just now');
    assert.equal(agoWords(T0 - 4 * MIN, T0), '4 min ago');
    assert.equal(agoWords(T0 - 26 * 3600000, T0), 'yesterday');
    assert.equal(agoWords(0, T0), '');
});
