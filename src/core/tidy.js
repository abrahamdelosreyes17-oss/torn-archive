/*
 * Stored data nobody uses is deleted (3.17.0; the owner: "... and will
 * delete any unused memory").
 *
 * Several stored values hold entries with a life: an accepted trade a day,
 * a pin, a gone mark half an hour, a leftover a week. Every reader already
 * passes over the expired ones - but they stayed in storage until that value
 * was next written, and the browser hands every stored value to the script
 * on every page. About once an hour one tab now writes each such value back
 * without what has expired.
 *
 * The rule each function keeps: what a reader gets from the tidied value is
 * exactly what it gets from the stored one (test/tidy.test.js proves it for
 * each). The same object comes back when nothing goes, so nothing is written.
 *
 * Pure: no storage, no clock of its own.
 *
 * Cut for Torn Archive from Torn Bids 3.24.0 (core/tidy.js): the helper
 * (tidyKeep, exported here so new rules can be written with it) and the three
 * rules whose readers came along in core/flips.js. Torn Bids' other rules
 * (accepted trades, pins, declined, asked, ended, To sell, leftovers,
 * TornExchange lists) are left behind.
 */

import { liveGone, liveStock, liveBought } from './flips.js';

/** `stored` with only the keys a reader still returns; `stored` itself when all are kept. */
export function tidyKeep(stored, live) {
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return stored;
    const keys = Object.keys(stored);
    const keep = keys.filter((k) => Object.prototype.hasOwnProperty.call(live, k));
    if (keep.length === keys.length) return stored;
    const out = {};
    for (const k of keep) out[k] = stored[k];
    return out;
}

/** Gone marks: half an hour (core/flips.js liveGone). */
export function tidyGone(stored, now = Date.now()) {
    return tidyKeep(stored, liveGone(stored, now));
}

/** Page stocks: half an hour (core/flips.js liveStock). */
export function tidyStock(stored, now = Date.now()) {
    return tidyKeep(stored, liveStock(stored, now));
}

/** Your own buys: half an hour (core/flips.js liveBought - a list). */
export function tidyBought(stored, now = Date.now()) {
    if (!Array.isArray(stored)) return stored;
    const live = liveBought(stored, now);
    return live.length === stored.length ? stored : live;
}
