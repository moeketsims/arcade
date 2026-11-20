// Dev tool: print track stats and write an SVG plan of every track. Run: node src/kart/tools/plot.mjs [out.svg]
import { writeFileSync } from 'node:fs';
import { TRACKS } from '../data.js';
import { Track } from '../track.js';

const svgs = [];
TRACKS.forEach((def, k) => {
  const t = new Track(def), s = t.stats();
  console.log(`${def.name.padEnd(18)} length ${s.length.toFixed(0)} m  min radius ${s.minR.toFixed(1)} m  min gap ${s.minGap.toFixed(1)} m ${s.gapAt ? `(samples ${s.gapAt})` : ''}`);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < t.n; i++) { minX = Math.min(minX, t.x[i]); maxX = Math.max(maxX, t.x[i]); minZ = Math.min(minZ, t.z[i]); maxZ = Math.max(maxZ, t.z[i]); }
  const pad = 30, w = maxX - minX + 2 * pad, h = maxZ - minZ + 2 * pad, ox = (k % 3) * 620, oy = Math.floor(k / 3) * 520, sc = Math.min(580 / w, 480 / h);
  const P = (x, z) => `${(ox + (x - minX + pad) * sc).toFixed(1)},${(oy + (z - minZ + pad) * sc).toFixed(1)}`;
  const L = [], R = [];
  for (let i = 0; i < t.n; i++) { const a = t.at(i, t.w[i] / 2), b = t.at(i, -t.w[i] / 2); L.push(P(a.x, a.z)); R.push(P(b.x, b.z)); }
  svgs.push(`<polygon points="${L.join(' ')}" fill="none" stroke="#e33" stroke-width="1"/><polygon points="${R.join(' ')}" fill="none" stroke="#33e" stroke-width="1"/>`);
  for (let i = 0; i < t.n; i++) if (t.edge[i]) { const p = t.at(i); svgs.push(`<circle cx="${P(p.x, p.z).split(',')[0]}" cy="${P(p.x, p.z).split(',')[1]}" r="2" fill="#a0f"/>`); }
  const s0 = t.at(0), s1 = t.at(6);
  svgs.push(`<line x1="${P(s0.x, s0.z).split(',')[0]}" y1="${P(s0.x, s0.z).split(',')[1]}" x2="${P(s1.x, s1.z).split(',')[0]}" y2="${P(s1.x, s1.z).split(',')[1]}" stroke="#0a0" stroke-width="6"/>`);
  for (const b of t.boxes) { const [x, y] = P(b.x, b.z).split(','); svgs.push(`<circle cx="${x}" cy="${y}" r="3" fill="#fa0"/>`); }
  svgs.push(`<text x="${ox + 10}" y="${oy + 20}" font-size="18">${def.name}</text>`);
});
const out = process.argv[2] || 'tracks.svg';
writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" width="1860" height="1040" style="background:#fff">${svgs.join('')}</svg>`);
console.log('wrote', out);
