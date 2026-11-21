// Sparkplug GP: race HUD (position, laps, time, item slot with roulette, drift meter, minimap, banners).
import { ITEMS } from './data.js';
import { DRIFT_TIERS } from './sim.js';
import { TIER_COLORS } from './view.js';

// Original item icons (inline SVG, 100×100).
export const ICONS = {
  turbo: '<rect x="30" y="22" width="40" height="60" rx="8" fill="#ff7a00"/><rect x="30" y="34" width="40" height="10" fill="#ffe14d"/><rect x="36" y="14" width="28" height="10" rx="3" fill="#cfd6e4"/><path d="M42 54l12-10-4 10h8L46 70l4-12h-8z" fill="#fff"/>',
  turbo3: '<g transform="translate(-14 4) scale(.8)"><rect x="30" y="22" width="40" height="60" rx="8" fill="#ff7a00"/><rect x="30" y="34" width="40" height="10" fill="#ffe14d"/></g><g transform="translate(34 4) scale(.8)"><rect x="30" y="22" width="40" height="60" rx="8" fill="#ff7a00"/><rect x="30" y="34" width="40" height="10" fill="#ffe14d"/></g><g transform="translate(10 -4) scale(.8)"><rect x="30" y="22" width="40" height="60" rx="8" fill="#ff9a2f"/><rect x="30" y="34" width="40" height="10" fill="#ffe14d"/><path d="M42 54l12-10-4 10h8L46 70l4-12h-8z" fill="#fff"/></g>',
  goo: '<ellipse cx="50" cy="62" rx="34" ry="20" fill="#5be37a"/><circle cx="24" cy="74" r="8" fill="#5be37a"/><circle cx="78" cy="76" r="7" fill="#5be37a"/><circle cx="40" cy="56" r="7" fill="#fff"/><circle cx="60" cy="56" r="7" fill="#fff"/><circle cx="41" cy="57" r="3" fill="#1a1d26"/><circle cx="61" cy="57" r="3" fill="#1a1d26"/>',
  puck: '<ellipse cx="50" cy="60" rx="36" ry="16" fill="#b0233f"/><ellipse cx="50" cy="52" rx="36" ry="16" fill="#ff4b6e"/><ellipse cx="50" cy="52" rx="22" ry="9" fill="#fff"/>',
  wasp: '<ellipse cx="50" cy="56" rx="30" ry="20" fill="#ffd23f"/><rect x="38" y="36" width="8" height="40" fill="#1a1d26"/><rect x="56" y="36" width="8" height="40" fill="#1a1d26"/><ellipse cx="40" cy="30" rx="16" ry="9" fill="#dff6ff" opacity=".85"/><ellipse cx="62" cy="30" rx="16" ry="9" fill="#dff6ff" opacity=".85"/><circle cx="76" cy="52" r="5" fill="#ff3355"/><path d="M20 56l-10 4 10 4z" fill="#1a1d26"/>',
  decoy: '<path d="M50 12l28 38-28 38-28-38z" fill="#ff9fb0" stroke="#a0203a" stroke-width="4"/><circle cx="50" cy="50" r="9" fill="#ff3355"/>',
  shield: '<path d="M50 10l34 20v40L50 90 16 70V30z" fill="#9ff0ff" opacity=".9"/><path d="M50 10l34 20L50 50 16 30z" fill="#fff" opacity=".7"/><path d="M50 50l34 20L50 90z" fill="#4fa8ff" opacity=".8"/>',
  thunder: '<ellipse cx="50" cy="38" rx="34" ry="18" fill="#5c6178"/><circle cx="32" cy="34" r="14" fill="#6c7290"/><circle cx="62" cy="28" r="16" fill="#6c7290"/><path d="M52 50L38 74h12l-6 20 20-28H52l6-16z" fill="#ffe066"/>',
};
export const icon = (id, size = 64) => `<svg viewBox="0 0 100 100" width="${size}" height="${size}">${ICONS[id] || ''}</svg>`;
const ord = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
export const fmt = t => { if (!isFinite(t)) return '--:--.---'; const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(3).padStart(6, '0')}`; };
export { ord };

export class Hud {
  constructor(el) {
    this.el = el;
    el.innerHTML = `
      <div class="k-tl"><div id="hPos" class="k-pos"></div><div class="k-laps"><div id="hLap"></div><div id="hTime"></div><div id="hLapList"></div></div></div>
      <div class="k-tr"><div id="hItem" class="k-item"><div class="k-slot"><div id="hItemIcon"></div><span id="hItemCount"></span></div><div id="hItemHint"></div></div></div>
      <div id="hRanks" class="k-ranks"></div>
      <canvas id="hMap" class="k-map" width="240" height="240"></canvas>
      <div class="k-bottom"><div id="hDrift" class="k-drift"><i></i><span class="t1"></span><span class="t2"></span></div><div id="hSpeed" class="k-speed"></div></div>
      <div id="hBanner" class="k-banner"></div>
      <div id="hWrong" class="k-wrong hidden">WRONG WAY</div>
      <div id="hHint" class="k-hint"></div>
      <div id="hFlash" class="k-flash"></div>
      <div id="hGhost" class="k-ghost hidden"></div>`;
    const $ = id => el.querySelector('#' + id); this.$ = $;
    this.pos = $('hPos'); this.lap = $('hLap'); this.time = $('hTime'); this.lapList = $('hLapList');
    this.itemIcon = $('hItemIcon'); this.itemCount = $('hItemCount'); this.itemHint = $('hItemHint'); this.itemBox = $('hItem');
    this.ranks = $('hRanks'); this.map = $('hMap'); this.mctx = this.map.getContext('2d');
    this.drift = $('hDrift'); this.driftFill = this.drift.querySelector('i'); this.speed = $('hSpeed');
    this.banner = $('hBanner'); this.wrong = $('hWrong'); this.hint = $('hHint'); this.flash = $('hFlash'); this.ghostInfo = $('hGhost');
    const t1 = this.drift.querySelector('.t1'), t2 = this.drift.querySelector('.t2');
    t1.style.left = (DRIFT_TIERS[0] / DRIFT_TIERS[2] * 100) + '%'; t2.style.left = (DRIFT_TIERS[1] / DRIFT_TIERS[2] * 100) + '%';
    this.bannerT = 0; this.last = {}; this.rouletteT = 0;
  }

  setTrack(track, race) {
    this.track = track; this.race = race;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < track.n; i++) { minX = Math.min(minX, track.x[i]); maxX = Math.max(maxX, track.x[i]); minZ = Math.min(minZ, track.z[i]); maxZ = Math.max(maxZ, track.z[i]); }
    const W = this.map.width, s = (W - 30) / Math.max(maxX - minX, maxZ - minZ);
    this.mapT = (x, z) => [15 + (x - minX) * s + (W - 30 - (maxX - minX) * s) / 2, 15 + (z - minZ) * s + (W - 30 - (maxZ - minZ) * s) / 2];
    // pre-draw the track outline
    const c = document.createElement('canvas'); c.width = c.height = W; const g = c.getContext('2d');
    g.lineCap = g.lineJoin = 'round';
    const path = () => { g.beginPath(); for (let i = 0; i <= track.n; i++) { const [x, y] = this.mapT(track.x[i % track.n], track.z[i % track.n]); i ? g.lineTo(x, y) : g.moveTo(x, y); } };
    g.strokeStyle = '#000a'; g.lineWidth = 14; path(); g.stroke();
    g.strokeStyle = '#ffffffd8'; g.lineWidth = 8; path(); g.stroke();
    // unrailed edges in violet
    g.strokeStyle = '#c45bff'; g.lineWidth = 8; g.beginPath(); let on = false;
    for (let i = 0; i <= track.n; i++) { const j = i % track.n, [x, y] = this.mapT(track.x[j], track.z[j]); if (track.edge[j]) { on ? g.lineTo(x, y) : g.moveTo(x, y); on = true; } else on = false; }
    g.stroke();
    const [sx, sy] = this.mapT(track.x[0], track.z[0]); g.fillStyle = '#111'; g.fillRect(sx - 5, sy - 5, 10, 10); g.fillStyle = '#fff'; g.fillRect(sx - 5, sy - 5, 5, 5); g.fillRect(sx, sy, 5, 5);
    this.mapBg = c;
    this.lapList.innerHTML = ''; this.last = {};
  }

  show(on) { this.el.classList.toggle('hidden', !on); }
  say(html, secs = 1.4, cls = '') { this.banner.innerHTML = html; this.banner.className = 'k-banner show ' + cls; this.bannerT = secs; }
  doFlash(color = '#fff', a = 0.6) { this.flash.style.background = color; this.flash.style.opacity = a; requestAnimationFrame(() => { this.flash.style.transition = 'opacity .5s'; this.flash.style.opacity = 0; }); this.flash.style.transition = 'none'; }

  /** me: the human Kart, race: Race, opts { pad glyph fn, showMap, dt, itemHint } */
  update(race, me, opts) {
    const dt = opts.dt;
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.banner.className = 'k-banner'; }
    const tt = race.mode === 'tt';
    // position
    const place = me.place;
    if (this.last.place !== place && !tt) { this.pos.innerHTML = `${place}<sup>${ord(place).slice(-2)}</sup>`; this.pos.className = 'k-pos p' + Math.min(place, 4); this.pos.classList.add('bump'); this.last.place = place; setTimeout(() => this.pos.classList.remove('bump'), 160); }
    if (tt) this.pos.innerHTML = '';
    const lap = Math.max(1, Math.min(race.laps, me.lap));
    const lapTxt = `LAP <b>${lap}</b>/${race.laps}`; if (this.last.lap !== lapTxt) { this.lap.innerHTML = lapTxt; this.last.lap = lapTxt; }
    this.time.textContent = fmt(me.finished ? me.finishTime : race.t);
    if (this.last.laps !== me.lapTimes.length) { this.last.laps = me.lapTimes.length; this.lapList.innerHTML = me.lapTimes.map((t, i) => `<div>L${i + 1} ${fmt(t)}${t === me.bestLap && me.lapTimes.length > 1 ? ' ★' : ''}</div>`).join(''); }
    // item slot
    let itemKey = me.item ? `${me.item}|${me.itemCount}|${me.roulette > 0}|${me.trailing}` : 'none';
    if (me.roulette > 0) {
      this.rouletteT -= dt;
      if (this.rouletteT <= 0) { this.rouletteT = 0.07; const ids = Object.keys(ICONS); this._rid = ids[(ids.indexOf(this._rid) + 1) % ids.length]; this.itemIcon.innerHTML = icon(this._rid, 76); opts.onRoulette?.(); }
      itemKey = 'roulette';
      this.itemBox.classList.add('spin');
    } else this.itemBox.classList.remove('spin');
    if (itemKey !== this.last.item && itemKey !== 'roulette') {
      this.last.item = itemKey;
      this.itemIcon.innerHTML = me.item ? icon(me.item, 76) : '';
      this.itemCount.textContent = me.item && me.itemCount > 1 ? '×' + me.itemCount : '';
      this.itemHint.innerHTML = me.item ? `${opts.itemGlyph} ${ITEMS[me.item].name}${me.trailing ? ' <small>(release to fire)</small>' : ''}` : '';
      this.itemBox.classList.toggle('has', !!me.item);
    } else if (itemKey === 'roulette') this.last.item = 'roulette';
    // ranks list (left side)
    if (!tt && (this.last.ranksT = (this.last.ranksT || 0) - dt) <= 0) {
      this.last.ranksT = 0.25;
      this.ranks.innerHTML = race.order.map(k => `<div class="${k === me ? 'me' : ''}"><span>${k.place}</span><i style="background:${k.racer.color}"></i>${k.racer.name}</div>`).join('');
    }
    this.ranks.classList.toggle('hidden', tt || !opts.showRanks);
    // drift meter
    const charge = me.drift ? Math.min(1, me.driftCharge / DRIFT_TIERS[2]) : 0;
    this.driftFill.style.width = (charge * 100) + '%'; this.driftFill.style.background = TIER_COLORS[me.driftTier] || '#fff';
    this.drift.classList.toggle('on', !!me.drift);
    this.speed.innerHTML = `${Math.round(Math.abs(me.speed) * 3.6)}<small> km/h</small>`;
    this.wrong.classList.toggle('hidden', !(me.wrongT > 1.2 && !me.finished));
    // minimap
    this.map.classList.toggle('hidden', !opts.showMap);
    if (opts.showMap) {
      const g = this.mctx, W = this.map.width; g.clearRect(0, 0, W, W); g.drawImage(this.mapBg, 0, 0);
      for (const b of race.boxes) if (b.t <= 0) { const [x, y] = this.mapT(b.x, b.z); g.fillStyle = '#7fd3ff'; g.fillRect(x - 1.5, y - 1.5, 3, 3); }
      for (const p of race.projs) { const [x, y] = this.mapT(p.x, p.z); g.fillStyle = p.type === 'goo' ? '#5be37a' : p.type === 'wasp' ? '#ffd23f' : p.type === 'decoy' ? '#ff9fb0' : '#ff4b6e'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
      if (opts.ghost) { const [x, y] = this.mapT(opts.ghost[0], opts.ghost[2]); g.fillStyle = '#9ff0ff88'; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); }
      for (const k of [...race.karts].sort((a, b) => (a === me) - (b === me))) {
        const [x, y] = this.mapT(k.x, k.z), r = k === me ? 8 : 6;
        g.fillStyle = k.racer.color; g.strokeStyle = k === me ? '#fff' : '#000'; g.lineWidth = k === me ? 3 : 2; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.stroke();
      }
    }
  }
}
