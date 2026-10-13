// 1.3.0, what you pay your sellers as the pages say it (HANDOFF "THE SELLER-RATE FIXES", R1-R9, 2026-10-12): one line
// a set on the Prices page - what you pay, why, its ceiling and what others pay for the whole set (R6); the hour it is
// fixed for (R3), a fall inside it (R4), a trade holding it (R5); the thread that names more than you pay today (R7);
// no "before any fee" anywhere - the points market takes none (R8); a Stretch said by which points price is the
// lower (R2).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { archiveView } from '../src/core/view.js';
import { threadCheck } from '../src/core/sets.js';
import { rateKey, fixTable } from '../src/core/sellrate.js';
import { hubPage } from '../src/ui/hub-pages.js';
import { boxTrade, boxForum } from '../src/ui/box-pages.js';
import { fixtureInput } from './fixture-view.js';

const NOW = Date.UTC(2026, 9, 12, 13, 20);
const MIN = 60000;
const DAY = 86400000;
const KEYS = { limited: { set: true, ok: true }, full: { set: true, ok: true }, w3b: { set: true, ok: true } };
const UI = { page: 'dashboard', pane: 0, sel: null, trade: null, range: { pts: 40, pts2: 40 }, unit: 'day', imKey: '' };
const wall = (price) => [{ id: 'a', cost: price + 1, qty: 9000 }];
/** The fixture with the points price at `price` and no sale of your own: today's price is the cautious one. */
const input = (price, over = {}) => fixtureInput(NOW, { listings: wall(price), book: [], days: [], wallDays: [], ...over });
const desk = (inp) => ({ view: archiveView(inp), keys: KEYS, usage: { torn: [], w3b: [], nowTorn: 0, nowW3b: 0, refused: 0 }, turns: { mode: 'alone', why: '', torn: 85, w3b: 80 }, busy: { w3b: false, receipt: null }, notice: null, server: null, version: 'test' });
const page = (d, name, pane = 0) => hubPage(d, { ...UI, page: name, pane });
const fixedAt = (price, at) => { const inp = input(price); return fixTable(archiveView(inp).prices.live, rateKey(inp.settings), at); };
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const clock = (t) => new Date(t).toISOString().slice(11, 16);

test('R6 + R1. Prices: one line a set - the rate you pay, its ceiling, and what others pay for the whole set; no "Set X%" button', () => {
    // At $30,700 a point the plushie ceiling is under your 101%, the flower ceiling over it.
    const d = desk(input(30700));
    const pr = d.view.prices;
    const [pl, fl] = pr.sets;
    assert.ok(pl.capped && pl.pct === pl.cap && pl.pct < 101, 'plushies are at their ceiling: ' + pl.pct);
    assert.ok(!fl.capped && fl.pct === 101 && fl.cap > 101);
    assert.ok(pl.others && fl.others, 'the fixture has a bid read for the pieces');
    const html = page(d, 'prices');
    // 1.4.0: a set is a row of numbers, not a sentence - what you pay (and "capped", with why on the hover), a
    // set at that rate, the profit per set, what your own sets cost, its ceiling, what others pay.
    const rate = html.slice(html.indexOf('data-k="rate"'), html.indexOf('data-k="verdict"'));
    assert.match(rate, /<th>Set<\/th><th class="n">You pay<\/th><th class="n">A set at your rate<\/th><th class="n">Profit per set<\/th><th class="n">Your sets cost<\/th><th class="n">Ceiling<\/th><th class="n">Others pay<\/th>/);
    const [plRow, flRow] = rate.split('<tbody>')[1].split('</tr>');
    assert.ok(plRow.includes(`<b>${pl.pct}%</b> <span class="tg" title="Its ceiling is under your 101%">capped</span>`), 'the capped set says why');
    assert.ok(plRow.includes(`<td class="n">${money(pl.cost)}</td>`) && plRow.includes('10 points'));
    assert.ok(flRow.includes('<b>101%</b></td>') && !flRow.includes('capped') && flRow.includes(`<td class="n">${money(fl.cost)}</td>`));
    assert.ok(flRow.includes(`<td class="n" title="The most that keeps your 2%">${fl.cap}%</td>`), 'the ceiling of the set that is under it');
    assert.ok(plRow.includes(`>${pl.others.pct}%`) && flRow.includes(`>${fl.others.pct}%`), 'what others pay for the set');
    assert.match(html, new RegExp('<div class="hero">' + String(pl.pct).replace('.', '\\.') + '% to 101%<small>'));
    assert.ok(html.includes(`<span class="sub">you pay ${pl.pct}%</span>`) && html.includes('<span class="sub">you pay 101%</span>'), 'each piece table names what is paid');
    assert.doesNotMatch(rate, /leaves|a point over|makes 10 points/);
    assert.ok(!/>Set [\d.]+%</.test(html), 'the ceiling is applied by itself: no button for it');
    // Not fixed (this view has no table of the hour): said once.
    assert.equal((html.match(/TCT/g) || []).length, 0);
    // Every piece of the capped set is paid its ceiling in the table.
    const p = d.view.pieces.find((x) => x.set === 'plushie');
    assert.equal(p.pay, Math.round(p.mv * pl.pct / 100));
    assert.ok(html.includes(`<b>${money(p.pay)}</b>`));
});

test('R3 + R4 + R5. Prices: the hour your prices are fixed for, a fall inside it, a trade holding them; closed says what you would pay', () => {
    const at = NOW - 20 * MIN;
    const fixed = fixedAt(31500, at);
    // Fixed, points moved a little: the hour is said once, and nothing came down.
    let html = page(desk(input(31400, { rate: fixed })), 'prices');
    assert.equal((html.match(new RegExp('fixed until ' + clock(fixed.until) + ' TCT', 'gi')) || []).length, 1);
    assert.ok(!html.includes('down from'));
    // The points price fell so that the least profit would be gone: the set says from what, when, and why.
    const d = desk(input(30000, { rate: fixed }));
    const pl = d.view.prices.sets[0];
    assert.ok(pl.down && pl.down.from === 101 && pl.pct < 101);
    html = page(d, 'prices');
    assert.ok(html.includes(`<b>${pl.pct}%</b> <span class="tg" title="At ${clock(NOW)} TCT, as points fell to ${money(30000)}">down from 101%</span>`), 'the fall is said on the set');
    // A trade open past the hour: they stand still, and the page says so instead of an hour.
    const held = { ...fixed, at: NOW - 70 * MIN, until: NOW - 10 * MIN, held: true };
    html = page(desk(input(31500, { rate: held })), 'prices');
    assert.ok(html.includes(`<b>Held while a trade is open</b> · the hour ended ${clock(held.until)} TCT`));
    assert.ok(!/fixed until/i.test(html));
    // Closed: nothing is fixed, the page says these are the prices you would pay.
    const shut = input(31500);
    html = page(desk({ ...shut, settings: { ...shut.settings, open: false } }), 'prices');
    assert.ok(html.includes('Shop closed · prices as if you opened now'));
    assert.ok(!/fixed until/i.test(html));
});

test('R8. no page of the hub and no box says "before any fee": the points market takes none', () => {
    const d = desk(input(31500));
    for (const name of ['dashboard', 'stock', 'buy', 'trades', 'points', 'prices', 'ledger', 'settings']) {
        for (let pane = 0; pane <= 6; pane++) assert.ok(!/\bfee\b/i.test(page(d, name, pane)), name + ' pane ' + pane);
    }
    const sold = input(31500, { book: [{ id: 'm1', t: NOW - 3 * DAY, kind: 'made', points: 500, each: 29000, set: 'plushie' }, { id: 's1', t: NOW - 2 * DAY, kind: 'sold', points: 200, each: 31000, set: null }] });
    assert.ok(!/\bfee\b/i.test(page(desk(sold), 'ledger', 1)));
    const v = d.view;
    const t = v.trades.open[0];
    const out = boxTrade(v, t, t.rows.map((r) => ({ name: r.name, qty: r.qty })), 'view', false);
    assert.ok(!/\bfee\b/i.test(out.html));
    assert.match(out.html, /Profit [+-]\$[\d,]+ · [\d.]+%/, 'the margin is still said');
});

test('R7. a thread that names your rate while a set is paid less today: said on the hub and in the box, not called out of date', () => {
    const d = desk(input(30700));
    const pr = d.view.prices;
    assert.equal(pr.thread.check.state, 'under');
    const html = page(d, 'prices');
    assert.ok(html.includes(`<span class="badge ahead">title says 101%, you pay ${pr.paid}</span>`));
    const box = boxForum(d.view, pr.thread.title, threadCheck(pr.thread.title, { open: pr.open, pct: pr.pct, paid: pr.paidRows }));
    assert.ok(box.html.includes(`Title says 101%, today you pay ${pr.paid}.`));
    assert.ok(!box.html.includes('out of date'));
    assert.ok(box.html.includes(`Open · ${pr.paid}`));
    // With both sets at your rate the thread simply matches.
    const ok = desk(input(31500));
    assert.equal(ok.view.prices.thread.check.state, 'match');
    assert.ok(page(ok, 'prices').includes('<span class="badge ok">title matches</span>'));
});

test('R1 + R4. a trade: the box and the hub name the rate really paid, and say when it came down inside the hour', () => {
    const fixed = fixedAt(31500, NOW - 20 * MIN);
    const d = desk(input(30000, { rate: fixed }));
    const v = d.view;
    const t = v.trades.open[0];
    assert.ok(t.rateDown.length > 0 && t.paid !== '101%');
    const out = boxTrade(v, t, t.rows.map((r) => ({ name: r.name, qty: r.qty })), 'view', false);
    assert.ok(out.html.includes(`${t.paid} of market value`));
    assert.ok(!out.html.includes('101% of market value'));
    const down = t.rateDown[0];
    const words = `price down</b> from ${down.from}% to ${down.to}% at ${clock(down.at)} TCT.`;
    assert.ok(out.html.includes(words), 'the box says the fall');
    assert.ok(page(d, 'trades').includes(`price down from ${down.from}% to ${down.to}% at ${clock(down.at)} TCT, points at ${money(down.price)}`), 'and so does the hub');
    // No fall: nothing of it is said.
    const calm = desk(input(31500, { rate: fixed }));
    const ct = calm.view.trades.open[0];
    assert.ok(!boxTrade(calm.view, ct, ct.rows.map((r) => ({ name: r.name, qty: r.qty })), 'view', false).html.includes('down from'));
});

test('R2. Buy: profit per set is counted at the lower of the two points prices, named on the hover', () => {
    // No sale of your own, the market's usual range over today's price: Buy at today's, a Stretch at the usual.
    const days = Array.from({ length: 30 }, (_, k) => ({ day: new Date(NOW - (30 - k) * DAY).toISOString().slice(0, 10), low: 31800, high: 32200 }));
    const up = desk(input(31000, { days }));
    const u = up.view.buy.usual;
    if (u.by === 'today' && u.high > u.low) {
        const html = page(up, 'buy');
        assert.ok(html.includes(`points at ${money(u.low)}"`) && !html.includes(`points at ${money(u.high)}"`));
    }
    // You usually sell for less than today's price: Buy at what you usually get, a Stretch only at today's.
    const sold = [{ id: 's1', t: NOW - 3 * DAY, kind: 'sold', points: 500, each: 30500, set: null }];
    const dn = desk(input(31000, { book: sold }));
    const w = dn.view.buy.usual;
    assert.deepEqual([w.by, w.low, w.high], ['usual', 30500, 31000]);
    const html = page(dn, 'buy');
    assert.ok(html.includes(`points at ${money(30500)}"`), 'what you usually sell for is the lower: every profit per set is counted at it');
    assert.ok(!html.includes(`points at ${money(31000)}"`));
    // The same number is what a listing's profit per set is worked out with: value = points x that price.
    const pc = dn.view.pieces.find((x) => x.mk);
    assert.equal(pc.mk.value, dn.view.sets.find((x) => x.key === pc.set).points * 30500);
});
