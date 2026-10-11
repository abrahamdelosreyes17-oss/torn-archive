// Where the overlay stands on a Torn page: beside Torn's content on either side, never over it, and around Torn
// Trading's panel when both are on a page.

import test from 'node:test';
import assert from 'node:assert/strict';
import { overlayStrips, overlaySide, overlayPlace, OV_WIDTH, OV_MIN_WIDTH, OV_GAP, OV_EDGE, OV_BAR, OV_TOP } from '../src/core/overlay.js';

// A 1920 window with Torn's 976 of content in the middle: 472 free on each side.
const WIDE = { winW: 1920, left: 472, right: 1448 };
const H = 1000;
const over = (a, b) => a.left < b.right && a.left + a.width > b.left;

test('the strips: the free window on each side of Torn\'s content, the overlay at its usual width where it fits', () => {
    const s = overlayStrips(WIDE);
    assert.deepEqual(s.right, { from: 1448 + OV_GAP, to: 1920 - OV_EDGE, width: OV_WIDTH });
    assert.deepEqual(s.left, { from: OV_EDGE, to: 472 - OV_GAP, width: OV_WIDTH });
    // Less room: as wide as the room. Under the least width: not there at all.
    const snug = overlayStrips({ winW: 1500, left: 262, right: 1238 });
    assert.equal(snug.right.width, 1500 - 1238 - OV_GAP - OV_EDGE);
    assert.equal(snug.left.width, 262 - OV_GAP - OV_EDGE);
    const none = overlayStrips({ winW: 1300, left: 162, right: 1138 });
    assert.equal(none.right, null);
    assert.equal(none.left, null);
    assert.ok(1300 - 1138 - OV_GAP - OV_EDGE < OV_MIN_WIDTH);
    // Content hard against the left edge: only the right side.
    const lean = overlayStrips({ winW: 1600, left: 0, right: 976 });
    assert.equal(lean.left, null);
    assert.equal(lean.right.width, OV_WIDTH);
    // A page with no content of Torn's that we know: the window's right.
    assert.deepEqual(overlayStrips({ winW: 800 }), { left: null, right: { from: OV_EDGE, to: 800 - OV_EDGE, width: OV_WIDTH } });
});

test('until it is moved: on the right, against the window\'s edge, under Torn\'s header', () => {
    const p = overlayPlace({ strips: overlayStrips(WIDE), winH: H });
    assert.equal(p.side, 'right');
    assert.equal(p.left + p.width, 1920 - OV_EDGE);
    assert.equal(p.top, OV_TOP);
    assert.equal(p.by, '');
    assert.equal(overlayPlace({ strips: { left: null, right: null }, winH: H }), null, 'no room on either side is said, not hidden');
});

test('left or right, wherever it was left: never over Torn\'s content, never off the window', () => {
    const strips = overlayStrips(WIDE);
    const content = { left: WIDE.left, right: WIDE.right };
    for (const side of ['left', 'right']) {
        for (const left of [-500, 0, 300, 700, 1100, 1500, 3000]) {
            for (const top of [-50, 0, 400, 990, 5000]) {
                const p = overlayPlace({ pos: { side, left, top }, strips, winH: H, want: 300 });
                assert.equal(p.side, side);
                assert.ok(!over(p, content), `over Torn's content at ${side} ${left}`);
                assert.ok(p.left >= OV_EDGE && p.left + p.width <= 1920 - OV_EDGE);
                assert.ok(p.top >= 0 && p.top + OV_BAR <= H);
            }
        }
    }
    // Inside its strip it stays where it was put.
    assert.equal(overlayPlace({ pos: { side: 'left', left: 20, top: 500 }, strips, winH: H }).left, 20);
    assert.equal(overlayPlace({ pos: { side: 'left', left: 20, top: 500 }, strips, winH: H }).top, 500);
});

test('a side that has no room any more: it goes to the side that has', () => {
    const lean = overlayStrips({ winW: 1600, left: 0, right: 976 });
    const p = overlayPlace({ pos: { side: 'left', left: 20, top: 300 }, strips: lean, winH: H });
    assert.equal(p.side, 'right');
    assert.equal(p.left + p.width, 1600 - OV_EDGE, 'against the edge there: the left it had means nothing on this side');
    assert.equal(p.top, 300);
});

test('dragging: the half of the window the overlay is in', () => {
    const strips = overlayStrips(WIDE);
    assert.equal(overlaySide(300, strips, 960), 'left');
    assert.equal(overlaySide(1700, strips, 960), 'right');
    assert.equal(overlaySide(300, overlayStrips({ winW: 1600, left: 0, right: 976 }), 488), 'right');
    assert.equal(overlaySide(300, { left: null, right: null }, 488), null);
});

test('folded near the foot of the window it stays there; unfolded it grows upward and never past the window', () => {
    const strips = overlayStrips(WIDE);
    const pos = { side: 'right', left: 1474, top: 940 };
    const bar = overlayPlace({ pos, strips, winH: H, want: OV_BAR });
    assert.equal(bar.top, 940);
    const open = overlayPlace({ pos, strips, winH: H, want: 420, cap: 640 });
    assert.equal(open.top, H - OV_GAP - 420);
    assert.equal(open.maxHeight, 420);
    assert.equal(open.bar, false, 'a bar at the foot unfolds: it is never a bar for want of room there');
    // The bar at the very foot, unfolded with its whole height: the same.
    const foot = overlayPlace({ pos: { side: 'right', left: 1474, top: H - OV_BAR - OV_GAP }, strips, winH: H, want: 600, cap: 640 });
    assert.equal(foot.bar, false);
    assert.equal(foot.top + foot.maxHeight, H - OV_GAP);
    // More to say than the most it takes: that most, and its body scrolls.
    const long = overlayPlace({ pos: { side: 'right', left: 1474, top: 84 }, strips, winH: H, want: 2000, cap: 640 });
    assert.equal(long.top, 84);
    assert.equal(long.maxHeight, 640);
});

test('Torn Trading\'s panel on the same side: its column and width, over it, with only the height it leaves', () => {
    const strips = overlayStrips(WIDE);
    // Torn Trading's panel at rest: bottom right, 430 by 640.
    const other = { left: 1474, right: 1904, top: 344, bottom: 984, width: 430 };
    const meets = (p, o) => p.left < o.right && p.left + p.width > o.left && p.top < o.bottom && p.top + p.maxHeight > o.top;
    const p = overlayPlace({ strips, winH: H, want: 500, cap: 640, other });
    assert.equal(p.by, 'over');
    assert.equal(p.left, other.left);
    assert.equal(p.width, other.width);
    assert.equal(p.top + p.maxHeight, other.top - OV_GAP, 'directly over it');
    assert.ok(!meets(p, other));
    assert.equal(p.bar, false);
    // Left on top of where the panel is: moved over it, not left there.
    const on = overlayPlace({ pos: { side: 'right', left: 1500, top: 600 }, strips, winH: H, want: 200, cap: 640, other });
    assert.equal(on.by, 'over');
    assert.equal(on.left, other.left, 'never beside it in its column');
    assert.equal(on.top, other.top - OV_GAP - 200);
    assert.ok(!meets(on, other));
    // More to say than the room over the panel: it keeps under Torn's header and its body scrolls, never up to
    // the window's top while the header's room leaves a body.
    const tallPanel = { ...other, top: 444, bottom: 1084 };
    const kept = overlayPlace({ strips, winH: 1100, want: 592, cap: 640, other: tallPanel });
    assert.equal(kept.top, OV_TOP);
    assert.equal(kept.top + kept.maxHeight, tallPanel.top - OV_GAP);
    assert.equal(kept.bar, false);
    assert.ok(!meets(kept, tallPanel));
    // Too little over it for a body under the header: up to the top, and only then.
    const low = { ...other, top: 170, bottom: 810 };
    const up = overlayPlace({ strips, winH: H, want: 592, cap: 640, other: low });
    assert.equal(up.top, 0);
    assert.equal(up.top + up.maxHeight, low.top - OV_GAP);
    assert.equal(up.bar, false);
    // The panel fills the column: the Archive is a bar over it.
    const full = { ...other, top: 60, bottom: 984 };
    const bar = overlayPlace({ strips, winH: H, want: 500, cap: 640, other: full });
    assert.equal(bar.bar, true);
    assert.equal(bar.top + bar.maxHeight, full.top - OV_GAP);
    assert.ok(bar.maxHeight >= OV_BAR);
    assert.ok(!meets(bar, full));
    // The panel dragged to the top: the Archive under it.
    const high = { ...other, top: 0, bottom: 640 };
    const under = overlayPlace({ strips, winH: H, want: 300, cap: 640, other: high });
    assert.equal(under.by, 'under');
    assert.equal(under.top, high.bottom + OV_GAP);
    assert.ok(!meets(under, high));
    assert.ok(under.top + under.maxHeight <= H);
});

test('Torn Trading\'s panel on the other side changes nothing', () => {
    const strips = overlayStrips(WIDE);
    const other = { left: 1474, right: 1904, top: 344, bottom: 984, width: 430 };
    const pos = { side: 'left', left: 20, top: 500 };
    assert.deepEqual(overlayPlace({ pos, strips, winH: H, want: 300, other }), overlayPlace({ pos, strips, winH: H, want: 300 }));
});
