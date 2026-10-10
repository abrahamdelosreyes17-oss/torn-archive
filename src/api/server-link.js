/*
 * The exchange with the shared server (core/server.js says what it is and what may be sent).
 *
 * One tab does it - the one that reads, Torn Archive's own page - every 30 s. Before the first exchange, and
 * again whenever the server says it started afresh, the server is asked what it is (GET /state, which changes
 * nothing): an older server keeps one list a person, and a sync from Torn Archive would overwrite what Torn
 * Trading told it. Such a server is never synced with.
 *
 * With no address and password saved, none of this runs and nothing is sent. The password is kept in
 * Tampermonkey's storage like a key: it goes to that one address in a header, is never shown again, and is in no
 * log and no zip.
 *
 * Everything it touches is passed in (storage, the request, the clock), so it runs whole in the tests against
 * the server's own code.
 */

import {
    SERVER_SYNC_MS, SERVER_PAGE, serverAddress, serverPassOk, serverBody, serverOutgoingOk, serverKnowsApps, serverGrantIn, serverPerson, serverUse,
} from '../core/server.js';

export const SERVER_CONFIG_KEY = 'server.config';
export const SERVER_STATE_KEY = 'server.state';
export const SERVER_GRANT_KEY = 'server.grant';
const SL_MAX_PAGES = 5;
/** What the pieces are worth is said again when it changed, and at least this often. */
const SL_WORTH_EVERY_MS = 10 * 60000;
/** The server is asked what it is this often, besides at the start and after it started afresh. */
const SL_HELLO_EVERY_MS = 6 * 60 * 60000;
/** A server that turned Torn Archive away (password, too old, wants an update) is tried again this often. */
export const SERVER_RETRY_MS = 5 * 60000;
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
     * @param {() => void} [d.onChange]
     * @param {() => number} [d.now]
     */
    constructor(d) {
        this.d = d;
        this.now = d.now || (() => Date.now());
        this.busy = false;
        this.soon = false;
        this.grantKept = undefined;
        this.worthJson = '';
        this.worthAt = 0;
    }

    /** { address, pass }, or null when the server is off. */
    config() {
        const c = this.d.load(SERVER_CONFIG_KEY);
        const address = c ? serverAddress(c.address) : null;
        return address && serverPassOk(c.pass) ? { address, pass: c.pass } : null;
    }

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
        for (const key of [SERVER_CONFIG_KEY, SERVER_STATE_KEY, SERVER_GRANT_KEY]) this.d.del(key);
        this.grantKept = null;
        this.worthJson = '';
        this.worthAt = 0;
        this.d.forget();
    }

    /** Torn calls are waiting on the server's part: an exchange is wanted soon, to ask for room. */
    askSoon() { this.soon = true; }

    /** Call every few seconds; it exchanges every SERVER_SYNC_MS. */
    async tick() {
        const cfg = this.config();
        if (!cfg || this.busy) return false;
        const now = this.now();
        const before = this.state();
        if (before.retryAt && now < before.retryAt) return false;
        const since = now - (before.syncAt || 0);
        if (since < SERVER_SYNC_MS && !(this.soon && since >= SL_SOON_MS)) return false;
        this.busy = true;
        this.soon = false;
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
                if (hello.status === 404) throw slWhy('password', 'The server does not know this password.');
                if (!hello.ok) throw new Error(`The server answered with status ${hello.status}.`);
                if (!serverKnowsApps(await hello.json())) throw slWhy('old', 'This server keeps one list a person: it has to be updated first.');
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
                const body = serverBody({ ver: this.d.version, used: use.used, waiting: use.waiting, want, pieces: this.d.pieces, since: mark.seq, seen: mark.seenAt, sendWorth, now });
                if (!serverOutgoingOk(body, this.d.pieces)) throw new Error('Not sent: the message was not in the agreed shape.');

                const response = await this.d.send(`${cfg.address}/sync`, { method: 'POST', headers: auth, body });
                if (response.status === 404) throw slWhy('password', 'The server does not know this password.');
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

                if (sendWorth) {
                    this.worthJson = worthJson;
                    this.worthAt = now;
                }
                // A server that started afresh has forgotten what the pieces are worth, and may be another one: asked again.
                if (answer.born !== undefined && answer.born !== born) {
                    if (born !== null) { this.worthJson = ''; state.helloOk = false; }
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
                if (!Array.isArray(answer.reads) || answer.reads.length < SERVER_PAGE) break;
            }
        } catch (error) {
            state.error = String(error && error.message ? error.message : error).slice(0, 160);
            state.why = (error && error.why) || null;
            state.needVer = (error && error.needVer) || null;
            if (state.why) state.retryAt = startedAt + SERVER_RETRY_MS;
        }
        state.born = born;
        this.d.save(SERVER_STATE_KEY, state);
        if (this.d.onChange) this.d.onChange();
    }

    /** For Settings (core/server.js serverLines). The password is not in it. */
    status(now = this.now()) {
        const cfg = this.config();
        const typed = this.d.load(SERVER_CONFIG_KEY) || {};
        const state = cfg ? this.state() : {};
        return {
            on: Boolean(cfg),
            address: cfg ? cfg.address : null,
            typed: String(typed.address || ''),
            hasPass: serverPassOk(typed.pass),
            okAt: state.okAt || null,
            syncAt: state.syncAt || null,
            error: state.error || null,
            why: state.why || null,
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
            now,
        };
    }
}
