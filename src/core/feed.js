/*
 * Listings made usable. Pure - no DOM, no network, no storage.
 *
 * Cut for Torn Archive from Torn Bids 3.24.0 (core/feed.js): only what turns
 * TornW3B's and the Item Market's rows into ours, and the link to a bazaar.
 * The live feed itself (candidates, snapshots, expiry) is left behind.
 *
 * The rule the rows keep, learned the hard way: a listing is only as live as
 * the data behind it. `dataAt` is when the SOURCE last saw it (TornW3B's
 * last_checked), never when we asked.
 */

/** Seconds, milliseconds, or nothing -> ms or null. Unknown is not "old". */
function toMs(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n < 1e12 ? n * 1000 : n;
}

/**
 * TornW3B listings -> feed rows. Rows with no seller are dropped: there is
 * nowhere to send the user, and "bazaar.php?userId=null" is not a link.
 * Sorted by price ourselves - TornW3B puts sponsored rows first.
 */
export function normalizeW3bListings(raw) {
    const rows = [];

    for (const l of raw || []) {
        if (!l) continue;

        const sellerId = Number(l.player_id);
        const price = Number(l.price);
        const qty = Number(l.quantity);

        if (!Number.isFinite(sellerId) || sellerId <= 0) continue;
        if (!Number.isFinite(price) || price <= 0) continue;
        if (!Number.isFinite(qty) || qty <= 0) continue;
        /*
         * $1 is Torn's locked "Dollar Sale" price: buyable by a random few
         * percent of players, and the usual price of a target trade meant for
         * one person. TornW3B cannot say which, so none are offered from the
         * feed. (On the page itself, an unlocked $1 card IS yours to buy and
         * is read normally.)
         */
        if (price <= 1) continue;

        rows.push({
            sellerId: String(sellerId),
            sellerName: l.player_name ? String(l.player_name) : null,
            price,
            qty: Math.floor(qty),
            dataAt: toMs(l.last_checked) || toMs(l.content_updated),
            changedAt: toMs(l.content_updated),
            // A paid spot on TornW3B: never the listing Fill undercuts.
            sponsored: Boolean(l.sponsored),
        });
    }

    rows.sort((a, b) => a.price - b.price);
    return rows;
}

/** Item Market rows are anonymous; identical prices are merged. */
export function normalizeItemMarketRows(listings) {
    const byPrice = new Map();

    for (const l of listings || []) {
        const price = Number(l && l.price);
        const amount = Number(l && l.amount);
        if (!(price > 0) || !(amount > 0)) continue;
        byPrice.set(price, (byPrice.get(price) || 0) + amount);
    }

    return [...byPrice.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([price, qty]) => ({ price, qty }));
}

/** Deep link to one seller's bazaar, carrying what to highlight there. */
export function bazaarUrl(sellerId, itemId, price) {
    const params = new URLSearchParams({ userId: String(sellerId) });
    if (itemId) params.set('ttItem', String(itemId));
    if (price) params.set('ttPrice', String(price));
    return 'https://www.torn.com/bazaar.php?' + params.toString() + '#/';
}
