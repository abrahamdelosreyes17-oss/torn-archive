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
| Data sharing | None, unless Torn Shared Server serves your PC (below). TornW3B is asked for public prices by item id; your own price list and receipts are sent to TornW3B only when you set its key. |
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
  opens a box and never presses Buy; a second press puts back what was there. Typing a number sends nothing to
  Torn. After Fill or Fill all the listings still to buy pulse (a ring around the listing, nothing over it).
- **After a buy of yours** the page is brought to the next listing of your list on it, when that one is out of
  view. Nothing is pressed.
- **Three keys**, on a bazaar or the Item Market, only while something of your list is to buy on that page and
  never while you type in a box: Up = Fill all, Down = the next listing to buy (each press the one after), Right
  = Next (N as before). Up and Down do not scroll Torn's page then; with nothing of yours to buy there they are
  Torn's keys as ever.
- Opened from a link of Torn Archive's that names a listing (the hub's "Sold by", a stop of your run), the page is
  brought to that listing once, when it is on the page, and it pulses until you press anything.
- **Your stock** stands on its own on the other side of Torn's page while you are on a bazaar or the Item Market,
  where that side has room: each piece, what you hold now and what the set needs, moving as you buy - orange
  while you still need more, green with exactly enough, red with too many. A piece also turns red when the number
  in its open Buy box is more than you need. Torn's box is never changed for you. Its **Read** (and "Read my
  stock" on the Stock page) asks Torn for your plushies, your flowers and your log, and nothing else, ahead of
  every other read. Torn itself counts your items once an hour a category: the page says when it last did.
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

Nothing to set up, and no box to fill in. It is the same server Torn Trading uses, and it serves only the people
its owner added. Torn Archive asks that one server (a `workers.dev` address, built into the script) whether this PC
is one of theirs, and says your Torn id for it - never a key. The server says yes only for a person it reads with
a key of, and only from the address where that person's Torn Trading checked in within the last week. Anyone else
is answered as if nothing were there, is told nothing and tells nothing: Settings then says "working alone", and
Torn Archive asks again by itself (after 5 minutes, 15, an hour, then every 6 hours; at once when Torn Trading
comes on beside it).

Why it matters: the server reads with your key, and Torn counts your key's requests and your apps' together. Told
what Torn Archive uses, the server takes less; a Torn Archive it has not heard from can push the two past Torn's
100 a minute.

| | |
| --- | --- |
| What it is told | The bazaars that sell a piece and the ones your shopping list names, what each of the 24 pieces is worth to you, a bazaar buy of a piece (bazaar, piece, count, price, time) so the others stop being sent to a shelf you emptied, when you last read a piece's listing on TornW3B, which pieces are still on your list to buy (their numbers, not how many), and how many Torn requests you used in the last minute. |
| What it is never told | A key. How many of anything you hold, your money, your trades, your prices, your profit. Any item that is not a plushie or a flower. |
| What it gives | Bazaars as Torn itself shows them, read with a key of each of you: a price there is under a minute old, where TornW3B's can be hours old. Torn Archive then leaves those bazaars to the server and does not read them itself. Also the points market (once a minute) and the Item Market's cheapest rows of each piece (every minute for a piece still to buy, every ten for the rest): while the server's read is fresh, Torn Archive does not ask Torn for them. |
| Your Torn limit | The server reads with your key too, so its part of your 100 a minute is left to it: Torn Archive and Torn Trading together plus the server stay under 80. |
| Its address | Built in, never shown on the page, in no log and no report. An address and password typed into an older copy are still used, and can be forgotten in Settings. |

Before anything is told to it, the server is asked what it is. One that keeps a single list a person (the first
version) is never synced with: a sync from Torn Archive would overwrite what Torn Trading told it. Settings then
says the server has to be updated first.

## What counts as a buy

A buy is never counted at the press of Torn's Buy. It is counted when Torn's page shows the sale: the listing
back with less stock (at most the number you typed), or gone once Torn's own step is over. A listing back with
the same stock is nothing, and a step of Torn's the script does not know is nothing either (its shape is written
to the problem log, no numbers).

With a Full access key **Torn's log is the judge**. A buy a page told of is shown at once; the log is asked a few
seconds after, and again; a buy the log - read a minute past it - does not have is taken back everywhere (your
stock, the run, the list's line, the seller's listing) and said once: "Not a buy after all: taken back". Without
a Full key a buy whose listing still stands on Torn is counted at the next read of your items.

A listing that is gone from a bazaar you are on, one with less stock than your list has, and a bazaar with no
listing at all leave your list by themselves; a line that is only not on the page as it stands (Torn draws the
listings near the screen) has a small **Gone** button.

## Buying by the whole set

A listing is judged on the set it would finish, in dollars a point - not on the piece alone. A piece's own share
of the set (by market value, your least profit taken off) is the guide: under it, a unit is always worth buying.
Over it, a unit is

- **Buy** while the rest of that set has room for it: what its other pieces are under their own share by (the
  ones you hold at what they cost you, the ones to buy at their cheapest listing). The set still pays, with your
  least profit, at the lower of two points prices: today's, and the one you usually sell points for (your own
  sales of the last two weeks; with none, the middle of the market's usual range).
- **Stretch** when the set pays only at the higher of the two. A list takes a Stretch only when it finishes a set
  no Buy listing finishes, and says the points price it needs.
- **No thanks** over even that.

No money figure is typed anywhere for this. The Buy page says the list's total once, beside what you have on
hand, and what the list does to a set's cost a point; the Points page has the break-even on one bar: what a
point you hold cost you against the price now, red with "Selling now loses $..." when the price is under it.

The hub works on a shortlist a piece (the cheapest listings that count, a few times what you need); the whole
pile stays in storage, and "Sold by" says once how many more there are. The list made from the shortlists is
the list the whole pile makes.

## What you pay your sellers

You type two things: your rate - the most you pay, as a percent of market value - and your least profit. The
rest is worked out.

- **Each set has a ceiling**: the most that still leaves your least profit when its points are sold - ten points'
  worth, your least profit taken off, against the market value of its pieces. It is counted at the same cautious
  points price as the Buy line above (the lower of today's and the one you usually sell for). The points market
  takes no fee, so none is taken off.
- **A set is paid the lower of your rate and its ceiling**, plushies and flowers each their own. That is the
  price in a trade and its message, on your TornW3B list, in "cheaper than you pay your sellers", and in the
  number of sets your cash covers.
- **Fixed for an hour while your shop is open.** The whole price table is fixed, kept through a reload, and not
  worked out again until the hour is over. Your TornW3B list is written right after a fix, if it differs - so at
  most once an hour by itself; your own press sends at any time. Changing your rate, your least profit or which
  sets you trade fixes at once.
- **The one thing that moves it inside the hour**: the points price falling so far that a set would no longer
  leave your least profit. That set comes down to its ceiling at once, the list is written, and the log, the
  Prices page and an open trade say so. Nothing goes up before the hour ends.
- **A trade with set pieces open holds the table** past its hour, so the receipt TornW3B makes from your list
  matches what you paid. Only the fall above still applies.
- **Shop closed**: nothing is fixed; the Prices page shows what you would pay if you opened now, and the set
  pieces come off your TornW3B list.

The Prices page has one line a set: its rate and why it is not your own, what a set costs and leaves, the
ceiling, and what the other buyers pay for the whole set - from their prices read in the last 24 hours, with the
age said from an hour on. When the piece you are shortest of has a buyer over your ceiling, the line names it;
you are not made to pay over the ceiling for it. Your forum text keeps your rate; when a set is paid less today,
the page and the box on your thread say so.

## The Ledger

- Profit that rests on a cost nobody saw you pay (a piece you held before the count began) says **about**.
- **Not sold yet** stands at its cost and at what it is worth today, with the difference.
- A piece sold as itself - on your bazaar, the Item Market, or in a trade - is its own profit or loss line
  ("Pieces sold"); one given away is shown with its cost and counts for nothing.
- Points you held before the book began, sold: shown as "held before, not counted", so the totals add up to what
  you received.
- A trade with other things in it: a set piece's price is its share of the trade's money by market value.

## Trades, receipts and the list

- **Open trades** are read again every minute, each one in full. Torn's own "changed at" time for a trade does not
  move when items are put into it, so nothing else would notice a trade that was opened empty and filled a minute
  later. When set pieces first show in a trade you are told once.
- **A receipt** is made on TornW3B by itself when a trade ends, from your price list there - once every piece of the
  trade is priced on that list, up to three tries five minutes apart, for a trade that ended in the last six hours.
  A trade with a piece your TornW3B list does not price says so beside its button.
- **Your log** is asked for a few kinds of row at a time (eight at most a request). The log line "Your log, read
  through" says how many rows of each sort came in.
- **"From my cash and stock"**: the number of sets is worked out from your money and what you hold. While a shopping
  list is on hand that number is kept as it was when the list was made, whatever your money does; it is worked out
  again when you make the list again, when it is empty, or when you change a setting it rests on.

## On Torn's pages

| Page | The box says | Marks |
| --- | --- | --- |
| Someone's bazaar, the Item Market | what is on your list here, what else is under its worth, the next stop of your run. Start, Next and Stop show in the box at once; when the hub has not taken a press after a few seconds the box says so. Next works from wherever you stand: on a bazaar of your list that is not the run's stop it goes on from there, and the stops passed over stay on the list | on each set piece: on your list, need, ahead |
| A trade | your price for each row, the total, what it leaves you, the money to take out of the vault | beside each of their items |
| The museum | full sets, what they cost you, what they are worth at today's points price | on each piece: held, need; beside EXCHANGE, when you type more sets than you hold |
| The points market | the price and lot to list, or to hold when points are cheap or it would be a loss; and for the price you type into Torn's box: how many points sell before yours, and whether it is a loss, cheap, or more under the lowest than it takes | beside ADD LISTING: the same, in a line; in Torn's list: a hairline on the edge between two rows where your listing would sit, and one above which a price is cheap or a loss (no words on them: the box says which is which) |
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

Every fixing of your prices is in the problem log - each set's rate and ceiling, the points price counted, the
hour - and so is a fall inside the hour and a trade holding them. Every write of your own price list to TornW3B
is there too: whether it was your press or "Keep it at my rate by itself", how many prices were set and taken
off, and what TornW3B answered. With your shop closed the line says so. When TornW3B refuses a write,
the log has its words, the request's shape and what was sent (item ids and prices - your public list; never the
key). With the switch on and nothing sent, the log says why, once each time the reason changes. A request
TornW3B calls wrong is not sent by itself again until your prices change; your own press still sends it.

## Development

```
npm run build     # src/ -> dist/torn-archive.user.js and torn-archive.user.js
npm test          # node --test
npm run check     # build, syntax check of the bundle, tests
node test/harness/serve.mjs 8781
```

The harness pages run on made-up numbers and ask nothing of Torn:

- `test/harness/hub.html`: the hub on a made-up desk (`?empty=1 ?nokey=1 ?paused=1 ?closed=1 ?fell=400 ?one=1 ?w3b=match|differ|error ?list=1 ?run=1 ?back=1 ?w3bkey=refused`).
- `test/harness/torn.html`: the box and marks on stand-in Torn pages (`?page=bazaar|trade|museum|pmarket|forum|other`; a bazaar takes `&run=1 &away=1 &step=1 &empty=1 &im=1`). Never press Next or Start there: they are links to Torn.
- `test/harness/measure.js`: the pages measured, not looked at. In the page's console,
  `(await import('/test/harness/measure.js')).measureHub(document, window)` walks every page and tab of the hub
  and names each text that is cut off, shortened with dots, covered, over other words, off the window or broken
  a letter a line, and every Stock tile that does not hold its three lines; `measureBox(document, window)` does
  the same for the box on a stand-in Torn page. Each answer says how many texts it measured: a clean answer that
  measured next to nothing is no answer (a tab out of view runs no animation; `settle()` ends them first).

`build.mjs` joins the modules into one scope, so a top-level name may exist once in all of `src/`. Private
helpers carry their file's prefix. `SOURCES.md` lists where the plumbing came from.
