// Which lot size sells: the points market read again and again, a lot that was there and is gone.
// A lot that leaves may have been taken down, Torn does not say; so your own sales (from Torn's log) are shown
// beside it. Sizes are counted against sizes: no dollar figure in any rule here. Pure working-out.

const ltNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const ltWhole = (v) => Math.max(0, Math.floor(ltNum(v)));
const LT_DAY_MS = 86400000;
// Two reads further apart than this did not watch the market between them: a lot gone meanwhile has no wait to tell.
const LT_GAP_MS = 5 * 60000;
const LT_KEEP = 4000;

/**
 * The sizes points are listed in (the owner, 2026-10-13: "its mostly sold in increments of 50, 100, 200, 500, 1000,
 * 1500, 2000, 2500, and 5000, and 10000 and usually, we dont sell big, i avoid anything bigger than 2k"). Until
 * 1.4.0 the sizes were ranges made up here (up to 100, 101 to 250 ... over 1,000): "over 1,000" mixed 2,000 with
 * 5,000, and the plan was one lot of everything.
 */
export const LOT_SIZES = [50, 100, 200, 500, 1000, 1500, 2000, 2500, 5000, 10000];
/** The biggest lot you list, to begin with: his number, a count of points. Yours to change in Settings. */
export const LOT_MOST = 2000;

const ltFmt = (n) => n.toLocaleString('en-US');
/** The sizes a lot of yours may have: the market's, none over `most`; with `most` under them all, `most` itself. */
export function lotSizes(most = LOT_MOST) {
    const cap = ltWhole(most) || LOT_MOST;
    const sizes = LOT_SIZES.filter((n) => n <= cap);
    return sizes.length ? sizes : [cap];
}
/**
 * The size a lot is counted under: the nearest of your sizes (30 and 60 under 50, 900 under 1,000; half way goes
 * up), and null for a lot over your biggest ("Bigger").
 */
export function lotSize(points, most = LOT_MOST) {
    const n = ltWhole(points);
    const sizes = lotSizes(most);
    if (!n) return null;
    if (n > sizes[sizes.length - 1]) return null;
    let best = sizes[0];
    for (const size of sizes) if (Math.abs(size - n) < Math.abs(best - n) || (Math.abs(size - n) === Math.abs(best - n) && size > best)) best = size;
    return best;
}

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
 * @param most the biggest lot you list: bigger ones are one last row, `bigger: true`
 * @returns [{ size (0 on the last row), label, bigger, lots, points, wait (ms | null), waits, mine: { n, lo, hi } | null }]
 */
export function lotTable(gone, mine, now, days = 7, most = LOT_MOST) {
    const from = now - days * LT_DAY_MS;
    const sizes = lotSizes(most);
    const rows = [...sizes.map((size) => ({ size, label: ltFmt(size), bigger: false })), { size: 0, label: 'Bigger', bigger: true }].map((r) => ({ ...r, lots: 0, points: 0, wait: null, waits: 0, mine: null, w: [], m: [] }));
    const rowOf = (points) => { const size = lotSize(points, most); return ltWhole(points) ? rows[size == null ? rows.length - 1 : sizes.indexOf(size)] : null; };
    for (const g of gone || []) {
        if (g.t < from) continue;
        const r = rowOf(g.qty);
        if (!r) continue;
        r.lots += 1;
        r.points += ltWhole(g.qty);
        if (g.front && g.wait != null) r.w.push(g.wait);
    }
    for (const s of mine || []) {
        const r = rowOf(s.points);
        if (r) r.m.push(s.wait);
    }
    return rows.map(({ w, m, ...r }) => {
        const known = m.filter((x) => x != null);
        return { ...r, wait: ltMedian(w), waits: w.length, mine: m.length ? { n: m.length, lo: known.length ? Math.min(...known) : null, hi: known.length ? Math.max(...known) : null } : null };
    });
}

/** How long the lots in the record were watched for, in ms: from the first one gone inside `days` to now. */
export function lotSpan(gone, now, days = 7) {
    const from = now - days * LT_DAY_MS;
    let first = 0;
    let n = 0;
    for (const g of gone || []) { if (g.t < from) continue; n += 1; if (!first || g.t < first) first = g.t; }
    return { lots: n, ms: first ? Math.max(0, now - first) : 0 };
}

/**
 * How to list your points: the biggest of your sizes first, none over your biggest lot, and what is left under the
 * smallest size as a lot of its own (6,620 with 2,000 the biggest: 2,000, 2,000, 2,000, 500, 100, 20).
 * @returns [points of the first lot to list, of the second, ...]
 */
export function sellPlan(points, most = LOT_MOST) {
    let left = ltWhole(points);
    const out = [];
    for (const size of [...lotSizes(most)].reverse()) {
        while (left >= size) { out.push(size); left -= size; }
    }
    if (left) out.push(left);
    return out;
}

/** "3 × 2,000 · 1 × 500 · 1 × 20". */
export function lotsWords(lots) {
    const by = new Map();
    for (const n of lots || []) by.set(n, (by.get(n) || 0) + 1);
    return [...by].sort((a, b) => b[0] - a[0]).map(([n, c]) => c + ' × ' + ltFmt(n)).join(' · ');
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
