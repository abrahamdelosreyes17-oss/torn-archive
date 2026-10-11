// "Buy from": a list made only from the places you chose (the owner, 2026-10-11: "i only want to buy these from
// bazaars, so i only want to make a shopping/checkout list like that"), a whole piece put on the list in one press,
// and a note of ours that never stands on a button of Torn's ("this also blocks my buttons").

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { archiveSettings, buysFrom, ARCHIVE_DEFAULTS } from '../src/core/settings.js';
import { archiveView, viewPiece } from '../src/core/view.js';
import { addAll, dropPiece, dropPlaces, onList, IM_PLACE } from '../src/core/shopping.js';
import { markBeside, boxesMeet } from '../src/sources/dom/sets-pages.js';
import { fixtureInput } from './fixture-view.js';

const NOW = Date.UTC(2026, 9, 11, 21, 0);
const sum = (xs, f) => xs.reduce((a, x) => a + f(x), 0);

test('the setting: both places on for a new install, one may be off, never both', () => {
    assert.deepEqual(ARCHIVE_DEFAULTS.from, { bazaar: true, market: true });
    assert.deepEqual(archiveSettings(null).from, { bazaar: true, market: true });
    assert.deepEqual(archiveSettings({ from: { market: false } }).from, { bazaar: true, market: false });
    assert.deepEqual(archiveSettings({ from: { bazaar: false } }).from, { bazaar: false, market: true });
    assert.deepEqual(archiveSettings({ from: { bazaar: false, market: false } }).from, { bazaar: true, market: true }, 'nowhere to buy is no list: both stay on');
    assert.deepEqual(archiveSettings({ from: 'bazaar' }).from, { bazaar: true, market: true }, 'a stored value that is not a pair is left out');
    const only = buysFrom(archiveSettings({ from: { market: false } }));
    assert.equal(only({ src: 'bazaar', whoId: 1 }), true);
    assert.equal(only({ src: 'market' }), false);
    assert.equal(buysFrom({})({ src: 'market' }), true, 'settings from before this build: everything counts');
});

/** The made-up desk with a piece whose cheapest row by far is on the Item Market. */
function desk(from) {
    const base = fixtureInput(NOW);
    const all = archiveView(base);
    const p = all.pieces.find((x) => x.need > 1 && x.offers.some((o) => o.src !== 'market' && o.ok !== false && o.price < x.worth));
    assert.ok(p, 'the made-up desk has a piece wanted and sold in a bazaar under its worth');
    const cheap = { price: Math.max(1, Math.floor(p.pay * 0.9)), qty: 5, src: 'market', at: NOW - 20000, from: 'torn' };
    const input = { ...base, settings: archiveSettings({ ...base.settings, from }), offers: (id) => (String(id) === String(p.id) ? [...base.offers(id), cheap] : base.offers(id)) };
    return { input, id: p.id, cheap };
}

test('Item Market off: no list, no "Do now", no "cheapest" is taken from it - and its rows are still shown, last', () => {
    const both = desk({ bazaar: true, market: true });
    const v0 = archiveView(both.input);
    assert.equal(viewPiece(v0, both.id).low.src, 'market', 'with both on, the Item Market row is the cheapest');
    assert.ok(v0.dash.todo.find((t) => t.kind === 'hot').first.some((s) => s.im), '"Do now" names the Item Market');

    const d = desk({ bazaar: true, market: false });
    const v = archiveView(d.input);
    const p = viewPiece(v, d.id);
    assert.deepEqual(v.buy.from, { bazaar: true, market: false });
    assert.notEqual(p.low.src, 'market', 'the cheapest named is the cheapest bazaar');
    assert.equal(p.lowAll.price, d.cheap.price, 'the price record still knows the lowest anywhere');
    assert.equal(v.tape.find((t) => String(t.id) === String(d.id)).price, d.cheap.price);
    const im = p.offers.filter((o) => o.src === 'market');
    assert.ok(im.length && im.every((o) => o.out === true), 'the Item Market rows are there, marked as left out');
    assert.ok(p.offers.filter((o) => o.ok !== false).findIndex((o) => o.out) >= p.offers.filter((o) => o.ok !== false && !o.out).length, 'and come after the rows that count');
    assert.ok(v.pieces.every((x) => x.offers.every((o) => !o.out || o.src === 'market')), 'no bazaar row is left out');
    const todo = v.dash.todo.find((t) => t.kind === 'hot' || t.kind === 'buy');
    assert.ok(!todo || todo.first.every((s) => !s.im), '"Do now" sends you to no Item Market stop');
    assert.ok(v.buy.plan.units > 0, 'the bazaars alone still make a list');
    assert.ok(v.buy.plan.units <= v0.buy.plan.units, 'and never a longer one');
    // "Under its worth in N places" counts only where you buy.
    assert.equal(p.under.places, p.offers.filter((o) => o.ok !== false && !o.out && o.price < p.worth).length);
    // The shop's verdict is about what anyone can buy and sell to you: the cheap Item Market row still counts there.
    assert.ok(v.buy.hot.some((h) => h.im && String(h.id) === String(d.id)));
});

test('Bazaars off: the list is the Item Market alone', () => {
    const d = desk({ bazaar: false, market: true });
    const v = archiveView(d.input);
    assert.ok(v.pieces.every((x) => !x.low || x.low.src === 'market'));
    assert.deepEqual(v.buy.check, [], 'no bazaar is asked of Torn for a list that uses none');
    const todo = v.dash.todo.find((t) => t.kind === 'hot' || t.kind === 'buy');
    assert.ok(todo && todo.first.every((s) => s.im));
});

test('"Add all" on one piece: every listing under its worth, cheapest first, never more than you need', () => {
    const panda = { id: 274, name: 'Panda Plushie', set: 'plushie', need: 10, worth: 35000 };
    const rows = [
        { price: 34000, qty: 6, src: 'bazaar', who: 'Bram', whoId: 11 },
        { price: 34500, qty: 3, src: 'bazaar', who: 'Wren', whoId: 22 },
        { price: 34800, qty: 20, src: 'bazaar', who: 'Ash', whoId: 33 },
        { price: 35000, qty: 50, src: 'bazaar', who: 'Dear', whoId: 44 },
    ];
    const cart = addAll([], panda, rows);
    assert.deepEqual(cart.map((l) => [l.place, l.q, l.price]), [['b:11', 6, 34000], ['b:22', 3, 34500], ['b:33', 1, 34800]]);
    assert.equal(onList(cart, 274), 10);
    assert.equal(addAll(cart, panda, rows), cart, 'nothing more is needed: the list is left as it is');
    // A line already there keeps its count; the press adds the other places for what is still missing.
    const part = [{ ...cart[1], q: 2 }];
    const more = addAll(part, panda, rows);
    assert.deepEqual(more.map((l) => [l.place, l.q]), [['b:22', 2], ['b:11', 6], ['b:33', 2]]);
    // Other pieces on the list are not touched, and taking the piece off leaves them.
    const other = { key: '263|b:22', id: 263, name: 'Crocus', place: 'b:22', im: false, who: 'Wren', whoId: 22, price: 14000, q: 2 };
    const two = addAll([other], panda, rows);
    assert.equal(onList(two, 263), 2);
    assert.deepEqual(dropPiece(two, 274), [other]);
    assert.deepEqual(addAll([], { ...panda, need: 0 }, rows), []);
    assert.deepEqual(addAll([], panda, []), []);
});

test('a place switched off leaves the list, but not a line you already took from', () => {
    const cart = [
        { key: '274|b:11', id: 274, place: 'b:11', im: false, q: 6 },
        { key: '274|' + IM_PLACE, id: 274, place: IM_PLACE, im: true, q: 3 },
        { key: '263|' + IM_PLACE, id: 263, place: IM_PLACE, im: true, q: 2 },
    ];
    const noMarket = buysFrom({ from: { bazaar: true, market: false } });
    assert.deepEqual(dropPlaces(cart, noMarket).map((l) => l.key), ['274|b:11']);
    assert.deepEqual(dropPlaces(cart, noMarket, (l) => l.id === 263).map((l) => l.key), ['274|b:11', '263|' + IM_PLACE]);
    assert.equal(dropPlaces(cart, buysFrom({})).length, 3);
});

// ---- a note beside one of Torn's controls ----------------------------------------------------------------------------

/** Stand-ins with only what markBeside asks of the page: boxes, parents, and what is shown. */
function page({ anchor, controls = [], markWidth = 280, panel = { left: 0, right: 1040, top: 0, bottom: 120 } }) {
    const box = (r) => ({ ...r, width: r.right - r.left, height: r.bottom - r.top });
    const el = (r, shown = true) => ({ getBoundingClientRect: () => box(r), getClientRects: () => (shown ? [1] : []), closest: () => null, type: '' });
    const body = {};
    const doc = { body };
    const theirs = controls.map((c) => el(c));
    const host = { ...el(panel), ownerDocument: doc, parentElement: body, querySelectorAll: () => theirs };
    const set = {};
    const mark = {
        parentElement: host, getBoundingClientRect: () => box({ left: 0, right: markWidth, top: 0, bottom: 22 }),
        style: new Proxy(set, { get: (t, k) => (k === 'removeProperty' ? (name) => { delete t[name]; } : t[k] || ''), set: (t, k, v) => { t[k] = v; return true; } }),
    };
    return { mark, anchor: el(anchor.box, anchor.shown !== false), set };
}

test('the note sits right of Torn\'s button when nothing of Torn\'s is there', () => {
    const p = page({ anchor: { box: { left: 500, right: 620, top: 60, bottom: 90 } } });
    assert.equal(markBeside(p.mark, p.anchor), true);
    assert.equal(p.set.left, '632px');
    assert.equal(p.set.top, '75px');
    assert.ok(!p.set.visibility);
});

test('Torn swapped its form for "Are you sure ...? Yes / No": the note is not shown, wherever it stood', () => {
    const p = page({ anchor: { box: { left: 0, right: 0, top: 0, bottom: 0 }, shown: false } });
    p.set.left = '632px';
    p.set.top = '75px';
    assert.equal(markBeside(p.mark, p.anchor), false);
    assert.equal(p.set.visibility, 'hidden');
});

test('a button of Torn\'s where the note would stand: it goes under, and with one there too it is not shown', () => {
    const anchor = { box: { left: 500, right: 620, top: 60, bottom: 90 } };
    const yes = { left: 640, right: 680, top: 64, bottom: 86 };
    const under = page({ anchor, controls: [yes] });
    assert.equal(markBeside(under.mark, under.anchor), true);
    assert.equal(under.set.top, '104px', 'under the button: its middle line 14 below it');
    assert.equal(under.set.left, '500px');
    const none = page({ anchor, controls: [yes, { left: 520, right: 600, top: 96, bottom: 116 }] });
    assert.equal(markBeside(none.mark, none.anchor), false);
    assert.equal(none.set.visibility, 'hidden');
    // Shown again as soon as there is room: a hidden note is not hidden for good.
    none.mark.parentElement.querySelectorAll = () => [];
    assert.equal(markBeside(none.mark, none.anchor), true);
    assert.ok(!none.set.visibility);
});

test('touching counts: a note a hair from a button is on it', () => {
    assert.equal(boxesMeet({ left: 0, right: 100, top: 0, bottom: 20 }, { left: 102, right: 140, top: 0, bottom: 20 }), true);
    assert.equal(boxesMeet({ left: 0, right: 100, top: 0, bottom: 20 }, { left: 110, right: 140, top: 0, bottom: 20 }), false);
    assert.equal(boxesMeet({ left: 0, right: 100, top: 0, bottom: 20 }, { left: 0, right: 100, top: 30, bottom: 50 }), false);
});

// ---- the Item Market is one stop with a page for each piece ----------------------------------------------------------

import { boxBazaar } from '../src/ui/box-pages.js';
import { hubPage } from '../src/ui/hub-pages.js';
import { stopsOf, runStart } from '../src/core/shopping.js';

/** A run standing on the Item Market, three pieces of the list there (and a bazaar stop before it when `baz`). */
function imRun({ took = {}, baz = false } = {}) {
    const base = fixtureInput(NOW);
    const v0 = archiveView(base);
    const three = v0.pieces.filter((p) => p.need > 3 && p.worth > 100).slice(0, 3);
    assert.equal(three.length, 3);
    const line = (p, place, who) => ({ key: p.id + '|' + place, id: p.id, name: p.name, set: p.set, place, im: place === IM_PLACE, who: who || null, whoId: who ? 77 : null, price: p.worth - 10, q: 2 });
    const cart = [...(baz ? [line(three[0], 'b:77', 'Wren')] : []), ...three.map((p) => line(p, IM_PLACE))];
    const stops = stopsOf(cart, (id) => viewPiece(v0, id).worth);
    const run = { ...runStart(stops), took };
    if (baz) { run.at = 1; run.place = IM_PLACE; }
    return { v: archiveView({ ...base, cart, run }), three, cart };
}

test('bazaars are walked first, the Item Market last', () => {
    const { v } = imRun({ baz: true });
    assert.deepEqual(v.buy.run.stops.map((s) => s.im), [false, true]);
    assert.equal(v.buy.run.stops[1].state, 'cur');
});

test('on the Item Market, Next opens the next piece of your list - and leaves only after the last', () => {
    const { v, three } = imRun();
    const card = (p) => ({ itemId: p.id, price: p.worth - 10, qty: 5, typed: 0, hasBox: false });
    const first = boxBazaar(v, [card(three[0])], IM_PLACE, { itemId: String(three[0].id) });
    assert.deepEqual(first.imNext, { id: three[1].id, name: three[1].name });
    assert.ok(first.html.includes(`Next: ${three[1].name} ×2, its Item Market page`), 'the button names the piece and how many');
    assert.ok(!first.html.includes('Done: back to the list'));
    const second = boxBazaar(v, [card(three[1])], IM_PLACE, { itemId: String(three[1].id) });
    assert.equal(second.imNext.id, three[2].id);
    const last = boxBazaar(v, [card(three[2])], IM_PLACE, { itemId: String(three[2].id) });
    assert.equal(last.imNext, null);
    assert.ok(last.html.includes('Done: back to the list'));
    // A page that has drawn no listing yet (or has none left): the address still says which piece it is.
    const empty = boxBazaar(v, [], IM_PLACE, { itemId: String(three[1].id) });
    assert.equal(empty.imNext.id, three[2].id);
    // The Item Market's front page: the first piece of the list.
    assert.equal(boxBazaar(v, [], IM_PLACE, {}).imNext.id, three[0].id);
});

test('a piece already bought on the Item Market is not opened again; without a run Next names no piece', () => {
    const one = imRun();
    const took = { [one.three[1].id + '|' + IM_PLACE]: 2 };
    const { v, three } = imRun({ took });
    const out = boxBazaar(v, [{ itemId: three[0].id, price: three[0].worth - 10, qty: 5, typed: 0, hasBox: false }], IM_PLACE, { itemId: String(three[0].id) });
    assert.equal(out.imNext.id, three[2].id, 'the second piece was taken whole: Next goes to the third');
    const base = fixtureInput(NOW);
    const idle = archiveView({ ...base, cart: one.cart, run: null });
    assert.equal(boxBazaar(idle, [], IM_PLACE, { itemId: String(three[0].id) }).imNext, null);
    // A bazaar's box never names an Item Market piece.
    const b = imRun({ baz: true });
    assert.equal(boxBazaar(b.v, [], 'b:77', {}).imNext, null);
});

test('the hub\'s run bar on the Item Market stop: Next is a link to the next piece\'s page, then Done', () => {
    const { v, three } = imRun();
    const ui = { page: 'buy', pane: 2, sel: null, trade: null, range: { pts: 40, pts2: 40 }, unit: 'day', imKey: '' };
    const html = hubPage({ view: v }, ui);
    assert.ok(html.includes(`data-act="im-walk" data-v="${three[1].id}|${IM_PLACE}"`), 'the first piece was opened by the press that came here: Next is the second');
    assert.ok(html.includes('itemID=' + three[1].id));
    const third = hubPage({ view: v }, { ...ui, imKey: three[1].id + '|' + IM_PLACE });
    assert.ok(third.includes(`data-act="im-walk" data-v="${three[2].id}|${IM_PLACE}"`));
    const end = hubPage({ view: v }, { ...ui, imKey: three[2].id + '|' + IM_PLACE });
    assert.ok(!end.includes('data-act="im-walk"') && end.includes('Done: back to the list'));
});
