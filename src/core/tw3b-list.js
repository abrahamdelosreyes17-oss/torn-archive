// Your price list on TornW3B, and its receipts.
// Sellers find a buyer on TornW3B by its price list, and a buyer stays on TornW3B's lists only with a receipt in
// the last 7 days. So the Archive keeps your 24 pieces on your list at your rate, and makes a receipt per trade.
// "Closed" = the pieces are taken off your list. TornW3B's own Open / Closed button is on its website and stays
// yours. Pure working-out: what to send, and what came back. Sending is src/api/tw3b-own.js.

const twNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const twWhole = (v) => Math.max(0, Math.floor(twNum(v)));

/** A finished trade is owed its receipt this long (TornW3B lets a receipt be put right for 6 hours). */
export const RECEIPT_OWED_MS = 6 * 3600000;

/**
 * What your list should say: every piece of the sets you trade at a fixed price, or nothing when closed.
 * A piece you hold more of than your sets need (`ahead`: over your target) is not on it - the owner, 2026-10-12:
 * "i have something overstocked, when i send my pricelist over to tornw3b, it shouldnt include ones that are
 * overstocked". It comes back by itself when your stock no longer has too many.
 * @param keep ids that stay on whatever you hold: the pieces of a trade that just ended and has no receipt yet
 *             (TornW3B makes a receipt from this list - the trade itself is what made you hold too many)
 */
export function desiredList(pieces, open, keep = null) {
    if (!open) return [];
    return (pieces || []).filter((p) => p.pay > 0 && (!(p.ahead > 0) || (keep && keep.has(String(p.id))))).map((p) => ({ itemID: Number(p.id), price: twWhole(p.pay) }));
}

/** The pieces of finished trades still owed a receipt: [{ id, t, rows }] and the receipts kept (a Map by trade id). */
export function owedPieces(finished, receipts, now) {
    const out = new Set();
    for (const f of finished || []) {
        if (!(now - f.t < RECEIPT_OWED_MS) || (receipts && receipts.has(String(f.id)))) continue;
        for (const r of f.rows || []) out.add(String(r.id));
    }
    return out;
}

/**
 * Your list as TornW3B has it: itemId -> { type, value }.
 * `GET /api/pricelist/{userID}` answers a row per item, `{ itemId, name, buyPrice, bulkThreshold, bulkBuyPrice }`:
 * `buyPrice` is what the row pays in dollars now, however it is priced there (fixed, or a share of the market),
 * and 0 on an item with no price. Such a row is read as type 'pays'. (Until 1.3.2 only the documentation's
 * `pricingValue` was looked for, so a list with 24 prices on it read as empty: "24 prices differ" for good, no
 * receipt by itself, and a price changed on TornW3B's own page never noticed.) Rows with an id under 1 are
 * TornW3B's own whole sets: not pieces, left alone.
 */
export function parseOwnList(json) {
    const raw = json && (json.items || json.pricelist || json.priceList || json.data || json);
    const out = new Map();
    const rows = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.values(raw) : [];
    for (const r of rows) {
        if (!r || typeof r !== 'object') continue;
        const id = twWhole(r.itemID ?? r.itemId ?? r.item_id ?? r.id);
        if (!id) continue;
        const pays = r.buyPrice ?? r.buy_price;
        if (pays != null && pays !== '') {
            if (twNum(pays) > 0) out.set(String(id), { type: 'pays', value: twNum(pays) });
            continue;
        }
        const value = r.pricingValue ?? r.pricing_value ?? r.price ?? r.value;
        if (value == null || value === '') continue;
        out.set(String(id), { type: String(r.pricingType ?? r.pricing_type ?? 'fixed'), value: twNum(value) });
    }
    return out;
}

/**
 * What differs between TornW3B's list and yours. Only the Archive's own pieces are ever touched: `ids` are the 24
 * (or the sets you trade); anything else on your list is left exactly as it is.
 * @param current parseOwnList()
 * @param desired desiredList()
 * @param ids     every piece id the Archive may put on or take off
 * @param all     every price of yours is set again, also one that already reads the same (a write that turns
 *                something on for the whole list)
 * @returns { set: [{ itemID, price, was }], remove: [{ itemID, was }], same }
 */
export function listDiff(current, desired, ids, { all = false } = {}) {
    const want = new Map((desired || []).map((d) => [String(d.itemID), d.price]));
    const set = [];
    const remove = [];
    let same = 0;
    for (const id of (ids || []).map(String)) {
        const cur = current && current.get(id);
        const price = want.get(id);
        if (price == null) { if (cur) remove.push({ itemID: Number(id), was: cur.value }); continue; }
        // 'pays': the dollars the row pays now. A row priced as a share of the market that pays the same today
        // reads the same - and differs, and is set fixed again, as soon as the market moves.
        if (!all && cur && (cur.type === 'fixed' || cur.type === 'pays') && cur.value === price) same += 1;
        else set.push({ itemID: Number(id), price, was: cur ? cur.value : null });
    }
    return { set, remove, same };
}

export const listMatches = (diff) => !diff.set.length && !diff.remove.length;

/**
 * The body of `PUT /api/pricelist/{userID}`. An item sent with no price is taken off the list.
 * @param inflation TornW3B's inflation protection on each price set (the owner, 2026-10-12: "also enable market
 *                  inflation in tornw3b")
 */
export function putBody(diff, { inflation = true } = {}) {
    return {
        items: [
            ...diff.set.map((s) => ({ itemID: s.itemID, pricingType: 'fixed', pricingValue: s.price, inflationProtectionEnabled: !!inflation, roundToPlace: 0, bulkType: 'none' })),
            ...diff.remove.map((r) => ({ itemID: r.itemID })),
        ],
    };
}

/** Units by piece, in the order first met: [[id, qty]]. `ids`: only these count. */
function twUnits(rows, ids = null) {
    const only = ids ? new Set([...ids].map(Number)) : null;
    const by = new Map();
    for (const r of rows || []) {
        const id = Number(r.id);
        if (twWhole(r.qty) && (!only || only.has(id))) by.set(id, (by.get(id) || 0) + twWhole(r.qty));
    }
    return [...by];
}

/**
 * The receipt request is known from TornW3B's documentation only, and on 2026-10-12 TornW3B called the one sent
 * until 1.3.2 wrong (400 "Invalid request body": the trade's number as text, the seller's as a number). Which
 * part it minds is not known, so the request has three forms, tried in this order until one is taken; the one
 * taken is remembered (engine makeReceipt) and goes first from then on.
 *   0  every number as a number
 *   1  the items and the trade's number only
 *   2  as 1, the trade's number as text
 */
export const RECEIPT_FORMS = 3;

/**
 * The body of `POST /api/pricelist/{userID}`: a receipt for one trade, from your list.
 * @param rows [{ id, qty }] the set pieces of the trade
 * @param form which of RECEIPT_FORMS
 */
export function receiptBody(tradeId, rows, sellerId, form = 0) {
    const items = twUnits(rows).map(([itemID, quantity]) => ({ itemID, quantity }));
    const digits = String(tradeId).split('').every((c) => c >= '0' && c <= '9') && String(tradeId) !== '';
    const num = digits ? Number(tradeId) : String(tradeId);
    if (form === 2) return { items, tradeID: String(tradeId) };
    if (form === 1) return { items, tradeID: num };
    return { items, tradeID: num, ...(sellerId ? { buyerPlayerId: Number(sellerId) } : {}), includeMessage: true };
}

const TW_LIST_AT = 'https://weav3r.dev/pricelist/';
/** Your price list's page on TornW3B: the link your forum post carries. '' while your Torn id is not known. */
export const listLink = (userId) => (Number(userId) > 0 ? TW_LIST_AT + encodeURIComponent(String(userId)) : '');

const TW_RECEIPT_AT = 'https://weav3r.dev/receipt/';
/** The page of one receipt on TornW3B: the link you send the seller. */
export const receiptLink = (id) => (id == null || id === '' ? '' : TW_RECEIPT_AT + encodeURIComponent(String(id)));
/** The receipt's id, out of its link. */
export function receiptIdOf(url) {
    const at = String(url || '').indexOf('/receipt/');
    if (at < 0) return null;
    const id = String(url).slice(at + 9).split('/')[0].split('?')[0].split('#')[0];
    return id ? decodeURIComponent(id) : null;
}
const twUrl = (json) => (json && (json.receiptURL || json.receiptUrl || json.receipt_url)) || '';

/**
 * TornW3B's receipt set against the Archive's own sum for the same trade.
 * @param json  the POST's answer
 * @param total what the Archive worked out
 * @returns { ok, total, url, message, missing: [names], differs } - ok = same total and nothing missing
 */
export function readReceipt(json, total) {
    const rec = (json && json.receipt) || {};
    const theirs = twNum(rec.total_value ?? rec.totalValue);
    const w = (json && json.warnings) || {};
    const missing = [...(w.notFound || []), ...(w.notPriced || [])].map((x) => (typeof x === 'string' ? x : String((x && (x.name || x.itemID || x.id)) || '')));
    return {
        ok: theirs > 0 && theirs === twWhole(total) && !missing.length,
        total: theirs,
        url: twUrl(json) || receiptLink(rec.id),
        message: (json && json.message) || '',
        missing,
        differs: theirs - twWhole(total),
        id: rec.id ?? receiptIdOf(twUrl(json)),
    };
}

/**
 * One receipt as TornW3B has it (`GET /api/trades/{userID}/{receiptId}`).
 * @returns { id, tid, total, at, rows: [{ id, qty }], url } - `tid`: the trade number it was made with ('' when
 *          it was made with none: TornW3B's own form does not ask for one); null when it has no id
 */
export function receiptOf(r, now = 0) {
    if (!r || r.id == null) return null;
    const tid = r.trade_id ?? r.tradeId ?? r.tradeID;
    const made = r.created_at ?? r.createdAt;
    const secs = twNum(made);
    const at = (typeof made === 'string' && Date.parse(made)) || (secs > 0 ? (secs < 1e11 ? secs * 1000 : secs) : 0) || now;
    const rows = (Array.isArray(r.items) ? r.items : []).map((x) => ({ id: twWhole(x && (x.item_id ?? x.itemId ?? x.itemID ?? x.id)), qty: twWhole(x && x.quantity) })).filter((x) => x.id && x.qty);
    return { id: r.id, tid: tid == null || tid === '' || tid === 0 || tid === '0' ? '' : String(tid), total: twNum(r.total_value ?? r.totalValue ?? r.value), at, rows, url: twUrl(r) || receiptLink(r.id) };
}

/**
 * The receipts kept ([[key, receipt]]: the key is the finished trade's id once a trade holds it) with one read
 * from TornW3B put in. The same receipt is one entry: by its id, or - made here, when TornW3B's answer named no
 * id - by the trade it was made for. A link kept is never lost to a read that has none.
 */
export function receiptsWith(list, rec) {
    const old = (list || []).find(([key, x]) => (x.id != null && String(x.id) === String(rec.id)) || (x.id == null && !!rec.tid && key === rec.tid));
    const key = old ? old[0] : rec.tid || 'r:' + rec.id;
    const next = { ...(old ? old[1] : {}), ...rec, url: (old && old[1].url) || rec.url || receiptLink(rec.id) };
    return [...(list || []).filter((e) => e[0] !== key && e !== old), [key, next]];
}

/** How far a receipt may be from its trade's end and still be taken as that trade's. */
export const RECEIPT_CLAIM_MS = 24 * 3600000;

/**
 * A receipt no finished trade holds goes to the trade it is of. Torn numbers a trade one way while it is open
 * (the number on its page) and another once it has ended, and TornW3B's own form asks for no number at all: so a
 * receipt made on TornW3B's page carries a number no finished trade has. It is the trade's when its set pieces
 * and their counts are the same, the trade has no receipt yet, and they are within a day: the nearest in time.
 * @param finished [{ id, t, rows: [{ id, qty }] }]
 * @param ids      the set pieces: anything else on a receipt is not looked at
 */
export function claimReceipts(list, finished, ids) {
    const mine = new Set((finished || []).map((f) => String(f.id)));
    const held = new Set((list || []).filter(([key]) => mine.has(key)).map(([key]) => key));
    const sig = (rows) => JSON.stringify(twUnits(rows, ids).sort((a, b) => a[0] - b[0]));
    return (list || []).map(([key, r]) => {
        if (mine.has(key) || !(r.rows || []).length) return [key, r];
        const want = sig(r.rows);
        const fit = (finished || [])
            .filter((f) => !held.has(String(f.id)) && (f.rows || []).length && sig(f.rows) === want && Math.abs(f.t - r.at) < RECEIPT_CLAIM_MS)
            .sort((a, b) => Math.abs(a.t - r.at) - Math.abs(b.t - r.at))[0];
        if (!fit) return [key, r];
        held.add(String(fit.id));
        return [String(fit.id), r];
    });
}

/** The newest receipt is how long TornW3B keeps listing you as a buyer: 7 days from it. */
export const RECEIPT_KEEPS_MS = 7 * 86400000;
export function listedUntil(lastReceiptAt) {
    return lastReceiptAt > 0 ? lastReceiptAt + RECEIPT_KEEPS_MS : 0;
}
