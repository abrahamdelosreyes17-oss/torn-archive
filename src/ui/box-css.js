// The overlay on Torn's pages, in the hub's look. It lives in a shadow root of its own host (#tarc-host), so
// none of this reaches Torn's page and none of Torn's styles reach it.

/** With no room beside Torn's content it is a pill; opened from there it stands this far from the window's edge. */
export const BOX_GAP = 12;

export const BOX_CSS = `
:host {
  --panel: #10131a; --raised: #171b24; --input: #0a0c11; --rail-bg: #0c0f15;
  --line: rgba(255,255,255,.07); --line2: rgba(255,255,255,.13);
  --text: #f3f5f9; --text2: #c9cfda; --muted: #8e96a6; --faint: #626a7a;
  --brand: #8f7bff; --good: #3fcf6b; --warn: #f5a524; --warn-bg: rgba(245,165,36,.12);
  --need: #4c9dff; --need-bg: rgba(76,157,255,.12); --good-bg: rgba(63,207,107,.12);
  --sans: "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
  --disp: "Segoe UI Variable Display", "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
  all: initial;
}
* { box-sizing: border-box; }
.ta { position: fixed; z-index: 99990; top: var(--top, 84px); left: var(--left, 12px); width: var(--width, 430px);
  max-height: var(--max-h, 640px); display: flex; flex-direction: column; border-radius: 12px; background: var(--panel);
  border: 1px solid var(--line2); box-shadow: 0 16px 40px rgba(0,0,0,.5); color: var(--text); font: 400 13px/1.45 var(--sans);
  -webkit-font-smoothing: antialiased; overflow: hidden; text-align: left; container: ta / inline-size; }
.ta[hidden], .pill[hidden] { display: none; }
.ta-h { display: flex; align-items: center; gap: 8px; min-height: 38px; flex: none; padding: 4px 6px 4px 8px; border-bottom: 1px solid var(--line); background: var(--rail-bg); white-space: nowrap; cursor: grab; user-select: none; -webkit-user-select: none; touch-action: none; }
/* A narrow strip (the free window beside Torn's content on a smaller screen): the mark alone names it, so the words
   have the room; what does not fit on one line takes two, never cut. */
@container ta (max-width: 300px) { .ta-h { gap: 6px; } .ta-h > b { display: none; } .ta-h button.open { padding: 0 8px; } }
.ta.drag .ta-h { cursor: grabbing; } .ta.drag { transition: none; }
/* Folded, or with room for the bar only: the bar. */
.ta.folded .ta-b, .ta.bar .ta-b { display: none; } .ta.folded .ta-h, .ta.bar .ta-h { border-bottom: 0; }
.mark { width: 24px; height: 24px; flex: none; border-radius: 7px; display: grid; place-items: center; color: #fff; background: linear-gradient(145deg, #a694ff, #6a55e8); box-shadow: 0 0 0 1px rgba(255,255,255,.12) inset; }
.mark svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.ta-h b { font: 650 13px var(--disp); }
.ta-h .w { flex: 1; min-width: 0; color: var(--muted); font-size: 12px; line-height: 1.25; white-space: normal; overflow-wrap: anywhere; }
.ta-h button { width: 28px; height: 28px; flex: none; display: grid; place-items: center; border: 0; border-radius: 8px; background: none; color: var(--muted); cursor: pointer; font: 600 14px/1 var(--sans); }
.ta-h button:hover { background: var(--raised); color: var(--text); }
.ta-h button.open { width: auto; height: 26px; padding: 0 11px; border: 1px solid var(--line2); background: var(--raised); color: var(--text); font: 550 12px/1 var(--sans); }
.ta-h button.open:hover { background: #1c212c; }
/* Purple only when opening the hub is the thing to do next. */
.ta-h button.open.go { background: var(--brand); border-color: transparent; color: #fff; } .ta-h button.open.go:hover { background: #a08fff; }
.ta-b { display: grid; gap: 8px; padding: 10px 12px 12px; overflow-y: auto; overscroll-behavior: contain; }
.ta-b h4 { margin: 0; display: flex; align-items: baseline; gap: 8px; font: 650 13px var(--sans); white-space: nowrap; }
.ta-b h4 span { margin-left: auto; color: var(--muted); font-weight: 400; font-size: 12px; }
.ta-l { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 2px 8px; padding: 6px 8px; border-radius: 9px; background: var(--raised); border: 1px solid var(--line); }
.ta-l b { font-weight: 600; } .ta-l .s { grid-column: 1 / -1; color: var(--muted); font-size: 12px; } .ta-l.dim b { color: var(--muted); font-weight: 500; }
.it { width: 38px; height: 19px; flex: none; display: inline-grid; place-items: center; }
.it img { width: 38px; height: 19px; object-fit: contain; display: block; }
.ta-kv { display: flex; align-items: baseline; gap: 10px; font-size: 12px; color: var(--muted); }
.ta-kv > :last-child { margin-left: auto; color: var(--text); text-align: right; }
.ta-kv.sep { padding-top: 8px; border-top: 1px solid var(--line); }
.ta-n { color: var(--muted); font-size: 12px; line-height: 1.5; } .ta-n b { color: var(--text2); font-weight: 600; }
.ta-hold, .ta-warn { padding: 8px 10px; border-radius: 9px; background: var(--warn-bg); border: 1px solid rgba(245,165,36,.4); color: var(--text2); font-size: 12px; line-height: 1.5; }
.ta-hold b { color: var(--warn); font-weight: 600; }
.ta-ok { padding: 8px 10px; border-radius: 9px; background: var(--good-bg); border: 1px solid rgba(63,207,107,.35); color: var(--text2); font-size: 12px; line-height: 1.5; }
.msg { padding: 7px 10px; border-radius: 10px; background: var(--input); border: 1px solid var(--line); color: var(--text2); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.ta-btns { display: flex; gap: 6px; flex-wrap: wrap; } .ta-btns:empty { display: none; }
.btn { height: 26px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--line2); background: var(--raised); color: var(--text); font: 550 12px/1 var(--sans); display: inline-flex; align-items: center; justify-content: center; gap: 6px; white-space: nowrap; cursor: pointer; }
.btn:hover { background: #1c212c; }
.btn.go { background: var(--brand); border-color: transparent; color: #fff; } .btn.go:hover { background: #a08fff; }
.btn.link { background: var(--need-bg); border-color: transparent; color: #9cc6ff; }
.btn[data-done] { background: var(--good-bg); border-color: rgba(63,207,107,.35); color: var(--good); }
.kbd { display: inline-grid; place-items: center; min-width: 18px; height: 18px; margin-left: 2px; padding: 0 4px; border-radius: 5px; background: rgba(255,255,255,.22); font: 650 12px/1 var(--sans); }
.lk { color: #9cc6ff; cursor: pointer; text-decoration: none; } .lk:hover { color: #c9bfff; }
.num { font-variant-numeric: tabular-nums; }
.t-good { color: var(--good); } .t-bad { color: #ff8a87; }
.pill { position: fixed; z-index: 99990; right: 12px; bottom: 56px; height: 34px; padding: 0 12px 0 6px; display: inline-flex; align-items: center; gap: 8px; border-radius: 999px;
  border: 1px solid var(--line2); background: var(--panel); color: var(--text); font: 600 12px/1 var(--sans); box-shadow: 0 8px 24px rgba(0,0,0,.5); cursor: pointer; white-space: nowrap; }
.pill:hover { background: var(--raised); }
@media (prefers-reduced-motion: no-preference) { .ta { animation: ta-in .18s cubic-bezier(.2,.8,.2,1); } @keyframes ta-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } } }
`;

/** Our marks on Torn's own elements: the pill of the drawing, a little larger than the copy we started from. */
export const BOX_MARKS_CSS = `
.tarc-setmark { height: 20px; padding: 0 8px; border-radius: 999px; font: 600 12px/18px "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Arial, sans-serif; top: -11px; }
`;
