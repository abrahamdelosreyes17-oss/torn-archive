/*
 * 3.14: Torn Bids keeps TornExchange and TornW3B going in the background (a
 * few TornW3B reads a minute), and Chat marks the trader's chat button on
 * their Torn profile (core/desk.js, sources/route.js).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { backgroundSlot, W3B_HIDDEN_PER_MIN } from '../src/core/desk.js';
test('in the background, a few TornW3B reads a minute - never the in-view pace', () => {
    const now = 1_000_000;
    const recent = Array.from({ length: W3B_HIDDEN_PER_MIN }, (_, i) => now - i * 1000);
    assert.equal(backgroundSlot(recent, now), false, 'the minute is full');
    assert.equal(backgroundSlot(recent.slice(1), now), true);
    assert.equal(backgroundSlot(recent, now + 60000), true, 'a minute later: room again');
    assert.equal(backgroundSlot(null, now), true);
    assert.ok(W3B_HIDDEN_PER_MIN < 60, 'below the in-view 60 a minute (3.15: 24 before)');
});

import { nextW3bRead } from '../src/core/desk.js';
test('hidden, all 30 possible flips are checked within two minutes, even with once-a-minute timers', () => {
    // The owner's page (3.14.1): hidden five minutes, 3 of 30 flips checked,
    // while 2,482 traders' price lists took every other read.
    const candidates = Array.from({ length: 30 }, (_, i) => 'c' + i);
    const read = new Set();
    let lists = 0;
    let turn = 0;
    const recent = [];
    let t = 0;
    // Chrome runs a hidden tab's timers about once a minute; each tick starts
    // reads one after another (each ~1 s) while the minute has room.
    for (let tick = 0; tick < 2; tick++) {
        t = tick * 60000;
        for (;;) {
            if (!backgroundSlot(recent.filter((x) => t - x < 60000), t)) break;
            turn ^= 1;
            const r = nextW3bRead({ candidates, list: 'L' + lists, turn, hidden: true, due: (id) => !read.has(id) });
            if (!r) break;
            if (r.kind === 'list') lists++;
            else read.add(r.id);
            recent.push(t);
            t += 1000;
        }
    }
    assert.equal(read.size, 30, 'every possible flip checked');
    // The lists wait while flips are due, then go on.
    assert.ok(lists > 0, 'price lists still read once the flips are done');
    // In view nothing changes: flips and lists take turns.
    assert.deepEqual(nextW3bRead({ candidates: ['c1'], list: 'L1', turn: 0, due: () => true }), { kind: 'list', id: 'L1' });
});

import { backgroundListSlot } from '../src/core/desk.js';
test('a page that loads hidden: price lists never take the minute the flips need', () => {
    // The harness (3.14.2 and the first fix): the flips are not known for a
    // few seconds, the lists took all of the minute's reads, and the flips
    // found 5 s later waited for the next minute.
    const candidates = Array.from({ length: 30 }, (_, i) => 'c' + i);
    const read = new Map();
    const recent = [];
    const lists = [];
    let listNo = 0;
    let turn = 0;
    // Timers of a freshly hidden page: every 2.5 s; each read ~0.2 s.
    for (let tick = 0; tick * 2500 <= 120000; tick++) {
        let t = tick * 2500;
        for (;;) {
            if (!backgroundSlot(recent.filter((x) => t - x < 60000), t)) break;
            const known = t >= 5000 ? candidates : [];
            const listRoom = backgroundListSlot(lists.filter((x) => t - x < 60000), t);
            turn ^= 1;
            const r = nextW3bRead({ candidates: known, list: listRoom ? 'L' + listNo : null, turn, hidden: true, due: (id) => !read.has(id) });
            if (!r) break;
            if (r.kind === 'list') {
                listNo++;
                lists.push(t);
            } else read.set(r.id, t);
            recent.push(t);
            t += 200;
        }
    }
    assert.equal(read.size, 30);
    const last = Math.max(...read.values());
    assert.ok(last <= 75000, 'all 30 checked by 75 s, not two minutes later: ' + last);
    assert.ok(listNo > 0, 'the lists still move');
});

import { neverFlipOtherOnce } from '../src/core/items.js';
test('"Other" joins Never flip once: saved choices kept, and a later removal sticks', () => {
    const saved = { neverFlip: ['Clothing', 'Jewelry'], trustedOnly: true };
    const once = neverFlipOtherOnce(saved);
    assert.deepEqual(once.neverFlip, ['Clothing', 'Jewelry', 'Other']);
    assert.equal(once.trustedOnly, true);
    assert.deepEqual(neverFlipOtherOnce({}).neverFlip, ['Clothing', 'Other'], 'nothing saved: the default');
    // You took Other off again: not added back.
    assert.equal(neverFlipOtherOnce({ ...once, neverFlip: ['Clothing'] }), null);
});
