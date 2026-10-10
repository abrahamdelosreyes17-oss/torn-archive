import test from 'node:test';
import assert from 'node:assert/strict';
import { hubLeader, HUB_LEAD_STALE_MS } from '../src/core/hub-leader.js';

test('one tab reads: the first to open, until its mark goes stale or you ask for another', () => {
    const now = 1_000_000;
    // Nobody yet: this tab reads, and says so.
    assert.deepEqual(hubLeader(null, 'a', { now }), { lead: true, write: { id: 'a', ts: now } });
    // Another tab holds a fresh mark: this one waits and writes nothing.
    assert.deepEqual(hubLeader({ id: 'b', ts: now - 4000 }, 'a', { now }), { lead: false, write: null });
    // Its own mark: kept up.
    assert.equal(hubLeader({ id: 'a', ts: now - 4000 }, 'a', { now }).lead, true);
    // The other tab closed (its mark is old), or gave the reading up: taken over.
    assert.equal(hubLeader({ id: 'b', ts: now - HUB_LEAD_STALE_MS - 1 }, 'a', { now }).lead, true);
    assert.equal(hubLeader({ id: null, ts: 0 }, 'a', { now }).lead, true);
    // "Use this tab": taken at once, whoever held it.
    assert.deepEqual(hubLeader({ id: 'b', ts: now - 10 }, 'a', { now, claim: true }), { lead: true, write: { id: 'a', ts: now } });
    // A mark from the future (the clock moved back) is no one's.
    assert.equal(hubLeader({ id: 'b', ts: now + 60000 }, 'a', { now }).lead, true);
});
