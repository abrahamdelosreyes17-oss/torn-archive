import test from 'node:test';
import assert from 'node:assert/strict';

import { TornApiClient, TornApiError, TORN_API_BASE, TORN_ERROR_KEY_INVALID, TORN_ERROR_RATE_LIMIT, redactKey, CEIL_MIN, CEIL_LEARN_FROM, CEIL_BACK, CEIL_BACK_EVERY_MS } from '../src/api/client.js';
const KEY = 'abcdef1234567890';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
    return {
        ok,
        status,
        json: async () => body,
    };
}

/** Records every URL the client tries to reach. */
function recordingFetch(handler) {
    const calls = [];
    const impl = async (url) => {
        calls.push(url);
        return handler(url, calls.length);
    };
    impl.calls = calls;
    return impl;
}

function makeClient(fetchImpl, options = {}) {
    return new TornApiClient({
        getKey: () => KEY,
        fetchImpl,
        maxRetries: 0,
        ...options,
    });
}

test('every request goes to api.torn.com and carries the key', async () => {
    const fetchImpl = recordingFetch(async () =>
        jsonResponse({ items: { 1: { name: 'Hammer' } } }),
    );

    const client = makeClient(fetchImpl);
    await client.get('torn', { selections: 'items' });

    assert.equal(fetchImpl.calls.length, 1);

    const url = new URL(fetchImpl.calls[0]);
    assert.equal(url.origin + '/', TORN_API_BASE);
    assert.equal(url.pathname, '/torn/');
    assert.equal(url.searchParams.get('selections'), 'items');
    assert.equal(url.searchParams.get('key'), KEY);
});

test('a path cannot redirect the client off api.torn.com', async () => {
    const fetchImpl = recordingFetch(async () => jsonResponse({ ok: 1 }));
    const client = makeClient(fetchImpl);

    // A path that tries to look like another host still resolves under the
    // fixed base, because the base is a constant and callers pass a path.
    await client.get('evil.example.com/steal', {});

    const url = new URL(fetchImpl.calls[0]);
    assert.equal(url.hostname, 'api.torn.com');
});

test('a Torn error becomes a typed error carrying the code', async () => {
    const fetchImpl = recordingFetch(async () =>
        jsonResponse({ error: { code: 2, error: 'Incorrect key' } }),
    );

    const client = makeClient(fetchImpl);

    await assert.rejects(
        () => client.get('torn', { selections: 'items' }),
        (error) => {
            assert.ok(error instanceof TornApiError);
            assert.equal(error.code, TORN_ERROR_KEY_INVALID);
            return true;
        },
    );
});

test('an invalid key is not retried', async () => {
    const fetchImpl = recordingFetch(async () =>
        jsonResponse({ error: { code: TORN_ERROR_KEY_INVALID, error: 'nope' } }),
    );

    const client = makeClient(fetchImpl, { maxRetries: 3 });

    await assert.rejects(() => client.get('torn', {}));
    assert.equal(fetchImpl.calls.length, 1);
});

test('a rate-limit error is retried with backoff', async () => {
    const fetchImpl = recordingFetch(async (url, n) => {
        if (n === 1) {
            return jsonResponse({
                error: { code: TORN_ERROR_RATE_LIMIT, error: 'Too many' },
            });
        }
        return jsonResponse({ items: {} });
    });

    const client = makeClient(fetchImpl, {
        maxRetries: 1,
        rateLimitBackoffMs: 5,
    });

    const data = await client.get('torn', { selections: 'items' });

    assert.deepEqual(data, { items: {} });
    assert.equal(fetchImpl.calls.length, 2);
});

test('identical concurrent requests are deduped into one fetch', async () => {
    const fetchImpl = recordingFetch(async () => jsonResponse({ items: {} }));
    const client = makeClient(fetchImpl);

    await Promise.all([
        client.get('torn', { selections: 'items' }),
        client.get('torn', { selections: 'items' }),
        client.get('torn', { selections: 'items' }),
    ]);

    assert.equal(fetchImpl.calls.length, 1);
});

test('a repeat request inside the dedup window reuses the response', async () => {
    const fetchImpl = recordingFetch(async () => jsonResponse({ items: {} }));
    const client = makeClient(fetchImpl, { dedupTtlMs: 10000 });

    await client.get('torn', { selections: 'items' });
    await client.get('torn', { selections: 'items' });

    assert.equal(fetchImpl.calls.length, 1);
});

test('different requests are not deduped', async () => {
    const fetchImpl = recordingFetch(async () => jsonResponse({ ok: 1 }));
    const client = makeClient(fetchImpl);

    await client.get('torn', { selections: 'items' });
    await client.get('torn', { selections: 'shops' });

    assert.equal(fetchImpl.calls.length, 2);
});

test('the rate limiter reports its remaining budget', async () => {
    const fetchImpl = recordingFetch(async () => jsonResponse({ ok: 1 }));
    const client = makeClient(fetchImpl, { maxPerMinute: 70, dedupTtlMs: 0 });

    await client.get('torn', { selections: 'items' });
    await client.get('torn', { selections: 'shops' });

    const stats = client.stats();
    assert.equal(stats.usedLastMinute, 2);
    assert.equal(stats.remaining, 68);
});

test('a missing key fails before any request is made', async () => {
    const fetchImpl = recordingFetch(async () => jsonResponse({ ok: 1 }));

    const client = new TornApiClient({
        getKey: () => '',
        fetchImpl,
        maxRetries: 0,
    });

    await assert.rejects(() => client.get('torn', {}));
    assert.equal(fetchImpl.calls.length, 0);
});

test('an HTTP failure is reported without leaking the key', async () => {
    const fetchImpl = recordingFetch(async () =>
        jsonResponse({}, { ok: false, status: 503 }),
    );

    const client = makeClient(fetchImpl);

    await assert.rejects(
        () => client.get('torn', {}),
        (error) => {
            assert.equal(error.http, 503);
            assert.ok(!error.message.includes(KEY));
            return true;
        },
    );
});

test('redactKey removes the key from any message', () => {
    assert.equal(redactKey('failed for ' + KEY, KEY), 'failed for <redacted>');

    // Also catches a key that arrived embedded in a URL from elsewhere.
    assert.equal(
        redactKey('https://api.torn.com/torn/?key=zzzzzzzzzzzzzzzz', ''),
        'https://api.torn.com/torn/?key=<redacted>',
    );

    assert.equal(redactKey(null, KEY), '');
});

test('an absolute path cannot redirect the key to another host', async () => {
    // new URL(absolute, base) ignores the base entirely, so the constant base
    // was not by itself the guarantee the README claimed.
    const fetchImpl = recordingFetch(async () => jsonResponse({ ok: 1 }));
    const client = makeClient(fetchImpl);

    await assert.rejects(
        () => client.get('https://evil.example.com/steal'),
        /Refusing to send the API key to evil\.example\.com/,
    );

    assert.equal(fetchImpl.calls.length, 0);
});

import { keyTooLowForInventory } from '../src/api/torn.js';
test('a Public or Minimal key never replaces the Limited key: refused with the reason', () => {
    assert.match(keyTooLowForInventory({ access_level: 1 }), /Public key/);
    assert.match(keyTooLowForInventory({ access_level: 2 }), /Minimal key/);
    assert.equal(keyTooLowForInventory({ access_level: 3 }), null);
    assert.equal(keyTooLowForInventory({ access_level: 4 }), null);
    assert.equal(keyTooLowForInventory({ access_level: 0 }), null, 'custom keys pass');
    assert.equal(keyTooLowForInventory(null), null, 'no answer: not refused on a guess');
});

test('priority lanes: with the shared window nearly full, a low call waits and an urgent one goes first (3.15)', async () => {
    const fetchImpl = recordingFetch(async () => jsonResponse({ ok: 1 }));
    // Every tab together has used 70 of 85 (Torn Archive runs alone: 85 a minute) this minute.
    let others = Array.from({ length: 70 }, () => Date.now());
    const sent = [];
    const client = makeClient(fetchImpl, { loadWindow: () => [...others], addToWindow: () => {}, onSent: (x) => sent.push(x.tag) });
    const low = client.get('user/5/profile', {}, { tag: 'status', priority: 'low' });
    const high = client.get('market/1/itemmarket', {}, { tag: 'fill', priority: 'high' });
    await high;
    assert.deepEqual(sent, ['fill'], 'the status check (low lane: needs 20 free) has not gone yet');
    // The window empties: the low call goes too.
    others = [];
    await low;
    assert.deepEqual(sent, ['fill', 'status']);
    assert.equal(client.laneLimit(0), 65);
    assert.equal(client.laneLimit(1), 80);
    assert.equal(client.laneLimit(2), 85);
});

test('1.3.7 the lanes under a small share: the low lane is not left with one slot', () => {
    // With Torn Bids in view this app keeps to 12 a minute. 20 held back out of 12 left the low lane a single
    // slot, taken only after a whole minute with no request at all: finished trades, the log, money and prices
    // were then never read.
    const behind = makeClient(null, { maxPerMinute: 12 });
    assert.deepEqual([behind.laneLimit(2), behind.laneLimit(1), behind.laneLimit(0)], [12, 12, 10]);
    const twenty = makeClient(null, { maxPerMinute: 20 });
    assert.deepEqual([twenty.laneLimit(2), twenty.laneLimit(1), twenty.laneLimit(0)], [20, 19, 16]);
    const front = makeClient(null, { maxPerMinute: 70 });
    assert.deepEqual([front.laneLimit(2), front.laneLimit(1), front.laneLimit(0)], [70, 66, 54]);
    // Alone, as it was.
    const alone = makeClient(null, { maxPerMinute: 85 });
    assert.deepEqual([alone.laneLimit(2), alone.laneLimit(1), alone.laneLimit(0)], [85, 80, 65]);
});

// ---- what Torn's "too many" teaches ----------------------------------------------------------------------------------

const T0 = Date.UTC(2026, 9, 11, 18, 0, 0);
const madeBefore = (client, n, now) => { client.recent = Array.from({ length: n }, (_, i) => now - 59000 + i * 500); };

test('after a "too many" the client holds under what it had made, comes back a step per quiet half hour, and slower the second time', () => {
    const client = makeClient(null);
    assert.equal(client.ceilNow(T0), null);
    assert.equal(client.limitNow(T0), 85);
    madeBefore(client, 60, T0);
    client.learn(T0);
    // Several refusals in one go are one "too many".
    client.learn(T0 + 500);
    client.learn(T0 + 30000);
    assert.equal(client.ceilNow(T0), 42);
    assert.equal(client.limitNow(T0), 42);
    assert.equal(client.laneLimit(2, T0), 42);
    // The lanes' reserves shrink with the ceiling (1.3.7): 5 and 20 were chosen for 85 a minute.
    assert.equal(client.laneLimit(1, T0), 40);
    assert.equal(client.laneLimit(0, T0), 33);
    assert.equal(client.stats(T0).ceil, 42);
    assert.equal(client.ceilNow(T0 + CEIL_BACK_EVERY_MS - 1), 42);
    assert.equal(client.ceilNow(T0 + CEIL_BACK_EVERY_MS), 42 + CEIL_BACK);
    assert.equal(client.ceilNow(T0 + 4 * CEIL_BACK_EVERY_MS), 82);
    assert.equal(client.ceilNow(T0 + 5 * CEIL_BACK_EVERY_MS), null, 'back at its pace: nothing held');
    assert.equal(client.limitNow(T0 + 5 * CEIL_BACK_EVERY_MS), 85);

    // A second one two hours on, from what it was held to: lower, and each step takes an hour.
    const second = T0 + 4 * CEIL_BACK_EVERY_MS;
    madeBefore(client, 82, second);
    client.learn(second);
    assert.equal(client.ceilNow(second), 57);
    assert.equal(client.ceilNow(second + CEIL_BACK_EVERY_MS), 57);
    assert.equal(client.ceilNow(second + 2 * CEIL_BACK_EVERY_MS), 67);
    // Never under the least, however often.
    madeBefore(client, CEIL_LEARN_FROM, second + 5 * 60000);
    client.learn(second + 5 * 60000);
    assert.equal(client.ceilNow(second + 5 * 60000), Math.max(CEIL_MIN, Math.floor(0.7 * CEIL_LEARN_FROM)));
});

test('having made little itself the client learns nothing: the limit was spent elsewhere', () => {
    const client = makeClient(null);
    madeBefore(client, CEIL_LEARN_FROM - 1, T0);
    client.learn(T0);
    assert.equal(client.ceilNow(T0), null);
    // While it runs behind Torn Trading on a small share, a ceiling above the share changes nothing.
    madeBefore(client, 60, T0);
    client.learn(T0);
    client.maxPerMinute = 12;
    assert.equal(client.limitNow(T0), 12);
    client.maxPerMinute = 85;
    assert.equal(client.limitNow(T0), 42);
});

test('Torn\'s answer "too many" is what teaches it, and every tab holds to the same', async () => {
    let shared = null;
    const options = { loadCeil: () => shared, saveCeil: (c) => { shared = JSON.parse(JSON.stringify(c)); }, dedupTtlMs: 0 };
    const fetchImpl = recordingFetch(async () => jsonResponse({ error: { code: TORN_ERROR_RATE_LIMIT, error: 'Too many requests' } }));
    const one = makeClient(fetchImpl, options);
    const two = makeClient(recordingFetch(async () => jsonResponse({ ok: 1 })), options);
    madeBefore(one, 49, Date.now());
    await assert.rejects(() => one.get('torn', { selections: 'items' }), (error) => error instanceof TornApiError && error.code === TORN_ERROR_RATE_LIMIT);
    assert.equal(one.ceilNow(), 35);
    assert.equal(two.ceilNow(), 35, 'the other tab');
    assert.equal(two.stats().remaining, 35);
    // A refusal made here during the shared pause was not Torn's: nothing more is learned from it.
    const was = JSON.stringify(shared);
    await assert.rejects(() => one.get('torn', { selections: 'shops' }), (error) => error.paused === true);
    assert.equal(JSON.stringify(shared), was);
    // What is in storage is not trusted blindly.
    shared = { most: 'x' };
    assert.equal(two.ceilNow(), null);
});

test('turned away by the shared server and held by a "too many": the careful pace, and only then', () => {
    let away = false;
    const client = makeClient(null, { turnedAway: () => away, carefulMost: 40 });
    away = true;
    assert.equal(client.limitNow(T0), 85, 'turned away alone changes nothing: most copies are nobody the server serves');
    madeBefore(client, 85, T0);
    client.learn(T0);
    assert.equal(client.ceilNow(T0), 59);
    assert.equal(client.limitNow(T0), 40);
    away = false;
    assert.equal(client.limitNow(T0), 59);
});
