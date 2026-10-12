// The shortlist: of everything that lists a piece, the few rows a list, a deal or the "Sold by" table can ever use.
//
// The owner, 2026-10-11: "we need some sort of intermediary state ... the one that does the hard filtering". The
// whole pile of listings (thousands of rows with the shared server on) is kept as it was read, sorted once a piece
// when an answer changes it (engine/state.js pileOf). From it, for every piece, this keeps:
//   - the cheapest rows that count, up to a few times what you need of the piece;
//   - its rows at every bazaar a list would go to anyway (so stops can still be gathered: shopping.js fewerStops);
//   - the rows of your list as it stands;
//   - the cheapest rows not checked lately that a list would use (they are asked of Torn next);
//   - the cheap rows of a place you do not buy from, and the first rows over the line, to show where the line is.
// What is left out is counted, and said once. A list made from the shortlists is the same list the whole pile
// makes: test/shortlist.test.js holds both against each other.
// Pure working-out on plain rows. The pile's rows are shared with the layer: none is written on here.

import { placeOf } from './shopping.js';

const slWhole = (v) => Math.max(0, Math.floor(Number(v) || 0));

/** The cheapest rows that count are kept until they hold this many times what you need of the piece. */
export const SHORT_TIMES = 3;
/** ... and never fewer rows than this where you buy: a piece you have enough of still shows who sells it. */
export const SHORT_ROWS = 14;
/** Rows over the line that are kept, to show where the line is. */
export const SHORT_OVER = 2;
/** Rows of a place you do not buy from that are kept whatever they cost. */
export const SHORT_OUT = 3;

const slRank = (o) => (o.ok === false ? 2 : o.out ? 1 : 0);

/**
 * @param pieces [{ id, need, take, takeLine, line, lineS, worth }]
 *   take / takeLine   what a list takes of the piece: so many units, each under that price (core/setjudge.js)
 *   line / lineS      a row under `line` is Buy, under `lineS` Stretch, at or over it "No thanks"
 * @param pileOf  id -> every listing of the piece, cheapest first: [{ price, qty, src, whoId, ok }]
 * @param cartPlaces id -> Set of the places your list has a line for the piece at (or null)
 * @param isOut   row -> true when it is in a place you do not buy from (settings.from)
 * @returns Map id -> {
 *   rows     the shortlist: the rows that count first, then the places you do not buy from (`out: true`), then
 *            the rows not checked lately; cheapest first in each
 *   all      rows in the pile
 *   under    { units, places } rows that count under the piece's own worth
 *   good     { units, places } rows that count under its line (Buy)
 *   left     { over, more, old, out } rows left out: over the line (sellers), under it beyond the shortlist,
 *            not checked lately, in a place you do not buy from
 *   lowAll   the cheapest row anywhere, a checked one first (the day's record of the price)
 *   lowBazaar the cheapest bazaar's price as the table has it, or 0
 * }
 */
export function shortlists(pieces, pileOf, cartPlaces = null, isOut = null) {
    const list = pieces || [];
    const piles = new Map();
    const outOf = (o) => !!(isOut ? isOut(o) : o.out);
    // What a list would go to: the places of the cheapest rows that fill what it takes of each piece.
    const places = new Set();
    for (const p of list) {
        const pile = (pileOf && pileOf(p.id)) || [];
        piles.set(String(p.id), pile);
        let left = slWhole(p.take);
        for (let k = 0; k < pile.length && left > 0; k++) {
            const o = pile[k];
            if (o.price >= p.takeLine) break;
            if (o.ok === false || outOf(o)) continue;
            places.add(placeOf(o));
            left -= slWhole(o.qty);
        }
    }
    const out = new Map();
    for (const p of list) {
        const id = String(p.id);
        const pile = piles.get(id);
        const mine = cartPlaces ? cartPlaces(id) : null;
        const most = SHORT_TIMES * Math.max(1, slWhole(p.need));
        const rows = [];
        const under = { units: 0, places: 0 };
        const good = { units: 0, places: 0 };
        const left = { over: 0, more: 0, old: 0, out: 0 };
        // Units seen so far under the line: that count, of every row where you buy, and where you do not.
        let units = 0;
        let unitsAll = 0;
        let unitsOut = 0;
        let kept = 0;
        let over = 0;
        let outs = 0;
        let lowAll = null;
        let lowOld = null;
        let lowBazaar = 0;
        let lowBazaarRank = 3;
        for (const o of pile) {
            if (!(o.price > 0) || !(o.qty > 0)) continue;
            const q = slWhole(o.qty);
            const old = o.ok === false;
            const away = outOf(o);
            const place = placeOf(o);
            const onList = !away && !!(mine && mine.has(place));
            const rank = old ? 2 : away ? 1 : 0;
            if (!old && !lowAll) lowAll = o;
            if (old && !lowOld) lowOld = o;
            if (o.src !== 'market' && rank < lowBazaarRank) { lowBazaarRank = rank; lowBazaar = o.price; }
            const counts = !old && !away;
            if (counts && o.price < p.worth) { under.units += q; under.places += 1; }
            if (counts && o.price < p.line) { good.units += q; good.places += 1; }
            let keep = onList;
            if (away) {
                // A place you do not buy from: its checked rows under the line are still a price (a deal anyone can
                // take, the day's low), up to as many as you could use; a few more whatever they cost.
                if (!old && o.price < p.lineS && unitsOut < most) keep = true;
                else if (outs < SHORT_OUT) keep = true;
                if (!old && o.price < p.lineS) unitsOut += q;
                if (keep) outs += 1; else left.out += 1;
            } else if (o.price >= p.lineS) {
                // Over the line: the first few, checked or not, show where it is.
                if (!keep && (over < SHORT_OVER || kept < SHORT_ROWS)) keep = true;
                if (keep) over += 1; else if (old) left.old += 1; else left.over += 1;
            } else if (old) {
                // Not checked lately: kept while a list made of every row shown would still reach it.
                if (!keep && (unitsAll < most || kept < SHORT_ROWS)) keep = true;
                if (!keep) left.old += 1;
            } else {
                if (!keep && (units < most || kept < SHORT_ROWS || places.has(place))) keep = true;
                if (!keep) left.more += 1;
                // A row of your list is kept whatever comes: it does not use up the room of the others.
                if (!onList) units += q;
            }
            if (!away && o.price < p.lineS && !onList) unitsAll += q;
            if (keep) { rows.push(away ? { ...o, out: true } : o); if (!away) kept += 1; }
        }
        rows.sort((a, b) => slRank(a) - slRank(b) || a.price - b.price);
        out.set(id, { rows, all: pile.length, under, good, left, lowAll: lowAll || lowOld, lowBazaar });
    }
    return out;
}
