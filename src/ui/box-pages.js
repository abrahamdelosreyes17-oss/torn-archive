// What the small box on Torn's pages says, and what each mark says: worked out from the view the hub shares and
// from what the page in front of you holds. Strings and plain data only; ui/torn-page.js puts them on the page.
// Nothing here presses anything of Torn's: a button either types into a box of Torn's on your press (Fill),
// copies text, or opens one page.

import { hEsc, hNum, hMoney, hSigned, hPct, hPctDown, hPic, hPlural, hRate, hAge, hClock } from './fmt.js';
import { setMakes } from '../core/setjudge.js';
import { lotsWords } from '../core/lots.js';
import { typedListing, listLines } from '../core/points.js';
import { viewPiece } from '../core/view.js';
import { IM_PLACE } from '../core/shopping.js';

const bxKv = (l, r, cls = '') => `<div class="ta-kv ${cls}"><span>${l}</span><b class="num">${r}</b></div>`;
const bxNote = (t) => `<div class="ta-n">${t}</div>`;

/** The hub shares its numbers at least once a minute. Silent for longer than this, a Torn tab says how old they are. */
export const VIEW_LATE_MS = 3 * 60 * 1000;
/**
 * '' while the hub answers. Else one line, first in the box: since when it has not - by the whole minute, so the box
 * is not drawn again every second. (Past VIEW_OLD_MS no number is shown at all: boxClosed.)
 */
export function boxLate(at, now) {
    if (!(at > 0) || !(now - at > VIEW_LATE_MS)) return '';
    return `<div class="ta-hold"><b>Hub silent for ${Math.floor((now - at) / 60000)} min.</b> Numbers are from then.</div>`;
}
const bxBtn = (act, label, cls = '', v = '', more = '') => `<button class="btn sm ${cls}" data-act="${act}"${v !== '' ? ` data-v="${hEsc(v)}"` : ''}${more}>${label}</button>`;
const bxHead = (title, right = '') => `<h4>${title}<span>${right}</span></h4>`;

/** While the hub has not shared anything yet, or what it shared is old. */
export function boxWaiting(old) {
    return { where: '', html: bxNote(old ? 'Torn Archive is not open.' : 'Open Torn Archive once.'), marks: [] };
}

/**
 * The hub is not open, or was never set up: no number is shown, it would be old. `go`: Open is the thing to do.
 * @param setUp a key has been pasted
 * @param old   the hub shared something once
 */
export function boxClosed(setUp, old) {
    if (!setUp) return { head: 'not set up yet', go: true, where: '', html: bxNote('No key yet: paste one in Settings.'), marks: [] };
    return { ...boxWaiting(old), head: 'hub is closed', go: true };
}

/**
 * A buy a Torn page told of that Torn's log does not have: the hub took it back, and it is said here for as long as
 * the hub says it (a few minutes), in one line.
 */
function bxBack(v) {
    const rows = (v.buy && v.buy.back) || [];
    if (!rows.length) return '';
    return `<div class="ta-hold"><b>Taken back: ${rows.map((b) => `${hNum(b.qty)} × ${hEsc(b.name || 'item ' + b.id)}`).join(', ')}.</b> Not in Torn's log.</div>`;
}

/**
 * A listing's price against its piece: profit per set with it (core/setjudge.js setMakes), in the Buy page's three
 * text colours - "profit per set 2.5%", and under your least it says so. Without a points price, the piece's worth.
 * Until 1.4.0: "worth $X", "over its worth · its set carries it", "Stretch · needs points at $X", "too dear".
 */
function bxMakes(p, price) {
    if (!p.mk) return { cls: price < p.worth ? 'best' : 'loss', text: price < p.worth ? `worth ${hMoney(p.worth)}` : 'over its worth' };
    const m = setMakes(p.mk, price);
    if (m.cls === 'loss') return { cls: 'loss', text: 'a loss for its set' };
    return { cls: m.cls, text: `profit per set ${hPctDown(m.pct)}${m.cls === 'thin' ? ` · under your ${hRate(p.mk.least)}%` : ''}` };
}
const bxWorth = (p, price) => { const m = bxMakes(p, price); return m.cls === 'loss' ? m.text : `<span class="j-${m.cls}">${m.text}</span>`; };

/** A page of Torn's that is none of ours, while the hub is open: your sets, and what waits for you. */
export function boxAny(v) {
    const full = v.sets.reduce((n, s) => n + s.full, 0);
    let html = bxBack(v) + bxHead('Your sets', hPlural(full, 'full set'));
    for (const s of v.sets) {
        const short = s.pieces[0];
        const need = s.pieces.reduce((n, p) => n + p.need, 0);
        html += `<div class="ta-l"><b>${hEsc(s.label)} Set</b><span></span><b class="num">${hNum(s.full)} full</b>`
            + `<span class="s">${short ? `Shortest: ${hEsc(short.short)} ${hNum(short.held)} · ` : ''}${need ? hPlural(need, 'piece') + ' short' : 'nothing short'}</span></div>`;
    }
    if (v.buy.units) html += bxKv('Shopping list', `${hPlural(v.buy.units, 'piece')} · ${hPlural(v.buy.run.stops.length, 'stop')}`);
    if (v.trades.open.length) html += bxKv('Open trades', hNum(v.trades.open.length));
    return { head: full ? `${hPlural(full, 'set')} ready` : 'no full set yet', where: '', html, marks: [] };
}

/** One line of the checklist: the tick, the piece, how many, and under it what you hold of it against your target. */
function bxCheck(p, { n, right = '', cls = '', sub = '', held, act = '' }) {
    const target = p.target || 0;
    const w = target ? Math.min(100, Math.round(held / target * 100)) : 0;
    return `<div class="ta-l ck ${cls}"><span class="lead"><span class="tk">✓</span>${hPic(p.id, p.name)}</span><b>${hEsc(p.name)}${n ? ' ×' + hNum(n) : ''}</b><b class="num">${right}</b>`
        + (sub ? `<span class="s">${sub}</span>` : '')
        + `<span class="s hold">You hold <b class="num">${hNum(held)}</b>${target ? ` of ${hNum(target)}` : ''}<span class="bar ${target && held >= target ? 'full' : ''}"><i style="--w:${w}%"></i></span></span>`
        + (act ? `<span class="s">${act}</span>` : '') + '</div>';
}

/**
 * Your stock on its own, beside Torn's page while you buy (the owner, 2026-10-11: "my separate overlay with live
 * tracking ... a warning that turns red if im buying more than i need"). Every piece of the sets you build: what
 * you hold now - a buy seen here a moment ago counted in - against what the set needs. A piece turns red when the
 * number in its open Buy box is more than you need.
 * @param live { pend: { itemId: units }, typed: { itemId: units in an open Buy box here }, here: [itemId on this page] }
 * @returns { head, html, over: [{ id, name, typed, need }] }
 */
export function boxStock(v, live = {}) {
    const pend = live.pend || {};
    const typed = live.typed || {};
    const here = new Set((live.here || []).map(String));
    const whole = (n) => Math.max(0, Math.floor(Number(n) || 0));
    const over = [];
    let togo = 0;
    let body = '';
    for (const s of v.sets) {
        let full = Infinity;
        let rows = '';
        for (const p of s.pieces) {
            const id = String(p.id);
            const held = p.held + whole(pend[id]);
            const target = Math.max(0, p.held + p.need - p.ahead);
            const need = Math.max(0, target - held);
            const t = whole(typed[id]);
            const more = t > need ? t - need : 0;
            if (more) over.push({ id, name: p.name, typed: t, need });
            togo += need;
            full = Math.min(full, held);
            const cls = more ? 'over' : need > 0 ? 'need' : held > target ? 'ahead' : 'ok';
            const say = more ? `typing ${hNum(t)} · ${hNum(more)} too many` : t ? `typing ${hNum(t)} of ${hNum(need)}` : need > 0 ? `need ${hNum(need)}` : held > target ? `${hNum(held - target)} ahead` : 'enough';
            const w = target ? Math.min(100, Math.round((held / target) * 100)) : 100;
            rows += `<div class="st-r ${cls}${here.has(id) ? ' here' : ''}" data-act="plan" data-v="${hEsc(id)}" title="${hEsc(p.name)} in Torn Archive">${hPic(p.id, p.name)}<span class="n">${hEsc(p.short || p.name)}</span><b class="num">${hNum(held)}</b><span class="x">${say}</span><span class="bar ${target && held >= target ? 'full' : ''}"><i style="--w:${w}%"></i></span></div>`;
        }
        body += bxHead(`${hEsc(s.label)} sets`, `${hNum(Number.isFinite(full) ? full : 0)} full of ${hNum(s.target)}`) + rows;
    }
    const warn = over.length ? `<div class="ta-hold st-over"><b>More than you need.</b> ${over.map((o) => `${hEsc(o.name)}: ${hNum(o.typed)} typed, ${o.need ? `you need ${hNum(o.need)}` : 'you need no more'}`).join(' · ')}</div>` : '';
    // When Torn counted, so "Read" says what it brought: Torn counts your items once an hour, and a read in
    // between brings that same count. What you buy in between is counted here, from the pages you buy on.
    const age = (v.top && v.top.stock) || null;
    const foot = age && age.tornAt ? `<div class="ta-n">Counted by Torn ${hClock(age.tornAt)} · next ${hClock(age.nextAt)}</div>`
        : age && age.readAt ? `<div class="ta-n">Items read ${hClock(age.readAt)}</div>` : '';
    return { head: over.length ? 'more than you need' : togo ? `${hNum(togo)} to go` : 'every piece is in', html: warn + body + foot, over };
}

/**
 * Someone's bazaar, or the Item Market: the checklist of what to buy here, each piece with what you hold of it.
 * @param cards [{ itemId, price, qty, typed, hasBox }] the listings on the page, in page order
 * @param place 'b:' + the owner's id, or 'im'
 * @param live  what this tab saw that the shared view does not hold yet, so the box moves the moment you buy:
 *              pend { itemId: units } bought here and not in the view yet, took { itemId: units } bought here on
 *              this visit, fillAll (Fill all is on), itemId (the Item Market: the piece its address names),
 *              gone (a Set of piece ids proven or marked gone from this bazaar), late (a press of Start, Next or
 *              Stop made in a box still waits for the hub)
 * @returns null when nothing here is yours to buy and no run is on; else { where, head, html,
 *          marks: [{ i, text, state, ring }], fill: [{ i, n }] the number Fill all types into each card's box,
 *          waits: lines of your list here that are not on the page as it stands,
 *          imNext: { id, name } | null - the Item Market, a run on: the piece whose page Next opens }
 */
export function boxBazaar(v, cards, place, live = {}) {
    const pend = live.pend || {};
    const tookHere = live.took || {};
    const goneSet = live.gone || new Set();
    const im = place === IM_PLACE;
    const stops = v.buy.run.stops;
    const run = v.buy.run;
    const at = stops.findIndex((s) => s.place === place);
    const here = at >= 0 ? stops[at] : null;
    const cur = stops.find((s) => s.state === 'cur') || null;
    const on = !!cur;
    const next = here ? stops[at + 1] || null : cur || stops[0] || null;
    const lineOf = (id) => (here ? here.lines.find((l) => String(l.id) === String(id)) : null);
    const gotOf = (id) => Math.max(0, Math.floor(Number(pend[String(id)]) || 0));
    // Taken on a line: what the run has counted, and what you bought here a moment ago.
    const takenOn = (line) => Math.min(line.q, (on ? Math.min(line.q, (run.took && run.took[line.key]) || 0) : 0) + gotOf(line.id));
    const heldOf = (p) => p.held + gotOf(p.id);
    const marks = [];
    const rows = [];
    const fill = [];
    const onPage = new Set();
    // Units already given to cards of the same piece further up the page (the Item Market has a row for every price).
    const usedOn = new Map();
    let any = false;
    cards.forEach((c, i) => {
        const p = viewPiece(v, c.itemId);
        if (!p) return;
        any = true;
        const id = String(p.id);
        const line = lineOf(id);
        // The Item Market lists one piece many times: only the listings worth taking are marked - under the piece's
        // own worth, or at your list's price for it or under (a piece its set still profits with).
        if (im && !(c.price > 0 && (c.price < p.worth || (line && c.price <= line.price)) && (line || p.need > 0))) return;
        const first = !onPage.has(id);
        onPage.add(id);
        const need = Math.max(0, p.need - gotOf(id));
        const taken = line ? takenOn(line) : 0;
        // On your list, and dearer on the page now than the list has it - past everything its set can carry: not
        // bought at that price. The hub is told what the page shows, and makes the list again.
        const dear = !!line && c.price > line.price && !(c.price < Math.max(p.worth, p.lineT || p.lineS || 0));
        const left = dear ? 0 : line ? line.q - taken : need > 0 && c.price > 0 && c.price < p.worth ? need : 0;
        // Never more than the listing holds, as the page says it now.
        // On the Item Market the piece's rows share what is left, in the order the page has them. A card that does
        // not say its stock (a category tile there) gets no number: "buy 150 here" where three exist is a guess.
        const used = usedOn.get(id) || 0;
        const open = Math.max(0, left - used);
        const blind = im && !(c.qty > 0);
        const take = first || im ? (c.qty > 0 ? Math.min(open, c.qty) : blind ? 0 : open) : 0;
        usedOn.set(id, used + take);
        const cap = line ? take : need;
        let text;
        let state;
        let ring = '';
        if (c.typed > cap && c.typed > 0) { text = cap ? `typing ${hNum(c.typed)} · you ${line ? 'listed' : 'need'} ${hNum(cap)}` : `typing ${hNum(c.typed)} · you need no more`; state = 'over'; ring = 'over'; }
        else if (take > 0 && c.typed === take) { text = `${hNum(take)} typed`; state = line ? 'top' : ''; ring = line ? 'top' : 'need'; }
        // The owner, 2026-10-11: "it says need 150 ... but it only has a few things there. Can it just tell me how
        // much I need from that bazaar". So the mark says what to take HERE, never the whole of what you need.
        else if (line && take > 0) { text = `buy ${hNum(take)}${take < open ? ' · all it has' : ''}`; state = 'top'; ring = 'top'; }
        else if (blind && open > 0) { text = 'under its worth · open it for the stock'; state = ''; ring = 'need'; }
        else if (dear) { text = 'dearer than your list'; state = 'ahead'; }
        else if (line && taken > 0 && first) { text = `took ${hNum(taken)} ✓`; state = 'good'; }
        else if (take > 0) { text = `buy ${hNum(take)}${take < open ? ' · all it has' : ''}`; state = ''; ring = 'need'; }
        else if (im && need > 0) { text = 'not needed'; state = 'ok'; }
        else if (need > 0) { text = bxMakes(p, c.price).text; state = 'ok'; }
        else if (p.ahead > 0) { text = `${hNum(p.ahead)} ahead`; state = 'ahead'; }
        else { text = 'enough'; state = 'ok'; }
        marks.push({ i, text, state, ring });
        if (take > 0) fill.push({ i, n: take });
        // The Item Market: each price row you are to buy from is a row of the box, with its own number and price.
        if (first ? take > 0 || taken > 0 : take > 0) rows.push({ p, c, i, take, line, taken: first ? taken : 0, short: take < open });
    });
    // On your list here, and not on the page as it stands: further down the bazaar (Torn draws only the listings
    // near the screen), or sold since the list was made.
    const away = (here ? here.lines : []).filter((l) => !onPage.has(String(l.id))).map((l) => ({ l, p: viewPiece(v, l.id), taken: takenOn(l) })).filter((x) => x.p);
    // Bought here on this visit and on no line any more (the list let go of it once it was yours).
    const shown = new Set([...rows.map((r) => String(r.p.id)), ...away.map((x) => String(x.p.id))]);
    const bought = Object.keys(tookHere).filter((id) => tookHere[id] > 0 && !shown.has(String(id))).map((id) => ({ p: viewPiece(v, id), n: tookHere[id] })).filter((x) => x.p);
    // With a run on, every bazaar and every page of the Item Market shows the way on: back to its stop, or past it.
    if (!any && !here && !bought.length && !on) return null;

    const todo = rows.filter((r) => r.take > 0);
    const waits = away.filter((x) => x.l.q - x.taken > 0 && !goneSet.has(String(x.p.id)));
    // A press in a box that the hub has not taken after a few seconds: said, with the way to its tab. The press
    // itself shows here already.
    const late = live.late ? `<div class="ta-hold"><b>The hub has not taken your last press.</b><div class="ta-btns late">${bxBtn('hub', 'Open its tab')}</div></div>` : '';
    let html = late + bxBack(v) + bxHead(here ? (on ? 'Buying your list' : 'On your list here') : 'Under their worth here', here ? `stop ${at + 1} of ${stops.length}` : todo.length || bought.length ? '' : 'nothing');
    for (const r of rows) {
        const done = !r.take;
        const typed = !done && r.c.typed === r.take;
        const act = done ? '' : typed ? `<b class="t-good">${hNum(r.take)} typed</b>`
            : r.c.hasBox ? bxBtn('fill-card', `Fill ${hNum(r.take)}`, '', String(r.i), ` data-n="${r.take}"`)
            : 'Open its Buy box';
        html += bxCheck(r.p, {
            n: done ? r.taken : r.take, cls: done ? 'done' : '', held: heldOf(r.p), act,
            right: done ? 'took ✓' : hMoney(r.take * r.c.price),
            sub: done ? '' : `${hMoney(r.c.price)} each · ${bxWorth(r.p, r.c.price)}${r.short ? ' · all it has' : ''}${r.taken ? ` · took ${hNum(r.taken)}` : ''}`,
        });
    }
    for (const x of away) {
        const left = x.l.q - x.taken;
        const gone = goneSet.has(String(x.p.id));
        html += bxCheck(x.p, left > 0 ? {
            n: left, cls: 'away', held: heldOf(x.p), right: gone ? 'gone' : hMoney(left * x.l.price),
            sub: gone ? '' : im ? 'on its own page' : 'not on the page',
            // "item no longer there": Torn draws only the listings near the screen, so the page cannot tell a
            // listing further down from one that sold. You can, with one press.
            act: gone || im ? '' : bxBtn('gone', 'Gone', '', String(x.p.id), ' title="Not in this bazaar any more: off your list here"'),
        } : { n: x.taken, cls: 'done', held: heldOf(x.p), right: 'took ✓' });
    }
    for (const x of bought) html += bxCheck(x.p, { n: x.n, cls: 'done', held: heldOf(x.p), right: 'took ✓' });
    if (waits.length && !im) html += bxNote(`<b>${hPlural(waits.length, 'piece')} not on the page.</b> Scroll down, or press Gone.`);
    if (todo.length) {
        const cost = todo.reduce((s, r) => s + r.take * r.c.price, 0);
        const gain = todo.reduce((s, r) => s + r.take * (r.p.worth - r.c.price), 0);
        html += bxKv(`${hPlural(todo.reduce((s, r) => s + r.take, 0), 'piece')} cost`, hMoney(cost), 'sep')
            + (gain >= 0 ? bxKv('Under their worth', `<span class="t-good">${hSigned(gain)}</span>`) : bxKv('Over their worth', hMoney(-gain)));
        // Fill all: one press of yours, and each number is typed into its own box. Nothing of Torn's is pressed.
        const typed = todo.filter((r) => r.c.typed === r.take).length;
        html += '<div class="ta-btns">' + (live.fillAll ? bxBtn('fill-all', 'Fill all is on · put back', '', 'off') : bxBtn('fill-all', `Fill all ${hNum(todo.length)}`, 'go', 'on')) + '</div>';
        if (live.fillAll) html += bxNote(typed >= todo.length ? `<b>All ${hNum(todo.length)} typed</b>` : `<b>${hNum(typed)} of ${hNum(todo.length)} typed.</b> Open the other Buy boxes.`);
    } else if (!rows.length && !away.length && !bought.length) {
        html += bxNote('Nothing to buy here.');
    }
    if (here && on) {
        const took = Math.min(here.units, here.lines.reduce((s, l) => s + takenOn(l), 0));
        html += took >= here.units ? `<div class="ta-ok">Took ${hNum(took)} of ${hNum(here.units)} ✓</div>`
            : took ? `<div class="ta-warn">Took ${hNum(took)} of ${hNum(here.units)}</div>` : '';
    }
    // While a run stands here the Next button names the next stop: said once.
    if (next && next !== here && !on) html += `<div class="ta-kv"><span>${here ? 'Next stop' : 'Your list starts at'}</span><span>${next.im ? 'Item Market' : hEsc(next.who || 'a bazaar')}: ${next.lines.map((l) => hEsc(l.name.replace(/ (Plushie|Flower)$/i, '')) + ' ×' + hNum(l.q)).join(', ')}</span></div>`;
    const after = here ? stops[at + 1] || null : null;
    // The Item Market is ONE stop with a page for each piece. Next walks its pieces in the list's order, and only
    // after the last one moves on (the owner, 2026-10-11: "so the next next in shopping list just takes me there").
    // Until 1.2.4 Next left the Item Market after its first piece: the others were "skipped".
    const pageAt = im && here ? here.lines.reduce((k0, l, k) => (onPage.has(String(l.id)) || String(l.id) === String(live.itemId || '') ? k : k0), -1) : -1;
    const imNext = im && here && on ? here.lines.find((l, k) => k > pageAt && l.q - takenOn(l) > 0) || null : null;
    const stopName = (s) => (s.im ? 'Item Market' : hEsc(s.who || 'a bazaar'));
    const linesOf = (s) => ` title="${hEsc(s.lines.map((l) => l.name + ' ×' + l.q).join(', '))}"`;
    // The keys, said where they do something: while something of yours is to buy on this page. The right arrow is
    // the press of Next (or of "Your stop"), and is said as where that takes you.
    const right = !here ? 'your stop' : imNext ? 'next piece' : !after ? 'Torn Archive' : after.im ? 'Item Market' : 'next bazaar';
    if (todo.length || waits.length) html += `<div class="ta-n keys"><span class="kbd">↑</span>Fill all<span class="kbd">↓</span>next listing${on ? `<span class="kbd">→</span>${right}` : ''}</div>`;
    // One purple button on the page: Fill all while there is something to type, Next once there is not.
    const main = todo.length ? '' : 'go';
    const stop = bxBtn('run-stop', 'Stop the run', 'link');
    const past = cur ? stops[stops.indexOf(cur) + 1] || null : null;
    // A run that a press in this box just ended, before the hub has answered: nothing to press until it does.
    html += '<div class="ta-btns">' + (run.over ? ''
        // A run is on and this place is on your list - the stop the run is on or another ("i didnt follow the
        // list"): Next goes on from here, and the stops passed over stay on the list.
        : on && here ? bxBtn('run-next', (imNext ? `Next: ${hEsc(imNext.name)} ×${hNum(imNext.q - takenOn(imNext))}` : after ? (after.im ? 'Next: Item Market' : 'Next: ' + hEsc(after.who || 'bazaar')) : 'Done · back to Torn Archive') + '<span class="kbd">N</span>', main, '', !imNext && after ? linesOf(after) : '') + stop
        // A run is on and this place is not on your list: back to the run's stop, or on past it.
        : on ? bxBtn('run-go', `Your stop: ${stopName(cur)}<span class="kbd">N</span>`, main, '', linesOf(cur)) + bxBtn('run-next', past ? `Skip to ${stopName(past)}` : 'Skip · back to Torn Archive', '', '', past ? linesOf(past) : '') + stop
        : stops.length ? bxBtn('run-start', 'Start the run', main) : '') + '</div>';
    if (run.over) html += bxNote('<b>Run over.</b> Skipped stops stay on the list.');
    // Folded, the bar says what is here, so you know to unfold it.
    const left = todo.length + waits.length;
    const head = here ? (left ? `${hNum(left)} to buy` : 'all taken ✓') : todo.length ? `${hNum(todo.length)} under ${todo.length === 1 ? 'its' : 'their'} worth` : '';
    return { where: im ? 'the Item Market' : 'a bazaar', head, html, marks, fill, waits: waits.length, imNext: imNext ? { id: imNext.id, name: imNext.name } : null };
}

/**
 * A trade.
 * @param t      the trade as the view has it (view.trades.open), or null when the hub has not read it
 * @param rows   [{ name, qty }] the other side's rows on the page, in page order
 * @param step   'view' | 'addmoney'
 */
/**
 * Whether the set pieces on Torn's page are the ones the hub read: the same pieces, the same counts. The total,
 * the message and Fill are of the trade as it was read; a pile put in or taken out since makes them wrong.
 * Only set pieces are compared (their names are Torn's own on both sides). No rows from the page: nothing to compare.
 * @param rows [{ name, qty }] the other side's rows on the page
 * @returns { same, diff: Set of lower-case names whose count differs }
 */
export function tradeSame(v, t, rows) {
    const diff = new Set();
    if (!t || !rows || !rows.length) return { same: true, diff };
    const pieces = new Set(v.pieces.map((p) => String(p.name).toLowerCase()));
    const sum = (list, ok) => { const m = new Map(); for (const r of list) { const k = String(r.name).toLowerCase(); if (ok(r, k)) m.set(k, (m.get(k) || 0) + Math.max(1, Math.floor(Number(r.qty) || 0))); } return m; };
    const here = sum(rows, (r, k) => pieces.has(k));
    const read = sum(t.rows, (r) => r.state !== 'other');
    for (const k of new Set([...here.keys(), ...read.keys()])) if (here.get(k) !== read.get(k)) diff.add(k);
    return { same: !diff.size, diff };
}

/**
 * A trade.
 * @param known the other side's rows as this tab last saw them on the trade's own view (the add-money step shows none)
 */
export function boxTrade(v, t, rows, step, hasMoneyBox, known = null) {
    const marks = [];
    if (!t) {
        return rows.length ? { where: 'a trade', html: bxNote('Trade not read yet.'), marks } : null;
    }
    const same = tradeSame(v, t, rows.length ? rows : known || []);
    const pieceNames = new Set(v.pieces.map((p) => String(p.name).toLowerCase()));
    rows.forEach((row, i) => {
        const key = String(row.name).toLowerCase();
        const r = t.rows.find((x) => String(x.name).toLowerCase() === key);
        if (!r) { if (pieceNames.has(key)) marks.push({ i, text: 'not read yet', state: 'over', where: 'right' }); return; }
        if (r.state === 'other' || !r.each) { marks.push({ i, text: 'not a set piece', state: 'over', where: 'right' }); return; }
        if (same.diff.has(key)) { marks.push({ i, text: `${hMoney(r.each)} each · count changed`, state: 'over', where: 'right' }); return; }
        const word = r.take >= r.qty ? `need all ${hNum(r.qty)}` : r.take ? `need ${hNum(r.take)} of ${hNum(r.qty)}` : r.ahead ? 'ahead' : 'enough';
        marks.push({ i, text: `${hMoney(r.each)} · ${word}`, state: r.take ? (r.top ? 'top' : '') : 'ahead', where: 'right' });
    });
    const m = t.margin;
    // The rate this trade is really paid at ("101%", or "100.6% to 101%" when its sets differ): each set at the
    // lower of your rate and its own ceiling (core/sellrate.js).
    const paid = t.paid || v.prices.paid || hRate(v.settings.pct) + '%';
    if (!same.same) {
        // The numbers of the trade as it was would be paid for the trade as it is: none is shown, nothing is filled.
        const others = v.trades.open.filter((x) => x.id !== t.id);
        return {
            where: 'a trade', marks, changed: true,
            html: bxHead('Your prices', `${paid} of market value`)
                + `<div class="ta-hold"><b>Trade changed.</b> New total within a minute.</div>`
                + (others.length ? `<div class="ta-kv sep"><span>Also open with you</span><span>${others.map((x) => `<a class="lk" data-act="open-trade" data-v="${hEsc(x.id)}">${hEsc(x.who || 'a trade')}</a>`).join(' · ')}</span></div>` : ''),
        };
    }
    const owed = Math.max(0, t.total - t.myMoney);
    let html = bxHead('Your prices', `${paid} of market value`)
        + bxKv('Only what you need', hMoney(t.needTotal)) + bxKv(`Everything, ${hPlural(t.units, 'piece')}`, hMoney(t.total));
    const profit = m && m.all ? `Profit ${hSigned(m.all.leaves)} · ${hPct(m.all.pct)}` : '';
    if (m && m.state === 'ok') html += `<div class="ta-ok">${profit}</div>`;
    else if (m && m.state === 'under') html += `<div class="ta-hold"><b>${profit}:</b> under your least profit.${m.mend ? ` ${hRate(m.mend)}% would keep it.` : ''}</div>`;
    else if (m && m.state === 'loss') html += `<div class="ta-hold"><b>${profit}:</b> a loss.${m.mend ? ` ${hRate(m.mend)}% would keep your least profit.` : ''}</div>`;
    // What you pay came down inside its hour: the seller may have counted on more.
    for (const r of t.rateDown || []) html += `<div class="ta-hold"><b>${hEsc(r.label)} price down</b> from ${hRate(r.from)}% to ${hRate(r.to)}% at ${hClock(r.at)} TCT.</div>`;
    if (m && m.others && m.others.length) html += bxNote(`Not priced: <b>${m.others.map(hEsc).join(', ')}</b>`);
    // Only when something has to come out of the trade (1.4.0): what to paste to the seller.
    if (t.message && owed) html += `<div class="msg">${hEsc(t.message)}</div><div class="ta-btns">${bxBtn('copy', 'Copy the message', 'go', t.message)}</div>`;
    if (owed && step === 'addmoney') html += '<div class="ta-btns">' + (hasMoneyBox ? bxBtn('fill-money', `Fill ${hMoney(t.total)}`, 'go', String(t.total)) : '') + '</div>';
    if (t.vault > 0 && v.top.onHand != null) html += `<div class="ta-hold"><b>On hand ${hMoney(v.top.onHand)}.</b> Take ${hMoney(t.vault)} out of the vault.${t.short ? ` ${hMoney(t.short)} short with the vault.` : ''}</div>`;
    else if (!owed && t.total) html += '<div class="ta-ok">Paid · waiting for them</div>';
    const others = v.trades.open.filter((x) => x.id !== t.id);
    if (others.length) html += `<div class="ta-kv sep"><span>Also open with you</span><span>${others.map((x) => `<a class="lk" data-act="open-trade" data-v="${hEsc(x.id)}">${hEsc(x.who || 'a trade')}</a>`).join(' · ')}</span></div>`;
    return { where: 'a trade', html, marks };
}

/**
 * The museum.
 * @param found [{ set, hasBox }] the EXCHANGE controls on the page
 * @param off   { setKey: sets } swapped since the view was worked out
 */
export function boxMuseum(v, found, off = {}) {
    const shown = found.map((f) => f.set);
    const sets = v.sets.filter((s) => !shown.length || shown.includes(s.key)).map((s) => ({ ...s, full: Math.max(0, s.full - (off[s.key] || 0)) }));
    const full = sets.reduce((a, s) => a + s.full, 0);
    const price = v.points.price;
    let html = bxHead('Sets ready', `${hNum(full)} full`);
    const tiles = [];
    for (const s of sets) {
        const gain = price ? s.full * (s.value - s.cost) : null;
        if (s.full) {
            html += `<div class="ta-l"><b style="grid-column:1/3">${hNum(s.full)} ${hEsc(s.label)} ${s.full === 1 ? 'Set' : 'Sets'} · ${hNum(s.full * s.points)} points</b><b class="num ${gain == null ? '' : gain >= 0 ? 't-good' : 't-bad'}">${gain == null ? '' : hSigned(gain)}</b>`
                + `<span class="s">cost ${hMoney(s.cost)} a set${s.costKnown ? '' : ' (at your rate)'}${price ? ` · worth ${hMoney(s.value)}` : ''}</span></div>`;
        }
        const short = s.pieces[0];
        if (short) {
            html += bxKv(`${hEsc(s.label)} sets held back by`, hEsc(short.short || short.name), s === sets[0] ? 'sep' : '');
            tiles.push({ set: s.key, id: short.id, text: `holds you at ${hNum(s.full)}`, state: 'top' });
        }
        const ex = found.find((f) => f.set === s.key);
        if (s.full && v.settings.fillMuseum) {
            html += ex && ex.hasBox ? `<div class="ta-btns">${bxBtn('fill-museum', `Fill ${hNum(s.full)}${sets.length > 1 ? ' ' + hEsc(s.label.toLowerCase()) : ''}`, 'go', s.key, ` data-n="${s.full}"`)}</div>`
                : ex ? bxNote('No number box beside EXCHANGE.') : '';
        }
    }
    if (v.points.cheap && full) html += `<div class="ta-hold"><b>Points are cheap today.</b></div>`;
    return { where: 'the museum', html, marks: [], tiles };
}

const PM_RANK = { '': 1, ahead: 2, bad: 3 };

/**
 * The points market as you type (mockup Z7): where the price in Torn's box would sit in the list, and whether it is
 * a loss, cheap, or more under the lowest than it takes.
 * @param page { typed: { amount, price } | null, rows: [{ points, each }] } - the page's own list, cheapest first
 * @returns { html, marks: [{ i, state }] (a line on the top edge of row i of the page's list), note: { text, state } | null }
 */
function pointsTyped(v, page) {
    const p = v.points;
    const onPage = !!(page && page.rows && page.rows.length);
    // The page's own list is of now; without it, the hub's read of the market (a minute old at most).
    const rows = onPage ? page.rows : (p.ladder || []).map((l) => ({ points: l.qty, each: l.price }));
    const least = p.sell.least || 0;
    const usual = p.level && p.level.lo ? `${hMoney(p.level.lo)} to ${hMoney(p.level.hi)}` : '';
    const t = page && page.typed ? typedListing(rows, { ...page.typed, least, level: p.level }) : null;
    // A line in Torn's list is a hairline on the edge between two rows, with no words on it: the box says what it is.
    const marks = new Map();
    const said = [];
    const add = (i, state, words) => {
        const m = marks.get(i);
        marks.set(i, { i, state: m && PM_RANK[m.state] > PM_RANK[state] ? m.state : state });
        said.push({ i, words });
    };
    if (onPage) {
        const lines = listLines(rows, { least, level: p.level });
        if (t && t.at != null) add(t.at, '', 'yours');
        if (lines.cheapAt != null) add(lines.cheapAt, 'ahead', `above it: under the usual ${usual}`);
        if (lines.lossAt != null) add(lines.lossAt, 'bad', `above it: a loss, under ${hMoney(least)}`);
    }
    const hue = { '': ['blue', '#5aa7ff'], ahead: ['amber', '#f6b74a'], bad: ['red', '#ff7878'] };
    const by = new Map();
    for (const s of said) by.set(s.i, [...(by.get(s.i) || []), s.words]);
    const legend = by.size ? bxNote([...by].map(([i, words]) => `<b style="color:${hue[marks.get(i).state][1]}">${hue[marks.get(i).state][0]} line</b> ${words.join(', ')}`).join(' · ')) : '';
    if (!t) return { html: legend, marks: [...marks.values()], note: least ? { text: `Your least price: ${hMoney(least)}`, state: '' } : null };
    const pos = t.past ? `over ${hNum(t.ahead)} points sell first` : t.ahead ? `${hNum(t.ahead)} points sell first` : rows.length ? 'first in the list' : '';
    const verdict = t.state === 'loss' ? (t.by < 0 ? (t.amount ? `a loss of ${hMoney(-t.by * t.amount)}` : `a loss of ${hMoney(-t.by)} a point`) : 'no profit: what they cost you')
        : t.under ? `${hMoney(t.under)} under the lowest: $1 under is enough`
        : t.state === 'cheap' ? `${p.hold ? 'hold: ' : ''}under the usual ${usual}`
        : t.state === 'good' ? (t.amount ? `profit ${hSigned(t.by * t.amount)}` : `${hSigned(t.by)} a point over cost`) : '';
    const text = [pos, verdict].filter(Boolean).join(' · ');
    const note = text ? { text: text.charAt(0).toUpperCase() + text.slice(1), state: t.state === 'loss' ? 'bad' : t.under || t.state === 'cheap' ? 'ahead' : t.state === 'good' ? 'good' : '' } : null;
    let html = bxHead('What you typed', `${t.amount ? hNum(t.amount) + ' at ' : ''}${hMoney(t.price)}`)
        + bxKv('Sell before yours', t.past ? `over ${hNum(t.ahead)} points` : t.ahead ? `${hNum(t.ahead)} points` : rows.length ? 'none: first in the list' : 'not read')
        + (t.by == null ? '' : t.amount ? bxKv(`Profit on these ${hNum(t.amount)}`, hSigned(t.by * t.amount), t.by > 0 ? 't-good' : 't-bad') : bxKv(`${t.by < 0 ? 'Under' : 'Over'} your cost, ${hMoney(least - 1)}`, `${hMoney(Math.abs(t.by))} a point`, t.by > 0 ? 't-good' : 't-bad'))
        + (t.amount ? bxKv('Puts on hand', hMoney(t.amount * t.price)) : '');
    if (t.state === 'loss') html += `<div class="ta-hold"><b>A loss.</b> ${hMoney(t.price)} is under your least price ${hMoney(least)}${t.amount && t.by < 0 ? `: ${hMoney(-t.by * t.amount)} on these ${hNum(t.amount)}` : ''}.</div>`;
    else if (t.under) html += `<div class="ta-hold"><b>${hMoney(t.under)} under the lowest listing.</b> ${hMoney(t.lowest - 1)} is first already${t.given ? `: ${hMoney(t.given)} given away on these ${hNum(t.amount)}` : ''}.</div>`;
    else if (t.state === 'cheap' && !(p.hold || p.cheap)) html += `<div class="ta-hold"><b>Cheap.</b> ${hMoney(t.price)} is under the usual ${usual}.</div>`;
    return { html: html + legend, marks: [...marks.values()], note };
}

/**
 * The points market. `hasBoxes` = Torn's Amount and Price boxes were found.
 * `page` = what the page itself shows: { typed: { amount, price } | null, rows: [{ points, each }] } (see pointsTyped).
 */
export function boxPoints(v, hasBoxes, page = null) {
    const p = v.points;
    if (!p.price) return { where: 'the points market', html: bxNote('Points price not read yet.'), marks: [], note: null };
    const typed = pointsTyped(v, page);
    const sell = p.sell;
    // The lot to list now: the first of your lots, none over your biggest (1.4.0; until then all of them in one).
    const lot = sell.next;
    let html = '';
    // Cheap is judged on the lowest listing, not on the price Fill would type.
    const low = p.lowest || p.price;
    if (p.hold && p.level && p.level.lo) html += `<div class="ta-hold"><b>Hold.</b> Lowest ${hMoney(low)}, usual ${hMoney(p.level.lo)} to ${hMoney(p.level.hi)}.</div>`;
    else if (p.cheap && p.level && p.level.lo) html += `<div class="ta-hold"><b>Cheap today.</b> Lowest ${hMoney(low)}, usual ${hMoney(p.level.lo)} to ${hMoney(p.level.hi)}.</div>`;
    if (!sell.points) {
        html += typed.html + bxNote('No points to sell.');
        return { where: 'the points market', html, marks: typed.marks, note: typed.note };
    }
    const readySets = (v.sets || []).reduce((a, s) => a + s.full, 0);
    const ready = (v.sets || []).reduce((a, s) => a + s.full * s.points, 0);
    const each = sell.points ? p.book.cost / sell.points : 0;
    html += bxHead(p.hold ? 'If you list anyway' : 'Your points', `${hNum(sell.points)} made from sets`)
        + bxKv(`Price to type · $1 under the ${p.rule === 'wall' ? 'first wall' : 'lowest'}`, hMoney(p.price))
        + bxKv('Listed at that or cheaper', `${hNum(p.ahead)} points`)
        + (sell.listed ? bxKv('On the market now', `${hNum(sell.listed)} points`) : '')
        + (sell.lots.length ? bxKv(`In lots, none over ${hNum(p.lotMax)}`, lotsWords(sell.lots)) : '')
        + (ready ? bxKv(`${hPlural(readySets, 'full set')} not swapped yet`, `+${hNum(ready)} points`) : '')
        + (lot ? bxKv(`This lot of ${hNum(lot)} pays`, `${hMoney(lot * p.price)} · <span class="${p.price < each ? 't-bad' : 't-good'}">${hSigned(lot * (p.price - each))}</span>`) : '');
    if (sell.loss) html += `<div class="ta-hold"><b>A loss.</b> ${hMoney(p.price)} is under your cost ${hMoney(sell.least)}.</div>`;
    else if (!lot) html += bxNote('All of them are on the market.');
    else if (v.settings.fillPoints) html += '<div class="ta-btns">' + (hasBoxes ? bxBtn('fill-points', `${p.hold ? 'Fill anyway' : 'Fill'}: ${hNum(lot)} at ${hMoney(p.price)}`, p.hold ? '' : 'go', String(lot), ` data-n="${p.price}"`) : '') + '</div>'
        + (hasBoxes ? '' : bxNote('Amount and Price boxes not found.'));
    html += typed.html;
    return { where: 'the points market', html, marks: typed.marks, note: typed.note };
}

/** Your buying thread. `title` = its title as the page shows it. */
export function boxForum(v, title, check) {
    const pr = v.prices;
    // 'under': the title names your rate - the most you pay - while a set is paid less today (its ceiling). The
    // title is not wrong, so nothing asks for an edit: it is said, and the trade message names the rate paid.
    const under = check.state === 'under';
    const ok = check.state === 'match' || under;
    const paid = pr.paid || hRate(pr.pct) + '%';
    const shop = pr.open ? `Open · ${paid}` : 'Closed';
    const why = check.state === 'open' ? `It says CLOSED; your shop is Open at ${paid}.` : check.state === 'closed' ? 'It says OPEN; your shop is Closed.' : check.state === 'rate' ? `It says ${hRate(check.says.pct)}%; your rate is ${hRate(pr.pct)}%.` : '';
    let html = bxHead('Your thread', under ? 'title names your rate' : ok ? 'title matches' : 'title out of date') + bxKv('Shop', `<span class="${pr.open ? 't-good' : ''}">${shop}</span>`);
    if (under) html += `<div class="ta-hold"><b>Title says ${hRate(check.says.pct)}%, today you pay ${paid}.</b></div>`;
    else if (!ok) html += `<div class="ta-hold"><b>${hEsc(why)}</b></div><div class="msg">${hEsc(pr.forum.title)}</div>`;
    if (pr.forum.behind) html += `<div class="ta-hold"><b>Post is behind.</b> ${pr.forum.behind.words.map(hEsc).join(' ')}</div>`;
    html += `<div class="ta-btns">${bxBtn('copy', 'Copy the title', ok ? '' : 'go', pr.forum.title)}${bxBtn('copy', 'Copy the post', '', pr.forum.post, ` data-html="${hEsc(pr.forum.html)}" data-post="1"`)}</div>`;
    return { where: 'your thread', html, marks: [], titleMark: { text: under ? `says ${hRate(check.says.pct)}%, you pay ${paid} today` : ok ? `matches your shop: ${shop}` : 'does not match your shop', state: under ? 'ahead' : ok ? 'good' : 'over' }, title };
}

/*
 * 1.3.7 - the total where you pay it. The owner, 2026-10-12, on his own trade: "it shows how much each is, but just
 * doesnt show the total ... cant i just overlay should fill here how much i need? and red if i dont have enough?
 * and when i go to property to withdraw my vault, fill how much i need to withdraw?" Until now the total and Fill
 * were in the box alone. These say them on Torn's own lines: a mark on your money row of the trade, Fill beside
 * Torn's Add Money box, and Fill beside your vault's Withdraw box. The words only; torn-page.js puts them there.
 */

/** Torn's own vault tab: it shows the vault of the property you live in. */
export const VAULT_URL = 'https://www.torn.com/properties.php#/p=options&tab=vault';

/**
 * A trade's money, on Torn's own lines.
 * @param t      the trade as the view has it, null when the hub has not read it
 * @param same   tradeSame(): false when the pieces on the page are not the ones the hub read
 * @param onHand your money on you: as Torn's Add Money line says it, else as the hub last read it; null when neither
 * @returns { mark: { text, state } | null   on your money row of the trade,
 *            fill: { buttons: [{ label, amount }], note, state, vault } | null   beside Torn's Add Money box }
 */
export function tradeMoney(t, same = true, onHand = null) {
    if (!t) return { mark: null, fill: null };
    if (!same) return { mark: { text: 'changed since it was read: total within a minute', state: 'ahead' }, fill: { buttons: [], note: 'Trade changed: new total within a minute.', state: 'ahead', vault: false } };
    const total = Math.max(0, Math.floor(Number(t.total) || 0));
    if (!total) return { mark: null, fill: null };
    const need = Math.max(0, Math.floor(Number(t.needTotal) || 0));
    const mine = Math.max(0, Math.floor(Number(t.myMoney) || 0));
    const split = need > 0 && need < total;
    const have = onHand == null ? null : Math.max(0, Math.floor(Number(onHand) || 0));
    // What is still to come from your pocket, for everything and for only what you need.
    const moreAll = Math.max(0, total - mine);
    const moreNeed = split ? Math.max(0, need - mine) : moreAll;
    const shortAll = have == null ? 0 : Math.max(0, moreAll - have);
    const shortNeed = have == null ? 0 : Math.max(0, moreNeed - have);

    let mark;
    if (!moreAll) mark = { text: `Total ${hMoney(total)} · paid ✓`, state: 'good' };
    else if (split && !moreNeed) mark = { text: `What you need ${hMoney(need)} · paid ✓ · all ${hMoney(total)}`, state: 'good' };
    else if (shortNeed) mark = { text: `Add ${hMoney(moreAll)} · only ${hMoney(have)} on you`, state: 'over' };
    else mark = { text: `Total ${hMoney(total)} · add ${hMoney(moreAll)}`, state: 'top' };

    // Torn's box takes the whole amount of the trade, so the number is the total, not what is still missing.
    const buttons = [];
    if (moreAll) buttons.push({ label: `Add ${hMoney(total)}`, amount: total });
    if (split && moreNeed) buttons.push({ label: `Add only what I need: ${hMoney(need)}`, amount: need });
    let note;
    let state = '';
    if (!moreAll) { note = 'Paid ✓'; state = 'good'; }
    else if (have == null) note = split ? `Everything, ${hPlural(t.units, 'piece')}: ${hMoney(total)}.` : '';
    else if (shortNeed) { note = `${hMoney(have)} on you: ${hMoney(shortAll)} short${split && shortNeed !== shortAll ? `, ${hMoney(shortNeed)} short of what you need` : ''}`; state = 'over'; }
    else if (shortAll) { note = `${hMoney(have)} on you: covers what you need, ${hMoney(shortAll)} short of everything`; state = 'over'; }
    else { note = `${hMoney(have)} on you: enough`; state = 'good'; }
    return { mark, fill: { buttons, note, state, vault: shortAll > 0 } };
}

/**
 * Your vault's Withdraw box: exactly what to take out - for your open trades, for your shopping list, for both -
 * which is what they want less what is on you already (the owner, 2026-10-12: "whenever we have a trade, or a
 * shopping list. it automatically shows me how much money i need to put in the trade and take out for shopping
 * (exactly) ... so click it it fills and withdraws").
 * @param onHand, vault  as Torn's vault page says them; else as the hub last read them; null when neither
 * @returns { buttons: [{ label, amount }], note, state, all, need, n, list } | null   null: nothing wants money
 */
export function vaultMoney(v, onHand = null, vault = null) {
    const open = ((v && v.trades && v.trades.open) || []).filter((t) => Number(t.total) > 0);
    let all = 0;
    let need = 0;
    let n = 0;
    for (const t of open) {
        const mine = Math.max(0, Math.floor(Number(t.myMoney) || 0));
        const a = Math.max(0, Math.floor(Number(t.total) || 0) - mine);
        const part = Number(t.needTotal) > 0 && Number(t.needTotal) < Number(t.total);
        all += a;
        need += part ? Math.max(0, Math.floor(Number(t.needTotal)) - mine) : a;
        if (a) n += 1;
    }
    // What is left of your shopping list costs, as the hub has it.
    const list = Math.max(0, Math.floor(Number(v && v.buy && v.buy.cost) || 0));
    if (!all && !list) return null;
    const top = (v && v.top) || {};
    const have = onHand == null ? (top.onHand != null ? top.onHand : null) : onHand;
    const inVault = vault == null ? (top.vault != null ? top.vault : null) : vault;
    const take = (want) => Math.max(0, want - (have || 0));
    const wants = [];
    if (all) wants.push(`${hPlural(n, 'trade')} ${hMoney(all)}`);
    if (list) wants.push(`list ${hMoney(list)}`);
    const why = wants.join(' · ') + (have == null ? '' : ` · on you ${hMoney(have)}`);
    const most = take(all + list);
    if (!most) return { buttons: [], note: `${why} · enough`, state: 'good', all, need, n, list };
    const buttons = [];
    // Small buttons beside Torn's WITHDRAW: the sum and one word; what it is for in full is the button's own title.
    const add = (label, amount, title) => { if (amount > 0 && !buttons.some((b) => b.amount === amount)) buttons.push({ label: `${hMoney(amount)} · ${label}`, short: hMoney(amount), amount, title: `Withdraw ${hMoney(amount)}: ${title}${have ? `, less the ${hMoney(have)} on you` : ''}` }); };
    if (all) add(n === 1 ? 'trade' : 'trades', take(all), `what your ${hPlural(n, 'open trade')} still ${n === 1 ? 'wants' : 'want'}`);
    if (all && need < all) add('what I need', take(need), 'only the pieces you need of them');
    if (list) add('list', take(list), 'what your shopping list costs');
    if (all && list) add('both', most, 'your trades and your shopping list');
    const lacks = inVault != null && inVault < most;
    return {
        buttons: inVault == null ? buttons : buttons.filter((b) => b.amount <= inVault),
        note: lacks ? `${why} · vault ${hMoney(inVault)}: ${hMoney(most - inVault)} short${all && list ? ' of both' : ''}` : why,
        state: lacks ? 'over' : '', all, need, n, list,
    };
}

/** Your vault's Deposit box: everything on you, in one press ("a button that automatically deposits all"). */
export function vaultDeposit(onHand = null) {
    const have = Math.max(0, Math.floor(Number(onHand) || 0));
    return have ? { buttons: [{ label: `All ${hMoney(have)}`, amount: have, title: `Deposit all ${hMoney(have)} that is on you` }] } : null;
}

/** The box on your vault's page: the same numbers, once. */
export function boxVault(v, m) {
    if (!m) return null;
    let html = bxHead('Your vault', [m.n ? hPlural(m.n, 'open trade') : '', m.list ? 'your list' : ''].filter(Boolean).join(' · '));
    if (m.all) html += bxKv('Trades, still to pay', hMoney(m.all));
    if (m.all && m.need !== m.all) html += bxKv('Only what you need', hMoney(m.need));
    if (m.list) html += bxKv('Shopping list', hMoney(m.list));
    html += `<div class="${m.state === 'over' ? 'ta-hold' : m.state === 'good' ? 'ta-ok' : 'ta-kv sep'}">${hEsc(m.note)}</div>`;
    return { where: 'your vault', html, marks: [] };
}
