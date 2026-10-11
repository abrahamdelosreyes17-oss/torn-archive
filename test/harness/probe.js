// For looking at the overlay from a script: where it stands and what it says, as numbers and words.
// Loaded by nothing; a test session imports it into the stand-in Torn page (torn.html) when it needs it.
export function probe(doc = document) {
    const root = doc.getElementById('tarc-host').shadowRoot;
    const box = root.querySelector('.ta');
    const pill = root.querySelector('.pill');
    const rect = (el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); };
    const other = doc.getElementById('ttv2-host');
    const panel = other && other.shadowRoot ? other.shadowRoot.querySelector('.ttv2-panel') : null;
    const main = doc.getElementById('mainContainer').getBoundingClientRect();
    const fold = root.querySelector('[data-act="fold"]');
    return {
        win: [innerWidth, innerHeight],
        torn: [Math.round(main.left), Math.round(main.right)],
        box: box.hidden ? null : rect(box),
        cls: box.className,
        pill: pill.hidden ? null : [...rect(pill), pill.innerText.trim()],
        bar: root.querySelector('.w').textContent,
        open: root.querySelector('.open').classList.contains('go') ? 'Open (the thing to do)' : 'Open',
        fold: `${fold.textContent} ${fold.title}`,
        body: root.querySelector('.ta-b').innerText.replace(/\s*\n+\s*/g, ' | ').slice(0, 240),
        trading: panel ? rect(panel) : other ? 'on the page, no panel' : null,
    };
}
