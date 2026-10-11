// A listing on a bazaar or the Item Market, past the card that names it: the whole tile Torn draws for it, and
// the box you type how many into.
//
// The card the scan finds (detect.js) is the part with the picture, the name, the price and the stock. Torn puts
// the buy controls beside it in the same tile, not inside it: the quantity box and Buy come with the tile's buy
// menu, once you open it. So what you press, and where a number is typed, is looked for in the tile.
//
//
// SEEN on the owner's own page, 2026-10-11 (a bazaar): the tile is div.item___; closed, it holds the card
// (div.itemDescription___: picture, a "Buy: <name>" button, name, price, stock). OPEN, the card is NOT on the
// page: the tile holds only div.buyMenu___ - the name, the price, "(890 in stock)", input.buyAmountInput___ and
// the Buy button. So an open listing has no picture, and a scan by pictures does not find it. 1.2.0 and 1.2.1
// took that for "the listing is gone after your press: you bought it", and Fill all never found the box.
//
// Nothing here presses or types anything: it only finds.

import { ITEM_IMAGE_SELECTOR } from './detect.js';

/** Torn's own name for one listing's tile on a bazaar (as its lock mark is found, scan.js isLockedCard). */
const TILE_SELECTOR = '[class*="item___"]';
/** A quantity box by its look, as Torn Trading finds a bazaar card's (main.js buyQtyInput). */
const QTY_SELECTOR = 'input[type="number"], input[name*="quant" i], input[placeholder*="quant" i], input[placeholder*="qty" i], input[class*="amount" i], input[class*="quant" i]';
const TYPING_SELECTOR = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="search"]):not([type="button"]):not([type="submit"])';
const BB_CLIMB = 4;
/** A tile is never this many times its card: past that it is the list, not one listing. */
const BB_AREA = 4;

const bbImages = (el) => { try { return el.querySelectorAll(ITEM_IMAGE_SELECTOR).length; } catch { return 0; } };
const bbArea = (el) => { const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null; return r ? r.width * r.height : 0; };

/**
 * The tile around a listing's card: the largest element that still holds this one listing and nothing else.
 * The card itself when nothing larger is found.
 */
export function listingTile(card) {
    if (!card || !card.closest) return card || null;
    const named = card.closest(TILE_SELECTOR);
    if (named && bbImages(named) === 1) return named;
    const own = bbArea(card);
    let best = card;
    let node = card.parentElement;
    for (let depth = 0; depth < BB_CLIMB && node && node !== card.ownerDocument.body; depth += 1) {
        if (bbImages(node) !== 1) break;
        if (own > 0 && bbArea(node) > own * BB_AREA) break;
        best = node;
        node = node.parentElement;
    }
    return best;
}

const bbShown = (input) => !input.disabled && !input.readOnly && input.getClientRects().length > 0 && !input.closest('#tarc-host');

/** The tile's quantity box, when it is on the page and can be typed in (Torn shows it once the buy menu is open). */
export function buyBox(tile) {
    if (!tile || !tile.querySelectorAll) return null;
    return [...tile.querySelectorAll(QTY_SELECTOR)].find(bbShown) || [...tile.querySelectorAll(TYPING_SELECTOR)].find(bbShown) || null;
}

/** Torn's buy form for one listing, while it is open. */
const MENU_SELECTOR = '[class*="buyMenu"]';
const bbDigits = (s) => Number(String(s == null ? '' : s).replace(/[^\d]/g, '')) || 0;

/**
 * The buy forms open on the page: [{ el, tile, name, price, qty, input }]. The form stands where the listing's card
 * was and says the same three things - the name, the price and how many are in stock (0 when it does not say).
 */
export function openBuyMenus(root) {
    const out = [];
    if (!root || !root.querySelectorAll) return out;
    for (const el of root.querySelectorAll(MENU_SELECTOR)) {
        if (el.closest('#tarc-host') || !el.getClientRects().length || out.some((m) => m.el.contains(el))) continue;
        const text = String(el.textContent || '').replace(/\s+/g, ' ');
        const named = el.querySelector('[class*="name"]');
        const name = String(named ? named.textContent : text.split('$')[0]).replace(/\s+/g, ' ').trim();
        const price = bbDigits((text.match(/\$\s?[\d,]+/) || [])[0]);
        const qty = bbDigits((text.match(/([\d,]+)\s+in stock/i) || [])[1]);
        if (!name || !price) continue;
        out.push({ el, tile: el.closest(TILE_SELECTOR) || el, name, price, qty, input: buyBox(el) });
    }
    return out;
}

/** Is this tile still a listing on the page - its card, or its buy form in the card's place? */
export function tileHolds(tile) {
    return Boolean(tile && tile.isConnected && (bbImages(tile) > 0 || tile.querySelector(MENU_SELECTOR)));
}
