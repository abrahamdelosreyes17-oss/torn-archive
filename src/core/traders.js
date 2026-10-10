/*
 * Our own trader database, and who pays most for each item. Pure: no DOM,
 * no network.
 *
 * Traders publish buy prices in two places:
 *   - TornExchange: every active trader (name + Torn id), the top three
 *     buyers of every item, and an item's full buyer list on request.
 *   - TornW3B: each trader's own price list at weav3r.dev/pricelist/{id}.
 *     TornW3B has no list of traders, so ours is built from TornExchange's
 *     active traders plus every /pricelist/{id} link seen on a TornW3B page
 *     the user opened (its leaderboards, Search Deals).
 *
 * One row per trader per item: a trader on both sites shows once, with both
 * links. When their two lists disagree, the LOWER price is the one counted
 * (ranking, flips, where to sell), and the row is marked `differ`: in a trade
 * the trader pays what they choose, and the owner's friend lost money trading
 * on the higher of two lists (2026-09-26) - one list was stale or bait.
 * Always highest (counted) price first.
 *
 * Cut for Torn Archive from Torn Bids 3.24.0 (core/traders.js). Torn Archive
 * reads TornW3B only (no TornExchange, no key for it): what stayed is a
 * trader's TornW3B list (prices, and the whole-set prices under ids -1 / -2),
 * an item's buyers as one row each (buyersForItem - the lower-of-two-lists
 * rule lives there, its TornExchange inputs simply stay empty), who traded
 * lately, and the two-day rule for a price from an old list. The trader
 * database's upkeep (merge, prune, which list next), TornExchange scans,
 * votes, sorting and the page's own lists are left behind.
 */

export const TRADER_DB_VERSION = 1;

/** A TornW3B list is shown for this long after it was read, then dropped. */
export const W3B_LIST_MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** `seenAt` is written back at most this often (it changes on every read of a source). */
const SEEN_RENEW_MS = 24 * 60 * 60 * 1000;

export function emptyTraderDb() {
    return { version: TRADER_DB_VERSION, traders: {} };
}

/** The stored database, or an empty one when absent or from another version. */
export function readTraderDb(entry) {
    if (!entry || entry.version !== TRADER_DB_VERSION || !entry.traders || typeof entry.traders !== 'object') {
        return emptyTraderDb();
    }
    return entry;
}

function cleanId(id) {
    const s = String(id === null || id === undefined ? '' : id).replace(/\D/g, '');
    return s && s !== '0' ? s : '';
}

/**
 * Add traders we have just learned of (from TornExchange, Torn, or a TornW3B
 * page). Returns true when anything changed. A known trader keeps what we
 * know of their list. Names from TornExchange and Torn are authoritative; a
 * name read off a TornW3B page only fills in a placeholder.
 *
 * @param {object} db
 * @param {Iterable<{id, name, source}>} found
 */
export function addTraders(db, found, now = Date.now()) {
    let changed = false;
    for (const f of found || []) {
        const id = cleanId(f && f.id);
        if (!id) continue;
        const name = f.name ? String(f.name).trim() : '';
        let t = db.traders[id];
        if (!t) {
            t = db.traders[id] = { name: name || 'Trader ' + id, from: f.source || null, seenAt: now, w3b: null };
            changed = true;
        } else if (name && t.name !== name && ((f.source !== 'w3b' && f.source !== 'seed') || t.name.startsWith('Trader '))) {
            t.name = name;
            changed = true;
        }
        // Still named by a source: not one to forget (see pruneTraderDb).
        if (!(now - (t.seenAt || 0) < SEEN_RENEW_MS)) {
            t.seenAt = now;
            changed = true;
        }
        // TornW3B's rating ("523↑ · 7↓"), when the page we read showed it.
        const r = f.rating;
        if (r && Number.isFinite(r.up) && Number.isFinite(r.down) && (!t.rating || t.rating.up !== r.up || t.rating.down !== r.down)) {
            t.rating = { up: r.up, down: r.down, at: now };
            changed = true;
        }
    }
    return changed;
}

/**
 * A TornW3B price list as {itemId: price}: buying prices only (0 means "not
 * buying"), real items only (negative ids are TornW3B's own sets).
 */
export function parseW3bPriceList(body) {
    const prices = {};
    if (!Array.isArray(body)) return prices;
    for (const row of body) {
        const itemId = Number(row && row.itemId);
        const price = Number(row && row.buyPrice);
        if (!Number.isInteger(itemId) || itemId <= 0) continue;
        if (!Number.isFinite(price) || price <= 0) continue;
        prices[String(itemId)] = price;
    }
    return prices;
}

/**
 * A list's set prices: TornW3B gives a whole museum set an id under zero (-1 Flower Set, -2 Plushie Set).
 * parseW3bPriceList leaves them out, as no item has such an id; Sets (3.24.0) reads them here.
 * @returns {object} {"-1": price, "-2": price}, only the ones listed
 */
export function parseW3bSetPrices(body) {
    const sets = {};
    if (!Array.isArray(body)) return sets;
    for (const row of body) {
        const itemId = Number(row && row.itemId);
        const price = Number(row && row.buyPrice);
        if (itemId !== -1 && itemId !== -2) continue;
        if (!Number.isFinite(price) || price <= 0) continue;
        sets[String(itemId)] = price;
    }
    return sets;
}

/** The trader paying the most for a whole set (w3bId -1 or -2), from the lists read: {id, name, price} or null. */
export function bestSetBuyer(db, w3bId) {
    let best = null;
    for (const [id, t] of Object.entries((db && db.traders) || {})) {
        const price = Number(t && t.w3b && t.w3b.sets && t.w3b.sets[String(w3bId)]) || 0;
        if (price > 0 && (!best || price > best.price)) best = { id, name: t.name || 'Trader ' + id, price };
    }
    return best;
}

/** Record the result of reading one trader's TornW3B list. */
export function recordW3bList(db, traderId, result, now = Date.now()) {
    const id = cleanId(traderId);
    if (!id) return;
    if (!db.traders[id]) db.traders[id] = { name: 'Trader ' + id, from: 'w3b', seenAt: now, w3b: null };
    const t = db.traders[id];
    if (result.error) {
        // Not an answer: keep whatever list we had, try again in a while.
        t.w3b = { ...(t.w3b || {}), errorAt: now };
        return;
    }
    const prices = result.prices || {};
    t.w3b = Object.keys(prices).length
        ? { checkedAt: now, at: now, found: true, prices }
        : { checkedAt: now, found: false };
    if (result.sets && Object.keys(result.sets).length) t.w3b.sets = result.sets;
}

/** A trader's TornW3B prices, if read recently enough to show. */
export function liveW3bPrices(trader, now = Date.now()) {
    const w = trader && trader.w3b;
    if (!w || !w.found || !w.prices || !(now - w.at <= W3B_LIST_MAX_AGE_MS)) return null;
    return w.prices;
}

/**
 * Every trader buying one item, one row each, highest price first.
 *
 * @param {string} itemId
 * @param {object} src
 * @param {Array}  [src.teBest]     - TornExchange top three: {name, id, price, score}
 * @param {Array|null} [src.teFull] - TornExchange full list: {name, price}
 * @param {Map}    [src.idsByName]  - lowercase TornExchange name -> torn id
 * @param {object} [src.db]         - the trader database (TornW3B lists)
 * @param {Map}    [src.w3bByItem]  - itemId -> [{id, price}], from indexW3bByItem
 * @param {Array}  [src.teOwn]      - your traders' own whole TornExchange lists (3.14.3):
 *   {id, name, price, lastPaid} - lastPaid: no public list, what they paid you last
 * @returns {Array<{id, name, price, te: number|null, w3b: number|null, teName: string|null}>}
 */
export function buyersForItem(itemId, { teBest = [], teFull = null, idsByName = new Map(), db = null, w3bByItem = null, dbIdsByName = null, votesById = null, teOwn = null, w3bItem = null } = {}) {
    const key = String(itemId);
    const rows = new Map();
    const byName = new Map();

    const row = (id, name) => {
        const k = id ? 'id:' + id : 'name:' + String(name).toLowerCase();
        let r = rows.get(k);
        if (!r) {
            r = { id: id || null, name: name || (id ? 'Trader ' + id : '?'), price: 0, te: null, teTop: null, teList: null, w3b: null, teName: null, votes: null };
            rows.set(k, r);
        }
        if (name && r.name.startsWith('Trader ') && !String(name).startsWith('Trader ')) r.name = name;
        return r;
    };
    // TornExchange's top three and an item's full list are read at different
    // times: when they disagree for one trader, the lower counts (as between
    // the two sites) - the higher may be a price they have since dropped.
    const setTe = (r, name, price, which) => {
        r.teName = name;
        if (!(r[which] >= price)) r[which] = price;
        r.te = r.teTop > 0 && r.teList > 0 ? Math.min(r.teTop, r.teList) : r.teTop || r.teList;
        byName.set(String(name).toLowerCase(), r);
    };

    for (const t of teBest || []) {
        if (!t || !(t.price > 0) || !t.name) continue;
        const lower = String(t.name).toLowerCase();
        const id = cleanId(t.id) || cleanId(idsByName.get(lower)) || cleanId(dbIdsByName && dbIdsByName.get(lower));
        const r = row(id, t.name);
        setTe(r, t.name, t.price, 'teTop');
        // TornExchange's vote score comes with its top buyers.
        if (Number.isFinite(t.score)) r.votes = t.score;
    }
    if (Array.isArray(teFull)) {
        // The full list carries everyone ever listed; once the active traders
        // are known, a name on neither that list nor the top three is an
        // inactive trader and is left out.
        const activeKnown = idsByName && idsByName.size > 0;
        for (const t of teFull) {
            if (!t || !(t.price > 0) || !t.name) continue;
            const lower = String(t.name).toLowerCase();
            const known = byName.get(lower);
            if (!known && activeKnown && !idsByName.has(lower)) continue;
            const id = (known && known.id) || cleanId(idsByName.get(lower)) || cleanId(dbIdsByName && dbIdsByName.get(lower));
            setTe(known || row(id, t.name), t.name, t.price, 'teList');
        }
    }

    // A trader's own whole list counts as their full list. Last-paid prices
    // (no public list) are kept apart and count only when nothing else does.
    for (const t of teOwn || []) {
        if (!t || !(t.price > 0) || !(t.id || t.name)) continue;
        const known = t.name ? byName.get(String(t.name).toLowerCase()) : null;
        const r = rows.get('id:' + cleanId(t.id)) || known || row(cleanId(t.id), t.name);
        if (t.lastPaid) {
            if (!(r.lastPaid >= t.price)) r.lastPaid = t.price;
            continue;
        }
        // Only a real name makes a TornExchange list link.
        if (t.name) setTe(r, t.name, t.price, 'teList');
        else if (!(r.teList >= t.price)) {
            r.teList = t.price;
            r.te = r.teTop > 0 ? Math.min(r.teTop, r.teList) : r.teList;
        }
    }

    const w3b = w3bByItem ? w3bByItem.get(key) || [] : [];
    for (const { id, price } of w3b) {
        const t = db && db.traders[id];
        // The same trader already here by name only (a TornExchange row with
        // no id yet): one row, now with the id.
        let r = rows.get('id:' + id);
        // (No TornExchange row by name at all: nothing to look up - 3.17.1, the same result.)
        if (!r && t && byName.size) {
            const named = byName.get(String(t.name).toLowerCase());
            if (named && !named.id) {
                rows.delete('name:' + String(named.name).toLowerCase());
                named.id = id;
                rows.set('id:' + id, named);
                r = named;
            }
        }
        if (!r) r = row(id, t ? t.name : null);
        if (!(r.w3b >= price)) r.w3b = price;
    }

    // Every TornW3B buyer of this item, read minutes ago (3.15, /traders): its
    // price is the newest, and it names traders we had no list of yet.
    for (const t of w3bItem || []) {
        const id = cleanId(t && t.id);
        if (!id || !(t.price > 0)) continue;
        let r = rows.get('id:' + id);
        if (!r && t.name && byName.size) {
            const named = byName.get(String(t.name).toLowerCase());
            if (named && !named.id) {
                rows.delete('name:' + String(named.name).toLowerCase());
                named.id = id;
                rows.set('id:' + id, named);
                r = named;
            }
        }
        if (!r) r = row(id, t.name || null);
        r.w3b = t.price;
        if (Number.isFinite(t.up) && Number.isFinite(t.down)) r.itemRating = { up: t.up, down: t.down };
    }

    const out = [];
    for (const r of rows.values()) {
        const both = r.te > 0 && r.w3b > 0;
        r.price = both ? Math.min(r.te, r.w3b) : Math.max(r.te || 0, r.w3b || 0);
        // Only what they paid you last: marked, and never above a live price.
        r.lastPaidOnly = !(r.price > 0) && r.lastPaid > 0;
        if (r.lastPaidOnly) r.price = r.lastPaid;
        r.differ = (both && r.te !== r.w3b) || (r.teTop > 0 && r.teList > 0 && r.teTop !== r.teList);
        if (r.price <= 0) continue;
        // What we know of how they trade: TornExchange votes (from any item's
        // top three) and TornW3B's rating.
        if (r.votes === null && r.id && votesById && votesById.has(r.id)) r.votes = votesById.get(r.id);
        const t = r.id && db ? db.traders[r.id] : null;
        r.rating = (t && t.rating) || r.itemRating || null;
        r.trust = trustOf(r.votes, r.rating);
        out.push(r);
    }
    out.sort((a, b) => b.price - a.price || TRADER_NAME_ORDER.compare(String(a.name), String(b.name)));
    return out;
}

/*
 * Names at the same price, in the order String.localeCompare gives them: it
 * is this same collator (the default locale, no options) - made once here
 * instead of once per comparison (3.17.1).
 */
const TRADER_NAME_ORDER = new Intl.Collator();

/**
 * A trader's trust, from the votes other players left after trading with
 * them: TornExchange's vote score and TornW3B's rating (ups minus downs). The
 * better of the two counts, so a trader known on one site only is not
 * marked down for missing from the other.
 *
 *   Trusted  - 100 or more
 *   Known    - 20 or more
 *   New      - 0 to 19
 *   Caution  - below 0
 *   null     - nothing known
 *
 * @returns {{level: string, score: number, votes: number|null, up: number|null, down: number|null}|null}
 */
export function trustOf(votes, rating) {
    const te = Number.isFinite(votes) ? votes : null;
    const w3b = rating && Number.isFinite(rating.up) && Number.isFinite(rating.down) ? rating.up - rating.down : null;
    if (te === null && w3b === null) return null;
    const score = Math.max(te === null ? -Infinity : te, w3b === null ? -Infinity : w3b);
    const level = score >= 100 ? 'Trusted' : score >= 20 ? 'Known' : score >= 0 ? 'New' : 'Caution';
    return { level, score, votes: te, up: rating ? rating.up : null, down: rating ? rating.down : null };
}

/** itemId -> [{id, price}] across every live TornW3B list: one pass, not one per item. */
export function indexW3bByItem(db, now = Date.now()) {
    const out = new Map();
    for (const [id, t] of Object.entries(db.traders)) {
        const prices = liveW3bPrices(t, now);
        if (!prices) continue;
        for (const [itemId, price] of Object.entries(prices)) {
            let list = out.get(itemId);
            if (!list) out.set(itemId, (list = []));
            list.push({ id, price });
        }
    }
    return out;
}

/*
 * "Fresh prices only" (3.22.0; the owner, 2026-10-03: "if the prices are too
 * stale lets say over a day, do not show them in tornbids, it means they are
 * not updating"; then: "2 days update is fine").
 *
 * TornW3B says when each trader last changed their price list
 * (`pricelist_updated`, with every buyer of an item). Measured that day on
 * six items, the top 100 buyers of each: 35 to 42 had changed theirs within a
 * day, about half within three days, and of the ten highest prices two to
 * seven came from lists weeks old - the prices nobody honours.
 *
 * A price is stale when it is that trader's TornW3B price, their list was
 * last changed over two days ago, and TornExchange has no price of theirs for
 * the item (TornExchange gives no date: a price also listed there is left
 * alone). A trader whose list date was never read is not stale - not known
 * is not old.
 */
export const PRICES_STALE_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * @param {{id, w3b, te}} b - a buyer row (buyersForItem)
 * @param {function} listAtOf - (trader id) => when their TornW3B list last changed (ms), 0 when not known
 */
export function stalePrice(b, listAtOf, now = Date.now()) {
    if (!b || !b.id || !(b.w3b > 0) || b.te > 0) return false;
    const at = Number(listAtOf(b.id)) || 0;
    return at > 0 && now - at > PRICES_STALE_MS;
}

/*
 * Who traded lately (3.23.0, the first step on "will this trader actually
 * trade this item"). TornW3B's list of an item's buyers holds 100 at most,
 * highest price first - Xanax had 412 - so the 100 we read were the dearest
 * lists, traded on or not. It can be asked for only those who traded in the
 * last N hours. With Fresh prices only on, an item with more buyers than one
 * answer holds is read both ways in turn - everyone, then those who traded
 * in the last two days (the same two days) - and the two answers are one
 * list: nobody the full read named is lost, and nobody's list date goes
 * unread. No trader is hidden by this; it only finds the ones the cut hid.
 */
export const FRESH_TRADED_HOURS = PRICES_STALE_MS / (60 * 60 * 1000);

/**
 * What the next read of an item's buyers asks for.
 *
 * @param {{at, total, answered?, traders, withinHours}|null} prev - the last read
 * @returns {number|null} hours for "traded within", or null: everyone
 */
export function buyersAsk(prev, { fresh = false } = {}) {
    if (!fresh || !prev || !(Number(prev.at) > 0) || prev.withinHours) return null;
    const answered = Number.isFinite(Number(prev.answered)) ? Number(prev.answered) : (prev.traders || []).length;
    return Number(prev.total) > answered && answered > 0 ? FRESH_TRADED_HOURS : null;
}

/** Two reads of an item's buyers as one list: the newer read of the same trader counts; highest price first. */
export function mergeItemBuyers(older, newer) {
    const byId = new Map();
    for (const t of older || []) if (t && t.id) byId.set(String(t.id), t);
    for (const t of newer || []) if (t && t.id) byId.set(String(t.id), t);
    return [...byId.values()].sort((a, b) => b.price - a.price);
}

/** In an answer asked for "traded within N hours": how many last traded longer ago than that (known ones only). */
export function notTradedLately(traders, hours, now = Date.now()) {
    return (traders || []).filter((t) => t && Number(t.lastTrade) > 0 && now - Number(t.lastTrade) > hours * 60 * 60 * 1000).length;
}

/** "Fresh prices only", order unchanged. */
export function freshOnly(buyers, listAtOf, now = Date.now()) {
    return buyers.filter((b) => !stalePrice(b, listAtOf, now));
}
