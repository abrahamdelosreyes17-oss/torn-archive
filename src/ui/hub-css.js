// The hub's look: mockup AB's own stylesheet, taken whole (mockups/AB-torn-archive.html in the Torn Trading folder).
// The hub owns its page, so nothing here is scoped. What is drawn on Torn's pages has its own, prefixed, in marks-css.js.

export const HUB_CSS = `
:root {
  --rail: 60px; --side: 236px;
  --bg: #090b10; --rail-bg: #0c0f15; --panel: #10131a; --raised: #171b24; --hover: #1c212c; --input: #0a0c11;
  --line: rgba(255,255,255,.07); --line2: rgba(255,255,255,.13);
  --text: #f3f5f9; --text2: #c9cfda; --muted: #8e96a6; --faint: #626a7a;
  --brand: #8f7bff; --brand-bg: rgba(143,123,255,.14); --brand-line: rgba(143,123,255,.45);
  --good: #3fcf6b; --good-bg: rgba(63,207,107,.12); --bad: #f0605d; --bad-bg: rgba(240,96,93,.12);
  --warn: #f5a524; --warn-bg: rgba(245,165,36,.12); --need: #4c9dff; --need-bg: rgba(76,157,255,.12);
  --s-plush: #3987e5; --s-flower: #d55181; --s-gold: #c98500; --s-violet: #9085e9; --s-aqua: #199e70;
  --grid: #1a1f29; --axis: #2a303c;
  --sans: "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
  --disp: "Segoe UI Variable Display", "Segoe UI", system-ui, -apple-system, Arial, sans-serif;
  --ease: cubic-bezier(.2,.8,.2,1);
}
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; overflow: hidden; background: var(--bg); color: var(--text); }
body { font: 400 13px/1.45 var(--sans); -webkit-font-smoothing: antialiased; }
b, strong { font-weight: 600; }
button { font: inherit; color: inherit; cursor: pointer; }
.num, td, th, .k-v { font-variant-numeric: tabular-nums; }
svg.ic { width: 20px; height: 20px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }

/* ---------- shell ---------- */
.app { height: 100vh; display: grid; grid-template-columns: var(--rail) minmax(0, 1fr); transition: grid-template-columns .26s var(--ease); background: radial-gradient(1100px 520px at 12% -10%, rgba(143,123,255,.07), transparent 60%), var(--bg); }
.app.pinned { grid-template-columns: var(--side) minmax(0, 1fr); }
.side { position: relative; z-index: 40; }
.side-in { position: absolute; inset: 0 auto 0 0; width: var(--rail); display: flex; flex-direction: column; background: var(--rail-bg); border-right: 1px solid var(--line); overflow: hidden; transition: width .26s var(--ease), box-shadow .26s var(--ease); }
.side.open .side-in, .app.pinned .side-in { width: var(--side); }
.app:not(.pinned) .side.open .side-in { box-shadow: 18px 0 48px rgba(0,0,0,.55); border-right-color: var(--line2); }
.lab { opacity: 0; transform: translateX(-6px); transition: opacity .18s var(--ease), transform .26s var(--ease); white-space: nowrap; pointer-events: none; }
.side.open .lab, .app.pinned .lab { opacity: 1; transform: none; pointer-events: auto; }
.brand { height: 52px; flex: none; display: flex; align-items: center; gap: 12px; padding: 0 0 0 14px; border-bottom: 1px solid var(--line); }
.mark { width: 32px; height: 32px; flex: none; border-radius: 10px; display: grid; place-items: center; color: #fff; background: linear-gradient(145deg, #a694ff, #6a55e8); box-shadow: 0 0 0 1px rgba(255,255,255,.12) inset, 0 6px 18px rgba(143,123,255,.35); }
.brand .lab b { display: block; font: 650 15px/1.1 var(--disp); letter-spacing: .01em; }
.brand .lab span { color: var(--muted); font-size: 12px; } .brand .pin { margin-left: auto; margin-right: 10px; }
.nav { position: relative; flex: 1; padding: 8px; display: flex; flex-direction: column; gap: 2px; min-height: 0; }
.nav-ind { position: absolute; left: 8px; right: 8px; top: 0; height: 38px; border-radius: 10px; background: var(--brand-bg); box-shadow: inset 0 0 0 1px var(--brand-line); transition: transform .32s var(--ease); pointer-events: none; }
.nav-ind::before { content: ""; position: absolute; left: -8px; top: 10px; bottom: 10px; width: 3px; border-radius: 0 3px 3px 0; background: var(--brand); }
.nav-g { height: 26px; flex: none; display: flex; align-items: center; padding: 0 12px; color: var(--faint); font: 650 12px var(--sans); letter-spacing: .08em; text-transform: uppercase; position: relative; }
.nav-g::after { content: ""; position: absolute; left: 12px; right: 12px; top: 50%; border-top: 1px solid var(--line); transition: opacity .18s; }
.side.open .nav-g::after, .app.pinned .nav-g::after { opacity: 0; }
.nav-b { position: relative; height: 38px; flex: none; display: flex; align-items: center; gap: 14px; padding: 0 12px; border: 0; border-radius: 10px; background: none; color: var(--muted); text-align: left; transition: color .16s, background .16s; }
.nav-b:hover { color: var(--text); background: rgba(255,255,255,.04); }
.nav-b.on { color: var(--text); }
.nav-b.on svg { color: var(--brand); }
.nav-b .lab { flex: 1; font-weight: 550; }
.nav-b .cnt { font: 650 12px var(--sans); padding: 1px 7px; border-radius: 999px; color: var(--need); background: var(--need-bg); }
.nav-b .cnt.hot { color: var(--warn); background: var(--warn-bg); }
.nav-b .pip { position: absolute; left: 28px; top: 8px; width: 7px; height: 7px; border-radius: 50%; background: var(--warn); box-shadow: 0 0 0 2px var(--rail-bg); transition: opacity .18s; }
.side.open .pip, .app.pinned .pip { opacity: 0; }
.side-f { flex: none; padding: 8px; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 6px; }
.shop { height: 40px; display: flex; align-items: center; gap: 14px; padding: 0 12px; border-radius: 10px; }
.shop .dot { margin: 0 6px 0 7px; }
.shop .lab { flex: 1; color: var(--text2); } .shop .lab b { color: var(--good); }
.pin { width: 30px; height: 30px; flex: none; border-radius: 8px; border: 1px solid var(--line2); background: var(--raised); display: grid; place-items: center; color: var(--muted); transition: color .16s, background .16s, opacity .18s var(--ease); }
.pin svg { width: 16px; height: 16px; transform: rotate(45deg); transition: transform .26s var(--ease); }
.app.pinned .pin svg { transform: none; }
.pin:hover { color: var(--text); }
.app.pinned .pin { color: #fff; background: var(--brand); border-color: transparent; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--good); flex: none; display: inline-block; }
.dot.warn { background: var(--warn); } .dot.off { background: var(--faint); } .dot.need { background: var(--need); }
.live { width: 8px; height: 8px; border-radius: 50%; background: var(--good); flex: none; display: inline-block; position: relative; }
.live::after { content: ""; position: absolute; inset: -4px; border-radius: 50%; border: 1px solid var(--good); animation: ping 2.4s var(--ease) infinite; }

.main { display: grid; grid-template-rows: 52px minmax(0, 1fr) 30px; height: 100vh; min-width: 0; container-type: inline-size; }
.top { display: flex; align-items: center; gap: 10px; padding: 0 16px; border-bottom: 1px solid var(--line); white-space: nowrap; min-width: 0; }
.top h1 { margin: 0 8px 0 0; font: 650 19px/1 var(--disp); letter-spacing: -.01em; }
.tabs { display: flex; gap: 2px; align-self: stretch; }
.tab { position: relative; padding: 0 12px; border: 0; background: none; color: var(--muted); font-weight: 550; transition: color .16s; }
.tab:hover { color: var(--text); }
.tab.on { color: var(--text); }
.tab::after { content: ""; position: absolute; left: 12px; right: 12px; bottom: 0; height: 2px; border-radius: 2px 2px 0 0; background: var(--brand); transform: scaleX(0); transition: transform .26s var(--ease); }
.tab.on::after { transform: none; }
.sp { flex: 1; }
.pill { height: 30px; display: inline-flex; align-items: center; gap: 7px; padding: 0 10px; border-radius: 9px; background: var(--panel); border: 1px solid var(--line); color: var(--muted); font-size: 12px; }
.pill b { color: var(--text); font-size: 13px; }
.pill .dn { color: var(--warn); } .pill.flash { animation: flash 1s var(--ease); }
@container (max-width: 1130px) { .pill.opt { display: none; } }
@container (max-width: 1240px) { .page.stackable { grid-template-columns: minmax(0, 1fr); } .page.stackable .minc { min-height: 260px !important; } }
@container (max-width: 1420px) { .page.stackable.wide { grid-template-columns: minmax(0, 1fr); } .page.stackable.wide .minc { min-height: 260px !important; } }
.btn { height: 30px; padding: 0 12px; border-radius: 9px; border: 1px solid var(--line2); background: var(--raised); color: var(--text); font-weight: 550; font-size: 13px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; white-space: nowrap; transition: background .16s, transform .16s var(--ease), border-color .16s; }
.btn:hover { background: var(--hover); border-color: rgba(255,255,255,.22); }
.btn:active { transform: scale(.97); }
.btn.sm { height: 26px; padding: 0 10px; border-radius: 8px; font-size: 12px; }
.btn.go { background: var(--brand); border-color: transparent; color: #fff; }
.btn.go:hover { background: #a08fff; }
.btn.link { background: var(--need-bg); border-color: transparent; color: #9cc6ff; }

.tape { display: flex; align-items: center; border-top: 1px solid var(--line); background: var(--rail-bg); font-size: 12px; color: var(--muted); white-space: nowrap; min-width: 0; }
.tape-l, .tape-r { flex: none; padding: 0 12px; height: 100%; display: flex; align-items: center; gap: 8px; }
.tape-l { border-right: 1px solid var(--line); color: var(--text2); font-weight: 600; }
.tape-r { border-left: 1px solid var(--line); gap: 14px; }
.tape-m { flex: 1; min-width: 0; overflow: hidden; mask-image: linear-gradient(90deg, transparent, #000 40px, #000 calc(100% - 40px), transparent); }
.tape-t { display: inline-flex; gap: 26px; padding-left: 26px; animation: tape 150s linear infinite; }
.tape-m:hover .tape-t { animation-play-state: paused; }
.tk b { color: var(--text2); font-weight: 550; margin-right: 6px; } .tk .num { color: var(--text); margin-right: 6px; }
.up { color: var(--bad); } .down { color: var(--good); }

/* ---------- pages and panels ---------- */
.view { overflow: auto; padding: 12px 16px; min-width: 0; scrollbar-width: thin; scrollbar-color: #2a303c transparent; }
.page { display: none; gap: 12px; min-height: 100%; }
.page.on { display: grid; }
.pane { display: none; gap: 12px; min-height: 0; min-width: 0; }
.pane.on { display: grid; }
.col { display: flex; flex-direction: column; gap: 12px; min-width: 0; min-height: 0; }
.panel { display: flex; flex-direction: column; min-width: 0; min-height: 0; background: linear-gradient(180deg, rgba(255,255,255,.018), transparent 120px), var(--panel); border: 1px solid var(--line); border-radius: 12px; transition: border-color .2s; animation: rise .46s var(--ease) both; animation-delay: calc(var(--i, 0) * 36ms); }
.panel:hover { border-color: var(--line2); }
.panel.grow { flex: 1; }
.panel.tint { border-color: var(--brand-line); background: linear-gradient(180deg, var(--brand-bg), transparent 140px), var(--panel); }
.panel.hold { border-color: rgba(245,165,36,.4); }
.ph { flex: none; display: flex; align-items: center; gap: 12px; padding: 11px 14px 0; white-space: nowrap; min-height: 37px; }
.ph h2 { margin: 0; font: 650 13px/1.2 var(--sans); color: var(--text); }
.ph .sub { color: var(--muted); font-size: 12px; }
.pb { flex: 1; min-height: 0; padding: 10px 14px 13px; position: relative; }
.pb.flush { padding: 6px 0 4px; }
.chart { position: absolute; inset: 4px 8px 6px 6px; }
.chart svg { width: 100%; height: 100%; display: block; overflow: visible; }
.legend { display: flex; gap: 14px; color: var(--text2); font-size: 12px; }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.key { width: 14px; height: 2px; border-radius: 2px; background: var(--c); flex: none; }
.key.box { height: 10px; width: 10px; border-radius: 3px; }
.key.band { height: 10px; background: rgba(255,255,255,.1); }
.key.dash { background: repeating-linear-gradient(90deg, var(--muted) 0 4px, transparent 4px 7px); }
.seg { display: inline-flex; background: var(--input); border: 1px solid var(--line); border-radius: 9px; padding: 2px; }
.seg button { height: 24px; padding: 0 10px; border: 0; border-radius: 7px; background: none; color: var(--muted); font-size: 12px; font-weight: 600; transition: background .16s, color .16s; }
.seg button.on { background: var(--raised); color: var(--text); }
.tip { position: absolute; left: 0; top: 0; z-index: 20; pointer-events: none; padding: 8px 10px; border-radius: 9px; background: #1d222d; border: 1px solid var(--line2); box-shadow: 0 10px 30px rgba(0,0,0,.5); font-size: 12px; white-space: nowrap; opacity: 0; transition: opacity .12s; }
.tip.on { opacity: 1; }
.tip h4 { margin: 0 0 4px; font: 600 12px var(--sans); color: var(--muted); }
.tip div { display: flex; align-items: center; gap: 7px; color: var(--text2); } .tip div b { margin-left: auto; padding-left: 14px; color: var(--text); }
svg .g { stroke: var(--grid); stroke-width: 1; } svg .ax { fill: var(--muted); font: 12px var(--sans); }
svg .lb { fill: var(--text2); font: 600 12px var(--sans); } svg .rl { fill: var(--muted); font: 12px var(--sans); }
svg .ln { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
svg .ln.draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw 1.1s var(--ease) .1s forwards; }
svg .fade { animation: fade .9s ease .35s both; }
svg .bar.growy { transform-box: fill-box; transform-origin: bottom; animation: growy .55s var(--ease) both; }
svg .bar.neg.growy { transform-origin: top; }
svg .cross { stroke: var(--line2); stroke-width: 1; }

/* ---------- dashboard ---------- */
.p-dash { grid-template-columns: repeat(12, minmax(0, 1fr)); grid-template-rows: auto minmax(170px, 1.25fr) minmax(160px, 1fr); height: 100%; min-height: 470px; }
.kpi { grid-column: span 2; padding: 11px 14px 12px; position: relative; overflow: hidden; }
.k-l { color: var(--muted); font-size: 12px; white-space: nowrap; }
.k-v { font: 650 clamp(18px, 1.72cqw, 23px)/1.25 var(--disp); letter-spacing: -.015em; white-space: nowrap; }
.k-v.good { color: var(--good); }
.k-s { color: var(--muted); font-size: 12px; line-height: 1.4; } .k-s b { color: var(--text2); }
.k-x { position: absolute; right: 12px; top: 9px; opacity: .95; }
.meter { position: relative; height: 6px; border-radius: 4px; background: rgba(255,255,255,.07); margin: 7px 0 6px; }
.meter i { position: absolute; inset: 0 auto 0 0; border-radius: 4px; background: var(--brand); width: var(--w); animation: growx .8s var(--ease) .2s both; transform-origin: left; }
.meter u { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--text2); left: var(--at); border-radius: 2px; }
.s8 { grid-column: span 8; } .s7 { grid-column: span 7; } .s6 { grid-column: span 6; } .s5 { grid-column: span 5; } .s4 { grid-column: span 4; } .s3 { grid-column: span 3; } .s12 { grid-column: span 12; }
.next { display: grid; grid-auto-rows: minmax(0, 1fr); height: 100%; }
.nx { display: flex; align-items: center; gap: 11px; padding: 6px 0; border-top: 1px solid var(--line); min-height: 0; }
.nx:first-child { border-top: 0; }
.next.few { display: flex; flex-direction: column; gap: 10px; }
.nx-g { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; } .nx-g.bare { flex: none; } .nx-g + .nx-g { border-top: 1px solid var(--line); padding-top: 6px; }
.nx-g > .nx { flex: none; padding: 4px 0 10px; border-top: 0; }
/* The lines that fit are shown whole; one that would be cut goes to a column out of sight. */
.nx-m { flex: 1; min-height: 0; display: flex; flex-flow: column wrap; overflow: hidden; align-content: flex-start; }
.nm { flex: 1 0 28px; max-height: 38px; width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) 64px 124px; align-items: center; gap: 10px; padding: 0 2px; border-top: 1px solid var(--line); white-space: nowrap; color: var(--text2); }
.nm b { color: var(--text); font-weight: 600; } .nm-a { white-space: normal; line-height: 1.25; overflow-wrap: anywhere; } .nm-b, .nm-c { text-align: right; }
.nm.h { flex: 0 0 24px; border-top: 0; color: var(--muted); font-size: 11px; align-items: end; padding-bottom: 5px; }
.nx-f { flex: none; display: flex; justify-content: space-between; gap: 6px 16px; flex-wrap: wrap; padding-top: 9px; border-top: 1px solid var(--line); color: var(--text2); white-space: nowrap; } .nx-f b { color: var(--text); font-weight: 600; }
/* A short card with two things to do has no room for their lines: one line each, as with many. */
.pb.todo { container: todo / size; }
@container todo (max-height: 250px) { .next.n2 .nx-m, .next.n2 .nx-f { display: none; } .next.n2 .nx-g { justify-content: center; } .next.n2 .nx-g > .nx { padding: 0; } }
@container todo (max-height: 110px) { .next.n1 .nx-m, .next.n1 .nx-f { display: none; } .next.n1 .nx-g { flex: 1 1 0; justify-content: center; } }
.nx-i { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; flex: none; background: var(--c-bg); color: var(--c); }
.nx-i svg { width: 17px; height: 17px; }
.nx-t { flex: 1; min-width: 0; color: var(--text2); line-height: 1.35; } .nx-t b { color: var(--text); }
.sky2 { display: grid; grid-template-columns: 13fr 11fr; gap: 18px; height: 100%; }
.sky { display: flex; flex-direction: column; min-height: 0; }
.sky-h { display: flex; align-items: baseline; gap: 8px; white-space: nowrap; color: var(--muted); font-size: 12px; margin-bottom: 6px; } .sky-h b { color: var(--text); font-size: 13px; }
.sky-b { flex: 1; min-height: 0; position: relative; display: flex; align-items: flex-end; gap: 3px; border-bottom: 1px solid var(--axis); }
.sky-c { flex: 1; max-width: 22px; height: var(--h); border-radius: 4px 4px 0 0; background: #4a5263; position: relative; animation: growy .6s var(--ease) both; animation-delay: calc(var(--n) * 22ms + 120ms); transform-origin: bottom; }
.sky-c.need { background: var(--need); } .sky-c.ahead { background: var(--warn); }
.sky-c:hover { filter: brightness(1.25); }
.sky-l { position: absolute; left: 0; right: 0; bottom: var(--at); border-top: 1px dashed var(--muted); pointer-events: none; }
.sky-l span { position: absolute; right: 0; bottom: 2px; color: var(--muted); font-size: 12px; background: var(--panel); padding-left: 4px; }
.sky-f { color: var(--text2); font-size: 12px; margin-top: 6px; white-space: nowrap; } .sky-f b { color: var(--text); }
[data-tip] { position: relative; }
[data-tip]:hover::after { content: attr(data-tip); position: absolute; left: 50%; bottom: calc(100% + 7px); transform: translateX(-50%); padding: 5px 8px; border-radius: 8px; background: #1d222d; border: 1px solid var(--line2); color: var(--text); font: 12px var(--sans); white-space: nowrap; z-index: 30; box-shadow: 0 8px 22px rgba(0,0,0,.5); }
.ladder { display: grid; grid-auto-rows: minmax(16px, 1fr); height: 100%; font-size: 12px; line-height: 16px; }
.lad { display: grid; grid-template-columns: 62px minmax(0, 1fr) 58px 92px; align-items: center; gap: 10px; padding: 0 14px; white-space: nowrap; }
.lad.h { color: var(--faint); font-weight: 600; }
.lad .r { text-align: right; } .lad .p { color: var(--text); font-weight: 600; }
.lad .bar { height: 10px; border-radius: 0 4px 4px 0; background: var(--s-gold); width: var(--w); min-width: 3px; opacity: .85; animation: growx .7s var(--ease) both; animation-delay: calc(var(--n) * 50ms + 150ms); transform-origin: left; }
.lad.wall .bar { opacity: 1; } .lad .tag { color: var(--muted); }
.after { display: grid; grid-auto-rows: minmax(18px, 1fr); height: 100%; font-size: 12px; min-height: 150px; }
.af { display: grid; grid-template-columns: 178px minmax(0, 1fr) 110px; align-items: center; gap: 12px; padding: 0 14px; white-space: nowrap; }
.af b { color: var(--text); font-weight: 600; } .af .it { margin-right: 8px; } .af .r { text-align: right; color: var(--muted); }
.af-b { position: relative; height: 10px; display: flex; gap: 2px; }
.af-b i { height: 100%; background: #4a5263; width: var(--w); animation: growx .7s var(--ease) both; animation-delay: calc(var(--n) * 40ms + 150ms); transform-origin: left; } .af-b i:first-child { border-radius: 3px 0 0 3px; } .af-b i:last-of-type { border-radius: 0 3px 3px 0; }
.af-b i.nd { background: var(--need); } .af-b i.ah { background: var(--warn); }
.af-b u { position: absolute; left: var(--at); top: -4px; bottom: -4px; width: 2px; background: var(--text2); border-radius: 2px; }
.lad.you { background: var(--brand-bg); box-shadow: inset 2px 0 0 var(--brand); grid-template-columns: 62px minmax(0, 1fr); color: var(--text2); } .lad.you b { color: var(--text); }

/* ---------- tables, tiles, bits ---------- */
table.t { width: 100%; border-collapse: collapse; }
.t th { text-align: left; padding: 7px 8px; color: var(--faint); font: 650 12px var(--sans); border-bottom: 1px solid var(--line); white-space: nowrap; position: sticky; top: 0; background: var(--panel); }
.t td { padding: 7px 8px; border-bottom: 1px solid var(--line); color: var(--text2); white-space: nowrap; vertical-align: middle; }
.t tr:last-child td { border-bottom: 0; }
.t tbody tr { transition: background .14s; } .t tbody tr:hover { background: rgba(255,255,255,.028); }
.t th:first-child, .t td:first-child { padding-left: 14px; } .t th:last-child, .t td:last-child { padding-right: 14px; }
.t.kv th { position: static; width: 34%; white-space: normal; border-bottom: 1px solid var(--line); padding-left: 0; vertical-align: top; } .t.kv td { white-space: normal; padding-right: 0; } .t.kv tr:last-child th { border-bottom: 0; }
.t.tight td { padding-top: 5px; padding-bottom: 5px; } .t.wrapth th { white-space: normal; vertical-align: bottom; } .t .n { text-align: right; } .t td b { color: var(--text); }
.t tr.sum td { border-top: 1px solid var(--line2); border-bottom: 0; color: var(--text); font-weight: 600; }
.sw { width: 8px; height: 8px; border-radius: 3px; display: inline-block; margin-right: 8px; background: var(--c); }
.badge { display: inline-flex; align-items: center; gap: 5px; height: 20px; padding: 0 8px; border-radius: 999px; font: 600 12px/1 var(--sans); white-space: nowrap; color: var(--muted); background: rgba(255,255,255,.06); }
.badge.need { color: #8fc1ff; background: var(--need-bg); } .badge.ahead { color: var(--warn); background: var(--warn-bg); } .badge.ok { color: var(--good); background: var(--good-bg); } .badge.bad { color: #ff8a87; background: var(--bad-bg); } .badge.best { color: #c9bfff; background: var(--brand-bg); }
.t-good { color: var(--good); } .t-bad { color: #ff8a87; } .t-warn { color: var(--warn); } .t-need { color: #8fc1ff; } .t-muted { color: var(--muted); }
.tiles { display: grid; grid-template-columns: repeat(var(--n, 4), minmax(0, 1fr)); gap: 12px; }
.tile { padding: 11px 14px 12px; }
.pgrid { display: grid; gap: 8px; height: 100%; grid-auto-rows: minmax(70px, 1fr); }
.pc { border-radius: 10px; background: var(--raised); border: 1px solid var(--line); min-width: 0; transition: transform .2s var(--ease), border-color .2s; }
.pc:hover { transform: translateY(-2px); border-color: var(--line2); }
.pc-n { font-weight: 600; line-height: 1.25; } .pc-q { color: var(--muted); font-size: 12px; } .pc-q b { color: var(--text); font: 650 15px var(--disp); margin-right: 3px; }
.pc-bar { height: 4px; border-radius: 3px; background: rgba(255,255,255,.08); margin-top: auto; position: relative; overflow: hidden; }
.pc-bar i { position: absolute; inset: 0 auto 0 0; width: var(--w); border-radius: 3px; background: #5a6274; animation: growx .7s var(--ease) both; animation-delay: calc(var(--n) * 25ms + 150ms); transform-origin: left; }
.pc.need .pc-bar i { background: var(--need); } .pc.ahead .pc-bar i { background: var(--warn); }
.pc-s { font-size: 12px; color: var(--muted); } .pc.need .pc-s { color: #8fc1ff; } .pc.ahead .pc-s { color: var(--warn); }
.pc.first { border-color: rgba(76,157,255,.5); box-shadow: 0 0 0 3px rgba(76,157,255,.08); }
.pc.act { background: var(--brand-bg); border-color: var(--brand-line); color: var(--text2); font-size: 12px; }
.flow { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; }
.fl .k-l { white-space: normal; } .fl { padding: 2px 10px 2px 14px; border-left: 1px solid var(--line); position: relative; } .fl:first-child { border-left: 0; padding-left: 0; }
.fl:not(:first-child)::before { content: "›"; position: absolute; left: -6px; top: 16px; color: var(--faint); background: var(--panel); font-size: 16px; line-height: 1; }
.rows { display: flex; flex-direction: column; }
.row { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-top: 1px solid var(--line); white-space: nowrap; } .row:first-child { border-top: 0; }
.row .grow1 { flex: 1; min-width: 0; white-space: normal; color: var(--text2); } .row .grow1 b { color: var(--text); }
.li { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-top: 1px solid var(--line); transition: background .14s; } .li:hover { background: rgba(255,255,255,.028); }
.li.sel { background: var(--brand-bg); box-shadow: inset 2px 0 0 var(--brand); }
.li-m { flex: 1; min-width: 0; } .li-m b { display: block; } .li-m span { color: var(--muted); font-size: 12px; }
.av { width: 30px; height: 30px; border-radius: 50%; background: var(--raised); border: 1px solid var(--line2); display: grid; place-items: center; font: 650 12px var(--sans); color: var(--text2); flex: none; }
.msg { padding: 7px 12px; border-radius: 10px; background: var(--input); border: 1px solid var(--line); color: var(--text2); line-height: 1.5; }
.hero { font: 650 36px/1 var(--disp); letter-spacing: -.02em; } .hero small { font-size: 16px; color: var(--muted); font-weight: 500; letter-spacing: 0; margin-left: 6px; }
.track { position: relative; height: 8px; border-radius: 5px; background: rgba(255,255,255,.07); margin: 22px 0 26px; }
.track i { position: absolute; inset: 0 auto 0 0; width: var(--w); border-radius: 5px; background: linear-gradient(90deg, #6a55e8, #a694ff); }
.track .knob { position: absolute; left: var(--w); top: 50%; width: 16px; height: 16px; margin: -8px 0 0 -8px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 4px rgba(143,123,255,.3); }
.track .mk { position: absolute; left: var(--at); top: -5px; bottom: -5px; width: 2px; background: var(--warn); }
.track .mk span { position: absolute; top: 16px; left: 50%; transform: translateX(-50%); font-size: 12px; color: var(--muted); white-space: nowrap; }
.track .lo, .track .hi { position: absolute; top: -20px; font-size: 12px; color: var(--faint); } .track .lo { left: 0; } .track .hi { right: 0; }
.toggle { display: inline-flex; align-items: center; gap: 8px; }
.sw-t { width: 38px; height: 22px; border-radius: 999px; background: var(--good); position: relative; flex: none; } .sw-t::after { content: ""; position: absolute; right: 3px; top: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; }
.field { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid var(--line); white-space: nowrap; } .field:first-child { border-top: 0; }
.field .f-l { flex: 1; min-width: 0; white-space: normal; } .field .f-l span { display: block; color: var(--muted); font-size: 12px; }
.inp { display: inline-flex; align-items: center; height: 30px; padding: 0 10px; border-radius: 8px; background: var(--input); border: 1px solid var(--line2); color: var(--text); font-variant-numeric: tabular-nums; }
.inp.key { flex: 1; min-width: 0; letter-spacing: .2em; color: var(--muted); }
.stack { display: flex; height: 14px; gap: 2px; border-radius: 5px; overflow: hidden; margin: 10px 0; } .stack i { background: var(--c); width: var(--w); animation: growx .8s var(--ease) both; transform-origin: left; }
.notes { max-width: none; columns: 2; column-gap: 28px; color: var(--text2); line-height: 1.55; } .notes h3 { margin: 0 0 6px; font: 650 14px var(--sans); color: var(--text); break-after: avoid; } .notes ul { margin: 0 0 16px; padding-left: 18px; } .notes li { margin-bottom: 5px; break-inside: avoid; } .notes li b { color: var(--text); }
.paused { position: absolute; inset: 52px 0 30px 0; z-index: 35; display: none; place-items: center; background: rgba(9,11,16,.82); backdrop-filter: blur(6px); }
.paused.on { display: grid; animation: fade .3s ease both; }
.paused .card { width: min(560px, 90%); padding: 22px 24px; border-radius: 16px; background: var(--panel); border: 1px solid rgba(245,165,36,.45); box-shadow: 0 24px 80px rgba(0,0,0,.6); }
.paused h2 { margin: 0 0 8px; font: 650 19px var(--disp); display: flex; align-items: center; gap: 10px; } .paused p { margin: 0 0 10px; color: var(--text2); }

/* ---------- item pictures: Torn's own, as Torn Bids shows them ---------- */
.it { width: 38px; height: 19px; box-sizing: content-box; flex: none; display: inline-grid; place-items: center; vertical-align: middle; margin-right: 8px; border-radius: 4px; background: rgba(255,255,255,.05); border-bottom: 2px solid var(--c, transparent); font: 650 12px/1 var(--sans); color: var(--text2); overflow: hidden; }
.it img { width: 38px; height: 19px; object-fit: contain; display: block; }
.it.lg { width: 60px; height: 30px; } .it.lg img { width: 60px; height: 30px; }
.tk .it { margin-right: 6px; }
.t-brand { color: #c9bfff; }
.top.tight .pill.opt { display: none; } .top.tighter .pill .dn { display: none; }
.nx-p { width: 38px; flex: none; display: grid; place-items: center; } .nx-p .it { margin: 0; }
.pc-h { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 2px 6px; } .pc-h .it { margin: 0; } .pc .it, .pc .it img { width: 30px; height: 15px; }
/* stock tiles: what is in a tile grows with the tile, so a tall screen leaves no empty box */
.pc { container: pc / size; display: block; padding: 0; cursor: pointer; }
.pc-in { height: 100%; display: flex; flex-direction: column; gap: 2px; padding: 7px 8px; }
.pc.act { cursor: default; } .pc.act .pc-in { justify-content: center; align-items: flex-start; gap: 7px; }
.pc-big { font: 650 15px var(--disp); color: var(--text); margin-right: 5px; }
.pc-x { display: none; flex: none; } .pc-k .w { display: none; } .pc-bar, .pc-h, .pc-n, .pc-q { flex: none; } .pc-k:nth-child(3) { display: none; }
.pc-k { display: flex; align-items: baseline; justify-content: space-between; gap: 0 8px; font-size: 12px; color: var(--muted); white-space: nowrap; } .pc-k b { color: var(--text2); font-weight: 600; }
@container pc (min-height: 118px) { .pc-in { padding: 10px 12px 11px; gap: 3px; } .pc .it, .pc .it img { width: 60px; height: 30px; } .pc-n { font-size: 14px; margin-top: 2px; } .pc-q b, .pc-big { font-size: 21px; } .pc-bar { height: 6px; } .pc.act { font-size: 13px; } }
@container pc (min-height: 158px) and (min-width: 136px) { .pc-x { display: grid; gap: 3px; margin-top: 5px; padding-top: 6px; border-top: 1px solid var(--line); } }
@container pc (min-height: 192px) { .pc-k:nth-child(3) { display: flex; } }
@container pc (min-width: 176px) { .pc-k .w { display: inline; } .pc-k .n { display: none; } }
@container pc (min-height: 250px) and (max-width: 135.9px) { .pc-x { display: grid; gap: 3px; margin-top: 7px; padding-top: 8px; border-top: 1px solid var(--line); } .pc-k { flex-direction: column; } }
@container pc (min-height: 236px) and (min-width: 170px) { .pc-in { padding: 12px 14px 13px; gap: 4px; } .pc .it, .pc .it img { width: 100px; height: 50px; } .pc-n { font-size: 15px; } .pc-q b, .pc-big { font-size: 26px; } .pc-x { gap: 5px; } }
/* the buying run */
.stop.cur { background: var(--brand-bg); box-shadow: inset 3px 0 0 var(--brand); }
.stop.done .stop-n { background: var(--good-bg); border-color: transparent; color: var(--good); } .stop.skip .stop-n { color: var(--faint); }
.stop.done .chips, .stop.skip .chips { opacity: .55; }
.stop-st { font-size: 12px; color: var(--muted); } .stop.done .stop-st { color: var(--good); } .stop.cur .stop-st { color: #c9bfff; }
.kbd { display: inline-grid; place-items: center; min-width: 18px; height: 18px; margin-left: 8px; padding: 0 4px; border-radius: 5px; background: rgba(255,255,255,.22); font: 650 12px/1 var(--sans); }
.runbar { display: flex; align-items: center; gap: 8px 10px; flex-wrap: wrap; padding-bottom: 9px; color: var(--text2); } .runbar > span { flex: 1 1 220px; min-width: 0; } .runbar b { color: var(--text); }
/* a name or a button that opens the real page on Torn */
.lk { color: inherit; cursor: pointer; text-decoration: none; } .lk::after { content: "\\2197"; margin-left: 4px; font-size: 12px; font-weight: 400; color: var(--faint); transition: color .14s; } .lk:hover, .lk:hover::after { color: #c9bfff; }
.btn.out::after { content: "\\2197"; margin-left: 6px; opacity: .75; }
@container pc (max-width: 120px) { .pc .btn.out::after { display: none; } }
.main { position: relative; }
.kpis { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; } .kpis .kpi { grid-column: auto; }
/* is it worth opening */
.verdict { display: flex; align-items: center; gap: 10px; padding-bottom: 9px; white-space: nowrap; } .verdict b { font: 650 16px var(--disp); } .verdict .sp { flex: 1; } .verdict .lamp { margin: 0 4px; }
.chk { display: flex; align-items: baseline; gap: 10px; padding: 6px 0; border-top: 1px solid var(--line); color: var(--text2); line-height: 1.45; } .chk b { color: var(--text); }
.chk::before { content: "\\2713"; flex: none; width: 16px; color: var(--good); font-weight: 700; } .chk.no::before { content: "\\2715"; color: var(--warn); }
/* open trades */
.li[data-tr] { cursor: pointer; } .li .amt { text-align: right; white-space: nowrap; } .li .amt span { display: block; }
.st { font-size: 12px; white-space: nowrap; color: var(--muted); } .st.you { color: var(--warn); } .st.new { color: #c9bfff; }
.av.new { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-bg); }
/* the notice of a new trade */
.toast { position: absolute; top: 62px; right: 16px; z-index: 60; display: flex; align-items: center; gap: 12px; padding: 10px 10px 10px 12px; border-radius: 12px; background: var(--panel); border: 1px solid var(--brand-line); box-shadow: 0 16px 40px rgba(0,0,0,.55); white-space: nowrap; opacity: 0; transform: translateY(-8px); pointer-events: none; transition: opacity .26s var(--ease), transform .26s var(--ease); }
.toast.on { opacity: 1; transform: none; pointer-events: auto; } .toast b { display: block; } .toast .s { color: var(--muted); font-size: 12px; }
.toast .x { width: 22px; height: 22px; padding: 0; border: 0; border-radius: 6px; background: none; color: var(--faint); font-size: 16px; line-height: 1; } .toast .x:hover { color: var(--text); background: rgba(255,255,255,.08); }
.shows { display: grid; gap: 18px; align-content: start; } .shows h4 { margin: 0 0 7px; font: 600 12px var(--sans); color: var(--muted); } .shows p { margin: 0; color: var(--text2); }
.field { flex-wrap: wrap; row-gap: 6px; } .field .f-l { flex: 1 1 150px; } .field > .seg, .field > .inp { margin-left: auto; }
.osn { width: 100%; display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 10px; background: #2b2d33; border: 1px solid rgba(255,255,255,.1); color: #f1f1f1; font: 13px/1.4 "Segoe UI", system-ui, sans-serif; box-shadow: 0 10px 30px rgba(0,0,0,.5); } .osn b { display: block; } .osn span.s { color: #b9bcc4; font-size: 12px; }
.tabt { display: inline-flex; align-items: center; gap: 8px; padding: 7px 14px; border-radius: 9px 9px 0 0; background: var(--raised); border: 1px solid var(--line2); border-bottom: 0; color: var(--text2); } .tabt .mark, .osn .mark { width: 20px; height: 20px; border-radius: 6px; } .osn .mark { width: 30px; height: 30px; border-radius: 9px; } .tabt .mark svg { width: 12px; height: 12px; }
.ta-ok { color: var(--good); font-size: 12px; } .ta-warn { color: var(--warn); font-size: 12px; } .mk.fill[data-take] { cursor: pointer; }

/* ---------- buy: every place that sells a piece, and the shopping list ---------- */
.p-buy { grid-template-columns: minmax(0, 1fr); } .p-buy > .pane { height: 100%; } .gbuy { grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); }
@container (max-width: 1240px) { .pane.stk { grid-template-columns: minmax(0, 1fr); } .pane.stk .minc { min-height: 260px !important; } }
.t tr.pick { cursor: pointer; } .t tbody tr.sel, .t tbody tr.sel:hover { background: var(--brand-bg); box-shadow: inset 2px 0 0 var(--brand); }
.rec { display: flex; align-items: center; gap: 10px 18px; flex-wrap: wrap; } .rec .hero { white-space: nowrap; } .rec-t { flex: 1; min-width: 240px; color: var(--text2); line-height: 1.5; } .rec-t b { color: var(--text); } .rec-b { display: flex; gap: 8px; }
.wl { display: grid; grid-template-columns: minmax(0, 1fr) 44px 72px 76px 104px; align-items: center; gap: 8px; padding: 6px 14px; border-top: 1px solid var(--line); white-space: nowrap; color: var(--text2); transition: background .14s; }
.wl:hover { background: rgba(255,255,255,.028); } .wl b { color: var(--text); } .wl .n { text-align: right; }
.wl.h { color: var(--faint); font: 650 12px var(--sans); } .wl.h:hover { background: none; }
.wl.cheap b.num { color: #c9bfff; } .wl.on { background: var(--brand-bg); box-shadow: inset 2px 0 0 var(--brand); }
.wl-a { display: flex; gap: 6px; justify-content: flex-end; }
.wl-s { padding: 4px 14px 9px; color: var(--text2); font-size: 12px; line-height: 1.5; } .wl-s b { color: var(--text); } .wl-s.foot { padding-top: 9px; border-top: 1px solid var(--line); color: var(--muted); }
.stop { display: flex; gap: 10px; padding: 9px 14px; border-top: 1px solid var(--line); } .stop:first-child { border-top: 0; }
.stop-n { width: 22px; height: 22px; flex: none; border-radius: 50%; display: grid; place-items: center; background: var(--raised); border: 1px solid var(--line2); font: 650 12px var(--sans); color: var(--text2); }
.stop-m { flex: 1; min-width: 0; } .stop-h { display: flex; align-items: center; gap: 10px; white-space: nowrap; flex-wrap: wrap; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 7px; }
.chip { display: inline-flex; align-items: center; gap: 7px; height: 28px; padding: 0 4px 0 6px; border-radius: 8px; background: var(--raised); border: 1px solid var(--line); white-space: nowrap; font-size: 12px; color: var(--text2); }
.chip .it { margin: 0; } .chip b { color: var(--text); }
.chip .x { width: 18px; height: 18px; padding: 0; border: 0; border-radius: 5px; background: none; color: var(--faint); font-size: 15px; line-height: 1; } .chip .x:hover { color: var(--text); background: rgba(255,255,255,.08); }

/* ---------- is it safe to be open, lot sizes ---------- */
.safe { display: flex; gap: 14px; align-items: flex-start; color: var(--text2); line-height: 1.5; } .safe b { color: var(--text); } .safe p { margin: 0 0 6px; } .safe p:last-child { margin: 0; }
.lamp { width: 12px; height: 12px; margin-top: 4px; border-radius: 50%; flex: none; background: var(--good); box-shadow: 0 0 0 4px var(--good-bg); } .lamp.warn { background: var(--warn); box-shadow: 0 0 0 4px var(--warn-bg); }
.hb-t { display: inline-block; width: 96px; margin-right: 8px; vertical-align: middle; text-align: left; }
.hb { display: block; height: 8px; min-width: 3px; width: var(--w); border-radius: 0 4px 4px 0; background: var(--s-gold); animation: growx .7s var(--ease) both; transform-origin: left; }

/* ---------- Torn's own pages: a grey stand-in, our marks on top ---------- */
.tn { display: grid; grid-template-columns: minmax(0, 1fr) 304px; gap: 14px; align-items: start; min-height: 100%; padding: 14px; border-radius: 12px; background: #191919; border: 1px solid #2b2b2b; color: #ddd; font: 12px/1.4 Arial, Helvetica, sans-serif; animation: rise .46s var(--ease) both; }
.tn-cap { margin: 0 0 10px; color: #8d8d8d; }
.tn-t { display: flex; align-items: center; gap: 6px 10px; flex-wrap: wrap; padding: 7px 10px; border-radius: 5px 5px 0 0; background: linear-gradient(180deg, #444, #333); color: #fff; font-weight: bold; white-space: nowrap; }
.tn-t i { font-style: normal; font-weight: normal; color: #bbb; }
.tn-b { position: relative; margin-bottom: 12px; padding: 10px; border-radius: 0 0 5px 5px; background: #333; }
.tn-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(178px, 1fr)); gap: 18px 8px; padding-top: 8px; }
.tn-c { position: relative; display: flex; flex-direction: column; gap: 3px; padding: 8px; border-radius: 4px; background: #2a2a2a; border: 1px solid #3a3a3a; }
.tn-c .im { height: 50px; display: grid; place-items: center; } .tn-c .im img { width: 100px; height: 50px; object-fit: contain; }
.tn-c .nm { font-weight: bold; } .tn-c .pr { color: #9c0; font-weight: bold; } .tn-c .qt { color: #999; }
.tn-btn { height: 24px; padding: 0 12px; display: inline-grid; place-items: center; border-radius: 3px; background: #555; color: #eee; font-weight: bold; white-space: nowrap; } .tn-c .tn-btn { margin-top: 4px; background: #444; color: #ccc; font-weight: normal; }
.tn-in { display: inline-flex; align-items: center; height: 24px; min-width: 76px; padding: 0 8px; border-radius: 3px; background: #1b1b1b; border: 1px solid #444; color: #ccc; }
.tn-ex { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: #bbb; white-space: nowrap; }
.tn-row { display: flex; align-items: center; gap: 10px; min-height: 36px; padding: 5px 10px; border-top: 1px solid #3a3a3a; background: #2a2a2a; white-space: nowrap; } .tn-row:first-child { border-top: 0; } .tn-row { flex-wrap: wrap; row-gap: 4px; }
.tn-row .it, .tn-th .it { margin: 0; border-bottom: 0; background: none; } .tn-row .q { color: #999; } .tn-row .mk { margin-left: auto; }
.tn-2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; } .tn-2 h5 { margin: 0; padding: 7px 10px; background: #222; color: #ccc; font-size: 12px; border-radius: 4px 4px 0 0; }
.tn-ths { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 10px; }
.tn-th { position: relative; display: flex; flex-direction: column; align-items: center; gap: 2px; width: 58px; padding: 6px 0 4px; border-radius: 4px; background: #2a2a2a; border: 1px solid #3a3a3a; color: #bbb; }
.tn-lr { display: grid; grid-template-columns: 90px 90px 130px 60px minmax(0, 1fr); align-items: center; gap: 10px; min-height: 32px; padding: 4px 10px; border-top: 1px solid #3a3a3a; background: #2a2a2a; white-space: nowrap; } .tn-lr.h { background: #222; color: #999; min-height: 26px; } .tn-lr .mk { justify-self: start; }
.tn-post { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 12px; } .tn-av { padding: 10px; border-radius: 4px; background: #2a2a2a; color: #bbb; text-align: center; } .tn-av span { display: block; width: 60px; height: 60px; margin: 0 auto 6px; border-radius: 4px; background: #222; }
.mk-ring { box-shadow: inset 0 0 0 2px var(--need); } .mk-ring.top { box-shadow: inset 0 0 0 2px var(--need), 0 0 14px rgba(76,157,255,.45); } .mk-ring.ahead { box-shadow: inset 0 0 0 1px var(--warn); }
.mk { display: inline-flex; align-items: center; gap: 5px; height: 20px; padding: 0 8px; border-radius: 999px; font: 600 12px/1 var(--sans); white-space: nowrap; background: #10233b; color: #cfe5ff; border: 1px solid rgba(76,157,255,.5); box-shadow: 0 2px 8px rgba(0,0,0,.5); }
.mk b { color: #fff; } .mk.c { position: absolute; top: -11px; right: 6px; z-index: 2; } .mk.b { position: absolute; bottom: -11px; right: 6px; z-index: 2; }
.mk.ahead { background: #2a2110; color: var(--warn); border-color: rgba(245,165,36,.45); } .mk.grey { background: #23262c; color: #cfd4dc; border-color: rgba(255,255,255,.14); } .mk.good { background: #10261a; color: var(--good); border-color: rgba(63,207,107,.45); }
.mk.fill { background: var(--brand); color: #fff; border-color: transparent; }
.ta { position: sticky; top: 0; display: flex; flex-direction: column; border-radius: 12px; background: var(--panel); border: 1px solid var(--line2); box-shadow: 0 16px 40px rgba(0,0,0,.5); color: var(--text); font: 13px/1.45 var(--sans); overflow: hidden; }
.ta-h { display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 8px 0 10px; border-bottom: 1px solid var(--line); background: var(--rail-bg); white-space: nowrap; }
.ta-h .mark { width: 24px; height: 24px; border-radius: 7px; } .ta-h .mark svg { width: 15px; height: 15px; } .ta-h b { font: 650 13px var(--disp); margin-right: auto; } .ta-h span.w { color: var(--muted); font-size: 12px; }
.ta-b { display: grid; gap: 8px; padding: 10px 12px 12px; }
.ta-b h4 { margin: 0; display: flex; align-items: baseline; gap: 8px; font: 650 13px var(--sans); white-space: nowrap; } .ta-b h4 span { margin-left: auto; color: var(--muted); font-weight: 400; font-size: 12px; }
.ta-l { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 2px 8px; padding: 6px 8px; border-radius: 9px; background: var(--raised); border: 1px solid var(--line); }
.ta-l .it { margin: 0; } .ta-l b { font-weight: 600; } .ta-l .s { grid-column: 1 / -1; color: var(--muted); font-size: 12px; } .ta-l.dim b { color: var(--muted); font-weight: 500; }
.ta-kv { display: flex; align-items: baseline; gap: 10px; font-size: 12px; color: var(--muted); } .ta-kv > :last-child { margin-left: auto; color: var(--text); text-align: right; } .ta-kv.sep { padding-top: 8px; border-top: 1px solid var(--line); }
.ta-n { color: var(--muted); font-size: 12px; line-height: 1.5; } .ta-n b { color: var(--text2); }
.ta-hold { padding: 8px 10px; border-radius: 9px; background: var(--warn-bg); border: 1px solid rgba(245,165,36,.4); color: var(--text2); font-size: 12px; line-height: 1.5; } .ta-hold b { color: var(--warn); }
.ta .msg { font-size: 12px; padding: 7px 10px; } .ta-btns { display: flex; gap: 6px; flex-wrap: wrap; }

/* page grids */
.g2 { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); } .g2r { grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); } .g57 { grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); } .g11 { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .g1 { grid-template-columns: minmax(0, 1fr); }
.p-tabs { grid-template-columns: minmax(0, 1fr); } .p-tabs > .pane { height: 100%; }
.minc { min-height: 180px; }

@keyframes rise { from { opacity: 0; transform: translateY(8px); } }
@keyframes draw { to { stroke-dashoffset: 0; } }
@keyframes fade { from { opacity: 0; } }
@keyframes growy { from { transform: scaleY(0); } }
@keyframes growx { from { transform: scaleX(0); } }
@keyframes ping { 0% { transform: scale(.6); opacity: .9; } 70%, 100% { transform: scale(1.5); opacity: 0; } }
@keyframes flash { 0% { background: rgba(245,165,36,.28); border-color: rgba(245,165,36,.6); } }
@keyframes tape { to { transform: translateX(-50%); } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } svg .ln.draw { stroke-dashoffset: 0; } }
`;
