// A listing judged on the SET it would finish, not on the piece alone. Pure working-out.
//
// The owner, 2026-10-11: "yes whole set is how i think about it" - a Kitten $100 over its share is nothing, a Camel
// at 75k where its share is 70k is a lot. So the sets you are still to finish are walked in turn, the cheapest
// units first. A set has room: what its other pieces are UNDER their share by - the pieces you already hold at
// what they cost you, the pieces still to buy at their cheapest listing. A unit at or under its own share is always
// worth buying (it can never be what breaks a set). A unit over its share is
//   Buy        while the set's room covers it: the set still pays at today's points price with your least profit;
//   Stretch    when it only pays at the price you usually sell points for;
//   No thanks  when it is over even that.
// Nothing here is a typed money figure: every line is the set's own value against what its pieces cost.

const sjNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const sjWhole = (v) => Math.max(0, Math.floor(sjNum(v)));

/**
 * The price you usually sell points for: your own sales of the last two weeks, each lot by its size. With none on
 * record, the middle of the market's usual range (points.js usualLevel). 0 when neither says.
 * @param entries the points book's entries [{ kind, t, points, each }]
 * @param level   { lo, hi } | { days }
 */
export function usualSell(entries, level, now, days = 14) {
    let points = 0;
    let got = 0;
    for (const e of entries || []) {
        if (!e || e.kind !== 'sold' || !(e.each > 0) || !(now - e.t < days * 86400000)) continue;
        points += sjWhole(e.points);
        got += sjWhole(e.points) * sjNum(e.each);
    }
    if (points > 0) return { price: Math.round(got / points), from: 'sales', points };
    if (level && level.lo > 0 && level.hi > 0) return { price: Math.round((level.lo + level.hi) / 2), from: 'market', points: 0 };
    return { price: 0, from: '', points: 0 };
}

/**
 * One set's listings sorted into the three groups.
 * @param set { points, pieces: [{ id }] }
 * @param o {
 *   target        sets you build
 *   held(id)      units you hold
 *   avg(id)       what a unit you hold cost you (the pool's average); 0 = none on record: it counts for nothing
 *   guide(id)     the piece's share of the set with your least profit taken off (margin.js safeWorth): a unit is
 *                 worth buying by itself while its price is UNDER this
 *   rows(id)      the listings that count, cheapest first: [{ price, qty }]
 *   more          dollars a set may cost on top at the price you usually sell points for (0: no Stretch group)
 *   perMore       dollars of `more` that one dollar of points price buys (set.points / (1 + least)): to say the
 *                 points price a Stretch unit needs
 *   priceNow      today's points price
 * }
 * @returns {
 *   pieces: Map id -> { buy, line, stretch, lineS, fin, takeLine, needs }
 *     buy / stretch  units in each group, the cheapest first (No thanks is the rest)
 *     line           a unit is Buy while its price is UNDER this (never under the guide)
 *     lineS          ... Buy or Stretch while under this
 *     fin            Stretch units that finish a set no Buy listing finishes: the ones a list takes
 *     takeLine       the line of what a list takes (buy + fin units)
 *     needs          the points price the dearest Stretch unit needs (0 with none)
 *   next: { k, room, perPoint } | null   the next set to finish: what it still has to spare, in all and a point
 * }
 */
export function judgeSet(set, o) {
    const ids = set.pieces.map((p) => String(p.id));
    const target = sjWhole(o.target);
    const more = Math.max(0, sjNum(o.more));
    const st = new Map();
    for (const id of ids) {
        const guide = sjWhole(o.guide(id));
        st.set(id, { id, guide, held: sjWhole(o.held(id)), avg: sjNum(o.avg(id)), rows: o.rows(id) || [], at: 0, used: 0, buy: 0, stretch: 0, fin: 0, last: 0, lastS: 0, lastFin: 0, offB: false, offS: false, needs: 0 });
    }
    // The k-th unit of a piece's listings, taken once each: a pointer walks the rows.
    const unit = (p) => {
        while (p.at < p.rows.length && p.used >= sjWhole(p.rows[p.at].qty)) { p.at += 1; p.used = 0; }
        if (p.at >= p.rows.length) return 0;
        p.used += 1;
        return sjWhole(p.rows[p.at].price);
    };
    let next = null;
    const first = Math.min(...ids.map((id) => st.get(id).held)) + 1;
    for (let k = first; k <= target; k++) {
        let room = 0;
        let finish = true;
        const over = [];
        for (const id of ids) {
            const p = st.get(id);
            if (!(p.guide > 0)) { finish = false; continue; }
            if (p.held >= k) { if (p.avg > 0) room += p.guide - 1 - p.avg; continue; }
            if (p.offS) { finish = false; continue; }
            const price = unit(p);
            if (!price) { p.offB = true; p.offS = true; finish = false; continue; }
            if (price < p.guide) { room += p.guide - 1 - price; p.buy += 1; p.last = price; continue; }
            over.push({ p, price, by: price - (p.guide - 1) });
        }
        if (!next) next = { k, room: Math.round(room), perPoint: set.points ? Math.round(room / set.points) : 0 };
        // The smallest overpay first: the room goes to as many units as it covers.
        over.sort((a, b) => a.by - b.by);
        const fins = [];
        for (const c of over) {
            const p = c.p;
            if (!p.offB && room >= c.by) { room -= c.by; p.buy += 1; p.last = c.price; continue; }
            p.offB = true;
            if (more > 0 && room + more >= c.by) {
                room -= c.by;
                p.stretch += 1;
                p.lastS = c.price;
                // What the set is short of at today's price, as the points price that would cover it.
                if (o.perMore > 0) p.needs = Math.max(p.needs, Math.ceil(sjNum(o.priceNow) + -room / o.perMore));
                fins.push(p);
                continue;
            }
            p.offS = true;
            finish = false;
        }
        // A set every missing piece of which has a listing, and that only a Stretch finishes: its Stretch units
        // are the ones a list takes (a piece bought dear for a set that cannot be finished yet only waits).
        if (finish) for (const p of fins) { p.fin = p.stretch; p.lastFin = p.lastS; }
        if (ids.every((id) => { const p = st.get(id); return p.held >= target || p.offS; })) break;
    }
    const pieces = new Map();
    for (const id of ids) {
        const p = st.get(id);
        const line = Math.max(p.guide, p.buy ? p.last + 1 : 0);
        const lineS = Math.max(line, p.stretch ? p.lastS + 1 : 0);
        pieces.set(id, { buy: p.buy, line, stretch: p.stretch, lineS, fin: p.fin, takeLine: p.fin ? Math.max(line, p.lastFin + 1) : line, needs: p.stretch ? p.needs : 0 });
    }
    return { pieces, next };
}
