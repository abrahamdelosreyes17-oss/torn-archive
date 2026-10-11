// The engine, run for the first time against something that answers: the real four clients, the real engine and
// view, and a made-up Torn and TornW3B (test/fake-torn.js) behind the clients' fetch. Time is a fake clock: the
// clients' own rate windows and waits (Date.now, setTimeout) run on it too, so an hour passes in a second.
// Nothing here reaches the network.

import test from 'node:test';
import assert from 'node:assert/strict';

import { makeFakeTorn, FAKE_KEYS } from './fake-torn.js';
import { makeEngine, READ_EVERY, LISTINGS_PER_HOUR } from '../src/engine/engine.js';
import { ENGINE_PARTS } from '../src/engine/state.js';
import { TornApiClient } from '../src/api/client.js';
import { LedgerClient } from '../src/api/ledger.js';
import { W3bClient, W3B_LISTING_PER_MINUTE } from '../src/api/w3b.js';
import { Tw3bOwnClient } from '../src/api/tw3b-own.js';
import { archiveSettings } from '../src/core/settings.js';
import { SETS } from '../src/core/sets.js';
import { ALL_PIECE_IDS } from '../src/core/view.js';

const T0 = Date.UTC(2026, 9, 10, 12, 0, 0);
const SEC = 1000;
const MIN = 60000;
const HOUR = 3600000;
const DAY = 86400000;
/** main.js steps the engine every five seconds. */
const STEP_MS = 5000;

// ---- a clock the test moves ---------------------------------------------------------------------------------------

const REAL = { now: Date.now, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };

/** Date.now and setTimeout on a clock that only moves when the test says so. setImmediate stays real: it lets promises settle. */
function fakeClock(start) {
    let t = start;
    let seq = 0;
    const timers = new Map();
    Date.now = () => t;
    globalThis.setTimeout = (fn, ms = 0, ...args) => { const id = ++seq; timers.set(id, { id, at: t + Math.max(0, Number(ms) || 0), fn, args }); return id; };
    globalThis.clearTimeout = (id) => { timers.delete(id); };
    const settle = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setImmediate(r)); };
    async function advance(ms) {
        const end = t + ms;
        await settle();
        for (;;) {
            let next = null;
            for (const x of timers.values()) if (x.at <= end && (!next || x.at < next.at || (x.at === next.at && x.id < next.id))) next = x;
            if (!next) break;
            timers.delete(next.id);
            t = Math.max(t, next.at);
            next.fn(...next.args);
            await settle();
        }
        t = end;
        await settle();
    }
    function restore() {
        Date.now = REAL.now;
        globalThis.setTimeout = REAL.setTimeout;
        globalThis.clearTimeout = REAL.clearTimeout;
    }
    return { advance, settle, restore, waiting: () => timers.size };
}

// ---- the engine on its stand-ins ------------------------------------------------------------------------------------

/**
 * One made-up player's Archive: the fake world, the four real clients on its fetch, storage in memory (as text, the
 * way real storage keeps it), and an engine. `restart()` makes new clients and a new engine from what was stored.
 */
function rig(t, { settings = {}, keys = {}, paused = false, world = null, tornPerMinute = 85 } = {}) {
    const clock = fakeClock(T0);
    t.after(() => clock.restore());
    const fake = makeFakeTorn({ now: () => Date.now() });
    if (world) world(fake.world, fake);
    const store = new Map();
    const urls = [];
    const r = {
        clock, fake, store, urls, world: fake.world,
        paused,
        keys: { limited: FAKE_KEYS.limited, full: FAKE_KEYS.full, w3b: FAKE_KEYS.w3b, ...keys },
        settings: archiveSettings({ open: true, pct: 101, least: 2, targetMode: 'number', target: 4, readMin: 1, ...settings }),
        said: [], failed: [], notices: [], changed: 0, saved: [],
        engine: null, clients: null, onUrl: null,
    };
    const fetchImpl = (url, init) => { urls.push(String(url)); if (r.onUrl) r.onUrl(String(url)); return fake.fetch(url, init); };

    r.restart = () => {
        // Torn's limit is one window for both of its clients, as in main.js.
        const win = [];
        const shared = {
            fetchImpl, maxPerMinute: tornPerMinute, isPaused: () => r.paused,
            loadWindow: () => win, addToWindow: (at) => { win.push(at); while (win.length && at - win[0] > 2 * MIN) win.shift(); },
            onFailed: (x) => r.failed.push({ client: 'torn', path: x.path, error: String(x.error && x.error.message) }),
        };
        const torn = new TornApiClient({ getKey: () => r.keys.limited, ...shared });
        const full = new LedgerClient({ getKey: () => r.keys.full, ...shared });
        const w3b = new W3bClient({ fetchImpl, isPaused: () => r.paused, onFailed: (x) => r.failed.push({ client: 'w3b', path: x.path, error: String(x.error && x.error.message) }) });
        const own = new Tw3bOwnClient({ getKey: () => r.keys.w3b, getUser: () => (r.engine ? r.engine.state.self.id : ''), send: fetchImpl, isPaused: () => r.paused });
        r.clients = { torn, full, w3b, own };
        r.engine = makeEngine({
            now: () => Date.now(),
            load: (part) => (store.has(part) ? JSON.parse(store.get(part)) : null),
            save: (part, value) => { r.saved.push(part); store.set(part, JSON.stringify(value)); },
            settings: () => r.settings,
            torn, full, w3b, own,
            hasKey: (kind) => !!r.keys[kind],
            paused: () => r.paused,
            say: (kind, what, detail) => r.said.push({ kind, what, detail }),
            changed: () => { r.changed += 1; },
            notify: (n) => r.notices.push(n),
            // As main.js: a read that came back steps the engine again.
            kick: () => { r.engine.step(); },
        });
        return r.engine;
    };
    r.restart();

    /** Time passes, the engine stepped every five seconds as main.js does. */
    r.go = async (ms) => {
        const end = Date.now() + ms;
        while (Date.now() < end) { r.engine.step(); await clock.advance(Math.min(STEP_MS, end - Date.now())); }
    };
    /** The view as of now (the engine keeps one for five seconds unless something changed). */
    r.view = () => { r.engine.settingsChanged(); return r.engine.view(); };
    /** Until the first inventory read and every price is in: about five minutes of the fake clock. */
    r.ready = async () => { await r.go(6 * MIN); assert.equal(r.view().ready, true, 'the view is ready after six minutes'); return r.view(); };
    /** Time passes with nobody stepping: an answer on its way comes in. */
    r.wait = (ms = 1000) => clock.advance(ms);
    /** A setting changed on the Settings page. */
    r.set = (patch) => { r.settings = archiveSettings({ ...r.settings, ...patch }); r.engine.settingsChanged(); };
    r.callsTo = (host, test = () => true) => fake.calls.filter((c) => c.host === host && test(c));
    r.torn = (path, test = () => true) => fake.calls.filter((c) => c.host === 'api.torn.com' && (path instanceof RegExp ? path.test(c.path) : c.path === path) && test(c));
    r.w3b = (path, test = () => true) => fake.calls.filter((c) => c.host === 'weav3r.dev' && (path instanceof RegExp ? path.test(c.path) : c.path === path) && test(c));
    return r;
}

// ---- the world's own sums, worked out apart from src/ ---------------------------------------------------------------

const mvOf = (w, id) => w.items[id].mv;
const payOf = (w, id, pct = 101) => Math.round(mvOf(w, id) * pct / 100);
const setOfPiece = (w, id) => w.sets.find((s) => s.pieces.includes(Number(id)));
const setMv = (w, set) => set.pieces.reduce((s, id) => s + mvOf(w, id), 0);
const wallOf = (w) => {
    const by = new Map();
    for (const l of w.pointsMarket) by.set(l.cost, (by.get(l.cost) || 0) + l.quantity);
    const levels = [...by].sort((a, b) => a[0] - b[0]);
    let ahead = 0;
    for (let i = 0; i < levels.length; i++) { if (i > 0 && levels[i][1] >= ahead * 3) return levels[i][0]; ahead += levels[i][1]; }
    return null;
};
/** The most a unit may cost and still leave the least profit: the set's value at the points price, shared by market value. */
const worthOf = (w, id, price, least = 2) => { const set = setOfPiece(w, id); return Math.floor((set.points * price * mvOf(w, id) / setMv(w, set)) / (1 + least / 100)); };
const piece = (v, id) => v.pieces.find((p) => Number(p.id) === Number(id));
/** The most requests in any stretch of `ms`, among calls sorted by time. */
function busiest(calls, ms) {
    const ts = calls.map((c) => c.t).sort((a, b) => a - b);
    let most = 0;
    let lo = 0;
    for (let hi = 0; hi < ts.length; hi++) { while (ts[hi] - ts[lo] >= ms) lo += 1; most = Math.max(most, hi - lo + 1); }
    return most;
}
const FULL_KEY_PATHS = /^\/v2\/(key\/info|user\/log|user\/trades|user\/\d+\/trade)$/;

// ---- the fake itself ------------------------------------------------------------------------------------------------

test('the fake: the same 24 pieces as the Archive, made-up keys, Torn\'s own refusals', async (t) => {
    const clock = fakeClock(T0);
    t.after(() => clock.restore());
    const fake = makeFakeTorn({ now: () => Date.now() });
    const w = fake.world;
    assert.deepEqual(w.sets.map((s) => [s.key, s.pieces.map((id) => [id, w.items[id].name])]), SETS.map((s) => [s.key, s.pieces.map((p) => [p.id, p.name])]));
    for (const k of Object.values(FAKE_KEYS)) assert.match(k, /^FAKEKEY[A-Z0-9]{9}$/);
    assert.equal(wallOf(w), 30500);

    const get = async (url, init) => { const res = await fake.fetch(url, init); return { status: res.status, body: await res.json(), res }; };
    // A missing or a wrong key: Torn's own error shape, on HTTP 200.
    assert.deepEqual((await get('https://api.torn.com/v2/user/money')).body, { error: { code: 2, error: 'Incorrect key' } });
    assert.deepEqual((await get('https://api.torn.com/v2/user/money?key=NOTAKEYATALL0000')).body, { error: { code: 2, error: 'Incorrect key' } });
    // The log is the Full key's; a Limited key is told so.
    assert.equal((await get('https://api.torn.com/v2/user/log?key=' + FAKE_KEYS.limited)).body.error.code, 16);
    assert.equal((await get('https://api.torn.com/v2/user/log?key=' + FAKE_KEYS.full)).body.log.length, 9);
    // The inventory wants a category.
    assert.equal((await get('https://api.torn.com/v2/user/inventory?key=' + FAKE_KEYS.limited)).body.error.code, 21);
    assert.equal((await get('https://api.torn.com/v2/user/inventory?cat=Flower&key=' + FAKE_KEYS.limited)).body.inventory.items.length, 11);
    // An address nobody answers: 404, and written down.
    const lost = await get('https://api.torn.com/v2/user/nothing?key=' + FAKE_KEYS.limited);
    assert.equal(lost.status, 404);
    assert.deepEqual(fake.unknown.map((u) => u.path), ['/v2/user/nothing']);
    // TornW3B: the price list is written only with the registered key in the X-API-Key header.
    const put = { method: 'PUT', body: { items: [{ itemID: 186, pricingType: 'fixed', pricingValue: 909 }] } };
    assert.equal((await get('https://weav3r.dev/api/pricelist/' + w.you.id, put)).status, 401);
    assert.equal((await get('https://weav3r.dev/api/pricelist/' + w.you.id, { ...put, headers: { 'X-API-Key': FAKE_KEYS.w3b } })).body.inserted, 1);
    assert.equal((await get('https://weav3r.dev/api/trades/' + w.you.id)).status, 401);
    // Both ways of reading an answer's header.
    const res = (await get('https://weav3r.dev/api/marketplace')).res;
    assert.equal(res.header('Content-Type'), 'application/json');
    assert.equal(res.headers.get('content-type'), 'application/json');
    // No call keeps a key's value: only which key it was.
    assert.ok(!JSON.stringify(fake.calls).includes('FAKEKEY'));
    assert.deepEqual(fake.calls.slice(0, 3).map((c) => c.key), [null, 'unknown', 'limited']);
    assert.deepEqual(fake.leaks, []);
    // The eleventh full listing in a minute is refused by TornW3B itself, with a Retry-After.
    let last = null;
    for (let i = 0; i < 11; i++) last = await get('https://weav3r.dev/api/marketplace/' + w.pieceIds[i]);
    assert.equal(last.status, 429);
    assert.ok(Number(last.res.header('retry-after')) > 0);
    assert.equal(fake.refused.length, 1);
});


// ---- the engine -------------------------------------------------------------------------------------------------------

const LISTING = /^\/api\/marketplace\/\d+$/;

test('first run: the three keys are taken, every piece is priced, a set pays what the cheapest listings leave', async (t) => {
    const r = rig(t);
    const v = await r.ready();
    const keys = r.engine.keys();
    for (const kind of ['limited', 'full', 'w3b']) assert.deepEqual([kind, keys[kind].ok, keys[kind].error], [kind, true, '']);
    assert.equal(r.engine.state.self.id, String(r.world.you.id));
    assert.ok(v.top.points > 0 && v.top.points <= wallOf(r.world));
    assert.equal(v.sets.length, 2);
    for (const s of v.sets) {
        assert.equal(s.priced, true, s.key + ' is priced');
        assert.equal(s.value, s.points * v.top.points);
        assert.equal(s.fresh, s.pieces.reduce((sum, p) => sum + p.low.price, 0));
        assert.equal(s.pays, s.value - s.fresh);
        // Nothing dearer than the Item Market's cheapest is ever the cheapest.
        for (const p of s.pieces) assert.ok(p.low.price <= Math.round(mvOf(r.world, p.id) * 1.03), p.name);
    }
    assert.deepEqual(v.dash.pays.map((p) => [p.key, p.pays, p.priced]), v.sets.map((s) => [s.key, s.pays, true]));
    assert.deepEqual(r.fake.unknown, []);
    assert.deepEqual(r.fake.leaks, []);
    // Nothing was refused on the way: the inventory is asked by category, the way Torn wants it.
    assert.deepEqual(r.failed, []);
    // (It is asked again every five minutes, and the first run takes about that long: each time the same two.)
    assert.deepEqual([...new Set(r.torn('/v2/user/inventory').map((c) => c.query.cat))].sort(), ['Flower', 'Plushie']);
});

test('the inventory: a category Torn does not know falls back to the whole inventory, and a refusal of that is an error', async (t) => {
    const r = rig(t, { world: (w, fake) => fake.failNext(/user\/inventory/, { status: 200, body: { error: { code: 21, error: 'Incorrect category' } } }, 1000) });
    await r.go(6 * MIN);
    assert.equal(r.view().ready, false, 'never an empty inventory taken as "you hold nothing"');
    assert.ok(r.torn('/v2/user/inventory').some((c) => c.query.cat == null), 'the whole inventory was asked for');
    assert.ok(r.said.some((x) => /inventory/.test(x.what)));
});

test('before the prices are in, a set is "not priced yet" - not "no price"', async (t) => {
    // Every Item Market answer is held back: the inventory and the points come in, the pieces' listings do not.
    const r = rig(t, { world: (w, fake) => fake.failNext(/itemmarket|api\/marketplace\/\d+$/, { status: 500, body: {} }, 1000) });
    await r.go(2 * MIN);
    const v = r.view();
    assert.equal(v.ready, true);
    assert.deepEqual(v.dash.pays.map((p) => [p.pays, p.priced]), [[null, false], [null, false]]);
});

test('a tab out of view ticks once a minute: every piece is still priced within two ticks', async (t) => {
    const r = rig(t);
    r.engine.step();
    await r.clock.advance(MIN);
    r.engine.step();
    await r.clock.advance(MIN);
    const v = r.view();
    assert.equal(v.ready, true);
    assert.deepEqual(v.sets.map((s) => s.priced), [true, true]);
    assert.equal(r.torn(/itemmarket$/).length >= 24, true);
});

test('the pace over two hours: under every limit, TornW3B never has to refuse, each key only where it belongs', async (t) => {
    const r = rig(t);
    await r.go(2 * HOUR);
    const torn = r.callsTo('api.torn.com');
    const listings = r.w3b(LISTING);
    assert.ok(busiest(torn, MIN) <= 85, 'Torn: ' + busiest(torn, MIN) + ' in a minute');
    assert.ok(busiest(listings, MIN) <= W3B_LISTING_PER_MINUTE, 'full listings: ' + busiest(listings, MIN) + ' in a minute');
    assert.ok(busiest(listings, HOUR) <= LISTINGS_PER_HOUR, 'full listings: ' + busiest(listings, HOUR) + ' in an hour');
    const ts = listings.map((c) => c.t).sort((a, b) => a - b);
    for (let k = 1; k < ts.length; k++) assert.ok(ts[k] - ts[k - 1] >= 7 * SEC, 'two full listings ' + (ts[k] - ts[k - 1]) + ' ms apart');
    assert.deepEqual(r.fake.refused, []);
    assert.deepEqual(r.fake.leaks, []);
    assert.deepEqual(r.fake.unknown, []);
    // The Full key: your key, your log, your trades - and nothing else. A Torn key never goes to TornW3B.
    for (const c of torn) if (c.key === 'full') assert.match(c.path, FULL_KEY_PATHS);
    for (const c of r.callsTo('weav3r.dev')) assert.ok(c.key === null || c.key === 'w3b', c.path + ' carried the ' + c.key + ' key');
    assert.ok(!r.urls.some((u) => u.startsWith('https://weav3r.dev/') && /FAKEKEY/.test(u)), 'a key in a TornW3B address');
});

test('while Torn Trading has the turn nothing is asked; after it, the reads start again', async (t) => {
    const r = rig(t, { paused: true });
    await r.go(5 * MIN);
    assert.equal(r.fake.calls.length, 0);
    r.paused = false;
    await r.go(6 * MIN);
    assert.equal(r.view().ready, true);
});

test('no Limited key: Torn is asked nothing', async (t) => {
    const r = rig(t, { keys: { limited: '', full: '' } });
    await r.go(5 * MIN);
    assert.equal(r.callsTo('api.torn.com').length, 0);
    assert.equal(r.view().ready, false);
});

test('a key Torn refuses is said on its box and left alone, until another is pasted', async (t) => {
    const r = rig(t, { keys: { limited: 'NOTAKEYATALL0000' } });
    await r.go(10 * MIN);
    assert.equal(r.engine.keys().limited.ok, false);
    assert.ok(r.engine.keys().limited.error);
    assert.equal(r.callsTo('api.torn.com', (c) => c.key === 'unknown').length, 1);
    r.keys.limited = FAKE_KEYS.limited;
    r.engine.keyChanged('limited');
    await r.go(6 * MIN);
    assert.deepEqual([r.engine.keys().limited.ok, r.engine.keys().limited.error], [true, '']);
    assert.equal(r.view().ready, true);
});

test('closed and opened again: it starts from what was stored, and asks for nothing twice', async (t) => {
    const r = rig(t);
    const before = await r.ready();
    const asked = r.fake.calls.length;
    const logRows = r.torn('/v2/user/log').length;
    r.restart();
    const v = r.view();
    assert.equal(r.fake.calls.length, asked);
    assert.equal(v.ready, true);
    assert.deepEqual(v.sets.map((s) => [s.key, s.full, s.pays]), before.sets.map((s) => [s.key, s.full, s.pays]));
    await r.go(MIN);
    // The history is not read from the start again: one look at the log at most (a request for each sort of
    // row), no finished trade read in full.
    assert.ok(r.torn('/v2/user/log').length - logRows <= 3);
    assert.equal(r.fake.calls.slice(asked).filter((c) => /\/user\/600\d\/trade$/.test(c.path)).length, 0);
});

test('a buy on a bazaar: the stock goes up by what Torn\'s log says', async (t) => {
    const r = rig(t);
    const before = piece(await r.ready(), 186).held;
    r.fake.buy(3000005, 186, 2);
    await r.go(5 * MIN);
    assert.equal(piece(r.view(), 186).held, before + 2);
    assert.ok(r.engine.state.ledger.rows.some((x) => Number(x.itemId) === 186 && x.side === 'buy' && x.qty === 2));
});
// ---- the shared server ------------------------------------------------------------------------------------------------

const BAZAAR_READ = (c) => c.query.selections === 'bazaar';

test('beside the shared server: what it is told names pieces and bazaars only, and a bazaar it read from Torn is not asked for again here', async (t) => {
    const r = rig(t);
    await r.ready();
    const me = Number(r.world.you.id);
    const want = r.engine.serverWant();
    assert.deepEqual(Object.keys(want).sort(), ['bought', 'dir', 'looking', 'need', 'sellers', 'worth']);
    assert.deepEqual(want.need, r.view().pieces.filter((p) => p.need > 0).map((p) => Number(p.id)), 'the pieces still to buy');
    assert.ok(want.sellers.length > 0 && want.sellers.every((id) => Number.isInteger(id) && id > 0 && id !== me), 'bazaars that sell a piece, never your own');
    assert.ok(want.looking.length > 0 && want.looking.every((id) => Number.isInteger(id) && id !== me));
    assert.equal(Object.keys(want.worth).length, 24);
    for (const [id, w] of Object.entries(want.worth)) assert.ok(setOfPiece(r.world, id) && Number.isInteger(w) && w > 0, 'piece ' + id);
    assert.ok(want.dir.length > 0 && want.dir.every(([id, at]) => setOfPiece(r.world, id) && at >= T0));
    assert.deepEqual(want.bought, []);
    assert.deepEqual(r.engine.serverMark(), { seq: 0, seenAt: 0 });
    assert.ok(r.torn('/v2/user', BAZAAR_READ).length > 0, 'alone, the bazaars on the list are read here');

    // The server reads every one of them from Torn, and says so twice a minute. One shelf differs from TornW3B's.
    const v0 = r.view();
    const top = v0.pieces.map((p) => ({ p, o: p.offers[0] })).find((x) => x.o && x.o.src !== 'market' && want.looking.includes(Number(x.o.whoId)));
    assert.ok(top, 'a piece whose cheapest shelf is a bazaar on the list');
    const first = Number(top.o.whoId);
    const seller = r.world.sellers.find((s) => Number(s.id) === first);
    const row = seller.bazaar.find((x) => Number(x.id) === Number(top.p.id));
    const theirs = row.price - 7;
    let seq = 0;
    const answer = () => {
        seq += 1;
        const now = Date.now();
        return {
            grant: { at: now, need: 30, serverShare: 50, serverTimes: [] }, now, seq, state: 'reading', seen: [], dir: [], turn: { of: 1, me: 0 },
            reads: [...new Set([first, ...r.engine.serverWant().looking])].map((id) => ({ id, at: now, items: id === first ? [{ id: row.id, price: theirs, qty: row.qty }] : (r.world.sellers.find((s) => Number(s.id) === id) || { bazaar: [] }).bazaar.map((x) => ({ id: x.id, price: x.price, qty: x.qty })) })),
        };
    };
    const before = r.torn('/v2/user', BAZAAR_READ).length;
    for (let k = 0; k < 8; k += 1) { r.engine.serverTook(answer(), Date.now()); await r.go(30 * SEC); }
    assert.equal(r.torn('/v2/user', BAZAAR_READ).length, before, 'four minutes, and not one bazaar asked of Torn here');
    assert.equal(r.engine.serverMark().seq, seq);
    const offer = piece(r.view(), row.id).offers.find((o) => Number(o.whoId) === first);
    assert.equal(offer.price, theirs, 'the price is the one the server read from Torn');
    assert.ok(r.saved.includes('server'), 'kept, so a restart begins from it');

    // The server falls silent: within the read time the bazaars are read here again, and the newer read wins.
    await r.go(4 * MIN);
    assert.ok(r.torn('/v2/user', BAZAAR_READ).length > before, 'alone again');
    assert.equal(piece(r.view(), row.id).offers.find((o) => Number(o.whoId) === first).price, row.price);

    // Forgotten (its address or password changed): nothing of it is left.
    r.engine.serverTook(answer(), Date.now());
    r.engine.serverForget();
    assert.deepEqual(r.engine.state.server.shops, {});
    assert.deepEqual(r.engine.serverMark(), { seq: 0, seenAt: 0 });
});

test('beside the shared server: the points market and the Item Market it read are taken, and not asked of Torn again here', async (t) => {
    const r = rig(t);
    await r.ready();
    const POINTS = '/v2/market/pointsmarket';
    const MARKET = /^\/v2\/market\/\d+\/itemmarket$/;
    assert.ok(r.torn(POINTS).length > 0 && r.torn(MARKET).length > 0, 'alone, both are read here');
    const ids = r.world.sets.flatMap((s) => s.pieces);
    const one = ids[0];
    const cheap = Math.round(mvOf(r.world, one) * 0.9);
    const answer = () => {
        const now = Date.now();
        return {
            grant: { at: now, need: 30, serverShare: 50, serverTimes: [] }, now, seq: 0, state: 'reading', reads: [], seen: [], dir: [], turn: { of: 1, me: 0 },
            points: { at: now - 4000, rows: [['901', 29000, 500], ['902', 30111, 90000]] },
            market: ids.map((id) => ({ id, at: now - 4000, rows: [[id === one ? cheap : mvOf(r.world, id), 3]] })),
        };
    };
    r.engine.serverTook(answer(), Date.now());
    await r.wait(2000);
    const before = [r.torn(POINTS).length, r.torn(MARKET).length];
    for (let k = 0; k < 8; k += 1) { r.engine.serverTook(answer(), Date.now()); await r.go(30 * SEC); }
    assert.deepEqual([r.torn(POINTS).length, r.torn(MARKET).length], before, 'four minutes, and neither asked of Torn here');
    const pts = r.engine.state.points;
    assert.deepEqual(pts.listings.map((l) => [l.cost, l.qty]), [[29000, 500], [30111, 90000]]);
    assert.ok(Date.now() - pts.at < 40 * SEC, 'as of when the server read it');
    assert.equal(r.view().top.points, 30110, 'a dollar under the first wall of what the server read');
    const row = piece(r.view(), one).offers.find((o) => o.src === 'market');
    assert.deepEqual([row.price, row.qty], [cheap, 3]);
    assert.ok(r.saved.includes('points') && r.saved.includes('offers'));
    // A read older than what is held is not taken.
    const old = answer();
    old.points = { at: old.now - 2 * MIN, rows: [['903', 100, 1]] };
    r.engine.serverTook(old, Date.now());
    assert.equal(r.engine.state.points.listings[0].cost, 29000);
    // The server falls silent: both are read here again.
    await r.go(13 * MIN);
    assert.ok(r.torn(POINTS).length > before[0], 'the points market, alone again');
    assert.ok(r.torn(MARKET).length >= before[1] + ids.length, 'every piece, alone again');
    assert.deepEqual(r.failed, []);
});

// ---- a buy seen on Torn's page --------------------------------------------------------------------------------------

test('no Full key: a buy seen on the page is in the stock at once, once, and Torn\'s own count does not add it again', async (t) => {
    const r = rig(t, { keys: { full: '' } });
    const before = piece(await r.ready(), 186).held;
    r.fake.buy(3000005, 186, 2);
    const seen = { t: Date.now(), id: '186', qty: 2, price: 880, whoId: '3000005' };
    r.engine.note('buy', seen);
    assert.equal(piece(r.view(), 186).held, before + 2, 'at once');
    r.engine.note('buy', seen);
    assert.equal(piece(r.view(), 186).held, before + 2, 'the same buy told twice is one buy');
    await r.go(3 * 60 * MIN);
    assert.equal(piece(r.view(), 186).held, before + 2, 'Torn\'s inventory has it now: not on top of it');
});

test('with a Full key: a buy seen on the page counts at once, and its row in Torn\'s log is not a second buy', async (t) => {
    const r = rig(t);
    const before = piece(await r.ready(), 186).held;
    r.fake.buy(3000005, 186, 2);
    r.engine.note('buy', { t: Date.now(), id: '186', qty: 2, price: 880, whoId: '3000005' });
    assert.equal(piece(r.view(), 186).held, before + 2);
    await r.go(10 * MIN);
    assert.equal(piece(r.view(), 186).held, before + 2);
    await r.go(3 * 60 * MIN);
    assert.equal(piece(r.view(), 186).held, before + 2);
});

test('with a Full key: in the minutes after the log brings a buy seen on the page, it is still one buy (the owner, 2026-10-11: "the need and everything is fake")', async (t) => {
    const r = rig(t);
    const before = piece(await r.ready(), 186).held;
    r.fake.buy(3000005, 186, 2);
    r.engine.note('buy', { t: Date.now(), id: '186', qty: 2, price: 880, whoId: '3000005' });
    const shown = [];
    for (let k = 0; k < 16; k++) { await r.go(15000); shown.push(piece(r.view(), 186).held); }
    assert.deepEqual(shown.filter((n) => n !== before + 2), [], 'every look in the four minutes after the buy shows it once');
});

test('with a Full key: the page saw more than was bought - the log says how many, and the count follows the log at once', async (t) => {
    const r = rig(t);
    const before = piece(await r.ready(), 186).held;
    r.fake.buy(3000005, 186, 2);
    r.engine.note('buy', { t: Date.now(), id: '186', qty: 9, price: 880, whoId: '3000005' });
    assert.equal(piece(r.view(), 186).held, before + 9, 'the page is all there is, for a moment');
    await r.go(40000);
    assert.equal(piece(r.view(), 186).held, before + 2, 'the log has the buy: its number stands');
});

test('a line you bought: off the list at once with no run on; ticked on it, and kept, while a run is on', async (t) => {
    const r = rig(t, { keys: { full: '' }, settings: { target: 40 } });
    await r.ready();
    r.engine.act('makeList');
    const line = r.engine.state.cart.find((l) => !l.im);
    assert.ok(line, 'the list has a bazaar line');
    const held = piece(r.view(), line.id).held;
    r.engine.note('buy', { t: Date.now(), id: String(line.id), qty: line.q, price: line.price, whoId: String(line.whoId) });
    assert.equal(piece(r.view(), line.id).held, held + line.q);
    assert.ok(!r.engine.state.cart.some((l) => l.key === line.key), 'bought whole: the line is gone, without a run and without waiting for a read');

    r.engine.act('makeList');
    const next = r.engine.state.cart.find((l) => !l.im);
    assert.ok(next, 'there is more to buy');
    r.engine.act('run', 'start');
    r.engine.note('buy', { t: Date.now(), id: String(next.id), qty: next.q, price: next.price, whoId: String(next.whoId) });
    assert.equal(r.engine.state.run.took[next.key], next.q, 'the run counted it');
    assert.deepEqual(r.engine.state.cart.filter((l) => l.key === next.key).map((l) => l.q), [next.q], 'and the line stays, taken, until Next');
});

// ---- found on the owner's PC, 2026-10-11 --------------------------------------------------------------------------------

test('a trade opened empty: its pieces go in later and Torn\'s time for it does not move - it shows within a minute, and is told of once', async (t) => {
    const r = rig(t);
    await r.ready();
    const told = r.notices.length;
    const id = String(r.fake.openTrade({ whoId: 4000006, description: 'point trader' }));
    await r.go(2 * MIN);
    assert.equal(r.view().trades.open.some((x) => x.id === id), false, 'nothing in it yet: not shown');
    assert.equal(r.notices.length, told, 'nothing in it yet: not told of');
    const before = r.world.trades.find((x) => String(x.id) === id).modifiedAt;
    r.fake.addToTrade(id, { theirs: [{ id: 384, qty: 340 }, { id: 274, qty: 38 }] });
    assert.equal(r.world.trades.find((x) => String(x.id) === id).modifiedAt, before, 'the stand-in keeps its time, as Torn did');
    await r.go(90 * 1000);
    const shown = r.view().trades.open.find((x) => x.id === id);
    assert.ok(shown, 'the trade shows once its pieces are in');
    assert.equal(shown.units, 378);
    assert.equal(r.notices.filter((n) => n.tradeId === id).length, 1);
    assert.match(r.notices.find((n) => n.tradeId === id).body, /^2 items/);
    // More of the same later, and your money: read again, never told of twice.
    r.fake.addToTrade(id, { theirs: [{ id: 384, qty: 10 }], myMoney: 5 });
    await r.go(90 * 1000);
    const later = r.view().trades.open.find((x) => x.id === id);
    assert.equal(later.units, 388);
    assert.equal(later.myMoney, 5);
    assert.equal(r.notices.filter((n) => n.tradeId === id).length, 1);
    // One request a minute for each open trade, no more.
    const reads = r.torn(new RegExp('^/v2/user/' + id + '/trade$'));
    assert.ok(reads.length >= 3 && reads.length <= 6, String(reads.length));
});

test('your log is asked a few kinds at a time: no request names more than eight, and the buys come in', async (t) => {
    const r = rig(t);
    await r.ready();
    const asked = r.torn('/v2/user/log');
    assert.ok(asked.length > 0);
    for (const c of asked) assert.ok(String(c.query.log).split(',').length <= 8, 'asked for ' + c.query.log);
    assert.ok(new Set(asked.flatMap((c) => String(c.query.log).split(','))).size > r.world.options.logMostKinds, 'more kinds in all than one request may name');
    assert.ok(r.engine.state.log.newest > 0, 'rows came in');
    assert.ok(r.engine.state.ledger.rows.some((x) => x.venue === 'bazaar' && x.side === 'buy'), 'a bazaar buy is in the books');
    const line = r.said.find((s) => s.what === 'Your log, read through');
    assert.ok(line, JSON.stringify(r.said.map((s) => s.what)));
    assert.match(line.detail, /^buys and sales: [1-9]\d* rows · points: \d+ rows · money put away: \d+ rows$/);
});

test('a finished trade gets its receipt by itself once your TornW3B list prices its pieces - and not before', async (t) => {
    const r = rig(t, { settings: { w3bSync: true } });
    await r.ready();
    const id = String(r.fake.openTrade({ whoId: 4000006, theirs: [{ id: 384, qty: 2 }] }));
    await r.go(2 * MIN);
    const made = () => r.w3b(/^\/api\/pricelist\/\d+$/, (c) => c.method === 'POST').length;
    const had = made();
    // The shop is open and the list is kept at your rate in this rig: the piece is priced there.
    r.fake.finishTrade(id, { pay: 2 * payOf(r.world, 384) });
    await r.go(12 * MIN);
    const f = r.view().trades.finished.find((x) => x.id === id);
    assert.ok(f, 'the trade is in the finished list');
    assert.equal(made() - had, 1, 'one receipt, made without a press');
    assert.ok(f.receipt, 'and it shows on the trade');
    await r.go(12 * MIN);
    assert.equal(made() - had, 1, 'never a second one');
});

test('TornW3B refuses your receipts (403): asked again in half an hour, not every minute, and said once', async (t) => {
    const r = rig(t);
    await r.ready();
    const real = r.clients.own.send;
    let refused = 0;
    r.clients.own.send = (url, init) => (/\/api\/trades\/\d+$/.test(String(url)) ? (refused += 1, Promise.resolve({ ok: false, status: 403, json: async () => ({}), text: async () => '{"error":"Forbidden for this key 0123456789abcdefXYZ"}' })) : real(url, init));
    await r.go(95 * MIN);
    assert.ok(refused >= 2 && refused <= 5, 'asked ' + refused + ' times in 95 minutes');
    const lines = r.said.filter((s) => s.what === 'TornW3B: your receipts');
    assert.equal(lines.length, 1);
    assert.match(lines[0].detail, /^TornW3B answered 403\. · it said: \{"error":"Forbidden for this key \[…\]"\}$/);
    assert.equal(r.view().trades.receiptsError, 'TornW3B answered 403.');
    assert.equal(r.view().prices.w3b.error, '', 'your list was read: its panel does not say "not read"');
});

test('"from my cash": the sets a list was made for stay while the list is on hand, whatever your money does', async (t) => {
    const r = rig(t, { settings: { targetMode: 'cash', shareMax: 0 } });
    await r.ready();
    const free = r.view().pieces.map((p) => [p.id, p.target]);
    r.engine.act('makeList');
    assert.ok(r.engine.state.cart.length > 0, 'a list was made');
    const made = r.view().pieces.map((p) => [p.id, p.target]);
    assert.deepEqual(made, free, 'made for the number on screen');
    // Most of the money goes elsewhere (a flip, a mug): with no list the number would fall.
    r.world.money.vault = 0;
    r.world.money.wallet = 200000;
    await r.go(3 * MIN);
    assert.deepEqual(r.view().pieces.map((p) => [p.id, p.target]), made, 'held while the list is on');
    assert.ok(r.saved.includes('plan'));
    // Opened again: still held.
    r.restart();
    await r.go(MIN);
    assert.deepEqual(r.view().pieces.map((p) => [p.id, p.target]), made);
    // The list is cleared: the number is your money's again.
    r.engine.act('clearList');
    await r.go(MIN);
    const after = r.view().pieces.map((p) => [p.id, p.target]);
    assert.ok(after.some(([, n], i) => n < made[i][1]), 'with no list it follows your money');
    // A list made now is made for that.
    r.engine.act('makeList');
    assert.deepEqual(r.view().pieces.map((p) => [p.id, p.target]), after);
});

// ---- the buying list, after the owner's report of 2026-10-11 ("its still stale items, and non existent items") ----------

test('a piece open on "Sold by": every bazaar its table shows is asked of Torn itself, and Read now asks them again', async (t) => {
    const r = rig(t, { keys: { full: '' }, settings: { target: 40 } });
    await r.ready();
    const baz = (x) => x.offers.slice(0, 14).filter((o) => o.src !== 'market').length;
    const p = r.view().pieces.filter((x) => baz(x) > 1).sort((a, b) => baz(b) - baz(a))[0];
    assert.ok(p, 'a piece sold by more than one bazaar');
    const shown = p.offers.slice(0, 14).filter((o) => o.src !== 'market').map((o) => String(o.whoId));
    const asked = (since) => new Set(r.torn('/v2/user', (c) => BAZAAR_READ(c) && c.t >= since).map((c) => String(c.query.id)));
    let since = Date.now();
    r.engine.act('look', String(p.id));
    await r.go(2 * MIN);
    assert.deepEqual(shown.filter((id) => !asked(since).has(id)), [], 'each bazaar of the table was read from Torn');
    const rows = piece(r.view(), p.id).offers.filter((o) => o.src !== 'market' && shown.includes(String(o.whoId)));
    assert.ok(rows.length > 0 && rows.every((o) => o.from === 'torn'), 'and the rows left say so: none is TornW3B\'s copy');
    since = Date.now() + 1;
    await r.wait(1);
    assert.equal(r.engine.act('read'), true, 'the press the hub sends is one the engine knows');
    await r.go(MIN);
    assert.deepEqual(shown.filter((id) => !asked(since).has(id)), [], 'Read now reads them again');
});

test('a run ends: what you took leaves the list once, and its count stands on the next looks', async (t) => {
    const r = rig(t, { keys: { full: '' }, settings: { target: 40 } });
    await r.ready();
    r.engine.act('makeList');
    r.engine.act('run', 'start');
    const stops = r.view().buy.run.stops;
    assert.ok(stops.length > 1, 'more than one stop');
    const first = stops[0].lines[0];
    r.engine.note('buy', { t: Date.now(), id: String(first.id), qty: first.q, price: first.price, whoId: String(first.whoId) });
    for (let i = 0; i < stops.length; i++) r.engine.act('run', 'next');
    assert.equal(r.engine.state.run.done, true);
    assert.deepEqual(r.engine.state.run.took, {});
    assert.equal(r.engine.state.run.sum.got, first.q);
    assert.ok(!r.engine.state.cart.some((l) => l.key === first.key), 'the line bought whole is off the list');
    const left = r.engine.state.cart.reduce((s, l) => s + l.q, 0);
    await r.go(3 * MIN);
    assert.equal(r.view().buy.run.got, first.q, 'the same count three minutes on');
    assert.ok(r.engine.state.cart.reduce((s, l) => s + l.q, 0) <= left, 'nothing comes back onto the list by itself');
    // Closed and opened again: the summed run is read back as it was.
    r.restart();
    assert.equal(r.engine.state.run.sum.got, first.q);
});

test('a buy on the Item Market\'s page during a run is counted on the Item Market\'s line', async (t) => {
    const r = rig(t, { keys: { full: '' }, settings: { target: 40 } });
    await r.ready();
    r.engine.act('makeList');
    const any = r.engine.state.cart[0];
    assert.ok(any, 'the list has a line');
    // A line of the Item Market, as Add makes it.
    const key = `${any.id}|im`;
    r.engine.state.cart = [...r.engine.state.cart.filter((l) => l.key !== key), { ...any, key, place: 'im', im: true, who: null, whoId: null, q: 3 }];
    r.engine.act('run', 'start');
    r.engine.note('buy', { t: Date.now(), id: String(any.id), qty: 2, price: any.price, im: true });
    assert.equal(r.engine.state.run.took[key], 2);
    assert.equal(r.engine.state.run.took[any.key] || 0, 0, 'and not on a bazaar\'s line');
});

test('a finished trade Torn will not hand over does not hold up the trades after it; after three tries it is left out and said', async (t) => {
    const r = rig(t);
    await r.ready();
    const a = String(r.fake.openTrade({ whoId: 4000006, theirs: [{ id: 384, qty: 2 }] }));
    const b = String(r.fake.openTrade({ whoId: 4000006, theirs: [{ id: 186, qty: 3 }] }));
    await r.go(2 * MIN);
    const real = r.fake.fetch;
    r.fake.fetch = (url, init) => (String(url).includes(`/v2/user/${a}/trade`) ? Promise.reject(new Error('down')) : real(url, init));
    r.fake.finishTrade(a, { pay: 2 * payOf(r.world, 384) });
    await r.wait(2000);
    r.fake.finishTrade(b, { pay: 3 * payOf(r.world, 186) });
    await r.go(20 * MIN);
    const done = r.view().trades.finished.map((x) => x.id);
    assert.ok(done.includes(b), 'the trade after it is in');
    assert.ok(!done.includes(a), 'the one Torn refused is not');
    assert.equal(r.said.filter((s) => /finished trade could not be read/.test(s.what)).length, 1, 'said once');
    // Torn answers again: nothing is asked for twice, and the later trade is still there once.
    r.fake.fetch = real;
    await r.go(5 * MIN);
    assert.equal(r.view().trades.finished.filter((x) => x.id === b).length, 1);
});

// ---- Torn's own words for `from` and `to` (its spec: "after this time", "up to and including this time") -------------

const buyRows = (r) => r.engine.state.ledger.rows.filter((x) => x.side === 'buy').length;
const madeUpBuy = (r, at) => r.fake.addLog(1225, { seller: 3000005, items: [{ id: 186, uid: null, qty: 1 }], cost_each: 880, cost_total: 880 }, at);

test('a row written to your log in the very second the last read ended at is not lost', async (t) => {
    const r = rig(t);
    await r.ready();
    const at = Date.now();
    madeUpBuy(r, at);
    await r.go(3 * MIN);
    const had = buyRows(r);
    assert.equal(r.engine.state.log.newest, Math.floor(at / 1000), 'the log is read up to that second');
    // Torn writes another row with the same second, after the read.
    madeUpBuy(r, at);
    await r.go(3 * MIN);
    assert.equal(buyRows(r), had + 1);
    await r.go(5 * MIN);
    assert.equal(buyRows(r), had + 1, 'and it is taken once, though that second is asked for every time');
});

test('more rows than one page, and the page ends inside a second with ten rows: none is skipped', async (t) => {
    const r = rig(t);
    await r.ready();
    await r.go(5 * MIN);
    const had = buyRows(r);
    const end = Date.now();
    // Newest first: 95 rows a second apart, ten in one second, 25 older ones. The first page of 100 ends five rows
    // into the ten.
    for (let k = 0; k < 95; k++) madeUpBuy(r, end - k * 1000);
    for (let k = 0; k < 10; k++) madeUpBuy(r, end - 95 * 1000);
    for (let k = 0; k < 25; k++) madeUpBuy(r, end - (96 + k) * 1000);
    await r.go(4 * MIN);
    assert.equal(buyRows(r), had + 130);
});

test('whether Torn lists finished trades by when they finished or when they were opened: a trade opened before the last one read, and finished after, is taken', async (t) => {
    for (const by of ['created', 'completed']) {
        const r = rig(t, { world: (w) => { w.options.tradesFromIs = by; } });
        await r.ready();
        const a = String(r.fake.openTrade({ whoId: 4000006, theirs: [{ id: 384, qty: 2 }] }));
        await r.go(2 * MIN);
        const b = String(r.fake.openTrade({ whoId: 4000006, theirs: [{ id: 186, qty: 3 }] }));
        await r.go(2 * MIN);
        r.fake.finishTrade(b, { pay: 3 * payOf(r.world, 186) });
        await r.go(8 * MIN);
        assert.ok(r.view().trades.finished.some((x) => x.id === b), by + ': the first one finished is in');
        r.fake.finishTrade(a, { pay: 2 * payOf(r.world, 384) });
        await r.go(8 * MIN);
        const done = r.view().trades.finished.map((x) => x.id);
        assert.ok(done.includes(a), by + ': the one opened earlier and finished later is in');
        assert.equal(done.filter((x) => x === b).length, 1, by + ': and nothing twice');
        r.clock.restore();
    }
});

test('"Do now"\'s list, made: the pieces and stops its line said, and no more', async (t) => {
    const r = rig(t, { keys: { full: '' }, settings: { target: 40 } });
    await r.ready();
    const todo = r.view().dash.todo.find((x) => x.kind === 'hot');
    r.engine.act('makeList', 'hot');
    const cart = r.engine.state.cart;
    if (!todo) { assert.deepEqual(cart, [], 'nothing under what you pay sellers: an empty list'); return; }
    assert.equal(cart.reduce((s, l) => s + l.q, 0), todo.n);
    assert.equal(new Set(cart.map((l) => l.place)).size, todo.stops);
    r.engine.act('makeList');
    assert.ok(r.engine.state.cart.reduce((s, l) => s + l.q, 0) >= todo.n, 'the whole list is the longer one');
});

test('a set swapped before the count began costs what your own buys on record say it cost then, not the market value of today', async (t) => {
    // The made-up history swaps two flower sets three days and two hours before the start. Here every flower was
    // bought at $1,000 a day before that; the trades that finished after the swap paid far more.
    let flowers = [];
    const r = rig(t, { world: (w, fake) => {
        flowers = w.sets.find((s) => s.key === 'flower').pieces;
        for (const id of flowers) fake.addLog(1225, { seller: 3000005, items: [{ id, uid: null, qty: 2 }], cost_each: 1000, cost_total: 2000 }, T0 - 4 * 24 * 60 * MIN - 2 * 60 * MIN);
    } });
    await r.ready();
    await r.go(5 * MIN);
    assert.ok(r.engine.state.stock.invAt > 0, 'the count has begun');
    const made = r.engine.state.book.filter((e) => e.kind === 'made' && e.set === 'flower' && e.t < T0);
    assert.equal(made.length, 1);
    assert.equal(made[0].points, 20);
    assert.equal(made[0].each, flowers.length * 1000 / 10, 'each piece at your $1,000, ten points a set');
    const atMarket = flowers.reduce((s, id) => s + r.world.items[id].mv, 0) / 10;
    assert.notEqual(Math.round(made[0].each), Math.round(atMarket), 'until 1.2.3 it stood at the market value');
});

// ---- only what was checked lately counts (the owner, 2026-10-11: "if i press refresh now ... make sure nothing is stale") --

const bazRows = (v) => v.pieces.flatMap((p) => p.offers.filter((o) => o.src !== 'market').map((o) => ({ ...o, id: p.id })));
/** The listing each line of the list stands on, as the view has it now. */
const cartRows = (r) => { const v = r.view(); return r.engine.state.cart.map((l) => piece(v, l.id).offers.find((o) => (l.im ? o.src === 'market' : String(o.whoId) === String(l.whoId))) || null); };

test('Read now: nothing looked at before the press counts until it has been looked at again, and the bazaars of the list are asked at once', async (t) => {
    const r = rig(t, { keys: { full: '' }, settings: { target: 40 } });
    await r.ready();
    r.engine.act('makeList');
    const stops = [...new Set(r.engine.state.cart.filter((l) => !l.im).map((l) => String(l.whoId)))];
    assert.ok(stops.length > 1, 'a list over several bazaars before the press');
    // A minute with nobody stepping: every look is over 45 seconds old.
    await r.wait(MIN);
    assert.ok(r.view().buy.plan.units > 0);
    const lines = r.engine.state.cart.length;
    const press = Date.now();
    r.engine.readNow();
    const at0 = r.view();
    assert.equal(at0.buy.plan.units, 0, 'the moment after the press nothing counts');
    assert.equal(at0.dash.todo.some((x) => x.kind === 'hot' || x.kind === 'buy'), false, '"Do now" names nothing to buy');
    assert.ok(bazRows(at0).length > 0 && bazRows(at0).every((o) => o.ok === false), 'the rows are still shown, as not checked');
    assert.deepEqual(stops.filter((id) => !at0.buy.check.includes(id)), [], 'and their bazaars are the ones to ask');
    assert.equal(r.engine.state.cart.length, lines, 'the list you made is not thrown away for it');
    r.engine.act('makeList');
    assert.deepEqual(r.engine.state.cart, [], 'but a list made now holds nothing that was not checked');
    await r.go(MIN);
    const asked = new Set(r.torn('/v2/user', (c) => BAZAAR_READ(c) && c.t >= press).map((c) => String(c.query.id)));
    assert.deepEqual(stops.filter((id) => !asked.has(id)), [], 'every bazaar of the list was read from Torn after the press');
    const after = r.view();
    assert.ok(after.buy.plan.units > 0, 'a minute later there is something to buy again');
    assert.deepEqual(after.buy.check, [], 'and nothing a list would use is left unchecked');
    r.engine.act('makeList');
    const rows = cartRows(r);
    assert.ok(rows.length > 0);
    for (const o of rows) assert.ok(o && o.ok !== false && o.at >= press - 45000, 'a list made of rows looked at since the press');
});

test('nothing looked at for six minutes: nothing counts, and a minute of reading later it does again', async (t) => {
    const r = rig(t, { keys: { full: '' }, settings: { target: 40 } });
    await r.ready();
    await r.wait(6 * MIN);
    const v = r.view();
    assert.equal(v.buy.plan.units, 0);
    assert.equal(v.dash.todo.some((x) => x.kind === 'hot' || x.kind === 'buy'), false, '"Do now" names no listing either');
    assert.ok(v.buy.unsure > 0 && v.buy.check.length > 0, 'the Buy page says what is being asked');
    await r.go(2 * MIN);
    assert.ok(r.view().buy.plan.units > 0);
    r.engine.act('makeList');
    const rows = cartRows(r);
    assert.ok(rows.length > 0);
    for (const o of rows) assert.ok(o && o.ok !== false && Date.now() - o.at <= 5 * MIN);
});

test('a bazaar known from TornW3B alone that a list would use, though it is not among the cheapest: Torn is asked about it, and then it counts', async (t) => {
    const r = rig(t, { keys: { full: '' }, settings: { target: 40 } });
    await r.ready();
    // Trader D (3000004) is too dear for anything. Now it lists Sheep as the third cheapest: you need more than the
    // two cheaper rows hold, so a list would go there.
    const p = piece(r.view(), 186);
    const price = p.offers[1].price + 1;
    assert.ok(price < p.worth && p.need > p.offers[0].qty + p.offers[1].qty, 'the made-up world still leaves room for it');
    const set = Date.now();
    r.fake.setPrice(3000004, 186, price, 6);
    let row = null;
    // TornW3B's list of a piece whose cheapest price did not move is read again within the hour (its daily limit).
    for (let k = 0; k < 12 * 90 && !(row && row.from === 'torn'); k++) {
        await r.go(5000);
        row = piece(r.view(), 186).offers.find((o) => String(o.whoId) === '3000004') || null;
    }
    assert.ok(row && row.from === 'torn' && row.ok !== false, 'Torn itself was asked, and the row counts');
    assert.ok(r.torn('/v2/user', (c) => BAZAAR_READ(c) && String(c.query.id) === '3000004' && c.t >= set).length > 0);
    r.engine.act('makeList');
    assert.equal(r.engine.state.cart.filter((l) => String(l.whoId) === '3000004' && Number(l.id) === 186).reduce((s, l) => s + l.q, 0), 6);
});

test('a bazaar\'s own page, told by your Torn tab: its price and stock are the hub\'s at once, and a list line it no longer bears comes off', async (t) => {
    const r = rig(t, { keys: { full: '' }, settings: { target: 40 } });
    await r.ready();
    r.engine.act('makeList');
    const line = r.engine.state.cart.find((l) => !l.im);
    assert.ok(line, 'a bazaar line on the list');
    const p = piece(r.view(), line.id);
    // The page shows that piece there at more than it is worth to you, one left.
    r.engine.note('shop', { t: Date.now(), whoId: String(line.whoId), items: [{ id: String(line.id), price: p.worth + 1000, qty: 1 }] });
    const row = piece(r.view(), line.id).offers.find((o) => String(o.whoId) === String(line.whoId));
    assert.deepEqual([row.price, row.qty, row.from, row.ok], [p.worth + 1000, 1, 'page', true]);
    assert.equal(r.engine.state.cart.some((l) => l.key === line.key), false, 'the line is off the list');
    // Torn's next read of that bazaar is the newer look: it wins again.
    await r.go(2 * MIN);
    const later = piece(r.view(), line.id).offers.find((o) => String(o.whoId) === String(line.whoId));
    assert.ok(later && later.from === 'torn' && later.price === line.price, 'Torn\'s later read stands over the page\'s');
});

test('"Buy from": a list without the Item Market, a place switched off leaves the list, and one piece added whole', async (t) => {
    const r = rig(t, { keys: { full: '' }, settings: { target: 40 } });
    await r.ready();
    r.engine.act('makeList');
    const both = r.engine.state.cart.map((l) => ({ ...l }));
    assert.ok(both.some((l) => l.im) && both.some((l) => !l.im), 'with both places on, the made-up world gives a list with bazaars and the Item Market');

    // Switched off while the list is on hand: its Item Market lines leave at once, the bazaar lines stay.
    r.set({ from: { bazaar: true, market: false } });
    assert.ok(r.engine.state.cart.length > 0 && r.engine.state.cart.every((l) => !l.im), 'no Item Market line is left');
    assert.deepEqual(r.engine.state.cart.filter((l) => !l.im).map((l) => l.key).sort(), both.filter((l) => !l.im).map((l) => l.key).sort());

    // And a list made now is bazaars alone, as the page's own count says.
    r.engine.act('clearList');
    r.engine.act('makeList');
    const only = r.engine.state.cart;
    assert.ok(only.length > 0 && only.every((l) => !l.im));
    assert.equal(only.reduce((s, l) => s + l.q, 0), r.view().buy.plan.units, 'the list is what the page counted: the same pieces');

    // One piece in one press: what the page said it would add, from bazaars only; pressed again, the piece is off.
    r.engine.act('clearList');
    const p = r.view().pieces.find((x) => x.more > 1 && x.offers.some((o) => o.src === 'market' && o.price < x.worth));
    assert.ok(p, 'a piece with more than one unit to add, and an Item Market row under its worth that must be left alone');
    r.engine.act('cartAll', p.id);
    const lines = r.engine.state.cart;
    assert.ok(lines.length > 0 && lines.every((l) => String(l.id) === String(p.id) && !l.im && l.price < p.worth));
    assert.equal(lines.reduce((s, l) => s + l.q, 0), p.more);
    assert.equal(piece(r.view(), p.id).more, 0);
    r.engine.act('cartAll', p.id);
    assert.deepEqual(r.engine.state.cart, []);

    // A list of that piece alone: it takes the place of whatever the list held, and holds what one press would add.
    r.engine.act('makeList');
    assert.ok(r.engine.state.cart.some((l) => String(l.id) !== String(p.id)), 'the list on hand holds other pieces');
    r.engine.act('listOnly', p.id);
    const alone = r.engine.state.cart;
    assert.ok(alone.length > 0 && alone.every((l) => String(l.id) === String(p.id) && !l.im && l.price < p.worth), 'only that piece, only where you buy, only under its worth');
    assert.equal(alone.reduce((s, l) => s + l.q, 0), p.more);
    r.engine.act('clearList');

    // Back on: the Item Market counts again.
    r.set({ from: { bazaar: true, market: true } });
    r.engine.act('makeList');
    assert.ok(r.engine.state.cart.some((l) => l.im));
});

test('your items first: "Read now" asks for them ahead of every other read, and "Read" on your stock asks for them alone', async (t) => {
    const r = rig(t, { keys: { full: '' }, settings: { target: 40 } });
    await r.ready();
    await r.wait(2 * MIN);
    const torn = (since) => r.fake.calls.filter((c) => c.host === 'api.torn.com' && c.t >= since);
    const inv = (c) => c.path === '/v2/user/inventory';

    // Read now: the first thing asked of Torn after the press is your inventory.
    let press = Date.now();
    r.engine.act('read');
    await r.go(MIN);
    const all = torn(press);
    assert.ok(all.length > 2, 'the press read many things');
    assert.ok(inv(all[0]), 'the inventory is the first of them, not ' + all[0].path);

    // Read on your stock (a Torn page): the inventory at once, though it was read a minute ago, and no price for it.
    await r.wait(MIN);
    press = Date.now();
    assert.equal(r.engine.act('readStock'), true, 'the engine knows the press');
    await r.wait(3000);
    const first = torn(press);
    assert.ok(first.length > 0 && inv(first[0]), 'the inventory is asked for at the press');
    const n = torn(press).filter(inv).length;
    // Pressed again and again: Torn is not asked each time.
    r.engine.act('readStock');
    r.engine.act('readStock');
    await r.wait(2000);
    assert.equal(torn(press).filter(inv).length, n, 'three presses in five seconds are one read');
});
