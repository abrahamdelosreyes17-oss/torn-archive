/*
 * 3.17.1: the same work, cheaper (PLAN-speed.md, Part 3 A). Each change here
 * must give exactly what the code before it gave - so each test runs the old
 * way and the new way on the same input and compares the whole result.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buyersForItem } from '../src/core/traders.js';
/** As it was before 3.17.1: every buyer asked whether they are a favourite, up front. */
function favouritesFirstOnTieBefore(buyers, isFav) {
    return (buyers || [])
        .map((b, i) => ({ b, i, f: isFav(b) ? 0 : 1 }))
        .sort((x, y) => (Number(y.b.price) || 0) - (Number(x.b.price) || 0) || x.f - y.f || x.i - y.i)
        .map((x) => x.b);
}

// A small generator with a seed, so a failure can be run again.
function rng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

test('buyers at the same price: names in the order localeCompare gives, as before', () => {
    const names = ['bob', 'Bob', 'alice', 'Álvaro', 'zed', 'Zed', '_under', '123abc', 'émile', 'Emile', 'trader 10', 'trader 9', 'Trader 9', 'ß', 'ss', ''];
    const w3bByItem = new Map([['206', names.map((_, i) => ({ id: String(500 + i), price: 100 }))]]);
    const db = { traders: Object.fromEntries(names.map((name, i) => [String(500 + i), { name }])) };
    const got = buyersForItem('206', { w3bByItem, db }).map((b) => b.name);
    // What the sort was before 3.17.1, on the same rows.
    const before = buyersForItem('206', { w3bByItem, db }).sort((a, b) => b.price - a.price || String(a.name).localeCompare(String(b.name))).map((b) => b.name);
    assert.deepEqual(got, before);
    assert.equal(got.length, names.length);
    // A TornExchange row known by name only takes the TornW3B id of the same trader - with or without other names to look through.
    const te = [{ name: 'Bob', price: 120 }];
    const withTe = buyersForItem('206', { teBest: te, w3bByItem: new Map([['206', [{ id: '501', price: 100 }, { id: '500', price: 90 }]]]), db });
    assert.deepEqual(withTe.map((b) => [b.id, b.name, b.te, b.w3b]), [['501', 'Bob', 120, 100], ['500', 'bob', null, 90]]);
    // And price still comes first.
    const mixed = new Map([['206', [{ id: '500', price: 100 }, { id: '501', price: 300 }, { id: '502', price: 200 }]]]);
    assert.deepEqual(buyersForItem('206', { w3bByItem: mixed, db }).map((b) => b.price), [300, 200, 100]);
});
