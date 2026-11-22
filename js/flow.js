/* HiveMind — flowchart editor and run engine (Start, Output, Delay, Decision, Stop). */
window.FC = (() => {
  const C = { nodes: [], edges: [] };
  const U = { tool: 'select', sel: null, from: null, drag: null, active: new Set(), running: false, token: 0, seq: 1 };
  let svg, onChange = () => {}, onLog = () => {}, onRun = () => {}, onEvent = () => {};
  const TIPS = {
    select: 'Select: drag a symbol to move it, or click it to edit it below.',
    arrow: 'Arrow: click the symbol the arrow leaves, then the symbol it points to. A decision gives YES first, then NO. Click a decision twice to make it keep asking.',
    delete: 'Delete: click a symbol or an arrow to remove it.'
  };

  /* ---------- model ---------- */
  function lines(n) {
    if (n.type === 'start') return ['Start'];
    if (n.type === 'stop') return ['Stop'];
    if (n.type === 'delay') return [`Delay ${n.cfg.secs}`];
    if (n.type === 'decision') return [n.cfg.input ? `Is ${HL.INPUTS[n.cfg.input]} on?` : 'Is  ?  on?'];
    const set = Object.keys(HL.OUTPUTS).filter(k => n.cfg.set[k]);
    if (!set.length) return ['Turn  ?  on / off'];
    return set.map((k, i) => `${i === 0 ? 'Turn ' : ''}${HL.OUTPUTS[k]} ${n.cfg.set[k]}${i < set.length - 1 ? ',' : ''}`);
  }
  function size(n) {
    if (n.type === 'start' || n.type === 'stop') return { w: 120, h: 34 };
    if (n.type === 'delay') return { w: 130, h: 44 };
    if (n.type === 'decision') return { w: 200, h: 72 };
    return { w: 200, h: Math.max(46, 24 + 16 * lines(n).length) };
  }
  const isTodo = n => (n.type === 'decision' && !n.cfg.input) || (n.type === 'output' && !Object.values(n.cfg.set).some(Boolean));
  const node = id => C.nodes.find(n => n.id === id);
  const outEdges = id => C.edges.filter(e => e.from === id);

  function mk(type, x, y, cfg) {
    const base = type === 'output' ? { set: {} } : type === 'delay' ? { secs: 1 } : type === 'decision' ? { input: '' } : {};
    return { id: 'n' + (U.seq++), type, x, y, cfg: Object.assign(base, cfg || {}) };
  }
  function load(chart) {
    C.nodes = []; C.edges = []; U.sel = null; U.from = null; U.active.clear();
    const map = {};
    (chart && chart.nodes || []).forEach(n => { const m = mk(n.type, n.x, n.y, JSON.parse(JSON.stringify(n.cfg || {}))); map[n.id] = m.id; C.nodes.push(m); });
    (chart && chart.edges || []).forEach(e => C.edges.push({ from: map[e.from], to: map[e.to], branch: e.branch || null }));
    render(); renderEditor();
  }
  const get = () => JSON.parse(JSON.stringify(C));

  function addNode(type) {
    if (U.running) return;
    const last = C.nodes[C.nodes.length - 1];
    const n = mk(type, 170, 50);
    if (last) {
      n.x = last.x; n.y = Math.round((last.y + size(last).h / 2 + 46 + size(n).h / 2) / 10) * 10;
      if (n.y > 660) { n.x = Math.min(520, last.x + 230); n.y = 50; }
    }
    C.nodes.push(n); U.sel = n.id; setTool('select'); changed();
  }
  function addEdge(from, to) {
    const a = node(from), b = node(to);
    if (a.type === 'stop') return onLog('Nothing can follow a Stop symbol.', 'info');
    if (b.type === 'start') return onLog('An arrow cannot point into a Start symbol.', 'info');
    const outs = outEdges(from);
    if (a.type === 'decision') {
      const hasYes = outs.some(e => e.branch === 'yes'), hasNo = outs.some(e => e.branch === 'no');
      if (hasYes && hasNo) return onLog('A decision has only two arrows, YES and NO. Delete one first.', 'info');
      C.edges.push({ from, to, branch: hasYes ? 'no' : 'yes' });
    } else {
      C.edges = C.edges.filter(e => e.from !== from);
      C.edges.push({ from, to, branch: null });
    }
  }
  function changed() { render(); renderEditor(); onChange(); }

  /* ---------- drawing ---------- */
  function route(e) {
    const a = node(e.from), b = node(e.to), sa = size(a), sb = size(b);
    const tx = b.x, ty = b.y - sb.h / 2;
    // A loop back joins the line coming down into its target (as in Flowol), with its own arrowhead and at its own
    // height, so a NO loop and a "go round again" loop can never be mistaken for one line. This needs a straight
    // line arriving from above; without one the loop enters the top of the symbol instead.
    const fed = C.edges.some(o => { const s = node(o.from); if (o === e || o.to !== b.id || !s || o.branch === 'no') return false;
      const gap = ty - (s.y + size(s).h / 2); return gap >= 16 && (Math.abs(s.x - tx) < 2 ? gap >= 34 : gap / 2 >= 30); });
    if (e.branch === 'no') {
      const sx = a.x + sa.w / 2, sy = a.y;
      if (tx > sx + 12 && ty > sy) return { d: `M${sx},${sy} H${tx} V${ty}`, lx: sx + 6, ly: sy - 6 };
      const rx = Math.max(sx, b.x + sb.w / 2) + 34;
      return { d: fed ? `M${sx},${sy} H${rx} V${ty - 12} H${tx + 2}` : `M${sx},${sy} H${rx} V${ty - 18} H${tx} V${ty}`, lx: sx + 6, ly: sy - 6 };
    }
    const sx = a.x, sy = a.y + sa.h / 2;
    const lab = { lx: sx + 8, ly: sy + 14 };
    if (ty >= sy + 16) {
      if (Math.abs(sx - tx) < 2) return Object.assign({ d: `M${sx},${sy} V${ty}` }, lab);
      const my = Math.round(sy + (ty - sy) / 2);
      return Object.assign({ d: `M${sx},${sy} V${my} H${tx} V${ty}` }, lab);
    }
    const side = Math.min(a.x - sa.w / 2, b.x - sb.w / 2) - 28;   // loop back up the left-hand side
    return Object.assign({ d: fed ? `M${sx},${sy} V${sy + 18} H${side} V${ty - 26} H${tx - 2}` : `M${sx},${sy} V${sy + 18} H${side} V${ty - 18} H${tx} V${ty}` }, lab);
  }
  function shape(n) {
    const { w, h } = size(n), x = -w / 2, y = -h / 2;
    if (n.type === 'start' || n.type === 'stop') return `<rect class="n-shape" x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}"/>`;
    if (n.type === 'delay') return `<rect class="n-shape" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
    if (n.type === 'decision') return `<polygon class="n-shape" points="0,${y} ${w / 2},0 0,${-y} ${x},0"/>`;
    return `<polygon class="n-shape" points="${x + 14},${y} ${w / 2},${y} ${w / 2 - 14},${-y} ${x},${-y}"/>`;
  }
  function render() {
    let h = '<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="ah" d="M0,0 L10,5 L0,10 z"/></marker>' +
      '<pattern id="gd" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="var(--grid)"/></pattern></defs><rect width="640" height="700" fill="url(#gd)"/>';
    if (!C.nodes.length) h += '<text x="320" y="120" class="empty-msg">Blank canvas. Add a Start symbol to begin.</text>';
    C.edges.forEach((e, i) => {
      if (!node(e.from) || !node(e.to)) return;
      const r = route(e);
      h += `<path class="edge" d="${r.d}" marker-end="url(#ah)"/><path class="edge-hit" data-edge="${i}" d="${r.d}"/>`;
      if (e.branch) h += `<text class="edge-lab" x="${r.lx}" y="${r.ly}">${e.branch.toUpperCase()}</text>`;
    });
    C.nodes.forEach(n => {
      const ls = lines(n), y0 = -(ls.length - 1) * 8 + 4.5;
      const cls = ['node', U.sel === n.id ? 'sel' : '', U.from === n.id ? 'from' : '', U.active.has(n.id) ? 'active' : '', isTodo(n) ? 'todo' : ''].join(' ');
      h += `<g class="${cls}" data-node="${n.id}" transform="translate(${n.x},${n.y})">${shape(n)}` +
        ls.map((t, i) => `<text class="n-text" y="${y0 + i * 16}">${t}</text>`).join('') + '</g>';
    });
    svg.innerHTML = h;
  }
  function pt(ev) { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }

  /* ---------- interaction (pointerdown only, so it works with mouse, touch and pen) ---------- */
  function onDown(ev) {
    if (U.running) return;
    const g = ev.target.closest('[data-node]'), eh = ev.target.closest('[data-edge]');
    if (U.tool === 'delete') {
      if (g) { const id = g.dataset.node; C.nodes = C.nodes.filter(n => n.id !== id); C.edges = C.edges.filter(e => e.from !== id && e.to !== id); if (U.sel === id) U.sel = null; changed(); }
      else if (eh) { C.edges.splice(+eh.dataset.edge, 1); changed(); }
      return;
    }
    if (U.tool === 'arrow') {
      if (!g) { U.from = null; render(); return; }
      const id = g.dataset.node;
      if (!U.from) { U.from = id; render(); }
      else if (U.from === id && node(id).type !== 'decision') { U.from = null; render(); }   // a decision may loop back to itself (keep asking)
      else { addEdge(U.from, id); U.from = null; changed(); }
      return;
    }
    if (!g) { if (U.sel) { U.sel = null; render(); renderEditor(); } return; }
    const n = node(g.dataset.node), p = pt(ev);
    U.drag = { n, dx: n.x - p.x, dy: n.y - p.y, moved: false };
    if (U.sel !== n.id) { U.sel = n.id; render(); renderEditor(); }
  }
  function onMove(ev) {
    if (!U.drag) return;
    const p = pt(ev), n = U.drag.n, s = size(n);
    const x = Math.max(s.w / 2 + 6, Math.min(634 - s.w / 2, Math.round((p.x + U.drag.dx) / 10) * 10));
    const y = Math.max(s.h / 2 + 6, Math.min(694 - s.h / 2, Math.round((p.y + U.drag.dy) / 10) * 10));
    if (x !== n.x || y !== n.y) { n.x = x; n.y = y; U.drag.moved = true; render(); }
  }
  function onUp() { if (U.drag && U.drag.moved) onChange(); U.drag = null; }

  function setTool(t) {
    U.tool = t; U.from = null;
    document.querySelectorAll('#tools .tool').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
    document.getElementById('flow-tip').textContent = TIPS[t];
    render();
  }

  /* ---------- the "Edit the symbol" panel ---------- */
  function renderEditor() {
    const box = document.getElementById('editor'), n = node(U.sel);
    if (!n) { box.innerHTML = '<h4>EDIT THE SYMBOL</h4>Click a symbol with the Select tool to set what it does.'; return; }
    if (n.type === 'start' || n.type === 'stop') { box.innerHTML = `<h4>EDIT THE ${n.type.toUpperCase()} SYMBOL</h4>${n.type === 'start' ? 'Every flowchart begins here. Draw an arrow from it to the first instruction.' : 'The flowchart ends here.'}`; return; }
    if (n.type === 'delay') {
      box.innerHTML = `<h4>EDIT THE DELAY SYMBOL</h4><div class="erow"><span>Wait for</span><input id="ed-secs" type="number" min="0.5" max="30" step="0.5" value="${n.cfg.secs}"> seconds</div>`;
      box.querySelector('#ed-secs').addEventListener('change', e => { n.cfg.secs = Math.max(0.5, Math.min(30, parseFloat(e.target.value) || 1)); changed(); });
      return;
    }
    if (n.type === 'decision') {
      box.innerHTML = `<h4>EDIT THE DECISION SYMBOL</h4><div class="erow"><span>Ask: is</span><select id="ed-in"><option value="">choose an input…</option>${Object.keys(HL.INPUTS).map(k => `<option value="${k}" ${n.cfg.input === k ? 'selected' : ''}>${HL.INPUTS[k]}</option>`).join('')}</select> on?
        <button class="btn btn-soft" id="ed-swap" type="button">Swap YES / NO arrows</button></div>`;
      box.querySelector('#ed-in').addEventListener('change', e => { n.cfg.input = e.target.value; changed(); });
      box.querySelector('#ed-swap').addEventListener('click', () => { outEdges(n.id).forEach(e => { e.branch = e.branch === 'yes' ? 'no' : 'yes'; }); changed(); });
      return;
    }
    box.innerHTML = '<h4>EDIT THE OUTPUT SYMBOL</h4>' + Object.keys(HL.OUTPUTS).map(k => {
      const v = n.cfg.set[k] || '';
      return `<div class="erow"><span>${HL.OUTPUTS[k]}</span><span class="seg" data-k="${k}"><button type="button" data-v="" class="${v === '' ? 'on' : ''}">leave</button><button type="button" data-v="off" class="${v === 'off' ? 'on' : ''}">off</button><button type="button" data-v="on" class="${v === 'on' ? 'on' : ''}">on</button></span></div>`;
    }).join('');
    box.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
      const k = b.parentElement.dataset.k;
      if (b.dataset.v) n.cfg.set[k] = b.dataset.v; else delete n.cfg.set[k];
      changed();
    }));
  }

  /* ---------- run engine ---------- */
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function thread(start, token) {
    let cur = start, guard = 0;
    while (cur && token === U.token) {
      U.active.add(cur.id); render();
      await sleep(280 / HL.S.speed);
      if (token !== U.token) break;
      let next = null;
      if (cur.type === 'stop') { U.active.delete(cur.id); break; }
      if (cur.type === 'output') {
        const set = Object.keys(HL.OUTPUTS).filter(k => cur.cfg.set[k]);
        if (!set.length) onLog('An Output symbol has nothing set. Click it and choose on or off.', 'bad');
        for (const k of set) { if (token !== U.token) break; await HL.command(k, cur.cfg.set[k] === 'on'); }
      } else if (cur.type === 'delay') {
        await sleep(cur.cfg.secs * 1000 / HL.S.speed);
        if (token === U.token) onEvent({ type: 'delay', secs: cur.cfg.secs });   // lets a mission check how long the flowchart really waited
      }
      if (cur.type === 'decision') {
        if (!cur.cfg.input) { onLog('A Decision symbol has no question. Click it and choose an input.', 'bad'); U.active.delete(cur.id); break; }
        const yes = !!HL.S.known[cur.cfg.input];
        const e = outEdges(cur.id).find(x => x.branch === (yes ? 'yes' : 'no'));
        if (!e) { onLog(`The decision has no ${yes ? 'YES' : 'NO'} arrow, so the flowchart stopped there.`, 'bad'); U.active.delete(cur.id); break; }
        next = node(e.to);
      } else {
        const e = outEdges(cur.id)[0];
        next = e ? node(e.to) : null;
        if (!e) onLog('The flowchart reached a symbol with no arrow leaving it, so it stopped.', 'info');
      }
      U.active.delete(cur.id);
      cur = next;
      if (++guard > 5000) break;
    }
    render();
  }
  async function run() {
    if (U.running) return;
    const starts = C.nodes.filter(n => n.type === 'start');
    if (!starts.length) { onLog('Add a Start symbol first.', 'bad'); return; }
    U.running = true; U.sel = null; U.from = null; const token = ++U.token;
    onRun(true); renderEditor();
    await Promise.all(starts.map(s => thread(s, token)));
    if (token === U.token) stop(true);
  }
  function stop(natural) {
    if (!U.running) return;
    U.token++; U.running = false; U.active.clear(); render();
    onLog(natural ? 'Flowchart finished.' : 'Flowchart stopped.', 'info');
    onRun(false);
  }

  /** True if the flowchart can come back round to a symbol it has already visited. */
  function hasLoop() {
    const state = {};
    const visit = id => {
      if (state[id] === 1) return true; if (state[id] === 2) return false;
      state[id] = 1;
      for (const e of outEdges(id)) if (visit(e.to)) return true;
      state[id] = 2; return false;
    };
    return C.nodes.filter(n => n.type === 'start').some(s => visit(s.id));
  }

  function init(opts) {
    svg = document.getElementById('chart'); onChange = opts.onChange; onLog = opts.onLog; onRun = opts.onRun; onEvent = opts.onEvent || onEvent;
    svg.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    document.querySelectorAll('#tools .tool').forEach(b => b.addEventListener('click', () => { if (!U.running) setTool(b.dataset.tool); }));
    document.querySelectorAll('#symbols .sym').forEach(b => b.addEventListener('click', () => addNode(b.dataset.add)));
    render(); renderEditor();
  }
  return { C, U, init, load, get, run, stop, hasLoop, render, setTool };
})();
