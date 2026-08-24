// ============================================================
// LOGIC FORGE — script.js  Y2K EDITION
// Refactored from logic-simulator-v2.html (762 lines single-file)
// Now UMD-modular: LogicEngine (truth tables + fixed-point propagation + oscillator detection)
// Worker, Viz (SVG), LogicLibrary, AppIntegration
// ============================================================
'use strict';

// ── ENGINE INTEGRATION (UMD) ────────────────────────────────────
let LE = (typeof LogicEngine !== 'undefined' ? LogicEngine : null);
let VizMod = (typeof Viz !== 'undefined' ? Viz : null);
let Lib = (typeof LogicLibrary !== 'undefined' ? LogicLibrary : null);

// Verify line-by-line helpers are present (mirrors compiler-forge pattern)
if (LE) {
  console.log('%c ✔ LogicEngine UMD loaded — propagation fixed-point, truth tables, oscillator, Worker-ready', 'color:#9B30FF;font-family:monospace');
  if (!LE.CDEFS || !LE.propagate || !LE.getPortPos) console.warn('LE missing expected API');
  if (typeof LE.setOf !== 'function' || typeof LE.addAll !== 'function') console.warn('LE setOf/addAll missing (spec)');
} else {
  console.warn('LogicEngine not found — using inline fallback (file://)');
}
if (VizMod) console.log('%c ✔ Viz UMD loaded — SVG circuit, XSS-safe esc()', 'color:#FF2D9B;font-family:monospace');
if (Lib) console.log('%c ✔ LogicLibrary loaded —', 'color:#00BFFF;font-family:monospace', Lib.list().map(x=>x.id).join(', '));

// ── STATE ───────────────────────────────────────────────────────
let components = new Map();
let wires = [];
let nextId = 1;
let selCompType = 'switch';
let mode = 'place'; // place|wire|select
let pendingWire = null;
let selectedId = null;
let dragging = null, dragOX = 0, dragOY = 0;
let zoom = 1, panX = 0, panY = 0, isPanning = false, panStart = null;
let mouseX = 0, mouseY = 0;
let clockHz = 0.5, clockInterval = null, clockTick = 0;
let oscDetected = false;

// DOM refs (assigned on init)
let canvas, ctx, wireCanvas, wctx, wrap;

// Constants via engine or fallback
const GW = (LE ? LE.GW : 72);
const GH = (LE ? LE.GH : 56);
const SNAP = (LE ? LE.SNAP : 16);
function snap(v){ return LE ? LE.snap(v) : Math.round(v/SNAP)*SNAP; }

// CDEFS: prefer engine
const CDEFS = (LE && LE.CDEFS) ? LE.CDEFS : {
  switch: {label:'SW',  ins:0,outs:1,sym:'⏻',w:GW,h:GH,color:'#16a34a'},
  clock:  {label:'CLK', ins:0,outs:1,sym:'⏱',w:GW,h:GH,color:'#d97706'},
  const1: {label:'HIGH',ins:0,outs:1,sym:'1', w:52,h:GH,color:'#16a34a'},
  const0: {label:'LOW', ins:0,outs:1,sym:'0', w:52,h:GH,color:'#dc2626'},
  and:    {label:'AND', ins:2,outs:1,sym:'∧', w:GW,h:GH},
  or:     {label:'OR',  ins:2,outs:1,sym:'∨', w:GW,h:GH},
  not:    {label:'NOT', ins:1,outs:1,sym:'¬', w:GW,h:GH},
  nand:   {label:'NAND',ins:2,outs:1,sym:'⊼', w:GW,h:GH},
  nor:    {label:'NOR', ins:2,outs:1,sym:'⊽', w:GW,h:GH},
  xor:    {label:'XOR', ins:2,outs:1,sym:'⊕', w:GW,h:GH},
  xnor:   {label:'XNOR',ins:2,outs:1,sym:'⊙', w:GW,h:GH},
  buf:    {label:'BUF', ins:1,outs:1,sym:'▷', w:GW,h:GH},
  led:    {label:'LED', ins:1,outs:0,sym:'◉', w:GW,h:GH,color:'#16a34a'},
  seg7:   {label:'SEG', ins:7,outs:0,sym:'7', w:80,h:140,color:'#dc2626'},
  probe:  {label:'PRB', ins:1,outs:0,sym:'⊡', w:52,h:GH,color:'#2563eb'},
};

const SEG_PATTERNS = (LE && LE.SEG_PATTERNS) ? LE.SEG_PATTERNS : [
  [1,1,1,0,1,1,1],[0,0,1,0,0,1,0],[1,0,1,1,1,0,1],[1,0,1,1,0,1,1],[0,1,1,1,0,1,0],
  [1,1,0,1,0,1,1],[1,1,0,1,1,1,1],[1,0,1,0,0,1,0],[1,1,1,1,1,1,1],[1,1,1,1,0,1,1]
];

// ── UTILITY ────────────────────────────────────────────────────
function esc(str){
  if (VizMod && VizMod.esc) return VizMod.esc(str);
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function worldToScreen(x,y){
  if (LE && LE.worldToScreen) return LE.worldToScreen(x,y,zoom,panX,panY);
  return {x:x*zoom+panX, y:y*zoom+panY};
}
function screenToWorld(x,y){
  if (LE && LE.screenToWorld) return LE.screenToWorld(x,y,zoom,panX,panY);
  return {x:(x-panX)/zoom, y:(y-panY)/zoom};
}

function showToast(msg, duration=2400){
  const existing=document.querySelector('.toast');
  if(existing) existing.remove();
  const t=document.createElement('div');
  t.className='toast'; t.textContent=msg; document.body.appendChild(t);
  setTimeout(()=>{t.classList.add('out'); setTimeout(()=>t.remove(),300);}, duration);
}

// ── COMPONENT CREATION ────────────────────────────────────────
function createComp(type, wx, wy){
  const def=CDEFS[type]; if(!def) return null;
  let comp;
  if (LE && LE.createComponent) {
    // LE.createComponent expects center wx,wy and id; it does snap(wx - w/2)
    const id='c'+nextId++;
    comp = LE.createComponent(type, wx, wy, id);
    // Ensure w/h match def (LE already sets)
  } else {
    const id='c'+nextId++;
    comp={id,type,x:snap(wx-def.w/2),y:snap(wy-def.h/2),state:false,on:false,w:def.w,h:def.h};
    if(type==='const1') comp.on=comp.state=true;
    if(type==='clock') comp.clockPhase=0;
  }
  // Ensure defaults for engine-created comps that may not have on/state for const1
  if(type==='const1'){ comp.on=true; comp.state=true; }
  if(type==='clock' && comp.clockPhase===undefined) comp.clockPhase=0;
  components.set(comp.id, comp);
  propagate();
  drawWires(); drawComponents(); updateSimStatus();
  simLog(`Placed ${def.label}`);
  return comp;
}

// ── PROPAGATION (delegates to LogicEngine if available) ───────
function propagate(){
  if (LE && LE.propagate) {
    const result = LE.propagate(components, wires);
    oscDetected = result.oscDetected;
    if (oscDetected) simLog('⚠ Oscillator detected','err');
    const warnEl=document.getElementById('osc-warn');
    if(warnEl) warnEl.style.display = oscDetected ? 'block' : 'none';
    drawComponents(); drawWires(); updateProps(); updateSimStatus();
    return result;
  }
  // Fallback inline (mirrors line-by-line spec exactly)
  oscDetected=false;
  for(const[,c] of components){ if(c.type!=='switch'&&c.type!=='const1'&&c.type!=='const0'&&c.type!=='clock') c.state=false; }
  const MAX=components.size*6+20;
  let changed=true,iter=0;
  while(changed&&iter<MAX){
    changed=false; iter++;
    for(const[,c] of components){
      const ns=evalComp(c);
      if(ns!==c.state){ c.state=ns; changed=true; }
    }
  }
  if(iter>=MAX){ oscDetected=true; simLog('⚠ Oscillator detected','err'); }
  const warnEl=document.getElementById('osc-warn');
  if(warnEl) warnEl.style.display = oscDetected ? 'block' : 'none';
  drawComponents(); drawWires(); updateProps(); updateSimStatus();
  return {oscDetected, iterations:iter, max:MAX, stable:!oscDetected};
}

function evalComp(c){
  if (LE && LE.evalComp) {
    return LE.evalComp(c, wires, components);
  }
  if(c.type==='switch')return !!c.on;
  if(c.type==='const1')return true;
  if(c.type==='const0')return false;
  if(c.type==='clock')return !!c.state;
  if(c.type==='led'||c.type==='probe')return getInput(c.id,'in0');
  if(c.type==='seg7')return getInput(c.id,'in0');
  const def=CDEFS[c.type];
  const inputs=Array.from({length:def.ins},(_,i)=>getInput(c.id,`in${i}`));
  switch(c.type){
    case 'and': return inputs.every(Boolean);
    case 'or':  return inputs.some(Boolean);
    case 'not': return !inputs[0];
    case 'buf': return !!inputs[0];
    case 'nand':return !inputs.every(Boolean);
    case 'nor': return !inputs.some(Boolean);
    case 'xor': return inputs[0]!==inputs[1];
    case 'xnor':return inputs[0]===inputs[1];
  }
  return false;
}

function getInput(compId, portName){
  if (LE && LE.getInput) return LE.getInput(compId, portName, wires, components);
  const w=wires.find(wr=>wr.to.id===compId&&wr.to.port===portName);
  if(!w) return false;
  const src=components.get(w.from.id);
  return src ? !!src.state : false;
}

// ── PORT POSITIONS (world space) ──────────────────────────────
function getPortPos(id, port){
  if (LE && LE.getPortPos) {
    // Try engine's flexible signature
    try {
      // Prefer Map-first
      const r = LE.getPortPos(components, id, port);
      if (r) return r;
    } catch(e){}
    // Fallback to single-comp object if id is actually a component
    if (id && typeof id === 'object' && id.x!==undefined) {
      const r2 = LE.getPortPos(id, port);
      if (r2) return r2;
    }
  }
  const c=components.get(id); if(!c) return null;
  const def=CDEFS[c.type];
  if(!def) return null;
  if(port==='out') return {x:c.x+c.w+5, y:c.y+c.h/2};
  const portIdx=parseInt(String(port).replace('in',''),10);
  const count=def.ins;
  if (isNaN(portIdx) || count===0) return null;
  const spacing=c.h/(count+1);
  return {x:c.x-5, y:c.y+spacing*(portIdx+1)};
}

// ── DRAWING ───────────────────────────────────────────────────
function drawComponents(){
  if(!canvas||!ctx) return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.save(); ctx.translate(panX,panY); ctx.scale(zoom,zoom);
  // Grid dots
  const gx0=Math.floor(-panX/(zoom*SNAP))*SNAP;
  const gy0=Math.floor(-panY/(zoom*SNAP))*SNAP;
  for(let x=gx0;x<gx0+(canvas.width/zoom)+SNAP*2;x+=SNAP){
    for(let y=gy0;y<gy0+(canvas.height/zoom)+SNAP*2;y+=SNAP){
      ctx.fillStyle='#ddd5c8'; ctx.fillRect(x-0.5,y-0.5,1,1);
    }
  }
  for(const[,c] of components) drawComp(c);
  ctx.restore();
}

function drawComp(c){
  const def=CDEFS[c.type];
  const sel=selectedId===c.id;
  const powered=!!c.state;

  // Shadow
  ctx.fillStyle='rgba(0,0,0,0.08)'; ctx.fillRect(c.x+3,c.y+3,c.w,c.h);

  // Body
  ctx.fillStyle = c.type==='led' && powered ? '#dcfce7' : c.type==='led' && !powered ? '#f5f5f5' : '#fff8f0';
  ctx.fillRect(c.x,c.y,c.w,c.h);
  // Border
  ctx.strokeStyle = sel ? '#000' : powered && def.color ? def.color : powered ? '#16a34a' : '#ccc';
  ctx.lineWidth = sel ? 2.5 : powered ? 2 : 1.5;
  ctx.strokeRect(c.x,c.y,c.w,c.h);

  // LED glow
  if(c.type==='led' && powered){
    ctx.fillStyle='rgba(22,163,74,0.1)'; ctx.fillRect(c.x-4,c.y-4,c.w+8,c.h+8);
  }

  // Symbol
  ctx.fillStyle = powered && def.color ? def.color : powered ? '#16a34a' : '#555';
  ctx.font=`bold ${Math.min(c.w,c.h)*0.4}px 'IBM Plex Mono', monospace`;
  ctx.textAlign='center'; ctx.textBaseline='middle';

  if(c.type==='seg7'){
    drawSeg7(c);
  } else if(c.type==='switch'){
    ctx.font='bold 20px monospace';
    ctx.fillStyle = c.on ? '#16a34a' : '#888';
    ctx.fillText(c.on?'⏻':'○', c.x+c.w/2, c.y+c.h/2-4);
    ctx.font='9px monospace';
    ctx.fillStyle = c.on ? '#16a34a' : '#aaa';
    ctx.fillText(c.on?'ON':'OFF', c.x+c.w/2, c.y+c.h-10);
  } else if(c.type==='clock'){
    ctx.font='16px monospace';
    ctx.fillStyle = c.state ? '#d97706' : '#aaa';
    ctx.fillText('⏱', c.x+c.w/2, c.y+c.h/2-4);
    ctx.font='9px monospace';
    ctx.fillStyle='#aaa'; ctx.fillText(`${clockHz}Hz`, c.x+c.w/2, c.y+c.h-10);
  } else if(c.type==='probe'){
    ctx.font='bold 14px monospace';
    ctx.fillStyle = c.state ? '#2563eb' : '#aaa';
    ctx.fillText(c.state?'HIGH':'LOW', c.x+c.w/2, c.y+c.h/2);
  } else {
    ctx.fillText(def.sym, c.x+c.w/2, c.y+c.h/2-5);
    ctx.font='8px monospace'; ctx.fillStyle='#bbb';
    ctx.fillText(def.label, c.x+c.w/2, c.y+c.h-8);
  }

  // Ports
  if(def.outs>0){
    const pp=getPortPos(c.id,'out');
    if(pp){
      ctx.fillStyle = c.state ? '#16a34a' : '#ccc';
      ctx.strokeStyle='#333'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.arc(pp.x,pp.y,5,0,Math.PI*2); ctx.fill(); ctx.stroke();
    }
  }
  for(let i=0;i<def.ins;i++){
    const pp=getPortPos(c.id,`in${i}`);
    if(!pp) continue;
    const connected=wires.some(w=>w.to.id===c.id&&w.to.port===`in${i}`);
    const sig=getInput(c.id,`in${i}`);
    ctx.fillStyle = sig ? '#16a34a' : connected ? '#555' : '#ddd';
    ctx.strokeStyle='#333'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(pp.x,pp.y,5,0,Math.PI*2); ctx.fill(); ctx.stroke();
  }

  ctx.textBaseline='alphabetic';
}

// ── 7-SEGMENT DISPLAY ─────────────────────────────────────────
function drawSeg7(c){
  let bits;
  if (LE && LE.getSegBits) {
    bits = LE.getSegBits(c.id, wires, components);
  } else {
    bits=Array.from({length:7},(_,i)=>getInput(c.id,`in${i}`));
  }
  let digit = -1;
  if (LE && LE.decodeSeg7) {
    const dec=LE.decodeSeg7(bits);
    digit=dec.digit;
  } else {
    const val=bits.reduce((acc,b,i)=>acc|(b?1<<(6-i):0),0);
    digit=SEG_PATTERNS.findIndex(p=>p.reduce((a,b,i)=>a|(b<<(6-i)),0)===val);
  }

  const ox=c.x+10,oy=c.y+15,sw=40,sh=6,gap=3;
  const segs=[
    [0,0,sw,sh],        // a top
    [sw,0,sh,sw],       // b top-right
    [sw,sw+gap,sh,sw],  // c bot-right
    [0,sw*2+gap,sw,sh], // d bottom
    [0,sw+gap,sh,sw],   // e bot-left
    [0,0,sh,sw],        // f top-left
    [0,sw+gap/2,sw,sh], // g middle
  ];
  segs.forEach(([x,y,w,h],i)=>{
    ctx.fillStyle=bits[i]?'#dc2626':'rgba(220,38,38,0.1)';
    ctx.fillRect(ox+x,oy+y,w,h);
  });
  ctx.fillStyle='#666'; ctx.font='10px monospace'; ctx.textAlign='center';
  ctx.fillText(digit>=0?digit:'?', c.x+c.w/2,c.y+c.h-8);
}

// ── DRAW WIRES ────────────────────────────────────────────────
function drawWires(){
  if(!wireCanvas||!wctx) return;
  wctx.clearRect(0,0,wireCanvas.width,wireCanvas.height);
  wctx.save(); wctx.translate(panX,panY); wctx.scale(zoom,zoom);
  for(const w of wires){
    const fp=getPortPos(w.from.id,w.from.port);
    const tp=getPortPos(w.to.id,w.to.port);
    if(!fp||!tp) continue;
    const src=components.get(w.from.id);
    const on=src && src.state;
    drawWirePath(fp,tp,on,w.selected);
  }
  if(pendingWire){
    const fp=getPortPos(pendingWire.id,pendingWire.port);
    if(fp){
      const wm=screenToWorld(mouseX,mouseY);
      drawWirePath(fp,{x:wm.x,y:wm.y},false,false,true);
    }
  }
  wctx.restore();
}

function drawWirePath(fp,tp,on,sel,pending){
  const cx1=fp.x+Math.max(30,Math.abs(tp.x-fp.x)*0.4);
  const cx2=tp.x-Math.max(30,Math.abs(tp.x-fp.x)*0.4);
  wctx.beginPath();
  wctx.moveTo(fp.x,fp.y);
  wctx.bezierCurveTo(cx1,fp.y,cx2,tp.y,tp.x,tp.y);
  wctx.strokeStyle=pending?'rgba(22,163,74,0.4)':on?'#22c55e':'#a89070';
  wctx.lineWidth=(on?2.5:1.5)*(sel?2:1);
  wctx.setLineDash(pending?[5,8]:[]);
  wctx.shadowColor=on?'rgba(34,197,94,0.4)':'transparent';
  wctx.shadowBlur=on?8:0;
  wctx.stroke();
  wctx.shadowBlur=0; wctx.setLineDash([]);
  if(!pending){
    wctx.fillStyle=on?'#22c55e':'#a89070';
    wctx.beginPath(); wctx.arc(fp.x,fp.y,3,0,Math.PI*2); wctx.fill();
    wctx.beginPath(); wctx.arc(tp.x,tp.y,3,0,Math.PI*2); wctx.fill();
  }
}

// ── CLOCK ─────────────────────────────────────────────────────
function startClock(){
  if(clockInterval) clearInterval(clockInterval);
  const ms=Math.round(1000/clockHz/2);
  clockInterval=setInterval(()=>{
    if (LE && LE.tickClocks) LE.tickClocks(components);
    else {
      for(const[,c] of components){ if(c.type==='clock'){ c.state=!c.state; c.on=c.state; } }
    }
    propagate();
    // Try worker-aware async propagate if integrated
    if (window.AppIntegration && window.AppIntegration.propagateAsync) {
      // fire async but don't block clock; sync already did
    }
  }, ms);
}
function setClockHz(hz){
  clockHz=hz;
  document.querySelectorAll('.clock-btn').forEach(b=>b.classList.remove('active'));
  const el=document.getElementById(`clk-${hz*1000}`);
  if(el) el.classList.add('active');
  startClock();
  simLog(`Clock: ${hz}Hz`);
}
function stopClock(){ if(clockInterval){ clearInterval(clockInterval); clockInterval=null; } }
window.setClockHz = setClockHz;

// ── INPUT HANDLING ────────────────────────────────────────────
function attachCanvasEvents(){
  if(!wrap) return;
  wrap.addEventListener('mousedown',e=>{
    const wp=wrap.getBoundingClientRect();
    const sx=e.clientX-wp.left, sy=e.clientY-wp.top;
    const{x:wx,y:wy}=screenToWorld(sx,sy);

    if(e.button===1||(e.button===0&&e.altKey)){
      isPanning=true; panStart={mx:sx,my:sy,px:panX,py:panY};
      e.preventDefault(); return;
    }
    if(e.button===2){ rightClickAction(sx,sy); return; }

    const port=findPort(wx,wy);
    if(port&&(mode==='wire'||mode==='place')){
      pendingWire={...port}; e.preventDefault(); return;
    }

    const comp=findComp(wx,wy);
    if(comp){
      if(mode==='select'||mode==='place'){
        selectedId=comp.id; updateProps();
        dragging=comp.id; dragOX=wx-comp.x; dragOY=wy-comp.y;
        if(comp.type==='switch'&&!pendingWire){ comp.on=!comp.on; comp.state=comp.on; propagate(); simLog(`Switch ${comp.on?'ON':'OFF'}`); }
      }
      e.preventDefault(); return;
    }

    if(mode==='place'&&!pendingWire){
      createComp(selCompType, wx, wy);
    }
    selectedId=null; updateProps();
  });

  wrap.addEventListener('mousemove',e=>{
    const wp=wrap.getBoundingClientRect();
    mouseX=e.clientX-wp.left; mouseY=e.clientY-wp.top;
    const{x:wx,y:wy}=screenToWorld(mouseX,mouseY);

    if(isPanning&&panStart){
      panX=panStart.px+(mouseX-panStart.mx);
      panY=panStart.py+(mouseY-panStart.my);
      drawComponents(); drawWires(); return;
    }
    if(dragging){
      const c=components.get(dragging); if(!c) return;
      c.x=snap(wx-dragOX); c.y=snap(wy-dragOY);
      drawComponents(); drawWires(); return;
    }
    if(pendingWire) drawWires();
    const port=findPort(wx,wy);
    const comp=findComp(wx,wy);
    const tip=document.getElementById('tip');
    if(!tip) return;
    if(port){ tip.style.display='block'; tip.style.left=(e.clientX+12)+'px'; tip.style.top=(e.clientY+12)+'px'; tip.textContent=`${port.port} — ${port.id}`; }
    else if(comp){
      const def=CDEFS[comp.type];
      tip.style.display='block'; tip.style.left=(e.clientX+12)+'px'; tip.style.top=(e.clientY+12)+'px';
      tip.textContent=`${def.label}\nState: ${comp.state?'HIGH':'LOW'}\nID: ${comp.id}`;
    } else tip.style.display='none';
  });

  wrap.addEventListener('mouseup',e=>{
    const wp=wrap.getBoundingClientRect();
    const sx=e.clientX-wp.left, sy=e.clientY-wp.top;
    const{x:wx,y:wy}=screenToWorld(sx,sy);

    if(isPanning){ isPanning=false; panStart=null; return; }
    if(dragging){ dragging=null; propagate(); return; }

    if(pendingWire){
      const port=findPort(wx,wy);
      if(port&&port.id!==pendingWire.id){ addWire(pendingWire, port); }
      pendingWire=null; drawWires();
    }
  });

  wrap.addEventListener('wheel',e=>{
    e.preventDefault();
    const wp=wrap.getBoundingClientRect();
    const sx=e.clientX-wp.left, sy=e.clientY-wp.top;
    const factor=e.deltaY<0?1.12:1/1.12;
    panX=(panX-sx)*factor+sx;
    panY=(panY-sy)*factor+sy;
    zoom*=factor; zoom=Math.max(0.2,Math.min(4,zoom));
    const zi=document.getElementById('zoom-ind');
    if(zi) zi.textContent=Math.round(zoom*100)+'%';
    drawComponents(); drawWires();
  },{passive:false});

  wrap.addEventListener('contextmenu',e=>{ e.preventDefault(); });
}

function rightClickAction(sx,sy){
  const{x:wx,y:wy}=screenToWorld(sx,sy);
  const comp=findComp(wx,wy);
  if(comp){ deleteComp(comp.id); return; }
  let removed=false;
  wires=wires.filter(w=>{
    const fp=getPortPos(w.from.id,w.from.port), tp=getPortPos(w.to.id,w.to.port);
    if(!fp||!tp) return true;
    const d=ptSeg(wx,wy,fp.x,fp.y,tp.x,tp.y);
    if(d<8/zoom){ removed=true; return false; }
    return true;
  });
  if(removed){ simLog('Wire removed'); propagate(); drawWires(); }
}

function findPort(wx,wy){
  for(const[,c] of components){
    const def=CDEFS[c.type];
    if(def.outs>0){ const p=getPortPos(c.id,'out'); if(p&&Math.hypot(wx-p.x,wy-p.y)<10) return {id:c.id, port:'out'}; }
    for(let i=0;i<def.ins;i++){ const p=getPortPos(c.id,`in${i}`); if(p&&Math.hypot(wx-p.x,wy-p.y)<10) return {id:c.id, port:`in${i}`}; }
  }
  return null;
}
function findComp(wx,wy){
  for(const[,c] of components){ if(wx>=c.x&&wx<=c.x+c.w&&wy>=c.y&&wy<=c.y+c.h) return c; }
  return null;
}
function ptSeg(px,py,x1,y1,x2,y2){
  const dx=x2-x1, dy=y2-y1;
  const t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(px-(x1+t*dx), py-(y1+t*dy));
}

// ── WIRES ─────────────────────────────────────────────────────
function addWire(from,to){
  let f=from,t=to;
  if(from.port.startsWith('in')&&to.port.startsWith('out')){ f=to; t=from; }
  if(f.port.startsWith('in')||t.port.startsWith('out')){ simLog('Output→Input only','err'); return; }
  if(!components.has(f.id) || !components.has(t.id)){ simLog('Missing component','err'); return; }
  if(wires.some(w=>w.from.id===f.id&&w.from.port===f.port&&w.to.id===t.id&&w.to.port===t.port)){ simLog('Duplicate wire','err'); return; }
  wires.push({from:{...f}, to:{...t}});
  simLog(`Wired: ${f.id}→${t.id}`);
  propagate(); drawWires();
}

// ── UI ────────────────────────────────────────────────────────
function setMode(m){
  mode=m;
  ['wire','select'].forEach(x=>{
    const el=document.getElementById('tb-'+x);
    if(el) el.classList.toggle('active', m===x);
  });
}
window.setMode = setMode;

function selComp(type){
  selCompType=type; mode='place';
  document.querySelectorAll('.comp-btn').forEach(b=>b.classList.remove('sel'));
  const el=document.getElementById('cb-'+type); if(el) el.classList.add('sel');
  setMode('place');
}
window.selComp = selComp;

function deleteSelected(){
  if(selectedId){ deleteComp(selectedId); selectedId=null; updateProps(); }
}
window.deleteSelected = deleteSelected;

function deleteComp(id){
  components.delete(id);
  wires=wires.filter(w=>w.from.id!==id&&w.to.id!==id);
  propagate(); drawComponents(); drawWires(); simLog('Deleted');
}
window.deleteComp = deleteComp;

function clearAll(){
  components.clear(); wires=[]; nextId=1; selectedId=null;
  propagate(); drawComponents(); drawWires(); simLog('Cleared');
}
window.clearAll = clearAll;

function updateProps(){
  const el=document.getElementById('prop-panel');
  if(!el) return;
  if(!selectedId||!components.has(selectedId)){ el.textContent='Nothing selected'; return; }
  const c=components.get(selectedId); const def=CDEFS[c.type];
  el.innerHTML=`<div class="prop-row"><span>${esc(def.label)}</span><span class="prop-val">${esc(c.id)}</span></div>
    <div class="prop-row"><span>State</span><span class="prop-val" style="color:${c.state?'#16a34a':'#888'}">${c.state?'HIGH':'LOW'}</span></div>
    <div class="prop-row"><span>Pos</span><span class="prop-val">${c.x},${c.y}</span></div>
    ${c.type==='switch'?`<div class="prop-row"><span>Switch</span><span class="prop-val">${c.on?'ON':'OFF'}</span></div>`:''}`;
}
function updateSimStatus(){
  const clocks=[...components.values()].filter(c=>c.type==='clock');
  const el=document.getElementById('sim-status');
  if(!el) return;
  if(clocks.length>0){ el.textContent='● RUNNING'; el.className='sim-status running'; }
  else { el.textContent='● IDLE'; el.className='sim-status stopped'; }
}

let simLogEl=null;
function simLog(msg,cls=''){
  if(!simLogEl) simLogEl=document.getElementById('sim-log');
  if(!simLogEl) return;
  const d=document.createElement('div'); d.className=cls; d.textContent=msg;
  simLogEl.prepend(d); while(simLogEl.children.length>50) simLogEl.removeChild(simLogEl.lastChild);
}
window.simLog = simLog;

// ── SAVE / LOAD ───────────────────────────────────────────────
function saveCircuit(){
  let data;
  if (LE && LE.serialize) data=LE.serialize(components, wires, nextId);
  else data={comps:[...components.values()].map(c=>({...c})), wires: wires.map(w=>({...w, from:{...w.from}, to:{...w.to}})), nextId};
  try{ localStorage.setItem('logicforge_save', JSON.stringify(data)); localStorage.setItem('logicforge2_save', JSON.stringify(data)); }catch(e){}
  // Also try to export JSON file
  simLog('Circuit saved ✓');
  showToast('Circuit saved ✓');
}
window.saveCircuit = saveCircuit;

function loadCircuit(){
  const raw=localStorage.getItem('logicforge_save')||localStorage.getItem('logicforge2_save');
  if(!raw){ simLog('No save found','err'); showToast('No save found'); return; }
  try{
    const data=JSON.parse(raw);
    let des;
    if (LE && LE.deserialize) des=LE.deserialize(data);
    else {
      des={components:new Map(), wires:[], nextId:1};
      (data.comps||data.comps||[]).forEach(c=>{des.components.set(c.id,c); const n=parseInt(c.id.replace('c','')); if(!isNaN(n)&&n>=des.nextId) des.nextId=n+1;});
      des.wires = data.wires||[];
    }
    components=des.components; wires=des.wires; nextId=des.nextId||1;
    propagate(); drawComponents(); drawWires(); simLog('Circuit loaded ✓'); showToast('Circuit loaded ✓');
  }catch(e){ simLog('Load failed: '+e.message,'err'); }
}
window.loadCircuit = loadCircuit;

function exportJSON(){
  const data = LE && LE.serialize ? LE.serialize(components, wires, nextId) : {comps:[...components.values()], wires, nextId};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='logic-forge-circuit.json'; a.click();
  URL.revokeObjectURL(url);
  simLog('Exported JSON ✓');
}
window.exportJSON = exportJSON;

function exportSVG(){
  const preview=document.getElementById('preview-svg');
  if(VizMod && VizMod.buildCircuitSVG){
    const svg=VizMod.buildCircuitSVG(components, wires);
    if(preview){ preview.innerHTML=svg; preview.style.display='block'; }
    // Download
    const blob=new Blob([svg],{type:'image/svg+xml'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download='circuit.svg'; a.click();
    URL.revokeObjectURL(url);
    simLog('Exported SVG ✓');
  } else if(preview){
    preview.textContent='Viz not loaded — no SVG export';
  }
}
window.exportSVG = exportSVG;

// ── EXAMPLE CIRCUITS (via LogicLibrary if available) ─────────
function loadExample(name){
  clearAll();
  if (Lib && Lib.get) {
    const entry = Lib.get(name);
    if (entry && entry.build) {
      // Use engine-aware builder via AppIntegration or direct
      if (window.AppIntegration && window.AppIntegration.loadExampleAsync) {
        try {
          const ref={value:1};
          window.AppIntegration.loadExampleAsync(name, components, wires, ref);
          nextId=ref.value;
          propagate(); drawComponents(); drawWires(); simLog(`${entry.name} loaded`,'on'); showToast(entry.name+' loaded');
          updateSVGPreview();
          return;
        } catch(e){ console.warn('AppIntegration load failed, fallback', e); }
      }
      // Fallback direct build with our createComp/addWire wrappers
      const ctxCreate=(type,x,y)=>createComp(type,x,y);
      // createComp already pushes to components and increments nextId and propagates; we need to suppress propagate per addition for bulk
      // Instead we will manually use engine's factory without side effects, then bulk propagate.
      // Simpler: clear and use entry.build with manual factories that don't propagate each time
      components.clear(); wires=[]; nextId=1;
      let nid=1;
      function bulkCreate(type,x,y){
        const id='c'+nid++;
        const comp = LE ? LE.createComponent(type,x,y,id) : {id,type,x:snap(x-(CDEFS[type].w/2)),y:snap(y-(CDEFS[type].h/2)),state:false,on:false,w:CDEFS[type].w,h:CDEFS[type].h};
        if(type==='const1'){ comp.on=true; comp.state=true; }
        components.set(id,comp); return comp;
      }
      function bulkWire(f,t){ wires.push({from:{...f}, to:{...t}}); }
      entry.build({createComp:bulkCreate, addWire:bulkWire});
      nextId=nid;
      propagate(); drawComponents(); drawWires(); simLog(`${entry.name} loaded`,'on'); showToast(entry.name+' loaded');
      updateSVGPreview();
      return;
    }
  }
  // Fallback legacy examples (half_adder, sr_latch, clock_led) matching original
  if(name==='half_adder'){
    const sw1=createComp('switch',100,100);
    const sw2=createComp('switch',100,200);
    const xor=createComp('xor',280,120);
    const and=createComp('and',280,200);
    const led_s=createComp('led',460,120);
    const led_c=createComp('led',460,200);
    createComp('probe',460,100);
    addWire({id:sw1.id,port:'out'},{id:xor.id,port:'in0'});
    addWire({id:sw2.id,port:'out'},{id:xor.id,port:'in1'});
    addWire({id:sw1.id,port:'out'},{id:and.id,port:'in0'});
    addWire({id:sw2.id,port:'out'},{id:and.id,port:'in1'});
    addWire({id:xor.id,port:'out'},{id:led_s.id,port:'in0'});
    addWire({id:and.id,port:'out'},{id:led_c.id,port:'in0'});
    simLog('Half Adder loaded','on');
  } else if(name==='sr_latch'){
    const sw_s=createComp('switch',80,120);
    const sw_r=createComp('switch',80,240);
    const nor1=createComp('nor',260,120);
    const nor2=createComp('nor',260,240);
    const led_q=createComp('led',440,120);
    const led_qn=createComp('led',440,240);
    addWire({id:sw_s.id,port:'out'},{id:nor1.id,port:'in0'});
    addWire({id:sw_r.id,port:'out'},{id:nor2.id,port:'in1'});
    addWire({id:nor1.id,port:'out'},{id:nor2.id,port:'in0'});
    addWire({id:nor2.id,port:'out'},{id:nor1.id,port:'in1'});
    addWire({id:nor1.id,port:'out'},{id:led_q.id,port:'in0'});
    addWire({id:nor2.id,port:'out'},{id:led_qn.id,port:'in0'});
    simLog('SR Latch loaded (feedback)','on');
  } else if(name==='clock_led'){
    const clk=createComp('clock',100,160);
    const not1=createComp('not',280,120);
    const led1=createComp('led',460,120);
    const led2=createComp('led',460,200);
    addWire({id:clk.id,port:'out'},{id:not1.id,port:'in0'});
    addWire({id:not1.id,port:'out'},{id:led1.id,port:'in0'});
    addWire({id:clk.id,port:'out'},{id:led2.id,port:'in0'});
    simLog('Clock+LED loaded','on');
  } else {
    simLog('Unknown example: '+name,'err');
  }
  updateSVGPreview();
}
window.loadExample = loadExample;

function updateSVGPreview(){
  const preview=document.getElementById('preview-svg');
  if(!preview || !VizMod) return;
  try{ preview.innerHTML = VizMod.buildCircuitSVG(components, wires); }catch(e){}
}

// ── KEYBOARD SHORTCUTS ────────────────────────────────────────
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT' || e.target.tagName==='TEXTAREA') return;
  const map={'1':'switch','2':'clock','3':'const1','4':'const0','a':'and','o':'or','n':'not','l':'led','w':null,'s':null};
  if(map[e.key]!==undefined){
    if(map[e.key]) selComp(map[e.key]);
    else if(e.key==='w') setMode('wire');
    else if(e.key==='s') setMode('select');
    e.preventDefault();
  }
  if(e.key==='Delete'||e.key==='Backspace'){ deleteSelected(); e.preventDefault(); }
  if(e.key==='Escape'){ pendingWire=null; drawWires(); }
  if(e.key==='?' && e.shiftKey){ const m=document.getElementById('kbdModal'); if(m) m.classList.remove('hidden'); }
});

// ── RESIZE ────────────────────────────────────────────────────
function resizeCanvases(){
  if(!wrap || !canvas || !wireCanvas) return;
  const wr=wrap.getBoundingClientRect();
  canvas.width=wr.width; canvas.height=wr.height;
  wireCanvas.width=wr.width; wireCanvas.height=wr.height;
  drawComponents(); drawWires();
}
window.addEventListener('resize',()=>{ resizeCanvases(); });

// ── HERO TERMINAL TYPE EFFECT (Y2K flair) ─────────────────────
function initHeroTerminal(){
  const el=document.getElementById('heroTerminal');
  if(!el) return;
  const lines=[
    '<span class="t-prompt">logic-forge@rahul:~$</span> <span class="t-cmd">propagate --graph circuit.json</span>',
    '<span class="t-out">  ↳ 6 components · 6 wires · fixed-point iteration</span>',
    '<span class="t-success">  ✓ STABLE in 3 passes · no oscillator</span>',
    '<span class="t-prompt">logic-forge@rahul:~$</span> <span class="t-cmd">eval AND a=1 b=0 → 0</span>',
    '<span class="t-token">  truth: AND(1,0)=0  OR(1,0)=1  XOR(1,0)=1</span>',
  ];
  let i=0; el.innerHTML='';
  function next(){
    if(i>=lines.length){ setTimeout(()=>{el.innerHTML=''; i=0; next();}, 4000); return; }
    const d=document.createElement('div'); d.innerHTML=lines[i]; d.style.opacity='0'; d.style.transform='translateY(6px)'; d.style.transition='all .4s ease'; el.appendChild(d);
    requestAnimationFrame(()=>{ d.style.opacity='1'; d.style.transform='translateY(0)'; });
    i++; setTimeout(next, 900);
  }
  next();
}

// ── BG CANVAS (subtle grid shimmer) ───────────────────────────
function initBgCanvas(){
  const bg=document.getElementById('bgCanvas');
  if(!bg) return;
  const ctx2=bg.getContext('2d');
  function resize(){ bg.width=window.innerWidth; bg.height=window.innerHeight; }
  resize(); window.addEventListener('resize', resize);
  let t=0;
  function loop(){
    t+=0.006;
    ctx2.clearRect(0,0,bg.width,bg.height);
    // faint moving gradient blobs
    const g1=ctx2.createRadialGradient(bg.width*0.2+Math.sin(t)*60, bg.height*0.3, 0, bg.width*0.2, bg.height*0.3, 420);
    g1.addColorStop(0,'rgba(255,45,155,0.06)'); g1.addColorStop(1,'transparent');
    ctx2.fillStyle=g1; ctx2.fillRect(0,0,bg.width,bg.height);
    const g2=ctx2.createRadialGradient(bg.width*0.8+Math.cos(t*1.2)*50, bg.height*0.8, 0, bg.width*0.8, bg.height*0.8, 360);
    g2.addColorStop(0,'rgba(155,48,255,0.05)'); g2.addColorStop(1,'transparent');
    ctx2.fillStyle=g2; ctx2.fillRect(0,0,bg.width,bg.height);
    requestAnimationFrame(loop);
  }
  loop();
}

// ── GLITTER CURSOR ────────────────────────────────────────────
function initGlitter(){
  const c=document.getElementById('glitterCanvas');
  if(!c) return;
  const gtx=c.getContext('2d');
  function resize(){ c.width=window.innerWidth; c.height=window.innerHeight; }
  resize(); window.addEventListener('resize', resize);
  const particles=[];
  window.addEventListener('mousemove', e=>{
    for(let i=0;i<2;i++) particles.push({x:e.clientX,y:e.clientY,vx:(Math.random()-0.5)*3,vy:(Math.random()-0.5)*3-1,life:1,dec:0.04+Math.random()*0.03,size:1+Math.random()*2, hue: Math.random()<0.5?320:280});
    if(particles.length>120) particles.splice(0, particles.length-120);
  });
  function loop(){
    gtx.clearRect(0,0,c.width,c.height);
    for(let i=particles.length-1;i>=0;i--){
      const p=particles[i];
      p.x+=p.vx; p.y+=p.vy; p.vy+=0.06; p.life-=p.dec;
      if(p.life<=0){ particles.splice(i,1); continue; }
      gtx.globalAlpha=p.life*0.9;
      gtx.fillStyle=`hsl(${p.hue} 100% 60%)`;
      gtx.beginPath(); gtx.arc(p.x,p.y,p.size,0,Math.PI*2); gtx.fill();
    }
    requestAnimationFrame(loop);
  }
  loop();
}

// ── DARK MODE (Y2K) ───────────────────────────────────────────
function initDarkToggle(){
  const btn=document.getElementById('darkToggle');
  if(!btn) return;
  btn.addEventListener('click',()=>{
    document.body.classList.toggle('dark-mode');
    const isDark=document.body.classList.contains('dark-mode');
    btn.textContent = isDark ? '☀ Light' : '🌙 Dark';
  });
}

// ── MOBILE NAV ────────────────────────────────────────────────
function initMobileNav(){
  const btn=document.getElementById('mobileMenuBtn');
  const nav=document.getElementById('mobileNav');
  if(!btn||!nav) return;
  btn.addEventListener('click',()=> nav.classList.toggle('open'));
}

// ── SCROLL PROGRESS ───────────────────────────────────────────
function initScrollProgress(){
  const bar=document.getElementById('scrollProgress');
  if(!bar) return;
  window.addEventListener('scroll',()=>{
    const h=document.documentElement.scrollHeight - window.innerHeight;
    const p=h>0 ? (window.scrollY/h*100) : 0;
    bar.style.width=p+'%';
  });
}

// ── TRUTH TABLE RENDER (hero/concepts) ────────────────────────
function renderTruthTables(){
  const el=document.getElementById('truthTables');
  if(!el || !CDEFS) return;
  const gates=['and','or','not','nand','nor','xor','xnor','buf'];
  el.innerHTML=gates.map(g=>{
    let rows='';
    if(g==='not'||g==='buf'){
      rows=`in → out\n0 → ${g==='not'?1:0}\n1 → ${g==='not'?0:1}`;
    } else {
      const fn=CDEFS[g] ? ( (a,b)=>{
        if(g==='and') return a&&b;
        if(g==='or') return a||b;
        if(g==='nand') return !(a&&b);
        if(g==='nor') return !(a||b);
        if(g==='xor') return a!==b;
        if(g==='xnor') return a===b;
      }) : null;
      rows=`a b → out\n0 0 → ${fn(false,false)?1:0}\n0 1 → ${fn(false,true)?1:0}\n1 0 → ${fn(true,false)?1:0}\n1 1 → ${fn(true,true)?1:0}`;
    }
    return `<div class="truth-card"><h5>${esc(g.toUpperCase())}</h5><pre>${esc(rows)}</pre></div>`;
  }).join('');
}

// ── LIBRARY RENDER ────────────────────────────────────────────
function renderLibrary(){
  const el=document.getElementById('libraryGrid');
  if(!el || !Lib) return;
  const list=Lib.list();
  el.innerHTML=list.map(item=>`
    <div class="phase-card" style="cursor:pointer" onclick="loadExample('${esc(item.id)}')">
      <div class="phase-num">CIRCUIT</div>
      <h3>${esc(item.name)}</h3>
      <p>${esc(item.description)}</p>
      <span class="phase-tag">${esc(item.id)}</span>
    </div>
  `).join('');
}

// ── INIT ──────────────────────────────────────────────────────
function init(){
  // Bind DOM refs
  canvas=document.getElementById('main-canvas');
  ctx=canvas?canvas.getContext('2d'):null;
  wireCanvas=document.getElementById('wire-canvas');
  wctx=wireCanvas?wireCanvas.getContext('2d'):null;
  wrap=document.getElementById('canvas-wrap');
  simLogEl=document.getElementById('sim-log');

  const overlay=document.getElementById('overlay');
  if(overlay) overlay.style.display='none';

  attachCanvasEvents();
  resizeCanvases();
  startClock();
  loadExample('half_adder');
  simLog('LOGIC FORGE ready — Y2K engine ✓','on');
  showToast('Logic Forge ready ✦');

  // Y2K chrome
  initHeroTerminal();
  initBgCanvas();
  initGlitter();
  initDarkToggle();
  initMobileNav();
  initScrollProgress();
  renderTruthTables();
  renderLibrary();
  updateSVGPreview();

  // Keyboard badge
  const kbdOpen=document.getElementById('kbdOpenBtn');
  const kbdModal=document.getElementById('kbdModal');
  const kbdClose=document.getElementById('kbdModalClose');
  if(kbdOpen&&kbdModal) kbdOpen.addEventListener('click',()=> kbdModal.classList.remove('hidden'));
  if(kbdClose&&kbdModal) kbdClose.addEventListener('click',()=> kbdModal.classList.add('hidden'));
  if(kbdModal) kbdModal.addEventListener('click', (e)=>{ if(e.target===kbdModal) kbdModal.classList.add('hidden'); });
}
window.init = init;

// Auto-init if overlay not present? Wait for DOM
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded', ()=>{
    // Don't auto-start, wait for START button if overlay present
    const ov=document.getElementById('overlay');
    if(!ov) init();
  });
} else {
  const ov=document.getElementById('overlay');
  if(!ov) init();
}

// Export for tests / integration
window.LogicForgeUI = {
  get components(){ return components; },
  get wires(){ return wires; },
  get nextId(){ return nextId; },
  createComp, propagate, evalComp, getInput, getPortPos, drawComponents, drawWires,
  setMode, selComp, loadExample, clearAll, saveCircuit, loadCircuit,
  CDEFS, SEG_PATTERNS,
  init
};
