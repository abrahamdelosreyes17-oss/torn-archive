// What a test of one part cannot see: that the parts are joined. 1.2.2 went out with the hub's "look" press (the
// piece open on "Sold by": ask Torn itself about its bazaars) joined to nothing - the engine was tested by itself and
// worked, the hub was seen on a stand-in page with its own actions, and the app's own list of actions had no "look".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { archiveView, viewForTabs, viewPiece } from '../src/core/view.js';
import { fillPlan, fillList, stopsOf, cheapPieces } from '../src/core/shopping.js';
import { boxTrade, tradeSame, boxLate } from '../src/ui/box-pages.js';
import { pendLeft } from '../src/ui/torn-page.js';
import { fixtureInput } from './fixture-view.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const NOW = Date.UTC(2026, 9, 11, 19, 0);
const MIN = 60000;
const shared = (input) => JSON.parse(JSON.stringify(viewForTabs(archiveView(input))));

test('every press the hub sends is one the app answers', () => {
    const hub = read('../src/ui/hub.js');
    const main = read('../src/main.js');
    const sent = new Set([...hub.matchAll(/\bact\('([A-Za-z]+)'/g)].map((m) => m[1]));
    assert.ok(sent.has('look') && sent.has('makeList') && sent.size > 6, 'the hub\'s presses were found: ' + [...sent].join(', '));
    const at = main.indexOf('const actions = {');
    assert.ok(at > 0, 'main.js has its list of actions');
    const block = main.slice(at, main.indexOf('\n    };', at));
    const answered = new Set([...block.matchAll(/^ {8}(?:async )?([A-Za-z]+)\s*[:(,]/gm)].map((m) => m[1]));
    assert.deepEqual([...sent].filter((name) => !answered.has(name)), [], 'sent by the hub, answered by nothing');
});

test('every note a Torn tab writes is one the hub takes', () => {
    const page = read('../src/ui/torn-page.js');
    const main = read('../src/main.js');
    const kinds = new Set([...page.matchAll(/\bnote\('([a-z]+)'/g)].map((m) => m[1]));
    assert.ok(kinds.has('buy') && kinds.has('trade'));
    for (const k of kinds) assert.ok(main.includes(`n.kind === '${k}'`), 'main.js takes no note of kind ' + k);
});

test('"Do now: Buy N pieces" and the list its button makes are the same pieces and stops', () => {
    const base = fixtureInput(NOW);
    const v = archiveView(base);
    const todo = v.dash.todo.find((t) => t.kind === 'hot');
    assert.ok(todo, 'the made-up desk has listings under what you pay sellers');
    const cart = fillList(cheapPieces(v.pieces), base.offers);
    assert.equal(cart.reduce((s, l) => s + l.q, 0), todo.n);
    assert.equal(stopsOf(cart, (id) => viewPiece(v, id).pay).length, todo.stops);
    assert.equal(cart.reduce((s, l) => s + l.q * l.price, 0), todo.cost);
    assert.ok(cart.every((l) => l.price < viewPiece(v, l.id).pay && l.price < viewPiece(v, l.id).worth), 'each under your sellers\' price and under its worth');
    // The whole list (under the worth alone) is the longer one: the two were said as one until 1.2.3.
    assert.ok(fillPlan(v.pieces, base.offers).reduce((s, l) => s + l.q, 0) >= todo.n);
});

test('a trade on the page that is not the trade the hub read: no total, no Fill, each changed row said', () => {
    const v = shared(fixtureInput(NOW));
    const t = v.trades.open.find((x) => x.rows.filter((r) => r.state !== 'other').length > 0 && x.total > x.myMoney);
    assert.ok(t);
    const rows = t.rows.map((r) => ({ name: r.name, qty: r.qty }));
    assert.equal(tradeSame(v, t, rows).same, true);
    assert.ok(boxTrade(v, t, rows, 'addmoney', true).html.includes('data-act="fill-money"'));
    // They put ten more of the first piece in after the hub's read.
    const first = rows.findIndex((r) => t.rows.find((x) => x.name === r.name).state !== 'other');
    const more = rows.map((r, i) => (i === first ? { ...r, qty: r.qty + 10 } : r));
    assert.deepEqual([...tradeSame(v, t, more).diff], [rows[first].name.toLowerCase()]);
    const out = boxTrade(v, t, more, 'view', false);
    assert.equal(out.changed, true);
    assert.match(out.html, /This trade changed since it was read/);
    assert.ok(!out.html.includes('fill-money') && !out.html.includes('data-act="copy"') && !out.html.includes(t.total.toLocaleString('en-US')), 'the old total is not shown');
    assert.match(out.marks.find((m) => m.i === first).text, /its count changed$/);
    assert.equal(out.marks.filter((m) => /count changed/.test(m.text)).length, 1, 'the rows that did not change keep their price');
    // A pile taken out, and a set piece the hub has not read at all.
    assert.equal(tradeSame(v, t, rows.filter((r, i) => i !== first)).same, false);
    const other = v.pieces.find((p) => !t.rows.some((r) => r.name === p.name));
    const added = boxTrade(v, t, [...rows, { name: other.name, qty: 3 }], 'view', false);
    assert.equal(added.changed, true);
    assert.equal(added.marks[rows.length].text, 'not read yet');
    // The add-money step shows no rows: what this tab saw on the trade's view a moment ago stands in for them.
    assert.equal(boxTrade(v, t, [], 'addmoney', true, more).changed, true);
    assert.ok(boxTrade(v, t, [], 'addmoney', true, rows).html.includes('data-act="fill-money"'));
    assert.ok(boxTrade(v, t, [], 'addmoney', true, null).html.includes('data-act="fill-money"'), 'nothing seen to compare: as read');
    // Something that is no set piece is not compared: its name on the page may not be the hub's.
    assert.equal(tradeSame(v, t, [...rows, { name: 'Some Odd Thing', qty: 1 }]).same, true);
});

test('a buy seen in a Torn tab stays in its numbers while the hub is closed, and leaves once the hub holds it', () => {
    const t = NOW;
    const pend = [{ nid: 'a', id: '186', qty: 5, t }];
    // The hub is closed: the view this tab holds was worked out before the buy, and stays so for ten minutes.
    assert.equal(pendLeft(pend, new Set(), t - MIN).length, 1);
    // A new view that names the note: the hub counts it now.
    assert.equal(pendLeft(pend, new Set(['a']), t + 5000).length, 0);
    // A view from just after the buy that does not name it yet: still waiting.
    assert.equal(pendLeft(pend, new Set(), t + MIN).length, 1);
    // The hub is alive and three minutes on its view still does not name it: it never will.
    assert.equal(pendLeft(pend, new Set(), t + 4 * MIN).length, 0);
});

test('the hub gone quiet: a Torn tab says since when, first in its box, and says nothing while the hub answers', () => {
    // The hub shares at least once a minute; a background tab may be let run only once a minute, so two can pass.
    assert.equal(boxLate(NOW - 2 * MIN - 30000, NOW), '');
    assert.equal(boxLate(0, NOW), '', 'no view at all is another message');
    assert.match(boxLate(NOW - 4 * MIN - 30000, NOW), /The hub last answered 4 min ago/);
    // By the whole minute: the same words for the whole of a minute, so the box is not drawn again each second.
    assert.equal(boxLate(NOW - 4 * MIN - 1000, NOW), boxLate(NOW - 4 * MIN - 59000, NOW));
    // And the Torn tab puts it in front of whatever it shows from the hub.
    assert.match(read('../src/ui/torn-page.js'), /boxLate\(st\.shared\.at, now\(\)\) : ''\) \+ said\.html/);
});
