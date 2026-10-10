// Which of Torn Archive's own tabs does the reading, when more than one is open. One at a time: the first to
// open, until it closes (its mark goes stale) or you press "Use this tab" in another. The tab that reads does so
// in view or not: a new trade has to be noticed while you are on Torn.

export const HUB_LEAD_KEY = 'hubLead';
/** The reading tab writes its mark this often... */
export const HUB_LEAD_BEAT_MS = 5 * 1000;
/** ...and a mark this old is a tab that closed. Longer than a hidden tab's slowed timers (once a minute). */
export const HUB_LEAD_STALE_MS = 150 * 1000;

/**
 * @param record { id, ts } as stored, or null
 * @param me     this tab's id
 * @param o      { now, claim } - claim: you asked for this tab
 * @returns { lead, write } - write: the mark to store, or null to leave it
 */
export function hubLeader(record, me, { now, claim = false, staleMs = HUB_LEAD_STALE_MS } = {}) {
    const ts = record ? Number(record.ts) : NaN;
    // A mark from the future (the clock moved back) is no one's.
    const held = !!(record && record.id && Number.isFinite(ts) && now - ts < staleMs && ts <= now + 1000);
    if (claim || !held || record.id === me) return { lead: true, write: { id: me, ts: now } };
    return { lead: false, write: null };
}
