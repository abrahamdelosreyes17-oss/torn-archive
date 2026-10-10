# Torn's own pages, as read on real Torn

Read in the owner's Chrome, nothing pressed. Each section says when.

## The museum (`museum.php`), read 2026-10-10

```
div.museum
  div#tabs.boxes-sets-wrapper.ui-tabs
    ul.boxes ...                         the twelve set tiles (jQuery UI tabs)
    div.cont-gray.bottom-round.collections-wrapper
      div#plushie.ui-tabs-panel          one panel per set: #plushie, #flower, #meteorite, ...
        div.set-description
          div.description.left           "To exchange a <b>Plushie set</b> for <b>10 points</b>, you require the following..."
          div.actions-wrapper.right
            div.input-money-group.no-max-value
              input.input.sets-amount.input-money[type=tel][placeholder="Number of sets"]
              input.input.sets-amount.input-money[type=hidden]      the twin
            button.torn-btn.exchange-btn                             "EXCHANGE"
        div.clear
        div.set-elements.bottom-round
          div.item-wrapper.content-divider[itemid="258"]             one per piece, 13 for plushies (18 children with fillers)
            div.item-cont-wrap > div.click-area.c-pointer
              div.coll-item-header.t-overflow                        "Jaguar Plushie"
              div.img-wrapper                                        ".placeholder-m" when you hold none
                span.item-plate > img.torn-item.large                src /images/items/258/large.png; "blank" when none
              div.item-amount ...                                    how many you hold
```

- With no full set the box is `disabled` and `readonly` and the button is `disabled`.
- Only the panel of the tab in view is shown; the others are in the page, hidden.
- A piece you hold none of has a blank picture, so a tile is found by `[itemid]`, not by its picture.
- Heading: `div.content-title h4#skip-to-content` "Museum"; links to `points.php` and `pmarket.php`.

## The points market (`pmarket.php`) - NOT read

2026-10-10: the tab opened for it ended on Torn's attack page (`page.php?sid=attack&user2ID=...`, target in
hospital, nothing pressed, tab closed at once). Not opened again until the owner says what sent it there.

## A trade, a bazaar

Read for Torn Bids on 2026-09-27 (`src/sources/dom/trade.js`, `detect.js`, `scan.js`, `test/fixture.html`).

## A forum thread - not read

The title comes from Torn's API (`v2/forum/{threadId}/thread`, Public key), so the page is needed only for a mark.
