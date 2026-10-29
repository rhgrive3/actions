// Real Actor and Projectiles under production source composition; no live network
// or GPU. Geometry/locomotion is deliberately constrained by source-fixture.
import {fixture} from '../../../../splatoon3/tests/source-fixture.mjs';
const STEP=1/60;
export async function collectCurling({holdFrames=6,initialInk=100,probeAt=null,victimAt=null}={}) {
 let clock=1000;
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
   vmPerformance:{now:()=>clock*1000},vmMathRandom:()=>.5});
 const {G,THREE}=f;
 G.scene=new THREE.Scene();G.camera={position:new THREE.Vector3(0,12,10)};G.projectiles=new f.Projectiles(G.scene);
 G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]});
 G.physics=new f.Physics(G.level);G.paint={sample:()=>0,splat:()=>0};G.match={playing:()=>true,canRespawn:()=>false};G.time=0;
 const a=f.make('dualies-01');Object.assign(a,{nid:37,owner:'p5',remote:false,isLocal:true,netLife:0,ink:initialInk,invuln:0});
 a.pos.set(0,12,0);a.aimPitch=.9;a.aimYaw=0;a.aimDir.set(0,Math.sin(.9),Math.cos(.9));
 a.s3.loadout=f.emptyLoadout();a.s3RefreshGear();
 let victim=null;if(victimAt){victim=f.make('shooter');Object.assign(victim,{nid:2,owner:'p2',team:1,remote:false,isLocal:false,netLife:0,invuln:0});victim.pos.set(...victimAt);victim.s3.loadout=f.emptyLoadout();victim.s3RefreshGear();}
 const session={myId:'p5',isHost:true,hostId:'p5',_members:new Map([['p5','P5']]),tr:{broadcast(value){session.packet=JSON.parse(JSON.stringify(value));},sendTo(){}}};
 const nm=new f.NetMatch(session,{id:'trace',map:'map',difficulty:'normal'});G.netm=nm;nm.byNid.set(a.nid,a);nm._setupActor(a);
 const birthRows=[];const recordBomb=nm.recBomb;nm.recBomb=function(b,...args){birthRows.push({tick,kind:b.kind,sub:b.s3Sub?.id,charge:b.s3Charge,position:b.pos.toArray(),velocity:b.vel.toArray(),fuse:b.fuse,ink:a.ink,recoveryStop:a.s3?.recoverStopRemaining??null});return recordBomb.call(this,b,...args);};
 const events=[];const unsubs=['bomb:throw','bomb:explode','hit'].map(name=>f.on(name,e=>events.push({tick,kind:name,id:e.subId??e.weaponId??null,damage:e.damage??null,position:e.pos?.toArray?.()??null,victim:e.victim?.nid??null})));
 let tick=0;const initial={id:a.weapon.id,sub:a.weapon.sub,ink:a.ink,special:a.special,gear:a.s3.loadout,life:a.netLife,owner:a.owner,nid:a.nid,pos:a.pos.toArray(),velocity:a.vel.toArray(),aim:[a.aimYaw,a.aimPitch],victim:victim?{nid:victim.nid,hp:victim.hp,team:victim.team,pos:victim.pos.toArray()}:null};
 const step=sub=>{tick++;clock=1000+tick*STEP;a.intent.sub=sub;f.tick(a);victim?.update(STEP);G.projectiles.update(STEP);};
 for(let i=0;i<60;i++)step(i>=60-holdFrames);
 nm._sendTick();const beforeRelease=session.packet.a[0];const hold=a.weaponRunner.s3SubHold;
 step(false);step(false);const afterBirth={tick,ink:a.ink,recoveryStop:a.s3?.recoverStopRemaining??null};
 const result={scenario:'curling-hold',initial,commands:[{tick:1,input:{fire:false,sub:holdFrames===60,jump:false,squid:false,special:false,move:[0,0]},aim:[0,.9]},...(holdFrames===60?[]:[{tick:61-holdFrames,input:{fire:false,sub:true,jump:false,squid:false,special:false,move:[0,0]},aim:[0,.9]}]),{tick:61,input:{fire:false,sub:false,jump:false,squid:false,special:false,move:[0,0]},aim:[0,.9]}],beforeRelease,hold,events,birth:birthRows[0]??null,afterBirth,wireBirth:nm.out.find(x=>x[1]==='b')??null};
 if(probeAt){
  while(tick<probeAt-1)step(false);
  const before={tick,ink:a.ink,count:G.projectiles.bombs.length};
  result.commands.push({tick:probeAt,input:{fire:false,sub:true,jump:false,squid:false,special:false,move:[0,0]},aim:[0,.9]},{tick:probeAt+1,input:{fire:false,sub:false,jump:false,squid:false,special:false,move:[0,0]},aim:[0,.9]});
  step(true);for(let i=0;i<12;i++)step(false);
  result.probe={inputTick:probeAt,before,after:{tick,ink:a.ink,count:G.projectiles.bombs.length},newBirth:G.projectiles.bombs.length>before.count};
 }else if(victim){G.netm=null;while(tick<300&&G.projectiles.bombs.length)step(false);if(victim.hp<=0&&victim.alive)step(false);result.victim={tick,hp:victim.hp,alive:victim.alive};}
 else{while(tick<1200&&a.ink<65)step(false);result.nextEligibleTick=a.ink>=65?tick:null;result.nextEligibleInk=a.ink;}
 unsubs.forEach(fn=>fn?.());nm.dispose();G.projectiles.clear();return JSON.parse(JSON.stringify(result));
}

export async function collectBlaster({targetX=0,targetZ=8,extraTarget=false}={}) {
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmMathRandom:()=>.5});
 const {G,THREE}=f;G.scene=new THREE.Scene();G.camera={position:new THREE.Vector3(0,4,-5)};G.projectiles=new f.Projectiles(G.scene);
 G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]});
 G.physics=new f.Physics(G.level);G.paint={sample:()=>0,splat:()=>0};G.match={playing:()=>true,canRespawn:()=>false};G.time=0;
 const a=f.make('blaster'),v=f.make('shooter');Object.assign(a,{nid:1,owner:'p1',remote:false,isLocal:true,netLife:0,ink:100,invuln:0});
 Object.assign(v,{nid:2,owner:'p2',team:1,remote:false,isLocal:false,netLife:0,invuln:0});
 a.pos.set(0,0,0);a.aimYaw=a.aimPitch=0;a.aimDir.set(0,0,1);a.aimPoint.set(0,1.05,30);v.pos.set(targetX,0,targetZ);
 a.s3.loadout=f.emptyLoadout();a.s3RefreshGear();v.s3.loadout=f.emptyLoadout();v.s3RefreshGear();
 const victims=[v];if(extraTarget){const v2=f.make('shooter');Object.assign(v2,{nid:3,owner:'p3',team:1,remote:false,isLocal:false,netLife:0,invuln:0});v2.pos.set(-targetX,0,targetZ);v2.s3.loadout=f.emptyLoadout();v2.s3RefreshGear();victims.push(v2);}
 let tick=0;const events=[],births=[];
 const unsubs=['weapon:fire','weapon:impact','hit','damage'].map(name=>f.on(name,e=>{
  if(name==='damage'&&!victims.includes(e.victim))return;
  events.push({tick,kind:name,weapon:e.weapon??e.weaponId??e.source??null,victim:e.victim?.nid??null,damage:e.damage??e.amount??null,position:e.pos?.toArray?.()??null});
 }));
 const push=G.projectiles._push;G.projectiles._push=function(p,...args){births.push({tick,type:p.type,weapon:p.wid??null,position:p.pos.toArray(),velocity:p.vel.toArray(),damage:p.damage});return push.call(this,p,...args);};
 const initial={weapon:a.weapon.id,ink:a.ink,special:a.special,life:a.netLife,owner:a.owner,nid:a.nid,gear:a.s3.loadout,victims:victims.map(x=>({nid:x.nid,hp:x.hp,team:x.team,pos:x.pos.toArray()}))};
 for(tick=1;tick<=90;tick++){a.intent.fire=tick===1;G.time=tick*STEP;a.update(STEP);for(const victim of victims)victim.update(STEP);G.projectiles.update(STEP);if(events.some(e=>e.kind==='hit')&&G.projectiles.list.length===0&&v.hp>0)break;if(!v.alive)break;}
 const result={scenario:'blaster',initial,commands:[{tick:1,input:{fire:true,sub:false,jump:false,squid:false,special:false,move:[0,0]},aim:[0,0]},{tick:2,input:{fire:false,sub:false,jump:false,squid:false,special:false,move:[0,0]},aim:[0,0]}],births,events,final:{tick:Math.min(tick,90),victims:victims.map(x=>({nid:x.nid,hp:x.hp,alive:x.alive})),ink:a.ink,cooldown:a.weaponRunner.cooldown}};
 unsubs.forEach(fn=>fn?.());G.projectiles.clear();return JSON.parse(JSON.stringify(result));
}

export async function collectWave({targetX=0,targetZ=5,fullSpecial=true}={}) {
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmMathRandom:()=>.5});
 const {G,THREE}=f;G.scene=new THREE.Scene();G.camera={position:new THREE.Vector3(0,4,-5)};G.projectiles=new f.Projectiles(G.scene);
 G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]});
 G.physics=new f.Physics(G.level);G.paint={sample:()=>0,splat:()=>0};G.match={playing:()=>true,canRespawn:()=>false,state:'playing',mode:'turf'};G.time=0;
 const a=f.make('s3-slosher-double-01'),v=f.make('shooter');Object.assign(a,{nid:1,owner:'p1',remote:false,isLocal:true,netLife:0,ink:100,invuln:0});
 Object.assign(v,{nid:2,owner:'p2',team:1,remote:false,isLocal:false,netLife:0,invuln:0});
 a.pos.set(0,0,0);a.aimYaw=a.aimPitch=0;a.aimDir.set(0,0,1);a.aimPoint.set(0,1.05,30);a._resolve=()=>{};v.pos.set(targetX,0,targetZ);
 a.s3.loadout=f.emptyLoadout();a.s3RefreshGear();v.s3.loadout=f.emptyLoadout();v.s3RefreshGear();a.special=fullSpecial?a.specialCost():0;
 let tick=0;const events=[],devices=[],seen=new Set();
 const unsubs=['special:use','all:special','hit','damage'].map(name=>f.on(name,e=>{
  if(name==='damage'&&e.victim!==v)return;
  events.push({tick,kind:name,id:e.id??e.weaponId??e.source??null,action:e.action??null,damage:e.damage??e.amount??null,position:e.pos?.toArray?.()??(Array.isArray(e.pos)?e.pos:null)});
 }));
 const initial={weapon:a.weapon.id,sub:a.weapon.sub,specialId:a.weapon.special,ink:a.ink,special:a.special,specialCost:a.specialCost(),life:a.netLife,owner:a.owner,nid:a.nid,gear:a.s3.loadout,victim:{hp:v.hp,team:v.team,pos:v.pos.toArray()}};
 for(tick=1;tick<=330;tick++){
  a.intent.special=tick===1;a.intent.sub=fullSpecial&&tick===4;G.time=tick*STEP;a.update(STEP);v.update(STEP);G.projectiles.update(STEP);
  for(const o of G.projectiles._s3AllSpecialObjects||[])if(!seen.has(o)){seen.add(o);devices.push({tick,kind:o.kind,position:o.pos?.toArray?.()??null,hp:o.hp??null,phase:o.phase??null});}
  if(!v.alive)break;
 }
 const result={scenario:'wave-breaker',initial,commands:[{tick:1,input:{fire:false,sub:false,jump:false,squid:false,special:true,move:[0,0]},aim:[0,0]},{tick:2,input:{fire:false,sub:false,jump:false,squid:false,special:false,move:[0,0]},aim:[0,0]},...(fullSpecial?[{tick:4,input:{fire:false,sub:true,jump:false,squid:false,special:false,move:[0,0]},aim:[0,0]},{tick:5,input:{fire:false,sub:false,jump:false,squid:false,special:false,move:[0,0]},aim:[0,0]}]:[])],devices,events,final:{tick:Math.min(tick,330),hp:v.hp,alive:v.alive,ink:a.ink,special:a.special}};
 unsubs.forEach(fn=>fn?.());G.projectiles.clear();return JSON.parse(JSON.stringify(result));
}

export async function collectRoller({targetX=1,targetZ=0}={}) {
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmMathRandom:()=>.5});
 const {G,THREE}=f;G.scene=new THREE.Scene();G.camera={position:new THREE.Vector3(0,4,-5)};G.projectiles=new f.Projectiles(G.scene);
 G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]});
 G.physics=new f.Physics(G.level);G.paint={sample:()=>1,splat:()=>0};G.match={playing:()=>true,canRespawn:()=>false};G.time=0;
 const a=f.make('roller'),v=f.make('shooter');Object.assign(a,{nid:1,owner:'p1',remote:false,isLocal:true,netLife:0,ink:100,invuln:0});
 Object.assign(v,{nid:2,owner:'p2',team:1,remote:false,isLocal:false,netLife:0,invuln:0});
 a.pos.set(0,0,0);a.vel.set(0,0,2);a.intent.move.set(0,0,1);a.aimYaw=a.aimPitch=0;a.aimDir.set(0,0,1);v.pos.set(targetX,0,targetZ);
 a.s3.loadout=f.emptyLoadout();a.s3RefreshGear();v.s3.loadout=f.emptyLoadout();v.s3RefreshGear();
 let tick=0;const events=[];const unsubs=['hit','damage','weapon:impact'].map(name=>f.on(name,e=>{if(name==='damage'&&e.victim!==v)return;events.push({tick,kind:name,id:e.weapon??e.weaponId??e.source??null,victim:e.victim?.nid??null,damage:e.damage??e.amount??null,rolling:a.weaponRunner.rolling});}));
 const initial={weapon:a.weapon.id,ink:a.ink,special:a.special,life:a.netLife,owner:a.owner,nid:a.nid,gear:a.s3.loadout,velocity:a.vel.toArray(),victim:{nid:v.nid,hp:v.hp,team:v.team,pos:v.pos.toArray()}};
 for(tick=1;tick<=50;tick++){a.intent.fire=true;G.time=tick*STEP;a.update(STEP);v.update(STEP);G.projectiles.update(STEP);if(!v.alive)break;}
 const result={scenario:'roller-contact',initial,commands:[{tick:1,input:{fire:true,sub:false,jump:false,squid:false,special:false,move:[0,1]},aim:[0,0]}],events,final:{tick:Math.min(tick,50),hp:v.hp,alive:v.alive,ink:a.ink}};
 unsubs.forEach(fn=>fn?.());G.projectiles.clear();return JSON.parse(JSON.stringify(result));
}
