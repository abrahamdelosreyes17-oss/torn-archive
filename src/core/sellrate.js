// What you pay your sellers, worked out from your least profit. Pure working-out: no page, no storage, no clock.
//
// The owner, 2026-10-12. You type two things: the most you pay (a percent of market value) and your least profit.
// What you really pay a set is the lower of that rate and the set's ceiling - the highest rate at which ten points
// still leave your least profit - at a cautious points price: the lower of today's and what you usually sell
// points for. The whole price table is fixed once an hour while your shop is open ("maybe it checks the points
// every hour"), and inside the hour it only ever comes down: when the points price falls under your least profit.
// The points market takes no fee (his word), so nothing is taken off for one.

import { setMarketValue, setValue, ratePrice } from './sets.js';

const srNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const srWhole = (v) => Math.max(0, Math.floor(srNum(v)));

/** How long a fixed price table stands. A wait, not a price. */
export const RATE_HOUR_MS = 3600000;
/** Another buyer's price read longer ago than this counts for nothing. */
export const BID_KEEPS_MS = 24 * 3600000;
/** ... and is said with its age from here on. */
export const BID_OLD_MS = 3600000;

/**
 * One idea of what a point is worth: the lower of today's points price and the price you usually sell at. With no
 * usual price known, today's.
 * @returns { price, from: 'today' | 'usual' | '', today, usual, high } - `high` is the other, higher one of the two
 */
export function cautiousPrice(today, usual) {
    const t = srWhole(today);
    const u = srWhole(usual);
    if (!t) return { price: 0, from: '', today: 0, usual: u, high: 0 };
    if (!u || u >= t) return { price: t, from: 'today', today: t, usual: u, high: u > t ? u : t };
    return { price: u, from: 'usual', today: t, usual: u, high: t };
}

/** The highest rate (percent of market value, a tenth, rounded DOWN) that still leaves the least profit. 0: not known. */
export function rateCeiling(market, value, leastPct = 0) {
    return market > 0 && value > 0 ? Math.floor(value / (1 + Math.max(0, srNum(leastPct)) / 100) / market * 1000) / 10 : 0;
}

/** What you pay: the lower of the most you pay and the ceiling. With no ceiling known, the most you pay. */
export const paidRate = (typed, cap) => (cap > 0 ? Math.min(srNum(typed), cap) : srNum(typed));

/** The settings a price table rests on: changed by your own press, the table is fixed anew at once. */
export const rateKey = (settings) => JSON.stringify([settings.pct, settings.least, settings.which.plushie !== false, settings.which.flower !== false]);

/**
 * The price table as it would be fixed now: each set at the lower of your rate and its own ceiling.
 * @param sets  the sets you trade
 * @param caut  cautiousPrice()
 * @returns { ok, price, from, today, usual, pct, least, sets: { key: { pct, cap, market } }, pay: { id: $ }, mv: { id: $ } }
 *   ok = every set has a ceiling (a points price and every market value are read)
 */
export function liveTable(sets, mv, typed, leastPct, caut) {
    const out = { ok: (sets || []).length > 0, price: caut.price, from: caut.from, today: caut.today, usual: caut.usual, pct: srNum(typed), least: srNum(leastPct), sets: {}, pay: {}, mv: {} };
    for (const set of sets || []) {
        const market = setMarketValue(set, mv);
        const cap = rateCeiling(market, setValue(set, caut.price), leastPct);
        if (!cap) out.ok = false;
        const pct = paidRate(typed, cap);
        out.sets[set.key] = { pct, cap, market };
        for (const p of set.pieces) {
            const v = srWhole(mv(p.id));
            out.mv[p.id] = v;
            out.pay[p.id] = ratePrice(v, pct);
        }
    }
    return out;
}

/** A table fixed for the hour. `rev` moves whenever its prices do: what was last written to TornW3B is told by it. */
export function fixTable(live, key, now) {
    return { ...live, key, at: now, until: now + RATE_HOUR_MS, rev: now, held: false };
}

/**
 * The one safety: a set whose fixed rate is over its ceiling at the cautious price now comes down to it, at once.
 * Never up. The ceiling is worked out on the table's own market values - what its prices were made from.
 * @returns the table itself when nothing is over, else a new one (`down` on each set that came down)
 */
export function safeTable(table, sets, cautPrice, now) {
    if (!table || !(cautPrice > 0)) return table;
    let out = table;
    for (const set of sets || []) {
        const row = table.sets[set.key];
        if (!row) continue;
        let market = 0;
        for (const p of set.pieces) market += srWhole(table.mv[p.id]);
        const cap = rateCeiling(market, setValue(set, cautPrice), table.least);
        if (!cap || row.pct <= cap) continue;
        if (out === table) out = { ...table, sets: { ...table.sets }, pay: { ...table.pay }, rev: now };
        out.sets[set.key] = { ...row, pct: cap, cap, down: { at: now, from: row.down ? row.down.from : row.pct, price: srWhole(cautPrice) } };
        for (const p of set.pieces) out.pay[p.id] = ratePrice(table.mv[p.id], cap);
    }
    return out;
}

/**
 * What the best other buyers pay for a whole set: each piece at its best other buyer, summed, against the same
 * pieces' market value. (A $500 piece at 126% moves a $300,000 set by a few dollars: the set is what counts.)
 * @param bidOf id -> { price, pct, name, at } | null
 * @returns null with no price read in the last day, else { pct, pieces, of, at } - `at`: the oldest read counted
 */
export function othersPay(set, mv, bidOf, now) {
    let paid = 0;
    let market = 0;
    let pieces = 0;
    let at = Infinity;
    for (const p of set.pieces) {
        const b = bidOf ? bidOf(p.id) : null;
        const v = srWhole(mv(p.id));
        if (!b || !(b.price > 0) || !v || !(b.at > 0) || now - b.at > BID_KEEPS_MS) continue;
        paid += srNum(b.price);
        market += v;
        pieces += 1;
        at = Math.min(at, b.at);
    }
    return pieces ? { pct: Math.round(paid / market * 1000) / 10, pieces, of: set.pieces.length, at } : null;
}

const srPct = (pct) => String(Math.round(srNum(pct) * 10) / 10);
const srMany = (label) => String(label || '').toLowerCase() + 's';

/**
 * The rate as a sentence's part: "101% of market value", or - the sets differing -
 * "100.6% of market value for plushies and 101% for flowers".
 * @param rows [{ label, pct }]
 */
export function rateWords(rows) {
    const rs = (rows || []).filter((r) => r && r.pct > 0);
    if (!rs.length) return '';
    if (rs.every((r) => srPct(r.pct) === srPct(rs[0].pct))) return srPct(rs[0].pct) + '% of market value';
    return rs.map((r, k) => srPct(r.pct) + '%' + (k ? '' : ' of market value') + ' for ' + srMany(r.label)).join(' and ');
}

/** The same, short: "101%" or "100.6% to 101%". */
export function rateShort(rows) {
    const ps = (rows || []).filter((r) => r && r.pct > 0).map((r) => srNum(r.pct));
    if (!ps.length) return '';
    const lo = Math.min(...ps);
    const hi = Math.max(...ps);
    return srPct(lo) === srPct(hi) ? srPct(lo) + '%' : srPct(lo) + '% to ' + srPct(hi) + '%';
}
