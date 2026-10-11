// Words and numbers as the hub and the marks on Torn's pages write them. Pure strings: no page is touched here.

const H_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Anything that came from Torn, TornW3B or a typed box goes through this before it is put in a page. */
export const hEsc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => H_ESC[c]);

export const hNum = (n) => Math.abs(Math.round(Number(n) || 0)).toLocaleString('en-US');
export const hMoney = (n) => (n < 0 ? '-' : '') + '$' + hNum(n);
export const hSigned = (n) => (n < 0 ? '-' : '+') + '$' + hNum(n);
/** A short money figure for a graph's axis: $1.2M, $340k. */
export const hShort = (v) => (v < 0 ? '-' : '') + '$' + (Math.abs(v) >= 1e6 ? (Math.abs(v) / 1e6).toFixed(1).replace('.0', '') + 'M' : Math.abs(v) >= 1e3 ? Math.round(Math.abs(v) / 1e3) + 'k' : Math.abs(v));
export const hPct = (n) => (Math.round((Number(n) || 0) * 10) / 10).toFixed(1) + '%';
/** A rate as it is typed: 101, 101.4. */
export const hRate = (n) => String(Math.round((Number(n) || 0) * 10) / 10);
export const hPlural = (n, one, many) => hNum(n) + ' ' + (n === 1 ? one : many || one + 's');

const H_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const hTwo = (n) => String(n).padStart(2, '0');
/** Torn's time (UTC): "9 Oct, 21:40". */
export function hWhen(t) {
    if (!(t > 0)) return '';
    const d = new Date(t);
    return d.getUTCDate() + ' ' + H_MONTHS[d.getUTCMonth()] + ', ' + hTwo(d.getUTCHours()) + ':' + hTwo(d.getUTCMinutes());
}
/** Torn's time of day (UTC): "21:40". */
export const hClock = (t) => (t > 0 ? hTwo(new Date(t).getUTCHours()) + ':' + hTwo(new Date(t).getUTCMinutes()) : '');
/** A day as the books keep it ("2026-10-09"), or a time: "9 Oct". */
export function hDay(day) {
    const d = typeof day === 'number' ? new Date(day) : new Date(String(day) + 'T00:00:00Z');
    return Number.isNaN(d.getTime()) ? '' : d.getUTCDate() + ' ' + H_MONTHS[d.getUTCMonth()];
}
/** How long ago a read landed: "12 s ago", "3 min ago". */
export function hAge(t, now) {
    if (!(t > 0)) return 'not yet';
    const s = Math.max(0, Math.round((now - t) / 1000));
    if (s < 2) return 'just now';
    if (s < 100) return s + ' s ago';
    if (s < 5400) return Math.round(s / 60) + ' min ago';
    return Math.round(s / 3600) + ' h ago';
}

export const HUB_ICONS = {
    brand: '<path d="M3 8 10 3.5 17 8H3Z"/><path d="M5 10.5v4.5M8.3 10.5v4.5M11.7 10.5v4.5M15 10.5v4.5M3.5 17h13"/>',
    dash: '<rect x="3" y="3" width="6" height="8" rx="1.5"/><rect x="11" y="3" width="6" height="5" rx="1.5"/><rect x="3" y="13" width="6" height="4" rx="1.5"/><rect x="11" y="10" width="6" height="7" rx="1.5"/>',
    stock: '<path d="M10 3 3 6.5 10 10l7-3.5L10 3Z"/><path d="m3 10 7 3.5 7-3.5"/><path d="m3 13.5 7 3.5 7-3.5"/>',
    buy: '<path d="M2.5 4h2l1.7 8.2h8.3l1.8-5.7H5.4"/><circle cx="7.8" cy="15.6" r="1.2"/><circle cx="13.8" cy="15.6" r="1.2"/>',
    trades: '<path d="M4 7h12l-3-3M16 13H4l3 3"/>',
    points: '<circle cx="10" cy="10" r="6.8"/><path d="M8.4 13.6V6.6h2.3a2 2 0 0 1 0 4H8.4"/>',
    tag: '<path d="M3.5 10.4V4.5a1 1 0 0 1 1-1h5.9l6 6a1 1 0 0 1 0 1.4l-5.1 5.1a1 1 0 0 1-1.4 0l-6.4-5.6Z"/><circle cx="7.2" cy="7.2" r="1.1"/>',
    book: '<path d="M6 3.5h9.5v13H6A1.5 1.5 0 0 1 4.5 15V5A1.5 1.5 0 0 1 6 3.5Z"/><path d="M4.5 14.8A1.5 1.5 0 0 1 6 13.5h9.5M8 7h4.5M8 9.8h3"/>',
    set: '<path d="M4 6h6.5M15.5 6h.5M4 14h.5M9.5 14H16"/><circle cx="13" cy="6" r="2.2"/><circle cx="7" cy="14" r="2.2"/>',
    pin: '<path d="M7 3h6l-.8 5 2.3 2.5v1.5h-9v-1.5L7.8 8 7 3ZM10 12v5"/>',
};
export const hIcon = (name) => `<svg class="ic" viewBox="0 0 20 20">${HUB_ICONS[name] || ''}</svg>`;

const H_PIC_SIZE = { lg: 'medium', xl: 'large' };
/**
 * A piece's picture: Torn's own, loaded from torn.com. Two letters show when it does not load (the page swaps a
 * broken picture for its `data-ab`).
 */
export function hPic(id, name, cls = '', color = '') {
    const ab = String(name || '').replace(/\s+Plushie$/i, '').split(' ').map((w) => w[0] || '').join('').slice(0, 2);
    return `<span class="it ${cls}"${color ? ` style="--c:${color}"` : ''}><img src="https://www.torn.com/images/items/${Number(id) || 0}/${H_PIC_SIZE[cls] || 'small'}.png" alt="" loading="lazy" data-ab="${hEsc(ab)}"></span>`;
}

/** A link that opens a Torn page in a new tab. One press, one page. */
export const hOut = (url, html, cls = '', attrs = '') => `<a class="${cls || 'lk'}" href="${hEsc(url)}" target="_blank" rel="noopener"${attrs ? ' ' + attrs : ''}>${html}</a>`;
export const hProfileUrl = (id) => 'https://www.torn.com/profiles.php?XID=' + encodeURIComponent(String(id == null ? '' : id).replace(/\D/g, ''));
