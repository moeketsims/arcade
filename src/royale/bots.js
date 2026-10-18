// Bot AI: drops from the bus to a POI, loots chests, roams toward the safe zone, fights with imperfect aim, builds walls when shot.
import * as THREE from 'three';
import { ITEMS, scoreItem } from './items.js';
import { SEA, BUILD_COST } from './config.js';
import { fwd } from './fighter.js';

const _e = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const clamp = THREE.MathUtils.clamp, rnd = Math.random;
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
export const BOT_NAMES = ['Nimbus', 'Pixel', 'Rascal', 'Comet', 'Biscuit', 'Torque', 'Waffles', 'Zenith', 'Ember', 'Cobalt', 'Mango', 'Glitch', 'Orbit', 'Pebble', 'Quasar', 'Sprocket', 'Tango', 'Umbra', 'Vortex', 'Whisk', 'Yodel', 'Zephyr', 'Maverick', 'Nova', 'Onyx', 'Pepper', 'Rocket', 'Sketch', 'Turbo', 'Gizmo', 'Bolt', 'Fuzz', 'Jinx', 'Dingo', 'Pogo', 'Ripple'];

export class Bot {
  constructor(G, f, o = {}) {
    this.G = G; this.f = f; this.skill = o.skill ?? 0.3 + rnd() * 0.55; this.react = 1.1 - 0.5 * this.skill + rnd() * 0.35; this.aggr = 0.3 + rnd() * 0.7; f.autoTrigger = true;
    this.state = 'bus'; this.thinkT = rnd() * 0.3; this.goal = null; this.wps = []; this.wp = null; this.target = null; this.seen = -99; this.lastKnown = new THREE.Vector3();
    this.strafeDir = rnd() < 0.5 ? -1 : 1; this.strafeT = 0; this.burstOn = true; this.burstT = 0; this.err = new THREE.Vector3(); this.errT = 0; this.stuckT = 0; this.stuckPos = new THREE.Vector2(); this.jumpT = 0; this.sidestepT = 0; this.sideDir = 1;
    this.alertPos = null; this.alertT = 0; this.buildCd = 0; this.noEnemyT = 0; this.engageT = 0; this.ignore = new Set(); this.dropTarget = null; this.jumpS = 0; this.far = false; this.travel = null; this.roamTarget = null; this.interactFor = 0; this.emoteT = 0; this.lootT = 0; this.name = f.name; this.calmUntil = 0;
  }

  // ---------------- drop planning ----------------
  planDrop(bus) {
    const G = this.G, T = G.world.terrain, counts = G.dropCounts || (G.dropCounts = new Map()), reach = 150; const cands = [];
    for (const p of T.pois) { const c = bus.closest(p.x, p.z); if (c.d < reach) cands.push({ key: p.id, x: p.x, z: p.z, r: p.flat * 0.7, w: p.kind === 'village' || p.kind === 'docks' ? 3 : 2, c }); }
    for (let i = 0; i < T.sites.length; i++) { const s = T.sites[i], c = bus.closest(s.x, s.z); if (c.d < reach) cands.push({ key: 's' + i, x: s.x, z: s.z, r: 8, w: 1, c }); }
    for (let i = 0; i < 3; i++) { const s = 60 + rnd() * (bus.len - 120), side = rnd() < 0.5 ? -1 : 1, off = 20 + rnd() * 110, pt = bus.pointAt(s), x = pt.x - bus.dir.z * side * off, z = pt.z + bus.dir.x * side * off; if (T.heightAt(x, z) > 2) cands.push({ key: 'r' + i + '_' + (G.matchNo || 0), x, z, r: 6, w: 0.8, c: bus.closest(x, z) }); }
    let total = 0; for (const c of cands) { c.ww = c.w / (1 + 0.7 * (counts.get(c.key) || 0)); total += c.ww; }
    let pick = null, r = rnd() * total; for (const c of cands) { r -= c.ww; if (r <= 0) { pick = c; break; } } if (!pick) pick = cands[0];
    if (!pick) { const p = T.nearestPoi(0, 0); pick = { key: p.id, x: p.x, z: p.z, r: 10, c: bus.closest(p.x, p.z) }; }
    counts.set(pick.key, (counts.get(pick.key) || 0) + 1);
    const a = rnd() * 6.28, rr = Math.sqrt(rnd()) * pick.r; this.dropTarget = new THREE.Vector3(pick.x + Math.cos(a) * rr, 0, pick.z + Math.sin(a) * rr);
    const lead = Math.sqrt(Math.max(0, 125 * 125 - pick.c.d * pick.c.d)) * (0.8 + rnd() * 0.3);
    this.jumpS = clamp(pick.c.s - lead - rnd() * 14, 15, bus.len - 80);
  }

  // ---------------- helpers ----------------
  houseAt(x, z, m = 0.6) { for (const h of this.G.world.out.houses) if (x > h.x0 - m && x < h.x1 + m && z > h.z0 - m && z < h.z1 + m) return h; return null; }
  pathTo(x, z) {
    const f = this.f, G = this.G; this.finalTarget = [x, z]; this.wpRef = null;
    // A* over the navigation grid; fall back to door waypoints / a straight line when no path exists
    const path = G.world.nav.find(f.pos.x, f.pos.z, x, z);
    if (path && path.length) { this.wps = path.map((w, i) => (i < path.length - 1 ? [w[0], w[1], 2] : [w[0], w[1]])); this.wp = this.wps.shift(); return; }
    const h = this.houseAt(f.pos.x, f.pos.z), th = this.houseAt(x, z, 0.2), wps = [];
    const nearestDoor = (hh, px, pz) => { let b = null, bd = 1e9; for (const d of hh.doors) { const dd = Math.hypot(d.ox - px, d.oz - pz); if (dd < bd) { bd = dd; b = d; } } return b; };
    if (h && h !== th) { const d = nearestDoor(h, x, z); if (d) { wps.push([d.ix, d.iz, 1], [d.ox, d.oz, 1]); } }
    if (th && th !== h) { const d = nearestDoor(th, f.pos.x, f.pos.z); if (d) wps.push([d.ox, d.oz, 1], [d.ix, d.iz, 1]); }
    wps.push([x, z]); this.wps = wps; this.wp = this.wps.shift();
  }
  /** Walk toward the current waypoint with whisker obstacle avoidance. Returns true when the final goal is reached. */
  walk(dt, sprint) {
    const f = this.f, cw = this.G.world.cw, T = this.G.world.terrain;
    if (!this.wp) { f.move.x = f.move.z = 0; return true; }
    let dx = this.wp[0] - f.pos.x, dz = this.wp[1] - f.pos.z, d = Math.hypot(dx, dz);
    const arrive = this.wp[2] === 1 ? 0.5 : this.wp[2] === 2 ? 0.75 : this.wps.length ? 1.3 : 1.6;
    if (d < arrive) { if (this.wps.length) { this.wp = this.wps.shift(); return false; } this.wp = null; f.move.x = f.move.z = 0; return true; }
    // progress watchdog: replan once, then give the goal up
    if (this.wpRef !== this.wp) { this.wpRef = this.wp; this.wpBest = d; this.wpT = 0; }
    else if (d < this.wpBest - 0.4) { this.wpBest = d; this.wpT = 0; }
    else if ((this.wpT += dt) > 3.2) {
      this.wpT = 0; this.replans = (this.replans || 0) + 1;
      if (this.replans <= 2 && this.finalTarget) { const t = this.finalTarget; this.pathTo(t[0], t[1]); this.sidestepT = 0.6; this.sideDir = rnd() < 0.5 ? -1 : 1; }
      else { this.replans = 0; this.goal = null; this.wp = null; this.wps = []; f.move.x = f.move.z = 0; return true; }
      return false;
    }
    dx /= d; dz /= d;
    // whiskers
    let bestA = 0, bestScore = -1e9;
    const ey = f.pos.y + 0.7, base = Math.atan2(dx, dz), reach = Math.min(6, d + 0.6);   // only obstacles between us and the waypoint matter (a table beyond a doorway must not push us away from it)
    for (const off of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6]) {
      const a = base + off, ax = Math.sin(a), az = Math.cos(a);
      let free = reach; const h = cw.raycast(f.pos.x, ey, f.pos.z, ax, 0, az, reach, { bullet: false, terrain: false });
      if (h) free = h.t;
      const hx = f.pos.x + ax * 3, hz = f.pos.z + az * 3; if (T.heightAt(hx, hz) < SEA - 0.4 || T.heightAt(f.pos.x + ax * 1.5, f.pos.z + az * 1.5) < SEA - 0.4) free = Math.min(free, 0.5);
      const sc = free - Math.abs(off) * 1.2 + (free >= reach ? 1.5 : 0); if (sc > bestScore) { bestScore = sc; bestA = a; }
    }
    if (this.sidestepT > 0) { this.sidestepT -= dt; bestA = base + this.sideDir * 1.3; }
    f.move.x = Math.sin(bestA); f.move.z = Math.cos(bestA);
    f.sprintWant = sprint; f.crouchWant = false;
    f.yaw += angDiff(f.yaw, bestA) * Math.min(1, dt * 9);   // face where we are heading
    // stuck detection
    this.stuckT += dt;
    if (this.stuckT > 0.9) {
      const moved = Math.hypot(f.pos.x - this.stuckPos.x, f.pos.z - this.stuckPos.y); this.stuckPos.set(f.pos.x, f.pos.z); this.stuckT = 0;
      if (moved < 0.8) { this.sidestepT = 0.7; this.sideDir = rnd() < 0.5 ? -1 : 1; f.jump(); this.stuckCount = (this.stuckCount || 0) + 1; if (this.stuckCount > 3) { this.stuckCount = 0; this.goal = null; this.wp = null; this.wps = []; } } else this.stuckCount = 0;
    }
    return false;
  }
  stop() { this.f.move.x = this.f.move.z = 0; this.f.sprintWant = false; }

  // ---------------- main update (each frame) ----------------
  update(dt, t) {
    const f = this.f; if (!f.alive) return;
    if (f.state === 'bus') return this.updateBus();
    if (f.state === 'free' || f.state === 'glide') return this.updateAir(dt);
    this.thinkT -= dt; this.buildCd = Math.max(0, this.buildCd - dt); this.errT -= dt; this.emoteT -= dt;
    if (this.thinkT <= 0) { this.thinkT = (this.far ? 0.45 : 0.14) + rnd() * 0.06; this.think(this.far ? 0.5 : 0.17); }
    this.act(dt);
  }
  updateBus() { const G = this.G; if (G.bus.active && G.bus.s >= this.jumpS) G.ejectFromBus(this.f); }
  updateAir(dt) {
    const f = this.f, tg = this.dropTarget || new THREE.Vector3(0, 0, 0), dx = tg.x - f.pos.x, dz = tg.z - f.pos.z, d = Math.hypot(dx, dz);
    f.yaw = Math.atan2(dx, dz); f.moveS = 0; f.pitch = -0.4;
    const agl = f.heightAboveGround();
    if (f.state === 'free') { f.moveF = d > 70 ? 1 : d > 25 ? 0 : -1; if (agl < 60 && d > 90) f.moveF = 1; }
    else { f.moveF = d > 40 && agl > 15 ? 1 : d < 14 ? -1 : 0; }
    if (f.state === 'free' && f.deployLock <= 0 && agl < 140 && (d < 45 || agl < 70)) f.deployGlider();
  }

  think(dt) {
    const f = this.f, G = this.G, storm = G.storm; this.noEnemyT += dt;
    // ----- stuck in water etc. handled by walk -----
    // ----- perception -----
    this.sense();
    // survive the storm
    let fleeing = false;
    if (storm.active) {
      const outNow = !storm.inside(f.pos.x, f.pos.z), outSoon = (storm.state === 'shrink' || (storm.state === 'wait' && storm.timeLeft < 18)) && storm.outsideNext(f.pos.x, f.pos.z);
      if (outNow || outSoon) { fleeing = true; if (!this.roamTarget || this.roamTarget.storm !== storm.phase || !this.goal || this.goal.kind !== 'storm') { const a = rnd() * 6.28, r = Math.sqrt(rnd()) * Math.max(2, storm.nextR * 0.7); this.roamTarget = { x: storm.nextC.x + Math.cos(a) * r, z: storm.nextC.y + Math.sin(a) * r, storm: storm.phase }; this.pathTo(this.roamTarget.x, this.roamTarget.z); this.goal = { kind: 'storm' }; } }
    }
    this.chooseWeapon();
    // decide whether to engage: unarmed bots keep looting, timid bots ignore far-away enemies
    let engage = !!this.target;
    if (engage) {
      const d = this.dist(this.target), armed = f.inv.slots.some(s => s && ITEMS[s.id].type === 'gun' && (s.mag > 0 || f.inv.ammo[ITEMS[s.id].ammo] > 0));
      if (!armed) engage = false;
      else if (d > 45 && this.aggr < 0.75 && f.sinceHit > 3) engage = false;
      else if (d > 85 && !(f.def && f.def.cls === 'Sniper') && f.sinceHit > 3) engage = false;
      else if (G.time < this.calmUntil && d > 7 && f.sinceHit > 3) engage = false;   // looting after landing: only point-blank fights or when shot
      else if (fleeing && d > 25 && !storm.inside(f.pos.x, f.pos.z) && storm.distToWall(f.pos.x, f.pos.z) > 8) engage = false;
    }
    if (engage) { this.state = 'fight'; this.noEnemyT = 0; }
    else if (this.state === 'fight') { this.state = 'roam'; this.goal = null; }
    // healing / reloading when quiet
    if (!this.target && this.noEnemyT > 1.2) {
      if ((f.hp < 70 || f.shield < 40) && !f.using) f.quickHeal();
      const it = f.item, d = f.def; if (d && d.type === 'gun' && it.mag < d.mag * 0.6 && !f.reloading) f.startReload();
    }
    if (this.state === 'fight') return this.thinkFight(dt);
    f.fireHeld = false; f.adsWant = false; this.engageT = 0;
    if (f.hp < 50 && f.sinceHit < 4 && this.alertPos && rnd() < 0.5) this.reactToHit(); // being shot at by something unseen
    // ----- loot / roam -----
    if (!fleeing || (this.goal && this.goal.kind === 'chest' && this.distXZ(this.goal.obj) < 10)) {
      if (!this.goal || this.goal.kind === 'storm' || this.goal.kind === 'roam' && this.lootT > 3) { this.lootT = 0; this.findGoal(); }
    }
    this.lootT += dt;
    if (this.alertPos && this.alertT > 0 && !this.target && this.goal && this.goal.kind !== 'storm' && this.goal.kind !== 'chest' && rnd() < 0.15) { this.pathTo(this.alertPos.x, this.alertPos.z); this.alertT = 0; }
    this.alertT = Math.max(0, this.alertT - dt);
  }
  reactToHit() {
    const f = this.f, a = f.lastHit && f.lastHit.attacker; if (!a || !a.alive) return;
    f.yaw = Math.atan2(a.pos.x - f.pos.x, a.pos.z - f.pos.z);
    if (this.buildCd <= 0 && f.inv.mats.some(m => m >= BUILD_COST) && rnd() < 0.25 + this.skill * 0.5) this.wall(a);
  }
  wall(a) {
    const f = this.f, G = this.G; let mi = f.inv.mats.findIndex(m => m >= BUILD_COST); if (mi < 0) return; f.buildMat = f.inv.mats[1] >= BUILD_COST && rnd() < 0.4 ? 1 : mi;
    const yaw = Math.atan2(a.pos.x - f.pos.x, a.pos.z - f.pos.z);
    f.buildCd = 0; const p = G.build.place(f, 'wall', yaw); this.buildCd = 2.5 + rnd() * 2; return p;
  }
  dist(o) { return Math.hypot(o.pos.x - this.f.pos.x, o.pos.z - this.f.pos.z); }
  distXZ(o) { return Math.hypot(o.x - this.f.pos.x, o.z - this.f.pos.z); }

  // ---------------- perception ----------------
  sense() {
    const f = this.f, G = this.G, cw = G.world.cw, fw = fwd(f.yaw), maxR = f.def && f.def.cls === 'Sniper' ? 190 : 130;
    f.eye(_e); const cands = [];
    for (const o of G.alive) {
      if (o === f || o.state === 'bus' || !o.alive) continue;
      const dx = o.pos.x - f.pos.x, dz = o.pos.z - f.pos.z, d2 = dx * dx + dz * dz; if (d2 > maxR * maxR) continue; const d = Math.sqrt(d2);
      if (d > 14 && o !== this.target) { const dot = (dx * fw[0] + dz * fw[1]) / d; if (dot < 0.2 && this.G.time - this.seen > 1) continue; }
      if (Math.abs(o.pos.y - f.pos.y) > 60) continue; cands.push([d, o]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    let found = null;
    for (let i = 0; i < Math.min(3, cands.length); i++) {
      const [d, o] = cands[i]; o.center(_c); if (!cw.blocked(_e.x, _e.y, _e.z, _c.x, _c.y, _c.z, true)) { found = o; break; }
    }
    if (found) { if (found !== this.target) { this.engageT = 0; } this.target = found; this.seen = G.time; this.lastKnown.copy(found.pos); }
    else if (this.target && (!this.target.alive || G.time - this.seen > 3.2)) { const lk = this.lastKnown; this.target = null; if (this.state === 'fight' && G.time - this.seen < 8 && rnd() < 0.7) { this.alertPos = lk.clone(); this.alertT = 4; this.pathTo(lk.x, lk.z); this.goal = { kind: 'roam' }; } }
  }
  hear(src, pos, radius) {
    const f = this.f; if (!f.alive || src === f || f.state === 'bus') return;
    const d = Math.hypot(pos.x - f.pos.x, pos.z - f.pos.z); if (d > radius) return;
    this.alertPos = pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y, pos.z); this.alertT = 5;
    if (!this.target && rnd() < 0.5) { f.yaw = Math.atan2(pos.x - f.pos.x, pos.z - f.pos.z); }
  }

  // ---------------- weapon choice ----------------
  chooseWeapon() {
    const f = this.f; if (f.reloading || f.using || f.throwT >= 0 || f.buildMode) return;
    const d = this.target ? this.dist(this.target) : 40, cur = f.item;
    let best = -1, bs = -1;
    for (let i = 0; i < 6; i++) {
      const s = f.inv.slots[i]; if (!s) continue; const def = ITEMS[s.id];
      let sc;
      if (def.type === 'gun') { if (s.mag <= 0 && f.inv.ammo[def.ammo] <= 0) continue; const fit = d >= def.ai.min && d <= def.ai.max ? 1 : 1 / (1 + (d < def.ai.min ? def.ai.min - d : d - def.ai.max) / 18); sc = (30 + def.dmg * (def.pellets || 1) * Math.min(def.rate, 8) * 0.12) * def.ai.pref * (1 + s.rarity * 0.18) * fit * (s.mag <= 0 ? 0.5 : 1); }
      else if (def.type === 'melee') sc = d < 3 ? 25 + s.rarity * 5 : 2; else continue;
      if (sc > bs) { bs = sc; best = i; }
    }
    if (best >= 0 && best !== f.cur && (!cur || f.sinceFired > 0.8) && f.switchT <= 0) f.select(best);
  }

  // ---------------- goals ----------------
  findGoal() {
    const f = this.f, G = this.G, loot = G.loot; let best = null, bs = 1e9;
    const storm = G.storm;
    for (const c of loot.chests) {
      if (c.opened || this.ignore.has(c)) continue; const d = Math.hypot(c.x - f.pos.x, c.z - f.pos.z); if (d > 110) continue;
      const penalty = storm.active && !storm.inside(c.x, c.z) ? 200 : 0; const s = d + penalty + rnd() * 25; if (s < bs) { bs = s; best = { kind: 'chest', obj: c, x: c.x, z: c.z }; }
    }
    // weapons lying around
    const needWeapon = !f.inv.slots.slice(1).some(s => s && ITEMS[s.id].type === 'gun');
    loot.near(f.pos.x, f.pos.z, 55, d => {
      if (d.dead || d.kind === 'mats' || this.ignore.has(d) || !d.settled) return;
      let val = 0; if (d.kind === 'item') { val = this.itemValue(d.item); if (val <= 0) return; } else { const have = f.inv.ammo[d.type]; if (have > 90) return; val = 8; if (!f.inv.slots.some(s => s && ITEMS[s.id].ammo === d.type)) val = 0; if (val <= 0) return; }
      const dist = Math.hypot(d.pos.x - f.pos.x, d.pos.z - f.pos.z), s = dist - val * (needWeapon && d.kind === 'item' ? 4 : 1.2) + rnd() * 10; if (s < bs) { bs = s; best = { kind: 'item', obj: d, x: d.pos.x, z: d.pos.z }; }
    });
    if (best) { this.replans = 0; this.goal = best; this.pathTo(best.x, best.z); if (best.kind === 'chest') this.chestApproach(best.obj); return; }
    // roam
    let tx, tz;
    if (storm.active && storm.state !== 'final') { const a = rnd() * 6.28, r = Math.sqrt(rnd()) * Math.max(3, storm.nextR * 0.8); tx = storm.nextC.x + Math.cos(a) * r; tz = storm.nextC.y + Math.sin(a) * r; }
    else { const p = G.world.terrain.pois[Math.floor(rnd() * G.world.terrain.pois.length)], a = rnd() * 6.28, r = rnd() * p.flat; tx = p.x + Math.cos(a) * r; tz = p.z + Math.sin(a) * r; }
    if (G.world.terrain.heightAt(tx, tz) < 1) { tx = 0; tz = 0; }
    this.replans = 0; this.goal = { kind: 'roam', x: tx, z: tz }; this.roamTarget = { x: tx, z: tz, storm: storm.phase }; this.pathTo(tx, tz);
  }
  chestApproach(c) { /* approach point a bit in front of the chest so the bot ends adjacent */ const last = this.wps.length ? this.wps[this.wps.length - 1] : this.wp; if (last) { last[0] = c.x + c.dx * 0.9; last[1] = c.z + c.dz * 0.9; } }
  itemValue(item) {
    const f = this.f, d = ITEMS[item.id];
    if (d.type === 'med') { const have = f.countOf(item.id); return have >= d.stack ? 0 : (f.emptySlot() >= 0 || have > 0 ? 14 : 0); }
    if (d.type === 'throw' || d.type === 'throwknife') return f.emptySlot() >= 0 || f.slotOf(item.id) >= 0 ? 6 : 0;
    const sc = scoreItem(item); let worst = 1e9; let freeSlot = false; for (let i = 1; i < 6; i++) { const s = f.inv.slots[i]; if (!s) freeSlot = true; else worst = Math.min(worst, scoreItem(s)); }
    if (freeSlot) return sc * 0.4; return sc > worst + 4 ? (sc - worst) * 0.3 : 0;
  }

  // ---------------- per-frame action ----------------
  act(dt) {
    const f = this.f, G = this.G;
    if (f.emoteName) { f.move.x = f.move.z = 0; return; }
    if (this.state === 'fight') return this.actFight(dt);
    // looting / roaming
    const g = this.goal; f.fireHeld = false; f.adsWant = false;
    if (!g) { this.stop(); return; }
    if (g.kind === 'chest') {
      if (g.obj.opened) { this.goal = null; this.stop(); f.interactHeld = false; return; }
      const done = this.walk(dt, !this.target && this.distXZ(g.obj) > 14);
      if (this.distXZ(g.obj) < 2.6 && Math.abs(g.obj.y - f.pos.y) < 2.5) { this.stop(); f.interactHeld = true; f.yaw = Math.atan2(g.obj.x - f.pos.x, g.obj.z - f.pos.z); this.interactFor += dt; this.approachT = 0; if (this.interactFor > 4) { this.ignore.add(g.obj); this.goal = null; this.interactFor = 0; f.interactHeld = false; } }
      else {
        f.interactHeld = false; this.interactFor = 0;
        if (done) { this.approachT = (this.approachT || 0) + dt; if (this.approachT > 3) { this.approachT = 0; this.ignore.add(g.obj); this.goal = null; } else if (!this.wp) { this.wp = [g.obj.x + g.obj.dx * 0.6, g.obj.z + g.obj.dz * 0.6]; this.wps = []; } }
      }
      return;
    }
    if (g.kind === 'item') {
      if (g.obj.dead) { this.goal = null; f.interactHeld = false; this.afterLoot(); return; }
      this.walk(dt, false);
      const near = Math.hypot(g.obj.pos.x - f.pos.x, g.obj.pos.z - f.pos.z) < 1.6;
      if (near) {
        this.stop(); const tg = G.loot.findTarget(f);
        if (tg && tg.kind === 'item') { const v = this.itemValue(tg.item); if (v > 0) { this.prepareSwap(tg.item); f.interactHeld = true; this.interactFor += dt; } else { this.ignore.add(tg.obj); f.interactHeld = false; } }
        else if (g.obj.kind !== 'item') { f.interactHeld = false; if (g.obj.dead) this.goal = null; this.interactFor += dt; } else { f.interactHeld = false; }
        if (this.interactFor > 2.5) { this.ignore.add(g.obj); this.goal = null; this.interactFor = 0; f.interactHeld = false; }
      } else f.interactHeld = false;
      return;
    }
    f.interactHeld = false;
    const sprint = !this.target; const done = this.walk(dt, sprint);
    if (done) { this.goal = null; if (g.kind === 'roam' && rnd() < 0.35 && this.emoteT < 0 && !this.target) { f.startEmote(); this.emoteT = 12; } }
  }
  prepareSwap(item) {
    const f = this.f; const d = ITEMS[item.id];
    if (f.emptySlot() >= 0 || (d.type !== 'gun' && d.type !== 'melee')) { f.pickPrefer = -1; return; }
    let w = 1, ws = 1e9; for (let i = 1; i < 6; i++) { const s = f.inv.slots[i]; if (!s) continue; const sc = scoreItem(s); if (sc < ws) { ws = sc; w = i; } } f.pickPrefer = w;
  }
  afterLoot() { const f = this.f; f.pickPrefer = -1; this.ignore.clear(); }

  // ---------------- combat ----------------
  thinkFight(dt) {
    const f = this.f, G = this.G, tg = this.target; if (!tg) return;
    const d = this.dist(tg), def = f.def;
    this.engageT += dt;
    if (this.errT <= 0) { this.errT = 0.12 + rnd() * 0.1; const m = (1.45 - this.skill) * (0.42 + d * 0.036) * (0.6 + 0.4 * Math.min(1, Math.hypot(tg.vel.x, tg.vel.z) / 6)); this.err.set((rnd() - 0.5) * 2 * m, (rnd() - 0.5) * 1.3 * m, (rnd() - 0.5) * 2 * m); }
    // movement: keep ideal range, strafe
    const range = def && def.type === 'gun' ? def.ai : { min: 0, max: 2.5 };
    this.strafeT -= dt; if (this.strafeT <= 0) { this.strafeT = 0.9 + rnd() * 1.4; this.strafeDir = rnd() < 0.5 ? -1 : 1; if (rnd() < 0.12 * this.skill) f.jump(); }
    this.fightMove = d > range.max ? 1 : d < Math.max(3, range.min * 0.6) ? -0.7 : (d > range.max * 0.75 ? 0.5 : 0);
    // reactive building / ramps
    if (f.sinceHit < 0.5 && this.buildCd <= 0 && f.lastHit && f.lastHit.attacker && f.inv.mats.some(m => m >= BUILD_COST) && rnd() < 0.18 + this.skill * 0.4) this.wall(f.lastHit.attacker);
    if (tg.pos.y > f.pos.y + 3.2 && d < 30 && this.buildCd <= 0 && f.inv.mats.some(m => m >= BUILD_COST) && this.skill > 0.45) { f.buildMat = f.inv.mats.findIndex(m => m >= BUILD_COST); const yaw = Math.atan2(tg.pos.x - f.pos.x, tg.pos.z - f.pos.z); f.buildCd = 0; if (G.build.place(f, 'ramp', yaw, 0)) this.buildCd = 0.5; }
    // grenades
    if (d > 8 && d < 26 && f.nadeSlots().length && rnd() < 0.05 && this.skill > 0.35 && f.throwT < 0) { f.aimPoint.copy(tg.pos); f.aimDir.copy(tg.pos).sub(f.pos).normalize(); f.quickThrow(); }
    // reload / swap when empty
    const it = f.item;
    if (def && def.type === 'gun' && it.mag <= 0 && !f.reloading) { const alt = this.altGun(); if (alt >= 0) f.select(alt); else f.startReload(); }
    // health in a lull (far target)
    if (f.hp < 35 && d > 35 && f.bestMed() && rnd() < 0.3) f.quickHeal();
  }
  altGun() { const f = this.f; for (let i = 1; i < 6; i++) { const s = f.inv.slots[i]; if (s && ITEMS[s.id].type === 'gun' && (s.mag > 0) && i !== f.cur) return i; } return -1; }
  actFight(dt) {
    const f = this.f, G = this.G, tg = this.target;
    if (!tg || !tg.alive) { f.fireHeld = false; return; }
    const d = this.dist(tg), def = f.def, eye = f.eye(_e);
    // aim point with lead / drop compensation and error
    tg.center(_c); const ap = _d.copy(_c); ap.y += 0.12;
    if (def && def.proj) { const spd = def.proj.speed, tt = d / spd; ap.x += tg.vel.x * tt * (0.5 + 0.5 * this.skill); ap.z += tg.vel.z * tt * (0.5 + 0.5 * this.skill); ap.y += 0.5 * (def.proj.grav || 0) * tt * tt; }
    if (def && def.type === 'throwknife') ap.y += 0.3;
    ap.add(this.err);
    f.aimPoint.copy(ap); f.aimDir.copy(ap).sub(eye).normalize();
    const wantYaw = Math.atan2(ap.x - f.pos.x, ap.z - f.pos.z), horiz = Math.hypot(ap.x - f.pos.x, ap.z - f.pos.z), wantPitch = Math.atan2(ap.y - eye.y, horiz);
    const turn = (4 + this.skill * 8) * dt; f.yaw += clamp(angDiff(f.yaw, wantYaw), -turn, turn); f.pitch += clamp(wantPitch - f.pitch, -turn, turn);
    const yawErr = Math.abs(angDiff(f.yaw, wantYaw));
    // movement
    const fm = this.fightMove || 0, [fx, fz] = fwd(wantYaw), rx = -fz, rz = fx;
    f.move.x = fx * fm + rx * this.strafeDir * 0.7; f.move.z = fz * fm + rz * this.strafeDir * 0.7;
    const sp = Math.hypot(f.move.x, f.move.z); if (sp > 1) { f.move.x /= sp; f.move.z /= sp; }
    if (!def || def.type !== 'gun') { f.move.x = fx; f.move.z = fz; }   // melee: charge
    f.sprintWant = false; f.crouchWant = d > 45 && def && def.cls === 'Sniper'; f.adsWant = !!def && def.type === 'gun' && d > 28 && def.zoom > 1.2;
    // trigger discipline: bursts
    this.burstT -= dt; if (this.burstT <= 0) { this.burstOn = !this.burstOn || rnd() < 0.2; this.burstT = this.burstOn ? 0.5 + rnd() * 1.0 : 0.2 + rnd() * 0.5; if (def && def.mode === 'auto' && d < 12) { this.burstOn = true; } }
    const inRange = !def ? false : def.type === 'gun' ? d < def.ai.max * 1.25 : d < (def.reach || 2.5) + 0.5;
    const ready = this.engageT > this.react && yawErr < 0.18 && inRange && f.switchT <= 0;
    f.fireHeld = ready && (this.burstOn || (def && def.mode === 'semi'));
    if (def && def.mode === 'charge') f.fireHeld = ready && (f.charge < 0.9 || rnd() < 0.5);
    f.interactHeld = false;
  }
}
