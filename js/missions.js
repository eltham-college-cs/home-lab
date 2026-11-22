/* HiveMind — missions. Each check reads the wiring, the flowchart and what happened in the last run. */
(() => {
  const ALL = { doorbell: 'wifi', motion: 'wifi', light: 'wifi', tv: 'eth', printer: 'eth', phone: 'wifi' };
  const idx = (ev, f) => ev.findIndex(f);
  const outOn = (id, val) => e => e.type === 'output' && e.id === id && e.val === val;
  const inOn = id => e => e.type === 'input' && e.id === id && e.val === true;
  const after = (ev, a, b) => { const i = idx(ev, a); return i >= 0 && ev.slice(i + 1).some(b); };
  const asks = (c, input) => c.nodes.some(n => n.type === 'decision' && n.cfg.input === input);

  window.MISSIONS = [
    {
      title: 'What Am I?', skill: 'guided build', mode: 'build', noflow: true,
      brief: 'The house is empty. Read each "What am I?" clue, then drag the right device from the tray onto the lettered space it describes. A tick means you have it; a cross means read the clue again.',
      links: {}, chart: { nodes: [], edges: [] },
      checks: [
        ['A', 'doorbell', 'I am outside by the front door. When a visitor presses me, I send a message into the house.'],
        ['B', 'router', 'Every packet in this house passes through me. I join all the devices together, and I am the only way out to the Internet.'],
        ['C', 'phone', 'I am a client that travels in my owner\'s pocket, so I have no cable socket. Tonight I am charging in the bedroom.'],
        ['D', 'tv', 'I am a client with a big screen. I never move, and I stream hours of video in the living room.'],
        ['E', 'hub', 'I am the brain of the smart home. I sit beside the router and send instructions to the other devices.'],
        ['F', 'printer', 'I am shared: any client in the house can send me a page. I live on the desk in the study.'],
        ['G', 'light', 'I hang from the hall ceiling. I do one job: switch on or off when a packet tells me to.'],
        ['H', 'motion', 'I am a sensor on the hall ceiling. I notice when somebody walks past, and report it.'],
        ['I', 'internet', 'I am not inside the house at all. I am the worldwide network of networks that the router connects to.']
      ].map(([s, id, clue]) => ({ html: `<b>${s}</b> ${clue}`, f: c => c.place[s] === id, w: c => c.place[s] && c.place[s] !== id }))
        .concat([{ t: 'One item stays in the tray: it stores websites out on the Internet, so it does not belong in a home.',
          f: c => Object.keys(HL.SLOTS).every(s => c.place[s] === HL.SLOTS[s]), w: c => Object.values(c.place).includes('server') }]),
      hint: 'Start with the clues that name a room or a place. Two spaces are on the hall ceiling: one device senses, the other is controlled. You can also tap a device, then tap a space.',
      book: '<b>In your book:</b> which device does every packet pass through? Name one <b>client</b> in this house and say what makes it a client.'
    },
    {
      title: 'Connect It Up', skill: 'guided build', mode: 'links', noflow: true, ping: true,
      brief: 'The devices are in place but nothing is connected. Drag an Ethernet cable or Wi-Fi onto each device so it can reach the Router. Use each device\'s clue to choose, then run the ping test.',
      links: {}, chart: { nodes: [], edges: [] },
      checks: [
        { html: '<b>Smart TV</b> "I never move and I stream video all evening. Give me the fastest, most reliable link."', f: c => c.links.tv === 'eth', w: c => c.links.tv === 'wifi' },
        { html: '<b>Printer</b> "I stay on the desk and there is a spare socket on the router. Big files should reach me without drop-outs."', f: c => c.links.printer === 'eth', w: c => c.links.printer === 'wifi' },
        { html: '<b>Phone</b> "I move from room to room and I have no socket."', f: c => c.links.phone === 'wifi' },
        { html: '<b>Doorbell, Motion Sensor, Hall Light</b> "We are small and fixed where no cable reaches."', f: c => ['doorbell', 'motion', 'light'].every(id => c.links[id] === 'wifi') },
        { t: 'Ping test: every device replies', f: c => HL.ENDPOINTS.every(id => c.ev.some(e => e.type === 'ping' && e.id === id && e.ok)) }
      ],
      hint: 'A cable is faster and more reliable, but the device has to stay put and needs a socket. Wi-Fi lets a device move, or sit where a cable cannot go. Try dropping a cable on the phone and read the log.',
      book: '<b>In your book:</b> give one benefit and one drawback of Wi-Fi compared with an Ethernet cable.'
    },
    {
      title: 'Welcome Light', skill: 'sequence', locked: true,
      brief: 'The flowchart is drawn but two Output symbols are empty. Make the Hall Light switch on, stay on for 2 seconds, then switch off. Watch each instruction travel as a packet.',
      links: ALL,
      chart: { nodes: [
        { id: 'a', type: 'start', x: 200, y: 50 }, { id: 'b', type: 'output', x: 200, y: 140 },
        { id: 'c', type: 'delay', x: 200, y: 230, cfg: { secs: 1 } }, { id: 'd', type: 'output', x: 200, y: 320 }, { id: 'e', type: 'stop', x: 200, y: 400 }
      ], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd' }, { from: 'd', to: 'e' }] },
      checks: [
        { t: 'The Hall Light switches on', f: c => c.ev.some(outOn('light', true)) },
        { t: 'It stays on for at least 2 seconds', f: c => { const i = idx(c.ev, outOn('light', true)), j = c.ev.findIndex((e, k) => k > i && outOn('light', false)(e));   // add up the Delay symbols between on and off (packet travel time does not count)
          return i >= 0 && j > i && c.ev.slice(i, j).filter(e => e.type === 'delay').reduce((s, e) => s + e.secs, 0) >= 2; } },
        { t: 'Then it switches off', f: c => after(c.ev, outOn('light', true), outOn('light', false)) }
      ],
      hint: 'Click an Output symbol with the Select tool, then choose on or off for the Hall Light in the panel underneath. Click the Delay symbol to change its time.',
      book: '<b>In your book:</b> a <b>sequence</b> is instructions carried out in order. Which device did every packet pass through on its way to the light?'
    },
    {
      title: 'Doorbell Alert', skill: 'selection', locked: true,
      brief: 'When somebody presses the doorbell, send an alert to the phone and turn the Hall Light on. Fill in the decision and the two outputs, press Run, then click Doorbell in the Inputs list.',
      links: ALL,
      chart: { nodes: [
        { id: 'a', type: 'start', x: 230, y: 50 }, { id: 'b', type: 'decision', x: 230, y: 150 },
        { id: 'c', type: 'output', x: 230, y: 280 }, { id: 'd', type: 'delay', x: 230, y: 380, cfg: { secs: 3 } }, { id: 'e', type: 'output', x: 230, y: 480 }
      ], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c', branch: 'yes' }, { from: 'b', to: 'b', branch: 'no' }, { from: 'c', to: 'd' }, { from: 'd', to: 'e' }, { from: 'e', to: 'b' }] },
      checks: [
        { t: 'The decision asks "Is Doorbell on?"', f: c => asks(c, 'doorbell') },
        { t: 'Nothing happens until the bell is pressed', f: c => { const i = idx(c.ev, inOn('doorbell')); return i >= 0 && !c.ev.slice(0, i).some(e => e.type === 'output' && e.val); } },
        { t: 'The phone gets an alert after the bell', f: c => after(c.ev, inOn('doorbell'), outOn('phone', true)) },
        { t: 'The Hall Light comes on too', f: c => after(c.ev, inOn('doorbell'), outOn('light', true)) }
      ],
      demoChart: { nodes: [
        { id: 'a', type: 'start', x: 230, y: 50 }, { id: 'b', type: 'decision', x: 230, y: 150, cfg: { input: 'doorbell' } },
        { id: 'c', type: 'output', x: 230, y: 280, cfg: { set: { light: 'on', phone: 'on' } } }, { id: 'd', type: 'delay', x: 230, y: 380, cfg: { secs: 3 } },
        { id: 'e', type: 'output', x: 230, y: 480, cfg: { set: { light: 'off', phone: 'off' } } }
      ], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c', branch: 'yes' }, { from: 'b', to: 'b', branch: 'no' }, { from: 'c', to: 'd' }, { from: 'd', to: 'e' }, { from: 'e', to: 'b' }] },
      hint: 'A decision is a yes/no question. Set it to Doorbell. In the first Output, switch Phone alert and Hall Light on. In the second, switch them off again.',
      book: '<b>In your book:</b> <b>selection</b> means choosing a path. The doorbell is outside the house: how did the Hub find out it was pressed?'
    },
    {
      title: 'Night Light', skill: 'iteration', locked: true,
      brief: 'Build this one yourself. Keep checking the Motion Sensor for ever. When it detects movement, turn the Hall Light on for 3 seconds, then off, and go back to checking.',
      links: ALL, chart: { nodes: [{ id: 'a', type: 'start', x: 230, y: 50 }], edges: [] },
      checks: [
        { t: 'A decision asks "Is Motion on?"', f: c => asks(c, 'motion') },
        { t: 'The flowchart loops back (iteration)', f: c => c.loop },
        { t: 'The light comes on when motion is detected', f: c => after(c.ev, inOn('motion'), outOn('light', true)) },
        { t: 'It works a second time without pressing Run again', f: c => { const i = idx(c.ev, outOn('light', false)); return i >= 0 && c.ev.slice(0, i).some(outOn('light', true)) && c.ev.slice(i + 1).some(outOn('light', true)); } }
      ],
      hint: 'Add a Decision, an Output, a Delay and another Output. Use the Arrow tool: the first arrow from a decision is YES, the second is NO. Point the NO arrow, and the last Output, back at the decision.',
      book: '<b>In your book:</b> <b>iteration</b> means repeating. What would happen to the light if the arrow back to the decision was missing?'
    },
    {
      title: 'Fault Finder', skill: 'troubleshooting',
      brief: 'This flowchart is correct: when the doorbell rings, the TV shows the door camera and the phone gets an alert. But nothing works! Run it, press the Doorbell, read the log and fix the network.',
      links: { motion: 'wifi', light: 'wifi', printer: 'eth', phone: 'wifi' },
      chart: { nodes: [
        { id: 'a', type: 'start', x: 230, y: 50 }, { id: 'b', type: 'decision', x: 230, y: 150, cfg: { input: 'doorbell' } },
        { id: 'c', type: 'output', x: 230, y: 280, cfg: { set: { tv: 'on', phone: 'on' } } }, { id: 'd', type: 'delay', x: 230, y: 380, cfg: { secs: 4 } },
        { id: 'e', type: 'output', x: 230, y: 480, cfg: { set: { tv: 'off', phone: 'off' } } }
      ], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c', branch: 'yes' }, { from: 'b', to: 'b', branch: 'no' }, { from: 'c', to: 'd' }, { from: 'd', to: 'e' }, { from: 'e', to: 'b' }] },
      checks: [
        { t: 'The Hub hears the doorbell', f: c => c.ev.some(inOn('doorbell')) },
        { t: 'The Smart TV switches on', f: c => after(c.ev, inOn('doorbell'), outOn('tv', true)) },
        { t: 'The phone gets its alert', f: c => after(c.ev, inOn('doorbell'), outOn('phone', true)) }
      ],
      hint: 'There are two faults, and neither is in the flowchart. Look for devices labelled "no link". A message can fail on the way in to the Hub as well as on the way out.',
      book: '<b>In your book:</b> the program was perfect but the system failed. Explain why, using the words <b>packet</b> and <b>router</b>.'
    },
    {
      title: 'Bedtime Mode', skill: 'design challenge', locked: true,
      brief: 'The TV and the Hall Light have been left on. Build a flowchart that waits for night time, then switches the TV and light off and prints tomorrow\'s timetable. Press Run, then click Night time.',
      links: ALL, out: { tv: true, light: true }, chart: { nodes: [{ id: 'a', type: 'start', x: 230, y: 50 }], edges: [] },
      checks: [
        { t: 'A decision asks "Is Night time on?"', f: c => asks(c, 'night') },
        { t: 'The TV switches off after night falls', f: c => after(c.ev, inOn('night'), outOn('tv', false)) },
        { t: 'The Hall Light switches off', f: c => after(c.ev, inOn('night'), outOn('light', false)) },
        { t: 'The Printer prints the timetable', f: c => after(c.ev, inOn('night'), outOn('printer', true)) },
        { t: 'Bonus: the phone gets a "goodnight" alert', bonus: true, f: c => after(c.ev, inOn('night'), outOn('phone', true)) }
      ],
      hint: 'One Output symbol can change several devices at once. Night time is the Hub\'s own clock, so it needs no packet, but every command to a device still does.',
      book: '<b>In your book:</b> draw your flowchart and label one example each of <b>sequence</b>, <b>selection</b> and <b>iteration</b>.'
    }
  ];
})();
