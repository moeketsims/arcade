// Procedural canvas textures (flash, smoke, level surfaces). In Node (no canvas) every function returns null and
// callers fall back to flat colours, so the simulation modules stay testable headlessly.
import * as THREE from 'three';
import { mulberry32 } from './util.js';

const cache = new Map();
function canvasTex(key, w, h, draw, opts = {}) {
  if (cache.has(key)) return cache.get(key);
  let t = null;
  try {
    if (typeof document !== 'undefined' && document.createElement) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext && c.getContext('2d');
      if (ctx && ctx.createLinearGradient) {
        draw(ctx, w, h);
        t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
      }
    }
  } catch { t = null; }
  cache.set(key, t);
  return t;
}
function noise(ctx, w, h, seed, n, a = 0.08, light = true) {
  const r = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const v = r() < 0.5 ? 0 : 255; ctx.fillStyle = `rgba(${v},${v},${v},${r() * a})`;
    const s = 1 + r() * 2.5; ctx.fillRect(r() * w, r() * h, s, s);
  }
}

export const Tex = {
  flash() {
    return canvasTex('flash', 128, 128, (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(0.2, 'rgba(255,220,130,0.95)'); g.addColorStop(0.55, 'rgba(255,140,40,0.45)'); g.addColorStop(1, 'rgba(255,90,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(255,200,120,0.7)';
      for (let i = 0; i < 8; i++) { c.save(); c.translate(w / 2, h / 2); c.rotate(i * Math.PI / 4); c.beginPath(); c.moveTo(0, -3); c.lineTo(w * 0.48, 0); c.lineTo(0, 3); c.fill(); c.restore(); }
    });
  },
  soft() {
    return canvasTex('soft', 64, 64, (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    });
  },
  smoke() {
    return canvasTex('smoke', 128, 128, (c, w, h) => {
      const r = mulberry32(5);
      c.clearRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) {
        const x = w / 2 + (r() - 0.5) * w * 0.4, y = h / 2 + (r() - 0.5) * h * 0.4, rad = w * (0.14 + r() * 0.2);
        const g = c.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, 'rgba(230,232,235,0.35)'); g.addColorStop(1, 'rgba(230,232,235,0)');
        c.fillStyle = g; c.fillRect(0, 0, w, h);
      }
    });
  },
  glint() {
    return canvasTex('glint', 128, 128, (c, w, h) => {
      c.clearRect(0, 0, w, h); c.globalCompositeOperation = 'lighter';
      const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.18); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(255,255,255,0.9)';
      for (let i = 0; i < 4; i++) { c.save(); c.translate(w / 2, h / 2); c.rotate(i * Math.PI / 4); c.beginPath(); c.moveTo(-w * 0.48, 0); c.lineTo(0, -2.5); c.lineTo(w * 0.48, 0); c.lineTo(0, 2.5); c.fill(); c.restore(); }
    });
  },
  hole() {
    return canvasTex('hole', 64, 64, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(0,0,0,0.95)'); g.addColorStop(0.28, 'rgba(10,10,10,0.9)'); g.addColorStop(0.5, 'rgba(30,30,30,0.35)'); g.addColorStop(1, 'rgba(30,30,30,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    });
  },
  concrete() {
    return canvasTex('concrete', 256, 256, (c, w, h) => {
      c.fillStyle = '#c9c9c9'; c.fillRect(0, 0, w, h); noise(c, w, h, 11, 3200, 0.1);
      c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 2; c.strokeRect(1, 1, w - 2, h - 2);
      const r = mulberry32(3); for (let i = 0; i < 6; i++) { c.fillStyle = `rgba(80,80,80,${0.03 + r() * 0.05})`; c.beginPath(); c.arc(r() * w, r() * h, 10 + r() * 30, 0, 7); c.fill(); }
    }, { repeat: true });
  },
  ground() {
    return canvasTex('ground', 512, 512, (c, w, h) => {
      c.fillStyle = '#bdbdb8'; c.fillRect(0, 0, w, h); noise(c, w, h, 21, 9000, 0.11);
      c.strokeStyle = 'rgba(0,0,0,0.28)'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(0, 0); c.lineTo(w, 0); c.moveTo(0, 0); c.lineTo(0, h); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke();
      const r = mulberry32(4); c.strokeStyle = 'rgba(0,0,0,0.15)'; c.lineWidth = 1.5;
      for (let i = 0; i < 9; i++) { c.beginPath(); let x = r() * w, y = r() * h; c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; c.lineTo(x, y); } c.stroke(); }
      for (let i = 0; i < 14; i++) { c.fillStyle = `rgba(30,30,30,${0.04 + r() * 0.06})`; c.beginPath(); c.arc(r() * w, r() * h, 8 + r() * 28, 0, 7); c.fill(); }
    }, { repeat: true });
  },
  metal() { // corrugated container wall: vertical ribs
    return canvasTex('metal', 256, 256, (c, w, h) => {
      for (let i = 0; i < 16; i++) { const x = i * 16; const g = c.createLinearGradient(x, 0, x + 16, 0); g.addColorStop(0, '#9a9a9a'); g.addColorStop(0.5, '#e6e6e6'); g.addColorStop(1, '#8a8a8a'); c.fillStyle = g; c.fillRect(x, 0, 16, h); }
      noise(c, w, h, 31, 2600, 0.12);
      const r = mulberry32(6); for (let i = 0; i < 14; i++) { c.fillStyle = `rgba(110,60,30,${0.03 + r() * 0.08})`; c.fillRect(r() * w, r() * h * 0.4 + h * 0.6, 3 + r() * 14, 4 + r() * 40); }
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 0, w, 5); c.fillRect(0, h - 6, w, 6);
    }, { repeat: true });
  },
  sheet() {
    return canvasTex('sheet', 128, 128, (c, w, h) => {
      for (let i = 0; i < 8; i++) { const x = i * 16; const g = c.createLinearGradient(x, 0, x + 16, 0); g.addColorStop(0, '#8d8d8d'); g.addColorStop(0.5, '#d8d8d8'); g.addColorStop(1, '#8d8d8d'); c.fillStyle = g; c.fillRect(x, 0, 16, h); }
      noise(c, w, h, 32, 800, 0.1);
    }, { repeat: true });
  },
  wood() {
    return canvasTex('wood', 256, 256, (c, w, h) => {
      const r = mulberry32(8);
      for (let i = 0; i < 8; i++) { const y = i * 32; c.fillStyle = `rgb(${190 + r() * 40},${160 + r() * 35},${120 + r() * 30})`; c.fillRect(0, y, w, 32); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, y, w, 2); }
      c.strokeStyle = 'rgba(80,50,20,0.22)'; c.lineWidth = 1;
      for (let i = 0; i < 70; i++) { const y = r() * h; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 6, w * 0.6, y + (r() - 0.5) * 6, w, y); c.stroke(); }
    }, { repeat: true });
  },
  brick() {
    return canvasTex('brick', 256, 256, (c, w, h) => {
      c.fillStyle = '#d9d9d9'; c.fillRect(0, 0, w, h); const r = mulberry32(9);
      for (let row = 0; row < 12; row++) for (let col = -1; col < 6; col++) {
        const x = col * 44 + (row % 2) * 22, y = row * 21.3; const v = 205 + r() * 50;
        c.fillStyle = `rgb(${v},${v - 18},${v - 28})`; c.fillRect(x + 2, y + 2, 40, 17.5);
      }
      noise(c, w, h, 33, 1800, 0.1);
    }, { repeat: true });
  },
  fence() {
    return canvasTex('fence', 64, 64, (c, w, h) => {
      c.clearRect(0, 0, w, h); c.strokeStyle = 'rgba(210,214,220,0.95)'; c.lineWidth = 2;
      for (let i = -4; i <= 8; i++) { c.beginPath(); c.moveTo(i * 8, 0); c.lineTo(i * 8 + 64, 64); c.stroke(); c.beginPath(); c.moveTo(i * 8 + 64, 0); c.lineTo(i * 8, 64); c.stroke(); }
    }, { repeat: true });
  },
  water() {
    return canvasTex('water', 256, 256, (c, w, h) => {
      c.fillStyle = '#2a6f8f'; c.fillRect(0, 0, w, h); const r = mulberry32(10);
      for (let i = 0; i < 260; i++) { c.strokeStyle = `rgba(200,240,255,${0.03 + r() * 0.12})`; c.lineWidth = 1 + r() * 2; const x = r() * w, y = r() * h; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 10 + r() * 30, y + (r() - 0.5) * 4); c.stroke(); }
    }, { repeat: true });
  },
  sky() { return null; },
};
