import test from 'node:test';
import assert from 'node:assert/strict';

import { usageAdd, usageMerge, usageSeries, usageLabel, USAGE_MINUTES_KEPT } from '../src/core/usage.js';
const NOW = Date.UTC(2026, 8, 29, 12, 30, 20);

test('usage: requests counted per minute by tag, added to what other tabs stored', () => {
    const mine = {};
    usageAdd(mine, 't.sets', NOW);
    usageAdd(mine, 't.sets', NOW);
    usageAdd(mine, 't.inventory', NOW - 60000);
    usageAdd(mine, 'mystery', NOW);
    const other = usageMerge(null, usageAdd({}, 't.sets', NOW), NOW);
    const all = usageMerge(other, mine, NOW);
    const m = Math.floor(NOW / 60000);
    assert.deepEqual(all.m[m], { 't.sets': 3, 't.other': 1 });
    assert.deepEqual(all.m[m - 1], { 't.inventory': 1 });
    assert.equal(usageLabel('w.nope'), 'w.other');
});

test('usage: a day of minutes, then hours for a week; the chart splits one service by tag', () => {
    let s = usageMerge(null, usageAdd({}, 'w.sets', NOW - (USAGE_MINUTES_KEPT + 5) * 60000), NOW);
    assert.equal(Object.keys(s.m).length, 0, 'folded into its hour');
    assert.equal(Object.keys(s.h).length, 1);
    s = usageMerge(s, usageAdd(usageAdd(usageAdd({}, 'w.sets', NOW), 'w.buyers', NOW), 't.setslog', NOW), NOW);
    const hour = usageSeries(s, { service: 'w', range: '1h', now: NOW });
    assert.equal(hour.bars.length, 60);
    assert.equal(hour.total, 2, 'TornW3B only, this hour');
    assert.deepEqual(hour.bars[59].counts, { 'w.sets': 1, 'w.buyers': 1 });
    const week = usageSeries(s, { service: 'w', range: '7d', now: NOW });
    assert.equal(week.total, 3, 'the folded hour counts in the week');
    assert.equal(week.labels[0].id, 'w.sets');
    assert.equal(week.labels[0].total, 2);
    assert.equal(usageSeries(s, { service: 't', range: '24h', now: NOW }).labels[0].name, 'Your log and your trades');
    // A week later, all gone.
    assert.equal(Object.keys(usageMerge(s, {}, NOW + 8 * 86400000).h).length, 0);
});

// ---- the counts for the shared server -----------------------------------------------------------------------------------

test('the counts for the server: one sum by tag, the biggest 60 sent, what was sent taken off, an hour-old sum let go', async () => {
    const { usageCallsAdd, usageCallsOut, usageCallsSent, USAGE_CALLS_KEEP_MS, usageLabel, usageCsv } = await import('../src/core/usage.js');
    const T = Date.UTC(2026, 9, 11, 17);
    const m = Math.floor(T / 60000);
    let kept = usageCallsAdd(null, { [m]: { 't.inventory': 2, 'w.sets': 4, 'r.w.ok': 3, 'r.w.429': 1 }, [m + 1]: { 't.inventory': 1, 'Bad Tag': 9, 't.none': 0 } }, T);
    assert.deepEqual(kept, { since: T, n: { 't.inventory': 3, 'w.sets': 4, 'r.w.ok': 3, 'r.w.429': 1 } });
    assert.deepEqual(Object.keys(usageCallsOut(kept, T)), ['w.sets', 'r.w.ok', 't.inventory', 'r.w.429'], 'the biggest first');
    // Counted while the answer was awaited: stays, and is young again.
    kept = usageCallsAdd(kept, { [m + 2]: { 't.inventory': 5 } }, T + 1000);
    kept = usageCallsSent(kept, { 't.inventory': 3, 'w.sets': 4, 'r.w.ok': 3, 'r.w.429': 1 }, T + 2000);
    assert.deepEqual(kept, { since: T + 2000, n: { 't.inventory': 5 } });
    assert.deepEqual(usageCallsOut(kept, T + 2000 + USAGE_CALLS_KEEP_MS), { 't.inventory': 5 });
    assert.deepEqual(usageCallsOut(kept, T + 2001 + USAGE_CALLS_KEEP_MS), {}, 'an hour unsent: let go');
    const many = {};
    for (let i = 0; i < 70; i += 1) many['t.a' + i] = 70 - i;
    many['t.huge'] = 9000;
    const out = usageCallsOut({ since: T, n: many }, T);
    assert.equal(Object.keys(out).length, 60);
    assert.equal(out['t.huge'], 5000);
    // How TornW3B answered is its own label, in the export under TornW3B, in no chart.
    assert.equal(usageLabel('r.w.429'), 'r.w.429');
    assert.match(usageCsv({ m: { [m]: { 'r.w.429': 2 } }, h: {} }), /TornW3B,Refused \(429 or a blocked page\),r\.w\.429,2/);
});
