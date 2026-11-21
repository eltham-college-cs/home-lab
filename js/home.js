/* Home Lab — the house mimic and its network.
   Every command from the Home Hub travels as a packet: Hub -> Router -> device.
   If a device has no link to the Router, the packet is dropped. */
window.HL = (() => {
  const DEV = {
    router:   { name: 'Router',        x: 215, y: 338, kind: 'core' },
    hub:      { name: 'Home Hub',      x: 112, y: 338, kind: 'core' },
    doorbell: { name: 'Doorbell',      x: 34,  y: 300, kind: 'in',  ports: ['wifi'] },
    motion:   { name: 'Motion Sensor', x: 248, y: 262, kind: 'in',  ports: ['wifi'] },
    light:    { name: 'Hall Light',    x: 150, y: 270, kind: 'out', ports: ['wifi'] },
    tv:       { name: 'Smart TV',      x: 400, y: 316, kind: 'out', ports: ['wifi', 'eth'] },
    printer:  { name: 'Printer',       x: 150, y: 190, kind: 'out', ports: ['wifi', 'eth'] },
    phone:    { name: 'Phone',         x: 405, y: 188, kind: 'out', ports: ['wifi'] }
  };
  const INPUTS = { doorbell: 'Doorbell', motion: 'Motion', night: 'Night time' };
  const OUTPUTS = { light: 'Hall Light', tv: 'Smart TV', printer: 'Printer', phone: 'Phone alert' };
  const ENDPOINTS = ['doorbell', 'motion', 'light', 'tv', 'printer', 'phone'];
  // Guided build: lettered spaces in the house, and the items in the tray (one does not belong in a home).
  const SLOTS = { A: 'doorbell', B: 'router', C: 'phone', D: 'tv', E: 'hub', F: 'printer', G: 'light', H: 'motion', I: 'internet' };
  const NET = { name: 'Internet', x: 528, y: 336 };
  const ITEMS = { internet: 'Internet', server: 'Web Server', eth: 'Ethernet cable', wifi: 'Wi-Fi', none: 'Remove link' };
  const TRAY_BUILD = ['tv', 'server', 'router', 'light', 'phone', 'internet', 'doorbell', 'printer', 'hub', 'motion'];
  const itemName = id => (DEV[id] ? DEV[id].name : ITEMS[id]);
  const slotPos = s => (SLOTS[s] === 'internet' ? NET : DEV[SLOTS[s]]);

  const S = {
    links: {}, locked: false,
    out: { light: false, tv: false, printer: false, phone: false },
    actual: { doorbell: false, motion: false, night: false },   // what is really happening
    known: { doorbell: false, motion: false, night: false },    // what the Hub has been told
    speed: 1, busy: false,
    mode: 'play',            // 'build' = drag devices into the house, 'links' = drag cable / Wi-Fi onto devices
    place: {}, pick: null
  };
  let svg, scene, pkLayer, tray, drag = null, onEvent = () => {}, onLog = () => {}, onChange = () => {};
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const NS = 'http://www.w3.org/2000/svg';

  function init(opts) {
    svg = document.getElementById('house');
    onEvent = opts.onEvent; onLog = opts.onLog; onChange = opts.onChange;
    svg.innerHTML = '<g id="scene"></g><g id="pk"></g>';
    scene = svg.querySelector('#scene'); pkLayer = svg.querySelector('#pk');
    // One delegated pointerdown: works for mouse, trackpad, touch and pen.
    svg.addEventListener('pointerdown', ev => {
      const sl = ev.target.closest('[data-slot]');
      if (sl) {
        const s = sl.dataset.slot;
        if (S.pick) place(S.pick, s);                         // tap an item, then tap a space
        else if (S.place[s]) beginDrag(ev, S.place[s], s);     // pick a placed item back up
        return;
      }
      if (ev.target.closest('[data-in="night"]')) { if (S.mode === 'play') setInput('night', !S.actual.night); return; }
      const g = ev.target.closest('[data-dev]');
      if (!g) return;
      const id = g.dataset.dev;
      if (S.mode === 'links' && S.pick) applyLink(id, S.pick);
      // In flowchart missions the mimic is live: press the doorbell or walk past the sensor by clicking it.
      else if (S.mode === 'play' && (id === 'doorbell' || id === 'motion') && (S.locked || S.busy)) setInput(id, !S.actual[id]);
      else cycleLink(id);
    });
    tray = document.getElementById('tray');
    tray.addEventListener('pointerdown', ev => { const c = ev.target.closest('[data-item]'); if (c) beginDrag(ev, c.dataset.item, null); });
    window.addEventListener('pointermove', dragMove);
    window.addEventListener('pointerup', dragEnd);
    window.addEventListener('pointercancel', () => { if (drag && drag.ghost) drag.ghost.remove(); drag = null; });
    render();
  }

  function setup(cfg) {
    ENDPOINTS.forEach(id => { S.links[id] = (cfg.links && cfg.links[id]) || 'none'; });
    S.locked = !!cfg.locked;
    S.mode = cfg.mode || 'play'; S.pick = null;
    S.place = {}; Object.keys(SLOTS).forEach(s => { S.place[s] = (cfg.place && cfg.place[s]) || null; });
    svg.classList.toggle('dragmode', S.mode !== 'play');
    resetState(cfg.out);
  }
  function resetState(out) {
    Object.keys(S.out).forEach(k => { S.out[k] = !!(out && out[k]); });
    Object.keys(S.actual).forEach(k => { S.actual[k] = false; S.known[k] = false; });
    render(); renderTray(); onChange();
  }

  function cycleLink(id) {
    const d = DEV[id];
    if (!d || d.kind === 'core') { onLog(id === 'hub' ? 'The Home Hub is cabled to the Router. It runs your flowchart.' : 'The Router joins every device in the house together.', 'info'); return; }
    if (S.busy) { onLog('Stop the flowchart before changing the wiring.', 'info'); return; }
    if (S.locked) { onLog('The wiring is fixed in this mission. Concentrate on the flowchart.', 'info'); return; }
    const order = ['none', ...d.ports];
    const next = order[(order.indexOf(S.links[id]) + 1) % order.length];
    S.links[id] = next;
    onLog(next === 'none' ? `${d.name}: link removed.` : `${d.name} ↔ Router by ${next === 'eth' ? 'Ethernet cable' : 'Wi-Fi'}.`, next === 'none' ? '' : 'ok');
    if (next === 'wifi' && d.ports.length === 1 && order.length === 2) { /* Wi-Fi only device */ }
    render(); onChange();
  }

  /* ---------- guided build: tray, drag and drop (pointer events, so mouse and touch both work) ---------- */
  function renderTray() {
    if (!tray) return;
    tray.hidden = S.mode === 'play';
    if (S.mode === 'play') return;
    const placed = Object.values(S.place);
    const list = S.mode === 'build' ? TRAY_BUILD.filter(id => !placed.includes(id)) : ['eth', 'wifi', 'none'];
    tray.innerHTML = `<span class="tray-lab">${S.mode === 'build' ? 'DEVICE TRAY: drag each one to its lettered space' : 'LINKS: drag one onto a device'}</span>` +
      (list.length ? list.map(id => `<button type="button" class="chip${S.pick === id ? ' pick' : ''}" data-item="${id}"><svg viewBox="-40 -32 80 60" aria-hidden="true">${icon(id)}</svg><span>${itemName(id)}</span></button>`).join('') : '<span class="tray-empty">The tray is empty.</span>');
  }
  function toSvg(x, y) { const p = svg.createSVGPoint(); p.x = x; p.y = y; return p.matrixTransform(svg.getScreenCTM().inverse()); }
  function nearest(x, y, pts) {
    const p = toSvg(x, y); let best = null, bd = 44;
    for (const k in pts) { const d = Math.hypot(pts[k].x - p.x, pts[k].y - p.y); if (d < bd) { bd = d; best = k; } }
    return best;
  }
  function beginDrag(ev, item, fromSlot) {
    if (S.busy) return;
    ev.preventDefault();
    drag = { item, fromSlot, x0: ev.clientX, y0: ev.clientY, ghost: null };
  }
  function dragMove(ev) {
    if (!drag) return;
    if (!drag.ghost) {
      if (Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) < 6) return;
      const g = document.createElement('div'); g.className = 'chip ghost';
      g.innerHTML = `<svg viewBox="-40 -32 80 60">${icon(drag.item)}</svg><span>${itemName(drag.item)}</span>`;
      document.body.appendChild(g); drag.ghost = g;
    }
    drag.ghost.style.left = ev.clientX + 'px'; drag.ghost.style.top = ev.clientY + 'px';
  }
  function dragEnd(ev) {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.ghost) {                                   // a tap, not a drag: select the item instead
      if (!d.fromSlot) { S.pick = S.pick === d.item ? null : d.item; renderTray(); }
      return;
    }
    d.ghost.remove();
    if (S.mode === 'build') {
      const pts = {}; Object.keys(SLOTS).forEach(s => { pts[s] = slotPos(s); });
      const s = nearest(ev.clientX, ev.clientY, pts);
      if (s) place(d.item, s);
      else if (d.fromSlot) { S.place[d.fromSlot] = null; onLog(`${itemName(d.item)} went back to the tray.`); render(); renderTray(); onChange(); }
    } else if (S.mode === 'links') {
      const pts = {}; ENDPOINTS.forEach(id => { pts[id] = DEV[id]; });
      const id = nearest(ev.clientX, ev.clientY, pts);
      if (id) applyLink(id, d.item); else onLog('Drop the link on a device in the house.', 'info');
    }
  }
  function place(item, s) {
    Object.keys(S.place).forEach(k => { if (S.place[k] === item) S.place[k] = null; });
    S.place[s] = item; S.pick = null;
    onLog(`${itemName(item)} placed in space ${s}.`);
    render(); renderTray(); onChange();
  }
  function applyLink(id, kind) {
    const d = DEV[id];
    if (!d || d.kind === 'core') { onLog('That device is already cabled in. Choose one of the others.', 'info'); return; }
    if (kind === 'eth' && !d.ports.includes('eth')) { onLog(`${d.name} has no cable socket, so it can only use Wi-Fi.`, 'bad'); return; }
    S.links[id] = kind;
    onLog(kind === 'none' ? `${d.name}: link removed.` : `${d.name} ↔ Router by ${kind === 'eth' ? 'Ethernet cable' : 'Wi-Fi'}.`, kind === 'none' ? '' : 'ok');
    render(); onChange();
  }

  /* ---------- drawing ---------- */
  const el = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; };

  function icon(id) {
    const o = S.out, a = S.actual;
    switch (id) {
      case 'router': return `<rect x="-24" y="-8" width="48" height="17" rx="5" fill="#FF8A3D" stroke="#1B2440" stroke-width="2.5"/><line x1="-14" y1="-8" x2="-18" y2="-24" stroke="#1B2440" stroke-width="2.5"/><line x1="14" y1="-8" x2="18" y2="-24" stroke="#1B2440" stroke-width="2.5"/><circle cx="-10" cy="1" r="2.4" fill="#16B383"/><circle cx="0" cy="1" r="2.4" fill="#16B383"/><circle cx="10" cy="1" r="2.4" fill="#FFC83D"/>`;
      case 'hub': return `<rect x="-22" y="-14" width="44" height="26" rx="8" fill="#7C4DFF" stroke="#1B2440" stroke-width="2.5"/><text y="4" text-anchor="middle" font-size="11" font-weight="900" fill="#fff" font-family="monospace">HUB</text>`;
      case 'doorbell': return `<rect x="-9" y="-15" width="18" height="30" rx="4" fill="#E9EEF8" stroke="#1B2440" stroke-width="2.5"/><circle cy="2" r="5" fill="${a.doorbell ? '#FFC83D' : '#9AA7C7'}" stroke="#1B2440" stroke-width="2"/>${a.doorbell ? '<path d="M14,-8 q7,10 0,20 M20,-13 q11,15 0,30" fill="none" stroke="#E23D63" stroke-width="2.5" stroke-linecap="round"/>' : ''}`;
      case 'motion': return `<path d="M-13,-8 h26 a13,13 0 0 1 -26,0 z" fill="#fff" stroke="#1B2440" stroke-width="2.5"/><circle cy="-2" r="3" fill="${a.motion ? '#E23D63' : '#9AA7C7'}"/>`;
      case 'light': return `<line x1="0" y1="-28" x2="0" y2="-12" stroke="#1B2440" stroke-width="2.5"/><path d="M-13,2 L-7,-12 H7 L13,2 Z" fill="#3D8BFF" stroke="#1B2440" stroke-width="2.5"/><circle cy="6" r="6" fill="${o.light ? '#FFE066' : '#C9D3E8'}" stroke="#1B2440" stroke-width="2"/>`;
      case 'tv': return `<rect x="-36" y="-24" width="72" height="42" rx="4" fill="#1B2440"/><rect x="-32" y="-20" width="64" height="34" fill="${o.tv ? '#3D8BFF' : '#2B3352'}"/>${o.tv ? '<rect x="-32" y="-20" width="16" height="34" fill="#FFC83D"/><rect x="-16" y="-20" width="16" height="34" fill="#16B383"/><rect x="0" y="-20" width="16" height="34" fill="#FF5D8F"/>' : ''}<rect x="-12" y="18" width="24" height="5" fill="#1B2440"/>`;
      case 'printer': return `<rect x="-14" y="-22" width="28" height="12" fill="#fff" stroke="#1B2440" stroke-width="2"/><rect x="-22" y="-12" width="44" height="22" rx="4" fill="#B8C4E0" stroke="#1B2440" stroke-width="2.5"/>${o.printer ? '<g class="paper"><rect x="-13" y="4" width="26" height="20" fill="#fff" stroke="#1B2440" stroke-width="2"/><path d="M-8,10 h16 M-8,15 h16 M-8,20 h10" stroke="#56628A" stroke-width="1.6"/></g>' : '<rect x="-13" y="2" width="26" height="4" fill="#1B2440"/>'}`;
      case 'phone': return `<rect x="-11" y="-19" width="22" height="38" rx="5" fill="#1B2440"/><rect x="-8" y="-15" width="16" height="28" rx="2" fill="${o.phone ? '#FFE066' : '#56628A'}"/>${o.phone ? '<g><rect x="16" y="-30" width="62" height="22" rx="8" fill="#E23D63" stroke="#1B2440" stroke-width="2"/><text x="47" y="-15" text-anchor="middle" font-size="11" font-weight="900" fill="#fff">ALERT!</text></g>' : ''}`;
      case 'internet': return '<path d="M-22,12 a11,11 0 0 1 2,-21 a14,14 0 0 1 27,-4 a11,11 0 0 1 13,25 z" fill="#fff" stroke="#1B2440" stroke-width="2.5"/><text y="6" text-anchor="middle" font-size="7.5" font-weight="900" fill="#1B2440">INTERNET</text>';
      case 'server': return '<rect x="-16" y="-22" width="32" height="42" rx="4" fill="#5B5FEF" stroke="#1B2440" stroke-width="2.5"/><path d="M-9,-12 h18 M-9,-3 h18 M-9,6 h18" stroke="#fff" stroke-width="2.5"/><circle cx="8" cy="14" r="2.2" fill="#16B383"/>';
      case 'eth': return '<path d="M-26,0 H-8" stroke="#2E7CF6" stroke-width="5" stroke-linecap="round"/><rect x="-8" y="-9" width="22" height="18" rx="3" fill="#2E7CF6" stroke="#1B2440" stroke-width="2.5"/><rect x="14" y="-5" width="9" height="10" fill="#FFC83D" stroke="#1B2440" stroke-width="2"/>';
      case 'wifi': return '<path d="M-20,-4 q20,-18 40,0 M-13,5 q13,-11 26,0 M-6,13 q6,-5 12,0" fill="none" stroke="#00A896" stroke-width="4" stroke-linecap="round"/><circle cy="20" r="3.5" fill="#00A896"/>';
      case 'none': return '<circle r="16" fill="#FFE3EA" stroke="#E23D63" stroke-width="3"/><path d="M-8,-8 L8,8 M8,-8 L-8,8" stroke="#E23D63" stroke-width="4" stroke-linecap="round"/>';
    }
    return '';
  }

  function render() {
    if (!scene) return;
    const night = S.actual.night;
    const r = DEV.router;
    let h = '';
    // sky, ground, house shell
    h += `<rect width="560" height="410" fill="${night ? '#1E2552' : '#BFE3FF'}"/>`;
    h += '<g data-in="night"><circle cx="500" cy="48" r="30" fill="transparent"/>';
    h += night ? '<circle cx="500" cy="48" r="20" fill="#FFF3C4"/><circle cx="509" cy="42" r="18" fill="#1E2552"/><g fill="#fff"><circle cx="60" cy="40" r="1.6"/><circle cx="130" cy="70" r="1.3"/><circle cx="330" cy="28" r="1.6"/><circle cx="420" cy="62" r="1.2"/><circle cx="230" cy="20" r="1.3"/></g>'
               : '<circle cx="500" cy="48" r="22" fill="#FFC83D" stroke="#1B2440" stroke-width="2.5"/>';
    h += '</g>';
    h += `<rect y="370" width="560" height="40" fill="${night ? '#1F5E46' : '#7ED9A3'}"/>`;
    h += '<polygon points="42,128 280,34 518,128" fill="#E2586F" stroke="#1B2440" stroke-width="3" stroke-linejoin="round"/>';
    h += '<rect x="60" y="126" width="220" height="114" fill="#FFF1D6"/><rect x="280" y="126" width="220" height="114" fill="#E7E0FF"/>';
    h += `<rect x="60" y="240" width="220" height="130" fill="${S.out.light ? '#FFF7C9' : '#DDF3FF'}"/><rect x="280" y="240" width="220" height="130" fill="#DDF8EE"/>`;
    if (S.out.light) h += `<polygon points="${DEV.light.x - 8},${DEV.light.y + 8} ${DEV.light.x + 8},${DEV.light.y + 8} ${DEV.light.x + 58},368 ${DEV.light.x - 58},368" fill="#FFE066" opacity="0.5"/>`;
    h += '<rect x="60" y="126" width="440" height="244" fill="none" stroke="#1B2440" stroke-width="3"/><line x1="60" y1="240" x2="500" y2="240" stroke="#1B2440" stroke-width="3"/><line x1="280" y1="126" x2="280" y2="370" stroke="#1B2440" stroke-width="3"/>';
    h += '<rect x="60" y="292" width="9" height="78" fill="#8A5A2B" stroke="#1B2440" stroke-width="2"/>';
    h += '<text x="68" y="141" class="room-lab">STUDY</text><text x="288" y="141" class="room-lab">BEDROOM</text><text x="76" y="255" class="room-lab">HALL</text><text x="288" y="255" class="room-lab">LIVING ROOM</text>';
    if (S.actual.motion) h += '<g transform="translate(196,330)"><circle cy="-22" r="7" fill="#FFB38A" stroke="#1B2440" stroke-width="2"/><path d="M0,-15 V6 M0,-8 L-10,2 M0,-8 L10,-2 M0,6 L-8,22 M0,6 L9,21" stroke="#1B2440" stroke-width="3" fill="none" stroke-linecap="round"/></g>';
    if (S.mode === 'build') {
      scene.innerHTML = h;
      Object.keys(SLOTS).forEach(s => {
        const p = slotPos(s), it = S.place[s];
        const g = el('g', { class: 'slot' + (it ? ' full' : ''), 'data-slot': s, transform: `translate(${p.x},${p.y})` });
        g.innerHTML = it
          ? `<circle r="30" fill="transparent"/>${icon(it)}<text y="35" class="dv-lab">${itemName(it)}</text><circle cx="-24" cy="-24" r="9" class="slot-tag"/><text x="-24" y="-20.5" class="slot-let">${s}</text>`
          : `<circle r="24" class="slot-ring"/><text y="6" class="slot-big">${s}</text>`;
        scene.appendChild(g);
      });
      return;
    }
    // internet (decoration: the Router is the way out of the house)
    h += `<polyline points="${r.x},${r.y + 9} ${r.x},392 528,392 528,352" class="lk-fibre"/>`;
    h += '<g transform="translate(528,336)"><path d="M-22,10 a11,11 0 0 1 2,-21 a14,14 0 0 1 27,-4 a11,11 0 0 1 13,25 z" fill="#fff" stroke="#1B2440" stroke-width="2.5"/><text y="4" text-anchor="middle" font-size="7.5" font-weight="900" fill="#1B2440">INTERNET</text></g>';
    // links
    h += `<line x1="${DEV.hub.x}" y1="${DEV.hub.y}" x2="${r.x}" y2="${r.y}" class="lk-eth"/>`;
    ENDPOINTS.forEach(id => { const d = DEV[id], k = S.links[id]; if (k !== 'none') h += `<line x1="${d.x}" y1="${d.y}" x2="${r.x}" y2="${r.y}" class="lk-${k}"/>`; });
    scene.innerHTML = h;
    // devices
    Object.keys(DEV).forEach(id => {
      const d = DEV[id];
      const g = el('g', { class: 'dv', 'data-dev': id, transform: `translate(${d.x},${d.y})` });
      const link = d.kind === 'core' ? null : S.links[id];
      g.innerHTML = `<circle r="30" fill="transparent"/>${icon(id)}<text y="${id === 'tv' ? 37 : 33}" class="dv-lab">${d.name}</text>` +
        (link ? `<text y="${id === 'tv' ? 47 : 43}" class="dv-sub" fill="${link === 'none' ? '#E23D63' : link === 'eth' ? '#2E7CF6' : '#00877A'}">${link === 'none' ? 'no link' : link === 'eth' ? 'cable' : 'Wi-Fi'}</text>` : '');
      scene.appendChild(g);
    });
  }

  /* ---------- packets ---------- */
  function hop(a, b, kind, label) {
    return new Promise(res => {
      const dur = (kind === 'wifi' ? 760 : 420) / S.speed;
      const g = el('g', {});
      g.appendChild(el('circle', { r: 8, fill: '#FFC83D', stroke: '#1B2440', 'stroke-width': 2.5 }));
      if (label) g.appendChild(el('text', { y: -12, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 900, fill: '#1B2440', stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke', 'font-family': 'monospace' }, label));
      pkLayer.appendChild(g);
      const t0 = performance.now();
      (function step(now) {
        const t = Math.min(1, (now - t0) / dur);
        g.setAttribute('transform', `translate(${a.x + (b.x - a.x) * t},${a.y + (b.y - a.y) * t})`);
        if (t < 1) requestAnimationFrame(step); else { g.remove(); res(); }
      })(t0);
    });
  }
  async function dropAt(p) {
    const g = el('g', { transform: `translate(${p.x},${p.y - 26})` });
    g.appendChild(el('circle', { r: 11, fill: '#E23D63', stroke: '#1B2440', 'stroke-width': 2.5 }));
    g.appendChild(el('text', { y: 4.5, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 900, fill: '#fff' }, '✕'));
    pkLayer.appendChild(g);
    await sleep(900 / S.speed); g.remove();
  }
  const linkOf = id => (id === 'hub' ? 'eth' : S.links[id]);

  /** Send one packet between two devices, through the Router. Resolves true if it arrives. */
  async function packet(from, to, label) {
    const A = DEV[from], B = DEV[to], R = DEV.router;
    if (linkOf(from) === 'none') { onLog(`${A.name} has no link to the Router, so its message cannot leave.`, 'bad'); await dropAt(A); return false; }
    await hop(A, R, linkOf(from), label);
    if (linkOf(to) === 'none') { onLog(`Packet dropped at the Router: there is no link to ${B.name}.`, 'bad'); await dropAt(R); return false; }
    await hop(R, B, linkOf(to), label);
    return true;
  }

  /** The Hub tells an output device to switch on or off. */
  async function command(id, val) {
    const ok = await packet('hub', id, `${id.toUpperCase()} ${val ? 'ON' : 'OFF'}`);
    if (ok) { S.out[id] = val; render(); onLog(`${OUTPUTS[id]} switched ${val ? 'on' : 'off'}.`, 'ok'); }
    onEvent({ type: ok ? 'output' : 'drop', id, val });
    onChange();
    return ok;
  }

  /** A person changes something in the house. Sensors must tell the Hub over the network. */
  async function setInput(id, val) {
    S.actual[id] = val; render(); onChange();
    if (id === 'night') { S.known.night = val; onLog(`The Hub's own clock says it is ${val ? 'night' : 'day'}. No packet needed: the clock is inside the Hub.`, 'info'); onEvent({ type: 'input', id, val }); onChange(); return; }
    const ok = await packet(id, 'hub', `${id.toUpperCase()} ${val ? 'ON' : 'OFF'}`);
    if (ok) { S.known[id] = S.actual[id]; onLog(`The Hub now knows: ${INPUTS[id]} is ${S.actual[id] ? 'on' : 'off'}.`, 'ok'); onEvent({ type: 'input', id, val: S.actual[id] }); }
    onChange();
  }

  async function pingAll() {
    if (S.busy) return;
    S.busy = true; onChange();
    onLog('Ping test: the Hub sends a test packet to every device.', 'info');
    for (const id of ENDPOINTS) {
      const ok = await packet('hub', id, 'PING');
      onLog(ok ? `${DEV[id].name} replied.` : `${DEV[id].name} did not reply.`, ok ? 'ok' : 'bad');
      onEvent({ type: 'ping', id, ok });
    }
    S.busy = false; onChange();
  }

  return { DEV, INPUTS, OUTPUTS, ENDPOINTS, SLOTS, S, renderTray, init, setup, resetState, render, command, setInput, pingAll, sleep };
})();
