// The hub's pages, as strings, from the view. Nothing here reads the page or stores anything: a page is a function
// of (what the engine holds, what you have pressed on the hub). The shell puts the string in and patches what changed.
// Every part that can change carries data-k: the shell swaps only the parts whose string differs.
// A press is a data-act (with data-v, data-id); a page to go to is data-go (with data-pane).

import { hEsc, hNum, hMoney, hSigned, hShort, hPct, hRate, hPlural, hWhen, hDay, hClock, hAge, hIcon, hPic, hOut, hProfileUrl } from './fmt.js';
import { sparkSvg } from './charts.js';
import { SET_LOOK, viewPiece } from '../core/view.js';
import { marginWords } from '../core/margin.js';
import { VERDICT_WORDS } from '../core/verdict.js';
import { TURN_WORDS } from '../core/trades.js';
import { lotsWords, waitWords } from '../core/lots.js';
import { placeOf, lineKey, imShares, IM_PLACE } from '../core/shopping.js';
import { bazaarUrl } from '../core/feed.js';
import { itemMarketUrl, MUSEUM_URL, POINTS_MARKET_URL, tradeViewUrl } from '../sources/route.js';
import { TORN_PER_MINUTE_ALONE, W3B_PER_MINUTE_ALONE } from '../core/turns.js';
import { READ_CHOICES } from '../core/settings.js';

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
    if (page === 'ledger') return ['Profit', 'Points sold', 'Buys', 'Receipts', 'Sellers', 'Mugged'];
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
// Every "leaves" is worked out before any fee the points market may take: said once on a screen that shows one.
const PG_FEE = 'before any fee';

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
    low: (c) => `a set leaves ${hSigned(c.leaves.profit)}: under your least profit`,
    full: () => 'nothing needed',
    share: () => 'your share for sets is full',
    'buy-first': (c) => `buy ${hPlural(c.cheaper.units, 'piece')} first`,
    'open-now': (c) => `worth opening: a set leaves <b>${hSigned(c.leaves.profit)}</b>`,
    stay: (c) => `worth it: a set leaves <b>${hSigned(c.leaves.profit)}</b>`,
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
    if (t.kind === 'swap') return row(tone.brand, ic('brand'), `<b>Swap ${hPlural(t.n, 'set')}.</b> ${hNum(t.points)} points.`, hOut(MUSEUM_URL, 'Museum', 'btn sm out'));
    if (t.kind === 'hold') return row(tone.warn, ic('points'), `<b>Hold your points.</b> Under the usual ${hMoney(t.usual)}.`, '<button class="btn sm" data-go="points">Points</button>');
    if (t.loss) return row(tone.warn, ic('points'), `<b>Your ${hNum(t.n)} points would sell at a loss.</b> They cost you ${hMoney(t.each)} each, the market pays ${hMoney(t.price)}.`, '<button class="btn sm" data-go="points">Points</button>');
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
    if (t.kind === 'hot' || t.kind === 'buy') return head(t.kind === 'hot' ? 'Where' : 'The first stops', 'Pieces', t.kind === 'hot' ? 'Under your sellers' : 'Under their worth') + (t.first || []).map((s) => line(`<b>${s.im ? 'Item Market' : hEsc(s.who || 'Bazaar ' + (s.whoId ?? ''))}</b>`, hNum(s.units), `<span class="t-good">${hSigned(s.gain)}</span>`)).join('');
    if (t.kind === 'swap') return head('Full sets', 'Sets', 'Points') + v.sets.filter((s) => s.full).map((s) => line(`<b>${hEsc(s.label)} Set</b>`, hNum(s.full), hNum(s.full * s.points))).join('');
    if (t.kind === 'hold') return '';
    const sell = v.points.sell;
    return head('At this price', '', '') + line('You get', '', hMoney(sell.lands)) + line('Over what they cost you', '', `<span class="${sell.profit >= 0 ? 't-good' : 't-warn'}">${hSigned(sell.profit)}</span>`);
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
        return `<div class="sky"><div class="sky-h"><b>${s.label} Set</b>${s.full} full</div><div class="sky-b">${s.pieces.map((p, i) => `<i class="sky-c ${p.state === 'ok' ? '' : p.state}" style="--h:${p.held / max * 100}%;--n:${i}" title="${hEsc(p.name)}: ${p.held}${p.need ? ', need ' + p.need : p.ahead ? ', ' + p.ahead + ' ahead' : ', enough'}"></i>`).join('')}<div class="sky-l" style="--at:${s.target / max * 100}%"><span>${s.target}</span></div></div><div class="sky-f">Shortest: <b>${hEsc(first.short)} ${first.held}</b></div></div>`;
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
    const seg = (name) => `<div class="seg">${[7, 30, 40].map((n) => `<button data-act="range" data-id="${name}" data-v="${n}"${ui.range[name] === n ? ' class="on"' : ''}>${n} days</button>`).join('')}</div>`;
    return `<section class="page p-dash on">
    <div class="kpis" data-k="kpis">
      <div class="panel kpi"><div class="k-l">Full sets ready</div><div class="k-v">${hNum(v.dash.full)}</div><div class="k-s">${v.sets.map((s) => `<b>${s.full}</b> ${pgLow(s.label)}`).join(' · ')}</div></div>
      <div class="panel kpi"><div class="k-l">A set pays now</div><div class="k-v ${pays[0] && pays[0].pays > 0 ? 'good' : ''}">${pays[0] ? paysLine(pays[0]) : 'no set'}</div><div class="k-s">${pays[0] ? pgLow(pays[0].label) : ''}${pays[1] ? ` · ${pgLow(pays[1].label)} <b>${paysLine(pays[1])}</b>` : ''}</div></div>
      <div class="panel kpi"><div class="k-l">Points held</div><div class="k-v">${v.dash.pointsHeld == null ? 'not read' : hNum(v.dash.pointsHeld)}</div><div class="k-s"><b>${hNum(v.dash.made)}</b> made from sets</div></div>
      <div class="panel kpi"><div class="k-l">Profit, 7 days</div><div class="k-v ${v.dash.profit7 >= 0 ? 'good' : ''}"${v.dash.profit7 < 0 ? ' style="color:#ff8a87"' : ''}>${hSigned(v.dash.profit7)}</div><div class="k-s">today <b>${hSigned(v.dash.today)}</b></div></div>
      <div class="panel kpi"><div class="k-l">Your shop</div><div class="k-v ${v.shop.open ? 'good' : ''}">${v.shop.open ? 'Open' : 'Closed'}</div><div class="k-s">${PG_SHOP_LINE[v.shop.state](v.prices.verdict.checks)}</div></div>
    </div>
    <div class="panel s8" data-k="pts">
      <div class="ph"><h2>Points price</h2><div class="legend">${pgKey('First wall', 'var(--s-gold)')}${pgKey('Lowest listing', 'var(--s-violet)')}</div><span class="sp"></span>${seg('pts')}</div>
      <div class="pb"><div class="chart" data-chart="pts"></div></div>
    </div>
    <div class="panel s4 tint" data-k="todo">
      <div class="ph"><h2>Do now</h2></div>
      <div class="pb todo">${pgTodoList(v)}</div>
    </div>
    <div class="panel s4" data-k="margin">
      <div class="ph"><h2>What a set pays</h2><div class="legend">${pgSetKeys(v)}</div><span class="sp"></span><span class="sub">${PG_FEE}</span></div>
      <div class="pb"><div class="chart" data-chart="margin"></div></div>
    </div>
    <div class="panel s4" data-k="sky">
      <div class="ph"><h2>Stock</h2><div class="legend">${pgKey('Need', 'var(--need)', 1)}${pgKey('Enough', '#4a5263', 1)}${pgKey('Ahead', 'var(--warn)', 1)}</div><span class="sp"></span><button class="btn sm" data-go="stock">Stock</button></div>
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
        return `<div class="pc ${p.state === 'ok' ? '' : p.state} ${i === 0 && p.need ? 'first' : ''}" style="--n:${i}" data-act="pick" data-id="${p.id}" title="Where to buy ${hEsc(p.name)}"><div class="pc-in"><div class="pc-h">${pgIco(p, 'xl')}<span class="pc-s">${p.need ? 'need ' + p.need : p.ahead ? p.ahead + ' ahead' : 'enough'}</span></div><div class="pc-n">${hEsc(p.short)}</div><div class="pc-q"><b class="num">${p.held}</b>of ${p.target}</div>
      <div class="pc-x"><div class="pc-k"><span><span class="w">Cheapest now</span><span class="n">Cheapest</span></span><b class="num ${low && low.price < p.pay ? 't-brand' : ''}">${low ? hMoney(low.price) : 'none'}</b></div><div class="pc-k"><span><span class="w">Worth to you</span><span class="n">Worth</span></span><b class="num">${hMoney(p.worth)}</b></div>${low ? `<div class="pc-k"><span><span class="w">${gap > 0 ? 'Under its worth' : 'Over its worth'}</span><span class="n">${gap > 0 ? 'Under worth' : 'Over worth'}</span></span><b class="num ${gap > 0 ? 't-good' : 't-muted'}">${gap > 0 ? hSigned(gap) : hMoney(-gap)}</b></div>` : ''}</div>
      <div class="pc-bar"><i style="--w:${Math.min(100, p.target ? p.held / p.target * 100 : 0)}%"></i></div></div></div>`;
    }).join('');
    const act = `<div class="pc act"><div class="pc-in"><span><b class="pc-big num">${s.full}</b><b style="color:var(--text)">full ${s.full === 1 ? 'set' : 'sets'}</b> · ${hNum(s.full * s.points)} points</span>${hOut(MUSEUM_URL, 'Museum', 'btn sm go out')}</div></div>`;
    return `<div class="panel grow" data-k="set-${s.key}"><div class="ph"><h2>${hEsc(s.name)}</h2><span class="sub"><b>${s.full}</b> full · building <b>${s.target}</b> · <b>${hMoney(s.cost)}</b> a set${s.costKnown ? '' : ' at your rate'}</span></div>
        <div class="pb"><div class="pgrid" style="grid-template-columns:repeat(${Math.ceil((s.pieces.length + 1) / 2)},minmax(0,1fr))">${tiles}${act}</div></div></div>`;
}

function pgStock(d) {
    const v = d.view;
    return `<section class="page g2 on">
    <div class="col">${v.sets.map((s) => pgStockSet(v, s)).join('')}</div>
    <div class="col">
      <div class="panel" data-k="flow"><div class="ph"><h2>From pieces to money</h2></div><div class="pb"><div class="flow">
        <div class="fl"><div class="k-l">Pieces held</div><div class="k-v">${hNum(v.stock.units)}</div><div class="k-s">${v.stock.est ? 'about ' : ''}${hShort(v.stock.cost)} paid</div></div>
        <div class="fl"><div class="k-l">Full sets</div><div class="k-v">${hNum(v.nav.full)}</div></div>
        <div class="fl"><div class="k-l">Points held, made from sets</div><div class="k-v">${hNum(v.stock.made)}</div></div>
        <div class="fl"><div class="k-l">Points sold, 14 days</div><div class="k-v">${hNum(v.stock.sold14)}</div></div>
      </div></div></div>
      <div class="panel grow minc" style="min-height:160px" data-k="swapped"><div class="ph"><h2>Sets swapped</h2><div class="legend">${pgSetKeys(v, 1)}</div></div><div class="pb"><div class="chart" data-chart="swapped"></div></div></div>
    </div>
  </section>`;
}

// ---- Buy ---------------------------------------------------------------------------------------------------------

const pgNeedBadge = (p) => (p.need ? `<span class="badge need">need ${p.need}</span>` : p.ahead ? `<span class="badge ahead">${p.ahead} ahead</span>` : '<span class="badge">enough</span>');
const pgFullWords = (v, full) => v.sets.map((s) => `${pgLow(s.label)} <b>${s.full}</b> to <b>${full[s.key]}</b>`).join(' · ');
const pgGap = (gap) => (gap > 0 ? `<span class="t-good">${hSigned(gap)}</span>` : `<span class="t-muted">${hMoney(-gap)} over</span>`);
/** "Buy from": the places a list may send you to. Both lit until you press one off. */
const pgFrom = (v) => `<span class="from"><span class="t-muted">Buy from</span><span class="seg"><button data-act="from" data-v="bazaar"${v.buy.from.bazaar ? ' class="on"' : ''}>Bazaars</button><button data-act="from" data-v="market"${v.buy.from.market ? ' class="on"' : ''}>Item Market</button></span></span>`;
const pgSeller = (p, o) => (o.src === 'market' ? hOut(itemMarketUrl(p.id, p.name), 'Item Market') : hOut(bazaarUrl(o.whoId, p.id, o.price), `<b>${hEsc(o.who || 'Bazaar ' + (o.whoId ?? ''))}</b>`));

function pgWhere(v, p, lines) {
    if (!p) return '';
    const hist = sparkSvg(p.hist, 'var(--muted)', 54, 20);
    const under = p.offers.filter((o) => o.ok !== false && !o.out && o.price < p.worth);
    const shown = p.offers.slice(0, 14);
    // Rows of a place you do not buy from ("Buy from") come after the ones you do, with no Add.
    const firstOut = shown.findIndex((o) => o.out && o.ok !== false);
    // Rows not looked at lately come after the checked ones (core/view.js), under a line that says what they are.
    const firstOld = shown.findIndex((o) => o.ok === false);
    // The Item Market is one line for all its rows: each row says its own part of it, cheapest first.
    const imLine = lines.get(lineKey(p.id, IM_PLACE));
    const want = Math.max(0, p.need - p.listed);
    const imPart = imShares(shown.map((o) => (o.src === 'market' ? o : { price: 0, qty: 0 })), p.worth, imLine ? imLine.q : want);
    const rows = shown.map((o, k) => {
        const im = o.src === 'market';
        const key = lineKey(p.id, placeOf(o));
        const on = im ? (imLine && imPart[k] ? { q: imPart[k] } : null) : lines.get(key);
        const q = im ? (imLine ? 0 : imPart[k]) : Math.min(o.qty, want);
        const btn = on ? `<button class="btn sm" data-act="cart" data-id="${p.id}" data-v="${hEsc(placeOf(o))}" title="Take it off the list">${on.q} on list ✓</button>` : o.out ? '' : o.price < p.worth && q ? `<button class="btn sm go" data-act="cart" data-id="${p.id}" data-v="${hEsc(placeOf(o))}">Add ${q}</button>` : '';
        // Torn's own answer, or TornW3B's older copy of that bazaar: said on the row, with its age.
        const how = o.from === 'w3b' ? "TornW3B's copy of this bazaar: Torn itself has not been asked yet" : o.from === 'page' ? 'Seen on its own page, in your Torn tab' : 'Read from Torn itself';
        const age = o.at ? `<span class="n num ${o.ok === false || o.from === 'w3b' ? 't-warn' : 't-muted'}" title="${how}">${o.from === 'w3b' ? 'TornW3B · ' : ''}${hAge(o.at, v.at).replace(' ago', '')}</span>` : '<span></span>';
        const split = k === firstOld ? `<div class="wl-s old-h">Not checked in the last 5 minutes${firstOld ? '' : ': nothing here is'}. These are not counted until Torn has been asked${v.buy.check && v.buy.check.length ? ': it is being asked now' : ''}.</div>` : '';
        const left = k === firstOut ? `<div class="wl-s old-h">${im ? 'The Item Market' : 'Bazaars'}: not where you buy now, so not counted. "Buy from" switches ${im ? 'it' : 'them'} back on.</div>` : '';
        return `${left}${split}<div class="wl ${o.ok === false || o.out ? 'old' : ''} ${o.price < p.pay ? 'cheap' : ''} ${on ? 'on' : ''}"><span>${pgSeller(p, o)}</span><span class="n num">×${hNum(o.qty)}</span><b class="n num">${hMoney(o.price)}</b><span class="n num">${pgGap(p.worth - o.price)}</span>${age}<span class="wl-a">${btn}</span></div>`;
    }).join('');
    const u = p.under.units;
    const foot = (under.length ? `<b>${hNum(u)}</b> under its worth in ${hPlural(p.under.places, 'place')}` : 'Nowhere under its worth now')
        + (!p.need ? '. You have enough of it.' : !under.length ? '.' : u >= p.need ? `: covers the ${p.need} you need.` : `. The other ${p.need - u} come from your sellers.`)
        + (p.offers.some((o) => o.price < p.pay) ? ' Violet: cheaper than you pay sellers.' : '');
    // One press for the whole piece: everything counted above, cheapest first. With all of it on, the press takes it off.
    const all = p.more ? `<button class="btn sm go" data-act="cart-all" data-id="${p.id}" title="Every listing of it under its worth, cheapest first">Add all ${hNum(p.more)}</button>` : p.listed ? `<button class="btn sm" data-act="cart-all" data-id="${p.id}" title="Take ${hEsc(p.name)} off the list">Take all ${hNum(p.listed)} off</button>` : '';
    return `<div class="ph">${pgIco(p, 'lg')}<h2>${hEsc(p.name)}</h2>${pgNeedBadge(p)}<span class="sp"></span>${hist ? `<span class="sub">7 days</span>${hist}` : ''}</div><div class="pb flush">
    <div class="wl-s">Worth <b>${hMoney(p.worth)}</b> to you · you pay sellers <b>${hMoney(p.pay)}</b></div>
    ${p.offers.length ? `<div class="wl h"><span>Sold by</span><span class="n">Stock</span><span class="n">Price</span><span class="n">Under its worth</span><span class="n">Checked</span><span class="wl-a">${all}</span></div>${rows}` : pgNone('Nobody lists it now.')}
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
            if (piece) return `<div class="runbar"><span><b>Stop ${at + 1} of ${S.length}:</b> the Item Market, a page for each piece. ${hNum(run.got)} of ${hNum(run.units)} bought so far.</span>${hOut(itemMarketUrl(piece.id, piece.name), `Next: ${hEsc(piece.name)}, its Item Market page<span class="kbd">N</span>`, 'btn go', `data-act="im-walk" data-v="${hEsc(piece.key)}"`)}<button class="btn sm link" data-act="run" data-v="stop">Stop the run</button></div>`;
        }
        const btn = next ? hOut(pgStopUrl(next), `Next: ${pgPlace(next)}<span class="kbd">N</span>`, 'btn go', 'data-act="run" data-v="next"') : '<button class="btn go" data-act="run" data-v="next">Done: back to the list<span class="kbd">N</span></button>';
        return `<div class="runbar"><span><b>Stop ${at + 1} of ${S.length}:</b> ${pgPlace(S[at])}. ${hNum(run.got)} of ${hNum(run.units)} bought so far.</span>${btn}<button class="btn sm link" data-act="run" data-v="stop">Stop the run</button></div>`;
    }
    if (run.began) return `<div class="runbar"><span><b>Run done.</b> ${hNum(run.got)} of ${hNum(run.units)} bought${run.skipped ? `. ${hPlural(run.skipped, 'stop')} skipped: still on the list` : ''}.</span>${hOut(pgStopUrl(S[0]), 'Start again', 'btn sm', 'data-act="run" data-v="start"')}</div>`;
    return `<div class="runbar"><span>One press opens one bazaar, with your pieces marked. <b>Next</b> opens the one after it.</span>${hOut(pgStopUrl(S[0]), `Start: open ${pgPlace(S[0])}`, 'btn go', 'data-act="run" data-v="start"')}</div>`;
}

const PG_STOP_WORDS = {
    cur: (s) => 'you are here' + (s.took ? ` · took ${s.took} of ${s.units}` : ''),
    done: (s) => `took ${s.took} of ${s.units} ✓`,
    part: (s) => `took ${s.took} of ${s.units}`,
    skip: () => 'skipped · still on the list',
};

/**
 * How fresh your stock count is, said where you are about to buy on it. Torn counts your items once an hour;
 * between its counts yours is carried by what you buy and swap.
 */
function pgStockAge(v) {
    const st = v.top.stock;
    if (!st || !st.readAt) return 'Your items have not been read from Torn yet.';
    const now = Date.now();
    const from = st.log ? 'your log and the pages you buy on' : 'the pages you buy on';
    const since = st.since ? ` ${hPlural(st.since, 'piece')} changed since: counted from ${from}.` : '';
    const key = st.log ? '' : ` <span class="t-warn">No Full key: a buy made where Torn Archive is not on the page shows only at Torn's next count.</span>`;
    if (st.tornAt) return `<b>Torn counted your items at ${hClock(st.tornAt)}</b> (${hAge(st.tornAt, now)}) and counts again at ${hClock(st.nextAt)}: it is asked then.${since}${key}`;
    return `Your items were read from Torn ${hAge(st.readAt, now)}. Torn counts them once an hour; what you buy in between is counted from ${from}.${key}`;
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
        const list = !S.length ? pgNone('Nothing on the list. Press Add on a listing, or Fill my stock.') : S.map((s, i) => {
            const cls = s.state === 'part' ? 'done' : s.state;
            return `<div class="stop ${cls}"><span class="stop-n">${s.state === 'done' ? '✓' : i + 1}</span><div class="stop-m"><div class="stop-h">${hOut(pgStopUrl(s), `<b>${s.im ? 'Item Market' : hEsc(s.who || 'A bazaar') + "'s bazaar"}</b>`)}<span class="stop-st">${s.state ? PG_STOP_WORDS[s.state](s) : ''}</span><span class="sp"></span><b class="num">${hMoney(s.cost)}</b><span class="${s.margin.ok ? 't-good' : 't-warn'} num">${marginWords(s.margin)}</span></div><div class="chips">${s.lines.map((l) => `<span class="chip">${pgItem(v, l.id, l.name)}<span><b>${hEsc((viewPiece(v, l.id) || {}).short || l.name)}</b> ×${l.q}</span><span class="num t-muted">${hMoney(l.price)}</span><button class="x" data-act="drop" data-v="${hEsc(l.key)}" title="Take it off the list">×</button></span>`).join('')}</div></div></div>`;
        }).join('');
        const vault = v.buy.vault == null ? '' : v.buy.vault > 0 ? `<span class="grow1 t-warn">On hand ${hMoney(v.top.onHand)}: take ${hMoney(v.buy.vault)} out of the vault first. <span class="t-muted">You press Buy yourself.</span></span>` : `<span class="grow1 t-muted">On hand ${hMoney(v.top.onHand)} covers it. You press Buy yourself.</span>`;
        const onList = v.pieces.filter((p) => p.listed);
        return `<section class="page p-buy on"><div class="pane gbuy stk on">
      <div class="panel grow" data-k="list"><div class="ph"><h2>Shopping list</h2><span class="sub">${v.buy.units ? `${hPlural(v.buy.units, 'piece')} · ${hPlural(S.length, 'stop')}` : 'empty'}</span><span class="sp"></span>${pgFrom(v)}<button class="btn sm" data-act="make-list">Fill my stock</button><button class="btn sm" data-act="clear-list">Clear</button></div><div class="pb flush">${list}</div></div>
      <div class="col">
        <div class="panel tint" data-k="run"><div class="ph"><h2>The run</h2><span class="sub">Next counts only what you took</span></div><div class="pb"><div class="rows">${pgRunBar(v, ui)}
          <div class="row"><span class="grow1">${hPlural(v.buy.units, 'piece')} at ${hPlural(S.length, 'stop')}</span><b class="num">${hMoney(v.buy.cost)}</b>${paid ? `<span class="num t-good">leaves ${hSigned(leaves)}, ${hPct(leaves / paid * 100)} ${PG_FEE}</span>` : ''}</div>
          <div class="row"><span class="grow1">Full sets after</span><b class="num" style="font-weight:500">${pgFullWords(v, v.buy.full)}</b></div>
          ${vault ? `<div class="row">${vault}</div>` : ''}
          <div class="row"><span class="grow1 t-muted">${pgStockAge(v)}</span></div></div></div></div>
        <div class="panel grow" data-k="list-after"><div class="ph"><h2>Your stock after the list</h2><div class="legend">${pgKey('You hold', '#4a5263', 1)}${pgKey('On the list', 'var(--need)', 1)}</div></div><div class="pb flush"><div class="after">${onList.length ? onList.map((p, i) => pgAfterRow(v, p, p.listed, p.listed, 0, i)).join('') : '<div class="af" style="grid-template-columns:minmax(0,1fr);color:var(--muted)"><span>Nothing on the list.</span></div>'}</div></div></div>
      </div></div></section>`;
    }
    const all = ui.pane === 1;
    const rows = v.pieces.filter((p) => all || p.need).sort((a, b) => (b.target ? b.need / b.target : 0) - (a.target ? a.need / a.target : 0));
    const sel = viewPiece(v, ui.sel) || rows[0] || v.pieces[0] || null;
    // Read by the hub after the draw: the piece whose sellers are shown.
    ui.shown = sel ? String(sel.id) : '';
    const plan = v.buy.plan;
    const table = rows.length ? '<thead><tr><th>Piece</th><th class="n">Need</th><th class="n">Cheapest</th><th>Where</th><th class="n">Under its worth</th><th class="n">On your list</th></tr></thead><tbody>' + rows.map((p) => {
        const low = p.low;
        return `<tr class="pick ${sel && p.id === sel.id ? 'sel' : ''}" data-act="sel" data-id="${p.id}"><td>${pgIco(p)}<b>${hEsc(p.name)}</b></td><td class="n">${p.need ? `<span class="t-need">${p.need}</span>` : p.ahead ? `<span class="t-warn">${p.ahead} ahead</span>` : '<span class="t-muted">enough</span>'}</td><td class="n">${low ? `<b class="${low.price < p.pay ? 't-brand' : ''}">${hMoney(low.price)}</b> <span class="t-muted">×${hNum(low.qty)}</span>` : `<span class="t-muted">${p.lowAll ? 'none where you buy' : 'none listed'}</span>`}</td><td>${low ? (low.src === 'market' ? 'Item Market' : hEsc(low.who || 'Bazaar ' + (low.whoId ?? ''))) : ''}</td><td class="n">${low ? pgGap(p.worth - low.price) : ''}</td><td class="n">${p.listed ? `<b>${p.listed}</b> <span class="t-muted">of ${p.need}</span>` : '<span class="t-muted">none</span>'}</td></tr>`;
    }).join('') + '</tbody>' : '';
    return `<section class="page p-buy on"><div class="pane gbuy stk on">
      <div class="col">
        <div class="panel tint" data-k="rec"><div class="ph"><h2>Fill my stock</h2></div><div class="pb">
          <div class="rec"><div class="hero">${hNum(plan.units)}<small>of the ${hPlural(plan.need, 'piece')} you need ${plan.units === 1 ? 'is' : 'are'} under ${plan.units === 1 ? 'its' : 'their'} worth</small></div><div class="rec-t"><b>${hPlural(plan.stops, 'stop')}</b> · ${hMoney(plan.cost)}<br>${pgFullWords(v, plan.full)}</div><div class="rec-b">${pgFrom(v)}<button class="btn go" data-act="make-list"${plan.units ? '' : ' disabled'}>Make the list</button></div></div>
          <div class="rows"><div class="row"><span class="grow1 t-muted">${pgStockAge(v)}</span></div>${v.buy.unsure ? `<div class="row"><span class="grow1 t-muted">${hPlural(v.buy.unsure, 'more piece')} in ${hPlural(v.buy.check.length, 'bazaar')} not checked in the last 5 minutes: not counted until Torn has been asked, which it is being now.</span></div>` : ''}</div>
        </div></div>
        <div class="panel grow" data-k="buy-t"><div class="ph"><h2>Where each piece is cheapest</h2><span class="sub">press a piece to see every place that sells it</span></div>
          <div class="pb flush">${rows.length ? `<table class="t wrapth">${table}</table>` : pgNone('You need nothing: every set is at its target. "All pieces" lists them anyway.')}</div></div>
      </div>
      <div class="col">
        <div class="panel" data-k="where">${pgWhere(v, sel, lines)}</div>
        <div class="panel grow minc" style="min-height:168px" data-k="depth"><div class="ph"><h2>How deep the cheap pieces go</h2><div class="legend">${pgSetKeys(v)}</div></div>
          <div class="pb"><div class="chart" data-chart="depth"></div></div></div>
      </div></div></section>`;
}

// ---- Trades ------------------------------------------------------------------------------------------------------

function pgMargin(t) {
    const m = t.margin;
    const out = [];
    if (m.state === 'ok') out.push(`Everything in it <b class="t-good">${marginWords(m.all)}</b> ${PG_FEE}.`);
    else if (m.state === 'under') out.push(`<b class="t-warn">Everything in it ${marginWords(m.all)}: under your least profit since the points price fell.</b>${m.mend ? ` Paying ${hRate(m.mend)}% would keep it.` : ''}`);
    else if (m.state === 'loss') out.push(`<b class="t-bad">Everything in it ${marginWords(m.all)}: a loss at the points price now.</b>${m.mend ? ` Paying ${hRate(m.mend)}% would keep your least profit.` : ''}`);
    if (m.held > 0 && m.state !== 'none') out.push(`${hMoney(m.held)} of it buys pieces you do not need yet: they pay when the rest of their set arrives.`);
    if (m.others.length) out.push(`<span class="t-warn">${m.others.map(hEsc).join(', ')}: not a set piece, not priced.</span> The total does not cover ${m.others.length === 1 ? 'it' : 'them'}.`);
    return out.length ? `<div class="wl-s" style="padding-top:9px;border-top:1px solid var(--line)">${out.join(' ')}</div>` : '';
}

function pgTrade(v, t) {
    if (!t) return `<div class="panel grow"><div class="ph"><h2>No trade is open with you</h2></div><div class="pb" style="color:var(--text2)">A new trade shows here within a minute, with your prices on every piece.</div></div>`;
    const forSets = (r) => (r.state === 'other' ? '<span class="t-warn">not a set piece</span>' : r.take === r.qty ? `<span class="t-need">need all ${r.qty}</span>` : r.take ? `<span class="t-need">need ${r.take}</span> <span class="t-muted">· ${r.qty - r.take} ahead</span>` : '<span class="t-muted">not needed</span>');
    const rows = t.rows.map((r) => `<tr><td>${pgItem(v, r.id, r.name)}<b>${hEsc(r.name)}</b></td><td class="n">${hNum(r.qty)}</td><td>${forSets(r)}</td><td class="n">${r.each ? hMoney(r.each) : '<span class="t-muted">not priced</span>'}</td><td class="n">${r.each ? `<b>${hMoney(r.total)}</b>` : ''}</td></tr>`).join('');
    const sum = `<tr class="sum"><td colspan="4">Everything in the trade</td><td class="n">${hMoney(t.total)}</td></tr>${t.needTotal && t.needTotal < t.total ? `<tr><td colspan="4" class="t-muted">Only what you need</td><td class="n t-muted">${hMoney(t.needTotal)}</td></tr>` : ''}`;
    let foot;
    if (t.state === 'you') {
        const owed = t.total - t.myMoney;
        foot = `<div style="padding:8px 14px 6px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center"><div class="msg">${hEsc(t.message)}</div><button class="btn" data-act="copy" data-v="${hEsc(t.message)}">Copy the message</button></div>`
            + (t.vault == null ? '' : t.vault > 0 ? `<div class="wl-s">On hand ${hMoney(v.top.onHand)}: <b class="t-warn">take ${hMoney(t.vault)} out of the vault</b> just before you pay${t.myMoney ? ` the other ${hMoney(owed)}` : ''}. You press Accept.</div>` : `<div class="wl-s">On hand ${hMoney(v.top.onHand)} covers it. You press Accept.</div>`);
    } else {
        foot = `<div class="wl-s" style="padding-top:9px">${t.state === 'them' ? `You paid <b>${hMoney(t.myMoney)}</b>. Nothing to do until ${hEsc(t.who)} accepts.` : `${hEsc(t.who)} is still adding items. Your prices are ready when they stop.`}</div>`;
    }
    const sets = v.sets.filter((s) => t.after.some((r) => (viewPiece(v, r.id) || {}).set === s.key)).map((s) => `${s.label} sets <b>${s.full}</b> to <b>${t.full[s.key]}</b>`).join(' · ');
    const after = t.after.map((r, i) => { const p = viewPiece(v, r.id); return p ? pgAfterRow(v, p, r.q, r.take, r.q - r.take, i) : ''; }).join('');
    return `<div class="panel" data-k="trade"><div class="ph"><h2>${hOut(hProfileUrl(t.whoId), hEsc(t.who))}</h2><span class="sub">${hPlural(t.items, 'item')} · ${hPlural(t.units, 'piece')}</span><span class="sp"></span><span class="st ${t.state}">${TURN_WORDS[t.state]}</span>${hOut(tradeViewUrl(t.id), 'Open the trade', 'btn sm go out')}</div>
        <div class="pb flush"><table class="t tight"><thead><tr><th>Their items</th><th class="n">In the trade</th><th>For your sets</th><th class="n">Your price</th><th class="n">Total</th></tr></thead><tbody>${rows}${sum}</tbody></table>${pgMargin(t)}${foot}</div></div>
      <div class="panel grow" data-k="after"><div class="ph"><h2>Your sets after this trade</h2><div class="legend">${pgKey('You hold', '#4a5263', 1)}${pgKey('Needed', 'var(--need)', 1)}${pgKey('Ahead', 'var(--warn)', 1)}</div></div>
        <div class="pb flush"><div class="after">${after}<div class="af" style="grid-template-columns:minmax(0,1fr);color:var(--text2)"><span>${sets}</span></div></div></div></div>`;
}

function pgTrades(d, ui) {
    const v = d.view;
    const open = v.trades.open;
    const sel = open.find((t) => t.id === ui.trade) || open[0] || null;
    const wait = v.trades.wait;
    return `<section class="page g2r on">
    <div class="col">
      <div class="panel" data-k="open"><div class="ph"><h2>Open with you</h2><span class="sp"></span>${open.length ? `<span class="badge ${wait ? 'ahead' : ''}">${wait} ${wait === 1 ? 'waits' : 'wait'} for you</span>` : ''}</div><div class="pb flush">${open.length ? open.map((t) => `<div class="li ${sel && t.id === sel.id ? 'sel' : ''}" data-act="trade" data-id="${hEsc(t.id)}" style="cursor:pointer"><span class="av ${t.state === 'new' ? 'new' : ''}">${hEsc(String(t.who || '?')[0])}</span><span class="li-m"><b>${hEsc(t.who)}</b><span>${hPlural(t.items, 'item')} · ${t.ago}</span></span><span class="amt"><b class="num">${hMoney(t.total)}</b><span class="st ${t.state}">${TURN_WORDS[t.state]}</span></span></div>`).join('') : pgNone('No trade is open with you.')}</div></div>
      <div class="panel grow" data-k="fin"><div class="ph"><h2>Finished</h2><span class="sp"></span><button class="btn sm" data-go="ledger" data-pane="3">Receipts</button></div><div class="pb flush">${v.trades.finished.length ? v.trades.finished.slice(0, 12).map((f) => `<div class="li"><span class="av">${hEsc(String(f.who || '?')[0])}</span><span class="li-m"><b>${hOut(hProfileUrl(f.whoId), hEsc(f.who))}</b><span>${hPlural(f.units, 'piece')} · ${hWhen(f.t)}</span></span><b class="num">${hMoney(f.paid)}</b></div>`).join('') : pgNone('None yet.')}</div></div>
    </div>
    <div class="col">${pgTrade(v, sel)}</div>
  </section>`;
}

// ---- Points ------------------------------------------------------------------------------------------------------

const PG_BOOK_BADGE = { made: ['best', 'Made'], sold: ['ok', 'Sold'], used: ['need', 'Used'] };

function pgBookRow(v, r) {
    const [cls, word] = PG_BOOK_BADGE[r.kind] || ['', r.kind];
    const set = r.set ? v.sets.find((s) => s.key === r.set) : null;
    const what = r.kind === 'made' ? (set ? `${hPlural(Math.round(r.points / set.points), set.label + ' Set')} at the museum` : 'Sets at the museum') : r.kind === 'sold' ? 'One lot on the points market' : 'Used by you';
    const out = r.kind !== 'made';
    return `<tr><td>${hWhen(r.t)}</td><td><span class="badge ${cls}">${word}</span> ${what}${out && r.mine < r.points ? ` <span class="t-muted">· ${hNum(r.points - r.mine)} were yours before</span>` : ''}</td><td class="n"><b>${out ? '-' : '+'}${hNum(out ? r.mine : r.points)}</b></td><td class="n">${hMoney(r.cost)}</td><td class="n">${r.kind === 'sold' ? hMoney(r.each) : `<span class="t-muted">${r.kind === 'used' ? 'used' : 'held'}</span>`}</td><td class="n">${r.kind === 'sold' ? `<span class="${r.gain < 0 ? 't-bad' : 't-good'}">${hSigned(r.gain)}</span>` : r.kind === 'used' ? '<span class="t-muted">not counted</span>' : ''}</td></tr>`;
}

function pgPoints(d, ui) {
    const v = d.view;
    const pt = v.points;
    const book = pt.book;
    if (ui.pane === 1) {
        const swapped = v.ledger.swapped;
        const sets14 = v.sets.reduce((a, s) => a + (swapped[s.key] || []).reduce((x, y) => x + y, 0), 0);
        return `<section class="page p-tabs on"><div class="pane g2 on">
      <div class="col">
        <div class="tiles" style="--n:4" data-k="tiles">
          <div class="panel tile"><div class="k-l">Made from sets</div><div class="k-v">${hNum(book.made)}</div><div class="k-s">${hPlural(sets14, 'set')} in 14 days</div></div>
          <div class="panel tile"><div class="k-l">Sold</div><div class="k-v">${hNum(book.sold)}</div><div class="k-s">profit <b class="${book.profitSold < 0 ? 't-bad' : 't-good'}">${hSigned(book.profitSold)}</b></div></div>
          <div class="panel tile"><div class="k-l">Used by you</div><div class="k-v">${hNum(book.used)}</div><div class="k-s">cost you <b>${hMoney(book.usedCost)}</b> · not profit</div></div>
          <div class="panel tile"><div class="k-l">Held, made from sets</div><div class="k-v">${hNum(book.left)}</div><div class="k-s">${book.left ? `cost ${hMoney(book.each)} · worth ${hMoney(pt.price)} today` : 'none held'}</div></div>
        </div>
        <div class="panel grow" data-k="book"><div class="ph"><h2>Points book</h2><span class="sub">sets put points in at what they cost · a sale takes them out at the average</span></div><div class="pb flush">${book.rows.length ? `<table class="t"><thead><tr><th>When</th><th>What</th><th class="n">Points</th><th class="n">Cost each</th><th class="n">Price each</th><th class="n">Profit</th></tr></thead><tbody>${book.rows.map((r) => pgBookRow(v, r)).join('')}</tbody></table>` : pgNone('Empty. A set swapped at the museum puts its points here, at what the pieces cost you.')}</div></div>
      </div>
      <div class="col">
        <div class="panel grow minc" data-k="held"><div class="ph"><h2>Points held, made from sets</h2><span class="sp"></span><span class="sub">14 days</span></div><div class="pb"><div class="chart" data-chart="held"></div></div></div>
        <div class="panel" data-k="before"><div class="ph"><h2>The points you had before</h2></div><div class="pb" style="color:var(--text2)">${pt.before == null ? 'Your points have not been read yet.' : pt.before ? `${hNum(pt.before)} points were yours before Torn Archive. They are left alone: never filled, never counted as profit. Type what a point cost you if you want them in the book.` : 'Every point you hold was made from sets.'}${pt.before ? `<span style="margin-left:8px;white-space:nowrap">$ ${pgInput('beforeEach', v.settings.beforeEach || '', 84)}</span>` : ''}</div></div>
      </div></div></section>`;
    }
    const max = Math.max(1, ...pt.table.map((r) => r.lots));
    const lots = pt.table.map((r) => `<tr><td><b>${r.label}</b></td><td><span class="hb-t"><i class="hb" style="--w:${r.lots / max * 100}%"></i></span><span class="num">${hNum(r.lots)}</span></td><td class="n">${hNum(r.points)}</td><td class="n">${r.wait == null ? '<span class="t-muted">not seen yet</span>' : waitWords(r.wait)}</td><td>${r.mine ? `${r.mine.n} of yours${r.mine.lo == null ? '' : r.mine.lo === r.mine.hi ? ': ' + waitWords(r.mine.lo) : `: ${waitWords(r.mine.lo)} to ${waitWords(r.mine.hi)}`}` : '<span class="t-muted">none of yours yet</span>'}</td></tr>`).join('');
    const sell = pt.sell;
    const about = (ms) => (ms == null ? '<span class="t-muted">no wait seen yet</span>' : 'about ' + waitWords(ms));
    const sellRows = !sell.points ? '<div class="row"><span class="grow1 t-muted">No points made from sets to sell. Swap full sets at the museum first.</span></div>' : `
          <div class="row"><span class="grow1">Price to type, $1 under the ${pt.rule === 'wall' ? 'first wall' : 'lowest listing'}</span><b class="num">${hMoney(pt.price)}</b></div>
          ${sell.loss ? `<div class="row"><span class="grow1 t-bad">Under your least price ${hMoney(sell.least)}: selling now is a loss.</span></div>` : ''}
          ${sell.quick ? `<div class="row"><span class="grow1"><b>Quickest:</b> ${lotsWords(sell.quick.lots)}</span><b class="num">${about(sell.quick.wait)}</b></div>` : ''}
          <div class="row"><span class="grow1">${sell.quick ? '' : '<b>Quickest:</b> '}One lot of ${hNum(sell.points)}</span><b class="num">${about(sell.one.wait)}</b></div>
          <div class="row"><span class="grow1">Profit over what they cost</span><b class="num ${sell.profit < 0 ? 't-bad' : 't-good'}">${hSigned(sell.profit)}</b></div>
          <div class="row"><span class="grow1 t-muted">Bank each lot as it sells. ${PG_FEE[0].toUpperCase() + PG_FEE.slice(1)}.</span></div>`;
    const seg = `<div class="seg">${[7, 30, 40].map((n) => `<button data-act="range" data-id="pts2" data-v="${n}"${ui.range.pts2 === n ? ' class="on"' : ''}>${n} days</button>`).join('')}</div>`;
    return `<section class="page p-tabs on"><div class="pane g2 on">
      <div class="col">
        <div class="panel grow minc" data-k="pts2"><div class="ph"><h2>Points price</h2><div class="legend">${pgKey('First wall', 'var(--s-gold)')}${pgKey('Lowest listing', 'var(--s-violet)')}</div><span class="sp"></span>${seg}</div>
          <div class="pb"><div class="chart" data-chart="pts2"></div></div></div>
        <div class="panel" data-k="lots"><div class="ph"><h2>Which lot size sells</h2><span class="sub">lots that left the market, 7 days</span></div><div class="pb flush"><table class="t tight wrapth"><thead><tr><th>Lot size</th><th>Lots gone</th><th class="n">Points in them</th><th class="n">Usual wait at the wall price</th><th>Your own lots</th></tr></thead><tbody>${lots}</tbody></table></div></div>
      </div>
      <div class="col">
        <div class="panel grow" data-k="ladder"><div class="ph"><h2>The market now</h2><span class="sub">lowest first</span><span class="sp"></span>${hOut(POINTS_MARKET_URL, 'Points market', 'btn sm out')}</div><div class="pb flush"><div class="ladder">${pgLadder(v, 9)}</div></div></div>
        <div class="panel ${pt.hold && sell.points ? 'hold' : ''}" data-k="sell"><div class="ph"><h2>Selling your ${hNum(sell.points)} points</h2><span class="sp"></span>${pt.hold && sell.points ? '<span class="badge ahead">cheap today: hold</span>' : pt.cheap && sell.points ? '<span class="badge ahead">cheap today</span>' : ''}</div><div class="pb"><div class="rows">${sellRows}</div></div></div>
      </div></div></section>`;
}

// ---- My prices ---------------------------------------------------------------------------------------------------

function pgVerdict(v) {
    const vd = v.prices.verdict;
    const c = vd.checks;
    const ck = (ok, html) => `<div class="chk ${ok ? '' : 'no'}"><span>${html}</span></div>`;
    const btn = { 'buy-first': '<button class="btn sm" data-act="make-list">The list</button>', 'stay-buy': '<button class="btn sm" data-act="make-list">The list</button>', 'open-now': '<button class="btn sm go" data-act="set" data-id="open" data-v="1">Open the shop</button>', low: c.leaves.cap > 0 ? `<button class="btn sm" data-act="set" data-id="pct" data-v="${c.leaves.cap}">Set ${hRate(c.leaves.cap)}%</button>` : '' }[vd.state] || '';
    const cheaper = c.cheaper.ok
        ? (c.cheaper.listings ? `${hPlural(c.cheaper.listings, 'listing')} under your price ${c.cheaper.listed >= c.cheaper.listings ? `${c.cheaper.listings === 1 ? 'is' : 'are'} <b>on your list</b>` : 'can go on your list'}. A new listing never closes the shop` : 'Nothing you need is cheaper in a bazaar')
        : `<b>${hPlural(c.cheaper.units, 'piece')}</b> you need ${c.cheaper.units === 1 ? 'is' : 'are'} cheaper in a bazaar than from your sellers${v.prices.open ? ', and have sat unbought for 10 minutes' : ''}`;
    return `<div class="verdict"><span class="lamp ${vd.lamp === 'ok' ? '' : 'warn'}"${vd.lamp === 'bad' ? ' style="background:var(--bad);box-shadow:0 0 0 4px rgba(240,96,93,.16)"' : ''}></span><b>${VERDICT_WORDS[vd.state]}</b><span class="sp"></span>${btn}</div>`
        + (vd.state === 'no-price' ? '' : ck(c.leaves.ok, `A ${pgLow(c.leaves.name)} set bought at ${hRate(v.prices.pct)}% leaves <b>${hSigned(c.leaves.profit)}</b>${c.leaves.ok ? '' : `: under your least ${hRate(v.prices.least)}%`}`)
            + ck(c.cheaper.ok, cheaper)
            + ck(c.need.ok, c.need.ok ? `You still need <b>${hPlural(c.need.units, 'piece')}</b>` : 'You need nothing: every set is at its target')
            + ck(c.share.ok, c.share.sets == null ? 'No limit set on your share of money in sets' : c.share.ok ? `Your ${v.share.max}% share covers <b>${hPlural(c.share.sets, 'more set')}</b>` : `Your ${v.share.max}% share of money in sets and points is full`));
}

const PG_THREAD = {
    match: ['ok', 'the title on Torn matches'],
    open: ['ahead', 'the title on Torn still says closed'],
    closed: ['ahead', 'the title on Torn still says open'],
};

function pgW3b(d) {
    const w = d.view.prices.w3b;
    const key = (d.keys && d.keys.w3b) || {};
    let badge = '<span class="badge">no key yet</span>';
    let body;
    if (!key.set) body = '<div class="row"><span class="grow1">Paste the key you registered on TornW3B to keep your price list there at your rate, and to make a receipt for a trade.</span><button class="btn sm" data-go="settings">Settings</button></div>';
    else if (w.error) { badge = '<span class="badge bad">not read</span>'; body = `<div class="row"><span class="grow1 t-bad">${hEsc(w.error)}</span><button class="btn sm" data-act="w3b" data-v="read">Read again</button></div>`; }
    else if (!w.known) { badge = '<span class="badge">reading</span>'; body = '<div class="row"><span class="grow1 t-muted">Your list on TornW3B has not been read yet.</span></div>'; }
    else if (w.matches) { badge = '<span class="badge ok">matches your rate</span>'; body = `<div class="row"><span class="grow1">${d.view.prices.open ? `Every piece is on it at ${hRate(d.view.prices.pct)}%.` : 'No set piece is on it: your shop is closed.'}</span></div>`; }
    else {
        badge = `<span class="badge ahead">${hPlural(w.diff.set.length + w.diff.remove.length, 'price')} differ</span>`;
        body = `<div class="row"><span class="grow1">${[w.diff.set.length ? `${hPlural(w.diff.set.length, 'price')} to set` : '', w.diff.remove.length ? `${hPlural(w.diff.remove.length, 'piece')} to take off` : ''].filter(Boolean).join(' · ')}. Only set pieces are touched: anything else on your list stays as it is.</span>${w.sync ? '<span class="t-muted">sending</span>' : `<button class="btn sm go" data-act="w3b" data-v="send"${d.busy && d.busy.w3b ? ' disabled' : ''}>Send to TornW3B</button>`}</div>`;
    }
    const listed = !key.set ? '' : w.listedUntil > d.view.at ? `Buyers see your list until ${hDay(w.listedUntil)}: TornW3B shows it for 7 days after a receipt.` : 'Buyers do not see your list: TornW3B shows it for 7 days after a receipt.';
    return `<div class="panel" data-k="w3b"><div class="ph"><h2>Your price list on TornW3B</h2><span class="sp"></span>${badge}</div><div class="pb"><div class="rows">${body}
        ${key.set ? `<div class="field"><span class="f-l">Keep it at my rate by itself<span>${listed}</span></span>${pgSeg('w3bSync', d.view.settings.w3bSync ? 1 : 0, [[1, 'On'], [0, 'Off']])}</div>` : ''}
        <div class="row"><span class="grow1 t-muted">Open and Closed on TornW3B's own page is yours to press there.</span></div></div></div></div>`;
}

function pgPrices(d) {
    const v = d.view;
    const pr = v.prices;
    const at = (r) => Math.max(0, Math.min(100, (r - 99) / 5 * 100));
    const th = pr.thread;
    const [tcls, twords] = !th ? ['', 'no buying thread of yours found'] : th.check.state === 'rate' ? ['ahead', `the title on Torn says ${hRate(th.check.says.pct)}%`] : PG_THREAD[th.check.state];
    const table = '<thead><tr><th>Piece</th><th class="n">Market value</th><th class="n">You pay, ' + hRate(pr.pct) + '%</th><th class="n">Best other buyer</th><th class="n">Cheapest bazaar</th></tr></thead><tbody>' + v.pieces.map((p) => `<tr><td>${pgIco(p)}<b>${hEsc(p.name)}</b></td><td class="n">${hMoney(p.mv)}</td><td class="n"><b>${hMoney(p.pay)}</b></td><td class="n">${p.other ? `<span class="${p.other.pct > pr.pct ? 't-warn' : 't-muted'}" title="${hEsc(p.other.name)}">${hPct(p.other.pct)}</span>` : '<span class="t-muted">none seen</span>'}</td><td class="n">${!p.lowBazaar ? '<span class="t-muted">none</span>' : p.lowBazaar < p.pay ? `<span class="t-warn">cheaper than you</span> <b class="t-warn">${hMoney(p.lowBazaar)}</b>` : hMoney(p.lowBazaar)}</td></tr>`).join('') + '</tbody>';
    return `<section class="page g57 stackable wide on">
    <div class="col">
      <div class="panel tint" data-k="rate"><div class="ph"><h2>What you pay sellers</h2><span class="sp"></span><span class="toggle" data-act="set" data-id="open" data-v="${pr.open ? 0 : 1}" style="cursor:pointer" title="${pr.open ? 'Close the shop' : 'Open the shop'}"><span class="sw-t"${pr.open ? '' : ' style="background:var(--faint)"'}></span><b class="${pr.open ? 't-good' : 't-muted'}">${pr.open ? 'Shop open' : 'Shop closed'}</b></span></div><div class="pb">
        <div class="hero">${hRate(pr.pct)}%<small>of market value, every piece</small></div>
        <div class="track" style="--w:${at(pr.pct)}%;--at:${at(pr.cap)}%"><i></i><span class="knob"></span>${pr.cap ? `<span class="mk"><span>${hRate(pr.cap)}% is the most that keeps your least profit</span></span>` : ''}<span class="lo">99%</span><span class="hi">104%</span></div>
        <div class="rows">
          ${pr.sets.map((s) => `<div class="row"><span class="grow1">A ${pgLow(s.label)} set at ${hRate(pr.pct)}% costs you <b>${hMoney(s.cost)}</b> and makes ${s.points} points</span><b class="num ${s.ok ? 't-good' : s.profit < 0 ? 't-bad' : 't-warn'}">${hSigned(s.profit)} a set</b></div>`).join('')}
          <div class="row"><span class="grow1">Your rate <span class="t-muted">· every figure ${PG_FEE} the points market may take</span></span>${pgInput('pct', hRate(pr.pct), 64, '%')}${pr.cap && pr.cap !== pr.pct ? `<button class="btn sm" data-act="set" data-id="pct" data-v="${pr.cap}">Set ${hRate(pr.cap)}%</button>` : ''}</div>
        </div>
      </div></div>
      <div class="panel" data-k="verdict"><div class="ph"><h2>Open your shop?</h2></div><div class="pb">${pgVerdict(v)}</div></div>
      ${pgW3b(d)}
      <div class="panel" data-k="thread"><div class="ph"><h2>Your forum thread</h2><span class="sp"></span><span class="badge ${tcls}">${twords}</span></div><div class="pb">
        <div class="msg"><b>${hEsc(pr.forum.title)}</b><br>${hEsc(pr.forum.post).replace(/\n/g, '<br>')}</div>
        <div style="display:flex;gap:8px;margin-top:10px;align-items:center"><button class="btn" data-act="copy" data-v="${hEsc(pr.forum.title)}">Copy the title</button><button class="btn" data-act="copy" data-v="${hEsc(pr.forum.post)}">Copy the post</button>${th && th.url ? hOut(th.url, 'Your thread', 'btn out') : ''}<span class="sp"></span><span class="t-muted" style="font-size:12px">You paste and post it.</span></div>
      </div></div>
      <div class="panel grow minc" data-k="ratechart"><div class="ph"><h2>What a set leaves you, by rate</h2><div class="legend">${pgSetKeys(v)}</div></div><div class="pb"><div class="chart" data-chart="rate"></div></div></div>
    </div>
    <div class="panel grow" data-k="price-t"><div class="ph"><h2>Your price for every piece</h2><span class="sub">beside what others pay and what a bazaar asks</span></div><div class="pb flush"><table class="t">${table}</table></div></div>
  </section>`;
}

// ---- Ledger ------------------------------------------------------------------------------------------------------

const PG_VENUE = { bazaar: 'Bazaar', market: 'Item Market' };
const PG_UNITS = [['day', 'Day'], ['week', 'Week'], ['month', 'Month']];

function pgLedger(d, ui) {
    const v = d.view;
    const lg = v.ledger;
    const sum = lg.sum;
    const wrap = (cls, body, style = '') => `<section class="page p-tabs on"><div class="pane ${cls} on"${style ? ` style="${style}"` : ''}>${body}</div></section>`;
    const one = (k, head, sub, table, none) => wrap('g1', `<div class="panel grow" data-k="${k}"><div class="ph"><h2>${head}</h2>${sub ? `<span class="sub">${sub}</span>` : ''}</div><div class="pb flush">${table || pgNone(none)}</div></div>`);
    if (ui.pane === 1) {
        const rows = lg.sold.map((s) => `<tr><td>${hWhen(s.t)}</td><td class="n"><b>${hNum(s.points)}</b></td><td class="n">${hMoney(s.each)}</td><td class="n">${hMoney(s.got)}</td><td class="n">${hMoney(s.cost)}</td><td class="n"><span class="${s.gain < 0 ? 't-bad' : 't-good'}">${hSigned(s.gain)}</span></td><td>${s.mug ? `<span class="t-bad">mugged ${waitWords(s.mug.after)} later: -${hMoney(s.mug.counted)}</span>` : ''}</td></tr>`).join('');
        const all = lg.sold.reduce((a, s) => ({ points: a.points + s.points, got: a.got + s.got, gain: a.gain + s.gain }), { points: 0, got: 0, gain: 0 });
        const foot = all.points ? `<tr class="sum"><td>Every lot</td><td class="n">${hNum(all.points)}</td><td class="n">${hMoney(all.got / all.points)}</td><td class="n">${hMoney(all.got)}</td><td class="n">${hMoney((all.got - all.gain) / all.points)}</td><td class="n">${hSigned(all.gain)}</td><td>${lg.mugs.counted ? `less buy-mugs: ${hSigned(all.gain - lg.mugs.counted)}` : ''}</td></tr>` : '';
        return one('sold', 'Every lot of points you sold', 'the only place profit is counted', rows && `<table class="t"><thead><tr><th>When</th><th class="n">Lot</th><th class="n">Price each</th><th class="n">You got</th><th class="n">Cost a point then</th><th class="n">Profit</th><th>Then</th></tr></thead><tbody>${rows}${foot}</tbody></table>`, 'No points sold yet.');
    }
    if (ui.pane === 2) {
        const rows = lg.buys.slice(0, 120).map((b) => `<tr><td>${hWhen(b.t)}</td><td>${pgItem(v, b.itemId, b.name)}<b>${hEsc(b.name)}</b></td><td>${b.venue === 'trade' ? 'Trade with ' + hEsc(b.who || 'a seller') : (PG_VENUE[b.venue] || hEsc(b.venue)) + (b.venue === 'bazaar' && b.who ? ' · ' + hEsc(b.who) : '')}</td><td class="n">${hNum(b.qty)}</td><td class="n">${hMoney(b.each)}</td><td class="n"><b>${hMoney(b.paid)}</b></td><td><span class="t-muted">${b.rate ? hPct(b.rate) : ''}</span></td></tr>`).join('');
        return wrap('g2', `<div class="panel grow" data-k="buys"><div class="ph"><h2>Every piece you bought</h2><span class="sub">from Torn's log</span></div><div class="pb flush">${rows ? `<table class="t"><thead><tr><th>When</th><th>Piece</th><th>Where</th><th class="n">Units</th><th class="n">Each</th><th class="n">Paid</th><th>Rate</th></tr></thead><tbody>${rows}</tbody></table>` : pgNone('No buy read from your log yet.')}</div></div>
      <div class="panel grow minc" data-k="bought"><div class="ph"><h2>Pieces bought, by where</h2><span class="sp"></span><span class="sub">14 days</span></div>
        <div class="pb" style="display:flex;flex-direction:column"><div class="legend" style="margin-bottom:4px">${pgKey('Bazaars', 'var(--s-gold)', 1)}${pgKey('Item Market', 'var(--s-violet)', 1)}${pgKey('Trades with you', 'var(--s-aqua)', 1)}</div><div style="flex:1;position:relative;min-height:0"><div class="chart" data-chart="bought" style="inset:0"></div></div></div></div>`);
    }
    if (ui.pane === 3) {
        const hasKey = d.keys && d.keys.w3b && d.keys.w3b.set;
        const rows = v.trades.finished.map((f) => `<tr><td>${hWhen(f.t)}</td><td><b>${hOut(hProfileUrl(f.whoId), hEsc(f.who))}</b></td><td class="n">${hNum(f.units)}</td><td class="n"><b>${hMoney(f.paid)}</b></td><td class="n"><span class="t-muted">${f.rate ? hPct(f.rate) : ''}</span></td><td class="n">${f.receipt && f.receipt.url ? hOut(f.receipt.url, 'Receipt', 'btn sm out') : f.receipt ? '<span class="t-muted">made</span>' : hasKey ? `${f.listed ? '' : '<span class="t-muted" style="margin-right:8px">not priced on your TornW3B list</span>'}<button class="btn sm" data-act="receipt" data-id="${hEsc(f.id)}"${d.busy && d.busy.receipt === f.id ? ' disabled' : ''}>Make the receipt</button>` : ''}</td></tr>`).join('');
        return one('rec', 'Receipts', v.trades.receiptsError ? 'TornW3B does not give your receipts: ' + hEsc(v.trades.receiptsError) : 'one per trade · made on TornW3B by itself, from your list there, when a trade ends', rows && `<table class="t"><thead><tr><th>When</th><th>Seller</th><th class="n">Pieces</th><th class="n">You paid</th><th class="n">Rate</th><th></th></tr></thead><tbody>${rows}</tbody></table>`, 'No finished trade yet.');
    }
    if (ui.pane === 4) {
        const rows = lg.sellers.map((s) => `<tr><td><b>${hOut(hProfileUrl(s.whoId), hEsc(s.who || 'Seller ' + s.whoId))}</b></td><td class="n">${hNum(s.trades)}</td><td class="n">${hNum(s.units)}</td><td class="n"><b>${hMoney(s.paid)}</b></td><td>${hEsc(s.brings)}</td><td>${s.came}</td></tr>`).join('');
        return one('sel', 'Sellers', '', rows && `<table class="t"><thead><tr><th>Seller</th><th class="n">Trades</th><th class="n">Units</th><th class="n">You paid</th><th>Mostly brings</th><th>Last came</th></tr></thead><tbody>${rows}</tbody></table>`, 'Nobody has sold to you in a trade yet.');
    }
    if (ui.pane === 5) {
        const sale = (m) => lg.sold.find((s) => s.id === m.saleId);
        const what = (m) => { const s = m.counted ? sale(m) : null; return m.counted ? `${s ? `${hNum(s.points)} points sold at ${hMoney(s.each)} ${waitWords(m.after)} before: ` : ''}${hMoney(m.onHand)} of points money was on hand, not yet banked` : 'No points money on hand'; };
        const rows = lg.mugs.rows.map((m) => `<tr><td>${hWhen(m.t)}</td><td>${hEsc(m.by || 'Someone')}</td><td class="n ${m.counted ? 't-bad' : 't-muted'}">-${hMoney(m.taken)}</td><td>${what(m)}</td><td>${m.counted ? `<span class="badge bad">buy-mug: ${m.counted < m.taken ? hMoney(m.counted) + ' ' : ''}counted</span>` : '<span class="badge">left out</span>'}</td></tr>`).join('');
        return one('mug', 'Mugged', 'counted only when it took points money you had not banked', rows && `<table class="t"><thead><tr><th>When</th><th>By</th><th class="n">Taken</th><th>What was on hand</th><th>In the profit</th></tr></thead><tbody>${rows}</tbody></table>`, 'No mug in your log.');
    }
    return wrap('g1', `<div class="tiles" style="--n:5" data-k="tiles">
        <div class="panel tile"><div class="k-l">Points sold</div><div class="k-v">${hMoney(sum.got)}</div><div class="k-s">${sum.points ? `${hNum(sum.points)} points · average ${hMoney(sum.got / sum.points)}` : 'none in 14 days'}</div></div>
        <div class="panel tile"><div class="k-l">less what they cost you</div><div class="k-v">${hMoney(sum.cost)}</div><div class="k-s">${sum.points ? `average ${hMoney(sum.cost / sum.points)} a point` : ''}</div></div>
        <div class="panel tile"><div class="k-l">less buy-mugs</div><div class="k-v"${sum.mug ? ' style="color:#ff8a87"' : ''}>${hMoney(-sum.mug)}</div><div class="k-s"><b>${lg.mugs.rows.length - lg.mugs.left}</b> counted · ${lg.mugs.left} left out</div></div>
        <div class="panel tile tint"><div class="k-l">Profit, 14 days</div><div class="k-v ${sum.profit >= 0 ? 'good' : ''}"${sum.profit < 0 ? ' style="color:#ff8a87"' : ''}>${hSigned(sum.profit)}</div><div class="k-s">counted only when points sell</div></div>
        <div class="panel tile"><div class="k-l">Not sold yet</div><div class="k-v">${hMoney(lg.notSold)}</div><div class="k-s">pieces, sets and ${hNum(lg.notSoldPoints)} points, at ${lg.poolEst ? 'about their ' : ''}cost</div></div>
      </div>
      <div class="g2" style="display:grid;gap:12px;min-height:0">
        <div class="panel grow minc" data-k="profit"><div class="ph"><h2>Profit by ${ui.unit}</h2><div class="legend">${pgKey('Points sold', 'var(--good)', 1)}${pgKey('Buy-mug', 'var(--bad)', 1)}</div><span class="sp"></span><div class="seg">${PG_UNITS.map(([u, label]) => `<button data-act="unit" data-v="${u}"${ui.unit === u ? ' class="on"' : ''}>${label}</button>`).join('')}</div></div><div class="pb"><div class="chart" data-chart="profit"></div></div></div>
        <div class="col">
          <div class="panel grow minc" data-k="cum"><div class="ph"><h2>Running total</h2><span class="sp"></span><span class="sub">14 days</span></div><div class="pb"><div class="chart" data-chart="cum"></div></div></div>
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
    const badge = !k.set ? '<span class="badge">not set</span>' : k.error ? `<span class="badge bad">${hEsc(k.error)}</span>` : k.ok ? '<span class="badge ok">working</span>' : '<span class="badge">checking</span>';
    const box = k.set
        ? `<span class="inp key"${k.shown ? ' style="letter-spacing:0;color:var(--text)"' : ''}>${k.shown ? hEsc(k.shown) : '••••••••••••••••'}</span><button class="btn" data-act="key-show" data-v="${kind}">${k.shown ? 'Hide' : 'Show'}</button><button class="btn" data-act="key-forget" data-v="${kind}">Forget</button>`
        : `<input class="inp key" type="password" data-key="${kind}" placeholder="Paste it here" autocomplete="off" spellcheck="false" style="letter-spacing:0"><button class="btn go" data-act="key-save" data-v="${kind}">Save</button>`;
    return `<div class="panel" data-k="key-${kind}"><div class="ph"><h2>${title}</h2><span class="sp"></span>${badge}</div><div class="pb">
          <div style="display:flex;gap:8px">${box}</div>
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
    rows.push(['What it is told', (s.builtIn ? 'Your Torn id, to know whose copy this is. Then bazaar' : 'Bazaar') + ' and item numbers, prices and counts. Never a key, your stock or your money']);
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
          <div class="field"><span class="f-l">Sets to build at once<span>from cash: kept as it is while a list is on hand</span></span>${pgSeg('targetMode', s.targetMode, [['cash', 'From my cash and stock'], ['number', 'A number']])}${s.targetMode === 'number' ? pgInput('target', s.target, 56) : ''}</div>
          <div class="field"><span class="f-l">Most of my money in sets and points<span>0 = no limit</span></span>${pgInput('shareMax', s.shareMax, 56, '%')}</div>
          <div class="field"><span class="f-l">Least profit on a set</span>${pgInput('least', hRate(s.least), 56, '%')}</div>
          <div class="field"><span class="f-l">Read prices every</span>${pgSeg('readMin', s.readMin, READ_CHOICES.map((m) => [m, m + ' min']))}</div>
        </div></div>
        <div class="panel" data-k="rules"><div class="ph"><h2>Points and Torn's pages</h2></div><div class="pb">
          <div class="field"><span class="f-l">Points price to type</span>${pgSeg('pointsRule', s.pointsRule, [['wall', 'Under the first wall'], ['lowest', 'Under the lowest']])}</div>
          <div class="field"><span class="f-l">When points are under their usual level</span>${pgSeg('cheapRule', s.cheapRule, [['hold', 'Hold'], ['tell', 'Tell me only']])}</div>
          <div class="field"><span class="f-l">Fill at the museum<span>You press EXCHANGE</span></span>${pgSeg('fillMuseum', s.fillMuseum ? 1 : 0, [[1, 'On'], [0, 'Off']])}</div>
          <div class="field"><span class="f-l">Fill at the points market<span>You press ADD LISTING</span></span>${pgSeg('fillPoints', s.fillPoints ? 1 : 0, [[1, 'On'], [0, 'Off']])}</div>
        </div></div>
        <div class="panel" data-k="tell"><div class="ph"><h2>Tell me when</h2><span class="sp"></span><button class="btn sm" data-act="notify-test">Try it</button></div><div class="pb">
          <div class="field"><span class="f-l">Someone opens a trade with you<span>Seen within a minute, with a Torn tab or this page open</span></span>${pgSeg('notify', s.notify, [['browser', 'Browser'], ['app', 'In the app'], ['off', 'Off']])}</div>
          <div class="field"><span class="f-l">Sound</span>${pgSeg('sound', s.sound ? 1 : 0, [[1, 'On'], [0, 'Off']])}</div>
          ${n ? `<div class="field" style="display:block"><div class="osn"><span class="mark">${hIcon('brand')}</span><div><b>${hEsc(n.title)}</b><span class="s">${hEsc(n.body)}</span></div></div></div>` : ''}
          <div class="field"><span class="f-l t-muted" style="font-size:12px">Also a count on the browser tab and on Trades in the sidebar. Nothing is accepted or sent for you.</span></div>
        </div></div>
      </div>
      <div class="panel grow minc" data-k="share"><div class="ph"><h2>Share of your money in sets and points</h2><span class="sp"></span><span class="sub">now ${hPct(v.share.share)} · 14 days</span></div><div class="pb"><div class="chart" data-chart="share"></div></div></div>
    </div></section>`;
    }
    return `<section class="page p-tabs on"><div class="pane g1 on" style="grid-template-rows:auto minmax(0,1fr)">
      <div class="tiles" style="--n:5">
        ${PG_KEYS.map((k) => pgKeyBox(k, d)).join('')}
        ${pgServer(d)}
        <div class="panel" data-k="help"><div class="ph"><h2>Help</h2><span class="sp"></span><span class="sub">${d.version ? 'Torn Archive ' + hEsc(d.version) : ''}</span></div><div class="pb"><div class="rows">
          <div class="row"><span class="grow1"><b>Report a problem.</b> One zip on your computer. No key in it, nothing is sent.</span><button class="btn sm go" data-act="zip">Make the zip</button></div>
          <div class="row"><span class="grow1"><b>Beside Torn Trading.</b> Both run. The one whose page you look at asks more, the other less.</span></div>
          <div class="row"><span class="grow1 t-muted">TornW3B is sent item numbers only. The key you registered there goes with your own price list and receipts, nothing else.</span></div>
        </div></div></div>
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

/** What one graph draws. @returns { kind: 'line' | 'col', cfg } or null when the page has no such graph */
export function hubChart(name, d, ui) {
    const v = d.view;
    const line = (cfg) => ({ kind: 'line', cfg });
    const col = (cfg) => ({ kind: 'col', cfg });
    const count = (n) => hNum(n);
    if (name === 'pts' || name === 'pts2') {
        const c = v.points.chart;
        const n = ui.range[name] || 40;
        return line({
            x: c.x.slice(-n).map(hDay), none: 'The points price is kept by day from the first read: this fills as the days pass.',
            series: [{ name: 'First wall', color: 'var(--s-gold)', data: c.wall.slice(-n), area: true }, { name: 'Lowest listing', color: 'var(--s-violet)', data: c.low.slice(-n) }],
            band: c.usual ? { lo: c.usual.lo, hi: c.usual.hi, name: 'Usual range, 30 days', last: 30 } : null,
            refs: c.least ? [{ y: c.least, name: `Your least price ${hMoney(c.least)}: under this the points are a loss` }] : [],
        });
    }
    if (name === 'margin') {
        const days = v.dash.paysDays;
        return line({
            x: days.map((p) => hDay(p.day)), zero: true, none: 'What a set pays is kept by day from the first read: this fills as the days pass.',
            series: v.sets.map((s) => ({ name: s.name, color: s.color, data: days.map((p) => p[s.key] || 0) })),
            refs: v.prices.chart.least ? [{ y: v.prices.chart.least, name: `Your least profit, ${hRate(v.prices.least)}%` }] : [],
        });
    }
    if (name === 'depth') {
        const c = v.buy.depth;
        if (!c) return line({ x: [], series: [], none: 'Too few listings to say how deep the cheap pieces go.' });
        return line({
            x: c.x, xticks: c.x.filter((k) => k === 1 || k >= 100), xfmt: (k) => 'set ' + k, tipx: (k) => `The ${k}${pgSt(k)} set you buy costs`, left: 70,
            series: c.series.map((s) => ({ name: s.name, color: s.color, data: s.data })),
            refs: c.value ? [{ y: c.value, name: `A set at today's points price, ${hMoney(c.value)}` }, { y: c.safe, name: `With your least profit, ${hMoney(c.safe)}: buy while under this` }] : [],
        });
    }
    if (name === 'swapped') {
        const c = v.ledger.swapped;
        return col({ x: c.x.map(hDay), left: 34, yfmt: count, none: 'No set swapped at the museum in 14 days.', series: v.sets.map((s) => ({ name: s.label + ' sets', color: s.color, data: c[s.key] })) });
    }
    if (name === 'bought') {
        const c = v.ledger.where;
        return col({ x: c.x.map(hDay), left: 44, yfmt: count, none: 'No piece bought in 14 days.', series: [{ name: 'Bazaars', color: 'var(--s-gold)', data: c.bazaar }, { name: 'Item Market', color: 'var(--s-violet)', data: c.market }, { name: 'Trades with you', color: 'var(--s-aqua)', data: c.trade }] });
    }
    if (name === 'profit') {
        const b = ui.unit === 'week' ? v.ledger.weeks : ui.unit === 'month' ? v.ledger.months : v.ledger.days;
        const x = b.map((k) => (ui.unit === 'month' ? PG_MONTH[new Date(k.start).getUTCMonth()] : ui.unit === 'week' ? pgWeek(k) : hDay(k.day)));
        return col({ x, yfmt: hShort, none: 'Profit is counted when points sell: none sold yet.', series: [{ name: 'Points sold', color: 'var(--good)', data: b.map((k) => k.sold) }, { name: 'Buy-mug', color: 'var(--bad)', data: b.map((k) => k.mug) }] });
    }
    if (name === 'cum') return line({ x: v.ledger.days.map((k) => hDay(k.day)), zero: true, yfmt: hShort, right: 62, series: [{ name: 'Running total', color: 'var(--s-aqua)', data: v.ledger.cum, area: true }] });
    if (name === 'held') return line({ x: v.points.heldDays.map((k) => hDay(k.day)), zero: true, yfmt: count, left: 44, right: 44, series: [{ name: 'Points held', color: 'var(--s-gold)', data: v.points.heldDays.map((k) => k.left), area: true }] });
    if (name === 'rate') {
        const c = v.prices.chart;
        return line({
            x: c.x, xticks: c.x.filter((r) => r === Math.round(r)), xfmt: (r) => r + '%', tipx: (r) => `Paying ${r}% of market value`, zero: true,
            none: 'Waiting for prices.', series: c.least ? c.series.map((s) => ({ name: s.name, color: s.color, data: s.data })) : [],
            refs: c.least ? [{ y: c.least, name: `Your least profit, ${hRate(v.prices.least)}%` }] : [],
        });
    }
    if (name === 'share') {
        const days = v.share.days;
        return line({ x: days.map((k) => hDay(k.day)), zero: true, yfmt: (n) => n + '%', left: 44, right: 44, none: 'Kept by day from the first read: this fills as the days pass.', series: [{ name: 'In sets and points', color: 'var(--s-violet)', data: days.map((k) => k.share), area: true }], refs: v.share.max ? [{ y: v.share.max, name: `Your limit, ${v.share.max}%` }] : [] });
    }
    if (name === 'usage') {
        const u = d.usage || {};
        const x = (u.torn || []).map((_, i) => i);
        const last = x.length - 1;
        return line({ x, xfmt: (i) => (last - i ? (last - i) + ' min ago' : 'now'), zero: true, yfmt: count, left: 40, right: 40, none: 'No request yet.', series: [{ name: 'Torn', color: 'var(--s-plush)', data: u.torn || [] }, { name: 'TornW3B', color: 'var(--s-flower)', data: u.w3b || [] }], refs: [{ y: TORN_PER_MINUTE_ALONE, name: `Limit when alone: Torn ${TORN_PER_MINUTE_ALONE}, TornW3B ${W3B_PER_MINUTE_ALONE}` }] });
    }
    return null;
}
