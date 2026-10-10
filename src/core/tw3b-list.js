// Your price list on TornW3B, and its receipts.
// Sellers find a buyer on TornW3B by its price list, and a buyer stays on TornW3B's lists only with a receipt in
// the last 7 days. So the Archive keeps your 24 pieces on your list at your rate, and makes a receipt per trade.
// "Closed" = the pieces are taken off your list. TornW3B's own Open / Closed button is on its website and stays
// yours. Pure working-out: what to send, and what came back. Sending is src/api/tw3b-own.js.

const twNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const twWhole = (v) => Math.max(0, Math.floor(twNum(v)));

/** What your list should say: every piece of the sets you trade at a fixed price, or nothing when closed. */
export function desiredList(pieces, open) {
    if (!open) return [];
    return (pieces || []).filter((p) => p.pay > 0).map((p) => ({ itemID: Number(p.id), price: twWhole(p.pay) }));
}

/**
 * Your list as TornW3B has it: itemId -> { type, value }. Read loosely: the shape of the answer was never seen
 * from a script, only its documentation.
 */
export function parseOwnList(json) {
    const raw = json && (json.items || json.pricelist || json.priceList || json.data || json);
    const out = new Map();
    const rows = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.values(raw) : [];
    for (const r of rows) {
        if (!r || typeof r !== 'object') continue;
        const id = twWhole(r.itemID ?? r.itemId ?? r.item_id ?? r.id);
        const value = r.pricingValue ?? r.pricing_value ?? r.price ?? r.value;
        if (!id || value == null || value === '') continue;
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
 * @returns { set: [{ itemID, price, was }], remove: [{ itemID, was }], same }
 */
export function listDiff(current, desired, ids) {
    const want = new Map((desired || []).map((d) => [String(d.itemID), d.price]));
    const set = [];
    const remove = [];
    let same = 0;
    for (const id of (ids || []).map(String)) {
        const cur = current && current.get(id);
        const price = want.get(id);
        if (price == null) { if (cur) remove.push({ itemID: Number(id), was: cur.value }); continue; }
        if (cur && cur.type === 'fixed' && cur.value === price) same += 1;
        else set.push({ itemID: Number(id), price, was: cur ? cur.value : null });
    }
    return { set, remove, same };
}

export const listMatches = (diff) => !diff.set.length && !diff.remove.length;

/** The body of `PUT /api/pricelist/{userID}`. An item sent with no price is taken off the list. */
export function putBody(diff) {
    return {
        items: [
            ...diff.set.map((s) => ({ itemID: s.itemID, pricingType: 'fixed', pricingValue: s.price, inflationProtectionEnabled: false, roundToPlace: 0, bulkType: 'none' })),
            ...diff.remove.map((r) => ({ itemID: r.itemID })),
        ],
    };
}

/**
 * The body of `POST /api/pricelist/{userID}`: a receipt for one trade, from your list.
 * @param rows [{ id, qty }] the set pieces of the trade
 */
export function receiptBody(tradeId, rows, sellerId) {
    const by = new Map();
    for (const r of rows || []) if (twWhole(r.qty)) by.set(Number(r.id), (by.get(Number(r.id)) || 0) + twWhole(r.qty));
    return {
        items: [...by].map(([itemID, quantity]) => ({ itemID, quantity })),
        tradeID: String(tradeId),
        ...(sellerId ? { buyerPlayerId: Number(sellerId) } : {}),
        includeMessage: true,
    };
}

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
        url: (json && (json.receiptURL || json.receiptUrl)) || '',
        message: (json && json.message) || '',
        missing,
        differs: theirs - twWhole(total),
        id: rec.id ?? null,
    };
}

/** TornW3B's receipts (`GET /api/trades/{userID}/{receiptId}`) by Torn's trade id: tradeId -> { id, total, at }. */
export function receiptsByTrade(list) {
    const out = new Map();
    for (const r of list || []) {
        const tid = r && (r.trade_id ?? r.tradeId ?? r.tradeID);
        if (tid == null) continue;
        out.set(String(tid), { id: r.id, total: twNum(r.total_value ?? r.value), at: r.created_at ?? null });
    }
    return out;
}

/** The newest receipt is how long TornW3B keeps listing you as a buyer: 7 days from it. */
export const RECEIPT_KEEPS_MS = 7 * 86400000;
export function listedUntil(lastReceiptAt) {
    return lastReceiptAt > 0 ? lastReceiptAt + RECEIPT_KEEPS_MS : 0;
}
