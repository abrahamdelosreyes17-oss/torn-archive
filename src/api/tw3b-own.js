// Your own price list on TornW3B, and its receipts: the only calls that carry the key you registered there.
// The key rides in the `X-API-Key` header, never in an address. Nothing here is ever asked of Torn, and nothing
// here runs on a server: TornW3B is asked from your own browser only. What to send and what came back is worked
// out in core/tw3b-list.js; this file only sends.

import { gmSend } from '../platform/gm.js';
import { W3B_API_BASE } from './w3b.js';

/** Writes are few and yours alone: never more than this many a minute, whatever asks. */
export const TW3B_OWN_PER_MINUTE = 6;

export class Tw3bOwnError extends Error {
    constructor(message, { http = null, local = false } = {}) {
        super(message);
        this.name = 'Tw3bOwnError';
        this.http = http;
        this.local = local;
    }
}

const ownId = (v) => String(v == null ? '' : v).replace(/\D/g, '');

/**
 * @param getKey   () => the key registered on TornW3B, or ''
 * @param getUser  () => your Torn id
 * @param send     gmSend, or a stand-in for tests
 * @param isPaused () => true while Torn Trading runs: nothing is sent
 */
export class Tw3bOwnClient {
    constructor({ getKey, getUser, send = gmSend, now = () => Date.now(), isPaused = () => false, onSent = null, onFailed = null, perMinute = TW3B_OWN_PER_MINUTE } = {}) {
        this.getKey = getKey;
        this.getUser = getUser;
        this.send = send;
        this.now = now;
        this.isPaused = isPaused;
        this.onSent = onSent;
        this.onFailed = onFailed;
        this.perMinute = perMinute;
        this.recent = [];
    }

    url(path) {
        const user = ownId(this.getUser && this.getUser());
        if (!user) throw new Tw3bOwnError('Your Torn id is not known yet.', { local: true });
        return W3B_API_BASE + path.replace('{user}', user);
    }

    async ask(method, path, { body = null, key = true, tag = 'w.own' } = {}) {
        let paused = false;
        try { paused = !!this.isPaused(); } catch { paused = false; }
        if (paused) throw new Tw3bOwnError('Paused while Torn Trading runs.', { local: true });
        const k = key ? String((this.getKey && this.getKey()) || '').trim() : '';
        if (key && !k) throw new Tw3bOwnError('The key you registered on TornW3B is not set.', { local: true });
        const t = this.now();
        this.recent = this.recent.filter((x) => t - x < 60000);
        if (this.recent.length >= this.perMinute) throw new Tw3bOwnError('Too many requests to TornW3B in a minute: waited.', { local: true });
        const url = this.url(path);
        this.recent.push(t);
        let res;
        try {
            res = await this.send(url, { method, headers: k ? { 'X-API-Key': k } : {}, body });
        } catch (error) {
            const e = new Tw3bOwnError(String((error && error.message) || error));
            if (this.onFailed) this.onFailed({ path, tag, error: e });
            throw e;
        }
        if (this.onSent) this.onSent({ path, tag });
        if (!res.ok) {
            const words = res.status === 401 ? 'TornW3B does not know this key (401).' : res.status === 429 ? 'TornW3B asked to wait (429).' : 'TornW3B answered ' + res.status + '.';
            const e = new Tw3bOwnError(words, { http: res.status });
            if (this.onFailed) this.onFailed({ path, tag, error: e });
            throw e;
        }
        try { return await res.json(); } catch { return null; }
    }

    /** Your list as TornW3B has it. */
    readList() { return this.ask('GET', 'pricelist/{user}', { key: false, tag: 'w.own' }); }

    /** Set and remove prices (core/tw3b-list.js putBody). */
    putList(body) { return this.ask('PUT', 'pricelist/{user}', { body, tag: 'w.own' }); }

    /** A receipt for one trade, made from your list (core/tw3b-list.js receiptBody). */
    makeReceipt(body) { return this.ask('POST', 'pricelist/{user}', { body, key: false, tag: 'w.own' }); }

    /** Your newest receipts: [{ id, name, value }]. */
    async receipts() {
        const json = await this.ask('GET', 'trades/{user}', { tag: 'w.own' });
        const rows = (json && (json.trades || json.receipts || json.data)) || json;
        return Array.isArray(rows) ? rows : [];
    }

    /** One receipt in full: { id, trade_id, total_value, created_at, ... }. */
    receipt(id) { return this.ask('GET', 'trades/{user}/' + encodeURIComponent(String(id)), { tag: 'w.own' }); }
}
