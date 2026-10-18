// Frontline Ops: application shell. Renderer + main loop + screens (title, menu, loadout, match, pause, results).
import * as THREE from 'three';
import { Sfx } from '../common/sfx.js';
import { goHome } from '../common/pad.js';
import { ControllerOverlay } from '../common/overlay.js';
import { Controls } from './controls.js';
import { Sound } from './sound.js';
import { Viewmodel } from './viewmodel.js';
import { Hud } from './hud.js';
import { Menu, titleScreen, mainScreen, pauseScreen, settingsScreen, resultsScreen } from './menus.js';
import { LoadoutScreen, loadLoadout, saveLoadout } from './loadout.js';
import { Match, getMapData } from './match.js';
import { makeSky, makeEnvironment, makeSea } from './levelmesh.js';
import { DEFAULT_SETTINGS, SETTINGS_KEY, PROFILE_KEY, MODES, DIFFICULTY, WEAPONS, MELEE, LETHALS, TACTICALS, STREAKS } from './data.js';
import { clamp, lerp } from './util.js';

const $ = id => document.getElementById(id);
const readJSON = (k, d) => { try { return { ...d, ...JSON.parse(localStorage.getItem(k) || '{}') }; } catch { return { ...d }; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

// ---------------------------------------------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------------------------------------------
export function boot(opts = {}) {
const canvas = $('game');
const renderer = opts.renderer || new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.autoClear = false; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const basePR = Math.min(window.devicePixelRatio || 1, 1.25); let resScale = 1;

const settings = readJSON(SETTINGS_KEY, DEFAULT_SETTINGS); settings.shadows = settings.shadows !== false;
let profile = readJSON(PROFILE_KEY, { xp: 0, courseBest: 0 });
let loadout = loadLoadout();
const ctl = new Controls(settings, canvas);
const sfx = new Sfx(); const sound = new Sound(sfx);
const vm = new Viewmodel();
const hud = new Hud($('hud'), ctl);
const menuEl = $('menu'), menu = new Menu(menuEl, ctl, sound);
const loadoutScreen = new LoadoutScreen($('loadout'), ctl, sound);
const overlay = new ControllerOverlay({
  title: 'Frontline Ops: controls', pad: ctl.pad, note: 'Hold the <b>Create</b> button to see the scoreboard',
  map: {
    A: 'Jump · mantle ledges · slide-cancel', B: 'Crouch (tap) · prone (hold) · slide (sprinting) · dive (tactical sprint)', X: 'Reload (tap) · pick up / interact (hold)',
    Y: 'Switch weapon (tap) · equip knife (hold) · inspect (double-tap)', L1: 'Tactical (hold to aim, release to throw)', R1: 'Lethal (hold to cook)', L2: 'Aim down sights', R2: 'Fire',
    UP: 'Scorestreak 1', RIGHT: 'Scorestreak 2', LEFT: 'Scorestreak 3', DOWN: 'Fire mode: auto / burst / semi', LS: 'Move', RS: 'Look', L3: 'Sprint · double-tap = tactical sprint', R3: 'Quick melee (knife)',
    SELECT: 'Scoreboard (hold)', START: 'Pause · loadout · restart', TOUCH: 'This controls screen', HOME: 'Back to the Arcade',
  },
  keys: {
    A: 'Space', B: 'C / Ctrl', X: 'R tap · E hold', Y: '1 2 wheel · F inspect · hold F knife', L1: 'Q', R1: 'G', L2: 'Mouse R', R2: 'Mouse L', UP: '3', RIGHT: '4', LEFT: '5', DOWN: 'B',
    LS: 'W A S D', RS: 'Mouse / arrows', L3: 'Shift (2× = tactical)', R3: 'V', SELECT: 'Caps Lock', START: 'Esc', TOUCH: 'Tab', HOME: '`',
  },
});

// ---- environment (image-based light from the sky) ------------------------------------------------------------------
let env = null;
try { env = makeEnvironment(renderer, makeSky()); if (env) vm.setEnvironment(env); } catch { env = null; }

// ---- menu backdrop: the real map under a slow orbit ------------------------------------------------------------------
const menuScene = new THREE.Scene(); menuScene.background = new THREE.Color(0xbcd4e6); menuScene.fog = new THREE.Fog(0xc4d8e8, 80, 340);
const menuSky = makeSky(); menuScene.add(menuSky);
menuScene.add(new THREE.HemisphereLight(0xcfe4ff, 0x6b665c, 1.1)); const menuSun = new THREE.DirectionalLight(0xfff0d8, 2.6); menuSun.position.set(-50, 90, 60); menuScene.add(menuSun);
if (env) { menuScene.environment = env; menuScene.environmentIntensity = 0.6; }
const menuCam = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 700); let menuAng = 0.6, backdropReady = false, backdropGroup = null;
function buildBackdrop() {
  try { const d = getMapData('saltworks'); backdropGroup = d.meshes.group; menuScene.add(backdropGroup, makeSea(), d.far); backdropReady = true; } catch (e) { console.warn('backdrop failed', e); }
}
function attachBackdrop() { if (backdropGroup && backdropGroup.parent !== menuScene) menuScene.add(backdropGroup); }

// ---------------------------------------------------------------------------------------------------------------
// state
// ---------------------------------------------------------------------------------------------------------------
const S = { name: 'title', mode: 'tdm', paused: false, expectUnlock: false, resultsAt: 0, xpBanked: false, fromPause: false };
let match = null, aspect = 16 / 9, vw = innerWidth, vh = innerHeight;

const actions = {
  start: id => deploy(id),
  loadout: (fromPause = false) => openLoadout(fromPause),
  settings: (fromPause = false) => openSettings(fromPause),
  controls: () => overlay.show(),
  home: () => { releaseMouse(); bankXp(); goHome(); },
  saveSettings: () => { writeJSON(SETTINGS_KEY, settings); applyVolume(); },
  resume: () => resumeMatch(),
  restart: () => deploy(S.mode),
  again: () => deploy(S.mode),
  menu: () => { endMatch(); openMain(); },
};
const app = { ctl, settings, get profile() { return profile; }, actions, matchName: () => MODES[S.mode]?.name || '', loadoutSummary: () => loadoutText() };
function loadoutText() {
  const L = loadout; return `${WEAPONS[L.primary].name} + ${WEAPONS[L.secondary].name} · ${MELEE[L.melee].name} · ${LETHALS[L.lethal].name} · ${TACTICALS[L.tactical].name} · ${L.streaks.map(s => STREAKS[s].name).join(' / ')}`;
}
function applyVolume() { sound.masterLevel = clamp(settings.volume, 0, 1) * 0.86; if (sfx.master) sfx.master.gain.value = sound.masterLevel; sound.enabled = settings.volume > 0.01; }

function openTitle() { S.name = 'title'; hud.show(false); menu.show(titleScreen(app)); }
function openMain(keep = false) { S.name = 'menu'; hud.show(false); attachBackdrop(); menu.show(mainScreen(app), keep); }
function openPause() {
  if (!match || S.name !== 'playing') return;
  S.name = 'paused'; releaseMouse(); hud.show(false); menu.show(pauseScreen(app));
}
function resumeMatch() {
  if (!match) return; ctl.consume(); menu.hide(); loadoutScreen.visible && loadoutScreen.close(false); S.name = 'playing'; hud.show(true); requestMouse();
}
function openSettings(fromPause) {
  const back = () => { writeJSON(SETTINGS_KEY, settings); if (fromPause) menu.show(pauseScreen(app), true); else menu.show(mainScreen(app), true); };
  menu.show(settingsScreen(app, back));
}
function openLoadout(fromPause) {
  menu.hide(); S.fromPause = !!fromPause;
  loadoutScreen.open(loadout, l => {
    loadout = l; saveLoadout(l);
    if (match) { match.player.loadout = l; if (S.mode === 'range') { match.respawn(match.player, true); } }
    if (S.fromPause) menu.show(pauseScreen(app), true); else menu.show(mainScreen(app), true);
  });
}
function bankXp() {
  if (match && !S.xpBanked) { S.xpBanked = true; profile = readJSON(PROFILE_KEY, profile); profile.xp = (profile.xp || 0) + Math.round(match.player.sessionXp || 0); writeJSON(PROFILE_KEY, profile); }
}
function endMatch() {
  if (!match) return;
  bankXp(); match.dispose(); match = null; hud.show(false); releaseMouse(); attachBackdrop(); vm.cancelAnim();
}

const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
async function deploy(modeId) {
  S.mode = modeId; S.name = 'loading'; menu.hide(); loadoutScreen.visible && loadoutScreen.close(false); hud.show(false);
  $('loading').classList.remove('hidden'); overlay.hide();
  await nextFrame(); await nextFrame();
  if (match) endMatch();
  try {
    const scene = new THREE.Scene(); if (env) { scene.environment = env; scene.environmentIntensity = 0.6; }
    const camera = new THREE.PerspectiveCamera(75, aspect, 0.06, 600);
    match = new Match({ scene, camera, sfx, sound, ui: hud, ctl, vm, settings, loadout, modeId, difficulty: settings.difficulty });
    S.xpBanked = false; S.resultsAt = 0;
    hud.bind(match); hud.show(true); S.name = 'playing';
    ctl.sprintLatch = false; ctl.sbToggle = false;
    requestMouse();
    window.__fl = { match, ctl, settings, hud, vm };
  } catch (e) { console.error(e); S.name = 'menu'; openMain(); }
  $('loading').classList.add('hidden');
}

// ---------------------------------------------------------------------------------------------------------------
// pointer lock
// ---------------------------------------------------------------------------------------------------------------
function requestMouse() { try { const p = canvas.requestPointerLock?.(); p?.catch?.(() => {}); } catch { /* needs a user gesture */ } }
function releaseMouse() { S.expectUnlock = true; try { document.exitPointerLock?.(); } catch { /* ignore */ } setTimeout(() => { S.expectUnlock = false; }, 300); }
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && S.name === 'playing' && !S.expectUnlock) openPause();    // Esc released the mouse: show the pause menu
});
document.addEventListener('visibilitychange', () => { if (document.hidden && S.name === 'playing') openPause(); });
addEventListener('blur', () => { if (S.name === 'playing' && !overlay.visible) openPause(); });
for (const ev of ['keydown', 'pointerdown', 'touchstart']) addEventListener(ev, () => { const first = !sfx.ctx; sfx.init(); if (first) applyVolume(); }, { passive: true });   // audio needs a gesture; apply the volume once (re-applying would cancel a flashbang's ducking)

// ---------------------------------------------------------------------------------------------------------------
// resize + adaptive resolution
// ---------------------------------------------------------------------------------------------------------------
function resize() {
  vw = innerWidth; vh = innerHeight; aspect = vw / vh;
  renderer.setPixelRatio(basePR * resScale); renderer.setSize(vw, vh, false);
  vm.resize(aspect); menuCam.aspect = aspect; menuCam.updateProjectionMatrix();
  if (match) { match.camera.aspect = aspect; match.camera.updateProjectionMatrix(); }
}
addEventListener('resize', resize); resize();
let ema = 16, perfT = 0;
function adapt(dtMs, dt) {
  ema = lerp(ema, dtMs, 0.04); perfT += dt;
  if (perfT < 1.5) return; perfT = 0;
  if (ema > 21 && resScale > 0.6) { resScale = Math.max(0.6, resScale - 0.1); resize(); }
  else if (ema < 12.8 && resScale < 1) { resScale = Math.min(1, resScale + 0.05); resize(); }
}

// ---------------------------------------------------------------------------------------------------------------
// frame
// ---------------------------------------------------------------------------------------------------------------
let last = performance.now(), lastErr = '';
function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = (now - last) / 1000, dt = clamp(rawDt, 0, 0.05); last = now;
  try { tick(dt, rawDt); } catch (e) { const msg = String((e && e.stack) || e); if (msg !== lastErr) { lastErr = msg; console.error(msg); } }
  try { render(dt); } catch (e) { const msg = String((e && e.stack) || e); if (msg !== lastErr) { lastErr = msg; console.error(msg); } }
  adapt(rawDt * 1000, dt);
}
function tick(dt, rawDt) {
  ctl.update(dt);
  if (ctl.home) { releaseMouse(); bankXp(); goHome(); return; }
  if (ctl.overlay) { overlay.toggle(); if (overlay.visible && S.name === 'playing') releaseMouse(); else if (!overlay.visible && S.name === 'playing') requestMouse(); }
  else if (overlay.visible && (ctl.back || ctl.pause)) { overlay.hide(); if (S.name === 'playing') requestMouse(); ctl.pause = false; ctl.back = false; }
  if (overlay.visible) overlay.update();

  switch (S.name) {
    case 'title':
      if (!overlay.visible && (ctl.anyPress && !ctl.overlay) && !ctl.home) { sfx.init(); applyVolume(); sound.ui('start'); openMain(); }
      break;
    case 'menu': case 'paused':
      if (!overlay.visible && !loadoutScreen.visible) menu.update(dt);
      if (loadoutScreen.visible) loadoutScreen.update(dt);
      if (S.name === 'paused' && ctl.pause && !overlay.visible && !loadoutScreen.visible && menu.visible && menu.screen?.cls === 'pause') resumeMatch();
      break;
    case 'playing':
      if (ctl.pause && !overlay.visible) { openPause(); break; }
      if (match && !overlay.visible) {
        match.update(dt, aspect, vh * basePR * resScale);
        hud.update(dt, match, aspect, vw, vh);
        if (match.over && !S.resultsAt) S.resultsAt = performance.now();
        if (match.over && S.resultsAt && performance.now() - S.resultsAt > 2600) showResults();
      }
      break;
    case 'results':
      if (!overlay.visible) menu.update(dt);
      break;
    default: break;
  }
}
function showResults() {
  if (S.name === 'results') return;
  S.name = 'results'; releaseMouse(); hud.show(false); bankXp();
  menu.show(resultsScreen(app, match.mode.getResults()));
}
function render(dt) {
  const inMatch = match && (S.name === 'playing' || S.name === 'paused' || S.name === 'results');
  renderer.setViewport(0, 0, vw, vh); renderer.setScissorTest(false);
  renderer.clear();
  if (inMatch) {
    renderer.render(match.scene, match.camera);
    if (S.name === 'playing' && match.player.alive && !match.player.scoped) { renderer.clearDepth(); renderer.render(vm.scene, vm.camera); }
  } else {
    menuAng += dt * 0.05; const r = 62; menuCam.position.set(Math.cos(menuAng) * r, 26 + Math.sin(menuAng * 0.7) * 5, Math.sin(menuAng) * r * 0.75); menuCam.lookAt(0, 3, 0);
    menuSky.position.copy(menuCam.position);
    renderer.render(menuScene, menuCam);
  }
  if (loadoutScreen.visible) loadoutScreen.renderPreview(renderer);
}

// ---------------------------------------------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------------------------------------------
applyVolume();
const qs = new URLSearchParams(location.search);
if (qs.has('diff') && DIFFICULTY[qs.get('diff')]) settings.difficulty = qs.get('diff');
openTitle();
requestAnimationFrame(frame);
setTimeout(buildBackdrop, 40);
if (qs.has('mode') && MODES[qs.get('mode')]) setTimeout(() => deploy(qs.get('mode')), 150);   // debug: skip the menus
// clicking the title screen starts the game too (a user gesture also unlocks audio)
menuEl.addEventListener('click', () => { if (S.name === 'title') { sfx.init(); applyVolume(); sound.ui('start'); openMain(); } });
return { S, frame, ctl, menu, hud, overlay, loadoutScreen, settings, get match() { return match; }, deploy, openMain, openPause, resumeMatch, renderer };
}

if (!globalThis.__FL_TEST__) boot();
