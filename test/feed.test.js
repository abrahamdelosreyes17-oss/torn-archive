import test from 'node:test';
import assert from 'node:assert/strict';

import { W3bClient, W3bError, W3B_COOLDOWN_MS, fetchW3bSummary, fetchW3bListings } from '../src/api/w3b.js';
import { TornApiClient, KEY_DEAD_CODES } from '../src/api/client.js';
import { ITEM_MARKET_MIN_RECHECK_MS, fetchItemMarket, fetchItems, npcSaleFromValue, shopBuyPriceFromValue } from '../src/api/torn.js';
import { buildItemIndex } from '../src/core/items.js';
import { normalizeW3bListings, normalizeItemMarketRows, bazaarUrl } from '../src/core/feed.js';
import { decideLeader, LEADER_STALE_MS } from '../src/core/leader.js';
import { bazaarOwnerId, bazaarTarget, isTradePage } from '../src/sources/route.js';
const KEY = 'abcdef1234567890';

function json(body, { ok = true, status = 200 } = {}) {
    return { ok, status, json: async () => body };
}

function notJson(status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => {
            throw new SyntaxError('Unexpected token <');
        },
    };
}

function recorder(handler) {
    const calls = [];
    const impl = async (url) => {
        calls.push(url);
        return handler(url, calls.length);
    };
    impl.calls = calls;
    return impl;
}

/*
 * A tiny catalogue. Hammer: NPC pays $100, market $120.
 * Xanax: NPC pays $1,000? no - real sell prices are low; this is a fixture.
 */
const RAW_ITEMS = {
    1: { name: 'Hammer', sell_price: 100, market_value: 120 },
    206: { name: 'Xanax', sell_price: 600, market_value: 830000 },
    2: { name: 'Junk', sell_price: 0, market_value: 0 },
};

const index = buildItemIndex(RAW_ITEMS);
// NPC plus Item Market resale (5% tax) unless a test says otherwise.
const SETTINGS = { sellToNpc: true, resaleMarket: true, resaleBazaar: false, cashOnHand: null };

/* ================================================================ W3B client */

test('TornW3B client only ever contacts weav3r.dev, and never sends a key', async () => {
    const fetchImpl = recorder(async () => json({ items: [] }));
    const client = new W3bClient({ fetchImpl });

    await client.get('marketplace');
    await client.get('marketplace/206?key=' + KEY + '&maxPrice=5');

    for (const raw of fetchImpl.calls) {
        const url = new URL(raw);
        assert.equal(url.hostname, 'weav3r.dev');
        assert.equal(url.searchParams.get('key'), null);
        assert.ok(!raw.includes(KEY), 'no key anywhere in ' + raw);
        assert.deepEqual([...url.searchParams.keys()], ['comment']);
    }
});

test('TornW3B client refuses an absolute URL to another host', async () => {
    const fetchImpl = recorder(async () => json({}));
    const client = new W3bClient({ fetchImpl });

    await assert.rejects(() => client.get('https://evil.example/steal'), W3bError);
    assert.equal(fetchImpl.calls.length, 0);

    // A protocol-relative path is stripped to a relative one: still weav3r.dev.
    await client.get('//evil.example/x');
    assert.equal(new URL(fetchImpl.calls[0]).hostname, 'weav3r.dev');
});

test('a 429 from TornW3B pauses every further request for the cooldown', async () => {
    let t = 1_000_000;
    const fetchImpl = recorder(async () => json({}, { ok: false, status: 429 }));
    const client = new W3bClient({ fetchImpl, now: () => t });

    await assert.rejects(() => client.get('marketplace'), (e) => e.blocked === true);
    await assert.rejects(() => client.get('marketplace'), (e) => e.blocked === true);
    assert.equal(fetchImpl.calls.length, 1, 'second call never left the client');

    t += W3B_COOLDOWN_MS + 1;
    await assert.rejects(() => client.get('marketplace'));
    assert.equal(fetchImpl.calls.length, 2);
});

test('a Cloudflare challenge page (non-JSON) is treated as blocked', async () => {
    const client = new W3bClient({ fetchImpl: async () => notJson() });
    await assert.rejects(() => client.get('marketplace'), (e) => e.blocked === true);
    assert.equal(client.stats().coolingDown, true);
});

test('the TornW3B summary is read into one row per item', async () => {
    const client = new W3bClient({
        fetchImpl: async () =>
            json({
                total_count: 2,
                items: [
                    { item_id: 206, item_name: 'Xanax', market_price: 852268, bazaar_average: 846000, lowest_price: 829999, total_bazaars: 412 },
                    { item_id: 1, item_name: 'Hammer', market_price: 120, bazaar_average: null, lowest_price: null, total_bazaars: 0 },
                ],
            }),
    });

    const rows = await fetchW3bSummary(client);
    assert.deepEqual(rows[0], {
        itemId: '206',
        name: 'Xanax',
        lowestPrice: 829999,
        marketPrice: 852268,
        bazaarAverage: 846000,
        totalBazaars: 412,
    });
    assert.equal(rows[1].lowestPrice, null);
});

test('listings are re-asked once when TornW3B says there are some but sends none', async () => {
    const fetchImpl = recorder(async (_url, n) =>
        n === 1
            ? json({ total_listings: 3, listings: [] })
            : json({ total_listings: 1, listings: [{ player_id: 5, price: 50, quantity: 1 }] }),
    );
    const client = new W3bClient({ fetchImpl });

    const { listings } = await fetchW3bListings(client, 1);
    assert.equal(fetchImpl.calls.length, 2);
    assert.equal(listings.length, 1);
});

/* ============================================================ Torn client */

test('v2 paths are sent without the v1 trailing slash', async () => {
    const fetchImpl = recorder(async () => json({ itemmarket: { listings: [] } }));
    const client = new TornApiClient({ getKey: () => KEY, fetchImpl, maxRetries: 0 });

    await client.get('v2/market/206/itemmarket', { limit: 20 });
    await client.get('torn', { selections: 'items' });

    assert.equal(new URL(fetchImpl.calls[0]).pathname, '/v2/market/206/itemmarket');
    assert.equal(new URL(fetchImpl.calls[1]).pathname, '/torn/');
});

test('a top-level {code, error} v2 error is still an error', async () => {
    const client = new TornApiClient({
        getKey: () => KEY,
        fetchImpl: async () => json({ code: 2, error: 'Incorrect key' }),
        maxRetries: 0,
    });

    await assert.rejects(
        () => client.get('v2/market/1/itemmarket'),
        (e) => e.code === 2 && KEY_DEAD_CODES.has(e.code),
    );
});

test('every tab draws on one shared request window', async () => {
    let shared = [];
    const mk = () =>
        new TornApiClient({
            getKey: () => KEY,
            fetchImpl: async () => json({}),
            maxRetries: 0,
            maxPerMinute: 3,
            dedupTtlMs: 0,
            loadWindow: () => shared,
            saveWindow: (w) => {
                shared = [...w];
            },
        });

    const tabA = mk();
    const tabB = mk();

    await tabA.get('torn', { a: 1 });
    await tabA.get('torn', { a: 2 });
    await tabB.get('torn', { b: 1 });

    assert.equal(tabB.stats().remaining, 0, 'tab B sees tab A\'s requests');
    assert.equal(tabA.stats().remaining, 0);
});

test('fetchItemMarket reads the v2 shape and when Torn will next refresh it', async () => {
    const client = {
        get: async (path, params) => {
            assert.equal(path, 'v2/market/206/itemmarket');
            assert.equal(params.limit, 20);
            return {
                itemmarket: {
                    item: { id: 206, name: 'Xanax', average_price: 851096 },
                    listings: [
                        { price: 873000, amount: 5 },
                        { price: 873000, amount: 2 },
                        { price: 0, amount: 1 },
                    ],
                    cache_timestamp: 1787334782,
                    cache_delay: 30,
                },
                _metadata: { total: 193 },
            };
        },
    };

    const m = await fetchItemMarket(client, 206, { now: 1787334782000 + 2000 });
    assert.equal(m.listings.length, 2);
    assert.equal(m.averagePrice, 851096);
    assert.equal(m.cacheTimestamp, 1787334782000);
    assert.equal(m.nextAt, 1787334782000 + 30000);
    assert.equal(m.total, 193);

    assert.deepEqual(normalizeItemMarketRows(m.listings), [{ price: 873000, qty: 7 }]);

    // Torn served a snapshot whose timestamp is long past: its renewal time
    // is already over, and the item used to be due again on every 3 s tick.
    const later = 1787334782000 + 10 * 60 * 1000;
    const stale = await fetchItemMarket(client, 206, { now: later });
    assert.equal(stale.nextAt, later + ITEM_MARKET_MIN_RECHECK_MS);
});

test('TornW3B listings: no seller means no row, and we sort by price ourselves', () => {
    const rows = normalizeW3bListings([
        { player_id: 9, player_name: 'Sponsor', price: 90, quantity: 1, last_checked: 1_790_000_300, sponsored: 1 },
        { player_id: null, price: 10, quantity: 5, last_checked: 1_790_000_300 },
        { player_id: 7, player_name: 'Cheap', price: 50, quantity: 3, last_checked: 1_790_000_000, content_updated: 1_789_999_000 },
        { player_id: 8, price: 60, quantity: 0 },
    ]);

    assert.deepEqual(rows.map((r) => r.sellerId), ['7', '9']);
    assert.equal(rows[0].dataAt, 1_790_000_000_000, 'unix seconds -> ms');
    assert.equal(rows[0].changedAt, 1_789_999_000_000);
});

/* ================================================================== routing */

test('bazaar owner and link target come from the URL', () => {
    const url = bazaarUrl('123', '206', 829999);
    assert.equal(bazaarOwnerId(url), '123');
    assert.deepEqual(bazaarTarget(url), { itemId: '206', price: 829999 });

    assert.equal(bazaarOwnerId('https://www.torn.com/bazaar.php#/'), null);
    assert.equal(bazaarTarget('https://www.torn.com/bazaar.php?userId=1#/'), null);
    assert.equal(bazaarOwnerId('https://www.torn.com/page.php?sid=ItemMarket&userId=5'), null);
    // Any spelling of the parameter: userID made another player's bazaar look like your own.
    for (const name of ['userId', 'userid', 'userID', 'USERID']) {
        assert.equal(bazaarOwnerId('https://www.torn.com/bazaar.php?' + name + '=77#/'), '77', name);
    }
    assert.equal(bazaarOwnerId('https://www.torn.com/bazaar.php?userID=abc#/'), null, 'digits only');
});

/* =================================================================== leader */

test('only one visible tab leads, and a hidden leader steps down', () => {
    const now = 100_000;

    let d = decideLeader(null, 'A', { now, visible: true });
    assert.deepEqual([d.lead, d.confirmed], [true, false], 'claims, not yet confirmed');

    const record = d.write;
    d = decideLeader(record, 'B', { now: now + 1000, visible: true });
    assert.equal(d.lead, false, 'B defers to a fresh leader');

    d = decideLeader(record, 'A', { now: now + 5000, visible: true });
    assert.deepEqual([d.lead, d.confirmed], [true, true]);

    d = decideLeader(record, 'A', { now: now + 6000, visible: false });
    assert.equal(d.lead, false);
    assert.deepEqual(d.write, { id: null, ts: 0 }, 'hidden leader releases');

    d = decideLeader({ id: 'A', ts: now }, 'B', { now: now + LEADER_STALE_MS + 1, visible: true });
    assert.equal(d.lead, true, 'a dead leader is replaced');

    d = decideLeader(null, 'C', { now, visible: false });
    assert.equal(d.lead, false, 'a hidden tab never claims');
});

/* =============================================================== controller */

function memoryStore() {
    const data = new Map();
    return {
        data,
        load: (k) => (data.has(k) ? JSON.parse(data.get(k)) : null),
        save: (k, v) => data.set(k, JSON.stringify(v)),
    };
}

function w3bServer() {
    return recorder(async (url) => {
        const path = new URL(url).pathname;
        if (path === '/api/marketplace') {
            return json({ items: [{ item_id: 1, item_name: 'Hammer', lowest_price: 50, market_price: 120 }] });
        }
        return json({
            total_listings: 1,
            listings: [{ player_id: 7, player_name: 'Bob', price: 50, quantity: 2, last_checked: 1_000 }],
        });
    });
}

// Captured from the live API, 2026-09-24 (trimmed to `value`).
const LIVE_VALUES = {
    15: { name: 'Beretta M9', value: { vendor: { country: 'Torn', name: "Big Al's Gun Shop" }, shops: [{ country: 'Torn', shop: "Big Al's Gun Shop", buy_price: 2000, sell_price: 1300 }], buy_price: 2000, sell_price: 1300, market_price: 1066 } },
    181: { name: 'Bottle of Champagne', value: { vendor: { country: 'Torn', name: "Bits 'n' Bobs" }, shops: [{ country: 'Torn', shop: "Bits 'n' Bobs", buy_price: 4500, sell_price: 3100 }], buy_price: 4500, sell_price: 3100, market_price: 2932 } },
    456: { name: 'Companion Script : Ubay', value: { vendor: null, shops: [], buy_price: null, sell_price: 12000000, market_price: 0 } },
    335: { name: 'Stick of Dynamite', value: { vendor: { country: 'China', name: 'General Store' }, shops: [{ country: 'China', shop: 'General Store', buy_price: 50000, sell_price: 37500 }], buy_price: 50000, sell_price: null, market_price: 9172 } },
    326: { name: 'Printing Paper', value: { vendor: { country: 'China', name: 'General Store' }, shops: [{ country: 'China', shop: 'General Store', buy_price: 75000, sell_price: 56250 }], buy_price: 75000, sell_price: null, market_price: 48977 } },
    440: { name: 'Pillow', value: { vendor: { country: 'Torn', name: "Big Al's Gun Shop" }, shops: [{ country: 'UAE', shop: 'Arms Dealer', buy_price: null, sell_price: 75 }, { country: 'Torn', shop: "Big Al's Gun Shop", buy_price: null, sell_price: 150 }], buy_price: null, sell_price: 150, market_price: 880 } },
    159: { name: 'Bolt Cutters', value: { vendor: { country: 'Mexico', name: 'General Store' }, shops: [{ country: 'Mexico', shop: 'General Store', buy_price: 25, sell_price: 15 }], buy_price: 25, sell_price: 15, market_price: 446 } },
    4: { name: 'Knuckle Dusters', value: { vendor: { country: 'Torn', name: "Big Al's Gun Shop" }, shops: [{ country: 'South Africa', shop: 'Arms Dealer', buy_price: 750, sell_price: 500 }, { country: 'Torn', shop: "Big Al's Gun Shop", buy_price: null, sell_price: 500 }], buy_price: 750, sell_price: 500, market_price: 263 } },
    1290: { name: 'Toner', value: { vendor: { country: 'Torn', name: 'Print Shop' }, shops: [{ country: 'Torn', shop: 'Print Shop', buy_price: 800, sell_price: null }], buy_price: 800, sell_price: null, market_price: 357 } },
};

const npc = (id) => npcSaleFromValue(LIVE_VALUES[id].value);

test('an NPC price needs sell_price AND a shop in Torn - each field lies alone', () => {
    assert.deepEqual(npc(15), { price: 1300, shop: "Big Al's Gun Shop" });
    assert.deepEqual(npc(181), { price: 3100, shop: "Bits 'n' Bobs" });
    assert.deepEqual(npc(4), { price: 500, shop: "Big Al's Gun Shop" });

    // sell_price says $12m; the game says N/A; no shop at all.
    assert.deepEqual(npc(456), { price: null, shop: null });
    // A foreign shop lists 75% of its buy price; sell_price is null; game says N/A.
    assert.deepEqual(npc(335), { price: null, shop: null });
    assert.deepEqual(npc(326), { price: null, shop: null });
    // Only sold abroad - you cannot sell abroad.
    assert.deepEqual(npc(159), { price: null, shop: null });
    // A Torn shop that only sells it, never buys it back.
    assert.deepEqual(npc(1290), { price: null, shop: null });
    // Two shops: the Torn one, not the foreign one.
    assert.deepEqual(npc(440), { price: 150, shop: "Big Al's Gun Shop" });

    // A payload from before `shops` existed: only a vendor in Torn counts.
    assert.deepEqual(npcSaleFromValue({ vendor: { country: 'Torn', name: 'X' }, sell_price: 50 }), { price: 50, shop: 'X' });
    assert.deepEqual(npcSaleFromValue({ vendor: { country: 'China', name: 'X' }, sell_price: 50 }), { price: null, shop: null });
    assert.deepEqual(npcSaleFromValue({ vendor: null, sell_price: 50 }), { price: null, shop: null });
});

test('after 2027-01-01 (no sell_price / buy_price / vendor), the same NPC prices come from shops alone', () => {
    for (const [id, item] of Object.entries(LIVE_VALUES)) {
        const { sell_price: _s, buy_price: _b, vendor: _v, ...after } = item.value;
        assert.deepEqual(npcSaleFromValue(after), npc(id), item.name);
    }
    // What a Torn shop sells it for, with and without buy_price.
    assert.equal(shopBuyPriceFromValue(LIVE_VALUES[15].value), 2000);
    const { buy_price: _b, ...beretta } = LIVE_VALUES[15].value;
    assert.equal(shopBuyPriceFromValue(beretta), 2000);
    const { buy_price: _c, ...dynamite } = LIVE_VALUES[335].value;
    assert.equal(shopBuyPriceFromValue(dynamite), null, 'only sold abroad');
});

test('a relative "next" link on the v2 item list is followed, not a crash into the v1 fallback', async () => {
    const asked = [];
    const client = {
        get: async (path, params) => {
            asked.push([path, params.offset || null]);
            if (!params.offset) return { items: [{ id: 1, name: 'A', value: {} }], _metadata: { links: { next: '/v2/torn/items?sort=ASC&offset=1' } } };
            return { items: [{ id: 2, name: 'B', value: {} }], _metadata: { links: { next: null } } };
        },
    };
    const raw = await fetchItems(client);
    assert.deepEqual(Object.keys(raw), ['1', '2']);
    assert.deepEqual(asked, [['v2/torn/items', null], ['v2/torn/items', '1']]);
});

test('a dead key is not retried against v1', async () => {
    let calls = 0;
    const client = {
        get: async () => {
            calls += 1;
            throw Object.assign(new Error('Incorrect key'), { code: 2 });
        },
    };
    await assert.rejects(() => fetchItems(client));
    assert.equal(calls, 1);
});

test('TornW3B $1 bazaar listings are never offered - Torn locks $1 to a random few', () => {
    const rows = normalizeW3bListings([
        { player_id: 1, price: 1, quantity: 5 },
        { player_id: 2, price: 0.5, quantity: 1 },
        { player_id: 3, price: 2, quantity: 1 },
    ]);
    assert.deepEqual(rows.map((r) => r.sellerId), ['3']);
});

test('Torn\'s trade page is recognised at every step (the panel lists what to send there)', () => {
    assert.equal(isTradePage('https://www.torn.com/trade.php#step=start&userID=11'), true);
    assert.equal(isTradePage('https://www.torn.com/trade.php#step=view&ID=123'), true);
    assert.equal(isTradePage('http://localhost:8765/test/harness-live.html?page=trade#step=view'), true);
    assert.equal(isTradePage('https://www.torn.com/bazaar.php#/'), false);
    assert.equal(isTradePage('https://www.torn.com/page.php?sid=ItemMarket'), false);
});

import { parseTradeItemLine, parseTradeMoney } from '../src/sources/dom/trade.js';
test('Torn\'s trade view: item lines and money, as the real page writes them', () => {
    assert.deepEqual(parseTradeItemLine('Bag of Candy Kisses x1'), { name: 'Bag of Candy Kisses', qty: 1 });
    assert.deepEqual(parseTradeItemLine('Xanax x1,234'), { name: 'Xanax', qty: 1234 });
    assert.deepEqual(parseTradeItemLine('Beretta M9'), { name: 'Beretta M9', qty: 1 });
    assert.equal(parseTradeItemLine('  '), null);
    assert.equal(parseTradeMoney('No money in trade'), 0);
    assert.equal(parseTradeMoney('$14,000,000'), 14000000);
    assert.equal(parseTradeMoney(''), 0);
});
