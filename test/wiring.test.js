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

// ---- 1.3.0 ------------------------------------------------------------------------------------------------------------

const between = (text, from, to) => { const at = text.indexOf(from); assert.ok(at >= 0, 'not found: ' + from); return text.slice(at, text.indexOf(to, at + from.length)); };

test('every button a hub page draws is one the hub answers', () => {
    const pages = read('../src/ui/hub-pages.js');
    const hub = read('../src/ui/hub.js');
    const drawn = new Set([...pages.matchAll(/data-act="([a-z-]+)"/g)].map((m) => m[1]));
    assert.ok(drawn.has('read-stock') && drawn.has('make-list') && drawn.size > 20, 'the pages\' buttons were found: ' + drawn.size);
    const press = between(hub, 'function press(el, e) {', '\n    }\n');
    assert.deepEqual([...drawn].filter((a) => !press.includes(`a === '${a}'`)), [], 'drawn on a page, answered by nothing');
});

test('every button the box draws on a Torn page is one the Torn tab answers', () => {
    const box = read('../src/ui/box-pages.js');
    const page = read('../src/ui/torn-page.js');
    const drawn = new Set([...box.matchAll(/data-act="([a-z-]+)"/g), ...box.matchAll(/bxBtn\('([a-z-]+)'/g), ...page.matchAll(/data-act="([a-z-]+)"/g)].map((m) => m[1]));
    for (const a of ['run-start', 'run-next', 'run-stop', 'run-go', 'gone', 'hub', 'fill-all', 'fill-card', 'stock-read']) assert.ok(drawn.has(a), 'the box draws ' + a);
    const press = between(page, '    function press(btn) {', '\n    root.addEventListener(');
    assert.deepEqual([...drawn].filter((a) => !press.includes(`act === '${a}'`)), [], 'drawn in the box, answered by nothing');
});

test('every press the app hands to the engine is one the engine knows, and every note it passes on is one the engine takes', () => {
    const main = read('../src/main.js');
    const engine = read('../src/engine/engine.js');
    const acts = between(engine, '    const actions = {', '\n    };');
    const known = new Set([...acts.matchAll(/^ {8}([A-Za-z0-9]+)\s*[:(,]/gm)].map((m) => m[1]));
    const sent = new Set([...main.matchAll(/engine\.act\('([A-Za-z0-9]+)'/g)].map((m) => m[1]));
    assert.ok(sent.has('run') && sent.has('readStock') && sent.has('look'), 'the app\'s presses were found: ' + [...sent].join(', '));
    assert.deepEqual([...sent].filter((n) => !known.has(n)), [], 'handed to the engine, known to nothing');

    // The kinds main.js passes straight to engine.note, on the one line that does it.
    const line = main.split('\n').find((l) => l.includes('engine.note(n.kind, n.what)'));
    assert.ok(line, 'main.js passes notes on to the engine');
    const kinds = [...line.matchAll(/n\.kind === '([a-z]+)'/g)].map((m) => m[1]);
    assert.ok(kinds.includes('press') && kinds.includes('shop') && kinds.includes('buy'), 'kinds passed on: ' + kinds.join(', '));
    const note = between(engine, '    function note(kind, what) {', '\n    return {');
    assert.deepEqual([...new Set(kinds)].filter((k) => !note.includes(`kind === '${k}'`)), [], 'passed on, taken by nothing');
});

test('a press of Start, Next or Stop in the box: the note names the run and where you stand, the hub hands both to the engine, and the box waits for the view to name the note', () => {
    const page = read('../src/ui/torn-page.js');
    const main = read('../src/main.js');
    const engine = read('../src/engine/engine.js');
    // The Torn tab: one note, with the place when Next was pressed at a bazaar; the same press kept for the box.
    assert.match(page, /const nid = note\('act', \{ name: 'run', args: place \? \[op, place\] : \[op\] \}\);/);
    assert.match(page, /gmSet\(BOX_PRESSES_KEY, \[[^\n]*\{ nid, op, place, t \}\]/);
    assert.match(page, /gmOnChange\(BOX_PRESSES_KEY, /);
    // The hub: both arguments reach the engine, and the engine's run takes the place.
    assert.match(main, /args\.slice\(0, 2\)/);
    assert.match(main, /if \(n\.what && n\.what\.name === 'run'\) engine\.act\('run', \.\.\.args\);/);
    assert.match(engine, /^ {8}run\(op, place = null\) \{/m);
    // The hub hears a note the moment it is written, and names the notes it took in the view it shares.
    assert.match(main, /gmOnChange\(SHARED_NOTES_KEY, /);
    assert.match(main, /gmSet\(SHARED_VIEW_KEY, \{ at: t, v, notes: /);
    // The box reads the view through the presses still waiting.
    assert.match(page, /const waiting = pressesLeft\(gmGet\(BOX_PRESSES_KEY, \[\]\), new Set\(st\.shared\.notes \|\| \[\]\), t, st\.shared\.at\);/);
    assert.match(page, /const v = viewWithPresses\(st\.shared\.v, waiting\);/);
});

test('a look at a piece\'s sellers draws nothing: the hub does not draw again for a press that changes nothing on the screen', () => {
    const main = read('../src/main.js');
    const quiet = main.match(/const HUB_QUIET = new Set\(\[([^\]]*)\]\)/);
    assert.ok(quiet && /'look'/.test(quiet[1]), 'look is a quiet press');
    assert.match(read('../src/engine/engine.js'), /look\(itemId\) \{[^\n]*return false; \}/);
});

test('what a Torn tab needs of 1.3.0 rides in the view it is given: the buy taken back, the run, each piece\'s lines', () => {
    const input = fixtureInput(NOW);
    input.back = [{ id: '258', qty: 3, whoId: '11', im: false, t: NOW - 90000 }];
    const v = shared(input);
    assert.deepEqual(v.buy.back.map((b) => [String(b.id), b.qty]), [['258', 3]]);
    assert.ok(v.buy.run && Array.isArray(v.buy.run.stops));
    for (const p of v.pieces) for (const k of ['worth', 'line', 'lineS', 'need', 'held', 'target']) assert.ok(Number.isFinite(p[k]), p.name + ' has no ' + k);
});

test('"Read" on your stock, in the hub and in the box on a Torn page, both reach the engine\'s readStock', () => {
    const main = read('../src/main.js');
    assert.match(read('../src/ui/hub.js'), /a === 'read-stock'\) \{ act\('readStock'\)/);
    assert.match(between(main, '    const actions = {', '\n    };'), /^ {8}readStock\b/m);
    assert.match(read('../src/ui/torn-page.js'), /else note\('read', \{ what: 'stock' \}\);/);
    assert.match(main, /n\.kind === 'read'\) \{ engine\.act\('readStock'\);/);
});
