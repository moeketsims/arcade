// Moya: an original mind-reading spirit drawn in SVG and animated every frame (no images).
// A round violet spirit with a wispy tail, big eyes, a forehead gem and a crystal orb that glows brighter the surer
// Moya is. Expressions blend smoothly from one to the next; one-shot moves (nod, shake, hop…) play on top.
//   const m = new Moya(el); m.mood('think'); m.pose('temples'); m.play('nod'); m.confidence = 0.7; m.update(dt, t)
const NS = 'http://www.w3.org/2000/svg';

// facial expressions: eye openness, happy (^ ^) eyes, pupil size, brows (lift px, tilt deg), mouth (width, smile -1..1,
// open 0..1), cheeks, sweat drop
const MOODS = {
  idle:     { eye: 1, happy: 0, pupil: 1, bl: 2, br: 2, al: 0, ar: 0, mw: 34, mc: 0.55, mo: 0.08, cheek: 0.45, sweat: 0 },
  happy:    { eye: 1, happy: 1, pupil: 1, bl: 8, br: 8, al: -4, ar: 4, mw: 44, mc: 1, mo: 0.42, cheek: 0.9, sweat: 0 },
  think:    { eye: 0.85, happy: 0, pupil: 0.95, bl: 12, br: -2, al: -12, ar: 6, mw: 18, mc: -0.15, mo: 0, cheek: 0.3, sweat: 0 },
  curious:  { eye: 1, happy: 0, pupil: 1.1, bl: 10, br: 4, al: -8, ar: 0, mw: 22, mc: 0.25, mo: 0.18, cheek: 0.5, sweat: 0 },
  surprise: { eye: 1.12, happy: 0, pupil: 0.8, bl: 14, br: 14, al: 0, ar: 0, mw: 22, mc: 0, mo: 0.95, cheek: 0.4, sweat: 0 },
  smug:     { eye: 0.62, happy: 0, pupil: 1, bl: 10, br: 0, al: -14, ar: 4, mw: 40, mc: 0.85, mo: 0, cheek: 0.7, sweat: 0 },
  shrug:    { eye: 0.95, happy: 0, pupil: 1, bl: 12, br: 12, al: 8, ar: -8, mw: 26, mc: 0, mo: 0, cheek: 0.4, sweat: 0 },
  sad:      { eye: 0.7, happy: 0, pupil: 1.1, bl: 6, br: 6, al: 16, ar: -16, mw: 26, mc: -0.5, mo: 0.1, cheek: 0.2, sweat: 1 },
  sheepish: { eye: 0.8, happy: 0.3, pupil: 1, bl: 7, br: 7, al: 12, ar: -12, mw: 30, mc: 0.45, mo: 0.05, cheek: 0.8, sweat: 1 },
};
// hand positions (x, y) on the 400 × 470 drawing, and how far they turn
const POSES = {
  rest:    { lx: 132, ly: 352, rx: 268, ry: 352, lr: -20, rr: 20 },     // cupping the orb
  temples: { lx: 112, ly: 128, rx: 288, ry: 128, lr: -35, rr: 35 },     // hands on the head: reading minds
  present: { lx: 84, ly: 362, rx: 316, ry: 362, lr: -70, rr: 70 },      // "ta-da" towards the orb
  shrug:   { lx: 40, ly: 300, rx: 360, ry: 300, lr: -115, rr: 115 },
  cheer:   { lx: 46, ly: 52, rx: 354, ry: 52, lr: -150, rr: 150 },
  chin:    { lx: 160, ly: 286, rx: 286, ry: 350, lr: -10, rr: 24 },      // one hand on the chin
  wave:    { lx: 132, ly: 352, rx: 346, ry: 92, lr: -20, rr: 150 },
};
const lerp = (a, b, k) => a + (b - a) * k;
const ease = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);

export class Moya {
  constructor(host) {
    this.host = host;
    this.cur = { ...MOODS.idle }; this.target = { ...MOODS.idle };
    this.hand = { ...POSES.rest }; this.handTarget = { ...POSES.rest };
    this.look = { x: 0, y: 0 }; this.lookTarget = null; this.lookSmooth = { x: 0, y: 0 };
    this.conf = 0; this.confShown = 0; this.thinking = false; this.anims = []; this.blinkIn = 2; this.blinkT = -1;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.build();
  }

  el(tag, attrs, parent) { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); (parent || this.svg).appendChild(n); return n; }

  build() {
    const s = this.svg = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 400 470'); s.setAttribute('class', 'moya-svg'); s.setAttribute('role', 'img'); s.setAttribute('aria-label', 'Moya, the mind reader');
    s.innerHTML = `<defs>
      <radialGradient id="mBody" cx="38%" cy="30%" r="78%"><stop offset="0" stop-color="#e6dcff"/><stop offset=".28" stop-color="#b59bff"/><stop offset=".66" stop-color="#7c55ef"/><stop offset="1" stop-color="#43209f"/></radialGradient>
      <linearGradient id="mTail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7c55ef"/><stop offset=".55" stop-color="#6a3fe0" stop-opacity=".8"/><stop offset="1" stop-color="#5ef2d6" stop-opacity=".35"/></linearGradient>
      <linearGradient id="mTail2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9b6ff" stop-opacity=".7"/><stop offset="1" stop-color="#c9b6ff" stop-opacity="0"/></linearGradient>
      <radialGradient id="mIris" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#9ffbea"/><stop offset=".5" stop-color="#36c9b4"/><stop offset="1" stop-color="#1b6f8f"/></radialGradient>
      <radialGradient id="mOrb" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#ffffff" stop-opacity=".95"/><stop offset=".22" stop-color="#d9f9ff" stop-opacity=".55"/><stop offset=".7" stop-color="#6ad7ff" stop-opacity=".28"/><stop offset="1" stop-color="#3d2a9e" stop-opacity=".75"/></radialGradient>
      <linearGradient id="mGem" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6c8"/><stop offset=".45" stop-color="#ffcf5a"/><stop offset="1" stop-color="#ff8a3d"/></linearGradient>
      <radialGradient id="mHand" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#efe8ff"/><stop offset=".5" stop-color="#b9a0ff"/><stop offset="1" stop-color="#6d47e0"/></radialGradient>
      <filter id="mBlur" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="18"/></filter>
      <filter id="mSoft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
      <clipPath id="mOrbClip"><circle cx="200" cy="372" r="46"/></clipPath>
    </defs>`;
    this.shadow = this.el('ellipse', { cx: 200, cy: 456, rx: 78, ry: 10, fill: '#000', opacity: 0.35, filter: 'url(#mSoft)' });
    this.root = this.el('g', {});
    const r = this.root;
    this.aura = this.el('circle', { cx: 200, cy: 200, r: 150, fill: '#8f6bff', opacity: 0.35, filter: 'url(#mBlur)' }, r);
    this.tail = this.el('path', { fill: 'url(#mTail)' }, r);
    this.tail2 = this.el('path', { fill: 'url(#mTail2)' }, r);
    this.body = this.el('g', {}, r);
    this.el('circle', { cx: 200, cy: 196, r: 128, fill: 'url(#mBody)' }, this.body);
    this.el('ellipse', { cx: 150, cy: 120, rx: 44, ry: 26, fill: '#fff', opacity: 0.32, transform: 'rotate(-28 150 120)' }, this.body);   // shine
    this.el('path', { d: 'M90 268 Q200 336 310 268', stroke: '#3a1a8f', 'stroke-width': 3, fill: 'none', opacity: 0.25 }, this.body);
    // forehead gem: Moya's "third eye", it glows while reading your mind
    this.gemGlow = this.el('circle', { cx: 200, cy: 96, r: 26, fill: '#ffd36b', opacity: 0.3, filter: 'url(#mSoft)' }, this.body);
    this.gem = this.el('path', { d: 'M200 78 L214 96 L200 114 L186 96 Z', fill: 'url(#mGem)', stroke: '#fff3c4', 'stroke-width': 2 }, this.body);
    this.el('path', { d: 'M194 90 L200 84 L204 90', stroke: '#fff', 'stroke-width': 2, fill: 'none', opacity: 0.8 }, this.body);
    // face
    this.face = this.el('g', {}, this.body);
    this.eyes = [150, 250].map((cx, i) => {
      const g = this.el('g', {}, this.face);
      const open = this.el('g', {}, g);
      this.el('ellipse', { cx, cy: 186, rx: 31, ry: 36, fill: '#fff' }, open);
      this.el('ellipse', { cx, cy: 186, rx: 31, ry: 36, fill: 'none', stroke: '#2b1170', 'stroke-width': 3, opacity: 0.55 }, open);
      const iris = this.el('g', {}, open);
      this.el('circle', { cx, cy: 190, r: 19, fill: 'url(#mIris)' }, iris);
      const pupil = this.el('circle', { cx, cy: 190, r: 10, fill: '#160934' }, iris);
      this.el('circle', { cx: cx - 7, cy: 182, r: 6, fill: '#fff' }, iris);
      this.el('circle', { cx: cx + 6, cy: 197, r: 2.6, fill: '#fff', opacity: 0.85 }, iris);
      const happy = this.el('path', { d: `M${cx - 24} 194 Q${cx} 164 ${cx + 24} 194`, stroke: '#2b1170', 'stroke-width': 7, fill: 'none', 'stroke-linecap': 'round', opacity: 0 }, g);
      const brow = this.el('path', { d: `M${cx - 20} 138 Q${cx} 128 ${cx + 20} 138`, stroke: '#2b1170', 'stroke-width': 8, fill: 'none', 'stroke-linecap': 'round' }, this.face);
      return { cx, g, open, iris, pupil, happy, brow, side: i ? 1 : -1 };
    });
    this.cheeks = [118, 282].map(cx => this.el('ellipse', { cx, cy: 238, rx: 21, ry: 12, fill: '#ff7fb5', opacity: 0.45, filter: 'url(#mSoft)' }, this.face));
    this.mouth = this.el('path', { fill: '#2a0f4a', stroke: '#2a0f4a', 'stroke-width': 6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, this.face);
    this.tongue = this.el('ellipse', { cx: 200, cy: 262, rx: 9, ry: 5, fill: '#ff7a9c', opacity: 0 }, this.face);
    this.sweat = this.el('path', { d: 'M300 118 q10 16 0 24 q-10 -8 0 -24z', fill: '#9be8ff', stroke: '#fff', 'stroke-width': 2, opacity: 0 }, this.body);
    // three little stars orbiting the head
    this.stars = [0, 1, 2].map(i => this.el('path', { d: 'M0 -9 L2.5 -2.5 L9 0 L2.5 2.5 L0 9 L-2.5 2.5 L-9 0 L-2.5 -2.5 Z', fill: ['#fff3b0', '#9ffbea', '#ffc6f0'][i] }, r));
    // the crystal orb
    this.orbGlow = this.el('circle', { cx: 200, cy: 372, r: 70, fill: '#8f6bff', opacity: 0.4, filter: 'url(#mBlur)' }, r);
    this.orb = this.el('g', {}, r);
    this.el('circle', { cx: 200, cy: 372, r: 46, fill: '#2a1a74', opacity: 0.55 }, this.orb);
    this.swirl = this.el('g', { 'clip-path': 'url(#mOrbClip)' }, this.orb);
    this.swirlIn = this.el('g', {}, this.swirl);
    this.el('path', { d: 'M160 372 Q182 330 206 360 T246 360', stroke: '#9ffbea', 'stroke-width': 7, fill: 'none', 'stroke-linecap': 'round', opacity: 0.8 }, this.swirlIn);
    this.el('path', { d: 'M168 396 Q196 404 214 380 T240 392', stroke: '#ffd36b', 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round', opacity: 0.7 }, this.swirlIn);
    this.el('path', { d: 'M178 346 Q200 352 220 340', stroke: '#ffb8ec', 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round', opacity: 0.7 }, this.swirlIn);
    for (let i = 0; i < 7; i++) this.el('circle', { cx: 172 + (i * 37) % 60, cy: 346 + (i * 23) % 54, r: 1.6 + (i % 3), fill: '#fff', opacity: 0.85 }, this.swirlIn);
    this.el('circle', { cx: 200, cy: 372, r: 46, fill: 'url(#mOrb)', stroke: '#e9f7ff', 'stroke-width': 2.5, 'stroke-opacity': 0.8 }, this.orb);
    this.el('ellipse', { cx: 184, cy: 352, rx: 14, ry: 8, fill: '#fff', opacity: 0.75, transform: 'rotate(-30 184 352)' }, this.orb);
    this.orbFlash = this.el('circle', { cx: 200, cy: 372, r: 46, fill: '#fff', opacity: 0 }, this.orb);
    // hands (in front of everything)
    this.hands = [0, 1].map(() => {
      const g = this.el('g', {}, r);
      for (const [x, y] of [[-12, -19], [0, -22], [12, -19]]) this.el('ellipse', { cx: x, cy: y, rx: 7, ry: 9, fill: 'url(#mHand)', stroke: '#4a24b8', 'stroke-width': 2.5 }, g);   // fingers
      this.el('ellipse', { cx: 0, cy: 0, rx: 23, ry: 20, fill: 'url(#mHand)', stroke: '#4a24b8', 'stroke-width': 2.5 }, g);
      this.el('path', { d: 'M-14 -14 Q0 -8 14 -14', stroke: '#4a24b8', 'stroke-width': 2, fill: 'none', opacity: 0.5 }, g);   // knuckle line
      this.el('ellipse', { cx: -22, cy: 2, rx: 8, ry: 10, fill: 'url(#mHand)', stroke: '#4a24b8', 'stroke-width': 2.5, transform: 'rotate(-25 -22 2)' }, g);   // thumb
      return g;
    });
    this.host.appendChild(s);
    this.svg.addEventListener('pointerdown', () => this.onPoke?.());
  }

  /** Change expression; blends over ~0.25 s. */
  mood(name) { this.moodName = name; Object.assign(this.target, MOODS[name] || MOODS.idle); }
  /** Move the hands; blends over ~0.35 s. */
  pose(name) { this.poseName = name; Object.assign(this.handTarget, POSES[name] || POSES.rest); }
  /** One-shot move: nod, shake, tilt, shrug, hop, spin, reveal, giggle, droop. */
  play(name) { this.anims.push({ name, t: 0, len: { nod: 0.6, shake: 0.6, tilt: 0.7, shrug: 0.7, hop: 0.7, spin: 1.1, reveal: 1, giggle: 0.9, droop: 0.9 }[name] || 0.6 }); }
  /** Point the eyes at (x, y) in -1..1, or null to let Moya look around by itself. */
  gaze(x, y) { this.lookTarget = x === null ? null : { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) }; }
  set confidence(x) { this.conf = Math.max(0, Math.min(1, x || 0)); }
  get confidence() { return this.conf; }

  update(dt, t) {
    const R = this.reduced ? 0.35 : 1;
    const k = 1 - Math.exp(-dt * 12), kh = 1 - Math.exp(-dt * 9);
    for (const key in this.target) this.cur[key] = lerp(this.cur[key], this.target[key], k);
    for (const key in this.handTarget) this.hand[key] = lerp(this.hand[key], this.handTarget[key], kh);
    this.confShown = lerp(this.confShown, this.conf, 1 - Math.exp(-dt * 3));

    // gaze: follow the pointer / right stick, or drift (and look up while thinking)
    let lt = this.lookTarget;
    if (this.thinking) lt = { x: Math.sin(t * 1.7) * 0.55, y: -0.55 + Math.sin(t * 2.3) * 0.15 };
    else if (!lt) lt = { x: Math.sin(t * 0.37) * 0.35 + Math.sin(t * 1.1) * 0.12, y: Math.sin(t * 0.53) * 0.2 };
    this.lookSmooth.x = lerp(this.lookSmooth.x, lt.x, 1 - Math.exp(-dt * 8)); this.lookSmooth.y = lerp(this.lookSmooth.y, lt.y, 1 - Math.exp(-dt * 8));

    // blink every few seconds
    this.blinkIn -= dt; if (this.blinkIn <= 0) { this.blinkT = 0; this.blinkIn = 2.2 + Math.random() * 3.2; }
    let blink = 1; if (this.blinkT >= 0) { this.blinkT += dt; const b = this.blinkT / 0.16; blink = b < 0.5 ? 1 - b * 1.9 : b < 1 ? 0.05 + (b - 0.5) * 1.9 : 1; if (b >= 1) this.blinkT = -1; }

    // one-shot moves
    let ox = 0, oy = 0, rot = 0, sc = 1, faceX = 0, flash = 0;
    this.anims = this.anims.filter(a => {
      a.t += dt; const p = Math.min(1, a.t / a.len), w = Math.sin(p * Math.PI);
      switch (a.name) {
        case 'nod': oy += Math.sin(p * Math.PI * 4) * 7 * (1 - p); rot += Math.sin(p * Math.PI * 4) * 2.5 * (1 - p); break;
        case 'shake': faceX += Math.sin(p * Math.PI * 6) * 9 * (1 - p); rot += Math.sin(p * Math.PI * 6) * 3 * (1 - p); break;
        case 'tilt': rot += w * 9; break;
        case 'shrug': oy -= w * 8; break;
        case 'hop': oy -= Math.abs(Math.sin(p * Math.PI * 2)) * 34 * (1 - p * 0.4); sc *= 1 + w * 0.04; break;
        case 'spin': rot += ease(p) * 360; oy -= w * 26; break;
        case 'reveal': sc *= 1 + w * 0.1; flash = Math.max(flash, p < 0.35 ? p / 0.35 : 1 - (p - 0.35) / 0.65); break;
        case 'giggle': rot += Math.sin(p * Math.PI * 10) * 4 * (1 - p); oy -= w * 6; break;
        case 'droop': oy += w * 10; rot -= w * 4; break;
      }
      return p < 1;
    });

    // float and breathe
    const fy = Math.sin(t * 1.6) * 7 * R, br = 1 + Math.sin(t * 1.6 + 1) * 0.012 * R;
    const cx = 200, cy = 230;
    this.root.setAttribute('transform', `translate(${ox} ${fy + oy}) rotate(${rot * R + Math.sin(t * 0.9) * 1.6 * R} ${cx} ${cy}) translate(${cx} ${cy}) scale(${sc * br}) translate(${-cx} ${-cy})`);
    this.shadow.setAttribute('rx', 78 - fy * 1.4 - (oy < 0 ? -oy * 0.6 : 0)); this.shadow.setAttribute('opacity', 0.32 - fy * 0.006);

    // wispy tail
    const sw = Math.sin(t * 1.7) * 26 * R, s2 = Math.sin(t * 1.3) * 16 * R, s3 = Math.sin(t * 1.5 + 1) * 16 * R;
    // tail: a wisp that narrows, curls up at the tip and sways
    this.tail.setAttribute('d', `M116 262 C108 330 ${150 + s2} 360 ${170 + sw * 0.5} 398 C${184 + sw * 0.7} 428 ${222 + sw} 452 ${266 + sw} 432 C${228 + sw * 0.8} 434 ${214 + sw * 0.6} 410 ${222 + sw * 0.5} 388 C${236 + s3} 356 288 334 284 262 Z`);
    this.tail2.setAttribute('d', `M160 280 C156 330 ${178 + s2 * 0.6} 362 ${190 + sw * 0.5} 394 C${198 + sw * 0.6} 414 ${214 + sw * 0.7} 428 ${236 + sw * 0.8} 428 C${212 + sw * 0.6} 404 ${216 + s3 * 0.5} 360 240 280 Z`);

    // face
    const c = this.cur;
    this.face.setAttribute('transform', `translate(${faceX + this.lookSmooth.x * 6} ${this.lookSmooth.y * 4})`);
    for (const e of this.eyes) {
      const open = Math.max(0.05, c.eye * blink * (1 - c.happy * 0.95));
      e.open.setAttribute('transform', `translate(${e.cx} 186) scale(1 ${open}) translate(${-e.cx} -186)`);
      e.open.setAttribute('opacity', 1 - c.happy);
      e.happy.setAttribute('opacity', c.happy);
      const px = this.lookSmooth.x * 9, py = this.lookSmooth.y * 9;
      e.iris.setAttribute('transform', `translate(${px} ${py})`);
      e.pupil.setAttribute('r', 10 * c.pupil);
      const lift = e.side < 0 ? c.bl : c.br, ang = e.side < 0 ? c.al : c.ar;
      e.brow.setAttribute('transform', `translate(0 ${-lift}) rotate(${ang} ${e.cx} 134)`);
    }
    for (const ch of this.cheeks) ch.setAttribute('opacity', c.cheek * 0.75);
    const mx = 200, my = 250, w = c.mw, cv = c.mc * w * 0.45, op = c.mo * w * 0.75;
    this.mouth.setAttribute('d', `M${mx - w / 2} ${my} Q${mx} ${my + cv} ${mx + w / 2} ${my} Q${mx} ${my + cv + op} ${mx - w / 2} ${my} Z`);
    this.tongue.setAttribute('cy', my + cv * 0.5 + op * 0.55); this.tongue.setAttribute('opacity', c.mo > 0.3 ? Math.min(1, (c.mo - 0.3) * 2.5) : 0);
    this.sweat.setAttribute('opacity', c.sweat * (0.75 + Math.sin(t * 3) * 0.2));
    this.sweat.setAttribute('transform', `translate(0 ${Math.sin(t * 2) * 3})`);

    // hands
    const h = this.hand;
    const wave = this.poseName === 'wave' ? Math.sin(t * 9) * 22 * R : 0, cheer = this.poseName === 'cheer' ? Math.sin(t * 10) * 16 * R : 0;
    this.hands[0].setAttribute('transform', `translate(${h.lx} ${h.ly + Math.sin(t * 1.6 + 0.4) * 5 * R - Math.abs(cheer) * 0.5}) rotate(${h.lr - cheer})`);
    this.hands[1].setAttribute('transform', `translate(${h.rx + wave * 0.35} ${h.ry + Math.sin(t * 1.6 + 0.9) * 5 * R - Math.abs(cheer) * 0.5}) rotate(${h.rr + wave + cheer}) scale(-1 1)`);

    // gem, stars, orb: brighter and faster while thinking and as Moya gets surer
    const think = this.thinking ? 1 : 0, cf = this.confShown;
    this.gemGlow.setAttribute('opacity', 0.25 + cf * 0.45 + think * (0.25 + Math.sin(t * 8) * 0.15));
    this.gemGlow.setAttribute('r', 22 + cf * 10 + think * 6);
    this.aura.setAttribute('opacity', 0.28 + cf * 0.25 + Math.sin(t * 2) * 0.05);
    this.stars.forEach((st, i) => {
      const a = t * (0.7 + i * 0.25) * (1 + think * 1.5) + i * 2.1, rx = 165 + i * 12, ry = 46 + i * 8;
      const x = 200 + Math.cos(a) * rx, y = 70 + i * 18 + Math.sin(a) * ry, front = Math.sin(a) > 0;
      st.setAttribute('transform', `translate(${x} ${y}) rotate(${t * 90 + i * 40}) scale(${(front ? 1 : 0.6) * (0.8 + Math.sin(t * 3 + i) * 0.2)})`);
      st.setAttribute('opacity', front ? 0.95 : 0.45);
    });
    this.swirlIn.setAttribute('transform', `rotate(${t * (40 + think * 220 + cf * 80)} 200 372)`);
    const hue = 255 - cf * 210;   // violet → gold as Moya gets sure
    this.orbGlow.setAttribute('fill', `hsl(${hue} 95% 68%)`);
    this.orbGlow.setAttribute('opacity', 0.3 + cf * 0.3 + think * 0.12 + flash * 0.35);
    this.orbGlow.setAttribute('r', 58 + cf * 10 + flash * 26);
    this.orbFlash.setAttribute('opacity', flash * 0.85);
  }
}
