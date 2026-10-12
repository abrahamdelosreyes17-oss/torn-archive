// A made-up desk, the numbers of mockup AB: what the tests and the harness draw the hub from.
// Every name here is invented. Nothing in this file ships in the script.

import { SETS } from '../src/core/sets.js';
import { archiveSettings } from '../src/core/settings.js';
import { recordPrice } from '../src/core/points.js';
import { poolAdd } from '../src/core/books.js';
import { lotsRead, LOTS_EMPTY } from '../src/core/lots.js';
import { runStart } from '../src/core/shopping.js';

const rng = (seed) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const DAY = 86400000;
const MIN = 60000;

const MV = {
    274: 34600, 266: 43600, 258: 33800, 268: 35300, 384: 38400, 273: 13900, 187: 820, 261: 15200, 269: 32090, 281: 36950, 186: 780, 618: 12400, 215: 910,
    263: 14400, 617: 67221, 276: 25600, 282: 36800, 272: 14210, 260: 720, 264: 15100, 277: 31900, 271: 21300, 267: 16200, 385: 52800,
};
const HELD = {
    274: 12, 266: 18, 258: 22, 268: 31, 384: 35, 273: 38, 187: 40, 261: 40, 269: 40, 281: 40, 186: 41, 618: 44, 215: 46,
    263: 3, 617: 6, 276: 7, 282: 8, 272: 9, 260: 10, 264: 10, 277: 10, 271: 10, 267: 10, 385: 12,
};
const SELLERS = [['Bramwell', 11], ['Wren', 22], ['Ostrander', 33], ['Mirelle', 44], ['Corvane', 55], ['Hadrian77', 66], ['Sablewick', 77], ['Thornby', 88], ['Juniper_K', 99]];

/** @param now the moment the desk is looked at; everything is placed back from it */
export function fixtureInput(now = Date.UTC(2026, 9, 10, 14, 30), over = {}) {
    const R = rng(11);
    const R2 = rng(29);
    const ids = SETS.flatMap((s) => s.pieces.map((p) => p.id));
    const pct = 101;

    // Every place that sells each piece: a few bazaars and the Item Market.
    const offers = {};
    ids.forEach((id, k) => {
        const mv = MV[id];
        const pay = Math.round(mv * pct / 100);
        const f = id === 274 ? 34900 / 34600 : id === 263 ? 14390 / 14400 : 1.012 + R() * 0.03;
        const baz = Math.round(mv * f);
        const n = 4 + Math.floor(R2() * 3);
        const first = id === 274 ? 0 : id === 263 ? 1 : Math.floor(R2() * SELLERS.length);
        const step = [1, 2, 4][k % 3];
        const list = [];
        for (let j = 0; j < n; j++) {
            const [who, whoId] = SELLERS[(first + j * step) % SELLERS.length];
            const price = j ? Math.max(Math.round(baz * (1 + 0.0045 * j + R2() * 0.004) / 10) * 10, Math.ceil(pay * 1.001 / 10) * 10 + 10 * j) : baz;
            list.push({ price, qty: j ? 2 + Math.floor(R2() * 22) : id === 274 ? 6 : id === 263 ? 12 : 1 + Math.floor(R() * 38), src: 'bazaar', who, whoId, at: j < 2 ? now - 40000 : now - (4 + j * 5) * MIN, from: j < 2 ? 'torn' : 'w3b' });
        }
        list.push({ price: Math.round(mv * (id === 274 || id === 263 ? 1.03 : 1.014 + R() * 0.04)), qty: 3 + Math.floor(R2() * 30), src: 'market', at: now - 90000, from: 'torn' });
        offers[id] = list;
    });

    // The points market, and its price by day.
    const listings = [[30650, 120], [30700, 300], [30900, 4000], [30999, 6500], [31000, 18400], [31100, 5200], [31250, 9000], [31400, 2600], [31500, 12000], [31750, 7400]]
        .map(([cost, qty], k) => ({ id: 'L' + k, cost, qty }));
    let days = [];
    let wallDays = [];
    let w = 31420;
    for (let d = 39; d >= 0; d--) {
        const k = 39 - d;
        w = k < 36 ? Math.max(31180, Math.min(31740, w + (R() - 0.46) * 190)) : [31260, 31110, 30990, 30900][k - 36];
        const wall = Math.round(w / 10) * 10;
        const low = k === 39 ? 30650 : Math.round((w - 60 - R() * 240) / 10) * 10;
        days = recordPrice(days, now - d * DAY, low);
        wallDays = recordPrice(wallDays, now - d * DAY, wall);
    }

    // Lots seen leaving: many small, few large.
    let lots = lotsRead(LOTS_EMPTY, [], now - 3 * DAY);
    const gone = [];
    const sizes = [[60, 312, 6], [180, 141, 19], [400, 88, 48], [800, 61, 130], [2400, 22, 330]];
    for (const [qty, count, wait] of sizes) for (let k = 0; k < count; k++) gone.push({ cost: 30900, qty: Math.round(qty * (0.7 + R() * 0.5)), t: now - Math.floor(R() * 6 * DAY), wait: Math.round(wait * (0.6 + R() * 0.8)) * MIN, front: true });
    lots = { ...lots, gone, t: now - MIN };

    // The books: what the pieces cost, points made and sold.
    let pool = {};
    for (const id of ids) pool = poolAdd(pool, id, HELD[id], HELD[id] * Math.round(MV[id] * 1.003));
    const book = [];
    const made = (d, h, points, each, set) => book.push({ id: 'm' + d + set, t: now - d * DAY - h * 3600000, kind: 'made', points, each, set, src: 'log' });
    const sold = (d, h, points, each) => book.push({ id: 's' + d, t: now - d * DAY - h * 3600000, kind: 'sold', points, each, set: null, src: 'log' });
    made(13, 5, 300, 30250, 'plushie'); made(12, 3, 160, 30190, 'flower'); sold(12, 1, 150, 31410);
    made(11, 6, 150, 30170, 'plushie'); sold(10, 4, 100, 31380);
    made(9, 2, 200, 30080, 'plushie'); sold(8, 6, 150, 31320); made(8, 2, 90, 30010, 'flower');
    sold(6, 3, 100, 31290); made(5, 8, 210, 29905, 'plushie'); sold(4, 2, 200, 31250);
    made(4, 1, 170, 29840, 'plushie'); sold(3, 3, 200, 31110);
    book.push({ id: 'u2', t: now - 1.3 * DAY, kind: 'used', points: 100, each: 0, set: null, src: 'log' });
    made(2, 4, 100, 29990, 'plushie'); sold(2, 3, 250, 30989);
    made(1, 16, 90, 29610, 'flower'); made(0, 1, 120, 29955, 'plushie');
    const lastSale = book.find((e) => e.id === 's2');
    const mugs = [
        { id: 'g1', t: lastSale.t + 11 * MIN, by: 'Brakk', taken: 612000 },
        { id: 'g2', t: now - 7.5 * DAY, by: '', taken: 38200 },
        { id: 'g3', t: now - 11 * DAY, by: 'Velloran', taken: 15900 },
    ];
    const outs = book.filter((e) => e.kind === 'sold' && e.id !== 's2').map((e) => ({ t: e.t + 3 * MIN, amount: e.points * e.each }));

    // Trades open with you, and finished ones.
    const ME = 1;
    const trade = (id, who, whoId, min, theirs, myMoney = 0) => ({ id: String(id), who, whoId: String(whoId), modified: now - min * MIN, expires: now + 5 * 3600000, completed: 0, note: '', theirs: theirs.map(([i, qty]) => ({ id: i, qty })), theirMoney: 0, mine: [], myMoney, other: 0 });
    const pellam = [[384, 5], [273, 2], [276, 3], [272, 1]];
    const trades = [
        trade(9001, 'Garrett89', 501, 4, [[274, 20], [266, 22], [258, 18], [268, 12], [263, 7], [617, 4], [215, 30], [206, 1]]),
        trade(9002, 'Pellam', 502, 11, pellam, pellam.reduce((s, [i, q]) => s + q * Math.round(MV[i] * pct / 100), 0)),
        trade(9003, 'Isolde_M', 503, 0.4, [[281, 12], [269, 10], [260, 6]]),
    ];
    const finished = [['Marlowe', 601, 0.7, 412, 12480300, 12356700], ['Quillon', 602, 0.85, 77, 2310900, 2288000], ['Garrett89', 501, 3.2, 520, 15733600, 15577800], ['Tessaly', 603, 3.6, 180, 5402200, 5348700], ['Marlowe', 601, 4.8, 90, 2718400, 2691500], ['Odrin', 604, 6, 260, 7911000, 7832700]]
        .map(([who, whoId, d, units, paid, mv], k) => ({ id: String(8000 + k), who, whoId: String(whoId), t: now - d * DAY, units, paid, mv }));

    // The Ledger's rows: buys of pieces, by where.
    const rows = [];
    let rid = 0;
    const buyRow = (d, itemId, qty, each, venue, who = null, whoName = null, tid = null) => rows.push({ id: tid ? 'trade:' + tid + ':in:' + (rid++) : 'log' + (rid++) + ':0', t: now - d * DAY, itemId: String(itemId), qty, each, fee: 0, side: 'buy', venue, who, whoName });
    buyRow(0.03, 274, 6, 34900, 'bazaar', '11'); buyRow(0.035, 266, 4, 43950, 'market'); buyRow(0.09, 263, 12, 14390, 'bazaar', '22');
    buyRow(0.7, 258, 60, 34138, 'trade', '601', 'Marlowe', 8000); buyRow(0.7, 268, 44, 35653, 'trade', '601', 'Marlowe', 8000); buyRow(0.7, 617, 18, 67893, 'trade', '601', 'Marlowe', 8000);
    buyRow(0.85, 276, 40, 25856, 'trade', '602', 'Quillon', 8001); buyRow(0.87, 384, 9, 38150, 'bazaar', '33'); buyRow(0.97, 282, 5, 37100, 'market'); buyRow(1.15, 272, 16, 14200, 'bazaar', '44');
    for (let d = 1; d < 14; d++) {
        buyRow(d + 0.2, ids[(d * 5) % ids.length], 60 + Math.floor(R() * 260), MV[ids[(d * 5) % ids.length]], 'bazaar', String(SELLERS[d % 9][1]));
        buyRow(d + 0.4, ids[(d * 7) % ids.length], 10 + Math.floor(R() * 80), MV[ids[(d * 7) % ids.length]], 'market');
        if (d % 2) buyRow(d + 0.6, ids[(d * 3) % ids.length], 90 + Math.floor(R() * 400), Math.round(MV[ids[(d * 3) % ids.length]] * 1.01), 'trade', ['501', '603', '604'][d % 3], ['Garrett89', 'Tessaly', 'Odrin'][d % 3], 7000 + d);
    }

    // What the recorder kept: each piece's cheapest by day, what a set pays by day, the share of your money.
    const low = {};
    for (const id of ids) low[id] = Array.from({ length: 7 }, (_, k) => ({ day: new Date(now - (6 - k) * DAY).toISOString().slice(0, 10), low: Math.round(MV[id] * (0.98 + R() * 0.05)) }));
    let cp = 300400;
    let cf = 297300;
    const wallAvg = wallDays.map((d) => Math.round(d.sum / d.n));
    const pays = wallAvg.map((wd, k) => {
        cp = Math.max(298800, Math.min(302600, cp + (R() - 0.5) * 900));
        cf = Math.max(294800, Math.min(300200, cf + (R() - 0.5) * 1100));
        return { day: wallDays[k].day, plushie: Math.round(wd * 10 - cp), flower: Math.round(wd * 10 - cf) };
    });
    const share = [9, 11, 12, 14, 13, 15, 17, 16, 18, 20, 19, 21, 23, 22].map((s, k) => ({ day: new Date(now - (13 - k) * DAY).toISOString().slice(0, 10), share: s }));

    const names = Object.fromEntries(SELLERS.map(([n, id]) => [String(id), n]));
    const input = {
        now,
        settings: archiveSettings({ open: true, pct, least: 2, targetMode: 'number', target: 40, shareMax: 30, readMin: 1 }),
        held: (id) => HELD[id] || 0, stockAt: now - 20 * MIN,
        mv: (id) => MV[id] || 0,
        offers: (id) => offers[id] || [], pricesAt: now - 12000,
        topBid: (id) => { const p = 97 + Math.round(R2() * 45) / 10; return { pct: p, name: SELLERS[id % 9][0], price: Math.round((MV[id] || 0) * p / 100), at: now - 20 * MIN }; },
        listings, pointsAt: now - 12000, days, wallDays,
        lots, mineLots: [{ points: 150, wait: 17 * MIN }, { points: 100, wait: 6 * MIN }, { points: 150, wait: 14 * MIN }, { points: 100, wait: 8 * MIN }, { points: 200, wait: 22 * MIN }, { points: 200, wait: 19 * MIN }, { points: 250, wait: 34 * MIN }],
        pool, book, mugs, outs,
        money: { points: 1243, onHand: 350000, vault: 896900000 },
        trades, finished, rows,
        cart: [], run: runStart([]),
        hotSince: {},
        thread: { id: 16400000, forum: 10, title: '[OPEN] Buying Plushies & Flowers · 101% of market value', at: now - 3 * MIN },
        w3b: { list: null, listAt: 0, receipts: new Map([['8000', { id: 'r8000', total: 12480300, url: 'https://weav3r.dev/receipt/r8000' }]]), lastReceiptAt: now - 0.7 * DAY, error: '' },
        hist: { low, pays, share },
        names: (id) => names[String(id)] || '',
        itemName: (id) => (Number(id) === 206 ? 'Xanax' : ''),
        me: ME,
    };
    return { ...input, ...over };
}
