/*
 * The shared server, Torn Archive's side. Pure: no clock, no storage, no network.
 *
 * The server (a folder of the owner's, deployed by him; Torn Trading talks to the same one) reads other players'
 * bazaars from Torn with a key of each of us and hands every PC what changed. Every 30 s Torn Archive tells it
 * how much of your Torn limit it is using and which bazaars and pieces matter to it; it answers with its part of
 * the limit and with every bazaar that changed. The server keeps what each app says apart, so Torn Archive and
 * Torn Trading never overwrite each other there - which is why an older server, that keeps one list a person,
 * is never synced with (serverKnowsApps).
 *
 * What may be sent is made here and checked here on the way out: player ids, item ids, prices, counts and ages.
 * No name, no key, nothing about your inventory, your money or your books. And, since 1.2.0, how many requests this
 * PC made of TornW3B and Torn since the last exchange, by what for (`calls`: counts only - core/usage.js).
 *
 * With no address and password saved none of this runs. With the server silent, what it said ages out and
 * Torn Archive works alone, as before.
 */

import { USAGE_CALLS_TAG, USAGE_CALLS_TAGS_MAX, USAGE_CALLS_COUNT_MAX } from './usage.js';

/** The name Torn Archive gives itself: the server keeps each app's lists under it. */
export const SERVER_APP = 'torn-archive';
export const SERVER_SYNC_MS = 30000;
/** Of Torn's 100 calls a minute per person, 20 are never used by the server or a PC (the server's budget.js). */
const SV_USABLE = 80;
/** No answer for this long: Torn Archive is on its own again. */
export const SERVER_GRANT_STALE_MS = 5 * 60000;
/** A bazaar the server has not confirmed for this long is forgotten here. */
export const SERVER_KEEP_MS = 3 * 60 * 60000;
/** Another PC's read of a TornW3B list counts for this long, and a buy is passed on this long. */
export const SERVER_DIR_KEEP_MS = 30 * 60000;
export const SERVER_BOUGHT_MS = 30 * 60000;
/** A list that is another PC's to read first: waited for this long past due, then read here. */
export const SERVER_TURN_WAIT_MS = 45000;
/** The server sends at most this many bazaars in one answer; a full answer means there are more. */
export const SERVER_PAGE = 400;
/** The server silent this long: said as "no answer". */
export const SERVER_QUIET_MS = 2 * 60000;
const SV_MAX_SELLERS = 3000;
const SV_MAX_NEAR = 200;
const SV_MAX_BOUGHT = 200;
const SV_MAX_DIR = 300;
// Your own list's part for whole sets: a set's key as core/sets.js writes it, and the most a count may say.
const SV_OWN_SET = /^[a-z]{1,16}$/;
const SV_OWN_SETS_MAX = 8;
const SV_OWN_COUNT_MAX = 1000000;
const SV_BODY_KEYS = ['app', 'ver', 'used', 'waiting', 'sellers', 'trades', 'looking', 'worth', 'since', 'seen', 'going', 'bought', 'dir', 'need', 'calls', 'own'];
/** The server's read of the points market or of a piece's Item Market is used while it is no older than this. */
export const SERVER_MARKET_FRESH_MS = 3 * 60000;
const SV_MAX_ROWS = 20;
const SV_MAX_POINT_ROWS = 150;

/** The server's address as typed, or null: https and a workers.dev name only (the one host the script may reach). */
export function serverAddress(typed) {
    const text = String(typed ?? '').trim();
    if (!text) return null;
    let url;
    try { url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch { return null; }
    if (url.protocol !== 'https:' || !/^[a-z0-9-]+(\.[a-z0-9-]+)*\.workers\.dev$/.test(url.hostname)) return null;
    return url.origin;
}

/** A password as the server's set-up makes them: letters and digits, 24 or more. */
export const serverPassOk = (pass) => typeof pass === 'string' && /^[A-Za-z0-9]{24,200}$/.test(pass);

/** A word this copy made for itself, once (48 hex): what the server knows the copy by after it was let in. */
export const serverDeviceOk = (device) => typeof device === 'string' && /^[0-9a-f]{48}$/.test(device);

/**
 * What Torn Archive says to the server built into it when nothing was typed: whose copy this is. Torn Archive
 * holds no Public key, so it cannot say a key's word as Torn Trading does. This is no secret: the server lets it
 * in only from an address it has seen that person at, and only for Torn Archive's own exchange (the server's
 * ARCHIVE_CLAIM). With `device`, the copy's own word goes after the id: a copy the server let in once is known
 * by it afterwards wherever it asks from - an address changes, the copy is the same.
 */
export function serverClaim(id, device = '') {
    const n = /^\d{1,10}$/.test(String(id ?? '')) ? Number(id) : 0;
    return n > 0 ? 'TornArchiveSameAddress' + String(n).padStart(10, '0') + (serverDeviceOk(device) ? 'x' + device : '') : null;
}

/**
 * Turned away by the server, and Torn has said "too many": the most Torn Archive lets itself make a minute, so
 * that it and the server's careful part of the same key fit in Torn's limit. It says what it uses meanwhile, this
 * often, and the server takes that much less (the server's HINT_MOST is this number: budget.js).
 */
export const SERVER_CAREFUL_MOST = 40;
export const SERVER_HINT_MS = 60000;

/** What a turned-away copy says: how much of your Torn limit it uses. Nothing else. */
export function serverHint({ ver = '', used = 0, waiting = 0 } = {}) {
    const count = (n) => (Number.isFinite(n) && n > 0 ? Math.min(1000, Math.floor(n)) : 0);
    const body = { app: SERVER_APP, used: count(used), waiting: count(waiting) };
    if (serverVersion(ver)) body.ver = serverVersion(ver);
    return body;
}

/** A version as the server takes it. */
export const serverVersion = (v) => (typeof v === 'string' && /^[0-9A-Za-z.+-]{1,40}$/.test(v) ? v : '');

const svId = (value) => {
    const n = typeof value === 'string' && /^\d{1,10}$/.test(value) ? Number(value) : value;
    return Number.isInteger(n) && n > 0 && n < 1e10 ? n : null;
};
const svWhole = (n, max) => (Number.isInteger(n) && n >= 0 && n <= max ? n : null);

function svIds(lists, max) {
    const out = new Set();
    for (const list of lists) {
        for (const value of Array.isArray(list) ? list : []) {
            const id = svId(value);
            if (id !== null) out.add(id);
            if (out.size >= max) return [...out];
        }
    }
    return [...out];
}

/**
 * May Torn Archive make one Torn call now? Its own calls of the last minute, one more, and the server's part
 * must fit in what is usable. No grant, or one too old to trust: it is on its own.
 * @param grant {at, need, serverShare, serverTimes} in this PC's time (serverGrantIn)
 */
export function serverMayCall(grant, pcTimes, now) {
    if (!grant || !Number.isFinite(grant.at) || now - grant.at > SERVER_GRANT_STALE_MS) return true;
    let mine = 0;
    for (const t of pcTimes || []) if (now - t < 60000) mine += 1;
    let lingering = 0;
    for (const t of Array.isArray(grant.serverTimes) ? grant.serverTimes : []) if (now - t < 60000) lingering += 1;
    const share = Number.isFinite(grant.serverShare) ? Math.max(0, grant.serverShare) : 0;
    return mine + 1 + Math.max(lingering, share) <= SV_USABLE;
}

/** Torn Trading's name on the server, and how long "it reports there too" is believed after an answer said so. */
export const SERVER_TRADING_APP = 'torn-bids';
export const SERVER_BESIDE_FRESH_MS = 2 * 60000;
/** Everything the server may split of one person's limit (its budget.js: 100 less the 20 nobody uses). */
export const SERVER_WHOLE = 80;

/**
 * What this PC uses of your Torn limit, as the server is told. Torn Archive counts only its own calls. A Torn
 * Trading running on this PC that does not report to the server itself (every release from before it learned to)
 * keeps its whole limit and makes room for nobody - so the whole limit is reported for it, and the server leaves
 * your key alone for as long as it runs. One that reports is counted by the server from its own words.
 * @param own { used, waiting } - Torn Archive's own
 * @param o { tradingOn, beside: [app names the server last said report from this PC], besideAt, now }
 * @returns { used, waiting, whole } - whole: the limit was reported for Torn Trading
 */
export function serverUse(own, { tradingOn = false, beside = [], besideAt = 0, now = 0 } = {}) {
    const used = Number.isFinite(own && own.used) && own.used > 0 ? own.used : 0;
    const waiting = Number.isFinite(own && own.waiting) && own.waiting > 0 ? own.waiting : 0;
    const reports = Array.isArray(beside) && beside.includes(SERVER_TRADING_APP) && besideAt > 0 && now - besideAt < SERVER_BESIDE_FRESH_MS;
    if (!tradingOn || reports) return { used, waiting, whole: false };
    return { used: Math.max(used, SERVER_WHOLE), waiting, whole: true };
}

/**
 * What Torn Archive sends.
 * @param o.want  { sellers: [bazaar], looking: [bazaar], worth: { piece: dollars }, bought: [{ whoId, id, qty, price, t }], dir: [[piece, read at]] }
 * @param o.pieces  the piece ids (strings): nothing else is ever named in `worth`, `bought` or `dir`
 * `worth` is left out unless sendWorth: the server keeps the last one said.
 * @param o.calls  { tag: n } - this PC's requests since the last answered exchange (usageCallsOut); {} = on and
 *   nothing asked; null = not said with this message
 * @param o.sendOwn  your own price list goes with this message (`want.own`: { open, prices: { piece: dollars },
 *   off: [piece] }) - what you pay a seller for each piece now, and the pieces you do not want now. The server
 *   keeps the last one said and hands it to Torn Bids, which then plans a trade with you on it instead of on
 *   TornW3B's copy (the owner, 2026-10-12). With it, for whole sets: `all` (every piece's price), `sets` (whole
 *   sets taken now) and `take` (units of each piece still taken) - how many you still want, never what you hold.
 *   The server keeps a list only from the key marked there as its owner's own, and answers `ownKept` 1 or 0.
 */
export function serverBody({ ver = '', used = 0, waiting = 0, want = {}, pieces = [], since = 0, seen = 0, sendWorth = true, sendOwn = false, now = 0, calls = null } = {}) {
    const count = (n) => (Number.isFinite(n) && n > 0 ? Math.min(1000, Math.floor(n)) : 0);
    const mine = new Set((pieces || []).map(String));
    const w = want && typeof want === 'object' ? want : {};
    const looking = svIds([w.looking], SV_MAX_NEAR);
    // The near ones first, so a full list never pushes them out.
    const sellers = svIds([looking, w.sellers], SV_MAX_SELLERS);
    const age = (at) => Math.max(0, Math.floor(now - at));
    const body = {
        app: SERVER_APP, used: count(used), waiting: count(waiting), sellers, trades: [], looking,
        since: Number.isInteger(since) && since > 0 ? since : 0,
        seen: Number.isFinite(seen) && seen > 0 ? Math.floor(seen) : 0,
        going: [], bought: [],
    };
    if (serverVersion(ver)) body.ver = ver;
    const bought = new Map();
    for (const b of Array.isArray(w.bought) ? w.bought : []) {
        const seller = svId(b && b.whoId);
        const item = svId(b && b.id);
        const qty = svWhole(b && b.qty, 1e9);
        const price = svWhole(Math.round(Number(b && b.price) || 0), 1e13);
        const at = b && b.t;
        if (seller === null || item === null || !mine.has(String(item)) || !qty || price === null) continue;
        if (!Number.isFinite(at) || at > now + 5000 || now - at >= SERVER_BOUGHT_MS) continue;
        if (bought.size >= SV_MAX_BOUGHT) break;
        bought.set([seller, item, qty, price, Math.floor(at)].join('|'), [seller, item, qty, price, age(at)]);
    }
    body.bought = [...bought.values()];
    const dir = new Map();
    for (const entry of Array.isArray(w.dir) ? w.dir : []) {
        const item = svId(Array.isArray(entry) ? entry[0] : null);
        const at = Array.isArray(entry) ? entry[1] : null;
        if (item === null || !mine.has(String(item)) || !Number.isFinite(at) || at <= 0 || at > now + 5000 || now - at >= SERVER_DIR_KEEP_MS) continue;
        if (!(dir.get(item) >= at)) dir.set(item, at);
    }
    if (dir.size) body.dir = [...dir].sort((a, b) => b[1] - a[1]).slice(0, SV_MAX_DIR).map(([item, at]) => [item, age(at)]);
    // The pieces still to buy: the server reads their Item Market every minute, the others every ten.
    const need = svIds([w.need], mine.size).filter((id) => mine.has(String(id)));
    if (need.length) body.need = need;
    if (sendWorth) {
        const worth = {};
        for (const [key, value] of Object.entries(w.worth && typeof w.worth === 'object' ? w.worth : {})) {
            const item = svId(key);
            if (item === null || !mine.has(String(item)) || !Number.isFinite(value) || !(value > 0)) continue;
            worth[item] = Math.max(1, Math.round(value));
        }
        body.worth = worth;
    }
    if (sendOwn && w.own && typeof w.own === 'object') {
        const prices = {};
        for (const [key, value] of Object.entries(w.own.prices && typeof w.own.prices === 'object' ? w.own.prices : {})) {
            const item = svId(key);
            if (item === null || !mine.has(String(item)) || !Number.isFinite(value) || !(value > 0)) continue;
            prices[item] = Math.max(1, Math.round(value));
        }
        const off = svIds([w.own.off], mine.size).filter((id) => mine.has(String(id)) && !(id in prices));
        body.own = { open: w.own.open ? 1 : 0, prices, off };
        // For whole sets: every piece's price (also the ones in `off`), the whole sets taken now, and the units
        // of each piece still taken. Each only when there is one to say.
        const all = {};
        const take = {};
        for (const [key, value] of Object.entries(w.own.all && typeof w.own.all === 'object' ? w.own.all : {})) {
            const item = svId(key);
            if (item !== null && mine.has(String(item)) && Number.isFinite(value) && value > 0) all[item] = Math.max(1, Math.round(value));
        }
        for (const [key, value] of Object.entries(w.own.take && typeof w.own.take === 'object' ? w.own.take : {})) {
            const item = svId(key);
            if (item !== null && mine.has(String(item)) && Number.isInteger(value) && value >= 0) take[item] = Math.min(SV_OWN_COUNT_MAX, value);
        }
        const sets = {};
        for (const [key, value] of Object.entries(w.own.sets && typeof w.own.sets === 'object' ? w.own.sets : {}).slice(0, SV_OWN_SETS_MAX)) {
            if (SV_OWN_SET.test(key) && Number.isInteger(value) && value >= 0) sets[key] = Math.min(SV_OWN_COUNT_MAX, value);
        }
        if (Object.keys(all).length) body.own.all = all;
        if (Object.keys(sets).length) body.own.sets = sets;
        if (Object.keys(take).length) body.own.take = take;
    }
    if (calls && typeof calls === 'object' && !Array.isArray(calls)) {
        body.calls = {};
        for (const [tag, n] of Object.entries(calls).slice(0, USAGE_CALLS_TAGS_MAX)) {
            if (USAGE_CALLS_TAG.test(tag) && Number.isFinite(n) && n >= 1) body.calls[tag] = Math.min(USAGE_CALLS_COUNT_MAX, Math.floor(n));
        }
    }
    return body;
}

/**
 * The check on the way out: is this exactly a body serverBody() makes? The app's name, a version, and numbers
 * and lists of numbers - no other text, no key, nothing about an inventory. `worth` may name the pieces only.
 */
export function serverOutgoingOk(body, pieces = []) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
    const mine = new Set((pieces || []).map(String));
    const whole = (n) => Number.isInteger(n) && n >= 0 && n < 1e13;
    if (body.app !== SERVER_APP) return false;
    for (const [key, value] of Object.entries(body)) {
        if (!SV_BODY_KEYS.includes(key)) return false;
        if (key === 'app') continue;
        if (key === 'ver') {
            if (!serverVersion(value)) return false;
        } else if (key === 'sellers' || key === 'trades' || key === 'looking') {
            if (!Array.isArray(value) || !value.every((id) => Number.isInteger(id) && id > 0 && id < 1e10)) return false;
        } else if (key === 'going') {
            if (!Array.isArray(value) || value.length) return false;
        } else if (key === 'need') {
            if (!Array.isArray(value) || !value.every((id) => Number.isInteger(id) && mine.has(String(id)))) return false;
        } else if (key === 'dir') {
            if (!Array.isArray(value) || !value.every((m) => Array.isArray(m) && m.length === 2 && m.every(whole) && mine.has(String(m[0])))) return false;
        } else if (key === 'bought') {
            if (!Array.isArray(value) || !value.every((m) => Array.isArray(m) && m.length === 5 && m.every(whole) && m[0] > 0 && mine.has(String(m[1])) && m[2] > 0)) return false;
        } else if (key === 'calls') {
            if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > USAGE_CALLS_TAGS_MAX) return false;
            for (const [tag, n] of Object.entries(value)) if (!USAGE_CALLS_TAG.test(tag) || !Number.isInteger(n) || n < 1 || n > USAGE_CALLS_COUNT_MAX) return false;
        } else if (key === 'worth') {
            if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
            for (const [item, price] of Object.entries(value)) if (!mine.has(item) || !Number.isInteger(price) || price <= 0) return false;
        } else if (key === 'own') {
            if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((k) => !['open', 'prices', 'off', 'all', 'sets', 'take'].includes(k))) return false;
            if (value.open !== 0 && value.open !== 1) return false;
            const table = (t) => !!t && typeof t === 'object' && !Array.isArray(t);
            if (!table(value.prices)) return false;
            for (const [item, price] of Object.entries(value.prices)) if (!mine.has(item) || !Number.isInteger(price) || price <= 0) return false;
            if (!Array.isArray(value.off) || !value.off.every((id) => Number.isInteger(id) && mine.has(String(id)))) return false;
            const count = (n) => Number.isInteger(n) && n >= 0 && n <= SV_OWN_COUNT_MAX;
            if ('all' in value && (!table(value.all) || !Object.entries(value.all).every(([item, price]) => mine.has(item) && Number.isInteger(price) && price > 0))) return false;
            if ('take' in value && (!table(value.take) || !Object.entries(value.take).every(([item, n]) => mine.has(item) && count(n)))) return false;
            if ('sets' in value && (!table(value.sets) || Object.keys(value.sets).length > SV_OWN_SETS_MAX || !Object.entries(value.sets).every(([key, n]) => SV_OWN_SET.test(key) && count(n)))) return false;
        } else if (!whole(value)) {
            return false;
        }
    }
    return true;
}

/** Does GET /state say this server keeps each app's lists apart? An older one does not, and is never synced with. */
export const serverKnowsApps = (state) => !!state && typeof state === 'object' && state.apps === true;
/** Does this server know a copy by its own word (serverClaim's `device`)? One that does not would turn the longer claim away. */
export const serverKnowsCopies = (state) => !!state && typeof state === 'object' && state.copies === true;

/**
 * The server's part of your limit from its answer, with its clock turned into this PC's.
 * @param got when the answer arrived, by this PC's clock
 */
export function serverGrantIn(answer, got) {
    const g = answer && answer.grant;
    if (!g || typeof g !== 'object') return null;
    const skew = got - (Number.isFinite(g.at) ? g.at : got);
    return {
        at: got,
        need: Number.isFinite(g.need) ? g.need : null,
        serverShare: Number.isFinite(g.serverShare) ? g.serverShare : 0,
        serverTimes: (Array.isArray(g.serverTimes) ? g.serverTimes : []).filter(Number.isFinite).map((t) => t + skew).slice(-200),
    };
}

/**
 * The server's reads, taken into what is kept: sellerId -> [changed at, seen at, [[piece, price, qty], ...]],
 * times by this PC's clock. Only set pieces are kept. A bazaar with none of them is kept only when it is
 * `known` (a seller of a piece as far as Torn Archive knows) or was kept before: that is how "sold out" is seen.
 * @param kept    the record (changed in place)
 * @param pieces  Set of piece ids, as strings
 * @param known   (sellerId as text) => boolean
 * @param got     when the answer arrived, by this PC's clock
 * @returns true when anything changed
 */
export function serverTake(kept, answer, pieces, known, got) {
    let changed = false;
    const skew = got - (answer && Number.isFinite(answer.now) ? answer.now : got);
    const mine = (at) => Math.min(got, Math.floor(at + skew));
    for (const read of answer && Array.isArray(answer.reads) ? answer.reads : []) {
        const id = svId(read && read.id);
        if (id === null || !Array.isArray(read.items)) continue;
        const at = Number.isFinite(read.at) && read.at > 0 ? mine(read.at) : got;
        const best = new Map();
        for (const entry of read.items) {
            const item = svId(entry && entry.id);
            const price = entry && entry.price;
            const qty = entry && entry.qty;
            if (item === null || !pieces.has(String(item))) continue;
            // A price of $1 or less is a locked listing: not for sale.
            if (!Number.isFinite(price) || !(price > 1) || !Number.isInteger(qty) || qty <= 0) continue;
            // One item at two prices: the cheaper one is what you would be buying.
            const had = best.get(item);
            if (!had || price < had[1]) best.set(item, [item, Math.round(price), qty]);
        }
        const prev = kept[id];
        if (!best.size && !prev && !(known && known(String(id)))) continue;
        kept[id] = [at, Math.max(at, prev ? prev[1] : 0), [...best.values()]];
        changed = true;
    }
    // Read again by the server and found the same: still true as of then.
    for (const pair of answer && Array.isArray(answer.seen) ? answer.seen : []) {
        const id = svId(Array.isArray(pair) ? pair[0] : null);
        const at = Array.isArray(pair) ? pair[1] : null;
        if (id === null || !Number.isFinite(at) || !kept[id]) continue;
        const seen = mine(at);
        if (seen > kept[id][1]) { kept[id][1] = seen; changed = true; }
    }
    return changed;
}

/** Drops what the server has not confirmed for SERVER_KEEP_MS. @returns true when anything went */
export function serverPrune(kept, now) {
    let changed = false;
    for (const id of Object.keys(kept)) {
        const e = kept[id];
        if (!Array.isArray(e) || !(now - e[1] <= SERVER_KEEP_MS)) { delete kept[id]; changed = true; }
    }
    return changed;
}

/** What was stored, read back strictly: anything not in shape is left out. */
export function serverReadKept(stored) {
    const out = {};
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return out;
    for (const [id, entry] of Object.entries(stored)) {
        if (!/^\d{1,10}$/.test(id) || !Array.isArray(entry) || entry.length !== 3) continue;
        const [at, seen, items] = entry;
        if (!Number.isFinite(at) || !Number.isFinite(seen) || !Array.isArray(items)) continue;
        if (!items.every((i) => Array.isArray(i) && i.length === 3 && Number.isInteger(i[0]) && Number.isFinite(i[1]) && Number.isInteger(i[2]))) continue;
        out[id] = entry;
    }
    return out;
}

/** One bazaar as the server last had it: { at: when it was last seen so, items: { piece: { price, qty } } }, or null. */
export function serverShop(kept, whoId) {
    const e = kept && kept[String(whoId)];
    if (!e) return null;
    const items = {};
    for (const [item, price, qty] of e[2]) items[String(item)] = { price, qty };
    return { at: e[1], changedAt: e[0], items };
}

/** Every bazaar the server has holding a piece: [{ whoId, price, qty, at }], cheapest first. */
export function serverSellersOf(kept, pieceId) {
    const want = Number(pieceId);
    const out = [];
    for (const [whoId, e] of Object.entries(kept || {})) {
        for (const [item, price, qty] of e[2]) if (item === want) out.push({ whoId, price, qty, at: e[1] });
    }
    return out.sort((a, b) => a.price - b.price);
}

const SV_ALONE = { of: 1, me: 0 };

/**
 * The other PCs' reads of TornW3B's lists, from the answer, added to what was kept: piece -> when, by this PC's
 * clock (the answer carries ages). And this PC's place among the PCs that are on.
 */
export function serverDirIn(answer, had, now) {
    const reads = {};
    for (const [item, at] of Object.entries(had && had.reads && typeof had.reads === 'object' ? had.reads : {})) {
        if (/^\d{1,10}$/.test(item) && Number.isFinite(at) && now - at < SERVER_DIR_KEEP_MS) reads[item] = at;
    }
    for (const entry of answer && Array.isArray(answer.dir) ? answer.dir : []) {
        if (!Array.isArray(entry)) continue;
        const item = svId(entry[0]);
        const age = entry[1];
        if (item === null || !Number.isFinite(age) || age < 0 || age >= SERVER_DIR_KEEP_MS) continue;
        const at = Math.floor(now - age);
        if (!(reads[item] >= at)) reads[item] = at;
    }
    const t = answer && answer.turn;
    const turn = t && Number.isInteger(t.of) && t.of >= 1 && t.of <= 50 && Number.isInteger(t.me) && t.me >= 0 && t.me < t.of ? { of: t.of, me: t.me } : { ...SV_ALONE };
    return { reads, turn };
}

/**
 * When a piece's TornW3B list was last read by anyone of us, as far as this PC should count it: its own read,
 * or another PC's. With several PCs on, a list that is another PC's to read first counts as read a little longer.
 * @param dir serverDirIn()'s result, or null with the server off
 */
export function serverListReadAt(ownAt, pieceId, dir) {
    if (!dir) return { at: ownAt || 0, wait: 0 };
    const friendAt = Number(dir.reads && dir.reads[String(pieceId)]) || 0;
    const turn = dir.turn || SV_ALONE;
    const mine = !(turn.of > 1) || Number(pieceId) % turn.of === turn.me;
    return { at: Math.max(ownAt || 0, friendAt), wait: mine ? 0 : SERVER_TURN_WAIT_MS };
}

// A Torn name as Torn makes them. The server sends each person's own, asked of Torn for their key: no person's
// name is written in this script, and anything that is not one is not shown.
const SV_TORN_NAME = /^[A-Za-z0-9_-]{1,32}$/;

/** { id, name } as the server sent it, checked: a Torn id and a Torn name, or nulls. */
export function serverPerson(sent) {
    const id = sent && Number.isInteger(sent.id) && sent.id > 0 && sent.id < 1e10 ? sent.id : null;
    const name = sent && typeof sent.name === 'string' && SV_TORN_NAME.test(sent.name) ? sent.name : null;
    return { id, name };
}

function svOnNow(on) {
    const names = on.map((p) => p && p.name).filter(Boolean);
    if (!on.length) return 'nobody else is on now';
    if (names.length < on.length) return on.length === 1 ? '1 other is on now' : on.length + ' others are on now';
    return names.length === 1 ? names[0] + ' is on now' : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] + ' are on now';
}

const svClock = (at) => { const d = new Date(at); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

/**
 * What Settings says of the server, in words. Only what is known.
 * @param st the link's status()
 * @returns { on, level: 'off' | 'ok' | 'idle' | 'warn' | 'bad', now, key: { level, text }, split: { pc, server, free } | null, bazaars }
 */
export function serverLines(st, now) {
    const off = { on: false, level: 'off', now: st && (st.typed || st.hasPass) ? 'Off until the address and the password are both saved. Torn Archive works alone.' : 'Off. Torn Archive works alone.', key: null, split: null, bazaars: 0 };
    // Built in, nothing to type: it waits only for Torn to say who you are.
    if (st && !st.on && st.builtIn) return { ...off, level: 'idle', now: 'Asks the server once Torn has said who you are.' };
    if (!st || !st.on) return off;
    // Not one of the server's PCs (or not yet): no fault of yours, and nothing for you to do.
    if (st.why === 'address') {
        return { ...off, level: 'alone', now: st.careful
            ? `Working alone, and carefully: Torn said "too many", so Torn Archive keeps to ${SERVER_CAREFUL_MOST} requests a minute at most for now and tells the server what it uses. It asks again by itself.`
            : 'Working alone. The shared server serves the people its owner added, on a PC it has seen them at. Torn Archive asks again by itself.' };
    }
    const out = { on: true, level: 'ok', now: '', key: null, split: null, bazaars: st.bazaars || 0 };
    const alone = ' · working alone';
    if (st.why === 'password') return { ...out, level: 'bad', now: 'The server does not know this password. Ask whoever runs your server for yours.' };
    if (st.why === 'old') return { ...out, level: 'bad', now: 'This server has to be updated first: as it is, Torn Archive would overwrite what Torn Trading tells it. Nothing is sent to it.' };
    if (st.why === 'update') return { ...out, level: 'bad', now: 'The server asks for a newer Torn Archive' + (st.needVer ? ' (' + st.needVer + ' or later)' : '') + '. Nothing is sent to it until you update.' };
    if (!st.okAt) return { ...out, level: st.error ? 'warn' : 'idle', now: st.error ? 'No answer yet' + alone : 'Connecting…' };
    if (st.error || now - st.okAt > SERVER_QUIET_MS) return { ...out, level: 'warn', now: 'No answer since ' + svClock(st.okAt) + alone };
    const parts = ['Connected'];
    if (st.people) parts.push(st.people + (st.people === 1 ? ' person' : ' people'));
    if (st.people > 1) parts.push(svOnNow(st.peopleOn || []));
    parts.push('last exchange ' + Math.max(0, Math.floor((now - st.okAt) / 1000)) + ' s ago');
    const rests = { blocked: 'Torn has blocked the server for now', paused: 'the server is waiting on Torn', stopped: 'reading is stopped on the server', resting: 'the server rests until midnight UTC' };
    if (rests[st.reading]) { parts.push(rests[st.reading]); out.level = 'warn'; }
    if (st.whole) parts.push('Torn Trading is on here and keeps your whole limit, so the server leaves your key alone');
    out.now = parts.join(' · ');
    // Whose key the server holds for this password, as Torn says: so a key put under the wrong person shows.
    const whose = st.you && st.you.name ? st.you.name + (st.you.id ? ' [' + st.you.id + ']' : '') : null;
    if (st.key === 'working') out.key = { level: 'ok', text: whose ? 'Working · the key of ' + whose : 'Working' };
    else if (st.key) {
        const code = /\((\d+)\)/.exec(st.key);
        out.key = { level: 'bad', text: 'Torn refused your key on the server' + (code ? ' (code ' + code[1] + ')' : '') + '. Whoever runs your server needs a new Public Only key from you.' };
    }
    if (now - st.okAt <= SERVER_GRANT_STALE_MS && Number.isFinite(st.need) && Number.isFinite(st.serverShare)) {
        const pc = Math.max(0, Math.min(100, Math.round(st.need)));
        const server = Math.max(0, Math.min(100 - pc, Math.round(st.serverShare)));
        out.split = { pc, server, free: 100 - pc - server };
    }
    return out;
}

/**
 * The two markets as the server read them from Torn (its market.js): the points market, and the Item Market's
 * cheapest rows of the pieces. Public data of Torn's, the same for everyone. Times come in the server's clock
 * and go out in this PC's; a read older than SERVER_MARKET_FRESH_MS, or one that is not what it should be, is left out.
 * @returns {{ points: { at, json } | null, market: [{ id, at, listings: [{ price, amount }] }] }}
 *   `json` is in the shape Torn's own answer has (core/points.js parsePointsMarket)
 */
export function serverMarketIn(answer, pieces, got) {
    const out = { points: null, market: [] };
    if (!answer || typeof answer !== 'object' || !Number.isFinite(answer.now)) return out;
    const mine = pieces instanceof Set ? pieces : new Set((pieces || []).map(String));
    const skew = got - answer.now;
    const here = (at) => (Number.isFinite(at) && at > 0 ? Math.min(got, Math.floor(at + skew)) : null);
    const fresh = (at) => at !== null && got - at < SERVER_MARKET_FRESH_MS;
    const p = answer.points;
    if (p && typeof p === 'object' && Array.isArray(p.rows) && fresh(here(p.at))) {
        const book = {};
        let n = 0;
        for (const row of p.rows.slice(0, SV_MAX_POINT_ROWS)) {
            if (!Array.isArray(row)) continue;
            const cost = svWhole(row[1], 1e6);
            const qty = svWhole(row[2], 1e12);
            if (!cost || !qty) continue;
            book[String(row[0]).replace(/[^0-9A-Za-z_-]/g, '').slice(0, 20) || 'r' + n] = { cost, quantity: qty };
            n += 1;
        }
        if (n) out.points = { at: here(p.at), json: { pointsmarket: book } };
    }
    for (const m of Array.isArray(answer.market) ? answer.market.slice(0, 100) : []) {
        const id = svId(m && m.id);
        const at = here(m && m.at);
        if (id === null || !mine.has(String(id)) || !fresh(at) || !Array.isArray(m.rows)) continue;
        const listings = [];
        for (const row of m.rows.slice(0, SV_MAX_ROWS)) {
            const price = Array.isArray(row) ? svWhole(row[0], 1e13) : null;
            const amount = Array.isArray(row) ? svWhole(row[1], 1e9) : null;
            if (price > 1 && amount) listings.push({ price, amount });
        }
        out.market.push({ id: String(id), at, listings });
    }
    return out;
}
