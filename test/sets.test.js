/*
 * 3.24.0: Sets (core/sets.js; the owner, 2026-10-05, mockups Z1-Z10)
 * - plushies and flowers kept for museum sets: what you hold against the sets
 *   you are building, what a piece is worth at a points price, your rate as a
 *   percentage of market value, where to buy, a trade priced at your rate,
 *   and the words for your forum thread.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    SETS, setByKey, setOfItem, isSetItem, shortName, setsOn, keptForSets, setStock, autoTarget, autoTargets, fillCost, setMarketValue, setValue, pieceWorths,
    ratePrice, rateSet, setsCost, leastPointPrice, buyPlan, setRun, tradeOffer, takeOutMessage, mostWanted, forumText, setListLines, postBehind, thanksMessage, readThreadTitle,
    isBuyingTitle, threadCheck, moneyShare,
} from '../src/core/sets.js';

const PLUSHIE = setByKey('plushie');
const FLOWER = setByKey('flower');
const ID = Object.fromEntries(SETS.flatMap((s) => s.pieces.map((p) => [shortName(p.name), p.id])));

// The mockups' plushie numbers: market values that add up to $298,750, points at $30,899.
const MV = { Panda: 35000, Nessie: 61300, Jaguar: 13200, 'Red Fox': 11400, Camel: 70900, Chamois: 14150, Monkey: 32000, Lion: 50000, 'Teddy Bear': 680, Wolverine: 4150, Sheep: 620, Stingray: 4800, Kitten: 550 };
const mv = (id) => { const p = PLUSHIE.pieces.find((x) => x.id === Number(id)); return p ? MV[shortName(p.name)] : 1000; };
const HELD = { Panda: 12, Nessie: 18, Jaguar: 22, 'Red Fox': 31, Camel: 35, Chamois: 38, 'Teddy Bear': 40, Wolverine: 40, Monkey: 40, Lion: 40, Sheep: 41, Stingray: 44, Kitten: 46 };
const held = Object.fromEntries(Object.entries(HELD).map(([n, q]) => [ID[n], q]));
const ON = { on: true, which: { plushie: true, flower: true } };

test('the two sets: thirteen plushies, eleven flowers, ten points each', () => {
    assert.equal(PLUSHIE.pieces.length, 13);
    assert.equal(FLOWER.pieces.length, 11);
    assert.equal(PLUSHIE.points, 10);
    assert.equal(new Set(SETS.flatMap((s) => s.pieces.map((p) => p.id))).size, 24);
    assert.equal(setOfItem(274), PLUSHIE);
    assert.equal(setOfItem('385'), FLOWER);
    assert.equal(setOfItem(206), null);
    assert.equal(isSetItem(618), true);
    assert.equal(shortName('Teddy Bear Plushie'), 'Teddy Bear');
    assert.equal(shortName('Banana Orchid'), 'Banana Orchid');
});

test('the switch: off keeps nothing; on keeps the chosen sets only', () => {
    assert.deepEqual(setsOn({ on: false, which: { plushie: true } }), []);
    assert.deepEqual(setsOn(null), []);
    assert.deepEqual(setsOn(ON).map((s) => s.key), ['plushie', 'flower']);
    assert.deepEqual(setsOn({ on: true, which: { plushie: true, flower: false } }).map((s) => s.key), ['plushie']);
    assert.equal(keptForSets(274, ON), true);
    assert.equal(keptForSets(274, { on: false }), false);
    assert.equal(keptForSets(260, { on: true, which: { flower: false } }), false);
    assert.equal(keptForSets(206, ON), false);
});

test('stock: held, need and ahead against the sets being built (mockup Z1)', () => {
    const st = setStock(PLUSHIE, held, 40);
    assert.equal(st.full, 12);
    assert.equal(st.target, 40);
    const by = Object.fromEntries(st.pieces.map((p) => [shortName(p.name), p]));
    assert.deepEqual([by.Panda.held, by.Panda.need, by.Panda.state, by.Panda.top, by.Panda.rank], [12, 28, 'need', true, 1]);
    assert.deepEqual([by.Lion.need, by.Lion.ahead, by.Lion.state], [0, 0, 'ok']);
    assert.deepEqual([by.Kitten.ahead, by.Kitten.state, by.Kitten.top], [6, 'ahead', false]);
    assert.equal(st.short.name, 'Panda Plushie');
    assert.equal(by.Nessie.rank, 2);
});

test('stock: a target under the full sets is the full sets; nothing held is all need', () => {
    const all = Object.fromEntries(PLUSHIE.pieces.map((p) => [p.id, 5]));
    const st = setStock(PLUSHIE, all, 2);
    assert.equal(st.full, 5);
    assert.equal(st.target, 5);
    assert.equal(st.short, null);
    assert.ok(st.pieces.every((p) => p.state === 'ok'));
    const none = setStock(FLOWER, {}, 3);
    assert.equal(none.full, 0);
    assert.ok(none.pieces.every((p) => p.need === 3 && p.state === 'need'));
    assert.equal(none.pieces.filter((p) => p.top).length, 1);
    // A Map with string keys reads the same.
    assert.equal(setStock(PLUSHIE, new Map(Object.entries(held)), 40).full, 12);
});

test('sets to build with no number typed: what you hold, and what the money adds to it (the owner, 2026-10-10)', () => {
    // 12 full sets held (Panda is the shortest). Six more Pandas make 18; the 19th set wants a Panda and a Nessie.
    assert.equal(fillCost(PLUSHIE, held, 12, mv), 0);
    assert.equal(fillCost(PLUSHIE, held, 18, mv), 6 * 35_000);
    assert.equal(fillCost(PLUSHIE, held, 19, mv), 7 * 35_000 + 61_300);
    assert.equal(autoTarget(PLUSHIE, held, 0, mv), 12, 'no money: the sets you hold');
    assert.equal(autoTarget(PLUSHIE, held, 209_999, mv), 17);
    assert.equal(autoTarget(PLUSHIE, held, 210_000, mv), 18, 'a piece you hold plenty of costs nothing more');
    assert.equal(autoTarget(PLUSHIE, held, 306_300, mv), 19);
    // Nothing held: whole sets at what you pay.
    assert.equal(autoTarget(PLUSHIE, {}, 1_000_000, mv), 3);
    // One big pile does not set the number: the money does.
    assert.equal(autoTarget(PLUSHIE, { [ID.Sheep]: 500 }, 2 * 298_750, mv), 2);
    // Whatever is held, the number found is the last one the money reaches.
    for (const money of [1, 50_000, 777_777, 12_345_678, 2_000_000_000]) {
        const t = autoTarget(PLUSHIE, held, money, mv);
        assert.ok(fillCost(PLUSHIE, held, t, mv) <= money && fillCost(PLUSHIE, held, t + 1, mv) > money, String(money));
    }
    // Money or a price not known yet: the piece held most of, as before.
    assert.equal(autoTarget(PLUSHIE, held, null, mv), 46);
    assert.equal(autoTarget(PLUSHIE, held, 1_000_000, () => 0), 46);
    assert.equal(autoTarget(PLUSHIE, {}, 1_000_000, () => 0), 0);
    assert.equal(autoTarget(PLUSHIE, new Map(Object.entries(held)), 210_000, mv), 18, 'a Map with string keys reads the same');
});

test('one purse for both sets: split evenly, what one cannot use goes to the other, never more than there is', () => {
    const none = () => ({});
    // A plushie set $298,750, a flower set 11 x $1,000. Half each: 1 and 45; the $206,250 left buys 18 more flower sets.
    const t = autoTargets([PLUSHIE, FLOWER], none, 1_000_000, mv);
    assert.deepEqual(t, { plushie: 1, flower: 63 });
    assert.ok(fillCost(PLUSHIE, {}, t.plushie, mv) + fillCost(FLOWER, {}, t.flower, mv) <= 1_000_000);
    // One set traded: the whole purse.
    assert.deepEqual(autoTargets([PLUSHIE], none, 1_000_000, mv), { plushie: 3 });
    // What you hold counts for its own set only.
    const mine = (set) => (set === PLUSHIE ? held : {});
    const both = autoTargets([PLUSHIE, FLOWER], mine, 420_000, mv);
    assert.equal(both.plushie, 18);
    assert.equal(both.flower, 19);
    assert.ok(fillCost(PLUSHIE, held, both.plushie, mv) + fillCost(FLOWER, {}, both.flower, mv) <= 420_000);
    // Money not known: each set's largest pile. Nothing traded: nothing.
    assert.deepEqual(autoTargets([PLUSHIE, FLOWER], mine, null, mv), { plushie: 46, flower: 0 });
    assert.deepEqual(autoTargets([], none, 1_000_000, mv), {});
});

test('a piece is worth its share of the set at the points price (mockup Z9: Panda about $36,200)', () => {
    assert.equal(setMarketValue(PLUSHIE, mv), 298_750);
    assert.equal(setValue(PLUSHIE, 30_899), 308_990);
    const w = pieceWorths(PLUSHIE, mv, 30_899);
    assert.equal(w.get(String(ID.Panda)), 36_199, 'rounded down: never a dollar more than it is worth');
    assert.equal(w.get(String(ID.Nessie)), 63_401);
    let sum = 0;
    for (const v of w.values()) sum += v;
    assert.ok(sum <= 308_990 && sum > 308_990 - 13, 'the shares add up to the set, less the rounding');
    // No market value for one piece, or no points price: no worth at all rather than a wrong one.
    assert.equal(pieceWorths(PLUSHIE, (id) => (Number(id) === ID.Panda ? 0 : 1000), 30_899).get(String(ID.Lion)), 0);
    assert.equal(pieceWorths(PLUSHIE, mv, 0).get(String(ID.Lion)), 0);
});

test('your rate: 101% of market value, what a set leaves, and how high you could go', () => {
    assert.equal(ratePrice(35_000, 101), 35_350);
    assert.equal(ratePrice(61_300, 101), 61_913);
    assert.equal(ratePrice(550, 101), 556);
    const r = rateSet(PLUSHIE, mv, 101, 30_899, 1);
    assert.equal(r.market, 298_750);
    assert.equal(r.value, 308_990);
    assert.ok(Math.abs(r.cost - 301_738) <= 13, 'about 101% of the set, each piece rounded');
    assert.equal(r.profit, r.value - r.cost);
    assert.ok(r.kept > 2.3 && r.kept < 2.5);
    assert.equal(r.cap, 102.4);
    assert.equal(r.ok, true);
    // The cap itself still keeps the least profit; a tenth over it does not.
    const at = rateSet(PLUSHIE, mv, r.cap, 30_899, 1);
    assert.ok(at.kept >= 1 - 0.01 && at.ok);
    assert.equal(rateSet(PLUSHIE, mv, r.cap + 0.1, 30_899, 1).ok, false);
    // Points fell: the rate no longer pays.
    const fell = rateSet(PLUSHIE, mv, 101, 30_000, 1);
    assert.ok(fell.profit < 0);
    assert.equal(fell.ok, false);
    assert.ok(fell.cap < 100);
});

test('what your full sets cost: cheapest-paid units first, market value where nothing is on record', () => {
    const lots = (id) => (Number(id) === ID.Panda ? [{ qty: 1, each: 36_000 }, { qty: 5, each: 34_900 }] : [{ qty: 100, each: mv(id) }]);
    const c = setsCost(PLUSHIE, 2, lots, mv);
    assert.equal(c.known, true);
    assert.equal(c.total, 2 * (298_750 - 35_000) + 2 * 34_900);
    assert.equal(c.perSet, 298_650);
    assert.equal(c.least, 29_865);
    assert.equal(leastPointPrice(c.perSet / 10), 29_866);
    const partly = setsCost(PLUSHIE, 2, (id) => (Number(id) === ID.Panda ? [{ qty: 1, each: 30_000 }] : []), mv);
    assert.equal(partly.known, false);
    assert.equal(partly.total, 2 * (298_750 - 35_000) + 30_000 + 35_000);
    assert.deepEqual(setsCost(PLUSHIE, 0, lots, mv), { sets: 0, total: 0, perSet: 0, least: 0, known: true });
});

test('where to buy: units under their worth, cheapest first, bazaar and Item Market side by side', () => {
    const st = setStock(PLUSHIE, held, 40);
    const worth = pieceWorths(PLUSHIE, mv, 30_899);
    const OFFERS = {
        [ID.Panda]: [{ price: 35_400, qty: 2, src: 'bazaar', who: 'Velmora', whoId: 2 }, { price: 34_900, qty: 6, src: 'bazaar', who: 'Garrett89', whoId: 1 }, { price: 35_600, qty: 2, src: 'market' }, { price: 36_500, qty: 50, src: 'bazaar', who: 'Dear', whoId: 9 }],
        [ID.Nessie]: [{ price: 62_900, qty: 3, src: 'bazaar', who: 'Garrett89', whoId: 1 }, { price: 62_400, qty: 1, src: 'market' }],
        [ID.Chamois]: [{ price: 99_999, qty: 4, src: 'bazaar', who: 'Dear', whoId: 9 }],
        [ID.Kitten]: [{ price: 1, qty: 500, src: 'bazaar', who: 'Cheap', whoId: 5 }],
    };
    const plan = buyPlan(PLUSHIE, st, worth, (id) => OFFERS[id] || []);
    const by = Object.fromEntries(plan.rows.map((r) => [shortName(r.name), r]));
    assert.equal(by.Panda.count, 10);
    assert.equal(by.Panda.cost, 6 * 34_900 + 2 * 35_400 + 2 * 35_600);
    assert.equal(by.Panda.gain, 6 * 1_299 + 2 * 799 + 2 * 599);
    assert.equal(by.Panda.best, 'bazaar');
    assert.deepEqual(by.Panda.bazaar.map((o) => o.price), [34_900, 35_400]);
    assert.equal(by.Panda.market.price, 35_600);
    assert.equal(by.Nessie.best, 'market');
    assert.equal(by.Nessie.count, 4);
    // Needed, but the cheapest is over its worth: wait.
    assert.deepEqual([by.Chamois.count, by.Chamois.over], [0, true]);
    // Ahead already: never bought, however cheap.
    assert.equal(by.Kitten.count, 0);
    assert.equal(plan.count, 14);
    assert.equal(plan.bazaars, 2);
    assert.equal(plan.market, 3);
    assert.equal(plan.full, 12);
    assert.equal(plan.fullAfter, 22, 'Panda 22 and Nessie 22 now, Jaguar 22 holds the next');
    assert.equal(plan.rows[0].count > 0, true, 'what can be bought comes first');
});

test('whole sets in one run: the k-th set takes the k-th cheapest unit of every piece', () => {
    const offers = (id) => [{ price: mv(id), qty: 2, src: 'bazaar', whoId: 'a' }, { price: Math.round(mv(id) * 1.02), qty: 3, src: 'bazaar', whoId: 'b' }, { price: mv(id) * 2, qty: 50, src: 'market' }];
    const run = setRun(PLUSHIE, offers, 308_990);
    assert.equal(run.sets, 5);
    assert.equal(run.pieces, 65);
    assert.equal(run.bazaars, 2);
    assert.equal(run.gain, 5 * 308_990 - run.cost);
    assert.equal(run.perSet, Math.round(run.cost / 5));
    // Cash stops it; so does the least profit.
    assert.equal(setRun(PLUSHIE, offers, 308_990, { cash: 600_000 }).sets, 2);
    assert.equal(setRun(PLUSHIE, offers, 308_990, { leastProfitPct: 3 }).sets, 2);
    assert.equal(setRun(PLUSHIE, offers, 290_000), null);
    assert.equal(setRun(PLUSHIE, (id) => (Number(id) === ID.Panda ? [] : offers(id)), 308_990), null);
});

const CTX = { settings: ON, stockOf: (set) => setStock(set, held, set.key === 'plushie' ? 40 : 10), mv: (id) => (setOfItem(id) === FLOWER ? 9_800 : mv(id)), pct: 101 };

test('a trade someone opens: your price on every piece, the total for what you need first (mockup Z8)', () => {
    const offer = tradeOffer([
        { id: ID.Panda, name: 'Panda Plushie', qty: 20 }, { id: ID.Nessie, name: 'Nessie Plushie', qty: 10 }, { id: 263, name: 'Crocus', qty: 5 },
        { id: ID.Kitten, name: 'Kitten Plushie', qty: 30 }, { id: ID.Lion, name: 'Lion Plushie', qty: 8 }, { id: 206, name: 'Xanax', qty: 2 },
    ], CTX);
    const by = Object.fromEntries(offer.rows.map((r) => [r.name, r]));
    assert.deepEqual([by['Panda Plushie'].each, by['Panda Plushie'].total, by['Panda Plushie'].state], [35_350, 707_000, 'need']);
    assert.deepEqual([by['Nessie Plushie'].total, by.Crocus.total], [619_130, 49_490]);
    assert.deepEqual([by['Kitten Plushie'].state, by['Kitten Plushie'].ahead, by['Kitten Plushie'].total], ['ahead', 6, 16_680]);
    assert.deepEqual([by['Lion Plushie'].state, by['Lion Plushie'].total], ['ok', 404_000]);
    assert.deepEqual([by.Xanax.state, by.Xanax.each], ['other', 0]);
    assert.deepEqual(offer.need, { items: 35, total: 1_375_620 });
    assert.deepEqual(offer.all, { items: 73, total: 1_796_300 });
    // 1.4.0 (the owner, 2026-10-13): what to paste when something has to come out - asked nicely, no rate, no sum.
    assert.equal(takeOutMessage(offer), "Hi! Sorry about this, my stock of Kitten and Lion is full right now, and I only buy plushie and flower sets, so I can't take the Xanax. Could you take the 30 Kitten, the 8 Lion and the 2 Xanax out? I'd be happy to take the 20 Panda, 10 Nessie and 5 Crocus. Thank you!");
    // Your targets come from your money and it does not reach: said as that, never as "full".
    assert.match(takeOutMessage(offer, { reason: 'budget' }), /^Hi! Sorry about this, I'm a little short on budget right now, and I only buy plushie and flower sets, so I can't take the Xanax\. Could you take /);
    assert.ok(!/\$|%/.test(takeOutMessage(offer)), 'no price and no rate: their own list says those');
});

test('a trade with nothing you need, and one with nothing you buy', () => {
    const enough = tradeOffer([{ id: ID.Lion, name: 'Lion Plushie', qty: 2 }], CTX);
    assert.equal(enough.need.total, 0);
    assert.equal(takeOutMessage(enough), 'Hi! Sorry about this, my stock of Lion is full right now. Could you take the 2 Lion out? Thank you!');
    assert.equal(takeOutMessage(enough, { reason: 'budget' }), "Hi! Sorry about this, I'm a little short on budget right now. Could you take the 2 Lion out? Thank you!");
    const none = tradeOffer([{ id: 206, name: 'Xanax', qty: 2 }, { id: 1, name: 'Nothing', qty: 0 }], CTX);
    assert.equal(none.rows.length, 1);
    assert.equal(takeOutMessage(none), "Hi! Sorry about this, I only buy plushie and flower sets, so I can't take the Xanax. Could you take the 2 Xanax out? Thank you!");
    // "if nothing to take out, no need for message": every unit is one you take.
    assert.equal(takeOutMessage(tradeOffer([{ id: ID.Panda, name: 'Panda Plushie', qty: 20 }, { id: ID.Nessie, name: 'Nessie Plushie', qty: 10 }], CTX)), '');
    assert.equal(takeOutMessage(null), '');
    assert.equal(takeOutMessage({ rows: [] }), '');
    // Sets switched off: nothing is priced.
    assert.equal(tradeOffer([{ id: ID.Panda, name: 'Panda Plushie', qty: 2 }], { ...CTX, settings: { on: false } }).rows[0].state, 'other');
});

test('your forum thread: the title and post to copy, open and closed (mockup Z3)', () => {
    const stocks = [setStock(PLUSHIE, held, 40), setStock(FLOWER, { 263: 3, 617: 6, 276: 7 }, 10)];
    assert.match(mostWanted(stocks), /^Panda, Nessie, Jaguar · /);
    const LIST = 'https://weav3r.dev/pricelist/2000001';
    const open = forumText({ open: true, pct: 101, stocks, list: LIST });
    assert.equal(open.title, '[OPEN] Buying Plushies & Flowers · 101% of market value');
    // 1.3.4, the owner's wording of 2026-10-12: open or closed on the very top, the heading, his price list, every
    // piece under its set's label, the pieces holding sets back, his two promises last - a drawn line between the parts.
    const RULE = '─'.repeat(20);
    assert.ok(open.post.startsWith(`OPEN FOR TRADES\n\nBUYING PLUSHIES AND FLOWERS\n101% of Market Value\n\nPricelist: ${LIST}\n\n${RULE}\n\nPLUSHIES\nCamel · Chamois · Jaguar · `), open.post);
    assert.match(open.post, /\n\nFLOWERS\nAfrican Violet · [^\n]+\n/);
    const tail = open.post.split(`\n\n${RULE}\n\n`);
    assert.equal(tail.length, 4, 'four parts, a drawn line between them');
    assert.match(tail[2], /^I'm short on these, bring them first\nPanda · Nessie · Jaguar\n[^\n]+$/);
    assert.equal(tail[3], "Mug-free, guaranteed. Fast trade, then you're back in the air.\nOpen a trade, drop your items in, I'll send the total.");
    assert.ok(!/profile picture|any amount|paid in the trade/i.test(open.post), 'the lines he took out');
    // A list is cut into lines of about the same length, none long enough for the posted thread to wrap.
    const rows = (label) => { const all = open.post.split('\n'); const at = all.indexOf(label); return all.slice(at + 1, all.indexOf('', at)); };
    assert.equal(rows('PLUSHIES').length, 2);
    assert.equal(rows('FLOWERS').length, 3);
    for (const r of [...rows('PLUSHIES'), ...rows('FLOWERS')]) assert.ok([...r.replace(/̶/g, '')].length <= 62, r);
    assert.equal(rows('PLUSHIES').join(' · ').split(' · ').length, PLUSHIE.pieces.length, 'every plushie is written, once');
    assert.equal(rows('FLOWERS').join(' · ').split(' · ').length, FLOWER.pieces.length, 'every flower is written, once');
    assert.deepEqual(setListLines([{ t: 'One' }]).map((r) => r.length), [1]);
    assert.deepEqual(setListLines([]), []);
    // The look, written the ways Torn's forum box keeps through a paste AND a post (read on his thread 2026-10-12):
    // each line centred by itself with data-mce-style, sizes and colour as <font>, a drawn line as <hr>.
    const CENTRE = '<div data-mce-style="text-align: center;" style="text-align: center;">';
    assert.ok(open.html.startsWith(`${CENTRE}<font size="5" color="#3fb950"><b>OPEN FOR TRADES</b></font></div><br>${CENTRE}<font size="6"><b>BUYING PLUSHIES AND FLOWERS</b></font></div>${CENTRE}<font size="6"><b>101% of Market Value</b></font></div><br>`), open.html);
    assert.ok(open.html.includes(`${CENTRE}<font size="4">Pricelist: <a href="${LIST}">${LIST}</a></font></div><br><hr><br>${CENTRE}<font size="4"><b>PLUSHIES</b></font></div>`), open.html);
    assert.equal((open.html.match(/<hr>/g) || []).length, 3);
    assert.ok(!/align=|<center/.test(open.html), 'the posted thread drops both');
    assert.equal((open.html.match(/<div /g) || []).length, (open.html.match(/<div data-mce-style="text-align: center;" /g) || []).length, 'every line is centred by itself');
    // Your Torn id not known yet: no price list line, and nothing else moves.
    const bare = forumText({ open: true, pct: 101, stocks });
    assert.ok(bare.post.startsWith(`OPEN FOR TRADES\n\nBUYING PLUSHIES AND FLOWERS\n101% of Market Value\n\n${RULE}\n\nPLUSHIES\n`), bare.post);
    // Nothing held over the target: nothing struck, and no line about it.
    const even = forumText({ open: true, pct: 101, stocks: [setStock(PLUSHIE, {}, 40)], sets: [PLUSHIE] });
    assert.ok(even.post.startsWith('OPEN FOR TRADES\n\nBUYING PLUSHIES\n101% of Market Value\n'), even.post);
    assert.ok(!even.post.includes('Crossed out') && !even.html.includes('<s>'));
    const closed = forumText({ open: false, pct: 101, stocks, list: LIST });
    assert.equal(closed.title, '[CLOSED] Buying Plushies & Flowers · back soon');
    assert.equal(closed.post, 'CLOSED FOR NOW\n\nBUYING PLUSHIES AND FLOWERS\n101% of Market Value\n\nNot buying right now. Back as soon as this says open.');
    assert.ok(closed.html.startsWith(`${CENTRE}<font size="5" color="#f85149"><b>CLOSED FOR NOW</b></font></div><br>`), closed.html);
    assert.ok(!closed.post.includes('weav3r'), 'closed: your list on TornW3B is empty, so it is not pointed at');
    // A piece you hold too many of is still written, struck out: a line through each letter in plain text, <s> where the look is kept.
    const over = [setStock(PLUSHIE, { ...held, [ID.Lion]: 90 }, 40)];
    const struck = forumText({ open: true, pct: 101, stocks: over, sets: [PLUSHIE] });
    assert.ok(struck.post.includes(' · L̶i̶o̶n̶ · '), struck.post);
    assert.ok(struck.post.includes("\n\nCrossed out = I'm swimming in those. Try me again later.\n"), struck.post);
    // 1.3.6: struck in red, word and line - the colour outside the <s>.
    assert.ok(struck.html.includes(' · <font color="#f85149"><s>Lion</s></font> · '), struck.html);
    // 1.3.6: the top line by itself, to paste over the one on the thread.
    assert.equal(struck.top.text, 'OPEN FOR TRADES');
    assert.equal(struck.top.html, '<div data-mce-style="text-align: center;" style="text-align: center;"><font size="5" color="#3fb950"><b>OPEN FOR TRADES</b></font></div>');
    assert.ok(struck.html.startsWith(struck.top.html));
    assert.equal(closed.top.text, 'CLOSED FOR NOW');
    assert.ok(closed.top.html.includes('color="#f85149"'));
    assert.equal((struck.html.match(/<s>/g) || []).length, over[0].pieces.filter((p) => p.ahead > 0).length, 'each piece held over the target, and no other');
    // What to send the seller after a trade, in his order: add me as a friend and trade when I am online, the
    // forum with its link, the receipt last.
    assert.equal(thanksMessage({ receipt: 'https://weav3r.dev/receipt/abc' }), "Thanks for the trade! Feel free to add me as a friend, and whenever you see me online, don't hesitate to send a trade. Your receipt: https://weav3r.dev/receipt/abc");
    assert.equal(thanksMessage({ receipt: 'R', thread: 'T' }), "Thanks for the trade! Feel free to add me as a friend, and whenever you see me online, don't hesitate to send a trade. If you enjoyed it, a like and a comment on my forum would be a big help: T Your receipt: R");
    assert.equal(forumText({ open: true, pct: 99.4, stocks: [], sets: [PLUSHIE] }).title, '[OPEN] Buying Plushies · 99.4% of market value');
});

test('1.3.4 your thread is found by its own title, and the post you copied last is held against your stock', () => {
    // The owner's title says neither open nor closed: his thread was not found, so no message to a seller named it.
    assert.equal(isBuyingTitle('[B] Plushies and Flowers! 101% MV Always!'), true);
    assert.equal(isBuyingTitle('Buying flowers'), true);
    assert.equal(isBuyingTitle('[S] Plushies and Flowers, 95%'), false);
    assert.equal(isBuyingTitle('Selling plushies cheap 90%'), false);
    assert.equal(isBuyingTitle('Plushie appreciation thread'), false);
    assert.equal(threadCheck('[B] Plushies and Flowers! 101% MV Always!', { open: true, pct: 101 }).state, 'match');
    assert.equal(threadCheck('[B] Plushies and Flowers! 101% MV Always!', { open: false, pct: 101 }).state, 'match', 'a title that says neither is never out of date for it');
    assert.equal(threadCheck('[B] Plushies and Flowers! 101% MV Always!', { open: true, pct: 100 }).state, 'rate');
    const over = [setStock(PLUSHIE, { ...held, [ID.Lion]: 90 }, 40)];
    const now = forumText({ open: true, pct: 101, stocks: over, sets: [PLUSHIE] }).says;
    assert.deepEqual({ open: now.open, pct: now.pct }, { open: true, pct: '101' });
    assert.ok(now.struck.includes('Lion'), JSON.stringify(now));
    // Never copied: taken as a post with nothing struck.
    const first = postBehind(null, now);
    assert.deepEqual(first.strike, now.struck);
    assert.match(first.words[0], / (is|are) full now: struck out in the new post\.$/);
    // Copied as it stands: nothing to say.
    assert.equal(postBehind({ ...now, at: 1 }, now), null);
    // One piece is full since, another no longer is.
    const b = postBehind({ open: true, pct: '101', struck: ['Zebra', ...now.struck.filter((n) => n !== 'Lion')] }, now);
    assert.deepEqual([b.strike, b.back], [['Lion'], ['Zebra']]);
    assert.deepEqual(b.words, ['Lion is full now: struck out in the new post.', 'Zebra is wanted again: no longer struck.']);
    // The shop closed since (a closed post names no piece), or the rate is another.
    const closed = forumText({ open: false, pct: 101, stocks: over, sets: [PLUSHIE] }).says;
    assert.deepEqual(closed.struck, []);
    assert.deepEqual(postBehind(now, closed).words, ['Your shop is closed: the post you copied last says OPEN FOR TRADES.']);
    assert.deepEqual(postBehind(closed, now).words[0], 'Your shop is open: the post you copied last says CLOSED FOR NOW.');
    assert.deepEqual(postBehind({ ...now, pct: '100' }, now).words, ['Your rate is 101%: the post you copied last says 100%.']);
});

test('your thread against Torn Bids: says when the title no longer matches (mockup Z10)', () => {
    assert.deepEqual(readThreadTitle('[OPEN] Buying Plushies & Flowers · 101% of market value'), { open: true, pct: 101 });
    assert.deepEqual(readThreadTitle('[CLOSED] Buying Plushies & Flowers · back soon'), { open: false, pct: null });
    assert.deepEqual(readThreadTitle('Selling my soul'), { open: null, pct: null });
    assert.equal(isBuyingTitle('[closed] buying plushies'), true);
    assert.equal(isBuyingTitle('Open letter to Chedburn'), false);
    assert.equal(threadCheck('[OPEN] Buying Plushies & Flowers · 101%', { open: true, pct: 101 }).state, 'match');
    assert.equal(threadCheck('[CLOSED] Buying Plushies & Flowers · back soon', { open: true, pct: 101 }).state, 'open');
    assert.equal(threadCheck('[OPEN] Buying Plushies & Flowers · 101%', { open: false, pct: 101 }).state, 'closed');
    assert.equal(threadCheck('[OPEN] Buying Plushies & Flowers · 101%', { open: true, pct: 99.4 }).state, 'rate');
    assert.equal(threadCheck('[CLOSED] Buying Plushies · 100%', { open: false, pct: 101 }).state, 'match', 'closed is closed, whatever rate it names');
});

test('how much of your money sits in sets and points', () => {
    const s = moneyShare({ pieces: 200, points: 70, cash: 130, vault: 600 });
    assert.equal(s.inSets, 270);
    assert.equal(s.total, 1000);
    assert.equal(s.share, 27);
    assert.equal(moneyShare({}).share, 0);
});
