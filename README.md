# Logic Forge — Digital Circuit Simulator

> **One line:** A **browser-based digital-logic circuit simulator** — drop switches, logic gates and outputs on an infinite zoom/pan canvas, wire them, and watch 1/0 signals flow in real time (including clocks and oscillator detection).

> **Tech:** Plain HTML, CSS, JavaScript + HTML5 **Canvas**. No framework, no build, no server. Every module is **UMD** (works in browser, Web Worker, and Node).

**Live demo:** Open `index.html` via `http-server` (Worker requires http, not `file://`).  
**Author:** Rahul Raj Singh · **Version:** 2.0 · **Rebuild:** FAANG-level modularization (762-line single file → 8 engineered modules + tests)

---

## 30-second interview pitch

> “Logic Forge is a browser-based digital-circuit simulator. You place components — switches, AND/OR/NOT/XOR gates, LEDs, a 7-segment display — onto an infinite zoom/pan canvas, wire their ports together, and a **propagation engine** computes every signal until the circuit stabilises. The interesting engineering bit is that real circuits can have **feedback loops** (a wire that depends on its own output), so I solve the network by **iterating to a fixed point** with a safety cap, and if it never settles I flag it as an **oscillator** — exactly like a real latch wired wrong.”

---

## How it works (big picture)

```
 Components (Map)  ──┐
 Wires (array)    ──┤── propagate() ──► each gate's output recomputed
                     │     repeat until nothing changes (or oscillation)
                     ▼
                 draw on Canvas (components layer + wires layer)
```

The simulation is a **graph**: components are nodes (`Map`), wires are edges (array). “Running” the circuit means repeatedly asking every gate *what's your output given your inputs?* until the answers stop changing.

| Concept | What it means here |
|---|---|
| **Combinational logic + fixed-point iteration** | Re-evaluate all gates until outputs stop changing |
| **Oscillator / feedback detection** | If it never stabilises within `n*6+20` passes, flag it |
| **Graph model** | Components = nodes (`Map`), wires = edges (array) |
| **Data-driven components** | `CDEFS` describes each type's ports/symbol/size |
| **World ↔ screen transforms** | Enables infinite zoom & pan on a canvas |
| **Dual-canvas layering** | Wires and components on separate canvases for cheaper redraws |
| **Bitmask decoding** | 7-segment display packs 7 bits and matches a digit pattern |
| **Sequential logic (clock)** | A timed source that toggles, driving flip-flop-like behaviour |

---

## Architecture (FAANG-level)

Single-file `logic-simulator-v2.html` (762 lines) → **8 modules + tests**, same pattern as *Compiler Forge*:

```
index.html  → style.css + lab.css (Y2K maximalist: glitter, ticker, cyber-nav, hero terminal)
   ├─ logic-engine.js      (UMD: browser / Worker / Node) — CDEFS, truth tables, getPortPos,
   │                         getInput, evalComp, propagate (fixed-point + oscillator), SEG_PATTERNS,
   │                         world↔screen, snap, setOf/addAll, clock, serialize
   ├─ logic-worker.js      (Web Worker) — importScripts(logic-engine.js), onmessage {propagate|tick|eval|ping}
   ├─ viz.js               (UMD) — esc() XSS-safe, buildGateSVG / buildWireSVG / buildSeg7SVG / buildCircuitSVG
   ├─ logic-library.js     (UMD) — half_adder · sr_latch · clock_led · full_adder · seg7_demo · mux_2to1 · oscillator
   ├─ app-integration.js   — Worker lifecycle, simulateInWorker / simulateMainThread / propagateAsync, loadExampleAsync
   └─ script.js            — UI glue: dual-canvas drawing, pan/zoom/snap, drag, wire validation, clock interval,
                              prop panel, sim log, save/load (localStorage + JSON/SVG export), keyboard, overlay
tests/
   ├─ logic-engine.test.js — Node assert: truth tables exhaustive, propagate, oscillator, 7-seg, getPortPos
   ├─ viz.test.js          — Node assert: esc XSS, SVG builders
   └─ run-tests.js         — runner (mirrors compiler-forge)
```

**UMD wrapper** (every engine module):

```js
(function(root,factory){
  const api=factory();
  if(typeof self!=='undefined') self.LogicEngine=api;   // Worker & browser
  if(typeof window!=='undefined') window.LogicEngine=api;
  if(typeof module!=='undefined'&&module.exports) module.exports=api; // Node
})(this,function(){ /* ... */ return { ... } });
```

**Worker** (`logic-worker.js`) is environment-agnostic:

```js
try{ if(typeof importScripts==='function') importScripts('logic-engine.js'); }catch(e){}
self.onmessage = e => {
  const {id,type,components,wires}=e.data;
  const comps=new Map(components.map(c=>[c.id,c]));
  const r=LogicEngine.propagate(comps,wires);
  self.postMessage({id, result:{states:[...comps.values()], ...r}});
};
```

`app-integration.js` wraps the Worker with a **timeout fallback** (2.5 s) to main-thread `propagate` so `file://` or slow workers never hang.

---

## File-by-file walkthrough

### `index.html`
Y2K shell: `glitterCanvas` + `bgCanvas` + ticker, `cyber-nav` (dark toggle, kbd badge, mobile drawer), **hero** (badge, gradient title, terminal typewriter, stat pills), `token-strip`, then sections:
- `#concepts` (6 phase-cards: fixed-point, oscillator, graph, world↔screen, 7-seg, clock)
- `#simulator` (the lab: toolbar + left palette + `canvas-wrap` with two canvases + `osc-warn` + `zoom-ind` + SVG preview)
- `#library` (grid rendered from `LogicLibrary.list()`)
- `#truth` (Viz-rendered truth tables)
- `#architecture` (module map + file-by-file + interview Q&A)
- `#overlay` (START screen mirroring v2), `#tip`, `scrollProgress`, `footer`

Load order: `logic-engine.js` → `logic-library.js` → `viz.js` → `app-integration.js` → `script.js`.

### `style.css`
Y2K maximalist theme ported from *Compiler Forge* (hot-pink `#FF2D9B`, electric-lime `#CCFF00`, y2k-blue `#00BFFF`, y2k-purple `#9B30FF`, chrome, deep-black). Provides ticker animation, cyber-nav, hero, token-strip, section headers, phase-cards, deep-cards, code-blocks, footer, glitter. **Unmodified** from Compiler Forge to guarantee visual parity.

### `lab.css`
Simulator-specific (complements `style.css`): `.lab-container`, `.simulator-layout` (flex: left-panel 210 px + canvas flex), `.comp-btn` (sel → lime glow), `.clock-ctrl`, `.prop-panel`, `.sim-log`, `#canvas-wrap` (`#main-canvas` z2 + `#wire-canvas` z3), `#osc-warn` (gradient pill), `#zoom-ind`, `.sim-toolbar` + `.tool-btn`, `#overlay`/`#tip`, `.truth-grid`, responsive breakpoint (900 px → stacked).

### `logic-engine.js` — **the brain**
*Mirrors `grammar-engine.js` from Compiler Forge* (`computeFirst`/`computeFollow` fixed-point ↔ `propagate` fixed-point).

- **Constants:** `GW=72, GH=56, SNAP=16`.
- **`SEG_PATTERNS[10][7]`** — a-g on/off for digits 0-9.
- **`CDEFS`** — one object per type: `{label, ins, outs, sym, w, h, color}`. Adding a gate = new entry.
- **`setOf` / `addAll`** — small Set helpers (spec parity with Compiler Forge; used in tests, also handy for future event-driven queue).
- **`snap`, `worldToScreen`, `screenToWorld`** — pure geometry.
- **`createComponent(type, wx, wy, id)`** — snaps `wx - w/2`, sets `state/on`, `clockPhase`.
- **`getPortPos(components, id, port)`** — flexible overload: `Map` first, or `comp` object. Out at `(x+w+5, y+h/2)`, ins distributed `h/(n+1)`. Used for drawing & hit-testing.
- **`getInput(compId, port, wires, components)`** — `wires.find(to===port)` → `components.get(from.id).state`, else `false` (unconnected = LOW).
- **`evalComp(c, wires, components)`** — **truth tables** (line-by-line spec):
  ```js
  switch → c.on
  const1 → true, const0 → false, clock → c.state
  led/probe/seg7 → getInput(in0)   // seg7 draws all 7 separately
  and → inputs.every(Boolean)
  or  → inputs.some(Boolean)
  not → !inputs[0]
  buf → !!inputs[0]
  nand→ !inputs.every(Boolean)
  nor → !inputs.some(Boolean)
  xor → inputs[0]!==inputs[1]
  xnor→ inputs[0]===inputs[1]
  ```
- **`propagate(components, wires)`** — **fixed-point** (exact line-by-line `propagate()` from `02b`):
  1. Reset non-sources (`switch/const/clock` keep value, others `false`).
  2. `MAX = size*6+20`, `changed=true, iter=0`, `while(changed && iter<MAX){ changed=false; iter++; for each c: ns=evalComp(c); if(ns!==state){state=ns; changed=true} }`
  3. If `iter>=MAX` and still changing → `oscDetected=true` (re-check one extra sweep to avoid false positive on exactly-MAX stable).
  4. Return `{oscDetected, iterations, max, stable}` — UI shows warning and redraws.
- **`tickClocks(components)`** — flips each `clock.state/on`.
- **`bitsToValue / valueToDigit / decodeSeg7 / getSegBits`** — 7-seg helpers (bit-pack `1<<(6-i)`).
- **`serialize / deserialize`** — `Map↔Array` for `localStorage`/Worker `postMessage`.
- **`TRUTH`** — `and/or/not/nand/nor/xor/xnor/buf` lambdas for docs/tests.
- **UMD export:** `{GW,GH,SNAP, SEG_PATTERNS, CDEFS, TRUTH, setOf, addAll, snap, worldToScreen, screenToWorld, createComponent, getPortPos, getPortPosForComp, getInput, evalComp, propagate, simulate, tickClocks, bitsToValue, valueToDigit, decodeSeg7, getSegBits, serialize, deserialize}`.

### `logic-worker.js`
Off-thread simulation. `importScripts('logic-engine.js')` guarded. `onmessage` handles `propagate`/`simulate` (hydrate `Map`, call `LE.propagate`, return `{states, oscDetected, iterations, max, stable}`), `tick` (toggle clocks then propagate), `eval` (gate truth preview), `ping`. Errors posted back. `LogicWorker=true` flag.

### `viz.js`
XSS-safe SVG renderer (mirrors `viz.js` from Compiler Forge: `esc` + `buildParseTreeSVG` → `buildCircuitSVG`).

- **`esc(str)`** — `replace(/[&<>"']/g, entity)` → XSS-safe everywhere.
- **`buildGateSVG(comp, CDEFS)`** — rect shadow, body (led glow), border (powered→green), symbol (switch ON/OFF, clock Hz, probe HIGH/LOW, seg7 placeholder, gate sym+label), port dots (powered green). Escapes all labels/symbols.
- **`buildWireSVG(from,to,on,selected,pending)`** — bezier `M→C` with `Math.max(30, |dx|*0.4)` control points, `stroke #22c55e` when HIGH + drop-shadow glow, dashed when pending, dots at ends.
- **`buildSeg7SVG(comp, bits, CDEFS)`** — 7 rects at `(ox+…)` , `fill #dc2626` when bit=1 else translucent, footer digit decoded via `LogicEngine.decodeSeg7` or local patterns.
- **`buildCircuitSVG(components, wires)`** — computes bounds, draws dot-grid rect, wires (behind), gate groups with ports (sig vs connected vs floating), footer `n comps · m wires · k HIGH`. All interpolated strings pass `esc`. Returns complete `<svg>` string.
- **`renderCircuit(container, components, wires)`** / `buildAutomatonSVG` / `renderAutomaton` / `drawCircuitCanvas` — DOM adapters + canvas fallback for legacy `script.js`.
- **UMD export:** `{esc, buildGateSVG, buildWireSVG, buildSeg7SVG, buildCircuitSVG, renderCircuit, buildAutomatonSVG, renderAutomaton, drawCircuitCanvas}`.

### `logic-library.js`
Circuit catalogue (mirrors `grammar-library.js`: `grammars/get/list/injectExample` → `circuits/get/list/injectExample/instantiate`).

```js
circuits = {
  half_adder: {name,description, comps:[{type,x,y}×7], wires:[{from:{idx,port},to:{idx,port}}×6], build(ctx){…}},
  sr_latch:   {… 2 NOR cross-coupled …},
  clock_led:  {… clock→NOT→LED …},
  full_adder: {… 3 switches, 2 XOR, 2 AND, OR …},
  seg7_demo:  {… 7 switches → seg7 …},
  mux_2to1:   {… (A∧¬S)∨(B∧S) …},
  oscillator: {… NOT loop (intentional oscillator) …}
}
```

Helpers: `get(id)`, `list()→[{id,name,description}]`, `injectExample(id)`, `instantiate(name, LE)` (hydrates `Map`+`wires` via `LE.createComponent`, respects `snap`). Used by `app-integration.js` and `script.js` `loadExample`.

### `app-integration.js`
Glue (mirrors `app-integration.js` from Compiler Forge: Worker promise map + main-thread fallback).

- Detects `LogicEngine/Viz/LogicLibrary` via `window` or `require`.
- **`initWorker()`** — `new Worker('logic-worker.js')` if `Worker` exists and not `file:`; wires `onmessage` → `pending.get(id).resolve`; `onerror` → null fallback.
- **`simulateInWorker(components,wires)`** — serialises `Map→Array`, posts `{id,type:'propagate',components,wires}`, 2.5 s timeout → `simulateMainThread`.
- **`simulateMainThread(components,wires)`** — `LE.propagate` → `{states, oscDetected,…}`.
- **`propagateAsync(components,wires)`** — `await simulateInWorker` then patch `Map` states back, return `{oscDetected,…}`.
- **`loadExampleAsync(name,components,wires,nextIdRef)`** — clears `Map/array`, calls `LogicLibrary.get(name).build({createComp,addWire})` via `LE.createComponent`.
- **`patchGlobals()`** — exposes `window.LE / VizMod / LogicLib / simulateInWorker / propagateAsync / getEngine` for `script.js`.
- **UMD-ish export:** `window.AppIntegration` + console log.

### `script.js`
UI lab (refactored from `logic-simulator-v2.html` `<script>`). Key sections:

- **Engine integration** — `let LE = window.LogicEngine || null` → `GW/GH/SNAP = LE?.GW ?? 72` → `CDEFS = LE?.CDEFS ?? {…fallback…}` → every core function delegates to `LE` if present (`worldToScreen`, `createComp`, `propagate`, `evalComp`, `getInput`, `getPortPos`), else inline fallback identical to `02b` line-by-line.
- **State** — `components:Map, wires:[], nextId, selCompType, mode, pendingWire, selectedId, dragging, zoom/pan, mouse, clockHz, clockInterval, oscDetected`, plus `canvas/ctx/wireCanvas/wctx/wrap` refs.
- **`propagate()`** — calls `LE.propagate(components,wires)` when available, else inline reset+loop. Then `drawComponents/drawWires/updateProps/updateSimStatus`, sets `#osc-warn` display and `simLog('⚠ Oscillator')`.
- **`evalComp` / `getInput` / `getPortPos`** — thin wrappers.
- **Drawing** — `drawComponents` (dot grid + `drawComp` per node), `drawComp` (shadow, body, border, LED glow, symbol switch/clock/probe/seg7/gate, port dots green when HIGH), `drawSeg7` (reads 7 bits via `LE.getSegBits` or `getInput`, bit-packs, looks up `SEG_PATTERNS`, draws 7 rects), `drawWires` (clear, scale, for each wire bezier, pending wire to mouse), `drawWirePath` (bezier + glow + dots).
- **Clock** — `startClock` (`setInterval(1000/Hz/2)` → `LE.tickClocks` or manual toggle → `propagate`), `setClockHz`, `stopClock`.
- **Input** — `attachCanvasEvents`: `mousedown` (middle/alt→pan, right→`rightClickAction`, port→`pendingWire`, comp→select+drag+toggle switch, empty→`createComp`), `mousemove` (pan, drag with `snap`, pendingWire, tooltip `#tip`), `mouseup` (end pan/drag, `addWire` if port), `wheel` (zoom factor 1.12, clamp 0.2–4, update `#zoom-ind`), `contextmenu` prevent. Helpers `findPort` (`Math.hypot<10`), `findComp` (bbox), `ptSeg`.
- **`addWire`** — normalise `out→in`, reject `in→in`, dupe check, push, `propagate`.
- **UI** — `setMode`, `selComp`, `deleteSelected/Comp`, `clearAll`, `updateProps`, `updateSimStatus` (● RUNNING if any clock), `simLog` (cap 50, class `on/err`), `saveCircuit/loadCircuit` (`LE.serialize/deserialize` or manual, `localStorage.logicforge_save`), `exportJSON`/`exportSVG` (Blob download + Viz preview), `loadExample` (via `AppIntegration.loadExampleAsync` or `LogicLibrary.build` or legacy fallbacks).
- **Keyboard** — `1/2/3/4 → switch/clock/const`, `A/O/N/L → and/or/not/led`, `W/S → wire/select`, `Del/Backspace → delete`, `Esc → cancel wire`, `? → kbd modal`.
- **Resize** — `resizeCanvases` (`getBoundingClientRect`, set canvas width/height, redraw).
- **Y2K chrome** — `initHeroTerminal` (typewriter), `initBgCanvas` (radial gradient shimmer), `initGlitter` (mousemove particles), `initDarkToggle`, `initMobileNav`, `initScrollProgress`, `renderTruthTables` (8 cards), `renderLibrary` (cards from `LogicLibrary.list()`).
- **`init()`** — bind refs, `attachCanvasEvents`, `resizeCanvases`, `startClock`, `loadExample('half_adder')`, Y2K inits, toast. Exported as `window.LogicForgeUI`.

### `tests/*`
**Node `assert`** proofs (same harness as Compiler Forge):

- **`logic-engine.test.js`** — UMD checks, `CDEFS` (13 types, ins/outs), `setOf/addAll`, `snap/world↔screen`, `createComponent`, `getPortPos` (Map+comp overloads), **truth tables exhaustive** (AND/OR/NOT/NAND/NOR/XOR/XNOR/BUF plus LED/probe), **propagation** (switch→LED, AND chain, **SR latch stable**, **NOT-loop oscillator** with `iterations==max`), **7-seg** (0-9 round-trip, `decodeSeg7`), **clock**, `TRUTH` map, `serialize/deserialize`.

- **`viz.test.js`** — UMD, `esc` XSS (`<script>→&lt;script&gt;`), `buildGateSVG`/`buildWireSVG`/`buildSeg7SVG` return `<svg>` with correct colours, `buildCircuitSVG` for a `switch→and→led` circuit (stable, non-empty) plus XSS guard (malicious id does not inject `<script>`), `renderCircuit` container.

- **`run-tests.js`** — sequential `execSync node logic-engine.test.js && node viz.test.js`, summary.

---

## Interview Guide — deeper

**Fixed-point vs topological sort:**
> “A combinational network with feedback has no topological order. Re-evaluating every gate until quiescence is simple, correct, and O(n·iter). For n= hundreds it’s instant. Production logic simulators use event queues — only gates whose inputs changed — but that’s an optimisation, not a different correctness property.”

**Oscillator example:**
> “Wire `NOT.out → NOT.in` with no driver. Start state `false` → `eval` gives `true` → next pass `false` … never settles. `MAX=1*6+20=26`, we loop 26 times, `oscDetected=true`, UI shows red pill. Same for SR latch `S=R=1`.”

**Dual-canvas justification:**
> “`wire-canvas` is `pointer-events:none; z-index:3` over `main-canvas` z2. On `propagate`, we clear both, but wires are redrawn more often (glow). Separating avoids overdraw and lets us `scale(zoom)` once per layer.”

**XSS:**
> “Any render path that touches `innerHTML` goes through `Viz.esc`. `buildCircuitSVG` escapes every interpolated `label/sym/id`. Even a component with id `cBad"><svg onload=alert(1)>` is rendered as `cBad&quot;&gt;&lt;svg…` → inert text. Tests prove it.”

**UMD + Worker:**
> “`(function(root,factory){…})(this,function(){…})` checks `self` (Worker), `window` (browser), `module.exports` (Node). Worker loads via `importScripts` inside try/catch so `file://` still works via fallback.”

---

## Setup & Verification

```bash
# 1. Serve (Worker needs http, not file://)
npx http-server -p 5502 -c-1
# open http://localhost:5502

# 2. Lint (syntax check)
node --check logic-engine.js
node --check logic-worker.js
node --check viz.js
node --check logic-library.js
node --check app-integration.js
node --check script.js

# 3. Tests (proofs)
node tests/run-tests.js
# or
npm test
npm run test:engine
npm run test:viz
```

---

## Why this is FAANG-level vs v2

| v2 (762-line single file) | Forge 2.0 (this repo) |
|---|---|
| Inline `<style>` | `style.css` (Y2K theme) + `lab.css` (sim layout) |
| Inline `<script>` | `logic-engine.js` UMD + `logic-worker.js` + `viz.js` + `logic-library.js` + `app-integration.js` + `script.js` |
| No tests | `tests/` with truth-table + propagation + oscillator + 7-seg + XSS proofs |
| Bugs hidden | `node --check` + `http-server` fetch + `git push` verified |
| Hard to extend | `CDEFS` catalogue → new gate = one line |

---

## Acknowledgements

- Interview guides at `Games & Interactive Tools/02 - Logic Forge` and `02b` (line-by-line) — this README mirrors their structure so every answer maps to a file:line.
- Compiler Forge (`Compiler website/`) pattern for UMD/Worker/Viz/library (EPS/EOF ↔ gate truth tables, `computeFirst/ComputeFollow` fixed-point ↔ `propagate` fixed-point).

© 2026 Rahul Raj Singh — Logic Forge II
