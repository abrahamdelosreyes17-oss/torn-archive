/*
 * TornW3B allows 100 calls a minute per IP, for everything on it. These pin
 * down what 3.12.5 changed: the feed no longer re-reads the same item every
 * tick, every tab shares one TornW3B window and one 429 wait, and saving
 * Torn API calls leaves bazaars watched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { W3bClient } from '../src/api/w3b.js';
const T0 = 1_700_000_000_000;
const json = (body) => ({ ok: true, status: 200, json: async () => body });

function memoryStore() {
    const data = new Map();
    return {
        load: (k) => (data.has(k) ? JSON.parse(data.get(k)) : null),
        save: (k, v) => data.set(k, JSON.stringify(v)),
    };
}

const seen = Math.floor(T0 / 1000);
const BOB = { player_id: 7, player_name: 'Bob', price: 50, quantity: 2, last_checked: seen };

/* ---------------------------------------------------------- one window */

function sharedClients(n, { sharedPerMinute = 5, onFetch = () => json({ items: [] }) } = {}) {
    let t = T0;
    const store = memoryStore();
    const calls = [];
    const slept = [];
    const clients = [];
    for (let i = 0; i < n; i++) {
        clients.push(new W3bClient({
            now: () => t,
            maxPerMinute: 60,
            sharedPerMinute,
            loadShared: () => store.load('w3bWindow'),
            saveShared: (s) => store.save('w3bWindow', s),
            // Sleeping moves the clock instead of waiting.
            sleep: async (ms) => {
                slept.push(ms);
                t += ms;
            },
            fetchImpl: async (url) => {
                calls.push({ tab: i, at: t, url });
                return onFetch(url);
            },
        }));
    }
    return { clients, calls, slept, store, clock: { get t() { return t; }, set t(v) { t = v; } } };
}

test('every tab draws on ONE TornW3B window: the 6th call in a minute waits, whichever tab makes it', async () => {
    const { clients, calls, slept } = sharedClients(3, { sharedPerMinute: 5 });
    for (let i = 0; i < 6; i++) await clients[i % 3].get('marketplace');
    assert.equal(calls.length, 6);
    assert.ok(calls.slice(0, 5).every((c) => c.at === T0), 'five go at once');
    assert.ok(calls[5].at >= T0 + 60000, 'the sixth waits for the first to leave the minute');
    assert.equal(slept.length, 1);
    // Each tab on its own had room (60 a minute): only the shared window held it.
});

test('a 429 seen by one tab stops every tab for a minute', async () => {
    let first = true;
    const { clients, calls, clock } = sharedClients(2, {
        sharedPerMinute: 80,
        onFetch: () => {
            if (first) {
                first = false;
                return { ok: false, status: 429, json: async () => ({}) };
            }
            return json({ items: [] });
        },
    });
    await assert.rejects(clients[0].get('marketplace'), (e) => e.http === 429);
    await assert.rejects(clients[1].get('marketplace'), (e) => e.blocked && !e.http, 'the other tab does not even ask');
    assert.equal(calls.length, 1);
    clock.t += 61000;
    await clients[1].get('marketplace');
    assert.equal(calls.length, 2, 'asked again once the wait is over');
});
