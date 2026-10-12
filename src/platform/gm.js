/*
 * Userscript-host adapter.
 *
 * Every GM_* call in the project goes through this file. core/ and api/ never
 * touch it directly, so those layers stay portable to a plain web app: swap
 * this one module for a localStorage (or server) adapter and nothing else
 * changes.
 *
 * Falls back to an in-memory store when the GM_* globals are absent, which is
 * what lets the unit tests run under plain node.
 */

const GM_NAMESPACE = 'tornArchive.v1.';

const gmMemoryStore = new Map();

const gmHasStorage =
    typeof GM_getValue === 'function' && typeof GM_setValue === 'function';

function gmKey(key) {
    return GM_NAMESPACE + key;
}

/*
 * The speed log's probe (3.17.0, platform/perf.js): told of each read and
 * write - the value's name, how long it took, how long its text is. Two
 * clock reads a call while one is set; nothing at all otherwise (the tests).
 */
let gmProbe = null;
const gmClock = typeof performance !== 'undefined' && typeof performance.now === 'function' ? () => performance.now() : () => 0;

/** @param {null|function(string, boolean, number, number)} probe - (key, isWrite, ms, textLength) */
export function gmSetProbe(probe) {
    gmProbe = typeof probe === 'function' ? probe : null;
}

/** How long a stored value's text is (0 when absent) - its size, without parsing it. */
export function gmSize(key) {
    const full = gmKey(key);
    const raw = gmHasStorage ? GM_getValue(full, null) : gmMemoryStore.has(full) ? gmMemoryStore.get(full) : null;
    return typeof raw === 'string' ? raw.length : 0;
}

/** Read a JSON-serialisable value. Returns `fallback` if absent or corrupt. */
export function gmGet(key, fallback = null) {
    if (!gmProbe) return gmRead(key, fallback, null);
    const t = gmClock();
    const size = [0];
    const out = gmRead(key, fallback, size);
    gmProbe(key, false, gmClock() - t, size[0]);
    return out;
}

function gmRead(key, fallback, size) {
    const full = gmKey(key);

    let raw;
    if (gmHasStorage) {
        raw = GM_getValue(full, null);
    } else {
        raw = gmMemoryStore.has(full) ? gmMemoryStore.get(full) : null;
    }

    if (raw === null || raw === undefined || raw === '') return fallback;
    if (size && typeof raw === 'string') size[0] = raw.length;

    try {
        return JSON.parse(raw);
    } catch {
        // A corrupt entry is not worth crashing over; treat it as absent.
        return fallback;
    }
}

/** Write a JSON-serialisable value. */
export function gmSet(key, value) {
    const t = gmProbe ? gmClock() : 0;
    const full = gmKey(key);
    const raw = JSON.stringify(value);

    if (gmHasStorage) {
        GM_setValue(full, raw);
    } else {
        gmMemoryStore.set(full, raw);
    }
    if (gmProbe) gmProbe(key, true, gmClock() - t, typeof raw === 'string' ? raw.length : 0);
}

/** Remove a stored value. */
export function gmDel(key) {
    const full = gmKey(key);

    if (gmHasStorage && typeof GM_deleteValue === 'function') {
        GM_deleteValue(full);
    } else if (gmHasStorage) {
        GM_setValue(full, '');
    } else {
        gmMemoryStore.delete(full);
    }
}

/** Register a Tampermonkey menu command, if the host supports them. */
export function gmMenu(label, handler) {
    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand(label, handler);
    }
}

/**
 * HTTP GET through the userscript host's own transport.
 *
 * This matters more than it looks. A plain fetch() from a userscript runs in
 * the PAGE's context and is therefore subject to Torn's Content-Security-
 * Policy: if their CSP does not allow connect-src to api.torn.com, every API
 * call is blocked by the browser before it is sent. The panel still loads and
 * the buttons still respond - there is simply never any data, which presents
 * as "it does not scan".
 *
 * GM_xmlhttpRequest runs outside the page, so the page's CSP does not apply.
 * It requires `@connect api.torn.com` in the header.
 *
 * Falls back to fetch when the host does not provide it (and under node, for
 * the tests).
 *
 * @param {string} url
 * @param {{timeoutMs?: number}} [options] - how long to wait for the answer (30 s)
 * @returns {Promise<{ok: boolean, status: number, json: function, header: function(string): (string|null)}>}
 */
export function gmFetch(url, { timeoutMs = 30000 } = {}) {
    if (typeof GM_xmlhttpRequest !== 'function') {
        if (typeof fetch === 'function') return fetch(url);
        return Promise.reject(new Error('No HTTP transport available.'));
    }

    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'GET',
            url,
            timeout: timeoutMs,
            onload(response) {
                resolve({
                    ok: response.status >= 200 && response.status < 300,
                    status: response.status,
                    json: async () => JSON.parse(response.responseText),
                    // One answer header by name (TornW3B's Retry-After on a 429), or null.
                    header: (name) => gmHeader(response.responseHeaders, name),
                });
            },
            onerror() {
                reject(new Error('Network request failed.'));
            },
            ontimeout() {
                reject(new Error('Torn API request timed out.'));
            },
        });
    });
}

/**
 * A request that carries a body or headers (Torn Archive: your own price list on TornW3B, the shared server).
 * Never used for Torn's API. The answer has the same shape as gmFetch's.
 */
export function gmSend(url, { method = 'GET', headers = {}, body = null, timeoutMs = 30000 } = {}) {
    const data = body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
    const head = { ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers };
    if (typeof GM_xmlhttpRequest !== 'function') {
        if (typeof fetch === 'function') return fetch(url, { method, headers: head, body: data }).then((r) => ({ ok: r.ok, status: r.status, json: () => r.json(), text: () => r.text(), header: (name) => r.headers.get(name) }));
        return Promise.reject(new Error('No HTTP transport available.'));
    }
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method, url, headers: head, data, timeout: timeoutMs,
            onload(response) {
                resolve({
                    ok: response.status >= 200 && response.status < 300,
                    status: response.status,
                    json: async () => JSON.parse(response.responseText),
                    text: async () => String(response.responseText || ''),
                    header: (name) => gmHeader(response.responseHeaders, name),
                });
            },
            onerror() { reject(new Error('Network request failed.')); },
            ontimeout() { reject(new Error('The request timed out.')); },
        });
    });
}

/** One header out of GM_xmlhttpRequest's raw header text ("name: value" lines), whatever its case; null when absent. */
export function gmHeader(raw, name) {
    const want = String(name || '').toLowerCase();
    for (const line of String(raw || '').split(/\r?\n/)) {
        const at = line.indexOf(':');
        if (at > 0 && line.slice(0, at).trim().toLowerCase() === want) return line.slice(at + 1).trim();
    }
    return null;
}

/** Open a URL in a new tab, if the host supports it; otherwise fall back. */
export function gmOpenTab(url) {
    if (typeof GM_openInTab === 'function') {
        GM_openInTab(url, { active: true });
    } else if (typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener');
    }
}

/**
 * Be told when ANOTHER tab changes a stored value. This is how follower tabs
 * see the live feed the leader tab writes, without polling anything.
 * Returns false when the host has no listener API (the caller then re-reads
 * on its own timer).
 */
export function gmOnChange(key, handler) {
    if (typeof GM_addValueChangeListener !== 'function') return false;

    GM_addValueChangeListener(gmKey(key), (_name, _old, _new, remote) => {
        if (remote) handler();
    });

    return true;
}

/**
 * Put text on the clipboard (3.24.0, Sets: a trade message, a forum title). Only ever on a press of yours.
 * @returns {boolean} false when the host has no way to do it
 */
export function gmCopy(text) {
    const value = String(text ?? '');
    try {
        if (typeof GM_setClipboard === 'function') {
            GM_setClipboard(value, 'text');
            return true;
        }
        if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(value).catch(() => {});
            return true;
        }
    } catch {
        // No clipboard: the caller says so.
    }
    return false;
}

/**
 * Text with its look (a struck-out word in your forum post): both forms go on the clipboard, and where you
 * paste decides which it takes - Torn's forum box the one with the look, a plain box the plain one. A browser
 * that cannot put both gets the plain text (gmCopy). Only ever on a press of yours.
 */
export function gmCopyRich(text, html) {
    const plain = String(text ?? '');
    try {
        if (html && typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.write === 'function' && typeof ClipboardItem === 'function') {
            const item = new ClipboardItem({ 'text/plain': new Blob([plain], { type: 'text/plain' }), 'text/html': new Blob([String(html)], { type: 'text/html' }) });
            navigator.clipboard.write([item]).catch(() => { gmCopy(plain); });
            return true;
        }
    } catch {
        // The plain text then.
    }
    return gmCopy(plain);
}
