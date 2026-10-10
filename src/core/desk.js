/*
 * Which item the desk shows, and which TornW3B read comes next (3.14).
 * Pure: no DOM, no network.
 *
 * Cut for Torn Archive from Torn Bids 3.24.0 (core/desk.js): the hidden-tab
 * paces and which TornW3B read comes next. The desk item, declined trades and
 * the freshness settings are left behind.
 */

/*
 * In the background (3.14, the owner: "can we do it automatically?"): Torn
 * Bids keeps reading TornExchange and TornW3B while its tab is hidden, and
 * works out the flips now and then, so the page is current when you look at
 * it. Torn API calls stay in-view only.
 *
 * 3.14.3: 3.14.1 allowed 6 reads a minute and gave every other one to a
 * trader's price list (2,482 of them), so a hidden page had checked 3 of 30
 * possible flips after five minutes (the owner's page). Hidden, the flips now
 * come before the price lists (nextW3bRead's `hidden`), at 20 reads a minute -
 * still below the in-view 24 - so all 30 are checked within two minutes.
 */
export const W3B_HIDDEN_PER_MIN = 40;
/* Of those, price lists at most this many (3.14.1's pace): a page that loads
 * hidden has no possible flips yet, and the lists took the whole minute's reads
 * in five seconds - the flips, found a moment later, waited a minute. */
export const W3B_HIDDEN_LISTS_PER_MIN = 12;
export const HIDDEN_RENDER_MS = 30 * 1000;

/** May a hidden tab make another TornW3B read now? `recent`: its reads' times. */
export function backgroundSlot(recent, now, perMinute = W3B_HIDDEN_PER_MIN) {
    return (recent || []).filter((t) => now - t < 60000).length < perMinute;
}

/** Hidden, may the next read be a price list? `lists`: the lists' read times. */
export function backgroundListSlot(lists, now) {
    return backgroundSlot(lists, now, W3B_HIDDEN_LISTS_PER_MIN);
}

/**
 * The next TornW3B read. The summary when old; the item on the desk; then -
 * only while you work on a trade (picked, held or pinned) - that trade's
 * items; then the possible flips and the traders' price lists taking
 * turns; then, with no trade under way, the unread items of the trade the
 * desk shows; then pinned trades' items (their profit on the list).
 *
 * Before 3.14 the desk's trade came before the possible flips even when
 * nobody was using it: the trade read up to 30 items for twelve traders'
 * totals first, the flips waited (Bazaars "checked 12/30"), and a flip only
 * counts once its bazaars are read - the big ones stayed unconfirmed.
 *
 * @param {object} p
 * @param {boolean} p.summaryDue
 * @param {string|null} p.picked - the item on the desk
 * @param {boolean} p.active - a trade under way (you picked, or it is held or pinned)
 * @param {string[]} p.live - the trade's items, kept live
 * @param {string[]} p.wanted - its items not read yet
 * @param {string[]} p.candidates - possible flips, best first
 * @param {string[]} p.pinned - pinned trades' items
 * @param {string|null} p.list - the next trader price list due, or null
 * @param {number} p.turn - 0 or 1: flips and lists take turns (in view)
 * @param {boolean} p.hidden - the tab is hidden: flips before lists
 * @param {function} p.due - (itemId, 'desk' | 'slow') => boolean
 * @param {string[]} [p.buyers] - items whose every-buyer list (TornW3B /traders) may be read: the desk's, then the possible flips' (3.15)
 * @param {function} [p.buyersDue] - (itemId) => boolean
 * @param {string[]} [p.near] - near-misses: a bazaar a little over the best bid (the summary lags), 3.15
 * @param {string[]} [p.sweep] - every other item anyone buys, oldest read first: what is left of the budget (3.15)
 * @returns {null|{kind: 'summary'}|{kind: 'bazaars', id: string}|{kind: 'buyers', id: string}|{kind: 'list', id: string}}
 */
export function nextW3bRead({ summaryDue = false, picked = null, active = false, live = [], wanted = [], candidates = [], pinned = [], list = null, turn = 0, hidden = false, due, buyers = [], buyersDue = () => false, near = [], sweep = [] }) {
    if (summaryDue) return { kind: 'summary' };
    if (picked && due(picked, 'desk')) return { kind: 'bazaars', id: picked };
    if (picked && buyers.includes(picked) && buyersDue(picked)) return { kind: 'buyers', id: picked };
    if (active) {
        const l = live.find((id) => due(id, 'desk'));
        if (l) return { kind: 'bazaars', id: l };
        const w = wanted.find((id) => due(id, 'slow'));
        if (w) return { kind: 'bazaars', id: w };
    }
    const cand = candidates.find((id) => due(id, 'slow'));
    const buy = buyers.find((id) => buyersDue(id));
    // Hidden, the flips first: the price lists can wait until you look.
    if (cand && (turn || !list || hidden)) return { kind: 'bazaars', id: cand };
    if (buy && (turn || !list || hidden)) return { kind: 'buyers', id: buy };
    if (list) return { kind: 'list', id: list };
    if (cand) return { kind: 'bazaars', id: cand };
    if (buy) return { kind: 'buyers', id: buy };
    const n = near.find((id) => due(id, 'slow'));
    if (n) return { kind: 'bazaars', id: n };
    if (!active) {
        const w = wanted.find((id) => due(id, 'slow'));
        if (w) return { kind: 'bazaars', id: w };
    }
    const p = pinned.find((id) => due(id, 'slow'));
    if (p) return { kind: 'bazaars', id: p };
    const sw = sweep.find((id) => due(id, 'sweep'));
    if (sw) return { kind: 'bazaars', id: sw };
    return null;
}
