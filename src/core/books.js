// The books: what pieces cost, the points book at its average cost, buy-mugs, and the only profit there is.
// A piece is never sold: it becomes a set, the set becomes points. So what you pay for pieces goes into a pool, a
// set swapped at the museum puts its points into the book at what its pieces cost, and a points sale takes them out
// at the book's average. Profit = what the points sold for, less that cost, less buy-mugs. Pure working-out.

const bkNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const bkWhole = (v) => Math.max(0, Math.floor(bkNum(v)));
const BK_DAY_MS = 86400000;

// ---- What the pieces cost --------------------------------------------------------------------------------------------

/**
 * Units into the pool at what was paid for them. The pool is { itemId: { n, cost, est } }: `est` counts the units
 * whose cost was not seen (held before Torn Archive) and stand at the market value of the day they were counted.
 */
export function poolAdd(pool, itemId, units, paid, est = false) {
    const n = bkWhole(units);
    if (!n) return pool || {};
    const id = String(itemId);
    const cur = (pool && pool[id]) || { n: 0, cost: 0, est: 0 };
    return { ...(pool || {}), [id]: { n: cur.n + n, cost: cur.cost + Math.max(0, bkNum(paid)), est: cur.est + (est ? n : 0) } };
}

/**
 * Units out of the pool at its average.
 * @returns { pool, cost, units, est } - units may be fewer than asked; est: how much of that cost rests on an
 *   estimate, as a share (0 to 1): the average is of every unit in the pool, the estimated ones with the rest
 */
export function poolTake(pool, itemId, units) {
    const id = String(itemId);
    const cur = pool && pool[id];
    const n = Math.min(bkWhole(units), cur ? cur.n : 0);
    if (!n) return { pool: pool || {}, cost: 0, units: 0, est: 0 };
    const cost = cur.cost * n / cur.n;
    const left = cur.n - n;
    const next = { ...pool };
    if (left) next[id] = { n: left, cost: cur.cost - cost, est: Math.min(cur.est, left) };
    else delete next[id];
    return { pool: next, cost, units: n, est: cur.n ? Math.min(1, cur.est / cur.n) : 0 };
}

/** The pool brought to what you hold: units with no cost on record come in at `eachOf(id)`, units gone leave at the average. */
export function poolMatch(pool, heldOf, eachOf, ids) {
    let out = pool || {};
    for (const id of ids || []) {
        const have = bkWhole(heldOf(id));
        const cur = out[String(id)] ? out[String(id)].n : 0;
        if (have > cur) out = poolAdd(out, id, have - cur, (have - cur) * bkNum(eachOf(id)), true);
        else if (have < cur) out = poolTake(out, id, cur - have).pool;
    }
    return out;
}

export const poolEach = (pool, itemId) => { const c = pool && pool[String(itemId)]; return c && c.n ? c.cost / c.n : 0; };

/** Everything in the pool: { units, cost, est }. */
export function poolSum(pool) {
    let units = 0;
    let cost = 0;
    let est = 0;
    for (const c of Object.values(pool || {})) { units += c.n; cost += c.cost; est += c.est; }
    return { units, cost: Math.round(cost), est };
}

/** What one set costs you now: each piece at its average in the pool. 0 while a piece has no cost on record. */
export function poolSetCost(pool, set) {
    let cost = 0;
    for (const p of set.pieces) {
        const each = poolEach(pool, p.id);
        if (!each) return 0;
        cost += each;
    }
    return Math.round(cost);
}

/**
 * Sets swapped at the museum: one of each piece leaves the pool, per set.
 * @returns { pool, cost, sets } - `sets` is how many the pool could give (it may hold fewer than Torn says)
 */
export function poolSwap(pool, set, sets) {
    let out = pool || {};
    let cost = 0;
    const n = Math.min(bkWhole(sets), ...set.pieces.map((p) => (out[String(p.id)] ? out[String(p.id)].n : 0)));
    if (!n) return { pool: out, cost: 0, sets: 0 };
    for (const p of set.pieces) {
        const took = poolTake(out, p.id, n);
        out = took.pool;
        cost += took.cost;
    }
    return { pool: out, cost: Math.round(cost), sets: n };
}

// ---- The points book, at its average ---------------------------------------------------------------------------------

/**
 * The book worked out. Entries are points.js's: { id, t, kind: 'made' | 'sold' | 'used', points, each }.
 *   made: `each` = what a point cost you;  sold: the price it went for;  used: not a price, the points leave at cost.
 * Points sold or used beyond what the book holds were yours before: they count for nothing here.
 * @param before { points, each } the points you had before, if you typed a cost for them: they open the book
 * @returns { rows (newest first: + mine, cost (the average then), gain), made, madeCost, sold, soldGot, soldCost,
 *            used, usedCost, left, cost, each, least, profitSold, value }
 */
/** Profit is "about" when at least this share of the cost behind it is an estimate (one dollar in a hundred). */
export const BOOK_ABOUT = 0.01;

export function avgBook(entries, priceNow = 0, before = null) {
    let left = bkWhole(before && before.points) && bkNum(before.each) > 0 ? bkWhole(before.points) : 0;
    let cost = left * bkNum(before && before.each);
    // Dollars of `cost` that rest on an estimate (pieces never seen bought): they leave with the points, share for share.
    let est = 0;
    const rows = [];
    const sum = { made: 0, madeCost: 0, sold: 0, soldGot: 0, soldCost: 0, used: 0, usedCost: 0, profitSold: 0, about: false };
    for (const e of [...(entries || [])].sort((a, b) => a.t - b.t)) {
        const points = bkWhole(e.points);
        if (!points) continue;
        if (e.kind === 'made') {
            left += points;
            cost += points * bkNum(e.each);
            est += points * bkNum(e.each) * Math.min(1, Math.max(0, bkNum(e.est)));
            sum.made += points;
            sum.madeCost += points * bkNum(e.each);
            rows.push({ ...e, mine: points, cost: bkNum(e.each), gain: 0 });
            continue;
        }
        const avg = left ? cost / left : 0;
        const mine = Math.min(points, left);
        const out = mine * avg;
        const share = cost > 0 ? Math.min(1, est / cost) : 0;
        left -= mine;
        cost = left ? cost - out : 0;
        est = left ? Math.max(0, est - out * share) : 0;
        if (e.kind === 'sold') {
            const got = mine * bkNum(e.each);
            sum.sold += mine;
            sum.soldGot += got;
            sum.soldCost += out;
            sum.profitSold += got - out;
            if (share >= BOOK_ABOUT && mine > 0) sum.about = true;
            rows.push({ ...e, mine, cost: avg, gain: Math.round(got - out), est: share });
        } else {
            sum.used += mine;
            sum.usedCost += out;
            rows.push({ ...e, mine, cost: avg, gain: 0 });
        }
    }
    const each = left ? cost / left : 0;
    return {
        rows: rows.reverse(),
        made: sum.made, madeCost: Math.round(sum.madeCost),
        sold: sum.sold, soldGot: Math.round(sum.soldGot), soldCost: Math.round(sum.soldCost),
        used: sum.used, usedCost: Math.round(sum.usedCost),
        left, cost: Math.round(cost), each,
        // est: the share of what is left that rests on an estimate; about: a sale's profit did.
        est: cost > 0 ? Math.min(1, est / cost) : 0, about: sum.about,
        // The lowest whole price a point may sell for and not be a loss.
        least: left ? Math.floor(each) + 1 : 0,
        profitSold: Math.round(sum.profitSold),
        value: left * bkWhole(priceNow),
    };
}

/** Points held from sets, at the end of each of the last `days` days: [{ day, left }]. */
export function heldByDay(entries, now, days = 14) {
    const list = [...(entries || [])].sort((a, b) => a.t - b.t);
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
        const end = bkDayStart(now - i * BK_DAY_MS) + BK_DAY_MS;
        out.push({ day: bkDay(end - 1), left: avgBook(list.filter((e) => e.t < end)).left });
    }
    return out;
}

// ---- Buy-mugs --------------------------------------------------------------------------------------------------------

/**
 * Which mugs took points money. Money from a points sale is "on hand" until it is banked or spent; a mug counts
 * against profit for as much of what it took as was such money. Any other mug is listed and left out.
 * @param sales [{ id, t, got }]            points sales, what each put on hand
 * @param mugs  [{ id, t, by, taken }]
 * @param outs  [{ t, amount }]             money that left your hand: a vault or bank deposit, a buy, a trade paid
 * @param from  the money that left your hand is on record only from this time on (older rows are let go): a sale
 *              before it is taken as banked or spent long since - with no row left to say so it would otherwise
 *              stand "on hand" for good, and the next mug, any mug, would count against it
 * A mug that carries `kept` ({ counted, onHand, saleId, after }) was judged while every row around it was on record:
 * that judgement stands.
 * @returns { rows (newest first: + counted, onHand, saleId, after), counted, left }
 */
export function mugCheck(sales, mugs, outs, from = 0) {
    const ev = [
        ...(sales || []).filter((s) => !(from > 0 && bkNum(s.t) < from)).map((s) => ({ t: bkNum(s.t), k: 0, s })),
        ...(outs || []).map((o) => ({ t: bkNum(o.t), k: 1, o })),
        ...(mugs || []).map((m) => ({ t: bkNum(m.t), k: 2, m })),
    ].sort((a, b) => a.t - b.t || a.k - b.k);
    let onHand = 0;
    let last = null;
    const rows = [];
    for (const e of ev) {
        if (e.k === 0) { onHand += Math.max(0, bkNum(e.s.got)); last = e.s; }
        else if (e.k === 1) { onHand = Math.max(0, onHand - Math.max(0, bkNum(e.o.amount))); if (!onHand) last = null; }
        else if (e.m.kept) {
            const taken = Math.max(0, bkNum(e.m.taken));
            const k = e.m.kept;
            rows.push({ ...e.m, taken, counted: Math.min(taken, Math.max(0, bkNum(k.counted))), onHand: bkNum(k.onHand), saleId: k.saleId || null, after: bkNum(k.after) });
            onHand = Math.max(0, onHand - Math.max(0, bkNum(k.counted)));
            if (!onHand) last = null;
        } else {
            const taken = Math.max(0, bkNum(e.m.taken));
            const counted = Math.min(taken, onHand);
            rows.push({ ...e.m, taken, counted, onHand, saleId: counted && last ? last.id : null, after: counted && last ? e.t - last.t : 0 });
            onHand -= counted;
            if (!onHand) last = null;
        }
    }
    return {
        rows: rows.reverse(),
        counted: rows.reduce((s, r) => s + r.counted, 0),
        left: rows.filter((r) => !r.counted).length,
    };
}

// ---- Profit ----------------------------------------------------------------------------------------------------------

const bkDayStart = (t) => Math.floor(t / BK_DAY_MS) * BK_DAY_MS;
const bkDay = (t) => new Date(t).toISOString().slice(0, 10);
// Weeks run Monday to Sunday, Torn's time (UTC). 1 Jan 1970 was a Thursday.
const bkWeekStart = (t) => bkDayStart(t) - ((Math.floor(t / BK_DAY_MS) + 3) % 7) * BK_DAY_MS;
const bkMonthStart = (t) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };
const BK_START = { day: bkDayStart, week: bkWeekStart, month: bkMonthStart };
const bkBack = (start, unit) => (unit === 'month' ? bkMonthStart(start - 1) : start - (unit === 'week' ? 7 : 1) * BK_DAY_MS);

/**
 * Profit in buckets of Torn's time, oldest first, the one holding `now` last. Empty buckets are there, at 0.
 * @param soldRows avgBook().rows (only 'sold' rows count)
 * @param mugRows  mugCheck().rows
 * @param directRows (optional) pieces sold as themselves: [{ t, gain, est }] (state.js books them)
 * @returns [{ start, day, sold, mug, direct, profit, points, got, about }] - mug is 0 or negative; about: a part of
 *   the profit rests on an estimated cost
 */
export function profitBuckets(soldRows, mugRows, now, unit = 'day', n = 14, directRows = null) {
    const startOf = BK_START[unit] || bkDayStart;
    const out = [];
    let start = startOf(now);
    for (let i = 0; i < n; i++) { out.unshift({ start, day: bkDay(start), sold: 0, mug: 0, direct: 0, profit: 0, points: 0, got: 0, about: false }); start = bkBack(start, unit); }
    const at = new Map(out.map((b) => [b.start, b]));
    for (const r of soldRows || []) {
        const b = r.kind === 'sold' ? at.get(startOf(r.t)) : null;
        if (!b) continue;
        b.sold += r.gain;
        b.points += r.mine;
        b.got += Math.round(r.mine * bkNum(r.each));
        if (bkNum(r.est) >= BOOK_ABOUT && r.mine > 0) b.about = true;
    }
    for (const d of directRows || []) {
        const b = at.get(startOf(d.t));
        if (!b) continue;
        b.direct += Math.round(bkNum(d.gain));
        if (bkNum(d.est) >= BOOK_ABOUT) b.about = true;
    }
    for (const m of mugRows || []) {
        const b = m.counted ? at.get(startOf(m.t)) : null;
        if (b) b.mug -= m.counted;
    }
    for (const b of out) b.profit = b.sold + b.mug + b.direct;
    return out;
}

/** The buckets summed: { sold, mug, direct, profit, points, got, cost, about }. */
export function profitSum(buckets) {
    const s = { sold: 0, mug: 0, direct: 0, profit: 0, points: 0, got: 0 };
    for (const b of buckets || []) for (const k of Object.keys(s)) s[k] += b[k] || 0;
    return { ...s, cost: s.got - s.sold, about: (buckets || []).some((b) => b.about) };
}

/** A running total over the buckets: [n, n, ...]. */
export function runningTotal(buckets) {
    let t = 0;
    return (buckets || []).map((b) => (t += b.profit));
}
