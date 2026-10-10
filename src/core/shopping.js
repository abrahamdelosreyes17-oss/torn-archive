// The shopping list and the buying run.
// The list is what you decided to buy: one line per piece per place (a bazaar, or the Item Market). The run walks it
// one place at a time; Next counts only what you took. Pure working-out on plain objects, so the list can be stored
// and every tab shows the same one.

const shNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const shWhole = (v) => Math.max(0, Math.floor(shNum(v)));

/** The Item Market is one place; a bazaar is its owner. */
export const IM_PLACE = 'im';
export const placeOf = (offer) => (offer && offer.src === 'market' ? IM_PLACE : 'b:' + String(offer && (offer.whoId ?? offer.who ?? '')));
export const lineKey = (itemId, place) => String(itemId) + '|' + place;

/** How many of a piece are on the list, over every place. */
export function onList(cart, itemId) {
    let n = 0;
    for (const l of cart || []) if (String(l.id) === String(itemId)) n += shWhole(l.q);
    return n;
}

const shLine = (piece, offer, q) => ({
    key: lineKey(piece.id, placeOf(offer)), id: piece.id, name: piece.name, set: piece.set || null, place: placeOf(offer),
    im: offer.src === 'market', who: offer.who || null, whoId: offer.whoId ?? null, price: shWhole(offer.price), q,
});

/**
 * "Fill my stock": the cheapest way to what you need, taking a unit only while its price is under the piece's
 * safe worth (what it brings less your least profit).
 * @param pieces   [{ id, name, set, need, worth }] - worth is the SAFE worth
 * @param offersOf id -> [{ price, qty, src, who, whoId }]
 */
export function fillPlan(pieces, offersOf) {
    const out = [];
    for (const p of pieces || []) {
        let left = shWhole(p.need);
        if (!left || !(p.worth > 0)) continue;
        const all = [...((offersOf && offersOf(p.id)) || [])].filter((o) => shWhole(o.price) > 0 && shWhole(o.qty) > 0).sort((a, b) => a.price - b.price);
        const seen = new Set();
        for (const o of all) {
            if (!left || o.price >= p.worth) break;
            // One line per place: a second listing of the same seller at another price is left for the next read.
            if (seen.has(placeOf(o))) continue;
            seen.add(placeOf(o));
            const q = Math.min(left, shWhole(o.qty));
            out.push(shLine(p, o, q));
            left -= q;
        }
    }
    return out;
}

/** One listing put on the list (as many as you still need of it), or taken off when it is already there. */
export function toggleLine(cart, piece, offer) {
    const key = lineKey(piece.id, placeOf(offer));
    const list = cart || [];
    if (list.some((l) => l.key === key)) return list.filter((l) => l.key !== key);
    const q = Math.min(shWhole(offer.qty), shWhole(piece.need) - onList(list, piece.id));
    return q > 0 ? [...list, shLine(piece, offer, q)] : list;
}

export const dropLine = (cart, key) => (cart || []).filter((l) => l.key !== key);

/**
 * The list checked against a fresh read: a line whose listing is gone, or no longer under its worth, comes off;
 * one with less stock or less need shrinks. Nothing is ever added here.
 * @returns { cart, dropped: [{ key, name, why: 'gone' | 'dear' | 'enough' }] }
 */
export function refreshList(cart, pieces, offersOf) {
    const byId = new Map((pieces || []).map((p) => [String(p.id), p]));
    const out = [];
    const dropped = [];
    const taken = new Map();
    for (const l of cart || []) {
        const p = byId.get(String(l.id));
        const offer = ((offersOf && offersOf(l.id)) || []).filter((o) => placeOf(o) === l.place && shWhole(o.qty) > 0).sort((a, b) => a.price - b.price)[0];
        const had = taken.get(String(l.id)) || 0;
        const need = p ? shWhole(p.need) - had : 0;
        if (!offer) dropped.push({ key: l.key, name: l.name, why: 'gone' });
        else if (!p || !(p.worth > 0) || offer.price >= p.worth) dropped.push({ key: l.key, name: l.name, why: 'dear' });
        else if (need <= 0) dropped.push({ key: l.key, name: l.name, why: 'enough' });
        else {
            const q = Math.min(shWhole(l.q), shWhole(offer.qty), need);
            taken.set(String(l.id), had + q);
            out.push({ ...l, price: shWhole(offer.price), q, who: offer.who || l.who, whoId: offer.whoId ?? l.whoId });
        }
    }
    return { cart: out, dropped };
}

/**
 * The list as stops: one per place, everything that place has for you. Bazaars first, the one that saves most
 * first; the Item Market last (it is one page for every piece).
 * @param worthOf id -> the piece's safe worth
 * @returns [{ place, im, who, whoId, lines, units, cost, gain }]
 */
export function stopsOf(cart, worthOf) {
    const by = new Map();
    for (const l of cart || []) {
        if (!by.has(l.place)) by.set(l.place, []);
        by.get(l.place).push(l);
    }
    const stops = [...by].map(([place, lines]) => ({
        place, im: place === IM_PLACE, who: lines[0].who, whoId: lines[0].whoId, lines,
        units: lines.reduce((s, l) => s + l.q, 0),
        cost: lines.reduce((s, l) => s + l.q * l.price, 0),
        gain: lines.reduce((s, l) => s + l.q * (shWhole(worthOf ? worthOf(l.id) : 0) - l.price), 0),
    }));
    return stops.sort((a, b) => (a.im - b.im) || b.gain - a.gain || (a.place < b.place ? -1 : 1));
}

/** A run not started. `took` is line key -> units you took, as seen on the page or in Torn's log. */
export const RUN_IDLE = Object.freeze({ on: false, at: 0, took: {}, place: null });

export function runStart(stops) {
    return stops && stops.length ? { on: true, at: 0, took: {}, place: stops[0].place } : { ...RUN_IDLE };
}

/** The stop the run stands on, found again by its place: the list may have been re-sorted by a fresh read. */
export function runAt(run, stops) {
    if (!run || !run.on) return -1;
    const i = (stops || []).findIndex((s) => s.place === run.place);
    return i >= 0 ? i : Math.min(shWhole(run.at), (stops || []).length - 1);
}

/** Next: the stop after this one, or the run is over. Nothing is counted here: `took` says what was bought. */
export function runNext(run, stops) {
    if (!run || !run.on) return run || { ...RUN_IDLE };
    const at = runAt(run, stops) + 1;
    if (at >= (stops || []).length) return { ...run, on: false, at, place: null, done: true };
    return { ...run, at, place: stops[at].place };
}

/** Units of a line seen bought. The larger count wins: a log that lags never un-buys what the page saw. */
export function runTook(run, key, units) {
    const had = shWhole(run && run.took && run.took[key]);
    const n = Math.max(had, shWhole(units));
    return n === had ? run : { ...run, took: { ...((run && run.took) || {}), [key]: n } };
}

export const tookAt = (run, stop) => (stop ? stop.lines.reduce((s, l) => s + Math.min(l.q, shWhole(run && run.took && run.took[l.key])), 0) : 0);

/**
 * What each stop says while a run is on, and after it.
 * @returns { stops: [{ ...stop, took, state: '' | 'cur' | 'done' | 'part' | 'skip' }], at, units, cost, gain, got, skipped, began }
 */
export function runView(run, stops) {
    const list = stops || [];
    const at = runAt(run, list);
    const began = !!(run && (run.on || run.done));
    const past = (i) => began && (run.done || i < at);
    const rows = list.map((s, i) => {
        const took = tookAt(run, s);
        const state = run && run.on && i === at ? 'cur' : !past(i) ? '' : took >= s.units ? 'done' : took ? 'part' : 'skip';
        return { ...s, took, state };
    });
    return {
        stops: rows, at, began,
        units: rows.reduce((s, r) => s + r.units, 0),
        cost: rows.reduce((s, r) => s + r.cost, 0),
        gain: rows.reduce((s, r) => s + r.gain, 0),
        got: rows.reduce((s, r) => s + r.took, 0),
        skipped: rows.filter((r) => r.state === 'skip').length,
    };
}

/** After a run: what was taken leaves the list, what was skipped stays on it. */
export function listAfterRun(cart, run) {
    const out = [];
    for (const l of cart || []) {
        const left = l.q - Math.min(l.q, shWhole(run && run.took && run.took[l.key]));
        if (left > 0) out.push({ ...l, q: left });
    }
    return out;
}
