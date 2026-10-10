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
    assert.deepEqual(r.torn('/v2/user/inventory').map((c) => c.query.cat).sort(), ['Flower', 'Plushie']);
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
    // The history is not read from the start again: one look at the log at most, no finished trade read in full.
    assert.ok(r.torn('/v2/user/log').length - logRows <= 1);
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
