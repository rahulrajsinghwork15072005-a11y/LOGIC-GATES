(function (root, factory) {
  const api = factory();
  if (typeof self !== 'undefined') self.Viz = api;
  if (typeof window !== 'undefined') window.Viz = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(this, function () {
  'use strict';

  // ── XSS-safe escape (mirrors compiler-forge viz.js) ──────────
  function esc(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  // ── Gate SVG (standalone, XSS-safe) ───────────────────────────
  function buildGateSVG(comp, CDEFS) {
    if (!comp || !CDEFS) return '<svg></svg>';
    const def = CDEFS[comp.type];
    if (!def) return '<svg></svg>';
    const w = comp.w || def.w, h = comp.h || def.h;
    const powered = !!comp.state;
    const sel = comp.selected ? '#000' : powered && def.color ? def.color : powered ? '#16a34a' : '#ccc';
    const strokeW = comp.selected ? 2.5 : powered ? 2 : 1.5;
    const fill = comp.type === 'led' && powered ? '#dcfce7' : comp.type === 'led' && !powered ? '#f5f5f5' : '#fff8f0';
    const textColor = powered && def.color ? def.color : powered ? '#16a34a' : '#555';

    let symbolHtml = '';
    if (comp.type === 'switch') {
      symbolHtml = `<text x="${w/2}" y="${h/2-4}" text-anchor="middle" font-family="monospace" font-size="20" font-weight="700" fill="${comp.on ? '#16a34a' : '#888'}">${esc(comp.on ? '⏻' : '○')}</text>
      <text x="${w/2}" y="${h-10}" text-anchor="middle" font-family="monospace" font-size="9" fill="${comp.on ? '#16a34a' : '#aaa'}">${esc(comp.on ? 'ON' : 'OFF')}</text>`;
    } else if (comp.type === 'clock') {
      symbolHtml = `<text x="${w/2}" y="${h/2-4}" text-anchor="middle" font-size="16" fill="${comp.state ? '#d97706' : '#aaa'}">${esc('⏱')}</text>
      <text x="${w/2}" y="${h-10}" text-anchor="middle" font-size="9" fill="#aaa">${esc((comp._hz || 0.5) + 'Hz')}</text>`;
    } else if (comp.type === 'probe') {
      symbolHtml = `<text x="${w/2}" y="${h/2}" text-anchor="middle" font-weight="700" font-size="14" fill="${powered ? '#2563eb' : '#aaa'}">${esc(powered ? 'HIGH' : 'LOW')}</text>`;
    } else if (comp.type === 'seg7') {
      // 7-seg is drawn externally; placeholder
      symbolHtml = `<text x="${w/2}" y="${h-8}" text-anchor="middle" font-size="10" fill="#666">${esc('7-SEG')}</text>`;
    } else {
      symbolHtml = `<text x="${w/2}" y="${h/2-5}" text-anchor="middle" font-weight="700" font-size="${Math.min(w,h)*0.4}" fill="${esc(textColor)}">${esc(def.sym)}</text>
      <text x="${w/2}" y="${h-8}" text-anchor="middle" font-size="8" fill="#bbb">${esc(def.label)}</text>`;
    }

    const isLed = comp.type === 'led' && powered;
    const glow = isLed ? `<rect x="-4" y="-4" width="${w+8}" height="${h+8}" fill="rgba(22,163,74,0.1)" rx="4"/>` : '';

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w+12}" height="${h+12}" viewBox="-6 -6 ${w+12} ${h+12}">
      <rect x="3" y="3" width="${w}" height="${h}" fill="rgba(0,0,0,0.08)" rx="2"/>
      ${glow}
      <rect x="0" y="0" width="${w}" height="${h}" fill="${esc(fill)}" stroke="${esc(sel)}" stroke-width="${strokeW}" rx="2"/>
      ${symbolHtml}
    </svg>`;
  }

  // ── Wire SVG ───────────────────────────────────────────────────
  function buildWireSVG(from, to, on, selected, pending) {
    if (!from || !to) return '';
    const cx1 = from.x + Math.max(30, Math.abs(to.x - from.x) * 0.4);
    const cx2 = to.x - Math.max(30, Math.abs(to.x - from.x) * 0.4);
    const color = pending ? 'rgba(22,163,74,0.4)' : on ? '#22c55e' : '#a89070';
    const width = (on ? 2.5 : 1.5) * (selected ? 2 : 1);
    const dash = pending ? 'stroke-dasharray:5 8;' : '';
    const blur = on ? 'filter:drop-shadow(0 0 4px rgba(34,197,94,0.6));' : '';
    const d = `M ${from.x} ${from.y} C ${cx1} ${from.y}, ${cx2} ${to.y}, ${to.x} ${to.y}`;
    let svg = `<path d="${esc(d)}" fill="none" stroke="${esc(color)}" stroke-width="${width}" style="${esc(dash+blur)}"/>`;
    if (!pending) {
      svg += `<circle cx="${from.x}" cy="${from.y}" r="3" fill="${esc(color)}"/><circle cx="${to.x}" cy="${to.y}" r="3" fill="${esc(color)}"/>`;
    }
    return svg;
  }

  // ── 7-Segment SVG ──────────────────────────────────────────────
  function buildSeg7SVG(comp, bits, CDEFS) {
    // bits: boolean[7] -> segments a-g mapping matches viz.js drawSeg7
    // If bits missing, produce off state
    const b = bits && bits.length === 7 ? bits : [false, false, false, false, false, false, false];
    const w = 60, h = 80;
    const sw = 40, sh = 6, gap = 3;
    const ox = 10, oy = 15;
    const segs = [
      [0, 0, sw, sh],       // a top
      [sw, 0, sh, sw],      // b top-right
      [sw, sw + gap, sh, sw], // c bot-right
      [0, sw * 2 + gap, sw, sh], // d bottom
      [0, sw + gap, sh, sw], // e bot-left
      [0, 0, sh, sw],       // f top-left
      [0, sw + gap / 2, sw, sh], // g middle
    ];
    let rects = '';
    segs.forEach(([x, y, rw, rh], i) => {
      const on = b[i];
      rects += `<rect x="${ox + x}" y="${oy + y}" width="${rw}" height="${rh}" fill="${on ? '#dc2626' : 'rgba(220,38,38,0.1)'}" rx="1"/>`;
    });

    // Try decode digit
    let digit = '?';
    try {
      const LE = (typeof LogicEngine !== 'undefined' ? LogicEngine : null);
      if (LE && LE.decodeSeg7) {
        const dec = LE.decodeSeg7(b);
        digit = dec.digit >= 0 ? String(dec.digit) : '?';
      } else {
        // Fallback: pattern match locally
        const patterns = [
          [1,1,1,0,1,1,1],[0,0,1,0,0,1,0],[1,0,1,1,1,0,1],[1,0,1,1,0,1,1],[0,1,1,1,0,1,0],
          [1,1,0,1,0,1,1],[1,1,0,1,1,1,1],[1,0,1,0,0,1,0],[1,1,1,1,1,1,1],[1,1,1,1,0,1,1]
        ];
        const val = b.reduce((a, v, i) => a | (v ? 1 << (6 - i) : 0), 0);
        const idx = patterns.findIndex(p => p.reduce((a, v, i) => a | (v << (6 - i)), 0) === val);
        digit = idx >= 0 ? String(idx) : '?';
      }
    } catch (e) { digit = '?'; }

    const powered = b.some(Boolean);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="110" viewBox="0 0 80 95" style="background:#fff8f0;border:1px solid ${esc(powered ? '#dc2626' : '#ccc')};border-radius:4px;">
      ${rects}
      <text x="40" y="90" text-anchor="middle" font-family="monospace" font-size="10" fill="#666">${esc(digit)}</text>
    </svg>`;
  }

  // ── Full circuit SVG (wires + gates, XSS-safe) ───────────────
  function buildCircuitSVG(componentsMap, wires, opts) {
    const components = componentsMap instanceof Map ? [...componentsMap.values()] : (Array.isArray(componentsMap) ? componentsMap : []);
    if (components.length === 0) {
      return '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" viewBox="0 0 600 300"><text x="50%" y="50%" text-anchor="middle" font-family="monospace" fill="#888">No components</text></svg>';
    }
    // Compute bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    components.forEach(c => {
      minX = Math.min(minX, c.x); minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x + c.w); maxY = Math.max(maxY, c.y + c.h);
    });
    wires = wires || [];
    // Add port extents for wires
    const pad = 40;
    const width = Math.max(600, (maxX - minX) + pad * 2);
    const height = Math.max(320, (maxY - minY) + pad * 2);
    const offX = -minX + pad, offY = -minY + pad;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background:#f0ebe0;border-radius:12px;">`;
    svg += `<style>.gate-label{font:700 11px monospace;fill:#fff;text-anchor:middle}.wire-on{stroke:#22c55e;stroke-width:2.2;fill:none;filter:drop-shadow(0 0 3px rgba(34,197,94,0.5))}.wire-off{stroke:#a89070;stroke-width:1.4;fill:none}</style>`;
    // Dot grid background
    svg += `<rect width="100%" height="100%" fill="#f0ebe0"/>`;
    // Wires first (behind gates)
    for (const w of wires) {
      let fromComp = components.find(c => c.id === w.from.id);
      let toComp = components.find(c => c.id === w.to.id);
      if (!fromComp || !toComp) continue;
      // Simple port pos calc without LogicEngine dependency
      function portPos(comp, port) {
        if (port === 'out') return { x: comp.x + comp.w + 5 + offX, y: comp.y + comp.h / 2 + offY };
        const defW = comp.w, defH = comp.h;
        // Estimate ins count from component type crude: 2 for gates, 1 for led/not/buf, 7 for seg7
        let ins = 2;
        if (['not','buf','led','probe'].includes(comp.type)) ins = 1;
        if (comp.type === 'seg7') ins = 7;
        if (['switch','clock','const1','const0'].includes(comp.type)) ins = 0;
        const idx = parseInt(port.replace('in',''), 10) || 0;
        const spacing = defH / (ins + 1);
        return { x: comp.x -5 + offX, y: comp.y + spacing * (idx+1) + offY };
      }
      const fp = portPos(fromComp, w.from.port);
      const tp = portPos(toComp, w.to.port);
      const on = !!fromComp.state;
      const col = on ? '#22c55e' : '#a89070';
      const sw = on ? 2.4 : 1.4;
      const cx1 = fp.x + Math.max(30, Math.abs(tp.x - fp.x) * 0.4);
      const cx2 = tp.x - Math.max(30, Math.abs(tp.x - fp.x) * 0.4);
      svg += `<path d="M ${fp.x} ${fp.y} C ${cx1} ${fp.y}, ${cx2} ${tp.y}, ${tp.x} ${tp.y}" fill="none" stroke="${esc(col)}" stroke-width="${sw}" ${on ? 'style="filter:drop-shadow(0 0 4px rgba(34,197,94,0.4))"' : ''}/>`;
      svg += `<circle cx="${fp.x}" cy="${fp.y}" r="2.5" fill="${esc(col)}"/><circle cx="${tp.x}" cy="${tp.y}" r="2.5" fill="${esc(col)}"/>`;
    }

    // Gates
    components.forEach(c => {
      const x = c.x + offX, y = c.y + offY;
      const pw = !!c.state;
      // Resolve def label fallback
      const labelMap = { switch:'SW', clock:'CLK', const1:'HIGH', const0:'LOW', and:'AND', or:'OR', not:'NOT', nand:'NAND', nor:'NOR', xor:'XOR', xnor:'XNOR', buf:'BUF', led:'LED', seg7:'SEG', probe:'PRB' };
      const symMap = { switch:'⏻', clock:'⏱', const1:'1', const0:'0', and:'∧', or:'∨', not:'¬', nand:'⊼', nor:'⊽', xor:'⊕', xnor:'⊙', buf:'▷', led:'◉', seg7:'7', probe:'⊡' };
      const lbl = labelMap[c.type] || c.type;
      const sym = symMap[c.type] || '?';
      const fill = c.type==='led' && pw ? '#dcfce7' : c.type==='led' && !pw ? '#f5f5f5' : '#fff8f0';
      const stroke = pw ? '#16a34a' : '#ccc';
      const sw2 = pw ? 2 : 1.5;
      svg += `<g transform="translate(${x},${y})">`;
      svg += `<rect x="2" y="2" width="${c.w}" height="${c.h}" fill="rgba(0,0,0,0.08)" rx="2"/>`;
      if (c.type==='led' && pw) svg += `<rect x="-4" y="-4" width="${c.w+8}" height="${c.h+8}" fill="rgba(22,163,74,0.1)" rx="4"/>`;
      svg += `<rect width="${c.w}" height="${c.h}" fill="${esc(fill)}" stroke="${esc(stroke)}" stroke-width="${sw2}" rx="2"/>`;
      if (c.type==='switch') {
        svg += `<text x="${c.w/2}" y="${c.h/2-4}" text-anchor="middle" font-family="monospace" font-weight="700" font-size="16" fill="${c.on ? '#16a34a' : '#888'}">${esc(c.on ? '⏻' : '○')}</text>`;
        svg += `<text x="${c.w/2}" y="${c.h-10}" text-anchor="middle" font-family="monospace" font-size="9" fill="${c.on ? '#16a34a' : '#aaa'}">${esc(c.on ? 'ON' : 'OFF')}</text>`;
      } else if (c.type==='probe') {
        svg += `<text x="${c.w/2}" y="${c.h/2+5}" text-anchor="middle" font-family="monospace" font-weight="700" font-size="12" fill="${pw ? '#2563eb' : '#aaa'}">${esc(pw ? 'HIGH' : 'LOW')}</text>`;
      } else if (c.type==='seg7') {
        svg += `<text x="${c.w/2}" y="${c.h-8}" text-anchor="middle" font-family="monospace" font-size="10" fill="#666">${esc(lbl)}</text>`;
      } else {
        svg += `<text x="${c.w/2}" y="${c.h/2-5}" text-anchor="middle" font-family="monospace" font-weight="700" font-size="${Math.min(c.w,c.h)*0.38}" fill="${pw ? '#16a34a' : '#555'}">${esc(sym)}</text>`;
        svg += `<text x="${c.w/2}" y="${c.h-7}" text-anchor="middle" font-family="monospace" font-size="8" fill="#bbb">${esc(lbl)}</text>`;
      }
      // Ports
      // For viz, show small circles at ports
      // Output
      if (c.type !== 'led' && c.type !== 'probe' && c.type !== 'seg7') {
        const outX = c.w + 5, outY = c.h/2;
        svg += `<circle cx="${outX}" cy="${outY}" r="4.5" fill="${pw ? '#16a34a':'#ccc'}" stroke="#333" stroke-width="1"/>`;
      }
      // Inputs
      let ins = 2;
      if (['not','buf','led','probe'].includes(c.type)) ins = 1;
      if (c.type === 'seg7') ins = 7;
      if (['switch','clock','const1','const0'].includes(c.type)) ins = 0;
      for (let i=0;i<ins;i++) {
        const py = (c.h/(ins+1))*(i+1);
        // determine if that input is HIGH (need wires info: find wire to this port)
        let sig = false, conn=false;
        if (wires) {
          const w = wires.find(wr => wr.to.id===c.id && wr.to.port===`in${i}`);
          if (w) { conn=true; const src = components.find(sc=>sc.id===w.from.id); sig = src ? !!src.state : false; }
        }
        const col = sig ? '#16a34a' : conn ? '#555' : '#ddd';
        svg += `<circle cx="-5" cy="${py}" r="4.5" fill="${col}" stroke="#333" stroke-width="1"/>`;
      }
      svg += `</g>`;
    });

    svg += `<text x="18" y="${height-10}" font-family="monospace" font-size="10" fill="#8a7a60">✦ ${components.length} components · ${wires.length} wires · ${components.filter(c=>c.state).length} HIGH</text>`;
    svg += `</svg>`;
    return svg;
  }

  function renderCircuit(container, components, wires) {
    if (!container) return;
    if (!components) { container.innerHTML = '<p style="color:#888;font-family:monospace">No circuit</p>'; return; }
    container.innerHTML = buildCircuitSVG(components, wires);
  }

  // Also alias for generic "automaton" parity with compiler-forge viz.js (buildAutomatonSVG etc.)
  // For Logic Forge the automaton is the circuit graph
  function buildAutomatonSVG(collection, transitions) {
    // Delegate to buildCircuitSVG if collection is actually components
    // If called with LR-style args, produce a placeholder
    if (Array.isArray(collection) && collection[0] && collection[0].type) {
      return buildCircuitSVG(collection, transitions);
    }
    return buildCircuitSVG([], []);
  }

  function renderAutomaton(container, collection, transitions) {
    if (!container) return;
    container.innerHTML = buildAutomatonSVG(collection, transitions);
  }

  // Canvas drawing (for legacy script.js compatibility) — draws to a provided canvas
  function drawCircuitCanvas(canvas, components, wires, opts) {
    if (!canvas || !components) return;
    const ctx = canvas.getContext('2d');
    const map = components instanceof Map ? components : new Map((components||[]).map(c=>[c.id,c]));
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = '#f0ebe0';
    ctx.fillRect(0,0,w,h);
    // Simple rendering via SVG-building then draw? For canvas we just note fallback
    // For now draw placeholder that engine is available via SVG
    ctx.fillStyle = '#333';
    ctx.font = '11px monospace';
    ctx.fillText(`Circuit: ${map.size} components · ${(wires||[]).length} wires · Viz UMD (XSS-safe)`, 12, 18);
  }

  return { esc, buildGateSVG, buildWireSVG, buildSeg7SVG, buildCircuitSVG, renderCircuit, buildAutomatonSVG, renderAutomaton, drawCircuitCanvas };
});
