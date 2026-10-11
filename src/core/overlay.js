// Where Torn Archive's overlay may stand on one of Torn's pages: only in the empty window beside Torn's content,
// on its right or on its left, never over it. Numbers in, numbers out: ui/torn-page.js measures and applies them.
//
// The width, the least width and the gap are Torn Trading's own (its panel), so the two are one column when they
// meet. Torn Trading keeps its place then: the Archive goes over it or under it, never beside it, never on top.

export const OV_WIDTH = 430;
/** With less free window than this on a side, the overlay does not stand there. */
export const OV_MIN_WIDTH = 200;
/** Kept clear of Torn's content, and of Torn Trading's panel. */
export const OV_GAP = 8;
/** Kept clear of the window's edge. */
export const OV_EDGE = 16;
/** The bar: the overlay folded. */
export const OV_BAR = 40;
/** Where it stands until you move it: on the right, under Torn's own header. */
export const OV_TOP = 84;
/** With less height than this it is its bar only: a body that short says nothing. */
export const OV_BODY_MIN = 110;

const ovClamp = (n, lo, hi) => Math.min(Math.max(n, lo), Math.max(lo, hi));

/**
 * The two strips of empty window beside Torn's content.
 * @param winW  the window's width
 * @param left  where Torn's content begins, null when the page has none we know
 * @param right where it ends
 * @returns { left, right } each { from, to, width } or null when the overlay does not fit there
 */
export function overlayStrips({ winW, left = null, right = null }) {
    const strip = (from, to) => {
        const free = Math.floor(to - from);
        return free >= OV_MIN_WIDTH ? { from: Math.ceil(from), to: Math.floor(to), width: Math.min(OV_WIDTH, free) } : null;
    };
    if (left == null || right == null) return { left: null, right: strip(OV_EDGE, winW - OV_EDGE) };
    return { left: strip(OV_EDGE, left - OV_GAP), right: strip(right + OV_GAP, winW - OV_EDGE) };
}

/** The side a spot belongs to while you drag: the half of the window it is in, when the overlay fits there. */
export function overlaySide(centre, strips, middle) {
    const want = centre < middle ? 'left' : 'right';
    if (strips[want]) return want;
    return strips.right ? 'right' : strips.left ? 'left' : null;
}

/**
 * Where the overlay stands.
 * @param pos    { side, left, top } where you left it, or null
 * @param strips overlayStrips()
 * @param winH   the window's height
 * @param want   the height it would take with nothing in its way (its bar when folded)
 * @param cap    the most height it ever takes
 * @param other  Torn Trading's panel on this page { left, top, right, bottom, width }, or null
 * @returns null when no side has the room, else { side, left, top, width, maxHeight, bar, by }
 *          bar: there is room for the bar only. by: 'over' | 'under' Torn Trading's panel, '' when alone.
 */
export function overlayPlace({ pos = null, strips, winH, want = OV_BAR, cap = Infinity, other = null }) {
    const side = pos && strips[pos.side] ? pos.side : strips.right ? 'right' : strips.left ? 'left' : null;
    if (!side) return null;
    const strip = strips[side];
    const tall = ovClamp(want, OV_BAR, cap);
    let width = strip.width;
    // Until you move it, it rests against the window's edge.
    const rest = side === 'right' ? strip.to - width : strip.from;
    let left = ovClamp(pos && pos.side === side && Number.isFinite(pos.left) ? pos.left : rest, strip.from, strip.to - width);
    let top = ovClamp(pos && Number.isFinite(pos.top) ? pos.top : OV_TOP, 0, winH - OV_BAR - OV_GAP);
    let by = '';
    let room;
    if (other && other.right > strip.from && other.left < strip.to) {
        // The same side as Torn Trading's panel: its column, its width, and only the height it leaves.
        left = other.left;
        width = other.width;
        const over = other.top - OV_GAP;
        const under = winH - other.bottom - 2 * OV_GAP;
        if (top >= other.bottom + OV_GAP && under >= OV_BAR) {
            by = 'under';
            room = winH - top - OV_GAP;
        } else if (over >= OV_BAR || under < OV_BAR) {
            by = 'over';
            // It keeps under Torn's header while that leaves room for a body (the body scrolls); only when the
            // panel leaves less than that does it go up to the window's top.
            const floor = Math.min(top, OV_TOP);
            top = over - floor >= OV_BODY_MIN ? Math.max(floor, Math.min(top, over - tall)) : Math.max(0, Math.min(top, over - Math.min(tall, over)));
            room = Math.max(OV_BAR, over - top);
        } else {
            by = 'under';
            top = other.bottom + OV_GAP;
            room = winH - top - OV_GAP;
        }
    } else {
        // Unfolded near the window's foot it grows upward: the bar goes back to its place when folded.
        top = Math.max(0, Math.min(top, winH - OV_GAP - tall));
        room = winH - top - OV_GAP;
    }
    const maxHeight = Math.floor(Math.min(room, cap));
    return { side, left: Math.round(left), top: Math.round(top), width: Math.round(width), maxHeight, bar: maxHeight < OV_BODY_MIN, by };
}
