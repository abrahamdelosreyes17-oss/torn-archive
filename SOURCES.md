# Where each file came from

The plumbing of Torn Archive was copied from Torn Bids (the torn-trading
repository) at commit **e0fac2e** (3.24.0, the last commit that held the Sets
code), then cut down. "SRC" below is that commit's tree; a path under "From" is
the same file there.

- **TAKE** - the whole file, with only the changes listed under
  "Changed while copying".
- **CUT** - only the named exports (and the private helpers they need) were
  kept; everything else in the file was removed. Nothing was rewritten inside a
  kept function unless "Changed while copying" says so.
- **NEW** - written for Torn Archive; what it was adapted from is named.
- **LEAD** - written by the lead in the same session, not from this copy; listed
  so the table covers the tree, not described here.

Applied to every copied file and test: `ttv2-` -> `tarc-` (classes, ids, the
`--ttv2-fr` variable), `ttv2Pos` -> `tarcPos` (a dataset name), and the request
comment `TornTradingV2` -> `TornArchive`.

## Root

| Path | From | Kind | Notes |
|---|---|---|---|
| `package.json` | SRC `package.json`, e0fac2e | NEW | name `torn-archive`, 1.0.0, private, type module; scripts `build`, `test`, `check` on `dist/torn-archive.user.js`. SRC's `bench` script is not here. |
| `build.mjs` | SRC `build.mjs`, e0fac2e | TAKE | Every check kept (duplicate top-level name, import cycle, missing import, no default import, no `import as`, bundle ends with `boot();`, the bundle must parse). New header, new output names: see "Changed while copying". |
| `.gitignore` | SRC `.gitignore`, e0fac2e | CUT | `node_modules/` and `dist/` only. SRC also ignored `docs/` and `reference/`; not copied, because `reference/torn-pages.md` is kept in this project. |
| `SOURCES.md` | - | NEW | This file. |
| `torn-archive.user.js` | - | built | Written by `build.mjs` beside `dist/` (as SRC wrote `torn-moneymaker.user.js`): the released copy. Today it holds the placeholder. |

## src/platform

| Path | From | Kind | Notes |
|---|---|---|---|
| `src/platform/gm.js` | SRC `src/platform/gm.js`, e0fac2e | TAKE | Storage prefix `tornArchive.v1.`; `gmFetch`'s answer gained `header(name)`; new export `gmHeader`. |
| `src/platform/idb.js` | SRC `src/platform/idb.js`, e0fac2e | TAKE | Database name `tornArchive`. |
| `src/platform/perf.js` | SRC `src/platform/perf.js`, e0fac2e | TAKE | Comment wording only. |
| `src/platform/tab-window.js` | SRC `src/platform/tab-window.js`, e0fac2e | TAKE | Unchanged. |

## src/api

| Path | From | Kind | Notes |
|---|---|---|---|
| `src/api/client.js` | SRC `src/api/client.js`, e0fac2e | TAKE | 85 a minute by default, `isPaused`, `PausedError`, `NoKeyError`: see "Changed while copying". |
| `src/api/torn.js` | SRC `src/api/torn.js`, e0fac2e | CUT | Kept: `ACCESS_PUBLIC`, `ACCESS_LIMITED`, `TORN_ERROR_ACCESS_LEVEL`, `ACCESS_LEVEL_NAMES`, `keyTooLowForInventory`, `fetchItems`, `npcSaleFromValue`, `shopBuyPriceFromValue`, `fetchItemsV2`, `fetchKeyAccess`, `ITEM_MARKET_MIN_RECHECK_MS`, `fetchItemMarket`, `TORN_ERROR_WRONG_FIELDS`, `TORN_ERROR_INCORRECT_CATEGORY`, `TORN_INVENTORY_CATEGORIES`, `isCategoryError`, `fetchInventory`, `fetchPointsMarket`, `parseUserMoney`, `fetchMoney`, `fetchLogTypes`. Removed: `fetchShops`, `parseUserPresence`, `fetchUserPresence`, `fetchNetworth`, `parseNetworth`. |
| `src/api/w3b.js` | SRC `src/api/w3b.js`, e0fac2e | CUT | Kept: the `W3B_*` addresses and limits, `W3bError`, `W3bClient`, `fetchW3bSummary`, `fetchW3bListings`, `fetchW3bItemTraders`, `w3bPriceListUrl`, `fetchW3bPriceList`. Removed: `overlayPerMinute`, `W3B_BESIDE_BIDS_PER_MINUTE`, `W3B_BIDS_IN_USE_MS`. New: the item-listing window, the day counter, Retry-After, `isPaused`, local refusals (see "Changed while copying"). The client has no key and takes none. |
| `src/api/ledger.js` | SRC `src/api/ledger.js`, e0fac2e | TAKE | A comment now says 85 a minute; nothing else. |

## src/core

| Path | From | Kind | Notes |
|---|---|---|---|
| `src/core/sets.js` | SRC `src/core/sets.js`, e0fac2e | TAKE | Comments reworded to Torn Archive. |
| `src/core/points.js` | SRC `src/core/points.js`, e0fac2e | TAKE | Copied whole; **the lead's from then on** (its rules are being changed by him, not by this copy). |
| `src/core/sets-desk.js` | SRC `src/core/sets-desk.js`, e0fac2e | TAKE | Copied whole; **the lead's from then on** (to be replaced). |
| `src/core/parse.js` | SRC `src/core/parse.js`, e0fac2e | TAKE | Unchanged. |
| `src/core/items.js` | SRC `src/core/items.js`, e0fac2e | TAKE | Unchanged (still holds `NEVER_FLIP_ONCE` / `neverFlipOtherOnce`, which Torn Archive has no use for). |
| `src/core/inventory.js` | SRC `src/core/inventory.js`, e0fac2e | TAKE | Unchanged. |
| `src/core/leader.js` | SRC `src/core/leader.js`, e0fac2e | TAKE | Unchanged. |
| `src/core/usage.js` | SRC `src/core/usage.js`, e0fac2e | TAKE | `USAGE_SERVICES.t.perMin` 70 -> 85. The TornExchange service (`e`) and Torn Bids' own tags are still in the lists. |
| `src/core/errlog.js` | SRC `src/core/errlog.js`, e0fac2e | TAKE | Entries fold on message **and** detail; `goneLine` says "in Torn Archive". |
| `src/core/speed.js` | SRC `src/core/speed.js`, e0fac2e | TAKE | The file's title and `kind` name Torn Archive. |
| `src/core/zip.js` | SRC `src/core/zip.js`, e0fac2e | TAKE | Unchanged. |
| `src/core/bazaar-cover.js` | SRC `src/core/bazaar-cover.js`, e0fac2e | TAKE | Unchanged. |
| `src/core/profit.js` | SRC `src/core/profit.js`, e0fac2e | CUT | Kept: `VENUE_FEES`, `MIN_PROFIT_PCT`, `enoughProfit`. |
| `src/core/desk.js` | SRC `src/core/desk.js`, e0fac2e | CUT | Kept: `W3B_HIDDEN_PER_MIN`, `W3B_HIDDEN_LISTS_PER_MIN`, `HIDDEN_RENDER_MS`, `backgroundSlot`, `backgroundListSlot`, `nextW3bRead`. |
| `src/core/feed.js` | SRC `src/core/feed.js`, e0fac2e | CUT | Kept: `normalizeW3bListings`, `normalizeItemMarketRows`, `bazaarUrl` (its link still carries `ttItem` / `ttPrice`). |
| `src/core/flips.js` | SRC `src/core/flips.js`, e0fac2e | CUT | Kept: `FLIP_FRESH_MS`, `FLIP_MAX_UNITS`, `bazaarSellers`, `OWN_KEEP_MS`, `GONE_MAX`, `goneKey`, `liveGone`, `markGone`, `withoutGone`, `SEEN_MARGIN_MS`, `checkedSince`, `STOCK_MAX`, `BOUGHT_MAX`, `liveStock`, `noteStock`, `liveBought`, `addBought`, `withOwnBuys`, `MAIN_STOPS`, `EXTRA_STOPS`, `SWAP_GAIN`, `pickBazaars`. |
| `src/core/start-up.js` | SRC `src/core/start-up.js`, e0fac2e | CUT | Kept: `REDRAW_BUDGET_TIMES`, `REDRAW_WAIT_MAX_MS`, `redrawWait`, `KEPT_READS_MAX_AGE_MS`, `packBazaarReads`, `unpackBazaarReads`. Removed: `warmSlice`, `WARM_SLICE_MS`. |
| `src/core/ledger.js` | SRC `src/core/ledger.js`, e0fac2e | CUT | Kept: `LEDGER_VERSION`, the `LOG_*` type numbers, `LEDGER_LOG_TYPES`, `VENUE_NAMES`, `emptyLedger`, `readLedger`, `rowsFromLog`, `rowsFromTrade`, `mugFromLog`, `addMugs`, `mugTotals`, `addLedgerRows`, `matchFifo`, `logSpan`. |
| `src/core/traders.js` | SRC `src/core/traders.js`, e0fac2e | CUT | Kept: `TRADER_DB_VERSION`, `W3B_LIST_MAX_AGE_MS`, `emptyTraderDb`, `readTraderDb`, `addTraders`, `parseW3bPriceList`, `parseW3bSetPrices`, `bestSetBuyer`, `recordW3bList`, `liveW3bPrices`, `buyersForItem`, `trustOf`, `indexW3bByItem`, `PRICES_STALE_MS`, `stalePrice`, `FRESH_TRADED_HOURS`, `buyersAsk`, `mergeItemBuyers`, `notTradedLately`, `freshOnly`. |
| `src/core/accepted.js` | SRC `src/core/accepted.js`, e0fac2e | CUT | Kept: `TRADE_MAX_UNITS`, `stepDone`, `sendUnits`, `takenUnits`, `stockBuys`, `boughtSince`, `tradeCount`, `countView`. |
| `src/core/tidy.js` | SRC `src/core/tidy.js`, e0fac2e | CUT | Kept: `tidyKeep` (private in SRC, exported here), `tidyGone`, `tidyStock`, `tidyBought`. |
| `src/core/turns.js` | Pumping Iron `src/core/turns.js` (and its caller `src/turns.js`) | NEW | Taking turns with Torn Bids, pure: Torn Bids' two host ids, the 2-minute restart rule, the limits Torn Archive may use alone (Torn 85, TornW3B 80), which tabs see Torn Bids, the "while paused" line. |
| `src/core/margin.js`, `shopping.js`, `books.js`, `lots.js`, `verdict.js`, `tw3b-list.js`, `trades.js`, `stock.js`, `settings.js`, `view.js` | - | LEAD | Not from this copy. |

## src/sources

| Path | From | Kind | Notes |
|---|---|---|---|
| `src/sources/route.js` | SRC `src/sources/route.js`, e0fac2e | CUT | Kept: `PAGE_BAZAAR`, `PAGE_ITEM_MARKET`, `PAGE_NONE`, `detectPage`, `isTradePage`, `itemMarketUrl`, `bazaarOwnerId`, `bazaarTarget`, `ownBazaarPage`, `MUSEUM_URL`, `POINTS_MARKET_URL`, `tradeViewUrl`, `isMuseumPage`, `isPointsMarketPage`, `isForumPage`. Removed: `profileIdOf`, `marketFillPage`, `TRADERS_PAGE_*`, `tradersPageUrl`, `isTradersPageUrl`, `isOldTradersPageUrl`. In their place, for Torn Archive's own page: `ARCHIVE_PAGE_URL`, `ARCHIVE_PAGE_PARAM`, `ARCHIVE_PAGE_VALUE`, `isArchivePageUrl`. |
| `src/sources/dom/bazaar-list.js` | SRC, same path, e0fac2e | TAKE | Unchanged. |
| `src/sources/dom/detect.js` | SRC, same path, e0fac2e | TAKE | Skips `#tarc-host` (was `#ttv2-host`). |
| `src/sources/dom/fill.js` | SRC, same path, e0fac2e | TAKE | Classes `tarc-fillbtn`, `tarc-filltag`. |
| `src/sources/dom/float.js` | SRC, same path, e0fac2e | TAKE | Classes `tarc-float`, `tarc-rowfloat`, `tarc-toast`; variable `--tarc-fr`; dataset `tarcPos`. |
| `src/sources/dom/scan.js` | SRC, same path, e0fac2e | TAKE | Unchanged but for the rename. |
| `src/sources/dom/sets-pages.js` | SRC, same path, e0fac2e | TAKE | Classes `tarc-setmark`, `tarc-setfill`. |
| `src/sources/dom/trade.js` | SRC, same path, e0fac2e | TAKE | Unchanged. |
| `src/sources/dom/owner.js` | SRC, same path, e0fac2e | CUT | Kept: `findOwnerLink`, `readBazaarOpen`. |

## src/ui

| Path | From | Kind | Notes |
|---|---|---|---|
| `src/ui/mask.js` | SRC `src/ui/mask.js`, e0fac2e | TAKE | Unchanged. |
| `src/ui/marks-css.js` | SRC `src/ui/styles.js` (`PAGE_CSS`), e0fac2e | NEW | Exports `MARKS_CSS`: only the rules for marks on Torn's own pages. Taken from `styles.js` lines 87-165 (the ring on a deal and its profit tag), 166-244 (the ring and tag of a trader's listing), 372-443 (float marks, set marks, the set Fill, tone tags, the kept note), 495-531 (the target, the top and low deal), 566-583 (the row float), 887-909 (the toast), and a trimmed reduced-motion block. Left out: buy-here bar 246-366, chat mark 265-276, send rows 368 and 445-493, owner badge 533-564, bazaar tags and chips 585-752, price-box tones 754-782, the Fill button itself 784-885. |
| `src/ui/hub-css.js`, `hub-pages.js`, `charts.js`, `fmt.js` | - | LEAD | Not from this copy. No other ui file of SRC was copied. |

## src/main.js

| Path | From | Kind | Notes |
|---|---|---|---|
| `src/main.js` | - | NEW | A placeholder of ten lines with an empty `boot()`, so the build has an entry. The lead's file replaces it. Nothing of SRC's `src/main.js` (11,347 lines) was copied. |

## SRC files not taken

`src/api/te.js`, `src/feed/controller.js`, every other `src/ui/*` file
(`styles.js` but for the rules above, `panel.js`, `overlay.js`,
`selling-page.js`, `report-view.js`, `usage-view.js`, `bought-window.js`,
`fill-form.js`, `graph.js`), and in `src/core`: `ranker.js`, `npc.js`,
`trade.js`, `fill.js`, `held.js`, `history.js`, `partners.js`, `selling.js`,
`status.js`, `liquidity.js`, `to-sell.js`, `bazaar-sell.js`,
`trades-board.js`, `trades-export.js`, `kept-buyers.js`. Also not copied:
`test/harness.html`, `test/harness-live.html`, `test/bench.mjs`,
`test/ux-check.mjs`.

## Changed while copying

Every change in behaviour. A file not named here behaves as it did in SRC.

**Names**

1. `ttv2-` -> `tarc-` in every copied file and test: element ids, classes, the
   CSS variable, and `ttv2Pos` -> `tarcPos`. Not in `src/core/turns.js`, where
   `ttv2-host` and `ttv2-sell-host` are Torn Bids' ids, looked for on purpose.
2. The comment sent with a request: `TornTradingV2` -> `TornArchive` (Torn's
   API and TornW3B both).
3. Stored values: prefix `tornArchive.v1.` (`src/platform/gm.js`); IndexedDB
   database `tornArchive` (`src/platform/idb.js`). Nothing of Torn Bids' own
   storage is read or written.
4. Wording that named Torn Bids to the person now names Torn Archive:
   `keyTooLowForInventory` ("Torn Archive needs a Limited key..."), `goneLine`
   ("...in Torn Archive"), the speed log's title ("Torn Archive - speed log")
   and its `kind` (`torn-archive-speed`).

**Torn's API client (`src/api/client.js`)**

5. 85 requests a minute by default (was 70). The lanes keep their reserves, so
   they are now 65 (low), 80 (normal), 85 (high).
6. New option `isPaused` (a function; default: never). While it says yes the
   client sends nothing: a new request is refused, and so is a request that was
   already waiting in the queue when its turn comes. The refusal is a
   `PausedError` (`local`, `takingTurns`), not a `TornApiError`: it has no code,
   pauses no other tab, and is not handed to `onFailed`. A hook that throws
   does not stop reads.
7. No key (weak point 3): a `NoKeyError` (`local`, `noKey`), no longer a
   `TornApiError` with Torn's code 2. It is still handed to `onFailed`.

**TornW3B's client (`src/api/w3b.js`)**

8. Overall window 80 a minute (the default, and the default for every tab
   together). `overlayPerMinute` and the "beside Torn Bids" ceiling are gone:
   the two scripts never run at once.
9. A second window for the item-listing route (`marketplace/{itemId}`, the path
   `isW3bListingPath` matches): 9 a minute (option `listingPerMinute`). It can
   be shared between tabs (`loadListing` / `addListing`, the shape
   `tabWindow().load` / `.add` give).
10. A day counter for the same route: 950 in any 24 hours (option
    `listingPerDay`), kept as hour buckets through `loadListingDay` /
    `saveListingDay`. It counts the running hour and the 24 before it, so it
    errs on the careful side.
11. A full listing window does not wait: the request is refused here with a
    `W3bError` that has `local: true`, a `reason` (`listing-minute`,
    `listing-day`) and `retryAt` (when there is room again). The caller asks
    again later. The overall window still waits, as before.
12. `Retry-After` on a 429 is honoured: seconds or an HTTP date, kept between
    1 second and 24 hours; with none, 60 seconds as before. The error carries
    `retryAt`. The pause is shared between tabs as before.
13. New option `isPaused`, as for Torn's client: nothing is sent, a waiting
    request is not sent either, the error has `local: true`, `reason: 'paused'`,
    `takingTurns: true`.
14. Weak point 1: a request refused here (paused, cooling down, listing window
    full) is never reported as an HTTP error. It goes to the new `onLocal`
    hook, not to `onFailed`, and has no `http`. A cool-down refusal keeps
    `blocked: true`, as SRC's did.
15. `stats()` also gives `listingLastMinute`, `listingRemaining`,
    `listingToday`, `listingDayRemaining`, `listingFreeAt`.
16. No key: the client has none, takes none, and `buildUrl` lets only the
    comment and `tradedWithinHours` through (as in SRC).

**Other files**

17. `src/platform/gm.js`: the object `gmFetch` resolves with has `header(name)`
    (needed for Retry-After), and `gmHeader(raw, name)` is exported.
18. `src/core/errlog.js` (weak point 2): two entries fold into one only when
    message **and** detail are the same. Before, a different detail was lost in
    the count.
19. `src/core/usage.js`: the Torn API's "100%" on the meter is 85 a minute
    (was 70), to agree with the client.
20. `src/sources/route.js`: Torn Bids' page (`TRADERS_PAGE_*`, `?ttv2=traders`)
    is replaced by Torn Archive's own (`ARCHIVE_PAGE_URL`
    `https://abrahamdelosreyes17-oss.github.io/torn-archive/`, test marker
    `?tarc=archive`, `isArchivePageUrl`). The address is the one in the build's
    `@match`.
21. `build.mjs`: writes `dist/torn-archive.user.js` and the copy
    `torn-archive.user.js`; the version constant is `TARC_BUILD_VERSION`; the
    header is new (`@name Torn Archive`, `@namespace torn-archive`, `@match`
    Torn and Torn Archive's page, `@connect api.torn.com` and `weav3r.dev`
    only, the same `@grant` list). `@downloadURL` / `@updateURL` point at
    `raw.githubusercontent.com/abrahamdelosreyes17-oss/torn-archive/main/torn-archive.user.js`,
    which is an assumption until the repository exists.

**Changed so a cut file stands alone**

22. `src/core/tidy.js`: `tidyKeep` is exported (private in SRC), so it is
    tested on its own now that most of its callers are gone.
23. Every CUT file: its imports were trimmed to what the kept code uses. No
    kept function's body was changed for this.

**Deliberately not changed**

- `bazaarUrl` (`core/feed.js`) and `bazaarTarget` (`sources/route.js`) still
  use the URL parameters `ttItem` / `ttPrice`.
- Weak points 4 to 7 of the plan's list for `api/client.js` and `api/w3b.js`.
- `core/usage.js` still lists TornExchange and Torn Bids' tags; `core/items.js`
  still holds `neverFlipOtherOnce`; `core/errlog.js` still holds `lateButHeld`.

## Tests

`npm run check` runs `node --test "test/*.test.js"`, offline: no test opens a
connection, every client is given a fake `fetchImpl`.

SRC had 563 cases in 49 files. A case was kept when everything it imports still
exists; it was deleted when it leans on a function or a file that was not
taken. 194 were kept, 369 deleted; 20 files had no case left and were not
copied. `points.test.js`, `sets.test.js` and `sets-desk.test.js` were copied
whole and are the lead's from then on.

Edited by hand after copying, because the code under them was changed on
purpose: `api.test.js` (the lane case: 70 of 85, lanes 65 / 80 / 85),
`speed.test.js` (`torn-archive-speed`), `zip-trades.test.js` ("...in Torn
Archive").

New here:

| Path | Cases | Covers |
|---|---|---|
| `test/turns.test.js` | 7 | `src/core/turns.js`. |
| `test/clients.test.js` | 15 | What was added to the two clients: 85 a minute, `NoKeyError`, `PausedError`, a waiting request not sent; the listing window, the day cap, Retry-After, local refusals, no key ever in a TornW3B address; `gmHeader`. |
| `test/kept-parts.test.js` | 16 | Kept functions whose own SRC cases went with a cut neighbour: `enoughProfit`, the `tidy*` four, `readTraderDb`, `stalePrice` / `freshOnly`, `ITEMS_PARTIAL_TTL_MS`, `makeZip` / `crc32`, `pickBazaars`' stops, `stepDone` / `sendUnits` / `takenUnits`, `tradeCount` / `boughtSince` / `countView`, the log's fold, `isArchivePageUrl`, `MARKS_CSS` against the class names the finders use. |

The lead's, not from this copy: `books`, `desk-parts`, `margin`, `shopping`,
`stock`, `view` (`.test.js`) and `fixture-view.js`.

### Per SRC test file

| Test file (SRC/test, e0fac2e) | Cases there | Kept | Deleted | Why the deleted ones went |
|---|---|---|---|---|
| `accepted.test.js` | 12 | 0 (file not copied) | 12 | acceptTrade cut from core/accepted.js; recordBuy cut from core/accepted.js; acceptedTotals cut from core/accepted.js; tickAccepted cut from core/accepted.js; nextStep cut from core/accepted.js; replacementFor cut from core/accepted.js; and 13 more |
| `all-buys.test.js` | 9 | 0 (file not copied) | 9 | its helper faffo leaned on a cut function; acc.placeBuy cut; acc.acceptTrade cut; acc.sendList cut; acc.tradeBidOf cut; acc.tradeForBuy cut; and 7 more |
| `api.test.js` | 15 | 15 | 0 | - |
| `background.test.js` | 10 | 4 | 6 | flipsStale cut from core/desk.js; profileIdOf cut from sources/route.js; fillNote cut from core/accepted.js; declineKey cut from core/desk.js; declinedOn cut from core/desk.js; freshMinutes cut from core/desk.js; and 3 more |
| `bazaar-cover.test.js` | 18 | 16 | 2 | buyingWhereText cut from core/accepted.js; flipPlan cut from core/flips.js; stepState cut from core/accepted.js |
| `bazaar-sell.test.js` | 13 | 0 (file not copied) | 13 | core/bazaar-sell.js not taken; core/to-sell.js not taken; soldRows cut from core/ledger.js; soldByVenue cut from core/ledger.js; soldOutcome cut from core/ledger.js; boughtFromText cut from core/ledger.js; and 3 more |
| `bought.test.js` | 9 | 2 | 7 | recordBuy cut from core/accepted.js; ui/bought-window.js not taken; addExtraBuy cut from core/accepted.js; checkoutList cut from core/accepted.js; acceptTrade cut from core/accepted.js |
| `cash.test.js` | 8 | 1 | 7 | selectCandidates cut from core/feed.js; core/ranker.js not taken; its helper row leaned on a cut function; reachableProfit cut from core/feed.js; itemMarketSweepList cut from core/feed.js |
| `core.test.js` | 39 | 19 | 20 | core/npc.js not taken; core/ranker.js not taken; computeOpportunity cut from core/profit.js; bestVenue cut from core/profit.js; capQuantityByCash cut from core/profit.js |
| `discovery.test.js` | 3 | 0 (file not copied) | 3 | emptyFeed cut from core/feed.js; setItemMarketSnapshot cut from core/feed.js; itemMarketSweepList cut from core/feed.js; finiteCmp cut from core/feed.js; selectCandidates cut from core/feed.js; itemMarketLiveIds cut from core/feed.js; and 1 more |
| `errlog.test.js` | 2 | 1 | 1 | ui/report-view.js not taken |
| `faster.test.js` | 2 | 1 | 1 | core/partners.js not taken |
| `feed.test.js` | 45 | 20 | 25 | emptyFeed cut from core/feed.js; setBazaarSnapshot cut from core/feed.js; its helper makeFeed leaned on a cut function; setItemMarketSnapshot cut from core/feed.js; selectCandidates cut from core/feed.js; feed/controller.js not taken; and 18 more |
| `fill.test.js` | 20 | 0 (file not copied) | 20 | core/fill.js not taken |
| `flips.test.js` | 18 | 1 | 17 | flipPlan cut from core/flips.js; whereToSell cut from core/flips.js; flipBuyer cut from core/flips.js; flipCandidates cut from core/flips.js; payableUnits cut from core/flips.js; flipBuyers cut from core/flips.js; and 8 more |
| `held.test.js` | 10 | 1 | 9 | core/held.js not taken; deskItem cut from core/desk.js |
| `helper.test.js` | 7 | 2 | 5 | core/history.js not taken; ui/graph.js not taken |
| `kept-buyers.test.js` | 8 | 0 (file not copied) | 8 | core/kept-buyers.js not taken; its helper world leaned on a cut function; its helper sources leaned on a cut function; traderIdsByName cut from core/traders.js |
| `late-buy.test.js` | 4 | 0 (file not copied) | 4 | acceptTrade cut from core/accepted.js; recordBuy cut from core/accepted.js; recordLateBuy cut from core/accepted.js; checkoutList cut from core/accepted.js; sendList cut from core/accepted.js; applyLogBuys cut from core/accepted.js; and 1 more |
| `ledger-api.test.js` | 7 | 6 | 1 | parseNetworth cut from api/torn.js |
| `ledger.test.js` | 12 | 7 | 5 | ledgerTotals cut from core/ledger.js; filterLedgerRows cut from core/ledger.js; ledgerByItem cut from core/ledger.js; ledgerByPeriod cut from core/ledger.js; periodStart cut from core/ledger.js; priceRecordOf cut from core/ledger.js; and 2 more |
| `liquidity.test.js` | 13 | 0 (file not copied) | 13 | core/liquidity.js not taken; core/trade.js not taken; acceptTrade cut from core/accepted.js; recordBuy cut from core/accepted.js; markLeft cut from core/accepted.js; leftoversOf cut from core/accepted.js; and 3 more |
| `logbuys.test.js` | 16 | 0 (file not copied) | 16 | its helper buys leaned on a cut function; applyLogBuys cut from core/accepted.js; checkoutList cut from core/accepted.js; recordBuy cut from core/accepted.js; cancelledLeftovers cut from core/accepted.js; nextStep cut from core/accepted.js; and 7 more |
| `main-flip.test.js` | 14 | 1 | 13 | core/trade.js not taken; flipPlan cut from core/flips.js; ui/selling-page.js not taken |
| `not-for-sale.test.js` | 7 | 0 (file not copied) | 7 | core/to-sell.js not taken; acc.addLeftovers cut; core/bazaar-sell.js not taken |
| `old-list.test.js` | 4 | 0 (file not copied) | 4 | ui/overlay.js not taken; traders.tagBuyer cut; traders.packListAt cut; traders.readListAtRows cut; traders.tradeOldList cut |
| `over-plan.test.js` | 4 | 1 | 3 | recordBuy cut from core/accepted.js; addExtraBuy cut from core/accepted.js; sendList cut from core/accepted.js; boughtFromStock cut from core/accepted.js; boughtOverStock cut from core/accepted.js; applyLogBuys cut from core/accepted.js |
| `overlay-inputs.test.js` | 14 | 0 (file not copied) | 14 | ui/panel.js not taken; ui/styles.js not taken; ui/fill-form.js not taken |
| `own-buys.test.js` | 18 | 8 | 10 | leftoversAfterSales cut from core/accepted.js; its helper accepted leaned on a cut function; tradedLeftovers cut from core/accepted.js; LEFTOVER_SALE_MARGIN_MS cut from core/accepted.js; addLeftovers cut from core/accepted.js; stepState cut from core/accepted.js; and 2 more |
| `partners.test.js` | 10 | 0 (file not copied) | 10 | core/partners.js not taken; priceRecordOf cut from core/ledger.js; addPriceRecord cut from core/ledger.js; tradeReceipts cut from core/ledger.js |
| `points.test.js` | 11 | 11 | 0 | copied whole (the lead's file from here on) |
| `selling.test.js` | 16 | 5 | 11 | api/te.js not taken; its helper fakeQueue leaned on a cut function; core/selling.js not taken; tradersPageUrl cut from sources/route.js; isTradersPageUrl cut from sources/route.js; isOldTradersPageUrl cut from sources/route.js |
| `sets-desk.test.js` | 13 | 13 | 0 | copied whole (the lead's file from here on) |
| `sets.test.js` | 15 | 15 | 0 | copied whole (the lead's file from here on) |
| `sharing.test.js` | 6 | 6 | 0 | - |
| `speed.test.js` | 12 | 10 | 2 | core/trades-export.js not taken; ui/usage-view.js not taken; ui/report-view.js not taken |
| `start-up.test.js` | 7 | 6 | 1 | warmSlice cut from core/start-up.js; WARM_SLICE_MS cut from core/start-up.js |
| `status.test.js` | 8 | 0 (file not copied) | 8 | core/status.js not taken |
| `ten-thousand.test.js` | 9 | 0 (file not copied) | 9 | core/trade.js not taken; acc.addExtraBuy cut; its helper boughtTrade leaned on a cut function; its helper chosen leaned on a cut function; acc.acceptTrade cut; acc.recordBuy cut; and 6 more |
| `tidy.test.js` | 5 | 0 (file not copied) | 5 | tidyAccepted cut from core/tidy.js; tidyPins cut from core/tidy.js; tidyDeclined cut from core/tidy.js; tidyCancelUndo cut from core/tidy.js; tidyLeftovers cut from core/tidy.js; tidyTeLists cut from core/tidy.js; and 4 more |
| `to-sell.test.js` | 7 | 0 (file not copied) | 7 | core/to-sell.js not taken; acceptTrade cut from core/accepted.js; markLeft cut from core/accepted.js; core/trade.js not taken; core/liquidity.js not taken; acceptedTotals cut from core/accepted.js; and 5 more |
| `trade.test.js` | 5 | 0 (file not copied) | 5 | core/trade.js not taken |
| `traded.test.js` | 9 | 0 (file not copied) | 9 | its helper trade leaned on a cut function; finishedTradeFor cut from core/accepted.js; tradedLeftovers cut from core/accepted.js; TRADE_DONE_SLACK_MS cut from core/accepted.js; leftoversAfterSales cut from core/accepted.js; LEFTOVER_SALE_MARGIN_MS cut from core/accepted.js; and 7 more |
| `traders.test.js` | 43 | 11 | 32 | api/te.js not taken; nextW3bTrader cut from core/traders.js; traderDbStats cut from core/traders.js; pruneTraderDb cut from core/traders.js; onlineOnly cut from core/traders.js; W3B_ERROR_RETRY_MS cut from core/traders.js; and 26 more |
| `trades-board.test.js` | 6 | 0 (file not copied) | 6 | core/trades-board.js not taken; acceptTrade cut from core/accepted.js; recordBuy cut from core/accepted.js; tidyAsked cut from core/tidy.js; cancelledLeftovers cut from core/accepted.js; tidyEnded cut from core/tidy.js; and 4 more |
| `usage.test.js` | 3 | 2 | 1 | ui/usage-view.js not taken |
| `w3b-ask.test.js` | 6 | 6 | 0 | - |
| `w3b-budget.test.js` | 8 | 2 | 6 | its helper minuteOfFeed leaned on a cut function; overlayPerMinute cut from api/w3b.js; W3B_BESIDE_BIDS_PER_MINUTE cut from api/w3b.js; bazaarDue cut from core/feed.js; emptyFeed cut from core/feed.js; setBazaarSnapshot cut from core/feed.js; and 2 more |
| `zip-trades.test.js` | 3 | 1 | 2 | core/trades-export.js not taken |

### Every deleted case

One line each: the case's name, then what it leaned on that is not here.

**accepted.test.js**

- accepting freezes the plan: what to buy, what to send, what they pay - acceptTrade cut from core/accepted.js
- each step is checked against the bazaar now: still there, re-priced, fewer left, gone - stepState cut from core/accepted.js
- ticks: a step bought, an item sent; old trades are let go - acceptTrade cut from core/accepted.js; liveAccepted cut from core/accepted.js; tickAccepted cut from core/accepted.js; ACCEPTED_MAX_AGE_MS cut from core/accepted.js
- the buying run: next step, what you bought from the stock drop, what you then send - acceptTrade cut from core/accepted.js; nextStep cut from core/accepted.js; boughtFromStock cut from core/accepted.js; recordBuy cut from core/accepted.js; ...
- a gone or re-priced listing: the next cheapest still under their price, or drop the item - acceptTrade cut from core/accepted.js; replacementFor cut from core/accepted.js; replaceStep cut from core/accepted.js; dropLine cut from core/accepted.js
- a tick is the last word: ticked after a skip counts as bought, unticked undoes a count (bug hunt, 3.12.10) - acceptTrade cut from core/accepted.js; tickAccepted cut from core/accepted.js; nextStep cut from core/accepted.js; recordBuy cut from core/accepted.js; ...
- a re-priced or short seller can be its own replacement; a gone one never (bug hunt, 3.12.10) - replacementFor cut from core/accepted.js
- the buying box: its status never breaks inside, the time in hours and minutes, the label never cut - buyingStatus cut from core/accepted.js; ui/styles.js not taken
- Cancel trade: what you already bought for it (planned and not) is yours to sell elsewhere - acceptTrade cut from core/accepted.js; recordBuy cut from core/accepted.js; cancelledLeftovers cut from core/accepted.js; addExtraBuy cut from core/accepted.js
- a trade made mid flip: what goes in is what you bought; the rest is "not bought yet", never offered to Fill - recordBuy cut from core/accepted.js; acceptedTotals cut from core/accepted.js; addExtraBuy cut from core/accepted.js; sendList cut from core/accepted.js; ...
- your own items in a trade always go in, bought or not - acceptTrade cut from core/accepted.js; recordBuy cut from core/accepted.js; sendList cut from core/accepted.js
- Fill\'s line on a part-bought trade: says it is all in, and how many are not bought yet - fillNote cut from core/accepted.js

**all-buys.test.js**

- the Champagne case: a planned item bought at another bazaar joins the trade, at the price its trader accepted - its helper faffo leaned on a cut function; acc.placeBuy cut; acc.sendList cut
- what a trade pays for an item: the price it accepted - for a flip or one of your own lines - else the trader\'s list, else nothing - acc.tradeBidOf cut; acc.acceptTrade cut
- which trade a buy is for: the one that planned it at this bazaar, else the newest that accepted a price for the item, else the newest whose trader lists it - its helper faffo leaned on a cut function; acc.tradeForBuy cut; acc.acceptTrade cut
- a buy on a bazaar page goes to one place: the buying run, the trade, or To sell - its helper faffo leaned on a cut function; acc.placeBuy cut
- a step already passed is filled first; what is over it is an unplanned buy of the same trade - its helper faffo leaned on a cut function; acc.recordBuy cut; acc.placeBuy cut; acc.sendList cut
- your Torn log goes by the same rule: one of your own lines says what they pay, and a buy goes to the trade that pays for it - acc.acceptTrade cut; acc.splitLogBuys cut; acc.applyLogBuys cut
- never in To sell and in the trade both: a buy your log puts in the trade comes off the To sell row the page made for it - acc.toSellLessTradeBuys cut; acc.addLeftovers cut
- the same item listed twice at one bazaar: the card the buying run is not counting is a buy of the trade at once - its helper faffo leaned on a cut function; acc.placeBuy cut; acc.pendingStepAt cut
- the problem log says where each buy read from your Torn log lands, and why - its helper faffo leaned on a cut function; acc.logBuyPlace cut

**background.test.js**

- hidden, a new bazaar summary gets the possible flips worked out at once - flipsStale cut from core/desk.js
- the profile Chat leads to: its player id, from Torn or the harness - profileIdOf cut from sources/route.js
- Fill on the trade page never fails silently: one line says what it did, or why not - fillNote cut from core/accepted.js
- declining one trade is that trade only: the same trader stays on other items - declineKey cut from core/desk.js; declinedOn cut from core/desk.js
- bazaar prices: whole minutes from 1 to 10, else the default - freshMinutes cut from core/desk.js; freshnessMs cut from core/desk.js; FRESH_DEFAULTS cut from core/desk.js
- bazaar prices: the defaults keep up; too fast says how often the other flips are read - keepsUp cut from core/desk.js

**bazaar-cover.test.js**

- the buying box says where the listing stands, with how much of the bazaar was read - buyingWhereText cut from core/accepted.js
- a bazaar seen without the listing is left out of the next plan - the friend was sent back within minutes - flipPlan cut from core/flips.js; stepState cut from core/accepted.js

**bazaar-sell.test.js**

- unsold bought: only what was bought in the window and is still held, at what it cost - core/bazaar-sell.js not taken
- unsold bought: a sale uses up the oldest units first, a gift too - core/bazaar-sell.js not taken
- unsold bought: rows out of order are put in order, and nothing bought gives nothing - core/bazaar-sell.js not taken
- the record Torn Bids leaves: read back only while inside the day - core/bazaar-sell.js not taken
- the sell list: To sell first, then the day\'s other buys, newest first - core/bazaar-sell.js not taken
- the sell list: what was bought for a trade still going is not in it - core/bazaar-sell.js not taken
- under what you paid: only a known cost, only a lower price - core/bazaar-sell.js not taken
- the Sold tab: sales only, each a profit, a loss or cost not known; totals per place - soldRows cut from core/ledger.js; soldByVenue cut from core/ledger.js; soldOutcome cut from core/ledger.js
- the Sold tab: where a sale\'s units were bought, in a few words - boughtFromText cut from core/ledger.js
- To sell notes: one for what joins the list, none for what leaves or stays - core/to-sell.js not taken
- To sell tags: the sales made after an item joined the list, up to how many joined - core/to-sell.js not taken
- the hourly tidy-up: old To sell notes and buys past the day go; a reader gets the same either way - core/bazaar-sell.js not taken; core/to-sell.js not taken; tidyWasToSell cut from core/tidy.js; tidyHeld cut from core/tidy.js
- what you are holding for a trade reads the same whenever it is asked (the Checkout window is not rebuilt each tick) - sellElsewhere cut from core/accepted.js

**bought.test.js**

- what you bought for the trade, in the order you bought it, with cost, what they pay and what is left - recordBuy cut from core/accepted.js
- the trade page checklist: ticks what is in the trade, names what is missing - recordBuy cut from core/accepted.js
- the Bought window goes anywhere on the page, but its title bar never leaves the view - ui/bought-window.js not taken
- an unplanned buy joins the trade, merged with the same item and seller - addExtraBuy cut from core/accepted.js
- checkout cart: every item of the plan in Next bazaar order, each ticking itself off (3.15.1) - recordBuy cut from core/accepted.js; checkoutList cut from core/accepted.js; acceptTrade cut from core/accepted.js
- the checkout window starts clear of NPC Arbitrage: above it if it fits, else beside it (3.15.1) - ui/bought-window.js not taken
- Checkout fits the screen (3.16): moved up to fit when it can, else its list scrolls inside - ui/bought-window.js not taken

**cash.test.js**

- discovery: with cash set, items you cannot afford are never fetched - selectCandidates cut from core/feed.js; reachableProfit cut from core/feed.js
- discovery: an item that cannot reach Min with your cash is skipped - selectCandidates cut from core/feed.js
- Item Market sweep: the Market chip adds items, and cash drops unaffordable ones - itemMarketSweepList cut from core/feed.js
- hiddenCounts: says what cash and Min took out - core/ranker.js not taken; its helper row leaned on a cut function
- cash: rows you cannot buy one of are hidden, whatever Min and whether the quantity is known - core/ranker.js not taken; its helper row leaned on a cut function
- header total: with cash set, best rows first until the cash runs out - core/ranker.js not taken; its helper row leaned on a cut function
- discovery: setting Cash never pushes out deals you can afford - selectCandidates cut from core/feed.js

**core.test.js**

- NPC route takes no fee - computeOpportunity cut from core/profit.js
- Item Market fee is applied to the exit price - computeOpportunity cut from core/profit.js
- a listing above the fee-adjusted exit price is a loss, not a hit - computeOpportunity cut from core/profit.js
- cash on hand caps realizable profit - computeOpportunity cut from core/profit.js
- capQuantityByCash edge cases - capQuantityByCash cut from core/profit.js
- computeOpportunity rejects unusable input instead of guessing - computeOpportunity cut from core/profit.js
- bestVenue picks the highest realizable profit after fees - bestVenue cut from core/profit.js
- ranking is by realizable profit, not per-unit or percent - core/ranker.js not taken
- a missing city-shop match flags a row, it does not hide it - core/ranker.js not taken
- ties break on ROI - core/ranker.js not taken
- summarize totals the ranked rows - core/ranker.js not taken
- the NPC index keeps which shop stocks each item and what it charges - core/npc.js not taken
- an unrecognised shops payload yields an empty index, not a crash - core/npc.js not taken
- an array-shaped inventory is handled too - core/npc.js not taken
- npcShopFor names the shop, and manual overrides win both ways - core/npc.js not taken
- isNpcSellable still answers the yes/no question - core/npc.js not taken
- the NPC index survives a cache round trip - core/npc.js not taken
- npcExitPrice never falls back to market value - core/npc.js not taken
- rows with a guessed price are excluded from the ranking - core/ranker.js not taken
- Min applies to a one-item listing: below Min is amber, not listed - bestVenue cut from core/profit.js; core/ranker.js not taken

**discovery.test.js**

- sweep order: NPC items first, closest to value first; never a NaN comparison - itemMarketSweepList cut from core/feed.js; finiteCmp cut from core/feed.js; selectCandidates cut from core/feed.js
- a snapshot with listings is "live" only when one of them beats an exit - itemMarketLiveIds cut from core/feed.js; emptyFeed cut from core/feed.js; setItemMarketSnapshot cut from core/feed.js
- the planner gives discovery a slot every cycle and re-checks live rows before they expire - feed/controller.js not taken; emptyFeed cut from core/feed.js; setItemMarketSnapshot cut from core/feed.js

**errlog.test.js**

- Report a problem: one zip - your words, screenshots, the log, API use, state (3.15) - ui/report-view.js not taken

**faster.test.js**

- favourites first on a tie: the same order as asking every buyer, with far fewer questions - core/partners.js not taken

**feed.test.js**

- exitsFor: Sell to NPC is the default; resale exits only when chosen - exitsFor cut from core/feed.js
- an item with no NPC sell price ("Sell: N/A") never gets an NPC price - exitsFor cut from core/feed.js; selectCandidates cut from core/feed.js
- candidates come from one summary call, best edge first - selectCandidates cut from core/feed.js
- a listing with no timestamp is "age unknown", not "ancient" - emptyFeed cut from core/feed.js; setBazaarSnapshot cut from core/feed.js; expireFeed cut from core/feed.js; BAZAAR_SNAPSHOT_TTL_MS cut from core/feed.js
- a new snapshot REPLACES the old one - a sold listing cannot survive a refresh - emptyFeed cut from core/feed.js; setBazaarSnapshot cut from core/feed.js
- bazaar rows expire on the SOURCE\'s age, not on when we fetched - emptyFeed cut from core/feed.js; setBazaarSnapshot cut from core/feed.js; expireFeed cut from core/feed.js; BAZAAR_MAX_DATA_AGE_MS cut from core/feed.js
- Item Market snapshots die when not refreshed - emptyFeed cut from core/feed.js; setItemMarketSnapshot cut from core/feed.js; expireFeed cut from core/feed.js; ITEM_MARKET_SNAPSHOT_TTL_MS cut from core/feed.js
- refetch timing respects both sources\' caches - emptyFeed cut from core/feed.js; setBazaarSnapshot cut from core/feed.js; setItemMarketSnapshot cut from core/feed.js; bazaarDue cut from core/feed.js; ...
- the page you are viewing overrules the feed when it shows a higher price - emptyFeed cut from core/feed.js; setBazaarSnapshot cut from core/feed.js; setItemMarketSnapshot cut from core/feed.js; reconcileWithPage cut from core/feed.js
- absence from a bazaar page proves nothing - it renders lazily - emptyFeed cut from core/feed.js; setBazaarSnapshot cut from core/feed.js; reconcileWithPage cut from core/feed.js
- feed rows are priced like page rows and link to the right place - emptyFeed cut from core/feed.js; setBazaarSnapshot cut from core/feed.js; setItemMarketSnapshot cut from core/feed.js; feedOpportunities cut from core/feed.js
- the feed survives storage and drops what expired meanwhile - emptyFeed cut from core/feed.js; setBazaarSnapshot cut from core/feed.js; makeFeedCacheEntry cut from core/feed.js; readFeedCacheEntry cut from core/feed.js; ...
- the leader polls; a second visible tab does not - readFeedCacheEntry cut from core/feed.js; feed/controller.js not taken; its helper makeFeed leaned on a cut function
- a hidden tab does nothing and hands over leadership - feed/controller.js not taken; its helper makeFeed leaned on a cut function
- with TornW3B not opted in, it is never contacted - its helper makeFeed leaned on a cut function
- an item that drops out of the summary loses its bazaar rows at once - readFeedCacheEntry cut from core/feed.js; feed/controller.js not taken; its helper makeFeed leaned on a cut function
- the Item Market sweep covers every item, even with candidates queued - its helper makeFeed leaned on a cut function
- the item list comes from v2 and never prices a shop-less item for an NPC - selectCandidates cut from core/feed.js
- if v2 fails for a non-key reason, v1 is used - but gives NO NPC prices, and is asked again in minutes - selectCandidates cut from core/feed.js
- a page listing is removed once fresher data proves it sold - emptyFeed cut from core/feed.js; setBazaarSnapshot cut from core/feed.js; setItemMarketSnapshot cut from core/feed.js; pageRowContradicted cut from core/feed.js
- Scan in any tab makes the leader rebuild everything at once - feed/controller.js not taken; its helper makeFeed leaned on a cut function
- items with a live Item Market row are re-checked on every refresh - its helper makeFeed leaned on a cut function
- bazaar owner presence: v2 and v1 shapes, and the words shown - parseUserPresence cut from api/torn.js; agoText cut from sources/dom/owner.js; presenceText cut from sources/dom/owner.js
- seller status on a deal row: short words, full words in the tooltip - parseUserPresence cut from api/torn.js; presenceShort cut from sources/dom/owner.js; presenceWord cut from sources/dom/owner.js
- the Item Market side (the shared Torn budget) waits until someone looks at it; bazaars (TornW3B) do not (3.15) - its helper makeFeed leaned on a cut function

**fill.test.js**

- the default is the friend\'s: the lowest bazaar listing minus $1 - core/fill.js not taken
- listing index picks the 2nd or 3rd lowest; fewer listings uses the highest there is - core/fill.js not taken
- the margin in percent rounds down to whole dollars - core/fill.js not taken
- your own, $1, sponsored, stale and troll listings are never the one undercut - core/fill.js not taken
- Item Market listings are live: no freshness check, and a listing marked mine is skipped - core/fill.js not taken
- never below the NPC price; the average floor only when switched on - core/fill.js not taken
- nothing to go by: no price, and says why - core/fill.js not taken
- an undercut that would reach $1 or less is refused, not typed - core/fill.js not taken
- percent undercuts land on the right dollar (no float error) - core/fill.js not taken
- quantity: all, or all but one; nothing to list leaves the box alone - core/fill.js not taken
- settings are cleaned: bad values fall back, the unit is $ or % - core/fill.js not taken
- the verdict: green at or over the average, amber under - core/fill.js not taken
- ordinals read like a person would say them - core/fill.js not taken
- realListings sorts cheapest first - core/fill.js not taken
- a price on the add page: red under what you paid, amber over the lowest bazaar, green otherwise - core/fill.js not taken
- a price with only one thing to hold it against, or none - core/fill.js not taken
- listings read ahead: never read first, in the order given; then the oldest past its age - core/fill.js not taken
- listings read ahead: one being read is passed over, one that failed waits - core/fill.js not taken
- a price far under market value: a quarter or more under it pulses red; a normal undercut does not - core/fill.js not taken
- far under: held against the lower of the market value and the lowest bazaar, so undercutting cheap bazaars is not a warning - core/fill.js not taken

**flips.test.js**

- flip plan: cheapest first, only under the bid, the cash caps it, a part-bought listing ends it - flipPlan cut from core/flips.js
- flip plan: never more than Most per flip (100 by default), and says how many were under the bid - flipPlan cut from core/flips.js
- flip buyer: a bid over 3x the Item Market Average is not real; no average or own-stat items: no flip - flipBuyer cut from core/flips.js
- flip plan: nothing under the bid is no plan; one you cannot afford says what it needs - flipPlan cut from core/flips.js
- flip plan: a stale listing is never planned on, even when it is the cheapest - flipPlan cut from core/flips.js
- where to sell: the trader wins unless waiting pays at least 1% more - whereToSell cut from core/flips.js; LIST_EDGE cut from core/flips.js
- where to sell: no trader means the better of the two listings; nothing known means no answer - whereToSell cut from core/flips.js
- flip candidates: only where a trader pays more than the cheapest; unaffordable left out; best first - flipCandidates cut from core/flips.js
- trader tag: only a Trusted buyer paying more than the listing; two lines, nothing cut - traderTagLabel cut from core/flips.js
- could they pay: a flip never asks a trader for more than your share of their networth - flipBuyer cut from core/flips.js; payableUnits cut from core/flips.js
- flip buyers: every believable one that can pay for one, best bid first, each with its cap - flipPlan cut from core/flips.js; payableUnits cut from core/flips.js; flipBuyers cut from core/flips.js
- a flip to a trader needs a real margin: $1 under a $140,000 bid is not a flip - flipPlan cut from core/flips.js; flipCandidates cut from core/flips.js
- NPC deals still count from $1; resale deals need the least profit per item - bestVenue cut from core/profit.js
- 150,000 Hammers are not all worth the cheapest ask: listing counts only the first N listed near it - whereToSell cut from core/flips.js; depthNearCheapest cut from core/flips.js
- weapons, armour and cars are never flipped, whichever way Torn names the type; temporaries are - isStatType cut from core/flips.js; flipBuyers cut from core/flips.js
- troll bids never lead the item list: it sorts by the best believable bid - listBid cut from core/flips.js; believableBid cut from core/flips.js
- near-misses: a bazaar a little over the best bid is read too (the summary lags), closest first (3.15) - nearMisses cut from core/flips.js

**held.test.js**

- the desk shows the #1 flip until you pick one - not the first flip that loaded - deskItem cut from core/desk.js
- holding a trade keeps what you unticked, unticked - core/held.js not taken
- a held trade keeps its items; only the prices and profit move - core/held.js not taken
- a held trade never counts a unit twice, nor one that is gone - core/held.js not taken
- a held line that stops paying stays, marked as losing - core/held.js not taken
- an ≈ line takes its steps once read; the item and its place stay - core/held.js not taken
- only you change a held trade: untick, tick back, a number re-picks that line only - core/held.js not taken
- pins: newest first, at most a few, a week at most - core/held.js not taken
- Add (and Add all) on a held trade before the item\'s bazaars are read: in as an ≈ line, filled in once read - core/held.js not taken

**helper.test.js**

- history: samples land in 5-minute, hourly and 6-hourly buckets; averages carry coverage - core/history.js not taken
- history: no data means no number, not a fake one - core/history.js not taken
- history: market value once a day, buckets pruned to their windows, items capped - core/history.js not taken
- history: two tabs\' copies merge, so inventory items and bazaar samples both survive - core/history.js not taken
- graph: recorded runs are solid, gaps are bridged by a dotted line, a lone sample is a dot - ui/graph.js not taken; core/history.js not taken

**kept-buyers.test.js**

- kept buyers: a long session replayed - every item, every step, the same as worked out fresh - core/kept-buyers.js not taken; its helper world leaned on a cut function; its helper sources leaned on a cut function
- kept buyers: nothing changed, nothing worked out - the very same rows; one item\'s list changed, that item only - core/kept-buyers.js not taken; traderIdsByName cut from core/traders.js; its helper world leaned on a cut function; its helper sources leaned on a cut function
- kept buyers: should a kept item ever differ from a fresh one, keeping stops and it is told - core/kept-buyers.js not taken; its helper world leaned on a cut function; its helper sources leaned on a cut function
- kept buyers: a redraw worked out in pieces - a rating that moves between two pieces does not trip the check, and the next redraw has it - core/kept-buyers.js not taken; its helper world leaned on a cut function; its helper sources leaned on a cut function
- kept buyers: a rating that moves between two pieces and back before the next redraw leaves no wrong rows behind - core/kept-buyers.js not taken; its helper world leaned on a cut function; its helper sources leaned on a cut function
- kept buyers: the long session replayed in pieces - anything can happen between two pieces, and the next redraw is right - core/kept-buyers.js not taken; its helper world leaned on a cut function; its helper sources leaned on a cut function
- kept buyers: after the page was free, the check still runs on the next item - core/kept-buyers.js not taken; its helper world leaned on a cut function; its helper sources leaned on a cut function
- kept buyers: a list entry whose row is dropped still ties its trader to the item (the name can join it to a TornExchange row) - core/kept-buyers.js not taken

**late-buy.test.js**

- Next pressed by mistake, then bought after going back: the step is bought, in the cart and in what you send - acceptTrade cut from core/accepted.js; recordBuy cut from core/accepted.js; recordLateBuy cut from core/accepted.js; checkoutList cut from core/accepted.js; ...
- a late buy: a step bought short is topped up at what you paid; more than planned is handed back; a step still to buy is not touched - acceptTrade cut from core/accepted.js; recordBuy cut from core/accepted.js; recordLateBuy cut from core/accepted.js
- a late buy and your log agree: the log says the same buy, and takes it back when it has none - acceptTrade cut from core/accepted.js; recordBuy cut from core/accepted.js; recordLateBuy cut from core/accepted.js; applyLogBuys cut from core/accepted.js
- To sell: every extra buy a trader pays enough for is listed; of the ones waiting, only the newest few - core/to-sell.js not taken

**ledger-api.test.js**

- networth: the v2 category shape and the stat array shape are both read - parseNetworth cut from api/torn.js

**ledger.test.js**

- totals, per item, per day; units with no buy are counted apart, never guessed - ledgerTotals cut from core/ledger.js; ledgerByItem cut from core/ledger.js; ledgerByPeriod cut from core/ledger.js
- the item filter answers "how much did I make on this item"; a filter never changes a sale\'s cost - filterLedgerRows cut from core/ledger.js; ledgerTotals cut from core/ledger.js
- weeks start on Monday, months on the 1st - periodStart cut from core/ledger.js
- buy under the NPC price on the Item Market, sell to the NPC: that is profit, bought from whom at what - filterLedgerRows cut from core/ledger.js; ledgerTotals cut from core/ledger.js
- a trade's money is split by the trader's accepted prices, not Item Market Average - priceRecordOf cut from core/ledger.js; addPriceRecord cut from core/ledger.js; acceptedPricesFor cut from core/ledger.js

**liquidity.test.js**

- kind: drugs, flowers, plushies are fast; weapons slow; thin listings slow; the rest normal - core/liquidity.js not taken
- kind: what was seen moving beats the type; hours with nothing moving is slow - core/liquidity.js not taken
- units moved: drops and listings gone, never ones past a capped read - core/liquidity.js not taken
- extra bazaars: two at least, more when the item itself takes several, four at most - core/liquidity.js not taken
- smart extras: the route first, then one new bazaar each, fast items first; never 100 hand drills - core/trade.js not taken
- smart extras: normal items at most 10, slow at most 3, yours too - unless you typed a number - core/trade.js not taken
- never a listing in the trader\'s own bazaar - core/trade.js not taken
- what they did not take: out of the totals, kept at its cost for Traded - done - acceptTrade cut from core/accepted.js; markLeft cut from core/accepted.js; leftoversOf cut from core/accepted.js; addLeftovers cut from core/accepted.js; ...
- receipts: one per trade, each item, what it cost and made - tradeReceipts cut from core/ledger.js
- review: one read cannot say a whole market sold out; any spelling of a fast type - core/liquidity.js not taken
- review: an ≈ line (no seller read yet) is not frozen into the accepted trade - acceptTrade cut from core/accepted.js
- review: ticking Bought after a partial count sends the planned amount - acceptTrade cut from core/accepted.js; recordBuy cut from core/accepted.js
- review: leftovers a trader refused come off what they are offered, not off what you hold - core/trade.js not taken

**logbuys.test.js**

- log 1225 rows become bazaar buys: seller, item, how many, each - bazaarBuyRows cut from core/accepted.js; its helper buys leaned on a cut function
- the friend\'s run: every Next said "Did not buy", the log says he bought it all - the log wins - applyLogBuys cut from core/accepted.js; checkoutList cut from core/accepted.js; recordBuy cut from core/accepted.js; cancelledLeftovers cut from core/accepted.js; ...
- applied twice, nothing changes (every page applies it on read) - applyLogBuys cut from core/accepted.js; its helper buys leaned on a cut function
- fewer than planned: bought what the log says, at what was paid; the plan price is kept - applyLogBuys cut from core/accepted.js; checkoutList cut from core/accepted.js; nextStep cut from core/accepted.js; its helper buys leaned on a cut function
- more than planned, the item elsewhere, and other items: unplanned buys, with what the trader pays - applyLogBuys cut from core/accepted.js; its helper buys leaned on a cut function
- a buy before "accepted" is not this trade\'s; within a minute (clocks) it is - applyLogBuys cut from core/accepted.js; LOG_BUY_SLACK_MS cut from core/accepted.js; its helper buys leaned on a cut function
- unplanned buys the page counted: dropped once the log has read past them, kept after - applyLogBuys cut from core/accepted.js; its helper buys leaned on a cut function
- a step counted on the page after the log\'s read is left as counted (the log has not reached it) - applyLogBuys cut from core/accepted.js; recordBuy cut from core/accepted.js
- "Bought 200" at Ann\'s, but the log - read past it - has no buy from Ann: not bought (never 400 counted) - applyLogBuys cut from core/accepted.js; recordBuy cut from core/accepted.js; its helper buys leaned on a cut function
- an older trade the stored log no longer reaches back to is left exactly as saved - applyLogBuys cut from core/accepted.js
- a buy counted on the page never merges into a row from the log (the next read would take it away) - applyLogBuys cut from core/accepted.js; addExtraBuy cut from core/accepted.js; its helper buys leaned on a cut function
- two accepted trades: a buy counts once - planned seller first, else the newest trade before it - splitLogBuys cut from core/accepted.js; its helper buys leaned on a cut function
- stored log buys: one per line, only since the oldest trade - addLogBuys cut from core/accepted.js; its helper buys leaned on a cut function
- the trade page: what is in the trade is shared out - one count never ticks two rows - applyLogBuys cut from core/accepted.js; checkoutList cut from core/accepted.js; its helper buys leaned on a cut function
- sell what you are holding: each bought item with its best OTHER buyer - applyLogBuys cut from core/accepted.js; sellElsewhere cut from core/accepted.js; its helper buys leaned on a cut function
- 3.16.4: a buy this trader does not pay for was not for the trade - never a leftover of it - cancelledLeftovers cut from core/accepted.js; leftoversOf cut from core/accepted.js

**main-flip.test.js**

- a flip takes at most 5 bazaars: Bag of Bon Bons no longer needs 38 - flipPlan cut from core/flips.js
- a flip picks the bazaars that pay the most: one seller with 30 beats five with 2 each - flipPlan cut from core/flips.js
- a big flip from a few bazaars is unchanged: Stealth Virus - flipPlan cut from core/flips.js
- the item that makes the most with the trader is the main flip, not the one on the desk - core/trade.js not taken
- the main flip in a trade takes at most 5 bazaars too - core/trade.js not taken
- about 5 extras, even when the route sells ten more; the rest are listed to add - core/trade.js not taken
- an item you typed a number for takes at most 5 bazaars, not twenty - core/trade.js not taken
- a trader who can pay for nothing gets nothing (a zero cap is not "no limit") - core/trade.js not taken
- extras never spend cash the main flip already spent - core/trade.js not taken
- a big seller behind sixty single units is still found - flipPlan cut from core/flips.js
- five smaller bazaars that beat one big one are found - flipPlan cut from core/flips.js
- the item on the desk stays in its trade, even as slow cover - core/trade.js not taken
- Extras per trade (Settings): 5 by default, up to 10, and each extra still from at most 3 bazaars - core/trade.js not taken; ui/selling-page.js not taken

**not-for-sale.test.js**

- Not for sale: the row is marked, and put back the same way - nothing else on the list changes - core/to-sell.js not taken
- Not for sale: the row stays on the tab, last, with no trader, no profit and no bazaar price - core/to-sell.js not taken
- Not for sale: an extra buy that is locked does not use up one of the ten "waiting" places, and is never cut - core/to-sell.js not taken
- Not for sale: under no trader on the board, not among the waiting - a group of its own - core/to-sell.js not taken
- Not for sale: in no trade as "yours" - core/to-sell.js not taken
- Not for sale: more of the item joining the list does not take the lock off - only you do - core/to-sell.js not taken; acc.addLeftovers cut
- Not for sale: off your bazaar\'s Fill all - also when your log shows the same item bought - core/to-sell.js not taken; core/bazaar-sell.js not taken

**old-list.test.js**

- the overlay tag (item 10c): old is written beside the label, changed when the list ages on, taken off when it is fresh or the tag goes - ui/overlay.js not taken
- the overlay tag (item 10d): with Fresh prices only on, a trader whose list is over two days old is passed over for the next Trusted one - ui/overlay.js not taken; traders.tagBuyer cut
- the list dates for every page: Torn Bids packs them, a page on torn.com reads them back - traders.packListAt cut; traders.readListAtRows cut
- a Your traders card (item 10b): its trade is old when the first of its lines priced from that trader\'s old TornW3B list is - traders.tradeOldList cut

**over-plan.test.js**

- what left the listing over the step\'s number: counted from what this load of the page showed - boughtFromStock cut from core/accepted.js; boughtOverStock cut from core/accepted.js
- the friend\'s Kitten Plushies: Fill offered 28 of the 508 bought; now all 508, before the log is read - recordBuy cut from core/accepted.js; addExtraBuy cut from core/accepted.js; sendList cut from core/accepted.js
- your log read afterwards takes over: still 508, never counted twice - recordBuy cut from core/accepted.js; addExtraBuy cut from core/accepted.js; sendList cut from core/accepted.js; applyLogBuys cut from core/accepted.js

**overlay-inputs.test.js**

- chip box: an emptied box puts the saved value back, never "no limit" or 0 - ui/panel.js not taken
- chip box: Any is no cash limit, stored exactly as the empty box used to be (null) - ui/panel.js not taken
- chip box: a bad value is refused with the reason and the value still in force - ui/panel.js not taken
- chip box: good values are read as before (k / m / commas / "2 mil") - ui/panel.js not taken
- chip box opens with the saved value, exactly, short where exact - ui/panel.js not taken
- chip errors are said under the chips, not in the top bar - ui/panel.js not taken; ui/styles.js not taken
- Fill amount: an emptied box puts the saved amount back (before: it saved 0) - ui/fill-form.js not taken
- Fill amount: bad values are refused with the reason; a percent is under 100 - ui/fill-form.js not taken
- Fill amount: good values are read as before - ui/fill-form.js not taken
- Fill amount: the reason goes right under the box, readable red - ui/fill-form.js not taken
- the seller line wraps, never cut with "…" - ui/styles.js not taken
- the add page header: "Item" keeps its width, the money labels may wrap (no overlap at 240px) - ui/styles.js not taken
- the add page: "×10 · $28 after fee" wraps inside its box - ui/panel.js not taken; ui/styles.js not taken
- the buying box: grey instructions readable on the blue tint (>= 5.5:1), only there - ui/panel.js not taken; ui/styles.js not taken

**own-buys.test.js**

- a step you took part of: "short" only when fewer are left than you still need - stepState cut from core/accepted.js
- Cancel trade on a trade that went through hours ago: the cards go at the next Ledger read - leftoversAfterSales cut from core/accepted.js; cancelledLeftovers cut from core/accepted.js; its helper accepted leaned on a cut function
- what they did not take, then passed on to another trader before the card was even made - leftoversAfterSales cut from core/accepted.js; tradedLeftovers cut from core/accepted.js; its helper accepted leaned on a cut function
- his own units of the item went into the same trade: the card for what is left stays (review, 3.16.4) - leftoversAfterSales cut from core/accepted.js; tradedLeftovers cut from core/accepted.js; its helper accepted leaned on a cut function
- bought again since: those are sold first, the leftover is still his - leftoversAfterSales cut from core/accepted.js; tradedLeftovers cut from core/accepted.js; its helper accepted leaned on a cut function
- a card kept before 3.16.4, or by Traded - done pressed by hand: as before - leftoversAfterSales cut from core/accepted.js; leftoverFrom cut from core/accepted.js; LEFTOVER_SALE_MARGIN_MS cut from core/accepted.js
- two trades leave the same item: one row, counted from the later start - leftoversAfterSales cut from core/accepted.js; addLeftovers cut from core/accepted.js; LEFTOVER_SALE_MARGIN_MS cut from core/accepted.js
- sold by hand after Cancel trade: the rows go, whatever "bought again" they carried (the zip of 2026-10-05) - leftoversAfterSales cut from core/accepted.js
- a new trade\'s buys, counted as bought again by an older row, then put into it by Cancel trade - leftoversAfterSales cut from core/accepted.js; addLeftovers cut from core/accepted.js
- bought again, read in two goes: the same as read in one - leftoversAfterSales cut from core/accepted.js; tradedLeftovers cut from core/accepted.js; its helper accepted leaned on a cut function

**partners.test.js**

- per trader: trades, money, profit, the last trade - most trades first - core/partners.js not taken
- did they pay their list: what they accepted in Torn Bids against what they paid - core/partners.js not taken; priceRecordOf cut from core/ledger.js; addPriceRecord cut from core/ledger.js
- favourites: 5+ trades, the last this month; added by hand; a removal sticks - core/partners.js not taken
- blacklisted traders are never buyers; everyone else is untouched - core/partners.js not taken
- "Traded 7× · last 3d ago" on a trader row - core/partners.js not taken
- a favourite goes first only on a tie: never above a higher price - core/partners.js not taken
- blacklisting and taking a trader off again - core/partners.js not taken
- Your traders: biggest trade first, then still reading, then no trade now; a favourite first only on a tie - core/partners.js not taken
- a trader blacklisted by id is left out as a name-only buyer too - core/partners.js not taken
- "paid their list" is kept with the trade: still known once the accepted prices are forgotten - core/partners.js not taken; tradeReceipts cut from core/ledger.js

**selling.test.js**

- TornExchange: the top buyers parse highest first; bad rows are dropped - api/te.js not taken
- TornExchange: an item\'s full buyer list carries names only, highest first - api/te.js not taken
- TornExchange: active traders give a name -> id map - api/te.js not taken
- TornExchange client: its own key, its own host, a 429 waits, a 401 is a bad key - api/te.js not taken
- TornExchange pace and penalty are shared: a second tab (or a reload) cannot send inside the gap or the wait - api/te.js not taken
- a buyer list of three pages is read one page per slot, then put together - api/te.js not taken; its helper fakeQueue leaned on a cut function
- the queue: a too-soon refusal goes back to the front; another error fails that call only - api/te.js not taken; its helper fakeQueue leaned on a cut function
- trader price caches: round trips, ages out; per-item lists capped - api/te.js not taken; core/selling.js not taken
- traders page URL: our own page, not Torn; the old Torn address forwards to it - tradersPageUrl cut from sources/route.js; isTradersPageUrl cut from sources/route.js; isOldTradersPageUrl cut from sources/route.js
- TornExchange failing: the pill says why - down, slow, an HTTP error, or what it said - never the key - api/te.js not taken
- TornExchange (3.15): the item you open jumps the line; a later page that fails keeps what was read; leaving the item stops its pages - api/te.js not taken; its helper fakeQueue leaned on a cut function

**speed.test.js**

- his trades: a receipt per trade with what it cost and made - and they do name the trader - core/trades-export.js not taken
- both zips carry speed/ and trades/, and say truthfully what is in them - ui/usage-view.js not taken; ui/report-view.js not taken

**start-up.test.js**

- the working-out in pieces: each piece stops when its time is up, every item is done once, in order - warmSlice cut from core/start-up.js; WARM_SLICE_MS cut from core/start-up.js

**status.test.js**

- the watch: the desk, the flip cards, the waiting flips, what you hold, the list - in that order, each once - core/status.js not taken
- the asks: an open trader every 90 s, the rest every 10 minutes, three under way at most - core/status.js not taken
- the asks: after a press, the traders in front of you are read first in line - whatever is under way - core/status.js not taken
- the asks: what you hold and the list never use the asks kept for the desk and the flips - core/status.js not taken
- Best flips, Buyers online only: a flip whose buyer is not read yet waits, the next known ones show - core/status.js not taken
- TornW3B\'s last-active, kept across a reload: only what was read in the last 20 minutes - core/status.js not taken
- the kept activity: rubbish, another version and times from the future are not believed; the newest reads are kept - core/status.js not taken
- Your traders, Buyers online only: the cards in view are watched, and one not read yet offers no trade - core/status.js not taken

**ten-thousand.test.js**

- 10,000 items per trade: the count is every unit of the trade - planned, unplanned and your own lines together - core/trade.js not taken; its helper chosen leaned on a cut function; its helper boughtTrade leaned on a cut function; acc.addExtraBuy cut; ...
- a full trade: Fill all stops at 10,000, in the order you bought, and what is over is named - core/trade.js not taken; its helper boughtTrade leaned on a cut function; acc.addExtraBuy cut; acc.sendList cut
- your own To sell lines count too, after what you bought: one that does not fit stays in To sell - core/trade.js not taken; core/to-sell.js not taken; its helper chosen leaned on a cut function; acc.acceptTrade cut; ...
- what went over waits in To sell under that trader, for a second trade - never as "not taken" - core/trade.js not taken; core/to-sell.js not taken; its helper boughtTrade leaned on a cut function; acc.addExtraBuy cut; ...
- the plan stops at 10,000 items: the main flip, your To sell lines and the extras together - core/trade.js not taken; core/held.js not taken
- "Show them" follows Cash for flips: what is listed is what Add all can buy - best first - and the rest is counted, not shown - core/trade.js not taken
- the left-out list for a trade that holds still: fitted to what that trade leaves of the cash, their pay and the 10,000 - core/trade.js not taken
- a line added to a trade that holds still takes no more than the room it is given - core/trade.js not taken; core/held.js not taken
- the counter in words: nothing to say while there is room, room left from 9,000, full, and what goes to To sell - core/trade.js not taken; acc.fillNote cut

**tidy.test.js**

- accepted trades: past a day they go; a live one is untouched - tidyAccepted cut from core/tidy.js; liveAccepted cut from core/accepted.js; ACCEPTED_MAX_AGE_MS cut from core/accepted.js
- pins, gone marks, page stocks, own buys: each as its reader keeps it - tidyPins cut from core/tidy.js; core/held.js not taken
- declined trades, cancelled trades kept to be put right, leftovers - tidyDeclined cut from core/tidy.js; tidyCancelUndo cut from core/tidy.js; tidyLeftovers cut from core/tidy.js
- TornExchange: a full list past half an hour goes; the top buyers are left alone - tidyTeLists cut from core/tidy.js; core/selling.js not taken
- junk in a store is left as it is: the tidy-up never guesses - tidyAccepted cut from core/tidy.js; tidyPins cut from core/tidy.js; tidyDeclined cut from core/tidy.js; tidyCancelUndo cut from core/tidy.js; ...

**to-sell.test.js**

- the To sell rows: who pays most now, what it makes, the best profit first, then what waits - core/to-sell.js not taken
- the board: one group per trader who pays most, the biggest first; the rest wait - core/to-sell.js not taken
- what goes into a trade as yours: every To sell item that trader pays enough for - all of it, and nothing else - core/to-sell.js not taken
- a trade with To sell lines: all you hold of each, whatever its kind; its profit is what they pay over what you paid - core/to-sell.js not taken; core/trade.js not taken; core/liquidity.js not taken
- they said yes: the yours lines are in the trade with what you paid, and its profit counts them - core/to-sell.js not taken; acceptTrade cut from core/accepted.js; acceptedTotals cut from core/accepted.js; markLeft cut from core/accepted.js
- a leftover says why it is To sell: not taken, a cancelled trade - and the newer word wins when two meet - acceptTrade cut from core/accepted.js; markLeft cut from core/accepted.js; leftoversOf cut from core/accepted.js; cancelledLeftovers cut from core/accepted.js; ...
- To sell never suggests a loss (3.22.0): no trader under what you paid, your own bazaar when that is a profit, no venue under it is the best - core/to-sell.js not taken; whereToSell cut from core/flips.js

**trade.test.js**

- the picked item first, then the most profit per $; ONE Cash for everything - core/trade.js not taken
- untick an item: it is left out and its cash goes to the others; a typed number caps it - core/trade.js not taken
- stale listings and ones under the least profit per item are never planned - core/trade.js not taken
- what you hold goes in, minus what you keep; the keep list is remembered as a number or all - core/trade.js not taken
- the trader is never asked for more than their networth share - for the whole trade - core/trade.js not taken

**traded.test.js**

- a finished trade: when, with whom, what you gave - itemsGiven cut from core/accepted.js; tradePartnerId cut from core/accepted.js; tradeFinishedAt cut from core/accepted.js; its helper trade leaned on a cut function
- the friend\'s trade: finished with KOMBAJN1 after they accepted - it closes, nothing left over - finishedTradeFor cut from core/accepted.js; tradedLeftovers cut from core/accepted.js; its helper trade leaned on a cut function
- only a trade with that trader, after they accepted, with the plan\'s items in it - finishedTradeFor cut from core/accepted.js; TRADE_DONE_SLACK_MS cut from core/accepted.js; its helper trade leaned on a cut function
- a cancelled trade: only one that finished before you cancelled is it - finishedTradeFor cut from core/accepted.js; TRADE_DONE_SLACK_MS cut from core/accepted.js; its helper trade leaned on a cut function
- what they did not take stays yours: bought minus given, at what it cost - tradedLeftovers cut from core/accepted.js; its helper trade leaned on a cut function
- Cancel trade on a trade that had gone through is put right: its leftovers come off again - tradedLeftovers cut from core/accepted.js; removeLeftovers cut from core/accepted.js; cancelledLeftovers cut from core/accepted.js; addLeftovers cut from core/accepted.js; ...
- TornExchange: every active trader is waited for longer than other calls (18 of 20 timed out at 30 s) - api/te.js not taken
- 3.16.2: a leftover you sold goes by itself ("binenta ko na to ah") - from your Ledger\'s sales - leftoversAfterSales cut from core/accepted.js; LEFTOVER_SALE_MARGIN_MS cut from core/accepted.js; its helper trade leaned on a cut function
- 3.16.2: the trade it was left over from, and units bought again since, never take a leftover off - leftoversAfterSales cut from core/accepted.js; LEFTOVER_SALE_MARGIN_MS cut from core/accepted.js; its helper trade leaned on a cut function

**traders.test.js**

- an item nobody buys has no rows; Online only keeps order and drops only who is offline - onlineOnly cut from core/traders.js
- item rows: the filter narrows by name; best price first; no trader last - itemRows cut from core/traders.js
- next TornW3B list: never read first, then stale lists of traders buying what you hold, then the rest - nextW3bTrader cut from core/traders.js; W3B_HELD_REFRESH_MS cut from core/traders.js; W3B_OTHER_REFRESH_MS cut from core/traders.js; W3B_MISSING_RECHECK_MS cut from core/traders.js; ...
- stats count traders, unread lists and the newest read - traderDbStats cut from core/traders.js
- two copies merge: nobody\'s traders are lost, and the newer list wins - mergeTraderDbs cut from core/traders.js
- TornW3B pages: every /pricelist/ link is a trader; names come from the link or "Name [id]" text - traderLinksIn cut from core/traders.js; traderNamesInText cut from core/traders.js
- TornExchange active traders keep their names as written, for our database - api/te.js not taken
- a failed first read is tried again in minutes, not a day, and still counts as unread - nextW3bTrader cut from core/traders.js; traderDbStats cut from core/traders.js; W3B_ERROR_RETRY_MS cut from core/traders.js
- a failed read in one tab never wipes the list another tab read - mergeTraderDbs cut from core/traders.js
- Refresh asks for a list again first, without hiding its prices meanwhile - nextW3bTrader cut from core/traders.js; markW3bDue cut from core/traders.js
- a trader known by name on TornExchange and by id on TornW3B is one row - traderIdsByName cut from core/traders.js
- a TornW3B page never renames a trader TornExchange or Torn named; only a real name is taken - traderLinksIn cut from core/traders.js
- old price lists are dropped from storage; the trader stays and is read again - nextW3bTrader cut from core/traders.js; pruneTraderDb cut from core/traders.js
- graph scale: one troll listing never sets the scale, with or without an average - ui/graph.js not taken
- the built-in TornW3B traders: real ids, no repeats, and they never rename a trader - nextW3bTrader cut from core/traders.js; traderDbStats cut from core/traders.js; core/seed-traders.js not taken
- TornExchange without a key: best_listing is sent with no key, and "no listings" is null - api/te.js not taken
- a rejected key says what TornExchange said, and what to do - api/te.js not taken
- below Min but profitable: marked in the second colour, never in the list; Cash still applies - core/ranker.js not taken
- trust reaches every row: votes from any item, ratings from our database - votesByTrader cut from core/traders.js
- best trader for you: most best-prices first, then most items bought - bestTradersFor cut from core/traders.js
- TornW3B ratings are read off its leaderboards - ratingsInText cut from core/traders.js
- Trusted buyers only keeps the Trusted badge, order unchanged - trustedOnly cut from core/traders.js
- a column header sorts its natural way first, then turns round - nextSort cut from core/traders.js
- item rows sort by any column; items nobody buys stay last - sortItemRows cut from core/traders.js
- a trader no source has named for 30 days, with no list in that time, is forgotten - pruneTraderDb cut from core/traders.js; TRADER_FORGET_MS cut from core/traders.js
- a trader kept before 3.12.5 (no seenAt) is dated from now, not forgotten at the first save (bug hunt, 3.12.10) - pruneTraderDb cut from core/traders.js; TRADER_FORGET_MS cut from core/traders.js
- a trader's whole TornExchange list: every item they buy, and it counts as their price - api/te.js not taken
- a trader TornExchange does not know is an empty list, never a failure asked again forever - api/te.js not taken
- a 401 from TornExchange never puts a key on the page - api/te.js not taken
- votes are remembered: a trader out of every top three keeps their badge for a week (the friend: buyers vanished) - rememberVotes cut from core/traders.js; rememberedVotes cut from core/traders.js; VOTES_KEEP_MS cut from core/traders.js; votesByTrader cut from core/traders.js
- hiddenBuyers: what Buyers online only / Trusted buyers only leave out, and why - onlineOnly cut from core/traders.js; hiddenBuyers cut from core/traders.js; trustedOnly cut from core/traders.js
- TornExchange lists read in turn (3.15): a trader 4th on TornExchange is a buyer too, for 6 hours - recordTeScan cut from core/traders.js; indexTeScanByItem cut from core/traders.js; TE_SCAN_MAX_AGE_MS cut from core/traders.js

**trades-board.test.js**

- asked: Chat or Trade on a plan is written down for an hour; asked again keeps the first time and takes the new numbers - core/trades-board.js not taken; tidyAsked cut from core/tidy.js
- the board: waiting for a yes, accepted and buying, accepted and ready - newest first, never a declined or an accepted one as waiting - core/trades-board.js not taken; acceptTrade cut from core/accepted.js; recordBuy cut from core/accepted.js
- ended: traded, cancelled and never made are kept a day, each trade once, with what went to To sell - core/trades-board.js not taken; acceptTrade cut from core/accepted.js; recordBuy cut from core/accepted.js; cancelledLeftovers cut from core/accepted.js; ...
- Fresh prices only: a TornW3B price from a list not changed in two days is stale - never one with a TornExchange price, never one whose date is not known - hiddenBuyers cut from core/traders.js
- an old list (3.22.3): over 24 hours to two days is aging, over two days is stale - the same prices Fresh prices only looks at, and no others - oldList cut from core/traders.js; PRICES_AGING_MS cut from core/traders.js
- how long ago a list was changed (3.22.3): in words, never shortened - hours for the first three days, then days - listAgeText cut from core/traders.js

**usage.test.js**

- Export API usage: one zip - the record, CSVs, state and a readme; no key, id or name (3.15) - ui/usage-view.js not taken

**w3b-budget.test.js**

- a $1 Dollar Sale in the summary does not make the feed re-read the item every tick - its helper minuteOfFeed leaned on a cut function
- the summary price moving still re-reads the item at once - bazaarDue cut from core/feed.js; emptyFeed cut from core/feed.js; setBazaarSnapshot cut from core/feed.js
- saving API calls (Item Market off) still watches bazaars, at 0 Torn API calls - its helper minuteOfFeed leaned on a cut function
- watching: either switch on is enough - feed/controller.js not taken
- Torn Bids first (3.20.5): while it is in use, the overlay takes only what the 60 of Torn Bids leave of the 80 - overlayPerMinute cut from api/w3b.js; W3B_BESIDE_BIDS_PER_MINUTE cut from api/w3b.js; W3B_BIDS_IN_USE_MS cut from api/w3b.js
- a client with a ceiling that moves: the overlay waits at 20 a minute while Torn Bids is in use, Torn Bids does not - overlayPerMinute cut from api/w3b.js; W3B_BESIDE_BIDS_PER_MINUTE cut from api/w3b.js

**zip-trades.test.js**

- the zip: every accepted trade in full - its lines, the bazaars, the unplanned buys and its units - core/trades-export.js not taken
- the zip: the last trades that ended, as they were - three, a week, each once - core/trades-export.js not taken
