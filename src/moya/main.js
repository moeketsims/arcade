// Moya, the mind reader: think of a character, answer Moya's questions, and Moya guesses who it is.
// Answers: Yes (A) · No (B) · Probably (Y) · Maybe (R1) · Probably not (X) · I don't know (L1). Keyboard 1–6, mouse, touch.
import { Pad, goHome, PS_NAME, XB_NAME } from '../common/pad.js?v=moya-1';
import { ControllerOverlay } from '../common/overlay.js';
import { Sfx } from '../common/sfx.js';
import { ANSWERS, QUESTIONS, CHARACTERS, CATEGORY, valueOf } from './data.js';
import { Mind, honestAnswer, answerValue } from './engine.js';
import { Moya } from './mascot.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pick = a => a[Math.floor(Math.random() * a.length)];
const QBY = Object.fromEntries(QUESTIONS.map(q => [q.id, q]));
const ANS = Object.fromEntries(ANSWERS.map(a => [a.id, a]));
const MAX_GUESSES = 4, MAX_QUESTIONS = 60;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- saved in this browser only ----------
const KEY = 'arcade-moya-v1';
const store = (() => {
  let s = {}; try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* storage blocked */ }
  return { sound: s.sound !== false, speak: !!s.speak, games: s.games | 0, moyaWins: s.moyaWins | 0, playerWins: s.playerWins | 0, taught: Array.isArray(s.taught) ? s.taught.filter(t => t && t.name && t.values) : [] };
})();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* storage blocked or full */ } };

// ---------- input ----------
const pad = new Pad({
  touch: false, touchLook: false,
  moveKeys: { up: [], down: [], left: [], right: [] }, lookKeys: { up: [], down: [], left: [], right: [] },
  keymap: { A: ['Digit1', 'Numpad1', 'KeyY'], B: ['Digit2', 'Numpad2', 'KeyN'], Y: ['Digit3', 'Numpad3', 'KeyP'], R1: ['Digit4', 'Numpad4', 'KeyM'], X: ['Digit5', 'Numpad5'], L1: ['Digit6', 'Numpad6', 'KeyI'],
    L2: ['Backspace'], R2: ['KeyV'], SELECT: ['KeyS'], TOUCH: ['KeyH', 'KeyT'], UP: ['ArrowUp'], DOWN: ['ArrowDown'], LEFT: ['ArrowLeft'], RIGHT: ['ArrowRight'] },
});
// Keys typed into a text box belong to the text box; Tab and Space keep their normal job on buttons (move focus, press).
document.addEventListener('keydown', e => {
  const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
  if (typing) { if (e.key === 'Escape') t.blur(); e.stopPropagation(); return; }
  if (e.code === 'Tab' || (e.code === 'Space' && t?.closest?.('button, a'))) e.stopPropagation();
}, true);
const controls = new ControllerOverlay({ title: 'Moya — controls', pad, note: 'Click or tap the answers too',
  map: { A: 'Yes · OK', B: 'No · Back', Y: 'Probably', R1: 'Maybe', X: 'Probably not', L1: "I don't know", L2: 'Undo the last answer', R2: 'Read the question aloud',
    UP: 'Move between buttons', DOWN: 'Move between buttons', LEFT: 'Move between buttons', RIGHT: 'Move between buttons', LS: 'Move between buttons', RS: "Moya's eyes follow it",
    L3: 'Make Moya spin', R3: 'Tickle Moya', SELECT: 'Sound on / off', START: 'Menu', TOUCH: 'This screen', HOME: 'Back to the Arcade' } });
const kb = k => `<kbd>${k}</kbd>`;
const usePad = () => pad.connected && pad.usingPad && !pad.touch;
/** Always the controller button (for the how-to-play list), PlayStation names on a PlayStation pad. */
const ctl = b => { const face = ['A', 'B', 'X', 'Y'].includes(b); return `<span class="glyph ${face ? 'face ' + b.toLowerCase() : 'shoulder'}">${face ? b : pad.kind === 'playstation' ? PS_NAME[b] : XB_NAME[b]}</span>`; };
/** A button hint: the controller button while a pad is in use, the keyboard key otherwise, nothing on touch screens. */
const glyph = (b, key) => pad.touch ? '' : usePad() ? pad.glyph(b) : key ? kb(key) : '';

// ---------- sound ----------
const sfx = new Sfx();
let amb = null;
function audioOn() {
  sfx.init();
  if (sfx.master) sfx.master.gain.value = store.sound ? 0.6 : 0;
  ambience();
}
function tone(f, t, type = 'sine', vol = 0.1, at = 0, f2 = null) { if (store.sound) sfx.tone({ f, f2, t, type, vol, at }); }
const play = n => { if (store.sound) sfx.play(n); };
const SND = {
  yes: () => { tone(660, 0.16, 'triangle', 0.13); tone(990, 0.22, 'triangle', 0.11, 0.07); },
  no: () => tone(340, 0.24, 'triangle', 0.13, 0, 240),
  probably: () => { tone(587, 0.18, 'sine', 0.12); tone(784, 0.22, 'sine', 0.1, 0.06); },
  maybe: () => { tone(523, 0.3, 'sine', 0.1); tone(622, 0.3, 'sine', 0.06, 0.08); },
  probnot: () => { tone(494, 0.18, 'sine', 0.11); tone(392, 0.22, 'sine', 0.09, 0.07); },
  idk: () => tone(466, 0.2, 'triangle', 0.08, 0, 440),
  think: () => [1175, 1397, 1568, 1760, 2093].forEach((f, i) => tone(f * (0.98 + Math.random() * 0.04), 0.4, 'sine', 0.03, i * 0.05)),
  drum: () => { if (!store.sound || !sfx.ctx) return; for (let i = 0; i < 14; i++) sfx.noise({ t: 0.06, vol: 0.06 + i * 0.012, at: i * 0.07, lp: 900 + i * 60 }); },
  reveal: () => { tone(220, 0.7, 'sawtooth', 0.04, 0, 880); [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.9, 'triangle', 0.09, 0.12 + i * 0.03)); },
  win: () => { play('win'); [1568, 2093, 2637].forEach((f, i) => tone(f, 0.5, 'sine', 0.04, 0.9 + i * 0.09)); },
  lose: () => play('lose'),
  giggle: () => [880, 988, 880, 1047].forEach((f, i) => tone(f, 0.09, 'triangle', 0.08, i * 0.09)),
  spin: () => tone(300, 0.7, 'sine', 0.07, 0, 1200),
};
/** A soft, slow chord under the game: two layers of sine waves breathing in and out. */
function ambience() {
  if (!sfx.ctx) return;
  if (!amb) {
    const c = sfx.ctx, g = c.createGain(); g.gain.value = 0;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; g.connect(lp); lp.connect(sfx.musicBus);
    for (const [f, d] of [[146.83, 0], [220, 3], [293.66, -4], [329.63, 5], [440, -2]]) {
      const o = c.createOscillator(), og = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
      o.frequency.value = f; o.detune.value = d; og.gain.value = 0.18; lfo.frequency.value = 0.05 + Math.random() * 0.08; lg.gain.value = 0.12;
      lfo.connect(lg); lg.connect(og.gain); o.connect(og); og.connect(g); o.start(); lfo.start();
    }
    amb = g;
  }
  amb.gain.setTargetAtTime(store.sound ? 0.3 : 0, sfx.ctx.currentTime, 1.2);
}

// ---------- reading aloud ----------
const canSpeak = 'speechSynthesis' in window;
function say(text) {
  if (!canSpeak) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.rate = 0.95; u.pitch = 1.1; u.lang = 'en-GB';
    const v = speechSynthesis.getVoices().find(v => /^en(-|_)(ZA|GB)/i.test(v.lang)) || speechSynthesis.getVoices().find(v => /^en/i.test(v.lang));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch { /* speech not available */ }
}

// ---------- Moya ----------
const moya = new Moya($('moya'));
const seer = document.querySelector('.seer');
const sayEl = document.createElement('div'); sayEl.className = 'say'; sayEl.setAttribute('aria-live', 'polite'); seer.appendChild(sayEl);
let sayTimer = 0;
function speech(text, secs = 2.4) { sayEl.textContent = text; sayEl.classList.add('on'); sayTimer = secs; }
moya.onPoke = () => { audioOn(); tickle(); };
function tickle() {
  moya.play('giggle'); SND.giggle();
  const before = moya.moodName; moya.mood('happy');
  speech(pick(['Hehe! That tickles!', 'Boop!', "Careful, I'm concentrating!", 'Hee hee!', 'My orb is very ticklish.']));
  setTimeout(() => { if (moya.moodName === 'happy' && S.screen !== 'win') moya.mood(before || 'idle'); }, 900);
}

// ---------- game state ----------
const S = { screen: 'title', mind: null, q: null, guess: null, guesses: 0, busy: false, revealed: false, overlay: null, back: null, lastLine: '', teachMatch: null };
const panel = $('panel');
const knownCount = () => CHARACTERS.length;

function initials(name) {
  const skip = new Set(['the', 'a', 'of', 'mr.', 'dr.', 'captain', 'king', 'queen', 'lord', 'count', 'princess', 'monkey', 'd.', 'jr', 'jr.']);
  const w = name.replace(/["“”]/g, '').split(/[\s-]+/).filter(x => x && !skip.has(x.toLowerCase()));
  if (!w.length) return name[0].toUpperCase();
  return (w.length === 1 ? w[0][0] : w[0][0] + w[w.length - 1][0]).toUpperCase();
}
const hueOf = id => { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };

// ---------- screens ----------
const answerBtn = a => `<button type="button" class="ans" data-act="answer" data-a="${a.id}"><span class="l">${a.label}</span><span class="k" data-b="${a.btn}" data-kb="${a.key}"></span></button>`;
const speakIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
const k = (b, key) => `<span class="k" data-b="${b}" data-kb="${key || ''}"></span>`;

const SCREENS = {
  title() {
    const taught = store.taught.length;
    return { bubble: true, mood: 'idle', pose: 'wave', html: `
      <div class="eyebrow">The Arcade mind reader</div>
      <h1>Moya<em>reads minds</em></h1>
      <p class="lede">Think of someone, real or made-up. A footballer, a singer, a cartoon star, a game hero, someone from history… Answer my questions and I will tell you who it is.</p>
      <ul class="chips"><li>⚽ Footballers</li><li>🎤 Music stars</li><li>🇿🇦 Mzansi legends</li><li>🎨 Cartoons</li><li>🎮 Game heroes</li><li>🦸 Superheroes</li><li>📜 History</li></ul>
      <div class="actions"><button type="button" class="btn primary wide" data-act="start" data-primary>${k('A', 'Enter')}Start reading my mind</button>
        <button type="button" class="btn" data-act="help" data-y>${k('Y')}How to play</button></div>
      <div class="stats"><span>I know <b>${knownCount()}</b> characters${taught ? ` + <b>${taught}</b> you taught me` : ''}</span>${store.games ? `<span>Games <b>${store.games}</b></span><span>Moya guessed <b>${store.moyaWins}</b></span><span>You stumped Moya <b>${store.playerWins}</b></span>` : ''}</div>` };
  },
  ready() {
    return { bubble: true, mood: 'curious', pose: 'temples', html: `
      <div class="eyebrow">Step 1</div>
      <p class="big">Think of a character…</p>
      <p class="sub">Picture them clearly. Real or made-up, anyone at all. Keep it secret, and answer each question as well as you can. "I don't know" is fine.</p>
      <div class="actions"><button type="button" class="btn primary wide" data-act="go" data-primary>${k('A', 'Enter')}I've got one!</button>
        <button type="button" class="btn" data-act="title" data-b>${k('B')}Back</button></div>` };
  },
  question() {
    const m = S.mind, n = m.asked + 1;
    return { bubble: true, mood: m.confidence() > 0.6 ? 'smug' : 'curious', pose: m.confidence() > 0.6 ? 'chin' : 'rest', html: `
      <div class="qmeta"><span class="qnum"><b>${n}</b>Question</span>
        <button type="button" class="mini" data-act="undo" ${m.asked ? '' : 'disabled'} aria-label="Undo the last answer">${k('L2', '⌫')}Undo</button></div>
      <p class="comment">${esc(S.lastLine)}</p>
      <h2 class="q" id="qtext">${esc(S.q.text)}${canSpeak ? `<button type="button" class="speak" data-act="speak" aria-label="Read the question aloud" title="Read aloud (${usePad() ? 'R2' : 'V'})">${speakIcon}</button>` : ''}</h2>
      <div class="answers" role="group" aria-label="Your answer">${ANSWERS.map(answerBtn).join('')}</div>` };
  },
  guess() {
    const g = S.guess;
    if (!S.revealed) return { bubble: true, mood: 'think', pose: 'temples', thinking: true, html: `
      <div class="reveal"><div class="eyebrow">Question ${S.mind.asked}</div><div class="dots"><i></i><i></i><i></i></div><p class="big">I think I know…</p></div>` };
    const cat = CATEGORY[g.cat] || CATEGORY.taught;
    return { bubble: true, mood: 'smug', pose: 'present', html: `
      <div class="reveal"><div class="eyebrow">You are thinking of…</div>
        <div class="avatar pop" style="--h:${hueOf(g.id)}" aria-hidden="true">${esc(initials(g.name))}<span class="badge">${cat.icon}</span></div>
        <div class="who">${esc(g.name)}</div><p class="what">${esc(g.desc)}</p><span class="cat">${cat.label}</span>
        <p class="ask">Am I right?</p>
        <div class="actions"><button type="button" class="btn primary" data-act="right" data-primary>${k('A', 'Y')}Yes, that's right!</button>
          <button type="button" class="btn" data-act="wrong" data-b>${k('B', 'N')}No</button></div></div>` };
  },
  wrong() {
    const g = S.guess;
    return { bubble: true, mood: 'sheepish', pose: 'shrug', html: `
      <div class="eyebrow">Guess ${S.guesses} of ${MAX_GUESSES}</div>
      <p class="big">Not ${esc(g.name)}? Hmm…</p>
      <p class="sub">The orb is still cloudy. Let me ask a few more questions, or tell me who it is.</p>
      <div class="actions"><button type="button" class="btn primary wide" data-act="keep" data-primary>${k('A', 'Enter')}Keep reading my mind</button>
        <button type="button" class="btn" data-act="tell" data-y>${k('Y')}I'll tell you</button></div>` };
  },
  win() {
    const g = S.guess, n = S.mind.asked;
    return { bubble: true, mood: 'happy', pose: 'cheer', html: `
      <div class="reveal"><div class="eyebrow">Mind read!</div>
        <div class="avatar" style="--h:${hueOf(g.id)}" aria-hidden="true">${esc(initials(g.name))}<span class="badge">${(CATEGORY[g.cat] || CATEGORY.taught).icon}</span></div>
        <p class="big">${esc(g.name)}!</p>
        <p class="sub">I read your mind in ${n} question${n === 1 ? '' : 's'}${S.guesses ? ` and ${S.guesses + 1} guesses` : ''}.</p>
        <div class="actions"><button type="button" class="btn primary" data-act="start" data-primary>${k('A', 'Enter')}Play again</button>
          <button type="button" class="btn" data-act="review" data-y>${k('Y')}My answers</button></div>
        <div class="stats" style="justify-content:center"><span>Moya guessed <b>${store.moyaWins}</b></span><span>You stumped Moya <b>${store.playerWins}</b></span></div></div>` };
  },
  teach() {
    const names = [...CHARACTERS.map(c => c.name), ...store.taught.map(t => t.name)].sort((a, b) => a.localeCompare(b));
    return { bubble: true, mood: 'sheepish', pose: 'shrug', html: `
      <div class="eyebrow">You stumped me!</div>
      <p class="big">Who were you thinking of?</p>
      <p class="sub">Tell me, and I'll remember them next time.</p>
      <form id="teachForm" autocomplete="off">
        <label class="field" for="tName">Their name</label>
        <input class="input" id="tName" maxlength="40" list="tList" placeholder="e.g. Teboho Mokoena" required>
        <datalist id="tList">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        <label class="field" for="tDesc">Who are they? <span style="color:var(--dim);font-weight:600">(optional)</span></label>
        <input class="input" id="tDesc" maxlength="50" placeholder="e.g. Bafana Bafana midfielder">
        <div class="actions" style="margin-top:16px"><button type="submit" class="btn primary wide" data-primary>${k('A', 'Enter')}Teach Moya</button>
          <button type="button" class="btn" data-act="skip" data-b>${k('B')}Skip</button></div>
      </form>
      <p class="note">What you teach Moya is saved only in this browser, on this device.</p>` };
  },
  known() {
    const c = S.teachMatch, d = S.mind.disagreements(c.id);
    const list = d.map(x => `<li><b>${x.n}</b><span>${esc(QBY[x.q].text)}</span><small>You said <span class="tag ${x.a}">${ANS[x.a].label}</span> &nbsp;I had <span class="tag ${honestAnswer(x.v)}">${ANS[honestAnswer(x.v)].label}</span></small></li>`).join('');
    return { bubble: true, mood: 'surprise', pose: 'shrug', html: `
      <div class="eyebrow">I know them!</div>
      <p class="big">${esc(c.name)}! Of course.</p>
      <p class="sub">${d.length ? 'We saw these differently, so my orb went the wrong way:' : 'I just ran out of guesses before I reached them. Next time!'}</p>
      ${d.length ? `<ul class="review diff">${list}</ul>` : ''}
      <div class="actions"><button type="button" class="btn primary" data-act="start" data-primary>${k('A', 'Enter')}Play again</button>
        <button type="button" class="btn" data-act="review" data-y>${k('Y')}My answers</button></div>` };
  },
  taught() {
    const t = S.taughtName;
    return { bubble: true, mood: 'happy', pose: 'cheer', html: `
      <div class="eyebrow">Thank you!</div>
      <p class="big">Now I know ${esc(t)}.</p>
      <p class="sub">Think of them again next time and see if I can read your mind. I now know ${knownCount() + store.taught.length} characters.</p>
      <div class="actions"><button type="button" class="btn primary" data-act="start" data-primary>${k('A', 'Enter')}Play again</button>
        <button type="button" class="btn" data-act="review" data-y>${k('Y')}My answers</button></div>` };
  },
  review() {
    const rows = S.mind.history.map((h, i) => `<li><b>${i + 1}</b><span>${esc(QBY[h.q].text)}</span><span class="tag ${h.a}">${ANS[h.a].label}</span></li>`).join('');
    return { bubble: true, mood: 'idle', pose: 'rest', html: `
      <div class="eyebrow">Your answers</div>
      <p class="big" style="font-size:26px">${S.mind.asked} question${S.mind.asked === 1 ? '' : 's'}</p>
      <ul class="review">${rows || '<li><span>No questions yet.</span></li>'}</ul>
      <div class="actions"><button type="button" class="btn primary" data-act="backend" data-primary>${k('B')}Back</button>
        <button type="button" class="btn" data-act="start">Play again</button></div>` };
  },
};

function render(name, opts = {}) {
  // on small screens bring Moya and the new question back into view (instantly, so no button moves under a finger)
  if (scrollY > 0 && panel.getBoundingClientRect().top < 0) scrollTo({ top: 0, behavior: 'auto' });
  S.screen = name; document.body.dataset.screen = name;
  const v = SCREENS[name]();
  const html = `<div class="card ${v.bubble ? 'bubble' : ''} enter">${v.html}</div>`;
  panel.innerHTML = html;
  moya.mood(v.mood); moya.pose(v.pose); moya.thinking = !!v.thinking;
  refreshGlyphs(); hints();
  if (!opts.noFocus) focusPrimary();
  if (name === 'question' && store.speak) say(S.q.text);
  if (name === 'teach') setTimeout(() => $('tName')?.focus({ preventScroll: true }), 60);
}
function focusPrimary() {
  if (pad.touch) return;
  const el = panel.querySelector('[data-primary]') || (S.screen === 'question' ? null : panel.querySelector('button'));
  if (el) { el.focus({ preventScroll: true }); if (usePad()) setPadFocus(el); }
}
function refreshGlyphs(root = document) {
  root.querySelectorAll('.k[data-b]').forEach(e => { e.innerHTML = glyph(e.dataset.b, e.dataset.kb); });
  document.body.classList.toggle('touch', pad.touch);
  const sb = $('soundBtn');
  sb.innerHTML = store.sound ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 6 6M22 9l-6 6"/></svg>';
  sb.setAttribute('aria-label', store.sound ? 'Sound on' : 'Sound off');
}
function hints() {
  const h = $('hints');
  if (pad.touch) { h.innerHTML = ''; return; }
  if (S.screen === 'question' && !S.overlay) {
    h.innerHTML = usePad()
      ? `<span>${pad.glyph('L2')} Undo</span><span>${pad.glyph('R2')} Read aloud</span><span>${pad.glyph('START')} Menu</span><span>${pad.glyph('TOUCH')} Controls</span><span>${pad.glyph('HOME')} Arcade</span>`
      : `<span>${kb('1')}–${kb('6')} or ${kb('Y')} ${kb('N')} answer</span><span>${kb('Backspace')} undo</span>${canSpeak ? `<span>${kb('V')} read aloud</span>` : ''}<span>${kb('Esc')} menu</span>`;
  } else {
    h.innerHTML = usePad()
      ? `<span>${pad.glyph('UP')}${pad.glyph('DOWN')} move</span><span>${pad.glyph('A')} choose</span><span>${pad.glyph('B')} back</span><span>${pad.glyph('START')} menu</span><span>${pad.glyph('HOME')} Arcade</span>`
      : `<span>${kb('Tab')} move</span><span>${kb('Enter')} choose</span><span>${kb('Esc')} menu</span><span>${kb('Home')} Arcade</span>`;
  }
}
/** Fade the card out, then run fn (which renders the next one). */
function swap(fn, ms = 180) {
  const card = panel.querySelector('.card'); if (card) { card.classList.remove('enter'); card.classList.add('leave'); }
  setTimeout(fn, ms);
}

// ---------- the game ----------
function setMeter() { const c = S.mind ? S.mind.confidence() : 0; moya.confidence = c; $('meter').style.setProperty('--m', Math.round(c * 100) + '%'); }
function newGame() {
  audioOn(); play('start');
  S.mind = new Mind({ taught: store.taught }); S.guesses = 0; S.guess = null; S.q = null; S.busy = false; S.lastLine = '';
  setMeter(); swap(() => render('ready'));
}
function begin() {
  audioOn(); S.lastLine = pick(["Let's begin. Answer honestly!", 'The orb is listening…', 'Ready when you are.']);
  moya.play('hop'); swap(() => nextStep());
}
function nextStep() {
  const m = S.mind;
  if (m.shouldGuess()) return guess();
  const q = m.asked < MAX_QUESTIONS ? m.nextQuestion() : null;
  if (!q) return guess();
  S.q = q; S.busy = false; setMeter(); render('question');
}
const REACT = {
  yes: { anim: 'nod', mood: 'happy', lines: ['Aha!', 'I see…', 'Interesting!', 'Good, good…', 'Just as I thought.'] },
  no: { anim: 'shake', mood: 'curious', lines: ['Hmm, no?', 'Noted.', 'Not that, then.', 'Okay…', 'Interesting…'] },
  probably: { anim: 'tilt', mood: 'curious', lines: ['Probably… I like it.', 'Mm-hm.', "I'll take that."] },
  maybe: { anim: 'tilt', mood: 'shrug', lines: ['Maybe… sometimes, then.', 'Partly. I see.', 'A little bit of both?'] },
  probnot: { anim: 'shake', mood: 'curious', lines: ['Probably not… noted.', 'Hmm, okay.', 'Not really, then.'] },
  idk: { anim: 'shrug', mood: 'shrug', lines: ['No problem.', "That's fine!", "Let's try another one."] },
};
function answer(a) {
  if (S.busy || S.screen !== 'question' || S.overlay) return;
  S.busy = true; audioOn();
  const btn = panel.querySelector(`.ans[data-a="${a}"]`); btn?.classList.add('picked'); panel.querySelector('.card')?.classList.add('busy');
  const r = REACT[a]; moya.play(r.anim); moya.mood(r.mood); SND[a]();
  if (canSpeak) try { speechSynthesis.cancel(); } catch { /* none */ }
  setTimeout(() => {
    S.mind.answer(S.q.id, a); setMeter();
    const c = S.mind.confidence();
    S.lastLine = c > 0.75 ? pick(['I can almost see them…', 'It is coming to me…', 'The orb is glowing brighter…', 'Nearly there…']) : pick(r.lines);
    moya.thinking = true; moya.mood('think'); moya.pose('temples'); SND.think();
    swap(() => { moya.thinking = false; nextStep(); }, 260);
  }, 200);
}
function undo() {
  if (S.screen !== 'question' || S.busy || !S.mind.asked) return;
  const h = S.mind.undo(); play('back'); moya.play('tilt');
  S.q = QBY[h.q]; S.lastLine = 'Changed your mind? No problem.'; setMeter();
  swap(() => render('question'), 120);
}
function guess() {
  const m = S.mind;
  if (S.guesses >= MAX_GUESSES) return giveUp();
  const g = m.topGuess(); if (!g) return giveUp();
  S.guess = g; S.revealed = false; S.busy = true; setMeter();
  render('guess'); SND.drum(); speech('Hmm…', 1.2);
  setTimeout(() => {
    if (S.screen !== 'guess') return;
    S.revealed = true; S.busy = false; render('guess');
    moya.play('reveal'); SND.reveal(); pad.rumble(0.3, 0.6, 220);
    if (store.speak) say(`I think it's ${g.name}. Am I right?`);
  }, 1500);
}
function right() {
  if (S.busy) return;
  store.games++; store.moyaWins++; save();
  render('win'); moya.play('spin'); SND.win(); confetti(); pad.rumble(0.6, 1, 400);
  speech(pick(['I knew it!', 'Mind read!', 'Too easy!', 'The orb never lies!']), 2.6);
  if (store.speak) say(`Yes! I read your mind. ${S.guess.name}!`);
}
function wrong() {
  if (S.busy) return;
  S.mind.reject(S.guess.id); S.guesses++; setMeter(); play('back'); moya.play('droop');
  if (S.guesses >= MAX_GUESSES || S.mind.asked >= MAX_QUESTIONS) return giveUp();
  render('wrong');
}
function giveUp() {
  S.busy = false; store.games++; store.playerWins++; save();
  SND.lose(); moya.play('droop'); render('teach');
}
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function findKnown(name) {
  const n = norm(name); if (!n) return null;
  const m = S.mind, all = m.chars;
  const hits = all.filter(c => {
    const cn = norm(c.name), words = cn.split(' ');
    return cn === n || norm(c.id) === n.replace(/ /g, '') || (n.length >= 4 && !n.includes(' ') && (words[0] === n || words[words.length - 1] === n));
  });
  if (!hits.length) return null;
  return hits.map(c => ({ c, p: m.w[m.chars.indexOf(c)] || 0 })).sort((a, b) => b.p - a.p)[0].c;
}
function teach(e) {
  e?.preventDefault?.();
  const name = $('tName').value.trim().replace(/\s+/g, ' '), desc = $('tDesc').value.trim().replace(/\s+/g, ' ');
  if (!name) { $('tName').focus(); $('tName').animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 260 }); return; }
  const known = findKnown(name), values = {};
  for (const h of S.mind.history) { const v = answerValue(h.a); if (v !== null) values[h.q] = v; }
  if (known && !known.taught) { S.teachMatch = known; play('select'); swap(() => render('known')); return; }
  if (known && known.taught) {
    const t = store.taught.find(x => x.id === known.id); Object.assign(t.values, values); if (desc) t.desc = desc;
  } else store.taught.push({ id: 't-' + Date.now().toString(36), name, desc: desc || 'Someone you taught me', values });
  save(); S.taughtName = known ? known.name : name; play('select'); confetti(0.5);
  swap(() => render('taught'));
}

// ---------- overlays: menu, how to play, forget ----------
const overlayEl = $('overlay');
const OVERLAYS = {
  pause: () => `<div class="eyebrow">Menu</div><p class="big" style="margin-bottom:4px">Paused</p>
    <div class="menu">
      <button type="button" class="btn primary" data-act="close" data-primary>Resume ${k('B', 'Esc')}</button>
      <button type="button" class="btn" data-act="start">New game</button>
      <button type="button" class="btn" data-act="help">How to play</button>
      <button type="button" class="btn" data-act="controls">Controller buttons ${k('TOUCH', 'H')}</button>
      <button type="button" class="btn" data-act="sound">Sound: ${store.sound ? 'On' : 'Off'} ${k('SELECT', 'S')}</button>
      ${canSpeak ? `<button type="button" class="btn" data-act="read">Read questions aloud: ${store.speak ? 'On' : 'Off'}</button>` : ''}
      ${store.taught.length ? `<button type="button" class="btn" data-act="forget">Forget the ${store.taught.length} character${store.taught.length === 1 ? '' : 's'} you taught me</button>` : ''}
      <a class="btn" href="index.html?from=moya">Back to the Arcade ${k('HOME', 'Home')}</a>
    </div>`,
  help: () => `<div class="eyebrow">How to play</div><p class="big" style="margin-bottom:6px">Moya reads minds</p>
    <p class="sub" style="margin-bottom:6px">Think of any character, real or made-up. Moya asks questions and guesses who it is. If Moya gets stuck, tell it who you were thinking of and it will remember.</p>
    <h3>Your six answers</h3>
    <div class="guide">
      <div><span class="tag yes">Yes</span>It is true.</div>
      <div><span class="tag no">No</span>It is not true.</div>
      <div><span class="tag probably">Probably</span>You think it is true, but you are not sure.</div>
      <div><span class="tag maybe">Maybe</span>Partly true, or only sometimes.</div>
      <div><span class="tag probnot">Probably not</span>You think it is not true, but you are not sure.</div>
      <div><span class="tag idk">I don't know</span>You have no idea. Moya skips it.</div>
    </div>
    ${pad.touch ? '<h3>Playing</h3><p class="sub" style="margin:0">Tap an answer. Tap Undo to change your last answer, and the speaker to hear the question.</p>' : `<h3>Buttons <span style="color:var(--dim);letter-spacing:.06em;text-transform:none;font-weight:600">controller · keyboard</span></h3>
    <div class="keys">
      ${ANSWERS.map(a => `<span>${ctl(a.btn)} ${kb(a.key)}</span><span>${a.label}</span>`).join('')}
      <span>${ctl('L2')} ${kb('⌫')}</span><span>Undo last answer</span>
      <span>${ctl('R2')} ${kb('V')}</span><span>Read aloud</span>
      <span>${ctl('START')} ${kb('Esc')}</span><span>Menu</span>
      <span>${ctl('HOME')} ${kb('Home')}</span><span>Arcade</span>
    </div>`}
    <p class="note">"From" means where a made-up character lives in their story. Facts checked November 2026.</p>
    <div class="actions" style="margin-top:10px"><button type="button" class="btn primary" data-act="close" data-primary>Got it ${k('B', 'Esc')}</button></div>`,
  forget: () => `<div class="eyebrow">Forget</div><p class="big">Forget what you taught me?</p>
    <p class="sub">Moya will forget the ${store.taught.length} character${store.taught.length === 1 ? '' : 's'} you taught it on this device. This cannot be undone.</p>
    <div class="actions"><button type="button" class="btn" data-act="forget-yes">Forget them</button>
      <button type="button" class="btn primary" data-act="close" data-primary>Keep them ${k('B', 'Esc')}</button></div>`,
};
function openOverlay(name) {
  audioOn(); if (!S.overlay) play('select');
  S.overlay = name; overlayEl.innerHTML = `<div class="card enter">${OVERLAYS[name]()}</div>`; overlayEl.classList.remove('hidden');
  refreshGlyphs(overlayEl); hints();
  if (!pad.touch) { const el = overlayEl.querySelector('[data-primary]') || overlayEl.querySelector('button'); el?.focus({ preventScroll: true }); if (usePad()) setPadFocus(el); }
}
function closeOverlay() { if (!S.overlay) return; S.overlay = null; overlayEl.classList.add('hidden'); overlayEl.innerHTML = ''; play('back'); hints(); focusPrimary(); }
function toggleSound() { store.sound = !store.sound; save(); audioOn(); if (store.sound) play('select'); refreshGlyphs(); if (S.overlay === 'pause') openOverlay('pause'); }

// ---------- clicks ----------
function act(name, el) {
  audioOn();
  switch (name) {
    case 'start': closeOverlay(); newGame(); break;
    case 'go': begin(); break;
    case 'title': play('back'); swap(() => render('title')); break;
    case 'answer': answer(el.dataset.a); break;
    case 'undo': undo(); break;
    case 'speak': say(S.q?.text || ''); break;
    case 'right': right(); break;
    case 'wrong': wrong(); break;
    case 'keep': play('select'); swap(() => nextStep()); break;
    case 'tell': giveUp(); break;
    case 'skip': play('back'); swap(() => render('title')); break;
    case 'review': S.back = S.screen; play('select'); swap(() => render('review')); break;
    case 'backend': play('back'); swap(() => render(S.back || 'title')); break;
    case 'pause': S.overlay ? closeOverlay() : openOverlay('pause'); break;
    case 'help': openOverlay('help'); break;
    case 'controls': closeOverlay(); controls.show(); break;
    case 'sound': toggleSound(); break;
    case 'read': store.speak = !store.speak; save(); openOverlay('pause'); if (store.speak) say('I will read the questions aloud.'); break;
    case 'forget': openOverlay('forget'); break;
    case 'forget-yes': store.taught = []; save(); closeOverlay(); speech('Forgotten. My mind is clear!'); if (S.screen === 'title') render('title'); break;
    case 'close': closeOverlay(); break;
  }
}
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  if (el.tagName === 'A') return;
  e.preventDefault(); clearPadFocus(); act(el.dataset.act, el);
});
document.addEventListener('submit', e => { if (e.target.id === 'teachForm') teach(e); });
// Enter with nothing focused (e.g. right after the page opens) presses the main button
addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.repeat || controls.visible) return;
  const f = document.activeElement; if (f && f !== document.body && f !== document.documentElement) return;
  const el = (S.overlay ? overlayEl : panel).querySelector('[data-primary]'); if (el) { e.preventDefault(); el.click(); }
});
overlayEl.addEventListener('click', e => { if (e.target === overlayEl) closeOverlay(); });
addEventListener('pointerdown', () => audioOn(), { passive: true });
addEventListener('pointermove', e => {
  clearPadFocus();
  const r = $('moya').getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height * 0.4;
  moya.gaze((e.clientX - cx) / (r.width * 1.4), (e.clientY - cy) / (r.height * 1.2)); gazeIdle = 3;
}, { passive: true });
let gazeIdle = 0;

// ---------- controller focus (D-pad / stick moves between buttons) ----------
let padFocusEl = null;
function setPadFocus(el) { clearPadFocus(); if (!el) return; padFocusEl = el; el.classList.add('padfocus'); el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest' }); }
function clearPadFocus() { padFocusEl?.classList.remove('padfocus'); padFocusEl = null; }
function focusables(root) { return [...root.querySelectorAll('button:not([disabled]), a.btn, input')].filter(e => e.offsetParent !== null); }
function moveFocus(root, dx, dy) {
  const list = focusables(root); if (!list.length) return;
  const cur = padFocusEl && list.includes(padFocusEl) ? padFocusEl : list.includes(document.activeElement) ? document.activeElement : null;
  if (!cur) return setPadFocus(root.querySelector('[data-primary]') || list[0]);
  const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bd = Infinity;
  for (const el of list) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2, ddx = bx - ax, ddy = by - ay;
    const along = dx ? ddx * dx : ddy * dy, across = dx ? Math.abs(ddy) : Math.abs(ddx);
    if (along <= 4) continue;
    const d = along + across * 2.2;
    if (d < bd) { bd = d; best = el; }
  }
  if (best) { setPadFocus(best); play('ui'); }
}

// ---------- background sky ----------
const sky = $('sky'), sx = sky.getContext('2d');
let stars = [], shooting = null, SW = 0, SH = 0;
function sizeSky() {
  const dpr = Math.min(2, devicePixelRatio || 1); SW = innerWidth; SH = innerHeight;
  sky.width = SW * dpr; sky.height = SH * dpr; sx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const n = Math.round(Math.min(260, SW * SH / 5200));
  stars = Array.from({ length: n }, () => ({ x: Math.random() * SW, y: Math.random() * SH, r: Math.random() < 0.1 ? 1.6 + Math.random() : 0.5 + Math.random() * 0.9, p: Math.random() * 7, s: 0.6 + Math.random() * 2.2, c: Math.random() < 0.15 ? '#ffe6a8' : Math.random() < 0.2 ? '#bff8ee' : '#ffffff' }));
  sizeConfetti();
}
function drawSky(t) {
  const g = sx.createLinearGradient(0, 0, 0, SH); g.addColorStop(0, '#0c0628'); g.addColorStop(0.55, '#1a0d45'); g.addColorStop(1, '#0a0522'); sx.fillStyle = g; sx.fillRect(0, 0, SW, SH);
  const neb = (x, y, r, c) => { const n = sx.createRadialGradient(x, y, 0, x, y, r); n.addColorStop(0, c); n.addColorStop(1, 'rgba(0,0,0,0)'); sx.fillStyle = n; sx.fillRect(0, 0, SW, SH); };
  const m = reduced ? 0 : 1;
  neb(SW * (0.25 + Math.sin(t * 0.00005) * 0.05 * m), SH * 0.4, Math.max(SW, SH) * 0.55, 'rgba(124, 85, 239, 0.28)');
  neb(SW * (0.82 + Math.cos(t * 0.00004) * 0.04 * m), SH * 0.25, Math.max(SW, SH) * 0.45, 'rgba(94, 242, 214, 0.10)');
  neb(SW * 0.6, SH * (0.95 + Math.sin(t * 0.00006) * 0.03 * m), Math.max(SW, SH) * 0.5, 'rgba(255, 143, 199, 0.10)');
  for (const s of stars) {
    sx.globalAlpha = reduced ? 0.7 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.001 * s.s + s.p));
    sx.fillStyle = s.c; sx.beginPath(); sx.arc(s.x, s.y, s.r, 0, 7); sx.fill();
  }
  sx.globalAlpha = 1;
  if (!reduced) {
    if (!shooting && Math.random() < 0.0025) shooting = { x: Math.random() * SW * 0.7, y: Math.random() * SH * 0.35, vx: 7 + Math.random() * 5, vy: 2.5 + Math.random() * 2, life: 1 };
    if (shooting) {
      const s = shooting; s.x += s.vx; s.y += s.vy; s.life -= 0.018;
      const tg = sx.createLinearGradient(s.x, s.y, s.x - s.vx * 14, s.y - s.vy * 14); tg.addColorStop(0, `rgba(255,255,255,${s.life})`); tg.addColorStop(1, 'rgba(255,255,255,0)');
      sx.strokeStyle = tg; sx.lineWidth = 2; sx.beginPath(); sx.moveTo(s.x, s.y); sx.lineTo(s.x - s.vx * 14, s.y - s.vy * 14); sx.stroke();
      if (s.life <= 0) shooting = null;
    }
  }
}

// ---------- confetti ----------
const cf = $('confetti'), cx2 = cf.getContext('2d'); let bits = [];
function sizeConfetti() { const dpr = Math.min(2, devicePixelRatio || 1); cf.width = innerWidth * dpr; cf.height = innerHeight * dpr; cx2.setTransform(dpr, 0, 0, dpr, 0, 0); }
function confetti(amount = 1) {
  if (reduced) return;
  const r = $('moya').getBoundingClientRect(), ox = r.left + r.width / 2, oy = r.top + r.height * 0.45;
  const cols = ['#ffcf5a', '#5ef2d6', '#b59bff', '#ff8fc7', '#ffffff', '#36d46a'];
  for (let i = 0; i < 160 * amount; i++) {
    const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 9;
    bits.push({ x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 6, w: 6 + Math.random() * 7, h: 4 + Math.random() * 5, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: cols[i % cols.length], life: 1, star: Math.random() < 0.25 });
  }
}
function drawConfetti(dt) {
  cx2.clearRect(0, 0, innerWidth, innerHeight); if (!bits.length) return;
  const f = dt * 60;
  bits = bits.filter(b => {
    b.vy += 0.22 * f; b.vx *= Math.pow(0.99, f); b.x += b.vx * f; b.y += b.vy * f; b.r += b.vr * f; b.life -= 0.006 * f;
    cx2.save(); cx2.globalAlpha = Math.max(0, Math.min(1, b.life * 2)); cx2.translate(b.x, b.y); cx2.rotate(b.r); cx2.fillStyle = b.c;
    if (b.star) { cx2.beginPath(); for (let i = 0; i < 8; i++) { const rr = i % 2 ? 2.5 : 7; cx2.lineTo(Math.cos(i * Math.PI / 4) * rr, Math.sin(i * Math.PI / 4) * rr); } cx2.fill(); }
    else cx2.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.r * 2)));
    cx2.restore();
    return b.life > 0 && b.y < innerHeight + 40;
  });
}

// ---------- main loop ----------
let last = performance.now(), sig = '';
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  pad.update();
  const s2 = `${pad.connected}|${pad.usingPad}|${pad.kind}|${pad.touch}`; if (s2 !== sig) { sig = s2; refreshGlyphs(); hints(); }
  if (pad.any()) audioOn();

  if (controls.visible) {
    controls.update();
    if (pad.pressed('TOUCH') || pad.pressed('B') || pad.pressed('START') || pad.pressed('HOME')) { controls.hide(); play('back'); }
  } else if (pad.pressed('HOME')) goHome();
  else if (pad.pressed('TOUCH')) { closeOverlay(); controls.show(); play('select'); }
  else if (pad.pressed('START')) act('pause');
  else if (pad.pressed('SELECT')) toggleSound();
  else if (S.overlay) {
    if (pad.pressed('UP')) moveFocus(overlayEl, 0, -1); if (pad.pressed('DOWN')) moveFocus(overlayEl, 0, 1);
    if (pad.pressed('LEFT')) moveFocus(overlayEl, -1, 0); if (pad.pressed('RIGHT')) moveFocus(overlayEl, 1, 0);
    stickNav(overlayEl, dt);
    if (pad.pressed('A') && usePad()) (padFocusEl || document.activeElement)?.click?.();
    if (pad.pressed('B')) closeOverlay();
  } else screenInput(dt);

  if (pad.pressed('L3')) { moya.play('spin'); SND.spin(); }
  if (pad.pressed('R3')) tickle();
  if (Math.hypot(pad.rx, pad.ry) > 0.25) { moya.gaze(pad.rx, pad.ry); gazeIdle = 2; }
  if (gazeIdle > 0) { gazeIdle -= dt; if (gazeIdle <= 0) moya.gaze(null); }
  if (sayTimer > 0) { sayTimer -= dt; if (sayTimer <= 0) sayEl.classList.remove('on'); }

  moya.update(dt, now / 1000);
  drawSky(now); drawConfetti(dt);
  requestAnimationFrame(loop);
}
let stickWait = 0;
function stickNav(root, dt) {
  const x = pad.lx, y = pad.ly;
  if (Math.hypot(x, y) < 0.6) { stickWait = 0; return; }
  stickWait -= dt; if (stickWait > 0) return; stickWait = 0.28;
  if (Math.abs(x) > Math.abs(y)) moveFocus(root, Math.sign(x), 0); else moveFocus(root, 0, -Math.sign(y));
}
function screenInput(dt) {
  const scr = S.screen;
  if (scr === 'question') {
    for (const a of ANSWERS) if (pad.pressed(a.btn)) return answer(a.id);
    if (pad.pressed('L2')) return undo();
    if (pad.pressed('R2')) return say(S.q.text);
    return;
  }
  if (scr === 'guess') {
    if (!S.revealed) return;
    if (pad.pressed('A')) return right();
    if (pad.pressed('B')) return wrong();
    return;
  }
  const typing = document.activeElement?.tagName === 'INPUT';
  if (pad.pressed('UP')) moveFocus(panel, 0, -1); if (pad.pressed('DOWN')) moveFocus(panel, 0, 1);
  if (pad.pressed('LEFT')) moveFocus(panel, -1, 0); if (pad.pressed('RIGHT')) moveFocus(panel, 1, 0);
  stickNav(panel, dt);
  if (pad.pressed('A') && usePad()) {
    const f = padFocusEl || document.activeElement;
    if (f && panel.contains(f) && f.tagName !== 'INPUT') return f.click();
    if (scr === 'teach') return teach();
    return panel.querySelector('[data-primary]')?.click();
  }
  if (pad.pressed('A') && !usePad() && !typing) return panel.querySelector('[data-primary]')?.click();   // keyboard 1 / Y
  if (pad.pressed('Y')) return panel.querySelector('[data-y]')?.click();
  if (pad.pressed('B') && !typing) return panel.querySelector('[data-b]')?.click() ?? (scr === 'review' && act('backend'));
}

// ---------- start ----------
addEventListener('resize', sizeSky);
addEventListener('pageshow', () => document.body.classList.remove('leaving'));
if (canSpeak) try { speechSynthesis.getVoices(); } catch { /* voices load later */ }
sizeSky(); render('title', { noFocus: true }); setMeter(); speech('Hello! Think of someone…', 3);
requestAnimationFrame(loop);

// test hook (used by src/moya/browser.mjs)
window.moyaTest = {
  history: () => S.mind?.history || [],
  state: () => ({ busy: S.busy, screen: S.screen, overlay: S.overlay, asked: S.mind?.asked || 0, q: S.q?.id || null, guess: S.guess?.id || null, revealed: S.revealed, guesses: S.guesses, conf: S.mind ? S.mind.confidence() : 0, taught: store.taught.length, sound: store.sound }),
  look: (mood, pose) => { moya.mood(mood); moya.pose(pose); },
  honest: id => { const c = CHARACTERS.find(x => x.id === id); return S.q ? honestAnswer(valueOf(c, S.q)) : null; },
};
