// Building: grid-snapped placement of wall / floor / ramp / roof pieces, ghost preview, material costs.
import * as THREE from 'three';
import { GRID, STORY, BUILD_COST, MATS } from './config.js';

const KINDS = ['wall', 'floor', 'ramp', 'roof'];
const _m = new THREE.Matrix4();

export class BuildSystem {
  constructor(G) {
    this.G = G; this.ghost = {}; this.group = new THREE.Group(); G.scene.add(this.group); this.group.visible = false;
    const mats = { ok: new THREE.MeshBasicMaterial({ color: 0x4aa8ff, transparent: true, opacity: 0.38, depthWrite: false, fog: false }), bad: new THREE.MeshBasicMaterial({ color: 0xff5a5a, transparent: true, opacity: 0.38, depthWrite: false, fog: false }) };
    this.mats = mats;
    for (const k of KINDS) { const m = new THREE.Mesh(G.world.pieces.G[k], mats.ok); m.matrixAutoUpdate = false; m.visible = false; m.renderOrder = 4; this.group.add(m); this.ghost[k] = m; }
    this.last = null;
  }

  /** The 4 m-grid placement for a piece kind in front of a fighter. yawOverride lets bots aim walls at an enemy. */
  compute(f, kind, yawOverride = null, pitchOverride = null) {
    const W = this.G.world, T = W.terrain, yaw = yawOverride ?? f.yaw, pitch = pitchOverride ?? f.pitch, fx = Math.sin(yaw), fz = Math.cos(yaw);
    const fdir = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 1 : 3) : (fz > 0 ? 0 : 2);
    const px = f.pos.x, pz = f.pos.z, G4 = GRID;
    const cell = (x, z) => [Math.floor(x / G4), Math.floor(z / G4)];
    let x, z, rot = 0, y;
    const level = (cx, cz) => this.level(f, cx, cz);
    if (kind === 'wall') {
      const gx = Math.floor(px / G4), gz = Math.floor(pz / G4);
      if (fdir === 0 || fdir === 2) {
        let edge = fdir === 0 ? (gz + 1) * G4 : gz * G4; if (Math.abs(edge - pz) < 1.0) edge += fdir === 0 ? G4 : -G4;
        x = gx * G4 + G4 / 2; z = edge; rot = 0;
      } else {
        let edge = fdir === 1 ? (gx + 1) * G4 : gx * G4; if (Math.abs(edge - px) < 1.0) edge += fdir === 1 ? G4 : -G4;
        x = edge; z = gz * G4 + G4 / 2; rot = 1;
      }
      y = level(x, z);
    } else if (kind === 'floor') {
      const look = pitch < -0.75; const [gx, gz] = look ? cell(px, pz) : cell(px + fx * 2.3, pz + fz * 2.3);
      x = gx * G4 + G4 / 2; z = gz * G4 + G4 / 2; y = level(x, z);
    } else if (kind === 'ramp') {
      const [gx, gz] = cell(px + fx * 2.6, pz + fz * 2.6); x = gx * G4 + G4 / 2; z = gz * G4 + G4 / 2; rot = fdir; y = level(x, z);
    } else {
      const up = pitch > 0.5; const [gx, gz] = up ? cell(px, pz) : cell(px + fx * 2.3, pz + fz * 2.3);
      x = gx * G4 + G4 / 2; z = gz * G4 + G4 / 2; y = level(x, z) + STORY;
    }
    const pieces = W.pieces, free = pieces.canPlace(kind, x, y, z, rot);
    const mats = f.inv.mats[f.buildMat]; const ok = free && mats >= BUILD_COST && f.state === 'ground';
    return { kind, x, y, z, rot, free, ok, mats };
  }
  /** Which level plane to build on: join nearby pieces if the fighter stands near their level, else the terrain. */
  level(f, cx, cz) {
    const W = this.G.world; let best = null, bd = 1.7;
    const y0 = f.pos.y;
    for (const p of W.pieces.all) {
      if (Math.abs(p.x - cx) > 8.5 || Math.abs(p.z - cz) > 8.5 || p.kind === 'roof') continue;
      for (const yy of (p.kind === 'floor' ? [p.y, p.y + STORY] : [p.y, p.y + STORY])) { const d = Math.abs(yy - y0); if (d < bd) { bd = d; best = yy; } }
    }
    if (best !== null) return best;
    return W.terrain.groundAt(cx, cz) + 0.05;
  }

  place(f, kind, yawOverride = null, pitchOverride = null) {
    if (f.state !== 'ground' || !f.alive || f.buildCd > 0) return null;
    const pl = this.compute(f, kind, yawOverride, pitchOverride);
    f.buildPiece = kind; if (!pl.ok) { if (f.isPlayer && pl.free && pl.mats < BUILD_COST) this.G.hud?.toast(`Not enough ${MATS[f.buildMat].name}`, 0.8); return null; }
    const p = this.G.world.pieces.add({ kind, mat: f.buildMat, x: pl.x, y: pl.y, z: pl.z, rot: pl.rot, owner: f });
    if (!p) return null;
    f.inv.mats[f.buildMat] -= BUILD_COST; f.buildCd = 0.1; f.sinceFired = Math.min(f.sinceFired, 0.5);
    this.G.sfx3d('build', new THREE.Vector3(pl.x, pl.y + 1, pl.z), 1, 35); if (f.isPlayer) this.G.pad?.rumble(0.05, 0.15, 40);
    this.G.onBuilt?.(f, p);
    return p;
  }

  updateGhost(f, show) {
    if (!show || !f.buildMode || !f.alive) { this.group.visible = false; return; }
    const pl = this.compute(f, f.buildPiece); this.last = pl; this.group.visible = true;
    for (const k of KINDS) { const g = this.ghost[k]; g.visible = k === pl.kind; if (k === pl.kind) { g.matrix.copy(this.G.world.pieces.matrixFor(pl)); g.matrixWorldNeedsUpdate = true; g.material = pl.ok ? this.mats.ok : this.mats.bad; } }
  }
}
