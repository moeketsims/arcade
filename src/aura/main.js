import { Pad } from '../common/pad.js?v=aura-1';
import { fighters,finishes } from './data.js';
import { state,step,reward,cleanWallet,purchase } from './sim.js';
import { makeView } from './view.js';
const $=id=>document.getElementById(id), hex=n=>'#'+n.toString(16).padStart(6,'0');
const W='arcade-aura-wallet-v1';
function load(){try{return cleanWallet(JSON.parse(localStorage.getItem(W)))}catch{return cleanWallet(null)}}
let wallet=load(), view, picked=0,rival=1, mode='select', match, sound, quiet=false,last=performance.now(), messageTime=0, phase=.0, extra=false, focusMoved=false, shopPick=1;
const back='index.html?from=aura',pane=$('panel'),hud=$('hud'), notice=$('notice');
const pad=new Pad({touch:false,touchLook:false,moveKeys:{up:['KeyW','ArrowUp'],down:['KeyS','ArrowDown'],left:['KeyA','ArrowLeft'],right:['KeyD','ArrowRight']},
 keymap:{A:['Enter','Space'],X:['KeyJ'],Y:['KeyK'],B:['KeyL','Backspace'],R1:['ShiftLeft','ShiftRight'],R2:['KeyI'],L1:['KeyU'],LEFT:['ArrowLeft'],RIGHT:['ArrowRight'],SELECT:['KeyM']}});
const canvas=$('arena');
const charge=(c=0)=>{if(quiet)return;try{const ctx=sound??=new AudioContext();if(ctx.state==='suspended')void ctx.resume().catch(()=>{});const t=ctx.currentTime,o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.type=c===2?'triangle':'sine';o.frequency.setValueAtTime([236,145,484,750][c]??430,t);o.frequency.exponentialRampToValueAtTime([75,50,890,340][c]??450,t+.16);g.gain.setValueAtTime(.032,t);g.gain.exponentialRampToValueAtTime(.001,t+.18);o.start(t);o.stop(t+.19)}catch{}};
const store=()=>{try{localStorage.setItem(W,JSON.stringify(wallet))}catch{} $('wallet').textContent=wallet.coins};
const tell=(s)=>{notice.textContent=s;notice.classList.add('show');messageTime=2.8};
const human=()=>fighters[picked], enemy=()=>fighters[rival],finish=()=>finishes.find(i=>i.id===wallet.finish)??finishes[0];
const style=f=>'--ink:'+hex(f.ink)+';--shine:'+hex(f.glow)+';--cloth:'+hex(f.cloth)+';--skin:'+hex(f.skin)+';--hair:'+hex(f.hair);
function portrait(f){
 const hair={swept:'M31 39 39 27 39 14 51 24 56 8 65 22 78 14 83 26 95 24 86 42 74 48 45 44Z',twin:'M33 33Q25 13 41 18Q59 6 70 23Q93 17 92 34L77 45 43 47Z M31 33Q12 14 16 45Q16 62 27 53Z M84 35Q104 15 107 43Q109 61 94 53Z',crest:'M37 42 39 26 51 20 55 6 67 9 68 21 84 25 87 44 70 48 53 43Z',visor:'M32 43Q25 18 52 17Q78 10 86 38L83 67 91 90 75 84 68 54 45 50Z'}[f.head];
 return '<svg class="portrait" viewBox="0 0 120 105" aria-hidden="true"><path class="p-shoulder" d="M12 111 20 90 49 76 72 77 99 90 108 111Z"/><path class="p-suit" d="M27 111 33 89 50 88 61 104 75 88 88 90 94 111Z"/><path class="p-skin" d="M52 65 73 64 77 86 63 96 48 84Z"/><path class="p-skin" d="M34 36 44 24 72 23 86 40 81 64 68 78 58 80 41 68Z"/><path class="p-hair" d="'+hair+'"/><path class="p-shade" d="M60 47 70 52 65 65 56 67 63 60Z"/><path class="p-mask" d="M34 47 53 43 60 47 70 43 87 48 80 52 67 52 61 51 50 54 39 52Z"/><path class="p-eyes" d="M41 50 55 49 52 54 43 54Z M69 49 82 49 76 54 67 54Z"/><path class="p-hair" d="M55 68 70 65 67 69 58 70Z"/></svg>';
}
function block(tag,title,body){return '<div class="sheet"><div class="eyebrow">'+tag+'</div><h1>'+title+'</h1>'+body+'</div>';}
function selectedCard(i){const f=fighters[i];return '<button type="button" class="fighter'+(i===picked?' selected':'')+'" style="'+style(f)+'" aria-pressed="'+(i===picked)+'" data-fighter="'+i+'">'+portrait(f)+'<span class="fighter-name">'+f.name+'</span><span class="fighter-tag">'+f.title+'</span></button>';}
function button(id,label,cls=''){return '<button type="button" data-action="'+id+'" class="'+cls+'">'+label+'</button>'}
function preview(){match=state(human(),enemy());match.you.x=-3;match.cpu.x=3; view?.reset(human(),enemy(),finish())}
function bar(label,v,max){return '<div class="stat"><span>'+label+'</span><i><b style="width:'+Math.round(v/max*100)+'%"></b></i></div>'}
function activeScreen(next){
 mode=next;pane.hidden=next==='fight';hud.hidden=next!=='fight';
 document.body.dataset.mode=next;
 document.body.classList.toggle('controls',next==='fight'&&(extra||matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0));
 if(next==='select'){
  const f=human();
  pane.innerHTML=block('SKYWARD ARENA • ONE ON ONE','Aura <em>Clash</em>','<p class="lede">Choose your fighter. Read the wind-up. Make your move.</p><div class="roster" aria-label="Choose your fighter">'+fighters.map((_,i)=>selectedCard(i)).join('')+'</div><div class="brief"><div><strong>'+f.tech+'</strong><span>'+f.line+'</span></div><div>'+bar('Speed',f.speed,8.1)+bar('Health',f.health,118)+'</div></div><div class="menu-actions">'+button('fight','Enter arena <span class="key">↵</span>','primary')+button('shop','Coin forge','secondary')+button('help','Controls','secondary')+'</div>');
 }else if(next==='shop'){
  pane.innerHTML=block('COIN FORGE • COSMETIC ONLY','Forge <em>finishes</em>','<p class="lede">All fighters are free. Completed duels earn coins. Finishes do not change stats.</p><div class="shop">'+finishes.map(f=>'<article class="finish" style="--plate:'+hex(f.ink??0xf97950)+'"><span class="coin physical" aria-hidden="true">✦</span><div><strong>'+f.name+'</strong><p>'+f.text+'</p></div>'+button('buy:'+f.id,wallet.finish===f.id?'Equipped':wallet.owns.includes(f.id)?'Equip':f.price+' coins', wallet.finish===f.id?'equipped':'secondary')+'</article>').join('')+'</div><div class="menu-actions">'+button('select','Back to roster','primary')+'</div><p class="fine">Earned and spent here only. No purchases with money.</p>');
 }else if(next==='pause'){
  pane.innerHTML=block('DUEL ON HOLD','Paused','<div class="menu-actions">'+button('resume','Resume','primary')+button('help','Controls','secondary')+button('select','Leave duel','secondary')+'</div>');
 }else if(next==='help'||next==='helpFight'){
  pane.innerHTML=block('FIELD GUIDE','Controls','<div class="guide"><div><b>Move</b><span>WASD / arrows · stick / D-pad</span></div><div><b>Light / Heavy</b><span>J / K · X / Y</span></div><div><b>Energy / Special</b><span>L / I · B / R2</span></div><div><b>Dash / Guard</b><span>Shift / U · R1 / L1</span></div><div><b>Pause / Arcade</b><span>Esc / Home · Start / Home</span></div></div><p class="fine">Specials take 47 energy, bolts 17. Guard uses energy only on impact. A dash briefly evades a hit. Touch controls appear on supported devices.</p><div class="menu-actions">'+button(next==='helpFight'?'resume':'select','Go back','primary')+button('touch',extra?'Hide touch buttons on desktop':'Show touch buttons on desktop','secondary')+button('mute',quiet?'Turn sound on':'Mute sound','secondary')+'</div>');
 }else if(next==='result'){
  const {result}=match,earned=reward(result);
  pane.innerHTML=block('DUEL COMPLETE',result==='win'?'Victory':result==='draw'?'Draw':'Defeat','<div class="payout"><span class="coin physical" aria-hidden="true">✦</span><div><strong>+'+earned+' coins</strong><p>'+ (result==='win'?'You won the duel.':result==='draw'?'Neither fighter yielded.':'Even a defeat earns practice coins.')+'</p></div></div><p class="fine">'+wallet.wins+' total '+(wallet.wins===1?'win':'wins')+' · '+wallet.coins+' coins available</p><div class="menu-actions">'+button('rematch','Rematch','primary')+button('next','Next rival','secondary')+button('select','Roster','secondary')+button('shop','Coin forge','secondary')+'</div>');
 }else if(next==='fallback'){
  pane.innerHTML=block('GRAPHICS UNAVAILABLE','Aura <em>Clash</em>','<p class="lede">This game needs WebGL. Try Chrome on a device with graphics support enabled.</p><a class="secondary text-link" href="'+back+'">Return to Arcade</a>');
 }
}
function select(i){picked=(i+fighters.length)%fighters.length;if(rival===picked)rival=(picked+1)%fighters.length;preview();activeScreen('select');charge();}
function begin(advance=false){
  if(advance){rival=(rival+1)%fighters.length;if(rival===picked)rival=(rival+1)%fighters.length;}
  match=state(human(),enemy());view.reset(human(),enemy(),finish());phase=.8;focusMoved=false;
  hud.innerHTML=fighterHud(human(),'player')+'<div class="round"><b id="timer">65</b><span>DUEL</span></div>'+fighterHud(enemy(),'opponent')+'<button id="pauseBtn" type="button" aria-label="Pause duel" data-action="pause">Ⅱ</button>';
  activeScreen('fight');tell('Ready');charge(2);
}
function fighterHud(f,who){return '<div class="combatant '+who+'" style="'+style(f)+'"><strong>'+f.name+'</strong><div class="hp"><i id="'+who+'Hp"></i></div><div class="energy"><i id="'+who+'Energy"></i></div><span id="'+who+'Call">'+(who==='player'?'YOU':'RIVAL')+'</span></div>'}
function drawHud(){
 for(const [key,a,b] of [['player',match.you,match.cpu],['opponent',match.cpu,match.you]]){
  $(key+'Hp').style.width=(100*a.hp/a.def.health)+'%';$(key+'Energy').style.width=a.energy+'%';
  const k=key==='player'?'YOU':'RIVAL';
  $(key+'Call').textContent=a.attack?.kind==='special'?a.def.tech+'!':a.guard?'GUARD':a.energy>=47?k+' · SPECIAL READY':k+' · '+Math.floor(a.energy)+' ENERGY';
 }
 $('timer').textContent=Math.ceil(match.left);
}
const held=new Map(), tapped=new Set();
const touch=document.createElement('div');touch.id='touch';touch.setAttribute('aria-label','On-screen controller');touch.innerHTML=
 '<div class="directions" aria-label="Move"><button data-hold="up" aria-label="Move up">↑</button><button data-hold="left" aria-label="Move left">←</button><button data-hold="down" aria-label="Move down">↓</button><button data-hold="right" aria-label="Move right">→</button></div>'+
 '<div class="attacks"><button data-hold="guard">Guard</button><button data-hold="dash">Dash</button><button data-hold="light">Light</button><button data-hold="heavy">Heavy</button><button data-hold="bolt">Energy</button><button data-hold="special">Special</button></div>';
 document.body.append(touch);
 touch.addEventListener('pointerdown',e=>{const b=e.target.closest('[data-hold]');if(!b)return;e.preventDefault();b.setPointerCapture(e.pointerId);held.set(e.pointerId,b);tapped.add(b.dataset.hold);b.classList.add('down')});
 function release(e){const b=held.get(e.pointerId);held.delete(e.pointerId);if(b&&![...held.values()].includes(b))b.classList.remove('down')}
 for(const e of ['pointerup','pointercancel','lostpointercapture'])touch.addEventListener(e,release);
 addEventListener('blur',()=>{held.forEach(b=>b.classList.remove('down'));held.clear();tapped.clear();if(mode==='fight')activeScreen('pause')});
document.addEventListener('keydown',e=>{if(e.code==='Tab'&&mode!=='fight'&&mode!=='pause')e.stopPropagation()},true);
function command(k){
 if(!view&&k!=='select')return;
 if(k==='fight'||k==='rematch')begin();
 else if(k==='next')begin(true);
 else if(k==='select'){preview();activeScreen(k)}
 else if(k==='shop')activeScreen(k);
 else if(k==='pause'&&mode==='fight')activeScreen('pause');
 else if(k==='resume'){activeScreen('fight');last=performance.now()}
 else if(k==='help')activeScreen(mode==='fight'||mode==='pause'?'helpFight':'help');
 else if(k==='touch'){extra=!extra;activeScreen(mode);tell(extra?'Touch controls enabled':'Desktop touch controls hidden')}
 else if(k==='mute'){quiet=!quiet;activeScreen(mode)}
 else if(k.startsWith('buy:')){
  const f=finishes.find(x=>x.id===k.slice(4));
  if(!purchase(wallet,f)){tell('You need '+(f.price-wallet.coins)+' more coins. Finish a duel to earn them.');return;}
  store();preview();activeScreen('shop');tell(f.name+' equipped');charge(2)
 }
}
document.body.addEventListener('click',e=>{const face=e.target.closest('[data-fighter]');if(face){select(+face.dataset.fighter);if(e.detail===0)pane.querySelector('.selected')?.focus();return;}
 const at=e.target.closest('[data-action]');if(at)command(at.dataset.action);});
try{view=makeView(canvas);preview();activeScreen('select')}catch{activeScreen('fallback')}
store();

function frame(now){
 const dt=Math.min(.04,Math.max(0,(now-last)/1000));last=now;pad.update();
 const key=b=>pad.pressed(b), down=b=>!!pad.held[b];
 if(view){
 if(key('HOME')){location.href=back;return}
 if(key('TOUCH'))command('help');
 if(key('SELECT')){quiet=!quiet;tell(quiet?'Sound muted':'Sound on')}
 if(mode==='select'){
  if(key('LEFT')||pad.lx<-.72&&!focusMoved){select(picked-1);focusMoved=true}
  else if(key('RIGHT')||pad.lx>.72&&!focusMoved){select(picked+1);focusMoved=true}
  if(Math.abs(pad.lx)<.2)focusMoved=false;
  if(key('Y'))command('shop');
  else if(key('X'))command('help');
  if(key('A')&&!(document.activeElement instanceof HTMLButtonElement&&pad.keys.has('Enter')))begin()
 } else if(mode==='pause'&&(key('START')||key('A')))command('resume');
 else if(mode==='fight'&&key('START'))command('pause');
 else if((mode==='help'||mode==='shop')&&(key('START')||key('B')))command('select');
 else if(mode==='shop'){
  if(key('DOWN')||key('RIGHT'))shopPick=(shopPick+1)%finishes.length;
  if(key('UP')||key('LEFT'))shopPick=(shopPick+finishes.length-1)%finishes.length;
  if(key('UP')||key('DOWN')||key('LEFT')||key('RIGHT'))pane.querySelectorAll('.finish button')[shopPick]?.focus();
  if(key('A')&&(pad.usingPad||!(document.activeElement instanceof HTMLButtonElement)))command('buy:'+finishes[shopPick].id);
 }
 else if(mode==='helpFight'&&(key('START')||key('B')))command('resume');
 else if(mode==='result'&&key('A')&&!(document.activeElement instanceof HTMLButtonElement&&pad.keys.has('Enter')))begin();
 if(mode==='fight'){
  const active=k=>tapped.has(k)||[...held.values()].some(b=>b.dataset.hold===k);
  const x=pad.lx+(+down('RIGHT')- +down('LEFT'))+(+active('right')- +active('left'));
  const z=-pad.ly+(+down('DOWN')- +down('UP'))+(+active('down')- +active('up'));
  const input={x:Math.sign(x)*Math.min(1,Math.abs(x)),z:Math.sign(z)*Math.min(1,Math.abs(z)),light:down('X')||active('light'),heavy:down('Y')||active('heavy'),bolt:down('B')||active('bolt'),special:key('R2')||tapped.has('special'),dash:key('R1')||tapped.has('dash'),guard:down('L1')||active('guard')};
  if(phase>0){phase-=dt;if(phase<=0)tell('CLASH')}
  else {
   step(match,input,dt);
   for(const e of match.events){if(e.type==='hit'){charge(e.big?1:0);if(e.big)tell(e.damage+' DAMAGE')}else if(e.type==='special'){charge(2);tell('SPECIAL WIND-UP')}else if(e.type==='guard')charge(3)}
  }
  drawHud();
  view.draw(match,dt);
  if(match.result){
   wallet.coins=Math.min(999999,wallet.coins+reward(match.result));if(match.result==='win')wallet.wins=Math.min(999999,wallet.wins+1);
   store();charge(2);activeScreen('result');
  }
 }else if(match){
  if(mode==='select'||mode==='shop'||mode==='help'){match.you.z=Math.sin(now*.0012)*.08;match.cpu.z=-match.you.z;}
  view.draw(match,dt,true);
 }
 }
 tapped.clear();
 messageTime-=dt;if(messageTime<0)notice.classList.remove('show');
 requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// Read-only diagnostics on local previews, useful for automated play checks.
if(location.hostname==='127.0.0.1'||location.hostname==='localhost')
 Object.defineProperty(window,'auraPreview',{value:()=>({mode,hp:match?.you.hp,opponent:match?.cpu.hp,cpuX:match?.cpu.x,cpuZ:match?.cpu.z,energy:match?.you.energy,x:match?.you.x,z:match?.you.z,wallet:{...wallet,owns:[...wallet.owns]},result:match?.result,timer:match?.left,model:human().id})});