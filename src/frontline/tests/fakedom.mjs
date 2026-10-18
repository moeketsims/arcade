// Minimal fake DOM for running the game's non-rendering code in Node. Import this FIRST in test scripts.
const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };

const sink = () => new Proxy(function () {}, {
  get(t, p) { if (p === Symbol.toPrimitive) return () => 0; if (p === 'then') return undefined; if (p === Symbol.iterator) return function* () {}; if (p === 'length') return 0; return sink(); },
  apply() { return sink(); }, construct() { return sink(); }, set() { return true; },
});

class ClassList {
  constructor() { this.s = new Set(); }
  add(...c) { c.forEach(x => this.s.add(x)); } remove(...c) { c.forEach(x => this.s.delete(x)); } contains(c) { return this.s.has(c); }
  toggle(c, f) { const on = f === undefined ? !this.s.has(c) : !!f; if (on) this.s.add(c); else this.s.delete(c); return on; }
}
export class FakeEl {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.style = { setProperty(k, v) { this[k] = v; } }; this.classList = new ClassList(); this.children = []; this.dataset = {}; this._q = new Map(); this.innerHTML = ''; this.textContent = ''; this.className = '';
    this.width = 300; this.height = 150; this.offsetWidth = 100; this.clientWidth = 100; this.clientHeight = 100; this.parentNode = null; this.onclick = null; this.onmouseenter = null;
    this.value = '';
  }
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  get firstElementChild() { return this._fc || (this._fc = new FakeEl('i')); }
  get lastElementChild() { return this._lc || (this._lc = new FakeEl('i')); }
  remove() { }
  addEventListener() { } removeEventListener() { }
  querySelector(sel) { if (!this._q.has(sel)) this._q.set(sel, new FakeEl('div')); return this._q.get(sel); }
  querySelectorAll(sel) { return [0, 1, 2].map(i => this.querySelector(sel + i)); }
  getContext() { return sink(); }
  getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }; }
  setAttribute() { } scrollIntoView() { } focus() { } requestPointerLock() { return Promise.resolve(); }
  get firstChild() { return this.children[0] || null; }
}
const doc = new FakeEl('document');
doc.body = new FakeEl('body'); doc.pointerLockElement = null; doc.hidden = false;
doc.createElement = t => new FakeEl(t);
doc.createElementNS = (ns, t) => new FakeEl(t);
doc.getElementById = id => { if (!doc._ids) doc._ids = new Map(); if (!doc._ids.has(id)) doc._ids.set(id, new FakeEl('div')); return doc._ids.get(id); };
doc.exitPointerLock = () => { };
globalThis.document = doc;
globalThis.window = globalThis;
globalThis.addEventListener = () => { }; globalThis.removeEventListener = () => { };
globalThis.innerWidth = 1280; globalThis.innerHeight = 720; globalThis.devicePixelRatio = 1;
globalThis.requestAnimationFrame = fn => setTimeout(() => fn(performance.now()), 16);
globalThis.location = { search: '', href: '' };
try { Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [], userAgent: 'node' }, configurable: true }); } catch { /* already defined */ }
export { sink };
