import * as THREE from 'three';

// A jointed 3D person built from primitives (~1.82 m tall). Faces +Z, feet at y = 0 on `root`.
// Joint rotation conventions (radians, applied as Euler XYZ on each joint group):
//   lHip/rHip .x < 0 swings the thigh FORWARD, > 0 back; .z abducts (left +, right −); .y turns the leg.
//   lKnee/rKnee .x > 0 bends the knee. lAnkle/rAnkle .x > 0 points the toe down.
//   lShoulder/rShoulder .x < 0 raises the arm FORWARD (−π ≈ straight up); .z abducts (left +, right −).
//   lElbow/rElbow .x < 0 bends the elbow (hand comes forward/up).
//   spine/chest .x > 0 lean forward, .z side-bend, .y twist. neck/head likewise.
//   body = pelvis pivot (whole upper+lower body): rotation for dives/flips, position offset `bodyPos` [x,y,z].
// The character's LEFT is +X, RIGHT is −X. Poses are plain objects { joint: [rx, ry, rz], bodyPos: [x,y,z] }.
export const JOINTS = ['body', 'spine', 'chest', 'neck', 'head', 'lShoulder', 'lElbow', 'rShoulder', 'rElbow', 'lHip', 'lKnee', 'lAnkle', 'rHip', 'rKnee', 'rAnkle'];
const PELVIS_Y = 0.97;
export const SKIN = [0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x5c3a1e];
export const HAIR = [0x1b1209, 0x3b2314, 0x6a4423, 0xb8863b, 0x0d0d0d, 0x8a8a8a];

const geoCache = {};
const G = (key, fn) => geoCache[key] || (geoCache[key] = fn());
const matCache = new Map();
function M(color, rough = 0.7, metal = 0, extra = {}) {
  const key = `${color}|${rough}|${metal}|${JSON.stringify(extra)}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }));
  return matCache.get(key);
}

function seg(parent, geo, mat, y, shadow = true) {
  const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = shadow; parent.add(m); return m;
}

/** Back-of-shirt texture with name and number. */
export function shirtBackTexture(name, number, fg = '#ffffff', bg = null) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const c = cv.getContext('2d');
  if (bg) { c.fillStyle = bg; c.fillRect(0, 0, 256, 256); }
  c.fillStyle = fg; c.textAlign = 'center';
  c.font = 'bold 34px Arial Narrow, Arial, sans-serif'; c.fillText(String(name || '').toUpperCase().slice(0, 12), 128, 46);
  c.font = 'bold 150px Arial Black, Arial, sans-serif'; c.fillText(String(number ?? ''), 128, 200);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export class Humanoid {
  /**
   * opts: skin, hair, hairStyle ('short'|'buzz'|'afro'|'long'|'bald'), shirt, shirt2 (stripe/sleeve), shorts, socks, boots,
   *       number, name, numberColor, longSleeves, gloves (color), helmet (color), visor (color), build (0.9–1.1 width scale),
   *       height (scale), robot (true → metallic panels instead of skin), shadows (default true)
   */
  constructor(o = {}) {
    this.o = o; this.detail = [];
    const sh = o.shadows ?? true, h = o.height ?? 1, wsc = o.build ?? 1;
    const skin = M(o.robot ? (o.skin ?? 0x8a93a6) : (o.skin ?? SKIN[1]), o.robot ? 0.35 : 0.65, o.robot ? 0.6 : 0);
    const shirt = M(o.shirt ?? 0x2266cc, 0.8), shirt2 = M(o.shirt2 ?? o.shirt ?? 0x2266cc, 0.8);
    const shorts = M(o.shorts ?? 0xffffff, 0.8), socks = M(o.socks ?? o.shirt ?? 0x2266cc, 0.85), boots = M(o.boots ?? 0x111111, 0.4, 0.1);
    const gloves = o.gloves != null ? M(o.gloves, 0.6) : skin;
    const j = this.j = {};
    const root = this.root = new THREE.Group(); root.scale.setScalar(h);
    const body = j.body = new THREE.Group(); body.position.y = PELVIS_Y; root.add(body);
    // pelvis / shorts
    const pel = seg(body, G('pel', () => new THREE.CylinderGeometry(0.165, 0.17, 0.2, 16)), shorts, -0.02, sh); pel.scale.set(wsc, 1, 0.72);
    // spine → chest → neck → head
    const spine = j.spine = new THREE.Group(); spine.position.y = 0.06; body.add(spine);
    const chest = j.chest = new THREE.Group(); chest.position.y = 0.2; spine.add(chest);
    const torso = seg(chest, G('torso', () => new THREE.CylinderGeometry(0.205, 0.165, 0.52, 18)), shirt, 0.06, sh); torso.scale.set(wsc, 1, 0.64);
    const yoke = seg(chest, G('yoke', () => new THREE.SphereGeometry(0.205, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2)), shirt, 0.32, false); yoke.scale.set(wsc, 0.32, 0.64);
    this.torso = torso;
    if (o.number != null || o.name) {
      const back = new THREE.Mesh(G('back', () => new THREE.PlaneGeometry(0.27, 0.3)), new THREE.MeshBasicMaterial({ map: shirtBackTexture(o.name, o.number, o.numberColor ?? '#ffffff'), transparent: true }));
      back.position.set(0, 0.1, -0.128 * 1.0); back.rotation.y = Math.PI; chest.add(back);
      const front = new THREE.Mesh(G('front', () => new THREE.PlaneGeometry(0.1, 0.1)), new THREE.MeshBasicMaterial({ map: shirtBackTexture('', o.number, o.numberColor ?? '#ffffff'), transparent: true }));
      front.position.set(-0.07, 0.2, 0.125); chest.add(front);
      const crest = new THREE.Mesh(G('crest', () => new THREE.CircleGeometry(0.03, 14)), M(o.crest ?? 0xffd34d, 0.4, 0.4)); crest.position.set(0.075, 0.2, 0.126); chest.add(crest);
      this.detail.push(front, crest);
    }
    const neck = j.neck = new THREE.Group(); neck.position.y = 0.33; chest.add(neck);
    seg(neck, G('neckm', () => new THREE.CylinderGeometry(0.052, 0.06, 0.1, 10)), skin, 0.03, false);
    const head = j.head = new THREE.Group(); head.position.y = 0.15; neck.add(head);
    const skull = seg(head, G('skull', () => new THREE.SphereGeometry(0.112, 22, 16)), skin, 0, sh); skull.scale.set(0.92, 1.05, 1);
    if (o.robot) {
      const vis = new THREE.Mesh(G('visor', () => new THREE.SphereGeometry(0.1, 18, 10, -Math.PI * 0.45, Math.PI * 0.9, Math.PI * 0.32, Math.PI * 0.3)), M(o.visor ?? 0xff3344, 0.2, 0.3, { emissive: o.visor ?? 0xff3344, emissiveIntensity: 1.2 }));
      vis.position.z = 0.025; head.add(vis);
    } else {
      const eyeW = M(0xffffff, 0.3), eyeD = M(0x1d1410, 0.3);
      for (const s of [-1, 1]) {
        const ew = new THREE.Mesh(G('eyew', () => new THREE.SphereGeometry(0.016, 8, 6)), eyeW); ew.position.set(0.038 * s, 0.018, 0.096); ew.scale.z = 0.5; head.add(ew);
        const ed = new THREE.Mesh(G('eyed', () => new THREE.SphereGeometry(0.009, 8, 6)), eyeD); ed.position.set(0.038 * s, 0.018, 0.104); head.add(ed);
        const brow = new THREE.Mesh(G('brow', () => new THREE.BoxGeometry(0.035, 0.007, 0.01)), M(o.hair ?? HAIR[0])); brow.position.set(0.038 * s, 0.045, 0.1); head.add(brow);
        const ear = new THREE.Mesh(G('ear', () => new THREE.SphereGeometry(0.022, 8, 6)), skin); ear.position.set(0.103 * s, 0.0, 0); ear.scale.set(0.5, 1, 0.8); head.add(ear);
        this.detail.push(ew, ed, brow, ear);
      }
      const nose = new THREE.Mesh(G('nose', () => new THREE.ConeGeometry(0.016, 0.04, 6)), skin); nose.rotation.x = Math.PI / 2; nose.position.set(0, -0.005, 0.112); head.add(nose);
      const mouth = new THREE.Mesh(G('mouth', () => new THREE.BoxGeometry(0.04, 0.006, 0.006)), M(0x7a3b30)); mouth.position.set(0, -0.045, 0.1); head.add(mouth);
      this.detail.push(nose, mouth);
      const hs = o.hairStyle ?? 'short', hm = M(o.hair ?? HAIR[0], 0.9);
      if (hs === 'short' || hs === 'long') { const cap = new THREE.Mesh(G('hair', () => new THREE.SphereGeometry(0.118, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)), hm); cap.position.set(0, 0.012, -0.012); cap.scale.set(0.96, 1.05, 1.06); head.add(cap); }
      if (hs === 'buzz') { const cap = new THREE.Mesh(G('buzz', () => new THREE.SphereGeometry(0.115, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.45)), hm); cap.position.y = 0.01; head.add(cap); }
      if (hs === 'afro') { const cap = new THREE.Mesh(G('afro', () => new THREE.SphereGeometry(0.15, 16, 12)), hm); cap.position.set(0, 0.05, -0.02); head.add(cap); }
      if (hs === 'long') { const tail = new THREE.Mesh(G('tail', () => new THREE.CapsuleGeometry(0.035, 0.12, 4, 8)), hm); tail.position.set(0, -0.06, -0.12); tail.rotation.x = 0.4; head.add(tail); }
    }
    if (o.helmet != null) { const hel = new THREE.Mesh(G('helmet', () => new THREE.SphereGeometry(0.135, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)), M(o.helmet, 0.6, 0.2)); hel.position.y = 0.02; hel.castShadow = sh; head.add(hel); }
    // arms
    for (const s of ['l', 'r']) {
      const side = s === 'l' ? 1 : -1;
      const shoulder = j[s + 'Shoulder'] = new THREE.Group(); shoulder.position.set(0.215 * side * wsc, 0.25, 0); chest.add(shoulder);
      seg(shoulder, G('delt', () => new THREE.SphereGeometry(0.075, 12, 10)), shirt2, 0, false);
      seg(shoulder, G('uarm', () => new THREE.CapsuleGeometry(0.052, 0.2, 4, 10)), o.longSleeves ? shirt2 : skin, -0.15, sh);
      seg(shoulder, G('sleeve', () => new THREE.CylinderGeometry(0.068, 0.064, 0.15, 12)), shirt2, -0.06, false);
      const elbow = j[s + 'Elbow'] = new THREE.Group(); elbow.position.y = -0.29; shoulder.add(elbow);
      seg(elbow, G('farm', () => new THREE.CapsuleGeometry(0.045, 0.19, 4, 10)), o.longSleeves ? shirt2 : skin, -0.12, sh);
      const hand = j[s + 'Hand'] = new THREE.Group(); hand.position.y = -0.27; elbow.add(hand);
      const hm = seg(hand, G('hand', () => new THREE.SphereGeometry(o.gloves != null ? 0.06 : 0.048, 10, 8)), gloves, -0.02, false); hm.scale.set(0.8, 1.15, 0.6);
    }
    // legs
    for (const s of ['l', 'r']) {
      const side = s === 'l' ? 1 : -1;
      const hip = j[s + 'Hip'] = new THREE.Group(); hip.position.set(0.098 * side * wsc, -0.04, 0); body.add(hip);
      seg(hip, G('thigh', () => new THREE.CapsuleGeometry(0.076, 0.3, 4, 12)), skin, -0.22, sh);
      seg(hip, G('shortleg', () => new THREE.CylinderGeometry(0.098, 0.09, 0.22, 14)), shorts, -0.1, false);
      const knee = j[s + 'Knee'] = new THREE.Group(); knee.position.y = -0.44; hip.add(knee);
      seg(knee, G('shin', () => new THREE.CapsuleGeometry(0.058, 0.3, 4, 10)), skin, -0.2, sh);
      seg(knee, G('sock', () => new THREE.CylinderGeometry(0.066, 0.056, 0.3, 12)), socks, -0.24, false);
      const ankle = j[s + 'Ankle'] = new THREE.Group(); ankle.position.y = -0.43; knee.add(ankle);
      const foot = seg(ankle, G('foot', () => new THREE.BoxGeometry(0.095, 0.075, 0.26)), boots, -0.045, sh); foot.position.z = 0.055;
      j[s + 'Foot'] = foot;
    }
    this.rest = {}; for (const n of JOINTS) this.rest[n] = j[n].rotation.clone();
    this.pose({});
  }

  /** Apply an absolute pose (missing joints return to neutral). */
  pose(p) {
    const j = this.j;
    for (const n of JOINTS) { const r = p[n]; if (r) j[n].rotation.set(r[0] || 0, r[1] || 0, r[2] || 0); else j[n].rotation.set(0, 0, 0); }
    const bp = p.bodyPos || [0, 0, 0];
    j.body.position.set(bp[0], PELVIS_Y + bp[1], bp[2]);
  }
  /** World position of a hand/foot/head (e.g. to attach a ball or a weapon). */
  worldOf(part, target = new THREE.Vector3()) { return (this.j[part] || this.j.head).getWorldPosition(target); }
  setVisible(v) { this.root.visible = v; }
  /** Level of detail: hide tiny face/badge meshes when the person is far from the camera. */
  setDetail(on) { if (this._detailOn === on) return; this._detailOn = on; for (const m of this.detail) m.visible = on; }
}

// ---------- pose maths ----------
const lerp = (a, b, k) => a + (b - a) * k;
export const ease = k => k * k * (3 - 2 * k);
/** Blend two poses (k = 0 → a, 1 → b). */
export function mix(a, b, k) {
  const out = {};
  for (const n of [...JOINTS, 'bodyPos']) {
    const x = a[n], y = b[n]; if (!x && !y) continue;
    const xa = x || [0, 0, 0], ya = y || [0, 0, 0];
    out[n] = [lerp(xa[0] || 0, ya[0] || 0, k), lerp(xa[1] || 0, ya[1] || 0, k), lerp(xa[2] || 0, ya[2] || 0, k)];
  }
  return out;
}
/** Keyframe track: frames = [[t, pose], ...] with t ascending in 0..1; smooth between frames. */
export function track(frames, p) {
  if (p <= frames[0][0]) return frames[0][1];
  for (let i = 0; i < frames.length - 1; i++) {
    const [t0, a] = frames[i], [t1, b] = frames[i + 1];
    if (p <= t1) return mix(a, b, ease((p - t0) / Math.max(1e-6, t1 - t0)));
  }
  return frames[frames.length - 1][1];
}
/** Mirror a pose left↔right (turn a right-footed kick into a left-footed one). */
export function mirror(p) {
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (k === 'bodyPos') { out[k] = [-(v[0] || 0), v[1] || 0, v[2] || 0]; continue; }
    const t = k[0] === 'l' ? 'r' + k.slice(1) : k[0] === 'r' ? 'l' + k.slice(1) : k;
    out[t] = [v[0] || 0, -(v[1] || 0), -(v[2] || 0)];
  }
  return out;
}

// ---------- pose library ----------
const ARMS_DOWN = { lShoulder: [0.05, 0, 0.1], rShoulder: [0.05, 0, -0.1], lElbow: [-0.25, 0, 0], rElbow: [-0.25, 0, 0] };
export const Poses = {
  idle(t = 0) {
    const b = Math.sin(t * 2) * 0.015;
    return { ...ARMS_DOWN, spine: [0.03 + b, 0, 0], neck: [-0.03, 0, 0], lKnee: [0.06, 0, 0], rKnee: [0.06, 0, 0], lHip: [-0.03, 0, 0.03], rHip: [-0.03, 0, -0.03], bodyPos: [0, -0.005 + b * 0.3, 0] };
  },
  /** Running cycle. phase in radians (advance by speed), amount 0..1 (0 = standing, 1 = sprint). */
  run(phase, amount = 1) {
    const a = Math.max(0, Math.min(1.2, amount)), s = Math.sin(phase), c = Math.cos(phase);
    const kneeL = 0.15 * a + 1.35 * a * Math.max(0, c), kneeR = 0.15 * a + 1.35 * a * Math.max(0, -c);
    return {
      lHip: [-s * 0.85 * a, 0, 0.03], rHip: [s * 0.85 * a, 0, -0.03],
      lKnee: [kneeL + 0.06, 0, 0], rKnee: [kneeR + 0.06, 0, 0],
      lAnkle: [0.25 * a * Math.max(0, -s), 0, 0], rAnkle: [0.25 * a * Math.max(0, s), 0, 0],
      lShoulder: [s * 0.8 * a, 0, 0.12], rShoulder: [-s * 0.8 * a, 0, -0.12],
      lElbow: [-0.35 - 1.0 * a, 0, 0], rElbow: [-0.35 - 1.0 * a, 0, 0],
      spine: [0.06 + 0.16 * a, 0, 0], chest: [0, s * 0.18 * a, 0], neck: [-0.08 * a, -s * 0.1 * a, 0],
      bodyPos: [0, -0.04 * a + Math.abs(Math.sin(phase)) * 0.055 * a, 0],
    };
  },
  /** Jockey / defensive side-step stance. */
  jockey(t = 0) { return { ...ARMS_DOWN, spine: [0.32, 0, 0], lHip: [-0.35, 0, 0.18], rHip: [-0.35, 0, -0.18], lKnee: [0.6, 0, 0], rKnee: [0.6, 0, 0], lShoulder: [-0.2, 0, 0.45], rShoulder: [-0.2, 0, -0.45], bodyPos: [0, -0.1 + Math.sin(t * 8) * 0.01, 0] }; },
  /** Right-footed strike. p 0..1; contact at p ≈ 0.45. power 0.4 (pass) .. 1 (shot). */
  kick(p, power = 1) {
    const w = power;
    return track([
      [0, Poses.idle()],
      [0.3, { rHip: [0.75 * w, 0, -0.05], rKnee: [1.7 * w, 0, 0], rAnkle: [0.5, 0, 0], lKnee: [0.35, 0, 0], lHip: [-0.25, 0, 0.05], spine: [0.15, -0.15 * w, 0], lShoulder: [-0.5, 0, 0.75], rShoulder: [0.5, 0, -0.55], lElbow: [-0.5, 0, 0], rElbow: [-0.4, 0, 0], bodyPos: [0, -0.05, 0] }],
      [0.45, { rHip: [-0.95 * w, 0, -0.02], rKnee: [0.15, 0, 0], rAnkle: [0.6, 0, 0], lKnee: [0.3, 0, 0], lHip: [0.1, 0, 0.05], spine: [-0.08 * w, 0.15 * w, 0], lShoulder: [-0.9, 0, 0.6], rShoulder: [0.7, 0, -0.5], lElbow: [-0.4, 0, 0], bodyPos: [0, -0.04, 0] }],
      [0.62, { rHip: [-1.45 * w, 0, 0], rKnee: [0.35, 0, 0], rAnkle: [0.5, 0, 0], lKnee: [0.25, 0, 0], lAnkle: [0.4, 0, 0], spine: [-0.15 * w, 0.2 * w, 0], lShoulder: [-0.7, 0, 0.7], rShoulder: [0.6, 0, -0.6], bodyPos: [0, 0.02, 0] }],
      [1, Poses.idle()],
    ], p);
  },
  /** Side-foot pass: the leg turns out and swings through softly. */
  pass(p) {
    return track([
      [0, Poses.idle()],
      [0.32, { rHip: [0.45, -0.55, -0.15], rKnee: [0.9, 0, 0], lKnee: [0.3, 0, 0], spine: [0.12, -0.1, 0], lShoulder: [-0.3, 0, 0.45], rShoulder: [0.3, 0, -0.35] }],
      [0.48, { rHip: [-0.55, -0.6, -0.1], rKnee: [0.2, 0, 0], lKnee: [0.28, 0, 0], spine: [0.05, 0.1, 0], lShoulder: [-0.5, 0, 0.45], rShoulder: [0.4, 0, -0.35] }],
      [0.7, { rHip: [-0.7, -0.4, -0.05], rKnee: [0.3, 0, 0], lKnee: [0.2, 0, 0], spine: [0.05, 0.05, 0] }],
      [1, Poses.idle()],
    ], p);
  },
  /** Chip / lob: short back-lift, stab under the ball, little follow-through. */
  chip(p) {
    return track([
      [0, Poses.idle()],
      [0.3, { rHip: [0.55, 0, -0.04], rKnee: [1.5, 0, 0], lKnee: [0.4, 0, 0], spine: [0.2, 0, 0], lShoulder: [-0.4, 0, 0.7], rShoulder: [0.4, 0, -0.5] }],
      [0.45, { rHip: [-0.5, 0, 0], rKnee: [0.4, 0, 0], rAnkle: [-0.3, 0, 0], lKnee: [0.35, 0, 0], spine: [-0.1, 0, 0], lShoulder: [-0.6, 0, 0.6] }],
      [0.6, { rHip: [-0.6, 0, 0], rKnee: [0.5, 0, 0], spine: [-0.05, 0, 0] }],
      [1, Poses.idle()],
    ], p);
  },
  /** Volley: body opens side-on and the leg comes through high. Contact ≈ 0.45. */
  volley(p) {
    return track([
      [0, Poses.idle()],
      [0.3, { rHip: [0.4, 0.2, -0.6], rKnee: [1.4, 0, 0], lKnee: [0.3, 0, 0], spine: [0.0, -0.4, 0.35], lShoulder: [-0.3, 0, 1.2], rShoulder: [0.2, 0, -0.9], bodyPos: [0, 0.02, 0] }],
      [0.45, { rHip: [-1.25, 0.2, -0.75], rKnee: [0.15, 0, 0], lKnee: [0.25, 0, 0], spine: [-0.1, 0.35, 0.45], lShoulder: [-0.4, 0, 1.3], rShoulder: [0.3, 0, -1.1], bodyPos: [0, 0.03, 0] }],
      [0.65, { rHip: [-1.3, 0.2, -0.5], rKnee: [0.35, 0, 0], spine: [-0.05, 0.4, 0.3], lShoulder: [-0.3, 0, 1.0] }],
      [1, Poses.idle()],
    ], p);
  },
  /** Header: crouch, spring (the game lifts the root), snap the head through at p ≈ 0.55. */
  header(p) {
    return track([
      [0, Poses.idle()],
      [0.25, { lKnee: [1.0, 0, 0], rKnee: [1.0, 0, 0], lHip: [-0.6, 0, 0.05], rHip: [-0.6, 0, -0.05], spine: [0.25, 0, 0], lShoulder: [0.4, 0, 0.3], rShoulder: [0.4, 0, -0.3], bodyPos: [0, -0.22, 0] }],
      [0.45, { lKnee: [0.4, 0, 0], rKnee: [0.6, 0, 0], spine: [-0.35, 0, 0], neck: [-0.4, 0, 0], lShoulder: [-1.4, 0, 0.7], rShoulder: [-1.4, 0, -0.7], lElbow: [-1.0, 0, 0], rElbow: [-1.0, 0, 0] }],
      [0.58, { lKnee: [0.5, 0, 0], rKnee: [0.8, 0, 0], spine: [0.45, 0, 0], neck: [0.35, 0, 0], lShoulder: [-0.6, 0, 0.9], rShoulder: [-0.6, 0, -0.9] }],
      [0.85, { lKnee: [0.6, 0, 0], rKnee: [0.6, 0, 0], spine: [0.2, 0, 0], bodyPos: [0, -0.12, 0] }],
      [1, Poses.idle()],
    ], p);
  },
  /** Chest control: lean back, arms wide, cushion the ball. */
  chest(p) {
    return track([
      [0, Poses.idle()],
      [0.3, { spine: [-0.45, 0, 0], chest: [-0.15, 0, 0], neck: [0.3, 0, 0], lShoulder: [-0.4, 0, 1.15], rShoulder: [-0.4, 0, -1.15], lElbow: [-0.4, 0, 0], rElbow: [-0.4, 0, 0], lKnee: [0.35, 0, 0], rKnee: [0.35, 0, 0], bodyPos: [0, -0.05, -0.04] }],
      [0.6, { spine: [-0.15, 0, 0], lShoulder: [-0.2, 0, 0.8], rShoulder: [-0.2, 0, -0.8], lKnee: [0.25, 0, 0], rKnee: [0.25, 0, 0] }],
      [1, Poses.idle()],
    ], p);
  },
  /** Bicycle (overhead) kick. The game should also rotate/lift via bodyPos. Contact ≈ 0.5. */
  bicycle(p) {
    return track([
      [0, Poses.idle()],
      [0.12, { lKnee: [1.0, 0, 0], rKnee: [1.0, 0, 0], lHip: [-0.6, 0, 0], rHip: [-0.6, 0, 0], spine: [0.2, 0, 0], bodyPos: [0, -0.2, 0] }],
      [0.27, { body: [-1.5, 0, 0], lHip: [-1.7, 0, 0.1], lKnee: [0.3, 0, 0], rHip: [0.25, 0, -0.1], rKnee: [1.2, 0, 0], lShoulder: [0.2, 0, 1.4], rShoulder: [0.2, 0, -1.4], neck: [0.4, 0, 0], bodyPos: [0, 0.35, 0] }],
      [0.38, { body: [-2.25, 0, 0], lHip: [0.3, 0, 0.1], lKnee: [1.0, 0, 0], rHip: [-2.1, 0, -0.1], rKnee: [0.1, 0, 0], rAnkle: [0.6, 0, 0], lShoulder: [0.4, 0, 1.5], rShoulder: [0.4, 0, -1.5], neck: [0.5, 0, 0], bodyPos: [0, 0.5, 0] }],
      [0.58, { body: [-1.55, 0, 0], lHip: [-0.5, 0, 0.2], rHip: [-1.0, 0, -0.2], lKnee: [0.5, 0, 0], rKnee: [0.5, 0, 0], lShoulder: [0.9, 0, 1.0], rShoulder: [0.9, 0, -1.0], neck: [0.5, 0, 0], bodyPos: [0, -0.62, 0] }],
      [0.78, { body: [-1.5, 0, 0], lHip: [-0.4, 0, 0.1], rHip: [-0.6, 0, -0.1], lKnee: [0.6, 0, 0], rKnee: [0.4, 0, 0], lShoulder: [1.0, 0, 0.8], rShoulder: [1.0, 0, -0.8], bodyPos: [0, -0.8, 0] }],
      [1, { body: [-0.6, 0, 0], lKnee: [1.4, 0, 0], rKnee: [1.6, 0, 0], lHip: [-1.4, 0, 0.1], rHip: [-1.5, 0, -0.1], spine: [0.6, 0, 0], lShoulder: [0.4, 0, 0.3], rShoulder: [0.4, 0, -0.3], bodyPos: [0, -0.62, 0] }],
    ], p);
  },
  /** Sliding tackle: lead (left) leg straight, body low and leaning back. */
  slide(p) {
    const low = { body: [-0.95, 0.25, 0.2], lHip: [-1.45, 0, 0.1], lKnee: [0.05, 0, 0], lAnkle: [-0.2, 0, 0], rHip: [-0.35, 0, -0.35], rKnee: [1.6, 0, 0], lShoulder: [0.4, 0, 0.6], rShoulder: [0.9, 0, -0.7], rElbow: [-0.3, 0, 0], spine: [0.35, 0, 0], neck: [0.5, 0, 0], bodyPos: [0, -0.72, 0] };
    return track([[0, Poses.run(0, 1)], [0.18, low], [0.75, low], [1, { ...low, body: [-0.5, 0, 0], lKnee: [1.2, 0, 0], bodyPos: [0, -0.5, 0] }]], p);
  },
  /** Standing tackle: lunge and poke the ball with the right foot. */
  tackle(p) {
    return track([
      [0, Poses.idle()],
      [0.35, { spine: [0.4, 0, 0], rHip: [-1.0, 0.2, -0.2], rKnee: [0.25, 0, 0], lKnee: [0.75, 0, 0], lHip: [0.2, 0, 0], lShoulder: [-0.5, 0, 0.6], rShoulder: [0.4, 0, -0.6], bodyPos: [0, -0.16, 0.12] }],
      [0.6, { spine: [0.35, 0, 0], rHip: [-0.8, 0.2, -0.2], rKnee: [0.4, 0, 0], lKnee: [0.7, 0, 0], bodyPos: [0, -0.14, 0.1] }],
      [1, Poses.idle()],
    ], p);
  },
  /** Goalkeeper ready stance. */
  keeperReady(t = 0) {
    const b = Math.sin(t * 6) * 0.015;
    return { spine: [0.32, 0, 0], neck: [-0.3, 0, 0], lHip: [-0.45, 0, 0.2], rHip: [-0.45, 0, -0.2], lKnee: [0.75, 0, 0], rKnee: [0.75, 0, 0], lAnkle: [-0.25, 0, 0], rAnkle: [-0.25, 0, 0], lShoulder: [-0.75, 0, 0.55], rShoulder: [-0.75, 0, -0.55], lElbow: [-0.7, 0, 0], rElbow: [-0.7, 0, 0], bodyPos: [0, -0.16 + b, 0] };
  },
  /** Goalkeeper dive. side +1 = dive to the keeper's LEFT, −1 = RIGHT. height 0 (low) .. 1 (top corner). */
  dive(p, side = 1, height = 0.5) {
    const tilt = -side * (1.25 - height * 0.35);
    const ext = { body: [0.05, 0, tilt], spine: [0, 0, -side * 0.15], lShoulder: [-2.9 + (side > 0 ? 0 : 0.3), 0, side > 0 ? 0.3 : 0.1], rShoulder: [-2.9 + (side < 0 ? 0 : 0.3), 0, side < 0 ? -0.3 : -0.1], lElbow: [-0.1, 0, 0], rElbow: [-0.1, 0, 0], lHip: [0.1, 0, side * 0.25], rHip: [0.1, 0, side * 0.25], lKnee: [0.25, 0, 0], rKnee: [0.35, 0, 0] };
    return track([
      [0, Poses.keeperReady()],
      [0.08, { ...Poses.keeperReady(), bodyPos: [0, -0.28, 0], lKnee: [1.1, 0, 0], rKnee: [1.1, 0, 0] }],
      [0.3, { ...ext, bodyPos: [0, 0.1 + height * 0.5, 0] }],
      [0.66, { ...ext, bodyPos: [0, -0.62, 0] }],
      [1, { ...ext, body: [0.05, 0, -side * 1.5], bodyPos: [0, -0.8, 0], lShoulder: [-2.2, 0, 0.4], rShoulder: [-2.2, 0, -0.4] }],
    ], p);
  },
  /** Goalkeeper central save: spring straight up / chest-catch. */
  saveMiddle(p, high = false) {
    return track([
      [0, Poses.keeperReady()],
      [0.2, { ...Poses.keeperReady(), bodyPos: [0, -0.25, 0], lKnee: [1.0, 0, 0], rKnee: [1.0, 0, 0] }],
      [0.45, high ? { lShoulder: [-2.9, 0, 0.25], rShoulder: [-2.9, 0, -0.25], lElbow: [-0.2, 0, 0], rElbow: [-0.2, 0, 0], spine: [-0.1, 0, 0], lKnee: [0.4, 0, 0], rKnee: [0.6, 0, 0], bodyPos: [0, 0.25, 0] }
        : { lShoulder: [-1.4, 0, 0.3], rShoulder: [-1.4, 0, -0.3], lElbow: [-1.3, 0, 0], rElbow: [-1.3, 0, 0], spine: [0.35, 0, 0], lKnee: [0.6, 0, 0], rKnee: [0.6, 0, 0], bodyPos: [0, -0.1, 0] }],
      [1, Poses.keeperReady()],
    ], p);
  },
  /** Throw-in: ball held overhead with both hands. */
  throwIn(p) {
    return track([
      [0, { lShoulder: [-3.0, 0, 0.2], rShoulder: [-3.0, 0, -0.2], lElbow: [-1.6, 0, 0], rElbow: [-1.6, 0, 0], spine: [-0.25, 0, 0], neck: [0.1, 0, 0] }],
      [0.5, { lShoulder: [-3.3, 0, 0.2], rShoulder: [-3.3, 0, -0.2], lElbow: [-1.9, 0, 0], rElbow: [-1.9, 0, 0], spine: [-0.4, 0, 0], lKnee: [0.2, 0, 0], rKnee: [0.4, 0, 0], rHip: [0.3, 0, 0] }],
      [0.75, { lShoulder: [-2.2, 0, 0.2], rShoulder: [-2.2, 0, -0.2], lElbow: [-0.2, 0, 0], rElbow: [-0.2, 0, 0], spine: [0.3, 0, 0], rHip: [0.2, 0, 0] }],
      [1, Poses.idle()],
    ], p);
  },
  /** Celebration: arms up and pumping. */
  celebrate(t) {
    const w = Math.sin(t * 9);
    return { ...Poses.run(t * 9, 0.55), lShoulder: [-2.7 + w * 0.2, 0, 0.5], rShoulder: [-2.7 - w * 0.2, 0, -0.5], lElbow: [-0.3, 0, 0], rElbow: [-0.3, 0, 0], spine: [-0.25, 0, 0], neck: [-0.35, 0, 0], bodyPos: [0, Math.abs(Math.sin(t * 9)) * 0.08, 0] };
  },
  /** Knee slide celebration. */
  kneeSlide(t) {
    return { lHip: [-0.3, 0, 0.3], rHip: [-0.3, 0, -0.3], lKnee: [2.3, 0, 0], rKnee: [2.3, 0, 0], lAnkle: [0.8, 0, 0], rAnkle: [0.8, 0, 0], spine: [-0.5, 0, 0], neck: [-0.4, 0, 0], lShoulder: [-2.6, 0, 0.9], rShoulder: [-2.6, 0, -0.9], lElbow: [-0.2, 0, 0], rElbow: [-0.2, 0, 0], bodyPos: [0, -0.62, 0] };
  },
  /** Fallen on the ground (face down) after a foul. */
  fallen(p = 1) { return mix(Poses.idle(), { body: [1.45, 0, 0.1], lShoulder: [-1.6, 0, 0.5], rShoulder: [-1.4, 0, -0.5], lKnee: [0.3, 0, 0], bodyPos: [0, -0.82, 0.1] }, p); },
  crouch() { return { spine: [0.3, 0, 0], lHip: [-1.2, 0, 0.15], rHip: [-0.9, 0, -0.15], lKnee: [1.9, 0, 0], rKnee: [2.0, 0, 0], lAnkle: [-0.6, 0, 0], rAnkle: [-0.5, 0, 0], ...ARMS_DOWN, bodyPos: [0, -0.42, 0] }; },
  prone() { return { body: [1.5, 0, 0], neck: [-1.0, 0, 0], lShoulder: [-2.6, 0, 0.4], rShoulder: [-2.4, 0, -0.4], lElbow: [-1.2, 0, 0], rElbow: [-1.4, 0, 0], lHip: [0, 0, 0.15], rHip: [0, 0, -0.15], bodyPos: [0, -0.84, 0] }; },
  /** Two-handed rifle hold (combine with run legs). aim 0 = low ready, 1 = shouldered. */
  rifle(aim = 1) {
    return {
      rShoulder: [-0.9 - aim * 0.45, 0.25, -0.25], rElbow: [-1.5 + aim * 0.2, 0, 0],
      lShoulder: [-1.25 - aim * 0.25, -0.55, 0.15], lElbow: [-0.95 + aim * 0.15, 0, 0],
      chest: [0, 0.25, 0], neck: [0, -0.2, 0],
    };
  },
  /** Overhead throw (grenade, ball). Release ≈ 0.55. */
  throwArm(p) {
    return track([
      [0, {}],
      [0.4, { rShoulder: [-2.6, 0, -0.5], rElbow: [-1.6, 0, 0], lShoulder: [-1.2, 0, 0.3], spine: [-0.2, -0.4, 0] }],
      [0.55, { rShoulder: [-1.4, 0, -0.2], rElbow: [-0.2, 0, 0], lShoulder: [-0.2, 0, 0.3], spine: [0.25, 0.3, 0] }],
      [1, {}],
    ], p);
  },
  /** Melee slash with the right hand (knife / pickaxe). Hit ≈ 0.45. */
  slash(p) {
    return track([
      [0, {}],
      [0.3, { rShoulder: [-2.2, 0, -0.9], rElbow: [-1.2, 0, 0], chest: [0, -0.4, 0] }],
      [0.45, { rShoulder: [-0.9, 0, 0.4], rElbow: [-0.3, 0, 0], chest: [0.1, 0.45, 0] }],
      [1, {}],
    ], p);
  },
};

/** Merge pose layers (later layers override earlier joints). */
export function layer(...poses) { return Object.assign({}, ...poses); }
