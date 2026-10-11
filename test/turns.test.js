/*
 * Sharing the limits with Torn Bids (core/turns.js; the owner's rule, 2026-10-10: both run together, the requests
 * go to the one being looked at).
 */
import test from 'node:test';
import { W3B_MARK, W3B_OTHER_MARK, w3bMarkText, readW3bMark } from '../src/core/turns.js';
import assert from 'node:assert/strict';

import {
    TRADING_HOST_IDS,
    TRADING_SEEN_KEY,
    TRADING_VIEW_KEY,
    ARCHIVE_VIEW_KEY,
    TRADING_GRACE_MS,
    TRADING_LOOK_EVERY_MS,
    TRADING_MARK_EVERY_MS,
    VIEW_MARK_EVERY_MS,
    BEHIND_FRESH_MS,
    RAMP_MS,
    TORN_PER_MINUTE_ALONE,
    W3B_PER_MINUTE_ALONE,
    SHARES,
    FRONT_MARK,
    BEHIND_MARK,
    tradingOnPage,
    tradingRunning,
    shouldMarkSeen,
    shouldMarkView,
    markText,
    readMark,
    ALIVE_MARK,
    ALIVE_EVERY_MS,
    shouldMarkAlive,
    archiveInFront,
    shareNow,
} from '../src/core/turns.js';
import { TornApiClient } from '../src/api/client.js';
import { W3B_MAX_PER_MINUTE, W3B_SHARED_PER_MINUTE } from '../src/api/w3b.js';

const NOW = 1_790_000_000_000;
const SEC = 1000;
/** Torn itself allows this many a minute per player; Torn Bids takes up to 85 of them. */
const TORN_ALLOWS = 100;
const TORN_BIDS_TAKES = 85;

test('the hosts looked for are Torn Bids\' own, never ours; alone, Torn Archive has its limits', () => {
    assert.deepEqual(TRADING_HOST_IDS, ['ttv2-host', 'ttv2-sell-host']);
    assert.ok(TRADING_HOST_IDS.every((id) => !id.startsWith('tarc-')), 'our own host is not a sign of Torn Bids');
    assert.equal(TORN_PER_MINUTE_ALONE, 85);
    assert.equal(W3B_PER_MINUTE_ALONE, 80);
    // The clients' own defaults are those limits.
    assert.equal(new TornApiClient({ getKey: () => 'x' }).maxPerMinute, TORN_PER_MINUTE_ALONE);
    assert.equal(W3B_MAX_PER_MINUTE, W3B_PER_MINUTE_ALONE);
    assert.equal(W3B_SHARED_PER_MINUTE, W3B_PER_MINUTE_ALONE);
    assert.equal(TRADING_GRACE_MS, 120 * SEC, 'two minutes');
    assert.equal(TRADING_LOOK_EVERY_MS, 5 * SEC);
    assert.equal(TRADING_MARK_EVERY_MS, 15 * SEC);
    assert.equal(new Set([TRADING_SEEN_KEY, TRADING_VIEW_KEY, ARCHIVE_VIEW_KEY]).size, 3);
    assert.notEqual(FRONT_MARK, BEHIND_MARK);
});

test('the shares fit: in front and behind together are no more than alone, and behind fits beside a whole Torn Bids', () => {
    assert.deepEqual(SHARES.alone, { torn: TORN_PER_MINUTE_ALONE, w3b: W3B_PER_MINUTE_ALONE });
    for (const kind of ['torn', 'w3b']) {
        assert.ok(SHARES.front[kind] + SHARES.behind[kind] <= SHARES.alone[kind], kind);
        assert.ok(SHARES.behind[kind] >= 1 && SHARES.behind[kind] < SHARES.front[kind], kind);
    }
    assert.ok(TORN_BIDS_TAKES + SHARES.behind.torn <= TORN_ALLOWS, 'a Torn Bids that keeps its whole limit, and us behind it');
    // A hidden tab ticks once a minute: its "I keep to less" must outlive two of those.
    assert.ok(BEHIND_FRESH_MS > 2 * 60 * SEC);
    assert.equal(RAMP_MS, 60 * SEC, 'a minute: what the other asked has left Torn\'s count');
});

test('Torn Bids on this page: either of its hosts, read only; no document, nothing seen', () => {
    const asked = [];
    const page = (ids) => ({ getElementById: (id) => (asked.push(id), ids.includes(id) ? { id } : null) });
    assert.equal(tradingOnPage(page(['ttv2-host'])), true);
    assert.equal(tradingOnPage(page(['ttv2-sell-host'])), true);
    assert.equal(tradingOnPage(page(['tarc-host'])), false, 'our own host is not Torn Bids');
    assert.equal(tradingOnPage(page([])), false);
    assert.equal(tradingOnPage(null), false);
    assert.equal(tradingOnPage({}), false);
    assert.ok(asked.every((id) => TRADING_HOST_IDS.includes(id)), 'nothing else is looked for');
});

test('Torn Bids counts as running for two minutes after it was last seen', () => {
    assert.equal(tradingRunning(0, NOW), false, 'never seen');
    assert.equal(tradingRunning(null, NOW), false);
    assert.equal(tradingRunning(NOW, NOW), true);
    assert.equal(tradingRunning(NOW - TRADING_GRACE_MS + 1, NOW), true);
    assert.equal(tradingRunning(NOW - TRADING_GRACE_MS, NOW), false, 'exactly two minutes: over');
});

test('a tab that sees Torn Bids marks it at most every 15 s, a page looked at every 5 s; a mark from the future is replaced', () => {
    assert.equal(shouldMarkSeen(0, NOW), true, 'never marked');
    assert.equal(shouldMarkSeen(NOW - 14 * SEC, NOW), false);
    assert.equal(shouldMarkSeen(NOW - 15 * SEC, NOW), true);
    assert.equal(shouldMarkSeen(NOW + 60 * SEC, NOW), true, 'the clock moved back');
    assert.equal(VIEW_MARK_EVERY_MS, 5 * SEC);
    assert.equal(shouldMarkView(0, NOW), true);
    assert.equal(shouldMarkView(NOW - 4 * SEC, NOW), false);
    assert.equal(shouldMarkView(NOW - 5 * SEC, NOW), true);
    assert.equal(shouldMarkView(NOW + 60 * SEC, NOW), true);
});

test('the marks in the page storage: read back as written, anything else is nothing', () => {
    assert.deepEqual(readMark(markText({ app: 'archive', at: NOW })), { app: 'archive', at: NOW, torn: null, w3b: null });
    assert.deepEqual(readMark(markText({ app: 'trading', at: NOW, torn: 15, w3b: 10 })), { app: 'trading', at: NOW, torn: 15, w3b: 10 });
    assert.deepEqual(readMark('{"app":"trading","at":' + NOW + ',"torn":"junk","w3b":-4}'), { app: 'trading', at: NOW, torn: null, w3b: null });
    for (const junk of [null, undefined, '', 'junk', '[]', '{}', '{"app":"gym","at":5}', '{"app":"trading"}', '{"app":"trading","at":0}', 42]) assert.equal(readMark(junk), null, String(junk));
});

test('who is in front: the page looked at last; neither ever looked at: Torn Bids', () => {
    assert.equal(archiveInFront(NOW, NOW - SEC), true);
    assert.equal(archiveInFront(NOW - SEC, NOW), false);
    assert.equal(archiveInFront(0, 0), false);
    assert.equal(archiveInFront(NOW, 0), true);
    assert.equal(archiveInFront(null, undefined), false);
});

test('alone: the whole limit, whatever was looked at', () => {
    assert.deepEqual(shareNow({ now: NOW }), { mode: 'alone', why: '', torn: 85, w3b: 80 });
    assert.deepEqual(shareNow({ now: NOW, tradingSeenAt: NOW - TRADING_GRACE_MS, tradingViewAt: NOW - TRADING_GRACE_MS }), { mode: 'alone', why: '', torn: 85, w3b: 80 });
});

test('Torn Bids on and looked at last: Torn Archive is behind, at once', () => {
    const s = shareNow({ now: NOW, tradingSeenAt: NOW - SEC, tradingViewAt: NOW - SEC, archiveViewAt: NOW - 30 * SEC, behind: { app: 'trading', at: NOW, torn: 15, w3b: 15 }, frontSince: 0 });
    assert.deepEqual(s, { mode: 'behind', why: 'trading-in-view', ...SHARES.behind });
    // Never looked at either page: Torn Bids keeps the front.
    assert.equal(shareNow({ now: NOW, tradingSeenAt: NOW }).why, 'trading-in-view');
});

test('Torn Archive looked at last, beside a Torn Bids that does not say it keeps to less: still behind', () => {
    const base = { now: NOW, tradingSeenAt: NOW - SEC, tradingViewAt: NOW - 10 * 60 * SEC, archiveViewAt: NOW - SEC, frontSince: NOW - 10 * 60 * SEC };
    assert.deepEqual(shareNow({ ...base, behind: null }), { mode: 'behind', why: 'no-answer', ...SHARES.behind });
    // Said too long ago, said by us, or dated in the future: not believed.
    assert.equal(shareNow({ ...base, behind: { app: 'trading', at: NOW - BEHIND_FRESH_MS, torn: 15, w3b: 15 } }).why, 'no-answer');
    assert.equal(shareNow({ ...base, behind: { app: 'archive', at: NOW, torn: 15, w3b: 15 } }).why, 'no-answer');
    assert.equal(shareNow({ ...base, behind: { app: 'trading', at: NOW + 60 * SEC, torn: 15, w3b: 15 } }).why, 'no-answer');
});

test('Torn Archive in front, Torn Bids keeping to less: the larger share, a minute after coming to the front', () => {
    const behind = { app: 'trading', at: NOW - 20 * SEC, torn: 15, w3b: 15 };
    const base = { now: NOW, tradingSeenAt: NOW - SEC, tradingViewAt: NOW - 5 * 60 * SEC, archiveViewAt: NOW - SEC, behind };
    assert.deepEqual(shareNow({ ...base, frontSince: NOW - RAMP_MS + 1 }), { mode: 'behind', why: 'ramp', ...SHARES.behind });
    assert.deepEqual(shareNow({ ...base, frontSince: 0 }), { mode: 'behind', why: 'ramp', ...SHARES.behind });
    assert.deepEqual(shareNow({ ...base, frontSince: NOW - RAMP_MS }), { mode: 'front', why: '', torn: 70, w3b: 65 });
    // Torn Bids says it keeps more than we thought: that comes off ours. Says less: we still take no more than the front share.
    assert.deepEqual(shareNow({ ...base, frontSince: NOW - RAMP_MS, behind: { ...behind, torn: 40, w3b: 30 } }), { mode: 'front', why: '', torn: 45, w3b: 50 });
    assert.deepEqual(shareNow({ ...base, frontSince: NOW - RAMP_MS, behind: { ...behind, torn: 0, w3b: 0 } }), { mode: 'front', why: '', torn: 70, w3b: 65 });
    // It gives no numbers: taken as the rest of the limit beside our front share.
    assert.deepEqual(shareNow({ ...base, frontSince: NOW - RAMP_MS, behind: { ...behind, torn: null, w3b: null } }), { mode: 'front', why: '', torn: 70, w3b: 65 });
    // It says it keeps everything: we are never under the smaller share.
    assert.deepEqual(shareNow({ ...base, frontSince: NOW - RAMP_MS, behind: { ...behind, torn: 85, w3b: 80 } }), { mode: 'front', why: '', ...SHARES.behind });
});

test('whatever is said, the two together stay under what we allow ourselves', () => {
    for (const torn of [null, 0, 5, 15, 40, 85, 500]) {
        const s = shareNow({ now: NOW, tradingSeenAt: NOW, tradingViewAt: 1, archiveViewAt: NOW, behind: { app: 'trading', at: NOW, torn, w3b: torn }, frontSince: NOW - RAMP_MS });
        const theirs = torn == null ? 15 : Math.min(torn, TORN_BIDS_TAKES);
        assert.ok(s.torn + theirs <= TORN_ALLOWS, 'Torn Bids ' + torn + ', us ' + s.torn);
        assert.ok(s.torn >= SHARES.behind.torn && s.torn <= SHARES.front.torn);
    }
});

test('the page of Torn Archive says it is open, for Torn Trading: every 30 s, twice inside the 150 s it is believed out of view', () => {
    assert.equal(ALIVE_MARK, 'tornapps.archive');
    assert.equal(shouldMarkAlive(0, NOW), true, 'never said');
    assert.equal(shouldMarkAlive(NOW - ALIVE_EVERY_MS + 1, NOW), false);
    assert.equal(shouldMarkAlive(NOW - ALIVE_EVERY_MS, NOW), true);
    assert.equal(shouldMarkAlive(NOW + 5000, NOW), true, 'the clock was set back');
    // A tab out of view ticks about once a minute: still two marks inside what Torn Trading believes.
    assert.ok(2 * 60000 + ALIVE_EVERY_MS <= BEHIND_FRESH_MS);
    assert.deepEqual(readMark(markText({ app: 'archive', at: NOW })), { app: 'archive', at: NOW, torn: null, w3b: null });
});

test('item listings asked of TornW3B are told to Torn Trading, and its own read back: only what still counts', () => {
    assert.equal(W3B_MARK, 'tornapps.w3b.archive');
    assert.equal(W3B_OTHER_MARK, 'tornapps.w3b.trading');
    const hour = Math.floor(NOW / 3600000);
    const text = w3bMarkText([NOW - 70000, NOW - 5000, NOW - 30000, 'x'], { [hour]: 4, [hour - 24]: 2, [hour - 25]: 9, junk: 3 }, NOW);
    assert.deepEqual(JSON.parse(text), { at: NOW, m: [NOW - 30000, NOW - 5000], d: { [hour - 24]: 2, [hour]: 4 } });
    assert.deepEqual(readW3bMark(text, NOW), { m: [NOW - 30000, NOW - 5000], d: { [hour - 24]: 2, [hour]: 4 } });
    // Read later: the minute has passed, the hours stay until they leave the day.
    assert.deepEqual(readW3bMark(text, NOW + 60000), { m: [], d: { [hour - 24]: 2, [hour]: 4 } });
    assert.deepEqual(readW3bMark(text, NOW + 2 * 3600000).d, { [hour]: 4 });
    for (const bad of [null, '', 'x', '[]', '7', 'null']) assert.equal(readW3bMark(bad, NOW), null);
    assert.deepEqual(readW3bMark('{"m":"x","d":[1]}', NOW), { m: [], d: {} });
});
