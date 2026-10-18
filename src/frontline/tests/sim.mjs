// Headless simulation: runs whole matches in Node with scripted input and a fake DOM.
import './fakedom.mjs';
import * as THREE from 'three';
import { Match } from '../match.js';
import { Controls } from '../controls.js';
import { Viewmodel } from '../viewmodel.js';
import { Hud } from '../hud.js';
import { Sfx } from '../../common/sfx.js';
import { Sound } from '../sound.js';
import { DEFAULT_SETTINGS, DEFAULT_LOADOUT, sanitizeLoadout, WEAPONS } from '../data.js';

export function makeEnv(modeId, opts = {}) {
  const settings = { ...DEFAULT_SETTINGS, difficulty: opts.difficulty || 'regular', shadows: false };
  const ctl = new Controls(settings);
  const sfx = new Sfx(); const sound = new Sound(sfx);
  const vm = new Viewmodel(); const hud = new Hud(document.getElementById('hud'), ctl);
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.06, 600);
  const loadout = sanitizeLoadout(opts.loadout || {});
  const match = new Match({ scene, camera, sfx, sound, ui: opts.ui || hud, ctl, vm, settings, loadout, modeId, difficulty: settings.difficulty });
  hud.bind(match);
  return { match, ctl, hud, vm, scene, camera, settings };
}

export function step(env, dt = 1 / 60, input = null) {
  const { match, ctl } = env;
  // clear one-frame edges, then apply the script
  for (const k of ['firePressed', 'fireReleased', 'adsPressed', 'adsReleased', 'jumpPressed', 'crouchPressed', 'crouchReleased', 'reloadPressed', 'reloadReleasedTap', 'switchPressed', 'meleeHold', 'inspect', 'yDouble', 'meleeQuick', 'lethalPressed', 'lethalReleased', 'tacticalPressed', 'tacticalReleased', 'modeSwitch', 'sprintPressed', 'sprintDouble', 'pause', 'scoreToggle']) ctl[k] = false;
  for (const k of ['fire', 'ads', 'sprintHeld', 'jump', 'crouchHeld', 'reloadHeld', 'lethalHeld', 'tacticalHeld']) ctl[k] = false;
  ctl.moveX = 0; ctl.moveY = 0; ctl.reloadHeldFor = 0; ctl.crouchHeldFor = 0;
  ctl.streak = [false, false, false]; ctl.selectSlot = -1; ctl.lookX = 0; ctl.lookY = 0;
  if (input) input(ctl, match);
  match.update(dt, 16 / 9);
  env.hud.update(dt, match, 16 / 9, 1280, 720);
  return match;
}
export function run(env, seconds, input = null, dt = 1 / 60) { const n = Math.round(seconds / dt); for (let i = 0; i < n; i++) step(env, dt, input); }

// ----------------------------------------------------------------------------------------------------------------
if (process.argv[1] && process.argv[1].endsWith('sim.mjs')) {
  const which = process.argv[2] || 'tdm', secs = +(process.argv[3] || 60);
  const env = makeEnv(which);
  const m = env.match;
  const t0 = performance.now();
  let frames = 0, worst = 0;
  const n = Math.round(secs * 60);
  for (let i = 0; i < n; i++) {
    const a = performance.now();
    step(env, 1 / 60, (ctl, match) => { ctl.moveY = 0; });
    const d = performance.now() - a; worst = Math.max(worst, d); frames++;
  }
  const ms = performance.now() - t0;
  console.log(`${which}: ${frames} frames, avg ${(ms / frames).toFixed(2)} ms/frame, worst ${worst.toFixed(1)} ms`);
  console.log('state', m.state, 'time', m.time.toFixed(1));
  console.log('rows', JSON.stringify(m.mode.rows().slice(0, 6)));
  if (m.mode.score) console.log('score', m.mode.score);
  console.log('bots alive', m.bots.filter(b => b.alive).length, 'player hp', m.player.hp.toFixed(0), 'alive', m.player.alive);
}
