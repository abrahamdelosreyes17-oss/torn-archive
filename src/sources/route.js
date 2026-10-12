/*
 * Which Torn page are we on? Pure string work, so it is testable.
 *
 * V1 ran both scanners on every page under `@match .../*`, which is why it
 * lit up on the Items page and in city shops. Here exactly one scanner runs,
 * and on an unrecognised page nothing runs at all.
 *
 * Cut for Torn Archive from Torn Bids 3.24.0 (sources/route.js): the pages
 * Torn Archive reads or marks, and its own page's address in place of Torn
 * Bids'. Profiles and the Item Market's own-listing pages are left behind.
 */

export const PAGE_BAZAAR = 'bazaar';
export const PAGE_ITEM_MARKET = 'itemmarket';
export const PAGE_NONE = null;

/**
 * @param {string} href - normally location.href
 * @returns {'bazaar'|'itemmarket'|null}
 */
export function detectPage(href) {
    if (typeof href !== 'string' || !href) return PAGE_NONE;

    const url = href.toLowerCase();

    // Item Market 2.0 lives behind page.php?sid=ItemMarket; imarket.php is
    // the older path and still redirects for some users.
    if (url.includes('sid=itemmarket') || url.includes('/imarket.php')) {
        return PAGE_ITEM_MARKET;
    }

    // Own bazaar and other players' bazaars, new path and legacy query form.
    if (url.includes('/bazaar.php') || url.includes('page=bazaar')) {
        return PAGE_BAZAAR;
    }

    return PAGE_NONE;
}

/**
 * Torn's trade page (trade.php, any step). `page=trade` is the test
 * harness's stand-in, as `page=bazaar` is for bazaars.
 */
export function isTradePage(href) {
    const url = String(href || '').toLowerCase();
    return url.includes('/trade.php') || /[?&]page=trade(?:[&#]|$)/.test(url);
}

/**
 * Deep link to an item's Item Market page.
 *
 * Used by the panel's navigate button. One click, one navigation - the script
 * never buys anything and never chains a second request off the same click.
 */
export function itemMarketUrl(itemId, itemName) {
    const params = new URLSearchParams({
        itemID: String(itemId),
        itemName: String(itemName || ''),
    });

    return (
        'https://www.torn.com/page.php?sid=ItemMarket#/market/view=search&' +
        params.toString()
    );
}

function queryOf(href) {
    try {
        return new URL(href).searchParams;
    } catch {
        return new URLSearchParams();
    }
}

/**
 * Whose bazaar is this? `bazaar.php?userId=123`. Null for your own bazaar
 * (no userId) or anything unparseable - a sighting with no seller is simply
 * remembered without one.
 */
export function bazaarOwnerId(href) {
    if (detectPage(href) !== PAGE_BAZAAR) return null;

    // Any spelling (userId, userid, userID, USERID): Torn's own links vary, and
    // a missed one made another player's bazaar look like your own.
    let id = null;
    for (const [name, value] of queryOf(href)) {
        if (name.toLowerCase() === 'userid') {
            id = value;
            break;
        }
    }
    return id && /^\d+$/.test(id) ? id : null;
}

/**
 * The listing a feed link asked us to point at: `ttItem` / `ttPrice`, which
 * bazaarUrl() in core/feed.js writes. Highlighting it is reading and marking
 * the page the user opened, which is allowed; nothing is clicked or filled.
 */
export function bazaarTarget(href) {
    if (detectPage(href) !== PAGE_BAZAAR) return null;

    const q = queryOf(href);
    const itemId = q.get('ttItem');
    const price = Number(q.get('ttPrice'));

    if (!itemId || !/^\d+$/.test(itemId)) return null;

    return {
        itemId,
        price: Number.isFinite(price) && price > 0 ? price : null,
    };
}

/**
 * Your OWN bazaar's add-listings (#/add) and manage-listings (#/manage)
 * pages: bazaar.php with no userId, and that hash. Anything else - another
 * player's bazaar, your own storefront - is null. The hash changes without a
 * page load, so callers re-check on hashchange.
 *
 * @returns {'add'|'manage'|null}
 */
export function ownBazaarPage(href) {
    if (typeof href !== 'string' || !href) return null;
    if (detectPage(href) !== PAGE_BAZAAR) return null;
    if (bazaarOwnerId(href)) return null;

    const hash = (href.split('#')[1] || '').toLowerCase().replace(/^\/+/, '').split(/[?&]/)[0];
    if (hash === 'add' || hash.startsWith('add/')) return 'add';
    if (hash === 'manage' || hash.startsWith('manage/')) return 'manage';
    return null;
}

/*
 * Torn Archive's own page, in its own tab, on a page of our own (GitHub
 * Pages), not on Torn: the script draws the page over a blank one there.
 * Nothing on torn.com is loaded for it, and it can be opened and checked like
 * any site.
 */
export const ARCHIVE_PAGE_URL = 'https://abrahamdelosreyes17-oss.github.io/torn-archive/';
/* The test harness boots the page on its own address with this marker (?tarc=archive). */
export const ARCHIVE_PAGE_PARAM = 'tarc';
export const ARCHIVE_PAGE_VALUE = 'archive';

function isTornHost(href) {
    try {
        return /(^|\.)torn\.com$/.test(new URL(href).hostname);
    } catch {
        return false;
    }
}

/** Is this Torn Archive's own page? Its address with or without the last slash or index.html; or the harness's stand-in, never on Torn. */
export function isArchivePageUrl(url) {
    const bare = String(url || '').split(/[?#]/)[0];
    const base = ARCHIVE_PAGE_URL.replace(/\/$/, '');
    if (bare === base || bare === base + '/' || bare === base + '/index.html') return true;
    return queryOf(url).get(ARCHIVE_PAGE_PARAM) === ARCHIVE_PAGE_VALUE && !isTornHost(url);
}

/* ------------------------------------------------------------- Sets (3.24.0) */

/** Torn's museum, the points market, and a trade as you view it. Links only: one press, one page. */
export const MUSEUM_URL = 'https://www.torn.com/museum.php';
export const POINTS_MARKET_URL = 'https://www.torn.com/pmarket.php';
export function tradeViewUrl(tradeId) {
    return 'https://www.torn.com/trade.php#step=view&ID=' + encodeURIComponent(String(tradeId).replace(/\D/g, ''));
}

/** The museum (museum.php). `page=museum` is the test harness's stand-in. */
export function isMuseumPage(href) {
    const url = String(href || '').toLowerCase();
    return url.includes('/museum.php') || /[?&]page=museum(?:[&#]|$)/.test(url);
}

/** The points market (pmarket.php). `page=pmarket` is the harness's stand-in. */
export function isPointsMarketPage(href) {
    const url = String(href || '').toLowerCase();
    return url.includes('/pmarket.php') || /[?&]page=pmarket(?:[&#]|$)/.test(url);
}

/** Your properties (properties.php): the vault tab is one of its pages. `page=vault` is the harness's stand-in. */
export function isVaultPage(href) {
    const url = String(href || '').toLowerCase();
    return url.includes('/properties.php') || /[?&]page=vault(?:[&#]|$)/.test(url);
}

/** Torn's forums (forums.php). `page=forum` is the harness's stand-in. */
export function isForumPage(href) {
    const url = String(href || '').toLowerCase();
    return url.includes('/forums.php') || /[?&]page=forum(?:[&#]|$)/.test(url);
}
