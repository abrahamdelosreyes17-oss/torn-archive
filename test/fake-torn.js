// A made-up Torn and a made-up TornW3B, for running the engine against something that answers.
// Every player, key, price and trade in this file is invented. Nothing here ships in the script, and nothing
// here ever asks the real services: `fetch` answers from the `world` object below and from nothing else.
//
// Pure: no node imports and no imports from src/, so a browser test page can load it as it is. The 24 set
// pieces are written out again here on purpose: this file is Torn's side of the table, not the Archive's
// (test/engine.test.js checks the two lists against each other).
//
// What is a guess: every answer shape below follows what the parsers in src/ read. Where the parser's own
// expectation was never seen from the real service, the place is marked UNSURE.

const FT_MIN = 60000;
const FT_HOUR = 3600000;
const FT_DAY = 86400000;

/** Made-up keys. None of them is, or could be, a key of anyone's. */
export const FAKE_KEYS = Object.freeze({
    limited: 'FAKEKEYLIMITED01',
    full: 'FAKEKEYFULL00001',
    /** The key "registered on TornW3B". In this fake it is no Torn key at all: api.torn.com refuses it. */
    w3b: 'FAKEKEYW3B000001',
    public: 'FAKEKEYPUBLIC001',
});

const FT_LEVEL = { public: 1, limited: 3, full: 4 };
const FT_LEVEL_NAME = { 1: 'Public Only', 3: 'Limited Access', 4: 'Full Access' };

/** [id, name, market value] */
const FT_PLUSHIES = [
    [186, 'Sheep Plushie', 900], [187, 'Teddy Bear Plushie', 950], [215, 'Kitten Plushie', 1000], [258, 'Jaguar Plushie', 38000],
    [261, 'Wolverine Plushie', 24000], [266, 'Nessie Plushie', 36000], [268, 'Red Fox Plushie', 22000], [269, 'Monkey Plushie', 21000],
    [273, 'Chamois Plushie', 25000], [274, 'Panda Plushie', 34000], [281, 'Lion Plushie', 33000], [384, 'Camel Plushie', 29000],
    [618, 'Stingray Plushie', 20150],
];
const FT_FLOWERS = [
    [260, 'Dahlia', 2000], [263, 'Crocus', 14000], [264, 'Orchid', 30000], [267, 'Heather', 26000], [271, 'Ceibo Flower', 27000],
    [272, 'Edelweiss', 25000], [276, 'Peony', 32000], [277, 'Cherry Blossom', 36000], [282, 'African Violet', 33000],
    [385, 'Tribulus Omanense', 31000], [617, 'Banana Orchid', 32000],
];
/** Two items that are no set piece: they must never reach the books, the list on TornW3B, or a trade's total. */
const FT_OTHERS = [[206, 'Xanax', 830000, 'Drug'], [180, 'Bottle of Beer', 600, 'Alcohol']];

const FT_HELD = {
    186: 6, 187: 5, 215: 4, 258: 2, 261: 3, 266: 2, 268: 4, 269: 3, 273: 2, 274: 5, 281: 2, 384: 3, 618: 4,
    260: 5, 263: 4, 264: 1, 267: 3, 271: 4, 272: 2, 276: 3, 277: 4, 282: 1, 385: 4, 617: 2,
    206: 3,
};

/** Torn's log types by id. The first five are the ids the Ledger knows; the rest are MADE UP and must be found by title. */
const FT_LOG_TYPES = {
    1112: 'Item market buy', 1113: 'Item market sell', 1225: 'Bazaar buy', 1226: 'Bazaar sell', 8156: 'Attack mug receive',
    5010: 'Points market buy', 5011: 'Points market sell', 5012: 'Points market add',
    7391: 'Museum exchange', 5883: 'Vault deposit', 5884: 'Vault withdraw', 4917: 'Points refill energy',
    4441: 'Trade money outgoing', 4442: 'Trade completed', 6020: 'Company vault deposit', 2290: 'Travel initiate',
};
const FT_LOG_CATEGORY = { 1112: 'Item market', 1113: 'Item market', 1225: 'Bazaars', 1226: 'Bazaars', 8156: 'Attacking', 5010: 'Points market', 5011: 'Points market', 5012: 'Points market', 7391: 'Museum', 5883: 'Vault', 5884: 'Vault', 4917: 'Points', 4441: 'Trades', 4442: 'Trades', 6020: 'Company', 2290: 'Travel' };

const ftCopy = (v) => JSON.parse(JSON.stringify(v));
const ftSec = (ms) => Math.floor(ms / 1000);
const ftWhole = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };

/**
 * @param now the clock the world lives by (tests hand in a fake one)
 * @returns { world, fetch, calls, unknown, refused, leaks, ...helpers }
 */
export function makeFakeTorn({ now = () => Date.now() } = {}) {
    const born = now();
    let logSeq = 0;
    let tradeSeq = 7000;
    let receiptSeq = 0;

    // ---- the world ------------------------------------------------------------------------------------------------

    const items = {};
    for (const [id, name, mv] of FT_PLUSHIES) items[id] = { id, name, type: 'Plushie', mv };
    for (const [id, name, mv] of FT_FLOWERS) items[id] = { id, name, type: 'Flower', mv };
    for (const [id, name, mv, type] of FT_OTHERS) items[id] = { id, name, type, mv };
    const pieceIds = [...FT_PLUSHIES, ...FT_FLOWERS].map((p) => p[0]);
    const pct = (id, p) => Math.round(items[id].mv * p / 100);

    const you = { id: 2000001, name: 'You' };
    const players = {
        3000001: 'Seller A', 3000002: 'Seller B', 3000003: 'Seller C', 3000004: 'Seller D', 3000005: 'Seller E', 3000006: 'Seller F', 3000007: 'Seller G',
        4000002: 'Trader B', 4000003: 'Trader C', 4000004: 'Trader D', 4000005: 'Trader E', 4000006: 'Trader F', 5000009: 'Mugger M',
    };
    const row = (id, price, qty) => ({ id, price, qty });
    const seller = (id, bazaar, more = {}) => ({ id, name: players[id], bazaar, changedAt: born - 2 * FT_HOUR, checkEveryMs: 5 * FT_MIN, w3b: null, frozen: false, ...more });
    const sellers = [
        // Under what you pay your sellers (97% of market value): "hot".
        seller(3000001, [row(258, pct(258, 97), 3), row(266, pct(266, 97), 2), row(206, 829000, 5)]),
        seller(3000002, [row(264, pct(264, 99), 4), row(276, pct(276, 99), 2), row(282, pct(282, 99), 2)]),
        // Over your rate, still under what a piece is safely worth.
        seller(3000003, [row(281, pct(281, 103), 5), row(384, pct(384, 103), 2), row(617, pct(617, 103), 3)]),
        // Too dear to buy.
        seller(3000004, [row(274, pct(274, 108), 10), row(273, pct(273, 108), 4)]),
        seller(3000005, [row(186, 880, 20), row(215, 990, 15), row(260, 1950, 12), row(269, pct(269, 99), 2)]),
        // A bazaar TornW3B has not looked at for 50 minutes: its cheap listings are most likely gone.
        seller(3000006, [row(267, pct(267, 90), 3), row(272, pct(272, 90), 5)], { frozen: true }),
        // A $1 listing (Torn's locked "dollar sale") beside two honest ones.
        seller(3000007, [row(269, 1, 1), row(273, pct(273, 99), 2), row(261, pct(261, 99), 1)]),
        // Your own bazaar: TornW3B lists it like any other, the Archive must not send you to yourself.
        seller(you.id, [row(261, 20000, 1)], { name: you.name }),
    ];
    sellers[5].w3b = { at: born - 50 * FT_MIN, rows: ftCopy(sellers[5].bazaar) };

    const itemMarket = {};
    for (const id of pieceIds) itemMarket[id] = [{ price: pct(id, 103), amount: 2 }, { price: pct(id, 106), amount: 10 }, { price: pct(id, 110), amount: 40 }];
    itemMarket[206] = [{ price: 832000, amount: 30 }];

    // A dozen lots. 250 points sit cheaper than $30,500; the 1,500 at $30,500 are the first wall.
    const pointsMarket = [
        [30400, 50], [30450, 120], [30480, 80], [30500, 600], [30500, 400], [30500, 500],
        [30550, 300], [30600, 1000], [30700, 200], [30800, 150], [30900, 100], [31000, 500],
    ].map(([cost, quantity], k) => ({ id: 880001 + k, cost, quantity }));

    const world = {
        you,
        keys: { ...FAKE_KEYS },
        players,
        items,
        sets: [
            { key: 'plushie', name: 'Plushie Set', museum: 'Plushie Set', points: 10, pieces: FT_PLUSHIES.map((p) => p[0]) },
            { key: 'flower', name: 'Flower Set', museum: 'Exotic Flower Set', points: 10, pieces: FT_FLOWERS.map((p) => p[0]) },
        ],
        pieceIds,
        held: { ...FT_HELD },
        money: { points: 250, wallet: 5000000, vault: 60000000 },
        pointsMarket,
        itemMarket,
        sellers,
        trades: [],
        log: [],
        logTypes: { ...FT_LOG_TYPES },
        threads: [
            { id: 16400001, forum_id: 10, title: 'Looking for a racing team', first_post_time: ftSec(born - 30 * FT_DAY), last_post_time: ftSec(born - 2 * FT_HOUR) },
            { id: 16400002, forum_id: 10, title: '[OPEN] Buying plushies & flowers at 101%', first_post_time: ftSec(born - 9 * FT_DAY), last_post_time: ftSec(born - 5 * FT_HOUR) },
            { id: 16400003, forum_id: 10, title: '[CLOSED] Buying flowers at 99.5%', first_post_time: ftSec(born - 60 * FT_DAY), last_post_time: ftSec(born - 40 * FT_DAY) },
        ],
        w3b: {
            /** Your list as TornW3B stores it (the PUT's own item shape). Xanax is yours to price, not the Archive's. */
            priceList: [
                { itemID: 206, pricingType: 'fixed', pricingValue: 830000 },
                { itemID: 258, pricingType: 'fixed', pricingValue: 37000 },
                { itemID: 264, pricingType: 'market_percentage', pricingValue: 99 },
                { itemID: 274, pricingType: 'fixed', pricingValue: pct(274, 101) },
            ],
            receipts: [],
            /** Other buyers of each piece, as /marketplace/{id}/traders lists them (you are on the list too). */
            buyers: Object.fromEntries(pieceIds.map((id) => [id, [
                { player_id: you.id, player_name: you.name, price: pct(id, 101) },
                { player_id: 4000002, player_name: 'Trader B', price: pct(id, 99.5) },
                { player_id: 4000003, player_name: 'Trader C', price: pct(id, 98) },
            ]])),
        },
        options: {
            /** Torn has been seen to refuse /v2/user/inventory without `cat` ("Incorrect category"). */
            inventoryNeedsCat: true,
            /**
             * Torn counts your inventory once an hour for each category, and its answer carries the time of that count.
             * Off: every answer is counted that moment (as this made-up Torn always did). On: as Torn does.
             */
            inventoryHourly: false,
            /**
             * What GET /api/pricelist/{you} answers.
             *   'public' = [{ itemId, name, buyPrice, bulkThreshold, bulkBuyPrice }], a row for every item, 0 where
             *              it has no price, and TornW3B's own whole sets under ids below 1. SEEN: it is what the route
             *              answers for every trader's list in Torn Bids (core/traders.js parseW3bPriceList), and
             *              the owner's zip of 2026-10-12 05:11 showed the other shape is never what comes back
             *              (24 prices written and taken, the list read back empty).
             *   'config' = { items: [{ itemID, pricingType, pricingValue }] }: the documentation's, as written.
             */
            ownListShape: 'public',
            /**
             * Which form of the receipt request TornW3B takes (core/tw3b-list.js RECEIPT_FORMS); the others get
             * 400 "Invalid request body", as the owner's did on 2026-10-12. null: any. UNSURE which it is.
             */
            receiptForm: null,
            /** The receipt's answer names its link. Off: only the receipt, as a TornW3B that says less would. */
            receiptLink: true,
            /** Whether a finished trade also writes a "Trade money outgoing" row to your log. UNSURE (state.js outLogTypes looks for one). */
            logTradeMoney: false,
            /** What `from` on /v2/user/trades goes by: when the trade 'completed', or when it was 'created'. UNSURE. */
            tradesFromIs: 'completed',
            /**
             * Whether a trade's `modified_at` moves when items or money go into it. SEEN on the owner's PC,
             * 2026-10-11: it did not - opened 16:48:07, two piles of plushies put in minutes later, still 16:48:07.
             */
            tradeModifiedMoves: false,
            /**
             * The most log kinds one request to /v2/user/log may name and still be answered with rows. SEEN on the
             * owner's PC, 2026-10-11: 18 kinds brought no row in 14 days. UNSURE where the line is; Torn Trading
             * names 8 and gets its rows.
             */
            logMostKinds: 10,
            /** For one read each, TornW3B says "there are listings" and sends none (its known mid-scan glitch): item ids. */
            w3bGlitch: [],
            /** What the services themselves refuse, by the fake clock. */
            limits: { tornPerMinute: 100, w3bPerMinute: 100, w3bListingPerMinute: 10, w3bListingPerDay: 1000 },
        },
    };

    const calls = [];
    // Torn's hourly count of your inventory, a category: { at, held } (options.inventoryHourly).
    const invCounts = new Map();
    const unknown = [];
    const refused = [];
    const leaks = [];
    const failing = [];
    const listingDay = [];

    // ---- the log --------------------------------------------------------------------------------------------------

    function addLog(type, data, at = now()) {
        const entry = { id: 'fakelog' + String(++logSeq).padStart(6, '0'), timestamp: ftSec(at), type: Number(type), data: ftCopy(data || {}) };
        world.log.push(entry);
        return entry;
    }

    const typeIdByTitle = (title) => {
        const hit = Object.entries(world.logTypes).find(([, t]) => t.toLowerCase() === String(title).toLowerCase());
        return hit ? Number(hit[0]) : null;
    };
    const T_MUSEUM = 7391;
    const T_VAULT = 5883;
    const T_TRADE_MONEY = 4441;

    // ---- trades ---------------------------------------------------------------------------------------------------

    function makeTrade(t) {
        const id = t.id || ++tradeSeq;
        const whoId = Number(t.whoId);
        const trade = {
            id, who: { id: whoId, name: t.who || players[whoId] || 'Trader ' + whoId }, status: 'open', by: t.by === 'you' ? 'you' : 'them',
            createdAt: t.at || now(), modifiedAt: t.at || now(), completedAt: 0, expiresAt: (t.at || now()) + 6 * FT_HOUR, description: t.description || '',
            theirs: ftCopy(t.theirs || []), theirMoney: ftWhole(t.theirMoney), mine: ftCopy(t.mine || []), myMoney: ftWhole(t.myMoney),
        };
        if (!players[whoId]) players[whoId] = trade.who.name;
        world.trades.push(trade);
        return trade;
    }
    const tradeById = (id) => world.trades.find((t) => String(t.id) === String(id)) || null;

    /** A trade someone opens with you. @returns its id */
    function openTrade({ who = '', whoId = 4000006, theirs = [], theirMoney = 0, mine = [], myMoney = 0, description = '', by = 'them' } = {}) {
        return makeTrade({ who, whoId, theirs, theirMoney, mine, myMoney, description, by }).id;
    }

    /** Items or money put into an open trade. Money replaces what was there; items are added. */
    function addToTrade(id, { theirs = [], mine = [], myMoney = null, theirMoney = null } = {}) {
        const t = tradeById(id);
        if (!t || t.status !== 'open') throw new Error('fake-torn: no open trade ' + id);
        const put = (list, more) => { for (const m of more) { const r = list.find((x) => x.id === m.id); if (r) r.qty += m.qty; else list.push({ id: m.id, qty: m.qty }); } };
        put(t.theirs, theirs);
        put(t.mine, mine);
        if (myMoney != null) t.myMoney = ftWhole(myMoney);
        if (theirMoney != null) t.theirMoney = ftWhole(theirMoney);
        if (world.options.tradeModifiedMoves) t.modifiedAt = now();
        return t;
    }

    /** Both accept: items and money change hands. `pay` sets your money first (what you typed into the trade). */
    function finishTrade(id, { pay = null, at = now() } = {}) {
        const t = tradeById(id);
        if (!t || t.status !== 'open') throw new Error('fake-torn: no open trade ' + id);
        if (pay != null) t.myMoney = ftWhole(pay);
        t.status = 'finished';
        t.completedAt = at;
        t.modifiedAt = at;
        for (const x of t.theirs) world.held[x.id] = ftWhole(world.held[x.id]) + x.qty;
        for (const x of t.mine) world.held[x.id] = Math.max(0, ftWhole(world.held[x.id]) - x.qty);
        world.money.wallet += t.theirMoney - t.myMoney;
        if (world.options.logTradeMoney && t.myMoney > 0) addLog(T_TRADE_MONEY, { trade_id: t.id, user: t.who.id, money: t.myMoney }, at);
        return t;
    }

    function cancelTrade(id) {
        const t = tradeById(id);
        if (!t || t.status !== 'open') throw new Error('fake-torn: no open trade ' + id);
        t.status = 'cancelled';
        t.modifiedAt = now();
        return t;
    }

    // ---- what you do in the world -----------------------------------------------------------------------------------

    const sellerById = (id) => world.sellers.find((s) => String(s.id) === String(id)) || null;

    /** A buy on a bazaar: a 1225 row in your log, the seller's stock down, what you hold up. @returns the log row */
    function buy(sellerId, itemId, qty, { at = now() } = {}) {
        const s = sellerById(sellerId);
        const r = s && s.bazaar.find((x) => Number(x.id) === Number(itemId));
        const n = ftWhole(qty);
        if (!r || !n || r.qty < n) throw new Error('fake-torn: ' + sellerId + ' does not have ' + n + ' of item ' + itemId);
        r.qty -= n;
        if (!r.qty) s.bazaar = s.bazaar.filter((x) => x !== r);
        s.changedAt = at;
        world.held[itemId] = ftWhole(world.held[itemId]) + n;
        world.money.wallet -= n * r.price;
        return addLog(1225, { seller: Number(sellerId), items: [{ id: Number(itemId), uid: null, qty: n }], cost_each: r.price, cost_total: n * r.price }, at);
    }

    /** A buy on the Item Market, cheapest listings first: one 1112 row per listing bought from. @returns the rows */
    function buyMarket(itemId, qty, { at = now() } = {}) {
        let left = ftWhole(qty);
        const out = [];
        const list = (world.itemMarket[itemId] || []).sort((a, b) => a.price - b.price);
        for (const l of list) {
            if (!left) break;
            const n = Math.min(left, l.amount);
            l.amount -= n;
            left -= n;
            world.held[itemId] = ftWhole(world.held[itemId]) + n;
            world.money.wallet -= n * l.price;
            out.push(addLog(1112, { seller: 3000009, anonymous: false, items: [{ id: Number(itemId), uid: null, qty: n }], cost_each: l.price, cost_total: n * l.price }, at));
        }
        world.itemMarket[itemId] = list.filter((l) => l.amount > 0);
        if (left) throw new Error('fake-torn: the Item Market does not have that many of item ' + itemId);
        return out;
    }

    /** Sets swapped at the museum: one of each piece down per set, the points up, one row in your log. */
    function swap(setKey, sets, { at = now() } = {}) {
        const set = world.sets.find((s) => s.key === setKey);
        const n = ftWhole(sets);
        if (!set || !n) throw new Error('fake-torn: no such set ' + setKey);
        for (const id of set.pieces) if (ftWhole(world.held[id]) < n) throw new Error('fake-torn: you hold fewer than ' + n + ' of ' + items[id].name);
        for (const id of set.pieces) world.held[id] -= n;
        world.money.points += n * set.points;
        // UNSURE: the fields of the real row. core/points.js reads `points` (or points_gained...) and finds the set
        // by the word "plush" or "flower" anywhere in the row's title and data.
        return addLog(T_MUSEUM, { set: set.museum, quantity: n, points: n * set.points }, at);
    }

    /** Points of yours sold on the points market. UNSURE: the fields of the real 5011 row. */
    function sellPoints(n, price, { at = now() } = {}) {
        const points = ftWhole(n);
        if (!points || points > world.money.points) throw new Error('fake-torn: you do not hold ' + n + ' points');
        world.money.points -= points;
        world.money.wallet += points * price;
        return addLog(5011, { quantity: points, cost_each: price, cost_total: points * price }, at);
    }

    /** You are mugged. UNSURE: the fields of the real 8156 row (core/ledger.js mugFromLog tries several names). */
    function mug(amount, byId = 5000009, { at = now() } = {}) {
        const taken = Math.min(ftWhole(amount), world.money.wallet);
        world.money.wallet -= taken;
        return addLog(8156, { attacker: byId, money_mugged: taken }, at);
    }

    /** Cash into your vault. UNSURE: the fields of the real row. */
    function vaultDeposit(amount, { at = now() } = {}) {
        const n = Math.min(ftWhole(amount), world.money.wallet);
        world.money.wallet -= n;
        world.money.vault += n;
        return addLog(T_VAULT, { deposited: n }, at);
    }

    /** A seller changes a price (or lists something new, or with qty 0 takes it down). */
    function setPrice(sellerId, itemId, price, qty = null) {
        const s = sellerById(sellerId);
        if (!s) throw new Error('fake-torn: no seller ' + sellerId);
        const r = s.bazaar.find((x) => Number(x.id) === Number(itemId));
        if (qty === 0) s.bazaar = s.bazaar.filter((x) => x !== r);
        else if (r) { r.price = price; if (qty != null) r.qty = qty; } else s.bazaar.push({ id: Number(itemId), price, qty: qty == null ? 1 : qty });
        s.changedAt = now();
    }

    /** The next `times` requests whose "host + path" matches are answered with this instead: { status, body, headers }. */
    function failNext(pattern, answerWith, times = 1) {
        failing.push({ pattern, answer: answerWith, left: times });
    }

    // ---- history: what was there before the Archive first looked ------------------------------------------------------

    // Two finished trades, two open ones.
    const t1 = makeTrade({ id: 6001, whoId: 4000004, at: born - 3 * FT_DAY - FT_HOUR, by: 'them', theirs: [{ id: 384, qty: 2 }, { id: 618, qty: 3 }], myMoney: 2 * pct(384, 101) + 3 * pct(618, 101) });
    Object.assign(t1, { status: 'finished', completedAt: born - 3 * FT_DAY, modifiedAt: born - 3 * FT_DAY });
    const t2 = makeTrade({ id: 6002, whoId: 4000005, at: born - FT_DAY - FT_HOUR, by: 'you', theirs: [{ id: 276, qty: 2 }, { id: 263, qty: 4 }], myMoney: 2 * pct(276, 101) + 4 * pct(263, 101) });
    Object.assign(t2, { status: 'finished', completedAt: born - FT_DAY, modifiedAt: born - FT_DAY });
    // Set pieces on their side, nothing from you yet: your turn.
    makeTrade({ id: 7001, whoId: 4000002, at: born - 20 * FT_MIN, by: 'them', theirs: [{ id: 258, qty: 2 }, { id: 264, qty: 3 }, { id: 267, qty: 2 }], description: 'plushies for you' });
    // A set piece and something that is none, and your money already in.
    makeTrade({ id: 7002, whoId: 4000003, at: born - 8 * FT_MIN, by: 'you', theirs: [{ id: 281, qty: 1 }, { id: 206, qty: 2 }], myMoney: pct(281, 101) });
    tradeSeq = 7002;

    addLog(1225, { seller: 3000001, items: [{ id: 258, uid: null, qty: 2 }], cost_each: 37000, cost_total: 74000 }, born - 5 * FT_DAY);
    addLog(1112, { seller: 3000009, anonymous: false, items: [{ id: 266, uid: null, qty: 2 }], cost_each: 35500, cost_total: 71000 }, born - 4 * FT_DAY);
    addLog(T_MUSEUM, { set: 'Exotic Flower Set', quantity: 2, points: 20 }, born - 3 * FT_DAY - 2 * FT_HOUR);
    addLog(5011, { quantity: 15, cost_each: 30450, cost_total: 456750 }, born - 2 * FT_DAY);
    addLog(8156, { attacker: 5000009, money_mugged: 120000 }, born - 2 * FT_DAY + 10 * FT_MIN);
    addLog(T_VAULT, { deposited: 300000 }, born - 2 * FT_DAY + 20 * FT_MIN);
    addLog(1225, { seller: 3000005, items: [{ id: 186, uid: null, qty: 3 }], cost_each: 890, cost_total: 2670 }, born - FT_DAY - 3 * FT_HOUR);
    // No set piece: money that left your hand, and nothing for the books.
    addLog(1225, { seller: 3000001, items: [{ id: 206, uid: null, qty: 1 }], cost_each: 829000, cost_total: 829000 }, born - FT_DAY - 2 * FT_HOUR);
    addLog(1112, { seller: 3000009, anonymous: true, items: [{ id: 260, uid: null, qty: 2 }], cost_each: 1980, cost_total: 3960 }, born - 6 * FT_HOUR);

    // One receipt on TornW3B already, for the older finished trade. UNSURE: every field of a receipt.
    world.w3b.receipts.push({
        id: 'fr' + String(++receiptSeq).padStart(4, '0'), trade_id: 6001, buyer_name: 'Trader D', total_value: t1.myMoney, item_count: 2,
        created_at: new Date(born - 3 * FT_DAY + 5 * FT_MIN).toISOString(), updated_at: new Date(born - 3 * FT_DAY + 5 * FT_MIN).toISOString(),
        items: t1.theirs.map((x) => ({ item_id: x.id, item_name: items[x.id].name, quantity: x.qty, price_used: pct(x.id, 101), total_value: x.qty * pct(x.id, 101), market_price_at_time: items[x.id].mv })),
    });

    // ---- answers ----------------------------------------------------------------------------------------------------

    function answer(status, data, head = {}) {
        const text = JSON.stringify(data === undefined ? null : data);
        const h = {};
        for (const [k, v] of Object.entries({ 'content-type': 'application/json', ...head })) h[k.toLowerCase()] = String(v);
        const get = (name) => { const v = h[String(name || '').toLowerCase()]; return v == null ? null : v; };
        // A fresh copy each time: whoever reads the answer cannot change the world through it.
        return { ok: status >= 200 && status < 300, status, json: async () => JSON.parse(text), text: async () => text, header: get, headers: { get } };
    }
    const tornError = (code, error) => answer(200, { error: { code, error } });

    const keyKind = (key) => { const hit = Object.entries(world.keys).find(([, v]) => v && v === key); return hit ? hit[0] : null; };
    const inMinute = (host, t, test = () => true) => calls.filter((c) => c.host === host && t - c.t < FT_MIN && c.status !== 0 && test(c)).length;

    // ---- api.torn.com -----------------------------------------------------------------------------------------------

    function tradeHead(t) {
        const me = { id: you.id, name: you.name };
        const them = { id: t.who.id, name: t.who.name };
        const done = t.status === 'finished';
        return {
            id: t.id,
            // UNSURE: which of these Torn sends, and what `timestamp` means on an open trade.
            timestamp: ftSec(done && world.options.tradesFromIs !== 'created' ? t.completedAt : t.createdAt),
            modified_at: ftSec(t.modifiedAt), expires_at: ftSec(t.expiresAt), ...(done ? { completed_at: ftSec(t.completedAt) } : {}),
            status: t.status === 'open' ? 'ongoing' : t.status, description: t.description,
            user: t.by === 'you' ? me : them, trader: t.by === 'you' ? them : me,
        };
    }

    function tradeFull(t) {
        const out = [];
        for (const x of t.theirs) out.push({ user_id: t.who.id, type: 'Item', details: { id: x.id, name: (items[x.id] || {}).name || 'Item ' + x.id, amount: x.qty, uid: null } });
        if (t.theirMoney) out.push({ user_id: t.who.id, type: 'Money', details: { amount: t.theirMoney } });
        for (const x of t.mine) out.push({ user_id: you.id, type: 'Item', details: { id: x.id, name: (items[x.id] || {}).name || 'Item ' + x.id, amount: x.qty, uid: null } });
        if (t.myMoney) out.push({ user_id: you.id, type: 'Money', details: { amount: t.myMoney } });
        return { ...tradeHead(t), items: out };
    }

    function torn(u, call) {
        const key = u.searchParams.get('key');
        const kind = keyKind(key);
        call.key = key ? kind || 'unknown' : null;
        const level = FT_LEVEL[kind] || 0;
        // A missing key, a made-up one, or the TornW3B key (no Torn key in this world): Torn's own words.
        if (!level) return tornError(2, 'Incorrect key');
        const t = now();
        if (inMinute('api.torn.com', t) >= world.options.limits.tornPerMinute) {
            refused.push({ t, host: call.host, path: call.path, why: 'torn-minute' });
            return tornError(5, 'Too many requests');
        }
        const path = u.pathname;
        const q = (name) => u.searchParams.get(name);
        const need = (min) => (level < min ? tornError(16, 'Access level of this key is not high enough') : null);
        let m;

        if (path === '/v2/key/info') {
            return answer(200, { info: { selections: {}, user: { id: you.id, faction_id: null, company_id: null }, access: { level, type: FT_LEVEL_NAME[level], faction: false, company: false } } });
        }

        if (path === '/v2/torn/items') {
            return answer(200, {
                items: Object.values(world.items).sort((a, b) => a.id - b.id).map((it) => ({
                    id: it.id, name: it.name, description: '', effect: null, requirement: null, image: '', type: it.type, sub_type: null,
                    is_masked: false, is_tradable: true, is_found_in_city: false,
                    value: { vendor: null, buy_price: null, sell_price: null, market_price: it.mv }, circulation: 100000, details: null,
                })),
                _metadata: { links: { next: null, prev: null } },
            });
        }

        if (path === '/torn/') {
            const sel = String(q('selections') || '');
            if (sel === 'logtypes') return answer(200, { logtypes: { ...world.logTypes } });
            if (sel === 'items') return answer(200, { items: Object.fromEntries(Object.values(world.items).map((it) => [it.id, { name: it.name, type: it.type, market_value: it.mv, buy_price: 0, sell_price: 0, circulation: 100000 }])) });
            return tornError(4, 'Wrong fields');
        }

        if (path === '/v2/user/log') {
            const no = need(4);
            if (no) return no;
            const types = q('log') ? new Set(String(q('log')).split(',').map(Number)) : null;
            const from = Number(q('from')) || 0;
            const to = Number(q('to')) || Infinity;
            const limit = Math.min(100, ftWhole(q('limit')) || 100);
            if (types && types.size > world.options.logMostKinds) return answer(200, { log: [], _metadata: { links: { next: null, prev: null } } });
            const rows = world.log
                .filter((e) => (!types || types.has(e.type)) && e.timestamp > from && e.timestamp <= to)
                .sort((a, b) => b.timestamp - a.timestamp || (a.id < b.id ? 1 : -1))
                .slice(0, limit)
                .map((e) => ({ id: e.id, timestamp: e.timestamp, details: { id: e.type, title: world.logTypes[e.type] || 'Unknown', category: FT_LOG_CATEGORY[e.type] || 'Other' }, data: ftCopy(e.data), params: {} }));
            return answer(200, { log: rows, _metadata: { links: { next: null, prev: null } } });
        }

        if (path === '/v2/user/trades') {
            const no = need(3);
            if (no) return no;
            const cat = String(q('cat') || '');
            const from = Number(q('from')) || 0;
            const limit = Math.min(100, ftWhole(q('limit')) || 20);
            const want = cat === 'ongoing' ? ['open'] : cat === 'finished' ? ['finished'] : ['open', 'finished'];
            const when = (t) => (t.status === 'finished' && world.options.tradesFromIs !== 'created' ? t.completedAt : t.createdAt);
            const rows = world.trades.filter((t) => want.includes(t.status) && ftSec(when(t)) > from).sort((a, b) => when(a) - when(b));
            if (String(q('sort') || 'DESC').toUpperCase() !== 'ASC') rows.reverse();
            return answer(200, { trades: rows.slice(0, limit).map(tradeHead), _metadata: { links: { next: null, prev: null } } });
        }

        if ((m = path.match(/^\/v2\/user\/(\d+)\/trade$/))) {
            const no = need(3);
            if (no) return no;
            const t = tradeById(m[1]);
            if (!t) return tornError(6, 'Incorrect ID');
            return answer(200, { trade: tradeFull(t) });
        }

        if (path === '/v2/user/inventory') {
            const no = need(3);
            if (no) return no;
            const cat = q('cat');
            if (!cat && world.options.inventoryNeedsCat) return tornError(21, 'Incorrect category');
            let held = world.held;
            let countedAt = t;
            if (world.options.inventoryHourly) {
                const key = cat || '';
                const had = invCounts.get(key);
                if (!had || t - had.at >= 3600000) invCounts.set(key, { at: t, held: { ...world.held } });
                held = invCounts.get(key).held;
                countedAt = invCounts.get(key).at;
            }
            const all = Object.entries(held)
                .filter(([id, n]) => n > 0 && world.items[id] && (!cat || world.items[id].type === cat))
                .map(([id, n]) => ({ id: Number(id), name: world.items[id].name, type: world.items[id].type, amount: n, equipped: false, faction_owned: false, uid: null }))
                .sort((a, b) => a.id - b.id);
            const limit = ftWhole(q('limit')) || 250;
            const offset = ftWhole(q('offset'));
            const page = all.slice(offset, offset + limit);
            const next = offset + limit < all.length ? 'https://api.torn.com/v2/user/inventory?limit=' + limit + '&offset=' + (offset + limit) + (cat ? '&cat=' + encodeURIComponent(cat) : '') : null;
            return answer(200, { inventory: { items: page, timestamp: ftSec(countedAt) }, _metadata: { links: { next, prev: null } } });
        }

        if (path === '/v2/user/money') {
            const no = need(3);
            if (no) return no;
            return answer(200, { money: { points: world.money.points, wallet: world.money.wallet, company: 0, vault: world.money.vault, cayman_bank: 0, city_bank: null, faction: null, daily_networth: 0 } });
        }

        if (path === '/v2/user/forumthreads') {
            // UNSURE: the name of the list ("forumThreads") and of each thread's fields.
            const limit = ftWhole(q('limit')) || 100;
            const rows = [...world.threads].sort((a, b) => b.last_post_time - a.last_post_time).slice(0, limit).map((th) => ({
                id: th.id, forum_id: th.forum_id, title: th.title, posts: 12, rating: 3, views: 240, author: { id: you.id, username: you.name, karma: 0 },
                last_poster: { id: you.id, username: you.name, karma: 0 }, first_post_time: th.first_post_time, last_post_time: th.last_post_time,
                has_poll: false, is_locked: false, is_sticky: false,
            }));
            return answer(200, { forumThreads: rows, _metadata: { links: { next: null, prev: null } } });
        }

        if (path === '/v2/user') {
            if (String(q('selections') || '') !== 'bazaar') return tornError(4, 'Wrong fields');
            const s = sellerById(q('id') || you.id);
            const rows = s ? s.bazaar.map((r) => ({ ID: r.id, name: world.items[r.id].name, type: world.items[r.id].type, quantity: r.qty, price: r.price, market_price: world.items[r.id].mv })) : [];
            return answer(200, { bazaar: rows });
        }

        if (path === '/v2/market/pointsmarket') {
            // UNSURE: v2's shape; this is v1's ({ pointsmarket: { id: { cost, quantity, total_cost } } }).
            return answer(200, { pointsmarket: Object.fromEntries(world.pointsMarket.map((l) => [l.id, { cost: l.cost, quantity: l.quantity, total_cost: l.cost * l.quantity }])) });
        }

        if ((m = path.match(/^\/v2\/market\/(\d+)\/itemmarket$/))) {
            const it = world.items[m[1]];
            if (!it) return tornError(6, 'Incorrect ID');
            const all = [...(world.itemMarket[m[1]] || [])].sort((a, b) => a.price - b.price);
            const limit = ftWhole(q('limit')) || 20;
            const offset = ftWhole(q('offset'));
            return answer(200, {
                itemmarket: { item: { id: it.id, name: it.name, type: it.type, average_price: it.mv }, listings: all.slice(offset, offset + limit).map((l) => ({ price: l.price, amount: l.amount })), cache_timestamp: ftSec(t), cache_delay: 30 },
                _metadata: { links: { next: null, prev: null }, total: all.length },
            });
        }

        return null;
    }

    // ---- weav3r.dev ---------------------------------------------------------------------------------------------------

    /** A bazaar as TornW3B last saw it: looked at again every few minutes, never while `frozen`. */
    function seen(s) {
        const t = now();
        if (!s.w3b || (!s.frozen && t - s.w3b.at >= s.checkEveryMs)) s.w3b = { at: t, rows: ftCopy(s.bazaar) };
        return s.w3b;
    }

    function listingsOf(itemId) {
        const out = [];
        for (const s of world.sellers) {
            const view = seen(s);
            for (const r of view.rows) {
                if (Number(r.id) !== Number(itemId)) continue;
                out.push({ item_id: Number(itemId), player_id: s.id, player_name: s.name, quantity: r.qty, price: r.price, content_updated: ftSec(s.changedAt), last_checked: ftSec(view.at) });
            }
        }
        return out.sort((a, b) => a.price - b.price);
    }

    function priceOnList(entry) {
        if (!entry || entry.pricingValue == null) return 0;
        const mv = (world.items[entry.itemID] || {}).mv || 0;
        if (entry.pricingType === 'market_percentage') return Math.round(mv * entry.pricingValue / 100);
        if (entry.pricingType === 'market_offset') return Math.round(mv + entry.pricingValue);
        return Math.round(entry.pricingValue);
    }

    function w3b(u, call, method, headers, body) {
        const t = now();
        const sent = headers['x-api-key'] || null;
        call.key = sent ? keyKind(sent) || 'unknown' : null;
        const registered = !!sent && sent === world.keys.w3b;
        const retry = (why, secs) => { refused.push({ t, host: call.host, path: call.path, why }); return answer(429, { error: 'Too many requests' }, { 'Retry-After': secs }); };
        if (inMinute('weav3r.dev', t) >= world.options.limits.w3bPerMinute) return retry('w3b-minute', 30);
        const path = u.pathname.replace(/^\/api\//, '/').replace(/\/+$/, '') || '/';
        let m;

        if (path === '/marketplace' && method === 'GET') {
            const out = [];
            for (const it of Object.values(world.items)) {
                const rows = listingsOf(it.id);
                if (!rows.length) continue;
                out.push({
                    item_id: it.id, item_name: it.name, market_price: it.mv, lowest_price: rows[0].price,
                    bazaar_average: Math.round(rows.reduce((s, r) => s + r.price * r.quantity, 0) / rows.reduce((s, r) => s + r.quantity, 0)), total_bazaars: rows.length,
                });
            }
            return answer(200, { items: out, total: out.length });
        }

        if ((m = path.match(/^\/marketplace\/(\d+)$/)) && method === 'GET') {
            // The route TornW3B counts by itself: 10 a minute and 1,000 a day without a key.
            const lim = world.options.limits;
            while (listingDay.length && t - listingDay[0] >= FT_DAY) listingDay.shift();
            const minute = listingDay.filter((x) => t - x < FT_MIN);
            if (minute.length >= lim.w3bListingPerMinute) return retry('w3b-listing-minute', Math.ceil((minute[0] + FT_MIN - t) / 1000));
            if (listingDay.length >= lim.w3bListingPerDay) return retry('w3b-listing-day', Math.ceil((listingDay[0] + FT_DAY - t) / 1000));
            listingDay.push(t);
            const it = world.items[m[1]];
            if (!it) return answer(404, { error: 'Item not found' });
            const rows = listingsOf(it.id);
            const glitch = world.options.w3bGlitch.indexOf(it.id);
            if (glitch >= 0) world.options.w3bGlitch.splice(glitch, 1);
            return answer(200, { item_id: it.id, item_name: it.name, market_price: it.mv, bazaar_average: it.mv, total_listings: rows.length, listings: glitch >= 0 ? [] : rows });
        }

        if ((m = path.match(/^\/marketplace\/(\d+)\/traders$/)) && method === 'GET') {
            const rows = [...(world.w3b.buyers[m[1]] || [])].sort((a, b) => b.price - a.price).map((b) => ({
                player_id: b.player_id, player_name: b.player_name, price: b.price, rating: { upvotes: 12, downvotes: 0 },
                last_action: ftSec(t - 10 * FT_MIN), last_trade: ftSec(t - 5 * FT_HOUR), pricelist_updated: ftSec(t - FT_DAY),
            }));
            return answer(200, { total_count: rows.length, traders: rows });
        }

        if ((m = path.match(/^\/pricelist\/(\d+)$/))) {
            const mine = Number(m[1]) === you.id;
            if (method === 'GET') {
                if (!mine) return answer(404, { error: 'Pricelist not found for this user' });
                if (world.options.ownListShape === 'public') {
                    const on = new Map(world.w3b.priceList.map((e) => [e.itemID, e]));
                    const row = (id, name, pays) => ({ itemId: id, name, buyPrice: pays, bulkThreshold: null, bulkBuyPrice: null });
                    return answer(200, [row(-1, 'Plushie Set', 0), row(-2, 'Flower Set', 0), ...Object.values(world.items).map((it) => row(it.id, it.name, on.has(it.id) ? priceOnList(on.get(it.id)) : 0))]);
                }
                return answer(200, { items: ftCopy(world.w3b.priceList) });
            }
            if (method === 'PUT') {
                // The key you registered rides in the X-API-Key header; without it TornW3B does not know you.
                if (!registered) return answer(401, { error: 'Unauthorized' });
                if (!mine) return answer(403, { error: 'Forbidden' });
                const count = { updated: 0, inserted: 0, deleted: 0 };
                for (const it of (body && body.items) || []) {
                    const id = Number(it && it.itemID);
                    if (!(id > 0)) continue;
                    const at = world.w3b.priceList.findIndex((e) => e.itemID === id);
                    if (it.pricingValue == null) { if (at >= 0) { world.w3b.priceList.splice(at, 1); count.deleted += 1; } continue; }
                    const entry = { ...it, itemID: id, pricingType: it.pricingType || 'fixed', pricingValue: Number(it.pricingValue) };
                    if (at >= 0) { world.w3b.priceList[at] = entry; count.updated += 1; } else { world.w3b.priceList.push(entry); count.inserted += 1; }
                }
                return answer(200, { success: true, ...count, total: world.w3b.priceList.length });
            }
            if (method === 'POST') {
                // A receipt for one trade, priced from this player's list. No key in TornW3B's spec.
                if (!mine) return answer(404, { error: 'Pricelist not found for this user' });
                if (!body || body.tradeID == null || !Array.isArray(body.items)) return answer(400, { error: 'tradeID and items are required' });
                const form = typeof body.tradeID === 'number' ? ('includeMessage' in body ? 0 : 1) : 2;
                world.w3b.receiptAsks = [...(world.w3b.receiptAsks || []), form];
                if (world.options.receiptForm != null && world.options.receiptForm !== form) return answer(400, { error: 'Invalid request body' });
                const lines = [];
                const warnings = { notFound: [], notPriced: [] };
                for (const it of body.items) {
                    const id = Number(it && it.itemID);
                    const entry = world.w3b.priceList.find((e) => e.itemID === id);
                    const name = (world.items[id] || {}).name || 'Item ' + id;
                    if (!entry) { warnings.notFound.push(name); continue; }
                    const price = priceOnList(entry);
                    if (!price) { warnings.notPriced.push(name); continue; }
                    lines.push({ id, name, quantity: ftWhole(it.quantity), priceUsed: price, totalValue: ftWhole(it.quantity) * price });
                }
                const total = lines.reduce((s, l) => s + l.totalValue, 0);
                const rid = 'fr' + String(++receiptSeq).padStart(4, '0');
                const whenIso = new Date(t).toISOString();
                world.w3b.receipts.push({
                    id: rid, trade_id: Number(body.tradeID) || String(body.tradeID), buyer_name: world.players[body.buyerPlayerId] || '', total_value: total, item_count: lines.length,
                    created_at: whenIso, updated_at: whenIso,
                    items: lines.map((l) => ({ item_id: l.id, item_name: l.name, quantity: l.quantity, price_used: l.priceUsed, total_value: l.totalValue, market_price_at_time: (world.items[l.id] || {}).mv || 0 })),
                });
                return answer(200, { receipt: { items: lines, total_value: total }, ...(world.options.receiptLink ? { receiptURL: 'https://weav3r.dev/receipt/' + rid } : {}), warnings, ...(body.includeMessage ? { message: 'Thank you for the trade.' } : {}) });
            }
        }

        if ((m = path.match(/^\/trades\/(\d+)(?:\/([^/]+))?$/)) && method === 'GET') {
            if (!registered) return answer(401, { error: 'Unauthorized' });
            if (Number(m[1]) !== you.id) return answer(403, { error: 'Forbidden' });
            if (!m[2]) {
                // UNSURE: whether the list comes bare or wrapped; api/tw3b-own.js takes either.
                return answer(200, [...world.w3b.receipts].reverse().slice(0, 100).map((r) => ({ id: r.id, name: r.buyer_name, value: r.total_value })));
            }
            const r = world.w3b.receipts.find((x) => String(x.id) === decodeURIComponent(m[2]));
            return r ? answer(200, ftCopy(r)) : answer(404, { error: 'Receipt not found' });
        }

        return null;
    }

    // ---- the one way in ---------------------------------------------------------------------------------------------

    /**
     * Answers as a `fetch` Response stand-in ({ ok, status, json(), headers.get() }) and as the clients' own answer
     * (`header(name)`), whichever the caller reads. `init` is fetch's, or api/tw3b-own.js's { method, headers, body }
     * with the body still an object.
     */
    async function fetch(url, init = {}) {
        const text = String(url);
        const u = new URL(text);
        const method = String((init && init.method) || 'GET').toUpperCase();
        const headers = {};
        const rawHeaders = (init && init.headers) || {};
        if (typeof rawHeaders.forEach === 'function') rawHeaders.forEach((v, k) => { headers[String(k).toLowerCase()] = String(v); });
        else for (const [k, v] of Object.entries(rawHeaders)) headers[k.toLowerCase()] = String(v);
        let body = init && init.body;
        if (typeof body === 'string') { try { body = JSON.parse(body); } catch { /* left as text */ } }

        const query = {};
        for (const [k, v] of u.searchParams) if (k !== 'key') query[k] = v;
        const call = { t: now(), host: u.hostname, path: u.pathname, query, method, key: null, status: 0, ...(body != null ? { body: ftCopy(body) } : {}) };

        // Keys where they must never be: the TornW3B key in any address, a Torn key anywhere on its way to TornW3B.
        if (world.keys.w3b && text.includes(world.keys.w3b)) leaks.push({ t: call.t, host: call.host, path: call.path, what: 'the TornW3B key is in an address' });
        if (u.hostname !== 'api.torn.com') {
            const carried = text + ' ' + JSON.stringify(headers) + ' ' + JSON.stringify(body == null ? '' : body);
            for (const kind of ['limited', 'full', 'public']) if (world.keys[kind] && carried.includes(world.keys[kind])) leaks.push({ t: call.t, host: call.host, path: call.path, what: 'the ' + kind + ' Torn key was sent to ' + u.hostname });
        }

        let res = null;
        const where = u.hostname + u.pathname;
        const forced = failing.find((f) => f.left > 0 && (f.pattern instanceof RegExp ? f.pattern.test(where) : where.includes(String(f.pattern))));
        if (forced) {
            forced.left -= 1;
            if (u.hostname === 'api.torn.com') { const key = u.searchParams.get('key'); call.key = key ? keyKind(key) || 'unknown' : null; }
            res = answer(forced.answer.status || 200, forced.answer.body, forced.answer.headers || {});
        } else if (u.hostname === 'api.torn.com') res = torn(u, call);
        else if (u.hostname === 'weav3r.dev') res = w3b(u, call, method, headers, body);

        if (!res) {
            unknown.push({ t: call.t, host: call.host, path: call.path, method });
            res = answer(404, { error: 'Not found' });
        }
        call.status = res.status;
        calls.push(call);
        return res;
    }

    return {
        world, fetch, calls, unknown, refused, leaks,
        buy, buyMarket, openTrade, addToTrade, finishTrade, cancelTrade, swap, sellPoints, mug, vaultDeposit, setPrice, addLog, typeIdByTitle, failNext,
        /** A price at a percent of an item's market value, as the world rounds it. */
        pct,
    };
}
