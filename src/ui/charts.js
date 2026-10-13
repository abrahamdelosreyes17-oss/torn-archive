// The hub's graphs: a line graph, a column graph, the days as rows and a small line for a table cell. Each draws one
// SVG into the element it is given, at the element's own size; nothing is loaded.
//
// 1.4.0 - the graphs of drawing AJ (the owner, 2026-10-13: approved). Their rules:
//   1. A graph has its own height: it never stretches with a table beside it.
//   2. The time axis begins where your record begins; under three days of record it counts in hours.
//   3. The form fits the fact: a balance is steps, a price over days a dot a day, money a period is columns with
//      their sum on top, a tall narrow panel lists the days as bars.
//   4. Three to five quiet axis lines; the axis follows the numbers, the values are written at the marks.

import { hMoney, hNum, hDay, hClock } from './fmt.js';

const chCss = (el, v) => getComputedStyle(el.ownerDocument.documentElement).getPropertyValue(v).trim();
// 'var(--s-gold)' -> the colour itself, for a gradient stop (a gradient cannot read a variable everywhere).
const chColor = (el, c) => (/^var\(/.test(c) ? chCss(el, c.slice(4, -1)) : c);
let chUid = 0;

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

export const chClamp = (v, a, b) => Math.max(a, Math.min(b, v));
const chW = (text, per = 6.9) => String(text).length * per;
export const CH_HOUR = 3600e3;
export const CH_DAY = 86400e3;
const CH_STEPS = [CH_HOUR, 2 * CH_HOUR, 3 * CH_HOUR, 6 * CH_HOUR, 12 * CH_HOUR, CH_DAY, 2 * CH_DAY, 7 * CH_DAY, 14 * CH_DAY, 30 * CH_DAY];

/** Round values inside lo..hi for an axis, as close together as gives no more than `max` lines. The axis itself
 *  is not stretched to them: the marks fill the height. */
export function chTicks(lo, hi, max) {
    if (!(hi > lo)) hi = lo + 1;
    const mag = Math.pow(10, Math.floor(Math.log10((hi - lo) / max)));
    for (const f of [1, 2, 2.5, 5, 10, 20, 25, 50]) {
        const step = f * mag;
        const out = [];
        for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
        if (out.length <= max) return out;
    }
    return [lo];
}

/** Round moments for a time axis: the hours of a short record, the days of a long one. */
function chTimeTicks(a, b, maxN) {
    const step = CH_STEPS.find((s) => (b - a) / s <= maxN) || CH_STEPS[CH_STEPS.length - 1];
    const out = [];
    for (let t = Math.ceil(a / step) * step; t <= b; t += step) out.push(t);
    return { step, ticks: out };
}

/**
 * One graph. Lines, steps, the range of a day, sticks from one value up to another, marks with their numbers.
 * @param c { x, slots, time, xfmt, tipx, xticks, series: [{ name, color, data, step, from, area, dots, thin, end }],
 *            caps: { lo, hi, color, name }, sticks: [{ i, y0, y1, w, color }], events: [{ i, y, label, color }],
 *            refs: [{ y, name }], mark: { x, name }, zero, yfmt, tip(i), none, ends }
 *   x: numbers (a scale) or labels (evenly apart); slots: each x in the middle of its own slot; time: x is a moment.
 */
export function lineChart(el, c, anim) {
    const W = el.clientWidth;
    const H = el.clientHeight;
    if (W < 80 || H < 60) return;
    const xs = c.x || [];
    const n = xs.length;
    if (n < (c.min || 2)) { chEmpty(el, c.none || 'Fills as the days pass.'); return; }
    const yf = c.yfmt || hMoney;
    const xf = c.xfmt || ((v) => v);
    const series = c.series || [];
    let lo = Infinity;
    let hi = -Infinity;
    const see = (v) => { if (v == null || Number.isNaN(v)) return; if (v < lo) lo = v; if (v > hi) hi = v; };
    series.forEach((s) => { s.data.forEach(see); if (s.from != null) see(s.from); });
    if (c.caps) { c.caps.lo.forEach(see); c.caps.hi.forEach(see); }
    (c.sticks || []).forEach((s) => { see(s.y0); see(s.y1); });
    // A line to measure against that lies far from the marks is not pulled into the axis (the marks would go flat):
    // it is drawn on the graph's edge, with an arrow to where it is.
    const span0 = Math.max(hi - lo, Math.abs(hi) * (c.minSpan || 0));
    (c.refs || []).forEach((r) => { if (!r.pin || (r.y > lo - span0 * 0.6 && r.y < hi + span0 * 0.6)) see(r.y); });
    if (c.minSpan && hi - lo < Math.abs(hi) * c.minSpan) { const mid = (hi + lo) / 2; const half = Math.abs(hi) * c.minSpan / 2; lo = Math.min(lo, mid - half); hi = Math.max(hi, mid + half); }
    if (c.zero) see(0);
    if (!c.zero) { const pad = (hi - lo || Math.abs(hi) || 1) * 0.08; lo -= pad; hi += pad; } else if (hi > 0) hi += (hi - Math.min(0, lo)) * (c.events ? 0.12 : 0.04);
    const tk = chTicks(lo, hi, chClamp(Math.round((H - 42) / 56), 3, 5));
    const ends = c.ends === false ? [] : series.filter((s) => s.end !== false).map((s) => ({ s, t: (s.endName ? s.endName + ' ' : '') + yf(s.data[s.data.length - 1]) }));
    const m = { l: c.left || Math.max(...tk.map((t) => chW(yf(t), 6.7))) + 16, r: ends.length ? Math.max(...ends.map((e) => chW(e.t, 7.2))) + 18 : 14, t: c.events ? 26 : 14, b: 26 };
    if (c.slots && ends.length && (W - m.l - 14) / n / 2 > m.r) m.r = 14;
    const pw = W - m.l - m.r;
    const isNum = typeof xs[0] === 'number' && !c.slots;
    const xa = isNum ? (c.xa != null ? c.xa : xs[0]) : 0;
    const xb = isNum ? (c.xb != null ? c.xb : xs[n - 1]) : n - 1;
    const slot = pw / n;
    const pxv = (v) => m.l + (xb === xa ? 0.5 : (v - xa) / (xb - xa)) * pw;
    const px = (i) => (c.slots ? m.l + slot * (i + 0.5) : pxv(isNum ? xs[i] : i));
    const py = (v) => m.t + (hi - v) / (hi - lo) * (H - m.t - m.b);
    const id = 'g' + (++chUid);
    const panel = chCss(el, '--panel');
    let g = '<defs>' + series.map((s, k) => (s.area ? `<linearGradient id="${id}-${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${chColor(el, s.color)}" stop-opacity=".2"/><stop offset="1" stop-color="${chColor(el, s.color)}" stop-opacity="0"/></linearGradient>` : '')).join('') + '</defs>';
    tk.forEach((t) => { g += `<line class="${t === 0 ? 'ch-base' : 'g'}" x1="${m.l}" x2="${W - m.r}" y1="${py(t)}" y2="${py(t)}"/><text class="ax" x="${m.l - 8}" y="${py(t) + 4}" text-anchor="end">${yf(t)}</text>`; });
    // the x axis
    if (c.time) {
        const { step, ticks } = chTimeTicks(xa, xb, Math.max(2, Math.floor(pw / 92)));
        ticks.forEach((t) => {
            const d = new Date(t);
            const midnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
            if (pxv(t) < m.l + 14 || pxv(t) > W - m.r - 14) return;
            g += `<text class="${midnight || step >= CH_DAY ? 'ch-day' : 'ax'}" x="${pxv(t)}" y="${H - 6}" text-anchor="middle">${midnight || step >= CH_DAY ? hDay(t) : hClock(t)}</text>`;
            if (midnight && step < CH_DAY) g += `<line class="g" x1="${pxv(t)}" x2="${pxv(t)}" y1="${m.t}" y2="${H - m.b}" stroke-dasharray="2 4"/>`;
        });
    } else {
        const ix = c.xticks ? c.xticks : c.slots && slot >= 52 ? xs.map((_, i) => i) : chPick(n, Math.floor(pw / 88));
        ix.forEach((i) => { g += `<text class="ax" x="${px(i)}" y="${H - 6}" text-anchor="${!c.slots && i === 0 ? 'start' : !c.slots && i === n - 1 && !ends.length ? 'end' : 'middle'}">${xf(xs[i])}</text>`; });
    }
    // lines to measure against, each with its words on the left
    const refYs = [];
    (c.refs || []).forEach((r) => {
        const off = r.y < lo ? 1 : r.y > hi ? -1 : 0;
        const y = off > 0 ? H - m.b : off < 0 ? m.t : py(r.y);
        const under = !off && (y < m.t + 16 || refYs.some((o) => o < y && y - o < 17));
        refYs.push(y);
        g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}" stroke="${chCss(el, '--muted')}" stroke-dasharray="4 4" opacity="${off ? '.45' : '.8'}"/><text class="rl" x="${m.l + 8}" y="${under || off < 0 ? y + 15 : y - 6}">${off ? (off > 0 ? '↓ ' : '↑ ') : ''}${r.name}</text>`;
    });
    // a place on the x axis to read at (your rate): its line now, each line's value there after the lines are drawn
    const markAt = [];
    if (c.mark != null) {
        const x = pxv(c.mark.x);
        g += `<line x1="${x}" x2="${x}" y1="${m.t}" y2="${H - m.b}" stroke="${chCss(el, '--brand')}" stroke-width="1.5" opacity=".8"/><text class="ch-ev" x="${x - 7}" y="${m.t + 11}" text-anchor="end">${c.mark.name}</text>`;
        const k = xs.findIndex((v) => v >= c.mark.x);
        if (k >= 0) series.forEach((s) => { const a = Math.max(0, k - 1); const f = k === a || xs[k] === xs[a] ? 1 : (c.mark.x - xs[a]) / (xs[k] - xs[a]); const val = s.data[a] + (s.data[k] - s.data[a]) * f; markAt.push({ x, y: py(val), yy: py(val), t: (c.mark.fmt || yf)(Math.round(val)), color: s.color }); });
    }
    // the range of each day: a soft capsule from its lowest to its highest
    if (c.caps) {
        const w = chClamp(c.slots ? slot * 0.16 : pw / n * 0.5, 5, 18);
        for (let i = 0; i < n; i++) {
            if (c.caps.lo[i] == null) continue;
            const y1 = py(c.caps.hi[i]);
            const h = Math.max(w, py(c.caps.lo[i]) - y1);
            g += `<rect class="${anim ? 'fade' : ''}" x="${px(i) - w / 2}" y="${y1 - (h - (py(c.caps.lo[i]) - y1)) / 2}" width="${w}" height="${h}" rx="${w / 2}" fill="${c.caps.color}" opacity=".2"/>`;
        }
    }
    (c.sticks || []).forEach((s, k) => {
        g += `<line class="ch-stk ${anim ? 'grow' : ''}" style="animation-delay:${k * 18 + 80}ms" x1="${px(s.i)}" x2="${px(s.i)}" y1="${py(s.y0)}" y2="${py(s.y1)}" stroke="${s.color}" stroke-width="${s.w}" opacity=".85"/>`;
    });
    const endAt = [];
    series.forEach((s, k) => {
        const last = s.data.length - 1;
        let d;
        let endX;
        if (s.step) {
            // the value stands from its x until the next one
            // in slots a value fills its own slot, edge to edge
            const edge = c.slots ? slot / 2 : 0;
            d = `M${(px(0) - edge).toFixed(1)} ${py(s.from != null ? s.from : s.data[0]).toFixed(1)}`;
            for (let i = 0; i <= last; i++) d += `V${py(s.data[i]).toFixed(1)}H${(c.slots ? px(i) + edge : i < last ? px(i + 1) : pxv(xb)).toFixed(1)}`;
            endX = c.slots ? px(last) + edge : pxv(xb);
        } else {
            d = s.data.map((v, i) => (i ? 'L' : 'M') + px(i).toFixed(1) + ' ' + py(v).toFixed(1)).join('');
            endX = px(last);
        }
        if (s.area && (s.step || n >= 8)) g += `<path class="${anim ? 'fade' : ''}" d="${d}V${py(Math.max(lo, 0))}H${(px(0) - (s.step && c.slots ? slot / 2 : 0)).toFixed(1)}Z" fill="url(#${id}-${k})"/>`;
        // the room between this line and a line to stay over (your least price): what a point leaves you
        if (s.room != null) g += `<path class="${anim ? 'fade' : ''}" d="${d}V${py(s.room)}H${px(0).toFixed(1)}Z" fill="${chCss(el, '--good')}" opacity=".07"/>`;
        g += `<path class="ch-ln ${s.thin ? 'thin' : ''} ${anim ? 'draw' : ''}" pathLength="1" d="${d}" stroke="${s.color}"${s.dash ? ' stroke-dasharray="none"' : ''}/>`;
        if (!s.step && (s.dots || (s.dots !== false && n <= 12))) s.data.forEach((v, i) => { g += `<circle class="${anim ? 'fade' : ''}" cx="${px(i)}" cy="${py(v)}" r="3.5" fill="${s.color}" stroke="${panel}" stroke-width="2"/>`; });
        else if (s.end !== false) g += `<circle class="${anim ? 'fade' : ''}" cx="${endX}" cy="${py(s.data[last])}" r="4" fill="${s.color}" stroke="${panel}" stroke-width="2"/>`;
        const e = ends.find((x) => x.s === s);
        if (e) endAt.push({ x: endX, y: py(s.data[last]), t: e.t, color: s.color });
    });
    let evBefore = null;
    (c.events || []).forEach((e) => {
        const x = px(e.i);
        const y = py(e.y);
        const w = chW(e.label, 7.4);
        const hit = evBefore && Math.abs(x - evBefore.x) < (w + evBefore.w) / 2 + 6 && Math.abs(y - evBefore.y) < 16;
        g += `<circle class="${anim ? 'fade' : ''}" cx="${x}" cy="${y}" r="4.5" fill="${e.color}" stroke="${panel}" stroke-width="2"/><text class="ch-ev ${anim ? 'fade' : ''}" x="${hit ? x + 9 : Math.max(x, m.l + w / 2 - 6)}" y="${hit ? y + 4 : y - 10}" text-anchor="${hit ? 'start' : 'middle'}">${e.label}</text>`;
        evBefore = { x, y, w };
    });
    markAt.sort((a, b) => a.yy - b.yy);
    for (let i = 1; i < markAt.length; i++) if (markAt[i].yy - markAt[i - 1].yy < 16) markAt[i].yy = markAt[i - 1].yy + 16;
    markAt.forEach((e) => { g += `<circle class="${anim ? 'fade' : ''}" cx="${e.x}" cy="${e.y}" r="4" fill="${e.color}" stroke="${panel}" stroke-width="2"/><text class="lb ${anim ? 'fade' : ''}" x="${e.x + 9}" y="${e.yy - 4}">${e.t}</text>`; });
    endAt.sort((a, b) => a.y - b.y);
    for (let i = 1; i < endAt.length; i++) if (endAt[i].y - endAt[i - 1].y < 16) endAt[i].y = endAt[i - 1].y + 16;
    endAt.forEach((e) => { g += `<text class="lb ${anim ? 'fade' : ''}" x="${e.x + 9}" y="${e.y + 4}">${e.t}</text>`; });
    g += `<line class="cross" y1="${m.t}" y2="${H - m.b}" visibility="hidden"/>` + series.map((s) => `<circle class="hd" r="4.5" fill="${s.color}" stroke="${panel}" stroke-width="2" visibility="hidden"/>`).join('');
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${g}<rect x="${m.l}" y="${m.t}" width="${pw}" height="${H - m.t - m.b}" fill="transparent"/></svg>`;
    const svg = el.querySelector('svg');
    const cross = svg.querySelector('.cross');
    const hd = [...svg.querySelectorAll('.hd')];
    const tip = chTip(el);
    svg.onmousemove = (e) => {
        const bx = svg.getBoundingClientRect();
        const mx = (e.clientX - bx.left) * W / bx.width;
        let i = 0;
        if (series.some((s) => s.step) && !c.slots) { for (let j = 0; j < n; j++) if (px(j) <= mx) i = j; }
        else { let best = 1e9; for (let j = 0; j < n; j++) { const dd = Math.abs(px(j) - mx); if (dd < best) { best = dd; i = j; } } }
        const cxx = series.some((s) => s.step) && !c.slots ? chClamp(mx, px(0), pxv(xb)) : px(i);
        cross.setAttribute('x1', cxx);
        cross.setAttribute('x2', cxx);
        cross.setAttribute('visibility', 'visible');
        hd.forEach((h, k) => { h.setAttribute('cx', cxx); h.setAttribute('cy', py(series[k].data[i])); h.setAttribute('visibility', 'visible'); });
        tip.innerHTML = c.tip ? c.tip(i) : `<h4>${(c.tipx || xf)(xs[i])}</h4>` + series.map((s) => `<div><i class="key" style="--c:${s.color}"></i>${s.name}<b>${yf(s.data[i])}</b></div>`).join('') + (c.caps && c.caps.lo[i] != null ? `<div><i class="key band"></i>${c.caps.name}<b>${yf(c.caps.lo[i])} to ${yf(c.caps.hi[i])}</b></div>` : '');
        chPlaceTip(tip, cxx * bx.width / W, e.clientY - bx.top, bx.width);
    };
    svg.onmouseleave = () => { cross.setAttribute('visibility', 'hidden'); hd.forEach((h) => h.setAttribute('visibility', 'hidden')); tip.classList.remove('on'); };
}

/** Columns, one a period, their sum written on top. A negative part hangs under the line in red. */
export function colChart(el, c, anim) {
    const W = el.clientWidth;
    const H = el.clientHeight;
    if (W < 80 || H < 60) return;
    const n = (c.x || []).length;
    if (!n || !c.series.some((s) => s.data.some((v) => v))) { chEmpty(el, c.none || 'Nothing yet.'); return; }
    const yf = c.yfmt || hMoney;
    const tf = c.topfmt || yf;
    const tot = c.x.map((_, i) => c.series.reduce((a, s) => a + s.data[i], 0));
    const up = c.x.map((_, i) => c.series.reduce((a, s) => a + Math.max(0, s.data[i]), 0));
    const dn = c.x.map((_, i) => c.series.reduce((a, s) => a + Math.min(0, s.data[i]), 0));
    const top = Math.max(...up);
    const lo = Math.min(0, ...dn) * 1.08;
    const hi = top * 1.1;
    const tk = chTicks(lo, hi, chClamp(Math.round((H - 42) / 70), 3, 5));
    const m = { l: Math.max(...tk.map((t) => chW(yf(t), 6.7))) + 16, r: 12, t: 20, b: 26 };
    const py = (v) => m.t + (hi - v) / (hi - lo) * (H - m.t - m.b);
    const band = (W - m.l - m.r) / n;
    const bw = chClamp(band * 0.56, 4, 44);
    const cx = (i) => m.l + band * (i + 0.5);
    const bad = chCss(el, '--bad');
    let g = '';
    tk.forEach((t) => { g += `<line class="${t === 0 ? 'ch-base' : 'g'}" x1="${m.l}" x2="${W - m.r}" y1="${py(t)}" y2="${py(t)}"/><text class="ax" x="${m.l - 8}" y="${py(t) + 4}" text-anchor="end">${yf(t)}</text>`; });
    const every = Math.max(1, Math.ceil(64 / band));
    c.x.forEach((label, i) => { if ((n - 1 - i) % every === 0) g += `<text class="${c.strong && c.strong[i] ? 'ch-day' : 'ax'}" x="${cx(i)}" y="${H - 6}" text-anchor="middle">${label}</text>`; });
    const cap = (x, y, w, h, onTop) => {
        const r = Math.min(5, w / 2, h);
        return onTop ? `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z` : `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`;
    };
    for (let i = 0; i < n; i++) {
        let acc = 0;
        const live = c.series.filter((s) => s.data[i] > 0);
        const dl = `style="animation-delay:${i * 26 + 80}ms"`;
        c.series.forEach((s) => {
            const v = s.data[i];
            if (!v) return;
            if (v < 0) { g += `<path class="bar neg ${anim ? 'growy' : ''}" ${dl} d="${cap(cx(i) - bw / 2, py(0), bw, py(v) - py(0), false)}" fill="${bad}"/>`; return; }
            const y1 = py(acc + v);
            const h = py(acc) - y1 - (acc ? 2 : 0);
            acc += v;
            g += s === live[live.length - 1] ? `<path class="bar ${anim ? 'growy' : ''}" ${dl} d="${cap(cx(i) - bw / 2, y1, bw, Math.max(1, h), true)}" fill="${s.color}"/>` : `<rect class="bar ${anim ? 'growy' : ''}" ${dl} x="${cx(i) - bw / 2}" y="${y1}" width="${bw}" height="${Math.max(1, h)}" fill="${s.color}"/>`;
        });
        if (up[i] > 0 && band >= 46) g += `<text class="ch-top ${anim ? 'fade' : ''}" x="${cx(i)}" y="${py(up[i]) - 7}" text-anchor="middle">${tf(tot[i])}</text>`;
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
        tip.innerHTML = `<h4>${(c.tipx || ((k) => c.x[k]))(i)}</h4>` + c.series.map((s) => `<div>${c.series.length > 1 ? `<i class="key box" style="--c:${s.color}"></i>` : ''}${s.name}<b>${yf(s.data[i])}</b></div>`).join('') + (c.series.length > 1 ? `<div>Together<b>${yf(tot[i])}</b></div>` : '') + (c.more ? c.more(i) : '');
        chPlaceTip(tip, cx(i) * bx.width / W, e.clientY - bx.top, bx.width);
    };
    svg.onmouseleave = () => { hb.setAttribute('visibility', 'hidden'); tip.classList.remove('on'); };
}

/** The days as rows, newest first: for a tall narrow panel. @param days [{ day, parts: [n] }] @param parts [{ name, color }] */
export function chRows(days, parts, unit) {
    const sum = (d) => d.parts.reduce((a, b) => a + b, 0);
    const max = Math.max(1, ...days.map(sum));
    return `<div class="ch-rows">${[...days].reverse().map((d, k) => {
        const t = sum(d);
        if (!t) return `<div class="ch-r none"><span class="d">${hDay(d.day)}</span><span class="b"></span><span class="v">none</span></div>`;
        return `<div class="ch-r" style="--n:${k}"><span class="d">${hDay(d.day)}</span><span class="b">${d.parts.map((p, i) => (p ? `<i style="--w:${p / max * 100}%;--c:${parts[i].color}" data-tip="${parts[i].name}: ${hNum(p)}"></i>` : '')).join('')}</span><span class="v num" title="${d.parts.map((p, i) => parts[i].name + ' ' + hNum(p)).join(' · ')}">${hNum(t)}${unit ? ' ' + unit : ''}</span></div>`;
    }).join('')}</div>`;
}

/** A small line for a table cell or a panel's head, as a string. Nothing when there are fewer than two points. */
export function sparkSvg(data, color, w = 70, h = 26) {
    if (!data || data.length < 2) return '';
    const hi = Math.max(...data);
    const a = Math.min(...data);
    const y = (v) => h - 2 - (v - a) / (hi - a || 1) * (h - 4);
    return `<svg width="${w}" height="${h}"><polyline fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" points="${data.map((v, i) => (i * (w - 4) / (data.length - 1) + 2).toFixed(1) + ',' + y(v).toFixed(1)).join(' ')}"/></svg>`;
}
