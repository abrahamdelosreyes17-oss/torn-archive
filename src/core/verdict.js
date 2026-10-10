// "Open your shop?": one verdict, four checks.
// The shop is what you pay sellers who trade with you. It is worth being open when a set bought at your rate still
// leaves your least profit, nothing you need is cheaper in a bazaar than from your sellers, you still need pieces,
// and your share of money for sets has room. Once open, a new cheap listing never closes it: it goes on your list.
// Pure working-out; the words are put together by the page.

const vdNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const vdWhole = (v) => Math.max(0, Math.floor(vdNum(v)));

/** A cheap listing left unbought this long turns an open shop amber. A wait, not a price. */
export const HOT_SIT_MS = 10 * 60000;

/**
 * Listings of pieces you need that are cheaper than what you pay sellers: anyone can buy there and sell to you.
 * @param pieces   [{ id, name, need, pay }] - pay = your price for one, at your rate
 * @param offersOf id -> [{ price, qty, src, who, whoId }]
 * @returns [{ id, name, key, q, price, pay, who, whoId, im }] cheapest first within a piece, never more than you need
 */
export function hotListings(pieces, offersOf) {
    const out = [];
    for (const p of pieces || []) {
        let left = vdWhole(p.need);
        if (!left || !(p.pay > 0)) continue;
        const offers = [...((offersOf && offersOf(p.id)) || [])].filter((o) => o.price > 0 && o.qty > 0 && o.price < p.pay).sort((a, b) => a.price - b.price);
        for (const o of offers) {
            if (!left) break;
            const q = Math.min(left, vdWhole(o.qty));
            const im = o.src === 'market';
            out.push({ id: p.id, name: p.name, key: p.id + '|' + (im ? 'im' : 'b:' + (o.whoId ?? o.who ?? '')), q, price: o.price, pay: p.pay, who: o.who || null, whoId: o.whoId ?? null, im });
            left -= q;
        }
    }
    return out;
}

/** When each hot listing was first seen: { key: t }. A listing that is gone is forgotten. */
export function hotSince(prev, hot, now) {
    const out = {};
    for (const h of hot || []) out[h.key] = (prev && prev[h.key]) || now;
    return out;
}

/**
 * @param i {
 *   open        the shop is open now
 *   sets        [{ name, market, value, profit, ok, cap }] - sets.js's rateSet() for each set you trade, at your rate
 *   hot         hotListings()
 *   since       hotSince()
 *   onList      key -> true when that listing is on your shopping list
 *   needUnits   pieces you still need
 *   coverSets   how many more sets your share of money covers (null = no limit set)
 *   now
 * }
 * @returns {
 *   state   'no-price' | 'low' | 'full' | 'share' | 'buy-first' | 'open-now' | 'stay' | 'stay-buy'
 *   lamp    'ok' | 'warn' | 'bad'
 *   checks  { leaves: { ok, profit, name, cap }, cheaper: { ok, units, listings, sat }, need: { ok, units }, share: { ok, sets } }
 *   worth   every check holds
 * }
 */
export function shopVerdict(i) {
    const sets = (i.sets || []).filter(Boolean);
    const priced = sets.length > 0 && sets.every((s) => s.market > 0 && s.value > 0);
    const worst = sets.reduce((a, s) => (!a || s.profit < a.profit ? s : a), null);
    const leaves = { ok: priced && sets.every((s) => s.ok), profit: worst ? worst.profit : 0, name: worst ? worst.name : '', cap: sets.length ? Math.min(...sets.map((s) => vdNum(s.cap))) : 0 };
    const hot = i.hot || [];
    const units = hot.reduce((s, h) => s + h.q, 0);
    const sat = hot.filter((h) => i.since && i.since[h.key] && i.now - i.since[h.key] >= HOT_SIT_MS).length;
    const listed = hot.filter((h) => i.onList && i.onList(h.key)).length;
    const cheaper = { ok: i.open ? sat === 0 : units === 0, units, listings: hot.length, sat, listed };
    const need = { ok: vdWhole(i.needUnits) > 0, units: vdWhole(i.needUnits) };
    const share = { ok: i.coverSets == null || i.coverSets > 0, sets: i.coverSets == null ? null : vdWhole(i.coverSets) };
    const checks = { leaves, cheaper, need, share };
    let state;
    if (!priced) state = 'no-price';
    else if (!leaves.ok) state = 'low';
    else if (!need.ok) state = 'full';
    else if (!share.ok) state = 'share';
    else if (!i.open) state = units ? 'buy-first' : 'open-now';
    else state = sat ? 'stay-buy' : 'stay';
    const lamp = state === 'open-now' || state === 'stay' ? 'ok' : state === 'low' ? 'bad' : 'warn';
    return { state, lamp, checks, worth: leaves.ok && cheaper.ok && need.ok && share.ok };
}

/** The verdict's headline. */
export const VERDICT_WORDS = {
    'no-price': 'Waiting for prices',
    low: 'Not worth it at this rate',
    full: 'Nothing needed: stay closed',
    share: 'Your share for sets is full',
    'buy-first': 'Not yet: buy first',
    'open-now': 'Worth opening now',
    stay: 'Open, and worth staying open',
    'stay-buy': 'Open: buy the cheap ones first',
};

/**
 * How many more sets your share of money covers.
 * @param worth    everything you have (cash, vault, and what sits in pieces and points)
 * @param inSets   what sits in pieces and points now, at cost
 * @param sharePct the most of your money you want in sets and points (0 = no limit)
 * @param setCost  what a set costs at your rate
 * @returns null with no limit, else whole sets
 */
export function shareCovers(worth, inSets, sharePct, setCost) {
    if (!(sharePct > 0)) return null;
    if (!(setCost > 0)) return 0;
    return vdWhole((vdNum(worth) * sharePct / 100 - vdNum(inSets)) / setCost);
}
