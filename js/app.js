/* HiveMind — glue: missions, checklist, inputs/outputs panel, log, saving. */
(() => {
  const KEY = 'homelab-proto-v2';
  const A = { cur: 0, done: {}, charts: {}, wiring: {}, place: {}, ev: [], t0: 0, teacher: false, demo: location.hash.toLowerCase() === '#demo' };
  // Teacher shortcut: add #teacher_code (or #teacher) to the address to open every mission without completing the one before.
  // #demo is the teacher demo embedded in the slides: every mission open, nothing saved, starts on a finished flowchart ready to Run.
  const isTeacher = () => ['#teacher_code', '#teacher', '#demo'].includes(location.hash.toLowerCase());
  A.teacher = isTeacher();
  const $ = id => document.getElementById(id);
  const M = () => MISSIONS[A.cur];

  function save() { if (A.demo) return; try { localStorage.setItem(KEY, JSON.stringify({ done: A.done, charts: A.charts, wiring: A.wiring, place: A.place, cur: A.cur })); } catch (e) { /* storage unavailable: carry on unsaved */ } }
  function restore() { if (A.demo) return; try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) { A.done = s.done || {}; A.charts = s.charts || {}; A.wiring = s.wiring || {}; A.place = s.place || {}; A.cur = Math.min(s.cur || 0, MISSIONS.length - 1); } } catch (e) { /* ignore */ } }

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

  function evaluate() {
    const m = M(), c = { ev: A.ev, links: HL.S.links, place: HL.S.place, nodes: FC.C.nodes, loop: FC.hasLoop() };
    let ok = 0, need = 0;
    $('checklist').innerHTML = '';
    m.checks.forEach(ch => {
      let pass = false; try { pass = !!ch.f(c); } catch (e) { pass = false; }
      let wrong = false; try { wrong = !pass && !!(ch.w && ch.w(c)); } catch (e) { wrong = false; }
      const li = document.createElement('li');
      if (ch.html) li.innerHTML = `<span>${ch.html}${wrong ? '<small>Not quite. Read the clue again.</small>' : ''}</span>`; else li.textContent = ch.t;
      li.className = (pass ? 'ok' : wrong ? 'bad' : '') + (ch.bonus ? ' bonus' : '');
      $('checklist').appendChild(li);
      if (!ch.bonus) { need++; if (pass) ok++; }
    });
    $('check-count').textContent = `${ok}/${need}`;
    if (ok === need && !A.done[A.cur]) { A.done[A.cur] = true; log(`Mission ${A.cur + 1} complete: ${m.title}!`, 'ok'); renderTabs(); save(); }
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
    $('btn-reset').addEventListener('click', () => { delete A.charts[A.cur]; delete A.wiring[A.cur]; delete A.place[A.cur]; select(A.cur, true); log('Mission reset to its starting point.', 'info'); });
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
