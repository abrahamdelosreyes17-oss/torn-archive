/*
 * The shared server, Torn Archive's side (core/server.js, api/server-link.js, and the folds in engine/state.js).
 *
 * The exchange runs here against the server's OWN code - the owner's folder beside this one (../server, a local
 * folder that is deployed by him and is in no repository) - so the two cannot drift apart unseen. Where that
 * folder is absent those tests are skipped and say so; the rest run anywhere.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';

import {
    SERVER_APP, SERVER_SYNC_MS, SERVER_GRANT_STALE_MS, SERVER_KEEP_MS, SERVER_BOUGHT_MS, SERVER_DIR_KEEP_MS, SERVER_TURN_WAIT_MS, SERVER_PAGE,
    serverAddress, serverPassOk, serverClaim, serverVersion, serverMayCall, serverBody, serverOutgoingOk, serverKnowsApps, serverGrantIn, serverTake,
    serverPrune, serverReadKept, serverShop, serverDirIn, serverListReadAt, serverPerson, serverLines, serverMarketIn, SERVER_MARKET_FRESH_MS,
    serverUse, SERVER_WHOLE, SERVER_BESIDE_FRESH_MS,
} from '../src/core/server.js';
import { ServerLink, SERVER_CONFIG_KEY, SERVER_STATE_KEY, SERVER_GRANT_KEY, SERVER_CALLS_KEY, SERVER_RETRY_MS, SERVER_ADDRESS_RETRY_MS } from '../src/api/server-link.js';
import { createHash } from 'node:crypto';
import { usageAdd, usageCallsAdd } from '../src/core/usage.js';
import { engineEmpty, engineLoad, foldServer, foldShop, foldListings, offersOf, shopNow, noteSeenBuy, engineInput, ENGINE_PIECES, SHOP_KEEP_MS } from '../src/engine/state.js';
import { archiveSettings } from '../src/core/settings.js';
import { TornApiClient } from '../src/api/client.js';

const NOW = Date.UTC(2026, 9, 10, 12, 0, 0);
const SEC = 1000;
const MIN = 60000;
const PASS = 'a'.repeat(12) + 'B7'.repeat(8);
const ADDRESS = 'https://shared.someone.workers.dev';
const PIECES = ENGINE_PIECES;
const PIECE_SET = new Set(PIECES);
const SHEEP = 186;
const PANDA = 274;
const DAHLIA = 260;
const XANAX = 206;

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = resolve(HERE, '..', '..', 'server', 'src');
const core = existsSync(resolve(SERVER_DIR, 'core.js')) ? await import(pathToFileURL(resolve(SERVER_DIR, 'core.js')).href) : null;
const skipCore = core ? false : 'the server folder is not beside this one';

// ---- the pure half --------------------------------------------------------------------------------------------------

test('the address is https on workers.dev only; a password is letters and digits, 24 or more', () => {
    assert.equal(serverAddress('shared.someone.workers.dev'), ADDRESS);
    assert.equal(serverAddress('  https://shared.someone.workers.dev/sync?x=1 '), ADDRESS);
    for (const bad of ['', null, 'http://shared.someone.workers.dev', 'https://workers.dev.evil.com', 'https://evil.com/workers.dev', 'https://api.torn.com', 'https://weav3r.dev', 'not an address', 'https://WORKERS.dev@evil.com']) {
        assert.equal(serverAddress(bad), null, String(bad));
    }
    assert.equal(serverPassOk(PASS), true);
    for (const bad of ['', 'short', 'a'.repeat(23), 'a'.repeat(24) + '!', 'a b'.repeat(10), null, 42, 'a'.repeat(201)]) assert.equal(serverPassOk(bad), false, String(bad));
    assert.equal(serverVersion('1.0.0'), '1.0.0');
    assert.equal(serverVersion('dev'), 'dev');
    assert.equal(serverVersion('1.0 <script>'), '');
    assert.equal(SERVER_APP, 'torn-archive');
    assert.match(SERVER_APP, /^[a-z][a-z0-9-]{1,23}$/, 'a name the server takes');
});

test('what is sent: the app, numbers and lists of numbers; the pieces only; nothing else can come out', () => {
    const want = {
        sellers: [501, '502', 'x', -4, 501, 2e10],
        looking: [503, 501],
        worth: { [SHEEP]: 612.4, [PANDA]: 36199, [XANAX]: 800000, junk: 5, [DAHLIA]: 0 },
        bought: [
            { whoId: '501', id: String(SHEEP), qty: 3, price: 590, t: NOW - 2 * MIN },
            { whoId: '501', id: String(SHEEP), qty: 3, price: 590, t: NOW - 2 * MIN },
            { whoId: 501, id: XANAX, qty: 1, price: 790000, t: NOW - MIN },
            { whoId: 501, id: PANDA, qty: 2, price: 35000, t: NOW - SERVER_BOUGHT_MS },
            { whoId: '', id: PANDA, qty: 2, price: 35000, t: NOW },
            { whoId: 501, id: PANDA, qty: 0, price: 35000, t: NOW },
        ],
        dir: [[SHEEP, NOW - 5 * MIN], [SHEEP, NOW - MIN], [XANAX, NOW - MIN], [PANDA, NOW - SERVER_DIR_KEEP_MS]],
        // Nothing of these may leave.
        key: 'SECRETKEY1234567', name: 'Somebody', inventory: [{ id: SHEEP, qty: 40 }], money: 5_000_000,
    };
    const body = serverBody({ ver: '1.0.0', used: 12.9, waiting: 3, want, pieces: PIECES, since: 44, seen: NOW - 30 * SEC, sendWorth: true, now: NOW });
    assert.deepEqual(body, {
        app: 'torn-archive', ver: '1.0.0', used: 12, waiting: 3,
        sellers: [503, 501, 502], trades: [], looking: [503, 501],
        since: 44, seen: NOW - 30 * SEC, going: [],
        bought: [[501, SHEEP, 3, 590, 2 * MIN]],
        dir: [[SHEEP, MIN]],
        worth: { [SHEEP]: 612, [PANDA]: 36199 },
    });
    assert.equal(serverOutgoingOk(body, PIECES), true);
    assert.ok(!/SECRET|Somebody|inventory|money/.test(JSON.stringify(body)));
    // Worth left out when it has not changed: the server keeps the last one said.
    assert.equal('worth' in serverBody({ want, pieces: PIECES, sendWorth: false, now: NOW }), false);
    // Nothing wanted: still a whole, valid message.
    assert.equal(serverOutgoingOk(serverBody({ pieces: PIECES, now: NOW }), PIECES), true);
});

test('the check on the way out refuses anything that is not such a message', () => {
    const ok = () => serverBody({ ver: '1.0.0', used: 1, waiting: 0, want: { sellers: [501], worth: { [SHEEP]: 600 } }, pieces: PIECES, now: NOW });
    assert.equal(serverOutgoingOk(ok(), PIECES), true);
    const bad = [
        (b) => { b.key = 'SECRETKEY1234567'; },
        (b) => { b.app = 'torn-bids'; },
        (b) => { delete b.app; },
        (b) => { b.ver = 'a version with words'; },
        (b) => { b.sellers = ['501']; },
        (b) => { b.looking = [0]; },
        (b) => { b.worth = { [XANAX]: 800000 }; },
        (b) => { b.worth = { [SHEEP]: 600.5 }; },
        (b) => { b.worth = { [SHEEP]: 'six hundred' }; },
        (b) => { b.bought = [[501, XANAX, 1, 790000, 0]]; },
        (b) => { b.bought = [[501, SHEEP, 1, 590, 0, 'note']]; },
        (b) => { b.dir = [[XANAX, 0]]; },
        (b) => { b.going = [[SHEEP, 0, 501]]; },
        (b) => { b.used = 'many'; },
        (b) => { b.since = -1; },
    ];
    for (const spoil of bad) { const b = ok(); spoil(b); assert.equal(serverOutgoingOk(b, PIECES), false, spoil.toString()); }
    for (const junk of [null, [], 'text', 4]) assert.equal(serverOutgoingOk(junk, PIECES), false);
});

test('your part of the Torn limit: your calls, one more and the server\'s part fit in 80; no fresh grant, no check', () => {
    const calls = (n, at = NOW - SEC) => Array.from({ length: n }, () => at);
    const grant = { at: NOW, need: 30, serverShare: 50, serverTimes: [] };
    assert.equal(serverMayCall(null, calls(84), NOW), true, 'the server off');
    assert.equal(serverMayCall(grant, calls(29), NOW), true);
    assert.equal(serverMayCall(grant, calls(30), NOW), false, '30 + 1 + 50 is over 80');
    assert.equal(serverMayCall(grant, calls(30, NOW - 61 * SEC), NOW), true, 'calls older than a minute do not count');
    // The server's own calls of the last minute count when they are more than its part.
    assert.equal(serverMayCall({ ...grant, serverShare: 10, serverTimes: calls(60) }, calls(19), NOW), true);
    assert.equal(serverMayCall({ ...grant, serverShare: 10, serverTimes: calls(60) }, calls(20), NOW), false);
    assert.equal(serverMayCall({ ...grant, at: NOW - SERVER_GRANT_STALE_MS - 1 }, calls(84), NOW), true, 'too old to trust');
    // The grant from an answer: the server's clock turned into this PC's.
    const g = serverGrantIn({ grant: { at: NOW + 5000, need: 42, serverShare: 38, serverTimes: [NOW + 4000, NOW + 1000, 'x'] } }, NOW);
    assert.deepEqual(g, { at: NOW, need: 42, serverShare: 38, serverTimes: [NOW - 1000, NOW - 4000] });
    assert.equal(serverGrantIn({}, NOW), null);
});

test('the server\'s reads: only pieces are kept, the cheaper of two prices, locked listings left out, clocks set right', () => {
    const kept = {};
    const answer = {
        now: NOW + 10 * SEC, // the server's clock runs 10 s ahead of this PC's
        reads: [
            { id: 501, at: NOW + 10 * SEC - MIN, items: [{ id: SHEEP, price: 600, qty: 4 }, { id: SHEEP, price: 580, qty: 1 }, { id: XANAX, price: 790000, qty: 2 }, { id: PANDA, price: 1, qty: 9 }] },
            { id: 502, at: NOW + 10 * SEC - 2 * MIN, items: [{ id: XANAX, price: 790000, qty: 2 }] },
            { id: 503, at: NOW + 10 * SEC - 2 * MIN, items: [] },
            { id: 'junk', at: NOW, items: [{ id: SHEEP, price: 5, qty: 1 }] },
            { id: 504, at: NOW, items: 'none' },
        ],
        seen: [],
    };
    assert.equal(serverTake(kept, answer, PIECE_SET, (id) => id === '503', NOW), true);
    assert.deepEqual(kept, { 501: [NOW - MIN, NOW - MIN, [[SHEEP, 580, 1]]], 503: [NOW - 2 * MIN, NOW - 2 * MIN, []] });
    assert.deepEqual(serverShop(kept, '501'), { at: NOW - MIN, changedAt: NOW - MIN, items: { [SHEEP]: { price: 580, qty: 1 } } });
    assert.equal(serverShop(kept, 502), null, 'a bazaar with no piece that nobody listed is not kept');
    assert.deepEqual(serverShop(kept, 503).items, {}, 'a known seller found without pieces is kept: sold out');
    // Read again and found the same: seen later, only for what is kept.
    assert.equal(serverTake(kept, { now: NOW + 40 * SEC, reads: [], seen: [[501, NOW + 35 * SEC], [502, NOW + 35 * SEC], ['x', 1]] }, PIECE_SET, null, NOW + 30 * SEC), true);
    assert.equal(kept[501][1], NOW + 25 * SEC);
    assert.equal(kept[501][0], NOW - MIN, 'when it changed stays');
    assert.equal(serverTake(kept, { now: NOW + 40 * SEC, reads: [], seen: [[501, NOW]] }, PIECE_SET, null, NOW + 30 * SEC), false, 'never back in time');
    // A time from the server's future is not later than now.
    serverTake(kept, { now: NOW, reads: [{ id: 505, at: NOW + 10 * MIN, items: [{ id: SHEEP, price: 700, qty: 1 }] }] }, PIECE_SET, null, NOW);
    assert.equal(kept[505][0], NOW);
    // Dropped when the server has not confirmed it for three hours; read back from storage strictly.
    assert.equal(serverPrune(kept, NOW + SERVER_KEEP_MS), true);
    assert.deepEqual(Object.keys(kept), ['501', '505']);
    assert.deepEqual(serverReadKept({ ...kept, 9: 'junk', x: [1, 2, []], 7: [1, 2, [[1, 2]]] }), kept);
    assert.deepEqual(serverReadKept(null), {});
});

test('TornW3B\'s lists read by another PC of ours count as read; with several PCs on, one goes first for each', () => {
    const dir = serverDirIn({ dir: [[SHEEP, 2 * MIN], [PANDA, SERVER_DIR_KEEP_MS], ['x', 5]], turn: { of: 2, me: 1 } }, { reads: { [DAHLIA]: NOW - 10 * MIN, [XANAX]: NOW - SERVER_DIR_KEEP_MS } }, NOW);
    assert.deepEqual(dir, { reads: { [DAHLIA]: NOW - 10 * MIN, [SHEEP]: NOW - 2 * MIN }, turn: { of: 2, me: 1 } });
    assert.deepEqual(serverDirIn({ turn: { of: 0, me: 3 } }, null, NOW).turn, { of: 1, me: 0 });
    assert.deepEqual(serverListReadAt(NOW - 30 * MIN, SHEEP, null), { at: NOW - 30 * MIN, wait: 0 }, 'the server off: your own read');
    // 186 is even: with two PCs on, PC 0 reads it first; this PC (1) waits a little longer.
    assert.deepEqual(serverListReadAt(NOW - 30 * MIN, SHEEP, dir), { at: NOW - 2 * MIN, wait: SERVER_TURN_WAIT_MS });
    assert.deepEqual(serverListReadAt(NOW - MIN, SHEEP, dir).at, NOW - MIN, 'your own read is the newer');
    assert.equal(serverListReadAt(0, 261, dir).wait, 0, 'an odd one is this PC\'s to read first');
});

test('Settings, in words: only what is known, and never a name that is not a Torn name', () => {
    assert.deepEqual(serverPerson({ id: 2000001, name: 'Some_Body-9' }), { id: 2000001, name: 'Some_Body-9' });
    assert.deepEqual(serverPerson({ id: 'x', name: '<b>label</b>' }), { id: null, name: null });
    const on = { on: true, okAt: NOW - 12 * SEC, error: null, why: null, reading: 'reading', key: 'working', need: 40, serverShare: 40, people: 3, peopleOn: [{ id: 2000002, name: 'Other_One' }], you: { id: 2000001, name: 'Some_Body-9' } };
    const l = serverLines(on, NOW);
    assert.equal(l.level, 'ok');
    assert.equal(l.now, 'Connected · 3 people · Other_One is on now · last exchange 12 s ago');
    assert.deepEqual(l.key, { level: 'ok', text: 'Working · the key of Some_Body-9 [2000001]' });
    assert.deepEqual(l.split, { pc: 40, server: 40, free: 20 });
    assert.equal(serverLines(null, NOW).now, 'Off. Torn Archive works alone.');
    assert.match(serverLines({ on: false, typed: 'x' }, NOW).now, /both saved/);
    assert.equal(serverLines({ ...on, reading: 'stopped' }, NOW).level, 'warn');
    assert.match(serverLines({ ...on, reading: 'resting' }, NOW).now, /rests until midnight UTC/);
    assert.match(serverLines({ ...on, okAt: NOW - 3 * MIN }, NOW).now, /^No answer since \d\d:\d\d · working alone$/);
    assert.equal(serverLines({ ...on, okAt: null }, NOW).now, 'Connecting…');
    assert.equal(serverLines({ ...on, why: 'password', error: 'x' }, NOW).level, 'bad');
    assert.match(serverLines({ ...on, why: 'old', error: 'x' }, NOW).now, /has to be updated first/);
    assert.match(serverLines({ ...on, why: 'update', needVer: '1.2.0', error: 'x' }, NOW).now, /newer Torn Archive \(1\.2\.0 or later\)/);
    assert.match(serverLines({ ...on, key: 'refused by Torn (2)' }, NOW).key.text, /code 2/);
    assert.equal(serverKnowsApps({ apps: true }), true);
    for (const old of [{}, { apps: 'yes' }, null, { reading: 'reading' }]) assert.equal(serverKnowsApps(old), false);
});

// ---- the folds: what the server read, in the listings the pages show -------------------------------------------------

function stateWith() {
    const S = engineEmpty();
    S.self = { id: '2000001', name: '' };
    S.names = { 501: 'Seller_A' };
    // TornW3B listed two bazaars for the Sheep, ten minutes ago.
    foldListings(S, String(SHEEP), [
        { player_id: 501, player_name: 'Seller_A', price: 600, quantity: 5, last_checked: Math.floor((NOW - 12 * MIN) / 1000) },
        { player_id: 502, player_name: 'Seller_B', price: 640, quantity: 2, last_checked: Math.floor((NOW - 12 * MIN) / 1000) },
    ], NOW - 10 * MIN);
    return S;
}
const rowsOf = (S, id = SHEEP, now = NOW) => offersOf(S, id, now).map((o) => [String(o.whoId), o.price, o.qty]);

test('a server read newer than TornW3B\'s list stands: its price, its count, sold out when the piece is gone, and bazaars the list never named', () => {
    const S = stateWith();
    if (!rowsOf(S).length) { assert.fail('the made-up TornW3B rows were not taken: ' + JSON.stringify(S.offers)); }
    assert.deepEqual(rowsOf(S), [['501', 600, 5], ['502', 640, 2]]);
    foldServer(S, {
        now: NOW, seq: 9,
        reads: [
            { id: 501, at: NOW - 2 * MIN, items: [{ id: SHEEP, price: 590, qty: 3 }] },
            { id: 502, at: NOW - 3 * MIN, items: [{ id: XANAX, price: 790000, qty: 1 }] },
            { id: 777, at: NOW - MIN, items: [{ id: SHEEP, price: 570, qty: 8 }, { id: PANDA, price: 35500, qty: 1 }] },
            { id: 2000001, at: NOW - MIN, items: [{ id: SHEEP, price: 10, qty: 99 }] },
        ],
        seen: [], dir: [], turn: { of: 1, me: 0 },
    }, NOW);
    assert.equal(S.server.seq, 9);
    assert.equal(S.server.seenAt, NOW);
    assert.equal(S.server.at, NOW);
    assert.deepEqual(rowsOf(S).sort((a, b) => a[1] - b[1]), [['777', 570, 8], ['501', 590, 3]], '502 sold out, 777 is new, your own bazaar never');
    assert.deepEqual(rowsOf(S, PANDA), [['777', 35500, 1]], 'a piece TornW3B was never asked about is priced by the server');
    assert.equal(engineInput(S, archiveSettings({}), NOW).priced(PANDA), true);
    assert.equal(offersOf(S, SHEEP, NOW).find((o) => o.whoId === '501').who, 'Seller_A');
    assert.equal(offersOf(S, SHEEP, NOW).find((o) => o.whoId === '777').who, null, 'no name is known for it yet');

    // Your own read of a bazaar, newer than the server's, stands over it; an older one does not.
    foldShop(S, '777', { bazaar: [{ ID: SHEEP, price: 575, quantity: 6 }] }, NOW + MIN);
    assert.deepEqual(shopNow(S, 777, NOW + MIN).items, { [SHEEP]: { price: 575, qty: 6 } });
    foldServer(S, { now: NOW + 2 * MIN, seq: 10, reads: [{ id: 777, at: NOW + 2 * MIN, items: [{ id: SHEEP, price: 560, qty: 2 }] }], seen: [] }, NOW + 2 * MIN);
    assert.deepEqual(rowsOf(S, SHEEP, NOW + 2 * MIN).find((r) => r[0] === '777'), ['777', 560, 2]);

    // What you were seen buying there since comes off.
    noteSeenBuy(S, { id: SHEEP, qty: 1, whoId: '777', price: 560, t: NOW + 3 * MIN }, NOW + 3 * MIN);
    assert.deepEqual(rowsOf(S, SHEEP, NOW + 3 * MIN).find((r) => r[0] === '777'), ['777', 560, 1]);

    // A read the server has not confirmed for an hour is no longer gone by; read again and found the same, it is.
    const later = NOW + 2 * MIN + SHOP_KEEP_MS;
    assert.equal(shopNow(S, 777, later), null);
    foldServer(S, { now: later, seq: 10, reads: [], seen: [[777, later - MIN]] }, later);
    assert.deepEqual(shopNow(S, 777, later).items, { [SHEEP]: { price: 560, qty: 2 } });
});

test('what the server said is stored with the rest and read back; a stored part of the wrong shape is dropped', () => {
    const S = stateWith();
    foldServer(S, { now: NOW, seq: 3, reads: [{ id: 777, at: NOW, items: [{ id: SHEEP, price: 570, qty: 8 }] }], seen: [], dir: [[SHEEP, MIN]], turn: { of: 2, me: 0 } }, NOW);
    const back = engineLoad(JSON.parse(JSON.stringify({ server: S.server, offers: S.offers, self: S.self })));
    assert.deepEqual(back.server, S.server);
    assert.deepEqual(rowsOf(back).map((r) => r[0]).sort(), ['501', '502', '777']);
    assert.deepEqual(engineLoad({ server: { shops: { 777: 'junk' }, seq: 3 } }).server.shops, {});
    assert.deepEqual(engineLoad({ server: 'junk' }).server, engineEmpty().server);
});

// ---- the exchange -----------------------------------------------------------------------------------------------------

/** A link on stand-ins: storage in memory, the clock in hand, and a `send` the test answers. */
function rig({ answer, want = {}, use = { used: 7, waiting: 2 }, version = '1.0.0' } = {}) {
    const store = new Map();
    const r = { t: NOW, sent: [], took: [], forgot: 0, changes: 0, mark: { seq: 0, seenAt: 0 }, want, use, answer };
    r.link = new ServerLink({
        load: (key) => (store.has(key) ? JSON.parse(store.get(key)) : null),
        save: (key, value) => store.set(key, JSON.stringify(value)),
        del: (key) => store.delete(key),
        send: async (url, options) => {
            const call = { url, method: options.method, headers: options.headers, body: options.body ? JSON.parse(JSON.stringify(options.body)) : null };
            r.sent.push(call);
            const out = await r.answer(call, r);
            return { ok: out.status >= 200 && out.status < 300, status: out.status, json: async () => out.body };
        },
        now: () => r.t,
        version, pieces: PIECES,
        getUse: () => r.use,
        tradingOn: () => r.trading === true,
        getWant: () => r.want,
        getMark: () => r.mark,
        take: (ans, got) => { r.took.push({ ans, got }); if (Number.isInteger(ans.seq)) r.mark = { seq: ans.seq, seenAt: ans.now }; },
        forget: () => { r.forgot += 1; r.mark = { seq: 0, seenAt: 0 }; },
        onChange: () => { r.changes += 1; },
    });
    r.store = store;
    r.syncs = () => r.sent.filter((c) => c.url.endsWith('/sync'));
    r.hellos = () => r.sent.filter((c) => c.url.endsWith('/state'));
    r.tick = async (ms = 0) => { r.t += ms; return r.link.tick(); };
    return r;
}

const okAnswer = (over = {}) => (call, r) => (call.url.endsWith('/state')
    ? { status: 200, body: { apps: true, now: r.t } }
    : { status: 200, body: { grant: { at: r.t, need: 30, serverShare: 50, serverTimes: [] }, reads: [], seen: [], now: r.t, seq: 5, state: 'reading', key: 'working', born: 111, people: 2, on: [], you: { id: 2000001, name: 'Some_Body-9' }, dir: [], turn: { of: 1, me: 0 }, ...over } });

test('off until both are saved: nothing is sent; a bad address or password is not saved', async () => {
    const r = rig({ answer: okAnswer() });
    assert.equal(await r.tick(), false);
    assert.deepEqual(r.link.saveConfig('https://evil.com', PASS), { ok: false, why: 'address' });
    assert.deepEqual(r.link.saveConfig(ADDRESS, 'short'), { ok: false, why: 'password' });
    assert.equal(await r.tick(MIN), false);
    assert.equal(r.sent.length, 0);
    assert.equal(r.link.status().on, false);
    assert.equal(r.link.grant(), null);
    assert.deepEqual(r.link.saveConfig(ADDRESS + '/sync', PASS), { ok: true, why: '' });
    assert.equal(r.link.status().address, ADDRESS);
    assert.equal(r.forgot, 1, 'a new server: what was kept of another goes');
});

test('one exchange: the server is asked what it is first, then told; the password goes in a header to that address only', async () => {
    const r = rig({ answer: okAnswer({ reads: [{ id: 777, at: NOW, items: [{ id: SHEEP, price: 570, qty: 8 }] }] }), want: { sellers: [501], looking: [501], worth: { [SHEEP]: 612 } } });
    r.link.saveConfig(ADDRESS, PASS);
    assert.equal(await r.tick(), true);
    assert.deepEqual(r.sent.map((c) => [c.method, c.url]), [['GET', ADDRESS + '/state'], ['POST', ADDRESS + '/sync']]);
    for (const c of r.sent) {
        assert.deepEqual(c.headers, { Authorization: 'Bearer ' + PASS });
        assert.ok(!c.url.includes(PASS), 'never in an address');
        assert.ok(!JSON.stringify(c.body).includes(PASS), 'never in the message');
    }
    assert.deepEqual(r.syncs()[0].body, { app: 'torn-archive', ver: '1.0.0', used: 7, waiting: 2, sellers: [501], trades: [], looking: [501], since: 0, seen: 0, going: [], bought: [], worth: { [SHEEP]: 612 }, calls: {} });
    assert.equal(r.took.length, 1);
    assert.deepEqual(r.link.grant(), { at: NOW, need: 30, serverShare: 50, serverTimes: [] });
    const st = r.link.status();
    assert.equal(st.okAt, NOW);
    assert.equal(st.error, null);
    assert.deepEqual(st.you, { id: 2000001, name: 'Some_Body-9' });
    assert.ok(!JSON.stringify(st).includes(PASS), 'the password is not in what Settings is given');
    assert.ok(!r.store.get(SERVER_STATE_KEY).includes(PASS));
    assert.ok(!r.store.get(SERVER_GRANT_KEY).includes(PASS));

    // Not again before 30 s; then with how far the reads were taken, worth left out (it has not changed), no second hello.
    assert.equal(await r.tick(SERVER_SYNC_MS - 1), false);
    assert.equal(await r.tick(1), true);
    assert.equal(r.hellos().length, 1);
    const second = r.syncs()[1].body;
    assert.equal(second.since, 5);
    assert.equal(second.seen, NOW);
    assert.equal('worth' in second, false);
    // Worth changed: said again.
    r.want = { ...r.want, worth: { [SHEEP]: 640 } };
    await r.tick(SERVER_SYNC_MS);
    assert.deepEqual(r.syncs()[2].body.worth, { [SHEEP]: 640 });
    // Calls held back for the server's part: sooner, but never closer than a few seconds.
    r.link.askSoon();
    assert.equal(await r.tick(3 * SEC), false);
    assert.equal(await r.tick(4 * SEC), true);
});

test('an older server (one list a person) is never told anything; nor is one that does not know the password', async () => {
    const old = rig({ answer: (call, r) => (call.url.endsWith('/state') ? { status: 200, body: { now: r.t, reading: 'reading', people: [] } } : okAnswer()(call, r)) });
    old.link.saveConfig(ADDRESS, PASS);
    await old.tick();
    assert.equal(old.syncs().length, 0, 'no sync: it would overwrite what Torn Trading told it');
    assert.equal(old.link.status().why, 'old');
    assert.equal(old.link.grant(), null);
    // Asked again only every five minutes; once it is updated, the exchange starts by itself.
    assert.equal(await old.tick(SERVER_RETRY_MS - 1), false);
    old.answer = okAnswer();
    assert.equal(await old.tick(1), true);
    assert.equal(old.syncs().length, 1);
    assert.equal(old.link.status().why, null);

    const unknown = rig({ answer: () => ({ status: 404, body: null }) });
    unknown.link.saveConfig(ADDRESS, PASS);
    await unknown.tick();
    assert.equal(unknown.link.status().why, 'password');
    assert.equal(unknown.syncs().length, 0);
    assert.equal(serverLines(unknown.link.status(), unknown.t).level, 'bad');

    const down = rig({ answer: () => { throw new Error('Network request failed.'); } });
    down.link.saveConfig(ADDRESS, PASS);
    await down.tick();
    assert.equal(down.link.status().error, 'Network request failed.');
    assert.equal(down.link.status().why, null);
    assert.equal(await down.tick(SERVER_SYNC_MS), true, 'a server that is down is tried again at the next exchange');
});

test('turned away until Torn Archive is updated: nothing is taken, but its part of the limit still holds', async () => {
    const r = rig({ answer: (call, x) => (call.url.endsWith('/state') ? { status: 200, body: { apps: true } } : { status: 426, body: { why: 'update', app: 'torn-archive', need: '1.2.0', grant: { at: x.t, need: 45, serverShare: 35, serverTimes: [x.t - 1000] } } }) });
    r.link.saveConfig(ADDRESS, PASS);
    await r.tick();
    assert.equal(r.took.length, 0);
    const st = r.link.status();
    assert.equal(st.why, 'update');
    assert.equal(st.needVer, '1.2.0');
    assert.deepEqual(r.link.grant(), { at: NOW, need: 45, serverShare: 35, serverTimes: [NOW - 1000] });
    assert.equal(serverMayCall(r.link.grant(), Array.from({ length: 45 }, () => NOW), NOW), false);
});

test('a server that started afresh is asked what it is again and told the worth again; a full answer is followed by the next', async () => {
    let born = 111;
    let page = 0;
    const many = Array.from({ length: SERVER_PAGE }, (_, i) => ({ id: 1000 + i, at: NOW, items: [] }));
    const r = rig({
        want: { worth: { [SHEEP]: 612 } },
        answer: (call, x) => (call.url.endsWith('/state') ? { status: 200, body: { apps: true } } : okAnswer({ born, reads: page++ === 0 ? many : [], seq: page })(call, x)),
    });
    r.link.saveConfig(ADDRESS, PASS);
    await r.tick();
    assert.equal(r.syncs().length, 2, 'a full page: the rest is asked for at once');
    assert.equal(r.syncs()[1].body.since, 1);
    assert.equal('worth' in r.syncs()[1].body, false);
    born = 222;
    await r.tick(SERVER_SYNC_MS);
    assert.equal(r.hellos().length, 1);
    await r.tick(SERVER_SYNC_MS);
    assert.equal(r.hellos().length, 2, 'it may be another server now');
    assert.deepEqual(r.syncs()[r.syncs().length - 1].body.worth, { [SHEEP]: 612 });
    // Forgotten: nothing is kept, nothing is sent.
    r.link.forget();
    assert.equal(r.link.status().on, false);
    assert.equal(r.link.grant(), null);
    assert.equal(r.store.has(SERVER_CONFIG_KEY), false);
    const n = r.sent.length;
    await r.tick(10 * MIN);
    assert.equal(r.sent.length, n);
});

test('the Torn client keeps to its part: a call waits while the server\'s part leaves no room, and goes once it does', async () => {
    let grant = { at: Date.now(), need: 0, serverShare: 80, serverTimes: [] };
    const urls = [];
    const held = [];
    const client = new TornApiClient({
        getKey: () => 'k'.repeat(16),
        fetchImpl: async (url) => { urls.push(url); return { ok: true, status: 200, json: async () => ({ ok: 1 }), header: () => null }; },
        mayCall: (now, recent) => serverMayCall(grant, recent, now),
    });
    client.onHeld = () => { held.push(1); grant = { ...grant, serverShare: 40 }; };
    await client.get('user', { selections: 'basic' });
    assert.equal(urls.length, 1);
    assert.equal(held.length, 1, 'held once, then there was room');
});

// ---- against the server's own code ------------------------------------------------------------------------------------

/** The server's own sync() behind the link's `send`: one person, whoever holds the password. */
function realServer() {
    const server = core.newServer();
    core.addPerson(server, 'someone');
    return {
        server,
        answer: (call, r) => {
            if (!call.headers || call.headers.Authorization !== 'Bearer ' + PASS) return { status: 404, body: null };
            if (call.url.endsWith('/state')) return { status: 200, body: { apps: true, now: r.t } };
            return { status: 200, body: { ...JSON.parse(JSON.stringify(core.sync(server, 'someone', call.body, r.t))), born: 111 } };
        },
        /** The server reads one bazaar from Torn and finds this in it. */
        async read(id, items, now) {
            await core.tick(server, { now, read: async (player) => ({ ok: true, items: player === id ? items : [] }), limit: 50 });
        },
    };
}

test('against the server\'s own code: Torn Archive and Torn Trading under one password do not overwrite each other', { skip: skipCore }, async () => {
    const world = realServer();
    const { server } = world;
    // Torn Trading (it sends no app name) watches Xanax and looks at bazaar 900.
    core.sync(server, 'someone', { used: 20, waiting: 0, sellers: [900, 501], trades: [], looking: [900], worth: { [XANAX]: 800000 }, since: 0, seen: 0, going: [], bought: [] }, NOW - SEC);
    core.restore(server, [
        { id: 501, seq: 1, changedAt: NOW - MIN, items: [{ id: SHEEP, price: 590, qty: 3 }, { id: XANAX, price: 790000, qty: 2 }] },
        { id: 900, seq: 2, changedAt: NOW - MIN, items: [{ id: XANAX, price: 780000, qty: 1 }] },
    ]);

    const S = stateWith();
    const r = rig({ answer: world.answer, want: { sellers: [501, 502], looking: [501], worth: Object.fromEntries(PIECES.map((id) => [id, 1000])) }, use: { used: 9, waiting: 1 } });
    r.link.d.take = (ans, got) => { foldServer(S, ans, got); r.mark = { seq: S.server.seq, seenAt: S.server.seenAt }; };
    r.link.saveConfig(ADDRESS, PASS);
    await r.tick();
    assert.equal(r.link.status().error, null);

    const person = server.people.get('someone');
    assert.deepEqual([...person.by.keys()].sort(), ['torn-archive', 'torn-bids']);
    const bids = person.by.get('torn-bids');
    const ours = person.by.get('torn-archive');
    assert.deepEqual([...bids.worth.keys()], [XANAX], 'Torn Trading\'s items are as it said');
    assert.deepEqual([...bids.looking], [900]);
    assert.equal(ours.worth.size, 24);
    assert.deepEqual([...ours.looking], [501]);
    assert.ok(server.bazaars.has(502), 'a bazaar Torn Archive named is known to the server from now');
    // The reader goes by both together.
    assert.deepEqual([...person.looking].sort(), [501, 900]);
    assert.ok(person.worth.has(XANAX) && person.worth.has(SHEEP));
    // Torn Archive got the pieces only, and the Sheep at 501 is in its listings at Torn's own price.
    assert.deepEqual(S.server.shops[501][2], [[SHEEP, 590, 3]]);
    assert.equal(S.server.shops[900], undefined);
    assert.deepEqual(rowsOf(S).find((x) => x[0] === '501'), ['501', 590, 3]);
    // Torn Trading's next answer is still its own: Xanax, not the pieces.
    const theirs = core.sync(server, 'someone', { used: 20, waiting: 0, sellers: [], trades: [], looking: [900], since: 0, seen: 0, going: [], bought: [] }, NOW + SEC);
    assert.deepEqual(theirs.reads.find((z) => z.id === 501).items, [{ id: XANAX, price: 790000, qty: 2 }]);
    // One person, one limit: what both apps use is added up before the server takes its part.
    assert.ok(theirs.grant.need >= 20 + 9 + 1, 'need ' + theirs.grant.need);
    assert.equal(theirs.grant.serverShare, 80 - theirs.grant.need);

    // The server reads 501 again from Torn: the Sheep are gone. Torn Archive hears of it at its next exchange.
    await world.read(501, [{ id: XANAX, price: 790000, qty: 2 }], NOW + 20 * SEC);
    await r.tick(SERVER_SYNC_MS);
    assert.ok(r.syncs()[1].body.since > 0, 'only what is newer than it has is asked for');
    assert.deepEqual(S.server.shops[501][2], []);
    assert.equal(rowsOf(S, SHEEP, r.t).some((x) => x[0] === '501'), false, 'sold out');
    // And what Torn Archive bought is passed on to the others, never to itself.
    r.want = { ...r.want, bought: [{ whoId: 502, id: SHEEP, qty: 2, price: 640, t: r.t - 5 * SEC }] };
    await r.tick(SERVER_SYNC_MS);
    assert.deepEqual(person.by.get('torn-archive').bought.map((b) => [b.seller, b.item, b.qty, b.price]), [[502, SHEEP, 2, 640]]);
    assert.deepEqual([...person.by.get('torn-bids').worth.keys()], [XANAX], 'still untouched');
});

test('against the server\'s own code: every message Torn Archive can make is one the server takes whole', { skip: skipCore }, () => {
    const server = core.newServer();
    core.addPerson(server, 'someone');
    const body = serverBody({
        ver: '1.0.0', used: 30, waiting: 4, pieces: PIECES, since: 0, seen: 0, sendWorth: true, now: NOW,
        want: { sellers: [501, 502], looking: [502], worth: Object.fromEntries(PIECES.map((id, k) => [id, 500 + k])), bought: [{ whoId: 501, id: SHEEP, qty: 2, price: 590, t: NOW - MIN }], dir: [[SHEEP, NOW - 2 * MIN]] },
    });
    assert.equal(core.appOf(body.app), SERVER_APP);
    const out = core.sync(server, 'someone', JSON.parse(JSON.stringify(body)), NOW);
    const slot = server.people.get('someone').by.get(SERVER_APP);
    assert.equal(slot.worth.size, 24);
    assert.equal(slot.worth.get(SHEEP), body.worth[SHEEP]);
    assert.deepEqual([...slot.looking], [502]);
    assert.deepEqual(slot.bought, [{ seller: 501, item: SHEEP, qty: 2, price: 590, at: NOW - MIN }]);
    assert.equal(server.dir.get(SHEEP).at, NOW - 2 * MIN);
    assert.ok(serverGrantIn(out, NOW));
    assert.deepEqual(serverDirIn(out, null, NOW).turn, { of: 1, me: 0 });
});

// ---- the two markets the server reads for Torn Archive ------------------------------------------------------------------

test('the pieces still to buy are named to the server; its reads of the two markets come back in this PC\'s time, pieces only', () => {
    const body = serverBody({ ver: '1.0.0', pieces: PIECES, now: NOW, want: { need: [SHEEP, String(PIECES[1]), XANAX, 'junk', -1, SHEEP] } });
    assert.deepEqual(body.need, [SHEEP, Number(PIECES[1])]);
    assert.equal(serverOutgoingOk(body, PIECES), true);
    assert.equal(serverOutgoingOk({ ...body, need: [XANAX] }, PIECES), false);
    assert.equal('need' in serverBody({ ver: '1.0.0', pieces: PIECES, now: NOW, want: {} }), false, 'nothing to buy: left out');

    // The server's clock is 90 s ahead of this PC's.
    const their = NOW + 90 * SEC;
    const answer = {
        now: their,
        points: { at: their - 20 * SEC, rows: [['900', 29950, 100], ['901', 30100, 5000], ['x<y', 0, 5], 'junk', ['902', 30200, -1]] },
        market: [
            { id: SHEEP, at: their - 30 * SEC, rows: [[612, 1], [640, 3], [1, 99], ['x', 1]] },
            { id: XANAX, at: their - 30 * SEC, rows: [[790000, 1]] },
            { id: Number(PIECES[1]), at: their - 10 * MIN, rows: [[500, 1]] },
            { id: Number(PIECES[2]), at: their - 5 * SEC, rows: [] },
            null,
        ],
    };
    const got = serverMarketIn(answer, PIECES, NOW);
    assert.equal(got.points.at, NOW - 20 * SEC);
    assert.deepEqual(got.points.json, { pointsmarket: { 900: { cost: 29950, quantity: 100 }, 901: { cost: 30100, quantity: 5000 } } });
    assert.deepEqual(got.market, [
        { id: String(SHEEP), at: NOW - 30 * SEC, listings: [{ price: 612, amount: 1 }, { price: 640, amount: 3 }] },
        { id: PIECES[2], at: NOW - 5 * SEC, listings: [] },
    ], 'not Xanax, not a read ten minutes old; a piece nobody lists is an answer too');
    assert.ok(SERVER_MARKET_FRESH_MS < 10 * MIN);
    // Nothing of the kind in the answer (a server without them, or Torn Bids' answer): nothing.
    for (const none of [null, {}, { now: their }, { now: their, points: 5, market: 'x' }, { points: answer.points, market: answer.market }]) assert.deepEqual(serverMarketIn(none, PIECES, NOW), { points: null, market: [] });
    // A time from the future of the server's own clock is never later than now here.
    assert.equal(serverMarketIn({ now: their, points: { at: their + MIN, rows: [['1', 30000, 5]] } }, PIECES, NOW).points.at, NOW);
});

test('a Torn Trading on this PC that tells the server nothing: its whole limit is said for it, so the server leaves the key alone', async () => {
    // The pure rule.
    const own = { used: 7, waiting: 2 };
    assert.deepEqual(serverUse(own, { tradingOn: false, now: NOW }), { used: 7, waiting: 2, whole: false });
    assert.deepEqual(serverUse(own, { tradingOn: true, now: NOW }), { used: SERVER_WHOLE, waiting: 2, whole: true });
    assert.deepEqual(serverUse(own, { tradingOn: true, beside: ['torn-bids'], besideAt: NOW - 30 * SEC, now: NOW }), { used: 7, waiting: 2, whole: false }, 'one that reports is counted from its own words');
    assert.equal(serverUse(own, { tradingOn: true, beside: ['torn-bids'], besideAt: NOW - SERVER_BESIDE_FRESH_MS, now: NOW }).whole, true, 'believed for two minutes, no longer');
    assert.equal(serverUse(own, { tradingOn: true, beside: ['something-else'], besideAt: NOW, now: NOW }).whole, true);
    assert.deepEqual(serverUse(null, { tradingOn: true, now: NOW }), { used: SERVER_WHOLE, waiting: 0, whole: true });

    // The exchange: said from the very first message on, before anything the server answered is known.
    const r = rig({ answer: okAnswer({ beside: [] }) });
    r.trading = true;
    r.link.saveConfig(ADDRESS, PASS);
    await r.tick();
    assert.equal(r.syncs()[0].body.used, SERVER_WHOLE);
    assert.equal(r.link.status().whole, true);
    assert.match(serverLines({ ...r.link.status(), on: true }, r.t).now, /Torn Trading is on here/);
    // The server says Torn Trading reports from this PC too (a release that learned to): Torn Archive says its own again.
    r.answer = okAnswer({ beside: ['torn-bids', 'NOT A NAME', 5] });
    await r.tick(SERVER_SYNC_MS);
    assert.equal(r.syncs()[1].body.used, SERVER_WHOLE, 'not before the server said so');
    assert.deepEqual(r.link.status().beside, ['torn-bids']);
    await r.tick(SERVER_SYNC_MS);
    assert.equal(r.syncs()[2].body.used, 7);
    assert.equal(r.link.status().whole, false);
    assert.doesNotMatch(serverLines({ ...r.link.status(), on: true }, r.t).now, /Torn Trading is on here/);
    // Torn Trading closed: its own use, whatever the server last said.
    r.answer = okAnswer({ beside: [] });
    r.trading = false;
    await r.tick(SERVER_SYNC_MS);
    assert.equal(r.syncs()[3].body.used, 7);
});

// ---- what this PC asked, told to the server -----------------------------------------------------------------------------

test('the counts in the message: tags and whole numbers only, 60 tags at most, none over 5,000; anything else is not sent', () => {
    const body = serverBody({ ver: '1.2.0', pieces: PIECES, now: NOW, calls: { 't.inventory': 4, 'w.sets': 12.9, 'r.w.429': 1, 'w.big': 99999, 'x.junk': 3, 'W.Sets': 2, 't.zero': 0, 't.text': 'many' } });
    assert.deepEqual(body.calls, { 't.inventory': 4, 'w.sets': 12, 'r.w.429': 1, 'w.big': 5000 });
    assert.equal(serverOutgoingOk(body, PIECES), true);
    assert.deepEqual(serverBody({ pieces: PIECES, now: NOW, calls: {} }).calls, {}, 'on, and nothing asked');
    assert.equal('calls' in serverBody({ pieces: PIECES, now: NOW }), false, 'not said with this message');
    for (const bad of [{ 'x.junk': 1 }, { 't.inventory': 0 }, { 't.inventory': 1.5 }, { 't.inventory': 5001 }, { 't.inventory': 'Lion Plushie' }, ['t.inventory'], 'text']) {
        assert.equal(serverOutgoingOk({ ...body, calls: bad }, PIECES), false, JSON.stringify(bad));
    }
});

test('the counts go with the first page of an exchange and come off only when the server answered', async () => {
    const r = rig({ answer: okAnswer() });
    r.link.saveConfig(ADDRESS, PASS);
    const add = (counts) => {
        const pending = {};
        for (const [tag, n] of Object.entries(counts)) for (let i = 0; i < n; i += 1) usageAdd(pending, tag, r.t);
        r.link.d.save(SERVER_CALLS_KEY, usageCallsAdd(r.link.d.load(SERVER_CALLS_KEY), pending, r.t));
    };
    add({ 't.inventory': 2, 'w.sets': 3, 'r.w.ok': 3 });
    assert.equal(await r.tick(), true);
    assert.deepEqual(r.syncs()[0].body.calls, { 't.inventory': 2, 'w.sets': 3, 'r.w.ok': 3 });
    assert.deepEqual(r.link.d.load(SERVER_CALLS_KEY), { since: null, n: {} }, 'answered: taken off');
    assert.equal(r.link.status().callsOut, 8);

    // Nothing asked since: said as an empty list, so the server counts the minute as on.
    assert.equal(await r.tick(SERVER_SYNC_MS), true);
    assert.deepEqual(r.syncs()[1].body.calls, {});

    // The server does not answer: the counts wait, and go with the next exchange that is answered - once.
    add({ 't.sets': 5 });
    r.answer = (call) => (call.url.endsWith('/state') ? { status: 200, body: { apps: true, now: r.t } } : { status: 500, body: null });
    assert.equal(await r.tick(SERVER_SYNC_MS), true);
    assert.deepEqual(r.syncs()[2].body.calls, { 't.sets': 5 });
    assert.deepEqual(r.link.d.load(SERVER_CALLS_KEY).n, { 't.sets': 5 }, 'not answered: kept');
    add({ 't.sets': 1 });
    r.answer = okAnswer();
    assert.equal(await r.tick(SERVER_SYNC_MS), true);
    assert.deepEqual(r.syncs()[3].body.calls, { 't.sets': 6 });
    assert.deepEqual(r.link.d.load(SERVER_CALLS_KEY).n, {});
    assert.equal(r.link.status().callsOut, 14);

    // The server switched off: nothing waits for another one.
    add({ 't.sets': 2 });
    r.link.forget();
    assert.equal(r.link.d.load(SERVER_CALLS_KEY), null);
});

// ---- nothing typed: the server built into the copy ------------------------------------------------------------------------

const CLAIM = 'TornArchiveSameAddress0002000001';

test('what Torn Archive says instead of a password: its fixed words and your Torn id, in the shape the server\'s door takes', () => {
    assert.equal(serverClaim('2000001'), CLAIM);
    assert.equal(serverClaim(2000001), CLAIM);
    assert.equal(serverPassOk(CLAIM), true);
    for (const bad of ['', null, undefined, 0, '0', 'abc', '12 3', '12345678901']) assert.equal(serverClaim(bad), null, String(bad));
});

test('nothing typed: the built-in server is asked as whoever Torn says you are - and a PC it does not serve is told nothing, and asked again later each time', async () => {
    const r = rig({ answer: () => ({ status: 404, body: null }) });
    r.link.d.home = ADDRESS;
    r.link.d.getId = () => r.id || '';
    // Torn has not said who you are: nothing is sent.
    assert.equal(r.link.config(), null);
    assert.equal(await r.tick(), false);
    assert.equal(r.sent.length, 0);
    assert.equal(serverLines(r.link.status(), r.t).level, 'idle');
    assert.equal(r.link.status().builtIn, true);

    r.id = '2000001';
    assert.equal(await r.tick(), true);
    assert.deepEqual(r.sent.map((c) => [c.method, c.url, c.headers.Authorization]), [['GET', ADDRESS + '/state', 'Bearer ' + CLAIM]]);
    assert.equal(r.syncs().length, 0, 'turned away at the question: nothing was told');
    let st = r.link.status();
    assert.equal(st.why, 'address');
    assert.equal(st.address, null, 'the built-in address is not shown');
    assert.equal(r.link.on(), false, 'its requests are not counted for a server that does not serve it');
    const lines = serverLines(st, r.t);
    assert.equal(lines.level, 'alone');
    assert.equal(lines.on, false);
    assert.match(lines.now, /^Working alone\./);
    assert.ok(!JSON.stringify(st).includes(ADDRESS));

    // Asked again after 5 minutes, then 15, then an hour, then every 6 hours.
    for (const wait of SERVER_ADDRESS_RETRY_MS) {
        const n = r.sent.length;
        assert.equal(await r.tick(wait - 1000), false, 'not before ' + wait / 60000 + ' min');
        assert.equal(await r.tick(1000), true);
        assert.equal(r.sent.length, n + 1);
    }
    const n = r.sent.length;
    assert.equal(await r.tick(SERVER_ADDRESS_RETRY_MS[3] - 1000), false);
    // Torn Trading came on, or the page was opened again: asked now.
    r.link.wake();
    assert.equal(await r.tick(), true);
    assert.equal(r.sent.length, n + 1);

    // The server knows this PC now: connected, with nothing typed and nothing shown.
    r.answer = okAnswer();
    r.link.wake();
    assert.equal(await r.tick(MIN), true);
    st = r.link.status();
    assert.equal(st.on && st.own && st.error === null, true);
    assert.equal(st.address, null);
    assert.equal(r.link.on(), true);
    assert.equal(r.syncs()[0].headers.Authorization, 'Bearer ' + CLAIM);
    assert.equal(serverLines(st, r.t).level, 'ok');
    assert.equal(r.store.has(SERVER_CONFIG_KEY), false, 'nothing was saved as typed');

    // An address and password typed in an older copy go first.
    r.link.saveConfig(ADDRESS, PASS);
    assert.equal(await r.tick(MIN), true);
    assert.equal(r.sent[r.sent.length - 1].headers.Authorization, 'Bearer ' + PASS);
    assert.equal(r.link.status().own, false);
});

const WORLD_FILE = resolve(HERE, '..', '..', 'server', 'test', 'server-world.js');
const serverWorld = existsSync(WORLD_FILE) ? await import(pathToFileURL(WORLD_FILE).href) : null;
const skipWorld = serverWorld ? false : 'the server folder is not beside this one';

test('against the server\'s own door: Torn Archive is let in on the PC where your Torn Trading runs, with nothing typed - and nowhere else', { skip: skipWorld }, async () => {
    const { newWorld, KEY_ABE, KEY_VINCENT, WHO } = serverWorld;
    const word = (key) => createHash('sha256').update('torn-shared-server:1:' + key, 'utf8').digest('hex');
    const HOME = 'aaaaaaaaaaaaaaaa';
    const ELSEWHERE = 'bbbbbbbbbbbbbbbb';
    const BIDS = { app: 'torn-bids', ver: '3.26.2', used: 5, sellers: [11] };
    const world = newWorld();
    // Torn says whose each key is; then this person's Torn Trading checks in from home.
    await world.host.enter(word(KEY_VINCENT), 'POST', '/sync', BIDS, ELSEWHERE);
    await world.run(world.t + 60000);
    let from = ELSEWHERE;
    const answer = async (call) => {
        const out = await world.host.enter(call.headers.Authorization.replace('Bearer ', ''), call.method, new URL(call.url).pathname, call.body, from);
        return out ? { status: out.status, body: out.body } : { status: 404, body: null };
    };
    const r = rig({ answer, want: { sellers: [501], looking: [501], worth: Object.fromEntries(PIECES.map((id) => [id, 1000])) }, use: { used: 31, waiting: 0 }, version: '1.2.0' });
    r.link.d.home = ADDRESS;
    r.link.d.getId = () => String(WHO[KEY_ABE].id);

    // Their Torn Trading has never been seen: not served.
    assert.equal(await r.tick(), true);
    assert.equal(r.link.status().why, 'address');
    // It checks in from home; Torn Archive, on another PC, is still not served.
    assert.equal((await world.host.enter(word(KEY_ABE), 'POST', '/sync', BIDS, HOME)).status, 200);
    r.link.wake();
    assert.equal(await r.tick(MIN), true);
    assert.equal(r.link.status().why, 'address');
    // On the same PC: let in, as that person, and its Torn use is counted with Torn Trading's.
    from = HOME;
    r.link.wake();
    assert.equal(await r.tick(MIN), true);
    const st = r.link.status();
    assert.equal(st.error, null);
    assert.deepEqual(st.you, WHO[KEY_ABE]);
    assert.ok(st.need >= 31 + 5, 'the server leaves room for both apps: ' + st.need);
    assert.deepEqual(st.beside, ['torn-bids']);
    assert.equal(serverLines(st, r.t).level, 'ok');
});
