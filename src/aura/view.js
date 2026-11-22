import * as T from 'three';
const color=(n)=>new T.Color(n);
const mesh=(geo,m,x,y,z,root)=>{const a=new T.Mesh(geo,m);a.position.set(x,y,z);root.add(a);return a};
const box=(w,h,d)=>new T.BoxGeometry(w,h,d), band=(r,h)=>new T.CylinderGeometry(r,r,h,6);
const tube=(a,b,h,n=8)=>new T.CylinderGeometry(a,b,h,n);
const round=(r,n=10)=>new T.SphereGeometry(r,n,8);
const basic=(c,alpha=1)=>new T.MeshBasicMaterial({color:c,transparent:alpha<1,opacity:alpha,depthWrite:alpha===1});
const lit=(c,m=0,r=.72)=>new T.MeshStandardMaterial({color:c,roughness:r,metalness:m,flatShading:true});
function halo(c,wide=.09,r=.97){const o=new T.Mesh(new T.RingGeometry(r-wide,r,48),new T.MeshBasicMaterial({color:c,transparent:true,opacity:.72,side:T.DoubleSide,depthWrite:false}));o.rotation.x=-Math.PI/2;return o}
function verticalLink(length,x,y,parent,body,accent,foot=false) {
 const g=new T.Group();g.position.set(x,y,0);parent.add(g);
 mesh(tube(foot?.23:.185,foot?.16:.13,length,7),body,0,-length*.48,0,g);
 const end=new T.Group();end.position.y=-length*.95;g.add(end);
 mesh(tube(foot?.18:.13,foot?.14:.115,length*.77,7),accent,0,-length*.39,0,end);
 mesh(foot?box(.24,.19,.45):round(.155,7),body,0,-length*.76,foot?.1:0,end);
 return {g,end};
}
function person(def,finish,scene) {
 const rig=new T.Group(), body=new T.Group();scene.add(rig);rig.add(body);
 const a=lit(finish.ink??def.ink,.23,.38), c=lit(finish.cloth??def.cloth), skin=lit(def.skin), hair=lit(def.hair), ink=basic(finish.glow??def.glow);
 const big=def.head==='crest'?1.19:1;
 const torso=mesh(tube(.42*big,.29,.68,6),c,0,1.64,0,body);torso.scale.z=.75;
 const yoke=mesh(tube(.28,.49*big,.24,6),a,0,1.99,0,body);yoke.scale.z=.75;
 mesh(box(.34,.13,.035),ink,0,1.77,.27,body).rotation.z=-.28;
 const skirt=mesh(tube(.29,.42,.29,6),a,0,1.23,0,body);skirt.scale.z=.78;
 mesh(box(.63,.12,.5),c,0,1.35,0,body);mesh(box(.14,.12,.04),ink,0,1.36,.27,body);
 mesh(tube(.13,.14,.18),skin,0,2.07,0,body);
 const hd=new T.Group();hd.position.y=2.34;body.add(hd);
 const face=mesh(round(.29,10),skin,0,0,0,hd);face.scale.set(.88,1,.88);
 mesh(round(.293,10),hair,0,.115,-.067,hd).scale.set(1.01,.74,.93);
 for(const side of [-1,1]){
   mesh(box(.112,.041,.026),ink,side*.101,.034,.229,hd).rotation.z=side*.11;
   mesh(box(.113,.025,.026),hair,side*.101,.081,.223,hd).rotation.z=side*.11;
   const e=mesh(box(.10,.15,.14),a,side*.254,.006,0,hd);e.rotation.z=side*.14;
 }
 mesh(box(.047,.057,.037),skin,0,-.028,.253,hd);mesh(box(.095,.018,.027),hair,0,-.113,.207,hd);
 if(def.head==='swept') for(let i=0;i<5;i++){const p=mesh(new T.ConeGeometry(.092,.33,5),hair,(i-2)*.081,.222+(i%2)*.034,-.015,hd);p.rotation.set(-.48,0,-.48+i*.105)}
 if(def.head==='twin') for(const k of [-1,1]){const p=mesh(round(.164),hair,k*.27,.164,-.078,hd);p.scale.set(.81,1.17,1.01);mesh(band(.105,.035),ink,k*.27,.27,-.078,hd)}
 if(def.head==='crest'){mesh(box(.12,.34,.44),a,0,.22,-.02,hd).rotation.x=-.17;mesh(box(.18,.07,.04),c,0,-.152,.19,hd)}
 if(def.head==='visor'){const p=mesh(box(.49,.115,.085),a,0,.045,.232,hd);p.rotation.z=-.09;mesh(box(.405,.024,.055),ink,0,.045,.28,hd).rotation.z=-.09;mesh(tube(.125,.08,.4),hair,.176,-.213,-.16,hd).rotation.z=.14;}
 const arms=[-.46,.46].map(x=>verticalLink(.43*big,x,1.92,body,c,a));arms.forEach(k=>{mesh(box(.26*big,.2,.3),a,0,-.035,0,k.g)});
 const legs=[-.19,.19].map(x=>verticalLink(.55,x,1.16,body,c,a,true));
 const cape=mesh(box(.67,.65,.039),a,0,1.64,-.248,body);cape.rotation.x=-.2;
 const ring=halo(finish.glow??def.glow,.05,.66);ring.position.y=.037;rig.add(ring);
 const shade=mesh(new T.CircleGeometry(.75,24),basic(0x010209,.53),0,.017,0,rig);shade.rotation.x=-Math.PI/2;shade.scale.set(1,.57,1);
 const aura=halo(def.glow,.14,1.09);aura.position.y=.055;rig.add(aura);aura.visible=false;
 const shield=mesh(new T.SphereGeometry(1.43,20,12),new T.MeshBasicMaterial({color:0x72eaff,transparent:true,opacity:.20,wireframe:true,depthWrite:false}),0,1.22,0,rig);shield.visible=false;
 return{rig,body,hd,legs,arms,cape,ring,aura,shield,a,c,ink,finish,def};
}
function pose(model,f,time){
 const {rig,body,arms,legs,cape,aura,shield,def}=model;
 rig.position.set(f.x,0,f.z);const facing=f.face;const swing=Math.sin(time*12)*f.walk;
 body.rotation.set(0,f.face*.72,0);body.position.y=Math.abs(swing)*.14+Math.sin(time*5)*.023;body.rotation.z=-f.face*f.walk*.095;
 arms[0].g.rotation.set(-.72-swing*.77,0,.18);arms[1].g.rotation.set(-.63+swing*.85,0,-.18);
 arms[0].end.rotation.x=-.83;arms[1].end.rotation.x=-.89;
 legs[0].g.rotation.x=swing*.58;legs[1].g.rotation.x=-swing*.58;legs[0].end.rotation.x=Math.max(0,-swing);legs[1].end.rotation.x=Math.max(0,swing);
 cape.rotation.x=-.13-f.walk*.57+Math.sin(time*6)*.095;
 shield.visible=f.guard;
 if(f.guard){arms[0].g.rotation.x=-1.45;arms[1].g.rotation.x=-1.63;body.position.y-=.095}
 if(f.flash)body.position.y+=.072;
 if(f.stun>0)body.rotation.z=f.face*.24;
 if(f.dash>0){body.rotation.z=-f.face*.49;body.position.y+=.1;cape.rotation.x=-1}
 const m=f.attack; aura.visible=!!m&&m.kind==='special';
 if(m){
   const wind=m.kind==='special'?.57:m.kind==='heavy'?.34:m.kind==='bolt'?.24:.15;
   const prog=Math.min(1,m.age/wind), blast=m.age>=wind;
   body.rotation.y=f.face*(blast?1.1:.36);body.rotation.z=f.face*(blast?-.22:.14)*prog;
   const j=f.face>0?1:0,k=1-j;
   arms[j].g.rotation.x=blast?-1.49:-.46-prog*.69;arms[j].end.rotation.x=blast?-.13:-1.55;
   if(m.kind==='bolt'||m.kind==='special'){arms[k].g.rotation.x=arms[j].g.rotation.x;arms[k].end.rotation.x=arms[j].end.rotation.x;model.aura.scale.setScalar(1+prog*.7);model.aura.material.opacity=.44+Math.sin(time*39)*.28;}
   if(m.kind==='heavy'&&blast){legs[0].g.rotation.x=-.58;body.position.y=.15;}
 }
 if(f.hp<=0){body.rotation.z=-f.face*1.18;body.position.y=-.58}
}
function court(scene){
 scene.background=color(0x162d48);scene.fog=new T.FogExp2(0x233a61,.034);
 const stage=lit(0x192b47,.36,.42), border=lit(0x9a6956,.46,.36);
 mesh(box(24.9,.48,9.7),border,0,-.51,0,scene);mesh(box(25,.33,9.8),stage,0,-.165,0,scene);
 const tiles=[0x263b56,0x30445d,0x26394e,0x334760].map(c=>lit(c,.22,.65));
 for(let i=0;i<14;i++)for(let j=0;j<6;j++){const o=mesh(box(1.69,.021,1.51),tiles[(i+7*j+i*j)%4],(i-6.5)*1.76,.012,(j-2.5)*1.59,scene);o.receiveShadow=true}
 const rail=basic(0x64ecd8,.56),yellow=basic(0xffbd67,.6);
 for(const z of [-4.73,4.73]){mesh(box(23.9,.031,.04),rail,0,.033,z,scene);for(let i=-5;i<=5;i++)mesh(box(.49,.042,.088),yellow,i*2,.033,z*.97,scene)}
 for(const x of [-11.95,11.95])mesh(box(.035,.024,9.26),rail,x,.033,0,scene);
 const mid=halo(0x7dffdc,.045,2.71);mid.position.y=.042;scene.add(mid);
 const mi=halo(0xc29260,.026,1.94);mi.position.y=.044;scene.add(mi);
 for(const x of [-10,10])for(const z of [-3.5,3.5]){
   const col=mesh(tube(.27,.42,1.3,6),lit(0x4c4561,.46),x,.65,z,scene);
   mesh(tube(.195,.26,.22,6),basic(0xfbb678),x,1.31,z,scene);
   mesh(round(.115),basic(0x94fff1),x,1.51,z,scene);
 }
 const rockcolors=[0x2b3d62,0x31496b,0x202e50,0x384a74].map(c=>lit(c));
 for(let i=0;i<39;i++){
   const x=(i-19)*2.4,z=-14-(i%5)*2.9,h=2+(Math.sin(i*12.7)*.5+.5)*8;
   const ro=mesh(new T.DodecahedronGeometry(1,0),rockcolors[i%4],x,-2.7+h*.43,z,scene);
   ro.scale.set(1.5+(i%3),h*.82,1.5+(i%4));ro.rotation.z=Math.sin(i*6)*.22;
 }
 const sun=mesh(round(2.5,30),basic(0xffbe85),-13.2,8,-25,scene);sun.scale.set(1,1,1);
 const ring=halo(0xffd0a8,.047,3.1);ring.rotation.x=0;ring.position.set(-13.2,8,-24.7);scene.add(ring);
 for(let i=0;i<70;i++){const h=Math.sin(i*212.78),s=Math.cos(i*31.78);mesh(round(.018+(i%4)*.01,6),basic(i%3?0xa0d5e2:0xffbe85),h*49,4+Math.abs(s)*15,-20-(i%8)*2,scene);}
}
export function makeView(canvas) {
 const render=new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
 render.setPixelRatio(Math.min(1.5,window.devicePixelRatio||1));render.outputColorSpace=T.SRGBColorSpace;render.toneMapping=T.ACESFilmicToneMapping; render.toneMappingExposure=1.4;
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(40,1,.1,140);
 scene.add(new T.HemisphereLight(0xe6f6ff,0xd67b69,2.05));
 const key=new T.DirectionalLight(0xffd2a2,3.1);key.position.set(-4,8,9);scene.add(key);
 const rim=new T.DirectionalLight(0x6af6ff,2.75);rim.position.set(4,5,-5);scene.add(rim);
 court(scene);
 let pair=[], effects=[], bolts=[],lastX=.01, shake=0;
 const geo=new T.SphereGeometry(.2,8,6), shape=new T.BoxGeometry(.08,.12,.1);
 function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;render.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
 resize();addEventListener('resize',resize);
 const trash=(x)=>{scene.remove(x);x.material?.dispose?.()};
 const clearPerson=o=>{scene.remove(o.rig);o.rig.traverse(x=>{x.geometry?.dispose?.();x.material?.dispose?.()})};
 function reset(a,b,finish){pair.forEach(clearPerson); effects.forEach(e=>trash(e.o)); effects=[];pair=[person(a,finish,scene),person(b,{},scene)];}
 function spark(e){
   const c=e.tint||0x7ffff0,count=e.big?27:e.type==='hit'?15:9;
   if(e.type==='hit')shake=e.big?.28:.12;
   const ring=halo(c,.12,e.big?1.34:.68);ring.position.set(e.x,.066,e.z);scene.add(ring);
   effects.push({o:ring,t:.5,max:.5,ring:true});
   for(let i=0;i<count;i++){
     const rad=i/count*Math.PI*2,r=1+Math.random()*3;
     const o=mesh(shape,basic(i%5?c:0xfff1c4,.94),e.x,1.23+(Math.random()-.5)*.6,e.z,scene);
     effects.push({o,t:.34+Math.random()*.32,max:.67,dx:Math.cos(rad)*r,dy:1.1+Math.random()*3,dz:Math.sin(rad)*r});
   }
 }
 function draw(s,dt,menu=false){
   if(!pair.length)return;
   const tt=performance.now()/1000;
   pose(pair[0],s.you,tt);pose(pair[1],s.cpu,tt);
   if(!menu){for(const e of s.events){if(['hit','guard','dash','special','heavy'].includes(e.type))spark(e)}s.events=[];}
   while(bolts.length<s.bolts.length){const o=mesh(geo,basic(0xffffff),0,1.29,0,scene);bolts.push(o)}
   for(const [i,o] of bolts.entries()){const p=s.bolts[i];o.visible=!!p;if(!p)continue;o.position.set(p.x,1.23,p.z);o.rotation.y=-Math.atan2(p.dz,p.dx);o.material.color.set(p.tint);o.scale.set(p.kind==='beam'?4.2:1.75,1,1)}
   effects=effects.filter(e=>{e.t-=dt;if(e.t<=0){trash(e.o);if(e.ring)e.o.geometry.dispose();return false}e.o.material.opacity=Math.min(1,e.t/e.max);if(e.ring)e.o.scale.setScalar(1+(1-e.t/e.max)*2.3);else {e.o.position.x+=e.dx*dt;e.o.position.y+=e.dy*dt;e.o.position.z+=e.dz*dt;e.dy-=10*dt;e.o.rotation.x+=8*dt;}return true});
   shake=Math.max(0,shake-dt);const nx=(s.you.x+s.cpu.x)*.5, gap=Math.abs(s.you.x-s.cpu.x), narrow=camera.aspect<1;
   lastX+=(nx-lastX)*Math.min(1,dt*7);camera.fov=narrow?55:40;camera.updateProjectionMatrix();
   const d=narrow?Math.max(11,(gap*.5+1.6)/(.47*camera.aspect)-2.7):Math.max(10,7.4+gap*.38);
   const w=menu?Math.sin(tt*.25)*.12:0; const j=shake>0?Math.sin(tt*94)*shake:0;
   camera.position.set(lastX+w+j,narrow?4.7:4.35,d+2.7);camera.lookAt(lastX,1.41+(narrow?.3:0),0);
   render.render(scene,camera);
 }
 return {reset,draw};
}