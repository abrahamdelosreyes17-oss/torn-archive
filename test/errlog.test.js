import test from 'node:test';
import assert from 'node:assert/strict';

import { addLogEntries, logText, logAsText, LOG_KEEP_MS } from '../src/core/errlog.js';
const NOW = Date.UTC(2026, 8, 29, 14, 0, 0);

test('problem log: a week of lines from every tab, repeats counted, never a key (3.15)', () => {
    let log = addLogEntries(null, [
        { at: NOW - 1000, kind: 'action', where: 'Torn Bids', what: 'Picked item 206 (Xanax)' },
        { at: NOW - 900, kind: 'error', where: 'Torn Bids', what: 'TornExchange failed: An item\'s full list', detail: 'no answer in 30 s' },
        { at: NOW - 800, kind: 'error', where: 'Torn Bids', what: 'TornExchange failed: An item\'s full list', detail: 'no answer in 30 s' },
    ], NOW);
    assert.equal(log.length, 2);
    assert.equal(log[1].times, 2, 'the same failure twice within a minute: one line, x2');
    log = addLogEntries(log, [{ at: NOW - LOG_KEEP_MS - 1, kind: 'note', where: 'x', what: 'old' }], NOW);
    assert.equal(log.length, 2, 'older than a week: dropped');
    assert.equal(logText('https://api.torn.com/user?key=abcdEFGH12345678&x=1'), 'https://api.torn.com/user?key=****&x=1');
    assert.equal(logText('key ABCDEFGH12345678 here'), 'key **** here');
    assert.match(logAsText(log), /ERROR \[Torn Bids\] TornExchange failed: An item's full list - no answer in 30 s \(x2/);
});
