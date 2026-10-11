// What the small box on Torn's pages says, and what each mark says: worked out from the view the hub shares and
// from what the page in front of you holds. Strings and plain data only; ui/torn-page.js puts them on the page.
// Nothing here presses anything of Torn's: a button either types into a box of Torn's on your press (Fill),
// copies text, or opens one page.

import { hEsc, hNum, hMoney, hSigned, hPic, hPlural, hRate } from './fmt.js';
import { marginWords } from '../core/margin.js';
import { lotsWords } from '../core/lots.js';
import { viewPiece } from '../core/view.js';
import { IM_PLACE } from '../core/shopping.js';

const bxKv = (l, r, cls = '') => `<div class="ta-kv ${cls}"><span>${l}</span><b class="num">${r}</b></div>`;
const bxNote = (t) => `<div class="ta-n">${t}</div>`;
const bxBtn = (act, label, cls = '', v = '', more = '') => `<button class="btn sm ${cls}" data-act="${act}"${v !== '' ? ` data-v="${hEsc(v)}"` : ''}${more}>${label}</button>`;
const bxHead = (title, right = '') => `<h4>${title}<span>${right}</span></h4>`;

/** While the hub has not shared anything yet, or what it shared is old. */
export function boxWaiting(old) {
    return { where: '', html: bxNote(old ? 'Torn Archive is not open: these numbers would be old. <b>Open the hub</b> and they come back.' : 'Open the hub once: your sets are worked out there, and shown here.'), marks: [] };
}

/**
 * The hub is not open, or was never set up: no number is shown, it would be old. `go`: Open is the thing to do.
 * @param setUp a key has been pasted
 * @param old   the hub shared something once
 */
export function boxClosed(setUp, old) {
    if (!setUp) return { head: 'not set up yet', go: true, where: '', html: bxNote('Torn Archive has no key yet. <b>Open</b> it and paste one in Settings: nothing is read before that.'), marks: [] };
    return { ...boxWaiting(old), head: 'hub is closed', go: true };
}

/** A page of Torn's that is none of ours, while the hub is open: your sets, and what waits for you. */
export function boxAny(v) {
    const full = v.sets.reduce((n, s) => n + s.full, 0);
    let html = bxHead('Your sets', hPlural(full, 'full set'));
    for (const s of v.sets) {
        const short = s.pieces[0];
        const need = s.pieces.reduce((n, p) => n + p.need, 0);
        html += `<div class="ta-l"><b>${hEsc(s.label)} Set</b><span></span><b class="num">${hNum(s.full)} full</b>`
            + `<span class="s">${short ? `Shortest: ${hEsc(short.short)} ${hNum(short.held)} · ` : ''}${need ? hPlural(need, 'piece') + ' short' : 'nothing short'}</span></div>`;
    }
    if (v.buy.units) html += bxKv('Your shopping list', `${hPlural(v.buy.units, 'piece')} · ${hPlural(v.buy.run.stops.length, 'stop')}`);
    if (v.trades.open.length) html += bxKv('Trades open with you', hNum(v.trades.open.length));
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
 * Someone's bazaar, or the Item Market: the checklist of what to buy here, each piece with what you hold of it.
 * @param cards [{ itemId, price, qty, typed, hasBox }] the listings on the page, in page order
 * @param place 'b:' + the owner's id, or 'im'
 * @param live  what this tab saw that the shared view does not hold yet, so the box moves the moment you buy:
 *              pend { itemId: units } bought here and not in the view yet, took { itemId: units } bought here on
 *              this visit, fillAll (Fill all is on)
 * @returns null when nothing here is yours to buy; else { where, head, html, marks: [{ i, text, state, ring }],
 *          fill: [{ i, n }] the number Fill all types into each card's box }
 */
export function boxBazaar(v, cards, place, live = {}) {
    const pend = live.pend || {};
    const tookHere = live.took || {};
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
    let any = false;
    cards.forEach((c, i) => {
        const p = viewPiece(v, c.itemId);
        if (!p) return;
        any = true;
        const id = String(p.id);
        const line = lineOf(id);
        // The Item Market lists one piece many times: only the listings worth taking are marked.
        if (im && (line ? c.price > line.price : !(p.need > 0 && c.price < p.worth))) return;
        const first = !onPage.has(id);
        onPage.add(id);
        const need = Math.max(0, p.need - gotOf(id));
        const taken = line ? takenOn(line) : 0;
        const left = line ? line.q - taken : need > 0 && c.price > 0 && c.price < p.worth ? need : 0;
        // Never more than the listing holds, as the page says it now.
        const take = first ? (c.qty > 0 ? Math.min(left, c.qty) : left) : 0;
        const cap = line ? take : need;
        let text;
        let state;
        let ring = '';
        if (c.typed > cap && c.typed > 0) { text = cap ? `typing ${hNum(c.typed)} · you ${line ? 'listed' : 'need'} ${hNum(cap)}` : `typing ${hNum(c.typed)} · you need no more`; state = 'over'; ring = 'over'; }
        else if (take > 0 && c.typed === take) { text = `${hNum(take)} typed · press Buy`; state = line ? 'top' : ''; ring = line ? 'top' : 'need'; }
        else if (line && take > 0) { text = `on your list · buy ${hNum(take)}${take < left ? ' · all it has' : ''}`; state = 'top'; ring = 'top'; }
        else if (line && taken > 0) { text = `took ${hNum(taken)} ✓`; state = 'good'; }
        else if (take > 0) { text = `need ${hNum(need)} · worth ${hMoney(p.worth)}`; state = ''; ring = 'need'; }
        else if (need > 0) { text = `need ${hNum(need)} · over its worth`; state = 'ok'; }
        else if (p.ahead > 0) { text = `${hNum(p.ahead)} ahead already`; state = 'ahead'; }
        else { text = 'enough for now'; state = 'ok'; }
        marks.push({ i, text, state, ring });
        if (take > 0) fill.push({ i, n: take });
        if (first && (take > 0 || taken > 0)) rows.push({ p, c, i, take, line, taken, short: take < left });
    });
    // On your list here, and not on the page as it stands: further down the bazaar (Torn draws only the listings
    // near the screen), or sold since the list was made.
    const away = (here ? here.lines : []).filter((l) => !onPage.has(String(l.id))).map((l) => ({ l, p: viewPiece(v, l.id), taken: takenOn(l) })).filter((x) => x.p);
    // Bought here on this visit and on no line any more (the list let go of it once it was yours).
    const shown = new Set([...rows.map((r) => String(r.p.id)), ...away.map((x) => String(x.p.id))]);
    const bought = Object.keys(tookHere).filter((id) => tookHere[id] > 0 && !shown.has(String(id))).map((id) => ({ p: viewPiece(v, id), n: tookHere[id] })).filter((x) => x.p);
    if (!any && !here && !bought.length) return null;

    const todo = rows.filter((r) => r.take > 0);
    const waits = away.filter((x) => x.l.q - x.taken > 0);
    let html = bxHead(here ? (on ? 'Buying your list' : 'On your list here') : 'Under their worth here', here ? `stop ${at + 1} of ${stops.length}` : todo.length || bought.length ? '' : 'nothing');
    for (const r of rows) {
        const done = !r.take;
        const typed = !done && r.c.typed === r.take;
        const act = done ? '' : typed ? `<b class="t-good">${hNum(r.take)} typed.</b> Press Buy on Torn.`
            : r.c.hasBox ? bxBtn('fill-card', `Fill ${hNum(r.take)}`, '', String(r.i), ` data-n="${r.take}"`)
            : live.fillAll ? `Open its Buy box on Torn: ${hNum(r.take)} is typed for you.` : 'Open its Buy box on Torn, then Fill types the number.';
        html += bxCheck(r.p, {
            n: done ? r.taken : r.take, cls: done ? 'done' : '', held: heldOf(r.p), act,
            right: done ? 'took ✓' : hMoney(r.take * r.c.price),
            sub: done ? '' : `${hMoney(r.c.price)} each · worth ${hMoney(r.p.worth)} to you${r.short ? ' · all this listing has' : ''}${r.taken ? ` · took ${hNum(r.taken)} so far` : ''}`,
        });
    }
    for (const x of away) {
        const left = x.l.q - x.taken;
        html += bxCheck(x.p, left > 0 ? { n: left, cls: 'away', held: heldOf(x.p), right: hMoney(left * x.l.price), sub: im ? 'on its own page of the Item Market' : 'not on the page as it stands' }
            : { n: x.taken, cls: 'done', held: heldOf(x.p), right: 'took ✓' });
    }
    for (const x of bought) html += bxCheck(x.p, { n: x.n, cls: 'done', held: heldOf(x.p), right: 'took ✓' });
    if (waits.length && !im) html += bxNote(`<b>${hPlural(waits.length, 'piece')} on your list ${waits.length === 1 ? 'is' : 'are'} not on the page as it stands.</b> Scroll down the bazaar: Torn draws only the listings near the screen${live.fillAll ? ', and Fill all types into each as it comes' : ''}. One that is not there has sold.`);
    if (todo.length) {
        const cost = todo.reduce((s, r) => s + r.take * r.c.price, 0);
        const gain = todo.reduce((s, r) => s + r.take * (r.p.worth - r.c.price), 0);
        html += bxKv(`${hPlural(todo.reduce((s, r) => s + r.take, 0), 'piece')} cost`, hMoney(cost), 'sep') + bxKv('Worth more than you pay', `<span class="t-good">${hSigned(gain)}</span>`);
        // Fill all: one press of yours, and each number is typed into its own box. Nothing of Torn's is pressed.
        const typed = todo.filter((r) => r.c.typed === r.take).length;
        html += '<div class="ta-btns">' + (live.fillAll ? bxBtn('fill-all', 'Fill all is on · put back', '', 'off') : bxBtn('fill-all', `Fill all ${hNum(todo.length)}`, 'go', 'on')) + '</div>';
        if (live.fillAll) html += bxNote(typed >= todo.length ? `<b>All ${hNum(todo.length)} typed.</b> Press Buy on each.` : `<b>${hNum(typed)} of ${hNum(todo.length)} typed.</b> Open the Buy box of the others: each gets its number as it opens.`);
    } else if (!rows.length && !away.length && !bought.length) {
        html += bxNote('Nothing here is under its worth for the pieces you need.');
    }
    if (here && on) {
        const took = Math.min(here.units, here.lines.reduce((s, l) => s + takenOn(l), 0));
        html += took >= here.units ? `<div class="ta-ok">You took ${hNum(took)} of ${hNum(here.units)} ✓</div>`
            : took ? `<div class="ta-warn">You took ${hNum(took)} of ${hNum(here.units)}. Next counts only what you took.</div>`
            : bxNote('Not bought yet. Or skip it: <b>Next counts only what you took.</b>');
    }
    // While a run stands here the Next button names the next stop: said once.
    if (next && next !== here && !on) html += `<div class="ta-kv"><span>${here ? 'Next stop' : 'Your list starts at'}</span><span>${next.im ? 'Item Market' : hEsc(next.who || 'a bazaar')}: ${next.lines.map((l) => hEsc(l.name.replace(/ (Plushie|Flower)$/i, '')) + ' ×' + hNum(l.q)).join(', ')}</span></div>`;
    const after = here ? stops[at + 1] || null : null;
    const stopName = (s) => (s.im ? 'the Item Market' : hEsc(s.who || 'a bazaar'));
    // One purple button on the page: Fill all while there is something to type, Next once there is not.
    const main = todo.length ? '' : 'go';
    html += '<div class="ta-btns">' + (on && here && here.state === 'cur'
        ? bxBtn('run-next', (after ? (after.im ? 'Next: the Item Market' : 'Next bazaar: ' + hEsc(after.who || '')) : 'Done: back to the list') + '<span class="kbd">N</span>', main, '', after ? ` title="${hEsc(after.lines.map((l) => l.name + ' ×' + l.q).join(', '))}"` : '') + bxBtn('run-stop', 'Stop the run', 'link')
        // A run is on and this is not its stop (you went elsewhere, or the stop left the list): back to it.
        : on ? bxBtn('run-go', `Your stop: ${stopName(cur)}<span class="kbd">N</span>`, main) + bxBtn('run-stop', 'Stop the run', 'link')
        : stops.length ? bxBtn('run-start', 'Start the run', main) : '') + '</div>';
    html += bxNote(`Fill types the number into Torn's box. <b>You press Buy.</b> What you took is counted from the listing's stock on the page${v.top.stock && v.top.stock.log ? " and from Torn's log" : ''}.`);
    // Folded, the bar says what is here, so you know to unfold it.
    const left = todo.length + waits.length;
    const head = here ? (left ? `${hNum(left)} to buy here` : 'all taken here ✓') : todo.length ? `${hNum(todo.length)} under ${todo.length === 1 ? 'its' : 'their'} worth here` : '';
    return { where: im ? 'the Item Market' : 'a bazaar', head, html, marks, fill };
}

/**
 * A trade.
 * @param t      the trade as the view has it (view.trades.open), or null when the hub has not read it
 * @param rows   [{ name, qty }] the other side's rows on the page, in page order
 * @param step   'view' | 'addmoney'
 */
export function boxTrade(v, t, rows, step, hasMoneyBox) {
    const marks = [];
    if (!t) {
        return rows.length ? { where: 'a trade', html: bxNote('This trade has not been read yet. The hub reads your open trades once a minute.'), marks } : null;
    }
    rows.forEach((row, i) => {
        const r = t.rows.find((x) => String(x.name).toLowerCase() === String(row.name).toLowerCase());
        if (!r) return;
        if (r.state === 'other' || !r.each) { marks.push({ i, text: 'not a set piece, not priced', state: 'over', where: 'right' }); return; }
        const word = r.take >= r.qty ? `need all ${hNum(r.qty)}` : r.take ? `need ${hNum(r.take)} of ${hNum(r.qty)}` : r.ahead ? 'ahead already' : 'enough for now';
        marks.push({ i, text: `${hMoney(r.each)} · ${word}`, state: r.take ? (r.top ? 'top' : '') : 'ahead', where: 'right' });
    });
    const m = t.margin;
    const pct = v.settings.pct;
    let html = bxHead('Your prices', `${hRate(pct)}% of market value`)
        + bxKv('Only what you need', hMoney(t.needTotal)) + bxKv(`Everything, ${hPlural(t.units, 'piece')}`, hMoney(t.total));
    if (m && m.state === 'ok') html += `<div class="ta-ok">Everything in it ${marginWords(m.all)} before any fee.</div>`;
    else if (m && m.state === 'under') html += `<div class="ta-hold"><b>Everything in it ${marginWords(m.all)}:</b> under your least profit since the points price fell.${m.mend ? ` Paying ${hRate(m.mend)}% would keep it.` : ''}</div>`;
    else if (m && m.state === 'loss') html += `<div class="ta-hold"><b>Everything in it ${marginWords(m.all)}:</b> a loss at the points price now.${m.mend ? ` Paying ${hRate(m.mend)}% would keep your least profit.` : ''}</div>`;
    if (m && m.others && m.others.length) html += bxNote(`<b>${m.others.map(hEsc).join(', ')}</b>: not a set piece, not priced. The total does not cover ${m.others.length === 1 ? 'it' : 'them'}.`);
    if (t.message) html += `<div class="msg">${hEsc(t.message)}</div><div class="ta-btns">${bxBtn('copy', 'Copy the message', 'go', t.message)}${t.messageNeed && t.needTotal !== t.total ? bxBtn('copy', 'Only what I need', '', t.messageNeed) : ''}</div>`;
    const owed = Math.max(0, t.total - t.myMoney);
    if (owed && step === 'addmoney') html += '<div class="ta-btns">' + (hasMoneyBox ? bxBtn('fill-money', `Fill ${hMoney(t.total)}`, 'go', String(t.total)) : '') + '</div>';
    if (t.vault > 0 && v.top.onHand != null) html += `<div class="ta-hold"><b>On hand ${hMoney(v.top.onHand)}.</b> Take ${hMoney(t.vault)} out of the vault just before you pay.</div>`;
    else if (!owed && t.total) html += '<div class="ta-ok">Your money covers it: nothing to do until they accept.</div>';
    const others = v.trades.open.filter((x) => x.id !== t.id);
    if (others.length) html += `<div class="ta-kv sep"><span>Also open with you</span><span>${others.map((x) => `<a class="lk" data-act="open-trade" data-v="${hEsc(x.id)}">${hEsc(x.who || 'a trade')}</a>`).join(' · ')}</span></div>`;
    html += bxNote(`Fill types the money into Torn's box. <b>You press Change and Accept.</b> Nothing is sent or accepted for you.`);
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
                + `<span class="s">cost you ${hMoney(s.cost)} a set${s.costKnown ? '' : ' (at your rate: no buy on record)'}${price ? ` · worth ${hMoney(s.value)} at ${hMoney(price)} a point` : ''}</span></div>`;
        }
        const short = s.pieces[0];
        if (short) {
            html += bxKv(`${hEsc(short.short || short.name)} holds ${hEsc(s.label.toLowerCase())} sets at`, hNum(s.full), s === sets[0] ? 'sep' : '');
            tiles.push({ set: s.key, id: short.id, text: `holds you at ${hNum(s.full)}`, state: 'top' });
        }
        const ex = found.find((f) => f.set === s.key);
        if (s.full && v.settings.fillMuseum) {
            html += ex && ex.hasBox ? `<div class="ta-btns">${bxBtn('fill-museum', `Fill ${hNum(s.full)}${sets.length > 1 ? ' ' + hEsc(s.label.toLowerCase()) : ''}`, 'go', s.key, ` data-n="${s.full}"`)}</div>`
                : ex ? bxNote('No number box was found beside EXCHANGE: one press there swaps what Torn says.') : '';
        }
    }
    if (v.points.cheap && full) html += `<div class="ta-hold"><b>Points are cheap today.</b> Swap if you like: the points wait in your book until the price is back.</div>`;
    html += bxNote(`Fill types the number of full sets into Torn's box. <b>You press EXCHANGE.</b> The points go into your book at what the sets cost. Profit is counted later, when the points sell.`);
    return { where: 'the museum', html, marks: [], tiles };
}

/** The points market. `hasBoxes` = Torn's Amount and Price boxes were found. */
export function boxPoints(v, hasBoxes) {
    const p = v.points;
    if (!p.price) return { where: 'the points market', html: bxNote('The points price has not been read yet. The hub reads it once a minute.'), marks: [] };
    const sell = p.sell;
    const lot = sell.quick && sell.quick.size ? sell.quick.size : sell.points;
    let html = '';
    // Cheap is judged on the lowest listing, not on the price Fill would type.
    const low = p.lowest || p.price;
    if (p.hold && p.level && p.level.lo) html += `<div class="ta-hold"><b>Hold.</b> The lowest listing is ${hMoney(low)}, under the usual ${hMoney(p.level.lo)} to ${hMoney(p.level.hi)}. Your rule: cheap points are not sold.</div>`;
    else if (p.cheap && p.level && p.level.lo) html += `<div class="ta-hold"><b>Cheap today.</b> The lowest listing is ${hMoney(low)}, under the usual ${hMoney(p.level.lo)} to ${hMoney(p.level.hi)}.</div>`;
    if (!sell.points) {
        html += bxNote(`No points made from your sets are waiting to be sold.${p.before ? ` The ${hNum(p.before)} you had before are left alone.` : ''}`);
        return { where: 'the points market', html, marks: [] };
    }
    html += bxHead(p.hold ? 'If you list anyway' : 'Your points', `${hNum(sell.points)} made from sets`)
        + bxKv(`Price to type · $1 under the ${p.rule === 'wall' ? 'first wall' : 'lowest'}`, hMoney(p.price))
        + bxKv('Listed cheaper than that', `${hNum(p.ahead)} points`)
        + bxKv('Lot', sell.quick ? `${lotsWords(sell.quick.lots)} · the size that leaves quickest` : `all ${hNum(sell.points)} in one`)
        + bxKv('One lot puts on hand', hMoney(lot * p.price));
    if (sell.loss) html += `<div class="ta-hold"><b>A loss.</b> ${hMoney(p.price)} is under the ${hMoney(sell.least)} these points cost you. Wait.</div>`;
    else if (v.settings.fillPoints) html += '<div class="ta-btns">' + (hasBoxes ? bxBtn('fill-points', `${p.hold ? 'Fill anyway' : 'Fill'}: ${hNum(lot)} at ${hMoney(p.price)}`, p.hold ? '' : 'go', String(lot), ` data-n="${p.price}"`) : '') + '</div>'
        + (hasBoxes ? '' : bxNote("Torn's Amount and Price boxes were not found on this page: type them yourself."));
    html += bxNote(`${p.before ? `The ${hNum(p.before)} points you had before are left alone. ` : ''}Bank each lot when it sells: a buy-mug takes cash on hand. Fill types lot and price. <b>You press ADD LISTING.</b>`);
    return { where: 'the points market', html, marks: [] };
}

/** Your buying thread. `title` = its title as the page shows it. */
export function boxForum(v, title, check) {
    const pr = v.prices;
    const ok = check.state === 'match';
    const shop = pr.open ? `Open · ${hRate(pr.pct)}%` : 'Closed';
    const why = check.state === 'open' ? `It says CLOSED; your shop is Open at ${hRate(pr.pct)}%.` : check.state === 'closed' ? 'It says OPEN; your shop is Closed.' : check.state === 'rate' ? `It says ${hRate(check.says.pct)}%; you pay ${hRate(pr.pct)}%.` : '';
    let html = bxHead('Your thread', ok ? 'the title matches' : 'the title is out of date') + bxKv('Shop', `<span class="${pr.open ? 't-good' : ''}">${shop}</span>`);
    if (!ok) html += `<div class="ta-hold"><b>${hEsc(why)}</b> Edit the thread on Torn and paste the new title.</div><div class="msg">${hEsc(pr.forum.title)}</div>`;
    html += `<div class="ta-btns">${bxBtn('copy', 'Copy the title', ok ? '' : 'go', pr.forum.title)}${bxBtn('copy', 'Copy the post', '', pr.forum.post)}</div>`
        + bxNote('<b>Nothing is posted or edited for you.</b>');
    return { where: 'your thread', html, marks: [], titleMark: { text: ok ? `matches your shop: ${shop}` : 'does not match your shop', state: ok ? 'good' : 'over' }, title };
}
