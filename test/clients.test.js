/*
 * What Torn Archive 1.0.0 changed in the two clients it took from Torn Bids
 * 3.24.0 (PLAN-torn-archive.md, sections 6.2 and 7):
 *
 *   Torn      85 a minute; silent while Torn Bids runs (isPaused), with an
 *             error of its own; a missing key is its own error, never Torn's
 *             code 2.
 *   TornW3B   the item-listing route has a window of its own (9 a minute) and
 *             a day count (950); a 429's Retry-After is honoured; isPaused;
 *             a request refused here is `local`, and is not a failure.
 *
 * Nothing here leaves the machine: every fetch is a stand-in.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { TornApiClient, TornApiError, PausedError, NoKeyError, KEY_DEAD_CODES } from '../src/api/client.js';
import {
    W3bClient,
    W3bError,
    fetchW3bListings,
    isW3bListingPath,
    w3bRetryAfterMs,
    W3B_MAX_PER_MINUTE,
    W3B_SHARED_PER_MINUTE,
    W3B_COOLDOWN_MS,
    W3B_LISTING_PER_MINUTE,
    W3B_LISTING_PER_DAY,
    W3B_RETRY_AFTER_MIN_MS,
    W3B_RETRY_AFTER_MAX_MS,
} from '../src/api/w3b.js';
import { gmHeader } from '../src/platform/gm.js';
import { tabWindow } from '../src/platform/tab-window.js';

const KEY = 'AbCdEfGh12345678';
const T0 = 1_790_000_000_000;
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const ok = (body) => ({ ok: true, status: 200, json: async () => body });

/* ------------------------------------------------------------ the Torn client */

test('Torn: 85 a minute by default', () => {
    const client = new TornApiClient({ getKey: () => KEY });
    assert.equal(client.maxPerMinute, 85);
    assert.equal(client.stats().remaining, 85);
});

test('Torn: no key is its own error - not Torn\'s code 2, so nothing marks a key dead - and nothing is sent', async () => {
    let sent = 0;
    const failed = [];
    const client = new TornApiClient({ getKey: () => '', fetchImpl: async () => ((sent += 1), ok({})), onFailed: (f) => failed.push(f) });
    const error = await client.get('torn', { selections: 'items' }).then(() => null, (e) => e);
    assert.ok(error instanceof NoKeyError);
    assert.equal(error instanceof TornApiError, false, 'not an answer of Torn\'s');
    assert.equal(error.name, 'NoKeyError');
    assert.equal(error.message, 'No API key set.');
    assert.equal(error.local, true);
    assert.equal(error.noKey, true);
    assert.equal(error.code, undefined);
    assert.equal(KEY_DEAD_CODES.has(error.code), false);
    assert.equal(sent, 0);
    assert.equal(client.stats().usedLastMinute, 0, 'no slot was spent on it');
    assert.equal(failed.length, 1, 'the problem log still hears that a read could not go');
    assert.equal(failed[0].error, error);
});

test('Torn: while Torn Bids runs nothing is sent, and the refusal is not an API error nor a line in the problem log', async () => {
    let paused = true;
    let sent = 0;
    const failed = [];
    const client = new TornApiClient({ getKey: () => KEY, fetchImpl: async () => ((sent += 1), ok({ ok: 1 })), isPaused: () => paused, onFailed: (f) => failed.push(f), maxRetries: 0 });
    const error = await client.get('user', { selections: 'money' }).then(() => null, (e) => e);
    assert.ok(error instanceof PausedError);
    assert.equal(error instanceof TornApiError, false);
    assert.equal(error.local, true);
    assert.equal(error.takingTurns, true);
    assert.equal(error.code, undefined);
    assert.equal(error.http, undefined);
    assert.doesNotMatch(error.message, new RegExp(KEY));
    assert.equal(sent, 0);
    assert.equal(client.stats().usedLastMinute, 0);
    assert.deepEqual(failed, [], 'taking turns is not a failure');
    // Torn Bids is gone: the same call goes.
    paused = false;
    assert.deepEqual(await client.get('user', { selections: 'money' }), { ok: 1 });
    assert.equal(sent, 1);
    // A hook that throws does not stop the reads.
    const odd = new TornApiClient({ getKey: () => KEY, fetchImpl: async () => ok({ ok: 2 }), isPaused: () => { throw new Error('x'); } });
    assert.deepEqual(await odd.get('torn'), { ok: 2 });
});

test('Torn: a request queued before the pause is not sent either', async () => {
    let paused = false;
    let sent = 0;
    // The minute is full, and its oldest slot leaves in about a tenth of a second: the call waits for it.
    const full = Array.from({ length: 85 }, () => Date.now() - (MIN - 100));
    const client = new TornApiClient({ getKey: () => KEY, fetchImpl: async () => ((sent += 1), ok({})), isPaused: () => paused, loadWindow: () => [...full], addToWindow: () => {}, maxRetries: 0 });
    const waiting = client.get('user', { selections: 'money' });
    // Torn Bids is opened while it waits.
    paused = true;
    await assert.rejects(waiting, (e) => e instanceof PausedError);
    assert.equal(sent, 0);
});

/* --------------------------------------------------------- the TornW3B client */

function w3b(extra = {}) {
    const state = { t: T0, calls: [], slept: [], failed: [], local: [], sent: [] };
    const client = new W3bClient({
        now: () => state.t,
        sleep: async (ms) => {
            state.slept.push(ms);
            state.t += ms;
        },
        fetchImpl: async (url) => {
            state.calls.push(new URL(url).pathname.replace('/api/', ''));
            return ok({ items: [], listings: [], total_listings: 0, traders: [] });
        },
        onFailed: (f) => state.failed.push(f),
        onLocal: (f) => state.local.push(f),
        onSent: (s) => state.sent.push(s.path),
        ...extra,
    });
    return { client, state };
}
const refused = (promise) => promise.then(() => null, (e) => e);

test('TornW3B: which route is an item\'s full listing', () => {
    assert.equal(isW3bListingPath('marketplace/206'), true);
    assert.equal(isW3bListingPath('/marketplace/206'), true);
    assert.equal(isW3bListingPath('marketplace/206/'), true);
    assert.equal(isW3bListingPath('marketplace'), false, 'the summary of every item');
    assert.equal(isW3bListingPath('marketplace/206/traders'), false, 'an item\'s buyers');
    assert.equal(isW3bListingPath('pricelist/123'), false);
});

test('TornW3B: 80 a minute overall, 9 a minute and 950 a day for an item\'s listing', () => {
    assert.equal(W3B_MAX_PER_MINUTE, 80);
    assert.equal(W3B_SHARED_PER_MINUTE, 80);
    assert.equal(W3B_LISTING_PER_MINUTE, 9);
    assert.equal(W3B_LISTING_PER_DAY, 950);
    const { client } = w3b();
    assert.equal(client.maxPerMinute, 80);
    assert.equal(client.listingPerMinute, 9);
    assert.equal(client.listingPerDay, 950);
    assert.deepEqual(client.stats(), { usedLastMinute: 0, remaining: 80, coolingDown: false, sharedLastMinute: 0, listingLastMinute: 0, listingRemaining: 9, listingToday: 0, listingDayRemaining: 950, listingFreeAt: 0 });
});

test('TornW3B: the 10th listing in a minute is refused here - local, nothing sent, not a failure - while other routes still go', async () => {
    const { client, state } = w3b();
    for (let i = 1; i <= 9; i += 1) {
        await client.get('marketplace/' + i, { tag: 'w.item' });
        state.t += 1000;
    }
    assert.equal(state.calls.length, 9);
    assert.equal(client.stats().listingRemaining, 0);
    assert.equal(client.stats().listingFreeAt, T0 + MIN);

    const error = await refused(client.get('marketplace/10', { tag: 'w.item' }));
    assert.ok(error instanceof W3bError);
    assert.equal(error.local, true);
    assert.equal(error.reason, 'listing-minute');
    assert.equal(error.retryAt, T0 + MIN, 'a minute after the first of the nine');
    assert.equal(error.http, null, 'not an HTTP error');
    assert.equal(error.blocked, false, 'TornW3B refused nothing');
    assert.equal(error.takingTurns, false);
    assert.equal(state.calls.length, 9, 'nothing was sent');
    assert.equal(state.sent.length, 9, 'and nothing is in the usage record for it');
    assert.equal(state.slept.length, 0, 'it does not wait: the summary and the buyers would wait behind it');
    assert.deepEqual(state.failed, [], 'the problem log is not told');
    assert.deepEqual(state.local.map((l) => [l.path, l.tag, l.error.reason]), [['marketplace/10', 'w.item', 'listing-minute']]);
    assert.equal(client.stats().usedLastMinute, 9, 'no slot of the overall window was spent on it');

    // The summary and an item's buyers draw on the overall window only.
    await client.get('marketplace');
    await client.get('marketplace/10/traders');
    assert.deepEqual(state.calls.slice(9), ['marketplace', 'marketplace/10/traders']);
    assert.equal(client.stats().listingLastMinute, 9);

    // A minute after the first: one listing has room again, and only one.
    state.t = T0 + MIN;
    await client.get('marketplace/10');
    assert.equal(state.calls.length, 12);
    assert.equal((await refused(client.get('marketplace/11'))).reason, 'listing-minute');
});

test('TornW3B: listingPerMinute is an option; fetchW3bListings passes the local refusal on', async () => {
    const { client, state } = w3b({ listingPerMinute: 2 });
    await fetchW3bListings(client, 206);
    await fetchW3bListings(client, 207);
    const error = await refused(fetchW3bListings(client, 208));
    assert.equal(error.local, true);
    assert.equal(error.reason, 'listing-minute');
    assert.match(error.message, /this minute's 2 are used/);
    assert.equal(state.calls.length, 2);
});

test('TornW3B: every tab draws on one listing window and one day count, through storage', async () => {
    const store = new Map();
    const gm = { get: (k, fallback) => (store.has(k) ? JSON.parse(store.get(k)) : fallback), set: (k, v) => store.set(k, JSON.stringify(v)), del: (k) => store.delete(k) };
    let day = {};
    const tab = (id) => {
        const made = w3b({ listingPerMinute: 3 });
        const win = tabWindow('w3bListing', id, gm, () => made.state.t);
        made.client.loadListing = () => win.load();
        made.client.addListing = (at) => win.add(at);
        made.client.loadListingDay = () => day;
        made.client.saveListingDay = (counts) => {
            day = counts;
        };
        return made;
    };
    const a = tab('a');
    const b = tab('b');
    await a.client.get('marketplace/1');
    await b.client.get('marketplace/2');
    await a.client.get('marketplace/3');
    // The fourth, whichever tab asks.
    assert.equal((await refused(b.client.get('marketplace/4'))).reason, 'listing-minute');
    assert.equal((await refused(a.client.get('marketplace/4'))).reason, 'listing-minute');
    assert.equal(a.state.calls.length + b.state.calls.length, 3);
    assert.equal(b.client.stats().listingLastMinute, 3);
    // The day's count is one for all of them, kept by the hour.
    assert.deepEqual(day, { [Math.floor(T0 / HOUR)]: 3 });
    assert.equal(b.client.stats().listingToday, 3);
});

test('TornW3B: the item listings Torn Bids asked for on this PC count in the same minute and day as ours', async () => {
    const { client, state } = w3b({ listingPerMinute: 4, listingPerDay: 10 });
    const hour = Math.floor(T0 / HOUR);
    let other = null;
    client.loadListingOther = () => other;
    await client.get('marketplace/1');
    // Torn Bids made two in this minute, one of them older than a minute by now, and one from the future (not believed).
    other = { m: [T0 - 70000, T0 - 20000, T0 - 5000, T0 + 90000], d: { [hour]: 2, [hour - 30]: 50 } };
    assert.equal(client.stats().listingLastMinute, 3);
    assert.equal(client.stats().listingToday, 3);
    await client.get('marketplace/2');
    const error = await refused(client.get('marketplace/3'));
    assert.equal(error.reason, 'listing-minute');
    // Room comes back when Torn Bids' oldest request leaves the minute.
    assert.equal(error.retryAt, T0 - 20000 + 60000);
    assert.equal(state.calls.length, 2);
    // Their count is never written into ours.
    assert.deepEqual(client.listingDay, { [hour]: 2 });
    // The day: theirs and ours together reach the cap.
    state.t += 2 * MIN;
    other = { m: [], d: { [hour]: 8 } };
    assert.equal((await refused(client.get('marketplace/4'))).reason, 'listing-day');
    // What cannot be read is no count at all.
    other = null;
    await client.get('marketplace/4');
    client.loadListingOther = () => { throw new Error('no page storage'); };
    await client.get('marketplace/5');
    assert.equal(state.calls.length, 4);
});

test('TornW3B: the day\'s listings stop at the cap, and start again when the oldest hour has left the day', async () => {
    const { client, state } = w3b({ listingPerDay: 5 });
    for (let i = 1; i <= 5; i += 1) {
        await client.get('marketplace/' + i);
        state.t += MIN;
    }
    const hour0 = Math.floor(T0 / HOUR);
    assert.equal(Math.floor(state.t / HOUR), hour0, 'all five within one hour of the clock');
    const error = await refused(client.get('marketplace/6'));
    assert.equal(error.local, true);
    assert.equal(error.reason, 'listing-day');
    assert.equal(error.retryAt, (hour0 + 25) * HOUR);
    assert.match(error.message, /today's 5 are used/);
    assert.equal(state.calls.length, 5);
    assert.deepEqual(state.failed, []);
    assert.equal(client.stats().listingDayRemaining, 0);
    assert.equal(client.stats().listingFreeAt, (hour0 + 25) * HOUR);
    // Other routes are not held by it.
    await client.get('marketplace');
    assert.equal(state.calls.length, 6);
    // Twenty-four hours on it is still the same day here (never less than TornW3B's own).
    state.t = T0 + 24 * HOUR;
    assert.equal((await refused(client.get('marketplace/6'))).reason, 'listing-day');
    // Once that hour has left: it goes.
    state.t = (hour0 + 25) * HOUR;
    await client.get('marketplace/6');
    assert.equal(state.calls.length, 7);
    assert.equal(client.stats().listingToday, 1);
});

test('TornW3B: a 429 is waited out for as long as its Retry-After says; without one, the usual minute', async () => {
    const answer = { ok: false, status: 429, json: async () => ({}), header: (name) => (name.toLowerCase() === 'retry-after' ? '120' : null) };
    const { client, state } = w3b({ fetchImpl: async () => answer });
    const real = await refused(client.get('marketplace'));
    assert.equal(real.http, 429);
    assert.equal(real.blocked, true);
    assert.equal(real.local, false, 'this one TornW3B did refuse');
    assert.equal(real.retryAt, T0 + 120000);
    assert.equal(state.failed.length, 1, 'the real refusal is a line in the problem log');
    assert.equal(client.stats().coolingDown, true);

    // Until then, every request is refused here: local, never an HTTP error, never logged as one.
    state.t = T0 + 119999;
    const local = await refused(client.get('marketplace'));
    assert.equal(local.local, true);
    assert.equal(local.reason, 'cooldown');
    assert.equal(local.blocked, true);
    assert.equal(local.http, null);
    assert.equal(local.retryAt, T0 + 120000);
    assert.equal(state.failed.length, 1, 'still one: 35 real refusals are 35 lines, not 450');
    assert.equal(state.local.length, 1);
    state.t = T0 + 120000;
    assert.equal(client.stats().coolingDown, false);

    // No Retry-After (or one that cannot be read): 60 s, as before.
    const plain = w3b({ fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}) }) });
    assert.equal((await refused(plain.client.get('marketplace'))).retryAt, T0 + W3B_COOLDOWN_MS);
    const odd = w3b({ fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}), header: () => 'soon' }) });
    assert.equal((await refused(odd.client.get('marketplace'))).retryAt, T0 + W3B_COOLDOWN_MS);
    // A fetch Response keeps its headers elsewhere: read too. A date, here.
    const dated = w3b({ fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({}), headers: { get: (name) => (name === 'retry-after' ? new Date(T0 + 300000).toUTCString() : null) } }) });
    assert.equal((await refused(dated.client.get('marketplace'))).retryAt, T0 + 300000);

    // One tab's 429 stops every tab, for as long.
    let shared = { recent: [], cooldownUntil: 0 };
    const hooks = { loadShared: () => shared, saveShared: (s) => { shared = s; } };
    const one = w3b({ ...hooks, fetchImpl: async () => answer });
    const two = w3b(hooks);
    await refused(one.client.get('marketplace'));
    const other = await refused(two.client.get('marketplace'));
    assert.equal(other.reason, 'cooldown');
    assert.equal(other.retryAt, T0 + 120000);
    assert.equal(two.state.calls.length, 0);
});

test('TornW3B: reading a Retry-After - seconds or a date, never under a second, never over a day', () => {
    assert.equal(w3bRetryAfterMs('120', T0), 120000);
    assert.equal(w3bRetryAfterMs(' 7 ', T0), 7000);
    assert.equal(w3bRetryAfterMs('1.5', T0), 1500);
    assert.equal(w3bRetryAfterMs('0', T0), W3B_RETRY_AFTER_MIN_MS);
    assert.equal(w3bRetryAfterMs(String(7 * 24 * 3600), T0), W3B_RETRY_AFTER_MAX_MS);
    assert.equal(w3bRetryAfterMs(new Date(T0 + 90000).toUTCString(), T0), 90000);
    assert.equal(w3bRetryAfterMs(new Date(T0 - 90000).toUTCString(), T0), W3B_RETRY_AFTER_MIN_MS, 'a date already past');
    for (const none of ['', null, undefined, 'soon', '-5']) assert.equal(w3bRetryAfterMs(none, T0), null);
    // What the userscript host hands over: every header as one text.
    const raw = 'content-type: text/html\r\nRetry-After: 42\r\ncf-ray: abc';
    assert.equal(gmHeader(raw, 'retry-after'), '42');
    assert.equal(gmHeader(raw, 'Content-Type'), 'text/html');
    assert.equal(gmHeader(raw, 'x-none'), null);
    assert.equal(gmHeader(null, 'retry-after'), null);
    assert.equal(w3bRetryAfterMs(gmHeader(raw, 'retry-after'), T0), 42000);
});

test('TornW3B: while Torn Bids runs nothing is sent - not a request made then, not one that was waiting', async () => {
    let paused = true;
    const { client, state } = w3b({ isPaused: () => paused, maxPerMinute: 1 });
    const error = await refused(client.get('marketplace'));
    assert.equal(error.local, true);
    assert.equal(error.reason, 'paused');
    assert.equal(error.takingTurns, true);
    assert.equal(error.http, null);
    assert.equal(error.blocked, false);
    assert.equal(state.calls.length, 0);
    assert.deepEqual(state.failed, []);
    assert.equal(state.local.length, 1);
    assert.equal(client.stats().usedLastMinute, 0);

    paused = false;
    await client.get('marketplace');
    assert.equal(state.calls.length, 1);
    // The minute is full (1 a minute here): the next waits - and Torn Bids is opened while it does.
    client.sleep = async (ms) => {
        state.t += ms;
        paused = true;
    };
    assert.equal((await refused(client.get('marketplace/5/traders'))).reason, 'paused');
    assert.equal(state.calls.length, 1, 'the queued request was not sent');
    // A hook that throws does not stop the reads.
    const odd = w3b({ isPaused: () => { throw new Error('x'); } });
    await odd.client.get('marketplace');
    assert.equal(odd.state.calls.length, 1);
});

test('TornW3B: a ceiling that moves is still honoured, and never more than the client\'s own', async () => {
    let ceiling = 80;
    const { client, state } = w3b({ perMinute: () => ceiling });
    for (let i = 0; i < 25; i += 1) await client.get('marketplace');
    assert.equal(state.slept.length, 0);
    assert.equal(client.stats().remaining, 55);
    // The ceiling drops under what was already used: the next read waits until it is under it again.
    ceiling = 20;
    assert.equal(client.limit(), 20);
    assert.equal(client.stats().remaining, 0);
    await client.get('marketplace');
    assert.equal(state.slept.length, 1);
    assert.ok(state.t >= T0 + MIN, 'it waited for its own reads to leave the minute');
    // A ceiling that is rubbish, or throws: the client's own. Never more than its own, never under one.
    assert.equal(w3b({ perMinute: () => NaN }).client.limit(), W3B_MAX_PER_MINUTE);
    assert.equal(w3b({ perMinute: () => { throw new Error('x'); } }).client.limit(), W3B_MAX_PER_MINUTE);
    assert.equal(w3b({ perMinute: () => 500 }).client.limit(), W3B_MAX_PER_MINUTE);
    assert.equal(w3b({ perMinute: () => 0 }).client.limit(), 1);
    assert.equal(w3b().client.limit(), W3B_MAX_PER_MINUTE);
});

test('TornW3B: no key, whoever asks - the client has no place for one', () => {
    const client = new W3bClient({ getKey: () => KEY, key: KEY });
    assert.equal(client.getKey, undefined);
    assert.equal(client.key, undefined);
    const url = client.buildUrl('marketplace/206', { key: KEY, tradedWithinHours: 24 });
    assert.equal(url.toString(), 'https://weav3r.dev/api/marketplace/206?comment=TornArchive&tradedWithinHours=24');
    assert.doesNotMatch(JSON.stringify(Object.keys(client)), /key/i);
});
