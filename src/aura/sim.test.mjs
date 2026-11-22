import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fighters,finishes} from './data.js';
import {step,state,purchase,cleanWallet,reward} from './sim.js';
const sim=(a,b=0)=>state(fighters[a],fighters[b],()=>.52);
const advance=(s,frames,i={},cpu={})=>{for(let n=0;n<frames;n++)step(s,i,1/60,cpu)};
test('four original fighters differ in speed, health and specials',()=>{assert.equal(new Set(fighters.map(f=>f.id)).size,4);assert.equal(new Set(fighters.map(f=>f.type)).size,4);assert.equal(new Set(fighters.map(f=>f.speed)).size,4);});
test('movement travels on both axes and respects ring bounds',()=>{const s=sim(0,1);advance(s,300,{x:1,z:1});assert.equal(s.you.x,11);assert.equal(s.you.z,3.7);});
test('heavy lands after a wind-up and deals more than light',()=>{const a=sim(2,1),b=sim(2,1);for(const s of [a,b])s.cpu.x=-3.5;advance(a,10,{heavy:true});assert.equal(a.cpu.hp,a.cpu.def.health);advance(a,15);advance(b,14,{light:true});assert.ok(a.cpu.def.health-a.cpu.hp>b.cpu.def.health-b.cpu.hp);});
test('guard absorbs most damage at a cost to energy',()=>{const a=sim(0,1),b=sim(0,1);for(const s of [a,b])s.cpu.x=-3.5;advance(a,17,{light:true},{guard:true});advance(b,17,{light:true});assert.ok(a.cpu.hp>b.cpu.hp);assert.ok(a.cpu.energy<b.cpu.energy);});
test('dash travels farther than movement and enters cooldown',()=>{const a=sim(0,1),b=sim(0,1);advance(a,11,{x:1,dash:true});advance(b,11,{x:1});assert.ok(a.you.x>b.you.x+1.8);assert.ok(a.you.cd>.4);});
test('energy bolt spends meter and can hit from range',()=>{const s=sim(0,1);s.cpu.x=1;advance(s,1,{bolt:true});assert.ok(s.you.energy<30);advance(s,36);assert.ok(s.cpu.hp<s.cpu.def.health);});
for(const [id,check] of [[0,s=>s.you.x>-3.5&&s.cpu.hp<s.cpu.def.health],[1,s=>s.bolts.length>=2],[2,s=>s.cpu.hp<s.cpu.def.health],[3,s=>s.bolts.some(b=>b.kind==='beam')]]){
 test(fighters[id].tech+' has a distinct sim effect',()=>{const s=sim(id,(id+1)%4);s.you.energy=70;s.cpu.x=id===0?-1:-1.8;if(id===1||id===3)s.cpu.x=5;advance(s,40,{special:true});assert.ok(check(s));});
}
test('KO winner and timed draw award coins once per result in the UI',()=>{const s=sim(2,1);s.cpu.x=-3.5;s.cpu.hp=5;advance(s,38,{light:true});assert.equal(s.result,'win');assert.equal(reward(s.result),30);const d=sim(0,0);d.time=64.98;advance(d,3);assert.equal(d.result,'draw');assert.equal(reward('loss'),20);});
test('coin balance starts at zero, charges exact price, saves and does not re-charge equip',()=>{let w=cleanWallet(null);assert.equal(purchase(w,finishes[1]),false);w.coins=45;assert.equal(purchase(w,finishes[1]),true);assert.equal(w.coins,5);w=cleanWallet(JSON.parse(JSON.stringify(w)));assert.equal(w.finish,'sun');assert.equal(purchase(w,finishes[1]),true);assert.equal(w.coins,5);});
