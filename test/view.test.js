import { test } from 'node:test';
import assert from 'node:assert/strict';

import { archiveView, viewForTabs, viewPiece, setLadder, setsTraded, ALL_PIECE_IDS, listPieces } from '../src/core/view.js';
import { archiveSettings, ARCHIVE_DEFAULTS, setsCtx } from '../src/core/settings.js';
import { fillPlan, fillList, runStart, stopsOf } from '../src/core/shopping.js';
import { SETS } from '../src/core/sets.js';
import { parseOwnList } from '../src/core/tw3b-list.js';
import { fixtureInput } from './fixture-view.js';

const NOW = Date.UTC(2026, 9, 10, 14, 30);

test('settings are made safe, and a new install is closed', () => {
    assert.deepEqual(archiveSettings(null), { ...ARCHIVE_DEFAULTS, which: { plushie: true, flower: true } });
    assert.equal(archiveSettings(null).open, false);
    const s = archiveSettings({ pct: 999, least: -4, readMin: 3, notify: 'shout', which: { plushie: false, flower: false }, target: 0, shareMax: 0, beforeEach: 29000.7 });
    assert.equal(s.pct, 101);
    assert.equal(s.least, 2);
    assert.equal(s.readMin, 1);
    assert.equal(s.notify, 'browser');
    assert.deepEqual(s.which, { plushie: true, flower: true }, 'both off is no shop: both stay on');
    assert.equal(s.target, 40);
    assert.equal(s.shareMax, 0, '0 = no limit');
    assert.equal(s.beforeEach, 29000);
    assert.deepEqual(setsCtx(s), { on: true, which: s.which });
    assert.equal(setsTraded(archiveSettings({ which: { flower: false } })).length, 1);
    assert.equal(ALL_PIECE_IDS.length, 24);
});

test('the k-th set costs the k-th cheapest unit of every piece', () => {
    const set = { pieces: [{ id: 1 }, { id: 2 }] };
    const offers = { 1: [{ price: 10, qty: 2 }, { price: 12, qty: 1 }], 2: [{ price: 5, qty: 1 }, { price: 7, qty: 5 }] };
    assert.deepEqual(setLadder(set, (id) => offers[id]), [15, 17, 19]);
});

test('the view of the made-up desk holds together', () => {
    const v = archiveView(fixtureInput(NOW));
    assert.equal(v.ready, true);
    assert.equal(v.sets.length, 2);
    assert.equal(v.pieces.length, 24);
    // Stock: the piece you hold least of leads, and holds the sets at its count.
    const [plush, flower] = v.sets;
    assert.equal(plush.pieces[0].short, 'Panda');
    assert.equal(plush.full, 12);
    assert.equal(flower.full, 3);
    assert.equal(v.nav.full, 15);
    assert.equal(plush.target, 40);
    assert.equal(plush.pieces[0].need, 28);
    // Points: $1 under the first wall, and cheap against its own month.
    assert.equal(v.points.price, 30899);
    assert.equal(v.points.wall, 30900);
    assert.equal(v.points.cheap, true);
    assert.equal(v.points.hold, true);
    assert.equal(v.top.points, 30899);
    // A piece's worth is what it brings less the least profit.
    const panda = viewPiece(v, 274);
    assert.equal(panda.brings, Math.floor(308990 * 34600 / plush.rate.market));
    assert.equal(panda.worth, Math.floor(308990 * 34600 / plush.rate.market / 1.02));
    assert.equal(panda.pay, 34946);
    assert.equal(panda.low.price, 34900);
    assert.ok(panda.low.price < panda.pay, 'a bazaar is cheaper than his own shop');
});

test('buying: the plan, the hot listings, and the list as stops with a margin line', () => {
    const base = fixtureInput(NOW);
    const first = archiveView(base);
    assert.ok(first.buy.plan.units > 0);
    assert.ok(first.buy.plan.units <= first.buy.plan.need);
    assert.ok(first.buy.hot.some((h) => h.id === 274 && h.q === 6));
    assert.ok(first.buy.hot.some((h) => h.id === 263));
    assert.equal(first.buy.units, 0);
    assert.ok(first.dash.todo.some((t) => t.kind === 'hot'));
    // "Do now" names those listings by seller: the same pieces and stops its line says, each under what he pays sellers.
    const todo = first.dash.todo.find((t) => t.kind === 'hot');
    assert.equal(todo.first.length, todo.stops);
    assert.equal(todo.first.reduce((s, x) => s + x.units, 0), todo.n);
    assert.equal(todo.first.reduce((s, x) => s + x.cost, 0), todo.cost);
    assert.ok(todo.first.every((x) => x.gain > 0 && x.cost > 0));
    assert.ok(first.sets.every((s) => todo.full[s.key] >= s.full && todo.full[s.key] <= first.buy.plan.full[s.key]), 'full sets after the cheap listings');
    // Make the list, as the page does.
    const cart = fillList(listPieces(first.pieces), base.offers);
    const worthOf = (id) => viewPiece(first, id).worth;
    const v = archiveView({ ...base, cart, run: runStart(stopsOf(cart, worthOf)) });
    assert.equal(v.buy.units, first.buy.plan.units);
    assert.equal(v.buy.stops.length, first.buy.plan.stops);
    // A stop keeps the least profit by itself - unless a line of it is over its piece's own share and carried by
    // the room of the set it finishes (1.3.0: such a line says so, `g`).
    assert.ok(v.buy.stops.every((s) => s.margin.units === s.units && (s.margin.ok || s.lines.some((l) => l.g === 'room' || l.g === 'stretch'))), 'every stop keeps the least profit, or says what carries it');
    assert.ok(v.buy.stops.every((s) => s.lines.every((l) => l.g !== 'no')), 'nothing on the list is a "No thanks"');
    assert.ok(v.buy.stops[v.buy.stops.length - 1].im || v.buy.stops.every((s) => !s.im), 'the Item Market comes last');
    assert.equal(v.buy.run.stops[0].state, 'cur');
    assert.ok(viewPiece(v, 274).listed > 0);
    assert.ok(v.buy.full.plushie >= first.sets[0].full);
    assert.ok(v.buy.vault > 0, 'more than is on hand');
    assert.ok(v.buy.depth && v.buy.depth.x[0] === 1);
});

test('trades: whose turn, the margin, what is not a set piece', () => {
    const v = archiveView(fixtureInput(NOW));
    const [garrett, pellam, isolde] = v.trades.open;
    assert.equal(garrett.state, 'you');
    assert.equal(pellam.state, 'them');
    assert.equal(isolde.state, 'you');
    assert.equal(v.trades.wait, 2);
    assert.equal(garrett.margin.state, 'ok');
    assert.deepEqual(garrett.margin.others, ['Xanax']);
    assert.ok(garrett.margin.held > 0, 'the kittens are ahead: their money waits');
    assert.ok(garrett.message.includes('101%'));
    assert.ok(garrett.vault > 0);
    assert.equal(v.trades.finished[0].receipt.id, 'r8000');
    assert.equal(v.nav.trades, 3);
    // The points price falls. Until 1.3.0 the same trade turned amber and the page offered the rate that mends
    // it; now that rate is what is paid by itself (core/sellrate.js): the trade keeps your least profit, its
    // message names the lower rate, and "Open your shop?" no longer says the rate is too high.
    const base = fixtureInput(NOW);
    const fell = archiveView({ ...base, listings: base.listings.map((l) => ({ ...l, cost: l.cost - 400 })) });
    assert.ok(fell.prices.sets.some((s) => s.capped && s.pct < 101 && s.pct === s.cap), 'a set is at its ceiling, under your 101%');
    assert.equal(fell.trades.open[0].margin.state, 'ok');
    assert.ok(fell.trades.open[0].total < garrett.total, 'the same trade costs less');
    assert.ok(!fell.trades.open[0].message.includes('At 101% of market value that is'));
    assert.notEqual(fell.prices.verdict.state, 'low');
});

test('points: the book at its average, the lot that leaves quickest, the mug that counts', () => {
    const v = archiveView(fixtureInput(NOW));
    assert.equal(v.points.book.left, 340);
    assert.equal(v.points.before, 1243 - 340);
    assert.ok(v.points.sell.quick, 'small lots leave quicker than one of 340');
    assert.ok(v.points.sell.quick.wait < v.points.sell.one.wait);
    assert.equal(v.points.table.length, 5);
    assert.equal(v.points.ladder[2].wall, true);
    assert.equal(v.points.chart.x.length, 40);
    assert.equal(v.ledger.mugs.counted, 612000);
    assert.equal(v.ledger.mugs.left, 2);
    assert.equal(v.ledger.sold.find((s) => s.id === 's2').mug.counted, 612000);
    assert.equal(v.ledger.sum.profit, v.ledger.sum.sold - 612000);
    assert.equal(v.ledger.cum[13], v.ledger.sum.profit);
    assert.ok(v.ledger.notSold > 0);
    assert.equal(v.ledger.days.length, 14);
    assert.equal(v.ledger.weeks.length, 12);
});

test('the ledger\'s lists: buys, where, swapped, sellers', () => {
    const v = archiveView(fixtureInput(NOW));
    assert.equal(v.ledger.buys[0].name, 'Panda Plushie');
    assert.equal(v.ledger.buys[0].who, 'Bramwell');
    assert.ok(Math.abs(v.ledger.buys[0].rate - 100.9) < 0.1);
    assert.equal(v.ledger.where.x.length, 14);
    assert.ok(v.ledger.where.trade.some((n) => n > 0));
    assert.ok(v.ledger.swapped.plushie.reduce((a, b) => a + b, 0) > 0);
    const garrett = v.ledger.sellers.find((s) => s.who === 'Garrett89');
    assert.equal(garrett.came, 'now: a trade is open');
    assert.ok(garrett.brings.length > 0);
});

test('my prices: the verdict, the thread, the TornW3B list', () => {
    const base = fixtureInput(NOW);
    const v = archiveView(base);
    assert.equal(v.prices.verdict.state, 'stay');
    assert.equal(v.prices.thread.check.state, 'match');
    assert.equal(v.prices.w3b.known, false);
    assert.ok(v.prices.cap >= 101);
    assert.equal(v.prices.chart.x.length, 11);
    const closed = archiveView({ ...base, settings: { ...base.settings, open: false }, w3b: { ...base.w3b, list: parseOwnList([{ itemID: 274, pricingType: 'fixed', pricingValue: 34946 }]) } });
    assert.equal(closed.prices.verdict.state, 'buy-first');
    assert.equal(closed.prices.thread.check.state, 'closed', 'the thread still says open');
    assert.deepEqual(closed.prices.w3b.diff.remove, [{ itemID: 274, was: 34946 }]);
    assert.equal(closed.prices.w3b.matches, false);
    assert.equal(closed.shop.open, false);
});

test('nothing read yet: the view still stands, and says it is not ready', () => {
    const v = archiveView({ now: NOW, settings: archiveSettings(null), held: () => 0, mv: () => 0, stockAt: 0 });
    assert.equal(v.ready, false);
    assert.equal(v.points.price, 0);
    assert.equal(v.prices.verdict.state, 'no-price');
    assert.equal(v.buy.depth, null);
    assert.deepEqual(v.dash.todo, []);
    assert.equal(v.top.onHand, null);
    assert.equal(v.ledger.sum.profit, 0);
});

test('the Torn tabs get the view without its long tables', () => {
    const v = viewForTabs(archiveView(fixtureInput(NOW)));
    assert.equal(v.ledger, null);
    assert.equal(v.points.book.rows.length, 0);
    assert.ok(v.pieces[0].offers.length <= 3);
    assert.ok(JSON.stringify(v).length < 120000);
    assert.equal(SETS.length, 2);
});

test('"From my cash": one purse for both sets, spent on what is not held yet, under the share of your money', () => {
    const now = Date.UTC(2026, 9, 10, 14, 30);
    const base = fixtureInput(now);
    const pay = (id) => Math.round(base.mv(id) * base.settings.pct / 100);
    const run = (money, shareMax) => {
        const i = { ...base, money: { ...base.money, ...money }, settings: archiveSettings({ ...base.settings, targetMode: 'cash', shareMax }) };
        const v = archiveView(i);
        const spend = v.pieces.reduce((s, p) => s + p.need * pay(p.id), 0);
        return { v, spend };
    };
    // Your cash is the purse when nothing caps it: what is still needed costs no more than it.
    const free = run({ onHand: 2_000_000, vault: 0 }, 0);
    assert.ok(free.spend <= 2_000_000, 'both sets together: ' + free.spend);
    assert.ok(free.v.sets.every((s) => s.target >= s.full));
    assert.ok(free.v.sets.some((s) => s.target > s.full), 'the money adds sets to what is held');
    // No money: only the sets already held, however large a pile of one piece is.
    const broke = run({ onHand: 0, vault: 0 }, 0);
    assert.equal(broke.spend, 0);
    assert.ok(broke.v.sets.every((s) => s.target === s.full));
    // The share of your money in sets and points caps the purse.
    const capped = run({ onHand: 2_000_000, vault: 0 }, 1);
    const room = Math.max(0, capped.v.share.total * 1 / 100 - capped.v.share.inSets);
    assert.ok(capped.spend <= Math.min(2_000_000, room));
    // More money never means fewer sets.
    const rich = run({ onHand: 50_000_000, vault: 0 }, 0);
    for (const s of rich.v.sets) assert.ok(s.target >= free.v.sets.find((x) => x.key === s.key).target, s.key);
    assert.ok(rich.spend <= 50_000_000);
});
