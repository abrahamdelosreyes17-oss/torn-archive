import {
    KEY_DEAD_CODES,
    TORN_ERROR_RATE_LIMIT,
    TORN_ERROR_IP_BLOCK,
    TornApiError,
} from './client.js';
import { parseInventoryPage, nextInventoryOffset } from '../core/inventory.js';

/*
 * Thin wrappers over the Torn endpoints this tool uses. Every one of these
 * works with a Public access key, except fetchInventory: reading your own
 * inventory needs Limited access, and only the selling page calls it, with
 * the separate key that page keeps.
 */

/** Torn's access levels, lowest first. Public is all the overlay needs. */
export const ACCESS_PUBLIC = 1;
export const ACCESS_LIMITED = 3;

/** "Access level of this key is not high enough". */
export const TORN_ERROR_ACCESS_LEVEL = 16;

export const ACCESS_LEVEL_NAMES = {
    1: 'Public',
    2: 'Minimal',
    3: 'Limited',
    4: 'Full',
};

/**
 * A key too weak for Torn Archive (3.14.3 review): a Public or Minimal key cannot
 * read your inventory. The reason in words, or null. Limited, Full and custom
 * keys (whose level Torn gives as 0) pass - custom keys may include it.
 */
export function keyTooLowForInventory(info) {
    const level = Number(info && info.access_level);
    if (level === 1 || level === 2) return 'That is a ' + ACCESS_LEVEL_NAMES[level] + ' key: Torn Archive needs a Limited key to read your inventory.';
    return null;
}

/**
 * The full item database. Public key.
 *
 * Read from v2 (`/v2/torn/items`), where an item no NPC will buy has
 * `value.sell_price: null` - the game's "Sell: N/A". That null is the whole
 * point: an item without an NPC sell price must never be priced as if an NPC
 * would pay for it. v1 (`torn?selections=items`) is the fallback if v2 fails.
 *
 * Returned in the v1 shape ({ "<id>": { name, sell_price, market_value } })
 * so buildItemIndex has one input format.
 */
export async function fetchItems(client) {
    try {
        return await fetchItemsV2(client);
    } catch (error) {
        // A dead key, a rate limit or an IP block fails v1 the same way; do
        // not ask twice. Anything else (a v2 shape change, an unknown
        // selection) falls back.
        const code = error && Number(error.code);
        if (KEY_DEAD_CODES.has(code) || code === TORN_ERROR_RATE_LIMIT || code === TORN_ERROR_IP_BLOCK) {
            throw error;
        }
    }

    const data = await client.get('torn', { selections: 'items' });

    if (!data || !data.items) {
        throw new Error('Torn API returned no item database.');
    }

    /*
     * v1 has no shop list, so its `sell_price` cannot be checked against a
     * shop in Torn - and it is exactly the field that says a Companion
     * Script sells for $12m. No NPC price from v1 at all: an item with no
     * NPC price is never shown as an NPC deal, which is the safe way to be
     * wrong. `npc_unknown` makes the cache short-lived (items.js), so the
     * real prices return with v2.
     */
    const out = {};
    for (const [id, item] of Object.entries(data.items)) {
        out[id] = { ...item, sell_price: null, npc_shop: null, npc_unknown: true };
    }
    return out;
}

/**
 * What an NPC shop in Torn pays for an item, and which shop.
 *
 * Neither API field is trustworthy alone; each lies differently. Captured
 * live, 2026-09-24, against the game's own "Sell:" line:
 *
 *   item                sell_price  shops                                game
 *   Beretta M9          1300        [Torn  Big Al's       sell 1300]     $1,300
 *   Companion Script    12000000    []                                   N/A
 *   Stick of Dynamite   null        [China General Store  sell 37500]    N/A
 *   Pillow              150         [UAE sell 75, Torn Big Al's sell 150] $150
 *
 * Foreign shops' "sell" is a filler of 75% of their buy price (Dynamite
 * 50,000 -> 37,500; Printing Paper 75,000 -> 56,250) - and nobody can sell
 * abroad anyway: items are bought abroad and sold in Torn. So an item has
 * an NPC buyer only when BOTH hold:
 *
 *   - `sell_price` is a positive number (rules out Dynamite & co.), and
 *   - a shop in Torn lists a positive sell price (rules out the Companion
 *     Scripts and anything sold only abroad).
 *
 * The price is that Torn shop's (preferring the one matching `sell_price`).
 * A payload from before `shops` existed falls back to a vendor in Torn.
 *
 * @returns {{price: number|null, shop: string|null}}
 */
export function npcSaleFromValue(value) {
    const v = value || {};
    const none = { price: null, shop: null };

    /*
     * Torn removes `sell_price`, `buy_price` and `vendor` from value on
     * 2027-01-01, leaving `shops`. Without the field, a shop in Torn that
     * pays a positive price is the NPC price on its own - which gives the
     * same answer as both rules together for every item captured above.
     */
    if (!Object.prototype.hasOwnProperty.call(v, 'sell_price') && Array.isArray(v.shops)) {
        const torn = tornShops(v.shops, 'sell_price');
        return torn.length ? torn.reduce((a, b) => (b.price > a.price ? b : a)) : none;
    }

    const listed = Number(v.sell_price);

    if (!Number.isFinite(listed) || listed <= 0) return none;

    if (Array.isArray(v.shops)) {
        const torn = tornShops(v.shops, 'sell_price');
        if (!torn.length) return none;
        return torn.find((t) => t.price === listed) || torn.reduce((a, b) => (b.price > a.price ? b : a));
    }

    if (v.vendor && v.vendor.country === 'Torn') {
        return { price: listed, shop: v.vendor.name || null };
    }

    return none;
}

/** Shops in Torn (not abroad) with a positive `field` price: [{price, shop}]. */
function tornShops(shops, field) {
    const out = [];
    for (const s of shops || []) {
        const price = Number(s && s[field]);
        if (s && s.country === 'Torn' && Number.isFinite(price) && price > 0) out.push({ price, shop: s.shop || null });
    }
    return out;
}

/** What a shop in Torn sells an item for, from `buy_price` or (after 2027-01-01) `shops`. */
export function shopBuyPriceFromValue(value) {
    const v = value || {};
    if (Object.prototype.hasOwnProperty.call(v, 'buy_price')) return v.buy_price ?? null;
    const torn = tornShops(v.shops, 'buy_price');
    return torn.length ? Math.min(...torn.map((t) => t.price)) : null;
}

/** v2 item list -> v1-shaped map. Follows `_metadata.links.next` if paged. */
export async function fetchItemsV2(client) {
    const out = {};
    let params = { sort: 'ASC' };

    for (let page = 0; page < 20; page += 1) {
        const data = await client.get('v2/torn/items', params);

        if (!data || !Array.isArray(data.items)) {
            throw new Error('Torn API v2 returned no item list.');
        }

        for (const item of data.items) {
            if (!item || !Number.isFinite(Number(item.id))) continue;
            const value = item.value || {};
            const npc = npcSaleFromValue(value);

            out[String(item.id)] = {
                name: item.name,
                type: item.type || null,
                sub_type: item.sub_type || null,
                // null = "Sell: N/A": no NPC shop buys it.
                sell_price: npc.price,
                npc_shop: npc.shop,
                buy_price: shopBuyPriceFromValue(value),
                market_value: value.market_price ?? 0,
                circulation: item.circulation ?? 0,
            };
        }

        const next = data._metadata && data._metadata.links && data._metadata.links.next;
        if (!next) break;

        // Absolute or relative, it is a page of the same list on api.torn.com.
        const nextUrl = new URL(next, 'https://api.torn.com/v2/torn/items');
        params = Object.fromEntries(nextUrl.searchParams);
        delete params.key;
    }

    if (Object.keys(out).length === 0) {
        throw new Error('Torn API v2 returned an empty item list.');
    }

    return out;
}

/**
 * What the current key can actually do.
 *
 * Used only to warn the user when they have pasted in a key with more access
 * than this tool needs. Written so that an unexpected payload shape means
 * "cannot tell" rather than a false alarm or a crash.
 *
 * @returns {{level: number|null, name: string|null}}
 */
export async function fetchKeyAccess(client) {
    try {
        const data = await client.get('key', { selections: 'info' });

        const level = Number(data && data.access_level);
        const name =
            (data && data.access_type) ||
            ACCESS_LEVEL_NAMES[level] ||
            null;

        return {
            level: Number.isFinite(level) ? level : null,
            name,
        };
    } catch {
        // The check is advisory. If it fails, say nothing rather than
        // blocking a key that is probably fine.
        return { level: null, name: null };
    }
}

/**
 * Item Market listings for one item: GET /v2/market/{id}/itemmarket.
 *
 * Public key. "Globally cached selection" - Torn serves everyone the same
 * snapshot and refreshes it no faster than `cache_delay` seconds (30 in every
 * observed response), so asking again before cache_timestamp + cache_delay
 * returns the same rows and only spends quota. The caller uses `nextAt` to
 * avoid that.
 *
 * The response names no seller and no listing id: a row is a price and an
 * amount. So an Item Market hit links to the item, never to a seller.
 *
 * @returns {Promise<{listings: Array<{price: number, amount: number}>,
 *   averagePrice: number|null, cacheTimestamp: number|null, nextAt: number,
 *   total: number}>} cacheTimestamp and nextAt in ms
 */
/** An item's Item Market listings are asked again no sooner than this (Torn caches 30 s). */
export const ITEM_MARKET_MIN_RECHECK_MS = 10000;

export async function fetchItemMarket(
    client,
    itemId,
    { limit = 20, offset = 0, now = Date.now(), tag = null, priority = 'high' } = {},
) {
    const data = await client.get(
        'v2/market/' + encodeURIComponent(String(itemId)) + '/itemmarket',
        { limit, offset },
        { tag, priority },
    );

    const market = (data && data.itemmarket) || {};
    const raw = Array.isArray(market.listings) ? market.listings : [];

    const cacheTs = Number(market.cache_timestamp);
    const cacheDelay = Number(market.cache_delay);
    const cacheTimestamp = Number.isFinite(cacheTs) && cacheTs > 0
        ? cacheTs * 1000
        : null;
    const delayMs = (Number.isFinite(cacheDelay) && cacheDelay > 0
        ? cacheDelay
        : 30) * 1000;

    const average = Number(market.item && market.item.average_price);

    return {
        listings: raw
            .map((l) => ({
                price: Number(l && l.price) || 0,
                amount: Number(l && (l.amount ?? l.quantity)) || 0,
            }))
            .filter((l) => l.price > 0 && l.amount > 0),
        averagePrice: Number.isFinite(average) && average > 0 ? average : null,
        cacheTimestamp,
        // Torn's snapshot renews delayMs after its timestamp. A timestamp that
        // is already old made the item due again on every 3 s tick (the whole
        // feed budget on a few items): never sooner than ITEM_MARKET_MIN_RECHECK_MS.
        nextAt: Math.max((cacheTimestamp || now) + delayMs, now + ITEM_MARKET_MIN_RECHECK_MS),
        total: Number(data && data._metadata && data._metadata.total) || raw.length,
    };
}

/** "Wrong fields" and "Incorrect category": a parameter Torn did not accept. */
export const TORN_ERROR_WRONG_FIELDS = 4;
export const TORN_ERROR_INCORRECT_CATEGORY = 21;

/**
 * The `cat` values /v2/user/inventory accepts: TornInventoryItemType in
 * Torn's published OpenAPI spec (@types/torn-api, components/schemas).
 */
export const TORN_INVENTORY_CATEGORIES = [
    'Collectible', 'Clothing', 'Other', 'Tool', 'Melee', 'Defensive',
    'Material', 'Car', 'Primary', 'Secondary', 'Book', 'Special',
    'Supply Pack', 'Temporary', 'Enhancer', 'Artifact', 'Flower', 'Booster',
    'Medical', 'Candy', 'Jewelry', 'Alcohol', 'Plushie', 'Drug', 'Energy Drink',
];

/** Torn refused the request for want of a (valid) `cat`. */
export function isCategoryError(error) {
    const code = Number(error && error.code);
    if (code === TORN_ERROR_INCORRECT_CATEGORY || code === TORN_ERROR_WRONG_FIELDS) return true;
    return /categor/i.test(String((error && error.message) || ''));
}

/** Every page of one inventory request (with or without a category). */
async function fetchInventoryPages(client, params, limit) {
    const out = [];
    let offset = 0;

    for (let page = 0; page < 40; page += 1) {
        let data;
        try {
            data = await client.get('v2/user/inventory', { ...params, limit, offset }, { tag: 't.inventory', priority: 'normal' });
        } catch (error) {
            if (error && Number(error.code) === TORN_ERROR_ACCESS_LEVEL) {
                throw new TornApiError('This key cannot read your inventory: it needs Limited access.', {
                    code: TORN_ERROR_ACCESS_LEVEL,
                });
            }
            throw error;
        }

        out.push(...parseInventoryPage(data));

        const next = nextInventoryOffset(data);
        if (next === null || next <= offset) break;
        offset = next;
    }

    return out;
}

/**
 * Your own inventory: GET /v2/user/inventory, paged with limit/offset.
 * Needs a LIMITED key; Torn caches it for about an hour per category.
 * Only the selling page calls this, with that page's own key. Error 16
 * (access level too low) is reported as such, never retried.
 *
 * The spec says `cat` is optional, but Torn has been seen to answer
 * "Incorrect category" without it. So: ask once without a category; if that
 * is refused as a category or field error, ask once per category instead
 * (25 calls, each paged, all through the shared limiter) and merge. A
 * category Torn no longer knows is skipped, never fatal.
 *
 * `byCategoryFirst` (Torn Archive: two categories hold every set piece) asks
 * for the named categories straight away, so the refused first try is not
 * spent every hour; only when Torn knows none of them is the whole inventory
 * asked for, and a refusal of that is an error - never an empty inventory.
 *
 * @returns {Promise<Array>} rows from parseInventoryPage, every page
 */
export async function fetchInventory(client, { limit = 250, categories = TORN_INVENTORY_CATEGORIES, byCategoryFirst = false } = {}) {
    if (byCategoryFirst) {
        const rows = [];
        let known = 0;
        for (const cat of categories) {
            try {
                rows.push(...(await fetchInventoryPages(client, { cat }, limit)));
                known += 1;
            } catch (error) {
                if (!isCategoryError(error)) throw error;
            }
        }
        if (known === categories.length) return rows;
        return fetchInventoryPages(client, {}, limit);
    }
    try {
        return await fetchInventoryPages(client, {}, limit);
    } catch (error) {
        if (!isCategoryError(error)) throw error;
    }

    const out = [];
    for (const cat of categories) {
        try {
            out.push(...(await fetchInventoryPages(client, { cat }, limit)));
        } catch (error) {
            if (!isCategoryError(error)) throw error;
        }
    }
    return out;
}

/**
 * The points market (3.24.0): GET /v2/market/pointsmarket. Public data, one call for every listing.
 * The answer is handed back as Torn gives it; core/points.js (parsePointsMarket) reads it, so a shape Torn
 * changes is one place to follow.
 */
export async function fetchPointsMarket(client, { tag = 't.sets', priority = 'low' } = {}) {
    return client.get('v2/market/pointsmarket', {}, { tag, priority });
}

/**
 * Your points, cash on hand and vault (3.24.0): GET /v2/user/money, Limited key.
 * @returns {{points: number|null, onHand: number|null, vault: number|null}} null = Torn did not say
 */
export function parseUserMoney(data) {
    const m = (data && (data.money || data)) || {};
    const pick = (...keys) => {
        for (const k of keys) {
            const v = m[k];
            if (v !== undefined && v !== null && Number.isFinite(Number(v))) return Number(v);
        }
        return null;
    };
    // The names Torn sent ride along (names only), so an answer Torn Archive cannot read can be said in the problem log.
    return { points: pick('points'), onHand: pick('wallet', 'money_onhand', 'cash'), vault: pick('vault', 'vault_amount'), keys: Object.keys(m).slice(0, 20) };
}

export async function fetchMoney(client, { tag = 't.sets', priority = 'low' } = {}) {
    return parseUserMoney(await client.get('v2/user/money', {}, { tag, priority }));
}

/** Torn's list of log types (3.24.0): v1 torn/?selections=logtypes -> { logtypes: { id: title } }. Asked once a week. */
export async function fetchLogTypes(client, { tag = 't.sets', priority = 'low' } = {}) {
    return client.get('torn', { selections: 'logtypes' }, { tag, priority });
}
