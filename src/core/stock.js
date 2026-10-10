// What you hold of each piece, kept right between Torn's inventory reads, and what those units cost.
// Torn's inventory is up to an hour old, so the count is carried by what happened: a buy in Torn's log, a trade
// finished, a set swapped at the museum. Torn's own count is taken for a piece only when nothing happened to it in
// the hour before the read; until then the Archive's count stands. A buy seen on the page counts at once, and
// leaves again when the log has been read past it (the log has it then). Pure working-out.

import { poolAdd, poolTake, poolMatch } from './books.js';
import { setByKey } from './sets.js';

const skNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const skWhole = (v) => Math.max(0, Math.floor(skNum(v)));
// Torn says its inventory may be an hour old; five minutes on top for clocks and a slow read.
const SK_STALE_MS = 65 * 60000;
// A buy seen on the page stays counted until the log has been read this far past it: Torn's log may lag.
const SK_LAG_MS = 60000;
const SK_KEYS = 6000;

export const STOCK_EMPTY = Object.freeze({ held: {}, last: {}, pool: {}, done: [], floor: 0, invAt: 0 });

/**
 * What happened, applied once each (by key).
 * @param events [{ key, t, id, d, paid }]            units of one item in (d > 0, `paid` for all of them) or out (d < 0)
 *            or [{ key, t, swap: setKey, sets }]      sets swapped at the museum
 * @param eachOf id -> what a unit with no cost on record stands at (Torn's market value)
 * @returns { state, made: [{ key, t, set, sets, points, cost }] } - made = the swaps, with what their pieces cost
 */
export function stockApply(state, events, eachOf = () => 0) {
    const s = state && state.held ? state : STOCK_EMPTY;
    const done = new Set(s.done);
    let held = s.held;
    let last = s.last;
    let pool = s.pool;
    const made = [];
    const fresh = [];
    const move = (id, d, t) => {
        held = { ...held, [id]: Math.max(0, skWhole(held[id]) + d) };
        if (t > skNum(last[id])) last = { ...last, [id]: t };
    };
    for (const e of [...(events || [])].sort((a, b) => a.t - b.t)) {
        if (!e || !e.key || done.has(e.key) || !(e.t > s.floor)) continue;
        done.add(e.key);
        fresh.push(e.key);
        if (e.swap) {
            const set = setByKey(e.swap);
            const n = skWhole(e.sets);
            if (!set || !n) continue;
            let cost = 0;
            for (const p of set.pieces) {
                const id = String(p.id);
                // Units the pool never saw bought stand at the market value: a set's cost is never left at nothing.
                const have = pool[id] ? pool[id].n : 0;
                if (have < n) pool = poolAdd(pool, id, n - have, (n - have) * skNum(eachOf(id)), true);
                const took = poolTake(pool, id, n);
                pool = took.pool;
                cost += took.cost;
                move(id, -n, e.t);
            }
            made.push({ key: e.key, t: e.t, set: set.key, sets: n, points: n * set.points, cost: Math.round(cost) });
            continue;
        }
        const id = String(e.id);
        const d = Math.trunc(skNum(e.d));
        if (!d) continue;
        if (d > 0) pool = poolAdd(pool, id, d, Math.max(0, skNum(e.paid)));
        else pool = poolTake(pool, id, -d).pool;
        move(id, d, e.t);
    }
    if (!fresh.length) return { state: s, made };
    // The keys kept are the newest; the engine hands in only rows it has not handed in before, and `floor` (set
    // when the books are started over) shuts out everything older.
    const list = [...s.done, ...fresh].slice(-SK_KEYS);
    return { state: { ...s, held, last, pool, done: list }, made };
}

/**
 * Torn's inventory, read just now. A piece nothing happened to in the last hour takes Torn's count; the pool is
 * brought to it (units never seen bought come in at the market value, units gone leave at the average).
 * @param inv  itemId -> how many, or a function
 * @param ids  the pieces to keep count of
 */
export function stockInventory(state, inv, invAt, ids, eachOf = () => 0) {
    const s = state && state.held ? state : STOCK_EMPTY;
    const get = typeof inv === 'function' ? inv : (id) => (inv || {})[id];
    const held = { ...s.held };
    for (const raw of ids || []) {
        const id = String(raw);
        if (skNum(s.last[id]) > invAt - SK_STALE_MS) { if (held[id] == null) held[id] = skWhole(get(id)); continue; }
        held[id] = skWhole(get(id));
    }
    const pool = poolMatch(s.pool, (id) => held[String(id)], eachOf, (ids || []).map(String));
    return { ...s, held, pool, invAt };
}

/**
 * How many you hold now: the count, plus buys and swaps seen on the page that the log has not been read past.
 * @param seen  [{ t, id, qty }] bazaar buys seen as they happened
 * @param swaps [{ t, set, sets }] presses of EXCHANGE
 * @param until the time the log has been read up to (0 = not read)
 * @returns itemId -> units (a function)
 */
export function stockHeld(state, seen, swaps, until = 0) {
    const s = state && state.held ? state : STOCK_EMPTY;
    const extra = {};
    const add = (id, d) => { extra[id] = (extra[id] || 0) + d; };
    for (const b of seenWaiting(seen, until)) add(String(b.id), skWhole(b.qty));
    for (const p of seenWaiting(swaps, until)) {
        const set = setByKey(p.set);
        if (set) for (const pc of set.pieces) add(String(pc.id), -skWhole(p.sets));
    }
    return (id) => Math.max(0, skWhole(s.held[String(id)]) + (extra[String(id)] || 0));
}

/** What was seen on the page and is not in the log yet. With `until` 0 the log is not read: everything waits. */
export function seenWaiting(list, until = 0) {
    return (list || []).filter((x) => x && x.t > 0 && !(until > 0 && x.t + SK_LAG_MS < until));
}

/** Is the count fit to show? Not before Torn's inventory has been read once. */
export const stockReady = (state) => !!state && state.invAt > 0;

/**
 * The Ledger's rows (core/ledger.js) and museum swaps as stock events.
 * @param rows  [{ id, t, itemId, qty, each, side }] buys, sales, gifts - of any item; only `ids` are counted
 * @param ids   Set of the pieces' ids (strings)
 */
export function eventsFromRows(rows, ids) {
    const out = [];
    for (const r of rows || []) {
        if (!r || !ids.has(String(r.itemId)) || !(r.qty > 0)) continue;
        if (r.side === 'buy') out.push({ key: 'row:' + r.id, t: r.t, id: String(r.itemId), d: skWhole(r.qty), paid: skWhole(r.qty) * skNum(r.each) });
        else out.push({ key: 'row:' + r.id, t: r.t, id: String(r.itemId), d: -skWhole(r.qty), paid: 0 });
    }
    return out;
}
