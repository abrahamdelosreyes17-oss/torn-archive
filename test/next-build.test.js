// Torn Archive 1.3.0, the parts that are pure working-out: each rule of the build as the owner's agenda names it
// (HANDOFF-archive-and-server.md, "THE NEXT BUILD"), held against the fault it answers.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fillPlan, fewerStops, fillList, cheapPieces, stopsOf, placeOf, placeOffer, lineKey, runStart, runNext, runView, runLocal, RUN_IDLE, IM_PLACE } from '../src/core/shopping.js';
import { judgeSet, usualSell } from '../src/core/setjudge.js';
import { shortlists } from '../src/core/shortlist.js';
import { archiveView, viewForTabs, viewPiece, listPieces } from '../src/core/view.js';
import { stockBuys } from '../src/core/accepted.js';
import { engineEmpty, foldListings, foldShop, offersOf, pileOf, notePage, noteSeenBuy, judgeSeen, engineInput, PAGE_STANDS_MS, SEEN_JUDGE_MS } from '../src/engine/state.js';
import { archiveSettings } from '../src/core/settings.js';
import { oneRemoved, pressesLeft, viewWithPresses, shopSeen, NOTES_KEEP_MS } from '../src/ui/torn-page.js';
import { boxBazaar, boxAny } from '../src/ui/box-pages.js';
import { fixtureInput } from './fixture-view.js';

const NOW = Date.UTC(2026, 9, 12, 9, 0);
const MIN = 60000;
const sec = (t) => Math.floor(t / 1000);
// Math.imul keeps the low bits a plain product loses; the low byte of such a generator is too regular to use.
const rng = (seed) => { let s = seed; return (n) => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return (s >>> 8) % n; }; };
const shared = (input) => JSON.parse(JSON.stringify(viewForTabs(archiveView(input))));

// ---- A1. the list maker: the same list as the released one, in a fraction of the time -----------------------------

/** fewerStops as 1.2.5 had it (commit 0277d25): every stop tried again after each one that was dropped. */
function fewerStopsOld(plan, pieces, offersFn) {
    const whole = (v) => Math.max(0, Math.floor(Number(v) || 0));
    const line = (piece, offer, q) => ({ key: lineKey(piece.id, placeOf(offer)), id: piece.id, name: piece.name, set: piece.set || null, place: placeOf(offer), im: offer.src === 'market', who: offer.who || null, whoId: offer.whoId ?? null, price: whole(offer.price), q });
    const worth = new Map((pieces || []).map((p) => [String(p.id), whole(p.worth)]));
    let cart = (plan || []).map((l) => ({ ...l }));
    const rowAt = (id, place) => {
        const w = worth.get(String(id)) || 0;
        const o = placeOffer((offersFn && offersFn(id)) || [], place, w);
        return o && w > 0 && whole(o.price) < w ? o : null;
    };
    for (;;) {
        const units = new Map();
        for (const l of cart) if (!l.im) units.set(l.place, (units.get(l.place) || 0) + l.q);
        if (units.size < 2) return cart;
        const order = [...units].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)).map(([place]) => place);
        let moved = false;
        for (const from of order) {
            const others = order.filter((x) => x !== from);
            const next = cart.filter((l) => l.place !== from).map((l) => ({ ...l }));
            let fits = true;
            for (const l0 of cart.filter((l) => l.place === from)) {
                let left = l0.q;
                const spots = others.map((place) => ({ place, o: rowAt(l0.id, place) })).filter((s) => s.o).sort((a, b) => a.o.price - b.o.price || (a.place < b.place ? -1 : 1));
                for (const s of spots) {
                    if (!left) break;
                    const have = next.find((l) => l.place === s.place && String(l.id) === String(l0.id));
                    const free = whole(s.o.qty) - (have ? have.q : 0);
                    const q = Math.min(left, free);
                    if (q <= 0) continue;
                    if (have) have.q += q;
                    else next.push(line({ id: l0.id, name: l0.name, set: l0.set }, s.o, q));
                    left -= q;
                }
                if (left) { fits = false; break; }
            }
            if (fits) { cart = next; moved = true; break; }
        }
        if (!moved) return cart;
    }
}

function madeUp(rnd, nPieces, nShops) {
    const pieces = [];
    const offers = {};
    for (let p = 0; p < nPieces; p++) {
        const id = 100 + p;
        const worth = 1000 + rnd(5000);
        pieces.push({ id, name: 'P' + id, set: 'x', need: rnd(60), worth });
        const rows = [];
        for (let s = 0; s < nShops; s++) {
            if (rnd(3) === 0) continue;
            for (let k = 0, n = 1 + rnd(2); k < n; k++) rows.push({ price: Math.max(2, worth - 800 + rnd(1200)), qty: 1 + rnd(25), src: 'bazaar', who: 'S' + s, whoId: 5000 + s });
        }
        for (let k = 0, n = rnd(4); k < n; k++) rows.push({ price: Math.max(2, worth - 500 + rnd(900)), qty: 1 + rnd(10), src: 'market' });
        offers[id] = rows;
    }
    return { pieces, of: (id) => offers[id] || [] };
}

test('A1. the list maker rewritten: the same list as the released one on 300 made-up desks, and a stop is dropped in most of them', () => {
    const rnd = rng(12345);
    let moved = 0;
    for (let round = 0; round < 300; round++) {
        const { pieces, of } = madeUp(rnd, 2 + rnd(10), 2 + rnd(round < 240 ? 14 : 45));
        const plan = fillPlan(pieces, of);
        const was = fewerStopsOld(plan, pieces, of);
        const is = fewerStops(plan, pieces, of);
        assert.deepEqual(is, was, 'desk ' + round);
        if (JSON.stringify(was) !== JSON.stringify(plan)) moved += 1;
    }
    assert.ok(moved > 100, 'stops were dropped in ' + moved + ' of 300');
});

test('A1. a list of a hundred and fifty bazaars is made in a moment (the released one froze the page for up to 1.2 s on his own desk)', () => {
    const { pieces, of } = madeUp(rng(77), 25, 150);
    for (const p of pieces) p.need = 40 + (p.id % 30);
    const plan = fillPlan(pieces, of);
    const t0 = performance.now();
    const out = fewerStops(plan, pieces, of);
    const took = performance.now() - t0;
    assert.ok(new Set(plan.filter((l) => !l.im).map((l) => l.place)).size > 60, 'the plan has many stops to gather');
    assert.ok(new Set(out.filter((l) => !l.im).map((l) => l.place)).size < new Set(plan.filter((l) => !l.im).map((l) => l.place)).size);
    assert.equal(out.reduce((s, l) => s + l.q, 0), plan.reduce((s, l) => s + l.q, 0), 'the same pieces');
    assert.ok(took < 400, 'made in ' + took.toFixed(0) + ' ms');
});

// ---- C1. a listing judged on the set it finishes -------------------------------------------------------------------

const SET3 = { points: 10, pieces: [{ id: 1 }, { id: 2 }, { id: 3 }] };
const judge = (third, more = 0, held = {}) => judgeSet(SET3, {
    target: 1, held: (id) => held[id] || 0, avg: () => 0, guide: () => 1000,
    rows: (id) => ({ 1: [{ price: 900, qty: 5 }], 2: [{ price: 950, qty: 5 }], 3: third }[id]),
    more, perMore: 10 / 1.02, priceNow: 300,
});

test('C1. Buy, Stretch, No thanks: a piece over its own share is a Buy while the rest of its set is under theirs by as much', () => {
    // Pieces 1 and 2 are $99 and $49 under their share: the set has $148 to spare.
    let j = judge([{ price: 1100, qty: 3 }]);
    assert.deepEqual(j.next, { k: 1, room: 148, perPoint: 15 });
    assert.deepEqual([j.pieces.get('3').buy, j.pieces.get('3').line, j.pieces.get('3').stretch], [1, 1101, 0], '$101 over its share, and the set carries it');
    assert.deepEqual([j.pieces.get('1').buy, j.pieces.get('1').line], [1, 1000], 'a piece under its own share is a Buy by itself, up to that share');
    // $201 over: more than the set can spare today. At the price you usually sell points for it still pays: a Stretch.
    j = judge([{ price: 1200, qty: 3 }], 100);
    const p = j.pieces.get('3');
    assert.deepEqual([p.buy, p.stretch, p.line, p.lineS], [0, 1, 1000, 1201]);
    assert.equal(p.fin, 1, 'it finishes a set every other piece of which is listed: a list takes it');
    assert.equal(p.takeLine, 1201);
    assert.equal(p.needs, Math.ceil(300 + 53 / (10 / 1.02)), 'the points price that covers the $53 the set is short of');
    // No usual price to stretch to, or over even that: No thanks, and nothing of it goes on a list.
    assert.deepEqual([judge([{ price: 1200, qty: 3 }], 0).pieces.get('3').stretch, judge([{ price: 1200, qty: 3 }], 0).pieces.get('3').takeLine], [0, 1000]);
    const no = judge([{ price: 1300, qty: 3 }], 100).pieces.get('3');
    assert.deepEqual([no.buy, no.stretch, no.fin, no.line, no.lineS, no.takeLine], [0, 0, 0, 1000, 1000, 1000]);
});

test('C1. a Stretch for a set that cannot be finished is on no list; a piece held at a known cost adds to the room', () => {
    // Piece 2 has no listing: nothing finishes the set, so the dear piece 3 would only wait.
    const j = judgeSet(SET3, { target: 1, held: () => 0, avg: () => 0, guide: () => 1000, rows: (id) => ({ 1: [{ price: 700, qty: 1 }], 3: [{ price: 1400, qty: 1 }] }[id] || []), more: 200, perMore: 9.8, priceNow: 300 });
    assert.deepEqual([j.pieces.get('3').stretch, j.pieces.get('3').fin, j.pieces.get('3').takeLine], [1, 0, 1000]);
    // You hold piece 1 at $600 a unit: $399 under its share, which carries a piece 3 at $1,300.
    const h = judgeSet(SET3, { target: 1, held: (id) => (id === '1' ? 1 : 0), avg: (id) => (id === '1' ? 600 : 0), guide: () => 1000, rows: (id) => ({ 2: [{ price: 999, qty: 1 }], 3: [{ price: 1300, qty: 1 }] }[id] || []), more: 0, perMore: 9.8, priceNow: 300 });
    assert.deepEqual([h.pieces.get('3').buy, h.pieces.get('3').line], [1, 1301]);
});

test('C1. the price you usually sell points for: your own sales of two weeks by their size, else the middle of the usual range', () => {
    const DAY = 86400000;
    const book = [{ kind: 'sold', t: NOW - DAY, points: 1000, each: 31000 }, { kind: 'sold', t: NOW - 2 * DAY, points: 3000, each: 30000 }, { kind: 'sold', t: NOW - 20 * DAY, points: 9000, each: 40000 }, { kind: 'made', t: NOW - DAY, points: 500, each: 1 }];
    assert.deepEqual(usualSell(book, { lo: 1, hi: 3 }, NOW), { price: 30250, from: 'sales', points: 4000 });
    assert.deepEqual(usualSell([], { lo: 30000, hi: 31000 }, NOW), { price: 30500, from: 'market', points: 0 });
    assert.equal(usualSell([], null, NOW).price, 0);
});

// ---- A4. the in-between layer and the shortlist -----------------------------------------------------------------------

/** The made-up desk with a pile of listings a piece as the shared server brings them: hundreds of rows, some not checked. */
function bigDesk(seed) {
    const rnd = rng(seed);
    const input = fixtureInput(NOW);
    const v0 = archiveView(input);
    const piles = {};
    for (const p of v0.pieces) {
        const rows = [];
        for (let s = 0; s < 220; s++) {
            if (rnd(4) === 0) continue;
            const ok = rnd(6) !== 0;
            rows.push({ price: Math.round(p.worth * (0.94 + rnd(1400) / 10000)), qty: 1 + rnd(24), src: 'bazaar', who: 'Seller_' + s, whoId: 7000 + s, at: ok ? NOW - 40000 : NOW - 20 * MIN, from: ok ? 'torn' : 'w3b', ...(ok ? {} : { ok: false }) });
        }
        for (let k = 0; k < 12; k++) rows.push({ price: Math.round(p.worth * (0.97 + rnd(900) / 10000)), qty: 1 + rnd(9), src: 'market', at: NOW - 60000, from: 'torn' });
        piles[String(p.id)] = rows.sort((a, b) => a.price - b.price);
    }
    input.offers = (id) => piles[String(id)] || [];
    return { input, piles };
}

test('A4. a list made from the shortlists is the list the whole pile makes - and so are "Do now" and what counts under the worth', () => {
    for (const seed of [3, 41, 977]) {
        const { input } = bigDesk(seed);
        const v = archiveView(input);
        const counts = (id) => input.offers(id).filter((o) => o.ok !== false);
        const units = v.pieces.reduce((s, p) => s + p.all, 0);
        const kept = v.pieces.reduce((s, p) => s + p.offers.length, 0);
        assert.ok(units > 4000 && kept < units / 3, `the view keeps ${kept} of ${units} rows`);
        // The view says the plan as its sums: units, stops and what it costs, each the whole pile's own.
        const whole = fillList(listPieces(v.pieces), counts);
        assert.ok(whole.length > 10, 'the whole pile makes a list worth comparing: ' + whole.length + ' lines');
        assert.deepEqual([v.buy.plan.units, v.buy.plan.stops, v.buy.plan.cost],
            [whole.reduce((n, l) => n + l.q, 0), new Set(whole.map((l) => l.place)).size, whole.reduce((n, l) => n + l.q * l.price, 0)], 'the plan, seed ' + seed);
        const hot = v.dash.todo.find((t) => t.kind === 'hot');
        const cheap = fillList(cheapPieces(v.pieces), counts);
        assert.equal(hot ? hot.n : 0, cheap.reduce((s, l) => s + l.q, 0), '"Do now", seed ' + seed);
        for (const p of v.pieces) {
            const under = counts(p.id).filter((o) => o.price < p.worth);
            assert.equal(p.under.units, under.reduce((s, o) => s + o.qty, 0), p.name + ': units under its worth');
            assert.equal(p.all, input.offers(p.id).length);
            // Whatever is left out is counted: shown rows and the four kinds left out make the pile.
            assert.equal(p.offers.length + p.left.over + p.left.more + p.left.old + p.left.out, p.all, p.name + ': nothing is lost without being counted');
        }
    }
});

test('A4. the shortlist of a piece you need none of still shows who sells it, and says how many rows it leaves out', () => {
    const pile = [];
    for (let k = 0; k < 60; k++) pile.push({ price: 900 + k * 5, qty: 2, src: 'bazaar', whoId: 100 + k });
    const sl = shortlists([{ id: 5, need: 0, take: 0, takeLine: 1000, line: 1000, lineS: 1000, worth: 1000 }], () => pile).get('5');
    assert.equal(sl.all, 60);
    assert.ok(sl.rows.length >= 14 && sl.rows.length < 30, 'a few rows, not sixty: ' + sl.rows.length);
    assert.equal(sl.rows[0].price, 900, 'the cheapest first');
    assert.equal(sl.rows.length + sl.left.over + sl.left.more + sl.left.old + sl.left.out, 60);
    assert.deepEqual(sl.under, { units: 40, places: 20 });
});

test('A4. the layer: a piece\'s pile is sorted once and is at every moment what sorting everything again would give', () => {
    const rnd = rng(9);
    const S = engineEmpty();
    S.self = { id: '2000001', name: '' };
    const ids = ['186', '187', '215'];
    let now = NOW;
    let made = 0;
    for (let step = 0; step < 220; step++) {
        now += rnd(40) * 1000;
        const id = ids[rnd(3)];
        const op = rnd(5);
        if (op === 0) foldListings(S, id, Array.from({ length: 3 + rnd(12) }, (_, k) => ({ player_id: 500 + rnd(30), player_name: 'S' + k, price: 500 + rnd(400), quantity: 1 + rnd(9), last_checked: sec(now - rnd(8) * MIN), content_updated: sec(now - rnd(8) * MIN) })), now);
        else if (op === 1) foldShop(S, String(500 + rnd(30)), { bazaar: [{ ID: Number(id), price: 500 + rnd(400), quantity: 1 + rnd(9) }] }, now - rnd(30) * 1000);
        else if (op === 2) notePage(S, { t: now, whoId: String(500 + rnd(30)), items: rnd(3) ? [{ id, price: 500 + rnd(400), qty: 1 + rnd(9) }] : [{ id, gone: true }] }, now);
        for (const x of ids) {
            const fresh = offersOf(S, x, now).sort((a, b) => a.price - b.price);
            assert.deepEqual(pileOf(S, x, now), fresh, `step ${step}, piece ${x}`);
        }
        made = S.lay.made;
    }
    // 220 steps, three pieces looked at in each: far fewer sorts than looks.
    assert.ok(made < 500, made + ' sorts for 660 looks');
    const same = pileOf(S, '186', now);
    assert.equal(pileOf(S, '186', now), same, 'the same rows, not a copy, while nothing changed');
});

// ---- B1. a buy is never counted at the press -----------------------------------------------------------------------------

test('B1. a stock that fell counts only on a listing you pressed Buy on, and for no more than the number in its box', () => {
    const seen = { '263|900': { qty: 134, itemId: '263', price: 900, name: 'African Violet' } };
    const card = (qty) => [{ itemId: '263', name: 'African Violet', listingPrice: 900, qty }];
    // You typed 10 and pressed Buy; someone else took 50 from the same listing meanwhile.
    assert.deepEqual(stockBuys(seen, card(74), new Map(), new Map([['263|900', 10]])).bought.map((b) => b.qty), [10]);
    // The card back with the stock it had: no buy, whatever was typed (Torn refused, or you said No).
    assert.deepEqual(stockBuys(seen, card(134), new Map(), new Map([['263|900', 134]])).bought, []);
    // Opened and never bought (not in the map): its stock falling is another buyer.
    assert.deepEqual(stockBuys(seen, card(100), new Map(), new Map()).bought, []);
    // The Item Market's rows, where the buy step is not known by name: a press in the listing counts the fall, as it did.
    assert.deepEqual(stockBuys(seen, card(130), new Map(), new Map([['263|900', Infinity]])).bought.map((b) => b.qty), [4]);
    // Gone, after the page showed another listing in its place: no more than was typed, no more than it had.
    assert.deepEqual(stockBuys(seen, [], new Map([['263|900', 134]]), new Map([['263|900', 134]])).bought.map((b) => b.qty), [134]);
    assert.deepEqual(stockBuys(seen, [], new Map(), new Map([['263|900', 134]])).bought, [], 'pressed, and not proven gone: nothing');
});

function seenDesk() {
    const S = engineEmpty();
    S.self = { id: '2000001', name: '' };
    foldListings(S, '186', [{ player_id: 501, player_name: 'Seller_A', price: 600, quantity: 134, last_checked: sec(NOW - 30000), content_updated: sec(NOW - 30000) }], NOW - 20000);
    return S;
}

test('B1. Torn\'s log is the judge: a page buy it does not have a minute on is taken back - off the seller\'s listing too - and said', () => {
    const S = seenDesk();
    const buy = { t: NOW, id: '186', qty: 134, price: 600, whoId: '501' };
    assert.equal(noteSeenBuy(S, buy, NOW), true);
    assert.equal(offersOf(S, '186', NOW + 1000).find((o) => String(o.whoId) === '501'), undefined, 'shown as bought out at once');
    // The log read to half a minute past the buy: too soon to judge.
    S.log = { ...S.log, until: NOW + 30000 };
    assert.deepEqual(judgeSeen(S, NOW + 31000), []);
    // Read a minute past it, with no such row: not a buy.
    S.log = { ...S.log, until: NOW + SEEN_JUDGE_MS + 5000 };
    const back = judgeSeen(S, NOW + 70000);
    assert.deepEqual(back.map((b) => [b.id, b.qty]), [['186', 134]]);
    assert.equal(S.seen[0].no, true);
    assert.equal(offersOf(S, '186', NOW + 71000).find((o) => String(o.whoId) === '501').qty, 134, 'the listing is whole again');
    const input = engineInput(S, archiveSettings({}), NOW + 71000, { logRead: true });
    assert.deepEqual(input.back, [{ id: '186', qty: 134, whoId: '501', im: false, t: NOW }]);
    assert.deepEqual(judgeSeen(S, NOW + 80000), [], 'judged once');
    assert.deepEqual(engineInput(S, archiveSettings({}), NOW + 15 * MIN, { logRead: true }).back, [], 'said for ten minutes');
    // The same press counted four times over (2026-10-11): each is told once, the same note twice is one.
    assert.equal(noteSeenBuy(S, buy, NOW), false);
});

test('B1. a page buy Torn\'s log has is tied to its row and stays; one counted with no log to wait for is never judged', () => {
    const S = seenDesk();
    noteSeenBuy(S, { t: NOW, id: '186', qty: 5, price: 600, whoId: '501' }, NOW);
    S.ledger = { ...S.ledger, rows: [{ id: 'log:1', t: NOW + 2000, side: 'buy', venue: 'bazaar', itemId: '186', qty: 5, each: 600, who: '501' }] };
    S.log = { ...S.log, until: NOW + 3 * MIN };
    assert.deepEqual(judgeSeen(S, NOW + 3 * MIN), []);
    assert.equal(S.seen[0].logged, 'log:1');
    const T = seenDesk();
    T.seen = [{ t: NOW, id: '186', qty: 5, whoId: '501', price: 600, v: 2, counted: true }];
    T.log = { ...T.log, until: NOW + 3 * MIN };
    assert.deepEqual(judgeSeen(T, NOW + 3 * MIN), []);
});

test('B1. the box says a buy that was taken back, once, on a bazaar and on any other page', () => {
    const input = fixtureInput(NOW);
    const p = archiveView(input).pieces[0];
    input.back = [{ id: String(p.id), qty: 134, whoId: '66', im: false, t: NOW - 90000 }];
    const v = shared(input);
    assert.deepEqual(v.buy.back.map((b) => [b.name, b.qty]), [[p.name, 134]]);
    const line = `<b>Taken back: 134 × ${p.name}.</b> Not in Torn's log.`;
    assert.ok(boxAny(v).html.includes(line));
    const out = boxBazaar(v, [{ itemId: p.id, price: Math.round(p.worth * 0.9), qty: 3, typed: 0, hasBox: true }], 'b:424242');
    assert.equal(out.html.split(line).length, 2, 'once');
});

// ---- B2, B3. Start, Next and Stop in the box ---------------------------------------------------------------------------------

function runDesk() {
    const input = fixtureInput(NOW);
    const v0 = archiveView(input);
    input.cart = fillPlan(v0.pieces, input.offers);
    const stops = stopsOf(input.cart, (id) => (viewPiece(v0, id) || {}).worth || 0);
    return { input, stops };
}

test('B2. a press of Start, Next or Stop shows in the box as the hub will have it, before the hub has taken it', () => {
    const { stops } = runDesk();
    assert.ok(stops.length >= 4, 'the made-up list has stops enough');
    // The engine's own steps (engine.js act run), on the same stops.
    let run = { ...RUN_IDLE };
    const hub = (op, place) => {
        if (op === 'start') run = runStart(stops);
        else if (op === 'stop') run = { ...RUN_IDLE };
        else {
            if (run.on && place && place !== run.place && stops.some((s) => s.place === place)) run = { ...run, place, at: stops.findIndex((s) => s.place === place) };
            run = runNext(run, stops);
        }
        return runView(run, stops);
    };
    let local = runView(run, stops);
    const states = (r) => r.stops.map((s) => s.state);
    const presses = [['start'], ['next'], ['next', stops[3].place], ['stop'], ['start'], ['next', stops[2].place], ['next', 'b:424242'], ['next', stops[1].place]];
    for (const [op, place] of presses) {
        const want = hub(op, place || null);
        local = runLocal(local, op, place || null);
        assert.deepEqual(states(local), states(want), op + ' ' + (place || ''));
        assert.equal(local.at, want.at, op + ' ' + (place || '') + ': the stop the run is on');
    }
    // Next with no run on changes nothing.
    const idle = runView({ ...RUN_IDLE }, stops);
    assert.equal(runLocal(idle, 'next'), idle);
    // The last stop passed: the run is over in the box until the hub answers.
    let end = runLocal(idle, 'start');
    for (let k = 0; k < stops.length; k++) end = runLocal(end, 'next');
    assert.deepEqual([end.at, end.over, end.stops.some((s) => s.state === 'cur')], [-1, true, false]);
});

test('B2. a press waits in the box until the hub\'s view names it, or a view worked out well after it does not', () => {
    const list = [{ nid: 'a', op: 'stop', place: null, t: NOW }, { nid: 'b', op: 'start', place: null, t: NOW + 1000 }];
    assert.deepEqual(pressesLeft(list, new Set(), NOW + 2000, NOW - 5000).map((p) => p.nid), ['a', 'b'], 'the hub has not answered since');
    assert.deepEqual(pressesLeft(list, new Set(['a']), NOW + 2000, NOW + 1500).map((p) => p.nid), ['b']);
    assert.deepEqual(pressesLeft(list, new Set(), NOW + 2000, NOW + 20000).map((p) => p.nid), ['a', 'b'], 'a view from just after: it may still be on its way');
    assert.deepEqual(pressesLeft(list, new Set(), NOW + 50000, NOW + 45000), [], 'the hub is alive and did not take them: let go');
    assert.deepEqual(pressesLeft(list, new Set(), NOW + NOTES_KEEP_MS + 2000, 0), [], 'older than a note is kept');
    assert.deepEqual(pressesLeft(null, new Set(), NOW), []);
    // The view a Torn tab shows with them: stopped, then started again, the first stop the one it is on.
    const { input, stops } = runDesk();
    input.run = runNext(runStart(stops), stops);
    const v = shared(input);
    assert.equal(v.buy.run.stops.findIndex((s) => s.state === 'cur'), 1);
    const shown = viewWithPresses(v, list);
    assert.equal(shown.buy.run.stops.findIndex((s) => s.state === 'cur'), 0);
    assert.equal(viewWithPresses(v, [list[0]]).buy.run.stops.some((s) => s.state === 'cur'), false);
    assert.equal(viewWithPresses(v, []), v, 'nothing waiting: the hub\'s view itself');
    assert.equal(v.buy.run.stops.findIndex((s) => s.state === 'cur'), 1, 'the hub\'s view is not written on');
    // Stop pressed: the box offers Start at once, and says so when the hub is late.
    const stop = stops[1];
    const cards = stop.lines.map((l) => ({ itemId: l.id, price: l.price, qty: l.q, typed: 0, hasBox: true }));
    const stopped = boxBazaar(viewWithPresses(v, [list[0]]), cards, stop.place, { late: true });
    assert.ok(stopped.html.includes('data-act="run-start"') && !stopped.html.includes('data-act="run-stop"'));
    assert.match(stopped.html, /<b>The hub has not taken your last press\.<\/b>.*data-act="hub"/);
    assert.ok(!boxBazaar(viewWithPresses(v, [list[0]]), cards, stop.place).html.includes('has not taken'));
});

// ---- B4. "item no longer there", "that bazaar is empty already" ---------------------------------------------------------------

test('B4. one listing leaving a page that did not move is seen; a sort, a filter or a scroll proves nothing', () => {
    assert.deepEqual(oneRemoved(['1', '2', '3'], ['1', '3']), { at: 1, id: '2' });
    assert.deepEqual(oneRemoved(['1', '2', '3'], ['1', '2']), { at: 2, id: '3' });
    assert.deepEqual(oneRemoved(['1', '2', '3'], ['2', '3']), { at: 0, id: '1' });
    // Torn draws the next listing at the end when one leaves.
    assert.deepEqual(oneRemoved(['1', '2', '3'], ['1', '3', '4']), { at: 1, id: '2' });
    assert.deepEqual(oneRemoved(['7'], []), { at: 0, id: '7' });
    assert.equal(oneRemoved(['1', '2', '3'], ['1', '2', '3']), null, 'nothing left');
    assert.equal(oneRemoved(['1', '2', '3'], ['1', '2', '3', '4']), null, 'one more drawn');
    assert.equal(oneRemoved(['1', '2', '3'], ['3', '2']), null, 'sorted');
    assert.equal(oneRemoved(['1', '2', '3', '4'], ['1', '4']), null, 'two went: a filter');
    assert.equal(oneRemoved(['1', '2', '3'], ['1', '9']), null);
    assert.equal(oneRemoved([], []), null);
    assert.equal(oneRemoved(null, ['1']), null);
});

test('B4. a piece the page proved gone is offered nowhere at that bazaar, an empty bazaar offers nothing, and Torn\'s read stands again a minute on', () => {
    const S = engineEmpty();
    S.self = { id: '2000001', name: '' };
    const at = NOW - 30000;
    foldListings(S, '186', [
        { player_id: 501, player_name: 'A', price: 600, quantity: 5, last_checked: sec(at), content_updated: sec(at) },
        { player_id: 502, player_name: 'B', price: 640, quantity: 2, last_checked: sec(at), content_updated: sec(at) },
    ], at);
    foldListings(S, '187', [{ player_id: 502, player_name: 'B', price: 700, quantity: 9, last_checked: sec(at), content_updated: sec(at) }], at);
    const at501 = (id, now) => offersOf(S, id, now).find((o) => String(o.whoId) === '501');
    const at502 = (id, now) => offersOf(S, id, now).find((o) => String(o.whoId) === '502');
    assert.equal(at501('186', NOW).qty, 5);
    // The page of 501 showed its Sheep leave ("item no longer there"), or you pressed Gone on its line.
    assert.equal(notePage(S, { t: NOW, whoId: '501', items: [{ id: '186', gone: true }] }, NOW), true);
    assert.equal(at501('186', NOW + 1000), undefined);
    // The page of 502 holds no listing at all ("that bazaar is empty already, it still shows it").
    assert.equal(notePage(S, { t: NOW, whoId: '502', items: [], empty: true }, NOW), true);
    assert.deepEqual([at502('186', NOW + 1000), at502('187', NOW + 1000)], [undefined, undefined]);
    // A page that shows no piece and proves nothing is no note at all; neither is your own bazaar.
    assert.equal(notePage(S, { t: NOW + 1000, whoId: '501', items: [] }, NOW + 1000), false);
    assert.equal(notePage(S, { t: NOW + 1000, whoId: '2000001', items: [], empty: true }, NOW + 1000), false);
    // Torn's API is 20 to 40 s behind the page: a read of it made within a minute of the look still has the old rows.
    foldShop(S, '501', { bazaar: [{ ID: 186, price: 600, quantity: 5 }] }, NOW + 20000);
    assert.equal(at501('186', NOW + 21000), undefined, 'the page stands against a read that close');
    foldShop(S, '501', { bazaar: [{ ID: 186, price: 610, quantity: 4 }] }, NOW + PAGE_STANDS_MS + 5000);
    assert.deepEqual([at501('186', NOW + PAGE_STANDS_MS + 6000).price, at501('186', NOW + PAGE_STANDS_MS + 6000).from], [610, 'torn'], 'listed again, and read well after the look: it is back');
});

test('B4. the page tells the hub what it shows: a listing with less stock than your list has, as it is', () => {
    assert.deepEqual(shopSeen([{ itemId: 186, listingPrice: 600, qty: 2 }, { itemId: 186, listingPrice: 590, qty: 1 }, { itemId: 206, listingPrice: 830000, qty: 2 }, { itemId: 187, listingPrice: 700, qty: 4, qtyAssumed: true }]), [{ id: '186', price: 590, qty: 1 }]);
});

test('B4. a line of your list that is not on the page: one press of Gone, and the box says so until the list is made again', () => {
    const { input, stops } = runDesk();
    input.run = runStart(stops);
    const v = shared(input);
    const stop = v.buy.run.stops.find((s) => !s.im && s.lines.length > 1);
    const cards = stop.lines.slice(1).map((l) => ({ itemId: l.id, price: l.price, qty: l.q, typed: 0, hasBox: true }));
    const out = boxBazaar(v, cards, stop.place);
    const gone = stop.lines[0];
    assert.ok(out.html.includes(`data-act="gone" data-v="${gone.id}"`), 'the line that is not on the page has a Gone button');
    assert.equal(out.html.split('data-act="gone"').length, 2, 'and only that one');
    assert.equal(out.waits, 1);
    assert.equal(out.head, `${stop.lines.length} to buy`);
    const after = boxBazaar(v, cards, stop.place, { gone: new Set([String(gone.id)]) });
    assert.ok(!after.html.includes('data-act="gone"'));
    assert.ok(after.html.includes('<b class="num">gone</b>'));
    assert.equal(after.waits, 0);
    assert.equal(after.head, `${stop.lines.length - 1} to buy`);
    // The Item Market's lines are each on a page of their own: no Gone there.
    const im = v.buy.run.stops.find((s) => s.im);
    if (im) assert.ok(!boxBazaar(v, [], IM_PLACE).html.includes('data-act="gone"'));
});

// ---- C1 in the box, D3 -------------------------------------------------------------------------------------------------------

test('C1. in the box a listing says the profit per set with it, and a line dearer on the page than its set can carry is not bought', () => {
    const { input, stops } = runDesk();
    input.run = runStart(stops);
    const v = shared(input);
    const stop = v.buy.run.stops.find((s) => !s.im);
    const l = stop.lines[0];
    const p = viewPiece(v, l.id);
    const card = (price) => [{ itemId: l.id, price, qty: l.q + 5, typed: 0, hasBox: true }];
    // 1.4.0: one number for every listing - what its set makes with it - in the Buy page's colours.
    assert.match(boxBazaar(v, card(l.price), stop.place).html, /\$[\d,]+ each · <span class="j-(best|ok)">profit per set [\d.]+%<\/span>/);
    assert.ok(!/worth \$[\d,]+ to you|its set carries it|Stretch/.test(boxBazaar(v, card(l.price), stop.place).html));
    // The seller raised it past everything its set can carry since the list was made.
    const dear = boxBazaar(v, card(Math.max(p.worth, p.lineT) + 500), stop.place);
    assert.deepEqual([dear.marks[0].text, dear.fill], ['dearer than your list', []]);
    // Dearer than the list has it and still a price its set profits with: bought, as the list says.
    if (p.lineT > l.price + 1) assert.equal(boxBazaar(v, card(l.price + 1), stop.place).fill.length, 1);
    assert.ok(!dear.html.includes('data-act="fill-card"'));
    // The keys are named while something of yours is to buy here, and not otherwise.
    assert.match(boxBazaar(v, card(l.price), stop.place).html, /class="ta-n keys"><span class="kbd">↑<\/span>Fill all<span class="kbd">↓<\/span>next listing<span class="kbd">→<\/span>next bazaar/);
    assert.ok(!dear.html.includes('class="ta-n keys"') || stop.lines.length > 1);
});
