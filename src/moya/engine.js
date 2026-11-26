// Moya's mind: Bayesian guessing over every character it knows. No DOM, so the tests can play thousands of games.
//
// Every character starts with a small prior (famous ones a little higher). Each answer multiplies a character's weight
// by how likely that answer is if the player were thinking of them:
//   L(answer, value) = FLOOR + (1 - FLOOR) * exp(-(answer - value)² / 2σ²)
// with answers on a 0..1 scale (Yes 1, Probably .75, Maybe .5, Probably not .25, No 0). A matching answer keeps the
// weight, a near miss costs a little, and a flat contradiction costs a factor of about 12, never zero, so one mistaken
// answer can be recovered from. "I don't know" changes nothing. When Moya has no fact for a character (value null),
// every answer gives the same middling likelihood, so the character is neither helped nor hurt.
// The next question is the one with the largest expected information gain, with a little randomness so games vary.
import { ANSWERS, QUESTIONS, CHARACTERS, valueOf } from './data.js';

export const FLOOR = 0.08, SIGMA = 0.27, UNKNOWN = 0.5;
const STEPS = ANSWERS.filter(a => a.v !== null).map(a => a.v);   // the five informative answers
export const likelihood = (a, v) => (v === null || v === undefined || Number.isNaN(v)) ? UNKNOWN : FLOOR + (1 - FLOOR) * Math.exp(-((a - v) ** 2) / (2 * SIGMA * SIGMA));
const PRIOR = { 1: 1, 2: 1.35, 3: 1.8 };

/** The answer a perfectly honest player gives for a stored value (null: "I don't know"). */
export function honestAnswer(v) {
  if (v === null || v === undefined) return 'idk';
  return v >= 0.875 ? 'yes' : v >= 0.625 ? 'probably' : v >= 0.375 ? 'maybe' : v >= 0.125 ? 'probnot' : 'no';
}
export const answerValue = id => ANSWERS.find(a => a.id === id)?.v ?? null;

/** Characters the player taught Moya (kept in the browser) become ordinary characters. */
export function taughtCharacter(t) {
  return { id: t.id, name: t.name, desc: t.desc || 'Someone you taught me', cat: 'taught', pop: 2, taught: true, values: t.values };
}

export class Mind {
  /**
   * @param {object} o  characters (default: all), questions (default: all), rng (default Math.random),
   *   taught: [{ id, name, desc, values: { questionId: 0..1 } }]
   */
  constructor(o = {}) {
    this.questions = o.questions || QUESTIONS;
    this.chars = [...(o.characters || CHARACTERS), ...(o.taught || []).map(taughtCharacter)];
    this.rng = o.rng || Math.random;
    this.sure = o.sure ?? 0.93; this.minQ = o.minQ ?? 7;   // how sure Moya must be, and the fewest questions, before guessing
    const nq = this.questions.length;
    this.qIndex = new Map(this.questions.map((q, i) => [q.id, i]));
    // value table: chars × questions, NaN = unknown
    this.V = this.chars.map(c => {
      const row = new Float64Array(nq);
      this.questions.forEach((q, j) => {
        const v = c.taught ? (c.values?.[q.id] ?? null) : valueOf(c, q);
        row[j] = v === null ? NaN : v;
      });
      return row;
    });
    this.prior = this.chars.map(c => PRIOR[c.pop] || 1);
    // P(answer k | value) for the five informative answers, normalised: the answer model used to score questions
    this._pk = v => { if (Number.isNaN(v)) return STEPS.map(() => 1 / STEPS.length); const l = STEPS.map(a => likelihood(a, v)); const s = l.reduce((x, y) => x + y, 0); return l.map(x => x / s); };
    this.reset();
  }

  reset() { this.history = []; this.rejected = new Set(); this.recompute(); }

  /** Weights from scratch: prior × every answer so far; rejected guesses are out. */
  recompute() {
    const w = this.prior.slice();
    for (const { q, a } of this.history) {
      const v = answerValue(a); if (v === null) continue;
      const j = this.qIndex.get(q);
      for (let i = 0; i < w.length; i++) if (w[i]) w[i] *= likelihood(v, this.V[i][j]);
    }
    for (const i of this.rejected) w[i] = 0;
    const s = w.reduce((x, y) => x + y, 0) || 1;
    this.w = w.map(x => x / s);
  }

  get asked() { return this.history.length; }
  answer(qid, a) { this.history.push({ q: qid, a }); this.recompute(); }
  undo() { const h = this.history.pop(); this.recompute(); return h; }
  reject(id) { const i = this.chars.findIndex(c => c.id === id); if (i >= 0) this.rejected.add(i); this.recompute(); }

  /** Characters ranked by probability: [{ c, p }]. */
  ranking(n = 5) {
    return this.w.map((p, i) => ({ c: this.chars[i], p, i })).filter(x => !this.rejected.has(x.i)).sort((a, b) => b.p - a.p).slice(0, n);
  }
  confidence() { return this.ranking(1)[0]?.p || 0; }

  /** Expected information gain (bits) of asking question index j. */
  gain(j) {
    const w = this.w, n = w.length, K = STEPS.length;
    const H = p => { let h = 0; for (const x of p) if (x > 1e-12) h -= x * Math.log2(x); return h; };
    const pk = new Float64Array(K), post = Array.from({ length: K }, () => new Float64Array(n));
    for (let i = 0; i < n; i++) {
      if (!w[i]) continue;
      const lk = this._pk(this.V[i][j]);
      for (let k = 0; k < K; k++) { const x = w[i] * lk[k]; pk[k] += x; post[k][i] = x; }
    }
    let after = 0;
    for (let k = 0; k < K; k++) { if (pk[k] < 1e-12) continue; const p = post[k].map(x => x / pk[k]); after += pk[k] * H(p); }
    return H(w) - after;
  }

  /** The next question to ask, or null if none would teach Moya anything. */
  nextQuestion() {
    const askedIds = new Set(this.history.map(h => h.q));
    const scored = [];
    this.questions.forEach((q, j) => { if (!askedIds.has(q.id)) scored.push({ q, g: this.gain(j) }); });
    scored.sort((a, b) => b.g - a.g);
    if (!scored.length || scored[0].g < 0.005) return null;
    // a little variety: choose among the questions almost as good as the best one, favouring the best
    const best = scored[0].g, close = scored.filter(s => s.g >= best * (this.asked ? 0.9 : 0.8)).slice(0, this.asked ? 3 : 4);
    const ws = close.map((s, i) => s.g / (i + 1)), total = ws.reduce((x, y) => x + y, 0);
    let r = this.rng() * total;
    for (let i = 0; i < close.length; i++) { r -= ws[i]; if (r <= 0) return close[i].q; }
    return close[0].q;
  }

  /** Should Moya guess now? Sure enough, or it has asked enough questions for this round. */
  shouldGuess() {
    const [a, b] = this.ranking(2); if (!a) return false;
    const n = this.asked, round = this.rejected.size;
    if (n >= 25 + round * 8) return true;                       // 25 questions, then 8 more after each wrong guess
    if (n < this.minQ) return false;
    if (a.p >= this.sure) return true;
    return n >= 10 && a.p >= 0.72 && a.p >= 5 * (b?.p || 0);
  }
  topGuess() { return this.ranking(1)[0]?.c || null; }

  /** Questions where the player's answers disagreed with what Moya knows about a character (for "I knew them!"). */
  disagreements(id, limit = 4) {
    const i = this.chars.findIndex(c => c.id === id); if (i < 0) return [];
    return this.history.map(({ q, a }, k) => {
      const v = this.V[i][this.qIndex.get(q)], av = answerValue(a);
      return { n: k + 1, q, a, v: Number.isNaN(v) ? null : v, miss: av === null || Number.isNaN(v) ? 0 : Math.abs(av - v) };
    }).filter(d => d.miss >= 0.5).sort((x, y) => y.miss - x.miss).slice(0, limit);
  }
}
