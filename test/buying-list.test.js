// The buying list after the owner's report of 2026-10-11 ("the need and everything is fake", "i press read now as
// well, its still stale items, and non existent items"): the Item Market as one line, a "Sold by" row as old as it
// really is, a run that keeps its order and is summed once, and a count Torn made that is not added to again.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    IM_PLACE, fillPlan, placeOffer, imShares, toggleLine, refreshList, stopsOf, onList,
    runStart, runNext, runTook, runView, runOrder, listAfterRun,
} from '../src/core/shopping.js';
import { engineEmpty, foldListings, foldShop, foldMarket, offersOf, noteSeenBuy, LISTING_FRESH_MS } from '../src/engine/state.js';
import { STOCK_EMPTY, stockApply, stockInventory } from '../src/core/stock.js';
import { archiveView, viewPiece } from '../src/core/view.js';
import { SETS } from '../src/core/sets.js';
import { fixtureInput } from './fixture-view.js';

const MIN = 60000;
const NOW = Date.UTC(2026, 9, 11, 18, 0);
const SHEEP = 186;

const panda = { id: 274, name: 'Panda Plushie', set: 'plushie', need: 10, worth: 35000 };
const rows = [
    { price: 34000, qty: 2, src: 'bazaar', who: 'Bram', whoId: 11 },
    { price: 34300, qty: 4, src: 'market' },
    { price: 36000, qty: 9, src: 'market' },
    { price: 34100, qty: 3, src: 'market' },
];

// ---- the Item Market: one page, one line ----------------------------------------------------------------------------

test('the Item Market\'s price rows are one line: every row under the worth, at what they cost on average', () => {
    const plan = fillPlan([panda], () => rows);
    assert.deepEqual(plan.map((l) => [l.key, l.q, l.price]), [['274|b:11', 2, 34000], ['274|im', 7, Math.ceil((3 * 34100 + 4 * 34300) / 7)]]);
    assert.equal(onList(plan, 274), 9, 'the $36,000 row is over the worth: one is still to find');
    // Fewer needed than its rows hold: only the cheapest rows are in the line and in its price.
    const few = fillPlan([{ ...panda, need: 6 }], () => rows);
    assert.deepEqual(few.map((l) => [l.key, l.q, l.price]), [['274|b:11', 2, 34000], ['274|im', 4, Math.ceil((3 * 34100 + 34300) / 4)]]);
});

test('what a place has for you: a bazaar\'s cheapest listing; the Item Market\'s rows under the worth together', () => {
    assert.equal(placeOffer(rows, 'b:11', 35000).price, 34000);
    assert.equal(placeOffer(rows, 'b:99', 35000), null);
    const im = placeOffer(rows, IM_PLACE, 35000, 4);
    assert.equal(im.qty, 7, 'the stock is every row under the worth');
    assert.equal(im.price, Math.ceil((3 * 34100 + 34300) / 4), 'the price is of the four you would take');
    assert.equal(placeOffer(rows, IM_PLACE, 34050).price, 34100, 'none under the worth: its cheapest row, which is dear');
});

test('the units of the one Item Market line, row by row: cheapest first, a row over the worth none', () => {
    assert.deepEqual(imShares(rows.slice(1), 35000, 5), [2, 0, 3]);
    assert.deepEqual(imShares(rows.slice(1), 35000, 99), [4, 0, 3]);
    assert.deepEqual(imShares(rows.slice(1), 35000, 0), [0, 0, 0]);
});

test('Add on any Item Market row puts its one line on; a second press on any of them takes it off', () => {
    const piece = { ...panda, offers: rows };
    let cart = toggleLine([], piece, rows[1]);
    assert.deepEqual(cart.map((l) => [l.key, l.q]), [['274|im', 7]]);
    cart = toggleLine(cart, piece, rows[3]);
    assert.deepEqual(cart, [], 'the other row of the same page is the same line');
});

test('a fresh read of the Item Market: the line is priced by its rows as they are now, and shrinks to them', () => {
    const cart = fillPlan([panda], () => rows);
    const now = [rows[0], { price: 34100, qty: 1, src: 'market' }, { price: 34900, qty: 2, src: 'market' }];
    const next = refreshList(cart, [panda], () => now).cart;
    assert.deepEqual(next.map((l) => [l.key, l.q, l.price]), [['274|b:11', 2, 34000], ['274|im', 3, Math.ceil((34100 + 2 * 34900) / 3)]]);
});

// ---- the run ------------------------------------------------------------------------------------------------------

test('a run keeps the order it began in, though the stops are sorted again by every read; a new place goes last', () => {
    const cart = [
        { key: '274|b:11', id: 274, place: 'b:11', whoId: 11, price: 34000, q: 6 },
        { key: '274|b:22', id: 274, place: 'b:22', whoId: 22, price: 34800, q: 1 },
    ];
    const worthOf = () => 35000;
    const stops = stopsOf(cart, worthOf);
    assert.deepEqual(stops.map((s) => s.place), ['b:11', 'b:22']);
    const run = runStart(stops);
    // Bram's listing is partly sold: Wren now saves more, and a third bazaar came onto the list.
    const later = stopsOf([{ ...cart[0], q: 0 }, cart[1], { key: '274|b:33', id: 274, place: 'b:33', whoId: 33, price: 30000, q: 3 }].filter((l) => l.q > 0 || l.place === 'b:11'), worthOf);
    assert.deepEqual(runOrder(later, run).map((s) => s.place), ['b:11', 'b:22', 'b:33']);
    assert.deepEqual(runOrder(later, { on: false }).map((s) => s.place), later.map((s) => s.place), 'no run on: as sorted');
});

test('a run that ended is summed once: its counts stand though the lines it took have left the list', () => {
    const cart = [
        { key: '274|b:11', id: 274, place: 'b:11', whoId: 11, price: 34000, q: 6 },
        { key: '274|b:22', id: 274, place: 'b:22', whoId: 22, price: 34800, q: 1 },
    ];
    const worthOf = () => 35000;
    const stops = stopsOf(cart, worthOf);
    let run = runTook(runStart(stops), '274|b:11', 6);
    run = runNext(runNext(run, stops), stops);
    assert.equal(run.done, true);
    const end = runView(run, stops);
    assert.deepEqual([end.got, end.skipped], [6, 1]);
    // As the engine ends it: what was taken leaves the list, the counts are kept as a sum.
    const left = listAfterRun(cart, run);
    const kept = { ...run, took: {}, sum: { got: end.got, units: end.units, skipped: end.skipped } };
    const after = runView(kept, stopsOf(left, worthOf));
    assert.deepEqual([after.got, after.skipped, after.units], [6, 1, end.units]);
    assert.deepEqual(after.stops.map((s) => [s.place, s.took]), [['b:22', 0]], 'what is left is what is still to buy, nothing taken from it');
});

test('while a run is on, "after the list" counts each unit once: what you took is in your stock, not still to buy', () => {
    const base = fixtureInput(NOW);
    const first = archiveView(base);
    const cart = fillPlan(first.pieces, base.offers);
    const worthOf = (id) => viewPiece(first, id).worth;
    const run = runStart(stopsOf(cart, worthOf));
    const before = archiveView({ ...base, cart, run });
    const line = cart[0];
    const during = archiveView({ ...base, cart, run: runTook(run, line.key, line.q) });
    assert.equal(during.buy.units, before.buy.units - line.q);
    assert.equal(viewPiece(during, line.id).listed, viewPiece(before, line.id).listed - line.q);
    assert.equal(during.buy.cost, before.buy.cost - line.q * line.price);
    assert.equal(during.buy.run.stops.length, before.buy.run.stops.length, 'the run still shows every stop');
});

test('"waiting for your money": only what is still owed, not money already in the trade', () => {
    const v = archiveView(fixtureInput(NOW));
    const yours = v.trades.open.filter((t) => t.state === 'you');
    assert.ok(yours.length > 0);
    assert.equal(v.trades.waitMoney, yours.reduce((s, t) => s + Math.max(0, t.total - t.myMoney), 0));
    assert.ok(v.trades.waitMoney <= yours.reduce((s, t) => s + t.total, 0));
});

// ---- "Sold by": how old a row really is -------------------------------------------------------------------------------

function listed(askedAt, checkedAt) {
    const S = engineEmpty();
    S.self = { id: '2000001', name: '' };
    foldListings(S, String(SHEEP), [
        { player_id: 501, player_name: 'Seller_A', price: 600, quantity: 5, last_checked: Math.floor(checkedAt / 1000) },
        { player_id: 502, player_name: 'Seller_B', price: 640, quantity: 2, last_checked: Math.floor(checkedAt / 1000) },
    ], askedAt);
    return S;
}
const who = (S, id, now = NOW) => offersOf(S, SHEEP, now).find((o) => String(o.whoId) === String(id)) || null;

test('TornW3B\'s row is as old as TornW3B\'s own look: a list asked for after Torn\'s read does not bring a sold-out listing back', () => {
    // TornW3B looked 20 minutes ago. Torn itself said 5 minutes ago that 501 has no Sheep left. The list was asked for 1 minute ago.
    const S = listed(NOW - MIN, NOW - 20 * MIN);
    assert.equal(who(S, 501).from, 'w3b');
    assert.equal(who(S, 501).at, Math.floor((NOW - 20 * MIN) / 1000) * 1000, 'its age is TornW3B\'s look, not our asking');
    foldShop(S, '501', { bazaar: [{ ID: 187, price: 950, quantity: 4 }] }, NOW - 5 * MIN);
    assert.equal(who(S, 501), null, 'sold out by Torn\'s own word, the newer of the two');
    assert.equal(who(S, 502).from, 'w3b', 'a bazaar Torn was not asked about is still TornW3B\'s row, and says so');
    // Torn's read has it at another price and count: that stands, with Torn's time.
    foldShop(S, '502', { bazaar: [{ ID: SHEEP, price: 655, quantity: 1 }] }, NOW - 2 * MIN);
    assert.deepEqual([who(S, 502).price, who(S, 502).qty, who(S, 502).from, who(S, 502).at], [655, 1, 'torn', NOW - 2 * MIN]);
});

test('a TornW3B look newer than Torn\'s read stands; a buy of yours seen since comes off it', () => {
    const S = listed(NOW - MIN, NOW - 2 * MIN);
    foldShop(S, '501', { bazaar: [{ ID: SHEEP, price: 590, quantity: 9 }] }, NOW - 10 * MIN);
    assert.deepEqual([who(S, 501).price, who(S, 501).qty, who(S, 501).from], [600, 5, 'w3b']);
    noteSeenBuy(S, { id: SHEEP, qty: 2, whoId: '501', price: 600, t: NOW - MIN }, NOW - MIN);
    assert.equal(who(S, 501).qty, 3);
});

test('a bazaar Torn showed you that TornW3B\'s list no longer names is still there, for as long as a TornW3B row would count', () => {
    const S = listed(NOW - MIN, NOW - 2 * MIN);
    foldShop(S, '777', { bazaar: [{ ID: SHEEP, price: 570, quantity: 8 }] }, NOW - 3 * MIN);
    assert.deepEqual([who(S, 777).price, who(S, 777).qty, who(S, 777).from], [570, 8, 'torn']);
    const later = NOW - 3 * MIN + LISTING_FRESH_MS + MIN;
    assert.equal(who(S, 777, later), null, 'too old to stand as a listing');
    foldShop(S, '2000001', { bazaar: [{ ID: SHEEP, price: 10, quantity: 99 }] }, NOW);
    assert.equal(who(S, 2000001), null, 'your own bazaar never');
});

test('an Item Market row carries the time Torn was asked', () => {
    const S = listed(NOW - MIN, NOW - 2 * MIN);
    foldMarket(S, String(SHEEP), [{ price: 610, amount: 3 }], NOW - 4 * MIN);
    const im = offersOf(S, SHEEP, NOW).filter((o) => o.src === 'market');
    assert.ok(im.length > 0, 'the made-up Item Market row was taken');
    assert.ok(im.every((o) => o.at === NOW - 4 * MIN && o.from === 'torn'));
});

// ---- the count -------------------------------------------------------------------------------------------------------

test('a trade that finished before Torn\'s count was taken is in that count: learned of later, it is not added again', () => {
    const flower = SETS.find((s) => s.key === 'flower');
    const ids = flower.pieces.map((p) => String(p.id));
    // The hub opens: Torn's inventory says 12 (no time in the answer to trust yet). The trade that brought 5 of them
    // finished two hours ago, while the hub was closed, and is read only now.
    let s = stockInventory(STOCK_EMPTY, { 263: 12 }, NOW, ids, () => 20000);
    s = stockApply(s, [{ key: 'trade:9', t: NOW - 120 * MIN, id: '263', d: 5, paid: 70000 }]).state;
    assert.equal(s.held[263], 12);
    // One that finished ten minutes ago may not be in Torn's hourly count yet: it is added.
    s = stockApply(s, [{ key: 'trade:10', t: NOW - 10 * MIN, id: '263', d: 3, paid: 40000 }]).state;
    assert.equal(s.held[263], 15);
});

test('"Sell your points" is not said of a sale under what they cost you', () => {
    // The points price well over its usual level, so "hold" is not what is said.
    const base = fixtureInput(NOW);
    const up = { ...base, listings: base.listings.map((l) => ({ ...l, cost: l.cost + 3000 })) };
    const sell = archiveView(up).dash.todo.find((t) => t.kind === 'sell');
    assert.ok(sell, 'with the price up, selling is what is said');
    assert.equal(sell.loss, false);
    assert.ok(sell.each > 0 && sell.each <= sell.price);
    // The same points, said to have cost more than the market pays.
    const dear = archiveView({ ...up, settings: { ...up.settings, beforeEach: sell.price + 5000 } });
    const t = dear.dash.todo.find((x) => x.kind === 'sell');
    if (t && dear.points.book.cost > t.n * t.price) assert.equal(t.loss, true);
});

// ---- "i already bought in that bazaar, card still shows" (the owner, 2026-10-11) ---------------------------------------
// TornW3B's "last checked" moves on while its copy of the bazaar is still the old one (measured for Torn Trading,
// 3.16.4 / 3.20.6). Until 1.2.3 a buy came off a listing only while the row's check was older than the buy.

const w3bList = (S, askedAt, checkedAt, changedAt, qty = 5) => foldListings(S, String(SHEEP), [
    { player_id: 501, player_name: 'Seller_A', price: 600, quantity: qty, last_checked: Math.floor(checkedAt / 1000), content_updated: Math.floor(changedAt / 1000) },
], askedAt);
const fresh = () => { const S = engineEmpty(); S.self = { id: '2000001', name: '' }; return S; };

test('you bought a listing out; TornW3B checks again and still has its old copy: the listing does not come back', () => {
    const S = fresh();
    w3bList(S, NOW - 10 * MIN, NOW - 12 * MIN, NOW - 30 * MIN);
    noteSeenBuy(S, { id: SHEEP, qty: 5, whoId: '501', price: 600, t: NOW - 5 * MIN }, NOW - 5 * MIN);
    assert.equal(who(S, 501), null, 'bought out');
    // A new list: TornW3B "checked" the bazaar three minutes after the buy and found nothing changed - the old copy.
    w3bList(S, NOW - MIN, NOW - 2 * MIN, NOW - 30 * MIN);
    assert.equal(who(S, 501), null, 'until 1.2.3 it was back here, all five, with your buy in it');
    // Checked within the minute after the buy, change or no: too close to have seen it.
    w3bList(S, NOW - MIN, NOW - 5 * MIN + 30000, NOW - 5 * MIN + 30000);
    assert.equal(who(S, 501), null);
    // A check that found the bazaar changed, over a minute after the buy: TornW3B has seen it. Its number stands.
    w3bList(S, NOW, NOW - MIN, NOW - MIN, 2);
    assert.equal(who(S, 501).qty, 2, 'restocked, or two were left: what TornW3B now says');
});

test('a buy known from your log alone (no Torn tab of ours saw it) comes off the listing too, and a buy seen and logged comes off once', () => {
    const S = fresh();
    w3bList(S, NOW - 10 * MIN, NOW - 12 * MIN, NOW - 30 * MIN);
    const row = { id: '900:0', t: NOW - 5 * MIN, itemId: String(SHEEP), qty: 2, each: 600, fee: 0, side: 'buy', venue: 'bazaar', who: '501', whoName: null };
    S.ledger = { ...S.ledger, rows: [row] };
    assert.equal(who(S, 501).qty, 3, 'until 1.2.3 only a buy seen on the page came off');
    // The same buy, seen on the page as well and tied to its log row: once.
    S.seen = [{ t: NOW - 5 * MIN, id: String(SHEEP), qty: 2, whoId: '501', price: 600, v: 2, logged: '900:0' }];
    assert.equal(who(S, 501).qty, 3);
    // Seen on the page, its log row not in yet: the page's buy stands in.
    S.ledger = { ...S.ledger, rows: [] };
    S.seen = [{ t: NOW - 5 * MIN, id: String(SHEEP), qty: 2, whoId: '501', price: 600, v: 2 }];
    assert.equal(who(S, 501).qty, 3);
    // Another seller's listing, another item, a trade, an Item Market buy: none of them touches this listing.
    S.seen = [];
    S.ledger = { ...S.ledger, rows: [{ ...row, who: '502' }, { ...row, id: '901:0', itemId: '187' }, { ...row, id: '902:0', venue: 'market', who: null }, { ...row, id: '903:0', venue: 'trade' }] };
    assert.equal(who(S, 501).qty, 5);
    // A buy of four hours ago is long in every copy.
    S.ledger = { ...S.ledger, rows: [{ ...row, t: NOW - 4 * 60 * MIN }] };
    assert.equal(who(S, 501).qty, 5);
});

test('Torn\'s own read of the bazaar: a read in the minute after your buy may be the copy from before it; a later one is the bazaar as it is', () => {
    const S = fresh();
    w3bList(S, NOW - 20 * MIN, NOW - 22 * MIN, NOW - 40 * MIN);
    noteSeenBuy(S, { id: SHEEP, qty: 2, whoId: '501', price: 600, t: NOW - 5 * MIN }, NOW - 5 * MIN);
    foldShop(S, '501', { bazaar: [{ ID: SHEEP, price: 600, quantity: 5 }] }, NOW - 5 * MIN + 20000);
    assert.deepEqual([who(S, 501).qty, who(S, 501).from], [3, 'torn'], 'twenty seconds after: your two still come off');
    foldShop(S, '501', { bazaar: [{ ID: SHEEP, price: 600, quantity: 3 }] }, NOW - 3 * MIN);
    assert.equal(who(S, 501).qty, 3, 'two minutes after: Torn\'s count stands, nothing taken off twice');
    // TornW3B checks after Torn's read and finds nothing changed: Torn's read, the newer fact, still stands.
    w3bList(S, NOW, NOW - MIN, NOW - 40 * MIN);
    assert.deepEqual([who(S, 501).qty, who(S, 501).from], [3, 'torn'], 'until 1.2.3 TornW3B\'s old five were back');
    // TornW3B checks and finds a change after Torn's read: that is news.
    w3bList(S, NOW, NOW - MIN, NOW - MIN, 9);
    assert.deepEqual([who(S, 501).qty, who(S, 501).from], [9, 'w3b']);
});
