// The trades open with you: one row each, whose turn it is, and which of them is new.
// Read from Torn's API (v2 user/trades and user/{id}/trade, a Limited key). Nothing is accepted or sent for you.
// Pure working-out.

const trNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const trWhole = (v) => Math.max(0, Math.floor(trNum(v)));

/** Torn's list of trades: [{ id, who, whoId, modified, expires, completed, note }]. `myId` tells the two sides apart. */
export function parseTradeList(json, myId) {
    const rows = (json && json.trades) || [];
    const out = [];
    for (const t of Array.isArray(rows) ? rows : []) {
        if (!t || t.id == null) continue;
        const other = trOther(t, myId);
        out.push({
            id: String(t.id), who: other.name || '', whoId: other.id != null ? String(other.id) : '',
            modified: trNum(t.modified_at) * 1000, expires: trNum(t.expires_at) * 1000, completed: trNum(t.completed_at ?? t.timestamp) * 1000,
            note: String(t.description || ''),
        });
    }
    return out;
}

function trOther(t, myId) {
    const a = t.user || {};
    const b = t.trader || {};
    return String(a.id) === String(myId) ? b : String(b.id) === String(myId) ? a : b;
}

/**
 * One trade read in full: what they put in, what you put in.
 * @returns { id, who, whoId, modified, theirs: [{ id, qty }], theirMoney, mine: [{ id, qty }], myMoney, other } -
 *          `other` counts what is in it that is neither an item nor money (a property, a company...)
 */
export function parseTrade(json, myId) {
    const t = json && json.trade;
    if (!t || t.id == null) return null;
    const head = parseTradeList({ trades: [t] }, myId)[0];
    const out = { ...head, theirs: [], theirMoney: 0, mine: [], myMoney: 0, other: 0 };
    const add = (list, id, qty) => { const row = list.find((r) => r.id === id); if (row) row.qty += qty; else list.push({ id, qty }); };
    for (const it of Array.isArray(t.items) ? t.items : []) {
        if (!it || !it.details) continue;
        const me = String(it.user_id) === String(myId);
        if (it.type === 'Money') { if (me) out.myMoney += trWhole(it.details.amount); else out.theirMoney += trWhole(it.details.amount); }
        else if (it.type === 'Item') add(me ? out.mine : out.theirs, Number(it.details.id), trWhole(it.details.amount));
        else out.other += 1;
    }
    return out;
}

/**
 * Whose turn it is.
 *   'new'  they have put no set piece in yet
 *   'you'  pieces are in and your money is not (or not all of it)
 *   'them' your money covers it: nothing to do until they accept
 * @param total what the trade comes to at your prices (everything priced in it)
 */
export function tradeTurn(trade, total) {
    if (!trade || !(total > 0)) return 'new';
    return trade.myMoney >= total ? 'them' : 'you';
}

export const TURN_WORDS = { you: 'your turn to pay', them: 'paid · waiting for them', new: 'new · still adding' };

/**
 * Which trades are new since the last look. The first look ever tells of nothing: every trade is "seen".
 * @param seen  { ids: [..], began } the ids known, newest last
 * @param trades parseTradeList()
 * @returns { seen, fresh: [trade] }
 */
export function tradesSeen(seen, trades) {
    const known = new Set((seen && seen.ids) || []);
    const first = !(seen && seen.began);
    const fresh = first ? [] : (trades || []).filter((t) => !known.has(t.id));
    const ids = [...new Set([...known, ...(trades || []).map((t) => t.id)])].slice(-400);
    return { seen: { ids, began: true }, fresh };
}

/** A trade that was open at the last look and is not now: finished or cancelled, the finished list says which. */
export function tradesClosed(prevOpen, nowOpen) {
    const still = new Set((nowOpen || []).map((t) => t.id));
    return (prevOpen || []).filter((t) => !still.has(t.id));
}

/** "4 min ago", "just now", "2 h ago", "3 days ago". */
export function agoWords(t, now) {
    if (!(t > 0)) return '';
    const s = Math.max(0, Math.round((now - t) / 1000));
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    const d = Math.floor(s / 86400);
    return d === 1 ? 'yesterday' : d + ' days ago';
}

/** The words of the notice for a new trade. */
export function tradeNotice(trade, items, total) {
    const n = trWhole(items);
    return {
        title: (trade.who || 'Someone') + ' opened a trade with you',
        body: n ? n + (n === 1 ? ' item' : ' items') + (total > 0 ? ' · $' + trWhole(total).toLocaleString('en-US') + ' at your prices' : '') : 'Nothing in it yet',
    };
}
