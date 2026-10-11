/*
 * The marks Torn Archive puts on Torn's own pages: their CSS, and nothing of
 * the panel or the page.
 *
 * Taken for Torn Archive from Torn Bids 3.24.0 (ui/styles.js, PAGE_CSS), cut
 * to what sources/dom/float.js, the marks on a listing (the deal outline and
 * its label, a trader's tag, the listing a link was opened for) and the Sets
 * marks of sources/dom/sets-pages.js need. Class and attribute names begin
 * tarc- (they were ttv2- there). No token variable is used: every colour is
 * written out, as it was; --tarc-fr is set by float.js and has its fallback.
 *
 * Left behind in PAGE_CSS (Torn Bids' own): the buying-run strip on a card
 * (buybar; its ring came over as tarc-buyhere in 1.2.0), the trade page's send rows and their Fill, the bazaar owner's
 * status, the asking-price chips (bztag, bzchips, bzsell), the price boxes'
 * tones, the Fill button of your bazaar and the Item Market (fillbox, fillbtn,
 * fillmark, filltag, fillset) and the chat mark.
 *
 * The attributes the labels are read from (set by whoever marks the card):
 *   data-tarc-profit       on .tarc-hit: the label's text
 *   data-tarc-trader       on .tarc-trader: the tag's text
 *   data-tarc-trader-old   on .tarc-trader: present = an old list, "aging" = it glows
 */
export const MARKS_CSS = `
/*
 * Every mark on Torn's own pages takes no room (3.20, the owner: "it
 * shouldn't resize a row, add columns etc. it should just sit at the side or
 * on top like a bring to front"). Outlines are inset box-shadows, labels are
 * pseudo-elements or absolutely placed, and nothing sets a Torn element's
 * size, padding, margin or wrapping. Colours: green money, blue buying and
 * your trade, amber check this, red the listing you opened (Graphite,
 * mockups/T-graphite-everything.html).
 */
.tarc-hit {
    position: relative !important;

    box-shadow:
        inset 0 0 0 2px #6fdc7f,
        inset 0 0 0 9999px rgba(111, 220, 127, 0.12) !important;

    transition: box-shadow 0.15s ease;
}

/*
 * The profit label, drawn as a pseudo-element from a data attribute.
 *
 * pointer-events: none is the important line: it means this can never
 * intercept a click, so it cannot block Torn's Buy button no matter where it
 * lands. That was the original complaint about V1, and it is fixed by making
 * the label unclickable rather than by removing it.
 */
.tarc-hit.tarc-hit::after {
    /*
     * Every declaration here is load-bearing, and all of it was worked out
     * against a live Torn page rather than guessed.
     *
     * - The doubled class and !important on 'content': Torn defines ::after
     *   on its own item tiles at equal specificity and wins on document
     *   order, so the plain rule computed to content: "" and the label
     *   silently never appeared.
     * - The width/height/inset resets: overriding 'content' alone leaves
     *   Torn's geometry in place, which clipped the label to an 8px sliver.
     * - The chip background: white text alone was invisible against the
     *   tile's artwork.
     * - On the card's top edge, half in the gap above it, one line (3.20.4,
     *   the owner: inside the card it covered the item's name and price).
     */
    content: attr(data-tarc-profit) !important;

    display: block !important;
    position: absolute !important;
    top: -13px !important;
    right: 4px !important;
    left: auto !important;
    bottom: auto !important;

    width: auto !important;
    height: auto !important;
    min-width: 0 !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 1px 7px !important;
    transform: none !important;

    overflow: visible !important;
    white-space: nowrap !important;
    opacity: 1 !important;
    visibility: visible !important;
    z-index: 2147483000 !important;

    background: rgba(15, 36, 20, 0.94) !important;
    border: 1px solid rgba(111, 220, 127, 0.55) !important;
    border-radius: 9px !important;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5) !important;

    color: #6fdc7f !important;
    font: 700 11px/15px "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif !important;
    text-align: right !important;

    /* Cannot intercept a click, so it can never block Torn's Buy button. */
    pointer-events: none !important;
}


/*
 * A trusted trader pays more than this listing asks: "FAFFO pays $73,500 /
 * +$3,500 each", drawn the same way as the profit label and just as unable
 * to catch a click. In blue (a trader, not an NPC deal); one line on the
 * card's top edge (3.20.4). On a card that is also a deal, profit and
 * trader share that one line.
 */
.tarc-trader {
    position: relative !important;
}

.tarc-trader.tarc-trader::after {
    content: attr(data-tarc-trader) !important;

    display: block !important;
    position: absolute !important;
    top: -13px !important;
    right: 4px !important;
    left: auto !important;
    bottom: auto !important;

    width: auto !important;
    height: auto !important;
    min-width: 0 !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 2px 7px !important;
    transform: none !important;

    overflow: visible !important;
    white-space: nowrap !important;
    text-align: right !important;
    opacity: 1 !important;
    visibility: visible !important;
    z-index: 2147483000 !important;

    background: rgba(15, 26, 42, 0.94) !important;
    border: 1px solid rgba(90, 167, 255, 0.5) !important;
    border-radius: 9px !important;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5) !important;

    color: #8cc0ff !important;
    font: 700 11px/15px "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif !important;

    pointer-events: none !important;
}

.tarc-hit.tarc-trader.tarc-trader::after {
    content: attr(data-tarc-profit) "  ·  " attr(data-tarc-trader) !important;
    white-space: nowrap !important;
    text-align: right !important;
    background: rgba(15, 36, 20, 0.94) !important;
    border-color: rgba(111, 220, 127, 0.55) !important;
    color: #6fdc7f !important;
}

/*
 * That trader's price is from a TornW3B list not changed in over 24 hours
 * (3.23.0): an amber dot inside the tag, at its start - drawn as the tag's
 * own background, so nothing is added to Torn's card and the tag stays one
 * line. Until two days the tag also glows amber, slowly (a filter: nothing
 * of the page is laid out again); past two days the dot alone.
 */
.tarc-trader.tarc-trader.tarc-trader[data-tarc-trader-old]::after {
    padding-left: 20px !important;
    background-image: radial-gradient(circle closest-side, #f6b74a 0, #f6b74a 86%, rgba(246, 183, 74, 0) 100%) !important;
    background-repeat: no-repeat !important;
    background-size: 7px 7px !important;
    background-position: 7px 50% !important;
}

.tarc-trader.tarc-trader.tarc-trader[data-tarc-trader-old="aging"]::after {
    animation: tarc-oldlist 1.6s ease-in-out infinite;
}

@keyframes tarc-oldlist {
    0%, 100% { filter: drop-shadow(0 0 0 rgba(246, 183, 74, 0)); }
    50% { filter: drop-shadow(0 0 4px rgba(246, 183, 74, 0.95)); }
}

/*
 * Fill on the trade page: floats beside the item's name (3.20). Taken out of
 * the line, so Torn's name cell keeps its size and its wrapping; placed by
 * main.js placeFloat where the cell lays its items out as a row.
 */
.tarc-float {
    position: absolute !important;
    z-index: 3;
    box-sizing: border-box;
    white-space: nowrap !important;
}

/*
 * Sets (3.24.0, mockups Z6-Z10): a mark on a museum piece, a bazaar card, an item in a trade or your forum
 * thread's title. Absolutely placed in Torn's element, so it takes no room; it catches no click.
 */
.tarc-setmark {
    top: -9px;
    left: 4px;
    height: 18px;
    padding: 0 7px;
    border: 1px solid rgba(90, 167, 255, 0.55);
    border-radius: 9px;
    background: #10233b;
    color: #cfe5ff;
    font: 600 11px/16px "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0;
    text-transform: none;
    pointer-events: none;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
}
.tarc-setmark[data-where="right"] { top: 50%; left: auto; right: 8px; transform: translateY(-50%); }
.tarc-setmark[data-where="under"] { top: calc(100% - 4px); left: 4px; }
.tarc-setmark[data-where="tile"] { top: auto; bottom: 2px; left: 2px; }
/* Beside one of Torn's controls (the points market's ADD LISTING): its left and top are set by measure. */
.tarc-setmark[data-where="note"] { height: 22px; padding: 0 10px; border-radius: 11px; font-size: 12px; line-height: 20px; transform: translateY(-50%); }
.tarc-setmark[data-state="top"] { border-color: #5aa7ff; background: #173a63; color: #fff; box-shadow: 0 0 0 1px #5aa7ff, 0 0 10px rgba(90, 167, 255, 0.5); }
.tarc-setmark[data-state="ok"] { border-color: rgba(160, 168, 184, 0.45); background: #1c2029; color: #c3c9d4; }
.tarc-setmark[data-state="ahead"] { border-color: rgba(246, 183, 74, 0.6); background: #33260c; color: #ffd98a; }
/* More typed than you need: red (the owner, 2026-10-11: "a warning that turns red if im buying more than i need"). */
.tarc-setmark[data-state="over"] { border-color: rgba(255, 120, 120, 0.7); background: #3a1414; color: #ffc9c9; }
.tarc-setmark[data-state="bad"] { border-color: rgba(255, 120, 120, 0.6); background: #3a1414; color: #ffc9c9; }
.tarc-setmark[data-state="good"] { border-color: rgba(111, 220, 127, 0.55); background: #12301a; color: #b9f3c2; }

/*
 * A listing to buy for your sets, ringed as Torn Trading rings the listing to buy for a trade (the same blue,
 * the same glow). Paint only: nothing of Torn's card is sized or moved.
 *   data-tarc-ring="top"   on your list: the full ring and its glow
 *   data-tarc-ring="need"  a piece you need, under its worth, not on the list: thinner, no glow
 *   data-tarc-ring="over"  you are typing more than you need: amber
 */
.tarc-buyhere {
    position: relative !important;
    box-shadow:
        inset 0 0 0 2px #5aa7ff,
        inset 0 0 0 9999px rgba(90, 167, 255, 0.12),
        0 0 14px rgba(90, 167, 255, 0.35) !important;
    transition: box-shadow 0.15s ease;
}
.tarc-buyhere[data-tarc-ring="need"] {
    box-shadow:
        inset 0 0 0 1px #5aa7ff,
        inset 0 0 0 9999px rgba(90, 167, 255, 0.06) !important;
}
.tarc-buyhere[data-tarc-ring="over"] {
    box-shadow:
        inset 0 0 0 2px #ff7878,
        inset 0 0 0 9999px rgba(255, 120, 120, 0.12) !important;
}

/*
 * The listing a link of ours named (the hub's "Sold by", a stop of your run): it pulses until you press anything.
 * An outline, so it takes no room and leaves the ring's own paint alone.
 */
[data-tarc-pulse] { outline: 2px solid rgba(90, 167, 255, 0.95); outline-offset: 1px; animation: tarc-pulse 1.1s ease-in-out infinite; }
@keyframes tarc-pulse { 0%, 100% { outline-color: rgba(90, 167, 255, 0.95); outline-offset: 1px; } 50% { outline-color: rgba(90, 167, 255, 0.25); outline-offset: 5px; } }
@media (prefers-reduced-motion: reduce) { [data-tarc-pulse] { animation: none; } }

/*
 * The points market (mockup Z7): a hairline in Torn's list, on the edge between two rows - where your listing
 * would sit (blue), above which a price is under the usual (amber) or a loss (red). Two pixels on the rows' own
 * border and no words: it stands on nothing of Torn's (the owner: a thicker line "blocks the torn page").
 * Everything a row of Torn's could hand down to it is set here, so it is two pixels on any page.
 */
.tarc-setrule {
    display: block !important;
    top: -1px !important;
    left: 0 !important;
    right: 0 !important;
    bottom: auto !important;
    width: auto !important;
    min-width: 0 !important;
    height: 2px !important;
    min-height: 0 !important;
    max-height: 2px !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    float: none !important;
    font-size: 0 !important;
    line-height: 0 !important;
    background: #5aa7ff !important;
    box-shadow: none !important;
    pointer-events: none !important;
}
.tarc-setrule[data-state="ahead"] { background: #f6b74a !important; }
.tarc-setrule[data-state="bad"] { background: #ff7878 !important; }

/* Fill beside Torn's own box on the museum and the points market: it types, you press Torn's button. */
.tarc-setfill {
    top: 50%;
    left: calc(100% + 8px);
    transform: translateY(-50%);
    height: 24px;
    padding: 0 10px;
    border: 1px solid rgba(90, 167, 255, 0.55);
    border-radius: 7px;
    background: #10233b;
    color: #cfe5ff;
    font: 600 11px/22px "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
}
.tarc-setfill:hover { background: #173a63; color: #fff; }
.tarc-setfill[data-done="1"] { border-color: rgba(111, 220, 127, 0.55); background: #12301a; color: #b9f3c2; }

/* Why a price box on your bazaar's add page is red or amber, and a piece kept for sets (no Fill). */
.tarc-tonetag, .tarc-keptnote {
    height: 16px;
    padding: 0 6px;
    border-radius: 8px;
    font: 600 10px/16px "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
    pointer-events: none;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
}
.tarc-tonetag { top: calc(100% - 6px); right: 2px; background: #33260c; color: #ffd98a; border: 1px solid rgba(246, 183, 74, 0.6); }
.tarc-tonetag[data-tone="under"] { background: #3a1414; color: #ffc9c9; border-color: rgba(255, 120, 120, 0.6); }
.tarc-keptnote.tarc-fillcell { margin-left: 0; white-space: nowrap; }
.tarc-keptnote { margin-left: 8px; background: #1c2029; color: #c3c9d4; border: 1px solid rgba(160, 168, 184, 0.45); }

/* The listing a feed link was opened for: light red (3.14.2, the owner; it was yellow). Paint-only, like .tarc-hit. */
.tarc-target {
    box-shadow:
        inset 0 0 0 2px #ff7b6e,
        inset 0 0 0 9999px rgba(255, 123, 110, 0.12) !important;
}

.tarc-hit-top {
    box-shadow:
        inset 0 0 0 2px #a6f5b0,
        inset 0 0 0 9999px rgba(111, 220, 127, 0.2),
        0 0 12px rgba(111, 220, 127, 0.35) !important;
}

.tarc-hit-top.tarc-hit-top::after {
    background: #6fdc7f !important;
    border-color: transparent !important;
    color: #0d1a10 !important;
}

/*
 * Profitable, but below your Min: amber, thinner and fainter than green, so
 * the deals that meet your Min still stand out first. (Light red marks the
 * listing a panel link was opened for.)
 */
.tarc-hit.tarc-hit-low {
    box-shadow:
        inset 0 0 0 1px #f6b74a,
        inset 0 0 0 9999px rgba(246, 183, 74, 0.08) !important;
}

.tarc-hit.tarc-hit-low.tarc-hit-low::after {
    background: rgba(42, 33, 16, 0.94) !important;
    border-color: rgba(246, 183, 74, 0.5) !important;
    color: #f6b74a !important;
    font-weight: 700 !important;
}

/*
 * Your own bazaar's manage rows and the Item Market's: the asking prices
 * and Fill, together in one group that floats in the row (3.20): at its
 * right, just left of Torn's boxes, centred on the row - over the row, never
 * a line or a column of its own. Text only; nothing is clicked on Torn's.
 */
.tarc-rowfloat {
    position: absolute !important;
    top: 50%;
    right: var(--tarc-fr, 8px);
    z-index: 3;
    display: inline-flex !important;
    align-items: center;
    gap: 6px;
    margin: 0 !important;
    transform: translateY(-50%);
    white-space: nowrap;
}

/* Fill's result, beside Torn's page for a few seconds (3.20): in place of the line it used to add to the row. */
.tarc-toast {
    position: fixed;
    z-index: 2147483001;
    max-width: 400px;
    padding: 8px 12px;
    border: 1px solid rgba(111, 220, 127, 0.42);
    border-radius: 10px;
    background: #1c1e23;
    color: #cdd2db;
    font: 12px/1.5 "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35), 0 12px 32px rgba(0, 0, 0, 0.35);
    pointer-events: none;
    animation: tarc-toast-in 0.2s cubic-bezier(0.2, 0.7, 0.2, 1);
}

.tarc-toast[data-level="warn"] { border-color: rgba(246, 183, 74, 0.42); color: #f6b74a; }
.tarc-toast[data-level="bad"] { border-color: rgba(255, 123, 110, 0.42); color: #ff7b6e; }

@keyframes tarc-toast-in {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: none; }
}

@media (prefers-reduced-motion: reduce) {
    .tarc-toast { animation: none !important; }
    .tarc-trader.tarc-trader.tarc-trader[data-tarc-trader-old]::after { animation: none !important; }
    .tarc-hit, .tarc-buyhere { transition: none !important; }
}
`;
