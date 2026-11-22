export const fighters = [
  {id:'vale',name:'Vale Ashwind',title:'The ember dancer',ink:0xf97950,glow:0xffb752,cloth:0x312942,skin:0xcb8a66,hair:0x24213b,head:'swept', speed:6.75,health:100,power:1,range:1,tech:'Cinder Lunge',type:'dash',line:'Fast feet. A blazing gap closer.'},
  {id:'nyra',name:'Nyra Coil',title:'The prism courier',ink:0x36d7b2,glow:0x8ffff0,cloth:0x12283c,skin:0x9f6d4c,hair:0x153537,head:'twin',speed:8.05,health:88,power:.94,range:.97,tech:'Split Current',type:'fan',line:'Quickest on the court. Fans out three bolts.'},
  {id:'orrin',name:'Orrin Flint',title:'The basalt sentinel',ink:0xf3aa5a,glow:0xffd886,cloth:0x2d2837,skin:0x835e50,hair:0x29253c,head:'crest',speed:5.35,health:118,power:1.22,range:1.1,tech:'Mantle Quake',type:'quake',line:'Heavy hits and a broad shockwave.'},
  {id:'mira',name:'Mira Noct',title:'The tide astronomer',ink:0xa288f5,glow:0xd8a9ff,cloth:0x242449,skin:0xc39ab9,hair:0x423074,head:'visor',speed:6.25,health:98,power:.98,range:1.13,tech:'Moon Needle',type:'beam',line:'Patient spacing. A long-range pulse.'}
];
export const finishes = [
  {id:'base',name:'Original Crew',price:0,text:'Original fighter colors'},
  {id:'sun',name:'Sunplate',price:40,ink:0xffbe44,glow:0xffe5a0,cloth:0x67332c,text:'Hammered amber and charcoal'},
  {id:'ice',name:'Glacier Circuit',price:80,ink:0x35bafa,glow:0xabedff,cloth:0x284778,text:'Glacier blue and polished navy'}
];
export const MIN = -11, MAX = 11, DEPTH = 3.7;
export const price = id => finishes.find(x=>x.id===id)?.price ?? Infinity;