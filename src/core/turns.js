/*
 * Sharing the limits with Torn Bids (the Torn Trading script: its overlay on
 * Torn's pages, and its Torn Bids page). Pure.
 *
 * The owner's rule (2026-10-10, replacing "off while Torn Bids is on"): both
 * run together, and the requests go to the one being looked at. Looking at
 * Torn Archive's page gives Torn Archive the larger share, looking at Torn
 * Bids' page gives it to Torn Bids; on any other page the last one looked at
 * keeps it. Torn counts requests per player and TornW3B per address, so the
 * two shares must fit under one limit.
 *
 * How each learns of the other: two userscripts cannot read each other's
 * stored values, but both pages live on the same site, so both can read that
 * site's own page storage. Two marks are kept there:
 *
 *   tornapps.front    { app: 'archive' | 'trading', at }
 *                     which page was looked at last. Torn Archive writes it
 *                     for both (its script also runs on Torn Bids' page).
 *   tornapps.behind   { app: 'trading', at, torn, w3b }
 *                     written by Torn Bids while it keeps to the smaller
 *                     share because Torn Archive is in front; renewed at
 *                     least once a minute.
 *   tornapps.archive  { app: 'archive', at }
 *                     written by Torn Archive's own page while it is open,
 *                     in view or not, so Torn Bids knows the app it makes
 *                     room for is still there. Left to run out when the
 *                     page is closed: Torn Bids believes it for 150 s.
 *   tornapps.w3b.archive / tornapps.w3b.trading   { at, m, d }
 *                     each app's own requests for an item's full listing on
 *                     TornW3B: `m` the times (ms) of the last minute's, `d`
 *                     a count for each hour (hour = floor(ms / 3,600,000),
 *                     the last 25). TornW3B counts those per address, so
 *                     each app adds the other's to its own before it asks.
 *
 * Going down is done at once; going up waits a minute, so what the other
 * asked in the minute before has left Torn's count. A Torn Bids that does not
 * write `tornapps.behind` (every release before it learns this) keeps its
 * whole limit, so beside it Torn Archive stays on the smaller share even when
 * it is the one in view: 85 + 12 is under Torn's 100.
 *
 * The page side - looking for the host, writing the marks, telling the
 * clients - is not here: this file touches no document and no storage.
 */

/**
 * Torn Bids' own hosts: the overlay on Torn's pages, Torn Bids on its page.
 * The OTHER app's ids, on purpose - Torn Archive's own begin tarc-.
 */
export const TRADING_HOST_IDS = ['ttv2-host', 'ttv2-sell-host'];

/** GM key every tab and the page read: when Torn Bids was last seen. */
export const TRADING_SEEN_KEY = 'tradingSeenAt';

/** GM keys: when Torn Bids' own page, and Torn Archive's own page, were last looked at (in view, with the keyboard). */
export const TRADING_VIEW_KEY = 'tradingViewAt';
export const ARCHIVE_VIEW_KEY = 'archiveViewAt';

/** A page that is being looked at says so at most this often. */
export const VIEW_MARK_EVERY_MS = 5 * 1000;

/** The two marks in the site's own page storage (see the top of this file). */
export const FRONT_MARK = 'tornapps.front';
export const BEHIND_MARK = 'tornapps.behind';
export const ALIVE_MARK = 'tornapps.archive';

/**
 * Torn Archive's page says it is open this often. A tab out of view runs its timers about once a minute, which is
 * still twice inside the 150 s Torn Bids believes the mark.
 */
export const ALIVE_EVERY_MS = 30 * 1000;

/** Torn Bids' "I keep to the smaller share" is believed this long. Over two of a hidden tab's once-a-minute ticks. */
export const BEHIND_FRESH_MS = 150 * 1000;

/** The larger share is taken this long after coming to the front. */
export const RAMP_MS = 60 * 1000;

/**
 * Torn Bids counts as running this long after it was last seen. Two minutes, not one (Pumping Iron, round 7
 * review): Chrome's intensive throttling runs a hidden tab's timers about once a minute, so a tab that still runs
 * Torn Bids can mark it seen only every ~60 s; a 60 s grace let the mark flicker off between two of them.
 */
export const TRADING_GRACE_MS = 120 * 1000;

/** A tab looks for Torn Bids' host this often (one getElementById), hidden tabs too. */
export const TRADING_LOOK_EVERY_MS = 5 * 1000;

/** A tab that sees Torn Bids notes it at most this often (one small GM write). */
export const TRADING_MARK_EVERY_MS = 15 * 1000;

/** Torn Bids' own limits, which Torn Archive may use while it runs alone. */
export const TORN_PER_MINUTE_ALONE = 85;
export const W3B_PER_MINUTE_ALONE = 80;

/**
 * Requests a minute. `behind` is also what is left beside a Torn Bids that keeps its whole limit: Torn allows
 * 100 and Torn Bids takes up to 85.
 */
export const SHARES = Object.freeze({
    alone: Object.freeze({ torn: TORN_PER_MINUTE_ALONE, w3b: W3B_PER_MINUTE_ALONE }),
    front: Object.freeze({ torn: 70, w3b: 65 }),
    behind: Object.freeze({ torn: 12, w3b: 8 }),
});

/**
 * Is Torn Bids on this page right now? Read only: its host is looked for and never touched.
 * @param {{getElementById: function(string): *}|null} doc - the document, or anything that answers getElementById
 */
export function tradingOnPage(doc) {
    if (!doc || typeof doc.getElementById !== 'function') return false;
    return TRADING_HOST_IDS.some((id) => !!doc.getElementById(id));
}

/** Is Torn Bids running now (seen within the grace period)? */
export function tradingRunning(seenAt, now) {
    const t = Number(seenAt) || 0;
    return t > 0 && now - t < TRADING_GRACE_MS;
}

/** Should this tab write a fresh "seen" mark? */
export function shouldMarkSeen(seenAt, now) {
    const t = Number(seenAt) || 0;
    // A mark from the future (the clock moved back) is replaced, or it would never be renewed.
    return !(t > 0) || now - t >= TRADING_MARK_EVERY_MS || t > now;
}

/** Should a page that is being looked at say so again? */
export function shouldMarkView(viewAt, now) {
    const t = Number(viewAt) || 0;
    return !(t > 0) || now - t >= VIEW_MARK_EVERY_MS || t > now;
}

/** Is it time for Torn Archive's page to say again that it is open? Also after the clock was set back. */
export function shouldMarkAlive(lastAt, now) {
    const t = Number(lastAt) || 0;
    return !(t > 0) || now - t >= ALIVE_EVERY_MS || t > now;
}

export const W3B_MARK = 'tornapps.w3b.archive';
export const W3B_OTHER_MARK = 'tornapps.w3b.trading';
const W3B_MARK_HOURS = 24;
const W3B_MARK_MOST = 200;

/** Our own item-listing requests on TornW3B as a mark: the last minute's times, and a count for each hour. */
export function w3bMarkText(times, day, now) {
    const got = readW3bMark(JSON.stringify({ at: now, m: times, d: day }), now);
    return JSON.stringify({ at: now, m: got ? got.m : [], d: got ? got.d : {} });
}

/**
 * The other app's item-listing requests, read back from the page storage: only what still counts at `now`.
 * @returns {{m: number[], d: Object<string, number>}|null} null when it is missing or not such a mark
 */
export function readW3bMark(text, now) {
    if (typeof text !== 'string' || !text) return null;
    let mark = null;
    try { mark = JSON.parse(text); } catch { return null; }
    if (!mark || typeof mark !== 'object' || Array.isArray(mark)) return null;
    const m = (Array.isArray(mark.m) ? mark.m : []).filter((x) => typeof x === 'number' && Number.isFinite(x) && x <= now && now - x < 60000).sort((a, b) => a - b).slice(-W3B_MARK_MOST);
    const hour = Math.floor(now / 3600000);
    const d = {};
    for (const [h, n] of Object.entries(mark.d && typeof mark.d === 'object' && !Array.isArray(mark.d) ? mark.d : {})) {
        const at = Number(h);
        const count = Math.floor(Number(n));
        if (Number.isInteger(at) && at <= hour && at >= hour - W3B_MARK_HOURS && count > 0) d[at] = Math.min(count, 100000);
    }
    return { m, d };
}

/** One of the marks as text, for the site's page storage. */
export function markText(mark) {
    return JSON.stringify(mark);
}

/** A mark read back from the page storage: null when it is missing or not one of ours. */
export function readMark(text) {
    if (typeof text !== 'string' || !text) return null;
    let m = null;
    try { m = JSON.parse(text); } catch { return null; }
    if (!m || typeof m !== 'object' || (m.app !== 'archive' && m.app !== 'trading')) return null;
    const at = Number(m.at);
    if (!(at > 0)) return null;
    const count = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 && v !== null && v !== '' ? Math.floor(Number(v)) : null);
    return { app: m.app, at, torn: count(m.torn), w3b: count(m.w3b) };
}

/** Is Torn Archive the one in front: its page looked at later than Torn Bids' page? Never looked at either: Torn Bids. */
export function archiveInFront(archiveViewAt, tradingViewAt) {
    return (Number(archiveViewAt) || 0) > (Number(tradingViewAt) || 0);
}

/**
 * What Torn Archive may ask a minute, now.
 *
 * @param {object} i
 * @param {number} i.now
 * @param {number} i.tradingSeenAt   when Torn Bids was last seen running (0 = never)
 * @param {number} i.tradingViewAt   when Torn Bids' page was last looked at
 * @param {number} i.archiveViewAt   when Torn Archive's page was last looked at
 * @param {object|null} i.behind     readMark() of the page's `tornapps.behind`
 * @param {number} i.frontSince      when Torn Archive came to the front (0 = it is not)
 * @returns {{mode: 'alone'|'front'|'behind', why: ''|'trading-in-view'|'no-answer'|'ramp', torn: number, w3b: number}}
 */
export function shareNow({ now, tradingSeenAt = 0, tradingViewAt = 0, archiveViewAt = 0, behind = null, frontSince = 0 }) {
    if (!tradingRunning(tradingSeenAt, now)) return { mode: 'alone', why: '', ...SHARES.alone };
    const back = (why) => ({ mode: 'behind', why, ...SHARES.behind });
    if (!archiveInFront(archiveViewAt, tradingViewAt)) return back('trading-in-view');
    // Only a Torn Bids that says it keeps to the smaller share has made room.
    const said = behind && behind.app === 'trading' && behind.at <= now + 1000 && now - behind.at < BEHIND_FRESH_MS;
    if (!said) return back('no-answer');
    if (!(frontSince > 0) || now - frontSince < RAMP_MS) return back('ramp');
    // What Torn Bids says it keeps comes off what the two may ask together; never over the front share.
    const room = (kind) => {
        const theirs = behind[kind] == null ? SHARES.alone[kind] - SHARES.front[kind] : behind[kind];
        return Math.max(SHARES.behind[kind], Math.min(SHARES.front[kind], SHARES.alone[kind] - theirs));
    };
    return { mode: 'front', why: '', torn: room('torn'), w3b: room('w3b') };
}
