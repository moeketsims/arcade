# Arcade

A console-style home screen with original 3D games for the browser, all playable with a PS5 DualSense, an Xbox
pad or any standard controller (or keyboard and mouse). Every game uses every button: both sticks and stick clicks,
the D-pad, L1/R1/L2/R2, the four face buttons, Options, Create and the touchpad. All characters, names, worlds,
weapons, models and sounds are original and generated in code (Three.js + Web Audio); nothing is copied from
existing games.

## Play online

https://moeketsims.github.io/arcade/ works on any device with a modern browser. On a phone or iPad with no
controller, on-screen touch controls appear: two sticks, the D-pad, A/B/X/Y, L1/L2/R1/R2, small L3/R3 buttons on
the sticks (or tap a stick), and HOME / SELECT / HELP / MENU along the top. Drag anywhere on the game view to look
around. Landscape gives the most room. Pair a Bluetooth controller (DualSense or Xbox) and the touch controls hide
themselves as soon as it is used. On the home screen, tap a game once to see it and again to play.

## Run it

Double-click **Play Arcade.cmd** (it starts the small web server and opens the Arcade), or run:

```bash
python serve.py
```

and open http://127.0.0.1:5173 in Chrome or Edge. Click a game to play it (hover shows its details), or pick it with
the D-pad / left stick and press A. Opening `index.html` directly as a file does not work: the games need the server.
In any game: **PS / Xbox button** (or <kbd>`</kbd>) returns to the Arcade, **touchpad** (or <kbd>Tab</kbd>) shows a
live diagram of every control, **Options** (<kbd>Esc</kbd>) pauses. The *Controller Test* tile lights up every
button, stick and trigger as you press it.

Buttons are named by position, as on Xbox: **A** = bottom (PS ✕), **B** = right (PS ○), **X** = left (PS □),
**Y** = top (PS △).

## Games

| Tile | Game | Page |
|---|---|---|
| Starbolt | 3D robot platformer: hub, 5 worlds, 25 bots, 3-phase boss | `starbolt.html` |
| Golazo Football | 11-a-side 3D football: matches, penalty shootout, free-kick challenge | `football.html` |
| Storm Royale | Battle royale: bus drop, loot, building, storm, 30 rivals | `royale.html` |
| Frontline Ops | First-person military shooter: loadouts, scorestreaks, firing range | `frontline.html` |

## Golazo Football controls

| Button | With the ball | Ball in the air | Defending | Goalkeeper |
|---|---|---|---|---|
| **X** | Pass (L1+X through ball, R1+X driven pass) | Header / volley pass | Contain (hold) | **Save right** |
| **B** | Shoot (hold for power) | Volley / header shot | **Slide tackle** | **Save middle** |
| **A** | Long pass / cross | **Bicycle kick** | Teammate press (hold) | Rush out · punt |
| **Y** | Finesse shot · L1+Y **chip** · R1+Y **power ("stunning") shot** · L2+Y **rainbow flick** · R2+Y **flick over** | **Volley / header / chest** (by the ball's height) | **Standing tackle** | **Save left** |
| Left stick | Move, dribble, aim | Move | Move | Move along the line |
| Right stick | **Curve** shots (and aftertouch) · skill moves | | Switch player | |
| L1 / R1 | Modifiers (chip / through ball, power shot / driven pass) | | L1 switch player · R1 team press | |
| L2 / R2 | Shield ball · Sprint | | Jockey · Sprint | |
| L3 / R3 | Knock-on sprint · goalkeeper control on/off | | Keeper rush · keeper control | |
| D-pad | ↑ attacking / ↓ defensive tactics, ← → camera angle | | | |
| Create · Options · Touchpad · PS | Radar · Pause · Controls · Arcade | | | |

Set pieces: **free kicks** — aim with the left stick, curve with the right stick, **B** power or **Y** curled;
**penalties** — **B** power, **Y** placed, **L1+Y** panenka; you save with **X** (right), **Y** (left), **B** (middle) —
press during the run-up to commit. When the opposition shoots, the game slows down and gives you the keeper
(turn it off in the pause menu: *Keeper saves → Automatic*). Throw-ins: **X** short, **A** long. Corners and goal
kicks: aim the marker, **A** cross / long ball, **X** short.

Keyboard: WASD move, I = Y, J = X, K = A, L = B (the same diamond as the pad), arrow keys = right stick,
Q/E = L1/R1, Z = L2, Shift = R2, F = L3, G = R3, 1–4 = D-pad, M = Create.

## Starbolt controls

A jump/hover · B or R2 dash · X punch/spin · Y ground pound / gadget / scan · L1/R1 swing camera 45° ·
L2 close-up · D-pad zoom/rotate camera · L3 wave · R3 camera behind Bolt · Create music · Options pause.

## Storm Royale controls

A jump · glider · jump from the balloon · B build mode · X reload, hold to open chests / pick up · Y pickaxe (press
again to swing and harvest) · R2 fire · L2 aim (blade: dash) · L1/R1 previous / next slot · D-pad ↑ heal, ↓ grenade,
← → slot · L3 sprint · R3 crouch · Create emote. In build mode: R2 wall, L2 ramp, R1 floor, L1 roof, D-pad ← →
material (wood, brick, metal). Keyboard: WASD, mouse, Space, Q build, R / hold E, F pickaxe, wheel or 1–6 slots,
Z/C/X/V wall/ramp/floor/roof, G material, H heal, T grenade, Shift sprint, C crouch, B emote.

24 guns (4 assault rifles, 3 SMGs, 4 shotguns, 4 pistols, 3 snipers, rocket and grenade launchers, minigun, LMG,
crossbow, bow), combat knife, energy blade, machete, throwing knives, frag / impulse / smoke grenades, bandages,
medkit and shields, in five rarities.

## Frontline Ops controls

R2 fire · L2 aim down sights · X reload, hold to pick up · Y switch weapon, hold for knife, double-tap to inspect ·
R3 quick knife · A jump / mantle · B crouch, hold for prone, slide while sprinting · L3 sprint (double-tap: tactical
sprint) · R1 lethal (hold to cook) · L1 tactical · D-pad ↑ → ← scorestreaks, ↓ fire mode · hold Create for the
scoreboard. 21 guns, 5 knives, 4 lethals (frag, sticky, throwing knife, mine), 4 tacticals (flash, smoke, stun,
heartbeat sensor), 4 scorestreaks, sights and attachments.

## Testing shortcuts

- `starbolt.html?world=N` (0–5) and `?unlock=1`.
- `football.html` opens the menu with a live demo match behind it.
- `royale.html?quick=1` skips the balloon: you start near Pinecrest Village with a loadout, 5 robots and a chest.
  Extra flags: `&bots=N`, `&storm=0`, `&god=1`, `&seed=N`, `&range=1` (a ring of every item), `&fps=1`.
  Headless tests: `node src/royale/tools/t_features.mjs`, `t_pad.mjs`, `t_smoke.mjs bus 300`.
- `frontline.html?mode=range|tdm|ffa&diff=recruit|regular|veteran` goes straight into a match.

## Code map

`src/common/` shared by every game: `pad.js` (all controller buttons + keyboard/mouse), `touch.js` (on-screen touch
controls that feed `pad.js`), `overlay.js` (live controller
diagram), `humanoid.js` (jointed 3D people + animation library), `sfx.js` (synthesised sound), `arcade.css`.
`src/hub.js` the Arcade home. `src/football/` Golazo (stadium, ball physics, players, AI, match engine).
`src/` (top level) Starbolt. `src/royale/`, `src/frontline/` the two shooters. `serve.py` is a no-cache dev server.
