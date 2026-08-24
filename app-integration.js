// app-integration.js — glue that connects UI (script.js) to LogicEngine, Viz, LogicLibrary, and Web Worker
// Provides environment-agnostic loading and fallback for file:// etc.
'use strict';

(function () {
  const LE = (typeof LogicEngine !== 'undefined' ? LogicEngine : (typeof require !== 'undefined' ? (() => { try { return require('./logic-engine.js'); } catch(e){return null;} })() : null));
  const VizMod = (typeof Viz !== 'undefined' ? Viz : (typeof require !== 'undefined' ? (() => { try { return require('./viz.js'); } catch(e){return null;} })() : null));
  const Lib = (typeof LogicLibrary !== 'undefined' ? LogicLibrary : (typeof require !== 'undefined' ? (() => { try { return require('./logic-library.js'); } catch(e){return null;} })() : null));

  // ── Worker management ──────────────────────────────────────────
  let worker = null;
  let workerId = 0;
  const pending = new Map();

  function initWorker() {
    if (worker) return worker;
    try {
      if (typeof Worker !== 'undefined' && typeof window !== 'undefined' && window.location.protocol !== 'file:') {
        worker = new Worker('logic-worker.js');
        worker.onmessage = (e) => {
          const { id, result, error } = e.data || {};
          const entry = pending.get(id);
          if (entry) {
            pending.delete(id);
            if (error) entry.reject(new Error(error));
            else entry.resolve(result);
          }
        };
        worker.onerror = (e) => {
          console.warn('Logic worker error, falling back to main thread', e);
          worker = null;
        };
      }
    } catch (e) {
      console.warn('Worker init failed, using main-thread fallback', e);
      worker = null;
    }
    return worker;
  }

  function simulateInWorker(components, wires) {
    const w = initWorker();
    // Serialize Map → array
    const compsArray = [...components.values()].map(c => ({ ...c }));
    if (!w || !LE) {
      return Promise.resolve(simulateMainThread(components, wires));
    }
    return new Promise((resolve, reject) => {
      const id = ++workerId;
      pending.set(id, { resolve, reject });
      w.postMessage({ id, type: 'propagate', components: compsArray, wires });
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          console.warn('Worker timeout, fallback to main thread');
          resolve(simulateMainThread(components, wires));
        }
      }, 2500);
    });
  }

  function simulateMainThread(components, wires) {
    if (!LE) throw new Error('LogicEngine not loaded');
    // Clone? propagate mutates in place, so call directly
    const res = LE.propagate(components, wires);
    // Apply returned states? Already mutated
    const states = [...components.values()].map(c => ({ id: c.id, state: c.state, on: c.on }));
    return { states, oscDetected: res.oscDetected, iterations: res.iterations, max: res.max, stable: res.stable };
  }

  // Wrap engine's propagate with worker-aware variant that updates passed Map's states
  async function propagateAsync(components, wires) {
    try {
      const res = await simulateInWorker(components, wires);
      // Apply states back to original Map (if worker returned states)
      if (res.states) {
        res.states.forEach(s => {
          const c = components.get(s.id);
          if (c) { c.state = s.state; c.on = s.on !== undefined ? s.on : c.on; }
        });
      }
      return { oscDetected: res.oscDetected, iterations: res.iterations, max: res.max, stable: res.stable };
    } catch (e) {
      // Fallback to sync
      return simulateMainThread(components, wires);
    }
  }

  // ── Patch globals for script.js compatibility ────────────────────
  function patchGlobals() {
    if (typeof window === 'undefined') return;
    if (LE) window.LE = LE;
    if (VizMod) window.VizMod = VizMod;
    if (Lib) window.LogicLib = Lib;
    window.simulateInWorker = simulateInWorker;
    window.simulateMainThread = simulateMainThread;
    window.propagateAsync = propagateAsync;
    window.initLogicWorker = initWorker;
    // Provide adapter for script.js to use engine's helpers even if it has fallback inline logic
    window.getEngine = () => LE;
    window.getViz = () => VizMod;
    window.getLibrary = () => Lib;
  }

  // Also provide logic-library instantiate helper wrapper
  function loadExampleAsync(name, components, wires, nextIdRef) {
    // nextIdRef: { value: number } mutable counter
    if (!Lib || !LE) throw new Error('Library or Engine not loaded');
    const entry = Lib.get(name);
    if (!entry) throw new Error('Unknown circuit: ' + name);
    // Use build(ctx) if available
    components.clear();
    wires.length = 0;
    let nid = 1;
    function createComp(type, x, y) {
      const id = 'c' + nid++;
      const comp = LE.createComponent(type, x, y, id);
      // createComponent snaps center; but entry.build expects raw world center coords (original createComp snapped center)
      // LE.createComponent already does snap(wx - w/2), so we pass raw center as original did: wx,wy are click center
      // For library builds, original code used createComp('switch',100,100) where 100,100 is world center (?) Actually createComp does snap(wx - def.w/2)
      // So LE.createComponent with same wx,wy will match. We'll keep as is.
      // But note LE.createComponent's x,y are top-left snapped. That's correct.
      components.set(id, comp);
      return comp;
    }
    function addWire(from, to) {
      wires.push({ from: { ...from }, to: { ...to } });
    }
    if (entry.build) {
      entry.build({ createComp, addWire });
    } else {
      // declarative fallback
      const ids = [];
      entry.comps.forEach(cd => {
        const c = createComp(cd.type, cd.x + (LE.CDEFS[cd.type].w/2), cd.y + (LE.CDEFS[cd.type].h/2));
        ids.push(c.id);
      });
      entry.wires.forEach(wr => {
        wires.push({ from: { id: ids[wr.from.idx], port: wr.from.port }, to: { id: ids[wr.to.idx], port: wr.to.port } });
      });
    }
    if (nextIdRef) nextIdRef.value = nid;
    return { components, wires, nid };
  }

  window.AppIntegration = {
    initWorker, simulateInWorker, simulateMainThread, propagateAsync, patchGlobals, loadExampleAsync,
    get LE() { return LE; }, get Viz() { return VizMod; }, get Lib() { return Lib; },
  };

  // Auto-patch
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', patchGlobals);
    } else {
      patchGlobals();
    }
  } else if (LE) {
    // Node: expose
    if (typeof global !== 'undefined') global.AppIntegration = window.AppIntegration;
  }

  console.log('%c AppIntegration loaded — LE:' + !!LE + ' Viz:' + !!VizMod + ' Lib:' + !!Lib, 'color:#9B30FF;font-family:monospace');
})();
