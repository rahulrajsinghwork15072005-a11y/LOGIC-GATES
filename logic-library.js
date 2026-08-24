(function (root, factory) {
  const api = factory();
  if (typeof self !== 'undefined') self.LogicLibrary = api;
  if (typeof window !== 'undefined') window.LogicLibrary = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(this, function () {
  'use strict';

  // Each circuit is defined as a function that receives a context with createComp/addWire
  // For pure data/Node usage we also store declarative definitions { comps: [{type,x,y}], wires: [{from:{idx,port},to:{idx,port}}] }
  const circuits = {
    half_adder: {
      name: 'Half Adder',
      description: 'Two switches feeding XOR (sum) and AND (carry) → LEDs. Shows combinational arithmetic.',
      // Declarative layout (indices reference comps order)
      // Positions mirror original loadExample('half_adder')
      comps: [
        { type: 'switch', x: 100, y: 100 },
        { type: 'switch', x: 100, y: 200 },
        { type: 'xor',    x: 280, y: 120 },
        { type: 'and',    x: 280, y: 200 },
        { type: 'led',    x: 460, y: 120 },
        { type: 'led',    x: 460, y: 200 },
        { type: 'probe',  x: 460, y: 100 },
      ],
      wires: [
        { from: { idx: 0, port: 'out' }, to: { idx: 2, port: 'in0' } },
        { from: { idx: 1, port: 'out' }, to: { idx: 2, port: 'in1' } },
        { from: { idx: 0, port: 'out' }, to: { idx: 3, port: 'in0' } },
        { from: { idx: 1, port: 'out' }, to: { idx: 3, port: 'in1' } },
        { from: { idx: 2, port: 'out' }, to: { idx: 4, port: 'in0' } },
        { from: { idx: 3, port: 'out' }, to: { idx: 5, port: 'in0' } },
      ],
      build: function (ctx) {
        // ctx: { createComp(type,x,y), addWire(from,to) }
        const sw1 = ctx.createComp('switch', 100, 100);
        const sw2 = ctx.createComp('switch', 100, 200);
        const xor = ctx.createComp('xor', 280, 120);
        const and = ctx.createComp('and', 280, 200);
        const led_s = ctx.createComp('led', 460, 120);
        const led_c = ctx.createComp('led', 460, 200);
        ctx.createComp('probe', 460, 100); // unused probe (preserves original artefact)
        ctx.addWire({ id: sw1.id, port: 'out' }, { id: xor.id, port: 'in0' });
        ctx.addWire({ id: sw2.id, port: 'out' }, { id: xor.id, port: 'in1' });
        ctx.addWire({ id: sw1.id, port: 'out' }, { id: and.id, port: 'in0' });
        ctx.addWire({ id: sw2.id, port: 'out' }, { id: and.id, port: 'in1' });
        ctx.addWire({ id: xor.id, port: 'out' }, { id: led_s.id, port: 'in0' });
        ctx.addWire({ id: and.id, port: 'out' }, { id: led_c.id, port: 'in0' });
        return { sw1, sw2, xor, and, led_s, led_c };
      }
    },

    sr_latch: {
      name: 'SR Latch (NOR feedback)',
      description: 'Two NOR gates cross-coupled → LEDs Q and Q̅. Classic sequential logic with feedback loop. Set/Reset via switches.',
      comps: [
        { type: 'switch', x: 80, y: 120 },
        { type: 'switch', x: 80, y: 240 },
        { type: 'nor',    x: 260, y: 120 },
        { type: 'nor',    x: 260, y: 240 },
        { type: 'led',    x: 440, y: 120 },
        { type: 'led',    x: 440, y: 240 },
      ],
      wires: [
        { from: { idx: 0, port: 'out' }, to: { idx: 2, port: 'in0' } },
        { from: { idx: 1, port: 'out' }, to: { idx: 3, port: 'in1' } },
        { from: { idx: 2, port: 'out' }, to: { idx: 3, port: 'in0' } },
        { from: { idx: 3, port: 'out' }, to: { idx: 2, port: 'in1' } },
        { from: { idx: 2, port: 'out' }, to: { idx: 4, port: 'in0' } },
        { from: { idx: 3, port: 'out' }, to: { idx: 5, port: 'in0' } },
      ],
      build: function (ctx) {
        const sw_s = ctx.createComp('switch', 80, 120);
        const sw_r = ctx.createComp('switch', 80, 240);
        const nor1 = ctx.createComp('nor', 260, 120);
        const nor2 = ctx.createComp('nor', 260, 240);
        const led_q = ctx.createComp('led', 440, 120);
        const led_qn = ctx.createComp('led', 440, 240);
        ctx.addWire({ id: sw_s.id, port: 'out' }, { id: nor1.id, port: 'in0' });
        ctx.addWire({ id: sw_r.id, port: 'out' }, { id: nor2.id, port: 'in1' });
        ctx.addWire({ id: nor1.id, port: 'out' }, { id: nor2.id, port: 'in0' });
        ctx.addWire({ id: nor2.id, port: 'out' }, { id: nor1.id, port: 'in1' });
        ctx.addWire({ id: nor1.id, port: 'out' }, { id: led_q.id, port: 'in0' });
        ctx.addWire({ id: nor2.id, port: 'out' }, { id: led_qn.id, port: 'in0' });
        return { sw_s, sw_r, nor1, nor2, led_q, led_qn };
      }
    },

    clock_led: {
      name: 'Clock → LED (sequential)',
      description: 'Clock toggling → NOT → LED and direct → LED. Demonstrates timed sequential logic and inversion.',
      comps: [
        { type: 'clock', x: 100, y: 160 },
        { type: 'not',   x: 280, y: 120 },
        { type: 'led',   x: 460, y: 120 },
        { type: 'led',   x: 460, y: 200 },
      ],
      wires: [
        { from: { idx: 0, port: 'out' }, to: { idx: 1, port: 'in0' } },
        { from: { idx: 1, port: 'out' }, to: { idx: 2, port: 'in0' } },
        { from: { idx: 0, port: 'out' }, to: { idx: 3, port: 'in0' } },
      ],
      build: function (ctx) {
        const clk = ctx.createComp('clock', 100, 160);
        const not1 = ctx.createComp('not', 280, 120);
        const led1 = ctx.createComp('led', 460, 120);
        const led2 = ctx.createComp('led', 460, 200);
        ctx.addWire({ id: clk.id, port: 'out' }, { id: not1.id, port: 'in0' });
        ctx.addWire({ id: not1.id, port: 'out' }, { id: led1.id, port: 'in0' });
        ctx.addWire({ id: clk.id, port: 'out' }, { id: led2.id, port: 'in0' });
        return { clk, not1, led1, led2 };
      }
    },

    full_adder: {
      name: 'Full Adder (2 XOR + 2 AND + OR)',
      description: 'Three inputs (A, B, Cin) → Sum and Cout. Built from 2 XOR for sum, 2 AND + OR for carry.',
      comps: [
        { type: 'switch', x: 60, y: 80 },
        { type: 'switch', x: 60, y: 180 },
        { type: 'switch', x: 60, y: 260 },
        { type: 'xor', x: 200, y: 100 },
        { type: 'xor', x: 340, y: 140 },
        { type: 'and', x: 200, y: 220 },
        { type: 'and', x: 340, y: 260 },
        { type: 'or',  x: 460, y: 220 },
        { type: 'led', x: 580, y: 140 },
        { type: 'led', x: 580, y: 220 },
      ],
      wires: [
        { from: { idx: 0, port: 'out' }, to: { idx: 3, port: 'in0' } },
        { from: { idx: 1, port: 'out' }, to: { idx: 3, port: 'in1' } },
        { from: { idx: 3, port: 'out' }, to: { idx: 4, port: 'in0' } },
        { from: { idx: 2, port: 'out' }, to: { idx: 4, port: 'in1' } },
        { from: { idx: 0, port: 'out' }, to: { idx: 5, port: 'in0' } },
        { from: { idx: 1, port: 'out' }, to: { idx: 5, port: 'in1' } },
        { from: { idx: 3, port: 'out' }, to: { idx: 6, port: 'in0' } },
        { from: { idx: 2, port: 'out' }, to: { idx: 6, port: 'in1' } },
        { from: { idx: 5, port: 'out' }, to: { idx: 7, port: 'in0' } },
        { from: { idx: 6, port: 'out' }, to: { idx: 7, port: 'in1' } },
        { from: { idx: 4, port: 'out' }, to: { idx: 8, port: 'in0' } },
        { from: { idx: 7, port: 'out' }, to: { idx: 9, port: 'in0' } },
      ],
      build: function (ctx) {
        const a = ctx.createComp('switch', 60, 80);
        const b = ctx.createComp('switch', 60, 180);
        const cin = ctx.createComp('switch', 60, 260);
        const xor1 = ctx.createComp('xor', 200, 100);
        const xor2 = ctx.createComp('xor', 340, 140);
        const and1 = ctx.createComp('and', 200, 220);
        const and2 = ctx.createComp('and', 340, 260);
        const or1 = ctx.createComp('or', 460, 220);
        const sum = ctx.createComp('led', 580, 140);
        const cout = ctx.createComp('led', 580, 220);
        ctx.addWire({ id: a.id, port: 'out' }, { id: xor1.id, port: 'in0' });
        ctx.addWire({ id: b.id, port: 'out' }, { id: xor1.id, port: 'in1' });
        ctx.addWire({ id: xor1.id, port: 'out' }, { id: xor2.id, port: 'in0' });
        ctx.addWire({ id: cin.id, port: 'out' }, { id: xor2.id, port: 'in1' });
        ctx.addWire({ id: a.id, port: 'out' }, { id: and1.id, port: 'in0' });
        ctx.addWire({ id: b.id, port: 'out' }, { id: and1.id, port: 'in1' });
        ctx.addWire({ id: xor1.id, port: 'out' }, { id: and2.id, port: 'in0' });
        ctx.addWire({ id: cin.id, port: 'out' }, { id: and2.id, port: 'in1' });
        ctx.addWire({ id: and1.id, port: 'out' }, { id: or1.id, port: 'in0' });
        ctx.addWire({ id: and2.id, port: 'out' }, { id: or1.id, port: 'in1' });
        ctx.addWire({ id: xor2.id, port: 'out' }, { id: sum.id, port: 'in0' });
        ctx.addWire({ id: or1.id, port: 'out' }, { id: cout.id, port: 'in0' });
        return { a,b,cin,xor1,xor2,and1,and2,or1,sum,cout };
      }
    },

    seg7_demo: {
      name: '7-Segment Demo',
      description: '7 switches → 7-seg display. Manually drive each segment to display digits.',
      comps: [
        { type: 'switch', x: 50, y: 40 },
        { type: 'switch', x: 50, y: 110 },
        { type: 'switch', x: 50, y: 180 },
        { type: 'switch', x: 50, y: 250 },
        { type: 'switch', x: 50, y: 320 },
        { type: 'switch', x: 50, y: 390 },
        { type: 'switch', x: 50, y: 460 },
        { type: 'seg7',   x: 220, y: 140 },
      ],
      wires: [
        { from: { idx: 0, port: 'out' }, to: { idx: 7, port: 'in0' } },
        { from: { idx: 1, port: 'out' }, to: { idx: 7, port: 'in1' } },
        { from: { idx: 2, port: 'out' }, to: { idx: 7, port: 'in2' } },
        { from: { idx: 3, port: 'out' }, to: { idx: 7, port: 'in3' } },
        { from: { idx: 4, port: 'out' }, to: { idx: 7, port: 'in4' } },
        { from: { idx: 5, port: 'out' }, to: { idx: 7, port: 'in5' } },
        { from: { idx: 6, port: 'out' }, to: { idx: 7, port: 'in6' } },
      ],
      build: function (ctx) {
        const sw = [];
        for (let i=0;i<7;i++) sw.push(ctx.createComp('switch', 50, 40+i*70));
        const seg = ctx.createComp('seg7', 220, 140);
        sw.forEach((s,i)=> ctx.addWire({ id:s.id, port:'out' }, { id: seg.id, port: `in${i}` }));
        return { sw, seg };
      }
    },

    mux_2to1: {
      name: '2:1 MUX (AND-OR)',
      description: 'Selector S chooses between A and B: (A∧¬S)∨(B∧S).',
      comps: [
        { type: 'switch', x: 40, y: 100 },
        { type: 'switch', x: 40, y: 200 },
        { type: 'switch', x: 40, y: 300 },
        { type: 'not', x: 180, y: 200 },
        { type: 'and', x: 260, y: 120 },
        { type: 'and', x: 260, y: 260 },
        { type: 'or',  x: 380, y: 180 },
        { type: 'led', x: 500, y: 180 },
      ],
      wires: [
        { from: { idx: 1, port: 'out' }, to: { idx: 3, port: 'in0' } },
        { from: { idx: 0, port: 'out' }, to: { idx: 4, port: 'in0' } },
        { from: { idx: 3, port: 'out' }, to: { idx: 4, port: 'in1' } },
        { from: { idx: 2, port: 'out' }, to: { idx: 5, port: 'in0' } },
        { from: { idx: 1, port: 'out' }, to: { idx: 5, port: 'in1' } },
        { from: { idx: 4, port: 'out' }, to: { idx: 6, port: 'in0' } },
        { from: { idx: 5, port: 'out' }, to: { idx: 6, port: 'in1' } },
        { from: { idx: 6, port: 'out' }, to: { idx: 7, port: 'in0' } },
      ],
      build: function(ctx){
        const a=ctx.createComp('switch',40,100), s=ctx.createComp('switch',40,200), b=ctx.createComp('switch',40,300);
        const nots=ctx.createComp('not',180,200), andA=ctx.createComp('and',260,120), andB=ctx.createComp('and',260,260), or1=ctx.createComp('or',380,180), led=ctx.createComp('led',500,180);
        ctx.addWire({id:s.id,port:'out'},{id:nots.id,port:'in0'});
        ctx.addWire({id:a.id,port:'out'},{id:andA.id,port:'in0'}); ctx.addWire({id:nots.id,port:'out'},{id:andA.id,port:'in1'});
        ctx.addWire({id:b.id,port:'out'},{id:andB.id,port:'in0'}); ctx.addWire({id:s.id,port:'out'},{id:andB.id,port:'in1'});
        ctx.addWire({id:andA.id,port:'out'},{id:or1.id,port:'in0'}); ctx.addWire({id:andB.id,port:'out'},{id:or1.id,port:'in1'});
        ctx.addWire({id:or1.id,port:'out'},{id:led.id,port:'in0'});
        return {a,s,b,or1,led};
      }
    },

    oscillator: {
      name: 'Oscillator (NOT feedback)',
      description: 'NOT gate with output fed back to input → intentional oscillator. Triggers oscillator detection.',
      comps: [
        { type: 'not', x: 200, y: 160 },
      ],
      wires: [
        { from: { idx: 0, port: 'out' }, to: { idx: 0, port: 'in0' } },
      ],
      build: function(ctx){
        const n = ctx.createComp('not',200,160);
        ctx.addWire({id:n.id,port:'out'},{id:n.id,port:'in0'});
        return {n};
      }
    }
  };

  function get(name) { return circuits[name] || null; }
  function list() { return Object.keys(circuits).map(k => ({ id: k, name: circuits[k].name, description: circuits[k].description })); }
  function injectExample(id) { const g = circuits[id]; return g ? g : null; }

  // Instantiate a circuit declaratively into a live Map + wires (no side effects on globals)
  function instantiate(name, LE) {
    const c = circuits[name];
    if (!c || !LE) return null;
    const components = new Map();
    const wires = [];
    let nextId = 1;
    function createComp(type, x, y) {
      const id = 'c' + nextId++;
      // Use LE factory if available
      const comp = LE.createComponent ? LE.createComponent(type, x, y, id) : { id, type, x, y, w: 72, h: 56, state: false, on: false };
      // Preserve exact snapped positions from LE
      if (LE.createComponent) {
        // LE already snapped; but we passed raw x,y as world center? Use direct assignment to preserve layout
        comp.x = x; comp.y = y;
        // Re-snap? We'll keep as-is for declarative fidelity
        // Actually original createComp snaps center: snap(wx - w/2). For declarative comps, x,y are already top-left. So we set directly.
        comp.x = x; comp.y = y;
      }
      components.set(id, comp);
      return comp;
    }
    function addWire(from, to) {
      wires.push({ from: { ...from }, to: { ...to } });
    }
    // Prefer build() for fidelity; fallback to declarative comps/wires
    if (c.build) {
      // Reset for build path
      components.clear(); wires.length=0; nextId=1;
      c.build({ createComp, addWire });
    } else {
      c.comps.forEach((compDef) => {
        const comp = createComp(compDef.type, compDef.x, compDef.y);
        // Keep original id sequencing
      });
      const ids = [...components.keys()];
      c.wires.forEach(wr => {
        const fromId = ids[wr.from.idx];
        const toId = ids[wr.to.idx];
        wires.push({ from: { id: fromId, port: wr.from.port }, to: { id: toId, port: wr.to.port } });
      });
    }
    return { components, wires, nextId, meta: { name: c.name, description: c.description } };
  }

  return { circuits, get, list, injectExample, instantiate };
});
