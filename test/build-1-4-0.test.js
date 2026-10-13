// 1.4.0: the parts that came new with it and that no older test names - profit per set (one sum for the number
// and its colour), a cheap piece bought where there is a lot of it, one selection over open and finished trades,
// the end of a run, the tab's icon, and that each of them is joined to the app.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { setMakes, makesLines } from '../src/core/setjudge.js';
import { tradePick } from '../src/core/trades.js';
import { SMALL_SHARE, smallPiece, fillPlan, placeOf } from '../src/core/shopping.js';
import { SHORT_BIG, shortlists } from '../src/core/shortlist.js';
import { LOT_SIZES, LOT_MOST, lotSizes } from '../src/core/lots.js';
import { ARCHIVE_DEFAULTS, archiveSettings } from '../src/core/settings.js';
import { archiveView } from '../src/core/view.js';
import { hubPage } from '../src/ui/hub-pages.js';
import { HUB_MARK_SVG, HUB_MARK_URL, hPct, hPctDown } from '../src/ui/fmt.js';
import { TP_CLOSE_MS } from '../src/ui/torn-page.js';
import { fixtureInput } from './fixture-view.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const NOW = Date.UTC(2026, 9, 12, 9, 0);

// A set worth $300,000 whose other pieces cost $250,000; the piece's own share is $40,000; your least profit 2%.
const M = { others: 250000, value: 300000, least: 2, worth: 40000, keep: 0 };

test('profit per set: the number is the set\'s value less the rest of the set less the listing, in dollars and percent', () => {
    assert.deepEqual(setMakes(M, 30000), { profit: 20000, pct: 20000 / 280000 * 100, cls: 'best' });
    const ok = setMakes(M, 44000);
    assert.equal(ok.profit, 6000);
    assert.equal(ok.cls, 'ok');
    assert.ok(ok.pct >= 2);
    const thin = setMakes(M, 46000);
    assert.equal(thin.profit, 4000);
    assert.equal(thin.cls, 'thin', 'the set still profits, under your least');
    assert.equal(setMakes(M, 50000).cls, 'loss', 'nothing left is a loss');
    assert.deepEqual([setMakes(M, 51000).profit, setMakes(M, 51000).cls], [-1000, 'loss']);
});

test('profit per set: without a points price or a listing there is no number, and it is not a buy', () => {
    assert.deepEqual(setMakes(null, 30000), { profit: 0, pct: 0, cls: 'loss' });
    assert.deepEqual(setMakes({ ...M, value: 0 }, 30000), { profit: 0, pct: 0, cls: 'loss' });
    assert.deepEqual(setMakes(M, 0), { profit: 0, pct: 0, cls: 'loss' });
    assert.deepEqual(makesLines(null), { ok: 0, show: 0 });
});

test('profit per set: the two lines and the colour of every price between them agree', () => {
    const lines = makesLines(M);
    assert.deepEqual(lines, { ok: 44118, show: 50000 });
    for (let price = 39990; price <= 50010; price++) {
        const want = price < M.worth ? 'best' : price < lines.ok ? 'ok' : price < lines.show ? 'thin' : 'loss';
        assert.equal(setMakes(M, price).cls, want, 'at $' + price);
    }
    // A piece whose own share is over what keeps your least: every listing under the share is the strong green.
    const dear = { ...M, worth: 46000 };
    assert.deepEqual(makesLines(dear), { ok: 46000, show: 50000 });
    assert.equal(setMakes(dear, 45999).cls, 'best');
    assert.equal(setMakes(dear, 46000).cls, 'thin');
    // The judge's own Stretch line stays shown where it is the higher one.
    assert.equal(makesLines({ ...M, keep: 52000 }).show, 52000);
});

test('profit per set: a percent just under your least is never written as your least', () => {
    const m = setMakes(M, 44130);
    assert.equal(m.cls, 'thin');
    assert.equal(hPct(m.pct), '2.0%', 'rounded, it would read as the 2% it is under');
    assert.equal(hPctDown(m.pct), '1.9%');
    assert.equal(hPctDown(2), '2.0%');
    assert.equal(hPctDown(20000 / 280000 * 100), '7.1%');
    assert.equal(hPctDown(0), '0.0%');
});

test('on the Buy page the number and its colour are the same sum, and no amber cell reads as the least profit', () => {
    const input = fixtureInput(NOW);
    const d = { view: archiveView(input), keys: { limited: { set: true, ok: true }, full: { set: true, ok: true }, w3b: { set: true, ok: true } }, usage: { torn: [], w3b: [], nowTorn: 0, nowW3b: 0, refused: 0 }, turns: { mode: 'alone', why: '', torn: 85, w3b: 80 }, busy: { w3b: false, receipt: null }, notice: null, server: null, version: 'test' };
    const least = d.view.settings.least;
    let cells = 0;
    for (const p of d.view.pieces.filter((x) => x.mk)) {
        const html = hubPage(d, { page: 'buy', pane: 0, sel: p.id, trade: null, find: '', range: { pts: 40, pts2: 40 }, unit: 'day', imKey: '' });
        for (const c of html.matchAll(/<span class="j-(best|ok|thin)" title="[^"]*">\$([\d,]+) · ([\d.]+)%<\/span>/g)) {
            cells += 1;
            const pct = Number(c[3]);
            if (c[1] === 'thin') assert.ok(pct < least, `${p.name}: an "under ${least}%" cell reads ${c[3]}%`);
            if (c[1] === 'ok') assert.ok(pct >= least, `${p.name}: a "keeps your ${least}%" cell reads ${c[3]}%`);
        }
        assert.doesNotMatch(html, /<span class="j-loss"/, 'a listing the set loses with has no colour of the three');
    }
    assert.ok(cells > 10, 'the cells were found: ' + cells);
});

test('a cheap piece: a small part of what its set costs, by ratio and never by a dollar amount', () => {
    const mv = { 1: 400, 2: 30000, 3: 30000, 4: 39600 };
    const pieces = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
    const mvOf = (id) => mv[id] || 0;
    // An even share is $25,000: under a quarter of it is small.
    assert.equal(SMALL_SHARE, 0.25);
    assert.equal(smallPiece(1, pieces, mvOf), true);
    assert.equal(smallPiece(2, pieces, mvOf), false);
    assert.equal(smallPiece(1, pieces, (id) => mv[id] * 1000), true, 'the same set a thousand times dearer: the same answer');
    assert.equal(smallPiece(9, pieces, mvOf), false, 'no market value: not known, so not small');
    assert.equal(smallPiece(1, [], mvOf), false);
    const src = read('../src/core/shopping.js');
    const body = src.slice(src.indexOf('export function smallPiece'));
    assert.doesNotMatch(body.slice(0, body.indexOf('\n}')), /\d{2,}/, 'no dollar cut-off');
});

test('a cheap piece goes to the place that holds a lot of it, not to x1, x1, x1 - and every unit is still under its worth', () => {
    const rows = [
        { price: 380, qty: 1, src: 'bazaar', whoId: 11 },
        { price: 381, qty: 1, src: 'bazaar', whoId: 12 },
        { price: 382, qty: 1, src: 'bazaar', whoId: 13 },
        { price: 395, qty: 200, src: 'bazaar', whoId: 14 },
        { price: 410, qty: 500, src: 'bazaar', whoId: 15 },
    ];
    const piece = { id: 1, name: 'Kitten Plushie', set: 'plushie', need: 60, worth: 400 };
    const cheapFirst = fillPlan([piece], () => rows);
    assert.deepEqual(cheapFirst.map((l) => [l.place, l.q]), [['b:11', 1], ['b:12', 1], ['b:13', 1], ['b:14', 57]], 'until 1.4.0, and still for a dear piece');
    const big = fillPlan([{ ...piece, small: true }], () => rows);
    assert.deepEqual(big.map((l) => [l.place, l.q, l.price]), [['b:14', 60, 395]], 'one stop');
    assert.ok(big.every((l) => l.price < piece.worth), 'still profitable: nothing at or over the worth');
    // More needed than the big one holds: the rest from the next biggest under the worth, never the $410 one.
    const more = fillPlan([{ ...piece, need: 202, small: true }], () => rows);
    assert.deepEqual(more.map((l) => [l.place, l.q]), [['b:14', 200], ['b:11', 1], ['b:12', 1]]);
    assert.ok(!more.some((l) => l.place === 'b:15'));
    // Two places that hold as much: the cheaper one.
    const tie = fillPlan([{ ...piece, need: 5, small: true }], () => [{ price: 390, qty: 9, src: 'bazaar', whoId: 21 }, { price: 385, qty: 7, src: 'bazaar', whoId: 22 }]);
    assert.deepEqual(tie.map((l) => [l.place, l.q]), [['b:22', 5]]);
    // The Item Market's rows under the worth are one place, at what its units cost together.
    const im = fillPlan([{ ...piece, need: 30, small: true }], () => [
        { price: 370, qty: 10, src: 'market' }, { price: 390, qty: 30, src: 'market' }, { price: 405, qty: 99, src: 'market' }, { price: 372, qty: 12, src: 'bazaar', whoId: 31 },
    ]);
    assert.deepEqual(im.map((l) => [l.place, l.q, l.price]), [[placeOf({ src: 'market' }), 30, Math.ceil((10 * 370 + 20 * 390) / 30)]]);
});

test('the shortlist keeps the places a cheap piece\'s list goes to, behind any pile of x1 rows', () => {
    const pile = [];
    for (let k = 0; k < 60; k++) pile.push({ price: 300 + k, qty: 1, src: 'bazaar', whoId: 100 + k, ok: true });
    pile.push({ price: 390, qty: 250, src: 'bazaar', whoId: 900, ok: true });
    pile.push({ price: 392, qty: 80, src: 'bazaar', whoId: 901, ok: true });
    pile.sort((a, b) => a.price - b.price);
    const piece = { id: 1, need: 100, take: 100, takeLine: 400, line: 400, lineS: 400, worth: 400 };
    const plain = shortlists([piece], () => pile).get('1');
    const small = shortlists([{ ...piece, small: true }], () => pile).get('1');
    const has = (s, who) => s.rows.some((o) => o.whoId === who);
    assert.ok(has(small, 900) && has(small, 901), 'the two big ones are on it');
    assert.ok(SHORT_BIG >= 2);
    // A list made from the shortlist is the list made from the whole pile.
    const from = (rows) => fillPlan([{ id: 1, name: 'Kitten Plushie', need: 100, worth: 400, small: true }], () => rows).map((l) => [l.place, l.q, l.price]);
    assert.deepEqual(from(small.rows.filter((o) => o.ok !== false && !o.out)), from(pile));
    assert.deepEqual(from(pile), [['b:900', 100, 390]]);
    assert.equal(small.all, plain.all);
    assert.equal(small.good.units, plain.good.units, 'what is counted does not change, only what is kept to show');
});

test('rows between the line and the show line are counted as "under your least", not as buys', () => {
    const pile = [{ price: 380, qty: 4, src: 'bazaar', whoId: 1, ok: true }, { price: 405, qty: 6, src: 'bazaar', whoId: 2, ok: true }, { price: 430, qty: 9, src: 'bazaar', whoId: 3, ok: true }];
    const s = shortlists([{ id: 1, need: 20, take: 4, takeLine: 400, line: 400, lineS: 420, worth: 390 }], () => pile).get('1');
    assert.deepEqual([s.under.units, s.good.units, s.thin.units], [4, 4, 6]);
    assert.ok(s.rows.some((o) => o.whoId === 2), 'and they are on the shortlist: shown, to add by hand');
});

test('Trades: one selection over open and finished trades', () => {
    const open = [{ id: 5, state: 'them' }, { id: 6, state: 'you' }];
    const fin = [{ id: 9 }, { id: 8 }];
    assert.deepEqual(tradePick(open, fin, null), { open: open[1], done: null }, 'nothing pressed: the one that waits for you');
    assert.deepEqual(tradePick([open[0]], fin, null), { open: open[0], done: null });
    assert.deepEqual(tradePick(open, fin, 5), { open: open[0], done: null });
    assert.deepEqual(tradePick(open, fin, '8'), { open: null, done: fin[1] }, 'a finished one pressed');
    // The trade you were looking at ended: it is found among the finished ones - you stay on it, as its receipt.
    assert.deepEqual(tradePick([open[0]], [{ id: 6 }, ...fin], 6), { open: null, done: { id: 6 } });
    assert.deepEqual(tradePick([], fin, null), { open: null, done: fin[0] }, 'no open trade: the newest finished one');
    assert.deepEqual(tradePick(open, fin, 77), { open: open[1], done: null }, 'a trade that is gone: as if nothing was pressed');
    assert.deepEqual(tradePick([], [], null), { open: null, done: null });
    assert.deepEqual(tradePick(null, null, 3), { open: null, done: null });
});

test('Trades: "Find a seller" is typed in the hub and kept through a redraw', () => {
    const hub = read('../src/ui/hub.js');
    const pages = read('../src/ui/hub-pages.js');
    assert.match(pages, /<input id="t-find" placeholder="Find a seller" value="\$\{hEsc\(ui\.find \|\| ''\)\}"/);
    assert.match(hub, /t\.id === 't-find'\) \{ ui\.find = t\.value; draw\(false\); \}/);
    assert.match(hub, /trade: null, find: ''/, 'the hub\'s own state has both');
    assert.match(hub, /a === 'trade'\) \{ ui\.trade = id; draw\(false\); \}/);
});

test('the biggest lot of points is a setting: its default, its field, and the hub sends it as a number', () => {
    assert.equal(ARCHIVE_DEFAULTS.lotMax, LOT_MOST);
    assert.equal(archiveSettings({ lotMax: 500 }).lotMax, 500);
    assert.equal(archiveSettings({ lotMax: 0 }).lotMax, LOT_MOST, 'nothing typed: the default');
    assert.ok(LOT_SIZES.includes(LOT_MOST));
    assert.deepEqual(lotSizes(LOT_MOST), LOT_SIZES.filter((n) => n <= LOT_MOST));
    assert.match(read('../src/ui/hub.js'), /const HUB_NUM = new Set\(\[[^\]]*'lotMax'[^\]]*\]\)/);
    assert.match(read('../src/ui/hub-pages.js'), /Biggest lot of points I list<\/span>\$\{pgInput\('lotMax'/);
});

test('the tab\'s icon is Torn Archive\'s mark: set by the hub, and the same picture in the page as it is served', () => {
    assert.match(HUB_MARK_SVG, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 32 32">/);
    assert.ok(HUB_MARK_URL.startsWith('data:image/svg+xml,%3Csvg'));
    assert.equal(decodeURIComponent(HUB_MARK_URL.slice('data:image/svg+xml,'.length)), HUB_MARK_SVG);
    assert.doesNotMatch(HUB_MARK_SVG, /https?:\/\/(?!www\.w3\.org)/, 'nothing fetched from anywhere');
    const hub = read('../src/ui/hub.js');
    assert.match(hub, /icon\.rel = 'icon';\s+icon\.type = 'image\/svg\+xml';\s+icon\.href = HUB_MARK_URL;\s+doc\.head\.appendChild\(icon\);/);
    assert.match(hub, /for \(const old of \$\$\('link\[rel~="icon"\]', doc\.head\)\) old\.remove\(\);/, 'one icon, not two');
    const served = read('../docs/index.html');
    assert.ok(served.includes(`<link rel="icon" type="image/svg+xml" href="${HUB_MARK_URL}">`), 'docs/index.html names the same picture, before the script runs');
    assert.doesNotMatch(read('../src/ui/torn-page.js'), /HUB_MARK|rel = 'icon'/, 'never on a Torn page');
});

test('the end of a run: the last Next asks Torn Archive to the front, or opens it, and closes this tab', () => {
    const page = read('../src/ui/torn-page.js');
    const main = read('../src/main.js');
    const gm = read('../src/platform/gm.js');
    assert.ok(TP_CLOSE_MS >= 300 && TP_CLOSE_MS <= 1500, 'long enough for the press to reach the hub, short enough to feel like one press');
    assert.match(page, /if \(next\) openStop\(next\);\s+else runDone\(\);/, 'only with no stop left');
    const done = page.slice(page.indexOf('function runDone()'), page.indexOf('/** Fill all, on'));
    assert.match(done, /if \(quiet\) gmOpenTab\(ARCHIVE_PAGE_URL\);\s+else note\('front', \{ why: 'run done' \}\);/);
    assert.match(done, /win\.setTimeout\(\(\) => gmCloseTab\(win\), TP_CLOSE_MS\);/);
    assert.doesNotMatch(done, /click\(|\.submit\(|location/, 'nothing of Torn\'s is pressed or opened');
    // ... and the hub's side of it.
    assert.match(main, /import \{[^}]*\bgmFocusTab\b[^}]*\} from '\.\/platform\/gm\.js';/);
    assert.match(main, /n\.kind === 'front'\) \{ gmFocusTab\(\);/);
    assert.match(gm, /export function gmCloseTab\(win = null\) \{\s+try \{ \(typeof window !== 'undefined' \? window : win\)\.close\(\); \} catch/);
    assert.match(gm, /export function gmFocusTab\(win = null\) \{\s+try \{ \(typeof window !== 'undefined' \? window : win\)\.focus\(\); \} catch/);
});

test('the built script asks the browser for the two rights the end of a run needs', () => {
    // The file people install (written by the build, kept in the repository), and the build that writes it.
    const built = read('../torn-archive.user.js');
    const head = built.slice(0, built.indexOf('// ==/UserScript=='));
    assert.match(head, /\/\/ @grant\s+window\.close\r?\n/);
    assert.match(head, /\/\/ @grant\s+window\.focus\r?\n/);
    const build = read('../build.mjs');
    assert.match(build, /\/\/ @grant\s+window\.close/);
    assert.match(build, /\/\/ @grant\s+window\.focus/);
    assert.match(head, new RegExp('// @version\\s+' + JSON.parse(read('../package.json')).version.replace(/\./g, '\\.') + '\\r?\\n'), 'and it is the version package.json names');
});
