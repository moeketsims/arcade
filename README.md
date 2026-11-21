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
| Sparkplug GP | Kart racer: 6 tracks, 3 cups, time trial with ghosts, 8 racers, 4 karts, items, replays | `kart.html` |

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

Jumping: tap A for a short hop (about 1.5 m), hold it for the full jump (3.3 m, about twice Bolt's height), and keep
holding after the top to hover. The jump is set by its height and rise time (`JUMP_H`, `JUMP_T` in `src/player.js`);
gravity and launch speed are derived from them, and the arc is the same at any frame rate. Falling off costs a heart
and puts Bolt back on the last solid ground he stood on.

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

## Sparkplug GP controls

| Button | Racing |
|---|---|
| **A** or **R2** | Accelerate (R2 is analog) |
| **B** or **L2** | Brake, then reverse |
| Left stick / D-pad ← → | Steer |
| **R1** (or **Y**) | Hop; hold while steering to drift. Sparks go blue, orange, violet: let go for a bigger boost each time. In the air off a ramp: trick (boost on landing) |
| **L1** or **X** | Use item. Hold to trail a Goo Blob or Bounce Puck behind you as a shield, release to fire. Hold ↑ to throw ahead, ↓ to fire behind |
| **R3** / right stick ↓ | Look behind |
| Create · Options · Touchpad · PS | Minimap on/off · Pause · Controls · Arcade |

Start boost: press the throttle just after **2** leaves the screen (too early floods the engine). Keyboard: W/↑ go,
S/↓ brake, A D / ← → steer, Space/Shift drift, E item (Q fires behind), C look behind, M minimap, Esc pause. On
touch screens the on-screen buttons are relabelled GAS, BRAKE, DRIFT and ITEM, and auto-accelerate is on (Options).

Modes: **Grand Prix** (Petal, Comet and Grand Cups at Rookie 50 cc, Pro 100 cc or Legend 150 cc; points
15-12-10-8-6-4-2-1, trophies for the top three), **Single Race**, **Time Trial** (three Turbo Cans, records and a
ghost of your best run, kept in the browser). Every race can be watched back as a replay with trackside and chase
cameras. Items: Turbo Can, Triple Turbo, Goo Blob, Bounce Puck, Seeker Wasp, Decoy Crystal, Prism Shield,
Thunderhead (racers further back get the stronger ones).

## Testing shortcuts

- `starbolt.html?world=N` (0–5) and `?unlock=1`.
- `football.html` opens the menu with a live demo match behind it.
- `royale.html?quick=1` skips the balloon: you start near Pinecrest Village with a loadout, 5 robots and a chest.
  Extra flags: `&bots=N`, `&storm=0`, `&god=1`, `&seed=N`, `&range=1` (a ring of every item), `&fps=1`.
  Headless tests: `node src/royale/tools/t_features.mjs`, `t_pad.mjs`, `t_smoke.mjs bus 300`.
- `frontline.html?mode=range|tdm|ffa&diff=recruit|regular|veteran` goes straight into a match.
- `kart.html?quick=1&mode=vs|tt|gp&track=0..5&cup=0..2&racer=0..7&kart=0..3&cls=0..2` goes straight into a race.
  Extra flags: `&laps=N`, `&cpu=N`, `&auto=1` (your kart drives itself), `&speed=N` (fast-forward), `&fps=1`.
  Headless tests: `node src/kart/tests/sim.test.mjs` (full races on every track, drifting, items, laps).
  Browser tests (server running, Chrome or Edge installed, Node 22+): `node src/kart/tests/browser.mjs`
  (hub, the four other games, menus, a race start to finish, results, replay, restart, Grand Prix, time trial,
  keyboard, emulated DualSense and Xbox pads, multi-touch and phone layouts; screenshots go to the temp folder).

## Code map

`src/common/` shared by every game: `pad.js` (all controller buttons + keyboard/mouse), `touch.js` (on-screen touch
controls that feed `pad.js`), `overlay.js` (live controller
diagram), `humanoid.js` (jointed 3D people + animation library), `sfx.js` (synthesised sound), `arcade.css`.
`src/hub.js` the Arcade home. `src/football/` Golazo (stadium, ball physics, players, AI, match engine).
`src/` (top level) Starbolt. `src/royale/`, `src/frontline/` the two shooters. `src/kart/` Sparkplug GP (`data.js` racers, karts,
tracks and items; `track.js` spline tracks; `sim.js` the race simulation, CPU drivers and items, no Three.js;
`view.js` 3D scenes and cameras; `hud.js`, `audio.js`, `main.js` menus and race flow). `serve.py` is a no-cache dev server.
