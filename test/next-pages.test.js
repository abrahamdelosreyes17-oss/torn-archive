// 1.3.0, the books and the hub's pages (HANDOFF "THE NEXT BUILD: FULL AGENDA", 2026-10-12): the ledger says "about"
// where a cost was an estimate (F1), what is not sold at today's worth (F2), pieces sold as themselves (F3), points
// held before (F4); the Stock page's tiles always show their three lines in the owner's three colours (E3, G); the
// break-even panel (C2), the list's capital (C3), the three groups (C1), and a key's badge that never says
// "working" while it is refused (B5).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { poolAdd, poolTake, avgBook, profitBuckets, profitSum, BOOK_ABOUT } from '../src/core/books.js';
import { stockApply, STOCK_EMPTY } from '../src/core/stock.js';
import { bookAdd } from '../src/core/points.js';
import { SETS } from '../src/core/sets.js';
import { archiveView } from '../src/core/view.js';
import { fillList } from '../src/core/shopping.js';
import { listPieces } from '../src/core/view.js';
import { hubPage } from '../src/ui/hub-pages.js';
import { fixtureInput } from './fixture-view.js';

const NOW = Date.UTC(2026, 9, 12, 9, 0);
const DAY = 86400000;
const count = (html, re) => (html.match(re) || []).length;
const KEYS = { limited: { set: true, ok: true }, full: { set: true, ok: true }, w3b: { set: true, ok: true } };
const desk = (input, more = {}) => ({ view: archiveView(input), keys: KEYS, usage: { torn: [], w3b: [], nowTorn: 0, nowW3b: 0, refused: 0 }, turns: { mode: 'alone', why: '', torn: 85, w3b: 80 }, busy: { w3b: false, receipt: null }, notice: null, server: null, version: 'test', ...more });
const UI = { page: 'dashboard', pane: 0, sel: null, trade: null, range: { pts: 40, pts2: 40 }, unit: 'day', imKey: '' };
const page = (d, name, pane = 0) => hubPage(d, { ...UI, page: name, pane });

// ---- F. the books ------------------------------------------------------------------------------------------------------

test('F1. units never seen bought leave the pool at its average, and the answer says how much of that cost is an estimate', () => {
    let pool = poolAdd({}, 258, 6, 600);
    pool = poolAdd(pool, 258, 4, 400, true);
    const took = poolTake(pool, 258, 5);
    assert.deepEqual([took.units, took.cost, took.est], [5, 500, 0.4]);
    assert.equal(poolTake(pool, 999, 1).est, 0);
});

test('F1 + F3. a swap says the share of its cost that was an estimate; units that left as themselves come back with what they had cost', () => {
    const set = SETS[0];
    const each = () => 1000;
    // One of every piece held, never seen bought (Torn's count opens the book): all of the cost is an estimate.
    let s = { ...STOCK_EMPTY, held: Object.fromEntries(set.pieces.map((p) => [String(p.id), 2])), pool: set.pieces.reduce((pool, p) => poolAdd(pool, p.id, 2, 2000, true), {}) };
    const swap = stockApply(s, [{ key: 'swap:1', t: NOW, swap: set.key, sets: 1 }], each);
    assert.equal(swap.made.length, 1);
    assert.deepEqual([swap.made[0].points, swap.made[0].cost, swap.made[0].est], [set.points, set.pieces.length * 1000, 1]);
    // One unit sold as itself: out of the count, with its cost.
    const id = String(set.pieces[0].id);
    const sold = stockApply(swap.state, [{ key: 'row:x1', t: NOW + 1000, id, d: -1 }], each);
    assert.deepEqual(sold.out, [{ key: 'row:x1', t: NOW + 1000, id, units: 1, cost: 1000, est: 1 }]);
    assert.equal(sold.state.held[id], 0);
});

test('F1. profit on points whose cost was partly an estimate is "about" - a dollar in a hundred or more; under that it is not', () => {
    const made = (est) => bookAdd([], { id: 'm1', t: NOW - DAY, kind: 'made', points: 1000, each: 100, set: 'plushie', est });
    const sold = (list) => bookAdd(list, { id: 's1', t: NOW, kind: 'sold', points: 400, each: 150 });
    assert.equal(made(0.3)[0].est, 0.3, 'the book keeps the share');
    const b = avgBook(sold(made(0.3)), 150);
    assert.deepEqual([b.about, b.rows.find((r) => r.kind === 'sold').est, Math.round(b.est * 100) / 100], [true, 0.3, 0.3]);
    assert.equal(b.profitSold, 400 * 50);
    assert.equal(avgBook(sold(made(BOOK_ABOUT / 2)), 150).about, false);
    assert.equal(avgBook(sold(made(undefined)), 150).about, false, 'a cost seen bought in full');
    const days = profitBuckets(b.rows, [], NOW, 'day', 3);
    assert.deepEqual([days[2].about, days[1].about, profitSum(days).about], [true, false, true]);
});

test('F3. a piece sold as itself is its own profit or loss, on the day it sold; one given away counts for nothing', () => {
    const direct = [{ t: NOW - 1000, gain: 700, est: 0 }, { t: NOW - DAY, gain: -300, est: 0.5 }];
    const days = profitBuckets([], [], NOW, 'day', 3, direct);
    assert.deepEqual(days.map((d) => [d.direct, d.profit, d.about]), [[0, 0, false], [-300, -300, true], [700, 700, false]]);
    assert.deepEqual([profitSum(days).direct, profitSum(days).profit], [400, 400]);

    const input = fixtureInput(NOW);
    const before = archiveView(input).ledger.sum.profit;
    input.direct = [
        { id: 'log9:0', t: NOW - 2000, itemId: '258', qty: 3, got: 110000, cost: 100000, venue: 'bazaar', give: false, est: 0 },
        { id: 'log9:1', t: NOW - 3000, itemId: '266', qty: 2, got: 80000, cost: 90000, venue: 'market', give: false, est: 0 },
        { id: 'trade:5:out:0', t: NOW - 4000, itemId: '274', qty: 4, got: 0, cost: 140000, venue: 'trade', give: true, est: 0 },
    ];
    const lg = archiveView(input).ledger;
    assert.deepEqual([lg.direct.units, lg.direct.got, lg.direct.cost, lg.direct.gain, lg.direct.given, lg.direct.givenCost], [5, 190000, 190000, 0, 4, 140000]);
    assert.deepEqual(lg.direct.rows.map((r) => r.gain), [10000, -10000, 0], 'the newest first, each against its own cost');
    assert.equal(lg.sum.profit, before, 'a gain of 10,000 and a loss of 10,000: the 14 days stand where they were');
    assert.equal(lg.days[lg.days.length - 1].direct, 0);
    input.direct = input.direct.slice(0, 1);
    assert.equal(archiveView(input).ledger.sum.profit, before + 10000, 'and a gain alone is in the profit');
});

test('F2 + F4. what is not sold stands at its cost and at what it is worth today; points you held before the book began are shown, and counted for nothing', () => {
    const input = fixtureInput(NOW);
    const lg = archiveView(input).ledger;
    assert.ok(lg.notSold > 0 && lg.notSoldWorth > 0);
    assert.equal(lg.notSoldDiff, lg.notSoldWorth - lg.notSold);
    assert.deepEqual(lg.before, { points: 0, got: 0 });
    // A lot of 5,000 sold now: the book holds fewer points made from sets than that.
    const left = archiveView(input).points.book.left;
    assert.ok(left > 0 && left < 5000);
    input.book = [...input.book, { id: 'sBig', t: NOW - 1000, kind: 'sold', points: 5000, each: 31000, set: null, src: 'log' }];
    const lg2 = archiveView(input).ledger;
    const row = lg2.sold.find((s) => s.id === 'sBig');
    assert.deepEqual([row.points, row.before, row.beforeGot, row.got], [left, 5000 - left, (5000 - left) * 31000, left * 31000]);
    assert.deepEqual(lg2.before, { points: 5000 - left, got: (5000 - left) * 31000 });
    assert.equal(lg2.sold.reduce((s, r) => s + r.got + r.beforeGot, 0), input.book.filter((e) => e.kind === 'sold').reduce((s, e) => s + e.points * e.each, 0), 'counted and not counted add up to what you received');
});

// ---- the hub's pages ---------------------------------------------------------------------------------------------------

test('G + E3. Stock: every piece tile of both sets holds its three lines, whatever its size, in one of three states', () => {
    const d = desk(fixtureInput(NOW));
    const html = page(d, 'stock');
    const tiles = html.split('<div class="pc ').slice(1).filter((t) => !t.startsWith('act'));
    const pieces = d.view.sets.reduce((n, s) => n + s.pieces.length, 0);
    assert.equal(tiles.length, pieces, 'a tile for each of the ' + pieces + ' pieces');
    for (const t of tiles) {
        assert.equal(count(t, /class="pc-k"/g), 3, 'three lines on the tile: ' + t.slice(0, 60));
        assert.match(t, /Cheapest now/);
        assert.match(t, /Worth to you/);
        assert.match(t, /(Under|Over) its worth/);
        // Orange, green or red (the owner: "red for we have too much, orange we still need more, and green we
        // have enough exactly") - and the tile says the same in words, so the colour is never the only sign.
        const state = t.split(' ')[0];
        const words = (t.match(/<span class="pc-s">([^<]*)<\/span>/) || [])[1];
        assert.ok(['need', 'even', 'over'].includes(state), 'need, enough or ahead: ' + state);
        assert.match(words, state === 'need' ? /^need \d+$/ : state === 'over' ? /^\d+ ahead$/ : /^enough$/);
    }
    const states = new Set(tiles.map((t) => t.split(' ')[0]));
    assert.ok(states.has('need') && (states.has('even') || states.has('over')), 'the made-up desk shows more than one state');
    assert.match(html, /data-act="read-stock"/, 'and the stock has its own Read');
    // The dashboard names the three colours once, on its Stock panel.
    assert.match(page(d, 'dashboard'), /Need.*Enough.*Ahead/s);
});

test('C1 + C3 + B1. Buy: profit per set in three colours, the list\'s capital beside what is on hand, and a buy that was taken back', () => {
    const input = fixtureInput(NOW);
    const v0 = archiveView(input);
    input.cart = fillList(listPieces(v0.pieces), (id) => (v0.pieces.find((p) => String(p.id) === String(id)) || { offers: [] }).offers.filter((o) => o.ok !== false && !o.out));
    assert.ok(input.cart.length > 3, 'the made-up desk makes a list');
    input.back = [{ id: '258', qty: 3, whoId: '11', im: false, t: NOW - 90000 }];
    const d = desk(input);
    const first = page(d, 'buy');
    // 1.4.0 (drawing AK, "for buy colors, that looks good"): one number a listing - what its set makes with it -
    // in three text colours, and the three counted once on "Fill my stock". No "Buy · Stretch · No thanks".
    assert.match(first, /<span class="mk3"><span class="j-best"[^>]*>[\d,]+ under their share<\/span><span class="j-ok"[^>]*>[\d,]+ keep your 2%<\/span><span class="j-thin"[^>]*>[\d,]+ under 2%<\/span>/);
    assert.doesNotMatch(first, /Stretch|No thanks|leaves/);
    const m = d.view.buy.marks;
    assert.ok(first.includes(`>${m.best.toLocaleString('en-US')} under their share<`) && first.includes(`>${m.ok.toLocaleString('en-US')} keep your 2%<`));
    assert.match(first, /<th class="n">Profit per set<\/th>/);
    assert.match(first, /<span class="j-(best|ok|thin)"[^>]*>\$[\d,]+ · [\d.]+%<\/span>/, 'dollars a set first, then the percent');
    // The list's own tab.
    const html = page(d, 'buy', 2);
    assert.equal(count(html, /on hand \$[\d,]+/g), 1, 'what you have on hand, once');
    assert.ok(html.includes('$' + d.view.buy.cost.toLocaleString('en-US')), 'the list\'s total');
    // What a set costs you, in dollars a set, now and with the list - never "a point" to multiply.
    assert.match(html, /A (Plushie|Flower) set will cost you<\/span><span class="num"><b>\$[\d,]+<\/b> now · <b>\$[\d,]+<\/b> with this list/);
    assert.match(html, /It sells for<\/span><span class="num"><b>\$[\d,]+<\/b> · <span class="t-(good|bad)">[+-]\$[\d,]+ a set<\/span>/);
    assert.doesNotMatch(html, /a point|break-even/);
    assert.match(html, /<b>Taken back:<\/b> 3 × [^<]+ at [^<]+ bazaar, [^<]+ · not in Torn's log/);
    assert.equal(count(html, /Taken back/g), 1);
});

test('C1. Dashboard: a stop of the list bought over its pieces\' own share says so - never a minus in green under "Under their worth"', () => {
    const d = desk(fixtureInput(NOW));
    // (The made-up desk has cheap listings, so its thing to do is "Do now": the same rows, said as a list's.)
    const hot = d.view.dash.todo.find((t) => t.kind === 'hot');
    assert.ok(hot && hot.first.length, 'the made-up desk has stops to name');
    const buy = { ...hot, kind: 'buy', first: hot.first.map((s) => ({ ...s })) };
    d.view.dash.todo = [buy];
    const plain = page(d, 'dashboard');
    assert.ok(plain.includes('Under their worth') && !plain.includes('the set carries it'));
    assert.ok(/t-good">\+\$/.test(plain), 'a stop under its worth: the saving, in green');
    buy.first[0] = { ...buy.first[0], gain: -7350 };
    const html = page(d, 'dashboard');
    assert.ok(html.includes('>$7,350 over</span>') && html.includes('the set still keeps your least profit'), 'said in words, and why on the hover');
    assert.ok(!/t-good">-/.test(html), 'no minus figure in green');
});

test('C2. Points: selling your points on one bar and in dollars - and red, with what selling now loses, when the price is under your cost', () => {
    const input = fixtureInput(NOW);
    const ok = page(desk(input), 'points');
    // 1.4.0 (drawing AL): one panel in place of "Your break-even" and "Sell N points" - what they cost you, the
    // price now and your usual on one bar, then what selling brings: in all, and a set.
    assert.match(ok, /data-k="selling"/);
    assert.doesNotMatch(ok, /data-k="even"|break-even|leaves/);
    const v0 = desk(input).view;
    assert.ok(ok.includes(`<h2>Selling your ${v0.points.sell.points} points</h2>`));
    assert.match(ok, /<th>If you sell at<\/th><th class="n">You get<\/th><th class="n">Profit<\/th><th class="n">Profit per set<\/th>/);
    assert.ok(ok.includes(`<td class="n t-good"><b style="color:inherit">+$${v0.points.sell.profit.toLocaleString('en-US')}</b></td>`), 'the profit of selling them all now, in dollars');
    assert.match(ok, /In lots, none over 2,000<\/span><b class="num">1 × 200 · 1 × 100 · 1 × 40<\/b>/);
    assert.match(ok, /Next lot: <b class="num">200<\/b> at <b class="num">\$[\d,]+<\/b>/);
    assert.doesNotMatch(ok, /under your cost/);
    // The lot sizes are the market's own, with the bigger ones in a last row of their own.
    assert.match(ok, /<h2>Lot sizes that sold<\/h2>/);
    assert.match(ok, /<td><b>2,000<\/b><\/td>.*Bigger <span class="tg q">over 2,000<\/span>/s);
    assert.doesNotMatch(ok, /Up to 100|Over 1,000/);
    // Points made at far over today's price: every sale is a loss, and the panel says how much.
    input.book = [...input.book, { id: 'mDear', t: NOW - 1000, kind: 'made', points: 5000, each: 40000, set: 'plushie', src: 'log' }];
    const d = desk(input);
    const ev = d.view.points.even;
    assert.ok(ev.each > ev.now && ev.loss > 0);
    const bad = page(d, 'points');
    assert.match(bad, /<span class="badge bad">under your cost<\/span>/);
    assert.ok(bad.includes(`<td class="n t-bad"><b style="color:inherit">-$${ev.loss.toLocaleString('en-US')}</b></td>`), 'what selling now loses, in dollars');
    assert.match(bad, /class="even-b"><s style="--w:/, 'the bar is red up to what they cost you');
    // The points book: your sets in money - what you spent on them, in all and a set.
    const book = page(desk(fixtureInput(NOW)), 'points', 1);
    assert.match(book, /data-k="setsmoney"/);
    assert.match(book, /You spent<\/div><div class="k-v[^"]*">\$[\d,]+<\/div><div class="k-s"><b>[\d,]+<\/b> sets · <b>\$[\d,]+<\/b> a set/);
    assert.match(book, /<h2>Sets you made<\/h2>/);
    assert.match(book, /<th>When<\/th><th>What<\/th><th class="n">Points<\/th><th class="n">They cost<\/th><th class="n">Sold at<\/th><th class="n">You got<\/th><th class="n">Profit<\/th>/);
});

test('F. Ledger: "about" where an estimate is behind the profit, today\'s worth beside the cost, pieces sold as themselves, points held before', () => {
    const input = fixtureInput(NOW);
    const plain = page(desk(input), 'ledger');
    assert.match(plain, /Not sold yet, at (about its )?cost/);
    assert.match(plain, /worth <b>\$[\d,]+<\/b> today: <b class="t-(good|bad)">[+-−]\$[\d,]+<\/b>/);
    assert.doesNotMatch(plain, /<small>about<\/small>/, 'every cost in the made-up book was seen bought');

    input.book = [...input.book.map((e) => (e.kind === 'made' ? { ...e, est: 0.4 } : e)), { id: 'sBig', t: NOW - 1000, kind: 'sold', points: 5000, each: 31000, set: null, src: 'log' }];
    input.direct = [{ id: 'log9:0', t: NOW - 2000, itemId: '258', qty: 3, got: 110000, cost: 100000, venue: 'bazaar', give: false, est: 0 }, { id: 'trade:5:out:0', t: NOW - 4000, itemId: '274', qty: 4, got: 0, cost: 140000, venue: 'trade', give: true, est: 0 }];
    const d = desk(input);
    const top = page(d, 'ledger');
    assert.match(top, /Profit, 14 days<\/div><div class="k-v[^>]*><small title="Part of the cost behind it is an estimate">about<\/small> /);
    assert.match(top, /of it <b>\+\$10,000<\/b> from pieces sold as themselves<\/div>/);
    const lots = page(d, 'ledger', 1);
    assert.match(lots, /Held before, not counted/);
    assert.match(lots, /"about": part of the cost is an estimate/);
    assert.match(lots, new RegExp('\\+ ' + d.view.ledger.before.points.toLocaleString('en-US') + ' held before: \\$[\\d,]+, not counted'));
    const direct = page(d, 'ledger', 6);
    assert.match(direct, /Pieces sold as themselves/);
    assert.match(direct, /Given away/);
    assert.match(direct, /1 piece given away|4 pieces given away/);
});

test('B5. Settings: a key that is refused never shows "working", and says in a line of its own why', () => {
    const d = desk(fixtureInput(NOW), { keys: { ...KEYS, w3b: { set: true, ok: true, error: 'TornW3B refuses this key for your Torn id: it is not the one registered there' } } });
    const html = page(d, 'settings');
    const box = html.split('data-k="key-w3b"')[1].split('data-k="')[0];
    assert.match(box, /<span class="badge bad">not working<\/span>/);
    assert.doesNotMatch(box, /badge ok/);
    assert.match(box, /TornW3B refuses this key for your Torn id: it is not the one registered there\. TornW3B is not asked with it again until you change it\./);
    const fine = page(desk(fixtureInput(NOW)), 'settings').split('data-k="key-w3b"')[1].split('data-k="')[0];
    assert.match(fine, /<span class="badge ok">working<\/span>/);
});
