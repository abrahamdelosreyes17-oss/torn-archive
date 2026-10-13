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
 * A piece counts as cheap when it is under this share of an even share of its set (a quarter: of thirteen pieces,
 * one under 1.9% of what the set costs - a Kitten or a Sheep, never a Camel). A ratio, not a dollar figure.
 */
export const SMALL_SHARE = 0.25;
/** Whether a piece is a small part of what its set costs. @param mvOf id -> market value; pieces: the set's own */
export function smallPiece(itemId, pieces, mvOf) {
    const all = (pieces || []).reduce((s, p) => s + shWhole(mvOf(p.id)), 0);
    const n = (pieces || []).length;
    return all > 0 && n > 0 && shWhole(mvOf(itemId)) > 0 && shWhole(mvOf(itemId)) < all / n * SMALL_SHARE;
}

/**
 * "Fill my stock": the cheapest way to what you need, taking a unit only while its price is under the piece's
 * safe worth (what it brings less your least profit).
 *
 * 1.4.0 - a cheap piece (`small`) goes to the places that hold the most of what you need first, the price second
 * (the owner, 2026-10-13: "for cheap items like kittens and sheep etc, can it prioritize the bazaars with a lot
 * more quantity in it not the x1 x1 x1 ... and also make sure its still profitable"). Every unit is still under
 * the piece's worth; the few dollars a unit it costs are nothing against a stop for one Kitten. Until then every
 * piece was taken cheapest first whatever its listing held.
 * @param pieces   [{ id, name, set, need, worth, small }] - worth is the SAFE worth
 * @param offersOf id -> [{ price, qty, src, who, whoId }]
 */
export function fillPlan(pieces, offersOf) {
    const out = [];
    for (const p of pieces || []) {
        let left = shWhole(p.need);
        if (!left || !(p.worth > 0)) continue;
        const all = [...((offersOf && offersOf(p.id)) || [])].filter((o) => shWhole(o.price) > 0 && shWhole(o.qty) > 0).sort((a, b) => a.price - b.price);
        if (p.small) { out.push(...shBigFirst(p, all.filter((o) => o.price < p.worth), left)); continue; }
        const seen = new Set();
        // The Item Market's rows, cheapest first with everything else: what falls to them is one line.
        let imQ = 0;
        let imCost = 0;
        let imRow = null;
        let imAt = 0;
        for (const o of all) {
            if (!left || o.price >= p.worth) break;
            const q = Math.min(left, shWhole(o.qty));
            if (placeOf(o) === IM_PLACE) { if (!imRow) { imRow = o; imAt = out.length; } imQ += q; imCost += q * shWhole(o.price); left -= q; continue; }
            // One line per place: a second listing of the same seller at another price is left for the next read.
            if (seen.has(placeOf(o))) continue;
            seen.add(placeOf(o));
            out.push(shLine(p, o, q));
            left -= q;
        }
        if (imQ) out.splice(imAt, 0, shLine(p, { ...imRow, price: Math.ceil(imCost / imQ) }, imQ));
    }
    return out;
}

/**
 * A cheap piece's lines: the place that holds the most of what is still needed first, the cheaper one of two that
 * hold as much. A bazaar is its cheapest listing; the Item Market is its rows under the worth taken together.
 * @param rows the piece's listings under its worth, cheapest first
 */
function shBigFirst(piece, rows, need) {
    const places = new Map();
    for (const o of rows) {
        const place = placeOf(o);
        if (place === IM_PLACE) {
            const im = places.get(place) || { place, rows: [], qty: 0, price: shWhole(o.price) };
            im.rows.push(o);
            im.qty += shWhole(o.qty);
            places.set(place, im);
        } else if (!places.has(place)) places.set(place, { place, rows: [o], qty: shWhole(o.qty), price: shWhole(o.price) });
    }
    const out = [];
    let left = need;
    const open = [...places.values()];
    while (left > 0 && open.length) {
        open.sort((a, b) => Math.min(left, b.qty) - Math.min(left, a.qty) || a.price - b.price || (a.place < b.place ? -1 : 1));
        const s = open.shift();
        const q = Math.min(left, s.qty);
        let cost = 0;
        let take = q;
        for (const o of s.rows) { const n = Math.min(take, shWhole(o.qty)); cost += n * shWhole(o.price); take -= n; if (!take) break; }
        out.push(shLine(piece, { ...s.rows[0], price: Math.ceil(cost / q) }, q));
        left -= q;
    }
    return out;
}

/**
 * Fewer stops for the same pieces. A stop is dropped when everything it has for you can also be had at bazaars you
 * are going to anyway - each unit still under the piece's worth. The smallest stops are tried first, so the list
 * gathers at the bazaars that hold a lot of what you need. (The owner, 2026-10-11: "prioritize for example a bazaar
 * has a lot of things i need instead of just 1 bazaar 1 bazaar".) The price of it: those units at the other
 * bazaar's price, which is the dearer one - never over the worth. The Item Market's line is left as it is.
 *
 * 1.3.0: each stop is tried once, the smallest first, and a piece's listings are sorted by place once. A stop
 * that could not be emptied never can be later (the others only fill up), so trying it again changes nothing -
 * until then every stop was tried again after each one dropped, and the time grew about with the stops cubed
 * (his own state, 2026-10-11: 182 to 1,195 ms a list, the page frozen meanwhile; now 21 to 31 ms, the same list).
 * test/fewer-stops.test.js holds the old working-out beside this one on made-up lists.
 * @param plan     fillPlan's lines
 * @param pieces   [{ id, worth }] as given to fillPlan
 * @param offersOf id -> [{ price, qty, src, who, whoId }]
 */
export function fewerStops(plan, pieces, offersOf) {
    const worth = new Map((pieces || []).map((p) => [String(p.id), shWhole(p.worth)]));
    let cart = (plan || []).map((l) => ({ ...l }));
    const byPlace = new Map();
    const rows = new Map();
    const rowAt = (id, place) => {
        const k = String(id);
        if (!byPlace.has(k)) {
            const by = new Map();
            for (const o of (offersOf && offersOf(id)) || []) { const p = placeOf(o); if (!by.has(p)) by.set(p, []); by.get(p).push(o); }
            byPlace.set(k, by);
            rows.set(k, new Map());
        }
        const known = rows.get(k);
        if (!known.has(place)) {
            const w = worth.get(k) || 0;
            const o = placeOffer(byPlace.get(k).get(place) || [], place, w);
            known.set(place, o && w > 0 && shWhole(o.price) < w ? o : null);
        }
        return known.get(place);
    };
    const stuck = new Set();
    for (;;) {
        const units = new Map();
        for (const l of cart) if (!l.im) units.set(l.place, (units.get(l.place) || 0) + l.q);
        if (units.size < 2) return cart;
        const order = [...units].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)).map(([place]) => place);
        const from = order.find((place) => !stuck.has(place));
        if (from === undefined) return cart;
        const next = cart.filter((l) => l.place !== from).map((l) => ({ ...l }));
        const at = new Map();
        for (const l of next) { const k = lineKey(l.id, l.place); if (!at.has(k)) at.set(k, l); }
        let fits = true;
        for (const line of cart.filter((l) => l.place === from)) {
            let left = line.q;
            const spots = order.filter((place) => place !== from).map((place) => ({ place, o: rowAt(line.id, place) })).filter((s) => s.o).sort((a, b) => a.o.price - b.o.price || (a.place < b.place ? -1 : 1));
            for (const s of spots) {
                if (!left) break;
                const have = at.get(lineKey(line.id, s.place));
                const free = shWhole(s.o.qty) - (have ? have.q : 0);
                const q = Math.min(left, free);
                if (q <= 0) continue;
                if (have) have.q += q;
                else { const made = shLine({ id: line.id, name: line.name, set: line.set }, s.o, q); next.push(made); at.set(lineKey(made.id, made.place), made); }
                left -= q;
            }
            if (left) { fits = false; break; }
        }
        if (fits) cart = next; else stuck.add(from);
    }
}

/** The list as it is made: the cheapest way to what you need (fillPlan), then gathered at fewer bazaars (fewerStops). */
export const fillList = (pieces, offersOf) => fewerStops(fillPlan(pieces, offersOf), pieces, offersOf);

/**
 * The pieces as "Do now" counts them: a unit is worth buying only under what you pay your sellers AND under its
 * safe worth. The list made from them is the one its line names - the same pieces, the same stops.
 */
export const cheapPieces = (pieces) => (pieces || []).map((p) => ({ ...p, worth: Math.min(shWhole(p.worth), shWhole(p.pay)) }));

/**
 * What one place has of a piece for you. A bazaar: its cheapest listing. The Item Market: it is one page with a
 * row for every price, so it is its rows under the piece's worth taken together - `qty` all of them, `price`
 * what each of the cheapest `want` costs on average (none under the worth: its cheapest row, which is then dear).
 * @returns null when the place lists none
 */
export function placeOffer(offers, place, worth, want = 0) {
    const rows = (offers || []).filter((o) => placeOf(o) === place && shWhole(o.qty) > 0 && shWhole(o.price) > 0).sort((a, b) => a.price - b.price);
    if (!rows.length) return null;
    if (place !== IM_PLACE) return rows[0];
    const under = rows.filter((o) => worth > 0 && o.price < worth);
    if (!under.length) return rows[0];
    const qty = under.reduce((s, o) => s + shWhole(o.qty), 0);
    let left = Math.min(qty, shWhole(want) || qty);
    const units = left;
    let cost = 0;
    for (const o of under) { const q = Math.min(left, shWhole(o.qty)); cost += q * shWhole(o.price); left -= q; if (!left) break; }
    return { ...under[0], price: Math.ceil(cost / units), qty };
}

/**
 * `units` of a piece spread over the Item Market's rows under its worth, cheapest first: how many fall to each
 * of `rows` (in the order given; a row over the worth gets none).
 */
export function imShares(rows, worth, units) {
    const order = (rows || []).map((o, i) => ({ o, i })).filter((x) => worth > 0 && x.o.price < worth && shWhole(x.o.qty) > 0).sort((a, b) => a.o.price - b.o.price || a.i - b.i);
    const out = (rows || []).map(() => 0);
    let left = shWhole(units);
    for (const { o, i } of order) { const q = Math.min(left, shWhole(o.qty)); out[i] = q; left -= q; if (!left) break; }
    return out;
}

/** One listing put on the list (as many as you still need of it), or taken off when it is already there. */
export function toggleLine(cart, piece, offer) {
    const key = lineKey(piece.id, placeOf(offer));
    const list = cart || [];
    if (list.some((l) => l.key === key)) return list.filter((l) => l.key !== key);
    const want = shWhole(piece.need) - onList(list, piece.id);
    // The Item Market: whichever of its rows was pressed, the line is its rows under the worth, cheapest first.
    const o = placeOf(offer) === IM_PLACE ? placeOffer(piece.offers || [offer], IM_PLACE, piece.worth, want) || offer : offer;
    const q = Math.min(shWhole(o.qty), want);
    return q > 0 ? [...list, shLine(piece, o, q)] : list;
}

export const dropLine = (cart, key) => (cart || []).filter((l) => l.key !== key);

/**
 * Every listing of ONE piece under its worth put on the list in one press: the cheapest first, as many as you still
 * need, one line per place. A place already on the list for this piece keeps its line as it is.
 * @param piece  { id, name, set, need, worth }
 * @param offers the piece's listings that count: [{ price, qty, src, who, whoId }]
 */
export function addAll(cart, piece, offers) {
    const list = cart || [];
    if (!piece) return list;
    const want = shWhole(piece.need) - onList(list, piece.id);
    if (want <= 0) return list;
    const have = new Set(list.filter((l) => String(l.id) === String(piece.id)).map((l) => l.place));
    const rows = (offers || []).filter((o) => !have.has(placeOf(o)));
    return [...list, ...fillPlan([{ ...piece, need: want }], () => rows)];
}

/** A piece taken off the list, every place of it. */
export const dropPiece = (cart, itemId) => (cart || []).filter((l) => String(l.id) !== String(itemId));

/** The list without the lines of a place you no longer buy from. `keep(line)` true: the line stays whatever its place. */
export const dropPlaces = (cart, allowed, keep = null) => (cart || []).filter((l) => allowed({ src: l.im ? 'market' : 'bazaar' }) || (keep && keep(l)));

/**
 * The list checked against a fresh read: a line whose listing is gone, or no longer under its worth, comes off;
 * one with less stock or less need shrinks. Nothing is ever added here.
 *
 * `tookOf` (a run is on): line key -> units you took on that line since the run began. They are in your stock
 * now, so the piece's need and the listing's stock both fell by them; the line keeps them, and says "took 5 of
 * 5" until Next - it does not shrink to nothing under you. A line you took from stays even when its listing is
 * gone or dear now: what is left of it is then nothing more to buy.
 * @returns { cart, dropped: [{ key, name, why: 'gone' | 'dear' | 'enough' }] }
 */
export function refreshList(cart, pieces, offersOf, tookOf = null) {
    const byId = new Map((pieces || []).map((p) => [String(p.id), p]));
    const out = [];
    const dropped = [];
    const taken = new Map();
    for (const l of cart || []) {
        const p = byId.get(String(l.id));
        const took = Math.min(shWhole(l.q), shWhole(tookOf ? tookOf(l.key) : 0));
        const had = taken.get(String(l.id)) || 0;
        const need = p ? shWhole(p.need) - had : 0;
        const offer = placeOffer((offersOf && offersOf(l.id)) || [], l.place, p ? p.worth : 0, Math.min(shWhole(l.q) - took, Math.max(0, need)));
        const dear = !p || !(p.worth > 0) || (offer && offer.price >= p.worth);
        if (took && (!offer || dear || need <= 0)) { out.push({ ...l, q: took }); continue; }
        if (!offer) dropped.push({ key: l.key, name: l.name, why: 'gone' });
        else if (dear) dropped.push({ key: l.key, name: l.name, why: 'dear' });
        else if (need <= 0) dropped.push({ key: l.key, name: l.name, why: 'enough' });
        else {
            const more = Math.min(shWhole(l.q) - took, shWhole(offer.qty), need);
            taken.set(String(l.id), had + more);
            out.push({ ...l, price: shWhole(offer.price), q: took + more, who: offer.who || l.who, whoId: offer.whoId ?? l.whoId });
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
    return stops && stops.length ? { on: true, at: 0, took: {}, place: stops[0].place, order: stops.map((s) => s.place) } : { ...RUN_IDLE };
}

/**
 * The stops in the order the run began in. They are sorted by what they save, and that moves with every read (a
 * listing partly sold, a price changed): a stop that slid ahead of the one you stand on would read "skipped" and
 * never be reached. A place new to the list goes last.
 */
export function runOrder(stops, run) {
    if (!run || !run.on || !Array.isArray(run.order)) return stops || [];
    const at = new Map(run.order.map((place, i) => [place, i]));
    const rank = (s) => (at.has(s.place) ? at.get(s.place) : run.order.length);
    return (stops || []).map((s, i) => [s, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map((x) => x[0]);
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
 * A press of Start, Next or Stop in the box on a Torn page, applied to the run as the view has it (runView's
 * answer) - at once, before the hub's tab has taken the press. Until 1.3.0 the box showed nothing until the hub
 * answered, and a busy hub answered after up to 42 s ("i press stop the run but nothing happens").
 * As the engine does it (engine.js act run): Next from a bazaar of the list that is not the stop the run is on
 * goes on from that bazaar; the stops passed over stay on the list.
 * @param run   { stops: [{ place, units, took, state }], at, took }; the answer adds `over`: the press passed the last stop
 * @param op    'start' | 'next' | 'stop'
 * @param place where you stand ('b:' + id, or 'im'), for Next
 */
export function runLocal(run, op, place = null) {
    const stops = (run && run.stops) || [];
    if (op === 'stop') return { ...run, stops: stops.map((s) => ({ ...s, state: '', took: 0 })), at: -1, began: false, over: false, took: {}, got: 0, skipped: 0 };
    if (op === 'start') return { ...run, stops: stops.map((s, i) => ({ ...s, took: 0, state: i === 0 ? 'cur' : '' })), at: stops.length ? 0 : -1, began: true, over: false, took: {}, got: 0, skipped: 0 };
    if (op !== 'next') return run;
    const cur = stops.findIndex((s) => s.state === 'cur');
    if (cur < 0) return run;
    const here = place ? stops.findIndex((s) => s.place === place) : -1;
    const next = (here >= 0 ? here : cur) + 1;
    const past = (s) => (s.took >= s.units ? 'done' : s.took ? 'part' : 'skip');
    const rows = stops.map((s, i) => ({ ...s, state: i === next ? 'cur' : i < next ? past(s) : '' }));
    return { ...run, stops: rows, at: next < stops.length ? next : -1, over: next >= stops.length, skipped: rows.filter((r) => r.state === 'skip').length };
}

/**
 * What each stop says while a run is on, and after it.
 * @returns { stops: [{ ...stop, took, state: '' | 'cur' | 'done' | 'part' | 'skip' }], at, units, cost, gain, got, skipped, began }
 */
export function runView(run, stops) {
    const list = stops || [];
    // Over, and summed when it ended: what was taken has left the list, so the lines are what is still to buy.
    if (run && run.done && run.sum) {
        const rows = list.map((s) => ({ ...s, took: 0, state: '' }));
        return {
            stops: rows, at: -1, began: true,
            units: shWhole(run.sum.units), cost: rows.reduce((s, r) => s + r.cost, 0), gain: rows.reduce((s, r) => s + r.gain, 0),
            got: shWhole(run.sum.got), skipped: shWhole(run.sum.skipped),
        };
    }
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
