/*
 * A trade's count, and buys seen on a bazaar page. Pure: no DOM, no network.
 *
 * Cut for Torn Archive from Torn Bids 3.24.0 (core/accepted.js), which was
 * everything about a trade the trader said yes to. What stayed:
 *
 *   - the most items one trade takes (TRADE_MAX_UNITS), the count against it
 *     (tradeCount, through boughtSince) and the one line to say (countView);
 *   - buys seen on the page you are viewing, from a card's stock dropping in
 *     front of you (stockBuys).
 *
 * boughtSince still reads a trade in Torn Bids' shape - {trader: {name}, at,
 * items: [{kind: 'flip'|'yours', itemId, name, units, bid, left, steps:
 * [{qty, price, bought, boughtQty, boughtAt, skipped, sellerName}]}],
 * extra: [{itemId, name, qty, price, bid, seller, at}]} - because the count is
 * worked out there. Accepting, ticking, the buying run, leftovers, Checkout
 * and the log-over-page rules are left behind.
 */

/*
 * The most items one trade takes (3.23.0; the owner, 2026-10-05: "the 10k
 * limit is per trade"): a count of units - what the plan buys, what you buy
 * outside it and your own To sell lines together. The plan, Add all and Fill
 * all stop at it; what goes over waits in To sell under that trader, for a
 * second trade with them ("yes can go to sell").
 */
export const TRADE_MAX_UNITS = 10000;
/* From this share of it, the count says how much room is left. */
const TRADE_NEAR = 0.9;

/** A step you have been through: bought (all or some), or skipped. */
export function stepDone(step) {
    return Boolean(step && (step.bought || step.skipped || step.boughtQty > 0));
}

/** How many of a line to send: yours as planned; a flip what you actually bought, once you started buying it. */
export function sendUnits(line) {
    if (!line) return 0;
    if (line.kind === 'yours') return line.units;
    const started = (line.steps || []).some(stepDone);
    if (!started) return line.units;
    return line.steps.reduce((a, st) => a + (st.bought ? (st.boughtQty > 0 ? st.boughtQty : st.qty) : st.boughtQty || 0), 0);
}

/** Units of a line that went to the trader: what you send, minus what they did not take. */
export function takenUnits(line) {
    return Math.max(0, sendUnits(line) - Math.max(0, Math.floor(Number(line && line.left) || 0)));
}

/* ------------------------------------ Bought since you accepted (3.14.3) */

/*
 * The owner, 2026-09-28: a separate window, only while a trade is accepted,
 * listing everything bought for it since "X accepted" - and on Torn's trade
 * page, a checklist: each item ticks itself once it is in the trade, and a
 * warning names what was bought but not added. Picked from mockups/Q: its own
 * window, moved anywhere. Items bought that the trader does not buy are left
 * off; ones they buy that were not planned are orange (red when at a loss).
 * `trade.extra` holds those unplanned buys ({itemId, name, qty, price, seller,
 * at, bid}); nothing fills it until the bazaar page's own purchase message has
 * been read live (the planned steps are counted as before).
 */

/**
 * Unplanned buys on a bazaar page (3.14.3; the owner: "don't we have enough
 * ... the way the script is written?"): the same way the planned buys are
 * counted - a card's stock on the page you are viewing - for every card.
 * Stock that drops while you are on the page: bought. A card that vanishes:
 * bought only if you pressed a button on it (else someone else bought it out,
 * and it is not counted). A card whose stock the page does not say is never
 * counted. `seen` carries each card's last stock between reads.
 *
 * Torn Archive 1.2.2 (the owner's page, 2026-10-11: buys shown that he never made): a count is never a guess.
 * A listing that is gone counts for no more than the number that stood in its Buy box when you pressed Torn's Buy
 * (`gone` as a Map), and a stock that fell counts only on a listing you pressed in (`pressedIn`): other buyers
 * take from the same bazaar while you look at it.
 *
 * @param {object} seen - key ('itemId|price') -> {qty, itemId, price, name}
 * @param {Array<{itemId, name, listingPrice, qty, qtyAssumed}>} cards - this read
 * @param {Set<string>|Map<string, number>} [gone] - listings gone after your press: their keys, or key -> the most you can have taken
 * @param {Set<string>|null} [pressedIn] - keys of the listings you pressed in; null = a fallen stock always counts
 * @returns {{bought: Array<{itemId, name, price, qty}>, seen: object}}
 */
export function stockBuys(seen, cards, gone = new Set(), pressedIn = null) {
    const now = {};
    for (const c of cards || []) {
        if (!c || c.qtyAssumed || !(Number(c.qty) > 0) || !(Number(c.listingPrice) > 0)) continue;
        const key = String(c.itemId) + '|' + Number(c.listingPrice);
        const prev = now[key];
        now[key] = { qty: (prev ? prev.qty : 0) + Number(c.qty), itemId: String(c.itemId), price: Number(c.listingPrice), name: c.name || null };
    }
    const bought = [];
    for (const [key, was] of Object.entries(seen || {})) {
        const is = now[key];
        if (is && is.qty < was.qty) {
            if (!pressedIn || pressedIn.has(key)) bought.push({ itemId: was.itemId, name: was.name, price: was.price, qty: was.qty - is.qty });
        } else if (!is && gone.has(key)) {
            const most = gone instanceof Map ? Math.floor(Number(gone.get(key)) || 0) : was.qty;
            const qty = Math.min(was.qty, most);
            if (qty > 0) bought.push({ itemId: was.itemId, name: was.name, price: was.price, qty });
        }
    }
    return { bought, seen: now };
}

/**
 * @param {object} trade - an accepted trade (acceptTrade + recordBuy)
 * @param {object} [o]
 * @param {Map<string, number>|null} [o.inside] - lowercase item name -> how many are in Torn's trade now (the trade page), or null elsewhere
 * @returns {{trader, at, rows: Array, extra: Array, toBuy: number, totals: {cost, pays, profit}, missing: Array<{name, qty}>, done: boolean}}
 */
export function boughtSince(trade, { inside = null, max = TRADE_MAX_UNITS } = {}) {
    const rows = [];
    let cost = 0;
    let pays = 0;
    let toBuy = 0;
    for (const i of (trade && trade.items) || []) {
        if (i.kind !== 'flip') continue;
        let qty = 0;
        let spent = 0;
        let at = 0;
        const sellers = [];
        for (const st of i.steps || []) {
            if (!stepDone(st)) {
                toBuy += 1;
                continue;
            }
            const n = st.boughtQty > 0 ? st.boughtQty : st.bought ? st.qty : 0;
            if (!n) continue;
            qty += n;
            spent += n * st.price;
            at = Math.max(at, Number(st.boughtAt) || 0);
            if (st.sellerName && !sellers.includes(st.sellerName)) sellers.push(st.sellerName);
        }
        if (!qty) continue;
        const send = takenUnits(i);
        cost += spent;
        pays += send * i.bid;
        rows.push({ itemId: i.itemId, name: i.name, qty, each: spent / qty, bid: i.bid, sellers, at, planned: true, tone: 'planned', send, inTrade: null, profit: send * i.bid - (spent / qty) * send });
    }
    // Bought but not planned: only what this trader buys (the owner: "if the trader doesn't buy it, leave it off").
    const extra = [];
    for (const x of (trade && trade.extra) || []) {
        if (!x || !(x.bid > 0) || !(x.qty > 0)) continue;
        cost += x.qty * x.price;
        pays += x.qty * x.bid;
        extra.push({ ...x, each: x.price, sellers: x.seller ? [x.seller] : [], planned: false, tone: x.bid > x.price ? 'extra' : 'loss', send: x.qty, inTrade: null, profit: x.qty * (x.bid - x.price) });
    }
    const all = [...rows, ...extra].sort((a, b) => (a.at || 0) - (b.at || 0));
    // 10,000 items a trade (3.23.0): in the order you bought, then your own lines. What is over is not
    // sent, not expected money and not asked for by the checklist - it goes to To sell when the trade ends.
    const most = Number(max) > 0 ? Math.floor(Number(max)) : 0;
    let room = most;
    const overBy = new Map();
    for (const r of all) {
        const fit = Math.min(r.send, room);
        room -= fit;
        if (fit < r.send) {
            const cut = r.send - fit;
            const o = overBy.get(r.itemId) || { itemId: r.itemId, name: r.name, qty: 0, cost: 0 };
            o.qty += cut;
            o.cost += cut * r.each;
            overBy.set(r.itemId, o);
            cost -= cut * r.each;
            pays -= cut * r.bid;
            r.over = cut;
            r.send = fit;
            r.profit = fit * (r.bid - r.each);
        }
    }
    const yoursOver = {};
    let yoursSent = 0;
    for (const i of (trade && trade.items) || []) {
        if (i.kind === 'flip') continue;
        const want = takenUnits(i);
        const fit = Math.min(want, room);
        room -= fit;
        yoursSent += fit;
        if (fit < want) yoursOver[String(i.itemId)] = (yoursOver[String(i.itemId)] || 0) + (want - fit);
    }
    const overRows = [...overBy.values()].map((o) => ({ itemId: o.itemId, name: o.name, qty: o.qty, each: o.qty ? o.cost / o.qty : 0 }));
    const units = most - room;
    const count = {
        max: most,
        units,
        room,
        full: units >= most,
        // Nearly full: from nine tenths of it, Checkout says how much room is left.
        near: units < most && units >= most * TRADE_NEAR,
        over: overRows.reduce((a, o) => a + o.qty, 0) + Object.values(yoursOver).reduce((a, n) => a + n, 0),
        // Planned and not bought yet: not in the trade, and said apart.
        toBuy: ((trade && trade.items) || []).reduce((a, i) => a + (i.kind === 'flip' ? (i.steps || []).reduce((b, st) => b + (stepDone(st) ? 0 : Number(st.qty) || 0), 0) : 0), 0),
        overRows,
        yoursOver,
        yoursSent,
    };
    // What is in the trade, shared out in the order you bought: one item bought
    // twice (planned, and again unplanned) is not ticked twice from one count.
    if (inside) {
        const left = new Map([...inside].map(([k, n]) => [String(k).toLowerCase(), n]));
        for (const r of all) {
            const k = String(r.name).toLowerCase();
            r.inTrade = Math.min(r.send, left.get(k) || 0);
            left.set(k, (left.get(k) || 0) - r.inTrade);
        }
    }
    const missing = inside ? all.filter((r) => r.inTrade < r.send).map((r) => ({ name: r.name, qty: r.send - r.inTrade })) : [];
    return {
        trader: trade && trade.trader ? trade.trader.name : null,
        at: trade ? Number(trade.at) || 0 : 0,
        rows: all,
        toBuy,
        totals: { cost, pays, profit: pays - cost },
        missing,
        done: Boolean(inside) && all.length > 0 && !missing.length,
        count,
    };
}

/**
 * The trade's items against the most one trade takes (TRADE_MAX_UNITS).
 *
 * @returns {{max, units, room, full, over, toBuy, overRows: Array<{itemId, name, qty, each}>, yoursOver: object, yoursSent: number}}
 *   units: in the trade as it stands - bought (planned and not), and your own
 *   lines; toBuy: planned, not bought yet; over: bought or yours, past the
 *   limit (overRows: what you bought; yoursOver: item id -> units of yours)
 */
export function tradeCount(trade, max = TRADE_MAX_UNITS) {
    return boughtSince(trade, { max }).count;
}

/**
 * The count as Checkout and Torn Bids show it (3.23.0): how full, and the one
 * line to say - nothing while there is room, the room left from nine tenths,
 * and where the rest goes once it is full.
 *
 * @param {object|null} count - tradeCount / boughtSince's count
 * @param {string|null} name - the trader
 * @returns {{state: 'ok'|'near'|'full', units, max, pct, text, say}|null}
 */
export function countView(count, name) {
    if (!count || !(count.max > 0)) return null;
    const n = (x) => Number(x).toLocaleString('en-US');
    const who = name || 'them';
    const state = count.full ? 'full' : count.near ? 'near' : 'ok';
    const say = count.over > 0
        ? 'This trade is full. ' + n(count.over) + (count.over === 1 ? ' more goes' : ' more go') + ' to To sell under ' + who + ' when it is done, for a second trade.'
        : count.full
            ? 'This trade is full. Anything more you buy goes to To sell under ' + who + ', for a second trade.'
            : count.near ? 'Room for ' + n(count.room) + ' more in this trade.' : '';
    return {
        state,
        units: count.units,
        max: count.max,
        pct: Math.min(100, Math.round((count.units / count.max) * 1000) / 10),
        text: n(count.units) + ' of ' + n(count.max),
        say,
    };
}
