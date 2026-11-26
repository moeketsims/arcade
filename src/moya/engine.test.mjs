// Moya engine tests: node --test src/moya/engine.test.mjs
// Checks the data for typos and impossible facts, then plays a full game against every character with an honest
// player and with a player who makes mistakes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANSWERS, QUESTIONS, CHARACTERS, COUNTRY, REGIONS, KNOWN_TAGS, parseTags, valueOf } from './data.js';
import { Mind, honestAnswer, likelihood } from './engine.js';

// small deterministic random numbers so failures repeat
const rng = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

/** Play one game: the player thinks of `target` and answers with answerFor(question). Returns { won, asked, guesses }. */
export function play(target, answerFor, seed = 1, maxGuesses = 4) {
  const m = new Mind({ rng: rng(seed) });
  let guesses = 0;
  while (guesses < maxGuesses && m.asked < 60) {
    const q = m.shouldGuess() ? null : m.nextQuestion();
    if (!q) {
      const g = m.topGuess(); guesses++;
      if (g.id === target.id) return { won: true, asked: m.asked, guesses };
      m.reject(g.id); continue;
    }
    m.answer(q.id, answerFor(q));
  }
  return { won: false, asked: m.asked, guesses };
}

test('six answers in the order asked for, with their buttons', () => {
  assert.deepEqual(ANSWERS.map(a => a.label), ['Yes', 'No', 'Probably', 'Maybe', 'Probably not', "I don't know"]);
  assert.equal(new Set(ANSWERS.map(a => a.btn)).size, 6);
  assert.equal(new Set(ANSWERS.map(a => a.key)).size, 6);
});

test('data: unique ids, known tags, valid countries, every fact in range', () => {
  const ids = new Set(), names = new Set();
  for (const c of CHARACTERS) {
    assert.ok(!ids.has(c.id), 'duplicate id ' + c.id); ids.add(c.id);
    assert.ok(!names.has(c.name.toLowerCase()), 'duplicate name ' + c.name); names.add(c.name.toLowerCase());
    assert.ok(c.desc && c.desc.length <= 60, `${c.id}: description missing or too long`);
    assert.ok([1, 2, 3].includes(c.pop), c.id + ': pop');
    const t = parseTags(c.tags);
    for (const k of t.facts.keys()) assert.ok(KNOWN_TAGS.has(k), `${c.id}: unknown tag "${k}"`);
    for (const k of t.countries.keys()) assert.ok(COUNTRY[k], `${c.id}: unknown country "${k}"`);
    for (const k of t.regions.keys()) assert.ok(REGIONS.includes(k), `${c.id}: unknown region "${k}"`);
    const real = t.facts.get('real') === 1;
    assert.ok(t.facts.has('m') || t.facts.has('f') || !real, `${c.id}: real people need m or f`);
    if (real) assert.ok(t.by !== null || t.facts.has('b2000'), `${c.id}: real people need a birth year`);
    if (real) assert.ok(t.countries.size, `${c.id}: real people need a country`);
    for (const q of QUESTIONS) { const v = valueOf(c, q); assert.ok(v === null || (v >= 0 && v <= 1), `${c.id}/${q.id} = ${v}`); }
  }
  assert.ok(CHARACTERS.length >= 200, 'Moya should know at least 200 characters, knows ' + CHARACTERS.length);
  assert.equal(new Set(QUESTIONS.map(q => q.id)).size, QUESTIONS.length, 'duplicate question id');
});

test('facts that changed in 2026 are right', () => {
  const v = (id, q) => valueOf(CHARACTERS.find(c => c.id === id), QUESTIONS.find(x => x.id === q));
  assert.equal(v('yamal', 'worldcup'), 1);   // Spain won the 2026 World Cup
  assert.equal(v('rodri', 'worldcup'), 1);
  assert.equal(v('messi', 'worldcup'), 1);   // 2022
  assert.equal(v('kane', 'ballondor'), 1);   // 2026 Ballon d'Or
  assert.equal(v('mbappe', 'ballondor'), 0);
  assert.equal(v('salah', 'liverpool'), 1);  // left in 2026, still played there
  assert.equal(v('salah', 'chelsea'), 1);
  assert.equal(v('enzo', 'mancity'), 1);     // moved from Chelsea in 2026
  assert.equal(v('tyla', 'grammy'), 1);
  assert.equal(v('mandela', 'alive'), 0);
  assert.equal(v('charles', 'alive'), 1);
  assert.equal(v('musk', 'za'), 1);
  assert.equal(v('gumball', 'real'), 0);
  assert.equal(v('gumball', 'alive'), null);  // real-only question: skipped for made-up characters
});

test('likelihood: matching answers keep weight, contradictions cost but never zero', () => {
  assert.equal(likelihood(1, 1), 1);
  assert.ok(likelihood(0, 1) > 0.07 && likelihood(0, 1) < 0.1);
  assert.ok(likelihood(0.75, 1) > likelihood(0.5, 1));
  assert.ok(likelihood(0.5, 0.5) > likelihood(1, 0.5));
});

test('no two characters look the same to every question', () => {
  const m = new Mind();
  const twins = [];
  for (let a = 0; a < m.chars.length; a++) for (let b = a + 1; b < m.chars.length; b++) {
    let diff = 0;
    for (let j = 0; j < m.questions.length; j++) {
      const x = m.V[a][j], y = m.V[b][j];
      if (Number.isNaN(x) !== Number.isNaN(y) || (!Number.isNaN(x) && Math.abs(x - y) >= 0.5)) diff++;
    }
    if (diff < 1) twins.push(m.chars[a].id + '=' + m.chars[b].id);
  }
  assert.deepEqual(twins, [], 'indistinguishable: ' + twins.join(', '));
});

test('an honest player: Moya finds every character', () => {
  const misses = [], slow = []; let total = 0, first = 0;
  CHARACTERS.forEach((c, i) => {
    const r = play(c, q => honestAnswer(valueOf(c, q)), i + 7);
    if (!r.won) misses.push(c.id); else { total += r.asked; if (r.guesses === 1) first++; if (r.asked > 30) slow.push(`${c.id}:${r.asked}`); }
  });
  const n = CHARACTERS.length;
  console.log(`  honest: ${n - misses.length}/${n} found, ${first} on the first guess, ${(total / (n - misses.length)).toFixed(1)} questions on average`);
  assert.deepEqual(misses, [], 'not found: ' + misses.join(', '));
  assert.ok(first / n >= 0.9, `first-guess rate ${(first / n).toFixed(2)}`);
});

test('a player who makes mistakes: Moya still finds most', () => {
  let won = 0, games = 0;
  CHARACTERS.forEach((c, i) => {
    const r = rng(1000 + i);
    const res = play(c, q => {
      const x = r();
      if (x < 0.07) return ANSWERS[Math.floor(r() * 5)].id;   // 7% a random wrong-ish answer
      if (x < 0.15) return 'idk';                             // 8% "I don't know"
      return honestAnswer(valueOf(c, q));
    }, i + 99);
    games++; if (res.won) won++;
  });
  console.log(`  noisy: ${won}/${games} found`);
  assert.ok(won / games >= 0.85, `noisy success ${(won / games).toFixed(2)}`);
});

test('taught characters are learned and guessed', () => {
  const values = { real: 0, human: 1, kid: 1, gumball: 0, cartoon: 0, liveaction: 1, f: 1, m: 0, za: 1, africa: 1, magic: 0 };
  const m = new Mind({ taught: [{ id: 't-1', name: 'My cousin Lebo', values }] });
  assert.ok(m.chars.some(c => c.name === 'My cousin Lebo'));
  for (const [q, v] of Object.entries(values)) m.answer(q, honestAnswer(v));
  assert.ok(m.ranking(3).some(r => r.c.id === 't-1'));
});

test('undo restores the previous state', () => {
  const m = new Mind({ rng: rng(3) });
  const before = m.w.slice();
  m.answer('real', 'yes'); assert.notDeepEqual(m.w, before);
  m.undo(); assert.deepEqual(m.w, before);
});
