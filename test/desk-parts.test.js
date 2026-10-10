// Lot sizes, "Open your shop?", the TornW3B price list and receipt, and the open trades.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LOTS_EMPTY, lotsRead, lotTable, sellPlan, lotsWords, waitWords, lotLabel, lotBucket, LOT_BUCKETS } from '../src/core/lots.js';
import { hotListings, hotSince, shopVerdict, shareCovers, HOT_SIT_MS, VERDICT_WORDS } from '../src/core/verdict.js';
import { desiredList, parseOwnList, listDiff, listMatches, putBody, receiptBody, readReceipt, receiptsByTrade, listedUntil } from '../src/core/tw3b-list.js';
import { parseTradeList, parseTrade, tradeTurn, tradesSeen, tradesClosed, agoWords, tradeNotice } from '../src/core/trades.js';

const MIN = 60000;
const T0 = Date.UTC(2026, 9, 10, 12);

// ---- lots ------------------------------------------------------------------------------------------------------------

test('lot sizes have names', () => {
    assert.deepEqual(LOT_BUCKETS.map(lotLabel), ['Up to 100', '101 to 250', '251 to 500', '501 to 1,000', 'Over 1,000']);
    assert.equal(lotBucket(100), 0);
    assert.equal(lotBucket(101), 1);
    assert.equal(lotBucket(5000), 4);
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

test('the table: lots, points, the usual wait at the front, and your own', () => {
    const t = lotTable(gone, [{ points: 100, wait: 6 * MIN }, { points: 90, wait: 17 * MIN }, { points: 420, wait: null }], T0);
    assert.deepEqual([t[0].lots, t[0].points, t[0].wait, t[0].waits], [4, 380, 6 * MIN, 3]);
    assert.deepEqual(t[0].mine, { n: 2, lo: 6 * MIN, hi: 17 * MIN });
    assert.deepEqual([t[2].lots, t[2].wait], [1, 48 * MIN], 'the lot of nine days ago is out');
    assert.deepEqual(t[2].mine, { n: 1, lo: null, hi: null });
    assert.equal(t[1].wait, null);
    assert.equal(t[1].mine, null);
});

test('how to list: the size that leaves quickest, or one lot', () => {
    const t = lotTable(gone, [], T0);
    const plan = sellPlan(420, t);
    assert.deepEqual(plan.one, { lots: [420], wait: 48 * MIN });
    assert.deepEqual(plan.quick.lots, [100, 100, 100, 100, 20]);
    assert.equal(plan.quick.wait, 30 * MIN);
    assert.equal(lotsWords(plan.quick.lots), '4 lots of 100 and 1 of 20');
    assert.equal(lotsWords([420]), '1 lot of 420');
    assert.equal(sellPlan(60, t).quick, null, 'one small lot is already the quickest');
    assert.equal(sellPlan(420, lotTable([], [], T0)).quick, null, 'nothing seen yet');
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
    assert.deepEqual(body.items[0], { itemID: 263, pricingType: 'fixed', pricingValue: 14544, inflationProtectionEnabled: false, roundToPlace: 0, bulkType: 'none' });
    assert.ok(!JSON.stringify(body).includes('206'), 'Xanax is not ours to touch');
});

test('closing takes your pieces off the list and leaves the rest', () => {
    const current = parseOwnList([{ item_id: 274, pricing_type: 'fixed', price: 34946 }, { item_id: 206, price: 830000 }]);
    const diff = listDiff(current, desiredList(pieces, false), [274, 263, 215]);
    assert.deepEqual(diff.remove, [{ itemID: 274, was: 34946 }]);
    assert.deepEqual(putBody(diff), { items: [{ itemID: 274 }] });
    assert.equal(listMatches(listDiff(parseOwnList([]), [], [274])), true);
});

test('a receipt: one line per piece, checked against the Archive\'s own sum', () => {
    const body = receiptBody(98765, [{ id: 274, qty: 5 }, { id: 274, qty: 2 }, { id: 263, qty: 3 }, { id: 215, qty: 0 }], 4242);
    assert.deepEqual(body, { items: [{ itemID: 274, quantity: 7 }, { itemID: 263, quantity: 3 }], tradeID: '98765', buyerPlayerId: 4242, includeMessage: true });
    const ok = readReceipt({ receipt: { total_value: 288254, items: [] }, receiptURL: 'https://weav3r.dev/receipt/abc', message: 'hi' }, 288254);
    assert.deepEqual([ok.ok, ok.url, ok.differs], [true, 'https://weav3r.dev/receipt/abc', 0]);
    const off = readReceipt({ receipt: { total_value: 280000 }, warnings: { notPriced: ['Crocus'] } }, 288254);
    assert.deepEqual([off.ok, off.differs, off.missing], [false, -8254, ['Crocus']]);
    assert.equal(readReceipt(null, 5).ok, false);
});

test('receipts by Torn trade, and how long TornW3B keeps listing you', () => {
    const by = receiptsByTrade([{ id: 'r1', trade_id: 98765, total_value: 5 }, { id: 'r2' }]);
    assert.deepEqual(by.get('98765'), { id: 'r1', total: 5, at: null });
    assert.equal(by.size, 1);
    assert.equal(listedUntil(T0), T0 + 7 * 86400000);
    assert.equal(listedUntil(0), 0);
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
