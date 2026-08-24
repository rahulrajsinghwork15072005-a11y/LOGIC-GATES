'use strict';
const assert = require('assert');
const Viz = require('../viz.js');
const LE = require('../logic-engine.js');

console.log('— Viz UMD load check —');
assert.ok(Viz, 'Viz loaded');
assert.ok(typeof Viz.esc === 'function', 'esc');
assert.ok(typeof Viz.buildCircuitSVG === 'function', 'buildCircuitSVG');
assert.ok(typeof Viz.buildGateSVG === 'function', 'buildGateSVG');
assert.ok(typeof Viz.buildWireSVG === 'function', 'buildWireSVG');
assert.ok(typeof Viz.buildSeg7SVG === 'function', 'buildSeg7SVG');
console.log('✔ UMD — OK');

console.log('\n— esc() XSS-safe —');
assert.strictEqual(Viz.esc('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
assert.strictEqual(Viz.esc('a&b'), 'a&amp;b');
assert.strictEqual(Viz.esc('"quote"'), '&quot;quote&quot;');
assert.strictEqual(Viz.esc("'single'"), '&#39;single&#39;');
assert.strictEqual(Viz.esc(null), '');
assert.strictEqual(Viz.esc(undefined), '');
assert.strictEqual(Viz.esc(0), '0');
const xss = Viz.esc('<img src=x onerror=alert(1)>');
assert.ok(!xss.includes('<'), 'escaped <');
assert.ok(xss.includes('&lt;'), 'has &lt;');
// Ensure no injection in SVG builder
const compXss = { id:'c1', type:'and', x:10,y:10,w:72,h:56, state:true };
const svgXss = Viz.buildGateSVG({...compXss, type:'and', state:true}, LE.CDEFS);
// Even if component label contained xss, esc should neutralize — but our builder uses label from CDEFS, not user input for symbol
// Test buildCircuitSVG escaping: component type is controlled, but ensure generated SVG is string and escaped
assert.ok(typeof svgXss === 'string' && svgXss.includes('<svg'), 'buildGateSVG returns svg');
console.log('✔ esc XSS-safe — OK');

console.log('\n— buildGateSVG —');
const cAnd = { id:'c1', type:'and', x:0,y:0,w:72,h:56, state:false };
let svg = Viz.buildGateSVG(cAnd, LE.CDEFS);
assert.ok(svg.includes('AND') || svg.includes('∧'), 'gate label');
assert.ok(svg.includes('<svg'), 'svg tag');
const cLedOn = { id:'c2', type:'led', x:0,y:0,w:72,h:56, state:true };
let svgLed = Viz.buildGateSVG(cLedOn, LE.CDEFS);
assert.ok(svgLed.includes('◉') || svgLed.includes('LED') || svgLed.includes('dcfce7'), 'led glow');
console.log('✔ buildGateSVG — OK');

console.log('\n— buildWireSVG —');
const fp = {x:0,y:10}, tp={x:100,y:10};
let wSvg = Viz.buildWireSVG(fp, tp, true, false, false);
assert.ok(wSvg.includes('<path'), 'wire path');
assert.ok(wSvg.includes('#22c55e') || wSvg.includes('22c55e'), 'wire on color');
let wOff = Viz.buildWireSVG(fp,tp,false,false,false);
assert.ok(wOff.includes('#a89070') || wOff.includes('a89070'), 'wire off color');
let wPend = Viz.buildWireSVG(fp,tp,false,false,true);
assert.ok(wPend.includes('5 8') || wPend.includes('dash'), 'pending dash');
console.log('✔ buildWireSVG — OK');

console.log('\n— buildSeg7SVG —');
const bitsOn = [true,true,true,true,true,true,true]; // 8
let segSvg = Viz.buildSeg7SVG({id:'seg',type:'seg7',x:0,y:0,w:80,h:140}, bitsOn, LE.CDEFS);
assert.ok(segSvg.includes('<svg') && segSvg.includes('#dc2626'), 'seg on');
const bitsOff = [false,false,false,false,false,false,false];
let segOff = Viz.buildSeg7SVG({id:'seg',type:'seg7',x:0,y:0,w:80,h:140}, bitsOff, LE.CDEFS);
assert.ok(segOff.includes('rgba'), 'seg off translucent');
console.log('✔ buildSeg7SVG — OK');

console.log('\n— buildCircuitSVG —');
{
  const comps = new Map();
  const wires = [];
  const sw = LE.createComponent('switch', 100,100,'c1'); sw.on=true; sw.state=true; comps.set(sw.id, sw);
  const and = LE.createComponent('and', 280,120,'c2'); comps.set(and.id, and);
  const led = LE.createComponent('led', 460,120,'c3'); comps.set(led.id, led);
  wires.push({from:{id:'c1',port:'out'},to:{id:'c2',port:'in0'}});
  wires.push({from:{id:'c2',port:'out'},to:{id:'c3',port:'in0'}});
  LE.propagate(comps, wires);
  const svgAll = Viz.buildCircuitSVG(comps, wires);
  assert.ok(svgAll.includes('<svg'), 'circuit svg');
  assert.ok(svgAll.includes('c1') || svgAll.includes('SW') || svgAll.includes('∧') || svgAll.includes('AND'), 'contains gate');
  assert.ok(svgAll.length > 500, 'non-trivial svg');
  // Ensure XSS-safe: if components contain malicious id, esc should neutralize
  const comps2 = new Map();
  const bad = LE.createComponent('and', 10,10,'cBad"><script>alert(1)</script>');
  comps2.set(bad.id, bad);
  const badSvg = Viz.buildCircuitSVG(comps2, []);
  assert.ok(!badSvg.includes('<script>'), 'no raw script');
  assert.ok(badSvg.includes('&lt;script') || !badSvg.includes('cBad'), 'escaped if included');
}
console.log('✔ buildCircuitSVG — OK (also XSS guard)');

console.log('\n— renderCircuit (container integration) —');
// Simulate DOM container
const fakeContainer = { innerHTML: '' };
Viz.renderCircuit(fakeContainer, new Map([['c1', LE.createComponent('switch',0,0,'c1')]]), []);
assert.ok(fakeContainer.innerHTML.includes('<svg'), 'renderCircuit sets innerHTML');
Viz.renderCircuit(null, null, null); // should not throw
console.log('✔ renderCircuit — OK');

console.log('\nAll viz tests passed ✔');
