// CPU drivers (and the autopilot that takes over the player's kart after the finish): follow the course on a
// personal racing line, cut to the inside on corners, drift long bends for mini-turbos, dodge hazards, pick up item
// boxes and use items with simple tactics. Skill and a little catch-up depend on the engine class.
import { STEP } from './track.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

export function makeBrain(kart, race) {
  const r = race.rand;
  return {
    lane: (r() - 0.5) * 0.6, laneT: 2 + r() * 3, skill: kart.isPlayer ? 1 : race.cls.cpu * (0.95 + r() * 0.05),
    itemDelay: 1 + r() * 2.5, driftHold: 0, stuckT: 0, reverseT: 0, wobble: r() * 10, aggressive: r() < 0.5,
  };
}

/** Sum of heading change over the next `metres` of track from sample i (radians, signed: < 0 = right turn). */
function turnAhead(T, i, metres) {
  const n = Math.round(metres / STEP); let a = 0;
  const h0 = Math.atan2(T.tx[T.wrap(i)], T.tz[T.wrap(i)]), h1 = Math.atan2(T.tx[T.wrap(i + n)], T.tz[T.wrap(i + n)]);
  a = angDiff(h1, h0); return a;
}

export function aiDrive(k, race, dt) {
  const T = race.track, B = k.brain, c = k.ctl;
  if (race.state === 'countdown') {
    // good drivers time the start boost; others rev too early or too late
    c.steer = 0; c.brake = 0; c.drift = false;
    const want = k.isPlayer ? -0.6 : -0.9 + (B.wobble % 1) * 0.9 * (1.1 - B.skill);
    c.throttle = race.time > want ? 1 : 0;
    return;
  }
  B.laneT -= dt; if (B.laneT <= 0) { B.laneT = 2 + race.rand() * 4; B.lane = clamp(B.lane + (race.rand() - 0.5) * 0.5, -0.55, 0.55); }
  const look = Math.round((7 + Math.max(0, k.sp) * 0.5) / STEP);
  const ai = T.wrap(k.idx + look);
  const turn = turnAhead(T, k.idx + Math.round(6 / STEP), 34);
  // racing line: towards the inside of the coming bend
  let lat = B.lane * T.half[ai] + clamp(-turn * 1.2, -0.6, 0.6) * T.half[ai];
  // pick up an item box when empty-handed
  if (!k.item && k.rouletteT <= 0 && race.items) {
    for (const row of T.itemRows) { const dd = T.wrap(row - k.idx); if (dd > 4 && dd < 40 / STEP) { const boxes = T.boxes.filter(b => b.i === row && b.t <= 0); if (boxes.length) { const b = boxes.reduce((p, q) => Math.abs(q.lat - k.lat) < Math.abs(p.lat - k.lat) ? q : p); lat = b.lat; } break; } }
  }
  // dodge hazards and obstacles ahead
  const dodge = (hx, hz, r) => {
    const L = T.locate(hx, hz, k.idx, {}); const dd = T.wrap(L.i - k.idx);
    if (dd > 0 && dd < 30 / STEP && Math.abs(L.lat - lat) < r + 1.4) lat = L.lat + (L.lat > lat ? -1 : 1) * (r + 2.2);
  };
  for (const h of race.hazards) dodge(h.x, h.z, 1.6);
  for (const m of T.movers) dodge(m.x, m.z, m.r);
  // stay on solid ground near drops
  const lim = T.isDrop(ai) ? T.half[ai] - 1.5 : T.half[ai] - 0.8; lat = clamp(lat, -lim, lim);
  const p = T.point(ai, lat);
  const want = Math.atan2(p.x - k.x, p.z - k.z);
  const err = angDiff(want, k.drift.on ? k.md : k.h);
  let steer = clamp(-err * 2.6, -1, 1);
  // stuck against something: back out
  if (k.sp < 1.5 && race.time > 2 && k.spinT <= 0 && k.fallT <= 0) B.stuckT += dt; else B.stuckT = 0;
  if (B.stuckT > 1.4) { B.reverseT = 1.1; B.stuckT = 0; }
  if (B.reverseT > 0) { B.reverseT -= dt; c.throttle = 0; c.brake = 1; c.steer = -steer; c.drift = false; return; }
  let thr = 1, brk = 0;
  if (Math.abs(err) > 0.75 && k.sp > 13) { thr = 0; brk = 0.4; }
  if (T.isDrop(ai) && Math.abs(err) > 0.5 && k.sp > 18) { thr = 0.3; }
  // drifting through long bends
  const d = k.drift, sharp = Math.abs(turn);
  if (d.on) {
    B.driftHold += dt;
    steer = clamp(-err * 3.2, -1, 1);
    const inside = (k.lat - lat) * d.dir;   // > 0: the drift is carrying us past the line toward the inside
    const release = sharp < 0.2 || Math.sign(-turn) !== d.dir && sharp > 0.2 || (d.tier >= 2 && sharp < 0.4) || B.driftHold > 4.5 || Math.abs(err) > 1.0 || inside > 3.5 || k.offroad;
    c.drift = !release;
  } else {
    c.drift = false;
    const soon = Math.abs(turnAhead(T, k.idx + Math.round(3 / STEP), 16));
    if (sharp > 0.6 && soon > 0.22 && k.sp > 15 && !k.air && k.spinT <= 0 && race.rand() < B.skill * dt * 8 && Math.abs(err) < 0.5 && !k.offroad) { c.driftPressed = true; c.drift = true; B.driftHold = 0; steer = -Math.sign(turn); }
    else if (d.want) { c.drift = true; steer = -Math.sign(turn) || steer; }
  }
  c.steer = steer; c.throttle = thr; c.brake = brk;
  // catch-up: a CPU far behind the player gets a little extra, far ahead a little less
  const P = race.player;
  if (P && !k.isPlayer && race.mode !== 'tt') {
    const gap = (P.progress - k.progress) * T.length;
    k.rubber = (gap > 50 ? 1 + Math.min(0.09, (gap - 50) / 1500) : gap < -80 ? 1 - Math.min(0.05, (-gap - 80) / 2000) : 1) * B.skill;
  } else k.rubber = k.isPlayer ? 1 : B.skill;
  // items
  c.aim = 0;
  if (k.item && k.rouletteT <= 0) {
    B.itemDelay -= dt;
    if (B.itemDelay <= 0) {
      const ahead = race.order[k.place - 2], behind = race.order[k.place];
      const near = (o, dist) => o && Math.hypot(o.x - k.x, o.z - k.z) < dist;
      let use = false;
      switch (k.item) {
        case 'pepper': case 'pepper3': use = sharp < 0.3 && !k.offroad || k.offroad && sharp < 0.5; break;
        case 'puck': case 'puck3':
          if (near(ahead, 45) && Math.abs(angDiff(Math.atan2(ahead.x - k.x, ahead.z - k.z), k.h)) < 0.25) use = true;
          else if (near(behind, 18)) { use = true; c.aim = -1; }
          else if (B.itemDelay < -6) use = true;
          break;
        case 'puddle': use = near(behind, 22) || B.itemDelay < -5; break;
        case 'shield': use = race.projectiles.some(p => p.type === 'comet' && p.target === k) || B.itemDelay < -4; break;
        default: use = true;
      }
      if (use) { c.itemPressed = true; B.itemDelay = 0.6 + race.rand() * 2.2; }
    }
  }
}
