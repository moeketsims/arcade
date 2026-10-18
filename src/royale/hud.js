// HUD: bars, hotbar with weapon silhouettes, minimap, compass, prompts, feed, damage numbers, hit markers.
import * as THREE from 'three';
import { ITEMS } from './items.js';
import { RARITY, MATS } from './config.js';
import { weaponModel } from './models.js';

const $ = id => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const _v = new THREE.Vector3();

// ---------- weapon silhouette icons (side view of the 3D model) ----------
const iconCache = new Map();
export function iconCanvas(id, rarity = 0) {
  const key = id + '|' + rarity; let cv = iconCache.get(key); if (cv) return cv;
  const model = weaponModel(id, rarity); model.updateMatrixWorld(true);
  const tris = []; let minZ = 1e9, maxZ = -1e9, minY = 1e9, maxY = -1e9;
  const sc = model.userData.hold === 'bow' ? 1 : 1;
  model.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry, pos = g.attributes.position, col = g.attributes.color, idx = g.index, nrm = g.attributes.normal;
    const em = o.material.emissive ? o.material.emissive : null, isAcc = o.name === 'acc', isGlow = o.name === 'glow';
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2, pts = [];
      for (const k of [ia, ib, ic]) { _v.set(pos.getX(k), pos.getY(k), pos.getZ(k)).applyMatrix4(o.matrixWorld); pts.push([_v.z, _v.y, _v.x]); minZ = Math.min(minZ, _v.z); maxZ = Math.max(maxZ, _v.z); minY = Math.min(minY, _v.y); maxY = Math.max(maxY, _v.y); }
      let r = 0.5, gg = 0.5, b = 0.5; if (col) { r = (col.getX(ia) + col.getX(ib) + col.getX(ic)) / 3; gg = (col.getY(ia) + col.getY(ib) + col.getY(ic)) / 3; b = (col.getZ(ia) + col.getZ(ib) + col.getZ(ic)) / 3; }
      if (isAcc) { const c = new THREE.Color(RARITY[rarity].color); r = c.r; gg = c.g; b = c.b; }
      const nx = nrm ? Math.abs(nrm.getX(ia)) : 0.5, shade = 0.8 + 0.35 * nx;
      tris.push({ pts, x: (pts[0][2] + pts[1][2] + pts[2][2]) / 3, c: [r, gg, b], shade: isAcc || isGlow ? 1.25 : shade });
    }
  });
  tris.sort((a, b) => b.x - a.x);
  const W = 132, H = 66; cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
  const w = maxZ - minZ, h = maxY - minY, s = Math.min((W - 8) / Math.max(w, 0.01), (H - 8) / Math.max(h, 0.01)), ox = (W - w * s) / 2, oy = (H - h * s) / 2;
  const toS = c2 => c2 < 0 ? 0 : c2 > 1 ? 255 : Math.round(Math.pow(c2, 1 / 2.2) * 255);
  for (const t of tris) {
    c.beginPath(); t.pts.forEach((p, i) => { const x = ox + (p[0] - minZ) * s, y = H - (oy + (p[1] - minY) * s); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath();
    c.fillStyle = `rgb(${toS(t.c[0] * t.shade)},${toS(t.c[1] * t.shade)},${toS(t.c[2] * t.shade)})`; c.fill();
    c.strokeStyle = c.fillStyle; c.lineWidth = 0.6; c.stroke();
  }
  iconCache.set(key, cv); return cv;
}

export class Hud {
  constructor() {
    this.el = {}; for (const id of ['hud', 'compass', 'minimap', 'aliveP', 'killsP', 'stormInfo', 'feed', 'crosshair', 'hitmarker', 'prompt', 'progress', 'busInfo', 'buildInfo', 'shieldBar', 'hpBar', 'hotbar', 'mats', 'weapon', 'hints', 'hudBanner', 'hudToast', 'locLabel', 'scope', 'stormTint', 'hurtFlash', 'fx2d', 'mouseHint']) this.el[id] = $(id);
    this.cmp = this.el.compass.getContext('2d'); this.mm = this.el.minimap.getContext('2d'); this.fx = this.el.fx2d.getContext('2d');
    this.map = null; this.popups = []; this.numbers = []; this.bars = new Map(); this.hurts = []; this.feedItems = []; this.toastT = 0; this.bannerT = 0; this.last = {}; this.slotEls = [];
    this.pad = null; this.resize(); addEventListener('resize', () => this.resize());
    const hb = this.el.hotbar; hb.innerHTML = '';
    for (let i = 0; i < 6; i++) { const s = document.createElement('div'); s.className = 'slot empty'; s.innerHTML = `<div class="rbar"></div><span class="num">${i + 1}</span><canvas width="132" height="66"></canvas><span class="nm"></span><span class="cnt"></span>`; hb.appendChild(s); this.slotEls.push({ el: s, cv: s.querySelector('canvas'), nm: s.querySelector('.nm'), cnt: s.querySelector('.cnt'), rb: s.querySelector('.rbar'), sig: '' }); }
    this.matEls = MATS.map((m, i) => { const d = document.createElement('div'); d.className = 'mat'; d.innerHTML = `<i style="background:${m.css}"></i><span>0</span>`; this.el.mats.appendChild(d); return { d, s: d.querySelector('span') }; });
    this.set = (key, el, html) => { if (this.last[key] !== html) { this.last[key] = html; el.innerHTML = html; } };
  }
  resize() { const dpr = Math.min(2, devicePixelRatio || 1), c = this.el.fx2d; c.width = Math.floor(innerWidth * dpr); c.height = Math.floor(innerHeight * dpr); this.dpr = dpr; this.W = innerWidth; this.H = innerHeight; }
  show(on) { this.el.hud.classList.toggle('hidden', !on); this.el.fx2d.classList.toggle('hidden', !on); }
  setMap(rgba, size) { const cv = document.createElement('canvas'); cv.width = cv.height = size; cv.getContext('2d').putImageData(new ImageData(rgba, size, size), 0, 0); this.map = cv; this.mapSize = size; }

  // ---------- events ----------
  location(name) { const l = this.el.locLabel; l.textContent = name; l.classList.add('show'); this.locT = 3.2; }
  toast(text, secs = 1.6) { const t = this.el.hudToast; t.textContent = text; t.classList.add('show'); this.toastT = secs; }
  banner(title, sub = '', secs = 2.6) { const b = this.el.hudBanner; b.innerHTML = `${sub ? `<small>${sub}</small>` : ''}${title}`; b.classList.add('show'); this.bannerT = secs; }
  feed(html, cls = '') { const d = document.createElement('div'); d.className = 'feeditem ' + cls; d.innerHTML = html; this.el.feed.appendChild(d); this.feedItems.push({ d, t: 5.5 }); while (this.feedItems.length > 6) this.feedItems.shift().d.remove(); }
  hitmarker(head = false, kill = false) { const h = this.el.hitmarker; h.className = ''; void h.offsetWidth; h.className = 'show' + (kill ? ' kill' : head ? ' head' : ''); }
  popup(text, pos, color = '#fff') { this.popups.push({ x: pos.x, y: pos.y + 0.6, z: pos.z, text, color, t: 0, life: 1.1 }); if (this.popups.length > 12) this.popups.shift(); }
  number(pos, amount, kind) { this.numbers.push({ x: pos.x + (Math.random() - 0.5) * 0.4, y: pos.y + 0.3, z: pos.z + (Math.random() - 0.5) * 0.4, text: String(Math.round(amount)), kind, t: 0, life: 0.95, dx: (Math.random() - 0.5) * 22 }); if (this.numbers.length > 48) this.numbers.shift(); }
  enemyBar(f) { this.bars.set(f, 2.4); }
  hurt(attackerPos, dmg) { this.hurts.push({ pos: attackerPos ? attackerPos.clone() : null, t: 0 }); const h = this.el.hurtFlash; h.style.transition = 'none'; h.style.opacity = Math.min(0.9, 0.35 + dmg / 80); void h.offsetWidth; h.style.transition = 'opacity .5s'; h.style.opacity = 0; if (this.hurts.length > 6) this.hurts.shift(); }

  // ---------- per-frame ----------
  update(c) {
    const { p, pad, dt } = c, g = b => pad.glyph(b), E = this.el, gx = pad.usingPad ? pad.glyph('X') : '<kbd>E</kbd>';
    if (this.locT > 0 && (this.locT -= dt) <= 0) E.locLabel.classList.remove('show');
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) E.hudToast.classList.remove('show');
    if (this.bannerT > 0 && (this.bannerT -= dt) <= 0) E.hudBanner.classList.remove('show');
    for (let i = this.feedItems.length - 1; i >= 0; i--) { const it = this.feedItems[i]; if ((it.t -= dt) <= 0) { it.d.remove(); this.feedItems.splice(i, 1); } }
    // bars
    const hp = Math.max(0, Math.ceil(p.hp)), sh = Math.max(0, Math.ceil(p.shield));
    E.hpBar.querySelector('.fill').style.width = hp + '%'; E.shieldBar.querySelector('.fill').style.width = sh + '%';
    this.set('hpt', E.hpBar.querySelector('span'), hp); this.set('sht', E.shieldBar.querySelector('span'), sh);
    E.hpBar.classList.toggle('low', hp <= 30);
    // top-right stats
    this.set('alive', E.aliveP, `<b>${c.alive}</b> left`); this.set('kills', E.killsP, `<b>${p.kills}</b> elims`);
    const st = c.storm;
    if (st && st.active) {
      const tl = Math.max(0, Math.ceil(st.timeLeft)), mm = Math.floor(tl / 60), ss = String(tl % 60).padStart(2, '0');
      this.set('storm', E.stormInfo, st.state === 'final' ? 'Storm closed' : `${st.label} <b>${mm}:${ss}</b>`); E.stormInfo.classList.toggle('danger', c.outside);
    } else this.set('storm', E.stormInfo, c.state === 'bus' ? 'Battle Bus' : '');
    // crosshair / scope
    const def = p.def, gun = def && def.type === 'gun', scoped = gun && def.scope && c.adsT > 0.85, building = p.buildMode;
    E.scope.classList.toggle('hidden', !scoped); E.scope.classList.toggle('dotonly', scoped && def.scope === 1);
    const showCross = p.state === 'ground' && !scoped && p.alive && (gun || building || (def && def.type !== 'gun')) && !(c.adsT > 0.85 && def && def.zoom >= 6);
    E.crosshair.classList.toggle('hide', !showCross); E.crosshair.classList.toggle('build', building);
    if (showCross) {
      const pxPerDeg = this.H / c.fov, spread = building ? 0 : gun ? p.spreadDeg() : 1.5, gap = 5 + spread * pxPerDeg * 0.9; const cr = E.crosshair;
      if (Math.abs((this.lastGap ?? -1) - gap) > 0.4) { this.lastGap = gap; cr.querySelector('.t').style.transform = `translateY(${-gap - 9}px)`; cr.querySelector('.b').style.transform = `translateY(${gap}px)`; cr.querySelector('.l').style.transform = `translateX(${-gap - 9}px)`; cr.querySelector('.r').style.transform = `translateX(${gap}px)`; }
    }
    // hotbar
    for (let i = 0; i < 6; i++) {
      const s = p.inv.slots[i], se = this.slotEls[i], sel = i === p.cur && !p.buildMode;
      const cnt = s ? (ITEMS[s.id].type === 'gun' ? s.mag : (ITEMS[s.id].type === 'med' || ITEMS[s.id].type === 'throw' || ITEMS[s.id].type === 'throwknife' ? s.n : '')) : '';
      const sig = s ? `${s.id}|${s.rarity}|${cnt}|${sel}` : `-|${sel}`;
      if (sig !== se.sig) {
        se.sig = sig; se.el.classList.toggle('sel', sel); se.el.classList.toggle('empty', !s);
        const cx = se.cv.getContext('2d'); cx.clearRect(0, 0, 132, 66);
        if (s) { const d = ITEMS[s.id], col = RARITY[s.rarity].css; se.el.style.borderColor = col; se.rb.style.background = col; se.el.style.background = `linear-gradient(180deg, ${col}33, rgba(12,14,30,.88))`; cx.drawImage(iconCanvas(s.id, s.rarity), 0, 0); se.nm.textContent = d.name; se.cnt.textContent = cnt; }
        else { se.el.style.borderColor = 'rgba(255,255,255,.2)'; se.el.style.background = ''; se.rb.style.background = 'none'; se.nm.textContent = ''; se.cnt.textContent = ''; }
      }
    }
    // materials + weapon readout
    for (let m = 0; m < 3; m++) { this.matEls[m].s.textContent = p.inv.mats[m]; this.matEls[m].d.classList.toggle('sel', p.buildMat === m && building); }
    const it = p.item; let wh = '';
    if (building) wh = `<div class="wn">BUILD · ${MATS[p.buildMat].name}</div>`;
    else if (it) { const d = ITEMS[it.id], col = RARITY[it.rarity].css; if (d.type === 'gun') { const res = p.inv.ammo[d.ammo]; wh = `<div class="wn" style="color:${col}">${d.name}</div><div class="wa ${p.reloading ? 'rel' : it.mag <= 0 ? 'empty' : ''}">${p.reloading ? 'RELOADING' : it.mag}${p.reloading ? '' : ` <small>/ ${res}</small>`}</div>`; } else wh = `<div class="wn" style="color:${col}">${d.name}${it.n > 1 ? ' ×' + it.n : ''}</div>`; }
    this.set('weapon', E.weapon, wh);
    // progress bar (reload / use / interact / charge)
    let prog = -1, plabel = '';
    if (p.using) { prog = p.useT; plabel = ITEMS[p.using.id].name; } else if (p.interactT > 0 && p.interactNeed) { prog = p.interactT / p.interactNeed; plabel = 'Opening'; } else if (p.reloading && p.reloadDur > 0.8) { prog = p.reloadProg ?? 0; plabel = 'Reloading'; }
    E.progress.classList.toggle('hidden', prog < 0); if (prog >= 0) { E.progress.querySelector('.fill').style.width = clamp(prog, 0, 1) * 100 + '%'; this.set('plabel', E.progress.querySelector('span'), plabel); }
    // interaction prompt
    const t = c.target; let ph = '';
    if (c.state === 'bus') ph = '';
    else if (t && p.state === 'ground' && !p.using) ph = t.kind === 'chest' ? `${gx} Hold to open chest` : `${gx} Hold to pick up <b style="color:${RARITY[t.item.rarity].css}">${t.label}</b>${t.item && ITEMS[t.item.id].type === 'gun' ? `<small>${RARITY[t.item.rarity].name} ${ITEMS[t.item.id].cls}</small>` : ''}`;
    E.prompt.classList.toggle('hidden', !ph); this.set('prompt', E.prompt, ph);
    // bus / skydive info
    let bi = '';
    if (c.state === 'bus') bi = `Ready to drop?<small>${g('A')} Jump out of the bus · ${c.busLeft} m of route left</small>`;
    else if (p.state === 'free') bi = `Skydiving<small>Altitude ${Math.max(0, Math.round(p.heightAboveGround()))} m · ${g('A')} open glider · push forward to dive</small>`;
    else if (p.state === 'glide') bi = `Gliding<small>Altitude ${Math.max(0, Math.round(p.heightAboveGround()))} m · steer with the left stick</small>`;
    E.busInfo.classList.toggle('hidden', !bi); this.set('bus', E.busInfo, bi);
    // build info
    let bh = '';
    if (building) { const pro = pad.usingPad; const P = [['wall', pro ? 'R2' : 'Z', 'Wall'], ['floor', pro ? 'R1' : 'X', 'Floor'], ['ramp', pro ? 'L2' : 'C', 'Ramp'], ['roof', pro ? 'L1' : 'V', 'Roof']]; bh = `<span class="tag">BUILD</span>` + P.map(([k, b, n]) => `<span class="piece ${p.buildPiece === k ? 'sel' : ''}">${pro ? g(b) : `<kbd>${b}</kbd>`} ${n}</span>`).join('') + `<span class="piece">${g('RIGHT')} Material</span>`; }
    E.buildInfo.classList.toggle('hidden', !building); this.set('build', E.buildInfo, bh);
    // contextual hints
    let hints = [];
    if (c.state === 'bus') hints = [[g('A'), 'Jump']]; else if (p.state === 'free' || p.state === 'glide') hints = [[g('A'), 'Glider'], ['L-stick', 'Steer']];
    else if (building) hints = [[g('B'), 'Exit build'], [g('Y'), 'Pickaxe'], [g('UP'), 'Heal']];
    else hints = [[g('R2'), 'Fire'], [g('L2'), 'Aim'], [g('B'), 'Build'], [pad.usingPad ? g('X') : '<kbd>R</kbd>', 'Reload'], [gx, 'Hold: open / pick up'], [g('Y'), 'Pickaxe'], [g('UP'), 'Heal'], [g('DOWN'), 'Grenade']].slice(0, c.hintCount ?? 7);
    this.set('hints', E.hints, c.showHints ? hints.map(([k, v]) => `<div>${k} ${v}</div>`).join('') : '');
    E.mouseHint.classList.toggle('hidden', !(c.needMouse));
    E.stormTint.style.opacity = c.stormTint; this.drawMinimap(c); this.drawCompass(c); this.draw2d(c);
  }

  drawCompass(c) {
    const cx = this.cmp, W = 720, H = 44, yaw = c.yaw; cx.clearRect(0, 0, W, H);
    const bearing = 180 - yaw * 180 / Math.PI, span = 150, px = W / span; cx.font = 'bold 15px "Segoe UI", sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillStyle = 'rgba(10,12,30,.55)'; cx.fillRect(0, 8, W, 28);
    const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    for (let a = Math.floor((bearing - span / 2) / 15) * 15; a <= bearing + span / 2; a += 15) {
      const x = W / 2 + (a - bearing) * px, m = ((a % 360) + 360) % 360, nm = names[m];
      cx.fillStyle = nm ? '#fff' : 'rgba(255,255,255,.65)'; cx.fillRect(x - 1, nm ? 10 : 14, 2, nm ? 12 : 8);
      cx.fillStyle = nm ? '#ffd23f' : 'rgba(255,255,255,.75)'; cx.fillText(nm || String(m), x, 29);
    }
    const mark = (wx, wz, col) => { let b = Math.atan2(wx - c.px, -(wz - c.pz)) * 180 / Math.PI; let d = ((b - bearing + 540) % 360) - 180; d = clamp(d, -span / 2 + 4, span / 2 - 4); const x = W / 2 + d * px; cx.fillStyle = col; cx.beginPath(); cx.moveTo(x, 5); cx.lineTo(x + 6, 11); cx.lineTo(x, 17); cx.lineTo(x - 6, 11); cx.fill(); };
    if (c.storm && c.storm.active && c.storm.state !== 'final') mark(c.storm.nextC.x, c.storm.nextC.y, '#ffffff');
    cx.fillStyle = '#ffd23f'; cx.beginPath(); cx.moveTo(W / 2, 40); cx.lineTo(W / 2 - 6, 46); cx.lineTo(W / 2 + 6, 46); cx.fill();
  }

  drawMinimap(c) {
    const cv = this.el.minimap, S = cv.width, m = this.mm; if (!this.map) return;
    const bus = c.state === 'bus', span = bus ? 600 : 230, k = S / span, ms = this.mapSize, mpm = ms / 640;
    const cxw = bus ? 0 : c.px, czw = bus ? 0 : c.pz;
    m.save(); m.fillStyle = '#0f4a78'; m.fillRect(0, 0, S, S);
    const sx = (cxw + 320) * mpm - span * mpm / 2, sz = (czw + 320) * mpm - span * mpm / 2; m.imageSmoothingEnabled = true; m.drawImage(this.map, sx, sz, span * mpm, span * mpm, 0, 0, S, S);
    const X = x => (x - cxw) * k + S / 2, Y = z => (z - czw) * k + S / 2;
    const st = c.storm;
    if (st && st.active) {
      m.fillStyle = 'rgba(150,50,230,.38)'; m.beginPath(); m.rect(0, 0, S, S); m.arc(X(st.center.x), Y(st.center.y), Math.max(0.1, st.radius * k), 0, Math.PI * 2, true); m.fill('evenodd');
      m.strokeStyle = '#c77dff'; m.lineWidth = 3; m.beginPath(); m.arc(X(st.center.x), Y(st.center.y), Math.max(0.1, st.radius * k), 0, Math.PI * 2); m.stroke();
      if (st.state !== 'final') { m.strokeStyle = '#fff'; m.lineWidth = 2.5; m.beginPath(); m.arc(X(st.nextC.x), Y(st.nextC.y), Math.max(0.1, st.nextR * k), 0, Math.PI * 2); m.stroke(); }
    }
    m.font = 'bold 16px "Segoe UI", sans-serif'; m.textAlign = 'center'; m.fillStyle = '#fff'; m.strokeStyle = 'rgba(0,0,0,.8)'; m.lineWidth = 3;
    for (const p of c.pois) { const x = X(p.x), y = Y(p.z); if (x < -40 || y < -10 || x > S + 40 || y > S + 10) continue; if (bus) m.font = 'bold 12px "Segoe UI", sans-serif'; m.strokeText(p.name, x, y); m.fillText(p.name, x, y); }
    if (bus && c.busPos) { // bus path + icon
      m.strokeStyle = 'rgba(255,230,120,.85)'; m.lineWidth = 3; m.setLineDash([8, 7]); m.beginPath(); m.moveTo(X(c.busStart.x), Y(c.busStart.z)); m.lineTo(X(c.busEnd.x), Y(c.busEnd.z)); m.stroke(); m.setLineDash([]);
      m.fillStyle = '#ffd23f'; m.beginPath(); m.arc(X(c.busPos.x), Y(c.busPos.z), 9, 0, 7); m.fill(); m.strokeStyle = '#000'; m.lineWidth = 2; m.stroke();
    }
    // player arrow
    const ax = X(c.px), ay = Y(c.pz); m.translate(ax, ay); m.rotate(Math.PI - c.yaw); m.fillStyle = '#ffd23f'; m.strokeStyle = '#000'; m.lineWidth = 2.5; m.beginPath(); m.moveTo(0, -13); m.lineTo(9, 10); m.lineTo(0, 5); m.lineTo(-9, 10); m.closePath(); m.fill(); m.stroke();
    m.restore();
  }

  draw2d(c) {
    const x = this.fx, dpr = this.dpr, W = this.W, H = this.H, cam = c.camera, dt = c.dt; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
    const project = (px, py, pz) => { _v.set(px, py, pz).project(cam); if (_v.z > 1 || _v.z < -1) return null; return [(_v.x * 0.5 + 0.5) * W, (-_v.y * 0.5 + 0.5) * H]; };
    x.textAlign = 'center'; x.lineJoin = 'round';
    // damage numbers
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i]; n.t += dt; if (n.t > n.life) { this.numbers.splice(i, 1); continue; }
      const k = n.t / n.life, pt = project(n.x, n.y + k * 1.6, n.z); if (!pt) continue;
      const size = (n.kind === 'head' ? 30 : 22) * (1 + (1 - k) * 0.35); x.font = `900 ${size}px "Segoe UI", sans-serif`; x.globalAlpha = 1 - k * k;
      x.lineWidth = 5; x.strokeStyle = 'rgba(0,0,0,.75)'; x.strokeText(n.text, pt[0] + n.dx * k, pt[1]); x.fillStyle = n.kind === 'head' ? '#ffd23f' : n.kind === 'shield' ? '#4cc3ff' : '#ffffff'; x.fillText(n.text, pt[0] + n.dx * k, pt[1]);
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const n = this.popups[i]; n.t += dt; if (n.t > n.life) { this.popups.splice(i, 1); continue; }
      const k = n.t / n.life, pt = project(n.x, n.y + k * 0.9, n.z); if (!pt) continue; x.globalAlpha = 1 - k * k * k; x.font = '800 18px "Segoe UI", sans-serif'; x.lineWidth = 4; x.strokeStyle = 'rgba(0,0,0,.7)'; x.strokeText(n.text, pt[0], pt[1]); x.fillStyle = n.color; x.fillText(n.text, pt[0], pt[1]);
    }
    x.globalAlpha = 1;
    // enemy health bars after hits
    for (const [f, t] of this.bars) {
      const left = t - dt; if (left <= 0 || !f.alive) { this.bars.delete(f); continue; } this.bars.set(f, left);
      const pt = project(f.pos.x, f.pos.y + f.height() + 0.55, f.pos.z); if (!pt) continue; const w = 64, h = 7; x.globalAlpha = Math.min(1, left * 2);
      x.fillStyle = 'rgba(0,0,0,.65)'; x.fillRect(pt[0] - w / 2 - 2, pt[1] - 12, w + 4, h * 2 + 5); x.fillStyle = '#3a3f55'; x.fillRect(pt[0] - w / 2, pt[1] - 10, w, h); x.fillRect(pt[0] - w / 2, pt[1] - 10 + h + 1, w, h);
      x.fillStyle = '#4bd3ff'; x.fillRect(pt[0] - w / 2, pt[1] - 10, w * f.shield / 100, h); x.fillStyle = '#5cff8a'; x.fillRect(pt[0] - w / 2, pt[1] - 10 + h + 1, w * f.hp / 100, h);
      x.font = '800 12px "Segoe UI", sans-serif'; x.fillStyle = '#fff'; x.strokeStyle = 'rgba(0,0,0,.8)'; x.lineWidth = 3; x.strokeText(f.name, pt[0], pt[1] - 17); x.fillText(f.name, pt[0], pt[1] - 17);
    }
    x.globalAlpha = 1;
    // directional damage indicators
    for (let i = this.hurts.length - 1; i >= 0; i--) {
      const h = this.hurts[i]; h.t += dt; if (h.t > 1.4) { this.hurts.splice(i, 1); continue; } if (!h.pos) continue;
      const ang = Math.atan2(h.pos.x - c.px, h.pos.z - c.pz), rel = ang - c.yaw; // 0 = ahead
      const a = -Math.PI / 2 - rel * -1 * -1; x.save(); x.translate(W / 2, H / 2); x.rotate(-rel + Math.PI * 0 ); x.globalAlpha = (1 - h.t / 1.4) * 0.85;
      const R = Math.min(W, H) * 0.3; x.strokeStyle = '#ff3b3b'; x.lineWidth = 12; x.lineCap = 'round'; x.beginPath(); x.arc(0, 0, R, -Math.PI / 2 - 0.28, -Math.PI / 2 + 0.28); x.stroke(); x.restore();
    }
    x.globalAlpha = 1;
  }
}
