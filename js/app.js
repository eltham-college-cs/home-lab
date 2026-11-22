/* HiveMind — glue: missions, checklist, inputs/outputs panel, log, saving. */
(() => {
  const KEY = 'homelab-proto-v2';
  const A = { cur: 0, done: {}, charts: {}, wiring: {}, place: {}, ticks: {}, ev: [], t0: 0, teacher: false, demo: location.hash.toLowerCase() === '#demo' };
  // Teacher shortcut: add #teacher_code (or #teacher) to the address to open every mission without completing the one before.
  // #demo is the teacher demo embedded in the slides: every mission open, nothing saved, starts on a finished flowchart ready to Run.
  const isTeacher = () => ['#teacher_code', '#teacher', '#demo'].includes(location.hash.toLowerCase());
  A.teacher = isTeacher();
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const M = () => MISSIONS[A.cur];

  function save() { if (A.demo) return; try { localStorage.setItem(KEY, JSON.stringify({ done: A.done, charts: A.charts, wiring: A.wiring, place: A.place, ticks: A.ticks, cur: A.cur })); } catch (e) { /* storage unavailable: carry on unsaved */ } }
  function restore() { if (A.demo) return; try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) { A.done = s.done || {}; A.charts = s.charts || {}; A.wiring = s.wiring || {}; A.place = s.place || {}; A.ticks = s.ticks || {}; A.cur = Math.min(s.cur || 0, MISSIONS.length - 1); } } catch (e) { /* ignore */ } }

  function log(msg, cls) {
    const d = document.createElement('div'); d.className = 'lg ' + (cls || ''); d.textContent = msg;
    const box = $('log'); box.prepend(d); while (box.children.length > 40) box.lastChild.remove();
  }
  const unlocked = i => A.teacher || i === 0 || A.done[i - 1];

  function renderTabs() {
    $('tabs').innerHTML = '';
    MISSIONS.forEach((m, i) => {
      const b = document.createElement('button'); b.type = 'button';
      b.className = 'tab' + (i === A.cur ? ' active' : '') + (A.done[i] ? ' done' : '');
      b.textContent = `${A.done[i] ? '✓' : unlocked(i) ? i + 1 : '🔒'} ${m.title}`;
      b.disabled = !unlocked(i);
      b.addEventListener('click', () => select(i));
      $('tabs').appendChild(b);
    });
    $('progress').textContent = `${Object.keys(A.done).length} / ${MISSIONS.length}`;
  }

  function select(i, fresh) {
    FC.stop(); A.cur = i; A.ev = [];
    const m = M();
    $('m-num').textContent = `Mission ${i + 1}`; $('m-skill').textContent = m.skill;
    $('m-title').textContent = m.title; $('m-brief').textContent = m.brief; $('m-book').innerHTML = m.book;
    $('hint').hidden = true; $('hint').textContent = m.hint;
    $('btn-ping').hidden = !m.ping;
    $('house-tip').textContent = m.mode === 'build' ? 'Drag a device onto a lettered space. Drag it off again to change your mind.'
      : m.mode === 'links' ? 'Drag a link onto a device, or tap a link and then tap devices.'
      : m.locked ? 'This house is live: click the doorbell, the motion sensor or the sun to change an input.' : 'Click a device to change its link: none → Wi-Fi → cable (if it has a socket).';
    document.querySelector('.grid').classList.toggle('noflow', !!m.noflow); setBig(false);   // build missions: no flowchart yet, so give the house the space
    FC.load((!fresh && A.charts[i]) || (A.demo && m.demoChart) || m.chart);
    HL.setup({ links: (!fresh && !m.locked && A.wiring[i]) || m.links, locked: m.locked, out: m.out, mode: m.mode, place: !fresh && A.place[i] });
    FC.setTool('select');
    renderTabs(); evaluate(); save();
  }

  function renderIO() {
    const s = HL.S;
    $('io-in').innerHTML = '';
    Object.keys(HL.INPUTS).forEach(id => {
      const b = document.createElement('button'); b.type = 'button';
      const lost = s.actual[id] !== s.known[id];
      b.className = 'io-row in' + (s.known[id] ? ' on' : '') + (lost ? ' lost' : '');
      b.innerHTML = `<span>${HL.INPUTS[id]}</span><span class="st">${lost ? 'hub not told' : s.known[id] ? 'ON' : 'off'}</span>`;
      b.addEventListener('click', () => HL.setInput(id, !s.actual[id]));
      $('io-in').appendChild(b);
    });
    $('io-out').innerHTML = Object.keys(HL.OUTPUTS).map(id => `<div class="io-row out${s.out[id] ? ' on' : ''}"><span>${HL.OUTPUTS[id]}</span><span class="st">${s.out[id] ? 'ON' : 'off'}</span></div>`).join('');
  }

  /** Dry run: follow the flowchart instantly (no packets, no waiting) to predict what a real run would do.
      The mission's test input (doorbell, motion or night) is switched on after the flowchart has asked a few times.
      The result is a list of events in the same form as a real run, so the same checks can read it. */
  function dryRun(m) {
    const ev = [], links = HL.S.links, nodes = FC.C.nodes, edges = FC.C.edges;
    const linked = id => links[id] !== 'none';
    HL.ENDPOINTS.forEach(id => ev.push({ type: 'ping', id, ok: linked(id) }));
    if (m.noflow) return ev;
    const known = {}, node = id => nodes.find(n => n.id === id), next = (id, br) => edges.find(e => e.from === id && (br ? e.branch === br : true));
    let threads = nodes.filter(n => n.type === 'start'), asked = 0, t = 0;
    for (let step = 0; step < 400 && threads.some(Boolean); step++) {
      threads = threads.map(cur => {
        if (!cur) return null;
        if (cur.type === 'stop') return null;
        if (cur.type === 'output') Object.keys(HL.OUTPUTS).filter(k => cur.cfg.set[k]).forEach(k => ev.push({ type: linked(k) ? 'output' : 'drop', id: k, val: cur.cfg.set[k] === 'on', t }));
        if (cur.type === 'delay') { t += cur.cfg.secs * 1000; ev.push({ type: 'delay', secs: cur.cfg.secs, t }); }
        if (cur.type === 'decision') {
          if (!cur.cfg.input) return null;
          if (++asked === 3 && m.simInput && (m.simInput === 'night' || linked(m.simInput))) { known[m.simInput] = true; ev.push({ type: 'input', id: m.simInput, val: true, t }); }
          const e = next(cur.id, known[cur.cfg.input] ? 'yes' : 'no'); return e ? node(e.to) : null;
        }
        const e = next(cur.id); return e ? node(e.to) : null;
      });
    }
    return ev;
  }

  /** Three states per check: ticked (proved by a real run), ready (the flowchart or wiring now looks right, so press Run), or not yet.
      A tick earned in an earlier run is kept for as long as the dry run still agrees, so the list stays in step with the flowchart. */
  function evaluate() {
    const m = M(), base = { links: HL.S.links, place: HL.S.place, nodes: FC.C.nodes, loop: FC.hasLoop() };
    const live = Object.assign({ ev: A.ev }, base), sim = Object.assign({ ev: dryRun(m) }, base);
    // A mission finished before ticks were remembered counts as having earned all of them.
    if (A.done[A.cur] && !A.ticks[A.cur]) { A.ticks[A.cur] = {}; m.checks.forEach((ch, i) => { A.ticks[A.cur][i] = true; }); }
    const busy = FC.U.running || HL.S.busy, kept = (A.ticks[A.cur] = A.ticks[A.cur] || {});
    const test = (ch, c) => { try { return !!ch.f(c); } catch (e) { return false; } };
    let ok = 0, need = 0, ready = 0, changed = false;
    $('checklist').innerHTML = '';
    m.checks.forEach((ch, i) => {
      const now = test(ch, live), predicted = test(ch, sim);
      if (now && !kept[i]) { kept[i] = true; changed = true; }
      const pass = now || (!busy && kept[i] && predicted);
      const isReady = !pass && predicted && !busy;
      let wrong = false; try { wrong = !pass && !!(ch.w && ch.w(live)); } catch (e) { wrong = false; }
      const li = document.createElement('li');
      const note = wrong ? '<small>Not quite. Read the clue again.</small>' : isReady ? `<small class="go">${m.noflow ? 'Looks right. Run the ping test to prove it.' : 'Looks right. Press Run to test it.'}</small>` : '';
      li.innerHTML = `<span>${ch.html || esc(ch.t)}${note}</span>`;
      li.className = (pass ? 'ok' : wrong ? 'bad' : isReady ? 'ready' : '') + (ch.bonus ? ' bonus' : '');
      $('checklist').appendChild(li);
      if (!ch.bonus) { need++; if (pass) ok++; else if (isReady) ready++; }
    });
    $('check-count').textContent = `${ok}/${need}`;
    if (ok === need && !A.done[A.cur]) { A.done[A.cur] = true; log(`Mission ${A.cur + 1} complete: ${m.title}!`, 'ok'); renderTabs(); changed = true; }
    if (changed) save();
    $('done-banner').hidden = !A.done[A.cur];
    $('btn-next').hidden = A.cur >= MISSIONS.length - 1;
  }

  /** Enlarged house: switched on automatically by Run, and off again as soon as the pupil goes back to editing. */
  function setBig(on) {
    on = on && !M().noflow;
    document.querySelector('.grid').classList.toggle('big', on);
    $('btn-big').textContent = on ? '⤡ Shrink' : '⤢ Enlarge';
    $('btn-edit').hidden = !on || FC.U.running;
  }
  const isBig = () => document.querySelector('.grid').classList.contains('big');

  function onRun(running) {
    HL.S.busy = running;
    if (running) setBig(true); else $('btn-edit').hidden = !isBig();
    $('btn-run').disabled = running; $('btn-stop').disabled = !running; $('btn-ping').disabled = running;
    if (!running) evaluate();
    document.querySelectorAll('#symbols .sym, #tools .tool').forEach(b => { b.disabled = running; });
    $('run-state').textContent = running ? 'Running…' : 'Stopped'; $('run-state').classList.toggle('on', running);
  }

  function init() {
    restore();
    const onEvent = e => { e.t = (performance.now() - A.t0) * HL.S.speed; A.ev.push(e); evaluate(); };
    HL.init({
      onLog: log,
      onEvent,
      onChange: () => { renderIO(); if (!M().locked) A.wiring[A.cur] = Object.assign({}, HL.S.links); if (M().mode === 'build') A.place[A.cur] = Object.assign({}, HL.S.place); evaluate(); save(); }
    });
    FC.init({ onLog: log, onRun, onEvent, onChange: () => { A.charts[A.cur] = FC.get(); evaluate(); save(); } });

    $('btn-run').addEventListener('click', () => {
      A.ev = []; A.t0 = performance.now();
      HL.resetState(M().out);
      log('Run: outputs and inputs reset. The Hub starts the flowchart.', 'info');
      FC.run();
    });
    $('btn-stop').addEventListener('click', () => FC.stop());
    $('btn-big').addEventListener('click', () => setBig(!isBig()));
    $('btn-edit').addEventListener('click', () => setBig(false));
    // Touching the flowchart itself (not the Run bar) means "I want to edit": give the flowchart its space back.
    document.querySelector('.flow').addEventListener('pointerdown', ev => { if (isBig() && !FC.U.running && !ev.target.closest('.runbar')) setBig(false); });
    $('btn-ping').addEventListener('click', () => { A.ev = A.ev.filter(e => e.type !== 'ping'); A.t0 = performance.now(); HL.pingAll(); });
    $('speed').addEventListener('input', e => { HL.S.speed = parseFloat(e.target.value); });
    $('btn-hint').addEventListener('click', () => { $('hint').hidden = !$('hint').hidden; });
    $('btn-reset').addEventListener('click', () => { delete A.charts[A.cur]; delete A.wiring[A.cur]; delete A.place[A.cur]; delete A.ticks[A.cur]; select(A.cur, true); log('Mission reset to its starting point.', 'info'); });
    $('btn-next').addEventListener('click', () => { if (A.cur < MISSIONS.length - 1) select(A.cur + 1); });
    $('btn-clear').addEventListener('click', () => { $('log').innerHTML = ''; });
    $('btn-theme').addEventListener('click', () => {
      const dark = document.documentElement.dataset.theme !== 'dark';
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'; FC.render();
    });
    window.addEventListener('hashchange', () => { if (A.demo || location.hash.toLowerCase() === '#demo') return location.reload(); A.teacher = isTeacher(); if (!unlocked(A.cur)) select(0); else renderTabs(); });
    if (A.demo) { A.cur = MISSIONS.findIndex(m => m.demoChart); $('tag').textContent = 'TEACHER DEMO'; }
    if (!unlocked(A.cur)) A.cur = 0;
    select(A.cur);
    log('Welcome to HiveMind. The Home Hub runs your flowchart and sends every instruction as a packet.', 'info');
  }
  document.addEventListener('DOMContentLoaded', init);
  window.APP = A;
})();
