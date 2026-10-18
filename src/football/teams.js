// Original clubs, generated squads and the 4-3-3 shape. Team 0 (you) always attacks +x.
import { SKIN, HAIR } from '../common/humanoid.js';

export const CLUBS = [
  { id: 'HAR', name: 'Harbour City', kit: { shirt: 0x5ec8f2, sleeve: 0x5ec8f2, shorts: 0xffffff, socks: 0x5ec8f2, number: '#0b2a4a' }, keeperKit: { shirt: 0x2bb673, sleeve: 0x1f8a57, shorts: 0x1f8a57, socks: 0x2bb673, number: '#ffffff' }, color: '#5ec8f2', crest: 0xffffff },
  { id: 'RED', name: 'Redwood Athletic', kit: { shirt: 0xd62828, sleeve: 0xffffff, shorts: 0x1a1a1a, socks: 0xd62828, number: '#ffffff' }, keeperKit: { shirt: 0xffd60a, sleeve: 0xffd60a, shorts: 0x1a1a1a, socks: 0xffd60a, number: '#1a1a1a' }, color: '#d62828', crest: 0xffd60a },
  { id: 'NOR', name: 'Northbridge United', kit: { shirt: 0xf2f2f2, sleeve: 0x111111, shorts: 0x111111, socks: 0xf2f2f2, number: '#111111' }, keeperKit: { shirt: 0xff7a00, sleeve: 0xff7a00, shorts: 0xff7a00, socks: 0xff7a00, number: '#111111' }, color: '#f2f2f2', crest: 0x111111 },
  { id: 'SUN', name: 'Sunvale Rovers', kit: { shirt: 0xffd60a, sleeve: 0x2a9d8f, shorts: 0x2a9d8f, socks: 0xffd60a, number: '#0d3b36' }, keeperKit: { shirt: 0x7b2cbf, sleeve: 0x7b2cbf, shorts: 0x7b2cbf, socks: 0x7b2cbf, number: '#ffffff' }, color: '#ffd60a', crest: 0x2a9d8f },
];

const FIRST = ['Leo', 'Mateo', 'Kai', 'Noah', 'Ade', 'Sipho', 'Tariq', 'Luca', 'Diego', 'Yuki', 'Omar', 'Ivan', 'Jonas', 'Pablo', 'Theo', 'Andile', 'Kofi', 'Rafa', 'Elias', 'Bruno', 'Felix', 'Hugo', 'Marco', 'Sami', 'Tomas', 'Victor', 'Zane', 'Emre', 'Nico', 'Arlo', 'Thabo', 'Malik'];
const LAST = ['Mendes', 'Okafor', 'Silvano', 'Novak', 'Dlamini', 'Haddad', 'Rossetti', 'Kimura', 'Fischer', 'Moreau', 'Nkosi', 'Petrov', 'Costa', 'Andersen', 'Ruiz', 'Tanaka', 'Mensah', 'Kovac', 'Herrera', 'Bianchi', 'Lindqvist', 'Abara', 'Duarte', 'Vargas', 'Okoro', 'Laurent', 'Sato', 'Yilmaz', 'Mokoena', 'Weber', 'Achebe', 'Varela'];

// 4-3-3: [x, z] in a frame where −1 = own goal line and +1 = opponent goal line; z −1..1 across the pitch.
export const SHAPE = [
  { role: 'GK', pos: 'GK', n: 1, x: -0.96, z: 0 },
  { role: 'DEF', pos: 'LB', n: 3, x: -0.6, z: -0.64 },
  { role: 'DEF', pos: 'CB', n: 4, x: -0.68, z: -0.22 },
  { role: 'DEF', pos: 'CB', n: 5, x: -0.68, z: 0.22 },
  { role: 'DEF', pos: 'RB', n: 2, x: -0.6, z: 0.64 },
  { role: 'MID', pos: 'CDM', n: 6, x: -0.38, z: 0 },
  { role: 'MID', pos: 'CM', n: 8, x: -0.2, z: -0.34 },
  { role: 'MID', pos: 'CAM', n: 10, x: -0.12, z: 0.34 },
  { role: 'FWD', pos: 'LW', n: 11, x: 0.12, z: -0.66 },
  { role: 'FWD', pos: 'ST', n: 9, x: 0.18, z: 0 },
  { role: 'FWD', pos: 'RW', n: 7, x: 0.12, z: 0.66 },
];

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function makeSquad(club, seed = 1) {
  const r = rng(seed * 7919 + club.id.charCodeAt(0) * 131);
  const pick = a => a[Math.floor(r() * a.length)];
  return SHAPE.map((s, i) => {
    const hs = ['short', 'buzz', 'afro', 'long', 'short', 'buzz', 'bald'][Math.floor(r() * 7)];
    const keeper = s.role === 'GK';
    return {
      ...s, slot: i, name: `${pick(FIRST)} ${pick(LAST)}`, short: '', number: s.n,
      skin: pick(SKIN), hair: pick(HAIR), hairStyle: hs,
      pace: 70 + Math.floor(r() * 22) + (s.role === 'FWD' ? 4 : 0) - (keeper ? 12 : 0),
      shoot: 55 + Math.floor(r() * 30) + (s.role === 'FWD' ? 12 : s.role === 'MID' ? 4 : -8),
      pass: 60 + Math.floor(r() * 28) + (s.role === 'MID' ? 8 : 0),
      defend: 50 + Math.floor(r() * 25) + (s.role === 'DEF' ? 18 : 0),
      keeping: keeper ? 76 + Math.floor(r() * 16) : 20,
      height: 0.94 + r() * 0.12 + (keeper ? 0.04 : 0), build: 0.95 + r() * 0.12,
    };
  }).map(p => ({ ...p, short: p.name.split(' ')[1] }));
}
