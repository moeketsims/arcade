// Weapon runtime: ammo, fire modes, recoil patterns, spread, reload state machine. No rendering, no DOM.
import { deriveWeapon, WEAPONS, damageAt } from './data.js';
import { clamp, lerp, rnd } from './util.js';

const DRAW = { 'Pistol': 0.3, 'SMG': 0.34, 'Assault Rifle': 0.4, 'LMG': 0.55, 'Marksman Rifle': 0.45, 'Sniper Rifle': 0.55, 'Shotgun': 0.45, 'Launcher': 0.6 };
const SHOTS = [];

export class Weapon {
  /** def: a WEAPONS entry (or its id); att: attachment ids {optic, muzzle, mag, stock}. */
  constructor(def, att = null) {
    this.def = typeof def === 'string' ? WEAPONS[def] : def;
    this.stats = deriveWeapon(this.def, att); this.att = this.stats.att;
    this.ammo = this.stats.mag; this.reserve = Math.round(this.def.reserve);
    this.modeIdx = 0;
    this.cool = 0; this.sinceShot = 9; this.recoilIdx = 0; this.shotSpread = 0;
    this.burstLeft = 0;
    this.reload = null;       // { t, dur, kind: 'tac'|'empty'|'shell', phase, shells, need, timer }
    this.queued = 0;          // buffered trigger press (semi/burst), seconds left
    this.boltT = 0;           // > 0 while cycling a bolt/pump (viewmodel uses it)
    this.empty = false;       // set when the trigger was pulled on an empty chamber
    this.shellEvent = false;  // set when a shell was just inserted (sound/animation hook)
    this.totalShots = 0;
    this.drawTime = DRAW[this.def.cls] ?? 0.4;
  }
  setAttachments(att) {
    const old = this.stats.mag;
    this.stats = deriveWeapon(this.def, att); this.att = this.stats.att;
    this.ammo = Math.min(this.ammo + (this.stats.mag - old > 0 && this.ammo === old ? this.stats.mag - old : 0), this.stats.mag + 1);
  }
  get mode() { return this.stats.modes[this.modeIdx % this.stats.modes.length]; }
  get id() { return this.def.id; }
  get name() { return this.def.name; }
  get capacity() { return this.stats.mag; }
  get reloading() { return !!this.reload; }
  get reloadProgress() { return this.reload ? clamp(this.reload.t / this.reload.dur, 0, 1) : 0; }
  get totalAmmo() { return this.ammo + this.reserve; }
  cycleMode() {
    const n = this.stats.modes.length; if (n < 2) return false;
    this.modeIdx = (this.modeIdx + 1) % n; this.burstLeft = 0; this.queued = 0; return true;
  }
  refill(frac = 1) { this.reserve = Math.min(Math.round(this.def.reserve), this.reserve + Math.ceil(this.def.reserve * frac)); }
  fullAmmo() { this.ammo = this.stats.mag; this.reserve = Math.round(this.def.reserve); this.reload = null; }

  update(dt) {
    this.cool = Math.max(-0.06, this.cool - dt);
    this.sinceShot += dt;
    this.queued = Math.max(0, this.queued - dt);
    if (this.boltT > 0) this.boltT = Math.max(0, this.boltT - dt);
    const rc = this.stats.recoil;
    if (this.sinceShot > rc.delay + 0.28) this.recoilIdx = Math.max(0, this.recoilIdx - dt * 16);
    this.shotSpread = Math.max(0, this.shotSpread - this.stats.spreadRecover * dt);
    if (this.burstLeft > 0 && this.ammo <= 0) this.burstLeft = 0;
    if (this.reload) this._updateReload(dt);
  }

  // ---------------------------------------------------------------------------------------------------------
  // Reloading
  // ---------------------------------------------------------------------------------------------------------
  canReload() { return !this.reload && this.reserve > 0 && this.ammo < this.stats.mag; }
  startReload() {
    if (!this.canReload()) return false;
    const s = this.stats;
    this.burstLeft = 0; this.queued = 0;
    if (s.shell) {
      const need = Math.min(s.mag - this.ammo, this.reserve);
      this.reload = { t: 0, kind: 'shell', phase: 'start', shells: 0, need, timer: s.shell.start, dur: s.shell.start + need * s.shell.per + s.shell.end };
    } else {
      const kind = this.ammo === 0 ? 'empty' : 'tac';
      this.reload = { t: 0, kind, dur: s.reload[kind] };
    }
    return true;
  }
  cancelReload() { if (!this.reload) return false; this.reload = null; return true; }
  _updateReload(dt) {
    const r = this.reload, s = this.stats;
    r.t += dt;
    if (r.kind === 'shell') {
      r.timer -= dt;
      let guard = 0;
      while (r.timer <= 0 && r.phase !== 'end' && guard++ < 12) {
        if (r.phase === 'start') { r.phase = 'load'; r.timer += s.shell.per; continue; }
        if (this.reserve > 0 && this.ammo < s.mag) { this.ammo++; this.reserve--; r.shells++; this.shellEvent = true; }
        if (r.shells >= r.need || this.ammo >= s.mag || this.reserve <= 0) { r.phase = 'end'; r.timer += s.shell.end; } else r.timer += s.shell.per;
      }
      if (r.phase === 'end' && r.timer <= 0) this.reload = null;
      return;
    }
    if (r.t >= r.dur) {
      const cap = r.kind === 'tac' && this.def.kind === 'gun' && !s.bolt && s.mag > 2 ? s.mag + 1 : s.mag;
      const take = Math.min(cap - this.ammo, this.reserve);
      this.ammo += take; this.reserve -= take; this.reload = null; this.sinceShot = 9; this.recoilIdx = 0;
    }
  }
  /** Shell reloads can be interrupted by firing once at least one shell is in. */
  canInterruptReload() { return !!this.reload && this.reload.kind === 'shell' && this.ammo > 0; }

  // ---------------------------------------------------------------------------------------------------------
  // Firing
  // ---------------------------------------------------------------------------------------------------------
  /**
   * Trigger logic; call once per frame. pressed = trigger pressed this frame, held = trigger down.
   * Returns an array (shared, do not keep) of shot events { pitch, yaw, pellets, ... } fired this frame.
   */
  trigger(pressed, held, out = SHOTS) {
    out.length = 0;
    const s = this.stats;
    if (pressed) this.queued = 0.14;
    if (this.reload && !this.canInterruptReload()) return out;
    let guard = 0;
    while (this.cool <= 0 && guard++ < 4) {
      let want;
      if (this.burstLeft > 0) want = true;
      else if (this.mode === 'auto') want = held;
      else want = this.queued > 0;
      if (!want) break;
      if (this.ammo <= 0) { this.empty = this.empty || pressed || this.queued > 0 || this.mode === 'auto'; this.burstLeft = 0; this.queued = 0; break; }
      if (this.reload) this.reload = null;
      if (this.mode === 'burst' && this.burstLeft === 0) this.burstLeft = Math.min(s.burst.count, this.ammo);
      out.push(this._shoot());
      this.queued = 0;
      if (this.mode === 'burst') {
        this.burstLeft--;
        this.cool += this.burstLeft > 0 ? 60 / s.burst.rpm : s.burst.gap + 60 / s.burst.rpm;
      }
    }
    return out;
  }

  _shoot() {
    const s = this.stats, rc = s.recoil;
    this.ammo--; this.totalShots++;
    if (this.mode !== 'burst') this.cool += s.bolt ? Math.max(s.bolt, s.interval) : s.interval;
    if (s.bolt) this.boltT = s.bolt;
    this.sinceShot = 0;
    const idx = Math.floor(this.recoilIdx); this.recoilIdx += 1;
    const pat = rc.pat, L = pat.length;
    let k;
    if (idx < L) k = pat[idx]; else { const ls = Math.min(rc.loop, L - 1), span = Math.max(1, L - ls); k = pat[ls + ((idx - ls) % span)]; }
    const j = rc.rand;
    const ev = { pitch: k[0] * s.recoilMul + rnd(-j[0], j[0]), yaw: k[1] * s.recoilYawMul + rnd(-j[1], j[1]), idx, pellets: s.pellets, bolt: !!s.bolt, last: this.ammo <= 0, ss: this.shotSpread };
    this.shotSpread = Math.min(this.shotSpread + s.shotSpread, Math.max(s.hipSpread * 0.9, 1));
    return ev;
  }

  /** Current bullet spread (half-angle, degrees). adsT 0..1, moveF 0..1 (speed fraction), stanceMul, air flag. */
  spread(adsT, moveF, stanceMul = 1, air = false, shotSpread = this.shotSpread) {
    const s = this.stats;
    let sp = lerp(s.hipSpread, s.adsSpread, clamp(adsT, 0, 1));
    sp += s.moveSpread * moveF * lerp(1, 0.4, adsT);
    sp += shotSpread * lerp(1, 0.5, adsT);
    sp *= stanceMul;
    if (air) sp *= lerp(2.4, 1.6, adsT);
    return sp;
  }
  /** Chest damage of one bullet/pellet at a distance. */
  damage(dist) { return damageAt(this.stats, dist); }
}

/** Direction (unit vector, written into `out`) deviated from (dx,dy,dz) by a random point inside a cone of half-angle `deg`. */
export function spreadDir(dx, dy, dz, deg, out) {
  if (deg <= 0.0001) { out.x = dx; out.y = dy; out.z = dz; return out; }
  const ang = deg * Math.PI / 180;
  const r = Math.tan(ang) * Math.sqrt(Math.random()) * (0.55 + 0.45 * Math.random()), t = Math.random() * Math.PI * 2;
  let ux, uy, uz;
  if (Math.abs(dy) < 0.95) { ux = dz; uy = 0; uz = -dx; } else { ux = 0; uy = -dz; uz = dy; }
  let l = Math.hypot(ux, uy, uz); ux /= l; uy /= l; uz /= l;
  const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
  const a = Math.cos(t) * r, b = Math.sin(t) * r;
  const x = dx + ux * a + vx * b, y = dy + uy * a + vy * b, z = dz + uz * a + vz * b;
  l = Math.hypot(x, y, z); out.x = x / l; out.y = y / l; out.z = z / l;
  return out;
}
