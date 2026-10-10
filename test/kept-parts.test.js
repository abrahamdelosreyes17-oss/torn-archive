/*
 * The parts of Torn Bids 3.24.0's files that Torn Archive kept, where the
 * test that covered them there also leaned on something left behind
 * (acceptTrade, flipPlan, the reports' files, TornExchange...). Each case
 * here is that test's kept half, with what it needs built by hand - so
 * nothing taken is left without a test - and the three small things changed
 * on the way in: the problem log folds on the detail too, the page of our
 * own has its address, and the marks' CSS speaks the finders' names.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { VENUE_FEES, MIN_PROFIT_PCT, enoughProfit } from '../src/core/profit.js';
import { tidyKeep, tidyGone, tidyStock, tidyBought } from '../src/core/tidy.js';
import { liveGone, liveStock, liveBought, markGone, noteStock, OWN_KEEP_MS, pickBazaars, MAIN_STOPS, EXTRA_STOPS } from '../src/core/flips.js';
import { readTraderDb, emptyTraderDb, stalePrice, freshOnly, PRICES_STALE_MS } from '../src/core/traders.js';
import { makeItemsCacheEntry, isItemsCacheFresh, ITEMS_PARTIAL_TTL_MS } from '../src/core/items.js';
import { makeZip, crc32 } from '../src/core/zip.js';
import { TRADE_MAX_UNITS, stepDone, sendUnits, takenUnits, tradeCount, boughtSince, countView } from '../src/core/accepted.js';
import { addLogEntries, logAsText } from '../src/core/errlog.js';
import { ARCHIVE_PAGE_URL, ARCHIVE_PAGE_PARAM, ARCHIVE_PAGE_VALUE, isArchivePageUrl, detectPage, PAGE_NONE } from '../src/sources/route.js';
import { MARKS_CSS } from '../src/ui/marks-css.js';
import { FLOAT_CLASS, ROW_FLOAT_CLASS } from '../src/sources/dom/float.js';
import { SET_MARK_CLASS, SET_FILL_CLASS } from '../src/sources/dom/sets-pages.js';

const NOW = 1_790_000_000_000;
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const copy = (v) => JSON.parse(JSON.stringify(v));

/* ---------------------------------------------------------------- profit.js */

test('NPC deals still count from $1; any other sale needs the least profit per item (flips.test.js, 3.24.0)', () => {
    assert.equal(MIN_PROFIT_PCT, 1);
    assert.equal(enoughProfit(1, 10000, 'NPC'), true);
    assert.equal(enoughProfit(1, 10000, 'BAZAAR_RESALE'), false);
    assert.equal(enoughProfit(100, 10000, 'BAZAAR_RESALE'), true);
    assert.equal(enoughProfit(5, 10000, 'BAZAAR_RESALE', 0), true, 'a least of 0%: still at least $1');
    // Cheap items: never less than $1 either way.
    assert.equal(enoughProfit(0.5, 10, 'TRADER'), false);
    assert.equal(enoughProfit(1, 10, 'TRADER'), true);
    assert.equal(enoughProfit(0, 10, 'NPC'), false);
    // The fees these sales carry.
    assert.equal(VENUE_FEES.NPC, 0);
    assert.equal(VENUE_FEES.ITEM_MARKET, 0.05);
    assert.equal(VENUE_FEES.TRADER, 0);
});

/* ------------------------------------------------------------------ tidy.js */

/** The tidied value reads the same, is smaller when something expired, and is the same object when nothing did. */
function proves(tidy, read, stored, { drops }) {
    const before = copy(stored);
    const next = tidy(stored, NOW);
    assert.deepEqual(stored, before, 'the stored value is not edited');
    assert.deepEqual(read(next, NOW), read(stored, NOW), 'a reader gets the same from both');
    if (drops) {
        assert.notEqual(next, stored);
        assert.ok(JSON.stringify(next).length < JSON.stringify(stored).length, 'smaller');
        assert.equal(tidy(next, NOW), next, 'tidied once is tidy: nothing to write again');
    } else {
        assert.equal(next, stored, 'nothing expired: the same object, nothing is written');
    }
}

test('gone marks, page stocks, own buys: each tidied as its reader keeps it (tidy.test.js, 3.24.0)', () => {
    const gone = { ...markGone(null, '1', '206', NOW - MIN), '2|206': { at: NOW - OWN_KEEP_MS - 1 } };
    proves(tidyGone, liveGone, gone, { drops: true });
    proves(tidyGone, liveGone, markGone(null, '1', '206', NOW - MIN), { drops: false });

    const stock = { ...noteStock(null, '1', '206', 60, 840000, NOW - MIN), '2|206': { qty: 5, price: 1, at: NOW - OWN_KEEP_MS - 1 } };
    proves(tidyStock, liveStock, stock, { drops: true });
    proves(tidyStock, liveStock, noteStock(null, '1', '206', 60, 840000, NOW - MIN), { drops: false });

    const buy = (id, t) => ({ id, sellerId: '1', itemId: '206', qty: 2, each: 840000, t });
    proves(tidyBought, liveBought, [buy('a:0', NOW - OWN_KEEP_MS - 1), buy('b:0', NOW - MIN)], { drops: true });
    proves(tidyBought, liveBought, [buy('b:0', NOW - MIN)], { drops: false });
});

test('junk in a store is left as it is: the tidy-up never guesses (tidy.test.js, 3.24.0)', () => {
    for (const junk of [null, undefined, 5, 'x']) {
        for (const tidy of [tidyGone, tidyStock, tidyBought]) assert.equal(tidy(junk, NOW), junk);
    }
    const obj = { a: 1 };
    assert.equal(tidyBought(obj, NOW), obj);
    // The helper a new rule is written with: only the keys a reader still returns, the same object when all are.
    const stored = { a: 1, b: 2 };
    assert.equal(tidyKeep(stored, { a: 1, b: 2 }), stored);
    assert.deepEqual(tidyKeep(stored, { b: 2 }), { b: 2 });
    const list = [1, 2];
    assert.equal(tidyKeep(list, {}), list);
});

/* --------------------------------------------------------------- traders.js */

test('the traders\' store: another version, or nothing stored, is an empty one (traders.test.js, 3.24.0)', () => {
    assert.deepEqual(readTraderDb({ version: 0, traders: { 1: {} } }), emptyTraderDb());
    assert.deepEqual(readTraderDb(null), emptyTraderDb());
});

test('a TornW3B price from a list not changed in two days is stale - never one whose date is not known (trades-board.test.js, 3.24.0)', () => {
    assert.equal(PRICES_STALE_MS, 2 * DAY);
    const listAt = new Map([['1', NOW - 3 * DAY], ['2', NOW - DAY], ['3', NOW - 30 * DAY], ['5', NOW - 30 * DAY]]);
    const listAtOf = (id) => listAt.get(String(id)) || 0;
    const buyers = [
        { id: '1', name: 'Old list', price: 900, w3b: 900, te: null },
        { id: '2', name: 'Changed yesterday', price: 890, w3b: 890, te: null },
        { id: '3', name: 'Old list, with a price from elsewhere too', price: 880, w3b: 885, te: 880 },
        { id: '4', name: 'Date not known', price: 870, w3b: 870, te: null },
        { id: '5', name: 'No TornW3B price', price: 860, w3b: null, te: 860 },
        { id: null, name: 'By name only', price: 850, w3b: null, te: 850 },
    ];
    assert.deepEqual(buyers.map((b) => stalePrice(b, listAtOf, NOW)), [true, false, false, false, false, false]);
    assert.deepEqual(freshOnly(buyers, listAtOf, NOW).map((b) => b.id), ['2', '3', '4', '5', null]);
    // Exactly two days is not over two days.
    assert.equal(stalePrice({ id: '9', w3b: 5 }, () => NOW - PRICES_STALE_MS, NOW), false);
    assert.equal(stalePrice({ id: '9', w3b: 5 }, () => NOW - PRICES_STALE_MS - 1, NOW), true);
});

/* ----------------------------------------------------------------- items.js */

test('an item list that could not say what shops pay is asked for again after 5 minutes, not an hour (feed.test.js, 3.24.0)', () => {
    const t = 1_000_000;
    const entry = makeItemsCacheEntry({ 18: { name: 'x', market_value: 3542, sell_price: null, npc_unknown: true } }, t);
    assert.equal(entry.partial, true);
    assert.equal(isItemsCacheFresh(entry, t + ITEMS_PARTIAL_TTL_MS - 1), true);
    assert.equal(isItemsCacheFresh(entry, t + ITEMS_PARTIAL_TTL_MS + 1), false);
    assert.equal(makeItemsCacheEntry({ 1: { name: 'x' } }, t).partial, undefined, 'a full list is a full one');
});

/* ------------------------------------------------------------------- zip.js */

test('a zip of a few text files: stored, with its CRC, read back whole (usage.test.js and errlog.test.js, 3.24.0)', () => {
    assert.equal(crc32(new TextEncoder().encode('hello')), 0x3610a686);
    const files = [{ name: 'README.txt', text: 'What is in this zip.\n' }, { name: 'log.txt', text: 'one line\n' }, { name: 'shot.png', data: new Uint8Array([1, 2, 3]) }];
    const zip = makeZip(files, new Date(NOW));
    const dv = new DataView(zip.buffer);
    assert.equal(dv.getUint32(0, true), 0x04034b50, 'a zip');
    assert.equal(dv.getUint16(zip.length - 22 + 10, true), 3, 'three files');
    const text = new TextDecoder().decode(zip);
    for (const f of files) assert.ok(text.includes(f.name));
    assert.ok(text.includes('What is in this zip.'), 'stored, not compressed');
});

/* ----------------------------------------------------------------- flips.js */

const s = (price, qty, who = 'S' + price) => ({ sellerId: who, sellerName: who, price, qty, stale: false });
const sellersOf = (steps) => new Set(steps.map((st) => st.sellerId));

test('at most 5 bazaars for an item, 3 when it is only cover; the ones that pay the most (main-flip.test.js, 3.24.0)', () => {
    assert.equal(MAIN_STOPS, 5);
    assert.equal(EXTRA_STOPS, 3);
    // 38 bazaars of two or three each (the owner's Bag of Bon Bons, 2026-09-28).
    const bonbons = Array.from({ length: 38 }, (_, i) => s(80 + i, 2 + (i % 2), 'B' + i));
    const p = pickBazaars(bonbons, 200, { maxUnits: 100 });
    assert.ok(sellersOf(p.steps).size <= MAIN_STOPS, sellersOf(p.steps).size + ' bazaars');
    assert.equal(p.stops, sellersOf(p.steps).size);
    assert.ok(p.units > 0 && p.units < 100);
    const cover = pickBazaars(bonbons, 200, { maxUnits: 100, maxStops: EXTRA_STOPS });
    assert.ok(sellersOf(cover.steps).size <= EXTRA_STOPS, sellersOf(cover.steps).size + ' bazaars');
    // One seller with 30 beats five with 2 each.
    const rows = [s(100, 2, 'a'), s(101, 2, 'b'), s(102, 2, 'c'), s(103, 2, 'd'), s(104, 2, 'e'), s(110, 30, 'Big')];
    const q = pickBazaars(rows, 200, { maxUnits: 100 });
    assert.ok(sellersOf(q.steps).has('Big'), 'the seller with 30 is in');
    assert.equal(q.units, 30 + 4 * 2, 'Big and the four best small ones');
    assert.equal(q.stops, 5);
});

/* -------------------------------------------------------------- accepted.js */

/*
 * A trade as Torn Bids kept one, built by hand (acceptTrade and recordBuy
 * were left behind): a line per item, a step per bazaar.
 */
const step = (qty, price, bought, extra = {}) => ({ sellerId: '500', sellerName: 'A', qty, price, bought: bought >= qty, boughtQty: bought, skipped: bought === 0 && extra.skipped === true, boughtAt: bought > 0 ? NOW - 20 * MIN : null, ...extra });
const todo = (qty, price) => ({ sellerId: '501', sellerName: 'C', qty, price, bought: false });
const flip = (itemId, name, bid, steps) => ({ line: 'flip:' + itemId, itemId, name, units: steps.reduce((a, st) => a + st.qty, 0), bid, kind: 'flip', sent: false, steps });
const yours = (itemId, name, units, bid) => ({ line: 'yours:' + itemId, itemId, name, units, bid, kind: 'yours', sent: false, steps: [] });
const extraBuy = (itemId, name, qty, price, bid, at) => ({ itemId, name, qty, price, bid, sellerId: '700', seller: null, at });
const tradeOf = (items, extra = []) => ({ key: 'id:9', trader: { id: '9', name: 'FAFFO' }, itemId: items[0] ? items[0].itemId : null, at: NOW - 30 * MIN, items, extra });
const pick = (c) => ({ max: c.max, units: c.units, room: c.room, full: c.full, over: c.over, toBuy: c.toBuy });

/** FAFFO accepted 6,000 Champagne and 3,000 Peony; both bought as planned. */
const boughtTrade = (extra = []) => tradeOf([
    flip('181', 'Bottle of Champagne', 3100, [step(6000, 2950, 6000)]),
    flip('271', 'Peony', 5200, [step(3000, 5000, 3000, { sellerId: '600', sellerName: 'B', boughtAt: NOW - 19 * MIN })]),
], extra);

test('how many of a line go in the trade: what you bought once you started buying, yours as planned (accepted.test.js, 3.24.0)', () => {
    assert.equal(stepDone(todo(5, 1)), false);
    assert.equal(stepDone(step(5, 1, 5)), true);
    assert.equal(stepDone(step(5, 1, 2)), true, 'bought some');
    assert.equal(stepDone(step(5, 1, 0, { skipped: true })), true, 'skipped');
    assert.equal(stepDone(null), false);
    // Not started: as planned.
    assert.equal(sendUnits(flip('206', 'Xanax', 850000, [todo(30, 840000), todo(23, 841000)])), 53, 'sends what was planned');
    // Started: what you actually bought.
    assert.equal(sendUnits(flip('206', 'Xanax', 850000, [step(30, 840000, 20), todo(23, 841000)])), 20, 'send what you bought, not what was planned');
    assert.equal(sendUnits(flip('206', 'Xanax', 850000, [step(30, 840000, 0, { skipped: true })])), 0, 'skipped: nothing to send');
    assert.equal(sendUnits(yours('271', 'Peony', 10, 5200)), 10, 'yours as planned');
    assert.equal(sendUnits(null), 0);
    // What they took: what you sent, less what they did not take.
    assert.equal(takenUnits({ ...flip('206', 'Xanax', 850000, [step(50, 840000, 50)]), left: 20 }), 30);
    assert.equal(takenUnits(flip('206', 'Xanax', 850000, [step(50, 840000, 50)])), 50);
    assert.equal(takenUnits({ ...yours('271', 'Peony', 10, 5200), left: 99 }), 0, 'never under nothing');
});

test('10,000 items per trade: the count is every unit of the trade - planned, unplanned and your own lines together (ten-thousand.test.js, 3.24.0)', () => {
    assert.equal(TRADE_MAX_UNITS, 10000);
    const t = boughtTrade();
    assert.deepEqual(pick(tradeCount(t)), { max: 10000, units: 9000, room: 1000, full: false, over: 0, toBuy: 0 });
    assert.equal(tradeCount(t).near, true, 'from nine tenths, it is nearly full');
    // An unplanned buy counts.
    const camel = extraBuy('384', 'Camel Plushie', 600, 70000, 73500, NOW - 10 * MIN);
    assert.deepEqual(pick(tradeCount(boughtTrade([camel]))), { max: 10000, units: 9600, room: 400, full: false, over: 0, toBuy: 0 });
    // One the trader does not pay for is not in the trade, and not in its count.
    assert.equal(tradeCount(boughtTrade([camel, extraBuy('999', 'Thing', 5000, 5, 0, NOW - 9 * MIN)])).units, 9600);
    // What is still to buy is said apart: it is not in the trade yet.
    const half = tradeOf([flip('181', 'Bottle of Champagne', 3100, [step(6000, 2950, 6000), todo(700, 2960)])]);
    assert.deepEqual(pick(tradeCount(half)), { max: 10000, units: 6000, room: 4000, full: false, over: 0, toBuy: 700 });
    // Before anything is bought: nothing in it.
    const none = tradeOf([flip('181', 'Bottle of Champagne', 3100, [todo(6000, 2950), todo(700, 2960)])]);
    assert.deepEqual(pick(tradeCount(none)), { max: 10000, units: 0, room: 10000, full: false, over: 0, toBuy: 6700 });
    assert.deepEqual(pick(tradeCount(null)), { max: 10000, units: 0, room: 10000, full: false, over: 0, toBuy: 0 });
});

test('a full trade stops at 10,000, in the order you bought, and what is over is named (ten-thousand.test.js, 3.24.0)', () => {
    const t = boughtTrade([
        extraBuy('384', 'Camel Plushie', 600, 70000, 73500, NOW - 10 * MIN),
        extraBuy('258', 'Jaguar Plushie', 720, 11000, 11500, NOW - 5 * MIN),
    ]);
    const c = tradeCount(t);
    assert.deepEqual(pick(c), { max: 10000, units: 10000, room: 0, full: true, over: 320, toBuy: 0 });
    assert.deepEqual(c.overRows, [{ itemId: '258', name: 'Jaguar Plushie', qty: 320, each: 11000 }]);
    // The rows say the same, so a checklist never asks for the 320; the money expected is for what goes in.
    const b = boughtSince(t, { inside: new Map([['bottle of champagne', 6000], ['peony', 3000], ['camel plushie', 600], ['jaguar plushie', 400]]) });
    assert.deepEqual(b.rows.map((r) => [r.name, r.send, r.over || 0]), [['Bottle of Champagne', 6000, 0], ['Peony', 3000, 0], ['Camel Plushie', 600, 0], ['Jaguar Plushie', 400, 320]]);
    assert.equal(b.totals.pays, 6000 * 3100 + 3000 * 5200 + 600 * 73500 + 400 * 11500);
    assert.deepEqual(b.missing, []);
    assert.equal(b.done, true);
    assert.equal(b.trader, 'FAFFO');
    assert.deepEqual(pick(b.count), pick(c));
    // One short in Torn's trade: named, and not done.
    const short = boughtSince(t, { inside: new Map([['bottle of champagne', 6000], ['peony', 2999], ['camel plushie', 600], ['jaguar plushie', 400]]) });
    assert.deepEqual(short.missing, [{ name: 'Peony', qty: 1 }]);
    assert.equal(short.done, false);
    // A smaller limit, for a test: the same walk.
    assert.deepEqual(pick(tradeCount(t, 6100)), { max: 6100, units: 6100, room: 0, full: true, over: 2900 + 600 + 720, toBuy: 0 });
});

test('your own lines count too, after what you bought: what does not fit is said by item (ten-thousand.test.js, 3.24.0)', () => {
    const t = tradeOf([
        flip('181', 'Bottle of Champagne', 3100, [step(6000, 2950, 6000)]),
        yours('271', 'Peony', 3000, 5200),
    ], [extraBuy('384', 'Camel Plushie', 2500, 70000, 73500, NOW - 10 * MIN)]);
    const c = tradeCount(t);
    assert.deepEqual(pick(c), { max: 10000, units: 10000, room: 0, full: true, over: 1500, toBuy: 0 });
    assert.deepEqual(c.yoursOver, { 271: 1500 });
    assert.equal(c.yoursSent, 1500);
    assert.deepEqual(c.overRows, []);
});

test('the counter in words: nothing to say while there is room, room left from 9,000, full (ten-thousand.test.js, 3.24.0)', () => {
    const v = (units, over = 0) => countView({ max: 10000, units, room: Math.max(0, 10000 - units), full: units >= 10000, near: units >= 9000 && units < 10000, over }, 'FAFFO');
    assert.deepEqual(v(6420), { state: 'ok', units: 6420, max: 10000, pct: 64.2, text: '6,420 of 10,000', say: '' });
    assert.equal(v(0).pct, 0);
    assert.deepEqual([v(9480).state, v(9480).say], ['near', 'Room for 520 more in this trade.']);
    assert.deepEqual([v(10000).state, v(10000).pct], ['full', 100]);
    assert.match(v(10000).say, /^This trade is full\. /);
    assert.match(v(10000, 320).say, /^This trade is full\. 320 more go /);
    assert.match(v(10000, 1).say, /^This trade is full\. 1 more goes /);
    assert.equal(countView(null, 'FAFFO'), null, 'no count: no counter');
    // Straight from a trade.
    assert.equal(countView(tradeCount(boughtTrade()), 'FAFFO').say, 'Room for 1,000 more in this trade.');
});

/* ---------------------------------------------------------------- errlog.js */

test('the problem log folds a repeat only when the detail is the same too (Torn Archive 1.0.0)', () => {
    const line = (at, detail) => ({ at, kind: 'error', where: 'Archive', what: 'TornW3B failed: An item\'s listings', ...(detail ? { detail } : {}) });
    // One real 429, then eight of something else under the same message: two lines, not "x9 [HTTP 429]".
    const entries = [line(NOW - 9000, 'HTTP 429'), ...Array.from({ length: 8 }, (_, i) => line(NOW - 8000 + i * 100, 'no answer in 30 s'))];
    const log = addLogEntries(null, entries, NOW);
    assert.deepEqual(log.map((e) => [e.detail, e.times || 1]), [['HTTP 429', 1], ['no answer in 30 s', 8]]);
    const text = logAsText(log);
    assert.match(text, /An item's listings - HTTP 429\n/);
    assert.match(text, /An item's listings - no answer in 30 s \(x8/);
    // No detail and a detail are not the same line; no detail twice is.
    const mixed = addLogEntries(null, [line(NOW - 3000), line(NOW - 2000), line(NOW - 1000, 'HTTP 500')], NOW);
    assert.deepEqual(mixed.map((e) => [e.detail || null, e.times || 1]), [[null, 2], ['HTTP 500', 1]]);
    // A to B to A within the minute: three lines - only a repeat in a row is counted.
    const aba = addLogEntries(null, [line(NOW - 3000, 'a'), line(NOW - 2000, 'b'), line(NOW - 1000, 'a')], NOW);
    assert.equal(aba.length, 3);
});

/* ----------------------------------------------------------------- route.js */

test('the page of our own: its address, with or without the last slash or index.html - and never a Torn page', () => {
    assert.equal(ARCHIVE_PAGE_URL, 'https://abrahamdelosreyes17-oss.github.io/torn-archive/');
    assert.equal(isArchivePageUrl(ARCHIVE_PAGE_URL), true);
    assert.equal(isArchivePageUrl('https://abrahamdelosreyes17-oss.github.io/torn-archive'), true);
    assert.equal(isArchivePageUrl(ARCHIVE_PAGE_URL + 'index.html'), true);
    assert.equal(isArchivePageUrl(ARCHIVE_PAGE_URL + '?tab=trades#top'), true);
    assert.equal(isArchivePageUrl(ARCHIVE_PAGE_URL + 'other.html'), false);
    assert.equal(isArchivePageUrl('https://abrahamdelosreyes17-oss.github.io/torn-moneymaker-releases/traders.html'), false, 'Torn Bids\' page is not ours');
    assert.equal(isArchivePageUrl('https://www.torn.com/bazaar.php?userId=1'), false);
    assert.equal(isArchivePageUrl(''), false);
    assert.equal(isArchivePageUrl(null), false);
    // The harness's stand-in: any page of ours with the marker - never one on Torn.
    const marker = '?' + ARCHIVE_PAGE_PARAM + '=' + ARCHIVE_PAGE_VALUE;
    assert.equal(isArchivePageUrl('http://localhost:8000/harness.html' + marker), true);
    assert.equal(isArchivePageUrl('https://www.torn.com/index.php' + marker), false);
    assert.equal(isArchivePageUrl('https://torn.com/index.php' + marker), false);
    assert.equal(isArchivePageUrl('https://nottorn.com/x' + marker), true, 'only torn.com itself and what is under it');
    // And it is no page of Torn's.
    assert.equal(detectPage(ARCHIVE_PAGE_URL), PAGE_NONE);
});

/* ------------------------------------------------------------- marks-css.js */

test('the marks\' CSS and the finders agree on every name, and nothing of Torn Bids\' is left in it', () => {
    assert.equal(typeof MARKS_CSS, 'string');
    for (const cls of [FLOAT_CLASS, ROW_FLOAT_CLASS, SET_MARK_CLASS, SET_FILL_CLASS, 'tarc-toast', 'tarc-hit', 'tarc-target']) {
        assert.ok(cls.startsWith('tarc-'), cls);
        assert.ok(MARKS_CSS.includes('.' + cls + ' {') || MARKS_CSS.includes('.' + cls + '.') || MARKS_CSS.includes('.' + cls + '['), cls + ' has a rule');
    }
    assert.doesNotMatch(MARKS_CSS, /ttv2/i);
    assert.match(MARKS_CSS, /var\(--tarc-fr, 8px\)/, 'the one variable has its fallback');
    assert.doesNotMatch(MARKS_CSS.replace(/var\(--tarc-fr, 8px\)/g, ''), /var\(--/, 'no token variable is leaned on');
    assert.equal((MARKS_CSS.match(/{/g) || []).length, (MARKS_CSS.match(/}/g) || []).length, 'every rule is closed');
    assert.doesNotMatch(MARKS_CSS, /`/);
});
