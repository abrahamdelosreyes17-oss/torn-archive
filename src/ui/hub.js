// The hub: Torn Archive's own page. It owns the whole document it is mounted on (never a Torn page).
// It draws what the engine holds and hands every press back to the engine as an action; it reads nothing and
// stores nothing itself, save which page you were on and whether the sidebar is pinned.

import { HUB_CSS } from './hub-css.js';
import { hEsc, hMoney, hShort, hRate, hAge, hIcon, hPic } from './fmt.js';
import { lineChart, colChart } from './charts.js';
import { HUB_PAGES, hubTabs, hubPage, hubChart } from './hub-pages.js';
import { SET_LOOK } from '../core/view.js';

// What the drawing's stylesheet has no word for: real boxes to type in, links that look like buttons, an empty graph.
const HUB_CSS_MORE = `
input.inp { font: inherit; font-variant-numeric: tabular-nums; outline: 0; min-width: 0; }
input.inp:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-bg); }
input.inp::placeholder { color: var(--faint); }
a.btn { text-decoration: none; }
.btn[disabled] { opacity: .45; pointer-events: none; }
.ch-none { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; padding: 0 24px; color: var(--muted); font-size: 12px; }
.view.still [data-k] *, .view.still [data-k] { animation: none !important; }
.pill.warn { border-color: rgba(245,165,36,.4); cursor: pointer; }
.shop.shut .dot { background: var(--faint); } .shop.shut .lab b { color: var(--text2); }
`;

const HUB_BOOL = new Set(['open', 'fillMuseum', 'fillPoints', 'sound', 'w3bSync']);
const HUB_NUM = new Set(['pct', 'least', 'target', 'shareMax', 'readMin', 'beforeEach']);
const HUB_PIN_KEY = 'tarc-pin';
/** The piece open on "Sold by" is named to the engine when it changes, and again this often while it stays open. */
const HUB_LOOK_EVERY_MS = 60 * 1000;
const HUB_TITLE = 'Torn Archive';

function hubShell() {
    let nav = '<div class="nav-ind" id="ind"></div>';
    for (const p of HUB_PAGES) {
        if (p.group) nav += `<div class="nav-g"><span class="lab">${p.group}</span></div>`;
        if (p.last) nav += '<span class="sp"></span>';
        nav += `<button class="nav-b" data-go="${p.key}">${hIcon(p.icon)}${p.key === 'trades' ? '<i class="pip" id="nav-pip" hidden></i>' : ''}<span class="lab">${p.title}</span><span class="lab cnt" id="cnt-${p.key}" hidden></span></button>`;
    }
    return `<div class="app" id="app">
<aside class="side" id="side"><div class="side-in">
  <div class="brand"><div class="mark">${hIcon('brand')}</div><div class="lab"><b>Torn Archive</b><span>Sets and points</span></div><button class="pin lab" id="pin" title="Keep the sidebar open">${hIcon('pin')}</button></div>
  <nav class="nav" id="nav">${nav}</nav>
  <div class="side-f"><div class="shop" id="shop"><span class="dot"></span><span class="lab" id="shop-l"></span></div></div>
</div></aside>
<div class="main">
  <header class="top" id="top">
    <h1 id="title"></h1>
    <nav class="tabs" id="tabs"></nav>
    <span class="sp"></span>
    <span class="pill" id="pill-pts"></span>
    <span class="pill opt" id="pill-hand"></span>
    <span class="pill opt" id="pill-vault"></span>
    <span class="pill" id="pill-age"></span>
    <button class="btn" data-act="read">Read now</button>
  </header>
  <div class="view" id="view"></div>
  <footer class="tape"><div class="tape-l">Cheapest now</div><div class="tape-m"><div class="tape-t" id="tape"></div></div></footer>
  <div class="toast" id="toast"><span class="nx-i" style="--c:#c9bfff;--c-bg:var(--brand-bg)">${hIcon('trades')}</span><div><b id="toast-t"></b><span class="s" id="toast-s"></span></div><button class="btn sm go" id="toast-go">See it</button><button class="x" id="toast-x" title="Close">×</button></div>
  <div class="paused" id="paused"><div class="card" id="paused-card"></div></div>
</div>
</div>`;
}

/**
 * Put the hub on a document and return its handle.
 * @param doc     the document to take over
 * @param actions what a press asks of the engine: set(patch), cart(itemId, place), drop(lineKey), makeList(),
 *                clearList(), run('start' | 'next' | 'stop'), read(), readStock(), copy(text), keySave(kind, value), keyForget(kind),
 *                keyShow(kind), zip(), w3b('send' | 'read'), receipt(tradeId), usageExport(), notifyTest(), here()
 * @returns { show(desk), toast({ title, body, tradeId }), go(page, pane) }
 */
export function mountHub(doc, actions) {
    const win = doc.defaultView;
    const $ = (s, r = doc) => r.querySelector(s);
    const $$ = (s, r = doc) => [...r.querySelectorAll(s)];
    const style = doc.createElement('style');
    style.textContent = HUB_CSS + HUB_CSS_MORE;
    doc.head.appendChild(style);
    doc.body.innerHTML = hubShell();

    const ui = { page: 'dashboard', pane: 0, sel: null, trade: null, range: { pts: 40, pts2: 40 }, unit: 'day', imKey: '' };
    let desk = null;
    let shown = '';
    let tabsShown = '';
    let toastTrade = null;
    let toastT = 0;
    let looked = { id: '', at: 0 };
    const view = $('#view');
    const app = $('#app');
    const side = $('#side');
    const act = (name, ...args) => { try { if (actions && actions[name]) return actions[name](...args); } catch (e) { win.console.error('[Torn Archive]', name, e); } return undefined; };

    // ---- drawing -------------------------------------------------------------------------------------------------

    function drawCharts(anim) {
        for (const el of $$('.chart[data-chart]', view)) {
            if (el.offsetParent === null) continue;
            const c = hubChart(el.dataset.chart, desk, ui);
            if (!c) continue;
            const sig = el.clientWidth + 'x' + el.clientHeight + JSON.stringify(c.cfg);
            if (el._sig === sig && el.firstChild) continue;
            el._sig = sig;
            (c.kind === 'col' ? colChart : lineChart)(el, c.cfg, anim);
        }
    }

    function countUp() {
        if (win.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        for (const el of $$('.k-v, .hero', view)) {
            const node = el.firstChild;
            if (!node || node.nodeType !== 3) continue;
            const txt = node.textContent;
            const m = txt.match(/[\d,]+/);
            if (!m) continue;
            const to = Number(m[0].replace(/,/g, ''));
            const t0 = win.performance.now();
            const step = (t) => {
                if (!node.isConnected) return;
                const k = Math.min(1, (t - t0) / 650);
                node.textContent = txt.replace(m[0], Math.round(to * (1 - Math.pow(1 - k, 3))).toLocaleString('en-US'));
                if (k < 1) win.requestAnimationFrame(step);
            };
            win.requestAnimationFrame(step);
        }
    }

    /** The page's string into the view: the whole page when it is another one, else only the parts that differ. */
    function patch(html, fresh) {
        const tpl = doc.createElement('template');
        tpl.innerHTML = html;
        const next = tpl.content.firstElementChild;
        const cur = view.firstElementChild;
        const keyed = (root) => [...root.querySelectorAll('[data-k]')];
        if (!fresh && cur) {
            const a = keyed(cur);
            const b = keyed(next);
            if (a.length === b.length && a.every((el, i) => el.dataset.k === b[i].dataset.k)) {
                view.classList.add('still');
                b.forEach((el, i) => {
                    const src = el.innerHTML;
                    if (a[i]._src === src) return;
                    // A box being typed in is left alone until you leave it.
                    const at = doc.activeElement;
                    if (at && at.tagName === 'INPUT' && a[i].contains(at)) return;
                    a[i].innerHTML = src;
                    a[i].className = el.className;
                    a[i]._src = src;
                });
                return false;
            }
        }
        view.classList.remove('still');
        view.replaceChildren(next);
        keyed(next).forEach((el) => { el._src = el.innerHTML; });
        $$('.panel', view).forEach((p, k) => p.style.setProperty('--i', k));
        return true;
    }

    function drawShell() {
        const v = desk.view;
        const page = HUB_PAGES.find((p) => p.key === ui.page) || HUB_PAGES[0];
        $('#title').textContent = page.title;
        const tabs = hubTabs(ui.page, desk);
        const tabsHtml = tabs.map((t, i) => `<button class="tab${i === ui.pane ? ' on' : ''}" data-tab="${i}">${hEsc(t)}</button>`).join('');
        if (tabsHtml !== tabsShown) { $('#tabs').innerHTML = tabsHtml; tabsShown = tabsHtml; }
        for (const b of $$('.nav-b')) b.classList.toggle('on', b.dataset.go === ui.page);
        const cur = $('.nav-b.on');
        if (cur) $('#ind').style.transform = `translateY(${cur.offsetTop}px)`;
        const cnt = (key, text, hot) => { const el = $('#cnt-' + key); el.hidden = !text; el.textContent = text || ''; el.classList.toggle('hot', !!hot); };
        cnt('stock', v.nav.full ? v.nav.full + (v.nav.full === 1 ? ' set' : ' sets') : '');
        cnt('buy', v.nav.need ? v.nav.need + ' need' : '');
        cnt('trades', v.nav.trades ? v.nav.trades + ' open' : '', true);
        $('#nav-pip').hidden = !v.nav.hot;
        $('#shop').classList.toggle('shut', !v.shop.open);
        $('#shop-l').innerHTML = `Shop <b>${v.shop.open ? 'Open' : 'Closed'}</b> · ${v.shop.paid || hRate(v.shop.pct) + '%'}`;
        const pts = $('#pill-pts');
        const ptsHtml = v.top.points ? `Points <b class="num">${hMoney(v.top.points)}</b>${v.top.cheap ? '<span class="dn">▼ under its usual level</span>' : ''}` : 'Points <b>not read</b>';
        if (pts._src !== ptsHtml) {
            const flash = pts._src && v.top.points;
            pts.innerHTML = ptsHtml;
            pts._src = ptsHtml;
            if (flash) { pts.classList.remove('flash'); void pts.offsetWidth; pts.classList.add('flash'); }
        }
        const pill = (id, label, n) => { const el = $(id); el.hidden = n == null; if (n != null) el.innerHTML = `${label} <b class="num">${n >= 1e7 ? hShort(n) : hMoney(n)}</b>`; };
        pill('#pill-hand', 'On hand', v.top.onHand);
        pill('#pill-vault', 'Vault', v.top.vault);
        drawAge();
        const tape = v.tape.map((t) => `<span class="tk">${hPic(t.id, t.name, '', (SET_LOOK[t.set] || {}).color || '')}<b>${hEsc(t.name)}</b><span class="num">${hMoney(t.price)}</span></span>`).join('');
        const tapeEl = $('#tape');
        if (tapeEl._src !== tape) { tapeEl.innerHTML = tape + tape; tapeEl._src = tape; }
        doc.title = (v.nav.trades ? `(${v.nav.trades}) ` : '') + HUB_TITLE;
        drawPaused();
        fitTop();
    }

    function drawAge() {
        if (!desk) return;
        const el = $('#pill-age');
        const keys = desk.keys || {};
        const noKey = !(keys.limited && keys.limited.set);
        el.classList.toggle('warn', noKey);
        const html = noKey ? '<b class="dn">No key yet: paste one in Settings</b>' : `<i class="live"></i>Prices <b>${hAge(desk.view.top.pricesAt, Date.now())}</b>`;
        if (el._src !== html) { el.innerHTML = html; el._src = html; }
    }

    function drawPaused() {
        // Another of your tabs has Torn Archive open and does the reading: nothing is asked twice.
        const away = !!desk.elsewhere;
        $('#paused').classList.toggle('on', away);
        if (!away) return;
        const card = $('#paused-card');
        const html = `<h2><span class="dot"></span>Torn Archive is open in another tab.</h2>
    <p>That tab does the reading, so nothing is asked of Torn twice. Go back to it, or go on here.</p>
    <p><button class="btn go" data-act="here">Use this tab</button></p>`;
        if (card._src !== html) { card.innerHTML = html; card._src = html; }
    }

    function fitTop() {
        const t = $('#top');
        t.classList.remove('tight', 'tighter');
        if (t.scrollWidth > t.clientWidth) t.classList.add('tight');
        if (t.scrollWidth > t.clientWidth) t.classList.add('tighter');
    }

    function draw(fresh) {
        if (!desk) return;
        drawShell();
        const html = hubPage(desk, ui);
        // The piece whose sellers are on the screen: its bazaars are checked with Torn itself. Told when the piece
        // changes and once a minute while it stays - never on every draw: until 1.3.0 the telling asked for a draw,
        // and the Buy page drew itself without end.
        if (ui.page === 'buy' && ui.shown) {
            const t = Date.now();
            if (looked.id !== ui.shown || t - looked.at >= HUB_LOOK_EVERY_MS) { looked = { id: ui.shown, at: t }; act('look', ui.shown); }
        } else looked = { id: '', at: 0 };
        if (!fresh && html === shown) { drawCharts(false); return; }
        shown = html;
        const whole = patch(html, fresh);
        if (whole) { view.scrollTop = 0; countUp(); }
        drawCharts(whole);
    }

    /** The address keeps the page. A new page is a new step for the browser's Back; a tab only updates the step it is on. */
    function remember(step) {
        try { win.history[step ? 'pushState' : 'replaceState']({ page: ui.page, pane: ui.pane }, '', '#' + ui.page); } catch { /* a page that cannot keep its address still works */ }
    }

    /** What the address says: '#buy' a page, '#buy/186' the Buy page on one piece. */
    function hashPage() {
        const [page, id] = (win.location.hash || '#dashboard').slice(1).split('/');
        return { page, id: /^\d+$/.test(id || '') ? id : '' };
    }

    function go(page, pane = 0) {
        const was = ui.page;
        ui.page = HUB_PAGES.some((p) => p.key === page) ? page : 'dashboard';
        ui.pane = Math.max(0, Number(pane) || 0);
        remember(ui.page !== was);
        draw(true);
    }

    // Back and Forward: the browser says which step it is on, and that page is shown. Nothing is added to the steps here.
    win.addEventListener('popstate', (e) => {
        const at = e.state || {};
        const page = at.page || hashPage().page;
        ui.page = HUB_PAGES.some((p) => p.key === page) ? page : 'dashboard';
        ui.pane = Math.max(0, Number(at.pane) || 0);
        draw(true);
    });

    // ---- presses ---------------------------------------------------------------------------------------------------

    function setValue(key, raw) {
        if (HUB_BOOL.has(key)) return raw === true || raw === '1' || raw === 1;
        if (HUB_NUM.has(key)) { const n = Number(String(raw).replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : 0; }
        return raw;
    }

    function press(el, e) {
        const a = el.dataset.act;
        const v = el.dataset.v;
        const id = el.dataset.id;
        if (a === 'set') act('set', { [id]: setValue(id, v) });
        else if (a === 'which') { const which = { ...desk.view.settings.which }; which[v] = !which[v]; act('set', { which }); }
        else if (a === 'pick') { ui.sel = id; const p = desk.view.pieces.find((x) => String(x.id) === id); go('buy', p && p.need ? 0 : 1); }
        else if (a === 'sel') { ui.sel = id; draw(false); }
        else if (a === 'trade') { ui.trade = id; draw(false); }
        else if (a === 'range') { ui.range[id] = Number(v); draw(false); }
        else if (a === 'unit') { ui.unit = v; draw(false); }
        // Where a list may send you: pressing the only place still lit swaps to the other one, so one is always on.
        else if (a === 'from') { const from = { ...desk.view.settings.from }; from[v] = !from[v]; if (!from.bazaar && !from.market) from[v === 'bazaar' ? 'market' : 'bazaar'] = true; act('set', { from }); }
        else if (a === 'cart') act('cart', id, v);
        else if (a === 'cart-all') act('cartAll', id);
        // A list of this piece alone, and the list is shown: as "Make the list", for one piece.
        else if (a === 'list-only') { act('listOnly', id); go('buy', 2); }
        else if (a === 'drop') act('drop', v);
        else if (a === 'make-list') { act('makeList', v || ''); go('buy', 2); }
        else if (a === 'clear-list') act('clearList');
        // Start and Next are links: the press opens the bazaar itself, here the run only moves on.
        else if (a === 'run') { ui.imKey = ''; act('run', v); }
        // The Item Market stop: the link opened the next piece's page; the run stays on the stop.
        else if (a === 'im-walk') { ui.imKey = v; draw(false); }
        else if (a === 'copy') { act('copy', v); const was = el.textContent; el.textContent = 'Copied ✓'; win.setTimeout(() => { if (el.isConnected) el.textContent = was; }, 1400); }
        else if (a === 'key-save') { const box = $(`input[data-key="${v}"]`); const key = box ? box.value.trim() : ''; if (key) { box.value = ''; act('keySave', v, key); } }
        else if (a === 'key-forget') act('keyForget', v);
        else if (a === 'key-show') act('keyShow', v);
        else if (a === 'server-save') { const at = $('input[data-server="address"]'); const pw = $('input[data-server="pass"]'); act('serverSave', at ? at.value.trim() : '', pw ? pw.value.trim() : ''); if (pw) pw.value = ''; }
        else if (a === 'server-forget') act('serverForget');
        else if (a === 'receipt') act('receipt', id);
        else if (a === 'w3b') act('w3b', v);
        else if (a === 'zip') act('zip');
        else if (a === 'usage-export') act('usageExport');
        else if (a === 'notify-test') act('notifyTest');
        else if (a === 'read') act('read');
        else if (a === 'read-stock') { act('readStock'); const was = el.textContent; el.textContent = 'Asked ✓'; win.setTimeout(() => { if (el.isConnected) el.textContent = was; }, 1400); }
        else if (a === 'here') act('here');
        if (el.tagName !== 'A') e.preventDefault();
    }

    doc.addEventListener('click', (e) => {
        const t = e.target;
        const tab = t.closest('[data-tab]');
        if (tab) { ui.pane = Number(tab.dataset.tab); remember(false); draw(true); return; }
        const a = t.closest('[data-act]');
        if (a) { press(a, e); return; }
        const g = t.closest('[data-go]');
        if (g) go(g.dataset.go, g.dataset.pane);
    });
    doc.addEventListener('change', (e) => {
        const el = e.target;
        if (el.dataset && el.dataset.set) act('set', { [el.dataset.set]: setValue(el.dataset.set, el.value) });
    });
    doc.addEventListener('keydown', (e) => {
        const typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
        if (typing && e.key === 'Enter') { e.target.blur(); const k = e.target.dataset.key; if (k) { const b = $(`[data-act="key-save"][data-v="${k}"]`); if (b) b.click(); } if (e.target.dataset.server) { const b = $('[data-act="server-save"]'); if (b) b.click(); } return; }
        if (typing || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== 'n' || ui.page !== 'buy') return;
        const next = $('[data-act="im-walk"], [data-act="run"][data-v="next"]', view);
        if (next) next.click();
    });
    // A picture Torn does not serve gives way to the piece's letters.
    doc.addEventListener('error', (e) => { const t = e.target; if (t && t.tagName === 'IMG' && t.dataset.ab != null && t.parentNode) t.parentNode.textContent = t.dataset.ab; }, true);

    // ---- the sidebar, the toast, the clock ---------------------------------------------------------------------------

    let sideT = 0;
    const openSide = (on) => { win.clearTimeout(sideT); sideT = win.setTimeout(() => side.classList.toggle('open', on), on ? 80 : 240); };
    side.addEventListener('mouseenter', () => openSide(true));
    side.addEventListener('mouseleave', () => openSide(false));
    side.addEventListener('focusin', () => openSide(true));
    side.addEventListener('focusout', () => openSide(false));
    const pinned = () => { try { return win.localStorage.getItem(HUB_PIN_KEY) === '1'; } catch { return false; } };
    if (pinned()) app.classList.add('pinned');
    $('#pin').onclick = () => {
        const on = app.classList.toggle('pinned');
        $('#pin').title = on ? 'Let the sidebar close' : 'Keep the sidebar open';
        try { win.localStorage.setItem(HUB_PIN_KEY, on ? '1' : '0'); } catch { /* the pin then lasts until the page closes */ }
    };

    const toastOn = (on) => $('#toast').classList.toggle('on', on);
    $('#toast-x').onclick = () => toastOn(false);
    $('#toast-go').onclick = () => { if (toastTrade) ui.trade = toastTrade; toastOn(false); go('trades'); };
    function toast({ title, body, tradeId }) {
        $('#toast-t').textContent = title || '';
        $('#toast-s').textContent = body || '';
        toastTrade = tradeId || null;
        toastOn(true);
        win.clearTimeout(toastT);
        toastT = win.setTimeout(() => toastOn(false), 9000);
    }

    win.setInterval(drawAge, 1000);
    let rz = 0;
    if (win.ResizeObserver) new win.ResizeObserver(() => { win.clearTimeout(rz); rz = win.setTimeout(() => { if (desk) { drawCharts(false); const cur = $('.nav-b.on'); if (cur) $('#ind').style.transform = `translateY(${cur.offsetTop}px)`; fitTop(); } }, 150); }).observe(view);

    // Opened from a piece of "Your stock" on a Torn page (#buy/<item id>): the Buy page, on that piece.
    const from = hashPage();
    ui.page = from.page;
    if (!HUB_PAGES.some((p) => p.key === ui.page)) ui.page = 'dashboard';
    if (ui.page === 'buy' && from.id) { ui.sel = from.id; ui.arrive = true; }

    return {
        /** @param d { view, keys, usage, turns, busy, notice, version, elsewhere } */
        show(d) {
            const first = !desk;
            desk = d;
            // The piece the address named: its table is the one it is in, as a press on a piece chooses it.
            if (ui.arrive && d.view && d.view.pieces) { ui.arrive = false; const p = d.view.pieces.find((x) => String(x.id) === String(ui.sel)); if (p) ui.pane = p.need ? 0 : 1; else ui.sel = null; }
            draw(first);
        },
        toast,
        go,
    };
}

