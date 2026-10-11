// "if i press refresh now or whatever in torn archive, make sure nothing is stale" (the owner, 2026-10-11), after
// "tornbids actually finds things quickly". What Torn Trading does and the Archive did not: only what was looked at
// lately counts, the page in front of you corrects the list, and a list gathers at the bazaars that hold a lot.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { engineEmpty, foldListings, foldShop, offersOf, notePage, noteSeenBuy, COUNT_MS } from '../src/engine/state.js';
import { fillPlan, fewerStops, fillList, stopsOf } from '../src/core/shopping.js';
import { archiveView, viewPiece } from '../src/core/view.js';
import { shopSeen } from '../src/ui/torn-page.js';
import { fixtureInput } from './fixture-view.js';

const MIN = 60000;
const NOW = Date.UTC(2026, 9, 11, 20, 0);
const SHEEP = 186;
const sec = (t) => Math.floor(t / 1000);

function listed(checkedAt, askedAt = NOW - 30000) {
    const S = engineEmpty();
    S.self = { id: '2000001', name: '' };
    foldListings(S, String(SHEEP), [
        { player_id: 501, player_name: 'Seller_A', price: 600, quantity: 5, last_checked: sec(checkedAt), content_updated: sec(checkedAt) },
        { player_id: 502, player_name: 'Seller_B', price: 640, quantity: 2, last_checked: sec(checkedAt), content_updated: sec(checkedAt) },
    ], askedAt);
    return S;
}
const who = (S, id, now = NOW) => offersOf(S, SHEEP, now).find((o) => String(o.whoId) === String(id)) || null;

// ---- a row counts only when it was looked at lately --------------------------------------------------------------------

test('a row looked at within five minutes counts; an older one is shown and does not; Torn\'s read makes it count again', () => {
    const S = listed(NOW - 2 * MIN);
    assert.equal(who(S, 501).ok, true);
    const later = NOW + 4 * MIN;
    assert.equal(who(S, 501, later).ok, false, 'six minutes after TornW3B\'s look: shown, not counted');
    assert.equal(who(S, 501, later).qty, 5, 'it is still shown as it was');
    foldShop(S, '501', { bazaar: [{ ID: SHEEP, price: 610, quantity: 4 }] }, later - 20000);
    assert.deepEqual([who(S, 501, later).ok, who(S, 501, later).price, who(S, 501, later).from], [true, 610, 'torn']);
    assert.equal(who(S, 502, later).ok, false, 'the bazaar Torn was not asked about still waits');
    assert.equal(COUNT_MS, 5 * MIN);
});

test('"Read now": nothing looked at before the press counts until it is looked at again', () => {
    const S = listed(NOW - 2 * MIN);
    foldShop(S, '502', { bazaar: [{ ID: SHEEP, price: 640, quantity: 2 }] }, NOW - 90000);
    assert.equal(who(S, 501).ok, true);
    assert.equal(who(S, 502).ok, true);
    // The press, as the engine sets it: a read of the last 45 seconds is the newest Torn has, anything older is not.
    S.fresh = { since: NOW - 45000 };
    assert.equal(who(S, 501).ok, false);
    assert.equal(who(S, 502).ok, false, 'Torn\'s own read of a minute and a half ago is asked again too');
    foldShop(S, '502', { bazaar: [{ ID: SHEEP, price: 640, quantity: 1 }] }, NOW + 3000);
    assert.deepEqual([who(S, 502, NOW + 5000).ok, who(S, 502, NOW + 5000).qty], [true, 1]);
    // Six minutes on the press no longer matters: the five minutes do.
    assert.equal(who(S, 502, NOW + 6 * MIN).ok, false);
});

test('the view: an unchecked row is on no list and in no "Do now"; its bazaar is named as the one to ask Torn about', () => {
    const base = fixtureInput(NOW);
    const all = archiveView(base);
    assert.ok(all.buy.plan.units > 0 && all.buy.check.length === 0 && all.buy.unsure === 0, 'the made-up desk: every row checked');
    // The same desk with every bazaar row grown old.
    const old = archiveView({ ...base, offers: (id) => base.offers(id).map((o) => (o.src === 'market' ? o : { ...o, ok: false })) });
    const im = (plan) => plan.units;
    assert.ok(old.buy.plan.units < all.buy.plan.units, 'only the Item Market\'s rows are left to count: ' + im(old.buy.plan));
    assert.ok(old.buy.hot.every((h) => h.im), 'no unchecked bazaar among "cheaper than your sellers"');
    assert.ok(old.buy.check.length > 0 && old.buy.unsure > 0, 'the bazaars a list would use are named, to be asked');
    const p = old.pieces.find((x) => x.offers.some((o) => o.ok === false) && x.offers.some((o) => o.ok !== false));
    if (p) assert.ok(p.offers.findIndex((o) => o.ok === false) > p.offers.filter((o) => o.ok !== false).length - 1, 'checked rows first, the others after them');
    for (const x of old.pieces) assert.equal(x.under.units, x.offers.filter((o) => o.ok !== false && o.price < x.worth).reduce((s, o) => s + o.qty, 0));
});

// ---- the bazaar's own page corrects the list ---------------------------------------------------------------------------

test('what a bazaar\'s page shows in your Torn tab is the newest look: its price and stock stand, a piece not on the screen says nothing', () => {
    const S = listed(NOW - 10 * MIN);
    assert.equal(who(S, 501).ok, false);
    assert.equal(notePage(S, { t: NOW - 5000, whoId: '501', items: [{ id: String(SHEEP), price: 615, qty: 3 }, { id: '206', price: 830000, qty: 1 }] }, NOW), true);
    assert.deepEqual([who(S, 501).price, who(S, 501).qty, who(S, 501).from, who(S, 501).ok], [615, 3, 'page', true]);
    assert.equal(who(S, 502).from, 'w3b', 'another bazaar is untouched');
    // The page was scrolled on: Sheep is not on the screen now. Nothing new is said about it - its look of a moment
    // ago stands, as old as it is.
    assert.equal(notePage(S, { t: NOW - 1000, whoId: '501', items: [{ id: '187', price: 900, qty: 2 }] }, NOW), true);
    assert.deepEqual([who(S, 501).qty, who(S, 501).from, who(S, 501).at], [3, 'page', NOW - 5000]);
    // Torn's read after the page wins over it; an older note is not taken over a newer one.
    notePage(S, { t: NOW - 500, whoId: '501', items: [{ id: String(SHEEP), price: 615, qty: 3 }] }, NOW);
    assert.equal(notePage(S, { t: NOW - 800, whoId: '501', items: [{ id: String(SHEEP), price: 1, qty: 9 }] }, NOW), false);
    foldShop(S, '501', { bazaar: [{ ID: SHEEP, price: 620, quantity: 2 }] }, NOW + 2000);
    assert.deepEqual([who(S, 501, NOW + 3000).qty, who(S, 501, NOW + 3000).from], [2, 'torn']);
    // A bazaar known from its page alone is a row too. Your own bazaar, and a page with no piece on it, are not.
    notePage(S, { t: NOW, whoId: '777', items: [{ id: String(SHEEP), price: 590, qty: 8 }] }, NOW);
    assert.deepEqual([who(S, 777).price, who(S, 777).from], [590, 'page']);
    assert.equal(notePage(S, { t: NOW, whoId: '2000001', items: [{ id: String(SHEEP), price: 10, qty: 99 }] }, NOW), false);
    assert.equal(notePage(S, { t: NOW, whoId: '888', items: [{ id: '206', price: 830000, qty: 1 }] }, NOW), false);
});

test('your buy and the page: the stock the page shows after the buy is not lowered again; a look from before it is', () => {
    const S = listed(NOW - 2 * MIN);
    notePage(S, { t: NOW - 20000, whoId: '501', items: [{ id: String(SHEEP), price: 600, qty: 5 }] }, NOW);
    noteSeenBuy(S, { id: SHEEP, qty: 2, whoId: '501', price: 600, t: NOW - 10000 }, NOW - 10000);
    assert.equal(who(S, 501).qty, 3, 'the page from before the buy: your two come off');
    notePage(S, { t: NOW - 10000, whoId: '501', items: [{ id: String(SHEEP), price: 600, qty: 3 }] }, NOW);
    assert.equal(who(S, 501).qty, 3, 'the page with the buy in it: three, not one');
});

test('what a Torn tab tells of a bazaar page: set pieces with a price and a stated stock, the cheaper of two listings', () => {
    const cards = [
        { itemId: SHEEP, listingPrice: 620, qty: 4 }, { itemId: SHEEP, listingPrice: 600, qty: 1 },
        { itemId: 187, listingPrice: 900, qty: 3, qtyAssumed: true }, { itemId: 206, listingPrice: 830000, qty: 2 }, { itemId: 215, listingPrice: 1, qty: 5 },
    ];
    assert.deepEqual(shopSeen(cards), [{ id: String(SHEEP), price: 600, qty: 1 }]);
    assert.deepEqual(shopSeen([]), []);
});

// ---- fewer stops ---------------------------------------------------------------------------------------------------------

test('a list gathers at the bazaars that hold a lot of what you need: a stop is dropped when the others have its pieces under their worth', () => {
    const pieces = [
        { id: 1, name: 'A', need: 5, worth: 1000 }, { id: 2, name: 'B', need: 5, worth: 1000 }, { id: 3, name: 'C', need: 2, worth: 1000 },
    ];
    const rows = {
        1: [{ price: 900, qty: 9, src: 'bazaar', whoId: 'big' }],
        2: [{ price: 910, qty: 9, src: 'bazaar', whoId: 'big' }],
        // C is a little cheaper at a bazaar that has nothing else for you.
        3: [{ price: 880, qty: 2, src: 'bazaar', whoId: 'lone' }, { price: 905, qty: 6, src: 'bazaar', whoId: 'big' }],
    };
    const of = (id) => rows[id] || [];
    const cheapest = fillPlan(pieces, of);
    assert.equal(stopsOf(cheapest, () => 1000).length, 2, 'cheapest first: two stops, one of them for two pieces');
    const list = fillList(pieces, of);
    assert.deepEqual(list.map((l) => [l.id, l.place, l.q, l.price]), [[1, 'b:big', 5, 900], [2, 'b:big', 5, 910], [3, 'b:big', 2, 905]]);
    // Not when the other bazaar is over the piece's worth, and not when it has too few.
    rows[3][1] = { price: 1000, qty: 6, src: 'bazaar', whoId: 'big' };
    assert.equal(stopsOf(fillList(pieces, of), () => 1000).length, 2);
    rows[3][1] = { price: 905, qty: 1, src: 'bazaar', whoId: 'big' };
    assert.equal(stopsOf(fillList(pieces, of), () => 1000).length, 2, 'one of the two is not enough: the stop stays, whole');
    assert.deepEqual(fillList(pieces, of).find((l) => l.id === 3).q, 2);
    // The units are the same, whatever was moved; the Item Market's line is never touched.
    rows[3] = [{ price: 880, qty: 2, src: 'market' }, { price: 905, qty: 6, src: 'bazaar', whoId: 'big' }];
    assert.deepEqual(fillList(pieces, of).map((l) => l.place), ['b:big', 'b:big', 'im']);
    assert.deepEqual(fewerStops([], pieces, of), []);
});

test('the made-up desk: the list as made has no more stops than the cheapest way, the same pieces, each under its worth', () => {
    const base = fixtureInput(NOW);
    const v = archiveView(base);
    const cheapest = fillPlan(v.pieces, base.offers);
    const list = fillList(v.pieces, base.offers);
    const units = (cart) => cart.reduce((s, l) => s + l.q, 0);
    assert.equal(units(list), units(cheapest));
    assert.ok(stopsOf(list, () => 0).length <= stopsOf(cheapest, () => 0).length);
    for (const p of v.pieces) assert.equal(list.filter((l) => l.id === p.id).reduce((s, l) => s + l.q, 0), cheapest.filter((l) => l.id === p.id).reduce((s, l) => s + l.q, 0), p.name);
    assert.ok(list.every((l) => l.price < viewPiece(v, l.id).worth));
    // No bazaar is asked for more of a piece than it lists.
    for (const l of list.filter((x) => !x.im)) assert.ok(l.q <= base.offers(l.id).find((o) => o.src !== 'market' && 'b:' + String(o.whoId ?? o.who) === l.place).qty, l.name);
    assert.equal(v.buy.plan.units, units(list));
    assert.equal(v.buy.plan.stops, stopsOf(list, () => 0).length);
});
