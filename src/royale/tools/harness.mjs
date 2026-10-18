// Headless harness: fake DOM + fake renderer so the whole game can be simulated in Node.
import * as THREE from 'three';

const any = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'length' ? 0 : any), apply: () => any, construct: () => any, set: () => true });
const els = new Map();
function makeEl(id = '') {
  const store = { classList: { _s: new Set(), add(...c) { c.forEach(x => this._s.add(x)); }, remove(...c) { c.forEach(x => this._s.delete(x)); }, toggle(c, on) { const has = this._s.has(c); const want = on === undefined ? !has : on; want ? this._s.add(c) : this._s.delete(c); return want; }, contains(c) { return this._s.has(c); } }, style: {}, children: [], dataset: {}, _attrs: {}, id, width: 360, height: 360, offsetWidth: 100, offsetHeight: 100, innerHTML: '', textContent: '', className: '', value: '' };
  let el = null; el = new Proxy(store, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'getContext') return () => any;
      if (k === 'appendChild') return c => { t.children.push(c); try { c.__parent = t; } catch (e) { /* ignore */ } return c; };
      if (k === 'firstChild') return t.children[0];
      if (k === 'removeChild') return c => { const i = t.children.indexOf(c); if (i >= 0) t.children.splice(i, 1); return c; };
      if (k === 'remove') return () => { const p = t.__parent; if (p) { const i = p.children.indexOf(el); if (i >= 0) p.children.splice(i, 1); } };
      if (k === 'setAttribute') return (a, v) => { t._attrs[a] = v; };
      if (k === 'getAttribute') return a => t._attrs[a];
      if (k === 'querySelector') return sel => makeEl(sel);
      if (k === 'querySelectorAll') return () => [];
      if (k === 'addEventListener' || k === 'removeEventListener') return () => {};
      if (k === 'getBoundingClientRect') return () => ({ left: 0, top: 0, width: 100, height: 100 });
      if (k === 'requestPointerLock') return () => {};
      if (k === Symbol.toPrimitive) return () => '';
      return undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return el;
}
let LISTENERS = {};
export function setupDom(search = '') {
  const g = globalThis;
  g.__ROYALE_NO_BOOT__ = true; g.__ROYALE_DEBUG__ = true;
  g.window = g; g.innerWidth = 1280; g.innerHeight = 720; g.devicePixelRatio = 1;
  g.location = { search, href: 'http://127.0.0.1:5173/royale.html' };
  g.document = { getElementById: id => { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); }, createElement: tag => makeEl(tag), createElementNS: (ns, tag) => makeEl(tag), body: makeEl('body'), pointerLockElement: null, exitPointerLock() {}, addEventListener() {}, querySelector: () => makeEl('q') };
  const listeners = LISTENERS = {}; g.addEventListener = (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); }; g.removeEventListener = () => {};
  g.requestAnimationFrame = () => 0; g.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
  g.localStorage = { getItem: () => null, setItem() {} };
  try { Object.defineProperty(g, 'navigator', { value: { getGamepads: () => [], userAgent: 'node' }, configurable: true }); } catch (e) { /* already defined */ }
  g.AudioContext = undefined; g.webkitAudioContext = undefined;
  return listeners;
}
export function fakeRenderer() {
  return { setPixelRatio() {}, setSize() {}, render() { this.frames = (this.frames || 0) + 1; }, shadowMap: {}, info: { render: { calls: 0, triangles: 0 } }, getPixelRatio: () => 1, domElement: makeEl('canvas') };
}
export async function makeGame(search = '', opts = {}) {
  const listeners = setupDom(search);
  const { Game } = await import('../main.js');
  const game = new Game({ renderer: fakeRenderer(), opts });
  game.sfx.init = () => {}; // no audio in Node
  await game.init();
  return { game, listeners };
}
/** Hold/release keyboard / mouse codes by dispatching the same events a browser would. */
const fire = (type, ev) => (LISTENERS[type] || []).forEach(fn => fn({ preventDefault() {}, repeat: false, ...ev }));
export const press = (game, ...codes) => codes.forEach(c => {
  if (c.startsWith('Mouse')) fire('mousedown', { button: +c.slice(5) }); else if (c === 'WheelUp' || c === 'WheelDown') fire('wheel', { deltaY: c === 'WheelUp' ? -1 : 1 }); else fire('keydown', { code: c });
});
export const release = (game, ...codes) => codes.forEach(c => { if (c.startsWith('Mouse')) fire('mouseup', { button: +c.slice(5) }); else if (c.startsWith('Wheel')) { /* wheel has no release */ } else fire('keyup', { code: c }); });
/** tap = press for a short moment then release */
export function tap(game, code, seconds = 0.06) { press(game, code); step(game, seconds); release(game, code); }
export function step(game, seconds, dt = 1 / 60, each = null) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) { game.frame(dt); if (each) each(i, i * dt); }
}
export { THREE };
