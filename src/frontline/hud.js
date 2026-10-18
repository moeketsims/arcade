// HUD: DOM overlay + minimap canvas. Implements the `ui` interface the match calls into (hitmarkers, killfeed, medals, xp...).
import { WEAPONS, STREAKS, LETHALS, TACTICALS, OPTICS } from './data.js';
import { clamp, lerp, fmtTime, esc, DEG, wrapPI } from './util.js';
import { STANCE } from './actors.js';

import { ICON, EQ_ICON } from './icons.js';
const TEAM_CLS = t => (t === 0 ? 'ally' : 'foe');

export class Hud {
  constructor(root, ctl) {
    this.root = root; this.ctl = ctl; this.pad = ctl.pad; this.match = null; this.lastKF = []; this.cache = {}; this.mm = { t: 0 }; this.hpPulse = 0; this.hbT = 0; this.boardT = 0; this.rumbleOn = true;
    this.build();
  }
  // ---------------------------------------------------------------------------------------------------------
  build() {
    const r = this.root;
    r.innerHTML = `
      <div id="fl-vig"></div><div id="fl-white"></div>
      <div id="fl-scope"><svg viewBox="0 0 100 100" preserveAspectRatio="none"></svg></div>
      <div id="fl-ret"></div>
      <div id="fl-xh"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><i class="c"></i><i class="ring"></i></div>
      <div id="fl-hm"><i></i><i></i><i></i><i></i></div>
      <div id="fl-dmg"></div>
      <canvas id="fl-marks"></canvas>
      <div id="fl-lock"><b></b><span></span></div>
      <div id="fl-mm"><canvas width="200" height="200"></canvas><div class="mm-ring"></div></div>
      <div id="fl-score"><div class="sc-l"><b></b><span></span></div><div class="sc-c"><div class="sc-t"></div><div class="sc-lim"></div></div><div class="sc-r"><b></b><span></span></div></div>
      <div id="fl-range"></div>
      <div id="fl-kf"></div>
      <div id="fl-medals"></div><div id="fl-xp"></div>
      <div id="fl-prompt"></div><div id="fl-promptbar"><i></i></div>
      <div id="fl-ftext"></div>
      <div id="fl-ammo"><div class="wn"></div><div class="mag"><b>0</b><span>/ 0</span></div><div class="fm"></div><div class="rl"><i></i></div></div>
      <div id="fl-equip"><div class="eq lethal"><span class="ic"></span><b></b></div><div class="eq tact"><span class="ic"></span><b></b></div></div>
      <div id="fl-streaks"></div>
      <div id="fl-sensor"></div>
      <div id="fl-banner"><div class="b1"></div><div class="b2"></div></div>
      <div id="fl-death"><div class="d1"></div><div class="d2"></div><div class="d3"></div></div>
      <div id="fl-count"></div>
      <div id="fl-board"></div>
      <div id="fl-lockhint">Click the game to capture the mouse</div>
      <div id="fl-toast" class="toast2"></div>`;
    this.el = id => r.querySelector('#' + id);
    for (const id of ['vig', 'white', 'scope', 'ret', 'xh', 'hm', 'dmg', 'marks', 'lock', 'mm', 'score', 'range', 'kf', 'medals', 'xp', 'prompt', 'promptbar', 'ftext', 'ammo', 'equip', 'streaks', 'sensor', 'banner', 'death', 'count', 'board', 'lockhint', 'toast']) this['e_' + id] = this.el('fl-' + id);
    this.mmCanvas = this.e_mm.querySelector('canvas'); this.mmCtx = this.mmCanvas.getContext('2d');
    this.marksCtx = this.e_marks.getContext('2d');
    // streak slots
    this.e_streaks.innerHTML = [0, 1, 2].map(i => `<div class="st" data-i="${i}"><div class="ring"><div class="ico"></div></div><div class="key"></div><div class="nm"></div></div>`).join('');
    this.stEls = [...this.e_streaks.querySelectorAll('.st')];
    // damage indicator pool
    this.dmgEls = []; for (let i = 0; i < 8; i++) { const d = document.createElement('div'); d.className = 'dm'; d.innerHTML = '<i></i>'; this.e_dmg.appendChild(d); this.dmgEls.push(d); } this.dmgIdx = 0;
    this.xpEls = [];
    this.reticleKey = ''; this.scopeKey = '';
  }
  bind(match) {
    this.match = match; this.cache = {}; this.lastKF.length = 0; this.e_kf.innerHTML = ''; this.e_medals.innerHTML = ''; this.e_xp.innerHTML = ''; this.e_board.classList.remove('show');
    this.buildMinimap(match); this.rangeMode = match.modeId === 'range';
    this.e_score.style.display = this.rangeMode ? 'none' : ''; this.e_range.style.display = this.rangeMode ? '' : 'none';
    this.e_count.textContent = ''; this.e_death.classList.remove('show'); this.e_banner.classList.remove('show');
  }
  show(on) { this.root.classList.toggle('hidden', !on); }

  // ---------------------------------------------------------------------------------------------------------
  // helpers used by the match as `ui`
  // ---------------------------------------------------------------------------------------------------------
  glyph(b) { return this.pad.glyph(b); }
  glyphInteract() { return this.ctl.usingPad && this.pad.connected ? this.pad.glyph('X') : '<kbd>E</kbd>'; }
  rumble(w = 0.4, s = 0.4, ms = 100) { if (this.rumbleOn) this.pad.rumble(w, s, ms); }
  hitmarker(kind) {
    const e = this.e_hm; e.className = ''; void e.offsetWidth; e.className = `on ${kind}`;
    this.xhKick = 1;
  }
  shotFired() { this.xhKick = Math.min(1.5, (this.xhKick || 0) + 0.6); }
  damage(angle, amount, hpFrac) {
    this.hpPulse = Math.min(1, this.hpPulse + clamp(amount / 40, 0.2, 0.7));
    if (angle == null) return;
    const d = this.dmgEls[this.dmgIdx++ % this.dmgEls.length], deg = angle / DEG;
    d.style.transition = 'none'; d.style.opacity = '1'; d.style.transform = `rotate(${(-deg).toFixed(1)}deg)`;
    void d.offsetWidth; d.style.transition = 'opacity 1.4s ease-out'; d.style.opacity = '0';
  }
  killfeed(e) {
    const you = e.you, vic = e.youDied;
    const cls = t => (t === 0 ? 'ally' : 'foe');
    const killer = `<span class="${you ? 'you' : cls(e.killerTeam)}">${esc(e.killer)}</span>`, victim = `<span class="${vic ? 'you' : cls(e.victimTeam)}">${esc(e.victim)}</span>`;
    const w = e.self ? '<span class="kw">✖</span>' : `<span class="kw">${e.melee ? '🗡 ' : ''}${esc(e.weapon || '')}${e.head ? ' <em>HS</em>' : ''}</span>`;
    const el = document.createElement('div'); el.className = 'kf' + (you ? ' mine' : vic ? ' died' : ''); el.innerHTML = e.self ? `${victim} ${w}` : `${killer} ${w} ${victim}`;
    this.e_kf.appendChild(el); this.lastKF.push({ el, t: 5.5 });
    while (this.lastKF.length > 6) { const o = this.lastKF.shift(); o.el.remove?.(); }
  }
  medal(name) {
    const el = document.createElement('div'); el.className = 'md'; el.textContent = name; this.e_medals.appendChild(el);
    setTimeout(() => el.remove?.(), 2600);
  }
  xp(n, label) {
    const el = document.createElement('div'); el.className = 'xp'; el.innerHTML = `<b>+${n}</b> ${esc(label || '')}`;
    this.e_xp.appendChild(el); this.xpEls.push(el); while (this.xpEls.length > 6) this.xpEls.shift().remove?.();
    setTimeout(() => el.remove?.(), 1900);
  }
  rangeHit(pts, zone, dist) { this.xp(pts, `${zone === 'head' ? 'HEAD' : zone === 'limb' ? 'LIMB' : 'BODY'} · ${Math.round(dist)} m`); }
  toast(t, dur = 2.2) { const e = this.e_toast; e.textContent = t; e.classList.add('show'); clearTimeout(this._tt); this._tt = setTimeout(() => e.classList.remove('show'), dur * 1000); }
  flashText(t) { const e = this.e_ftext; e.textContent = t; e.classList.remove('on'); void e.offsetWidth; e.classList.add('on'); }
  flashMode(mode) { this.flashText(`Fire mode: ${mode.toUpperCase()}`); }
  warn(t) { const e = this.e_banner; e.querySelector('.b1').textContent = t; e.querySelector('.b2').textContent = ''; e.classList.remove('show'); void e.offsetWidth; e.classList.add('show'); clearTimeout(this._bt); this._bt = setTimeout(() => e.classList.remove('show'), 2800); }
  streakReady(s) { this.toast(`${s.def.name} ready: ${this.slotGlyph(this.match.player.streakSlots.indexOf(s))}`, 2.6); }
  slotGlyph(i) { return ['UP', 'RIGHT', 'LEFT'][i] ? this.pad.glyph(['UP', 'RIGHT', 'LEFT'][i]) : ''; }
  matchOver() { /* the main loop shows the results screen */ }
  respawned() { this.e_death.classList.remove('show'); this.hpPulse = 0; }
  assist() {}

  // ---------------------------------------------------------------------------------------------------------
  // minimap
  // ---------------------------------------------------------------------------------------------------------
  buildMinimap(m) {
    const b = m.map.bounds, S = 4, w = Math.ceil((b.x1 - b.x0 + 8) * S), h = Math.ceil((b.z1 - b.z0 + 8) * S);
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    this.mmImg = { c, S, x0: b.x0 - 4, z0: b.z0 - 4, w, h };
    if (!x || !x.fillRect) return;
    x.fillStyle = '#10151d'; x.fillRect(0, 0, w, h);
    const boxes = m.level.boxes.filter(o => o.tag !== 'ground' && o.tag !== 'ceiling' && o.visible !== false || o.tag === 'fence');
    const draw = (o, fill) => { x.fillStyle = fill; x.fillRect((o.minx - this.mmImg.x0) * S, (o.minz - this.mmImg.z0) * S, Math.max(1, (o.maxx - o.minx) * S), Math.max(1, (o.maxz - o.minz) * S)); };
    for (const o of boxes) { if (o.tag === 'perimeter') draw(o, '#6a7384'); }
    for (const o of boxes) { if (o.miny > 2.4 || o.tag === 'perimeter') continue; const hgt = o.maxy - o.miny; if (o.maxy < 0.5) continue; draw(o, o.tag === 'fence' ? '#3b4352' : hgt < 1.3 ? '#3f4858' : o.tag === 'container' ? '#55627a' : '#7d889c'); }
    // upper floors: faint overlay of slabs so players know there is a level above
    for (const o of boxes) { if (o.tag === 'floor') draw(o, 'rgba(120,150,190,0.16)'); }
  }
  drawMinimap(dt, m, p) {
    const ctx = this.mmCtx, S = 2.6, W = 200, R = 100, img = this.mmImg;
    ctx.clearRect(0, 0, W, W);
    ctx.save(); ctx.translate(R, R);
    ctx.save(); ctx.rotate(p.heading - Math.PI);
    if (img && img.c) ctx.drawImage(img.c, 0, 0, img.w, img.h, (img.x0 - p.body.x) * S, (img.z0 - p.body.z) * S, img.w / img.S * S, img.h / img.S * S);
    // markers in world space
    const uav = m.streaks.uavActive(p.team), sensor = p.sensorT > 0;
    const mark = (x, z, col, size, shape, heading) => {
      const mx = (x - p.body.x) * S, mz = (z - p.body.z) * S; if (mx * mx + mz * mz > R * R * 1.1) return;
      ctx.save(); ctx.translate(mx, mz); ctx.fillStyle = col;
      if (shape === 'tri') { ctx.rotate(-heading + Math.PI); ctx.beginPath(); ctx.moveTo(0, -size * 1.3); ctx.lineTo(size, size); ctx.lineTo(-size, size); ctx.closePath(); ctx.fill(); }
      else if (shape === 'sq') ctx.fillRect(-size, -size, size * 2, size * 2);
      else { ctx.beginPath(); ctx.arc(0, 0, size, 0, 6.3); ctx.fill(); }
      ctx.restore();
    };
    for (const a of m.actors) {
      if (a === p || !a.alive) continue;
      if (m.hostile(p, a)) {
        const fired = m.time - a.firedT < 1.6, moving = a.body && Math.hypot(a.body.vx, a.body.vz) > 0.8, near = sensor && Math.hypot(a.body.x - p.body.x, a.body.z - p.body.z) < 32 && moving;
        if (uav || fired || near) mark(a.body.x, a.body.z, fired ? '#ff3b30' : uav ? '#ff6a5a' : '#ffb347', fired ? 4.2 : 3.4, 'tri', a.heading);
      } else mark(a.body.x, a.body.z, '#4ac3ff', 3.6, 'tri', a.heading);
    }
    for (const e of m.streaks.entities) { if (!e.alive || e.rotors == null && !e.turret) continue; mark(e.x, e.z, e.team === p.team ? '#7dff9a' : '#ff6a5a', 3, e.rotors ? 'dot' : 'sq', 0); }
    for (const pk of m.pickups) { if (pk.kind === 'ammo' && pk.cool <= 0) mark(pk.x, pk.z, '#7dff9a', 2.2, 'sq', 0); }
    for (const pr of m.proj.list) if (pr.type === 'mine' && pr.owner === p) mark(pr.x, pr.z, '#ffd34d', 2, 'dot', 0);
    ctx.restore();
    if (sensor) { ctx.strokeStyle = `rgba(80,255,170,${0.5 - ((m.time * 0.8) % 1) * 0.5})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, ((m.time * 0.8) % 1) * 32 * S, 0, 6.3); ctx.stroke(); }
    // player arrow
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill();
    // field of view wedge
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 60, -Math.PI / 2 - 0.65, -Math.PI / 2 + 0.65); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------------------------
  // per-frame
  // ---------------------------------------------------------------------------------------------------------
  set(key, el, prop, val) { const k = key + prop; if (this.cache[k] !== val) { this.cache[k] = val; el[prop] = val; } }
  setHTML(key, el, val) { if (this.cache[key] !== val) { this.cache[key] = val; el.innerHTML = val; } }
  setStyle(key, el, prop, val) { const k = key + prop; if (this.cache[k] !== val) { this.cache[k] = val; if (prop.charCodeAt(0) === 45) el.style.setProperty(prop, val); else el.style[prop] = val; } }   // custom properties (--g, --p) need setProperty
  update(dt, m, aspect, vw, vh) {
    this.match = m; const p = m.player, w = p.weapon, st = m.mode.hud();
    this.rumbleOn = m.settings.rumble !== false;
    // timers: killfeed
    for (let i = this.lastKF.length - 1; i >= 0; i--) { const o = this.lastKF[i]; o.t -= dt; if (o.t < 0.6) o.el.style.opacity = String(clamp(o.t / 0.6, 0, 1)); if (o.t <= 0) { o.el.remove?.(); this.lastKF.splice(i, 1); } }
    // ---- vignette + whiteout
    this.hpPulse = Math.max(0, this.hpPulse - dt * 1.6);
    const low = p.alive ? clamp((1 - p.hp / p.maxHp) * 1.1, 0, 0.9) : 0.85;
    this.setStyle('vig', this.e_vig, 'opacity', (clamp(low * 0.85 + this.hpPulse * 0.5, 0, 1)).toFixed(3));
    const wf = p.flashT > 0 ? clamp(p.flashT / Math.max(0.5, p.flashMax) * 2.2, 0, 1) : 0;
    this.setStyle('white', this.e_white, 'opacity', wf.toFixed(3));
    if (p.alive && p.hp < 30) { this.hbT -= dt; if (this.hbT <= 0) { this.hbT = 0.95; m.sound.heartbeat(); } }
    // ---- crosshair / reticle / scope
    this.updateSights(dt, m, p, w, aspect, vw, vh);
    // ---- ammo / equipment / streaks
    this.updateAmmo(dt, m, p, w);
    // ---- score
    this.updateScore(m, st);
    // ---- prompt + banners
    const pr = p.prompt; this.setHTML('prompt', this.e_prompt, pr || ''); this.setStyle('prompt', this.e_prompt, 'opacity', pr ? '1' : '0');
    this.setStyle('pbar', this.e_promptbar, 'opacity', p.interactT > 0.02 ? '1' : '0'); if (p.interactT > 0.02) this.e_promptbar.firstElementChild.style.width = `${(p.interactT * 100).toFixed(0)}%`;
    // ---- minimap (30 Hz)
    this.mm.t -= dt; if (this.mm.t <= 0) { this.mm.t = 1 / 30; this.drawMinimap(dt, m, p); }
    // ---- death panel / countdown / sensor
    this.updateDeath(m, p);
    this.e_count.textContent = m.state === 'countdown' ? (m.countdown > 0.5 ? String(Math.ceil(m.countdown)) : 'GO') : '';
    this.setStyle('sensor', this.e_sensor, 'opacity', p.sensorT > 0 ? '1' : '0'); if (p.sensorT > 0) this.set('sensor', this.e_sensor, 'textContent', `HEARTBEAT SENSOR ${Math.ceil(p.sensorT)}s`);
    // ---- scoreboard
    const showBoard = this.ctl.scoreHeld && m.state !== 'countdown' || m.state === 'over';
    this.e_board.classList.toggle('show', !!showBoard);
    if (showBoard) { this.boardT -= dt; if (this.boardT <= 0) { this.boardT = 0.3; this.renderBoard(m); } }
    // ---- ally markers + lock-on
    this.drawMarks(m, p, vw, vh);
    // ---- pointer-lock hint
    const needLock = !this.ctl.usingPad && !this.pad.locked && m.state !== 'over';
    this.setStyle('lh', this.e_lockhint, 'display', needLock ? 'block' : 'none');
  }

  updateSights(dt, m, p, w, aspect, vw, vh) {
    const ads = p.adsT, stats = w?.stats;
    // dynamic crosshair: gap in px from the spread angle
    this.xhKick = Math.max(0, (this.xhKick || 0) - dt * 4);
    const vfov = m.camera.fov * DEG, pxPerRad = vh / (2 * Math.tan(vfov / 2));
    const sp = w ? w.spread(ads, p.moveF, p.stance === STANCE.PRONE ? 0.6 : p.stance === STANCE.CROUCH ? 0.8 : p.stance === STANCE.SLIDE ? 1.25 : 1, p.air) : 2;
    const gap = clamp(Math.tan(sp * DEG) * pxPerRad * 0.72 + 3 + this.xhKick * 4, 3, 110);
    const showXh = p.alive && p.hold === 'gun' && ads < 0.35 && !p.scoped && !p.targeting && m.state !== 'over' && !(p.act?.type === 'throw');
    const circle = stats && stats.pellets > 1;
    this.setStyle('xh', this.e_xh, 'opacity', showXh ? String(clamp(1 - ads * 3, 0, 1)) : '0');
    this.setStyle('xhg', this.e_xh, '--g', `${gap.toFixed(1)}px`); this.e_xh.classList.toggle('circle', !!circle);
    // optic reticle (red dot / holo) fades in as the sight comes up
    const op = stats ? OPTICS[stats.optic] : null, ret = op?.reticle;
    if (this.reticleKey !== (ret || '')) { this.reticleKey = ret || ''; this.e_ret.className = ret === 'dot' ? 'dot' : ret === 'ring' ? 'ring' : ''; }
    this.setStyle('ret', this.e_ret, 'opacity', (ret === 'dot' || ret === 'ring') && p.alive && p.hold === 'gun' ? String(clamp((ads - 0.7) * 3.3, 0, 1)) : '0');
    // scope overlay for 4x / 8x / sniper scopes
    const scoped = p.scoped && p.alive;
    this.setStyle('scope', this.e_scope, 'opacity', scoped ? '1' : '0');
    if (scoped && this.scopeKey !== stats.optic + vw + vh) {
      this.scopeKey = stats.optic + vw + vh;
      const R = (stats.scope || 0.3) * vh, mil = stats.optic === 'x8';
      this.e_scope.style.background = `radial-gradient(circle at 50% 50%, transparent ${R - 1}px, rgba(0,0,0,0.97) ${R + 1}px)`;
      this.e_scope.firstElementChild.innerHTML = `<g stroke="#000" stroke-width="0.25" opacity="0.9"><line x1="${50 - R / vw * 100}" y1="50" x2="${50 + R / vw * 100}" y2="50"/><line x1="50" y1="${50 - R / vh * 100}" x2="50" y2="${50 + R / vh * 100}"/></g><circle cx="50" cy="50" r="0.25" fill="#f33"/>${mil ? [-6, -4, -2, 2, 4, 6].map(k => `<circle cx="${50 + k * (R / vw * 100) / 10}" cy="50" r="0.2" fill="#000"/><circle cx="50" cy="${50 + k * (R / vh * 100) / 10}" r="0.2" fill="#000"/>`).join('') : ''}`;
    }
  }

  updateAmmo(dt, m, p, w) {
    const a = this.e_ammo, mg = a.querySelector('.mag'), wn = a.querySelector('.wn'), fm = a.querySelector('.fm'), rl = a.querySelector('.rl');
    this.setStyle('am', a, 'opacity', p.alive && m.state !== 'over' ? '1' : '0.25');
    if (p.hold === 'gun' && w) {
      this.set('wn', wn, 'textContent', w.name);
      this.set('am1', mg.firstElementChild, 'textContent', String(w.ammo)); this.set('am2', mg.lastElementChild, 'textContent', `/ ${w.reserve}`);
      mg.classList.toggle('low', w.ammo <= Math.max(2, Math.floor(w.capacity * 0.25)));
      const s = w.stats, label = s.modes.length > 1 ? w.mode.toUpperCase() : s.bolt ? (s.model === 'pump' ? 'PUMP' : 'BOLT') : s.pellets > 1 && s.model === 'doublebarrel' ? 'BREAK' : s.modes[0].toUpperCase();
      this.set('fm', fm, 'textContent', label);
      this.setStyle('rl', rl, 'opacity', w.reload ? '1' : '0'); if (w.reload) rl.firstElementChild.style.width = `${(w.reloadProgress * 100).toFixed(0)}%`;
    } else {
      this.set('wn', wn, 'textContent', this.meleeName(p));
      this.set('am1', mg.firstElementChild, 'textContent', ''); this.set('am2', mg.lastElementChild, 'textContent', p.meleeId === 'ballistic' ? (p.bladeReady ? 'BLADE READY' : 'BLADE OUT') : '');
      mg.classList.remove('low'); this.set('fm', fm, 'textContent', 'MELEE'); this.setStyle('rl', rl, 'opacity', '0');
    }
    // lethal / tactical with their button glyphs
    const eq = this.e_equip;
    this.setHTML('eqkl', eq.querySelector('.lethal'), `<span class="ic">${EQ_ICON[p.lethal.id] || ''}</span><b>${p.lethal.n}</b><i>${this.pad.glyph('R1')}</i>`);
    this.setHTML('eqkt', eq.querySelector('.tact'), `<span class="ic">${EQ_ICON[p.tactical.id] || ''}</span><b>${p.tactical.n}</b><i>${this.pad.glyph('L1')}</i>`);
    eq.querySelector('.lethal').classList.toggle('empty', p.lethal.n <= 0); eq.querySelector('.tact').classList.toggle('empty', p.tactical.n <= 0);
    // streak rings
    p.streakSlots.forEach((sl, i) => {
      const el = this.stEls[i]; if (!el) return;
      const f = clamp(sl.prog / sl.cost, 0, 1);
      this.setStyle('st' + i, el.querySelector('.ring'), '--p', `${(f * 100).toFixed(0)}`);
      this.setHTML('sti' + i, el.querySelector('.ico'), ICON[sl.id] || '');
      this.setHTML('stk' + i, el.querySelector('.key'), this.pad.glyph(['UP', 'RIGHT', 'LEFT'][i]));
      this.set('stn' + i, el.querySelector('.nm'), 'textContent', sl.ready ? 'READY' : `${sl.prog}/${sl.cost}`);
      el.classList.toggle('ready', !!sl.ready); this.setStyle('stc' + i, el, 'color', sl.def.color);
    });
  }
  meleeName(p) { return { combat: 'Combat Knife', karambit: 'Karambit', butterfly: 'Butterfly Knife', machete: 'Machete', ballistic: 'Ballistic Knife' }[p.meleeId] || 'Knife'; }

  updateScore(m, st) {
    if (this.rangeMode) { this.updateRange(st); return; }
    const sc = this.e_score;
    const l = sc.querySelector('.sc-l'), r = sc.querySelector('.sc-r');
    this.set('sl', l.firstElementChild, 'textContent', String(st.left)); this.set('sll', l.lastElementChild, 'textContent', st.leftLabel);
    this.set('sr', r.firstElementChild, 'textContent', String(st.right)); this.set('srl', r.lastElementChild, 'textContent', st.rightLabel);
    this.set('stm', sc.querySelector('.sc-t'), 'textContent', fmtTime(st.time)); this.set('slim', sc.querySelector('.sc-lim'), 'textContent', `First to ${st.limit}`);
    sc.querySelector('.sc-t').classList.toggle('low', st.time < 30);
  }
  updateRange(st) {
    const s = st.stats, c = st.course;
    const lap = c.state === 'running' ? fmtTime(c.t, true) : c.state === 'done' ? fmtTime(c.last, true) : '--:--.--';
    const html = `<div class="rg-h">FIRING RANGE</div>
      <div class="rg-g"><span>Score</span><b>${s.score}</b><span>Hits</span><b>${s.hits}/${s.shots}</b><span>Accuracy</span><b>${s.acc}%</b><span>Headshots</span><b>${s.heads}</b><span>Streak</span><b>${s.streak} <small>best ${s.best}</small></b></div>
      <div class="rg-h">OBSTACLE COURSE</div>
      <div class="rg-c ${c.state}"><b>${lap}</b><span>${c.state === 'idle' ? 'Cross the green start gate' : c.state === 'running' ? `Gate ${Math.min(c.next, 5)}/5` : 'Finished!'}</span></div>
      <div class="rg-g"><span>Best</span><b>${c.best ? fmtTime(c.best, true) : '--'}</b><span>Laps</span><b>${c.done}</b></div>`;
    this.setHTML('range', this.e_range, html);
  }

  updateDeath(m, p) {
    const d = this.e_death;
    if (!p.alive && m.state !== 'over') {
      d.classList.add('show');
      const k = p.killer;
      this.set('d1', d.querySelector('.d1'), 'textContent', k ? `ELIMINATED BY ${(k.name || k.owner?.name || 'ROBOT').toUpperCase()}` : 'YOU DIED');
      this.set('d2', d.querySelector('.d2'), 'textContent', m.mode.isRange ? 'Back in a moment' : `Respawning in ${Math.ceil(p.respawnIn || 0)}`);
    } else d.classList.remove('show');
  }

  renderBoard(m) {
    const rows = m.mode.rows(), teams = m.mode.def && m.modeId === 'tdm';
    const line = r => `<tr class="${r.you ? 'you' : ''} ${r.team === 0 ? 'ally' : 'foe'}"><td>${esc(r.name)}</td><td>${r.kills}</td><td>${r.deaths}</td><td>${r.assists}</td><td>${r.score}</td></tr>`;
    const head = '<tr><th></th><th>K</th><th>D</th><th>A</th><th>Score</th></tr>';
    let html;
    if (teams) {
      const a = rows.filter(r => r.team === 0), b = rows.filter(r => r.team === 1);
      html = `<h2>${esc(m.mode.def.name)} <small>${m.mode.score[0]} - ${m.mode.score[1]}</small></h2><div class="bd"><table><caption class="ally">ALLIES</caption>${head}${a.map(line).join('')}</table><table><caption class="foe">ENEMY</caption>${head}${b.map(line).join('')}</table></div>`;
    } else html = `<h2>${esc(m.mode.def.name)}</h2><div class="bd one"><table>${head}${rows.map(line).join('')}</table></div>`;
    this.e_board.innerHTML = html;
  }

  drawMarks(m, p, vw, vh) {
    const cv = this.e_marks;
    if (cv.width !== vw || cv.height !== vh) { cv.width = vw; cv.height = vh; }
    const c = this.marksCtx; c.clearRect(0, 0, vw, vh);
    if (!p.alive) return;
    const cam = m.camera;
    const V = this._V3 || (this._V3 = new cam.position.constructor());
    // ally triangles (friendly names)
    if (!m.mode.isRange && m.modeId === 'tdm') {
      c.font = '600 13px "Segoe UI", sans-serif'; c.textAlign = 'center';
      for (const a of m.bots) {
        if (!a.alive || a.team !== p.team) continue;
        V.set(a.body.x, a.body.y + 2.15, a.body.z).project(cam); if (V.z > 1 || V.z < -1) continue;
        const sx = (V.x * 0.5 + 0.5) * vw, sy = (1 - (V.y * 0.5 + 0.5)) * vh, d = Math.hypot(a.body.x - p.body.x, a.body.z - p.body.z), sc = clamp(1.1 - d / 90, 0.5, 1);
        c.fillStyle = '#4ac3ff'; c.beginPath(); c.moveTo(sx, sy + 7 * sc); c.lineTo(sx - 7 * sc, sy - 6 * sc); c.lineTo(sx + 7 * sc, sy - 6 * sc); c.closePath(); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.9)'; if (d < 40) c.fillText(a.name, sx, sy - 12 * sc);
      }
    }
    // Skylock lock-on box
    const L = p.lock, lk = this.e_lock;
    if (L.state !== 'none' && L.target) {
      V.set(L.target.lockX(), L.target.lockY(), L.target.lockZ()).project(cam);
      if (V.z < 1) {
        const sx = (V.x * 0.5 + 0.5) * vw, sy = (1 - (V.y * 0.5 + 0.5)) * vh;
        lk.style.opacity = '1'; lk.style.transform = `translate(${sx.toFixed(0)}px, ${sy.toFixed(0)}px)`; lk.className = L.state; lk.querySelector('span').textContent = L.state === 'locked' ? 'LOCKED' : 'LOCKING';
      } else lk.style.opacity = '0';
    } else lk.style.opacity = '0';
    // grenade / streak target preview is drawn in 3D
  }
}
