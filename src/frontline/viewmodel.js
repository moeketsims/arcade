// First-person viewmodel: drawn in its own scene/camera pass (never clips into walls) with arms, ADS alignment, bob, sway,
// recoil kick, reload / inspect / melee / throw animations and the muzzle flash.
import * as THREE from 'three';
import { buildGun, buildKnife, buildGrenade, MAT } from './guns.js';
import { MELEE } from './data.js';
import { Tex } from './textures.js';
import { Spring, clamp, lerp, smooth, kf, damp } from './util.js';

const V = () => new THREE.Vector3();
const _a = V(), _b = V(), _c = V(), _d = V();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const bump = (t, a, b) => smooth((t - a) / Math.max(1e-4, b - a));

const SLEEVE = 0x4b5036, GLOVE = 0x1c1f24, GLOVE2 = 0x2c3038;
const SH_R = new THREE.Vector3(0.34, -0.5, 0.28), SH_L = new THREE.Vector3(-0.3, -0.5, 0.22);
const WR_R = new THREE.Vector3(0.018, -0.03, 0.075), WR_L = new THREE.Vector3(0, -0.03, 0.08), WR_T = new THREE.Vector3(0, -0.02, 0.07);
const PARK = new THREE.Vector3(-0.12, -0.2, -0.42), GRIP0 = new THREE.Vector3(0, -0.05, 0.02);

function makeHand(left) {
  const g = new THREE.Group();
  const gl = MAT(GLOVE, 0.85, 0.05), gl2 = MAT(GLOVE2, 0.8, 0.05);
  const add = (w, h, l, x, y, z, m = gl, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
  if (left) {
    add(0.075, 0.032, 0.095, 0, -0.012, 0.0);                    // palm (under the handguard)
    add(0.016, 0.05, 0.085, 0.034, 0.012, -0.01, gl2, 0, 0, 0.3); // fingers wrapping up the near side... (appear on the right of the left hand)
    add(0.016, 0.05, 0.085, -0.034, 0.012, -0.01, gl2, 0, 0, -0.3); // thumb side
    add(0.07, 0.022, 0.03, 0, 0.0, -0.05, gl2);                 // knuckles
  } else {
    add(0.05, 0.085, 0.07, 0.012, -0.01, 0.01);                 // palm on the grip
    add(0.012, 0.075, 0.05, -0.02, -0.005, -0.012, gl2);          // fingers wrapping the front
    add(0.04, 0.025, 0.05, -0.012, 0.045, -0.02, gl2, 0.3);      // thumb over the top
    add(0.056, 0.02, 0.02, 0.012, 0.04, 0.045, gl2);            // back-of-hand strap
  }
  g.traverse(o => { o.frustumCulled = false; });
  return g;
}

function makeArm() {
  const geo = new THREE.CylinderGeometry(1, 0.86, 1, 10, 1);
  const m = new THREE.Mesh(geo, MAT(SLEEVE, 0.9, 0.0)); m.frustumCulled = false; return m;
}

export class Viewmodel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.02, 8);
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight(0xdfeaff, 0x6a6458, 1.1));
    const sun = new THREE.DirectionalLight(0xfff2dc, 1.7); sun.position.set(0.6, 1.0, 0.7); this.scene.add(sun);
    this.mlight = new THREE.PointLight(0xffb866, 0, 3, 2); this.scene.add(this.mlight);
    this.root = new THREE.Group(); this.root.rotation.order = 'YXZ'; this.scene.add(this.root);
    this.holder = new THREE.Group(); this.root.add(this.holder);
    // arms and hands live in viewmodel space (not under the gun) so reload can move the left hand freely
    this.armR = makeArm(); this.armL = makeArm(); this.handR = makeHand(false); this.handL = makeHand(true);
    this.scene.add(this.armR, this.armL, this.handR, this.handL);
    // muzzle flash
    const ft = Tex.flash();
    const fm = new THREE.MeshBasicMaterial({ map: ft, color: ft ? 0xffffff : 0xffc060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.flash = new THREE.Group();
    for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), fm); p.rotation.set(i === 2 ? Math.PI / 2 : 0, i === 1 ? Math.PI / 2 : 0, 0); this.flash.add(p); }
    this.flash.visible = false; this.flashT = 0; this.flashMat = fm;
    // state
    this.models = new Map(); this.cur = null; this.curKey = ''; this.mode = 'gun';
    this.kz = new Spring(150, 17); this.kp = new Spring(140, 16); this.kr = new Spring(120, 14); this.ky = new Spring(130, 15);
    this.swX = new Spring(70, 12); this.swY = new Spring(70, 12); this.swR = new Spring(60, 11);
    this.boltK = 0; this.time = 0; this.anim = null; this.inspectT = -1; this.tiltZ = 0;
    this.equip = 1; this.hidden = false;
    this.sightWorld = V();
  }
  setEnvironment(tex) { this.scene.environment = tex; this.scene.environmentIntensity = 0.9; }
  resize(aspect) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }

  // ---------------------------------------------------------------------------------------------------------
  // items
  // ---------------------------------------------------------------------------------------------------------
  _model(key, make) { let m = this.models.get(key); if (!m) { m = make(); this.models.set(key, m); } return m; }
  _attach(group, kind) {
    if (this.cur && this.cur !== group) this.holder.remove(this.cur);
    this.cur = group; this.holder.add(group);
    this.mode = kind; this.curKey = group.name;
    const ud = group.userData;
    // flash group lives on the muzzle anchor
    if (this.flash.parent) this.flash.parent.remove(this.flash);
    if (kind === 'gun' && ud.anchors?.muzzle) ud.anchors.muzzle.add(this.flash);
    this.boltK = 0; this.inspectT = -1; this.anim = null;
    if (ud.anchors?.mag && ud.magRest) ud.anchors.mag.position.copy(ud.magRest);
    if (ud.anchors?.bolt && ud.boltRest) { ud.anchors.bolt.position.copy(ud.boltRest); ud.anchors.bolt.rotation.set(0, 0, 0); }
    if (ud.anchors?.mag) { ud.anchors.mag.visible = true; ud.anchors.mag.rotation.set(0, 0, 0); }
  }
  setWeapon(weapon) {
    const a = weapon.att, key = `gun:${weapon.id}|${a.optic}|${a.muzzle}|${a.mag}|${a.stock}`;
    const m = this._model(key, () => { const g = buildGun(weapon.id, a); g.name = key; return g; });
    this.weapon = weapon; this.gunModel = m; this._attach(m, 'gun');
    return m.userData;
  }
  setKnife(id) {
    const m = this._model('knife:' + id, () => { const g = buildKnife(id); g.name = 'knife:' + id; return g; });
    this.knifeId = id; this.knifeModel = m; this._attach(m, 'knife');
  }
  setGrenade(kind) {
    const m = this._model('nade:' + kind, () => { const g = buildGrenade(kind); g.name = 'nade:' + kind; return g; });
    this.nadeKind = kind; this._attach(m, 'throw');
    if (m.userData.pin) m.userData.pin.visible = true;
  }
  /** Temporarily swap the shown item without losing the gun (quick melee, throws); call restore() afterwards. */
  swapTo(kind, id) {
    this._saved = this._saved || { gun: this.gunModel, kind: this.mode };
    if (kind === 'knife') this.setKnife(id); else this.setGrenade(id);
  }
  restoreGun() {
    if (this.gunModel) this._attach(this.gunModel, 'gun');
    this._saved = null; this.anim = null;
  }

  // ---------------------------------------------------------------------------------------------------------
  // events from the game
  // ---------------------------------------------------------------------------------------------------------
  kick(power = 0.03, pitch = 0.03) {
    this.kz.x += power * 1.0; this.kp.x += pitch * 1.4; this.kr.x += (Math.random() - 0.5) * power * 1.6; this.ky.x += (Math.random() - 0.5) * power * 0.9;
    this.boltK = 1;
  }
  muzzleFlash(scale = 1, suppressed = false) {
    if (this.mode !== 'gun') return;
    this.flashT = suppressed ? 0.035 : 0.055; this.flashScale = suppressed ? 0.35 : scale;
    this.flash.visible = true; this.flash.rotation.z = Math.random() * 6.28;
    this.flash.scale.setScalar(this.flashScale * (0.8 + Math.random() * 0.5)); this.flashMat.opacity = 1;
    this.mlight.intensity = suppressed ? 0.08 : 0.4 * Math.min(1.6, scale);
  }
  play(type, dur) { this.anim = { type, t: 0, dur }; if (type === 'inspect') this.inspectT = 0; }
  cancelAnim() { this.anim = null; this.inspectT = -1; }
  get inspecting() { return this.anim?.type === 'inspect'; }

  // ---------------------------------------------------------------------------------------------------------
  // projection helpers: convert a point on the viewmodel into the main world so tracers/casings start at the visible muzzle
  // ---------------------------------------------------------------------------------------------------------
  toWorld(vmPoint, mainCam, dist, out) {
    _a.copy(vmPoint).project(this.camera);
    _b.set(_a.x, _a.y, 0.5).unproject(mainCam).sub(mainCam.position).normalize();
    return out.copy(mainCam.position).addScaledVector(_b, dist);
  }
  muzzleWorld(mainCam, out, dist = 0.9) {
    const ud = this.cur?.userData; if (!ud?.anchors?.muzzle) return out.copy(mainCam.position);
    ud.anchors.muzzle.getWorldPosition(_c);
    return this.toWorld(_c, mainCam, dist, out);
  }
  ejectWorld(mainCam, out) {
    const ud = this.cur?.userData; if (!ud?.anchors?.eject) return out.copy(mainCam.position);
    ud.anchors.eject.getWorldPosition(_c);
    return this.toWorld(_c, mainCam, 0.7, out);
  }

  // ---------------------------------------------------------------------------------------------------------
  // per-frame
  // ---------------------------------------------------------------------------------------------------------
  /**
   * st: { adsT, sprintT, tacT, slideT, speed, bobPhase, bobAmp, lookYaw, lookPitch (rad this frame), moveX, equip (0..1), air, mantleT,
   *       reload: {active, progress, kind, t, per, phase} | null, bolt: 0..1 cycle progress or -1, hidden (scoped) }
   */
  update(dt, st, weapon = null) {
    this.time += dt;
    const ud = this.cur?.userData; if (!ud) return;
    const gun = this.mode === 'gun', knife = this.mode === 'knife', thr = this.mode === 'throw';
    // ----- base poses
    const ads = gun ? smooth(st.adsT) : 0;
    let hip = ud.hip || [0.19, -0.19, -0.3];
    if (knife) hip = [0.2, -0.22, -0.4]; else if (thr) hip = [0.2, -0.19, -0.34];
    let px = hip[0], py = hip[1], pz = hip[2], rx = 0, ry = gun ? 0.075 : 0.1, rz = 0;
    if (knife) { rx = 0.35; ry = 0.12; rz = 0.1; }
    if (gun && ads > 0) {
      const s = ud.anchors.sight, d = ud.adsDist;
      px = lerp(px, -s.x, ads); py = lerp(py, -s.y, ads); pz = lerp(pz, -d - s.z, ads);
      ry = lerp(ry, 0, ads); rx = lerp(rx, 0, ads);
    }
    // ----- movement layers
    const inv = 1 - ads * 0.78;
    const amp = (st.bobAmp || 0) * inv;
    const ph = st.bobPhase || 0;
    px += Math.sin(ph) * 0.011 * amp; py += (Math.abs(Math.cos(ph)) * 0.012 - 0.006) * amp; rz += Math.sin(ph) * 0.012 * amp; rx += Math.sin(ph * 2) * 0.006 * amp;
    py += Math.sin(this.time * 1.7) * 0.0016 * inv;
    // look sway: weapon lags behind the camera
    const dts = Math.max(dt, 1 / 240), vy = clamp((st.lookYaw || 0) / dts, -9, 9), vp = clamp((st.lookPitch || 0) / dts, -9, 9);
    const swScale = (weapon?.stats.swayMul || 1) * (ud.launcher ? 1.4 : 1) * inv;
    const sx = this.swX.update(dt, -vy * 0.0042 * swScale), sy = this.swY.update(dt, vp * 0.0036 * swScale);
    const sr = this.swR.update(dt, -vy * 0.0034 * swScale - (st.moveX || 0) * 0.035);
    px += sx; py += sy; ry += -sx * 1.8; rx += sy * 1.6; rz += sr;
    // spring kick
    this.kz.update(dt); this.kp.update(dt); this.kr.update(dt); this.ky.update(dt);
    const kkz = ads > 0.5 ? 0.6 : 1;
    pz += this.kz.x * kkz; rx += this.kp.x * (1 - ads * 0.4); rz += this.kr.x; ry += this.ky.x;
    // sprint / tactical sprint / slide / mantle / air
    const sp = smooth(st.sprintT || 0), tac = smooth(st.tacT || 0), sl = smooth(st.slideT || 0), mt = smooth(st.mantleT || 0);
    if (sp > 0 && !thr) { px += -0.05 * sp; py += -0.012 * sp; pz += 0.0; rx += -0.12 * sp; ry += 0.55 * sp; rz += 0.16 * sp; }
    if (tac > 0 && !thr) { px += -0.08 * tac; py += 0.04 * tac; pz += 0.0; rx += 0.8 * tac; ry += 0.55 * tac; rz += -0.35 * tac; }
    if (sl > 0) { py += -0.035 * sl; rz += -0.32 * sl; rx += 0.1 * sl; px += 0.02 * sl; }
    if (mt > 0) { py += -0.14 * mt; rx += -0.5 * mt; px += 0.05 * mt; }
    if (st.air) { py += 0.012; rx += 0.03; }
    // equip: lower + tilt when not fully drawn
    const eq = smooth(st.equip ?? 1);
    py += (eq - 1) * 0.34; rx += (eq - 1) * 0.75; pz += (eq - 1) * 0.06;

    // ----- item-specific animation
    let leftTarget = null, leftRoll = 0, leftHide = false, rightHide = false;
    const anchors = ud.anchors || {};
    // restore parts to rest first
    if (anchors.mag && ud.magRest) { anchors.mag.position.copy(ud.magRest); anchors.mag.rotation.set(0, 0, 0); anchors.mag.visible = true; }
    if (anchors.bolt && ud.boltRest) { anchors.bolt.position.copy(ud.boltRest); anchors.bolt.rotation.set(0, 0, 0); }
    const bolt = anchors.bolt;
    // bolt / slide recoil
    this.boltK = Math.max(0, this.boltK - dt * 11);
    if (gun && bolt && ud.boltRest) {
      if (ud.hinge) { /* double barrel: handled by reload */ }
      else if (weapon?.stats.bolt && weapon.boltT > 0) {
        const cyc = 1 - weapon.boltT / weapon.stats.bolt;
        const up = bump(cyc, 0.12, 0.28) - bump(cyc, 0.8, 0.92), back = bump(cyc, 0.28, 0.5) - bump(cyc, 0.5, 0.72);
        bolt.rotation.z = -up * 1.1; bolt.position.z = ud.boltRest.z + 0.075 * back;
        // the whole rifle rolls a little as the shooter works the bolt
        rz += up * 0.08; px += -up * 0.01;
        leftTarget = null;
      } else if (weapon?.def.model === 'pump' && weapon.boltT > 0) {
        const cyc = 1 - weapon.boltT / weapon.stats.bolt;
        const k = Math.sin(Math.PI * clamp(cyc * 1.15, 0, 1)); bolt.position.z = ud.boltRest.z + 0.12 * k;
        leftTarget = bolt.position.clone().add(new THREE.Vector3(0, -0.05, 0));
      } else bolt.position.z = ud.boltRest.z + ud.boltTravel * this.boltK;
    }
    // reload
    const rl = st.reload;
    if (gun && rl && rl.active) this._reload(ud, rl, weapon, (p) => { px += p.x; py += p.y; pz += p.z; rx += p.rx; ry += p.ry; rz += p.rz; }, o => { leftTarget = o.target; leftRoll = o.roll || 0; leftHide = !!o.hide; });
    // scripted animations (inspect, melee, throw, plant, pin)
    const an = this.anim;
    if (an) {
      an.t += dt;
      const k = clamp(an.t / an.dur, 0, 1);
      const o = this._anim(an.type, k, ud, weapon);
      if (o) {
        px += o.p[0]; py += o.p[1]; pz += o.p[2]; rx += o.p[3]; ry += o.p[4]; rz += o.p[5];
        if (o.leftHide) leftHide = true; if (o.leftTarget) leftTarget = o.leftTarget;
        if (o.hideItem) this.cur.visible = false; else this.cur.visible = true;
        if (o.pinOff && ud.pin) ud.pin.visible = false;
      }
      if (an.t >= an.dur) { this.anim = null; this.cur.visible = true; }
    } else if (this.cur) this.cur.visible = true;
    this.inspectT = this.anim?.type === 'inspect' ? this.anim.t : -1;

    // ----- apply root transform
    this.root.position.set(px, py, pz);
    this.root.rotation.set(rx, ry, rz);
    this.root.visible = !st.hidden;
    this.root.updateMatrixWorld(true);

    // ----- hands & arms
    const showArms = !st.hidden;
    this.handR.visible = this.armR.visible = showArms && !rightHide;
    this.handL.visible = this.armL.visible = showArms && !leftHide;
    this.root.getWorldQuaternion(_q);
    // right hand follows the grip
    if (knife || thr) _a.set(...(ud.grip || [0, 0, 0.02])); else _a.copy(anchors.grip || GRIP0);
    _a.applyMatrix4(this.cur.matrixWorld);
    this.handR.position.copy(_a); this.handR.quaternion.copy(_q);
    this._arm(this.armR, SH_R, _a, _q, 0.045, WR_R);
    // left hand
    if (knife) { this.handL.visible = this.armL.visible = false; }
    else if (thr) {
      _b.copy(PARK); let lh = this.anim?.type === 'pin' && leftTarget ? leftTarget : null;
      if (lh) _b.copy(lh).applyMatrix4(this.cur.matrixWorld);
      this.handL.position.copy(_b); this.handL.quaternion.copy(_q); this._arm(this.armL, SH_L, _b, _q, 0.04, WR_T);
    } else {
      const lt = leftTarget || anchors.fore;
      if (lt) {
        _b.copy(lt).applyMatrix4(this.cur.matrixWorld);
        this.handL.position.copy(_b); this.handL.quaternion.copy(_q);
        if (leftRoll) { _q2.setFromAxisAngle(_d.set(0, 0, 1), leftRoll); this.handL.quaternion.multiply(_q2); }
        this._arm(this.armL, SH_L, _b, _q, 0.042, WR_L);
      }
    }

    // ----- flash
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) { this.flash.visible = false; this.mlight.intensity = 0; } else this.flashMat.opacity = clamp(this.flashT / 0.05, 0, 1);
      if (this.flash.visible && ud.anchors?.muzzle) { ud.anchors.muzzle.getWorldPosition(_d); this.mlight.position.copy(_d).add(_c.set(0, 0.02, 0.05)); }
    } else if (this.mlight.intensity > 0) this.mlight.intensity = 0;
  }

  _arm(mesh, shoulder, wristTarget, q, r, wristOffsetLocal) {
    _c.copy(wristOffsetLocal).applyQuaternion(q).add(wristTarget);   // wrist point (behind the hand)
    _d.subVectors(_c, shoulder); const len = _d.length(); if (len < 1e-4) return;
    _d.divideScalar(len); _q2.setFromUnitVectors(UP, _d);
    mesh.quaternion.copy(_q2); mesh.position.copy(shoulder).addScaledVector(_d, len * 0.5); mesh.scale.set(r, len, r);
  }

  /** Reload choreography. apply(p) adds a root offset; hand(o) positions the left hand in gun space. */
  _reload(ud, rl, weapon, apply, hand) {
    const A = ud.anchors, P = rl.progress, kind = rl.kind, empty = kind === 'empty';
    const fore = A.fore, mag = A.mag, bolt = A.bolt;
    const T = V();
    if (rl.kind === 'shell') {
      // shell-by-shell: dip the gun, left hand shuttles between a pouch and the loading port
      const port = (mag ? mag.position : fore).clone().add(new THREE.Vector3(0, -0.05, 0.0));
      const pouch = port.clone().add(new THREE.Vector3(-0.08, -0.22, 0.12));
      const open = bump(P, 0, 0.08) * (1 - bump(P, 0.92, 1));
      apply({ x: -0.06 * open, y: 0.06 * open, z: 0.02 * open, rx: 0.3 * open, ry: -0.12 * open, rz: -0.5 * open });
      const sh = rl.phase === 'start' ? 0.85 : 0.5 + 0.5 * Math.sin((rl.t / Math.max(0.2, rl.per)) * Math.PI * 2 - Math.PI / 2);
      T.lerpVectors(port, pouch, rl.phase === 'start' ? sh : 1 - sh);
      hand({ target: T, roll: 0 });
      return;
    }
    // tilt the weapon so the magazine well opens towards the shooter
    const total = empty ? 0.96 : 0.88;
    const open = bump(P, 0.0, 0.14) * (1 - bump(P, total, total + 0.08));
    const pistol = ud.pistol;
    apply({ x: -0.07 * open, y: 0.07 * open, z: 0.02 * open, rx: (pistol ? 0.3 : 0.18) * open, ry: -0.15 * open, rz: -(ud.launcher ? 0.12 : 0.5) * open });
    if (ud.hinge && bolt) {                 // break-action
      const br = bump(P, 0.08, 0.28) - bump(P, 0.72, 0.9);
      bolt.rotation.x = -0.62 * br;
      const ejectK = bump(P, 0.3, 0.45) - bump(P, 0.5, 0.58);
      const target = fore.clone().add(new THREE.Vector3(0.0, 0.0, 0.18));
      const pouch = target.clone().add(new THREE.Vector3(-0.1, -0.25, 0.1));
      T.fromArray(kf([[0, [fore.x, fore.y, fore.z]], [0.12, [target.x, target.y, target.z]], [0.35, [target.x, target.y, target.z]], [0.45, [pouch.x, pouch.y, pouch.z]], [0.62, [target.x, target.y, target.z]], [0.85, [fore.x, fore.y, fore.z]], [1, [fore.x, fore.y, fore.z]]], P));
      hand({ target: T }); return;
    }
    if (ud.revolver && mag) {               // swing-out cylinder
      const sw = bump(P, 0.1, 0.25) - bump(P, 0.7, 0.85);
      mag.position.x = ud.magRest.x - 0.05 * sw; mag.position.y = ud.magRest.y - 0.02 * sw; mag.rotation.y = 0.9 * sw; mag.rotation.z = 0.2 * sw;
      const cyl = mag.position.clone(); const pouch = cyl.clone().add(new THREE.Vector3(-0.08, -0.25, 0.1));
      T.fromArray(kf([[0, [fore.x, fore.y, fore.z]], [0.12, [cyl.x - 0.03, cyl.y - 0.04, cyl.z]], [0.3, [cyl.x - 0.03, cyl.y - 0.04, cyl.z]], [0.42, [pouch.x, pouch.y, pouch.z]], [0.62, [cyl.x - 0.03, cyl.y - 0.04, cyl.z]], [0.85, [fore.x, fore.y, fore.z]], [1, [fore.x, fore.y, fore.z]]], P));
      hand({ target: T }); return;
    }
    if (mag && ud.magRest) {
      const rest = ud.magRest, well = new THREE.Vector3(rest.x, rest.y - 0.05, rest.z);
      const pouch = new THREE.Vector3(rest.x - 0.04, rest.y - 0.3, rest.z + 0.06);
      // mag: pull out (0.14..0.3), hidden until the new one is brought up (0.42), inserted (0.42..0.66)
      const out = bump(P, 0.14, 0.3);
      if (P < 0.34) { mag.position.set(rest.x, rest.y - 0.2 * out, rest.z + 0.03 * out); mag.rotation.x = 0.35 * out; }
      else if (P < 0.42) mag.visible = false;
      else { const ins = bump(P, 0.42, 0.66); mag.position.set(rest.x - 0.02 * (1 - ins), rest.y - 0.28 * (1 - ins), rest.z + 0.05 * (1 - ins)); mag.rotation.x = -0.25 * (1 - ins); mag.visible = true; }
      const boltPos = bolt ? bolt.position.clone().add(new THREE.Vector3(-0.04, 0.0, 0.02)) : fore;
      const frames = [[0, [fore.x, fore.y, fore.z]], [0.13, [well.x, well.y, well.z]], [0.3, [well.x, well.y - 0.2, well.z + 0.03]], [0.4, [pouch.x, pouch.y, pouch.z]], [0.62, [well.x, well.y - 0.03, well.z]], [empty ? 0.74 : 0.82, [well.x, well.y, well.z]]];
      if (empty && bolt) { frames.push([0.82, [boltPos.x - 0.0, boltPos.y, boltPos.z + 0.0]], [0.9, [boltPos.x, boltPos.y, boltPos.z + 0.07]], [0.95, [boltPos.x, boltPos.y, boltPos.z - 0.01]], [1, [fore.x, fore.y, fore.z]]); }
      else frames.push([1, [fore.x, fore.y, fore.z]]);
      T.fromArray(kf(frames, P));
      if (empty && bolt) { const pull = bump(P, 0.82, 0.9) - bump(P, 0.9, 0.95); bolt.position.z = ud.boltRest.z + 0.07 * pull; }
      hand({ target: T, roll: 0 });
      if (P > 0.64 && P < 0.7) apply({ x: 0, y: 0.0, z: 0.01 * Math.sin((P - 0.64) / 0.06 * Math.PI), rx: 0.03 * Math.sin((P - 0.64) / 0.06 * Math.PI), ry: 0, rz: 0 }); // slap
    } else if (ud.launcher && mag) {
      const out = bump(P, 0.12, 0.3), inn = bump(P, 0.5, 0.74);
      mag.visible = P < 0.3 || P > 0.5; mag.position.z = ud.magRest.z + (P < 0.4 ? -0.0 : 0.0) + 0.25 * (P < 0.5 ? out : 1 - inn);
      T.copy(mag.position).add(new THREE.Vector3(-0.0, 0.1, 0.1)); hand({ target: T });
    }
  }

  /** Scripted viewmodel animations. Returns { p: [x,y,z,rx,ry,rz], leftHide?, leftTarget?, hideItem?, pinOff? } */
  _anim(type, k, ud, weapon) {
    const f = (frames) => kf(frames, k);
    switch (type) {
      case 'inspect': {
        if (this.mode === 'knife') return this._inspectKnife(k, ud);
        const p = f([[0, [0, 0, 0, 0, 0, 0]], [0.12, [-0.03, 0.04, 0.02, 0.15, 0.25, 0.35]], [0.4, [-0.1, 0.05, 0.04, 0.2, 1.05, 0.9]], [0.62, [-0.1, 0.05, 0.04, 0.0, 1.35, 0.7]], [0.84, [-0.02, 0.0, 0.0, 0.05, 0.2, 0.15]], [1, [0, 0, 0, 0, 0, 0]]]);
        return { p, leftHide: k > 0.12 && k < 0.8 };
      }
      case 'slash1': return { p: f([[0, [0, 0, 0, 0, 0, 0]], [0.28, [0.16, 0.06, 0.1, 0.5, -0.7, -0.9]], [0.5, [-0.24, -0.05, -0.28, -0.25, 0.9, 0.8]], [0.75, [-0.1, -0.03, -0.1, 0, 0.4, 0.3]], [1, [0, 0, 0, 0, 0, 0]]]) };
      case 'slash2': return { p: f([[0, [0, 0, 0, 0, 0, 0]], [0.28, [-0.14, 0.05, 0.08, 0.4, 0.8, 0.9]], [0.5, [0.2, -0.06, -0.26, -0.2, -0.8, -0.8]], [0.75, [0.1, -0.03, -0.1, 0, -0.3, -0.3]], [1, [0, 0, 0, 0, 0, 0]]]) };
      case 'lunge': return { p: f([[0, [0, 0, 0, 0, 0, 0]], [0.3, [0.06, -0.08, 0.16, 0.3, -0.2, 0.3]], [0.52, [-0.04, 0.02, -0.46, 0.05, 0.05, 0.0]], [0.74, [-0.02, 0.0, -0.18, 0, 0, 0]], [1, [0, 0, 0, 0, 0, 0]]]) };
      case 'quick': return { p: f([[0, [0, -0.5, 0.1, -0.9, 0, 0]], [0.18, [0.1, -0.04, 0.12, 0.2, -0.3, 0.3]], [0.4, [-0.06, 0.02, -0.5, 0.05, 0.1, 0.0]], [0.62, [-0.02, 0.0, -0.2, 0, 0, 0]], [1, [0, -0.45, 0.1, -0.8, 0, 0]]]) };
      case 'pin': // pull the pin with the left hand
        return { p: f([[0, [0, -0.12, 0.0, -0.2, 0, 0]], [0.5, [0, 0.0, 0.0, 0, 0, 0]], [1, [0, 0, 0, 0, 0, 0]]]), pinOff: k > 0.55, leftTarget: k < 0.9 ? new THREE.Vector3(-0.12, 0.05, -0.06) : null };
      case 'throw': return { p: f([[0, [0, 0, 0, 0, 0, 0]], [0.3, [0.06, 0.1, 0.16, 0.5, 0, -0.2]], [0.5, [-0.04, 0.02, -0.4, -0.5, 0, 0.1]], [0.75, [-0.1, -0.12, -0.2, -0.2, 0, 0]], [1, [0, -0.3, 0.1, -0.5, 0, 0]]]), hideItem: k > 0.46, pinOff: true };
      case 'plant': return { p: f([[0, [0, 0, 0, 0, 0, 0]], [0.4, [0.0, -0.2, -0.12, -0.7, 0, 0]], [0.6, [0.0, -0.26, -0.18, -0.9, 0, 0]], [1, [0, -0.1, 0, -0.2, 0, 0]]]), hideItem: k > 0.58 };
      case 'draw': return { p: f([[0, [0, -0.35, 0.05, -0.7, 0, 0]], [1, [0, 0, 0, 0, 0, 0]]]) };
      case 'fire_blade': return { p: f([[0, [0, 0, 0, 0, 0, 0]], [0.15, [0, 0.02, 0.1, 0.1, 0, 0]], [1, [0, 0, 0, 0, 0, 0]]]) };
      default: return null;
    }
  }
  _inspectKnife(k, ud) {
    const id = ud.id;
    if (id === 'butterfly') {
      // flip: handles spin around the pivot while the knife is tossed and re-caught
      const fl = bump(k, 0.15, 0.7);
      if (ud.hA) { ud.hA.rotation.x = -fl * Math.PI * 4; ud.hB.rotation.x = fl * Math.PI * 4; }
      const spin = bump(k, 0.3, 0.6) * Math.PI * 2;
      return { p: kf([[0, [0, 0, 0, 0, 0, 0]], [0.25, [0.0, 0.05, 0.0, 0.3, 0.3, 0.3]], [0.5, [-0.02, 0.1, -0.05, spin, 0.2, 0.6]], [0.75, [0, 0.03, 0, 0.1, 0, 0.2]], [1, [0, 0, 0, 0, 0, 0]]], k) };
    }
    return { p: kf([[0, [0, 0, 0, 0, 0, 0]], [0.2, [-0.04, 0.06, 0.0, 0.2, 0.5, 0.9]], [0.5, [-0.08, 0.08, -0.04, 0.3, 1.5, 1.4]], [0.75, [-0.04, 0.04, 0.0, 0.1, 0.6, 0.5]], [1, [0, 0, 0, 0, 0, 0]]], k) };
  }
}
