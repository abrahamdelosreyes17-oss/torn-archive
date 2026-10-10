/*
 * The bazaar owner banner, captured live 2026-09-24:
 *
 *   <div class="msg right-round messageContent___cdSrs">
 *     <a href="profiles.php?XID=4254715">DixieNormousss's</a> bazaar,
 *     favorited by <b>3</b> citizens, is currently <span class="bold">open.</span>
 *   </div>
 *
 * The same profile link also sits in a (usually hidden) dropdown menu, in a
 * listItem___ wrapper - that one is skipped.
 *
 * Read only (cut for Torn Archive from Torn Bids 3.24.0: the owner-status
 * badge and its words are left behind; nothing is drawn from here).
 */

/** The owner's name link inside the banner, or null. */
export function findOwnerLink(root, ownerId) {
    const id = String(ownerId || '').replace(/\D/g, '');
    if (!id || !root) return null;

    const links = root.querySelectorAll('a[href*="XID=' + id + '"]');
    for (const a of links) {
        const href = a.getAttribute('href') || '';
        // XID=42 must not match XID=4254715.
        if (!new RegExp('XID=' + id + '(?!\\d)').test(href)) continue;
        if (a.closest('[class*="listItem"]')) continue;
        if (a.closest('[class*="messageContent"], .msg')) return a;
    }
    return null;
}

/** true = open, false = closed, null = the banner does not say. */
export function readBazaarOpen(root, ownerId) {
    const link = findOwnerLink(root, ownerId);
    if (!link) return null;

    const banner = link.closest('[class*="messageContent"], .msg');
    const text = ((banner && banner.textContent) || '').replace(/\s+/g, ' ');

    if (/currently\s+closed/i.test(text)) return false;
    if (/currently\s+open/i.test(text)) return true;
    return null;
}
