/*
 * The profit model. Pure functions, no DOM.
 *
 * One formula, venue is a parameter:
 *
 *     net_per_unit = exit_price * (1 - fee) - listing_price
 *
 * V1 hardcoded the NPC route (fee 0) and labelled ROI as "margin". Both are
 * fixed here, and the fee parameter is in place from the start so the Item
 * Market and Auction House routes do not mean touching every call site later.
 *
 * Cut for Torn Archive from Torn Bids 3.24.0 (core/profit.js): the fee table
 * and "enough profit". computeOpportunity / bestVenue are left behind.
 */

/**
 * Sale fees by exit venue, as a fraction of the sale price.
 *
 * - NPC: shops pay the listed sell_price with no tax.
 * - ITEM_MARKET: 5% sales tax (introduced 22 June 2025).
 * - BAZAAR_RESALE: relisting in your own bazaar carries no tax.
 * - ITEM_MARKET_ANON: listing anonymously adds a further 10%, so 15% total.
 * - AUCTION_HOUSE: 3%.
 *
 * These are game-balance numbers and Torn has changed them before, so they
 * live in one place where a change is a one-line edit.
 */
export const VENUE_FEES = {
    NPC: 0,
    ITEM_MARKET: 0.05,
    // Relisting in your own bazaar: no sales tax. The price is still an
    // estimate - someone has to buy it at market value.
    BAZAAR_RESALE: 0,
    ITEM_MARKET_ANON: 0.15,
    AUCTION_HOUSE: 0.03,
    // A player trader (TornExchange price list): paid in the trade, no tax.
    // An offer, not a guarantee - see core/traders.js.
    TRADER: 0,
};

/**
 * The least a deal must make per item when it is NOT sold to an NPC, as a
 * percent of what you pay. An NPC shop pays its price every time, so $1 is a
 * real profit there; a trader, your bazaar or the Item Market is a person
 * who may pay less or never buy, so a $1 margin on a $140,000 item is noise
 * (the owner, 2026-09-27: "$1 is only for NPC").
 */
export const MIN_PROFIT_PCT = 1;

/** Does this profit per item clear the bar for its venue? NPC: any profit; anything else: MIN_PROFIT_PCT. */
export function enoughProfit(profitPerUnit, listingPrice, venue, pct = MIN_PROFIT_PCT) {
    if (!(profitPerUnit > 0)) return false;
    if (venue === 'NPC') return true;
    const p = Number(pct);
    return profitPerUnit >= Math.max(1, (listingPrice * (Number.isFinite(p) && p >= 0 ? p : MIN_PROFIT_PCT)) / 100);
}
