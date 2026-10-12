// Torn Archive: where it starts.
//
// On its own page (one tab of yours) it is the hub: the one place that asks Torn's API and TornW3B anything, in
// view or not, and works your sets out. On Torn's pages it asks nothing: it shows a small box and marks from what
// the hub worked out, and tells the hub what the page showed. Beside Torn Trading it keeps running, and the two
// share the limits: the one whose page you look at asks more, the other less (core/turns.js).
//
// Your keys are pasted by you into Settings and kept in Tampermonkey's storage. A Torn key goes to api.torn.com
// only. The key you registered on TornW3B goes to weav3r.dev only, in a header, for your own price list and your
// receipts. The shared server, once you save its address and your password for it, is told bazaar and item numbers,
// prices and counts - never a key, never your stock or your money. Nothing presses a button of Torn's.

import { gmGet, gmSet, gmDel, gmMenu, gmOpenTab, gmOnChange, gmCopy, gmCopyRich, gmSend } from './platform/gm.js';
import { tabWindow } from './platform/tab-window.js';
import { perfStart, perfTimed, perfRecord, perfMachine } from './platform/perf.js';
import { TornApiClient } from './api/client.js';
import { LedgerClient } from './api/ledger.js';
import { W3bClient } from './api/w3b.js';
import { Tw3bOwnClient } from './api/tw3b-own.js';
import { ServerLink, SERVER_CONFIG_KEY, SERVER_CALLS_KEY } from './api/server-link.js';
import { serverMayCall, serverLines, SERVER_CAREFUL_MOST } from './core/server.js';
import { makeEngine, ENGINE_ALL_PIECES } from './engine/engine.js';
import { ENGINE_PARTS } from './engine/state.js';
import { archiveSettings } from './core/settings.js';
import { viewForTabs } from './core/view.js';
import { tradeNotice } from './core/trades.js';
import { makeTabId } from './core/leader.js';
import { hubLeader, HUB_LEAD_KEY, HUB_LEAD_BEAT_MS } from './core/hub-leader.js';
import { tradingOnPage, tradingRunning, shouldMarkSeen, shouldMarkView, archiveInFront, shareNow, markText, readMark, SHARES, TRADING_SEEN_KEY, TRADING_VIEW_KEY, ARCHIVE_VIEW_KEY, FRONT_MARK, BEHIND_MARK, ALIVE_MARK, shouldMarkAlive, TRADING_LOOK_EVERY_MS, W3B_MARK, W3B_OTHER_MARK, w3bMarkText, readW3bMark } from './core/turns.js';
import { usageAdd, usageMerge, usageSeries, usageLabel, usageCsv, usageCallsAdd } from './core/usage.js';
import { addLogEntries, logText, logAsText } from './core/errlog.js';
import { speedFiles } from './core/speed.js';
import { makeZip } from './core/zip.js';
import { isArchivePageUrl, ARCHIVE_PAGE_URL } from './sources/route.js';
import { mountHub } from './ui/hub.js';
import { REVEAL_MS } from './ui/mask.js';
import { mountTornPage, SHARED_VIEW_KEY, SHARED_NOTES_KEY, NOTES_KEEP_MS } from './ui/torn-page.js';

const VERSION = typeof TARC_BUILD_VERSION === 'string' ? TARC_BUILD_VERSION : 'dev';
/** The shared server's address, built in (build.mjs). '' in a copy built without one. */
const SERVER_HOME = typeof TARC_SERVER_HOME === 'string' ? TARC_SERVER_HOME : '';

/** Torn Trading's own page: Torn Archive only notes that Torn Trading runs there, and when you look at it. */
const TRADING_PAGE_URL = 'https://abrahamdelosreyes17-oss.github.io/torn-moneymaker-releases/';

const STEP_MS = 5 * 1000;
/** The hub in view draws at most this often by itself; your own press is drawn at once (1.3.0, the calm pace). */
const DRAW_CALM_MS = 1000;
const DRAW_PRESS_MS = 30;
/** Presses that change nothing on the screen: no draw follows them. */
const HUB_QUIET = new Set(['look', 'copy', 'zip', 'usageExport']);
const USAGE_FLUSH_MS = 15 * 1000;
const KEY_KINDS = ['limited', 'full', 'w3b'];
const keyOf = (kind) => String(gmGet('key.' + kind, '') || '').trim();
const store = { get: gmGet, set: gmSet, del: gmDel };

// ---- the logs: what was asked of whom, and what went wrong. Never a key. -------------------------------------------------

let usagePending = {};
let usageTimer = 0;
/** Is the shared server on? Set by the hub: only there are requests made. */
let serverOn = () => false;
const refusedAt = [];

function flushUsage() {
    if (usageTimer) clearTimeout(usageTimer);
    usageTimer = 0;
    if (!Object.keys(usagePending).length) return;
    const pending = usagePending;
    usagePending = {};
    gmSet('usage', usageMerge(gmGet('usage', null), pending));
    // With the shared server on, the same counts wait in one sum for the next exchange (how many requests of each
    // kind, and how TornW3B answered; nothing else).
    if (serverOn()) gmSet(SERVER_CALLS_KEY, usageCallsAdd(gmGet(SERVER_CALLS_KEY, null), pending));
}

function recordUse(service, tag) {
    usageAdd(usagePending, usageLabel(tag && (String(tag).charAt(0) === service || String(tag).startsWith('r.' + service + '.')) ? tag : service + '.other'));
    if (!usageTimer) usageTimer = setTimeout(flushUsage, USAGE_FLUSH_MS);
}

function logLine(kind, where, what, detail = null) {
    const entry = { at: Date.now(), kind, where, what: logText(what), ...(detail ? { detail: logText(detail) } : {}) };
    gmSet('log', addLogEntries(gmGet('log', []), [entry]));
}

function logFailed(service, x) {
    const e = x && x.error;
    if (e && (e.local || e.takingTurns)) return;
    logLine('error', service === 't' ? 'Torn API' : 'TornW3B', String(x.path || '').split('?')[0] + ': ' + String((e && e.message) || e || 'failed'), e && (e.code || e.http) ? 'code ' + (e.code ?? '') + ' http ' + (e.http ?? '') + (e.said ? ' · it said: ' + e.said : '') : null);
}

// ---- Torn Trading seen on this page: said to every tab ---------------------------------------------------------------

/**
 * This page is being looked at (in view, with the keyboard): said to every tab of ours, and to the other app through
 * the site's own page storage (both apps' pages live on one site; two userscripts cannot read each other's values).
 */
function markViewed(app, key) {
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return false;
    const now = Date.now();
    if (!shouldMarkView(gmGet(key, 0), now)) return false;
    gmSet(key, now);
    try { window.localStorage.setItem(FRONT_MARK, markText({ app, at: now })); } catch { /* no page storage: Torn Trading is never told, and we stay behind it */ }
    return true;
}

function watchTrading(itsOwnPage) {
    const look = () => {
        const now = Date.now();
        if (tradingOnPage(document) && shouldMarkSeen(gmGet(TRADING_SEEN_KEY, 0), now)) gmSet(TRADING_SEEN_KEY, now);
        if (itsOwnPage) markViewed('trading', TRADING_VIEW_KEY);
    };
    look();
    if (itsOwnPage) {
        window.addEventListener('focus', look);
        document.addEventListener('visibilitychange', look);
    }
    return setInterval(look, TRADING_LOOK_EVERY_MS);
}

// ---- the hub ---------------------------------------------------------------------------------------------------------

function bootHub(tabId) {
    const now = () => Date.now();
    let frontSince = 0;
    let share = { mode: 'alone', why: '', ...SHARES.alone };
    let leading = false;
    let engine = null;
    let hub = null;
    let drawT = 0;
    let drawDue = 0;
    let drawnAt = 0;
    let notice = null;
    let shareAt = 0;
    let shareTried = 0;
    let shared = '';
    let notesTaken = null;
    let stepping = false;
    let link = null;
    let serverMsg = '';
    let serverSaid = '';
    const shown = { limited: 0, full: 0, w3b: 0 };

    const settings = () => archiveSettings(gmGet('settings', null));

    const tornWin = tabWindow('win.torn', tabId, store);
    const w3bWin = tabWindow('win.w3b', tabId, store);
    const listWin = tabWindow('win.w3blist', tabId, store);
    const tornShared = {
        maxPerMinute: SHARES.alone.torn,
        loadWindow: () => tornWin.load(),
        addToWindow: (at) => tornWin.add(at),
        loadPause: () => gmGet('tornPause', null),
        savePause: (p) => gmSet('tornPause', p),
        onSent: (x) => recordUse('t', x.tag),
        onFailed: (x) => logFailed('t', x),
        // Beside the shared server: its part of your Torn limit is left to it (core/server.js). Off, or silent: no check.
        mayCall: (t, recent) => serverMayCall(link ? link.grant() : null, recent, t),
        // What Torn's "too many" taught, for every tab; and the careful pace while the server does not let this copy in.
        loadCeil: () => gmGet('tornCeil', null),
        saveCeil: (c) => gmSet('tornCeil', c),
        turnedAway: () => !!link && link.turnedAway(),
        carefulMost: SERVER_CAREFUL_MOST,
    };
    const torn = new TornApiClient({ getKey: () => keyOf('limited'), ...tornShared });
    const full = new LedgerClient({ getKey: () => keyOf('full'), ...tornShared });
    // Calls held back for the server's part: it is asked for room sooner than its next exchange.
    torn.onHeld = () => { if (link) link.askSoon(); };
    full.onHeld = torn.onHeld;
    const w3b = new W3bClient({
        maxPerMinute: SHARES.alone.w3b,
        onSent: (x) => recordUse('w', x.tag),
        onAnswered: (x) => recordUse('w', 'r.w.' + x.how),
        onFailed: (x) => logFailed('w', x),
        onLocal: () => { refusedAt.push(now()); },
        loadShared: () => ({ recent: w3bWin.load(), cooldownUntil: Number(gmGet('w3bCool', 0)) || 0 }),
        saveShared: (s) => gmSet('w3bCool', s.cooldownUntil),
        addShared: (at) => w3bWin.add(at),
        loadListing: () => listWin.load(),
        addListing: (at) => listWin.add(at),
        loadListingDay: () => gmGet('w3bListDay', {}),
        saveListingDay: (counts) => {
            gmSet('w3bListDay', counts);
            // Told to Torn Bids through the page's storage: TornW3B counts the two apps as one address.
            try { window.localStorage.setItem(W3B_MARK, w3bMarkText(listWin.load(), counts, now())); } catch { /* no page storage: Torn Bids counts only its own */ }
        },
        loadListingOther: () => {
            try { return readW3bMark(window.localStorage.getItem(W3B_OTHER_MARK), now()); } catch { return null; }
        },
    });
    const own = new Tw3bOwnClient({
        getKey: () => keyOf('w3b'),
        getUser: () => (engine ? engine.state.self.id : ''),
        onSent: (x) => recordUse('w', x.tag),
        onFailed: (x) => logFailed('w', x),
    });

    /**
     * The hub is drawn again. By itself (a read came in) at most once a second; `soon`: your own press, at once.
     * Out of view nothing is drawn - one draw when you come back - and Torn's tabs still get what changed.
     * (Until 1.3.0 every read drew the whole page 60 ms later, in view or not.)
     */
    function schedule(soon = false) {
        if (document.visibilityState !== 'visible') { shareView(); return; }
        const t = now();
        const at = soon === true ? t + DRAW_PRESS_MS : Math.max(t + 60, drawnAt + DRAW_CALM_MS);
        if (drawT && drawDue <= at) return;
        if (drawT) clearTimeout(drawT);
        drawDue = at;
        drawT = setTimeout(() => { drawT = 0; draw(); }, Math.max(0, at - t));
    }

    // ---- the limits shared with Torn Trading: more for the one you look at ---------------------------------------------

    /** What Torn Archive may ask a minute now, told to the clients. Going down takes effect at once. */
    function applyShare() {
        const t = now();
        const seenAt = gmGet(TRADING_SEEN_KEY, 0);
        const viewAt = gmGet(ARCHIVE_VIEW_KEY, 0);
        const theirsAt = gmGet(TRADING_VIEW_KEY, 0);
        const front = tradingRunning(seenAt, t) && archiveInFront(viewAt, theirsAt);
        if (!front) frontSince = 0;
        else if (!frontSince) frontSince = t;
        let behind = null;
        try { behind = readMark(window.localStorage.getItem(BEHIND_MARK)); } catch { behind = null; }
        const s = shareNow({ now: t, tradingSeenAt: seenAt, tradingViewAt: theirsAt, archiveViewAt: viewAt, behind, frontSince });
        torn.maxPerMinute = s.torn;
        full.maxPerMinute = s.torn;
        w3b.maxPerMinute = s.w3b;
        w3b.sharedPerMinute = s.w3b;
        const changed = s.mode !== share.mode || s.why !== share.why || s.torn !== share.torn || s.w3b !== share.w3b;
        share = s;
        if (changed) schedule();
        return s;
    }

    /** Torn Archive's page is open: said to Torn Trading in the site's page storage, in view or not. Any tab of it may. */
    function alive() {
        const t = Date.now();
        try {
            const had = readMark(window.localStorage.getItem(ALIVE_MARK));
            if (shouldMarkAlive(had && had.app === 'archive' ? had.at : 0, t)) window.localStorage.setItem(ALIVE_MARK, markText({ app: 'archive', at: t }));
        } catch { /* no page storage: Torn Trading goes by when this page was last looked at */ }
    }

    /** This page looked at: said, and the share worked out again. */
    function looked() {
        if (markViewed('archive', ARCHIVE_VIEW_KEY)) applyShare();
    }

    function notify(n) {
        const s = settings();
        notice = { ...n, at: now() };
        if (s.notify === 'off') return;
        const hidden = document.visibilityState !== 'visible';
        if (s.notify === 'browser' && hidden && typeof Notification === 'function' && Notification.permission === 'granted') {
            try {
                const note = new Notification(n.title, { body: n.body, tag: 'tarc-trade-' + (n.tradeId || '') });
                note.onclick = () => { window.focus(); if (hub && n.tradeId) hub.go('trades', 0); note.close(); };
            } catch { /* the toast below still says it */ }
        }
        if (hub) hub.toast(n);
        if (s.sound) beep();
    }

    function beep() {
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (!Ctx) return;
            const ctx = new Ctx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.value = 880;
            gain.gain.setValueAtTime(0.0001, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
            osc.connect(gain).connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.4);
            osc.onended = () => ctx.close();
        } catch { /* no sound then */ }
    }

    function newEngine() {
        return makeEngine({
            now,
            load: (part) => gmGet('s.' + part, null),
            // Only the tab that reads writes: a tab that gave the reading away must not write its old copy back.
            save: (part, value) => { if (leading) gmSet('s.' + part, value); },
            settings,
            torn, full, w3b, own,
            hasKey: (kind) => !!keyOf(kind),
            paused: () => false,
            say: (kind, what, detail) => logLine(kind, 'Torn Archive', what, detail),
            changed: () => schedule(),
            notify,
            kick: () => { step(); },
            // The engine's own working-out, in the speed log: it was most of what froze the page and was not timed.
            timed: perfTimed,
        });
    }

    // ---- the shared server: every 30 s, by the tab that reads -----------------------------------------------------

    let greeted = false;
    let besideWas = false;

    link = new ServerLink({
        load: (key) => gmGet(key, null),
        save: gmSet,
        del: gmDel,
        send: gmSend,
        now,
        version: VERSION,
        home: SERVER_HOME,
        getId: () => (engine ? engine.state.self.id : ''),
        random: () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join(''),
        lowered: () => torn.ceilNow(now()) !== null,
        pieces: ENGINE_ALL_PIECES,
        getUse: () => ({ used: torn.stats(now()).usedLastMinute, waiting: torn.queue.length + full.queue.length }),
        tradingOn: () => tradingRunning(gmGet(TRADING_SEEN_KEY, 0), now()),
        getWant: () => engine.serverWant(),
        getMark: () => engine.serverMark(),
        take: (answer, got) => { if (leading) engine.serverTook(answer, got); },
        forget: () => { if (engine) engine.serverForget(); },
        onChange() {
            // Said once in the problem log when it changes. Never the password.
            const said = link.status().error || '';
            if (said !== serverSaid) { serverSaid = said; if (said) logLine('note', 'Torn Shared Server', said); }
            schedule();
        },
    });

    serverOn = () => link.on();

    function serverDesk() {
        const st = link.status();
        return { ...serverLines(st, now()), bazaars: engine ? Object.keys(engine.state.server.shops).length : 0, address: st.address || '', typed: st.typed, hasPass: st.hasPass, own: st.own, builtIn: st.builtIn, msg: serverMsg };
    }

    // ---- what Torn's tabs told us ------------------------------------------------------------------------------

    function readNotes() {
        if (!leading || !engine) return;
        const t = now();
        const q = gmGet(SHARED_NOTES_KEY, []);
        if (!Array.isArray(q) || !q.length) return;
        const done = new Set(gmGet('notesDone', []));
        let any = false;
        let moved = false;
        for (const n of q) {
            if (!n || !n.id || done.has(n.id) || t - n.t > NOTES_KEEP_MS) continue;
            done.add(n.id);
            any = true;
            try {
                // A press in the box on a Torn page. Start, Next and Stop of the run; Next may name the bazaar you
                // stand in. Written down with how long it waited: a press that seemed dead shows in the zip.
                if (n.kind === 'act') {
                    const args = Array.isArray(n.what && n.what.args) ? n.what.args.slice(0, 2) : [];
                    logLine('note', 'A Torn page', 'A press in the box taken: ' + String((n.what && n.what.name) || '') + ' ' + args.map(String).join(' '), 'it waited ' + Math.max(0, t - n.t) + ' ms');
                    if (n.what && n.what.name === 'run') engine.act('run', ...args);
                    moved = true;
                }
                // 'press': Torn's own Buy pressed on a listing - counted for nothing, your log is asked soon after.
                else if (n.kind === 'buy' || n.kind === 'swap' || n.kind === 'thread' || n.kind === 'trade' || n.kind === 'shop' || n.kind === 'press') { engine.note(n.kind, n.what); moved = moved || n.kind === 'buy' || n.kind === 'swap' || n.kind === 'shop'; }
                // "Read" on your stock, pressed on a Torn page: your items are asked for now, ahead of the rest.
                else if (n.kind === 'read') { engine.act('readStock'); logLine('note', 'A Torn page', 'Read pressed on your stock', 'it waited ' + Math.max(0, t - n.t) + ' ms'); moved = true; }
                // What a Torn tab saw of its page, for the log: it is in the zip.
                else if (n.kind === 'say' && n.what) logLine('note', 'A Torn page', String(n.what.what || ''), n.what.detail ? String(n.what.detail) : null);
            } catch (error) {
                logLine('error', 'Torn Archive', 'A note from a Torn page was not taken: ' + n.kind, String((error && error.message) || error));
            }
        }
        if (!any) return;
        notesTaken = [...done].slice(-300);
        gmSet('notesDone', notesTaken);
        // A buy, a swap or a press of the run: Torn's tabs get the new view now, not at the next redraw (a tab out
        // of view redraws once a minute), and it names the notes it holds.
        if (moved) { shareView(true); schedule(true); }
    }

    /** What Torn's tabs show: shared when it changed, and at least once a minute so they know it is alive. */
    function shareView(now_ = false, view = null) {
        if (!leading || !engine) return;
        const t = now();
        if (!now_ && (t - shareAt <= 5000 || t - shareTried <= 5000)) return;
        shareTried = t;
        const v = viewForTabs(view || (now_ ? engine.view() : engine.calm()));
        const json = JSON.stringify(v);
        if (!now_ && json === shared && t - shareAt <= 60000) return;
        shared = json;
        shareAt = t;
        if (!notesTaken) notesTaken = gmGet('notesDone', []);
        gmSet(SHARED_VIEW_KEY, { at: t, v, notes: (Array.isArray(notesTaken) ? notesTaken : []).slice(-60) });
    }

    // ---- the desk the hub draws ----------------------------------------------------------------------------------

    function keysDesk() {
        const st = engine.keys() || {};
        const out = {};
        const t = now();
        for (const kind of KEY_KINDS) {
            const key = keyOf(kind);
            const s = st[kind] || {};
            out[kind] = { set: !!key, ok: !!s.ok, error: s.error || '', shown: key && shown[kind] > t ? key : '' };
        }
        return out;
    }

    function usageDesk() {
        const t = now();
        const rec = usageMerge(gmGet('usage', null), usagePending, t);
        const tornBars = usageSeries(rec, { service: 't', range: '1h', now: t }).bars.map((b) => b.total);
        const w3bBars = usageSeries(rec, { service: 'w', range: '1h', now: t }).bars.map((b) => b.total);
        while (refusedAt.length && t - refusedAt[0] > 3600000) refusedAt.shift();
        return { torn: tornBars, w3b: w3bBars, nowTorn: tornBars[tornBars.length - 1] || 0, nowW3b: w3bBars[w3bBars.length - 1] || 0, refused: refusedAt.length };
    }

    function desk() {
        return {
            view: perfTimed('view', () => engine.view()),
            keys: keysDesk(),
            usage: usageDesk(),
            turns: { ...share },
            server: serverDesk(),
            busy: engine.busy(),
            notice,
            version: VERSION,
            elsewhere: !leading,
        };
    }

    function draw() {
        if (!hub || !engine) return;
        drawnAt = now();
        const d = desk();
        perfTimed('draw', () => hub.show(d));
        shareView(false, d.view);
    }

    // ---- which tab reads ---------------------------------------------------------------------------------------------

    function lead(claim = false) {
        const r = hubLeader(gmGet(HUB_LEAD_KEY, null), tabId, { now: now(), claim });
        if (r.write) gmSet(HUB_LEAD_KEY, r.write);
        if (r.lead === leading) return;
        leading = r.lead;
        // The tab that takes the reading over starts from what is stored, not from its own older copy.
        if (leading) engine = newEngine();
        schedule();
    }

    async function step() {
        lead();
        looked();
        // Torn Trading seen, gone for two minutes, or looked at: the limits follow without a press.
        applyShare();
        if (!leading || stepping) return;
        stepping = true;
        try {
            readNotes();
            // Torn Trading came on: a server that did not know this PC may know it now.
            const beside = tradingRunning(gmGet(TRADING_SEEN_KEY, 0), now());
            if (beside && !besideWas) link.wake();
            besideWas = beside;
            // Before this page's first reads the server is told the PC is on, so that it makes room: its own
            // requests of the last minute come back with the answer and are waited out. Never longer than 5 s.
            if (!greeted && engine.state.self.id && engine.state.items.at) {
                greeted = true;
                link.wake();
                await Promise.race([link.tick().catch(() => false), new Promise((done) => setTimeout(done, 5000))]);
            }
            await engine.step();
            // Not before Torn has said who you are and what the pieces are: your own bazaar is left out by your id.
            if (engine.state.self.id && engine.state.items.at) link.tick().catch((error) => logLine('error', 'Torn Shared Server', 'An exchange stopped', String((error && error.message) || error)));
        } catch (error) {
            logLine('error', 'Torn Archive', 'A round of reads stopped', String((error && error.stack) || error));
        } finally {
            stepping = false;
        }
        if (now() - shareAt > 60000) schedule();
    }

    // ---- what a press in the hub asks ----------------------------------------------------------------------------

    function download(name, bytes, type) {
        const url = URL.createObjectURL(new Blob([bytes], { type }));
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

    function zip() {
        flushUsage();
        const t = now();
        const S = engine.state;
        // What was read and worked out, for finding a fault. No key is in it: keys are stored apart and never read here.
        const state = {};
        for (const part of ENGINE_PARTS) state[part] = S[part];
        const files = [
            { name: 'about.txt', text: 'Torn Archive ' + VERSION + '\nMade ' + new Date(t).toString() + '\nKeys set: ' + KEY_KINDS.filter((k) => keyOf(k)).join(', ') + '\nPieces watched: ' + ENGINE_ALL_PIECES.length + '\nNo key is in this file or any file beside it.\n' },
            { name: 'problems.txt', text: logAsText(gmGet('log', [])) },
            { name: 'usage-by-minute.csv', text: usageCsv(gmGet('usage', null), { by: 'minute' }) },
            { name: 'settings.json', text: JSON.stringify(settings(), null, 1) },
            { name: 'key-states.json', text: JSON.stringify(engine.keys(), null, 1) },
            { name: 'state.json', text: logText(JSON.stringify(state), 20 * 1024 * 1024) },
            ...speedFiles(perfRecord(t), { machine: perfMachine(), version: VERSION, now: t }),
        ];
        download('torn-archive-' + stamp() + '.zip', makeZip(files, new Date(t)), 'application/zip');
    }

    const actions = {
        set(patch) {
            gmSet('settings', archiveSettings({ ...settings(), ...patch }));
            engine.settingsChanged();
            if (patch && patch.notify === 'browser' && typeof Notification === 'function' && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
            schedule();
        },
        cart: (id, place) => engine.act('cart', id, place),
        drop: (key) => engine.act('drop', key),
        cartAll: (id) => engine.act('cartAll', id),
        listOnly: (id) => engine.act('listOnly', id),
        makeList: (kind) => engine.act('makeList', kind),
        // The piece open on "Sold by": its bazaars are asked of Torn itself (not connected in 1.2.2: nothing was asked).
        // (1.3.0: no draw follows it. The draw sent it, so until then the Buy page drew itself without end.)
        look: (id) => engine.act('look', id),
        clearList: () => engine.act('clearList'),
        run: (op, place) => engine.act('run', op, place),
        read: () => { logLine('note', 'Torn Archive', 'Pressed: Read now', null); engine.readNow(); step(); },
        // "Read my stock": your items and your log, ahead of the rest, and nothing else.
        readStock: () => { engine.act('readStock'); },
        copy: (text, html) => (html ? gmCopyRich(text, html) : gmCopy(text)),
        keySave(kind, value) {
            if (!KEY_KINDS.includes(kind) || !value) return;
            gmSet('key.' + kind, String(value).trim());
            shown[kind] = 0;
            engine.keyChanged(kind);
            schedule();
            step();
        },
        keyForget(kind) {
            if (!KEY_KINDS.includes(kind)) return;
            gmDel('key.' + kind);
            shown[kind] = 0;
            engine.keyChanged(kind);
            schedule();
        },
        keyShow(kind) {
            if (!KEY_KINDS.includes(kind)) return;
            shown[kind] = shown[kind] > now() ? 0 : now() + REVEAL_MS;
            schedule();
            if (shown[kind]) setTimeout(schedule, REVEAL_MS + 100);
        },
        zip,
        w3b: (op) => engine.act('w3b', op),
        receipt: (id) => engine.act('receipt', id),
        usageExport() { flushUsage(); download('torn-archive-usage-' + stamp() + '.csv', usageCsv(gmGet('usage', null), { by: 'minute' }), 'text/csv'); },
        notifyTest() {
            const ask = typeof Notification === 'function' && Notification.permission === 'default' ? Notification.requestPermission() : Promise.resolve();
            const t = engine.view().trades.open[0];
            const n = t ? { ...tradeNotice(t, t.items, t.total), tradeId: t.id } : { title: 'Someone opened a trade with you', body: 'This is how Torn Archive will tell you.', tradeId: null };
            Promise.resolve(ask).catch(() => {}).then(() => { notify(n); schedule(true); });
        },
        here() { lead(true); step(); },
        serverSave(address, pass) {
            const r = link.saveConfig(address, pass);
            serverMsg = r.ok ? '' : r.why === 'address' ? 'Not saved. It must be the address of your server: https://….workers.dev' : 'Not saved. The password is the long one you were given for the server: letters and digits only.';
            schedule();
            if (r.ok) step();
        },
        serverForget() { link.forget(); serverMsg = ''; schedule(); },
    };

    // Your own press is drawn at once; what the reads bring, at the calm pace.
    for (const name of Object.keys(actions)) {
        if (HUB_QUIET.has(name)) continue;
        const fn = actions[name];
        actions[name] = (...args) => { const r = fn(...args); schedule(true); return r; };
    }

    // ---- start ---------------------------------------------------------------------------------------------------

    perfStart({ where: () => 'Torn Archive' });
    engine = newEngine();
    lead();
    looked();
    alive();
    applyShare();
    hub = mountHub(document, actions);
    draw();
    watchTrading(false);
    setInterval(step, STEP_MS);
    setInterval(alive, TRADING_LOOK_EVERY_MS);
    setInterval(() => { if (leading) gmSet(HUB_LEAD_KEY, { id: tabId, ts: now() }); }, HUB_LEAD_BEAT_MS);
    step();
    gmOnChange(SHARED_NOTES_KEY, () => { readNotes(); });
    gmOnChange(HUB_LEAD_KEY, () => lead());
    gmOnChange(TRADING_SEEN_KEY, applyShare);
    gmOnChange(TRADING_VIEW_KEY, applyShare);
    gmOnChange(ARCHIVE_VIEW_KEY, applyShare);
    window.addEventListener('focus', looked);
    // Torn Trading saying it keeps to less: heard as it is written, also by a tab out of view.
    window.addEventListener('storage', (e) => { if (!e || e.key === BEHIND_MARK || e.key === null) applyShare(); });
    gmOnChange('settings', () => { if (engine) engine.settingsChanged(); schedule(); });
    // Saved or forgotten in another tab of yours.
    gmOnChange(SERVER_CONFIG_KEY, () => { link.grantKept = undefined; schedule(); });
    document.addEventListener('visibilitychange', () => { looked(); if (document.visibilityState === 'visible') schedule(true); });
    window.addEventListener('pagehide', () => {
        flushUsage();
        if (leading && engine) {
            engine.flush();
            // The mark is given up at once, so another tab of yours can take the reading over without waiting.
            const r = gmGet(HUB_LEAD_KEY, null);
            if (r && r.id === tabId) gmSet(HUB_LEAD_KEY, { id: null, ts: 0 });
        }
    });
    return { engine: () => engine, hub, step, desk, actions, leading: () => leading, share: () => share, applyShare, link };
}

// ---- start -----------------------------------------------------------------------------------------------------------

export function boot() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return null;
    // One copy a page: a second install, or the script run twice, would draw everything twice.
    if (window.__tarcBooted) return null;
    window.__tarcBooted = true;
    const href = window.location.href;
    const tabId = makeTabId();
    gmMenu('Open Torn Archive', () => gmOpenTab(ARCHIVE_PAGE_URL));
    if (isArchivePageUrl(href)) {
        const app = bootHub(tabId);
        window.__tarc = app;
        return app;
    }
    if (href.startsWith(TRADING_PAGE_URL)) {
        watchTrading(true);
        return null;
    }
    if (/(^|\.)torn\.com$/i.test(window.location.hostname) || /[?&]tarc=torn(?:[&#]|$)/.test(href)) {
        perfStart({ where: () => 'a Torn page' });
        window.addEventListener('pagehide', flushUsage);
        return mountTornPage(document, { tabId, version: VERSION });
    }
    return null;
}
