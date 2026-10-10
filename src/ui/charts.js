// The hub's graphs: a line graph, a column graph and a small line for a table cell. Each draws one SVG into the
// element it is given, at the element's own size; nothing is loaded. Taken from drawing AB.

import { hMoney } from './fmt.js';

const chCss = (el, v) => getComputedStyle(el.ownerDocument.documentElement).getPropertyValue(v).trim();
const chClamp = (v, a, b) => Math.max(a, Math.min(b, v));
// 'var(--s-gold)' -> the colour itself, for a gradient stop (a gradient cannot read a variable everywhere).
const chColor = (el, c) => (/^var\(/.test(c) ? chCss(el, c.slice(4, -1)) : c);
let chUid = 0;

/** Round steps for an axis: [lo, ..., hi] covering the range. */
export function chTicks(lo, hi, n) {
    if (!(hi > lo)) hi = lo + 1;
    const raw = (hi - lo) / n;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / mag;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
    const out = [];
    for (let v = Math.floor(lo / step) * step; v < hi + step * 0.999; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return out;
}

const chPick = (n, k) => { k = Math.min(n, Math.max(2, k)); return [...new Set(Array.from({ length: k }, (_, i) => Math.round(i * (n - 1) / (k - 1))))]; };

function chTip(el) {
    let t = el.querySelector('.tip');
    if (!t) { t = el.ownerDocument.createElement('div'); t.className = 'tip'; el.appendChild(t); }
    return t;
}
function chPlaceTip(t, x, y, W) {
    t.classList.add('on');
    const w = t.offsetWidth;
    t.style.left = (x + 14 + w > W ? x - w - 14 : x + 14) + 'px';
    t.style.top = Math.max(0, y - 20) + 'px';
}
const chEmpty = (el, words) => { el.innerHTML = `<div class="ch-none">${words}</div>`; };

/**
 * @param c { x: [label | number], series: [{ name, color, data, area }], refs: [{ y, name }], band: { lo, hi, name, last },
 *            zero, left, right, yfmt, xfmt, tipx, xticks, none }
 * @param anim draw the lines in (on a page's first showing only)
 */
export function lineChart(el, c, anim) {
    const W = el.clientWidth;
    const H = el.clientHeight;
    if (W < 80 || H < 60) return;
    const xs = c.x || [];
    const n = xs.length;
    if (n < 2 || !c.series.length) { chEmpty(el, c.none || 'Fills as the days pass.'); return; }
    const m = { l: c.left || 62, r: c.right == null ? 70 : c.right, t: 12, b: 24 };
    const isNum = typeof xs[0] === 'number';
    const xv = (i) => (isNum ? xs[i] : i);
    const xa = xv(0);
    const xb = xv(n - 1);
    const px = (i) => m.l + (xv(i) - xa) / (xb - xa) * (W - m.l - m.r);
    let lo = Infinity;
    let hi = -Infinity;
    const see = (v) => { if (v < lo) lo = v; if (v > hi) hi = v; };
    c.series.forEach((s) => s.data.forEach(see));
    (c.refs || []).forEach((r) => see(r.y));
    if (c.band) { see(c.band.lo); see(c.band.hi); }
    if (c.zero) see(0);
    const tk = chTicks(lo, hi, Math.max(2, Math.round((H - m.t - m.b) / 48)));
    lo = tk[0];
    hi = tk[tk.length - 1];
    const py = (v) => m.t + (hi - v) / (hi - lo) * (H - m.t - m.b);
    const yf = c.yfmt || hMoney;
    const xf = c.xfmt || ((v) => v);
    const id = 'g' + (++chUid);
    const panel = chCss(el, '--panel');
    let g = '<defs>' + c.series.map((s, k) => (s.area ? `<linearGradient id="${id}-${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${chColor(el, s.color)}" stop-opacity=".13"/><stop offset="1" stop-color="${chColor(el, s.color)}" stop-opacity="0"/></linearGradient>` : '')).join('') + '</defs>';
    tk.forEach((t) => { g += `<line class="g" x1="${m.l}" x2="${W - m.r}" y1="${py(t)}" y2="${py(t)}"/><text class="ax" x="${m.l - 8}" y="${py(t) + 4}" text-anchor="end">${yf(t)}</text>`; });
    const ix = c.xticks ? c.xticks.map((v) => xs.indexOf(v)).filter((i) => i >= 0) : chPick(n, Math.floor((W - m.l - m.r) / 88));
    ix.forEach((i) => { g += `<text class="ax" x="${px(i)}" y="${H - 5}" text-anchor="${i === 0 ? 'start' : 'middle'}">${xf(xs[i])}</text>`; });
    if (c.band) {
        const b0 = px(Math.max(0, n - (c.band.last || n)));
        g += `<rect class="${anim ? 'fade' : ''}" x="${b0}" y="${py(c.band.hi)}" width="${px(n - 1) - b0}" height="${py(c.band.lo) - py(c.band.hi)}" fill="rgba(255,255,255,.055)" rx="3"/><text class="rl" x="${b0 + 8}" y="${py(c.band.hi) - 7}">${c.band.name}</text>`;
    }
    (c.refs || []).forEach((r) => { g += `<line x1="${m.l}" x2="${W - m.r}" y1="${py(r.y)}" y2="${py(r.y)}" stroke="${chCss(el, '--muted')}" stroke-dasharray="4 4"/><text class="rl" x="${m.l + 8}" y="${py(r.y) - 6}">${r.name}</text>`; });
    const ends = [];
    c.series.forEach((s, k) => {
        const d = s.data.map((v, i) => (i ? 'L' : 'M') + px(i).toFixed(1) + ' ' + py(v).toFixed(1)).join('');
        if (s.area) g += `<path class="${anim ? 'fade' : ''}" d="${d}L${px(n - 1)} ${py(lo)}L${px(0)} ${py(lo)}Z" fill="url(#${id}-${k})"/>`;
        g += `<path class="ln ${anim ? 'draw' : ''}" pathLength="1" d="${d}" stroke="${s.color}"/>`;
        g += `<circle class="${anim ? 'fade' : ''}" cx="${px(n - 1)}" cy="${py(s.data[n - 1])}" r="4" fill="${s.color}" stroke="${panel}" stroke-width="2"/>`;
        ends.push({ y: py(s.data[n - 1]), t: yf(s.data[n - 1]) });
    });
    if (m.r >= 60) {
        ends.sort((a, b) => a.y - b.y);
        for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;
        ends.forEach((e) => { g += `<text class="lb ${anim ? 'fade' : ''}" x="${px(n - 1) + 9}" y="${e.y + 4}">${e.t}</text>`; });
    }
    g += `<line class="cross" y1="${m.t}" y2="${H - m.b}" visibility="hidden"/>` + c.series.map((s) => `<circle class="hd" r="4.5" fill="${s.color}" stroke="${panel}" stroke-width="2" visibility="hidden"/>`).join('');
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${g}<rect x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="transparent"/></svg>`;
    const svg = el.querySelector('svg');
    const cross = svg.querySelector('.cross');
    const hd = [...svg.querySelectorAll('.hd')];
    const tip = chTip(el);
    svg.onmousemove = (e) => {
        const bx = svg.getBoundingClientRect();
        const mx = (e.clientX - bx.left) * W / bx.width;
        let i = 0;
        let best = 1e9;
        for (let j = 0; j < n; j++) { const dd = Math.abs(px(j) - mx); if (dd < best) { best = dd; i = j; } }
        cross.setAttribute('x1', px(i));
        cross.setAttribute('x2', px(i));
        cross.setAttribute('visibility', 'visible');
        hd.forEach((h, k) => { h.setAttribute('cx', px(i)); h.setAttribute('cy', py(c.series[k].data[i])); h.setAttribute('visibility', 'visible'); });
        tip.innerHTML = `<h4>${(c.tipx || xf)(xs[i])}</h4>` + c.series.map((s) => `<div><i class="key" style="--c:${s.color}"></i>${s.name}<b>${yf(s.data[i])}</b></div>`).join('');
        chPlaceTip(tip, px(i) * bx.width / W, e.clientY - bx.top, bx.width);
    };
    svg.onmouseleave = () => { cross.setAttribute('visibility', 'hidden'); hd.forEach((h) => h.setAttribute('visibility', 'hidden')); tip.classList.remove('on'); };
}

/** Stacked columns. A negative value hangs under the line in red. @param c { x, series, left, yfmt, posneg, none } */
export function colChart(el, c, anim) {
    const W = el.clientWidth;
    const H = el.clientHeight;
    if (W < 80 || H < 60) return;
    const n = (c.x || []).length;
    if (!n || !c.series.some((s) => s.data.some((v) => v))) { chEmpty(el, c.none || 'Nothing yet.'); return; }
    const m = { l: c.left || 62, r: 10, t: 12, b: 24 };
    const yf = c.yfmt || hMoney;
    const tot = c.x.map((_, i) => c.series.reduce((a, s) => a + s.data[i], 0));
    const up = c.x.map((_, i) => c.series.reduce((a, s) => a + Math.max(0, s.data[i]), 0));
    const dn = c.x.map((_, i) => c.series.reduce((a, s) => a + Math.min(0, s.data[i]), 0));
    const tk = chTicks(Math.min(0, ...dn), Math.max(...up), Math.max(2, Math.round((H - m.t - m.b) / 48)));
    const lo = tk[0];
    const hi = tk[tk.length - 1];
    const py = (v) => m.t + (hi - v) / (hi - lo) * (H - m.t - m.b);
    const band = (W - m.l - m.r) / n;
    const bw = Math.min(24, band * 0.62);
    const cx = (i) => m.l + band * (i + 0.5);
    const bad = chCss(el, '--bad');
    const good = chCss(el, '--good');
    let g = '';
    tk.forEach((t) => { g += `<line class="g" x1="${m.l}" x2="${W - m.r}" y1="${py(t)}" y2="${py(t)}" ${t === 0 ? `style="stroke:${chCss(el, '--axis')}"` : ''}/><text class="ax" x="${m.l - 8}" y="${py(t) + 4}" text-anchor="end">${yf(t)}</text>`; });
    chPick(n, Math.floor((W - m.l - m.r) / 80)).forEach((i) => { g += `<text class="ax" x="${cx(i)}" y="${H - 5}" text-anchor="middle">${c.x[i]}</text>`; });
    const cap = (x, y, w, h, top) => {
        const r = Math.min(4, w / 2, h);
        return top ? `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z` : `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`;
    };
    for (let i = 0; i < n; i++) {
        let acc = 0;
        const live = c.series.filter((s) => s.data[i] > 0);
        const dl = `style="animation-delay:${i * 28 + 80}ms"`;
        c.series.forEach((s) => {
            const v = s.data[i];
            if (!v) return;
            const last = s === live[live.length - 1];
            if (v < 0) { g += `<path class="bar neg ${anim ? 'growy' : ''}" ${dl} d="${cap(cx(i) - bw / 2, py(0), bw, py(v) - py(0), false)}" fill="${bad}"/>`; return; }
            const y1 = py(acc + v);
            const h = py(acc) - y1 - (acc ? 2 : 0);
            acc += v;
            g += last ? `<path class="bar ${anim ? 'growy' : ''}" ${dl} d="${cap(cx(i) - bw / 2, y1, bw, Math.max(1, h), true)}" fill="${c.posneg ? good : s.color}"/>` : `<rect class="bar ${anim ? 'growy' : ''}" ${dl} x="${cx(i) - bw / 2}" y="${y1}" width="${bw}" height="${Math.max(1, h)}" fill="${s.color}"/>`;
        });
    }
    g += `<rect class="hb" y="${m.t}" width="${band}" height="${H - m.t - m.b}" fill="rgba(255,255,255,.04)" rx="4" visibility="hidden"/>`;
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${g}<rect x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="transparent"/></svg>`;
    const svg = el.querySelector('svg');
    const hb = svg.querySelector('.hb');
    const tip = chTip(el);
    svg.onmousemove = (e) => {
        const bx = svg.getBoundingClientRect();
        const mx = (e.clientX - bx.left) * W / bx.width;
        const i = chClamp(Math.floor((mx - m.l) / band), 0, n - 1);
        hb.setAttribute('x', m.l + band * i);
        hb.setAttribute('visibility', 'visible');
        tip.innerHTML = `<h4>${c.x[i]}</h4>` + c.series.map((s) => `<div>${c.series.length > 1 ? `<i class="key box" style="--c:${s.color}"></i>` : ''}${s.name}<b>${yf(s.data[i])}</b></div>`).join('') + (c.series.length > 1 ? `<div>Together<b>${yf(tot[i])}</b></div>` : '');
        chPlaceTip(tip, cx(i) * bx.width / W, e.clientY - bx.top, bx.width);
    };
    svg.onmouseleave = () => { hb.setAttribute('visibility', 'hidden'); tip.classList.remove('on'); };
}

/** A small line for a table cell or a panel's head, as a string. Nothing when there are fewer than two points. */
export function sparkSvg(data, color, w = 70, h = 26) {
    if (!data || data.length < 2) return '';
    const hi = Math.max(...data);
    const a = Math.min(...data);
    const y = (v) => h - 2 - (v - a) / (hi - a || 1) * (h - 4);
    return `<svg width="${w}" height="${h}"><polyline fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" points="${data.map((v, i) => (i * (w - 4) / (data.length - 1) + 2).toFixed(1) + ',' + y(v).toFixed(1)).join(' ')}"/></svg>`;
}
