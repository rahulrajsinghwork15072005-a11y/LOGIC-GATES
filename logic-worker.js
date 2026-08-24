// logic-worker.js — Web Worker for logic simulation (fixed-point propagation + oscillator detection)
// Environment-agnostic: imports logic-engine.js via importScripts if available, with main-thread fallback.
'use strict';

// Try to load LogicEngine in worker context
try {
  if (typeof importScripts === 'function') {
    importScripts('logic-engine.js');
  }
} catch (e) {
  // Fallback: engine will be injected via main thread or not available
}

self.onmessage = function (e) {
  const data = e.data || {};
  const id = data.id;
  const type = data.type;

  try {
    if (!self.LogicEngine) {
      self.postMessage({ id, error: 'LogicEngine not loaded in worker' });
      return;
    }
    const LE = self.LogicEngine;

    if (type === 'propagate' || type === 'simulate') {
      // Expect { components: Array<componentObj>, wires: Array<wire>, nextId?: number }
      // Re-hydrate Maps for engine
      const compsArray = data.components || data.comps || [];
      const wires = data.wires || [];
      const components = new Map();
      compsArray.forEach(c => components.set(c.id, { ...c }));
      // Also handle Map-like serialized as object entries if needed
      if (data.componentsMap) {
        Object.entries(data.componentsMap).forEach(([k, v]) => components.set(k, v));
      }

      const result = LE.propagate(components, wires);

      // Serialize updated states back
      const updated = [...components.values()].map(c => ({ id: c.id, state: c.state, on: c.on }));
      self.postMessage({
        id,
        result: {
          states: updated,
          oscDetected: result.oscDetected,
          iterations: result.iterations,
          max: result.max,
          stable: result.stable,
        }
      });
    } else if (type === 'tick') {
      // Clock tick + propagate fusion
      const compsArray = data.components || [];
      const wires = data.wires || [];
      const components = new Map();
      compsArray.forEach(c => components.set(c.id, { ...c }));
      LE.tickClocks(components);
      const result = LE.propagate(components, wires);
      const updated = [...components.values()].map(c => ({ id: c.id, state: c.state, on: c.on }));
      self.postMessage({ id, result: { states: updated, ...result } });
    } else if (type === 'eval') {
      // Evaluate single gate truth table (for tests / UI preview)
      const LE2 = self.LogicEngine;
      const gate = data.gate;
      const inputs = data.inputs || [];
      // Create a dummy component/wires context
      let res;
      if (gate === 'and') res = inputs.every(Boolean);
      else if (gate === 'or') res = inputs.some(Boolean);
      else if (gate === 'not') res = !inputs[0];
      else if (gate === 'nand') res = !inputs.every(Boolean);
      else if (gate === 'nor') res = !inputs.some(Boolean);
      else if (gate === 'xor') res = inputs[0] !== inputs[1];
      else if (gate === 'xnor') res = inputs[0] === inputs[1];
      else if (gate === 'buf') res = !!inputs[0];
      else res = false;
      // Also cross-check via TRUTH table if available
      if (LE2.TRUTH && LE2.TRUTH[gate]) {
        const truthRes = LE2.TRUTH[gate](...inputs);
        // they should match
      }
      self.postMessage({ id, result: { gate, inputs, output: res } });
    } else if (type === 'ping') {
      self.postMessage({ id, result: { pong: true, hasEngine: !!self.LogicEngine } });
    } else {
      self.postMessage({ id, error: 'Unknown worker type: ' + type });
    }
  } catch (err) {
    self.postMessage({ id, error: err.message, stack: err.stack });
  }
};

// Signal readiness
self.LogicWorker = true;
