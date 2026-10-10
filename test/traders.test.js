import test from 'node:test';
import assert from 'node:assert/strict';

import {
    emptyTraderDb,
    addTraders,
    parseW3bPriceList,
    parseW3bSetPrices,
    bestSetBuyer,
    recordW3bList,
    liveW3bPrices,
    buyersForItem,
    indexW3bByItem,
    W3B_LIST_MAX_AGE_MS,
} from '../src/core/traders.js';
import { W3bClient, fetchW3bPriceList, w3bPriceListUrl } from '../src/api/w3b.js';
const NOW = 1_900_000_000_000;

function response(status, body) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/** A database where trader 11 (Bob) and 77 have TornW3B lists read just now. */
function dbWithLists(now = NOW) {
    const db = emptyTraderDb();
    addTraders(db, [{ id: 11, name: 'Bob' }, { id: 77, name: 'Zed' }, { id: 12, name: 'Alice' }], now);
    recordW3bList(db, 11, { prices: { 206: 852000 } }, now);
    recordW3bList(db, 77, { prices: { 206: 849500, 180: 61 } }, now);
    recordW3bList(db, 12, { prices: {} }, now);
    return db;
}

/* ============================================================ price lists */

test('a TornW3B price list keeps buying prices of real items only', () => {
    const prices = parseW3bPriceList([
        { itemId: 206, name: 'Xanax', buyPrice: 840000 },
        { itemId: 1, name: 'Hammer', buyPrice: 0 },
        { itemId: -1, name: 'Flower Set', buyPrice: 303717 },
        { itemId: 'x', buyPrice: 5 },
        null,
    ]);
    assert.deepEqual(prices, { 206: 840000 });
    assert.deepEqual(parseW3bPriceList({ error: 'Pricelist not found for this user' }), {});
});

test('fetchW3bPriceList: no key, weav3r.dev only, and "no list" (404 or []) is empty, not an error', async () => {
    const seen = [];
    const client = new W3bClient({
        fetchImpl: async (url) => {
            seen.push(url);
            if (url.includes('/pricelist/2?')) return response(404, { error: 'Pricelist not found for this user' });
            if (url.includes('/pricelist/4?')) return response(200, []);
            return response(200, [{ itemId: 206, buyPrice: 1 }]);
        },
    });
    assert.deepEqual(await fetchW3bPriceList(client, 2), []);
    assert.deepEqual(await fetchW3bPriceList(client, 4), []);
    assert.equal((await fetchW3bPriceList(client, '3727302')).length, 1);
    for (const url of seen) {
        const u = new URL(url);
        assert.equal(u.hostname, 'weav3r.dev');
        assert.deepEqual([...u.searchParams.keys()], ['comment']);
    }
    assert.equal(w3bPriceListUrl(3727302), 'https://weav3r.dev/pricelist/3727302');
});

test('a trader\'s TornW3B prices are shown for 6 hours after reading, then dropped', () => {
    const db = dbWithLists();
    assert.deepEqual(liveW3bPrices(db.traders[11], NOW + 1000), { 206: 852000 });
    assert.equal(liveW3bPrices(db.traders[11], NOW + W3B_LIST_MAX_AGE_MS + 1), null);
    // No list at all: nothing to show.
    assert.equal(liveW3bPrices(db.traders[12], NOW), null);
});

/* ============================================================== one row */

test('one row per trader: on both sites, the LOWER price counts and the row says they differ; highest first', () => {
    const db = dbWithLists();
    const buyers = buyersForItem('206', {
        teBest: [{ name: 'Bob', id: '11', price: 850000, score: 214 }],
        teFull: [
            { name: 'Bob', price: 850000 },
            { name: 'Carol', price: 845000 },
            { name: 'Alice', price: 830000 },
        ],
        idsByName: new Map([['bob', '11'], ['carol', '44'], ['alice', '12']]),
        db,
        w3bByItem: indexW3bByItem(db, NOW),
    });
    // Bob lists $850,000 on TornExchange and $852,000 on TornW3B: he may pay
    // the lower, so $850,000 is what counts (the friend lost money on this).
    assert.deepEqual(
        buyers.map((b) => [b.name, b.id, b.price, b.te, b.w3b, b.differ]),
        [
            ['Bob', '11', 850000, 850000, 852000, true],
            ['Zed', '77', 849500, null, 849500, false],
            ['Carol', '44', 845000, 845000, null, false],
            ['Alice', '12', 830000, 830000, null, false],
        ],
    );
});

test('TornExchange top three and full list disagree for one trader: the LOWER counts, and the row says so', () => {
    // The friend traded ID Badges to SilentStorm77 at the top three's
    // $140,000; the trader's list already said $105,000.
    const buyers = buyersForItem('1', {
        teBest: [{ name: 'SilentStorm77', id: '5', price: 140000, score: 3 }],
        teFull: [{ name: 'SilentStorm77', price: 105000 }],
    });
    assert.deepEqual(
        buyers.map((b) => [b.name, b.price, b.te, b.teTop, b.teList, b.differ]),
        [['SilentStorm77', 105000, 105000, 140000, 105000, true]],
    );
    // Either way round: a newer top three can be the lower one.
    const other = buyersForItem('1', {
        teBest: [{ name: 'SilentStorm77', id: '5', price: 100000, score: 3 }],
        teFull: [{ name: 'SilentStorm77', price: 105000 }],
    });
    assert.deepEqual([other[0].price, other[0].differ], [100000, true]);
    // The same price on both: nothing to say.
    const same = buyersForItem('1', {
        teBest: [{ name: 'SilentStorm77', id: '5', price: 105000, score: 3 }],
        teFull: [{ name: 'SilentStorm77', price: 105000 }],
    });
    assert.deepEqual([same[0].price, same[0].differ], [105000, false]);
});

test('a trader on both sites at the same price is not marked as differing', () => {
    const db = dbWithLists();
    const buyers = buyersForItem('206', {
        teBest: [{ name: 'Bob', id: '11', price: 852000, score: 214 }],
        idsByName: new Map([['bob', '11']]),
        db,
        w3bByItem: indexW3bByItem(db, NOW),
    });
    const bob = buyers.find((b) => b.id === '11');
    assert.equal(bob.price, 852000);
    assert.equal(bob.differ, false);
});

test('a full-list name not among active traders is left out once the active list is known', () => {
    const buyers = buyersForItem('1', {
        teBest: [{ name: 'Alice', id: '12', price: 115 }],
        teFull: [{ name: 'Alice', price: 115 }, { name: 'Ghost', price: 500 }],
        idsByName: new Map([['alice', '12']]),
    });
    assert.deepEqual(buyers.map((b) => b.name), ['Alice']);
    // Active list not loaded yet: nobody can be ruled out.
    const unknown = buyersForItem('1', { teFull: [{ name: 'Ghost', price: 500 }] });
    assert.deepEqual(unknown.map((b) => [b.name, b.id]), [['Ghost', null]]);
});

test('adding traders: ids cleaned, a real name replaces a placeholder, nothing added twice', () => {
    const db = emptyTraderDb();
    assert.equal(addTraders(db, [{ id: '[77]' }, { id: '' }, { id: 0 }], NOW), true);
    assert.deepEqual(Object.keys(db.traders), ['77']);
    assert.equal(db.traders[77].name, 'Trader 77');
    assert.equal(addTraders(db, [{ id: 77, name: 'Zed' }], NOW), true);
    assert.equal(db.traders[77].name, 'Zed');
    assert.equal(addTraders(db, [{ id: 77, name: 'Zed' }], NOW), false);
});

/* ======================================= 3.9.4: trust and best trader */

import { trustOf } from '../src/core/traders.js';
test('trust: the better of TornExchange votes and TornW3B rating; nothing known is no badge', () => {
    assert.equal(trustOf(null, null), null);
    assert.equal(trustOf(214, null).level, 'Trusted');
    assert.equal(trustOf(5, { up: 523, down: 7 }).level, 'Trusted', 'known on one site is enough');
    assert.equal(trustOf(25, null).level, 'Known');
    assert.equal(trustOf(3, null).level, 'New');
    assert.equal(trustOf(-4, null).level, 'Caution');
    assert.deepEqual(trustOf(null, { up: 30, down: 2 }), { level: 'Known', score: 28, votes: null, up: 30, down: 2 });
});

test('TornW3B /traders: a buyer we had no list of counts, with their rating; its price is the newest (3.15)', () => {
    const db = { traders: { 11: { name: 'Bob', w3b: { found: true, at: 1, prices: { 206: 840000 } } } } };
    const out = buyersForItem('206', {
        db,
        w3bByItem: new Map([['206', [{ id: '11', price: 840000 }]]]),
        w3bItem: [{ id: '11', name: 'Bob', price: 845000, up: 300, down: 2 }, { id: '99', name: 'NewGuy', price: 847300, up: 69, down: 5 }],
    });
    assert.deepEqual(out.map((b) => [b.name, b.price]), [['NewGuy', 847300], ['Bob', 845000]]);
    assert.equal(out[0].trust.level, 'Known', 'rated from TornW3B: 64 up');
});

test('3.24.0: the set prices of a list (ids under zero) are kept apart from its items', () => {
    const body = [{ itemId: 206, buyPrice: 850000 }, { itemId: -2, buyPrice: 309440 }, { itemId: -1, buyPrice: 308000 }, { itemId: -3, buyPrice: 5 }, { itemId: -2, buyPrice: 0 }];
    assert.deepEqual(parseW3bPriceList(body), { 206: 850000 });
    assert.deepEqual(parseW3bSetPrices(body), { '-2': 309440, '-1': 308000 });
    assert.deepEqual(parseW3bSetPrices(null), {});
    const db = { traders: {} };
    recordW3bList(db, 3459156, { prices: parseW3bPriceList(body), sets: parseW3bSetPrices(body) }, 1000);
    recordW3bList(db, 12, { prices: {}, sets: { '-2': 301000 } }, 1000);
    recordW3bList(db, 13, { prices: { 206: 1 } }, 1000);
    assert.equal(db.traders['3459156'].w3b.sets['-2'], 309440);
    assert.equal(db.traders['13'].w3b.sets, undefined);
    assert.deepEqual(bestSetBuyer(db, -2), { id: '3459156', name: 'Trader 3459156', price: 309440 });
    assert.equal(bestSetBuyer(db, -1).price, 308000);
    assert.equal(bestSetBuyer({ traders: {} }, -1), null);
});
