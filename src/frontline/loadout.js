// Loadout screen: primary, secondary, melee, lethal, tactical, three scorestreaks and per-gun attachments, with live stat bars
// and a rotating 3D preview that updates as attachments change.
import * as THREE from 'three';
import { esc, clamp } from './util.js';
import {
  WEAPONS, PRIMARIES, SECONDARIES, WEAPON_CLASSES, MELEE, MELEES, LETHALS, TACTICALS, STREAKS, STREAK_LIST, SLOT_ATTS, allowedAtts, sanitizeLoadout,
  deriveWeapon, statBars, LOADOUT_KEY,
} from './data.js';
import { buildGun, buildKnife, buildGrenade } from './guns.js';
import { ICON, EQ_ICON } from './icons.js';
import { nav } from './menus.js';

const SLOT_LABEL = { optic: 'Optic', muzzle: 'Muzzle', mag: 'Magazine', stock: 'Stock' };

export function loadLoadout() {
  try { return sanitizeLoadout(JSON.parse(localStorage.getItem(LOADOUT_KEY) || '{}')); } catch { return sanitizeLoadout({}); }
}
export function saveLoadout(l) { try { localStorage.setItem(LOADOUT_KEY, JSON.stringify(l)); } catch { /* storage unavailable */ } }

export class LoadoutScreen {
  constructor(root, ctl, sound) {
    this.root = root; this.ctl = ctl; this.sound = sound; this.visible = false; this.sel = 0; this.rows = []; this.chooser = null; this.onDone = null; this.loadout = null;
    root.innerHTML = `<div class="lo-wrap">
      <div class="lo-left"><h1>LOADOUT</h1><div class="lo-list"></div><div class="lo-foot"></div></div>
      <div class="lo-right"><div class="lo-info"></div><div class="lo-prev"></div><div class="lo-attinfo"></div></div>
      <div class="lo-chooser hidden"><h2></h2><div class="lo-clist"></div></div></div>`;
    this.listEl = root.querySelector('.lo-list'); this.infoEl = root.querySelector('.lo-info'); this.prevEl = root.querySelector('.lo-prev'); this.attEl = root.querySelector('.lo-attinfo');
    this.footEl = root.querySelector('.lo-foot'); this.chEl = root.querySelector('.lo-chooser'); this.chList = root.querySelector('.lo-clist'); this.chTitle = root.querySelector('.lo-chooser h2');
    // preview scene
    this.scene = new THREE.Scene(); this.cam = new THREE.PerspectiveCamera(32, 1.6, 0.05, 20);
    this.scene.add(new THREE.HemisphereLight(0xdfeaff, 0x5a5448, 1.5)); const d = new THREE.DirectionalLight(0xfff2dc, 2.4); d.position.set(1.2, 1.6, 1.0); this.scene.add(d);
    const d2 = new THREE.DirectionalLight(0x8fb0ff, 0.9); d2.position.set(-1.5, 0.4, -1); this.scene.add(d2);
    this.pivot = new THREE.Group(); this.scene.add(this.pivot); this.model = null; this.modelKey = ''; this.t = 0; this.cache = new Map();
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 40), new THREE.MeshBasicMaterial({ color: 0x1a2231 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.18; this.scene.add(floor);
  }
  open(loadout, onDone, ctx = {}) {
    this.ctl.consume?.();
    this.loadout = sanitizeLoadout(JSON.parse(JSON.stringify(loadout))); this.onDone = onDone; this.ctx = ctx; this.visible = true; this.root.classList.remove('hidden'); this.chooser = null; this.chEl.classList.add('hidden');
    this.sel = 0; this.buildRows(); this.render();
  }
  close(save = true) { this.ctl.consume?.(); this.visible = false; this.root.classList.add('hidden'); if (save) { saveLoadout(this.loadout); this.onDone?.(this.loadout); } }

  // ---------------------------------------------------------------------------------------------------------
  buildRows() {
    const L = this.loadout, rows = [];
    const gun = (slot, label, list) => {
      const id = L[slot], def = WEAPONS[id];
      rows.push({ kind: 'gun', slot, label, value: () => WEAPONS[L[slot]].name, list, id });
      for (const k of Object.keys(SLOT_ATTS)) {
        const opts = allowedAtts(def, k); if (opts.length < 2) continue;
        rows.push({ kind: 'att', att: k, weaponSlot: slot, label: SLOT_LABEL[k], indent: true, opts, value: () => SLOT_ATTS[k][L.att[L[slot]][k]].name });
      }
    };
    gun('primary', 'Primary', PRIMARIES); gun('secondary', 'Secondary', SECONDARIES);
    rows.push({ kind: 'melee', label: 'Melee', value: () => MELEE[L.melee].name, opts: MELEES.map(m => m.id) });
    rows.push({ kind: 'lethal', label: 'Lethal', value: () => LETHALS[L.lethal].name, opts: Object.keys(LETHALS) });
    rows.push({ kind: 'tactical', label: 'Tactical', value: () => TACTICALS[L.tactical].name, opts: Object.keys(TACTICALS) });
    for (let i = 0; i < 3; i++) rows.push({ kind: 'streak', idx: i, label: `Scorestreak ${i + 1}`, value: () => `${STREAKS[L.streaks[i]].name} (${STREAKS[L.streaks[i]].cost})`, opts: STREAK_LIST.map(s => s.id) });
    rows.push({ kind: 'done', label: 'Done' });
    this.rows = rows;
  }
  cycle(row, dir) {
    const L = this.loadout;
    if (row.kind === 'gun') { const list = row.list, i = list.findIndex(w => w.id === L[row.slot]); L[row.slot] = list[(i + dir + list.length) % list.length].id; this.buildRows(); this.rebuilt = true; }
    else if (row.kind === 'att') { const w = L[row.weaponSlot], cur = L.att[w][row.att], i = row.opts.indexOf(cur); L.att[w][row.att] = row.opts[(i + dir + row.opts.length) % row.opts.length]; }
    else if (row.kind === 'melee' || row.kind === 'lethal' || row.kind === 'tactical') { const cur = L[row.kind], i = row.opts.indexOf(cur); L[row.kind] = row.opts[(i + dir + row.opts.length) % row.opts.length]; }
    else if (row.kind === 'streak') { const cur = L.streaks[row.idx], i = row.opts.indexOf(cur); L.streaks[row.idx] = row.opts[(i + dir + row.opts.length) % row.opts.length]; }
    this.sound.ui('ui');
  }

  // ---------------------------------------------------------------------------------------------------------
  render() {
    this.listEl.innerHTML = '';
    this.els = this.rows.map((r, i) => {
      const el = document.createElement('div'); el.className = `lo-row ${r.kind}${r.indent ? ' ind' : ''}${i === this.sel ? ' sel' : ''}`;
      el.innerHTML = r.kind === 'done' ? `<span class="lbl">Done</span>` : `<span class="lbl">${esc(r.label)}</span><span class="val"><i>◀</i> ${esc(r.value())} <i>▶</i></span>`;
      el.onmouseenter = () => { if (!this.chooser && this.sel !== i) { this.sel = i; this.refresh(); } };
      el.onclick = () => { this.sel = i; this.refresh(); this.press(); };
      this.listEl.appendChild(el); return el;
    });
    this.refresh();
  }
  refresh() {
    this.rows.forEach((r, i) => { const el = this.els[i]; if (!el) return; el.classList.toggle('sel', i === this.sel); if (r.kind !== 'done') { const v = el.querySelector('.val'); if (v) v.innerHTML = `<i>◀</i> ${esc(r.value())} <i>▶</i>`; } });
    this.footEl.innerHTML = this.chooser ? `<span>${nav(this.ctl, 'UP')}${nav(this.ctl, 'DOWN')} browse</span><span>${nav(this.ctl, 'A')} choose</span><span>${nav(this.ctl, 'B')} cancel</span>` : `<span>${nav(this.ctl, 'UP')}${nav(this.ctl, 'DOWN')} row</span><span>${nav(this.ctl, 'LEFT')}${nav(this.ctl, 'RIGHT')} change</span><span>${nav(this.ctl, 'A')} browse / done</span><span>${nav(this.ctl, 'B')} back</span>`;
    this.showInfo(this.chooser ? this.chooser.items[this.chooser.sel] : this.focusInfo());
  }
  focusInfo() {
    const r = this.rows[this.sel], L = this.loadout; if (!r) return null;
    if (r.kind === 'gun') return { type: 'gun', id: L[r.slot], att: L.att[L[r.slot]] };
    if (r.kind === 'att') { const w = L[r.weaponSlot]; return { type: 'gun', id: w, att: L.att[w], focus: r.att }; }
    if (r.kind === 'melee') return { type: 'melee', id: L.melee };
    if (r.kind === 'lethal') return { type: 'lethal', id: L.lethal };
    if (r.kind === 'tactical') return { type: 'tactical', id: L.tactical };
    if (r.kind === 'streak') return { type: 'streak', id: L.streaks[r.idx] };
    return null;
  }
  showInfo(inf) {
    if (!inf) { this.infoEl.innerHTML = '<p class="hint">Customise your weapons, equipment and scorestreaks, then choose <b>Done</b>.</p>'; this.attEl.innerHTML = ''; this.setModel(null); return; }
    let html = '', att = '';
    if (inf.type === 'gun') {
      const def = WEAPONS[inf.id], s = deriveWeapon(def, inf.att), bars = statBars(s);
      html = `<h2>${esc(def.name)}</h2><div class="cls">${esc(def.cls)} &middot; ${esc(def.ammoType)}</div><p>${esc(def.desc)}</p><div class="bars">${['Damage', 'Fire rate', 'Range', 'Control', 'Accuracy', 'Mobility'].map(k => `<div class="bar"><span>${k}</span><i><b style="width:${(bars[k] * 100).toFixed(0)}%"></b></i></div>`).join('')}</div>
        <div class="nums"><span>Mag <b>${s.mag}</b></span><span>Reserve <b>${def.reserve}</b></span><span>Aim time <b>${(s.ads * 1000).toFixed(0)} ms</b></span><span>Fire modes <b>${s.modes.map(m => m[0].toUpperCase() + m.slice(1)).join(' / ')}</b></span></div>`;
      const parts = [];
      for (const k of Object.keys(SLOT_ATTS)) { const a = SLOT_ATTS[k][inf.att[k]]; if (inf.att[k] !== (k === 'optic' ? (def.defaultOptic || 'iron') : k === 'mag' || k === 'stock' ? (k === 'mag' ? 'std' : 'std') : 'none')) parts.push(`<b>${esc(a.name)}</b>: ${esc(a.desc)}`); }
      att = parts.length ? `<div class="atts">${parts.join('<br>')}</div>` : `<div class="atts dim">No attachments equipped. Change Optic, Muzzle, Magazine and Stock with ${nav(this.ctl, 'LEFT')} ${nav(this.ctl, 'RIGHT')}.</div>`;
      this.setModel({ kind: 'gun', id: inf.id, att: inf.att });
    } else if (inf.type === 'melee') { const d = MELEE[inf.id]; html = `<h2>${esc(d.name)}</h2><div class="cls">Melee</div><p>${esc(d.desc)}</p><div class="nums"><span>Reach <b>${d.reach} m</b></span><span>Lunge <b>${d.lunge} m</b></span><span>Swing <b>${(d.swing * 1000) | 0} ms</b></span><span>Speed <b>${Math.round(d.speed * 100)}%</b></span></div>${d.ranged ? '<p class="note">Fires its blade with fire; walk over it to recover it.</p>' : ''}<p class="note">Quick melee (R3) is a one-hit kill. Hold Y to equip the knife; fire = slash, aim = lunge.</p>`; this.setModel({ kind: 'knife', id: inf.id }); }
    else if (inf.type === 'lethal' || inf.type === 'tactical') { const d = (inf.type === 'lethal' ? LETHALS : TACTICALS)[inf.id]; html = `<h2>${esc(d.name)}</h2><div class="cls">${inf.type === 'lethal' ? 'Lethal (R1)' : 'Tactical (L1)'} &middot; x${d.count}</div><p>${esc(d.desc)}</p><div class="eqico">${EQ_ICON[inf.id] || ''}</div>`; this.setModel({ kind: 'nade', id: inf.id === 'tknife' ? 'knife' : inf.id }); }
    else if (inf.type === 'streak') { const d = STREAKS[inf.id]; html = `<h2>${esc(d.name)}</h2><div class="cls">Scorestreak &middot; ${d.cost} kills</div><p>${esc(d.desc)}</p><div class="stico" style="color:${d.color}">${ICON[inf.id]}</div>`; this.setModel(null); }
    this.infoEl.innerHTML = html; this.attEl.innerHTML = att;
  }
  // weapon-class chooser -------------------------------------------------------------------------------------
  openChooser(row) {
    const list = row.list, items = [];
    for (const cls of WEAPON_CLASSES) { const ws = list.filter(w => w.cls === cls); if (!ws.length) continue; items.push({ header: cls }); for (const w of ws) items.push({ type: 'gun', id: w.id, att: this.loadout.att[w.id], pick: w.id }); }
    const cur = list.findIndex(w => w.id === this.loadout[row.slot]);
    const sel = Math.max(0, items.findIndex(i => i.pick === this.loadout[row.slot]));
    this.chooser = { row, items, sel };
    this.chTitle.textContent = row.label; this.chEl.classList.remove('hidden'); this.renderChooser();
  }
  renderChooser() {
    const c = this.chooser; this.chList.innerHTML = '';
    c.els = c.items.map((it, i) => {
      const el = document.createElement('div');
      if (it.header) { el.className = 'lo-ch hd'; el.textContent = it.header; }
      else { const d = WEAPONS[it.id]; el.className = 'lo-ch' + (i === c.sel ? ' sel' : ''); el.innerHTML = `<span>${esc(d.name)}</span><small>${esc(d.ammoType)}</small>`; el.onmouseenter = () => { c.sel = i; this.chooserMove(0); }; el.onclick = () => { c.sel = i; this.chooserPick(); }; }
      this.chList.appendChild(el); return el;
    });
    this.refresh();
  }
  chooserMove(dir) {
    const c = this.chooser, n = c.items.length; let i = c.sel;
    if (dir) { do { i = (i + dir + n) % n; } while (c.items[i].header); c.sel = i; this.sound.ui('ui'); }
    c.els.forEach((el, k) => { if (!c.items[k].header) el.classList.toggle('sel', k === c.sel); });
    c.els[c.sel]?.scrollIntoView?.({ block: 'nearest' });
    this.showInfo(c.items[c.sel]);
  }
  chooserPick() {
    const c = this.chooser, it = c.items[c.sel]; if (!it?.pick) return;
    this.loadout[c.row.slot] = it.pick; this.chooser = null; this.chEl.classList.add('hidden'); this.buildRows(); this.sound.ui('select'); this.render();
  }
  press() {
    const r = this.rows[this.sel];
    if (r.kind === 'done') { this.sound.ui('select'); this.close(true); }
    else if (r.kind === 'gun') { this.sound.ui('select'); this.openChooser(r); }
    else { this.cycle(r, 1); if (this.rebuilt) { this.rebuilt = false; this.render(); } else this.refresh(); }
  }

  // ---------------------------------------------------------------------------------------------------------
  update(dt) {
    if (!this.visible) return;
    const c = this.ctl; this.t += dt;
    if (this.chooser) {
      if (c.navY) this.chooserMove(c.navY);
      if (c.confirm) this.chooserPick();
      if (c.back) { this.chooser = null; this.chEl.classList.add('hidden'); this.sound.ui('back'); this.refresh(); }
      return;
    }
    const n = this.rows.length;
    if (c.navY) { this.sel = (this.sel + c.navY + n) % n; this.sound.ui('ui'); this.refresh(); this.els[this.sel]?.scrollIntoView?.({ block: 'nearest' }); }
    const r = this.rows[this.sel];
    if (c.navX && r.kind !== 'done') { this.cycle(r, c.navX); if (this.rebuilt) { this.rebuilt = false; this.render(); } else this.refresh(); }
    if (c.confirm) this.press();
    if (c.back) { this.sound.ui('back'); this.close(true); }
    if (c.pause) this.close(true);
  }

  // ---------------------------------------------------------------------------------------------------------
  setModel(spec) {
    const key = spec ? JSON.stringify(spec) : '';
    if (key === this.modelKey) return; this.modelKey = key;
    if (this.model) { this.pivot.remove(this.model); this.model = null; }
    if (!spec) return;
    let m = this.cache.get(key);
    if (!m) {
      if (spec.kind === 'gun') m = buildGun(spec.id, spec.att);
      else if (spec.kind === 'knife') m = buildKnife(spec.id);
      else m = spec.id === 'knife' ? buildKnife('combat') : buildGrenade(spec.id);
      if (this.cache.size > 60) this.cache.clear();
      this.cache.set(key, m);
    }
    this.model = m; this.pivot.add(m);
    // centre the model on the pivot (reset first: cached models are reused) and remember how big it is
    m.position.set(0, 0, 0); this.pivot.rotation.set(0, -Math.PI / 2, 0); this.pivot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
    m.position.sub(centre.sub(this.pivot.position)); m.updateMatrixWorld(true);
    this.fit = Math.max(size.x, size.z, size.y * 1.6, 0.16) * (spec.kind === 'nade' && spec.id !== 'knife' ? 3.4 : 1);
  }
  /** Draw the preview into the DOM rect of .lo-prev using scissor + viewport. */
  renderPreview(renderer) {
    if (!this.visible || !this.model) return;
    const r = this.prevEl.getBoundingClientRect(); if (r.width < 8 || r.height < 8) return;
    const size = renderer.getSize(this._sz || (this._sz = new THREE.Vector2()));
    const x = r.left, y = size.y - r.bottom, w = r.width, h = r.height;
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    const hf = Math.tan(this.cam.fov * Math.PI / 360) * this.cam.aspect, vf = Math.tan(this.cam.fov * Math.PI / 360);
    const dist = Math.max(this.fit * 0.62 / hf, this.fit * 0.45 / vf) + 0.12;
    this.pivot.rotation.y = -Math.PI / 2 + Math.sin(this.t * 0.6) * 0.5;
    this.cam.position.set(0.0, 0.1 + this.fit * 0.06, dist); this.cam.lookAt(0, 0, 0);
    const old = renderer.getClearColor(this._cc || (this._cc = new THREE.Color())), oa = renderer.getClearAlpha();
    renderer.setScissorTest(true); renderer.setViewport(x, y, w, h); renderer.setScissor(x, y, w, h);
    renderer.setClearColor(0x161d2a, 0.92); renderer.clear(true, true, false);
    renderer.render(this.scene, this.cam);
    renderer.setScissorTest(false); renderer.setViewport(0, 0, size.x, size.y); renderer.setClearColor(old, oa);
  }
}
