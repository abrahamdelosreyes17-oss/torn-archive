# Torn Archive

Museum sets and points for [Torn](https://www.torn.com): which plushies and flowers to buy and where, what your
open trades hold, when to swap sets at the museum, and what the points earned you once they are sold.

It is a Tampermonkey userscript with a page of its own (the hub) and a small box on a few of Torn's pages.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open [torn-archive.user.js](https://raw.githubusercontent.com/abrahamdelosreyes17-oss/torn-archive/main/torn-archive.user.js) and press Install.
3. Open the hub: <https://abrahamdelosreyes17-oss.github.io/torn-archive/> (also in Tampermonkey's menu: "Open Torn Archive").
4. In Settings, paste your keys. Only you paste them; nothing fills them in for you.

Keep the hub open in one tab. It is the only tab that reads anything, and it goes on reading while you are on
Torn, so a new trade is noticed. Torn's own tabs ask nothing: they show what the hub worked out.

## The keys

| Key | Needed for | Sent to |
| --- | --- | --- |
| Torn, Limited access | items and their market value, your inventory, your money and points, the points market, your open trades, a seller's bazaar, the Item Market | `api.torn.com` only |
| Torn, Full access (optional) | your log: what you bought, swapped, sold and what a mug took, so profit is counted and not guessed | `api.torn.com` only, and only for key info, your log and your trades |
| The key you registered on TornW3B (optional) | your own price list on TornW3B and your receipts | `weav3r.dev` only, in a request header, never in an address |

Without the Full key the hub still works; costs are then taken at market value where no buy is on record.

## What it does with your key and your data

| | |
| --- | --- |
| Data storage | In Tampermonkey's storage on your computer only. |
| Data sharing | None, unless you switch Torn Shared Server on (below). TornW3B is asked for public prices by item id; your own price list and receipts are sent to TornW3B only when you set its key. |
| Purpose of use | Working out your sets, your trades and your points profit, for you. |
| Key storage and sharing | Stored in Tampermonkey's storage on your computer. Never shared, never written to a log or a report. |
| Key access level | Limited; Full is optional (your log). |

The page at `abrahamdelosreyes17-oss.github.io/torn-archive/` is an empty page: the script draws the hub there, in
your browser. Nothing is sent to that site.

## What it never does

- It never presses anything of Torn's. Not Buy, not EXCHANGE, not ADD LISTING, not Change or Accept, not a post.
- **Fill** types a number into one of Torn's own boxes, on the page you are looking at, only when you press Fill.
  You press Torn's button yourself.
- **Fill all**, on a bazaar, is one press of yours: from then on, on that page only, each listing's number is typed
  into its own quantity box - the ones open now, and each other one as you open it or scroll to it. It never
  scrolls for you, never opens a box and never presses Buy; a second press puts back what was there. Typing a
  number sends nothing to Torn.
- **Copy** puts text on your clipboard. You paste and send it.
- A link opens one page, on your press.
- Torn's pages are read as they are in front of you. No page is loaded in the background, and nothing is asked of
  Torn outside its API.
- Requests stay under Torn's limit (85 a minute at most, of the 100 Torn allows) and under TornW3B's limits (its full
  listing of an item: 9 a minute and 38 an hour at most).
- TornW3B is asked from your own browser only.

## Torn Trading

Torn Archive runs beside Torn Trading (Torn Bids), and the two share the limits: Torn counts requests per player
and TornW3B per address, whichever script asks. The one whose page you look at asks more, the other less; on any
other page the one you looked at last keeps the larger share.

| | Torn a minute | TornW3B a minute |
|---|---|---|
| Torn Archive alone | 85 | 80 |
| Both on, you look at Torn Archive | 70 | 65 |
| Both on, you look at Torn Trading | 12 | 8 |

Going down is done at once. Going up waits a minute, so what the other asked in the minute before has left Torn's
count. Torn Archive takes the larger share only from a Torn Trading that says it keeps to less; a release of Torn
Trading that does not say so keeps its whole limit, and beside it Torn Archive stays at 12 and 8 whichever page you
look at. How the two tell each other is written at the top of `src/core/turns.js`.

`tornapps.archive` in the same page storage says Torn Archive's page is open (every 30 s, in view or not), so Torn
Trading knows the app it makes room for is still there.

TornW3B allows 10 full listings of an item a minute and 1,000 a day for one address. Each app writes its own
requests of that kind there too (`tornapps.w3b.archive`, `tornapps.w3b.trading`) and counts the other's with its
own before it asks, so the two together stay under that limit.

## Torn Shared Server

Off until you save two things in Settings: the server's address (`https://….workers.dev`) and your password for it.
It is the same server Torn Trading uses, with the same password. With nothing saved, nothing is sent.

| | |
| --- | --- |
| What it is told | The bazaars that sell a piece and the ones your shopping list names, what each of the 24 pieces is worth to you, a bazaar buy of a piece (bazaar, piece, count, price, time) so the others stop being sent to a shelf you emptied, when you last read a piece's listing on TornW3B, which pieces are still on your list to buy (their numbers, not how many), and how many Torn requests you used in the last minute. |
| What it is never told | A key. How many of anything you hold, your money, your trades, your prices, your profit. Any item that is not a plushie or a flower. |
| What it gives | Bazaars as Torn itself shows them, read with a key of each of you: a price there is under a minute old, where TornW3B's can be hours old. Torn Archive then leaves those bazaars to the server and does not read them itself. Also the points market (once a minute) and the Item Market's cheapest rows of each piece (every minute for a piece still to buy, every ten for the rest): while the server's read is fresh, Torn Archive does not ask Torn for them. |
| Your Torn limit | The server reads with your key too, so its part of your 100 a minute is left to it: Torn Archive and Torn Trading together plus the server stay under 80. |
| Your password | Kept in Tampermonkey's storage like a key. It goes to that one address in a header, is never shown again, and is in no log and no report. |

Before anything is told to it, the server is asked what it is. One that keeps a single list a person (the first
version) is never synced with: a sync from Torn Archive would overwrite what Torn Trading told it. Settings then
says the server has to be updated first.

## On Torn's pages

| Page | The box says | Marks |
| --- | --- | --- |
| Someone's bazaar, the Item Market | what is on your list here, what else is under its worth, the next stop of your run | on each set piece: on your list, need, ahead |
| A trade | your price for each row, the total, what it leaves you, the money to take out of the vault | beside each of their items |
| The museum | full sets, what they cost you, what they are worth at today's points price | on each piece: held, need |
| The points market | the price and lot to list, or to hold when points are cheap or it would be a loss | none |
| Your buying thread | whether its title still says what your shop says | beside the title |

On every other Torn page the box shows your sets and what to do next.

The box sits beside Torn's content, in the same column and width as Torn Trading's panel, and never over Torn's
own content. Drag it by its head to the right or the left side; it stays where you let go. Its fold button folds it
to a bar, and so does the backtick key on a page where Torn Trading's panel is not (there the key is Torn
Trading's). Folding is remembered for the pages it has something to say on and for the rest, each on its own.
Where the window has no room for it, it is a small pill you open yourself.

## The report

Settings has a button that saves a zip: the problem log, the request counts, the speed log, your settings and
what was read and worked out. No key is in it. It is saved to your computer; nothing is uploaded.

## Development

```
npm run build     # src/ -> dist/torn-archive.user.js and torn-archive.user.js
npm test          # node --test
npm run check     # build, syntax check of the bundle, tests
node test/harness/serve.mjs 8781
```

The harness pages run on made-up numbers and ask nothing of Torn:

- `test/harness/hub.html`: the hub on a made-up desk (`?empty=1 ?nokey=1 ?paused=1 ?closed=1 ?fell=400 ?one=1 ?w3b=match|differ|error`).
- `test/harness/torn.html`: the box and marks on stand-in Torn pages (`?page=bazaar|trade|museum|pmarket|forum`).

`build.mjs` joins the modules into one scope, so a top-level name may exist once in all of `src/`. Private
helpers carry their file's prefix. `SOURCES.md` lists where the plumbing came from.
