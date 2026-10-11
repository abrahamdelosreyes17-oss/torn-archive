import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveView, viewForTabs, viewPiece } from '../src/core/view.js';
import { fillPlan, stopsOf, runStart, IM_PLACE } from '../src/core/shopping.js';
import { threadCheck } from '../src/core/sets.js';
import { boxWaiting, boxBazaar, boxTrade, boxMuseum, boxPoints, boxForum } from '../src/ui/box-pages.js';
import { tornPageKind } from '../src/ui/torn-page.js';
import { fixtureInput } from './fixture-view.js';

const NOW = Date.UTC(2026, 9, 10, 12);
// What a Torn tab really gets: the view through storage (JSON), without its long tables.
const shared = (input) => JSON.parse(JSON.stringify(viewForTabs(archiveView(input))));

function withRun() {
    const input = fixtureInput(NOW);
    const v0 = archiveView(input);
    input.cart = fillPlan(v0.pieces, input.offers);
    input.run = runStart(stopsOf(input.cart, (id) => (viewPiece(v0, id) || {}).worth || 0));
    return shared(input);
}

test('which of Torn\'s pages the box knows', () => {
    assert.equal(tornPageKind('https://www.torn.com/museum.php'), 'museum');
    assert.equal(tornPageKind('https://www.torn.com/pmarket.php'), 'points');
    assert.equal(tornPageKind('https://www.torn.com/trade.php#step=view&ID=1'), 'trade');
    assert.equal(tornPageKind('https://www.torn.com/forums.php#/p=threads&f=10&t=1'), 'forum');
    assert.equal(tornPageKind('https://www.torn.com/bazaar.php?userId=5#/'), 'bazaar');
    assert.equal(tornPageKind('https://www.torn.com/page.php?sid=ItemMarket#/market/view=search&itemID=186'), 'itemmarket');
    // Your own bazaar, and every other page of Torn's: nothing of ours.
    assert.equal(tornPageKind('https://www.torn.com/bazaar.php#/add'), '');
    assert.equal(tornPageKind('https://www.torn.com/gym.php'), '');
    assert.equal(tornPageKind('https://www.torn.com/loader.php?sid=attack&user2ID=1'), '');
});

test('a bazaar on your list: its lines with Fill, the next stop on the Next button only', () => {
    const v = withRun();
    const stop = v.buy.run.stops.find((s) => !s.im);
    const cards = stop.lines.map((l) => ({ itemId: l.id, price: l.price, qty: l.q + 2, typed: 0, hasBox: true }));
    cards.push({ itemId: 206, price: 830000, qty: 1, typed: 0, hasBox: true });
    const out = boxBazaar(v, cards, stop.place);
    assert.equal(out.where, 'a bazaar');
    assert.equal(out.marks.length, stop.lines.length, 'only set pieces are marked');
    assert.ok(out.marks.every((m) => m.state === 'top' && /on your list · buy \d/.test(m.text)));
    for (const [i, l] of stop.lines.entries()) assert.ok(out.html.includes(`data-act="fill-card" data-v="${i}" data-n="${l.q}"`), 'Fill types the number of the line itself');
    assert.ok(out.html.includes('data-act="run-next"') && out.html.includes('data-act="run-stop"'));
    assert.ok(!out.html.includes('Next stop</span>'), 'the next stop is named once, on its button');
    // More typed than the line: the mark says so.
    const over = boxBazaar(v, [{ ...cards[0], typed: stop.lines[0].q + 5 }], stop.place);
    assert.equal(over.marks[0].state, 'over');
    // No box on the card yet: no Fill button that could do nothing.
    assert.ok(!boxBazaar(v, [{ ...cards[0], hasBox: false }], stop.place).html.includes('fill-card'));
    // Not a set piece anywhere on the page, at a bazaar that is not on the list: no box at all.
    assert.equal(boxBazaar(v, [cards[cards.length - 1]], 'b:424242'), null);
    assert.ok(/You press Buy\./.test(out.html));
    // The listings are ringed as Torn Trading rings one, and Fill all has every line's own number.
    assert.ok(out.marks.every((m) => m.ring === 'top'));
    assert.deepEqual(out.fill, stop.lines.map((l, i) => ({ i, n: l.q })));
    assert.ok(out.html.includes('data-act="fill-all" data-v="on"'));
    assert.equal(out.head, `${stop.lines.length} to buy here`);
});

test('a bazaar as a checklist: what you hold of each piece, a tick the moment you buy, before the hub has heard', () => {
    const v = withRun();
    const stop = v.buy.run.stops.find((s) => !s.im);
    const l = stop.lines[0];
    const p = viewPiece(v, l.id);
    const cards = stop.lines.map((x) => ({ itemId: x.id, price: x.price, qty: x.q + 2, typed: 0, hasBox: false }));
    const before = boxBazaar(v, cards, stop.place);
    assert.ok(before.html.includes(`You hold <b class="num">${p.held}</b> of ${p.target}`), 'the stock counter is on the line');
    assert.ok(before.html.includes('Open its Buy box on Torn, then Fill types the number.'));
    // Bought here a moment ago (this tab saw it; the shared view is still the old one).
    const after = boxBazaar(v, cards, stop.place, { pend: { [l.id]: l.q }, took: { [l.id]: l.q } });
    assert.ok(after.html.includes(`You hold <b class="num">${p.held + l.q}</b> of ${p.target}`), 'the counter moved at once');
    assert.equal(after.marks[0].text, `took ${l.q} ✓`);
    assert.equal(after.marks[0].ring, '', 'a line that is taken is no longer ringed');
    assert.deepEqual(after.fill.map((f) => f.i), stop.lines.slice(1).map((x, i) => i + 1), 'and Fill all leaves it alone');
    assert.ok(after.html.includes(`You took ${l.q} of ${stop.units}`));
    // Part of it: the rest is still to buy, and never more than the listing holds now.
    const part = boxBazaar(v, [{ ...cards[0], qty: 1 }, ...cards.slice(1)], stop.place, { pend: { [l.id]: 1 } });
    assert.equal(part.fill[0].n, Math.min(1, l.q - 1));
    // The hub's view has the buy (the run counted it): the same line, with nothing added on this page.
    const v2 = withRun();
    v2.buy.run.took = { [l.key]: l.q };
    v2.pieces.find((x) => String(x.id) === String(l.id)).held += l.q;
    const told = boxBazaar(v2, cards, stop.place);
    assert.equal(told.marks[0].text, `took ${l.q} ✓`);
    assert.ok(told.html.includes(`You hold <b class="num">${p.held + l.q}</b> of ${p.target}`));
});

test('Fill all: said as on, each number typed is "press Buy", and a listing not on the page is named', () => {
    const v = withRun();
    const stop = v.buy.run.stops.find((s) => !s.im);
    assert.ok(stop.lines.length > 1, 'the made-up stop has more than one line');
    const cards = stop.lines.slice(1).map((x) => ({ itemId: x.id, price: x.price, qty: x.q, typed: x.q, hasBox: true }));
    const out = boxBazaar(v, cards, stop.place, { fillAll: true });
    assert.ok(out.marks.every((m) => /typed · press Buy$/.test(m.text) && m.ring === 'top'));
    assert.ok(out.html.includes('data-act="fill-all" data-v="off"'));
    assert.ok(out.html.includes(`All ${cards.length} typed.`));
    // The first line's listing is further down the bazaar, or sold: it is on the checklist all the same.
    assert.ok(out.html.includes('1 piece on your list is not on the page as it stands.'));
    assert.ok(out.html.includes('Fill all types into each as it comes'));
    assert.equal(out.head, `${stop.lines.length} to buy here`);
    // A box not open yet under Fill all: the line says what opening it does.
    const shut = boxBazaar(v, cards.map((c) => ({ ...c, typed: 0, hasBox: false })), stop.place, { fillAll: true });
    assert.ok(shut.html.includes('is typed for you.'));
    assert.ok(shut.html.includes(`0 of ${cards.length} typed.`));
});

test('a run is on and this bazaar is not its stop: one button back to the stop, the run not moved', () => {
    const v = withRun();
    const p = v.pieces.find((x) => x.need > 0);
    const out = boxBazaar(v, [{ itemId: p.id, price: Math.round(p.worth * 1.2), qty: 3, typed: 0, hasBox: false }], 'b:424242');
    assert.ok(out.html.includes('data-act="run-go"'));
    assert.ok(!out.html.includes('data-act="run-next"'));
});

test('a bazaar off your list: only what is under its worth, and no run buttons', () => {
    const v = shared(fixtureInput(NOW));
    const p = v.pieces.find((x) => x.need > 0);
    const cheap = boxBazaar(v, [{ itemId: p.id, price: Math.round(p.worth * 0.9), qty: 3, typed: 0, hasBox: true }], 'b:424242');
    assert.ok(cheap.html.includes('Under their worth here'));
    assert.ok(cheap.html.includes(`data-n="${Math.min(3, p.need)}"`));
    assert.ok(!cheap.html.includes('run-next'));
    const dear = boxBazaar(v, [{ itemId: p.id, price: Math.round(p.worth * 1.2), qty: 3, typed: 0, hasBox: true }], 'b:424242');
    assert.ok(dear.html.includes('Nothing here is under its worth'));
    assert.equal(dear.marks[0].state, 'ok');
    // The Item Market lists one piece many times: only the listings worth taking are marked.
    const im = boxBazaar(v, [{ itemId: p.id, price: Math.round(p.worth * 0.9), qty: 1, typed: 0, hasBox: false }, { itemId: p.id, price: Math.round(p.worth * 1.3), qty: 1, typed: 0, hasBox: false }], IM_PLACE);
    assert.equal(im.where, 'the Item Market');
    assert.deepEqual(im.marks.map((m) => m.i), [0]);
});

test('a trade: each row priced, the margin said once, money typed only on the add-money step', () => {
    const v = shared(fixtureInput(NOW));
    const t = v.trades.open[0];
    const rows = t.rows.map((r) => ({ name: r.name, qty: r.qty }));
    const out = boxTrade(v, t, rows, 'view', false);
    assert.equal(out.marks.length, rows.length);
    assert.ok(out.marks.every((m) => m.where === 'right'));
    assert.equal((out.html.match(/before any fee/g) || []).length, 1);
    assert.ok(!out.html.includes('fill-money'));
    assert.ok(out.html.includes('data-act="copy"'));
    const pay = boxTrade(v, t, rows, 'addmoney', true);
    if (t.total > t.myMoney) assert.ok(pay.html.includes(`data-act="fill-money" data-v="${t.total}"`));
    assert.ok(/You press Change and Accept\./.test(pay.html));
    // A trade the hub has not read: said, and nothing priced.
    assert.ok(boxTrade(v, null, rows, 'view', false).html.includes('has not been read yet'));
    assert.equal(boxTrade(v, null, [], 'view', false), null);
});

test('the museum: full sets less what you swapped since, Fill only beside a box', () => {
    const v = shared(fixtureInput(NOW));
    const found = v.sets.map((s) => ({ set: s.key, hasBox: true }));
    const out = boxMuseum(v, found, {});
    const first = v.sets.find((s) => s.full > 0);
    assert.ok(out.html.includes(`data-act="fill-museum" data-v="${first.key}" data-n="${first.full}"`));
    const less = boxMuseum(v, found, { [first.key]: first.full });
    assert.ok(!less.html.includes(`data-v="${first.key}"`), 'nothing left to fill once they are swapped');
    assert.ok(boxMuseum(v, found.map((f) => ({ ...f, hasBox: false })), {}).html.includes('No number box was found'));
    assert.ok(/You press EXCHANGE\./.test(out.html));
});

test('the points market: the price and the lot, a hold named by the lowest listing, a loss never filled', () => {
    const v = shared(fixtureInput(NOW));
    const out = boxPoints(v, true);
    assert.ok(out.html.includes('$' + v.points.price.toLocaleString('en-US')));
    if (v.points.hold) assert.ok(out.html.includes('The lowest listing is $' + v.points.lowest.toLocaleString('en-US')));
    assert.ok(/You press ADD LISTING\./.test(out.html));
    assert.ok(boxPoints(v, false).html.includes('were not found'));
    const loss = { ...v, points: { ...v.points, sell: { ...v.points.sell, loss: true } } };
    assert.ok(!boxPoints(loss, true).html.includes('fill-points'));
    const none = { ...v, points: { ...v.points, price: 0 } };
    assert.ok(boxPoints(none, true).html.includes('has not been read yet'));
});

test('your thread: matches or not, and the words to paste', () => {
    const v = shared(fixtureInput(NOW));
    const pr = v.prices;
    const ok = boxForum(v, pr.forum.title, threadCheck(pr.forum.title, { open: pr.open, pct: pr.pct }));
    assert.equal(ok.titleMark.state, 'good');
    const old = '[CLOSED] Buying Plushies & Flowers';
    const bad = boxForum(v, old, threadCheck(old, { open: pr.open, pct: pr.pct }));
    assert.equal(bad.titleMark.state, pr.open ? 'over' : 'good');
    assert.ok(bad.html.includes('Nothing is posted or edited for you.'));
});

test('nothing shared yet, or shared long ago: said plainly', () => {
    assert.ok(boxWaiting(false).html.includes('Open the hub once'));
    assert.ok(boxWaiting(true).html.includes('would be old'));
});
