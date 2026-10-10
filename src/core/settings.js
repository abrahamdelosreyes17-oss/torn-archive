// Torn Archive's settings: what is stored, made safe. Pure.

const stNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const stWhole = (v) => Math.max(0, Math.floor(stNum(v)));
const stOne = (v, choices, fallback) => (choices.includes(v) ? v : fallback);

/** How often the pieces' prices are read, in minutes. */
export const READ_CHOICES = [1, 2, 5, 10];
export const NOTIFY_CHOICES = ['browser', 'app', 'off'];

/** A new install buys nothing and says nothing: the shop starts closed. */
export const ARCHIVE_DEFAULTS = Object.freeze({
    which: Object.freeze({ plushie: true, flower: true }),
    open: false,
    pct: 101,
    least: 2,
    targetMode: 'cash',
    target: 40,
    shareMax: 30,
    readMin: 1,
    pointsRule: 'wall',
    cheapRule: 'hold',
    fillMuseum: true,
    fillPoints: true,
    notify: 'browser',
    sound: false,
    beforeEach: 0,
    w3bSync: false,
});

/** Stored settings made safe: unknown keys dropped, numbers inside their range. */
export function archiveSettings(stored) {
    const s = stored && typeof stored === 'object' ? stored : {};
    const d = ARCHIVE_DEFAULTS;
    const which = s.which && typeof s.which === 'object' ? s.which : {};
    const pct = stNum(s.pct);
    const least = Number(s.least);
    const share = Number(s.shareMax);
    const out = {
        which: { plushie: which.plushie !== false, flower: which.flower !== false },
        open: s.open === true,
        pct: pct >= 50 && pct <= 200 ? Math.round(pct * 10) / 10 : d.pct,
        least: Number.isFinite(least) && least >= 0 && least <= 50 ? Math.round(least * 10) / 10 : d.least,
        targetMode: s.targetMode === 'number' ? 'number' : 'cash',
        target: stWhole(s.target) >= 1 ? Math.min(100000, stWhole(s.target)) : d.target,
        // 0 = no limit on the share of your money in sets and points.
        shareMax: Number.isFinite(share) && share >= 0 && share <= 100 ? Math.round(share) : d.shareMax,
        readMin: stOne(Number(s.readMin), READ_CHOICES, d.readMin),
        pointsRule: s.pointsRule === 'lowest' ? 'lowest' : 'wall',
        cheapRule: s.cheapRule === 'tell' ? 'tell' : 'hold',
        fillMuseum: s.fillMuseum !== false,
        fillPoints: s.fillPoints !== false,
        notify: stOne(s.notify, NOTIFY_CHOICES, d.notify),
        sound: s.sound === true,
        // What a point you held before Torn Archive stands at, if you typed it (0 = left alone).
        beforeEach: stNum(s.beforeEach) > 0 ? stWhole(s.beforeEach) : 0,
        // Keep your TornW3B price list at your rate by itself (needs the key you registered there).
        w3bSync: s.w3bSync === true,
    };
    // Both sets off is no shop at all: the last one stays on.
    if (!out.which.plushie && !out.which.flower) out.which = { ...d.which };
    return out;
}

/** The settings as sets.js reads them (its `on` switch is Torn Bids'; here Sets is the whole app). */
export const setsCtx = (settings) => ({ on: true, which: settings.which });
