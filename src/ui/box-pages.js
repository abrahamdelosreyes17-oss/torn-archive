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
 * Someone's bazaar, or the Item Market.
 * @param cards [{ itemId, price, qty, typed, hasBox }] the listings on the page, in page order
 * @param place 'b:' + the owner's id, or 'im'
 * @returns null when nothing here is a piece of your sets
 */
export function boxBazaar(v, cards, place) {
    const im = place === IM_PLACE;
    const stops = v.buy.run.stops;
    const at = stops.findIndex((s) => s.place === place);
    const here = at >= 0 ? stops[at] : null;
    const next = here ? stops[at + 1] || null : stops.find((s) => s.state === 'cur') || stops[0] || null;
    const lineOf = (id) => (here ? here.lines.find((l) => String(l.id) === String(id)) : null);
    const marks = [];
    const rows = [];
    let any = false;
    cards.forEach((c, i) => {
        const p = viewPiece(v, c.itemId);
        if (!p) return;
        any = true;
        const line = lineOf(c.itemId);
        // The Item Market lists one piece many times: only the listings worth taking are marked.
        if (im && (line ? c.price > line.price : !(p.need > 0 && c.price < p.worth))) return;
        const want = line ? line.q : p.need;
        let text;
        let state;
        if (c.typed > want && c.typed > 0) { text = `typing ${hNum(c.typed)} · you ${line ? 'listed' : 'need'} ${hNum(want)}`; state = 'over'; }
        else if (line) { text = `on your list · buy ${hNum(line.q)}`; state = 'top'; }
        else if (p.need > 0 && c.price > 0 && c.price < p.worth) { text = `need ${hNum(p.need)} · worth ${hMoney(p.worth)}`; state = ''; }
        else if (p.need > 0) { text = `need ${hNum(p.need)} · over its worth`; state = 'ok'; }
        else if (p.ahead > 0) { text = `${hNum(p.ahead)} ahead already`; state = 'ahead'; }
        else { text = 'enough for now'; state = 'ok'; }
        marks.push({ i, text, state });
        const take = line ? line.q : p.need > 0 && c.price < p.worth ? Math.min(p.need, c.qty || p.need) : 0;
        if (take > 0 && !rows.some((r) => String(r.p.id) === String(p.id))) rows.push({ p, c, i, take, line });
    });
    if (!any) return null;
    const run = v.buy.run;
    const on = stops.some((s) => s.state === 'cur');
    let html = bxHead(here ? (on ? 'Buying your list' : 'On your list here') : 'Under their worth here', here ? `stop ${at + 1} of ${stops.length}` : rows.length ? '' : 'nothing');
    for (const r of rows) {
        const took = r.line && here ? Math.min(r.line.q, (run.took && run.took[r.line.key]) || 0) : 0;
        const done = took >= r.take && took > 0;
        html += `<div class="ta-l ${done ? 'dim' : ''}">${hPic(r.p.id, r.p.name)}<b>${hEsc(r.p.name)} ×${hNum(r.take)}</b><b class="num">${hMoney(r.take * r.c.price)}</b>`
            + `<span class="s">${done ? `you took ${hNum(took)} ✓` : `${hMoney(r.c.price)} each · worth ${hMoney(r.p.worth)} to you · need ${hNum(r.p.need)}`}</span>`
            + (done ? '' : `<span class="s">${r.c.hasBox ? bxBtn('fill-card', `Fill ${hNum(r.take)}`, 'go', String(r.i), ` data-n="${r.take}"`) : 'Open its Buy box on Torn, then Fill types the number.'}</span>`) + '</div>';
    }
    if (rows.length) {
        const cost = rows.reduce((s, r) => s + r.take * r.c.price, 0);
        const gain = rows.reduce((s, r) => s + r.take * (r.p.worth - r.c.price), 0);
        html += bxKv(`${hPlural(rows.reduce((s, r) => s + r.take, 0), 'piece')} cost`, hMoney(cost), 'sep') + bxKv('Worth more than you pay', `<span class="t-good">${hSigned(gain)}</span>`);
    } else {
        html += bxNote('Nothing here is under its worth for the pieces you need.');
    }
    if (here && on) {
        html += here.took >= here.units ? `<div class="ta-ok">You took ${hNum(here.took)} of ${hNum(here.units)} ✓</div>`
            : here.took ? `<div class="ta-warn">You took ${hNum(here.took)} of ${hNum(here.units)}. Next counts only what you took.</div>`
            : bxNote('Not bought yet. Or skip it: <b>Next counts only what you took.</b>');
    }
    // While a run stands here the Next button names the next stop: said once.
    if (next && next !== here && !(here && on)) html += `<div class="ta-kv"><span>${here ? 'Next stop' : 'Your list starts at'}</span><span>${next.im ? 'Item Market' : hEsc(next.who || 'a bazaar')}: ${next.lines.map((l) => hEsc(l.name.replace(/ (Plushie|Flower)$/i, '')) + ' ×' + hNum(l.q)).join(', ')}</span></div>`;
    const after = here ? stops[at + 1] || null : null;
    html += '<div class="ta-btns">' + (on && here
        ? bxBtn('run-next', (after ? (after.im ? 'Next: the Item Market' : 'Next bazaar: ' + hEsc(after.who || '')) : 'Done: back to the list') + '<span class="kbd">N</span>', 'go', '', after ? ` title="${hEsc(after.lines.map((l) => l.name + ' ×' + l.q).join(', '))}"` : '') + bxBtn('run-stop', 'Stop the run', 'link')
        : stops.length && !on ? bxBtn('run-start', 'Start the run', 'go') : '') + '</div>';
    html += bxNote(`Fill types the number into Torn's box. <b>You press Buy.</b> What you took is counted from the listing's stock on the page and from Torn's log.`);
    return { where: im ? 'the Item Market' : 'a bazaar', html, marks };
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
