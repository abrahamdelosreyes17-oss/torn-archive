// The hub's pages, as strings, from the view. Nothing here reads the page or stores anything: a page is a function
// of (what the engine holds, what you have pressed on the hub). The shell puts the string in and patches what changed.
// Every part that can change carries data-k: the shell swaps only the parts whose string differs.
// A press is a data-act (with data-v, data-id); a page to go to is data-go (with data-pane).

import { hEsc, hNum, hMoney, hSigned, hShort, hPct, hPctDown, hRate, hPlural, hWhen, hDay, hClock, hAge, hIcon, hPic, hOut, hProfileUrl } from './fmt.js';
import { sparkSvg, chRows, chClamp, CH_HOUR, CH_DAY } from './charts.js';
import { SET_LOOK, viewPiece } from '../core/view.js';
import { marginWords } from '../core/margin.js';
import { VERDICT_WORDS } from '../core/verdict.js';
import { TURN_WORDS, tradePick } from '../core/trades.js';
import { setMakes } from '../core/setjudge.js';
import { lotsWords, waitWords } from '../core/lots.js';
import { placeOf, lineKey, imShares, IM_PLACE } from '../core/shopping.js';
import { bazaarUrl } from '../core/feed.js';
import { itemMarketUrl, MUSEUM_URL, POINTS_MARKET_URL, tradeViewUrl } from '../sources/route.js';
import { TORN_PER_MINUTE_ALONE, W3B_PER_MINUTE_ALONE } from '../core/turns.js';
import { READ_CHOICES } from '../core/settings.js';
import { BOOK_ABOUT } from '../core/books.js';
import { BID_OLD_MS } from '../core/sellrate.js';

export const HUB_PAGES = [
    { key: 'dashboard', title: 'Dashboard', icon: 'dash', group: 'Desk' },
    { key: 'stock', title: 'Stock', icon: 'stock' },
    { key: 'buy', title: 'Buy', icon: 'buy' },
    { key: 'trades', title: 'Trades', icon: 'trades' },
    { key: 'points', title: 'Points', icon: 'points' },
    { key: 'prices', title: 'My prices', icon: 'tag', group: 'Shop' },
    { key: 'ledger', title: 'Ledger', icon: 'book', group: 'Books' },
    { key: 'settings', title: 'Settings', icon: 'set', last: true },
];

/** A page's tabs, as the top bar names them. */
export function hubTabs(page, d) {
    const v = d.view;
    if (page === 'buy') return ['Pieces I need', `All ${v.pieces.length} pieces`, v.buy.units ? `Shopping list · ${hNum(v.buy.units)}` : 'Shopping list'];
    if (page === 'points') return ['Market', 'Points book'];
    if (page === 'ledger') return ['Profit', 'Points sold', 'Buys', 'Receipts', 'Sellers', 'Mugged', 'Pieces sold'];
    if (page === 'settings') return ['Keys and API use', 'Sets, points and notifications'];
    return [];
}

const pgIco = (p, cls) => hPic(p.id, p.name, cls, (SET_LOOK[p.set] || {}).color || '');
const pgItem = (v, id, name, cls) => { const p = viewPiece(v, id); return p ? pgIco(p, cls) : hPic(id, name, cls); };
const pgLow = (s) => String(s || '').toLowerCase();
const pgKey = (label, color, box) => `<span><i class="key${box ? ' box' : ''}" style="--c:${color}"></i>${label}</span>`;
const pgSetKeys = (v, box) => v.sets.map((s) => pgKey(s.label, s.color, box)).join('');
const pgNone = (words) => `<div class="wl-s" style="padding-top:9px">${words}</div>`;
const pgPlace = (s) => (s.im ? 'the Item Market' : hEsc(s.who || 'a bazaar') + "'s bazaar");
const pgStopUrl = (s) => (s.im ? itemMarketUrl(s.lines[0].id, s.lines[0].name) : bazaarUrl(s.whoId, s.lines[0].id, s.lines[0].price));
const pgSeg = (key, value, choices) => `<span class="seg">${choices.map(([v, label]) => `<button data-act="set" data-id="${key}" data-v="${hEsc(v)}"${String(v) === String(value) ? ' class="on"' : ''}>${label}</button>`).join('')}</span>`;
const pgInput = (key, value, width = 64, after = '') => `<input class="inp" data-set="${key}" value="${hEsc(value)}" inputmode="decimal" autocomplete="off" style="width:${width}px">${after ? `<span class="t-muted">${after}</span>` : ''}`;
/** Your least profit as it is typed: "2%". */
const pgLeast = (v) => hRate(v.settings.least) + '%';
/** The head of the points price graph: its days to choose from once more than a week is kept. */
function pgPtsHead(v, ui, name) {
    const days = v.points.chart.x.length;
    const seg = days > 7 ? `<div class="seg">${[7, 30, 40].map((n) => `<button data-act="range" data-id="${name}" data-v="${n}"${ui.range[name] === n ? ' class="on"' : ''}>${n} days</button>`).join('')}</div>` : `<span class="sub">${hPlural(days, 'day')} kept so far</span>`;
    return `<div class="ph"><h2>Points price</h2><div class="legend">${pgKey('First wall', 'var(--s-gold)')}${pgKey('Lowest listing', 'var(--s-violet)')}</div><span class="sp"></span>${seg}</div><div class="pb"><div class="chart" data-chart="${name}"></div></div>`;
}
/** The days a by-day list covers: from the first day with anything, `least` days at least. */
function pgFromFirst(days, has, least = 7) {
    const first = days.findIndex(has);
    if (first < 0) return days.slice(-least);
    return days.slice(Math.min(first, Math.max(0, days.length - least)));
}
/** A stretch of time in words, whole: "29 hours", "6 days". */
const pgSpan = (ms) => (ms >= 2 * CH_DAY ? hPlural(Math.round(ms / CH_DAY), 'day') : ms >= CH_HOUR ? hPlural(Math.round(ms / CH_HOUR), 'hour') : hPlural(Math.max(1, Math.round(ms / 60000)), 'minute'));
/**
 * What you hold of a piece against what you build, in the owner's three colours (2026-10-11: "red for we have too
 * much, orange we still need more, and green we have enough exactly"): 'need', 'even' or 'over'.
 */
const pgStockCls = (p) => (p.state === 'need' ? 'need' : p.state === 'ahead' ? 'over' : 'even');

// ---- Dashboard ---------------------------------------------------------------------------------------------------

function pgLadder(v, n) {
    const rows = v.points.ladder.slice(0, n);
    if (!rows.length) return pgNone('The points market has not been read yet.');
    const max = Math.max(...rows.map((r) => r.qty));
    let you = v.points.price > 0;
    let out = '<div class="lad h"><span>Price</span><span></span><span class="r">Points</span><span class="r">Sell before it</span></div>';
    rows.forEach((r, i) => {
        if (you && r.price > v.points.price) {
            out += `<div class="lad you"><span class="p num">${hMoney(v.points.price)}</span><span><b>Your price</b> · ${hNum(v.points.ahead)} points sell first</span></div>`;
            you = false;
        }
        out += `<div class="lad ${r.wall ? 'wall' : ''}" style="--n:${i}"><span class="p num">${hMoney(r.price)}</span><span><i class="bar" style="--w:${Math.max(2, r.qty / max * 100)}%;display:block"></i></span><span class="r num">${hNum(r.qty)}</span><span class="r num tag">${r.wall ? 'first wall' : hNum(r.ahead)}</span></div>`;
    });
    return out;
}

const PG_SHOP_LINE = {
    'no-price': () => 'waiting for prices',
    low: (c) => `profit per set ${hSigned(c.leaves.profit)}: under your least`,
    full: () => 'nothing needed',
    share: () => 'your share for sets is full',
    'buy-first': (c) => `buy ${hPlural(c.cheaper.units, 'piece')} first`,
    'open-now': (c) => `worth opening: profit per set <b>${hSigned(c.leaves.profit)}</b>`,
    stay: (c) => `profit per set <b>${hSigned(c.leaves.profit)}</b>`,
    'stay-buy': (c) => `buy the ${hPlural(c.cheaper.units, 'cheap piece')} first`,
};

function pgTodo(v, t) {
    const row = (style, icon, text, btn) => `<div class="nx"${style ? ` style="${style}"` : ''}>${icon}<span class="nx-t">${text}</span>${btn}</div>`;
    const tone = { warn: '--c:var(--warn);--c-bg:var(--warn-bg)', brand: '--c:var(--brand);--c-bg:var(--brand-bg)', good: '--c:var(--good);--c-bg:var(--good-bg)' };
    const ic = (name) => `<span class="nx-i">${hIcon(name)}</span>`;
    const pic = (id) => `<span class="nx-p">${pgItem(v, id, '')}</span>`;
    if (t.kind === 'trades') return row(tone.warn, ic('trades'), `<b>${hPlural(t.n, 'trade')} open with you.</b> ${t.wait ? `${t.wait} ${t.wait === 1 ? 'waits' : 'wait'} for your money: ${hMoney(t.money)}.` : 'None waits for you.'}`, '<button class="btn sm go" data-go="trades">See them</button>');
    if (t.kind === 'hot') return row('', pic(t.pic), `<b>Buy ${hPlural(t.n, 'piece')}.</b> Cheaper than from your sellers, ${hPlural(t.stops, 'stop')}.`, '<button class="btn sm" data-act="make-list" data-v="hot">The list</button>');
    if (t.kind === 'buy') return row('', pic(t.pic), `<b>Buy ${hPlural(t.n, 'piece')}.</b> Under their worth, ${hPlural(t.stops, 'stop')}.`, '<button class="btn sm" data-act="make-list">The list</button>');
    if (t.kind === 'post') return row(tone.warn, ic('tag'), `<b>Update your forum post.</b> ${hEsc(t.words[0])}${t.words.length > 1 ? ` And ${hPlural(t.words.length - 1, 'more thing')}.` : ''}`, `<button class="btn sm go" data-act="pop" data-v="post" data-id="${t.open ? 'open' : 'closed'}">The post</button>`);
    if (t.kind === 'swap') return row(tone.brand, ic('brand'), `<b>Swap ${hPlural(t.n, 'set')}.</b> ${hNum(t.points)} points.`, hOut(MUSEUM_URL, 'Museum', 'btn sm out'));
    if (t.kind === 'hold') return row(tone.warn, ic('points'), `<b>Hold your points.</b> Under the usual ${hMoney(t.usual)}.`, '<button class="btn sm" data-go="points">Points</button>');
    if (t.loss) return row(tone.warn, ic('points'), `<b>${hNum(t.n)} points would sell at a loss.</b> Cost ${hMoney(t.each)}, market ${hMoney(t.price)}.`, '<button class="btn sm" data-go="points">Points</button>');
    return row(tone.good, ic('points'), `<b>Sell ${hNum(t.n)} points.</b> At ${hMoney(t.price)}.`, '<button class="btn sm" data-go="points">Points</button>');
}

/** Up to this many things to do get their own lines under them; more than that and each is one line. */
const PG_TODO_ROOMY = 2;
const PG_TODO_LINES = 12;

/** The lines under a thing to do, drawn when the card has room for them: where it starts, or what it comes to. */
function pgTodoMore(v, t) {
    const line = (a, b, c) => `<div class="nm"><span class="nm-a">${a}</span><span class="nm-b num">${b}</span><span class="nm-c num">${c}</span></div>`;
    const head = (a, b, c) => `<div class="nm h"><span class="nm-a">${a}</span><span class="nm-b">${b}</span><span class="nm-c">${c}</span></div>`;
    if (t.kind === 'trades') return head('Open with you', 'Pieces', 'You pay') + v.trades.open.slice(0, PG_TODO_LINES).map((o) => line(`<b>${hEsc(o.who)}</b> · ${TURN_WORDS[o.state]}`, hNum(o.units), o.total ? hMoney(o.total) : '')).join('');
    // A list's stop may hold pieces bought over their own share, on the room of their set (1.3.0, setjudge.js): in
    // sum it is then not under its pieces' worth, and says so - never a minus in green. (Short: the column is 124px.)
    const under = (s) => (s.gain < 0 ? `<span class="t-muted" title="Over the pieces' own share of the set by this much: the set still keeps your least profit">${hMoney(-s.gain)} over</span>` : `<span class="t-good">${hSigned(s.gain)}</span>`);
    if (t.kind === 'hot' || t.kind === 'buy') return head(t.kind === 'hot' ? 'Where' : 'The first stops', 'Pieces', t.kind === 'hot' ? 'Under your sellers' : 'Under their worth') + (t.first || []).map((s) => line(`<b>${s.im ? 'Item Market' : hEsc(s.who || 'Bazaar ' + (s.whoId ?? ''))}</b>`, hNum(s.units), under(s))).join('');
    if (t.kind === 'swap') return head('Full sets', 'Sets', 'Points') + v.sets.filter((s) => s.full).map((s) => line(`<b>${hEsc(s.label)} Set</b>`, hNum(s.full), hNum(s.full * s.points))).join('');
    if (t.kind === 'hold' || t.kind === 'post') return '';
    const sell = v.points.sell;
    return head('At this price', '', '') + line('You get', '', hMoney(sell.lands)) + line('Profit', '', `<span class="${sell.profit >= 0 ? 't-good' : 't-warn'}">${hSigned(sell.profit)}</span>`) + (sell.lots.length > 1 ? line('In lots', '', lotsWords(sell.lots)) : '');
}

function pgTodoList(v) {
    const todo = v.dash.todo;
    // Under the lines of a buy: what it costs and what it makes of your sets.
    const foot = (t) => (t.full ? `<div class="nx-f"><span>Costs <b class="num">${hMoney(t.cost)}</b></span><span>Full sets after: ${pgFullWords(v, t.full)}</span></div>` : '');
    if (!todo.length) return `<div class="next"><div class="nx"><span class="nx-t">${v.ready ? 'Nothing to do now.' : 'Waiting for the first read.'}</span></div></div>`;
    // Many things to do: one line each, spread over the card. A few: each from the top, with its own lines under it.
    if (todo.length > PG_TODO_ROOMY) return `<div class="next">${todo.map((t) => pgTodo(v, t)).join('')}</div>`;
    return `<div class="next few n${todo.length}">${todo.map((t) => { const more = pgTodoMore(v, t); return `<div class="nx-g${more ? '' : ' bare'}">${pgTodo(v, t)}${more ? `<div class="nx-m">${more}</div>${foot(t)}` : ''}</div>`; }).join('')}</div>`;
}

function pgSky(v) {
    return v.sets.map((s) => {
        const max = Math.max(...s.pieces.map((p) => p.held), s.target, 1) * 1.08;
        const first = s.pieces[0];
        return `<div class="sky"><div class="sky-h"><b>${s.label} Set</b>${s.full} full</div><div class="sky-b">${s.pieces.map((p, i) => `<i class="sky-c ${pgStockCls(p)}" style="--h:${p.held / max * 100}%;--n:${i}" title="${hEsc(p.name)}: ${p.held}${p.need ? ', need ' + p.need : p.ahead ? ', ' + p.ahead + ' ahead' : ', enough'}"></i>`).join('')}<div class="sky-l" style="--at:${s.target / max * 100}%"><span>${s.target}</span></div></div><div class="sky-f">Shortest: <b>${hEsc(first.short)} ${first.held}</b></div></div>`;
    }).join('');
}

/** Beside Torn Trading: which of the two asks more now, in one line. Alone: nothing. */
const PG_TURNS = {
    front: 'you look at Torn Archive: Torn Trading asks less',
    'trading-in-view': 'you look at Torn Trading: Torn Archive asks less',
    'no-answer': 'Torn Trading is on and has not made room: Torn Archive asks less',
    ramp: 'you look at Torn Archive: it asks more in a minute',
};
const pgTurns = (t) => { const line = t && t.mode !== 'alone' ? PG_TURNS[t.mode === 'front' ? 'front' : t.why] : ''; return line ? ` · <span class="t-warn">${line}</span>` : ''; };

function pgDashboard(d, ui) {
    const v = d.view;
    const pays = v.dash.pays;
    const paysLine = (p) => (p.pays == null ? (p.priced === false ? 'reading' : 'no price') : hSigned(p.pays));
    return `<section class="page p-dash on">
    <div class="kpis" data-k="kpis">
      <div class="panel kpi"><div class="k-l">Full sets ready</div><div class="k-v">${hNum(v.dash.full)}</div><div class="k-s">${v.sets.map((s) => `<b>${s.full}</b> ${pgLow(s.label)}`).join(' · ')}</div></div>
      <div class="panel kpi"><div class="k-l">Profit per set</div><div class="k-v ${pays[0] && pays[0].pays > 0 ? 'good' : ''}">${pays[0] ? paysLine(pays[0]) : 'no set'}</div><div class="k-s">${pays[0] ? pgLow(pays[0].label) : ''}${pays[1] ? ` · ${pgLow(pays[1].label)} <b>${paysLine(pays[1])}</b>` : ''}</div></div>
      <div class="panel kpi"><div class="k-l">Points held</div><div class="k-v">${v.dash.pointsHeld == null ? 'not read' : hNum(v.dash.pointsHeld)}</div><div class="k-s"><b>${hNum(v.dash.made)}</b> made from sets</div></div>
      <div class="panel kpi"><div class="k-l">Profit, 7 days</div><div class="k-v ${v.dash.profit7 >= 0 ? 'good' : ''}"${v.dash.profit7 < 0 ? ' style="color:#ff8a87"' : ''}>${hSigned(v.dash.profit7)}</div><div class="k-s">today <b>${hSigned(v.dash.today)}</b></div></div>
      <div class="panel kpi"><div class="k-l">Your shop</div><div class="k-v ${v.shop.open ? 'good' : ''}">${v.shop.open ? 'Open' : 'Closed'}</div><div class="k-s">${PG_SHOP_LINE[v.shop.state](v.prices.verdict.checks)}</div></div>
    </div>
    <div class="panel s8" data-k="pts">${pgPtsHead(v, ui, 'pts')}</div>
    <div class="panel s4 tint" data-k="todo">
      <div class="ph"><h2>Do now</h2></div>
      <div class="pb todo">${pgTodoList(v)}</div>
    </div>
    <div class="panel s4" data-k="margin">
      <div class="ph"><h2>Profit per set</h2><div class="legend">${pgSetKeys(v)}</div><span class="sp"></span><span class="sub">bought at the cheapest listings</span></div>
      <div class="pb"><div class="chart" data-chart="margin"></div></div>
    </div>
    <div class="panel s4" data-k="sky">
      <div class="ph"><h2>Stock</h2><div class="legend">${pgKey('Need', 'var(--st-need)', 1)}${pgKey('Enough', 'var(--st-even)', 1)}${pgKey('Ahead', 'var(--st-over)', 1)}</div><span class="sp"></span><button class="btn sm" data-go="stock">Stock</button></div>
      <div class="pb"><div class="sky2"${v.sets.length === 1 ? ' style="grid-template-columns:1fr"' : ''}>${pgSky(v)}</div></div>
    </div>
    <div class="panel s4" data-k="ladder">
      <div class="ph"><h2>Points market now</h2><span class="sub">lowest first</span><span class="sp"></span><button class="btn sm" data-go="points">Points</button></div>
      <div class="pb flush"><div class="ladder">${pgLadder(v, 6)}</div></div>
    </div>
  </section>`;
}

// ---- Stock -------------------------------------------------------------------------------------------------------

function pgStockSet(v, s) {
    const tiles = s.pieces.map((p, i) => {
        const low = p.low;
        const gap = low ? p.worth - low.price : 0;
        // Every tile always shows the three lines (1.3.0): what a tile shows no longer depends on its size. Until
        // then they were hidden on a tile under 136 x 158 px, so they came and went with the window.
        return `<div class="pc ${pgStockCls(p)} ${i === 0 && p.need ? 'first' : ''}" style="--n:${i}" data-act="pick" data-id="${p.id}" title="Where to buy ${hEsc(p.name)}"><div class="pc-in"><div class="pc-h">${pgIco(p, 'xl')}<span class="pc-s">${p.need ? 'need ' + p.need : p.ahead ? p.ahead + ' ahead' : 'enough'}</span></div><div class="pc-n">${hEsc(p.short)}</div><div class="pc-q"><b class="num">${p.held}</b>of ${p.target}</div>
      <div class="pc-x"><div class="pc-k"><span><span class="w">Cheapest now</span><span class="n">Cheapest</span></span><b class="num ${low && low.price < p.pay ? 't-brand' : ''}">${low ? hMoney(low.price) : 'none'}</b></div><div class="pc-k"><span><span class="w">Worth to you</span><span class="n">Worth</span></span><b class="num">${hMoney(p.worth)}</b></div><div class="pc-k"><span><span class="w">${!low || gap > 0 ? 'Under its worth' : 'Over its worth'}</span><span class="n">${!low || gap > 0 ? 'Under worth' : 'Over worth'}</span></span><b class="num ${low && gap > 0 ? 't-good' : 't-muted'}">${!low ? 'no listing' : gap > 0 ? hSigned(gap) : hMoney(-gap)}</b></div></div>
      <div class="pc-bar"><i style="--w:${Math.min(100, p.target ? p.held / p.target * 100 : 0)}%"></i></div></div></div>`;
    }).join('');
    const act = `<div class="pc act"><div class="pc-in"><span><b class="pc-big num">${s.full}</b><b style="color:var(--text)">full ${s.full === 1 ? 'set' : 'sets'}</b> · ${hNum(s.full * s.points)} points</span>${hOut(MUSEUM_URL, 'Museum', 'btn sm go out')}</div></div>`;
    // As many across as fit, never more than half the tiles (two rows on a wide window); a tile is never smaller
    // than what it shows, and a window too short scrolls the page (hub-css.js .pgrid).
    return `<div class="panel grow setp" data-k="set-${s.key}"><div class="ph"><h2>${hEsc(s.name)}</h2><span class="sub"><b>${s.full}</b> full · building <b>${s.target}</b> · <b>${hMoney(s.cost)}</b> a set${s.costKnown ? '' : ' at your rate'}</span></div>
        <div class="pb"><div class="pgrid" style="--cols:${Math.ceil((s.pieces.length + 1) / 2)}">${tiles}${act}</div></div></div>`;
}

/** Sets swapped at the museum, 14 days: the sum, and the days as rows from the first day with a swap. */
function pgSwapped(v) {
    const c = v.ledger.swapped;
    const days = pgFromFirst(c.x.map((day, i) => ({ day, parts: v.sets.map((s) => c[s.key][i]) })), (k) => k.parts.some(Boolean), 1);
    const all = v.sets.map((s) => c[s.key].reduce((a, b) => a + b, 0));
    const total = all.reduce((a, b) => a + b, 0);
    const pts = v.sets.reduce((a, s, i) => a + all[i] * s.points, 0);
    return `<div class="panel" data-k="swapped"><div class="ph"><h2>Sets swapped</h2><div class="legend">${pgSetKeys(v, 1)}</div><span class="sp"></span><span class="sub">14 days</span></div><div class="pb">
          <div class="ch-sum"><b class="num">${hNum(total)}</b> sets<span class="r">made <b style="font:600 13px var(--sans)" class="num">${hNum(pts)}</b> points</span></div>${total ? chRows(days, v.sets.map((s) => ({ name: s.label, color: s.color })), '') : pgNone('No set swapped in 14 days.')}</div></div>`;
}

function pgStock(d) {
    const v = d.view;
    return `<section class="page g2 p-stock on">
    <div class="col">${v.sets.map((s) => pgStockSet(v, s)).join('')}</div>
    <div class="col">
      <div class="panel" data-k="flow"><div class="ph"><h2>From pieces to money</h2><span class="sp"></span><button class="btn sm" data-act="read-stock" title="Your items and your log are asked of Torn now">Read my stock</button></div><div class="pb"><div class="flow">
        <div class="fl"><div class="k-l">Pieces held</div><div class="k-v">${hNum(v.stock.units)}</div><div class="k-s">${v.stock.est ? 'about ' : ''}${hShort(v.stock.cost)} paid</div></div>
        <div class="fl"><div class="k-l">Full sets</div><div class="k-v">${hNum(v.nav.full)}</div></div>
        <div class="fl"><div class="k-l">Points held, made from sets</div><div class="k-v">${hNum(v.stock.made)}</div></div>
        <div class="fl"><div class="k-l">Points sold, 14 days</div><div class="k-v">${hNum(v.stock.sold14)}</div></div>
      </div><div class="wl-s foot" style="margin-top:10px;padding:9px 0 0">${pgStockAge(v)}</div></div></div>
      ${pgSwapped(v)}
    </div>
  </section>`;
}

// ---- Buy ---------------------------------------------------------------------------------------------------------

const pgNeedBadge = (p) => (p.need ? `<span class="badge st-need">need ${p.need}</span>` : p.ahead ? `<span class="badge st-over">${p.ahead} ahead</span>` : '<span class="badge st-even">enough</span>');
/**
 * Profit per set with a listing of a piece (core/setjudge.js setMakes), as "$7,560 · 2.5%" in one of three text
 * colours (drawing AK; the owner, 2026-10-13: "strong green for when its under set. green for when its about on
 * what it cost per set but a bit over, amber for near stretch, and red dont buy at all" - a loss is not drawn).
 * '' while there is no points price. Until 1.4.0 this cell said "Buy · $154 a point over", "Stretch", "No thanks".
 */
function pgMakes(v, p, price) {
    if (!p.mk) return '';
    const m = setMakes(p.mk, price);
    if (m.cls === 'loss') return '<span class="t-muted" title="Its set would lose with it">a loss</span>';
    const tip = m.cls === 'best' ? 'Under its own share of the set' : m.cls === 'ok' ? `The set keeps your ${pgLeast(v)}` : `The set profits, under your ${pgLeast(v)}`;
    return `<span class="j-${m.cls}" title="${tip} · points at ${hMoney(v.buy.usual.low)}">${hMoney(m.profit)} · ${hPctDown(m.pct)}</span>`;
}
const pgFullWords = (v, full) => v.sets.map((s) => `${pgLow(s.label)} <b>${s.full}</b> to <b>${full[s.key]}</b>`).join(' · ');

/** "Buy from": the places a list may send you to. Both lit until you press one off. */
const pgFrom = (v) => `<span class="from"><span class="t-muted">Buy from</span><span class="seg"><button data-act="from" data-v="bazaar"${v.buy.from.bazaar ? ' class="on"' : ''}>Bazaars</button><button data-act="from" data-v="market"${v.buy.from.market ? ' class="on"' : ''}>Item Market</button></span></span>`;
const pgSeller = (p, o) => (o.src === 'market' ? hOut(itemMarketUrl(p.id, p.name), 'Item Market') : hOut(bazaarUrl(o.whoId, p.id, o.price), `<b>${hEsc(o.who || 'Bazaar ' + (o.whoId ?? ''))}</b>`));

function pgWhere(v, p, lines) {
    if (!p) return '';
    const hist = sparkSvg(p.hist, 'var(--muted)', 54, 20);
    const least = pgLeast(v);
    const clsOf = (o) => (p.mk ? setMakes(p.mk, o.price).cls : o.price < p.lineT ? 'ok' : 'loss');
    // The Item Market is one line for all its rows: each row says its own part of it, cheapest first.
    const imLine = lines.get(lineKey(p.id, IM_PLACE));
    const listed = (o) => (o.src === 'market' ? !!imLine : lines.has(lineKey(p.id, placeOf(o))));
    // A listing its set would lose with is not drawn - unless it is on your list (it is "dear now" there).
    const rowsIn = p.offers.filter((o) => clsOf(o) !== 'loss' || listed(o));
    const hidden = p.offers.length - rowsIn.length;
    const shown = rowsIn.slice(0, 14);
    // Rows of a place you do not buy from ("Buy from") come after the ones you do, with no Add.
    const firstOut = shown.findIndex((o) => o.out && o.ok !== false);
    // Rows not looked at lately come after the checked ones (core/view.js), under a line that says what they are.
    const firstOld = shown.findIndex((o) => o.ok === false);
    const want = Math.max(0, p.need - p.listed);
    const imPart = imShares(shown.map((o) => (o.src === 'market' ? o : { price: 0, qty: 0 })), p.lineT, imLine ? imLine.q : want);
    const rows = shown.map((o, k) => {
        const im = o.src === 'market';
        const key = lineKey(p.id, placeOf(o));
        const on = im ? (imLine && imPart[k] ? { q: imPart[k] } : null) : lines.get(key);
        const q = im ? (imLine ? 0 : imPart[k]) : Math.min(o.qty, want);
        const cls = clsOf(o);
        // Add: purple while the set keeps your least profit, plain under it. Never on a loss.
        const btn = on ? `<button class="btn sm" data-act="cart" data-id="${p.id}" data-v="${hEsc(placeOf(o))}" title="Take it off the list">${on.q} on list ✓</button>` : o.out || !q || cls === 'loss' ? '' : `<button class="btn sm${cls === 'thin' ? '' : ' go'}" data-act="cart" data-id="${p.id}" data-v="${hEsc(placeOf(o))}">Add ${q}</button>`;
        // Torn's own answer, or TornW3B's older copy of that bazaar: said on the row, with its age.
        const how = o.from === 'w3b' ? "TornW3B's copy of this bazaar: Torn itself has not been asked yet" : o.from === 'page' ? 'Seen on its own page, in your Torn tab' : 'Read from Torn itself';
        const age = o.at ? `<span class="n num ${o.ok === false || o.from === 'w3b' ? 't-warn' : 't-muted'}" title="${how}">${o.from === 'w3b' ? 'TornW3B · ' : ''}${hAge(o.at, v.at).replace(' ago', '')}</span>` : '<span></span>';
        const split = k === firstOld ? `<div class="wl-s old-h">Not checked in 5 minutes, not counted${v.buy.check && v.buy.check.length ? ' · being asked now' : ''}</div>` : '';
        const left = k === firstOut ? `<div class="wl-s old-h">${im ? 'Item Market' : 'Bazaars'}: off in Buy from</div>` : '';
        return `${left}${split}<div class="wl ${o.ok === false || o.out ? 'old' : ''} ${o.price < p.pay ? 'cheap' : ''} ${on ? 'on' : ''}"><span>${pgSeller(p, o)}</span><span class="n num">×${hNum(o.qty)}</span><b class="n num">${hMoney(o.price)}</b><span class="n num">${cls === 'loss' ? '<span class="tg">dear now</span>' : pgMakes(v, p, o.price)}</span>${age}<span class="wl-a">${btn}</span></div>`;
    }).join('');
    const u = p.under.units;
    // Units the set keeps your least profit with: under the piece's own share, or over it on the set's room.
    const g = Math.max(u, p.good.units);
    // What the table leaves out (core/shortlist.js), said once.
    const L = p.left;
    const cut = rowsIn.length - shown.length;
    const foot = [
        !p.mk ? (u ? `<b>${hNum(u)}</b> under its worth in ${hPlural(p.under.places, 'place')}` : 'None under its worth') : g ? `<b>${hNum(g)}</b> keep your ${least}` : `None keeps your ${least}`,
        p.mk && p.thin.units ? `${hNum(p.thin.units)} under ${least}` : '',
        L.over + hidden > 0 ? `${hPlural(L.over + hidden, 'listing')} at a loss` : '',
        !p.need ? 'you have enough' : !g ? '' : g >= p.need ? `covers the ${p.need} you need` : `${p.need - g} left for your sellers`,
        p.offers.some((o) => o.price < p.pay) ? '<span style="color:#c9bfff">violet</span>: under what you pay sellers' : '',
        L.more + cut > 0 ? `${hNum(L.more + cut)} more than you can use` : '',
        L.old ? `${hNum(L.old)} not checked` : '',
        L.out ? `${hNum(L.out)} off in Buy from` : '',
    ].filter(Boolean).join(' · ');
    // One press for the whole piece: what a list takes of it. With all of it on, the press takes it off.
    const all = p.more ? `<button class="btn sm go" data-act="cart-all" data-id="${p.id}" title="What a list takes of it${p.small ? ', the big listings first' : ', cheapest first'}">Add all ${hNum(p.more)}</button>` : p.listed ? `<button class="btn sm" data-act="cart-all" data-id="${p.id}" title="Take ${hEsc(p.name)} off the list">Take all ${hNum(p.listed)} off</button>` : '';
    // A list of this piece alone (the owner, 2026-10-11: "where is the button that says make list here? so its only
    // kitten plushies for example?"): what "Add all" would put on an empty list, in place of the list on hand.
    const only = p.take;
    const make = only > 0 ? `<button class="btn sm go" data-act="list-only" data-id="${p.id}" title="${hNum(only)} of them${p.small ? ', the big listings first' : ', cheapest first'}. Replaces the list you have">List only ${hEsc(p.name)}</button>` : '';
    // The colours' key, once, with the piece's own limits in dollars.
    const key = p.mk
        ? `<span class="j-best">Under ${hMoney(p.worth)}</span>${p.okLine > p.worth ? ` · <span class="j-ok">to ${hMoney(p.okLine - 1)} keeps your ${least}</span>` : ''}${p.lineT > p.okLine ? ` · <span class="j-thin">to ${hMoney(p.lineT - 1)}: under ${least}</span>` : ''} · <span class="t-muted">dearer: a loss, hidden</span> · sellers get <b>${hMoney(p.pay)}</b>`
        : `Worth <b>${hMoney(p.worth)}</b> · sellers get <b>${hMoney(p.pay)}</b>`;
    return `<div class="ph">${pgIco(p, 'lg')}<h2>${hEsc(p.name)}</h2>${pgNeedBadge(p)}<span class="sp"></span>${make}${hist ? `<span class="sub">7 days</span>${hist}` : ''}</div><div class="pb flush">
    <div class="wl-s">${key}</div>
    ${shown.length ? `<div class="wl h"><span>Sold by</span><span class="n">Stock</span><span class="n">Price</span><span class="n">Profit per set</span><span class="n">Checked</span><span class="wl-a">${all}</span></div>${rows}` : pgNone(p.offers.length ? 'Every listing is a loss.' : 'No listing.')}
    <div class="wl-s foot">${foot}</div></div>`;
}

function pgRunBar(v, ui) {
    const run = v.buy.run;
    const S = run.stops;
    if (!S.length) return '';
    const at = S.findIndex((s) => s.state === 'cur');
    if (at >= 0) {
        const next = S[at + 1];
        // The Item Market is one stop with a page for each piece: Next opens the next piece's page (ui.imKey: the
        // line whose page was opened last; none yet = the first, which the press that came here opened).
        if (S[at].im) {
            const lines = S[at].lines;
            const k = Math.max(0, lines.findIndex((l) => l.key === ui.imKey));
            const piece = lines.find((l, j) => j > k && l.q - Math.min(l.q, (run.took && run.took[l.key]) || 0) > 0);
            if (piece) return `<div class="runbar"><span><b>Stop ${at + 1} of ${S.length}</b> · Item Market · ${hNum(run.got)} of ${hNum(run.units)} bought</span>${hOut(itemMarketUrl(piece.id, piece.name), `Next: ${hEsc(piece.name)}<span class="kbd">N</span>`, 'btn go', `data-act="im-walk" data-v="${hEsc(piece.key)}"`)}<button class="btn sm link" data-act="run" data-v="stop">Stop the run</button></div>`;
        }
        const btn = next ? hOut(pgStopUrl(next), `Next: ${pgPlace(next)}<span class="kbd">N</span>`, 'btn go', 'data-act="run" data-v="next"') : '<button class="btn go" data-act="run" data-v="next">Done: back to the list<span class="kbd">N</span></button>';
        return `<div class="runbar"><span><b>Stop ${at + 1} of ${S.length}</b> · ${pgPlace(S[at])} · ${hNum(run.got)} of ${hNum(run.units)} bought</span>${btn}<button class="btn sm link" data-act="run" data-v="stop">Stop the run</button></div>`;
    }
    if (run.began) return `<div class="runbar"><span><b>Run done</b> · ${hNum(run.got)} of ${hNum(run.units)} bought${run.skipped ? ` · ${hPlural(run.skipped, 'stop')} skipped` : ''}</span>${hOut(pgStopUrl(S[0]), 'Start again', 'btn sm', 'data-act="run" data-v="start"')}</div>`;
    return `<div class="runbar"><span><b>${hPlural(S.length, 'stop')}</b> · ${hPlural(run.units, 'piece')}</span>${hOut(pgStopUrl(S[0]), `Start: open ${pgPlace(S[0])}`, 'btn go', 'data-act="run" data-v="start"')}</div>`;
}

const PG_STOP_WORDS = {
    cur: (s) => 'you are here' + (s.took ? ` · took ${s.took} of ${s.units}` : ''),
    done: (s) => `took ${s.took} of ${s.units} ✓`,
    part: (s) => `took ${s.took} of ${s.units}`,
    skip: () => 'skipped',
};

/**
 * How fresh your stock count is, said where you are about to buy on it. Torn counts your items once an hour;
 * between its counts yours is carried by what you buy and swap.
 */
function pgStockAge(v) {
    const st = v.top.stock;
    if (!st || !st.readAt) return 'Items not read yet';
    const now = Date.now();
    const since = st.since ? ` · ${hPlural(st.since, 'piece')} changed since` : '';
    const key = st.log ? '' : ` · <span class="t-warn" title="A buy made where Torn Archive is not on the page shows only at Torn's next count">no Full key</span>`;
    if (st.tornAt) return `<span title="Torn counts your items once an hour. In between, your count is carried by what you buy and swap.">Items counted ${hClock(st.tornAt)} · next ${hClock(st.nextAt)}</span>${since}${key}`;
    return `Items read ${hAge(st.readAt, now)}${key}`;
}

function pgAfterRow(v, p, add, take, extra, i) {
    const max = Math.max(p.target, p.held + add, 1) * 1.04;
    const w = (n) => (n / max * 100).toFixed(1) + '%';
    return `<div class="af" style="--n:${i}"><b>${pgIco(p)}${hEsc(p.name)}</b><span class="af-b"><i style="--w:${w(p.held)}"></i>${take ? `<i class="nd" style="--w:${w(take)}"></i>` : ''}${extra ? `<i class="ah" style="--w:${w(extra)}"></i>` : ''}<u style="--at:${w(p.target)}"></u></span><span class="r num">${p.held} to ${p.held + add} of ${p.target}</span></div>`;
}

function pgBuy(d, ui) {
    const v = d.view;
    const lines = new Map(v.buy.stops.flatMap((s) => s.lines).map((l) => [l.key, l]));
    if (ui.pane === 2) {
        const S = v.buy.run.stops;
        const paid = S.reduce((a, s) => a + s.margin.paid, 0);
        const leaves = S.reduce((a, s) => a + s.margin.leaves, 0);
        // A line its set profits little with says so; one its set loses with is dear now (it leaves at the next read).
        const tag = (l) => (l.g === 'thin' ? `<span class="tg">under ${pgLeast(v)}</span>` : l.g === 'no' ? '<span class="tg">dear now</span>' : '');
        const list = !S.length ? pgNone('Nothing on the list.') : S.map((s, i) => {
            const cls = s.state === 'part' ? 'done' : s.state;
            // A stop judged by itself may be under your least profit while its sets still profit (setjudge.js): the
            // amber of "under your least", and why on the hover - not the same words on every stop.
            const carried = !s.margin.ok && s.lines.some((l) => l.g === 'room' || l.g === 'thin');
            return `<div class="stop ${cls}"><span class="stop-n">${s.state === 'done' ? '✓' : i + 1}</span><div class="stop-m"><div class="stop-h">${hOut(pgStopUrl(s), `<b>${s.im ? 'Item Market' : hEsc(s.who || 'A bazaar') + "'s bazaar"}</b>`)}<span class="stop-st">${s.state ? PG_STOP_WORDS[s.state](s) : ''}</span><span class="sp"></span><b class="num">${hMoney(s.cost)}</b><span class="${s.margin.ok ? 't-good' : carried ? 'j-thin' : 't-warn'} num"${carried ? ` title="By itself under your ${pgLeast(v)}: its sets still profit"` : ''}>${marginWords(s.margin)}</span></div><div class="chips">${s.lines.map((l) => `<span class="chip">${pgItem(v, l.id, l.name)}<span><b>${hEsc((viewPiece(v, l.id) || {}).short || l.name)}</b> ×${l.q}</span><span class="num t-muted">${hMoney(l.price)}</span>${tag(l)}<button class="x" data-act="drop" data-v="${hEsc(l.key)}" title="Take it off the list">×</button></span>`).join('')}</div></div></div>`;
        }).join('');
        // The list's capital, once, beside what you have on hand (the owner, 2026-10-11: "can it say how much
        // capital i need to buy that list").
        const cash = v.buy.cash;
        const have = cash.onHand == null ? '' : ` <span class="t-muted">· on hand ${hMoney(cash.onHand)}${cash.vault ? ` · vault ${hMoney(cash.vault)}` : ''}</span>`;
        const vault = v.buy.vault == null || !v.buy.units ? '' : v.buy.vault > 0 ? `<span class="grow1 t-warn">Take ${hMoney(v.buy.vault)} out of the vault first</span>` : '<span class="grow1 t-muted">On hand covers it</span>';
        // What a whole set costs you, now and with this list bought, and what its points sell for (the owner,
        // 2026-10-13: "it should say how much it costs to complete a set not per point").
        const even = v.buy.even.filter((e) => e.setTo > 0).map((e) => `<div class="row"><span class="grow1">A ${e.label} set will cost you</span><span class="num">${e.setFrom ? `<b>${hMoney(e.setFrom)}</b> now · ` : ''}<b>${hMoney(e.setTo)}</b> with this list</span></div>${e.value ? `<div class="row"><span class="grow1">It sells for</span><span class="num"><b>${hMoney(e.value)}</b> · <span class="${e.value < e.setTo ? 't-bad' : 't-good'}">${hSigned(e.value - e.setTo)} a set</span></span></div>` : ''}`).join('');
        const thin = v.buy.thin ? `<div class="row"><span class="grow1 j-thin"><b style="color:inherit">${hPlural(v.buy.thin, 'piece')}</b> on it: profit per set under your ${pgLeast(v)}</span></div>` : '';
        // A buy a Torn page told of that Torn's log does not have: taken back, and said here for a few minutes.
        const back = v.buy.back.map((b) => `<div class="row"><span class="grow1 t-warn"><b>Taken back:</b> ${hNum(b.qty)} × ${hEsc(b.name)} ${b.im ? 'on the Item Market' : 'at ' + hEsc(b.who || 'bazaar ' + b.whoId) + "'s bazaar"}, ${hClock(b.t)} · not in Torn's log</span></div>`).join('');
        const onList = v.pieces.filter((p) => p.listed);
        return `<section class="page p-buy on"><div class="pane gbuy stk on">
      <div class="panel" style="align-self:start" data-k="list"><div class="ph"><h2>Shopping list</h2>${v.buy.units ? `<span class="sub">${hPlural(v.buy.units, 'piece')} · ${hPlural(S.length, 'stop')}</span>` : ''}<span class="sp"></span>${pgFrom(v)}<button class="btn sm" data-act="make-list">Fill my stock</button><button class="btn sm" data-act="clear-list">Clear</button></div><div class="pb flush">${list}</div></div>
      <div class="col">
        <div class="panel tint" data-k="run"><div class="ph"><h2>The run</h2></div><div class="pb"><div class="rows">${pgRunBar(v, ui)}
          ${back}
          <div class="row"><span class="grow1"><b>This list costs</b>${have}</span><b class="num">${hMoney(v.buy.cost)}</b></div>
          ${vault ? `<div class="row">${vault}</div>` : ''}
          ${paid ? `<div class="row"><span class="grow1">Profit</span><span class="num ${leaves < 0 ? 't-warn' : 't-good'}">${hSigned(leaves)} · ${hPct(leaves / paid * 100)}</span></div>` : ''}
          <div class="row"><span class="grow1">Full sets after</span><b class="num" style="font-weight:500">${pgFullWords(v, v.buy.full)}</b></div>
          ${even}${thin}
          <div class="row"><span class="grow1 t-muted">${pgStockAge(v)}</span></div></div></div></div>
        ${onList.length ? `<div class="panel" data-k="list-after"><div class="ph"><h2>Stock after the list</h2><div class="legend">${pgKey('You hold', '#4a5263', 1)}${pgKey('On the list', 'var(--need)', 1)}</div></div><div class="pb flush"><div class="after">${onList.map((p, i) => pgAfterRow(v, p, p.listed, p.listed, 0, i)).join('')}</div></div></div>` : ''}
      </div></div></section>`;
    }
    const all = ui.pane === 1;
    const rows = v.pieces.filter((p) => all || p.need).sort((a, b) => (b.target ? b.need / b.target : 0) - (a.target ? a.need / a.target : 0));
    const sel = viewPiece(v, ui.sel) || rows[0] || v.pieces[0] || null;
    // Read by the hub after the draw: the piece whose sellers are shown.
    ui.shown = sel ? String(sel.id) : '';
    const plan = v.buy.plan;
    const table = rows.length ? '<thead><tr><th>Piece</th><th class="n">Need</th><th class="n">Cheapest</th><th>Where</th><th class="n">Profit per set</th><th class="n">On list</th></tr></thead><tbody>' + rows.map((p) => {
        const low = p.low;
        return `<tr class="pick ${sel && p.id === sel.id ? 'sel' : ''}" data-act="sel" data-id="${p.id}"><td>${pgIco(p)}<b>${hEsc(p.name)}</b></td><td class="n">${p.need ? `<span class="t-stn">${p.need}</span>` : p.ahead ? `<span class="t-sto">${p.ahead} ahead</span>` : '<span class="t-ste">enough</span>'}</td><td class="n">${low ? `<b class="${low.price < p.pay ? 't-brand' : ''}">${hMoney(low.price)}</b> <span class="t-muted">×${hNum(low.qty)}</span>` : `<span class="t-muted">${p.lowAll ? 'none where you buy' : 'none listed'}</span>`}</td><td>${low ? (low.src === 'market' ? 'Item Market' : hEsc(low.who || 'Bazaar ' + (low.whoId ?? ''))) : ''}</td><td class="n">${low ? pgMakes(v, p, low.price) : ''}</td><td class="n">${p.listed ? `<b>${p.listed}</b> <span class="t-muted">of ${p.need}</span>` : '<span class="t-muted">none</span>'}</td></tr>`;
    }).join('') + '</tbody>' : '';
    // What you still need, counted by what its set makes at the cheapest listings: the three colours, said once.
    const mk = v.buy.marks;
    const least = pgLeast(v);
    const at = `points at ${hMoney(v.buy.usual.low)}`;
    const spare = v.sets.filter((s) => s.next && s.next.room > 0).map((s) => `Next ${pgLow(s.label)} set: <b>${hMoney(s.next.room)}</b> to spare`).join(' · ');
    const groups = !v.top.points ? '' : `<div class="row"><span class="grow1"><span class="mk3"><span class="j-best" title="Under the piece's own share of its set · ${at}">${hNum(mk.best)} under their share</span><span class="j-ok" title="Over its own share: the set keeps your ${least} · ${at}">${hNum(mk.ok)} keep your ${least}</span><span class="j-thin" title="The set profits, under your ${least}: on a list only when you add it">${hNum(mk.thin)} under ${least}</span><span class="t-muted" title="No listing its set profits with">${hNum(mk.none)} for your sellers</span></span></span></div>${spare ? `<div class="row"><span class="grow1 t-muted">${spare}</span></div>` : ''}`;
    return `<section class="page p-buy on"><div class="pane gbuy stk on">
      <div class="col">
        <div class="panel tint" data-k="rec"><div class="ph"><h2>Fill my stock</h2></div><div class="pb">
          <div class="rec"><div class="hero">${hNum(plan.units)}<small>of ${hNum(plan.need)} needed, worth buying now</small></div><div class="rec-t"><b>${hPlural(plan.stops, 'stop')}</b> · ${hMoney(plan.cost)}<br>${pgFullWords(v, plan.full)}</div><div class="rec-b">${pgFrom(v)}<button class="btn go" data-act="make-list"${plan.units ? '' : ' disabled'}>Make the list</button></div></div>
          <div class="rows">${groups}<div class="row"><span class="grow1 t-muted">${pgStockAge(v)}</span></div>${v.buy.unsure ? `<div class="row"><span class="grow1 t-muted">${hPlural(v.buy.unsure, 'more piece')} in ${hPlural(v.buy.check.length, 'bazaar')} not checked in 5 minutes · being asked now</span></div>` : ''}</div>
        </div></div>
        <div class="panel grow" data-k="buy-t"><div class="ph"><h2>Where each piece is cheapest</h2></div>
          <div class="pb flush">${rows.length ? `<table class="t wrapth">${table}</table>` : pgNone('You need nothing.')}</div></div>
      </div>
      <div class="col">
        <div class="panel" data-k="where">${pgWhere(v, sel, lines)}</div>
        <div class="panel grow minc" style="min-height:168px" data-k="depth"><div class="ph"><h2>How deep the cheap pieces go</h2><div class="legend">${pgSetKeys(v)}</div></div>
          <div class="pb"><div class="chart" data-chart="depth"></div></div></div>
      </div></div></section>`;
}

// ---- Trades ------------------------------------------------------------------------------------------------------

/** What is wrong with an open trade, in numbers: one line under its tiles. '' when nothing is. */
function pgTradeWarn(t) {
    const m = t.margin;
    const out = [];
    if (m.state === 'under') out.push(`<b class="t-warn">Under your least profit</b>${m.mend ? ` · ${hRate(m.mend)}% would keep it` : ''}`);
    else if (m.state === 'loss') out.push(`<b class="t-bad">A loss</b>${m.mend ? ` · ${hRate(m.mend)}% would keep your least profit` : ''}`);
    if (m.held > 0 && m.state !== 'none') out.push(`${hMoney(m.held)} is for pieces not needed yet`);
    if (m.others.length) out.push(`<span class="t-warn">Not a set piece, not priced: ${m.others.map(hEsc).join(', ')}</span>`);
    // What you pay came down inside its hour (core/sellrate.js safeTable): the seller may have counted on more.
    for (const r of t.rateDown || []) out.push(`<span class="t-warn">${r.label} price down from ${hRate(r.from)}% to ${hRate(r.to)}% at ${hClock(r.at)} TCT, points at ${hMoney(r.price)}</span>`);
    return out.join(' · ');
}

const pgTile = (label, value, sub = '') => `<div class="fl"><div class="k-l">${label}</div><div class="k-v">${value}</div>${sub ? `<div class="k-s">${sub}</div>` : ''}</div>`;

/**
 * An open trade (1.4.0, drawing AL): what you pay, the pieces, the profit; their items; the message to paste when
 * something has to come out; the money; your sets after it.
 */
function pgTrade(v, t) {
    const forSets = (r) => (r.state === 'other' ? '<span class="t-warn">not a set piece</span>' : r.take === r.qty ? `<span class="t-need">need all ${r.qty}</span>` : r.take ? `<span class="t-need">need ${r.take}</span> <span class="t-muted">· ${r.qty - r.take} ahead</span>` : '<span class="t-muted">not needed</span>');
    const rows = t.rows.map((r) => `<tr><td>${pgItem(v, r.id, r.name)}<b>${hEsc(r.name)}</b></td><td class="n">${hNum(r.qty)}</td><td>${forSets(r)}</td><td class="n">${r.each ? hMoney(r.each) : '<span class="t-muted">not priced</span>'}</td><td class="n">${r.each ? `<b>${hMoney(r.total)}</b>` : ''}</td></tr>`).join('');
    const m = t.margin;
    const profit = m.state === 'none' ? pgTile('Profit', '<span class="t-muted">none</span>', 'nothing priced')
        : pgTile('Profit', `<span class="${m.state === 'ok' ? 't-good' : m.state === 'loss' ? 't-bad' : 't-warn'}">${hSigned(m.all.leaves)}</span>`, `<span title="Once the sets are sold at today's points price">${hPct(m.all.pct)}</span>`);
    const warn = pgTradeWarn(t);
    const dr = [];
    if (t.message && t.state !== 'them') dr.push(`<div class="dr"><span class="dr-l">Message</span><div class="msg">${hEsc(t.message)}</div><button class="btn go" data-act="copy" data-v="${hEsc(t.message)}">Copy</button></div>`);
    if (t.state === 'you') {
        const money = t.vault == null ? `You pay <b>${hMoney(t.owed)}</b> · money on hand not read`
            : t.vault > 0 ? `On hand ${hMoney(t.onHand)} · <b class="t-warn">take ${hMoney(t.vault)} out of the vault</b>${t.short ? ` · <span class="t-bad">${hMoney(t.short)} short with the vault</span>` : ''}`
            : `On hand ${hMoney(t.onHand)} covers it`;
        dr.push(`<div class="dr"><span class="dr-l">Money</span><span>${money}${t.myMoney ? ` <span class="t-muted">· ${hMoney(t.myMoney)} already in</span>` : ''}</span><span></span></div>`);
    } else if (t.state === 'them') dr.push(`<div class="dr"><span class="dr-l">Money</span><span>You paid <b>${hMoney(t.myMoney)}</b> · waiting for ${hEsc(t.who)}</span><span></span></div>`);
    else dr.push(`<div class="dr"><span class="dr-l">State</span><span>${hEsc(t.who)} is still adding items</span><span></span></div>`);
    const sets = v.sets.filter((s) => t.after.some((r) => (viewPiece(v, r.id) || {}).set === s.key)).map((s) => `${s.label} sets <b>${s.full}</b> to <b>${t.full[s.key]}</b>`).join(' · ');
    const after = t.after.map((r, i) => { const p = viewPiece(v, r.id); return p ? pgAfterRow(v, p, r.q, r.take, r.q - r.take, i) : ''; }).join('');
    return `<div class="panel"><div class="ph"><h2>${hOut(hProfileUrl(t.whoId), hEsc(t.who))}</h2><span class="sub">${hPlural(t.items, 'item')} · ${hPlural(t.units, 'piece')} · ${t.ago}</span><span class="sp"></span><span class="badge ${t.state === 'you' ? 'ahead' : t.state === 'new' ? 'best' : ''}">${TURN_WORDS[t.state]}</span>${hOut(tradeViewUrl(t.id), 'Open the trade', 'btn sm go out')}</div>
        <div class="pb"><div class="flow plain" style="grid-template-columns:repeat(3,minmax(0,1fr))">
          ${pgTile(t.state === 'them' ? 'You paid' : 'You pay', hMoney(t.total), t.needTotal < t.total ? `only what you need: <b>${hMoney(t.needTotal)}</b>` : '')}
          ${pgTile('Pieces', hNum(t.units), t.paid ? `at ${t.paid} of market value` : '')}
          ${profit}
        </div>${warn ? `<div class="wl-s" style="padding:9px 0 0">${warn}</div>` : ''}
        <table class="t tight flat" style="margin:10px -14px 0;width:calc(100% + 28px)"><thead><tr><th>Their items</th><th class="n">In the trade</th><th>For your sets</th><th class="n">Your price</th><th class="n">Total</th></tr></thead><tbody>${rows}</tbody></table>
        <div class="drs" style="margin-top:0">${dr.join('')}</div></div></div>
      <div class="panel"><div class="ph"><h2>Sets after this trade</h2><span class="sub">${sets}</span><span class="sp"></span><div class="legend">${pgKey('You hold', '#4a5263', 1)}${pgKey('Needed', 'var(--need)', 1)}${pgKey('Ahead', 'var(--warn)', 1)}</div></div>
        <div class="pb flush"><div class="after" style="min-height:0;height:auto">${after}</div></div></div>`;
}

/**
 * A finished trade's receipt: "View receipt" once TornW3B has one for it (its link and what to send the seller
 * are in the box that opens), else the button that makes it - and, where there is room for words, why a try
 * made none. The owner, 2026-10-12: "i need that link, saved somewhere as well like a view button, then popup
 * copy receipt link".
 */
function pgReceipt(d, f, words = true) {
    if (!(d.keys && d.keys.w3b && d.keys.w3b.set)) return '';
    if (f.receipt) return `<button class="btn sm" data-act="pop" data-v="receipt" data-id="${hEsc(f.id)}">View receipt</button>`;
    const busy = !!d.busy && d.busy.receipt === f.id;
    const why = f.why ? `<span class="t-bad" style="margin-right:8px">${hEsc(f.why)}</span>` : f.listed ? '' : '<span class="t-muted" style="margin-right:8px">not priced on your TornW3B list</span>';
    return `${words ? why : ''}<button class="btn sm" data-act="receipt" data-id="${hEsc(f.id)}"${f.why && !words ? ` title="${hEsc(f.why)}"` : ''}${busy ? ' disabled' : ''}>${busy ? 'Making it' : 'Generate receipt'}</button>`;
}

/** One of your two forum posts: 'open' | 'closed' - the one for the shop as it stands, or the other. */
export const hubPostOf = (d, which) => {
    const pr = d && d.view && d.view.prices;
    if (!pr || !pr.forum) return null;
    return which === (pr.open ? 'open' : 'closed') ? pr.forum : pr.forum.other || null;
};

/**
 * Your forum post in the box over the page - the owner, 2026-10-12: "can i open it like a popup that i can edit so
 * i can open and close it by copy paste? i dont like how its giving me the info". Both posts are there whatever
 * the shop says: the open one and the closed one. The title and the post can be changed before they are copied;
 * what you changed is kept (hub.js, per post) until you take the Archive's post back. Only the top line can be
 * copied by itself: OPEN FOR TRADES or CLOSED FOR NOW, to paste over the one on your thread.
 * Nothing here depends on your changes: hub.js puts them in after the box is drawn, so typing never redraws it.
 */
function popPost(d, pop) {
    const pr = d.view.prices;
    const which = pop.id === 'closed' ? 'closed' : 'open';
    const f = hubPostOf(d, which);
    if (!f) return '';
    const now = which === (pr.open ? 'open' : 'closed');
    const th = pr.thread;
    const tab = (k, label) => `<button data-act="pop" data-v="post" data-id="${k}"${k === which ? ' class="on"' : ''}>${label}</button>`;
    const shop = `Your shop is <b>${pr.open ? 'open' : 'closed'}</b>`;
    return `<h2>Your forum post</h2>
    <div class="pop-b" style="margin:0 0 10px"><span class="seg">${tab('open', 'Open')}${tab('closed', 'Closed')}</span><span class="t-muted">${shop}${now ? '' : ` · for when you ${pr.open ? 'close' : 'open'}`}</span></div>
    ${now && pr.forum.behind ? `<div class="ta-hold" data-k="post-behind"><b>Your thread is behind.</b> ${pr.forum.behind.words.map(hEsc).join(' ')}</div>` : ''}
    <div class="ta-hold" id="pop-moved" hidden><b>The post changed since your edit.</b> <button class="btn sm" data-act="post-reset" style="margin-left:6px">Take the new post</button></div>
    <div class="pop-l">The title</div><input class="inp post-title" id="pop-title" value="${hEsc(f.title)}" autocomplete="off" spellcheck="false">
    <div class="pop-l">The post</div>
    <div class="msg post-view post-edit" id="pop-post" contenteditable="true" spellcheck="false" data-which="${which}">${f.html}</div>
    <div class="pop-b"><button class="btn go" data-act="post-copy">Copy the post</button><button class="btn" data-act="post-top">Copy only the top line</button><button class="btn" data-act="post-title">Copy the title</button>${th && th.url ? hOut(th.url, 'Your thread', 'btn out') : ''}<span class="sp"></span><button class="btn" id="pop-back" data-act="post-reset" hidden>Undo my changes</button><button class="btn" data-act="pop-close">Close</button></div>`;
}

/**
 * The box over the page (hub.js draws it while `ui.pop` is set): a trade's receipt - its link to copy, and
 * what to send the seller with it. '' when there is nothing to show (the trade is gone): the box closes.
 */
export function hubPop(d, ui) {
    const pop = ui.pop;
    if (pop && pop.kind === 'post') return popPost(d, pop);
    if (!pop || pop.kind !== 'receipt') return '';
    const f = d.view.trades.finished.find((x) => String(x.id) === String(pop.id));
    if (!f || !f.receipt) return '';
    const r = f.receipt;
    const differs = r.total > 0 && r.total !== f.paid;
    return `<h2>Receipt · ${hEsc(f.who)}</h2>
    <p>${hPlural(f.units, 'piece')} · ${hWhen(f.t)} · you paid <b class="num">${hMoney(f.paid)}</b>${r.total > 0 ? ` · the receipt says <b class="num${differs ? ' t-warn' : ''}"${differs ? ' title="TornW3B makes a receipt from your list as it stands when the receipt is made"' : ''}>${hMoney(r.total)}</b>` : ''}</p>
    
    ${r.url ? `<div class="pop-l">The receipt's link</div><div class="msg pop-m">${hEsc(r.url)}</div>
    <div class="pop-b"><button class="btn go" data-act="copy" data-v="${hEsc(r.url)}">Copy receipt link</button>${hOut(r.url, 'Open it', 'btn out')}</div>
    <div class="pop-l">To send the seller</div><div class="msg pop-m">${hEsc(f.thanks)}</div>
    <div class="pop-b"><button class="btn go" data-act="copy" data-v="${hEsc(f.thanks)}">Copy the message</button><span class="sp"></span><button class="btn" data-act="pop-close">Close</button></div>`
        : `<p>The link is not ready yet.</p><div class="pop-b"><span class="sp"></span><button class="btn" data-act="pop-close">Close</button></div>`}`;
}

/** A finished trade: what you paid, what to send its seller, its receipt, what came. */
function pgDone(d, f) {
    const v = d.view;
    const r = f.receipt;
    const differs = !!r && r.total > 0 && r.total !== f.paid;
    const came = (f.rows || []).map((x) => { const p = viewPiece(v, x.id); const name = p ? p.short || p.name : 'Item ' + x.id; return `<span class="chip" style="padding-right:9px">${pgItem(v, x.id, name)}<span><b>${hEsc(name)}</b> ×${hNum(x.qty)}</span></span>`; }).join('');
    const hasKey = !!(d.keys && d.keys.w3b && d.keys.w3b.set);
    const send = r && r.url
        ? `<div class="dr"><span class="dr-l">Message</span><div class="msg">${hEsc(f.thanks)}</div><button class="btn go" data-act="copy" data-v="${hEsc(f.thanks)}">Copy</button></div>
           <div class="dr"><span class="dr-l">Receipt</span><div class="msg">${hEsc(r.url)}</div><span class="dr-b"><button class="btn" data-act="copy" data-v="${hEsc(r.url)}">Copy</button>${hOut(r.url, 'Open', 'btn out')}</span></div>`
        : r ? '<div class="dr"><span class="dr-l">Receipt</span><span class="t-muted">The link is not ready yet</span><span></span></div>'
        : hasKey ? `<div class="dr"><span class="dr-l">Receipt</span><span></span><span class="dr-b">${pgReceipt(d, f)}</span></div>` : '';
    return `<div class="panel"><div class="ph"><h2>${hOut(hProfileUrl(f.whoId), hEsc(f.who))}</h2><span class="sub">${hWhen(f.t)} TCT</span><span class="sp"></span><span class="badge ok">finished</span></div>
        <div class="pb"><div class="flow plain" style="grid-template-columns:repeat(3,minmax(0,1fr))">
          ${pgTile('You paid', hMoney(f.paid))}
          ${pgTile('Pieces', hNum(f.units), f.rate ? `at ${hRate(f.rate)}% of market value` : '')}
          ${pgTile('Receipt', r ? (differs ? `<span class="t-warn" title="TornW3B makes a receipt from your list as it stands when the receipt is made">${hMoney(r.total)}</span>` : 'made') : 'none', f.why ? `<span class="t-bad">${hEsc(f.why)}</span>` : '')}
        </div>
        ${send || came ? `<div class="drs">${send}${came ? `<div class="dr top"><span class="dr-l">Came</span><div class="chips" style="margin:0">${came}</div><span></span></div>` : ''}</div>` : ''}</div></div>`;
}

/** With more trades than this in the list, it gets "Find a seller" and a line for each day. */
const PG_FIND_OVER = 8;

/**
 * Trades (1.4.0, drawing AL; the owner, 2026-10-13: "it should look like a list of all my trades ... with the
 * pressed one on the right"). Left, one list: the open ones, then every finished one. Right, the trade pressed -
 * an open one with its prices, a finished one with its message and receipt. One selection over both (`ui.trade`,
 * core/trades.js tradePick): a trade that ends while you look at it stays, as its receipt.
 * The right column is ONE keyed part, and the list is the scroller itself: a press redraws without the list
 * jumping back to its top. The box you type in is a keyed part of its own, so the list filters while you type.
 */
function pgTrades(d, ui) {
    const v = d.view;
    const open = v.trades.open;
    const fin = v.trades.finished;
    const pick = tradePick(open, fin, ui.trade);
    const many = open.length + fin.length > PG_FIND_OVER;
    const q = many ? String(ui.find || '').trim().toLowerCase() : '';
    const hit = (t) => !q || String(t.who || '').toLowerCase().includes(q);
    const wait = v.trades.wait;
    const hasKey = !!(d.keys && d.keys.w3b && d.keys.w3b.set);
    const av = (t, cls = '') => `<span class="av ${cls}">${hEsc(String(t.who || '?')[0])}</span>`;
    const o = open.filter(hit);
    const f = fin.filter(hit);
    let list = `<div class="tl-g"><h2>Open with you</h2><span class="sub">${open.length || 'none'}</span><span class="sp"></span>${wait ? `<span class="badge ahead">${wait} ${wait === 1 ? 'waits' : 'wait'} for you</span>` : ''}</div>`;
    list += o.map((t) => `<div class="li${pick.open && t.id === pick.open.id ? ' sel' : ''}" data-act="trade" data-id="${hEsc(t.id)}">${av(t, t.state === 'you' ? 'you' : '')}<span class="li-m"><b>${hEsc(t.who)}</b><span>${hPlural(t.items, 'item')} · ${hPlural(t.units, 'piece')} · ${t.ago}</span></span><span class="amt"><b class="num">${hMoney(t.total)}</b><span class="${t.state}">${TURN_WORDS[t.state]}</span></span></div>`).join('');
    list += `<div class="tl-g" style="border-top:1px solid var(--line)"><h2>Finished</h2><span class="sub">${fin.length || 'none'}</span><span class="sp"></span>${fin.length ? '<button class="btn sm" data-go="ledger" data-pane="3">Receipts</button>' : ''}</div>`;
    let day = '';
    for (const t of f) {
        const on = hDay(t.t);
        if (many && on !== day) { day = on; list += `<div class="tl-d">${day}</div>`; }
        const rc = !hasKey ? '' : t.receipt ? '<span class="rc">receipt</span>' : `<span${t.why ? ` class="t-bad" title="${hEsc(t.why)}"` : ''}>no receipt</span>`;
        list += `<div class="li${pick.done && t.id === pick.done.id ? ' sel' : ''}" data-act="trade" data-id="${hEsc(t.id)}">${av(t)}<span class="li-m"><b>${hEsc(t.who)}</b><span>${hPlural(t.units, 'piece')} · ${many ? '' : on + ', '}${hClock(t.t)}</span></span><span class="amt"><b class="num">${hMoney(t.paid)}</b>${rc}</span></div>`;
    }
    if (q && !o.length && !f.length) list += '<div class="li" style="cursor:default;color:var(--muted)">Nobody by that name.</div>';
    const detail = pick.open ? pgTrade(v, pick.open) : pick.done ? pgDone(d, pick.done)
        : '<div class="panel"><div class="ph"><h2>No trade yet</h2></div></div>';
    return `<section class="page p-trades on">
    <div class="panel tl">${many ? `<div class="tl-find" data-k="tfind"><input id="t-find" placeholder="Find a seller" value="${hEsc(ui.find || '')}" autocomplete="off" spellcheck="false"></div>` : ''}<div class="tl-s" data-k="tlist">${list}</div></div>
    <div class="col" data-k="tdetail">${detail}</div>
  </section>`;
}

// ---- Points ------------------------------------------------------------------------------------------------------

const PG_BOOK_BADGE = { made: ['best', 'Made'], sold: ['ok', 'Sold'], used: ['need', 'Used'] };

/** One row of the points book, in whole dollars: what the points cost you, what they sold for, the profit. */
function pgBookRow(v, r) {
    const [cls, word] = PG_BOOK_BADGE[r.kind] || ['', r.kind];
    const set = r.set ? v.sets.find((s) => s.key === r.set) : null;
    const what = r.kind === 'made' ? (set ? hPlural(Math.round(r.points / set.points), set.label + ' Set') : 'Sets') : '';
    const out = r.kind !== 'made';
    const n = out ? r.mine : r.points;
    return `<tr><td>${hWhen(r.t)}</td><td><span class="badge ${cls}">${word}</span> ${what}${out && r.mine < r.points ? ` <span class="t-muted">· ${hNum(r.points - r.mine)} held before</span>` : ''}</td><td class="n"><b>${out ? '-' : '+'}${hNum(n)}</b></td><td class="n">${hMoney(n * r.cost)}</td><td class="n">${r.kind === 'sold' ? hMoney(r.each) : `<span class="t-muted">${r.kind === 'used' ? 'used' : 'held'}</span>`}</td><td class="n">${r.kind === 'sold' ? hMoney(r.mine * r.each) : ''}</td><td class="n">${r.kind === 'sold' ? `<span class="${r.gain < 0 ? 't-bad' : 't-good'}">${hSigned(r.gain)}</span>` : r.kind === 'used' ? '<span class="t-muted">not counted</span>' : ''}</td></tr>`;
}

/**
 * "Your sets, in money" (1.4.0, drawing AL; the owner, 2026-10-13: "the sets and points book is confusing ... make
 * it easier for me to understand"): what you spent on sets, the points they made, what the sold ones made you and
 * what the rest is worth - in whole dollars and a set, never "a point".
 */
function pgSetsMoney(v) {
    const pt = v.points;
    const book = pt.book;
    const made = pt.made;
    const worth = book.left * pt.price;
    const steps = [
        pgTile('You spent', hMoney(made.spent), made.sets ? `<b>${hNum(made.sets)}</b> ${made.sets === 1 ? 'set' : 'sets'} · <b>${hMoney(made.perSet)}</b> a set` : 'no set swapped yet'),
        pgTile('They made', `${hNum(book.made)} points`, made.sets ? `${hNum(Math.round(book.made / made.sets))} a set` : ''),
        pgTile('Sold', `${hNum(book.sold)}${book.sold ? ` <span class="${book.profitSold < 0 ? 't-bad' : 't-good'}" style="font-size:15px">${hSigned(book.profitSold)}</span>` : ''}`, book.sold ? `got <b>${hMoney(book.soldGot)}</b> · those cost <b>${hMoney(book.soldCost)}</b>` : 'none sold yet'),
    ];
    if (book.used) steps.push(pgTile('Used by you', hNum(book.used), `cost <b>${hMoney(book.usedCost)}</b> · not profit`));
    steps.push(pgTile('Still holding', `${hNum(book.left)}${book.left && pt.price ? ` <span class="${worth < book.cost ? 't-bad' : 't-good'}" style="font-size:15px">${hSigned(worth - book.cost)} now</span>` : ''}`, book.left ? `cost <b>${hMoney(book.cost)}</b>${pt.price ? ` · worth <b>${hMoney(worth)}</b> at ${hMoney(pt.price)}` : ''}` : 'none held'));
    const all = book.sold + book.used + book.left;
    const pc = (n) => (all ? Math.round(n / all * 100) : 0);
    const split = all ? `<div class="split"><i class="a" style="--w:${book.sold / all * 100}%"></i>${book.used ? `<i class="c" style="--w:${book.used / all * 100}%"></i>` : ''}<i class="b" style="--w:${book.left / all * 100}%"></i></div>
          <div class="split-k"><span><b>${pc(book.sold)}%</b> sold</span>${book.used ? `<span><b>${pc(book.used)}%</b> used by you</span>` : ''}<span><b>${pc(book.left)}%</b> still yours to sell</span></div>` : '';
    // What was yours before the book began: never filled, never counted as profit - until a cost is typed for it.
    const before = pt.before > 0 || v.settings.beforeEach > 0 ? `<div class="rows" style="margin-top:10px"><div class="row" style="border-top:1px solid var(--line)"><span class="grow1" title="Type what a point cost you to put them in the book">Held before Torn Archive${pt.before > 0 ? ` <b class="num">${hNum(pt.before)}</b> points · not in the book` : ''}</span><span class="t-muted">cost each $</span>${pgInput('beforeEach', v.settings.beforeEach || '', 84)}</div></div>` : '';
    return `<div class="panel" data-k="setsmoney"><div class="ph"><h2>Your sets, in money</h2><span class="sub">${made.since ? 'since ' + hDay(made.since) : ''}</span></div><div class="pb">
          <div class="flow" style="grid-template-columns:repeat(${steps.length},minmax(0,1fr))">${steps.join('')}</div>${split}${before}</div></div>`;
}

/** "Sets you made": every swap with what its pieces cost you, in all and a set. */
function pgSetsMade(v) {
    const made = v.points.made;
    const sw = (r) => { const s = v.sets.find((x) => x.key === r.set); return s ? `<i class="sw" style="--c:${s.color}"></i><b>${hNum(r.sets)}</b> ${s.label}` : `<b>${hNum(r.sets)}</b>`; };
    const rows = made.rows.map((r) => `<tr><td>${hWhen(r.t)}</td><td>${sw(r)}</td><td class="n">${hMoney(r.spent)}${r.about ? ' <span class="tg q" title="Over a tenth of it is an estimate: pieces never seen bought">about</span>' : ''}</td><td class="n"><b>${hMoney(r.perSet)}</b></td><td class="n">${hNum(r.points)}</td><td class="n t-muted">${hMoney(r.each)}</td></tr>`).join('');
    const pts = v.points.book.made;
    const foot = made.sets ? `<tr class="sum"><td>All</td><td>${hNum(made.sets)}</td><td class="n">${hMoney(made.spent)}</td><td class="n">${hMoney(made.perSet)}</td><td class="n">${hNum(pts)}</td><td class="n t-muted" style="font-weight:400">${pts ? hMoney(made.spent / pts) : ''}</td></tr>` : '';
    return `<div class="panel" data-k="setsmade"><div class="ph"><h2>Sets you made</h2><span class="sub">what the pieces in them cost you</span></div><div class="pb flush">${rows ? `<table class="t"><thead><tr><th>Swapped</th><th>Sets</th><th class="n">You spent</th><th class="n">A set</th><th class="n">Points</th><th class="n">A point</th></tr></thead><tbody>${rows}${foot}</tbody></table>` : pgNone('No set swapped yet.')}</div></div>`;
}

/**
 * "Selling your points" (1.4.0, drawing AL): what they cost you against the price now and your usual, what selling
 * brings in all and a set, and the lots to list them in - none over your biggest lot (the owner, 2026-10-13: "we
 * dont sell big, i avoid anything bigger than 2k"). Takes the place of "Your break-even" and "Sell N points".
 */
function pgSelling(v) {
    const pt = v.points;
    const sell = pt.sell;
    const ev = pt.even;
    const book = pt.book;
    const set = v.sets[0] || null;
    const per = set ? set.points : 0;
    // A loss is said before "cheap": it is the stronger reason not to sell.
    const badge = sell.loss ? '<span class="badge bad">under your cost</span>' : pt.hold && sell.points ? '<span class="badge ahead">cheap today: hold</span>' : pt.cheap && sell.points ? '<span class="badge ahead">cheap today</span>' : '';
    // Full sets not swapped yet: points still to come, with what a set of them cost you.
    const full = v.sets.filter((s) => s.full > 0).map((s) => `<div class="row"><span class="grow1 t-muted">${hPlural(s.full, `full ${s.label} set`)} not swapped yet · cost ${hMoney(s.cost)} a set${s.costKnown ? '' : ' at your rate'}</span><span class="num t-muted">+${hNum(s.full * s.points)} points</span></div>`).join('');
    const head = `<div class="ph"><h2>${sell.points ? `Selling your ${hNum(sell.points)} points` : 'Selling your points'}</h2><span class="sp"></span>${badge}${hOut(POINTS_MARKET_URL, 'Points market', 'btn sm out')}</div>`;
    if (!sell.points) return `<div class="panel" data-k="selling">${head}<div class="pb"><div class="rows"><div class="row"><span class="grow1 t-muted">No points to sell.</span></div>${full}</div></div></div>`;
    // The scale: what they cost you, the price now, your usual. Under the cost it is red; from the cost to the
    // price now, green.
    const marks = [['They cost you', ev.each, 'var(--text2)'], ['Price now', ev.now, ev.each && ev.now < ev.each ? 'var(--bad)' : 'var(--good)'], [ev.usualFrom === 'sales' ? 'Your usual' : 'Points usually sell at', ev.usual, 'var(--s-gold)']].filter((m) => m[1] > 0);
    const lo = Math.min(...marks.map((m) => m[1]));
    const hi = Math.max(...marks.map((m) => m[1]));
    const pad = Math.max(1, (hi - lo) * 0.2, hi * 0.002);
    const at = (x) => ((x - lo + pad) / (hi - lo + 2 * pad) * 100).toFixed(1) + '%';
    const scale = marks.length > 1 && ev.each ? `<div class="even-b"><s style="--w:${at(ev.each)}"></s>${ev.now > ev.each ? `<i style="--a:${at(ev.each)};--w:calc(${at(ev.now)} - ${at(ev.each)})"></i>` : ''}${marks.map((m) => `<u style="--at:${at(m[1])};--c:${m[2]}"></u>`).join('')}</div><div class="even-k">${marks.map((m) => `<span><i class="key box" style="--c:${m[2]}"></i>${m[0]}<b class="num">${hMoney(m[1])}</b></span>`).join('')}</div>` : '';
    const atPrice = (price, word, tip) => {
        const get = sell.points * price;
        const profit = get - book.cost;
        const cls = profit < 0 ? 't-bad' : 't-good';
        return `<tr><td${tip ? ` title="${tip}"` : ''}><b>${hMoney(price)}</b> <span class="t-muted">${word}</span></td><td class="n">${hMoney(get)}</td><td class="n ${cls}"><b style="color:inherit">${hSigned(profit)}</b></td><td class="n ${cls}">${per ? hSigned(profit / sell.points * per) : ''}</td></tr>`;
    };
    const table = !ev.now ? '<div class="rows"><div class="row"><span class="grow1 t-muted">Points market not read yet.</span></div></div>' : `<table class="t tight flat" style="margin:8px -14px 0;width:calc(100% + 28px)"><thead><tr><th>If you sell at</th><th class="n">You get</th><th class="n">Profit</th><th class="n">Profit per set</th></tr></thead><tbody>
          ${atPrice(ev.now, 'now', `The price Fill types: $1 under the ${pt.rule === 'wall' ? 'first wall' : 'lowest listing'}`)}
          ${ev.usual > 0 && ev.usual !== ev.now ? atPrice(ev.usual, ev.usualFrom === 'sales' ? 'your usual' : 'the usual', '') : ''}
          <tr><td><b>Under ${hMoney(sell.least)}</b></td><td class="n t-muted">under ${hMoney(book.cost)}</td><td class="n t-bad">a loss</td><td class="n t-muted">${per ? `cost ${hMoney(book.each * per)}` : ''}</td></tr></tbody></table>`;
    const each = book.left ? book.cost / book.left : 0;
    const next = sell.next;
    const lots = [
        sell.listed ? `<div class="row"><span class="grow1">On the market now</span><span class="num"><b>${hNum(sell.listed)}</b> points</span></div>` : '',
        sell.lots.length ? `<div class="row"><span class="grow1" title="Yours to change in Settings">In lots, none over ${hNum(pt.lotMax)}</span><b class="num">${lotsWords(sell.lots)}</b></div>` : '',
        next && ev.now ? `<div class="row"><span class="grow1">Next lot: <b class="num">${hNum(next)}</b> at <b class="num">${hMoney(ev.now)}</b></span><span class="num">${hMoney(next * ev.now)} on hand · <span class="${ev.now < each ? 't-bad' : 't-good'}">${hSigned(next * (ev.now - each))}</span>${sell.nextWait != null ? ` <span class="t-muted">· usual wait ${waitWords(sell.nextWait)}</span>` : ''}</span></div>` : '',
    ].join('');
    return `<div class="panel tint${pt.hold ? ' hold' : ''}" data-k="selling">${head}<div class="pb">${scale}${table}<div class="rows" style="margin-top:4px">${lots}${full}</div></div></div>`;
}

/** "Lot sizes that sold": the sizes points are listed in, how many of each left the market, the usual wait, yours. */
function pgLots(v) {
    const pt = v.points;
    const max = Math.max(1, ...pt.table.map((r) => r.lots));
    const rows = pt.table.map((r) => `<tr${r.bigger ? ' class="t-muted"' : ''}><td>${r.bigger ? `Bigger <span class="tg q">over ${hNum(pt.lotMax)}</span>` : `<b>${r.label}</b>`}</td><td><span class="hb-t"><i class="hb" style="--w:${r.lots / max * 100}%${r.bigger ? ';background:var(--faint)' : ''}"></i></span><span class="num">${hNum(r.lots)}</span></td><td class="n">${r.wait == null ? '<span class="t-muted">not seen</span>' : waitWords(r.wait)}</td><td>${r.mine ? hNum(r.mine.n) : '<span class="t-muted">none</span>'}</td></tr>`).join('');
    return `<div class="panel" data-k="lots"><div class="ph"><h2>Lot sizes that sold</h2><span class="sub">${pt.span.lots ? `${hPlural(pt.span.lots, 'lot')} · ${pgSpan(pt.span.ms)}` : 'none seen yet'}</span></div><div class="pb flush"><table class="t tight"><thead><tr><th>Size</th><th>Lots gone</th><th class="n" title="At the front of the market">Usual wait</th><th title="Your own sales, 7 days">Yours</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function pgPoints(d, ui) {
    const v = d.view;
    const pt = v.points;
    const book = pt.book;
    if (ui.pane === 1) {
        // One under the other, each as tall as what it holds: the money, the graph (wide and short), the sets
        // you made, then every entry of the book.
        return `<section class="page p-tabs on"><div class="pane g1 on" style="align-content:start">
        ${pgSetsMoney(v)}
        <div class="panel ch-h" style="--h:230px" data-k="held"><div class="ph"><h2>Points held, made from sets</h2><div class="legend">${pgKey('Sets swapped', 'var(--brand)', 1)}</div><span class="sp"></span><span class="sub">${pt.made.since ? 'since ' + hDay(pt.made.since) : ''}</span></div><div class="pb"><div class="chart" data-chart="held"></div></div></div>
        ${pgSetsMade(v)}
        <div class="panel" data-k="book"><div class="ph"><h2>Points book</h2><span class="sub">every swap, sale and use</span></div><div class="pb flush">${book.rows.length ? `<table class="t"><thead><tr><th>When</th><th>What</th><th class="n">Points</th><th class="n">They cost</th><th class="n">Sold at</th><th class="n">You got</th><th class="n">Profit</th></tr></thead><tbody>${book.rows.map((r) => pgBookRow(v, r)).join('')}</tbody></table>` : pgNone('Empty.')}</div></div>
      </div></section>`;
    }
    return `<section class="page p-tabs on"><div class="pane g11 stk on">
      <div class="col">
        <div class="panel grow minc" style="min-height:220px" data-k="pts2">${pgPtsHead(v, ui, 'pts2')}</div>
        ${pgSelling(v)}
      </div>
      <div class="col">
        <div class="panel grow" data-k="ladder"><div class="ph"><h2>The market now</h2><span class="sub">lowest first</span></div><div class="pb flush"><div class="ladder">${pgLadder(v, 9)}</div></div></div>
        ${pgLots(v)}
      </div></div></section>`;
}

// ---- My prices ---------------------------------------------------------------------------------------------------

function pgVerdict(v) {
    const vd = v.prices.verdict;
    const c = vd.checks;
    const ck = (ok, html) => `<div class="chk ${ok ? '' : 'no'}"><span>${html}</span></div>`;
    const btn = { 'buy-first': '<button class="btn sm" data-act="make-list">The list</button>', 'stay-buy': '<button class="btn sm" data-act="make-list">The list</button>', 'open-now': '<button class="btn sm go" data-act="set" data-id="open" data-v="1">Open the shop</button>' }[vd.state] || '';
    const cheaper = c.cheaper.ok
        ? (c.cheaper.listings ? `${hPlural(c.cheaper.listings, 'listing')} under your price${c.cheaper.listed >= c.cheaper.listings ? ' · <b>on your list</b>' : ''}` : 'Nothing cheaper in a bazaar')
        : `<b>${hPlural(c.cheaper.units, 'piece')}</b> cheaper in a bazaar${v.prices.open ? ' · unbought for 10 minutes' : ''}`;
    return `<div class="verdict"><span class="lamp ${vd.lamp === 'ok' ? '' : 'warn'}"${vd.lamp === 'bad' ? ' style="background:var(--bad);box-shadow:0 0 0 4px rgba(240,96,93,.16)"' : ''}></span><b>${VERDICT_WORDS[vd.state]}</b><span class="sp"></span>${btn}</div>`
        + (vd.state === 'no-price' ? '' : ck(c.leaves.ok, `Profit per ${pgLow(c.leaves.name)} set <b>${hSigned(c.leaves.profit)}</b>${c.leaves.ok ? '' : ` · under your ${hRate(v.prices.least)}%`}`)
            + ck(c.cheaper.ok, cheaper)
            + ck(c.need.ok, c.need.ok ? `Need <b>${hPlural(c.need.units, 'piece')}</b>` : 'Need nothing')
            + ck(c.share.ok, c.share.sets == null ? 'No share limit' : c.share.ok ? `${v.share.max}% share covers <b>${hPlural(c.share.sets, 'more set')}</b>` : `${v.share.max}% share is full`));
}

const PG_THREAD = {
    match: ['ok', 'title matches'],
    open: ['ahead', 'title still says closed'],
    closed: ['ahead', 'title still says open'],
};

/** What the post for the shop as it stands says, and which post you copied last: a line each. */
function pgPostSays(pr) {
    const f = pr.forum.says;
    return f.open ? `Post says <b>${hEsc(f.pct)}%</b> · ${f.struck.length ? `${hPlural(f.struck.length, 'piece')} struck out: ${hEsc(f.struck.join(', '))}` : 'no piece struck out'}` : 'Post says <b>CLOSED FOR NOW</b>';
}
const pgPostCopied = (pr) => { const c = pr.forum.posted; return c ? `Copied: ${c.open ? 'open' : 'closed'} post, ${hWhen(c.at)} TCT` : 'Not copied yet'; };

function pgW3b(d) {
    const w = d.view.prices.w3b;
    const key = (d.keys && d.keys.w3b) || {};
    const busy = d.busy || {};
    let badge = '<span class="badge">no key</span>';
    let body;
    if (!key.set) body = '<div class="row"><span class="grow1">Needs the key you registered on TornW3B</span><button class="btn sm" data-go="settings">Settings</button></div>';
    else if (w.error) { badge = '<span class="badge bad">not read</span>'; body = `<div class="row"><span class="grow1 t-bad">${hEsc(w.error)}</span><button class="btn sm" data-act="w3b" data-v="read">Read again</button></div>`; }
    else if (!w.known) { badge = '<span class="badge">reading</span>'; body = ''; }
    else if (w.matches) { badge = '<span class="badge ok">matches your prices</span>'; body = `<div class="row"><span class="grow1">${d.view.prices.open ? `${w.over.length ? hPlural(w.on, 'piece') : 'Every piece'} on it at ${d.view.prices.paid || hRate(d.view.prices.pct) + '%'}` : 'Nothing on it: shop closed'}</span></div>`; }
    else {
        // Kept by itself, a list that differs is written within two minutes - unless something holds the write.
        const held = w.sync ? String(busy.held || '') : '';
        badge = `<span class="badge ahead" title="Only set pieces are touched: anything else on your list stays as it is">${hPlural(w.diff.set.length + w.diff.remove.length, 'price')} differ</span>`;
        body = `<div class="row"><span class="grow1">${[w.diff.set.length ? `<b>${hNum(w.diff.set.length)}</b> to set` : '', w.diff.remove.length ? `<b>${hNum(w.diff.remove.length)}</b> to take off` : ''].filter(Boolean).join(' · ')}${held ? ` · <span class="t-warn">not sent: ${hEsc(held)}</span>` : ''}</span>${w.sync && !held ? `<span class="t-muted">${busy.w3b ? 'sending' : busy.next > d.view.at ? 'sends at ' + hClock(busy.next) + ' TCT' : 'sends within 2 minutes'}</span>` : `<button class="btn sm go" data-act="w3b" data-v="send"${busy.w3b ? ' disabled' : ''}>Send</button>`}</div>`;
    }
    const ch = key.set ? busy.changed : null;
    const wr = key.set ? busy.wrote : null;
    const byOf = (x) => (x.by === 'by itself' ? 'by itself' : 'on your press');
    if (key.set) {
        body += `<div class="row" data-k="w3b-changed"><span class="grow1">${ch
            ? `Changed <b>${hWhen(ch.at)} TCT</b> <span class="t-muted">· ${byOf(ch)} · ${hEsc(ch.text)}</span>`
            : '<span class="t-muted">Never changed from here</span>'}</span><button class="btn sm" data-act="w3b" data-v="update"${busy.w3b ? ' disabled' : ''}>${busy.w3b ? 'Updating' : 'Update now'}</button></div>`;
    }
    if (wr && !wr.ok) body += `<div class="row"><span class="grow1 t-bad"><b>Refused</b> ${hClock(wr.at)} TCT: ${hEsc(wr.text)}</span></div>`;
    else if (wr && wr.left) body += `<div class="row"><span class="grow1 t-warn">Written · ${hPlural(wr.left, 'price')} still ${wr.left === 1 ? 'differs' : 'differ'} there</span></div>`;
    else if (wr && wr.same) body += `<div class="row"><span class="grow1 t-muted">Checked ${hClock(wr.at)} TCT: nothing to change</span></div>`;
    const sv = d.server && d.server.ownAt > 0 ? d.server.ownAt : 0;
    if (sv && d.server.ownKept === false) body += `<div class="row" data-k="w3b-server"><span class="grow1 t-muted">The shared server keeps only its owner's list</span></div>`;
    else if (sv) body += `<div class="row" data-k="w3b-server"><span class="grow1 t-muted">The shared server has them for Torn Bids · ${hAge(sv, d.view.at)}${d.view.prices.open ? '' : ' · as if open'}</span></div>`;
    if (key.set && w.known && !w.error && w.over.length) body += `<div class="row"><span class="grow1 t-muted">Off while you hold too many: ${hEsc(w.over.join(', '))}</span></div>`;
    const listed = !key.set ? '' : w.listedUntil > d.view.at ? `Buyers see it until ${hDay(w.listedUntil)}` : 'Buyers do not see it';
    return `<div class="panel" data-k="w3b"><div class="ph"><h2>Price list on TornW3B</h2><span class="sp"></span>${badge}</div><div class="pb"><div class="rows">${body}
        ${key.set ? `<div class="field"><span class="f-l" title="TornW3B shows a list for 7 days after a receipt">Keep it at my rate<span>${listed}</span></span>${pgSeg('w3bSync', d.view.settings.w3bSync ? 1 : 0, [[1, 'On'], [0, 'Off']])}</div>` : ''}</div></div></div>`;
}

/** One set on "What you pay sellers", as a row of numbers: its rate today, a set at that rate and its profit, what your own sets cost you, its ceiling, the others. */
function pgRateRow(v, s) {
    const pr = v.prices;
    const o = s.others;
    const mine = v.sets.find((x) => x.key === s.key) || {};
    const color = mine.color || 'var(--muted)';
    const note = s.down ? ` <span class="tg" title="At ${hClock(s.down.at)} TCT, as points fell to ${hMoney(s.down.price)}">down from ${hRate(s.down.from)}%</span>` : s.capped ? ` <span class="tg" title="Its ceiling is under your ${hRate(s.typed)}%">capped</span>` : '';
    return `<tr><td><i class="key box" style="--c:${color}"></i><b>${hEsc(s.label)}</b> <span class="t-muted">${s.points} points</span></td><td class="n"><b>${hRate(s.pct)}%</b>${note}</td><td class="n">${hMoney(s.cost)}</td><td class="n"><b class="${s.ok ? 't-good' : s.profit < 0 ? 't-bad' : 't-warn'}">${hSigned(s.profit)}</b></td><td class="n" title="What the pieces you hold cost you, a set">${mine.costKnown ? hMoney(mine.cost) : '<span class="t-muted">no buy yet</span>'}</td><td class="n" title="The most that keeps your ${hRate(pr.least)}%">${s.cap > 0 ? hRate(s.cap) + '%' : ''}</td><td class="n"${o && o.pieces < o.of ? ` title="On the ${o.pieces} of ${o.of} pieces with a buyer seen"` : ''}>${o ? hRate(o.pct) + '%' + (v.at - o.at >= BID_OLD_MS ? ` <span class="t-muted">${hAge(o.at, v.at)}</span>` : '') : '<span class="t-muted">none seen</span>'}</td></tr>`;
}

/** The hour your prices are fixed for, or why they are not, and the points price they are counted at - one line. */
function pgRateHour(pr) {
    const pt = pr.points;
    const state = !pr.open ? 'Shop closed · prices as if you opened now'
        : !pr.fixed ? (pr.live.ok ? 'Being fixed for the hour' : 'Not fixed yet')
        : pr.fixed.held ? `<b>Held while a trade is open</b> · the hour ended ${hClock(pr.fixed.until)} TCT`
        : `<b title="Points moving changes nothing before then, unless your least profit would be gone">Fixed until ${hClock(pr.fixed.until)} TCT</b>`;
    const from = pt.from === 'usual' ? (pt.usualFrom === 'sales' ? 'What you usually sell for' : 'What points usually sell for') : pr.fixed ? 'The price when they were fixed' : 'The price today';
    const counted = !pt.price ? 'points price not read yet' : `<span title="${from}">counted at ${hMoney(pt.price)} a point</span>${pt.today && pt.today !== pt.price ? ` · ${hMoney(pt.today)} now` : ''}`;
    return `${state} <span class="t-muted">· ${counted}</span>`;
}

function pgPrices(d) {
    const v = d.view;
    const pr = v.prices;
    const at = (r) => Math.max(0, Math.min(100, (r - 99) / 5 * 100));
    const paid = pr.paid || hRate(pr.pct) + '%';
    const th = pr.thread;
    const [tcls, twords] = !th ? ['', 'no thread found']
        : th.check.state === 'rate' ? ['ahead', `title says ${hRate(th.check.says.pct)}%`]
        : th.check.state === 'under' ? ['ahead', `title says ${hRate(th.check.says.pct)}%, you pay ${paid}`]
        : PG_THREAD[th.check.state];
    const capOf = (q) => (pr.sets.find((x) => x.key === q.set) || {}).cap || 0;
    const mkAt = at(pr.cap);
    const many = pr.sets.some((x) => x.pct !== pr.sets[0].pct);
    const shorts = pr.sets.filter((x) => x.short).map((x) => `${hEsc(x.short.name)}: others pay ${hPct(x.short.pct)}, over your ceiling`).join(' · ');
    const table = (set) => '<thead><tr><th>Piece</th><th class="n">Market value</th><th class="n">You pay</th><th class="n">Best other buyer</th><th class="n">Cheapest bazaar</th></tr></thead><tbody>' + v.pieces.filter((q) => q.set === set.key).map((q) => `<tr><td>${pgIco(q)}<b>${hEsc(q.name)}</b></td><td class="n">${hMoney(q.mv)}</td><td class="n"><b>${hMoney(q.pay)}</b></td><td class="n">${q.other ? `<span class="${q.pay > 0 && q.other.price > q.pay ? 't-warn' : 't-muted'}" title="${hEsc(q.other.name)}${capOf(q) > 0 && q.other.pct > capOf(q) ? ' · over your ceiling' : ''}">${hPct(q.other.pct)}</span>` : '<span class="t-muted">none seen</span>'}</td><td class="n">${!q.lowBazaar ? '<span class="t-muted">none</span>' : q.lowBazaar < q.pay ? `<b style="color:var(--warn)" title="Under what you pay">${hMoney(q.lowBazaar)}</b>` : hMoney(q.lowBazaar)}</td></tr>`).join('') + '</tbody>';
    const rateOf = (set) => { const x = pr.sets.find((y) => y.key === set.key); return x ? hRate(x.pct) + '%' : paid; };
    // Three rows, each as tall as what it holds: the rate and whether to open; your list, your thread and the rate's
    // graph; then a price table for each set, side by side. Nothing is as long as the page beside something short.
    return `<section class="page pp on">
    <div class="pp-a">
      <div class="panel tint" data-k="rate"><div class="ph"><h2>What you pay sellers</h2><span class="sp"></span><span class="toggle" data-act="set" data-id="open" data-v="${pr.open ? 0 : 1}" style="cursor:pointer" title="${pr.open ? 'Close the shop' : 'Open the shop'}"><span class="sw-t"${pr.open ? '' : ' style="background:var(--faint)"'}></span><b class="${pr.open ? 't-good' : 't-muted'}">${pr.open ? 'Shop open' : 'Shop closed'}</b></span></div><div class="pb"><div class="pp-r">
        <div>
          <div class="hero">${paid}<small>of market value${many ? ', each set its own' : ''}</small></div>
          <div class="track" style="--w:${at(pr.pct)}%;--at:${mkAt}%"><i></i><span class="knob"></span>${pr.cap ? `<span class="mk${mkAt > 80 ? ' r' : mkAt < 20 ? ' l' : ''}"><span>${pr.sets.length > 1 ? 'the lower ceiling' : 'the ceiling'}</span></span>` : ''}<span class="lo">99%</span><span class="hi">104%</span></div>
          <div class="field" style="border-top:0;padding:0"><span class="f-l" title="The most you pay. A set is paid the lower of it and its own ceiling.">Your rate</span>${pgInput('pct', hRate(pr.pct), 64, '%')}</div>
        </div>
        <div>
          <table class="t tight pp-t"><thead><tr><th>Set</th><th class="n">You pay</th><th class="n">A set at your rate</th><th class="n">Profit per set</th><th class="n">Your sets cost</th><th class="n">Ceiling</th><th class="n">Others pay</th></tr></thead><tbody>${pr.sets.map((x) => pgRateRow(v, x)).join('')}</tbody></table>
          <div class="pp-n">${pgRateHour(pr)}${shorts ? `<br><span class="t-warn">${shorts}</span>` : ''}</div>
        </div>
      </div></div></div>
      <div class="panel" data-k="verdict"><div class="ph"><h2>Open your shop?</h2></div><div class="pb">${pgVerdict(v)}</div></div>
    </div>
    <div class="pp-b">
      ${pgW3b(d)}
      <div class="panel" data-k="thread"><div class="ph"><h2>Forum thread</h2><span class="sp"></span><span class="badge ${tcls}">${twords}</span></div><div class="pb">
        ${pr.forum.behind ? `<div class="ta-hold" data-k="post-behind"><b>Behind.</b> ${pr.forum.behind.words.map(hEsc).join(' ')}</div>` : `<div class="rows"><div class="row"><span class="grow1">${pgPostSays(pr)}</span></div></div>`}
        <div class="pp-btns"><button class="btn${pr.open && pr.forum.behind ? ' go' : ''}" data-act="pop" data-v="post" data-id="open">Open post</button><button class="btn${!pr.open && pr.forum.behind ? ' go' : ''}" data-act="pop" data-v="post" data-id="closed">Closed post</button>${th && th.url ? hOut(th.url, 'Your thread', 'btn out') : ''}<span class="sp"></span><span class="t-muted">${pgPostCopied(pr)}</span></div>
      </div></div>
      <div class="panel minc" data-k="ratechart"><div class="ph"><h2>Profit per set, by rate</h2><div class="legend">${pgSetKeys(v)}</div></div><div class="pb"><div class="chart" data-chart="rate"></div></div></div>
    </div>
    <div class="pp-c" style="--n:${v.sets.length}">
      ${v.sets.map((set) => `<div class="panel" data-k="price-${set.key}"><div class="ph"><h2>${hEsc(set.name)}</h2><span class="sub">you pay ${rateOf(set)}</span><span class="sp"></span><div class="legend">${pgKey('A bazaar under your price', 'var(--warn)', 1)}</div></div><div class="pb flush"><table class="t tight">${table(set)}</table></div></div>`).join('')}
    </div>
  </section>`;
}

// ---- Ledger ------------------------------------------------------------------------------------------------------

const PG_VENUE = { bazaar: 'Bazaar', market: 'Item Market' };
const PG_UNITS = [['hour', 'Hour'], ['day', 'Day'], ['week', 'Week'], ['month', 'Month']];

function pgLedger(d, ui) {
    const v = d.view;
    const lg = v.ledger;
    const sum = lg.sum;
    const wrap = (cls, body, style = '') => `<section class="page p-tabs on"><div class="pane ${cls} on"${style ? ` style="${style}"` : ''}>${body}</div></section>`;
    const one = (k, head, sub, table, none) => wrap('g1', `<div class="panel" data-k="${k}"><div class="ph"><h2>${head}</h2>${sub ? `<span class="sub">${sub}</span>` : ''}</div><div class="pb flush">${table || pgNone(none)}</div></div>`, 'align-content:start');
    if (ui.pane === 1) {
        // `about`: a part of the lot's cost was an estimate (pieces never seen bought). `before`: points of the lot
        // that were yours before the book began - sold, and counted for nothing: shown, so the page adds up to
        // what you received.
        const then = (s) => [s.before ? `<span class="t-muted">+ ${hNum(s.before)} held before: ${hMoney(s.beforeGot)}, not counted</span>` : '', s.mug ? `<span class="t-bad">mugged ${waitWords(s.mug.after)} later: -${hMoney(s.mug.counted)}</span>` : ''].filter(Boolean).join(' · ');
        const rows = lg.sold.map((s) => `<tr><td>${hWhen(s.t)}</td><td class="n"><b>${hNum(s.points)}</b></td><td class="n">${hMoney(s.each)}</td><td class="n">${hMoney(s.got)}</td><td class="n">${s.points ? (s.about ? '<span class="t-muted">about</span> ' : '') + hMoney(s.got - s.gain) : ''}</td><td class="n">${s.points ? `<span class="${s.gain < 0 ? 't-bad' : 't-good'}">${s.about ? 'about ' : ''}${hSigned(s.gain)}</span>` : ''}</td><td>${then(s)}</td></tr>`).join('');
        const all = lg.sold.reduce((a, s) => ({ points: a.points + s.points, got: a.got + s.got, gain: a.gain + s.gain, about: a.about || s.about }), { points: 0, got: 0, gain: 0, about: false });
        const bf = lg.before;
        const foot = (all.points ? `<tr class="sum"><td>Every lot</td><td class="n">${hNum(all.points)}</td><td class="n">${hMoney(all.got / all.points)}</td><td class="n">${hMoney(all.got)}</td><td class="n">${hMoney(all.got - all.gain)}</td><td class="n">${all.about ? 'about ' : ''}${hSigned(all.gain)}</td><td>${lg.mugs.counted ? `less buy-mugs: ${hSigned(all.gain - lg.mugs.counted)}` : ''}</td></tr>` : '')
            + (bf.points ? `<tr><td class="t-muted">Held before, not counted</td><td class="n t-muted">${hNum(bf.points)}</td><td></td><td class="n t-muted">${hMoney(bf.got)}</td><td></td><td></td><td></td></tr><tr class="sum"><td>You received in all</td><td class="n">${hNum(all.points + bf.points)}</td><td></td><td class="n">${hMoney(all.got + bf.got)}</td><td></td><td></td><td></td></tr>` : '');
        return one('sold', 'Every lot of points you sold', all.about ? '"about": part of the cost is an estimate' : '', rows && `<table class="t"><thead><tr><th>When</th><th class="n">Lot</th><th class="n">Sold at</th><th class="n">You got</th><th class="n">They cost</th><th class="n">Profit</th><th>Then</th></tr></thead><tbody>${rows}${foot}</tbody></table>`, 'No points sold yet.');
    }
    if (ui.pane === 6) {
        // Pieces that left as themselves: each its own profit or loss against what it had cost you (1.3.0; until
        // then such a piece left your stock at its average cost and the money was nowhere).
        const where = { bazaar: 'Your bazaar', market: 'Item Market', trade: 'A trade' };
        const dr = lg.direct;
        const rows = dr.rows.map((r) => `<tr><td>${hWhen(r.t)}</td><td>${pgItem(v, r.itemId, r.name)}<b>${hEsc(r.name)}</b></td><td>${r.give ? 'Given away' : where[r.venue] || hEsc(r.venue || '')}</td><td class="n">${hNum(r.qty)}</td><td class="n">${r.give ? '' : hMoney(r.got)}</td><td class="n">${r.est >= BOOK_ABOUT ? '<span class="t-muted">about</span> ' : ''}${hMoney(r.cost)}</td><td class="n">${r.give ? '<span class="t-muted">not counted</span>' : `<span class="${r.gain < 0 ? 't-bad' : 't-good'}">${r.est >= BOOK_ABOUT ? 'about ' : ''}${hSigned(r.gain)}</span>`}</td></tr>`).join('');
        const foot = dr.units ? `<tr class="sum"><td colspan="3">Every piece sold</td><td class="n">${hNum(dr.units)}</td><td class="n">${hMoney(dr.got)}</td><td class="n">${hMoney(dr.cost)}</td><td class="n">${hSigned(dr.gain)}</td></tr>` : '';
        return one('direct', 'Pieces sold as themselves', dr.given ? `${hPlural(dr.given, 'piece')} given away, ${hMoney(dr.givenCost)} of cost · not counted` : '', rows && `<table class="t"><thead><tr><th>When</th><th>Piece</th><th>Where</th><th class="n">Units</th><th class="n">You got</th><th class="n">It had cost</th><th class="n">Profit</th></tr></thead><tbody>${rows}${foot}</tbody></table>`, 'None yet.');
    }
    if (ui.pane === 2) {
        const rows = lg.buys.slice(0, 120).map((b) => `<tr><td>${hWhen(b.t)}</td><td>${pgItem(v, b.itemId, b.name)}<b>${hEsc(b.name)}</b></td><td>${b.venue === 'trade' ? 'Trade with ' + hEsc(b.who || 'a seller') : (PG_VENUE[b.venue] || hEsc(b.venue)) + (b.venue === 'bazaar' && b.who ? ' · ' + hEsc(b.who) : '')}</td><td class="n">${hNum(b.qty)}</td><td class="n">${hMoney(b.each)}</td><td class="n"><b>${hMoney(b.paid)}</b></td><td><span class="t-muted">${b.rate ? hPct(b.rate) : ''}</span></td></tr>`).join('');
        // Where the pieces came from, 14 days: the sum of each place, and the days as rows - in view while the
        // list beside it scrolls.
        const c = lg.where;
        const parts = [{ name: 'Bazaars', color: 'var(--s-gold)' }, { name: 'Item Market', color: 'var(--s-violet)' }, { name: 'Trades with you', color: 'var(--s-aqua)' }];
        const days = pgFromFirst(c.x.map((day, i) => ({ day, parts: [c.bazaar[i], c.market[i], c.trade[i]] })), (k) => k.parts.some(Boolean), 1);
        const sums = [c.bazaar, c.market, c.trade].map((xs) => xs.reduce((a, b) => a + b, 0));
        const total = sums.reduce((a, b) => a + b, 0);
        return wrap('g2', `<div class="panel grow" data-k="buys"><div class="ph"><h2>Every piece you bought</h2></div><div class="pb flush">${rows ? `<table class="t"><thead><tr><th>When</th><th>Piece</th><th>Where</th><th class="n">Units</th><th class="n">Each</th><th class="n">Paid</th><th>Rate</th></tr></thead><tbody>${rows}</tbody></table>` : pgNone('None yet.')}</div></div>
      <div class="panel" data-k="bought"><div class="ph"><h2>Pieces bought, by where</h2><span class="sp"></span><span class="sub">14 days</span></div><div class="pb">
          <div class="ch-sum"><b class="num">${hNum(total)}</b> pieces</div>
          <div class="legend" style="flex-wrap:wrap;gap:4px 14px;margin-bottom:10px">${parts.map((p, i) => `<span><i class="key box" style="--c:${p.color}"></i>${p.name} <b class="num" style="color:var(--text)">${hNum(sums[i])}</b></span>`).join('')}</div>
          ${total ? chRows(days, parts, '') : pgNone('No piece bought in 14 days.')}</div></div>`);
    }
    if (ui.pane === 3) {
        const rows = v.trades.finished.map((f) => `<tr><td>${hWhen(f.t)}</td><td><b>${hOut(hProfileUrl(f.whoId), hEsc(f.who))}</b></td><td class="n">${hNum(f.units)}</td><td class="n"><b>${hMoney(f.paid)}</b></td><td class="n"><span class="t-muted">${f.rate ? hPct(f.rate) : ''}</span></td><td class="n">${pgReceipt(d, f)}</td></tr>`).join('');
        return one('rec', 'Receipts', v.trades.receiptsError ? 'TornW3B does not give your receipts: ' + hEsc(v.trades.receiptsError) : '', rows && `<table class="t"><thead><tr><th>When</th><th>Seller</th><th class="n">Pieces</th><th class="n">You paid</th><th class="n">Rate</th><th></th></tr></thead><tbody>${rows}</tbody></table>`, 'No finished trade yet.');
    }
    if (ui.pane === 4) {
        const rows = lg.sellers.map((s) => `<tr><td><b>${hOut(hProfileUrl(s.whoId), hEsc(s.who || 'Seller ' + s.whoId))}</b></td><td class="n">${hNum(s.trades)}</td><td class="n">${hNum(s.units)}</td><td class="n"><b>${hMoney(s.paid)}</b></td><td>${hEsc(s.brings)}</td><td>${s.came}</td></tr>`).join('');
        return one('sel', 'Sellers', '', rows && `<table class="t"><thead><tr><th>Seller</th><th class="n">Trades</th><th class="n">Units</th><th class="n">You paid</th><th>Mostly brings</th><th>Last came</th></tr></thead><tbody>${rows}</tbody></table>`, 'Nobody has sold to you in a trade yet.');
    }
    if (ui.pane === 5) {
        const sale = (m) => lg.sold.find((s) => s.id === m.saleId);
        const what = (m) => { const s = m.counted ? sale(m) : null; return m.counted ? `${s ? `${hNum(s.points)} points sold at ${hMoney(s.each)} ${waitWords(m.after)} before: ` : ''}${hMoney(m.onHand)} of points money was on hand, not yet banked` : 'No points money on hand'; };
        const rows = lg.mugs.rows.map((m) => `<tr><td>${hWhen(m.t)}</td><td>${hEsc(m.by || 'Someone')}</td><td class="n ${m.counted ? 't-bad' : 't-muted'}">-${hMoney(m.taken)}</td><td>${what(m)}</td><td>${m.counted ? `<span class="badge bad">buy-mug: ${m.counted < m.taken ? hMoney(m.counted) + ' ' : ''}counted</span>` : '<span class="badge">left out</span>'}</td></tr>`).join('');
        return one('mug', 'Mugged', '', rows && `<table class="t"><thead><tr><th>When</th><th>By</th><th class="n">Taken</th><th>What was on hand</th><th title="Counted only when it took points money you had not banked">In the profit</th></tr></thead><tbody>${rows}</tbody></table>`, 'No mug in your log.');
    }
    return wrap('g1', `<div class="tiles" style="--n:5" data-k="tiles">
        <div class="panel tile"><div class="k-l">Points sold</div><div class="k-v">${hMoney(sum.got)}</div><div class="k-s">${sum.points ? `${hNum(sum.points)} points · at ${hMoney(sum.got / sum.points)}` : 'none in 14 days'}</div></div>
        <div class="panel tile"><div class="k-l">You spent on them</div><div class="k-v">${hMoney(sum.cost)}</div><div class="k-s">${sum.points && v.sets[0] ? `${hMoney(sum.cost / sum.points * v.sets[0].points)} a set` : ''}</div></div>
        <div class="panel tile"><div class="k-l">less buy-mugs</div><div class="k-v"${sum.mug ? ' style="color:#ff8a87"' : ''}>${hMoney(-sum.mug)}</div><div class="k-s"><b>${lg.mugs.rows.length - lg.mugs.left}</b> counted · ${lg.mugs.left} left out</div></div>
        <div class="panel tile tint"><div class="k-l">Profit, 14 days</div><div class="k-v ${sum.profit >= 0 ? 'good' : ''}"${sum.profit < 0 ? ' style="color:#ff8a87"' : ''}>${sum.about ? '<small title="Part of the cost behind it is an estimate">about</small> ' : ''}${hSigned(sum.profit)}</div><div class="k-s">${sum.direct ? `of it <b>${hSigned(sum.direct)}</b> from pieces sold as themselves` : 'counted when points sell'}</div></div>
        <div class="panel tile"><div class="k-l">Not sold yet, at ${lg.poolEst || lg.estLeft >= BOOK_ABOUT ? 'about its ' : ''}cost</div><div class="k-v">${hMoney(lg.notSold)}</div><div class="k-s">${hNum(lg.poolUnits)} pieces and ${hNum(lg.notSoldPoints)} points${lg.notSoldWorth ? ` · worth <b>${hMoney(lg.notSoldWorth)}</b> today: <b class="${lg.notSoldDiff < 0 ? 't-bad' : 't-good'}">${hSigned(lg.notSoldDiff)}</b>` : ''}</div></div>
      </div>
      <div class="g2" style="display:grid;gap:12px;min-height:0">
        <div class="panel grow minc" data-k="profit"><div class="ph"><h2>Profit by ${ui.unit}</h2><div class="legend">${pgKey('Points sold', 'var(--good)', 1)}${lg.direct.rows.length ? pgKey('Pieces sold', 'var(--s-violet)', 1) : ''}${lg.mugs.rows.length ? pgKey('Buy-mug', 'var(--bad)', 1) : ''}</div><span class="sp"></span><div class="seg">${PG_UNITS.map(([u, label]) => `<button data-act="unit" data-v="${u}"${ui.unit === u ? ' class="on"' : ''}>${label}</button>`).join('')}</div></div><div class="pb"><div class="chart" data-chart="profit"></div></div></div>
        <div class="col">
          <div class="panel grow minc" data-k="cum"><div class="ph"><h2>Running total</h2><span class="sp"></span><span class="sub">${pgFirstSale(v) ? 'since ' + hDay(pgFirstSale(v)) + ', lot by lot' : ''}</span></div><div class="pb"><div class="chart" data-chart="cum"></div></div></div>
        </div>
      </div>`, 'grid-template-rows:auto minmax(0,1fr)');
}

// ---- Settings ----------------------------------------------------------------------------------------------------

const PG_KEYS = [
    ['limited', 'Limited key', [
        ['Data storage', 'Only in this browser'],
        ['Data sharing', 'Nobody'],
        ['Purpose of use', 'Personal gain: your museum sets and points'],
        ['Key storage and sharing', 'Stored in this browser, not shared'],
        ['Key access level', 'Limited: your inventory, money and open trades; items, the Item Market, the points market'],
    ]],
    ['full', 'Full key', [
        ['Data storage', 'Only time, item, quantity and price. Never the text of the log'],
        ['Data sharing', 'Nobody'],
        ['Purpose of use', 'What you paid, the points you made, sold and used, mugs'],
        ['Key storage and sharing', 'Stored in this browser, not shared'],
        ['Key access level', 'Full: used only for your log'],
    ]],
    ['w3b', 'The key you registered on TornW3B', [
        ['Data storage', 'Only in this browser'],
        ['Data sharing', 'TornW3B only, which already has it: you registered it there'],
        ['Purpose of use', 'Your own price list there, and a receipt for a trade'],
        ['Key storage and sharing', 'Stored in this browser. Sent to TornW3B with those two requests, never in an address'],
        ['Key access level', 'Whatever you registered there. Torn Archive asks Torn nothing with it'],
    ]],
];

function pgKeyBox([kind, title, rows], d) {
    const k = (d.keys && d.keys[kind]) || {};
    // What a key's owner said against it stands on a line of its own: in the badge it was cut off under the next
    // panel. The badge never says "working" while the key is refused (1.3.0, TornW3B's 403).
    const badge = !k.set ? '<span class="badge">not set</span>' : k.error ? '<span class="badge bad">not working</span>' : k.ok ? '<span class="badge ok">working</span>' : '<span class="badge">checking</span>';
    const box = k.set
        ? `<span class="inp key"${k.shown ? ' style="letter-spacing:0;color:var(--text)"' : ''}>${k.shown ? hEsc(k.shown) : '••••••••••••••••'}</span><button class="btn" data-act="key-show" data-v="${kind}">${k.shown ? 'Hide' : 'Show'}</button><button class="btn" data-act="key-forget" data-v="${kind}">Forget</button>`
        : `<input class="inp key" type="password" data-key="${kind}" placeholder="Paste it here" autocomplete="off" spellcheck="false" style="letter-spacing:0"><button class="btn go" data-act="key-save" data-v="${kind}">Save</button>`;
    return `<div class="panel" data-k="key-${kind}"><div class="ph"><h2>${title}</h2><span class="sp"></span>${badge}</div><div class="pb">
          <div style="display:flex;gap:8px">${box}</div>
          ${k.set && k.error ? `<div class="wl-s t-bad" style="padding:8px 0 0">${hEsc(k.error[0].toUpperCase() + k.error.slice(1))}.${kind === 'w3b' ? ' TornW3B is not asked with it again until you change it.' : ''}</div>` : ''}
          <table class="t kv" style="margin-top:10px">${rows.map(([th, td]) => `<tr><th>${th}</th><td>${td}</td></tr>`).join('')}</table>
        </div></div>`;
}

const PG_SERVER_BADGE = { off: ['', 'not set'], alone: ['', 'working alone'], ok: ['ok', 'connected'], idle: ['', 'connecting'], warn: ['ahead', 'no answer'], bad: ['bad', 'refused'] };

/** The shared server: its address and your password for it, and what it last said. The password is never shown again. */
function pgServer(d) {
    const s = d.server || { on: false, level: 'off', now: 'Off. Torn Archive works alone.' };
    const [cls, word] = PG_SERVER_BADGE[s.level] || PG_SERVER_BADGE.off;
    // Built into this copy: nothing to type, and its address is not shown. One typed in an older copy stays, with Forget.
    const box = s.builtIn && !(s.on && !s.own) ? ''
        : s.on
        ? `<div style="display:flex;gap:8px"><span class="inp key" style="letter-spacing:0;color:var(--text)">${hEsc(s.address)}</span><button class="btn" data-act="server-forget">Forget</button></div>`
        // The address on a line of its own: it is long, and is never cut short.
        : `<div style="display:flex"><input class="inp key" type="text" data-server="address" value="${hEsc(s.typed || '')}" placeholder="Its address: https://….workers.dev" autocomplete="off" spellcheck="false" style="letter-spacing:0"></div>
          <div style="display:flex;gap:8px;margin-top:8px"><input class="inp key" type="password" data-server="pass" placeholder="${s.hasPass ? 'Password saved' : 'Your password for it'}" autocomplete="off" spellcheck="false" style="letter-spacing:0"><button class="btn go" data-act="server-save">Save</button></div>`;
    const rows = [['Now', hEsc(s.now)]];
    if (s.msg) rows.push(['', hEsc(s.msg)]);
    if (s.key) rows.push(['Your key there', hEsc(s.key.text)]);
    if (s.split) rows.push(['Your 100 Torn calls a minute', `your apps <b>${s.split.pc}</b> · the server <b>${s.split.server}</b> · never used <b>${s.split.free}</b>`]);
    if (s.on && s.bazaars) rows.push(['Bazaars from it', `<b>${hNum(s.bazaars)}</b> that sell a piece`]);
    rows.push(['What it gives', 'Bazaars, the points market and the Item Market, read from Torn itself with a key of each of you']);
    return `<div class="panel" data-k="server"><div class="ph"><h2>Torn Shared Server</h2><span class="sp"></span><span class="badge ${cls}">${word}</span></div><div class="pb">
          ${box}
          <table class="t kv"${box ? ' style="margin-top:10px"' : ''}>${rows.map(([th, td]) => `<tr><th>${th}</th><td>${td}</td></tr>`).join('')}</table>
        </div></div>`;
}

function pgSettings(d, ui) {
    const v = d.view;
    const s = v.settings;
    const u = d.usage || {};
    if (ui.pane === 1) {
        const n = d.notice;
        return `<section class="page p-tabs on"><div class="pane g1 on" style="grid-template-rows:auto minmax(0,1fr)">
      <div class="tiles" style="--n:3">
        <div class="panel" data-k="sets"><div class="ph"><h2>Sets</h2></div><div class="pb">
          <div class="field"><span class="f-l">Sets to trade</span><span class="seg"><button data-act="which" data-v="plushie"${s.which.plushie ? ' class="on"' : ''}>Plushie</button><button data-act="which" data-v="flower"${s.which.flower ? ' class="on"' : ''}>Flower</button></span></div>
          <div class="field"><span class="f-l" title="From cash: kept as it is while a list is on hand">Sets to build at once</span>${pgSeg('targetMode', s.targetMode, [['cash', 'From my cash and stock'], ['number', 'A number']])}${s.targetMode === 'number' ? pgInput('target', s.target, 56) : ''}</div>
          <div class="field"><span class="f-l">Most of my money in sets and points<span>0 = no limit</span></span>${pgInput('shareMax', s.shareMax, 56, '%')}</div>
          <div class="field"><span class="f-l">Least profit on a set</span>${pgInput('least', hRate(s.least), 56, '%')}</div>
          <div class="field"><span class="f-l">Read prices every</span>${pgSeg('readMin', s.readMin, READ_CHOICES.map((m) => [m, m + ' min']))}</div>
        </div></div>
        <div class="panel" data-k="rules"><div class="ph"><h2>Points</h2></div><div class="pb">
          <div class="field"><span class="f-l">Points price to type</span>${pgSeg('pointsRule', s.pointsRule, [['wall', 'Under the first wall'], ['lowest', 'Under the lowest']])}</div>
          <div class="field"><span class="f-l" title="Your points are listed in lots of the market's sizes, none over this">Biggest lot of points I list</span>${pgInput('lotMax', hNum(s.lotMax), 72, 'points')}</div>
          <div class="field"><span class="f-l">When points are under their usual level</span>${pgSeg('cheapRule', s.cheapRule, [['hold', 'Hold'], ['tell', 'Tell me only']])}</div>
          <div class="field"><span class="f-l" title="You press ADD LISTING">Fill at the points market</span>${pgSeg('fillPoints', s.fillPoints ? 1 : 0, [[1, 'On'], [0, 'Off']])}</div>
        </div></div>
        <div class="panel" data-k="tell"><div class="ph"><h2>Torn's pages</h2></div><div class="pb">
          <div class="field"><span class="f-l" title="You press EXCHANGE">Fill at the museum</span>${pgSeg('fillMuseum', s.fillMuseum ? 1 : 0, [[1, 'On'], [0, 'Off']])}</div>
          <div class="field"><span class="f-l" title="Only on listings the Archive tells you to buy, and never for more than it says">No "Yes" after Buy</span>${pgSeg('noConfirm', s.noConfirm ? 1 : 0, [[1, 'On'], [0, 'Off']])}</div>
          <div class="field f-h"><h2 class="f-l">Tell me when</h2><button class="btn sm" data-act="notify-test">Try it</button></div>
          <div class="field"><span class="f-l" title="Seen within a minute, with a Torn tab or this page open">Someone opens a trade with you</span>${pgSeg('notify', s.notify, [['browser', 'Browser'], ['app', 'In the app'], ['off', 'Off']])}</div>
          <div class="field"><span class="f-l">Sound</span>${pgSeg('sound', s.sound ? 1 : 0, [[1, 'On'], [0, 'Off']])}</div>
          ${n ? `<div class="field" style="display:block"><div class="osn"><span class="mark">${hIcon('brand')}</span><div><b>${hEsc(n.title)}</b><span class="s">${hEsc(n.body)}</span></div></div></div>` : ''}
        </div></div>
      </div>
      <div class="panel grow minc" data-k="share"><div class="ph"><h2>Share of your money in sets and points</h2><span class="sp"></span><span class="sub">now ${hPct(v.share.share)} · 14 days</span></div><div class="pb"><div class="chart" data-chart="share"></div></div></div>
    </div></section>`;
    }
    return `<section class="page p-tabs on"><div class="pane g1 on" style="grid-template-rows:auto minmax(0,1fr)">
      <div class="tiles five">
        ${PG_KEYS.map((k) => pgKeyBox(k, d)).join('')}
        ${pgServer(d)}
        <div class="panel" data-k="help"><div class="ph"><h2>Help</h2><span class="sp"></span><span class="sub">${d.version ? 'Torn Archive ' + hEsc(d.version) : ''}</span></div><div class="pb"><div class="rows">
          <div class="row"><span class="grow1"><b>Report a problem</b> · a zip on your computer, no key in it</span><button class="btn sm go" data-act="zip">Make the zip</button></div>
        </div>
          <table class="t kv" style="margin-top:6px"><tr><th>TornW3B is told</th><td>Item numbers only. The key you registered there goes with your own price list and receipts, nothing else</td></tr><tr><th>The shared server is told</th><td>${d.server && d.server.builtIn ? 'Your Torn id, to know whose copy this is. Then bazaar' : 'Bazaar'} and item numbers, prices and counts. Never a key, your stock or your money</td></tr></table>
        </div></div>
      </div>
      <div class="panel grow minc" data-k="usage"><div class="ph"><h2>Requests a minute</h2><div class="legend">${pgKey('Torn', 'var(--s-plush)')}${pgKey('TornW3B', 'var(--s-flower)')}</div><span class="sub">now Torn <b>${hNum(u.nowTorn)}</b> of ${(d.turns && d.turns.torn) || TORN_PER_MINUTE_ALONE} · TornW3B <b>${hNum(u.nowW3b)}</b> of ${(d.turns && d.turns.w3b) || W3B_PER_MINUTE_ALONE} · refused, last hour <b>${hNum(u.refused)}</b>${pgTurns(d.turns)}</span><span class="sp"></span><button class="btn sm" data-act="usage-export">Export</button></div><div class="pb"><div class="chart" data-chart="usage"></div></div></div>
    </div></section>`;
}

const PG_RENDER = { dashboard: pgDashboard, stock: pgStock, buy: pgBuy, trades: pgTrades, points: pgPoints, prices: pgPrices, ledger: pgLedger, settings: pgSettings };

/** One page as a string. @param d { view, keys, usage, busy, notice, version } @param ui { page, pane, sel, trade, range, unit } */
export const hubPage = (d, ui) => (PG_RENDER[ui.page] || pgDashboard)(d, ui);

// ---- The graphs --------------------------------------------------------------------------------------------------

const pgWeek = (b) => hDay(b.start);
const PG_MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pgSt = (v) => (v === 1 ? 'st' : v === 2 ? 'nd' : v === 3 ? 'rd' : 'th');

/** The points you hold that were made from sets, as it moved: every set swapped and every lot sold, in order. */
function pgHeld(v) {
    const rows = [...v.points.book.rows].sort((a, b) => a.t - b.t);
    const from = rows.findIndex((r) => r.kind === 'made');
    if (from < 0) return null;
    const x = [];
    const data = [];
    const what = [];
    let left = 0;
    for (const r of rows.slice(from)) {
        left += r.kind === 'made' ? r.points : -r.mine;
        if (r.kind !== 'made' && !r.mine) continue;
        x.push(r.t);
        data.push(left);
        what.push(r);
    }
    return { x, data, what };
}

/** Sales by the hour, from the first one to now: half a day at least, two days at most. */
function pgHours(v, now) {
    const sold = v.ledger.sold.filter((s) => s.points > 0);
    if (!sold.length) return null;
    const first = Math.min(...sold.map((s) => s.t));
    const end = Math.floor(now / CH_HOUR) * CH_HOUR;
    const n = chClamp(Math.floor((end - Math.floor(first / CH_HOUR) * CH_HOUR) / CH_HOUR) + 1, 12, 48);
    const x = Array.from({ length: n }, (_, i) => end - (n - 1 - i) * CH_HOUR);
    const gain = x.map(() => 0);
    const lots = x.map(() => 0);
    const pts = x.map(() => 0);
    for (const s of sold) { const i = Math.floor((s.t - x[0]) / CH_HOUR); if (i >= 0 && i < n) { gain[i] += s.gain; lots[i]++; pts[i] += s.points; } }
    const mug = x.map(() => 0);
    for (const mg of v.ledger.mugs.rows || []) { const i = Math.floor((mg.t - x[0]) / CH_HOUR); if (i >= 0 && i < n && mg.counted) mug[i] -= mg.counted; }
    return { x, gain, lots, pts, mug };
}

/** Your first lot of points made from sets that sold: where the record of profit begins (0: none yet). */
const pgFirstSale = (v) => { const sold = v.ledger.sold.filter((s) => s.points > 0); return sold.length ? Math.min(...sold.map((s) => s.t)) : 0; };
/** A record of profit under three days old: its graph opens on hours (the hub chooses that once, then it is yours). */
export const hubYoung = (v) => { const first = pgFirstSale(v); return !first || v.at - first < 3 * CH_DAY; };

/**
 * What one graph draws (1.4.0: the graphs of drawing AJ - a dot a day for a price, steps for a balance, columns
 * with their sum on top for money a period). @returns { kind: 'line' | 'col', cfg } or null when the page has no such graph
 */
export function hubChart(name, d, ui) {
    const v = d.view;
    const plot = (cfg) => ({ kind: 'line', cfg });
    const cols = (cfg) => ({ kind: 'col', cfg });
    const count = (n) => hNum(n);
    if (name === 'pts' || name === 'pts2') {
        const c = v.points.chart;
        const n = ui.range[name] || 40;
        return plot({
            x: c.x.slice(-n), slots: true, xfmt: hDay, none: 'Kept by day from the first read: this fills as the days pass.',
            series: [{ name: 'First wall', color: 'var(--s-gold)', data: c.wall.slice(-n) }, { name: 'Lowest listing', color: 'var(--s-violet)', data: c.low.slice(-n), thin: true }],
            minSpan: 0.01, refs: c.least ? [{ y: c.least, pin: true, name: `They cost you ${hMoney(c.least)}: under this a loss` }] : [],
        });
    }
    if (name === 'margin') {
        const days = v.dash.paysDays;
        return plot({
            x: days.map((p) => hDay(p.day)), slots: true, zero: true, none: 'Kept by day from the first read: this fills as the days pass.',
            series: v.sets.map((s) => ({ name: s.name, color: s.color, data: days.map((p) => p[s.key] || 0) })),
            refs: v.prices.chart.least ? [{ y: v.prices.chart.least, name: `Your least profit, ${hRate(v.prices.least)}%` }] : [],
        });
    }
    if (name === 'depth') {
        const c = v.buy.depth;
        if (!c) return plot({ x: [], series: [], none: 'Too few listings to say how deep the cheap pieces go.' });
        return plot({
            x: c.x.map((k) => 'set ' + hNum(k)), tipx: (lab) => { const k = Number(lab.slice(4).replace(/,/g, '')); return `The ${hNum(k)}${pgSt(k)} set you buy costs`; },
            series: c.series.map((s) => ({ name: s.name, color: s.color, data: s.data })),
            refs: c.value ? [{ y: c.value, name: `A set at today's points price, ${hMoney(c.value)}` }, { y: c.safe, name: `With your least profit, ${hMoney(c.safe)}: buy while under this` }] : [],
        });
    }
    if (name === 'held') {
        const h = pgHeld(v);
        if (!h) return plot({ x: [], series: [], none: 'Empty until a set is swapped.' });
        // Sets swapped close together are named once, with their sum.
        const made = [];
        h.what.forEach((r, i) => { if (r.kind !== 'made') return; const lastM = made[made.length - 1]; if (lastM && r.t - h.x[lastM.i] < (v.at - h.x[0]) * 0.012) { lastM.sum += r.points; lastM.i = i; lastM.y = h.data[i]; } else made.push({ i, y: h.data[i], sum: r.points }); });
        return plot({
            x: h.x, xb: v.at, time: true, zero: true, yfmt: count, min: 1,
            series: [{ name: 'Points held', color: 'var(--s-gold)', data: h.data, step: true, from: 0, area: true }],
            events: made.map((e) => ({ i: e.i, y: e.y, label: '+' + hNum(e.sum), color: 'var(--brand)' })),
            tip: (i) => { const r = h.what[i]; return `<h4>${hWhen(r.t)}</h4><div>${r.kind === 'made' ? 'Sets swapped' : r.kind === 'sold' ? 'A lot sold' : 'Used by you'}<b>${r.kind === 'made' ? '+' + hNum(r.points) : '-' + hNum(r.mine)}</b></div><div><i class="key" style="--c:var(--s-gold)"></i>Held after it<b>${hNum(h.data[i])}</b></div>`; },
        });
    }
    if (name === 'profit') {
        const none = 'Counted when points sell: none sold yet.';
        if (ui.unit === 'hour') {
            const h = pgHours(v, v.at);
            if (!h) return cols({ x: [], series: [{ data: [] }], none });
            return cols({
                x: h.x.map((t) => (new Date(t).getUTCHours() === 0 ? hDay(t) : hClock(t))), strong: h.x.map((t) => new Date(t).getUTCHours() === 0), yfmt: hShort, topfmt: hShort,
                tipx: (i) => hWhen(h.x[i]) + ' to ' + hClock(h.x[i] + CH_HOUR), more: (i) => (h.lots[i] ? `<div>${hPlural(h.lots[i], 'lot')}<b>${hNum(h.pts[i])} points</b></div>` : ''),
                series: [{ name: 'Points sold', color: 'var(--good)', data: h.gain }, { name: 'Buy-mug', color: 'var(--bad)', data: h.mug }],
            });
        }
        const all = ui.unit === 'week' ? v.ledger.weeks : ui.unit === 'month' ? v.ledger.months : v.ledger.days;
        const b = pgFromFirst(all, (k) => k.profit || k.sold || k.mug, ui.unit === 'day' ? 7 : 4);
        const x = b.map((k) => (ui.unit === 'month' ? PG_MONTH[new Date(k.start).getUTCMonth()] : ui.unit === 'week' ? pgWeek(k) : hDay(k.day)));
        const direct = v.ledger.direct.rows.length ? [{ name: 'Pieces sold', color: 'var(--s-violet)', data: b.map((k) => k.direct) }] : [];
        return cols({ x, yfmt: hShort, topfmt: hShort, none, series: [{ name: 'Points sold', color: 'var(--good)', data: b.map((k) => k.sold) }, ...direct, { name: 'Buy-mug', color: 'var(--bad)', data: b.map((k) => k.mug) }] });
    }
    if (name === 'cum') {
        const sold = [...v.ledger.sold].filter((s) => s.points > 0).sort((a, b) => a.t - b.t);
        if (!sold.length) return plot({ x: [], series: [], none: 'Counted when points sell: none sold yet.' });
        let sum = 0;
        const data = sold.map((s) => (sum += s.gain));
        return plot({
            x: sold.map((s) => s.t), xb: v.at, time: true, zero: true, yfmt: hShort, min: 1,
            series: [{ name: 'Profit so far', color: 'var(--good)', data, step: true, from: 0, area: true }],
            tip: (i) => `<h4>${hWhen(sold[i].t)}</h4><div>This lot<b>${hSigned(sold[i].gain)}</b></div><div><i class="key" style="--c:var(--good)"></i>Profit so far<b>${hMoney(data[i])}</b></div>`,
        });
    }
    if (name === 'rate') {
        const c = v.prices.chart;
        if (!c.least) return plot({ x: [], series: [], none: 'Waiting for prices.' });
        return plot({
            x: c.x, xticks: c.x.map((r, i) => i).filter((i) => c.x[i] === Math.round(c.x[i])), xfmt: (r) => r + '%', tipx: (r) => `Paying ${r}% of market value`, zero: true, ends: false,
            series: c.series.map((s) => ({ name: s.name, color: s.color, data: s.data, dots: false, end: false })),
            refs: [{ y: c.least, name: `Your least profit, ${hRate(v.prices.least)}%` }],
            mark: { x: v.prices.pct, name: `Your rate, ${hRate(v.prices.pct)}%`, fmt: hSigned },
        });
    }
    if (name === 'share') {
        const days = v.share.days;
        return plot({ x: days.map((k) => hDay(k.day)), slots: true, zero: true, yfmt: (n) => n + '%', none: 'Kept by day from the first read: this fills as the days pass.', series: [{ name: 'In sets and points', color: 'var(--s-violet)', data: days.map((k) => k.share), area: true }], refs: v.share.max ? [{ y: v.share.max, name: `Your limit, ${v.share.max}%` }] : [] });
    }
    if (name === 'usage') {
        const u = d.usage || {};
        const x = (u.torn || []).map((_, i) => i);
        const last = x.length - 1;
        return plot({ x, xfmt: (i) => (last - i ? (last - i) + ' min ago' : 'now'), xticks: x.filter((i) => (last - i) % 10 === 0), zero: true, yfmt: count, none: 'No request yet.', series: [{ name: 'Torn', color: 'var(--s-plush)', data: u.torn || [], dots: false, thin: true, endName: 'Torn' }, { name: 'TornW3B', color: 'var(--s-flower)', data: u.w3b || [], dots: false, thin: true, endName: 'TornW3B' }], refs: [{ y: TORN_PER_MINUTE_ALONE, name: `Limit when alone: Torn ${TORN_PER_MINUTE_ALONE}, TornW3B ${W3B_PER_MINUTE_ALONE}` }] });
    }
    return null;
}
