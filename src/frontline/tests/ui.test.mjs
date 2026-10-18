import './fakedom.mjs';
import { Controls } from '../controls.js';
import { Sfx } from '../../common/sfx.js';
import { ControllerOverlay } from '../../common/overlay.js';
import { Sound } from '../sound.js';
import { Menu, titleScreen, mainScreen, pauseScreen, settingsScreen, resultsScreen } from '../menus.js';
import { LoadoutScreen, loadLoadout, saveLoadout } from '../loadout.js';
import { DEFAULT_SETTINGS, WEAPONS, sanitizeLoadout } from '../data.js';
import { makeEnv, step, run } from './sim.mjs';
let fails = 0, checks = 0; const ok = (c, m) => { checks++; if (!c) { fails++; console.log('  FAIL:', m); } };

const settings = { ...DEFAULT_SETTINGS };
const ctl = new Controls(settings); const sound = new Sound(new Sfx());
const calls = [];
const actions = new Proxy({}, { get: (t, k) => (...a) => { calls.push(k); } });
const app = { ctl, settings, profile: { xp: 2500 }, actions, matchName: () => 'Team Deathmatch', loadoutSummary: () => 'x' };
const root = document.createElement('div');
const menu = new Menu(root, ctl, sound);

// main menu walk-through
menu.show(mainScreen(app));
ok(menu.items.length >= 8, 'main menu items');
for (let i = 0; i < menu.items.length; i++) { ctl.navY = 1; ctl.navX = 0; ctl.confirm = false; ctl.back = false; menu.update(0.016); }
ctl.navY = 0;
// difficulty cycles
menu.sel = menu.items.findIndex(i => i.label === 'Difficulty'); const d0 = settings.difficulty; ctl.navX = 1; menu.update(0.016); ctl.navX = 0; ok(settings.difficulty !== d0, 'difficulty cycles');
// activating items
for (const label of ['Team Deathmatch', 'Free-for-All', 'Firing Range', 'Loadout', 'Settings', 'Controls', 'Back to Arcade']) {
  menu.sel = menu.items.findIndex(i => i.label === label); ctl.confirm = true; menu.update(0.016); ctl.confirm = false;
}
ok(calls.includes('start') && calls.includes('loadout') && calls.includes('settings') && calls.includes('controls') && calls.includes('home'), `actions fired ${calls.join(',')}`);
// other screens render and work
menu.show(titleScreen(app)); menu.show(pauseScreen(app)); ctl.back = true; menu.update(0.016); ctl.back = false; ok(calls.includes('resume'), 'pause back resumes');
menu.show(settingsScreen(app, () => calls.push('back')));
for (let i = 0; i < menu.items.length; i++) { ctl.navY = 1; menu.update(0.016); ctl.navX = 1; menu.update(0.016); ctl.navX = -1; menu.update(0.016); ctl.navX = 0; }
ctl.navY = 0; ok(settings.fov >= 70 && settings.fov <= 110 && settings.sensStick > 0, 'settings clamp');
menu.show(resultsScreen(app, { outcome: 'victory', mode: 'Team Deathmatch', scoreA: 40, scoreB: 30, rows: [{ name: 'You', team: 0, kills: 5, deaths: 2, assists: 1, score: 600, you: true }], xp: 1200, teams: true }));
ok(root.querySelector('.fl-list') !== null, 'results render');

// loadout screen
const lo = new LoadoutScreen(document.createElement('div'), ctl, sound);
let done = null; lo.open(loadLoadout(), l => { done = l; });
ok(lo.rows.length >= 10, `loadout rows ${lo.rows.length}`);
ctl.navY = 0;
const press = (k, v = true) => { ctl[k] = v; lo.update(0.016); ctl[k] = false; };
// change primary via cycle and via the chooser
lo.sel = 0; ctl.navX = 1; lo.update(0.016); ctl.navX = 0; ok(lo.loadout.primary !== 'vanguard4', `primary cycled to ${lo.loadout.primary}`);
press('confirm'); ok(!!lo.chooser, 'A opens the weapon chooser'); ctl.navY = 1; lo.update(0.016); lo.update(0.016); ctl.navY = 0; press('confirm'); ok(!lo.chooser, 'chooser closes on pick');
// attachments rows exist and cycle
const attRow = lo.rows.findIndex(r => r.kind === 'att' && r.att === 'optic'); lo.sel = attRow; const before = lo.loadout.att[lo.loadout.primary].optic; ctl.navX = 1; lo.update(0.016); ctl.navX = 0; ok(lo.loadout.att[lo.loadout.primary].optic !== before, 'optic cycles');
// every row cycles without error in both directions
for (let i = 0; i < lo.rows.length; i++) { lo.sel = i; for (const d of [1, -1, 1]) { ctl.navX = d; lo.update(0.016); } ctl.navX = 0; }
// walk every weapon through the chooser info panel
for (const id of Object.keys(WEAPONS)) { lo.showInfo({ type: 'gun', id, att: lo.loadout.att[id] }); }
for (const t of ['melee', 'lethal', 'tactical', 'streak']) lo.showInfo({ type: t, id: t === 'melee' ? 'karambit' : t === 'lethal' ? 'mine' : t === 'tactical' ? 'smoke' : 'drone' });
lo.sel = lo.rows.length - 1; press('confirm'); ok(done && done.primary, 'Done returns the loadout');
const reloaded = loadLoadout(); ok(reloaded.primary === done.primary, 'loadout persisted'); ok(JSON.stringify(sanitizeLoadout(done)) === JSON.stringify(done), 'loadout is valid');

// HUD callbacks
const env = makeEnv('tdm'); const hud = env.hud;
hud.hitmarker('hit'); hud.hitmarker('head'); hud.hitmarker('kill'); hud.damage(1.2, 30, 0.7); hud.damage(null, 10, 0.6);
hud.killfeed({ killer: 'A', killerTeam: 0, victim: 'B', victimTeam: 1, weapon: 'Vanguard 4', head: true, you: true }); hud.killfeed({ killer: 'B', killerTeam: 1, victim: 'You', victimTeam: 0, weapon: 'X', youDied: true }); hud.killfeed({ killer: 'B', victim: 'B', self: true });
hud.medal('Headshot'); hud.xp(100, 'Kill'); hud.toast('hi'); hud.flashText('x'); hud.flashMode('auto'); hud.warn('w'); hud.rangeHit(100, 'head', 20);
run(env, 4); step(env, 1 / 60, c => { c.scoreHeld = true; }); ok(true, 'hud updates');
const hud2 = makeEnv('range').hud; run({ ...makeEnv('range') }, 1);

// overlay with every button described
const ov = new ControllerOverlay({ title: 't', pad: ctl.pad, map: { A: 'a', B: 'b', X: 'x', Y: 'y', L1: 'l1', R1: 'r1', L2: 'l2', R2: 'r2', UP: 'u', DOWN: 'd', LEFT: 'l', RIGHT: 'r', LS: 'ls', RS: 'rs', L3: 'l3', R3: 'r3', SELECT: 's', START: 'st', TOUCH: 't', HOME: 'h' } });
ov.show(); ov.update(); ov.toggle(); ok(true, 'overlay builds');
console.log(`\n${checks - fails}/${checks} UI checks passed`); process.exit(fails ? 1 : 0);
