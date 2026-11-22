import { MIN, MAX, DEPTH } from './data.js';
const limit=(x,a,b)=>Math.min(b,Math.max(a,x));
export const actions = {
 light:{wind:.15,active:.13,end:.15,damage:10,range:2.1,cost:0},
 heavy:{wind:.34,active:.17,end:.36,damage:23,range:2.8,cost:0},
 bolt:{wind:.24,active:.1,end:.22,damage:13,cost:17},
 special:{wind:.57,active:.2,end:.45,damage:28,cost:47}
};
export const empty = {};
export function state(a,b,random=Math.random) {
 const fighter=(f,x)=>({def:f,x,z:0,face:x<0?1:-1,hp:f.health,energy:45,vx:0,vz:0,attack:null,guard:false,stun:0,dash:0,cd:0,flash:0,walk:0,damage:0});
 return {you:fighter(a,-5),cpu:fighter(b,5),time:0,left:65,events:[],bolts:[],result:null,random,brain:{next:.38,wait:0,strafe:1},combo:0};
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function strike(s,a,b,damage,kind,x=a.x,z=a.z) {
 if(b.dash>.09 || b.hp<=0) return;
 const covered=b.guard && b.energy>0;
 const hp=covered?Math.fround(damage*.19):damage;
 b.hp=Math.max(0,b.hp-hp); b.energy=Math.max(0,b.energy-(covered?damage*.53:0));
 if(!covered || b.energy===0){b.stun=kind==='heavy'?.33:.19;b.attack=null;b.guard=false;b.flash=.19}
 a.energy=Math.min(100,a.energy+(covered?2:7)); b.energy=Math.min(100,b.energy+3);
 a.damage+=hp; if(!covered&&a===s.you)s.combo++; else if(a===s.cpu&&!covered)s.combo=0;
 s.events.push({type:covered?'guard':'hit',x:b.x,z:b.z,tint:a.def.glow,big:kind==='special'||kind==='heavy',damage:Math.ceil(hp)});
 if(b.hp===0)s.result=a===s.you?'win':'loss';
}
function fire(s,a,b,k,angle=0){
 const d=Math.atan2(b.z-a.z,b.x-a.x)+angle, v=k==='beam'?28:17;
 s.bolts.push({a,b,x:a.x+Math.cos(d)*.7,z:a.z+Math.sin(d)*.7,dx:Math.cos(d)*v,dz:Math.sin(d)*v,ttl:k==='beam'?.68:.9,tint:a.def.glow,damage:k==='fan'?9:k==='beam'?30:13,r:k==='beam'?.91:.54,kind:k});
}
function running(s,a,b,i,dt){
 a.stun=Math.max(0,a.stun-dt);a.flash=Math.max(0,a.flash-dt);a.cd=Math.max(0,a.cd-dt);
 a.energy=Math.min(100,a.energy+dt*(a.guard?3:9)); a.face=b.x>=a.x?1:-1;
 if(a.dash>0){
  a.dash-=dt;a.x+=a.vx*dt;a.z+=a.vz*dt;a.walk=1;
 } else if(a.attack){
  const m=a.attack, cfg=actions[m.kind]; m.age+=dt;
  if(m.kind==='special'&&a.def.type==='dash'&&m.age>=cfg.wind&&m.age<cfg.wind+cfg.active){
   const dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz)||1,sp=Math.min(24*dt,Math.max(0,d-1.1));a.x+=dx/d*sp;a.z+=dz/d*sp;
  }
  if(m.age>=cfg.wind && !m.hit){
   if(m.kind==='bolt'){fire(s,a,b,'bolt');m.hit=true}
   else if(m.kind==='special'&&['fan','beam'].includes(a.def.type)){
    if(a.def.type==='fan')[-.23,0,.23].forEach(v=>fire(s,a,b,'fan',v));else fire(s,a,b,'beam');m.hit=true;
   } else {
    const r=m.kind==='special'?(a.def.type==='quake'?4.2:2.3):cfg.range*a.def.range;
    if(distance(a,b)<=r){strike(s,a,b,cfg.damage*a.def.power,m.kind);m.hit=true}
   }
  }
  if(m.age>=cfg.wind+cfg.active+cfg.end)a.attack=null;
  a.walk=0;
 } else if(a.stun<=0) {
  a.guard=!!i.guard;
  const dx=i.x||0,dz=i.z||0,q=Math.hypot(dx,dz),speed=a.def.speed*(a.guard?.38:1);
  if(i.dash&&a.cd<=0&&!a.guard){
   a.dash=.19;a.cd=.7;a.vx=q>0?dx/q*22:a.face*22;a.vz=q>0?dz/q*22:0;
   s.events.push({type:'dash',x:a.x,z:a.z,tint:a.def.glow});
  }else{
   if(q){a.x+=dx/Math.max(1,q)*speed*dt;a.z+=dz/Math.max(1,q)*speed*dt}
   a.walk=Math.min(1,q)*(a.guard?.4:1);
   const key=!a.guard&&(i.special?'special':i.heavy?'heavy':i.bolt?'bolt':i.light?'light':null);
   if(key && a.energy>=actions[key].cost){
    a.energy-=actions[key].cost;a.attack={kind:key,age:0,hit:false};a.walk=0;
    s.events.push({type:key,x:a.x,z:a.z,tint:a.def.glow});
   }
  }
 }else {a.guard=false;a.walk=0}
 a.x=limit(a.x,MIN,MAX);a.z=limit(a.z,-DEPTH,DEPTH);
}
export function opponent(s,dt){
 const a=s.cpu,b=s.you,f=a.def.type,dx=b.x-a.x,dz=b.z-a.z,d=distance(a,b),n=d||1;
 const br=s.brain;br.next-=dt;
 const ideal=f==='beam'?5.2:f==='fan'?3.7:f==='quake'?1.65:1.6;
 let x=0,z=0;
 if(d>ideal+.34){x=dx/n;z=dz/n}else if(d<ideal-.45){x=-dx/n*.78;z=-dz/n*.78}
 if(f==='fan'||f==='beam'){z+=br.strafe*(d<6?.47:.18)}
 if(Math.abs(a.z)>2.9)br.strafe=-Math.sign(a.z);
 if(b.attack&&d<3.8&&b.attack.age>.11&&s.random()<.7)return{x:x*.18,z:0,guard:true};
 if(br.next>0||a.attack||a.stun)return{x,z};
 br.next=.32+s.random()*.5; if(s.random()<.27)br.strafe*=-1;
 if(a.energy>=47 && (f==='dash'?d<5.5:f==='quake'?d<4:d<8) && s.random()<.45)return{x,z,special:true};
 if(d<2.65)return{x,z,heavy:(f==='quake'?.8:.42)>s.random(),light:true};
 if(a.energy>=23&&d<8&&(f==='beam'||f==='fan'||s.random()<.28))return{x,z,bolt:true};
 return{x,z,dash:d>4&&s.random()<.37};
}
export function step(s,i,dt,cpu) {
 if(s.result)return;
 s.events=[];s.time+=dt;s.left=Math.max(0,65-s.time);
 running(s,s.you,s.cpu,i,dt);
 if(!s.result)running(s,s.cpu,s.you,cpu??opponent(s,dt),dt);
 const a=s.you,b=s.cpu,d=distance(a,b);
 if(d<1.16&&d>.001){const k=(1.16-d)/d*.5,x=(a.x-b.x)*k,z=(a.z-b.z)*k;a.x=limit(a.x+x,MIN,MAX);b.x=limit(b.x-x,MIN,MAX);a.z=limit(a.z+z,-DEPTH,DEPTH);b.z=limit(b.z-z,-DEPTH,DEPTH)}
 for(const p of s.bolts){
  p.x+=p.dx*dt;p.z+=p.dz*dt;p.ttl-=dt;
  if(!s.result&&Math.hypot(p.b.x-p.x,p.b.z-p.z)<p.r&&p.b.dash<=.09){strike(s,p.a,p.b,p.damage*p.a.def.power,p.kind==='bolt'?'bolt':'special');p.ttl=0}
 }
 s.bolts=s.bolts.filter(p=>p.ttl>0&&Math.abs(p.x)<14&&Math.abs(p.z)<7);
 if(!s.result&&s.left<=0){const hp=s.you.hp/s.you.def.health-s.cpu.hp/s.cpu.def.health;s.result=Math.abs(hp)<.00001?'draw':hp>0?'win':'loss'}
}
export const reward = result => result==='win'?30:result==='draw'?20:20;
export function cleanWallet(s) {
 const allowed=['base','sun','ice'], owns=Array.isArray(s?.owns)?s.owns.filter(x=>allowed.includes(x)):[];
 const coins=Number.isSafeInteger(s?.coins)?limit(s.coins,0,999999):0;
 return {coins,owns:[...new Set(['base',...owns])],finish:owns.includes(s?.finish)?s.finish:'base',wins:Number.isSafeInteger(s?.wins)?limit(s.wins,0,999999):0};
}
export function purchase(w,item) {
 if(!item||!Number.isSafeInteger(item.price)||item.price<0)return false;
 if(!w.owns.includes(item.id)){
  if(w.coins<item.price)return false;
  w.coins-=item.price;w.owns.push(item.id);
 }
 w.finish=item.id;return true;
}