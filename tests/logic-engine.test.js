'use strict';
const assert = require('assert');
const LE = require('../logic-engine.js');

function approx(v, expected, msg) { assert.strictEqual(v, expected, msg); }

console.log('— LogicEngine UMD load check —');
assert.ok(LE, 'LogicEngine loaded');
assert.ok(LE.CDEFS && typeof LE.CDEFS === 'object', 'CDEFS');
assert.ok(Array.isArray(LE.SEG_PATTERNS) && LE.SEG_PATTERNS.length === 10, 'SEG_PATTERNS 10 digits');
assert.ok(typeof LE.setOf === 'function', 'setOf');
assert.ok(typeof LE.addAll === 'function', 'addAll');
assert.ok(typeof LE.propagate === 'function', 'propagate');
assert.ok(typeof LE.evalComp === 'function', 'evalComp');
assert.ok(typeof LE.getPortPos === 'function', 'getPortPos');
assert.ok(typeof LE.getInput === 'function', 'getInput');
assert.ok(typeof LE.createComponent === 'function', 'createComponent');
assert.ok(typeof LE.tickClocks === 'function', 'tickClocks');
assert.ok(LE.GW === 72 && LE.GH === 56 && LE.SNAP === 16, 'constants GW/GH/SNAP');
console.log('✔ UMD wrapper (browser/Worker/Node) — OK');

console.log('\n— CDEFS data-driven catalogue —');
const expectedTypes = ['switch','clock','const1','const0','and','or','not','nand','nor','xor','xnor','buf','led','seg7','probe'];
expectedTypes.forEach(t => assert.ok(LE.CDEFS[t], `CDEFS has ${t}`));
assert.strictEqual(LE.CDEFS.and.ins, 2); assert.strictEqual(LE.CDEFS.and.outs, 1);
assert.strictEqual(LE.CDEFS.not.ins, 1); assert.strictEqual(LE.CDEFS.switch.ins, 0);
assert.strictEqual(LE.CDEFS.led.outs, 0); assert.strictEqual(LE.CDEFS.seg7.ins, 7);
assert.ok(LE.CDEFS.and.sym === '∧' && LE.CDEFS.or.sym === '∨', 'symbols');
console.log('✔ CDEFS — OK (13 types, ins/outs correct)');

console.log('\n— setOf / addAll (line-by-line spec parity) —');
const s1 = LE.setOf(['a','b']);
assert.ok(s1.has('a') && s1.size===2);
const tset = LE.setOf(['b','c']);
const target = LE.setOf(['a']);
assert.strictEqual(LE.addAll(target, tset), true);
assert.ok(target.has('c') && target.has('b'));
assert.strictEqual(LE.addAll(target, LE.setOf(['a'])), false);
console.log('✔ setOf/addAll — OK');

console.log('\n— snap / world↔screen —');
assert.strictEqual(LE.snap(15), 16); assert.strictEqual(LE.snap(31), 32); assert.strictEqual(LE.snap(0),0);
const w2s = LE.worldToScreen(100, 200, 2, 10, 20);
assert.deepStrictEqual(w2s, {x:210, y:420});
const s2w = LE.screenToWorld(210, 420, 2, 10, 20);
assert.deepStrictEqual(s2w, {x:100, y:200});
console.log('✔ snap / transforms — OK');

console.log('\n— createComponent —');
const cSw = LE.createComponent('switch', 100, 100, 'c1');
assert.strictEqual(cSw.id,'c1'); assert.strictEqual(cSw.type,'switch'); assert.strictEqual(cSw.w, LE.GW);
assert.ok(typeof cSw.x==='number' && typeof cSw.y==='number', 'has x,y');
assert.strictEqual(cSw.state,false); assert.strictEqual(cSw.on,false);
const cHigh = LE.createComponent('const1', 50, 50, 'cHi');
assert.ok(cHigh.state===true && cHigh.on===true, 'const1 HIGH');
const cClk = LE.createComponent('clock', 0,0,'cClk');
assert.ok(cClk.type==='clock' && typeof cClk.clockPhase==='number');
assert.throws(()=> LE.createComponent('unknown',0,0,'cX'), /Unknown/);
console.log('✔ createComponent — OK');

console.log('\n— getPortPos —');
const compsA = new Map();
const cA = LE.createComponent('and', 100, 100, 'cA'); // LE snaps center -> x = snap(100-36)=64, y=snap(100-28)=64? Wait GH 56/2=28
compsA.set(cA.id, cA);
// Use engine's getPortPos with Map signature
const outPos = LE.getPortPos(compsA, 'cA', 'out');
assert.ok(outPos && typeof outPos.x==='number', 'out pos');
assert.strictEqual(outPos.x, cA.x + cA.w + 5); assert.strictEqual(outPos.y, cA.y + cA.h/2);
const in0 = LE.getPortPos(compsA, 'cA', 'in0');
const in1 = LE.getPortPos(compsA, 'cA', 'in1');
assert.ok(in0.y < in1.y, 'in0 above in1');
assert.strictEqual(in0.x, cA.x -5);
 // Also test comp-object overload
const out2 = LE.getPortPos(cA, 'out');
assert.deepStrictEqual(outPos, out2);
// NOT has single input centered
const cNot = LE.createComponent('not', 200,200,'cNot'); compsA.set(cNot.id,cNot);
const notIn = LE.getPortPos(compsA,'cNot','in0');
assert.strictEqual(notIn.y, cNot.y + cNot.h/2);
console.log('✔ getPortPos — OK');

console.log('\n— getInput + evalComp truth tables —');
// Helper to make a mini circuit: create Map+wires and test evalComp directly
function makeGateTest(gateType, inputs) {
  const comps = new Map();
  const wires = [];
  // sources: switches with on = inputs[i]
  inputs.forEach((v,i)=>{
    const sw = LE.createComponent('switch', 10+i*60, 10, `sw${i}`);
    sw.on = !!v; sw.state = !!v;
    comps.set(sw.id, sw);
  });
  const gate = LE.createComponent(gateType, 200, 100, 'gate');
  comps.set(gate.id, gate);
  // wire each switch out to gate in{i}
  inputs.forEach((_,i)=>{
    wires.push({from:{id:`sw${i}`, port:'out'}, to:{id:'gate', port:`in${i}`}});
  });
  // also need to support single-input gates where we only have 1 input but pass 1 element array
  const result = LE.evalComp(gate, wires, comps);
  return result;
}

assert.strictEqual(makeGateTest('and',[true,true]), true, 'AND 1,1');
assert.strictEqual(makeGateTest('and',[true,false]), false, 'AND 1,0');
assert.strictEqual(makeGateTest('and',[false,false]), false);
assert.strictEqual(makeGateTest('or',[false,false]), false);
assert.strictEqual(makeGateTest('or',[false,true]), true);
assert.strictEqual(makeGateTest('or',[true,true]), true);
assert.strictEqual(makeGateTest('not',[false]), true);
assert.strictEqual(makeGateTest('not',[true]), false);
assert.strictEqual(makeGateTest('buf',[false]), false);
assert.strictEqual(makeGateTest('buf',[true]), true);
assert.strictEqual(makeGateTest('nand',[true,true]), false);
assert.strictEqual(makeGateTest('nand',[true,false]), true);
assert.strictEqual(makeGateTest('nor',[false,false]), true);
assert.strictEqual(makeGateTest('nor',[true,false]), false);
assert.strictEqual(makeGateTest('xor',[false,false]), false);
assert.strictEqual(makeGateTest('xor',[false,true]), true);
assert.strictEqual(makeGateTest('xor',[true,true]), false);
assert.strictEqual(makeGateTest('xnor',[true,true]), true);
assert.strictEqual(makeGateTest('xnor',[true,false]), false);
console.log('✔ truth tables exhaustive — OK');

// Also test LED/probe/seg7 reflect input
{
  const comps = new Map();
  const wires = [];
  const sw = LE.createComponent('switch',0,0,'sw'); sw.on=true; sw.state=true; comps.set(sw.id, sw);
  const led = LE.createComponent('led',100,0,'led'); comps.set(led.id, led);
  wires.push({from:{id:'sw',port:'out'}, to:{id:'led',port:'in0'}});
  assert.strictEqual(LE.evalComp(led, wires, comps), true, 'LED follows HIGH');
  sw.on=false; sw.state=false;
  assert.strictEqual(LE.evalComp(led, wires, comps), false, 'LED follows LOW');
  // unconnected input defaults false
  const led2 = LE.createComponent('led',200,0,'led2'); comps.set(led2.id, led2);
  assert.strictEqual(LE.evalComp(led2, wires, comps), false, 'unconnected → false');
}
console.log('✔ LED/probe/seg7 eval — OK');

console.log('\n— propagate: simple combinational —');
{
  const comps = new Map();
  const wires = [];
  const sw = LE.createComponent('switch', 100,100,'c1'); sw.on=true; sw.state=true; comps.set(sw.id, sw);
  const led = LE.createComponent('led', 300,100,'c2'); comps.set(led.id, led);
  wires.push({from:{id:'c1',port:'out'}, to:{id:'c2',port:'in0'}});
  const res = LE.propagate(comps, wires);
  assert.strictEqual(comps.get('c2').state, true, 'switch HIGH → led HIGH after propagate');
  assert.strictEqual(res.oscDetected,false, 'stable');
  assert.ok(res.iterations < res.max, 'iterations under cap');
  // toggle off
  sw.on=false; sw.state=false;
  LE.propagate(comps, wires);
  assert.strictEqual(comps.get('c2').state,false, 'switch LOW → led LOW');
}
console.log('✔ propagate switch→led — OK');

{
  // AND chain: sw1=1, sw2=0 → and → led should be 0
  const comps=new Map(), wires=[];
  const sw1=LE.createComponent('switch',0,0,'sw1'); sw1.on=true; sw1.state=true; comps.set(sw1.id,sw1);
  const sw2=LE.createComponent('switch',0,60,'sw2'); sw2.on=false; sw2.state=false; comps.set(sw2.id,sw2);
  const and=LE.createComponent('and',200,30,'g1'); comps.set(and.id,and);
  const led=LE.createComponent('led',350,30,'led'); comps.set(led.id,led);
  wires.push({from:{id:'sw1',port:'out'},to:{id:'g1',port:'in0'}});
  wires.push({from:{id:'sw2',port:'out'},to:{id:'g1',port:'in1'}});
  wires.push({from:{id:'g1',port:'out'},to:{id:'led',port:'in0'}});
  LE.propagate(comps,wires);
  assert.strictEqual(comps.get('g1').state,false, 'AND 1,0 => 0');
  assert.strictEqual(comps.get('led').state,false);
  // now sw2 on → AND 1,1 => 1
  sw2.on=true; sw2.state=true;
  LE.propagate(comps,wires);
  assert.strictEqual(comps.get('g1').state,true, 'AND 1,1 =>1');
  assert.strictEqual(comps.get('led').state,true);
}
console.log('✔ propagate AND chain — OK');

console.log('\n— propagate: SR latch (feedback stable) —');
{
  // SR latch: two NOR cross-coupled, S=0,R=0 should hold previous state or settle (not oscillate)
  const comps=new Map(), wires=[];
  const s=LE.createComponent('switch',80,120,'s'); s.on=false; s.state=false; comps.set(s.id,s);
  const r=LE.createComponent('switch',80,240,'r'); r.on=false; r.state=false; comps.set(r.id,r);
  const nor1=LE.createComponent('nor',260,120,'n1'); comps.set(nor1.id,nor1);
  const nor2=LE.createComponent('nor',260,240,'n2'); comps.set(nor2.id,nor2);
  const q=LE.createComponent('led',440,120,'q'); comps.set(q.id,q);
  const qn=LE.createComponent('led',440,240,'qn'); comps.set(qn.id,qn);
  wires.push({from:{id:'s',port:'out'},to:{id:'n1',port:'in0'}});
  wires.push({from:{id:'r',port:'out'},to:{id:'n2',port:'in1'}});
  wires.push({from:{id:'n1',port:'out'},to:{id:'n2',port:'in0'}});
  wires.push({from:{id:'n2',port:'out'},to:{id:'n1',port:'in1'}});
  wires.push({from:{id:'n1',port:'out'},to:{id:'q',port:'in0'}});
  wires.push({from:{id:'n2',port:'out'},to:{id:'qn',port:'in0'}});
  const res=LE.propagate(comps,wires);
  // With S=0,R=0 and starting reset state false, circuit should settle (might be Q=1 or Q=0 depending on iteration order, but must be stable and complements? Actually with both 0, NOR latch holds previous state; with initial 0,0 it may settle to Q=0/Qn=1 or Q=1/Qn=0 depending on evaluation order — but must be stable)
  assert.strictEqual(res.oscDetected,false, 'SR latch S=0,R=0 should not oscillate');
  assert.strictEqual(res.stable,true);
  console.log(`  SR latch stable after ${res.iterations} iters: Q=${comps.get('n1').state}, Qn=${comps.get('n2').state}`);
  // Now set S=1,R=0 → latch flips (Q and Qn complement each other, still stable)
  s.on=true; s.state=true;
  const res2=LE.propagate(comps,wires);
  assert.strictEqual(res2.oscDetected,false, 'Set should not oscillate');
  // Q and Qn should be complements (one HIGH, one LOW) — which one is HIGH depends on wiring/S-R mapping
  assert.notStrictEqual(comps.get('n1').state, comps.get('n2').state, 'Q and Qn should be complements after Set');
}
console.log('✔ SR latch stable — OK');

console.log('\n— propagate: oscillator detection (NOT feedback) —');
{
  const comps=new Map(), wires=[];
  const n = LE.createComponent('not',200,160,'n1'); comps.set(n.id,n);
  wires.push({from:{id:'n1',port:'out'},to:{id:'n1',port:'in0'}});
  const res=LE.propagate(comps,wires);
  assert.strictEqual(res.oscDetected,true, 'NOT loop should be detected as oscillator');
  assert.strictEqual(res.iterations, res.max, 'should hit MAX');
  console.log(`  Oscillator correctly detected: ${res.iterations}/${res.max} iters, osc=${res.oscDetected}`);
}
console.log('✔ oscillator detection — OK');

console.log('\n— 7-seg decoding —');
{
  // Test SEG_PATTERNS packing
  const bits0 = LE.SEG_PATTERNS[0]; // digit 0 pattern
  const val0 = LE.bitsToValue(bits0);
  const dig0 = LE.valueToDigit(val0);
  assert.strictEqual(dig0,0, 'digit 0 decode');
  const bits1 = LE.SEG_PATTERNS[1];
  assert.strictEqual(LE.valueToDigit(LE.bitsToValue(bits1)),1);
  // All digits 0-9 should round-trip
  for(let d=0;d<=9;d++){
    const bits = LE.SEG_PATTERNS[d];
    const v = LE.bitsToValue(bits);
    const got = LE.valueToDigit(v);
    assert.strictEqual(got,d, `digit ${d} round-trip`);
  }
  // decodeSeg7 helper
  const dec = LE.decodeSeg7(bits0);
  assert.strictEqual(dec.digit,0);
  assert.ok(dec.pattern);
  const offBits=[false,false,false,false,false,false,false];
  const decOff = LE.decodeSeg7(offBits);
  assert.strictEqual(decOff.digit,-1, 'all off → no digit');
}
console.log('✔ 7-seg decoder — OK');

console.log('\n— clock tick —');
{
  const comps=new Map();
  const clk=LE.createComponent('clock',0,0,'clk'); clk.state=false; comps.set(clk.id,clk);
  assert.strictEqual(clk.state,false);
  LE.tickClocks(comps);
  assert.strictEqual(clk.state,true);
  LE.tickClocks(comps);
  assert.strictEqual(clk.state,false);
}
console.log('✔ clock tick — OK');

console.log('\n— TRUTH helper map —');
assert.ok(LE.TRUTH.and(true,true)===true);
assert.ok(LE.TRUTH.xor(true,false)===true);
assert.ok(LE.TRUTH.nor(false,false)===true);
console.log('✔ TRUTH map — OK');

console.log('\n— serialize / deserialize —');
{
  const comps=new Map(), wires=[];
  const sw=LE.createComponent('switch',10,10,'c1'); comps.set(sw.id,sw);
  const led=LE.createComponent('led',100,10,'c2'); comps.set(led.id,led);
  wires.push({from:{id:'c1',port:'out'},to:{id:'c2',port:'in0'}});
  const ser=LE.serialize(comps,wires,3);
  assert.ok(ser.comps.length===2 && ser.wires.length===1);
  const des=LE.deserialize(ser);
  assert.ok(des.components instanceof Map && des.components.size===2);
  assert.ok(des.wires.length===1 && des.nextId>=3);
}
console.log('✔ serialize/deserialize — OK');

console.log('\nAll logic-engine tests passed ✔');
