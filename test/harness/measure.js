// A page measured (1.3.0, the owner: "also make a ui pass"): nothing cut off, nothing over something else, no word
// broken a letter a line, nothing off the window - by the numbers the browser gives, not by eye.
// Loaded by nothing: a session imports it into a harness page at the window size to be checked (the owner's is
// 1707 x 932) and reads what it found:
//     const m = await import('./measure.js');
//     await m.measureHub();              // hub.html: every page and every tab of it
//     m.measureBox();                    // torn.html: the overlay's box (and "Your stock")
//     await m.measureRoom();             // hub.html: the empty room in every panel (a box stretched around a few rows)
// Each finding: { what, el, text, by } - what is wrong, the element, its words, and by how many pixels.
// Measure with the side menu pinned open as well (localStorage 'tarc-pin' = '1', then reload): the owner's is, and
// a 1707 px window then leaves the pages 1471 px, not 1647. 1.3.0 was measured only with it closed, and Buy and
// Stock fell into their narrow layouts on his screen. A page that scrolls is no finding here: read
// `.view.scrollHeight - .view.clientHeight` for that.
// Since 1.3.2 the hub is drawn at nine tenths (hub-css.js --scale): a 1707 px window is 1897 px to the pages, and
// with the menu pinned they get 1661. getBoundingClientRect gives sizes as drawn, offsetWidth the page's own.

const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'OPTION', 'TITLE']);

/**
 * Everything that fades or slides in is brought to its end first. A tab that is not in view runs no animation:
 * its panels stand at their first frame - see-through - and would all be passed over as "not shown". (That
 * happened: the first pass of 1.3.0 called every page clean having measured only the top bar.)
 */
export function settle(root = document) {
    for (const a of (root.getAnimations ? root.getAnimations() : [])) { try { a.finish(); } catch { /* one that never ends: left as it is */ } }
}

const tag = (el) => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
const where = (el) => { const out = []; for (let e = el; e && e.nodeType === 1 && out.length < 4; e = e.parentElement) out.unshift(tag(e) + (e.dataset && e.dataset.k ? '[' + e.dataset.k + ']' : '')); return out.join(' > '); };

/** The text nodes that are an element's own, with something in them. */
const ownTexts = (el) => [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());

/** The box around an element's own words, and `lines`: the box of each line of them (words that wrap are not one box). */
function textRect(el, doc) {
    const range = doc.createRange();
    let box = null;
    const lines = [];
    for (const n of ownTexts(el)) {
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) {
            if (!(r.width > 0 && r.height > 0)) continue;
            lines.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
            box = box ? { left: Math.min(box.left, r.left), top: Math.min(box.top, r.top), right: Math.max(box.right, r.right), bottom: Math.max(box.bottom, r.bottom) } : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        }
    }
    return box ? { ...box, lines } : null;
}

/**
 * @param root a document or a shadow root
 * @param opts { skip: (el) => true for parts not measured (a chart draws its own labels) }
 * @returns the findings, the worst first
 */
export function measure(root = document, win = window, opts = {}) {
    const doc = root.ownerDocument || root;
    const style = (el) => win.getComputedStyle(el);
    const shown = (el) => {
        for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
            const cs = style(e);
            if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0 || e.hidden) return false;
        }
        return true;
    };
    const skip = (el) => SKIP.has(el.tagName) || el.closest('svg, canvas, .chart, [data-chart]') || (opts.skip && opts.skip(el));
    const found = [];
    const texts = [];
    settle(root);
    if (root !== doc) settle(doc);
    for (const el of root.querySelectorAll('*')) {
        if (skip(el) || !ownTexts(el).length || !shown(el)) continue;
        const box = textRect(el, doc);
        if (!box) continue;
        const words = ownTexts(el).map((n) => n.textContent.trim()).join(' ').replace(/\s+/g, ' ');
        const say = (what, by) => found.push({ what, el: where(el), text: words.slice(0, 60), by: Math.round(by) });

        // 1. Its own box is too small for it, and hides the rest (with or without three dots).
        const cs = style(el);
        if (cs.overflowX !== 'visible' && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll' && el.scrollWidth > el.clientWidth + 1) say(cs.textOverflow === 'ellipsis' ? 'shortened with dots' : 'cut by its own box', el.scrollWidth - el.clientWidth);

        // 2. Something around it hides a part of it. Past a box that scrolls, being out of sight is no fault.
        let x = true;
        let y = true;
        let cut = false;
        // The part of it that no box around it hides or has scrolled away: where it should be seen.
        const seen = { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
        for (let a = el.parentElement; a; a = a.parentElement) {
            const as = style(a);
            if (as.overflowX === 'visible' && as.overflowY === 'visible') continue;
            const r = a.getBoundingClientRect();
            if (as.overflowX !== 'visible') { seen.left = Math.max(seen.left, r.left); seen.right = Math.min(seen.right, r.right); }
            if (as.overflowY !== 'visible') { seen.top = Math.max(seen.top, r.top); seen.bottom = Math.min(seen.bottom, r.bottom); }
        }
        for (let a = el.parentElement; a && (x || y); a = a.parentElement) {
            const as = style(a);
            const r = a.getBoundingClientRect();
            if (x) {
                if (as.overflowX === 'auto' || as.overflowX === 'scroll') x = false;
                else if (as.overflowX !== 'visible') { const by = Math.max(box.right - r.right, r.left - box.left); if (by > 1.5) { say('cut at the side by ' + tag(a), by); x = false; cut = true; } }
            }
            if (y) {
                if (as.overflowY === 'auto' || as.overflowY === 'scroll') y = false;
                else if (as.overflowY !== 'visible') { const by = Math.max(box.bottom - r.bottom, r.top - box.top); if (by > 1.5) { say('cut above or below by ' + tag(a), by); y = false; cut = true; } }
            }
        }
        // 2b. Something else lies over it (the Settings page until 1.3.0: a badge under the next panel). Asked of
        // the browser at three points of its words: what is on top there must be the element, or of its own line.
        // (Its first line, where it can be seen: the middle of words that wrap may be someone else's place.)
        const l0 = box.lines[0];
        const line = { left: Math.max(l0.left, seen.left), top: Math.max(l0.top, seen.top), right: Math.min(l0.right, seen.right), bottom: Math.min(l0.bottom, seen.bottom) };
        if (line.right - line.left > 6 && line.bottom - line.top > 4) {
            const py = (line.top + line.bottom) / 2;
            // The browser passes over what takes no clicks: for the asking, this one takes them.
            const deaf = style(el).pointerEvents === 'none';
            const was = el.style.pointerEvents;
            if (deaf) el.style.pointerEvents = 'auto';
            const tops = [line.left + 2, (line.left + line.right) / 2, line.right - 2].map((px) => (px < 0 || py < 0 || px >= win.innerWidth || py >= win.innerHeight ? null : root.elementFromPoint(px, py)));
            if (deaf) el.style.pointerEvents = was;
            for (const top of tops) {
                if (!top || top === el || el.contains(top) || top.contains(el)) continue;
                // A heading that stays in place while its table scrolls under it covers rows by design; so does a toast.
                let fixed = false;
                // (Looked for only up to what the two have in common: the whole app may itself be fixed to the window.)
                for (let a = top; a && a.nodeType === 1 && !a.contains(el) && !fixed; a = a.parentElement) fixed = /sticky|fixed/.test(style(a).position);
                if (fixed) continue;
                // A neighbour in the same line whose box reaches over the words' edge by a hair is no cover.
                const tr = top.getBoundingClientRect();
                const by = Math.min(line.right, tr.right) - Math.max(line.left, tr.left);
                if (by <= 3) continue;
                say('covered by ' + where(top), by);
                break;
            }
        }
        // 3. Off the window sideways, with nothing to scroll it back.
        if (x && (box.right > win.innerWidth + 1.5 || box.left < -1.5)) say('off the window', Math.max(box.right - win.innerWidth, -box.left));

        // 4. A word broken over lines: "wrapped a letter a line".
        const range = doc.createRange();
        let broken = '';
        for (const n of ownTexts(el)) {
            const re = /[^\s]{3,}/g;
            for (let m = re.exec(n.textContent); m && !broken; m = re.exec(n.textContent)) {
                // A long run with places to break at (a dash, a slash) may break there.
                if (/[-/·]/.test(m[0])) continue;
                range.setStart(n, m.index);
                range.setEnd(n, m.index + m[0].length);
                const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
                if (tops.size > 1) broken = m[0];
            }
        }
        if (broken) say('a word broken over lines: "' + broken.slice(0, 24) + '"', 0);
        // Words that are cut are said already; the rest are held against each other, scrolled into sight or not.
        // (By the part of each that can be seen: a row scrolled out under a footer is not on the footer's words.)
        if (!cut && seen.right - seen.left > 2 && seen.bottom - seen.top > 2) {
            const part = (r) => ({ left: Math.max(r.left, seen.left), top: Math.max(r.top, seen.top), right: Math.min(r.right, seen.right), bottom: Math.min(r.bottom, seen.bottom) });
            texts.push({ el, lines: box.lines.map(part).filter((r) => r.right - r.left > 2 && r.bottom - r.top > 2), words });
        }
    }
    // 5. Words on top of other words.
    for (let i = 0; i < texts.length; i++) {
        for (let k = i + 1; k < texts.length; k++) {
            const a = texts[i];
            const b = texts[k];
            // Line by line: words that wrap leave room beside their last line, and other words may stand in it.
            let most = 0;
            for (const p of a.lines) {
                for (const q of b.lines) {
                    const w = Math.min(p.right, q.right) - Math.max(p.left, q.left);
                    const h = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
                    if (w > 2 && h > 3) most = Math.max(most, Math.min(w, h));
                }
            }
            if (!most) continue;
            // An element and what is inside it share the place: its own text flows around the child's.
            if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
            found.push({ what: 'over other words: "' + b.words.slice(0, 30) + '" (' + where(b.el) + ')', el: where(a.el), text: a.words.slice(0, 60), by: Math.round(most) });
        }
    }
    // How many pieces of text were held to the rules: a clean answer that measured next to nothing is no answer.
    found.sort((a, b) => b.by - a.by);
    found.texts = texts.length + found.filter((f) => /^cut /.test(f.what)).length;
    return found;
}

/** The Stock page: every piece's tile shows its three lines, whole, inside the tile. */
export function measureTiles(doc = document) {
    const bad = [];
    const tiles = [...doc.querySelectorAll('.pc:not(.act)')];
    for (const t of tiles) {
        const r = t.getBoundingClientRect();
        const rows = [...t.querySelectorAll('.pc-k')];
        const name = (t.querySelector('.pc-n') || t).textContent.trim();
        if (rows.length !== 3) { bad.push(name + ': ' + rows.length + ' lines'); continue; }
        for (const row of rows) {
            const k = row.getBoundingClientRect();
            if (!(k.width > 0 && k.height > 0)) bad.push(name + ': a line is not shown');
            else if (k.bottom > r.bottom + 1 || k.right > r.right + 1 || k.left < r.left - 1 || k.top < r.top - 1) bad.push(name + ': a line is outside its tile');
            const b = row.querySelector('b');
            if (b && b.getBoundingClientRect().width < 4) bad.push(name + ': a value has no room');
        }
    }
    const sizes = tiles.map((t) => { const r = t.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
    return { tiles: tiles.length, least: sizes.length ? [Math.min(...sizes.map((s) => s[0])), Math.min(...sizes.map((s) => s[1]))] : null, bad };
}

/** hub.html: every page, every tab of it. @returns [{ page, tab, found, tiles? }] with only what has findings, and the count walked */
export async function measureHub(doc = document, win = window) {
    // A timer, not an animation frame: a tab that is not in view gets no frames, and is measured all the same.
    const wait = (ms = 150) => new Promise((done) => win.setTimeout(done, ms));
    const pages = [...new Set([...doc.querySelectorAll('.nav-b[data-go]')].map((b) => b.dataset.go))];
    const out = [];
    let walked = 0;
    for (const page of pages) {
        doc.querySelector(`.nav-b[data-go="${page}"]`).click();
        await wait();
        const tabs = Math.max(1, doc.querySelectorAll('[data-tab]').length);
        for (let tab = 0; tab < tabs; tab++) {
            if (tabs > 1) { doc.querySelector(`[data-tab="${tab}"]`).click(); await wait(); }
            walked += 1;
            // The price tape along the top moves through its window: what is outside it is not cut, it is on its way.
            const found = measure(doc, win, { skip: (el) => !!el.closest('.tape-m') });
            const tiles = page === 'stock' ? measureTiles(doc) : null;
            out.push({ page, tab, texts: found.texts, found, ...(tiles ? { tiles } : {}) });
        }
    }
    return { win: [win.innerWidth, win.innerHeight], walked, pages: out };
}

/** The findings as short lines, the same fault on many elements said once with its count. */
export function brief(found) {
    const by = new Map();
    for (const f of found) { const k = f.what.replace(/"[^"]*"/g, '"…"') + ' @ ' + f.el; const cur = by.get(k) || { n: 0, by: 0, text: f.text }; cur.n += 1; cur.by = Math.max(cur.by, f.by); by.set(k, cur); }
    return [...by].map(([k, v]) => `${v.n}x ${k} | "${v.text}" | ${v.by}px`);
}

/** torn.html: the overlay's box and "Your stock", inside their shadow root. */
export function measureBox(doc = document, win = window) {
    const host = doc.getElementById('tarc-host');
    if (!host || !host.shadowRoot) return { win: [win.innerWidth, win.innerHeight], found: [{ what: 'no overlay on this page', el: '', text: '', by: 0 }] };
    const found = measure(host.shadowRoot, win);
    return { win: [win.innerWidth, win.innerHeight], texts: found.texts, found };
}

/**
 * The empty room inside every panel of the hub, every page and tab (1.4.0; the owner, 2026-10-13: "dead spaces" -
 * no box stretched around a few rows, no short column beside a long one). measure() finds what is cut or covered;
 * this finds a box much taller than what it holds. Charts fill their panel and are not counted.
 * @returns [{ page, scroll, big: ['key: WxH empty N'] }] - `big`: panels with more than `least` px under their last line
 */
export async function measureRoom(doc = document, win = window, least = 34) {
    const wait = (ms = 160) => new Promise((done) => win.setTimeout(done, ms));
    const pages = [...new Set([...doc.querySelectorAll('.nav-b[data-go]')].map((b) => b.dataset.go))];
    const INK = new Set(['svg', 'INPUT', 'BUTTON', 'IMG', 'I', 'S', 'CANVAS', 'SELECT', 'TEXTAREA']);
    const inkBottom = (panel) => {
        let low = 0;
        const walk = doc.createTreeWalker(panel, 5);
        const range = doc.createRange();
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
            if (n.nodeType === 3) { if (!n.textContent.trim()) continue; range.selectNodeContents(n); for (const r of range.getClientRects()) if (r.height > 0) low = Math.max(low, r.bottom); continue; }
            if (INK.has(n.tagName)) { const r = n.getBoundingClientRect(); if (r.height > 0) low = Math.max(low, r.bottom); }
        }
        return low;
    };
    const out = [];
    for (const page of pages) {
        doc.querySelector(`.nav-b[data-go="${page}"]`).click();
        await wait();
        const tabs = Math.max(1, doc.querySelectorAll('[data-tab]').length);
        for (let tab = 0; tab < tabs; tab++) {
            if (tabs > 1) { doc.querySelector(`[data-tab="${tab}"]`).click(); await wait(); }
            settle(doc);
            const view = doc.querySelector('.view');
            const big = [];
            for (const p of view.querySelectorAll('.panel')) {
                const r = p.getBoundingClientRect();
                if (!(r.width > 0 && r.height > 0) || p.parentElement.closest('.panel')) continue;
                const empty = Math.round(r.bottom - inkBottom(p));
                if (empty > least) big.push(`${p.dataset.k || p.className}: ${Math.round(r.width)}x${Math.round(r.height)} empty ${empty}`);
            }
            out.push({ page: page + '/' + tab, scroll: view.scrollHeight - view.clientHeight, big });
        }
    }
    return out;
}
