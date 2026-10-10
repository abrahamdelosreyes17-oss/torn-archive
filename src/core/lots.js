// Which lot size sells: the points market read again and again, a lot that was there and is gone.
// A lot that leaves may have been taken down, Torn does not say; so your own sales (from Torn's log) are shown
// beside it. Sizes are counted against sizes: no dollar figure in any rule here. Pure working-out.

const ltNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const ltWhole = (v) => Math.max(0, Math.floor(ltNum(v)));
const LT_DAY_MS = 86400000;
// Two reads further apart than this did not watch the market between them: a lot gone meanwhile has no wait to tell.
const LT_GAP_MS = 5 * 60000;
const LT_KEEP = 4000;

export const LOT_BUCKETS = [[1, 100], [101, 250], [251, 500], [501, 1000], [1001, Infinity]];

const ltFmt = (n) => n.toLocaleString('en-US');
export const lotLabel = ([lo, hi]) => (hi === Infinity ? 'Over ' + ltFmt(lo - 1) : lo <= 1 ? 'Up to ' + ltFmt(hi) : ltFmt(lo) + ' to ' + ltFmt(hi));
export const lotBucket = (points) => LOT_BUCKETS.findIndex(([lo, hi]) => points >= lo && points <= hi);

export const LOTS_EMPTY = Object.freeze({ seen: {}, gone: [], t: 0 });

/**
 * One read of the points market into the record.
 * @param state     { seen: { id: { cost, qty, t0, old } }, gone: [{ cost, qty, t, wait, front, part }], t }
 * @param listings  points.js's parsePointsMarket(): [{ id, cost, qty }]
 * @param wallPrice the first wall's price at this read (0 = not known): a lot at or under it was at the front
 * @returns the next state. `wait` is null when the lot was there before the watch began, or the watch had a gap.
 */
export function lotsRead(state, listings, now, wallPrice = 0) {
    const prev = state && state.seen ? state : LOTS_EMPTY;
    const first = !prev.t;
    const gap = !first && now - prev.t > LT_GAP_MS;
    const seen = {};
    const gone = [];
    const here = new Map((listings || []).map((l) => [String(l.id), l]));
    const leave = (was, qty, part) => gone.push({
        cost: was.cost, qty, t: now, wait: was.old || gap ? null : now - was.t0,
        front: !(wallPrice > 0) || was.cost <= wallPrice, ...(part ? { part: true } : {}),
    });
    for (const [id, was] of Object.entries(prev.seen)) {
        const l = here.get(id);
        if (!l) { leave(was, was.qty, false); continue; }
        // Less of it than before: part of the lot sold. The rest stays, counted from when the lot was first seen.
        if (l.qty < was.qty) leave(was, was.qty - l.qty, true);
    }
    for (const [id, l] of here) {
        const was = prev.seen[id];
        seen[id] = was ? { ...was, cost: l.cost, qty: l.qty } : { cost: l.cost, qty: l.qty, t0: now, ...(first || gap ? { old: true } : {}) };
    }
    const keepFrom = now - 8 * LT_DAY_MS;
    return { seen, gone: [...prev.gone.filter((g) => g.t >= keepFrom), ...gone].slice(-LT_KEEP), t: now };
}

const ltMedian = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };

/**
 * The table: per lot size, how many left the market, the points in them, the usual wait at the front, and yours.
 * @param gone lotsRead().gone
 * @param mine [{ points, wait }] your own lots, from Torn's log (wait in ms, or null)
 * @returns [{ lo, hi, label, lots, points, wait (ms | null), waits, mine: { n, lo, hi } | null }]
 */
export function lotTable(gone, mine, now, days = 7) {
    const from = now - days * LT_DAY_MS;
    const rows = LOT_BUCKETS.map((b) => ({ lo: b[0], hi: b[1], label: lotLabel(b), lots: 0, points: 0, wait: null, waits: 0, mine: null, w: [], m: [] }));
    for (const g of gone || []) {
        if (g.t < from) continue;
        const r = rows[lotBucket(ltWhole(g.qty))];
        if (!r) continue;
        r.lots += 1;
        r.points += ltWhole(g.qty);
        if (g.front && g.wait != null) r.w.push(g.wait);
    }
    for (const s of mine || []) {
        const r = rows[lotBucket(ltWhole(s.points))];
        if (r) r.m.push(s.wait);
    }
    return rows.map(({ w, m, ...r }) => {
        const known = m.filter((x) => x != null);
        return { ...r, wait: ltMedian(w), waits: w.length, mine: m.length ? { n: m.length, lo: known.length ? Math.min(...known) : null, hi: known.length ? Math.max(...known) : null } : null };
    });
}

/**
 * How to list your points: all at once, or in the size that leaves quickest. Lots of one size are taken one after
 * the other, so the wait of a split is the size's usual wait, once per lot.
 * @returns { one: { lots: [n], wait }, quick: { lots, size, wait } | null } - quick is null when one lot is quickest,
 *          or no wait is known yet
 */
export function sellPlan(points, table) {
    const total = ltWhole(points);
    const waitOf = (n) => { const r = (table || [])[lotBucket(n)]; return r ? r.wait : null; };
    const one = { lots: total ? [total] : [], wait: total ? waitOf(total) : null };
    let quick = null;
    for (const r of table || []) {
        if (r.wait == null || !total) continue;
        const size = Math.min(total, r.hi === Infinity ? total : r.hi);
        if (size >= total) continue;
        const lots = [];
        for (let left = total; left > 0; left -= size) lots.push(Math.min(size, left));
        const wait = lots.length * r.wait;
        if (!quick || wait < quick.wait) quick = { lots, size, wait };
    }
    if (quick && one.wait != null && one.wait <= quick.wait) quick = null;
    return { one, quick };
}

/** "4 lots of 100 and 1 of 20". */
export function lotsWords(lots) {
    const by = new Map();
    for (const n of lots || []) by.set(n, (by.get(n) || 0) + 1);
    const parts = [...by].sort((a, b) => b[0] - a[0]).map(([n, c], i) => (i ? c + ' of ' + ltFmt(n) : c + (c === 1 ? ' lot of ' : ' lots of ') + ltFmt(n)));
    return parts.join(' and ');
}

/** A wait in words: "6 min", "2 h 10 min", "under a minute". */
export function waitWords(ms) {
    if (ms == null) return '';
    const min = Math.round(ms / 60000);
    if (min < 1) return 'under a minute';
    if (min < 60) return min + ' min';
    const h = Math.floor(min / 60);
    return h + ' h' + (min % 60 ? ' ' + (min % 60) + ' min' : '');
}
