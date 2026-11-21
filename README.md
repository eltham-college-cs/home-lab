# Home Lab (prototype)

A Flowol-style activity for Year 8: pupils write flowcharts that control a networked home.
The Home Hub runs the flowchart and every instruction travels as a packet (Hub -> Router -> device).
If a device has no link to the Router, the packet is dropped and the log says why.

Open `index.html` in a browser. Add `#teacher` to unlock every mission.

- `js/home.js` : the house mimic, links (cable / Wi-Fi) and packet animation
- `js/flow.js` : flowchart editor (Start, Output, Delay, Decision, Stop) and run engine
- `js/missions.js` : the six missions and their checks
- `js/app.js` : checklist, inputs/outputs panel, log, saving (browser only)

Missions: 1 What Am I? (guided build: drag devices to lettered spaces from clues) · 2 Connect It Up (drag cable or Wi-Fi onto devices, ping test) ·
3 Welcome Light (sequence) · 4 Doorbell Alert (selection) ·
5 Night Light (iteration) · 6 Fault Finder (troubleshooting) · 7 Bedtime Mode (design challenge).
