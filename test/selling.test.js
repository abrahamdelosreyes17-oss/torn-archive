import test from 'node:test';
import assert from 'node:assert/strict';

import {
    parseInventoryPage,
    mergeInventory,
    nextInventoryOffset,
    makeInventoryCacheEntry,
    readInventoryCacheEntry,
    inventoryRefreshDue,
    INVENTORY_TTL_MS,
    INVENTORY_RETRY_MS,
} from '../src/core/inventory.js';
import { fetchInventory, TORN_ERROR_ACCESS_LEVEL, TORN_INVENTORY_CATEGORIES } from '../src/api/torn.js';
import { TornApiClient } from '../src/api/client.js';
const KEY = 'abcdef1234567890';

function response(status, body) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

/* ============================================================== inventory */

const INVENTORY_PAGE = {
    inventory: {
        items: [
            { id: 206, amount: 12, equipped: false, name: 'Xanax', faction_owned: false, uid: null },
            { id: 206, amount: 3, equipped: false, name: 'Xanax', faction_owned: false, uid: 99 },
            { id: 1, amount: 1, equipped: true, name: 'Hammer', faction_owned: false, uid: 5 },
            { id: 180, amount: 40, equipped: false, name: 'Bottle of Beer', faction_owned: true, uid: null },
            { id: 180, amount: 2, equipped: false, name: 'Bottle of Beer', faction_owned: false, uid: null },
            { id: 'x', amount: 1, name: 'bad' },
            { id: 4, amount: 0, name: 'none' },
        ],
        timestamp: 1790000000,
    },
    _metadata: { links: { next: 'https://api.torn.com/v2/user/inventory?limit=250&offset=250', prev: null }, total: 300 },
};

test('inventory: stacks merge by item, equipped and faction-owned copies are left out', () => {
    const rows = parseInventoryPage(INVENTORY_PAGE);
    assert.equal(rows.length, 5, 'bad rows dropped');

    const merged = mergeInventory(rows);
    assert.deepEqual(merged, [
        { id: '180', name: 'Bottle of Beer', qty: 2 },
        { id: '206', name: 'Xanax', qty: 15 },
    ]);

    assert.equal(nextInventoryOffset(INVENTORY_PAGE), 250);
    assert.equal(nextInventoryOffset({ _metadata: { links: { next: null } } }), null);
    assert.throws(() => parseInventoryPage({}), /no inventory/);
});

test('inventory: the cache expires, and survives a JSON round trip', () => {
    const now = 5_000_000;
    const entry = JSON.parse(JSON.stringify(makeInventoryCacheEntry([{ id: '1', name: 'H', qty: 2 }], now)));
    assert.deepEqual(readInventoryCacheEntry(entry, now + 1000).items, [{ id: '1', name: 'H', qty: 2 }]);
    assert.equal(readInventoryCacheEntry(entry, now + INVENTORY_TTL_MS + 1), null);
    assert.equal(readInventoryCacheEntry(null, now), null);
});

test('fetchInventory pages with limit/offset, only against api.torn.com, and names access level 16', async () => {
    const urls = [];
    const client = new TornApiClient({
        getKey: () => KEY,
        maxRetries: 0,
        fetchImpl: async (url) => {
            urls.push(url);
            const u = new URL(url);
            assert.equal(u.hostname, 'api.torn.com');
            const offset = Number(u.searchParams.get('offset'));
            if (offset === 0) return response(200, INVENTORY_PAGE);
            return response(200, {
                inventory: { items: [{ id: 7, amount: 5, equipped: false, name: 'Seven', faction_owned: false, uid: null }], timestamp: 1 },
                _metadata: { links: { next: null } },
            });
        },
    });

    const rows = await fetchInventory(client);
    assert.equal(urls.length, 2);
    assert.equal(new URL(urls[0]).pathname, '/v2/user/inventory');
    assert.equal(new URL(urls[0]).searchParams.has('cat'), false, 'asked without a category first');
    assert.equal(new URL(urls[0]).searchParams.get('limit'), '250');
    assert.equal(new URL(urls[1]).searchParams.get('offset'), '250');
    assert.equal(rows.length, 6);
    assert.equal(mergeInventory(rows).length, 3);

    const denied = new TornApiClient({
        getKey: () => KEY,
        maxRetries: 0,
        fetchImpl: async () => response(200, { error: { code: 16, error: 'Access level of this key is not high enough' } }),
    });
    await assert.rejects(() => fetchInventory(denied), (e) => e.code === TORN_ERROR_ACCESS_LEVEL && /Limited/.test(e.message));
});

test('fetchInventory: "Incorrect category" without cat falls back to one paged read per category', async () => {
    assert.equal(TORN_INVENTORY_CATEGORIES.length, 25, 'TornInventoryItemType from the OpenAPI spec');
    assert.ok(TORN_INVENTORY_CATEGORIES.includes('Drug') && TORN_INVENTORY_CATEGORIES.includes('Energy Drink'));

    const urls = [];
    const client = new TornApiClient({
        getKey: () => KEY,
        maxRetries: 0,
        fetchImpl: async (url) => {
            urls.push(url);
            const u = new URL(url);
            const cat = u.searchParams.get('cat');
            const offset = Number(u.searchParams.get('offset') || 0);
            if (!cat) return response(200, { error: { code: 21, error: 'Incorrect category' } });
            if (cat === 'Artifact') return response(200, { error: { code: 21, error: 'Incorrect category' } });
            if (cat === 'Drug') {
                return offset === 0
                    ? response(200, { inventory: { items: [{ id: 206, amount: 12, name: 'Xanax' }] }, _metadata: { links: { next: 'https://api.torn.com/v2/user/inventory?cat=Drug&limit=250&offset=250' } } })
                    : response(200, { inventory: { items: [{ id: 206, amount: 3, name: 'Xanax' }] }, _metadata: { links: { next: null } } });
            }
            if (cat === 'Tool') return response(200, { inventory: { items: [{ id: 1, amount: 4, name: 'Hammer' }] }, _metadata: { links: { next: null } } });
            return response(200, { inventory: { items: [] }, _metadata: { links: { next: null } } });
        },
    });

    const rows = await fetchInventory(client);
    assert.equal(urls.length, 1 + TORN_INVENTORY_CATEGORIES.length + 1, 'one try without, then every category, Drug paged');
    const cats = urls.slice(1).map((u) => new URL(u).searchParams.get('cat'));
    assert.deepEqual([...new Set(cats)], TORN_INVENTORY_CATEGORIES);
    assert.deepEqual(mergeInventory(rows), [
        { id: '1', name: 'Hammer', qty: 4 },
        { id: '206', name: 'Xanax', qty: 15 },
    ]);

    // Any other error is not a reason to loop the categories.
    let calls = 0;
    const down = new TornApiClient({
        getKey: () => KEY,
        maxRetries: 0,
        fetchImpl: async () => (calls++, response(200, { error: { code: 9, error: 'API disabled' } })),
    });
    await assert.rejects(() => fetchInventory(down), /API disabled/);
    assert.equal(calls, 1);
});

test('inventory refresh: old is due, a failure waits its retry time, a rejected key waits for a new key', () => {
    const now = 1_900_000_000_000;
    const old = now - 16 * 60 * 1000;
    const ttl = 15 * 60 * 1000;
    assert.equal(inventoryRefreshDue({ inventoryAt: old, now, refreshMs: ttl }), true);
    assert.equal(inventoryRefreshDue({ inventoryAt: now - 1000, now, refreshMs: ttl }), false);
    assert.equal(inventoryRefreshDue({ inventoryAt: null, now, refreshMs: ttl }), true, 'never loaded: due');
    assert.equal(inventoryRefreshDue({ inventoryAt: old, retryAt: now + INVENTORY_RETRY_MS - 15000, now, refreshMs: ttl }), false, 'not every 15s after a failure');
    assert.equal(inventoryRefreshDue({ inventoryAt: old, retryAt: now - 1, now, refreshMs: ttl }), true);
    assert.equal(inventoryRefreshDue({ inventoryAt: old, keyDead: true, now, refreshMs: ttl }), false);
    assert.ok(INVENTORY_RETRY_MS >= 5 * 60 * 1000);
});

/* ========================================================== TornExchange */

const BEST = {
    status: 'success',
    data: {
        206: {
            item: 'Xanax',
            traders: [
                { trader: 'Bob', trader_id: 11, price: 820000, vote_score: 214 },
                { trader: 'Alice', trader_id: '12', price: 830000, vote_score: 40 },
                { trader: 'Stale', trader_id: 13, price: 990000, vote_score: 3 },
            ],
        },
        1: { item: 'Hammer', traders: [{ trader: 'Bob', trader_id: 11, price: 110, vote_score: 214 }] },
        bad: { item: 'x', traders: [] },
        2: { item: 'Junk', traders: [{ trader: 'NoId', price: 5 }, { trader: 'Zero', trader_id: 9, price: 0 }] },
    },
};

const LISTINGS = {
    status: 'success',
    data: {
        item: 'Xanax',
        meta: { total_listings: 4, total_pages: 1, current_page: 1 },
        listings: [
            { trader: 'Stale', price: 990000, item: 'Xanax' },
            { trader: 'Carol', price: 800000, item: 'Xanax' },
            { trader: 'Alice', price: 830000, item: 'Xanax' },
            { trader: 'Bob', price: 820000, item: 'Xanax' },
            { trader: '', price: 1 },
        ],
    },
};
