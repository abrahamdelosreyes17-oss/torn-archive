/*
 * TornW3B (weav3r.dev) - the crowd-sourced bazaar price feed.
 *
 * Torn's API has no per-listing bazaar prices a Public key can trust (the
 * `user -> bazaar` selection can be served days old on a Public key, and the
 * `market -> bazaar` selection is a directory with no prices). TornW3B polls
 * bazaars with keys their SELLERS donated, for their own bazaar only, and
 * publishes the result. TornTools, TornPDA and Weav3r's own script read it.
 *
 * Non-negotiables, enforced here rather than by convention:
 *
 *   1. This client NEVER sees a Torn API key - nor any key at all. It has no
 *      key parameter, no getKey, and the only query it ever sends is `comment`
 *      and, since 3.23.0, the whole numbers of W3B_QUERY (one: a count of
 *      hours) - a name not in that list, or a value that is not a whole number
 *      within its range, is dropped. The Torn client and this one share nothing.
 *   2. weav3r.dev is the only destination - asserted on the resolved URL, not
 *      just implied by a constant, exactly as client.js does for api.torn.com.
 *   3. Its own sliding windows, under TornW3B's published limits, and a hard
 *      cooldown on 429 or a non-JSON (Cloudflare challenge) body.
 *
 * TornW3B's published limits (read 2026-10-10), per IP, without a key:
 *
 *   GET /marketplace/{itemId} (an item's full listing)   10 a minute, 1,000 a day
 *   every route together                                 300 a minute
 *   Cloudflare, in front of all of it                    100 a minute
 *   a 429 carries Retry-After
 *
 * So (Torn Archive 1.0.0) there are TWO windows: the one every request draws
 * on (80 a minute, as before), and a second one for the item-listing route
 * alone (9 a minute, 950 a day). The first WAITS for room, as it always has.
 * The second does not: requests go one at a time, so waiting there would hold
 * the summary and the /traders reads behind it - a listing asked for with no
 * room left is refused here, with the time there will be room (`retryAt`).
 *
 * A request refused HERE (the cooldown, the pause while Torn Bids runs, the
 * listing window or day full) throws a W3bError with `local: true`: nothing
 * was sent, so it is not an HTTP error and is never reported through onFailed
 * (onLocal hears of it instead).
 *
 * Responses are cached server-side for 60s, so asking faster is pointless.
 */

import { gmFetch } from '../platform/gm.js';

export const W3B_API_BASE = 'https://weav3r.dev/api/';
export const W3B_HOST = 'weav3r.dev';
export const W3B_TERMS_URL = 'https://weav3r.dev/terms-of-service';
export const W3B_SITE_URL = 'https://weav3r.dev';

/** TornW3B's Cloudflare enforces 100/min per IP; leave 20 for TornTools and friends. */
export const W3B_MAX_PER_MINUTE = 80;

/**
 * Every tab together: each client's own ceiling only limits itself, so two of
 * them made 84/min against TornW3B's 100 per IP before TornTools asked for
 * anything.
 */
export const W3B_SHARED_PER_MINUTE = 80;

/** After a 429 with no Retry-After, or a challenge page, stop asking for this long. */
export const W3B_COOLDOWN_MS = 60000;

/** An item's full listing (GET /marketplace/{itemId}): TornW3B allows 10 a minute and 1,000 a day; one and fifty are left spare. */
export const W3B_LISTING_PER_MINUTE = 9;
export const W3B_LISTING_PER_DAY = 950;

/** A Retry-After is believed between these: never a wait of nothing, never one past a day. */
export const W3B_RETRY_AFTER_MIN_MS = 1000;
export const W3B_RETRY_AFTER_MAX_MS = 24 * 60 * 60 * 1000;

const W3B_HOUR_MS = 60 * 60 * 1000;
/* The day is counted by the hour, over the last 24 whole hours and this one: never less than TornW3B's day, whichever way it counts. */
const W3B_DAY_HOURS = 24;

/*
 * What may ride in a query besides `comment` (3.23.0): an option of TornW3B's
 * own API, a whole number within the range the service takes. Checked on the
 * way out (buildUrl): nothing else can be put in, whoever calls.
 *
 *   tradedWithinHours  /marketplace/{id}/traders: only buyers who traded in
 *                      the last N hours (1-168)
 *
 * `maxPrice` on /marketplace/{id} (only the listings at or under a price) was
 * tried for 3.23.0 and is NOT sent. Measured on the bench (the scene "400
 * items read in turn", with their dearer rows and without): about 12 ms of a
 * 100-140 ms redraw with the processor slowed four times, less than two runs
 * of the same thing differ by - a read "in turn" already keeps only its 10
 * cheapest rows, and the redraw's time is the page, not the rows. And an item
 * with nothing under the trader's price would lose its lowest bazaar price.
 */
const W3B_QUERY = { tradedWithinHours: [1, 168] };

/** A whole number within [min, max], or null. */
function w3bWhole(value, min, max) {
    return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null;
}

export class W3bError extends Error {
    /**
     * @param {string} message
     * @param {object} [options]
     * @param {number|null} [options.http]   - the status TornW3B answered with
     * @param {boolean} [options.blocked]    - TornW3B is refusing us (a 429, a challenge page, or the wait after one)
     * @param {boolean} [options.local]      - refused by THIS client: nothing was sent
     * @param {string|null} [options.reason] - of a local refusal: 'cooldown' | 'paused' | 'listing-minute' | 'listing-day'
     * @param {number|null} [options.retryAt] - when asking again can work (ms), where that is known
     */
    constructor(message, { http = null, blocked = false, local = false, reason = null, retryAt = null } = {}) {
        super(message);
        this.name = 'W3bError';
        this.http = http;
        this.blocked = blocked;
        this.local = local;
        this.reason = reason;
        this.retryAt = retryAt;
        /** Refused because Torn Bids is running (the two scripts take turns). */
        this.takingTurns = reason === 'paused';
    }
}

function w3bSleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Is this the item-listing route (marketplace/{itemId})? Not the summary (marketplace), not marketplace/{id}/traders. */
export function isW3bListingPath(path) {
    return /^marketplace\/[^/?#]+\/?$/.test(String(path).replace(/^\/+/, ''));
}

/**
 * How long a Retry-After asks us to wait, in ms: a number of seconds, or an
 * HTTP date. Null when there is none or it cannot be read (the caller then
 * waits W3B_COOLDOWN_MS).
 */
export function w3bRetryAfterMs(value, now = Date.now()) {
    const text = String(value ?? '').trim();
    if (!text) return null;
    let ms = null;
    if (/^\d+(\.\d+)?$/.test(text)) {
        ms = Number(text) * 1000;
    } else if (/[A-Za-z]{3}/.test(text) && /\d{4}/.test(text)) {
        // An HTTP date ("Wed, 21 Oct 2026 07:28:00 GMT"): nothing looser is taken for one.
        const at = Date.parse(text);
        if (Number.isFinite(at)) ms = at - now;
    }
    if (ms === null || !Number.isFinite(ms)) return null;
    return Math.min(W3B_RETRY_AFTER_MAX_MS, Math.max(W3B_RETRY_AFTER_MIN_MS, Math.ceil(ms)));
}

/** One answer header: gmFetch's `header(name)`, or a fetch Response's `headers.get(name)`. */
function w3bHeader(response, name) {
    try {
        if (response && typeof response.header === 'function') return response.header(name);
        if (response && response.headers && typeof response.headers.get === 'function') return response.headers.get(name);
    } catch {
        // No header to read: the caller falls back.
    }
    return null;
}

export class W3bClient {
    /**
     * @param {object} [options]
     * @param {function} [options.fetchImpl] - injectable for tests
     * @param {number} [options.maxPerMinute]
     * @param {function} [options.perMinute] - () => number: the ceiling right
     *   now, when it is lower than maxPerMinute
     * @param {function} [options.now]
     * @param {function} [options.loadShared] - () => {recent: number[], cooldownUntil}
     *   stored for every tab: one window across all of them, and a 429 seen
     *   by one tab stops them all.
     * @param {function} [options.saveShared] - (state) => void
     * @param {function} [options.addShared] - (at) => void: record one slot of
     *   THIS tab only (platform/tab-window.js), so tabs never overwrite each
     *   other's; without it the whole window is written back through saveShared
     * @param {number} [options.sharedPerMinute]
     * @param {function} [options.sleep] - (ms) => Promise; injectable for tests
     * @param {function} [options.isVisible] - () => boolean; nothing is sent
     *   from a hidden tab, even a request queued while it was visible
     * @param {function} [options.isPaused] - () => boolean; true while Torn
     *   Bids runs: nothing is sent, a queued request is not sent either
     * @param {number} [options.listingPerMinute] - the item-listing route's own window
     * @param {number} [options.listingPerDay]
     * @param {function} [options.loadListing] - () => number[]: every tab's
     *   item-listing requests of the last minute (platform/tab-window.js)
     * @param {function} [options.addListing] - (at) => void: record one of THIS tab's
     * @param {function} [options.loadListingDay] - () => {[hour]: count}, hour = floor(ms / 3,600,000)
     * @param {function} [options.saveListingDay] - (counts) => void
     *   Without these four the counts live in this tab's memory only.
     */
    constructor({
        fetchImpl = gmFetch,
        maxPerMinute = W3B_MAX_PER_MINUTE,
        now = () => Date.now(),
        loadShared = null,
        saveShared = null,
        sharedPerMinute = W3B_SHARED_PER_MINUTE,
        sleep = w3bSleep,
        isVisible = () => true,
        addShared = null,
        onSent = null,
        // ({ path, tag, how: 'ok' | '429' | 'fail' }): how a request that left was answered (the usage record).
        onAnswered = null,
        onFailed = null,
        perMinute = null,
        onOver = null,
        isPaused = () => false,
        onLocal = null,
        listingPerMinute = W3B_LISTING_PER_MINUTE,
        listingPerDay = W3B_LISTING_PER_DAY,
        loadListing = null,
        addListing = null,
        loadListingDay = null,
        saveListingDay = null,
        loadListingOther = null,
    } = {}) {
        this.perMinute = perMinute;
        /**
         * ({count, limit, own}) => void (3.23.0): the minute every tab shares was found OVER
         * sharedPerMinute - tabs learn of each other's requests late, so two can take the same
         * last slot. This tab waits, as always; the report is for the problem log.
         */
        this.onOver = onOver;
        /** ({path, tag}) => void, each request that leaves: the usage record (3.15). */
        this.onSent = onSent;
        this.onAnswered = onAnswered;
        /** ({path, tag, error}) => void, a request that failed: the problem log (3.15). Never a local refusal. */
        this.onFailed = onFailed;
        /** ({path, tag, error}) => void, a request refused here (error.local): nothing was sent. */
        this.onLocal = onLocal;
        this.isPaused = isPaused;
        this.listingPerMinute = listingPerMinute;
        this.listingPerDay = listingPerDay;
        this.loadListing = loadListing;
        this.addListing = addListing;
        this.loadListingDay = loadListingDay;
        this.saveListingDay = saveListingDay;
        /** () => {m: number[], d: {[hour]: count}} | null: the item-listing requests another app on this PC made (Torn Bids), counted with ours. */
        this.loadListingOther = loadListingOther;
        /** This tab's own item-listing requests: the last minute's times, and a count for each hour. */
        this.listingRecent = [];
        this.listingDay = {};
        this.addShared = addShared;
        this.sleep = sleep;
        this.isVisible = isVisible;
        this.fetchImpl = fetchImpl;
        this.maxPerMinute = maxPerMinute;
        this.now = now;
        this.loadShared = loadShared;
        this.saveShared = saveShared;
        this.sharedPerMinute = sharedPerMinute;
        this.recent = [];
        this.chain = Promise.resolve();
        this.cooldownUntil = 0;
    }

    /** What every tab has used, and any wait one of them was told to make. */
    readShared(t) {
        const out = { recent: [], cooldownUntil: 0 };
        if (!this.loadShared) return out;
        let s;
        try {
            s = this.loadShared();
        } catch {
            return out;
        }
        if (!s || typeof s !== 'object') return out;
        if (Array.isArray(s.recent)) out.recent = s.recent.filter((x) => Number.isFinite(x) && t - x < 60000).sort((a, b) => a - b);
        if (Number.isFinite(Number(s.cooldownUntil))) out.cooldownUntil = Number(s.cooldownUntil);
        return out;
    }

    writeShared(state) {
        if (!this.saveShared) return;
        try {
            this.saveShared(state);
        } catch {
            // Sharing is best-effort; this tab still limits itself.
        }
    }

    /** The later of this tab's wait and any other tab's. */
    blockedUntil(t = this.now()) {
        return Math.max(this.cooldownUntil, this.readShared(t).cooldownUntil);
    }

    /** This tab's ceiling now: maxPerMinute, or less while perMinute() says so. Never under 1. */
    limit() {
        if (!this.perMinute) return this.maxPerMinute;
        let n;
        try {
            n = Number(this.perMinute());
        } catch {
            return this.maxPerMinute;
        }
        return Number.isFinite(n) ? Math.max(1, Math.min(this.maxPerMinute, Math.floor(n))) : this.maxPerMinute;
    }

    /** The hour counts worth keeping (the last 24 whole hours and this one), as {[hour]: count}. */
    listingDayCounts(source, t) {
        const out = {};
        if (!source || typeof source !== 'object') return out;
        const hour = Math.floor(t / W3B_HOUR_MS);
        for (const [h, n] of Object.entries(source)) {
            const at = Number(h);
            const count = Math.floor(Number(n));
            if (Number.isInteger(at) && at <= hour && at >= hour - W3B_DAY_HOURS && count > 0) out[at] = count;
        }
        return out;
    }

    /**
     * The item-listing route's two counts (every tab's, where they are shared)
     * and when each has room again.
     * @returns {{minute: number, day: number, minuteFreeAt: number, dayFreeAt: number}} *FreeAt: 0 while there is room
     */
    listingUse(t = this.now()) {
        this.listingRecent = this.listingRecent.filter((x) => t - x < 60000);
        let recent = this.listingRecent;
        if (this.loadListing) {
            try {
                const s = this.loadListing();
                const all = Array.isArray(s) ? s.filter((x) => Number.isFinite(x) && t - x < 60000 && x <= t).sort((a, b) => a - b) : [];
                if (all.length > recent.length) recent = all;
            } catch {
                // Sharing is best-effort; this tab still counts its own.
            }
        }

        this.listingDay = this.listingDayCounts(this.listingDay, t);
        let day = this.listingDay;
        if (this.loadListingDay) {
            try {
                const stored = this.listingDayCounts(this.loadListingDay(), t);
                if (w3bSum(stored) > w3bSum(day)) day = stored;
            } catch {
                // As above.
            }
        }

        // TornW3B counts by address: what another app on this PC asked is in the same minute and day.
        if (this.loadListingOther) {
            try {
                const other = this.loadListingOther();
                const theirs = other && Array.isArray(other.m) ? other.m.filter((x) => Number.isFinite(x) && t - x < 60000 && x <= t) : [];
                if (theirs.length) recent = [...recent, ...theirs].sort((a, b) => a - b);
                const theirDay = this.listingDayCounts(other ? other.d : null, t);
                if (w3bSum(theirDay)) {
                    day = { ...day };
                    for (const [h, n] of Object.entries(theirDay)) day[h] = (day[h] || 0) + n;
                }
            } catch {
                // As above.
            }
        }

        const perMinute = Math.max(1, Math.floor(Number(this.listingPerMinute)) || 1);
        const perDay = Math.max(1, Math.floor(Number(this.listingPerDay)) || 1);
        const dayCount = w3bSum(day);
        const hours = Object.keys(day).map(Number).sort((a, b) => a - b);
        return {
            minute: recent.length,
            day: dayCount,
            // The slot that brings the minute back under its limit, a minute after it was taken.
            minuteFreeAt: recent.length >= perMinute ? recent[recent.length - perMinute] + 60000 : 0,
            // The oldest counted hour leaves the day when the hour after its 24 have passed begins.
            dayFreeAt: dayCount >= perDay && hours.length ? (hours[0] + W3B_DAY_HOURS + 1) * W3B_HOUR_MS : 0,
        };
    }

    /** Count one item-listing request that is about to leave. */
    noteListing(t = this.now()) {
        this.listingRecent.push(t);
        if (this.addListing) {
            try {
                this.addListing(t);
            } catch {
                // Best-effort; this tab still limits itself.
            }
        }

        const hour = Math.floor(t / W3B_HOUR_MS);
        this.listingDay[hour] = (this.listingDay[hour] || 0) + 1;
        if (this.saveListingDay) {
            try {
                const stored = this.listingDayCounts(this.loadListingDay ? this.loadListingDay() : null, t);
                stored[hour] = (stored[hour] || 0) + 1;
                this.saveListingDay(stored);
            } catch {
                // As above.
            }
        }
    }

    stats() {
        const t = this.now();
        const used = this.recent.filter((x) => t - x < 60000).length;
        const listing = this.listingUse(t);
        return {
            usedLastMinute: used,
            remaining: Math.max(0, this.limit() - used),
            coolingDown: t < this.blockedUntil(t),
            sharedLastMinute: this.loadShared ? this.readShared(t).recent.length : used,
            // The item-listing route (marketplace/{itemId}): its own minute and day.
            listingLastMinute: listing.minute,
            listingRemaining: Math.max(0, this.listingPerMinute - listing.minute),
            listingToday: listing.day,
            listingDayRemaining: Math.max(0, this.listingPerDay - listing.day),
            // When a listing can next be asked for: 0 = now.
            listingFreeAt: Math.max(listing.minuteFreeAt, listing.dayFreeAt),
        };
    }

    async waitForSlot() {
        for (;;) {
            // Hidden: take no slot and send nothing until the tab is back.
            if (!this.isVisible()) {
                await this.sleep(1000);
                continue;
            }
            const t = this.now();
            this.recent = this.recent.filter((x) => t - x < 60000);
            const shared = this.readShared(t);
            const sharedFull = this.loadShared && shared.recent.length >= this.sharedPerMinute;
            const limit = this.limit();
            if (this.onOver && this.loadShared && shared.recent.length > this.sharedPerMinute) {
                try {
                    this.onOver({ count: shared.recent.length, limit: this.sharedPerMinute, own: this.recent.length });
                } catch {
                    // The report is best-effort.
                }
            }

            if (this.recent.length < limit && !sharedFull) {
                this.recent.push(t);
                if (this.addShared) {
                    try {
                        this.addShared(t);
                    } catch {
                        // Best-effort; this tab still limits itself.
                    }
                } else if (this.loadShared) {
                    this.writeShared({ ...shared, recent: [...shared.recent, t] });
                }
                return;
            }

            // Wait until every full window has a slot again.
            const frees = [];
            if (this.recent.length >= limit) frees.push(this.recent[this.recent.length - limit]);
            if (sharedFull) frees.push(shared.recent[shared.recent.length - this.sharedPerMinute]);
            await this.sleep(Math.max(50, 60000 - (t - Math.max(...frees)) + 25));
        }
    }

    /** Stop asking - this tab and, through storage, every other. `ms`: what a Retry-After asked for; else the usual minute. */
    coolDown(ms = W3B_COOLDOWN_MS) {
        const t = this.now();
        this.cooldownUntil = t + (Number(ms) > 0 ? Number(ms) : W3B_COOLDOWN_MS);
        if (this.loadShared) this.writeShared({ ...this.readShared(t), cooldownUntil: this.cooldownUntil });
        return this.cooldownUntil;
    }

    /** Build and check a URL. Exposed for tests. `query`: W3B_QUERY's options only. */
    buildUrl(path, query = null) {
        const url = new URL(String(path).replace(/^\/+/, ''), W3B_API_BASE);

        if (url.hostname !== W3B_HOST) {
            throw new W3bError('Refusing to contact ' + url.hostname + '.');
        }

        // Nothing but an attribution comment ever goes in the query - and the whole number of W3B_QUERY.
        url.search = '';
        url.searchParams.set('comment', 'TornArchive');
        for (const [name, [min, max]] of Object.entries(W3B_QUERY)) {
            const n = query && Object.prototype.hasOwnProperty.call(query, name) ? w3bWhole(query[name], min, max) : null;
            if (n !== null) url.searchParams.set(name, String(n));
        }

        return url;
    }

    /** GET one TornW3B path. Serialised, rate-limited, never keyed. `tag`: what it is for (the usage record). */
    get(path, { tag = null, query = null } = {}) {
        const run = () => this.execute(path, tag, query).catch((error) => {
            // Refused here, nothing sent: not a failure of TornW3B's, so not the problem log's.
            const hook = error && error.local ? this.onLocal : this.onFailed;
            if (hook) {
                try {
                    hook({ path, tag, error });
                } catch {
                    // The log is best-effort.
                }
            }
            throw error;
        });
        const promise = this.chain.catch(() => {}).then(run);
        this.chain = promise.catch(() => {});
        return promise;
    }

    /**
     * Why this request may not leave right now, as the error to throw; null
     * when it may. Every one of these is local: nothing was sent.
     */
    refusal(path) {
        let paused = false;
        try {
            paused = !!(this.isPaused && this.isPaused());
        } catch {
            // A hook that throws does not stop the reads.
        }
        if (paused) return new W3bError('Paused while Torn Trading runs.', { local: true, reason: 'paused' });

        const t = this.now();
        const until = this.blockedUntil(t);
        if (t < until) {
            return new W3bError('TornW3B is rate limiting us; paused briefly.', { blocked: true, local: true, reason: 'cooldown', retryAt: until });
        }

        if (isW3bListingPath(path)) {
            const use = this.listingUse(t);
            if (use.dayFreeAt) {
                return new W3bError("TornW3B item listings: today's " + this.listingPerDay + ' are used.', { local: true, reason: 'listing-day', retryAt: use.dayFreeAt });
            }
            if (use.minuteFreeAt) {
                return new W3bError("TornW3B item listings: this minute's " + this.listingPerMinute + ' are used.', { local: true, reason: 'listing-minute', retryAt: use.minuteFreeAt });
            }
        }
        return null;
    }

    async execute(path, tag = null, query = null) {
        let refused = this.refusal(path);
        if (refused) throw refused;

        const url = this.buildUrl(path, query);
        await this.waitForSlot();
        // Another tab may have been blocked, or Torn Bids opened, while this one waited for a slot.
        refused = this.refusal(path);
        if (refused) throw refused;
        if (isW3bListingPath(path)) this.noteListing();

        if (this.onSent) {
            try {
                this.onSent({ path, tag });
            } catch {
                // The usage record is best-effort.
            }
        }

        const answered = (how) => {
            if (!this.onAnswered) return;
            try { this.onAnswered({ path, tag, how }); } catch { /* the usage record is best-effort */ }
        };
        let response;
        try {
            response = await this.fetchImpl(url.toString());
        } catch (error) {
            answered('fail');
            throw new W3bError(
                'TornW3B network error: ' + ((error && error.message) || error),
            );
        }

        if (response.status === 429) {
            // TornW3B says how long to stay away (Retry-After); without it, the usual minute.
            const until = this.coolDown(w3bRetryAfterMs(w3bHeader(response, 'retry-after'), this.now()) ?? W3B_COOLDOWN_MS);
            answered('429');
            throw new W3bError('TornW3B rate limit (429).', {
                http: 429,
                blocked: true,
                retryAt: until,
            });
        }

        if (!response.ok) {
            answered('fail');
            throw new W3bError('TornW3B HTTP ' + response.status, {
                http: response.status,
            });
        }

        try {
            const json = await response.json();
            answered('ok');
            return json;
        } catch {
            // Cloudflare answers a challenge page with HTML, not JSON.
            this.coolDown();
            answered('429');
            throw new W3bError('TornW3B returned a non-JSON page (blocked?).', {
                blocked: true,
            });
        }
    }
}

function w3bSum(counts) {
    let n = 0;
    for (const v of Object.values(counts)) n += Number(v) || 0;
    return n;
}

/**
 * Cheapest bazaar price for every item, in one request.
 *
 * @returns {Promise<Array<{itemId: string, name: string, lowestPrice: number|null,
 *   marketPrice: number|null, bazaarAverage: number|null, totalBazaars: number}>>}
 */
export async function fetchW3bSummary(client, { tag = 'w.summary' } = {}) {
    const data = await client.get('marketplace', { tag });
    const items = data && Array.isArray(data.items) ? data.items : null;

    if (!items) throw new W3bError('TornW3B returned no item summary.');

    return items
        .filter((i) => i && Number.isFinite(Number(i.item_id)))
        .map((i) => ({
            itemId: String(i.item_id),
            name: i.item_name || '',
            lowestPrice: positiveOrNull(i.lowest_price),
            marketPrice: positiveOrNull(i.market_price),
            bazaarAverage: positiveOrNull(i.bazaar_average),
            totalBazaars: Number(i.total_bazaars) || 0,
        }));
}

/**
 * Every bazaar listing TornW3B knows for one item.
 *
 * Retries once when the payload says there are listings but sends none - a
 * known mid-scan glitch. `maxPrice` is deliberately NOT sent (see W3B_QUERY:
 * measured for 3.23.0, it did not help) - every listing is asked for.
 *
 * @returns {Promise<{listings: Array, total: number}>} raw listing objects
 */
export async function fetchW3bListings(client, itemId, { tag = null } = {}) {
    const path = 'marketplace/' + encodeURIComponent(String(itemId));

    let data = await client.get(path, { tag });

    const empty = (d) =>
        d &&
        Number(d.total_listings) > 0 &&
        Array.isArray(d.listings) &&
        d.listings.length === 0;

    if (empty(data)) data = await client.get(path, { tag });

    return {
        listings: data && Array.isArray(data.listings) ? data.listings : [],
        total: Number(data && data.total_listings) || 0,
    };
}

/**
 * Every TornW3B buyer of one item (3.15): GET /api/marketplace/{id}/traders,
 * highest price first, at most 100 (`total_count` says how many there are:
 * 412 for Xanax on 2026-09-29, against ~290 lists we had read). Each comes
 * with their rating and when they were last active - free, where a Torn
 * profile call per trader cost the shared 70/min.
 *
 * `withinHours` (3.23.0): only those who traded in the last N hours are
 * asked for (`tradedWithinHours`) - the 100 of the answer are then not spent
 * on lists nobody trades on. `withinHours` in the answer says what was asked.
 *
 * @returns {Promise<{total: number, withinHours: number|null, traders: Array<{id, name, price, up, down, lastAction, lastTrade, listAt}>}>}
 */
export async function fetchW3bItemTraders(client, itemId, { tag = 'w.buyers', withinHours = null } = {}) {
    const hours = w3bWhole(withinHours, ...W3B_QUERY.tradedWithinHours);
    const data = await client.get('marketplace/' + encodeURIComponent(String(itemId)) + '/traders', { tag, query: hours ? { tradedWithinHours: hours } : null });
    const rows = data && Array.isArray(data.traders) ? data.traders : [];
    const sec = (x) => (Number(x) > 0 ? Number(x) * 1000 : null);
    return {
        total: Number(data && data.total_count) || rows.length,
        withinHours: hours,
        traders: rows
            .filter((t) => t && Number(t.player_id) > 0 && Number(t.price) > 0)
            .map((t) => ({
                id: String(t.player_id),
                name: t.player_name ? String(t.player_name) : null,
                price: Number(t.price),
                up: t.rating && Number.isFinite(Number(t.rating.upvotes)) ? Number(t.rating.upvotes) : null,
                down: t.rating && Number.isFinite(Number(t.rating.downvotes)) ? Number(t.rating.downvotes) : null,
                lastAction: sec(t.last_action),
                lastTrade: sec(t.last_trade),
                listAt: sec(t.pricelist_updated),
            })),
    };
}

/** A trader's price list, as a person sees it on TornW3B. */
export function w3bPriceListUrl(traderId) {
    return W3B_SITE_URL + '/pricelist/' + encodeURIComponent(String(traderId));
}

/**
 * One trader's TornW3B price list: GET /api/pricelist/{tornId}, which returns
 * [{itemId, name, buyPrice, ...}] (buyPrice 0 = not buying). A player with no
 * list gets [] or a 404; both come back as an empty body, not an error.
 *
 * @returns {Promise<Array>} the raw rows (see parseW3bPriceList)
 */
export async function fetchW3bPriceList(client, traderId) {
    const id = String(traderId).replace(/\D/g, '');
    if (!id) throw new W3bError('No trader id.');
    try {
        const body = await client.get('pricelist/' + id);
        return Array.isArray(body) ? body : [];
    } catch (error) {
        if (error && error.http === 404) return [];
        throw error;
    }
}

function positiveOrNull(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
}
