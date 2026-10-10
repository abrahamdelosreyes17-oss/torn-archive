import test from 'node:test';
import assert from 'node:assert/strict';

import { parseMoney, parseQuantity, formatMoney, formatMoneyShort, formatMoneyCompact, formatPct } from '../src/core/parse.js';
import {
    buildItemIndex,
    findItemByName,
    findItemById,
    normalizeItemName,
    makeItemsCacheEntry,
    isItemsCacheFresh,
    ITEMS_TTL_MS,
    itemCategory,
    categoryCounts,
} from '../src/core/items.js';
import { detectPage, itemMarketUrl } from '../src/sources/route.js';
import { parseBuyLabel, isOneItemListing } from '../src/sources/dom/scan.js';
import { itemIdFromImage } from '../src/sources/dom/detect.js';
/* ---------------------------------------------------------------- parse */

test('parseMoney handles Torn price formats', () => {
    assert.equal(parseMoney('$2,896'), 2896);
    assert.equal(parseMoney('806000'), 806000);
    assert.equal(parseMoney('$1.2m'), 1200000);
    assert.equal(parseMoney('$1.5k'), 1500);
    assert.equal(parseMoney(''), null);
    assert.equal(parseMoney('no price here'), null);
    assert.equal(parseMoney(null), null);
});

test('parseQuantity reads the Torn quantity forms', () => {
    assert.equal(parseQuantity('x12'), 12);
    assert.equal(parseQuantity('12x'), 12);
    assert.equal(parseQuantity('400 available'), 400);
    assert.equal(parseQuantity('Qty: 3'), 3);
    assert.equal(parseQuantity('none'), null);
    assert.equal(parseQuantity(null), null);
});

test('formatters', () => {
    assert.equal(formatMoney(1234.6), '$1,235');
    assert.equal(formatMoney(-500), '-$500');
    assert.equal(formatMoneyShort(1200000), '$1.20m');
    assert.equal(formatMoneyShort(34000), '$34.0k');
    assert.equal(formatPct(0.042), '4.2%');
    assert.equal(formatPct(NaN), '-');
});

/* --------------------------------------------------------------- ranker */

function row(name, realizable, roi, opts = {}) {
    return {
        name,
        npcVerified: opts.npcVerified !== false,
        profit: {
            realizableProfit: realizable,
            cashRequired: opts.cashRequired || 0,
            roi,
        },
    };
}

/* ---------------------------------------------------------------- items */

const RAW_ITEMS = {
    206: { name: 'Xanax', sell_price: 540, market_value: 800000, type: 'Drug' },
    218: { name: 'Small First Aid Kit', sell_price: 150, type: 'Medical' },
    1: { name: 'Hammer', sell_price: 10, type: 'Melee' },
    999: { sell_price: 5 },
};

test('the item index is built once and looked up by Map', () => {
    const index = buildItemIndex(RAW_ITEMS);

    assert.equal(index.size, 3); // the nameless entry is dropped
    assert.equal(findItemByName(index, 'xanax').id, '206');
    assert.equal(findItemByName(index, '  XANAX  ').id, '206');
    assert.equal(findItemById(index, 218).name, 'Small First Aid Kit');
    assert.equal(findItemByName(index, 'Xanax Pills'), null);
});

test('normalizeItemName collapses whitespace and case', () => {
    assert.equal(normalizeItemName('  Small   First Aid Kit '), 'small first aid kit');
    assert.equal(normalizeItemName(null), '');
});

test('item cache respects version and TTL', () => {
    const now = 1_000_000_000_000;
    const entry = makeItemsCacheEntry(RAW_ITEMS, now);

    assert.equal(isItemsCacheFresh(entry, now), true);
    assert.equal(isItemsCacheFresh(entry, now + ITEMS_TTL_MS + 1), false);
    assert.equal(isItemsCacheFresh({ ...entry, version: 'old' }, now), false);
    assert.equal(isItemsCacheFresh(null, now), false);
});

/* ------------------------------------------------------------------ npc */

const RAW_SHOPS = {
    1: {
        name: "Bits 'n' Bobs",
        inventory: { 1: { name: 'Hammer', price: 15 } },
    },
    2: { name: 'Pharmacy', inventory: { 218: { name: 'SFAK', price: 200 } } },
    3: { name: 'Broken', inventory: null },
};

/* ---------------------------------------------------------------- route */

test('exactly one page type is detected, and unrelated pages get none', () => {
    assert.equal(detectPage('https://www.torn.com/bazaar.php'), 'bazaar');
    assert.equal(
        detectPage('https://www.torn.com/bazaar.php?userId=1234'),
        'bazaar',
    );
    assert.equal(
        detectPage('https://www.torn.com/index.php?page=bazaar&userId=1'),
        'bazaar',
    );
    assert.equal(
        detectPage('https://www.torn.com/page.php?sid=ItemMarket'),
        'itemmarket',
    );
    assert.equal(detectPage('https://www.torn.com/imarket.php#/'), 'itemmarket');

    // V1 lit up on all of these.
    assert.equal(detectPage('https://www.torn.com/item.php'), null);
    assert.equal(detectPage('https://www.torn.com/shops.php?step=bitsnbobs'), null);
    assert.equal(detectPage('https://www.torn.com/'), null);
    assert.equal(detectPage(''), null);
});

test('itemMarketUrl encodes the item safely', () => {
    const url = itemMarketUrl(206, 'Xanax');
    assert.ok(url.startsWith('https://www.torn.com/page.php?sid=ItemMarket#/'));
    assert.ok(url.includes('itemID=206'));
    assert.ok(url.includes('itemName=Xanax'));
});

/* ------------------------------------------- regressions (Fable review) */

test('a trailing letter is not a magnitude suffix', () => {
    // "$2,896 Buy" collapsed to "2896Buy"; the B was read as billions.
    assert.equal(parseMoney('$2,896 Buy'), null);
    assert.equal(parseMoney('$3,000 min'), null);
    assert.equal(parseMoney('$500 market'), null);

    // Real suffixes still work.
    assert.equal(parseMoney('$1.2m'), 1200000);
    assert.equal(parseMoney('$2,896'), 2896);
});

test('a price is never mistaken for a quantity', () => {
    // A price cell whose class contained "amount" became the quantity:
    // parseQuantity('$2,896') returned 2896, inflating total profit ~3000x.
    assert.equal(parseQuantity('$2,896'), null);
    assert.equal(parseQuantity('$540'), null);

    // Genuine quantity cells still read correctly.
    assert.equal(parseQuantity('12 available'), 12);
    assert.equal(parseQuantity('Available: 12'), 12);
    assert.equal(parseQuantity('x12'), 12);

    /*
     * React concatenates sibling text with no separator, so a whole row reads
     * "$2,89612 available". That string is genuinely ambiguous and this
     * function does not pretend otherwise - scan.js reads leaf elements
     * individually so it never has to ask.
     */
    assert.equal(parseQuantity('$2,89612 available'), null);
});

/* ------------------------------ DOM parsing (from real Torn markup) */

test('the buy control aria label yields name, price and quantity', () => {
    // Observed on the Item Market seller listings, 2026-09-23.
    const parsed = parseBuyLabel('Buy item Hammer, $100, 1 in total.');

    assert.equal(parsed.name, 'Hammer');
    assert.equal(parsed.price, 100);
    assert.equal(parsed.qty, 1);
});

test('large prices and quantities in the aria label parse correctly', () => {
    const parsed = parseBuyLabel(
        'Buy item Business Class Ticket, $8,269,074, 18 in total.',
    );

    assert.equal(parsed.name, 'Business Class Ticket');
    assert.equal(parsed.price, 8269074);
    assert.equal(parsed.qty, 18);
});

test('the bare aria label yields a name only', () => {
    // Observed on the aggregate Item Market list view.
    const parsed = parseBuyLabel('Buy: Xanax');

    assert.equal(parsed.name, 'Xanax');
    assert.equal(parsed.price, null);
    assert.equal(parsed.qty, null);
});

test('a non-buy aria label is rejected rather than half-read', () => {
    assert.equal(parseBuyLabel('View info for item Hammer.'), null);
    assert.equal(parseBuyLabel('Add friendliest $1/2 bazaar to favorites'), null);
    assert.equal(parseBuyLabel(''), null);
    assert.equal(parseBuyLabel(null), null);
});

test('the item id comes from the image path', () => {
    const img = {
        getAttribute: (name) =>
            name === 'src' ? '/images/items/206/large.png' : null,
    };

    assert.equal(itemIdFromImage(img), '206');

    const srcsetOnly = {
        getAttribute: (name) =>
            name === 'srcset'
                ? '/images/items/1/large.png 1x, /images/items/1/large@2x.png 2x'
                : null,
    };

    assert.equal(itemIdFromImage(srcsetOnly), '1');

    // An avatar is not an item image - this is what the bazaar directory
    // page is full of.
    const avatar = {
        getAttribute: () => 'https://avatars.torn.com/48X48_abc-123.png',
    };

    assert.equal(itemIdFromImage(avatar), null);
    assert.equal(itemIdFromImage(null), null);
});

test('compact money drops only zeros that say nothing', () => {
    assert.equal(formatMoneyCompact(1500000), '$1.5m');
    assert.equal(formatMoneyCompact(25000000), '$25m');
    assert.equal(formatMoneyCompact(1234567), '$1.23m');
    assert.equal(formatMoneyCompact(1050000), '$1.05m');
    assert.equal(formatMoneyCompact(12000), '$12k');
    assert.equal(formatMoneyCompact(12500), '$12.5k');
    assert.equal(formatMoneyCompact(2e9), '$2b');
    assert.equal(formatMoneyCompact(1), '$1');
});

/*
 * The owner's report (3.10.2): Min $1,000 on the Item Market, a Fiveseven at
 * $6,615 -> NPC $7,500 (+$885 each) stayed green and listed, never amber.
 * The card was read as "qty unknown", and Min is not applied to those. A
 * weapon card is one item with its own stats ("53.47 damage points"), Buy
 * label "1 in total" - read off the owner's page.
 */
test('a weapon or armour card on the Item Market is one item, known', () => {
    const buy = parseBuyLabel('Buy item Fiveseven, $6615, 1 in total.');
    assert.equal(isOneItemListing(['View info for item Fiveseven.', '53.47 damage points', '49.31 accuracy points'], buy), true);
    assert.equal(isOneItemListing(['42.10 armor points'], null), true);
    // Xanax: one tile for the whole market, no stats.
    assert.equal(isOneItemListing(['View info for item Xanax.'], parseBuyLabel('Buy item Xanax, $879000, 13531 in total.')), false);
    // Stats but more than one in total: not a single item after all.
    assert.equal(isOneItemListing(['53.47 damage points'], parseBuyLabel('Buy item Fiveseven, $6615, 3 in total.')), false);
});

test('an item\'s category is Torn\'s own item type, else Other', () => {
    const idx = buildItemIndex({ 206: { name: 'Xanax', type: 'Drug' }, 1: { name: 'Mystery' } });
    assert.equal(itemCategory(findItemById(idx, 206)), 'Drug');
    assert.equal(itemCategory(findItemById(idx, 1)), 'Other');
    assert.equal(itemCategory(null), 'Other');
});

test('category counts: most first, then by name; a picked category is never dropped', () => {
    const cats = ['Drug', 'Plushie', 'Plushie', 'Medical', 'Drug', 'Plushie', 'Alcohol'];
    assert.deepEqual(categoryCounts(cats), [
        { category: 'Plushie', count: 3 },
        { category: 'Drug', count: 2 },
        { category: 'Alcohol', count: 1 },
        { category: 'Medical', count: 1 },
    ]);
    // Picked, but its items are still loading: listed with 0, not lost.
    assert.deepEqual(categoryCounts(['Drug'], 'Flower'), [
        { category: 'Drug', count: 1 },
        { category: 'Flower', count: 0 },
    ]);
    assert.deepEqual(categoryCounts([], ''), []);
});
