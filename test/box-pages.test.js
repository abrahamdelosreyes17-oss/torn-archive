import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveView, viewForTabs, viewPiece } from '../src/core/view.js';
import { fillPlan, stopsOf, runStart, IM_PLACE } from '../src/core/shopping.js';
import { threadCheck } from '../src/core/sets.js';
import { boxWaiting, boxBazaar, boxStock, boxTrade, boxMuseum, boxPoints, boxForum, tradeMoney, vaultMoney, vaultDeposit, boxVault } from '../src/ui/box-pages.js';
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
    assert.ok(out.marks.every((m) => m.state === 'top' && /^buy \d[\d,]* here · on your list/.test(m.text)));
    for (const [i, l] of stop.lines.entries()) assert.ok(out.html.includes(`data-act="fill-card" data-v="${i}" data-n="${l.q}"`), 'Fill types the number of the line itself');
    assert.ok(out.html.includes('data-act="run-next"') && out.html.includes('data-act="run-stop"'));
    assert.ok(!out.html.includes('Next stop</span>'), 'the next stop is named once, on its button');
    // More typed than the line: the mark says so.
    const over = boxBazaar(v, [{ ...cards[0], typed: stop.lines[0].q + 5 }], stop.place);
    assert.equal(over.marks[0].state, 'over');
    // No box on the card yet: no Fill button that could do nothing.
    assert.ok(!boxBazaar(v, [{ ...cards[0], hasBox: false }], stop.place).html.includes('fill-card'));
    // Not a set piece anywhere on the page, at a bazaar that is not on the list: no box at all - unless a run is
    // on (1.3.0: the way on is offered wherever you stand), and then nothing of the page is marked.
    assert.equal(boxBazaar(shared(fixtureInput(NOW)), [cards[cards.length - 1]], 'b:424242'), null);
    const off = boxBazaar(v, [cards[cards.length - 1]], 'b:424242');
    assert.ok(off.html.includes('data-act="run-go"') && off.marks.length === 0 && off.fill.length === 0);
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

test('a run is on and this bazaar is not on your list: back to the run\'s stop, or on past it', () => {
    const v = withRun();
    const p = v.pieces.find((x) => x.need > 0);
    const out = boxBazaar(v, [{ itemId: p.id, price: Math.round(p.worth * 1.2), qty: 3, typed: 0, hasBox: false }], 'b:424242');
    const stops = v.buy.run.stops;
    const cur = stops.findIndex((s) => s.state === 'cur');
    // The purple button is the way back; "i didnt follow the list, it still wouldnt let me go to next bazaar":
    // a plain one beside it goes on past that stop, and names where to.
    assert.match(out.html, /class="btn sm go" data-act="run-go"[^>]*>Your stop: /);
    assert.match(out.html, new RegExp('class="btn sm " data-act="run-next"[^>]*>Skip it: on to ' + (stops[cur + 1].im ? 'the Item Market' : stops[cur + 1].who)));
    assert.ok(out.html.includes('data-act="run-stop"'));
});

test('a run is on and this bazaar is on your list but not the stop the run is on: Next goes on from here', () => {
    const v = withRun();
    const stops = v.buy.run.stops;
    const at = stops.findIndex((s, i) => s.state !== 'cur' && !s.im && i < stops.length - 1);
    assert.ok(at > 0, 'the made-up list has a later bazaar with a stop after it');
    const stop = stops[at];
    const out = boxBazaar(v, stop.lines.map((l) => ({ itemId: l.id, price: l.price, qty: l.q, typed: 0, hasBox: true })), stop.place);
    assert.ok(out.html.includes(`stop ${at + 1} of ${stops.length}`));
    assert.ok(!out.html.includes('data-act="run-go"'), 'no "back to your stop": you are at a stop of the list');
    assert.match(out.html, new RegExp('data-act="run-next"[^>]*>Next' + (stops[at + 1].im ? ': the Item Market' : ' bazaar: ' + stops[at + 1].who)));
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
    assert.equal((out.html.match(/Everything in it/g) || []).length, 1);
    assert.ok(!/fee/.test(out.html), 'the points market takes no fee: none is spoken of');
    assert.ok(!out.html.includes('fill-money'));
    assert.ok(out.html.includes('data-act="copy"'));
    const pay = boxTrade(v, t, rows, 'addmoney', true);
    if (t.total > t.myMoney) assert.ok(pay.html.includes(`data-act="fill-money" data-v="${t.total}"`));
    assert.ok(/press Torn's <b>Change<\/b>, once\. Fill here only types\. <b>You press Accept\.<\/b>/.test(pay.html));
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

test('the points market as you type: a hairline where your listing would sit, the ones above which a price is cheap or a loss, and the words beside ADD LISTING', () => {
    const base = shared(fixtureInput(NOW));
    const rows = [[405, 30893], [1111, 30895], [4000, 30898], [21, 31000], [100, 31119]].map(([points, each]) => ({ points, each }));
    const at = (points) => ({ ...base, points: { ...base.points, hold: false, cheap: false, level: { lo: 31000, hi: 31750, days: 30 }, ...points } });
    const made = at({ sell: { ...base.points.sell, points: 120, least: 29956, loss: false } });
    // Nothing typed yet: the least price beside the button, and the line of the usual level in the list.
    const idle = boxPoints(made, true, { typed: { amount: 0, price: 0 }, rows });
    assert.deepEqual(idle.note, { text: 'Your least price: $29,956', state: '' });
    assert.deepEqual(idle.marks, [{ i: 3, state: 'ahead' }]);
    assert.ok(!idle.html.includes('What you typed'));
    assert.match(idle.html, /In Torn's list: the <b style="color:#f6b74a">amber line<\/b> has the prices under the usual \$31,000 to \$31,750 above it\./);
    // $1 under the lowest: first in the list - a line on the first row, with no words on it.
    const first = boxPoints(made, true, { typed: { amount: 50, price: 30892 }, rows });
    assert.deepEqual(first.note, { text: 'First in the list · under the usual $31,000 to $31,750', state: 'ahead' });
    assert.deepEqual(first.marks.find((m) => m.i === 0), { i: 0, state: '' });
    assert.match(first.html, /the <b style="color:#5aa7ff">blue line<\/b> is where yours would sit; the <b style="color:#f6b74a">amber line<\/b>/);
    assert.ok(first.html.includes('What you typed') && first.html.includes('50 at $30,892') && first.html.includes('none: first in the list'));
    // Over the level, behind others.
    const good = boxPoints(made, true, { typed: { amount: 50, price: 31100 }, rows });
    assert.deepEqual(good.note, { text: '5,537 points sell first · +$1,145 a point over cost', state: 'good' });
    assert.deepEqual(good.marks.find((m) => m.i === 4), { i: 4, state: '' });
    // Under your least price: a loss, said in red, with what it costs on the lot.
    const loss = boxPoints(made, true, { typed: { amount: 120, price: 29900 }, rows });
    assert.deepEqual(loss.note, { text: 'First in the list · a loss of $55 a point', state: 'bad' });
    assert.ok(loss.html.includes('<b>A loss.</b> $29,900 is under your least price $29,956: $6,600 on these 120.'));
    // A slip of the finger.
    const slip = boxPoints(at({ sell: { ...base.points.sell, points: 0, least: 0 } }), true, { typed: { amount: 50, price: 3089 }, rows });
    assert.equal(slip.note.state, 'ahead');
    assert.match(slip.note.text, /^First in the list · \$27,803 under the lowest: \$1 under is enough$/);
    assert.ok(slip.html.includes('$1,390,150 given away on these 50'));
    // The market fell under your cost: the red line is in the list, and where it meets yours the two are one mark.
    const fell = boxPoints(at({ level: {}, sell: { ...base.points.sell, points: 120, least: 30897, loss: true } }), true, { typed: { amount: 120, price: 30896 }, rows });
    assert.deepEqual(fell.marks, [{ i: 2, state: 'bad' }]);
    assert.match(fell.html, /the <b style="color:#ff7878">red line<\/b> is where yours would sit, and has the prices that are a loss \(under your \$30,897\) above it\./);
    // No cost on record (points held before): nothing is called a loss, and the box says why.
    const before = boxPoints(at({ before: 1183, sell: { ...base.points.sell, points: 0, least: 0 } }), true, { typed: { amount: 50, price: 31050 }, rows });
    assert.deepEqual(before.note, { text: '5,537 points sell first', state: '' });
    assert.ok(before.html.includes('have no cost on record'));
    // The page's list could not be read: no line, and the hub's own read of the market says what sells first.
    const blind = boxPoints(made, true, { typed: { amount: 50, price: 31100 }, rows: [] });
    assert.deepEqual(blind.marks, []);
    assert.ok(blind.note && blind.note.text.includes('over cost'));
    // The boxes were not found: as before, and nothing is drawn.
    assert.deepEqual([boxPoints(made, false).marks, boxPoints(made, false).note], [[], { text: 'Your least price: $29,956', state: '' }]);
});

test('the points market: full sets not swapped yet are named as the bigger lot they would make', () => {
    const v = shared(fixtureInput(NOW));
    const sets = v.sets.map((s, i) => ({ ...s, full: i === 0 ? 3 : 0 }));
    const made = { ...v, sets, points: { ...v.points, sell: { ...v.points.sell, points: 120, least: 29956, loss: false } } };
    const more = 120 + 3 * sets[0].points;
    assert.ok(boxPoints(made, true).html.includes(`Or wait for a bigger lot</span><b class="num">${more.toLocaleString('en-US')} with your 3 full sets</b>`));
    assert.ok(!boxPoints({ ...made, sets: sets.map((s) => ({ ...s, full: 0 })) }, true).html.includes('bigger lot'));
});

test('your stock on its own: each piece and what you hold now, a buy seen here counted in, red when more is typed than you need', () => {
    const v = shared(fixtureInput(NOW));
    const set = v.sets[0];
    const p = set.pieces.find((x) => x.need > 0);
    assert.ok(p, 'a piece that is needed');
    const plain = boxStock(v, {});
    assert.deepEqual(plain.over, []);
    assert.match(plain.head, /^[\d,]+ to go$/);
    assert.ok(plain.html.includes(`<span class="x">need ${p.need.toLocaleString('en-US')}</span>`));
    for (const s of v.sets) assert.ok(plain.html.includes(`${s.label} sets`));
    // A buy seen here a moment ago: the count moves at once, and what is needed falls with it.
    const bought = boxStock(v, { pend: { [p.id]: 1 } });
    assert.ok(bought.html.includes(`<b class="num">${(p.held + 1).toLocaleString('en-US')}</b>`));
    assert.ok(p.need === 1 ? !bought.html.includes(`need ${p.need}<`) : bought.html.includes(`<span class="x">need ${(p.need - 1).toLocaleString('en-US')}</span>`));
    // Typing what you need: said, not red. One more: red, in the row and at the top.
    const fine = boxStock(v, { typed: { [p.id]: p.need }, here: [p.id] });
    assert.deepEqual(fine.over, []);
    assert.ok(fine.html.includes(`typing ${p.need.toLocaleString('en-US')} of ${p.need.toLocaleString('en-US')}`) && fine.html.includes('st-r need here'));
    const over = boxStock(v, { typed: { [p.id]: p.need + 7 }, here: [p.id] });
    assert.deepEqual(over.over, [{ id: String(p.id), name: p.name, typed: p.need + 7, need: p.need }]);
    assert.equal(over.head, 'more than you need');
    assert.ok(over.html.includes('st-r over here') && over.html.includes('7 too many') && over.html.startsWith('<div class="ta-hold st-over"><b>More than you need.</b>'));
    // A piece you have enough of, and a Buy box opened on it (Torn puts 1 in it): one too many.
    const full = set.pieces.find((x) => x.need === 0);
    if (full) assert.equal(boxStock(v, { typed: { [full.id]: 1 } }).over.length, 1);
});

test('a listing says what to take from this bazaar, not the whole of what you need', () => {
    const v = shared(fixtureInput(NOW));
    const p = v.pieces.find((x) => x.need > 3 && x.worth > 100);
    assert.ok(p);
    // Not on a list, under its worth, and the listing holds only 3.
    const few = boxBazaar(v, [{ itemId: p.id, price: p.worth - 50, qty: 3, typed: 0, hasBox: false }], 'b:999999');
    assert.equal(few.marks[0].text, 'buy 3 here · all it has');
    const many = boxBazaar(v, [{ itemId: p.id, price: p.worth - 50, qty: p.need + 50, typed: 0, hasBox: false }], 'b:999999');
    assert.equal(many.marks[0].text, `buy ${p.need.toLocaleString('en-US')} here`);
    const dear = boxBazaar(v, [{ itemId: p.id, price: p.worth + 50, qty: 3, typed: 0, hasBox: false }], 'b:999999');
    assert.equal(dear.marks[0].text, 'none here · over its worth');
});

test('the Item Market\'s page: each price row under the worth gets its own part of what you need, cheapest first; a card that does not say its stock gets no number', () => {
    const v = shared(fixtureInput(NOW));
    const p = v.pieces.find((x) => x.need > 6 && x.worth > 100);
    assert.ok(p);
    const card = (price, qty) => ({ itemId: p.id, price, qty, typed: 0, hasBox: false });
    const b = boxBazaar(v, [card(p.worth - 90, 2), card(p.worth - 50, 3), card(p.worth - 10, p.need + 40), card(p.worth + 10, 9)], IM_PLACE);
    assert.deepEqual(b.marks.map((m) => m.text), [
        'buy 2 here · all it has', 'buy 3 here · all it has', `buy ${(p.need - 5).toLocaleString('en-US')} here`,
    ], 'the row over the worth is not marked at all');
    assert.deepEqual(b.fill, [{ i: 0, n: 2 }, { i: 1, n: 3 }, { i: 2, n: p.need - 5 }]);
    assert.equal(b.fill.reduce((s, f) => s + f.n, 0), p.need, 'together what you need, and no more');
    // Enough further up the page: a later row is not asked for.
    const full = boxBazaar(v, [card(p.worth - 90, p.need + 5), card(p.worth - 50, 30)], IM_PLACE);
    assert.deepEqual(full.marks.map((m) => m.text), [`buy ${p.need.toLocaleString('en-US')} here`, 'no more needed from this row']);
    assert.deepEqual(full.fill, [{ i: 0, n: p.need }]);
    // The category view: a price, no stock. No number is made up for it.
    const blind = boxBazaar(v, [card(p.worth - 90, 0)], IM_PLACE);
    assert.deepEqual(blind.marks.map((m) => m.text), ['under its worth · open it for the stock']);
    assert.deepEqual(blind.fill, []);
});

/// 1.3.7 - the total where you pay it (the owner, 2026-10-12: "it shows how much each is, but just doesnt show the
// total ... fill here how much i need? and red if i dont have enough? and when i go to property to withdraw my
// vault, fill how much i need to withdraw?" - and then: "click it it fills and withdraws ... a button that
// automaticalyl deposits all with 1 button").
test('a trade\'s money on Torn\'s own lines: the total on your money row, Add beside Add Money, red when you are short', () => {
    const t = { total: 7021632, needTotal: 5279012, myMoney: 0, units: 206 };
    // Enough on you: the total, both buttons, said green.
    const rich = tradeMoney(t, true, 9271480);
    assert.deepEqual(rich.mark, { text: 'Total $7,021,632 · add $7,021,632', state: 'top' });
    assert.deepEqual(rich.fill.buttons, [{ label: 'Add $7,021,632', amount: 7021632 }, { label: 'Add only what I need: $5,279,012', amount: 5279012 }]);
    assert.deepEqual([rich.fill.state, rich.fill.vault], ['good', false]);
    // Nothing on you: red on the row and beside the box, with what is short and the way to your vault.
    const poor = tradeMoney(t, true, 0);
    assert.deepEqual(poor.mark, { text: 'Add $7,021,632 · only $0 on you', state: 'over' });
    assert.equal(poor.fill.state, 'over');
    assert.ok(poor.fill.note.includes('$7,021,632 short') && poor.fill.note.includes('$5,279,012 short of only what you need'));
    assert.equal(poor.fill.vault, true);
    assert.equal(poor.fill.buttons.length, 2, 'the button still types the number: Torn says no, not Torn Archive');
    // Enough for what you need, not for everything.
    const some = tradeMoney(t, true, 6000000);
    assert.deepEqual([some.mark.state, some.fill.state, some.fill.vault], ['top', 'over', true]);
    assert.ok(some.fill.note.includes('enough for what you need, $1,021,632 short of everything'));
    // Paid: no button, and the row says so. Paid only what you need: said, the rest still offered.
    const paid = tradeMoney({ ...t, myMoney: 7021632 }, true, 0);
    assert.deepEqual([paid.mark.text, paid.mark.state, paid.fill.buttons.length, paid.fill.state], ['Total $7,021,632 · paid ✓', 'good', 0, 'good']);
    const part = tradeMoney({ ...t, myMoney: 5279012 }, true, 2000000);
    assert.equal(part.mark.state, 'good');
    assert.deepEqual(part.fill.buttons, [{ label: 'Add $7,021,632', amount: 7021632 }]);
    // What is on you not known: the numbers, no judgement. Every piece needed: one button.
    assert.equal(tradeMoney(t, true, null).fill.state, '');
    assert.equal(tradeMoney({ ...t, needTotal: t.total }, true, 9e6).fill.buttons.length, 1);
    // Changed since it was read, not read, or nothing priced: no number of the trade as it was.
    const changed = tradeMoney(t, false, 9e6);
    assert.equal(changed.fill.buttons.length, 0);
    assert.ok(!/\$/.test(changed.mark.text + changed.fill.note));
    assert.deepEqual(tradeMoney(null, true, 5), { mark: null, fill: null });
    assert.deepEqual(tradeMoney({ total: 0, needTotal: 0, myMoney: 0 }, true, 5), { mark: null, fill: null });
});

test('your vault: exactly what to take out for your trades, your list, or both; everything on you back in one press', () => {
    const view = (open, cost = 0, top = {}) => ({ trades: { open }, buy: { cost }, top: { onHand: null, vault: null, ...top } });
    const a = { total: 7021632, needTotal: 5279012, myMoney: 0 };
    const b = { total: 1000000, needTotal: 1000000, myMoney: 400000 };
    // Trades alone: what they still want, less what is on you.
    const m = vaultMoney(view([a, b]), 500000, 90000000);
    assert.deepEqual(m.buttons, [{ label: 'Withdraw $7,121,632 · your trades', amount: 7121632 }, { label: 'Withdraw $5,379,012 · only what I need', amount: 5379012 }]);
    assert.deepEqual([m.all, m.need, m.n, m.list, m.state], [7621632, 5879012, 2, 0, '']);
    assert.ok(m.note.startsWith('2 open trades want $7,621,632 more from you · $500,000 on you'));
    // A shopping list alone, and both together: each its own exact sum, and one for both.
    assert.deepEqual(vaultMoney(view([], 2300000), 300000, 9e7).buttons, [{ label: 'Withdraw $2,000,000 · your list', amount: 2000000 }]);
    const both = vaultMoney(view([b], 2300000), 100000, 9e7);
    assert.deepEqual(both.buttons, [{ label: 'Withdraw $500,000 · your trade', amount: 500000 }, { label: 'Withdraw $2,200,000 · your list', amount: 2200000 }, { label: 'Withdraw $2,800,000 · both', amount: 2800000 }]);
    assert.ok(both.note.startsWith('1 open trade wants $600,000 more from you · your list costs $2,300,000 · $100,000 on you'));
    // Enough on you for a part: no button for that part, the rest still to take out.
    assert.deepEqual(vaultMoney(view([b], 2300000), 700000, 9e7).buttons.map((x) => x.label), ['Withdraw $1,600,000 · your list', 'Withdraw $2,200,000 · both']);
    // Enough for everything: said, no button. The vault short: red, and no button for more than it holds.
    const fine = vaultMoney(view([b]), 600000, 5);
    assert.deepEqual([fine.buttons.length, fine.state], [0, 'good']);
    const low = vaultMoney(view([a]), 0, 6000000);
    assert.equal(low.state, 'over');
    assert.deepEqual(low.buttons.map((x) => x.amount), [5279012]);
    assert.ok(low.note.includes('Your vault holds $6,000,000: $1,021,632 short'));
    // The page's own numbers first; without them, the hub's last read.
    assert.deepEqual(vaultMoney(view([b], 0, { onHand: 100000 })).buttons, [{ label: 'Withdraw $500,000 · your trade', amount: 500000 }]);
    // Nothing wants money: nothing at all, and no box.
    assert.equal(vaultMoney(view([{ ...b, myMoney: 1000000 }]), 0, 0), null);
    assert.equal(vaultMoney(view([]), 0, 0), null);
    assert.equal(boxVault(view([]), null), null);
    const box = boxVault(view([b], 2300000), both);
    assert.equal(box.where, 'your vault');
    assert.ok(box.html.includes('$600,000') && box.html.includes('$2,300,000') && /presses Torn's own/.test(box.html));
    // Deposit: all of it, one button; nothing on you, no button.
    assert.deepEqual(vaultDeposit(500000), { buttons: [{ label: 'Deposit all $500,000', amount: 500000 }] });
    assert.equal(vaultDeposit(0), null);
    assert.equal(vaultDeposit(null), null);
});
