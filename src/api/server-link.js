/*
 * The exchange with the shared server (core/server.js says what it is and what may be sent).
 *
 * One tab does it - the one that reads, Torn Archive's own page - every 30 s. Before the first exchange, and
 * again whenever the server says it started afresh, the server is asked what it is (GET /state, which changes
 * nothing): an older server keeps one list a person, and a sync from Torn Archive would overwrite what Torn
 * Trading told it. Such a server is never synced with.
 *
 * The server's address is built into the released copy (build.mjs), and with nothing typed Torn Archive says
 * whose copy it is instead of a password (core/server.js serverClaim): the server lets it in on the PC where
 * that person's Torn Trading runs, and turns everyone else away - they are asked again a few times a day, and
 * nothing but the Torn id was said. Once the server has said it knows copies, a word this copy made for itself
 * goes with the id (SERVER_DEVICE_KEY): a copy that was let in once is known by it afterwards, wherever it asks from.
 *
 * Turned away, and Torn has said "too many" (the client's learned ceiling): Torn Archive keeps itself to a
 * careful pace (the client, core/server.js SERVER_CAREFUL_MOST) and says once a minute what it uses. The server
 * answers that as it answers any stranger - not found - and, where it holds this person's key, takes that much
 * less of it. Nothing is said while Torn Archive asks Torn nothing.
 *
 * An address and password typed in an older copy still go first. The password
 * is kept in Tampermonkey's storage like a key: it goes to that one address in a header, is never shown again,
 * and is in no log and no zip.
 *
 * Everything it touches is passed in (storage, the request, the clock), so it runs whole in the tests against
 * the server's own code.
 */

import {
    SERVER_SYNC_MS, SERVER_PAGE, serverAddress, serverPassOk, serverBody, serverOutgoingOk, serverKnowsApps, serverGrantIn, serverPerson, serverUse, serverClaim,
    serverDeviceOk, serverHint, serverKnowsCopies, SERVER_HINT_MS,
} from '../core/server.js';
import { usageCallsOut, usageCallsSent } from '../core/usage.js';

export const SERVER_CONFIG_KEY = 'server.config';
export const SERVER_STATE_KEY = 'server.state';
export const SERVER_GRANT_KEY = 'server.grant';
/** This PC's request counts waiting to be sent (core/usage.js usageCallsAdd). */
export const SERVER_CALLS_KEY = 'server.calls';
/** This copy's own word (core/server.js serverClaim). Made once and kept: it is what the server knows the copy by. */
export const SERVER_DEVICE_KEY = 'server.device';
/** true once the server has said it knows a copy by its word: until then the id is said alone, as an older server expects. */
export const SERVER_COPIES_KEY = 'server.copies';
const SL_MAX_PAGES = 5;
/** What the pieces are worth is said again when it changed, and at least this often. */
const SL_WORTH_EVERY_MS = 10 * 60000;
/** The server is asked what it is this often, besides at the start and after it started afresh. */
const SL_HELLO_EVERY_MS = 6 * 60 * 60000;
/** A server that turned Torn Archive away (password, too old, wants an update) is tried again this often. */
export const SERVER_RETRY_MS = 5 * 60000;
/** A server that does not know this PC (core/server.js serverClaim) is asked again after this long: each time later. */
export const SERVER_ADDRESS_RETRY_MS = [5 * 60000, 15 * 60000, 60 * 60000, 6 * 60 * 60000];
/** Calls held back for the server's part: an exchange is asked for sooner, but never closer than this. */
const SL_SOON_MS = 6000;

const slWhy = (why, message, more = {}) => Object.assign(new Error(message), { why }, more);

export class ServerLink {
    /**
     * @param {object} d
     * @param {(key: string) => *} d.load
     * @param {(key: string, value: *) => void} d.save
     * @param {(key: string) => void} d.del
     * @param {(url: string, options: object) => Promise<{ok, status, json}>} d.send - platform/gm.js gmSend
     * @param {string} d.version
     * @param {string[]} d.pieces - the piece ids: nothing else is named to the server
     * @param {() => {used: number, waiting: number}} d.getUse - Torn calls of the last minute, and waiting
     * @param {() => boolean} [d.tradingOn] - is Torn Trading running on this PC now (core/turns.js)
     * @param {() => object} d.getWant - { sellers, looking, worth, bought, dir } (the engine's serverWant)
     * @param {() => {seq: number, seenAt: number}} d.getMark - how far the server's reads were taken
     * @param {(answer: object, got: number) => void} d.take - one answer, for the engine to fold in
     * @param {() => void} d.forget - what was kept of the server goes (its address or password changed)
     * @param {string} [d.home] - the server's address built into this copy ('' = none: the boxes in Settings)
     * @param {() => string} [d.getId] - your Torn id, once Torn has said it
     * @param {() => string} [d.random] - 48 hex characters nobody could guess, for this copy's own word
     * @param {() => boolean} [d.lowered] - has Torn said "too many", so that the client holds itself under its pace
     * @param {() => void} [d.onChange]
     * @param {() => number} [d.now]
     */
    constructor(d) {
        this.d = d;
        this.now = d.now || (() => Date.now());
        this.busy = false;
        this.soon = false;
        this.again = false;
        this.grantKept = undefined;
        this.worthJson = '';
        this.worthAt = 0;
        // Your own price list as last said to the server, and when (as `worth`): said again when it changed.
        this.ownJson = '';
        this.ownAt = 0;
        // Did the server keep it? true / false as it last answered (`ownKept`); null: a server that does not say.
        this.ownHeld = null;
    }

    /** { address, pass, own }, or null when the server is off. own: nothing was typed - the built-in address, as whoever Torn says you are. */
    config() {
        const c = this.d.load(SERVER_CONFIG_KEY);
        const address = c ? serverAddress(c.address) : null;
        if (address && serverPassOk(c.pass)) return { address, pass: c.pass, own: false };
        const home = serverAddress(this.d.home);
        const claim = home ? serverClaim(this.d.getId ? this.d.getId() : '', this.device()) : null;
        return claim ? { address: home, pass: claim, own: true } : null;
    }

    /** This copy's own word: made the first time it is needed, then always the same. '' = none could be made, or the server has not said it knows copies. */
    device() {
        if (this.d.load(SERVER_COPIES_KEY) !== true) return '';
        if (this.deviceKept === undefined) {
            let device = this.d.load(SERVER_DEVICE_KEY);
            if (!serverDeviceOk(device)) {
                device = this.d.random ? this.d.random() : '';
                if (serverDeviceOk(device)) this.d.save(SERVER_DEVICE_KEY, device);
                else device = '';
            }
            this.deviceKept = device;
        }
        return this.deviceKept;
    }

    /** Not one of the server's PCs as far as it says: Torn Archive works alone. */
    turnedAway() {
        const cfg = this.config();
        return Boolean(cfg && cfg.own && this.state().why === 'address');
    }

    /** Turned away, and Torn has said "too many": the careful pace, and the server is told what is used. */
    careful() {
        return this.turnedAway() && Boolean(this.d.lowered && this.d.lowered());
    }

    /** What Torn Archive uses, said to a server that does not let it in. Answered "not found" unless that changed. */
    async hint(cfg, before, now) {
        if (now - (before.hintAt || 0) < SERVER_HINT_MS || !this.careful()) return false;
        const use = this.d.getUse() || {};
        const body = serverHint({ ver: this.d.version, used: use.used, waiting: use.waiting });
        if (!(body.used + body.waiting > 0)) return false;
        this.busy = true;
        this.d.save(SERVER_STATE_KEY, { ...before, hintAt: now });
        try {
            const response = await this.d.send(`${cfg.address}/sync`, { method: 'POST', headers: { Authorization: `Bearer ${cfg.pass}` }, body });
            // Let in after all: the whole exchange at the next look, not at the next try hours on.
            if (response.status === 200) this.again = true;
        } catch {
            // Said again a minute on.
        } finally {
            this.busy = false;
        }
        return true;
    }

    /** Is this PC one of the server's - so that what it asks is counted for it? Not while the server turns it away. */
    on() {
        const cfg = this.config();
        return Boolean(cfg) && !(cfg.own && this.state().why === 'address');
    }

    /** Something changed that may let a turned-away copy in (this page just opened, Torn Trading came on): ask now, not at the next try. */
    wake() { this.again = true; }

    /** Your part of your Torn limit as the server last gave it (null = on its own). */
    grant() {
        if (this.grantKept === undefined) this.grantKept = (this.config() && this.d.load(SERVER_GRANT_KEY)) || null;
        return this.grantKept;
    }

    state() {
        const s = this.d.load(SERVER_STATE_KEY);
        return s && typeof s === 'object' ? s : {};
    }

    /**
     * The address and the password, as typed. Either may be left empty to keep what is saved.
     * @returns {{ ok: boolean, why: '' | 'address' | 'password' }}
     */
    saveConfig(address, pass) {
        const had = this.d.load(SERVER_CONFIG_KEY) || {};
        const typedAddress = String(address ?? '').trim();
        const typedPass = String(pass ?? '').trim();
        const nextAddress = typedAddress ? serverAddress(typedAddress) : serverAddress(had.address);
        if (!nextAddress) return { ok: false, why: 'address' };
        const nextPass = typedPass || had.pass || '';
        if (!serverPassOk(nextPass)) return { ok: false, why: 'password' };
        if (nextAddress !== serverAddress(had.address) || nextPass !== had.pass) this.forget();
        this.d.save(SERVER_CONFIG_KEY, { address: nextAddress, pass: nextPass });
        return { ok: true, why: '' };
    }

    /** The server is switched off, or its address or password changed: what was kept under the old one goes. */
    forget() {
        for (const key of [SERVER_CONFIG_KEY, SERVER_STATE_KEY, SERVER_GRANT_KEY, SERVER_CALLS_KEY]) this.d.del(key);
        this.grantKept = null;
        this.worthJson = '';
        this.worthAt = 0;
        this.ownJson = '';
        this.ownAt = 0;
        this.ownHeld = null;
        this.d.forget();
    }

    /** Torn calls are waiting on the server's part: an exchange is wanted soon, to ask for room. */
    askSoon() { this.soon = true; }

    /** "Update now" pressed: your own price list is said again with the next exchange, and that one comes soon. */
    sayOwn() { this.ownJson = ''; this.soon = true; }

    /** When the server last took your own price list from this page (0: not yet). */
    ownSaidAt() { return this.ownAt; }

    /**
     * Whether the server kept the list it was last told: it keeps one only from the key marked there as its owner's
     * own (the owner, 2026-10-12). null: not said yet, or a server from before it answered that.
     */
    ownKept() { return this.ownHeld; }

    /** Call every few seconds; it exchanges every SERVER_SYNC_MS. */
    async tick() {
        const cfg = this.config();
        if (!cfg || this.busy) return false;
        const now = this.now();
        const before = this.state();
        if (before.retryAt && now < before.retryAt && !(this.again && before.why === 'address')) {
            if (cfg.own && before.why === 'address') await this.hint(cfg, before, now);
            return false;
        }
        const since = now - (before.syncAt || 0);
        if (since < SERVER_SYNC_MS && !(this.soon && since >= SL_SOON_MS)) return false;
        this.busy = true;
        this.soon = false;
        this.again = false;
        try {
            await this.exchange(cfg, before);
        } finally {
            this.busy = false;
        }
        return true;
    }

    keepGrant(answer, got) {
        const grant = serverGrantIn(answer, got);
        if (!grant) return null;
        this.grantKept = grant;
        this.d.save(SERVER_GRANT_KEY, grant);
        return grant;
    }

    async exchange(cfg, before) {
        const startedAt = this.now();
        const auth = { Authorization: `Bearer ${cfg.pass}` };
        const state = { ...before, syncAt: startedAt, error: null, why: null, needVer: null, retryAt: 0 };
        let born = before.born ?? null;
        try {
            // What is this server? Asked before anything is told to it.
            if (!before.helloOk || !(startedAt - (before.helloAt || 0) < SL_HELLO_EVERY_MS)) {
                state.helloOk = false;
                const hello = await this.d.send(`${cfg.address}/state`, { method: 'GET', headers: auth });
                if (hello.status === 404) throw this.unknown(cfg);
                if (!hello.ok) throw new Error(`The server answered with status ${hello.status}.`);
                const what = await hello.json();
                if (!serverKnowsApps(what)) throw slWhy('old', 'This server keeps one list a person: it has to be updated first.');
                // From the next look on this copy says its own word with its id.
                if (cfg.own && serverKnowsCopies(what) && this.d.load(SERVER_COPIES_KEY) !== true) this.d.save(SERVER_COPIES_KEY, true);
                state.helloOk = true;
                state.helloAt = startedAt;
            }
            for (let page = 0; page < SL_MAX_PAGES; page += 1) {
                const now = this.now();
                // A Torn Trading here that tells the server nothing: its whole limit is said for it (core/server.js serverUse).
                const use = serverUse(this.d.getUse() || {}, { tradingOn: !!(this.d.tradingOn && this.d.tradingOn()), beside: state.beside, besideAt: state.besideAt, now });
                const want = this.d.getWant() || {};
                const mark = this.d.getMark() || {};
                const worthJson = JSON.stringify(serverBody({ want, pieces: this.d.pieces, sendWorth: true }).worth);
                const sendWorth = page === 0 && (worthJson !== this.worthJson || now - this.worthAt >= SL_WORTH_EVERY_MS || born === null);
                // Your own price list: said when it changed, and as often as the worths otherwise - the server keeps
                // the time it last heard it, which is how old Torn Bids takes it to be.
                const ownSaid = want.own ? serverBody({ want, pieces: this.d.pieces, sendWorth: false, sendOwn: true }).own : null;
                const ownJson = ownSaid ? JSON.stringify(ownSaid) : '';
                const sendOwn = page === 0 && !!ownSaid && (ownJson !== this.ownJson || now - this.ownAt >= SL_WORTH_EVERY_MS || born === null);
                // What this PC asked of TornW3B and Torn since the last answered exchange: with the first page only.
                const callsOut = page === 0 ? usageCallsOut(this.d.load(SERVER_CALLS_KEY), now) : null;
                const body = serverBody({ ver: this.d.version, used: use.used, waiting: use.waiting, want, pieces: this.d.pieces, since: mark.seq, seen: mark.seenAt, sendWorth, sendOwn, now, calls: callsOut });
                if (!serverOutgoingOk(body, this.d.pieces)) throw new Error('Not sent: the message was not in the agreed shape.');

                const response = await this.d.send(`${cfg.address}/sync`, { method: 'POST', headers: auth, body });
                if (response.status === 404) throw this.unknown(cfg);
                if (response.status === 426) {
                    // Turned away until Torn Archive is updated. Its Torn use is still counted there, so its part still holds.
                    const said = await response.json().catch(() => null);
                    this.keepGrant(said, this.now());
                    throw slWhy('update', 'The server asks for a newer Torn Archive.', { needVer: said && typeof said.need === 'string' ? said.need.slice(0, 20) : null });
                }
                if (!response.ok) throw new Error(`The server answered with status ${response.status}.`);
                const answer = await response.json();
                const got = this.now();
                const grant = this.keepGrant(answer, got);
                if (!answer || typeof answer !== 'object' || !grant) throw new Error('The server answered with something else.');

                if (body.calls) {
                    // Answered: what was sent comes off the sum. Not answered, it stays and goes with the next one.
                    const sum = Object.values(body.calls).reduce((a, n) => a + n, 0);
                    if (sum) this.d.save(SERVER_CALLS_KEY, usageCallsSent(this.d.load(SERVER_CALLS_KEY), body.calls, got));
                    state.callsOut = (Number.isInteger(state.callsOut) ? state.callsOut : 0) + sum;
                    state.callsSyncs = (Number.isInteger(state.callsSyncs) ? state.callsSyncs : 0) + 1;
                }
                if (sendWorth) {
                    this.worthJson = worthJson;
                    this.worthAt = now;
                }
                if (sendOwn) {
                    this.ownJson = ownJson;
                    this.ownAt = now;
                    this.ownHeld = answer.ownKept === 1 ? true : answer.ownKept === 0 ? false : null;
                }
                // A server that started afresh has forgotten what the pieces are worth, and may be another one: asked again.
                if (answer.born !== undefined && answer.born !== born) {
                    if (born !== null) { this.worthJson = ''; this.ownJson = ''; state.helloOk = false; }
                    born = answer.born;
                }
                this.d.take(answer, got);
                state.okAt = got;
                state.reading = typeof answer.state === 'string' ? answer.state.slice(0, 20) : null;
                state.key = typeof answer.key === 'string' ? answer.key.slice(0, 60) : null;
                state.need = grant.need;
                state.serverShare = grant.serverShare;
                state.serverUsed = grant.serverTimes.length;
                state.people = Number.isInteger(answer.people) && answer.people > 0 ? answer.people : null;
                state.on = (Array.isArray(answer.on) ? answer.on : []).slice(0, 20).map(serverPerson);
                state.you = serverPerson(answer.you);
                state.beside = (Array.isArray(answer.beside) ? answer.beside : []).filter((name) => typeof name === 'string' && /^[a-z][a-z0-9-]{1,23}$/.test(name)).slice(0, 8);
                state.besideAt = got;
                state.whole = use.whole;
                state.turned = 0;
                if (!Array.isArray(answer.reads) || answer.reads.length < SERVER_PAGE) break;
            }
        } catch (error) {
            state.error = String(error && error.message ? error.message : error).slice(0, 160);
            state.why = (error && error.why) || null;
            state.needVer = (error && error.needVer) || null;
            if (state.why === 'address') {
                // Not one of the server's PCs: asked again later each time, a few times a day in the end.
                state.turned = Math.min(99, (Number.isInteger(before.turned) ? before.turned : 0) + 1);
                state.retryAt = startedAt + SERVER_ADDRESS_RETRY_MS[Math.min(state.turned, SERVER_ADDRESS_RETRY_MS.length) - 1];
            } else if (state.why) state.retryAt = startedAt + SERVER_RETRY_MS;
        }
        state.born = born;
        this.d.save(SERVER_STATE_KEY, state);
        if (this.d.onChange) this.d.onChange();
    }

    /** The server said 404: a typed password it does not know, or - with nothing typed - a PC it does not serve. */
    unknown(cfg) {
        return cfg.own ? slWhy('address', 'The server does not serve this PC.') : slWhy('password', 'The server does not know this password.');
    }

    /** For Settings (core/server.js serverLines). The password is not in it, nor the built-in address. */
    status(now = this.now()) {
        const cfg = this.config();
        const typed = this.d.load(SERVER_CONFIG_KEY) || {};
        const state = cfg ? this.state() : {};
        return {
            on: Boolean(cfg),
            own: Boolean(cfg && cfg.own),
            builtIn: Boolean(serverAddress(this.d.home)),
            address: cfg && !cfg.own ? cfg.address : null,
            typed: String(typed.address || ''),
            hasPass: serverPassOk(typed.pass),
            okAt: state.okAt || null,
            syncAt: state.syncAt || null,
            error: state.error || null,
            why: state.why || null,
            careful: this.careful(),
            needVer: state.needVer || null,
            reading: state.reading || null,
            key: state.key || null,
            need: Number.isFinite(state.need) ? state.need : null,
            serverShare: Number.isFinite(state.serverShare) ? state.serverShare : null,
            serverUsed: Number.isFinite(state.serverUsed) ? state.serverUsed : null,
            beside: Array.isArray(state.beside) ? state.beside : [],
            whole: state.whole === true,
            people: Number.isInteger(state.people) ? state.people : null,
            peopleOn: Array.isArray(state.on) ? state.on : [],
            you: state.you || null,
            callsOut: Number.isInteger(state.callsOut) ? state.callsOut : 0,
            callsSyncs: Number.isInteger(state.callsSyncs) ? state.callsSyncs : 0,
            now,
        };
    }
}
