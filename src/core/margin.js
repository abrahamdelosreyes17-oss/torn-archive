// Margins: one rule for "safe", used everywhere a price is judged.
// A buy is safe when it still leaves your least profit at the points price now. A piece's share of that is its
// market value's share of the set, so a trade of loose pieces and a whole set are judged by the same sum.
// Pure working-out: no page, no storage. The points market takes no fee: nothing is taken off for one.

import { setOfItem, setMarketValue, setValue } from './sets.js';

const mgNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const mgWhole = (v) => Math.max(0, Math.floor(mgNum(v)));

/** What one unit of a piece brings at the points price: the set's value shared by market value. Not rounded. */
export function pieceBrings(itemId, mv, pointsPrice) {
    const set = setOfItem(itemId);
    if (!set) return 0;
    const total = setMarketValue(set, mv);
    const value = setValue(set, pointsPrice);
    return total && value ? value * mgWhole(mv(itemId)) / total : 0;
}

/**
 * The most a unit may cost and still leave your least profit: what it brings, less that share.
 * A listing is taken only while its price is UNDER this. Whole dollars, rounded down.
 */
export function safeWorth(itemId, mv, pointsPrice, leastPct = 0) {
    const brings = pieceBrings(itemId, mv, pointsPrice);
    return brings ? Math.floor(brings / (1 + Math.max(0, mgNum(leastPct)) / 100)) : 0;
}

/** Every piece of a set at its safe worth: itemId -> dollars (0 when it cannot be worked out). */
export function safeWorths(set, mv, pointsPrice, leastPct = 0) {
    const out = new Map();
    for (const p of set.pieces) out.set(String(p.id), safeWorth(p.id, mv, pointsPrice, leastPct));
    return out;
}

/**
 * What a handful of units leaves at the points price now.
 * @param lines [{ id, qty, each }] set pieces only; a line that is no set piece, or has no price, is passed over
 * @returns { units, paid, brings, leaves, pct, ok } - pct is leaves as a share of what is paid; ok = it keeps `leastPct`
 */
export function leavesOf(lines, mv, pointsPrice, leastPct = 0) {
    let units = 0;
    let paid = 0;
    let brings = 0;
    for (const l of lines || []) {
        const qty = mgWhole(l && l.qty);
        const each = mgNum(l && l.each);
        const one = l ? pieceBrings(l.id, mv, pointsPrice) : 0;
        if (!qty || !(each > 0) || !one) continue;
        units += qty;
        paid += qty * each;
        brings += qty * one;
    }
    paid = Math.round(paid);
    const leaves = Math.round(brings - paid);
    const pct = paid > 0 ? leaves / paid * 100 : 0;
    return { units, paid, brings: Math.round(brings), leaves, pct, ok: paid > 0 && pct >= Math.max(0, mgNum(leastPct)) - 1e-9 };
}

/**
 * The highest rate (percent of market value, one decimal, rounded down) at which these sets still keep the least
 * profit: the lowest of the caps of the sets named. 0 when it cannot be said.
 */
export function mendRate(sets, mv, pointsPrice, leastPct = 0) {
    let cap = Infinity;
    for (const set of sets || []) {
        const market = setMarketValue(set, mv);
        const value = setValue(set, pointsPrice);
        if (!market || !value) return 0;
        cap = Math.min(cap, Math.floor(value / (1 + Math.max(0, mgNum(leastPct)) / 100) / market * 1000) / 10);
    }
    return Number.isFinite(cap) ? cap : 0;
}

/**
 * The margin line of a trade.
 * @param offer tradeOffer()'s result
 * @returns {
 *   all, need   leavesOf() for everything priced in the trade, and for only the units you need
 *   held        dollars paid for units you do not need yet: they pay only when the rest of their set arrives
 *   others      names in the trade that are no set piece: not priced, the total does not cover them
 *   mend        the rate that would bring the trade back to your least profit (0 when it is already kept)
 *   state       'ok' | 'under' (under your least profit: the points price fell) | 'loss' | 'none' (nothing priced)
 * }
 */
export function tradeMargin(offer, { mv, pointsPrice, leastPct = 0 }) {
    const priced = ((offer && offer.rows) || []).filter((r) => r.each > 0 && r.state !== 'other');
    const all = leavesOf(priced.map((r) => ({ id: r.id, qty: r.qty, each: r.each })), mv, pointsPrice, leastPct);
    const need = leavesOf(priced.filter((r) => r.take > 0).map((r) => ({ id: r.id, qty: r.take, each: r.each })), mv, pointsPrice, leastPct);
    const held = priced.reduce((s, r) => s + mgWhole(r.extra) * r.each, 0);
    const others = ((offer && offer.rows) || []).filter((r) => r.state === 'other').map((r) => r.name || ('item ' + r.id));
    const sets = [...new Set(priced.map((r) => setOfItem(r.id)).filter(Boolean))];
    let state = 'none';
    if (all.units) state = all.ok ? 'ok' : all.leaves < 0 ? 'loss' : 'under';
    return { all, need, held, others, mend: state === 'ok' || state === 'none' ? 0 : mendRate(sets, mv, pointsPrice, leastPct), state };
}

/**
 * The margin line of one place that sells (a bazaar, or the Item Market): what you would take there.
 * @param takes [{ id, take, price }]
 */
export function placeMargin(takes, { mv, pointsPrice, leastPct = 0 }) {
    return leavesOf((takes || []).map((t) => ({ id: t.id, qty: t.take, each: t.price })), mv, pointsPrice, leastPct);
}

/** The words of a margin line: "leaves +$1,234, 2.4%". The sign is always shown. */
export function marginWords(m) {
    if (!m || !m.units) return '';
    const sign = m.leaves < 0 ? '-' : '+';
    return 'leaves ' + sign + '$' + Math.abs(m.leaves).toLocaleString('en-US') + ', ' + (Math.round(m.pct * 10) / 10).toFixed(1) + '%';
}
