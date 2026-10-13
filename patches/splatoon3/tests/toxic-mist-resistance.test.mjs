import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fixture} from './source-fixture.mjs';
import {emptyLoadout,gearCurve} from '../runtime/gear.mjs';
import {MIST_RESISTANCE_CURVE} from '../runtime/toxic-mist.mjs';
function equip(a,ap){a.s3.loadout=emptyLoadout();for(const p of a.s3.loadout)if(ap>=10){p.main='subResistance';ap-=10;}for(const p of a.s3.loadout)for(let i=0;i<3&&ap>=3;i++){p.subs[i]='subResistance';ap-=3;}a.s3RefreshGear();}
async function world(){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export { toxicMistScale } from './patches/splatoon3/runtime/toxic-mist.mjs';"});
 f.G.scene=new f.THREE.Scene();f.G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]});f.G.physics=new f.Physics(f.G.level);
 const o=f.make(),v=f.make();o.team=0;v.team=1;o.weapon={...o.weapon,sub:'toxicMist'};o.aimDir.set(0,-1,.1).normalize();o.aimPoint.set(0,0,1);o.intent.sub=true;for(let i=0;i<10;i++)f.tick(o);o.intent.sub=false;for(let i=0;i<10;i++)f.tick(o);
 const c=f.G.projectiles._s3SubObjects.find(x=>x.subId==='toxicMist');assert.ok(c,'actual admitted native throw');for(let i=0;i<120&&c.phase!=='deployed';i++){f.G.time+=1/60;f.G.projectiles.update(1/60);}assert.equal(c.phase,'deployed');v.pos.copy(c.pos);v.isLocal=false;v.remote=false;return {f,o,v,c};
}
function speed(a,squid,dt=1/60,air=false,start=0){a.form=squid?'squid':'kid';a.submerged=squid;a.grounded=!air;a.intent.move.set(0,0,1);a.vel.set(0,0,start);for(let i=0;i<Math.round(2/dt);i++)a._horizontal(dt,squid,false);return a.vel.z;}
function near(a,b){assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);}
test('Mist low/mid/high coefficients equal hash-verified 11.3.0 MoveDownRt',()=>{const bytes=fs.readFileSync(new URL('../reference/gear-params-1130.json',import.meta.url));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'7d01dc1542316bc496425a35efe1a7ece553b2e1b8140ebc4b465555e754788e');assert.deepEqual(MIST_RESISTANCE_CURVE,[...JSON.parse(bytes).MoveDownRt_PoisonMist].reverse());});
for(const ap of [0,10,57])test(`actual cloud scales reduction once in human/squid forms at ${ap}AP`,async()=>{const {f,v,c}=await world();equip(v,ap);const scale=1-(1-c.spec.slowScale)*gearCurve(ap,...MIST_RESISTANCE_CURVE);near(f.toxicMistScale(v),scale);near(speed(v,false),5.76*scale);near(speed(v,true),11.52*scale);near(v.weaponRunner.moveSpeed(),5.76*scale);});
test('current cloud membership restores speed immediately on exit; overlap does not multiply slow',async()=>{const {f,o,v,c}=await world();const second=f.G.projectiles.throwBomb(o);Object.assign(second,{phase:'deployed',expireAt:c.expireAt});second.pos.copy(c.pos);near(f.toxicMistScale(v),.72);v.pos.x+=20;near(f.toxicMistScale(v),1);near(speed(v,true),11.52);v.pos.copy(c.pos);c.dead=true;near(f.toxicMistScale(v),.72);second.dead=true;near(f.toxicMistScale(v),1);});
test('equipment changes alter current reduction; death, friendly and remote Actors remain unaffected',async()=>{const {f,v}=await world();near(f.toxicMistScale(v),.72);equip(v,57);near(f.toxicMistScale(v),.86);equip(v,0);near(f.toxicMistScale(v),.72);v.alive=false;near(f.toxicMistScale(v),1);v.alive=true;v.netLife++;near(f.toxicMistScale(v),.72);v.team=0;near(f.toxicMistScale(v),1);v.team=1;v.remote=true;near(f.toxicMistScale(v),1);v.remote=false;f.G.projectiles.clear();near(f.toxicMistScale(v),1);});
for(const fps of [30,60,120])test(`human air and form transitions preserve unresolved squid air momentum at ${fps}fps`,async()=>{const {f,v,c}=await world();equip(v,57);near(speed(v,true,1/fps,true,11.52),11.52);near(speed(v,false,1/fps,true),Math.max(5.76, f.PLAYER.airMinSpeed)*.86);near(speed(v,true,1/fps),11.52*.86);v.pos.x+=20;near(speed(v,true,1/fps),11.52);c.dead=true;near(f.toxicMistScale(v),1);});
test('expired or absent cloud cannot be restored by a stale local lease',async()=>{const {f,v,c}=await world();v.s3.toxicMistSlowUntil=f.G.time+100;v.s3.toxicMistScale=.01;c.expireAt=f.G.time;near(f.toxicMistScale(v),1);near(speed(v,false),5.76);});
for(const ap of [0,57])test(`JSON replayed cloud applies only local victim ${ap}AP and rejects unsupported status leases`,async()=>{
 const {f,o,v,c}=await world();equip(v,ap);Object.assign(o,{remote:true,nid:31,netLife:4});Object.assign(v,{nid:32,netLife:2});f.G.netm={byNid:new Map([[31,o],[32,v]])};f.G.projectiles.clear();
 const wire={v:1,phase:'spawn',subId:'toxicMist',seq:400,eventSeq:401,life:4,sourceLife:4,x:c.pos.x,y:c.pos.y,z:c.pos.z,vx:0,vy:0,vz:0,charge:0,seed:5,actorId:31};
 const receive=data=>f.installedRuntime.replaySub({...JSON.parse(JSON.stringify(data)),actor:o});
 assert.equal(receive(wire),true);assert.equal(receive({...wire,phase:'deploy',eventSeq:402,lifeSeconds:6}),true);
 const scale=1-.28*gearCurve(ap,...MIST_RESISTANCE_CURVE);near(f.toxicMistScale(v),scale);
 const status={...wire,phase:'status',eventSeq:403,targetId:32,targetLife:2,status:'toxicMist',sourceTeam:0,until:f.G.time+.35,slowScale:.01,subResistance:57};
 assert.equal(receive(status),true);near(f.toxicMistScale(v),scale);assert.equal(receive(status),true);near(f.toxicMistScale(v),scale);
 assert.equal(receive({...status,sourceLife:3}),false);assert.equal(receive({...status,seq:999}),false);assert.equal(receive({...status,targetLife:1}),false);
 v.pos.x+=20;assert.equal(receive(status),false);near(f.toxicMistScale(v),1);v.pos.copy(c.pos);assert.equal(receive({...wire,phase:'expire',eventSeq:404}),true);assert.equal(receive(status),false);near(f.toxicMistScale(v),1);
});
test('hard landing and enemy ink each combine once with the current Mist scale',async()=>{const {f,v}=await world();equip(v,57);v.grounded=true;v.intent.move.set(0,0,1);v.hardLand=1;for(let i=0;i<120;i++)v._horizontal(1/60,false,false);near(v.vel.z,5.76*.86*f.PLAYER.hardLandSlow);v.hardLand=0;v.vel.set(0,0,0);for(let i=0;i<120;i++)v._horizontal(1/60,false,true);near(v.vel.z,Math.min(5.76,f.PLAYER.enemyInkSpeed)*.86);});
for(const ap of [0,57])test(`actual NetMatch catalogue JSON birth/deploy/status keeps victim ${ap}AP local`,async()=>{
 const a=await world(),b=await world();
 function bind(w,id){const {f,o,v}=w;f.G.projectiles.clear();Object.assign(o,{owner:'a',nid:0,remote:id!=='a',team:0,netLife:0});Object.assign(v,{owner:'b',nid:1,remote:id!=='b',team:1,netLife:0});const nm=new f.NetMatch({myId:id,isHost:id==='a',hostId:'a',_members:new Map([['a','A'],['b','B']]),tr:{broadcast(){},sendTo(){}}},{id:'mist-wire',map:'map',difficulty:'normal'});f.G.netm=nm;f.G.match={actors:[o,v],state:'playing',time:180,follower:false,playing:()=>true};nm.bind(f.G.match);for(const x of[o,v]){nm.byNid.set(x.nid,x);nm._setupActor(x);}o.weapon={...o.weapon,sub:'toxicMist'};o.weaponRunner.reset();equip(v,ap);return nm;}
 const tx=bind(a,'a'),rx=bind(b,'b');a.o.aimDir.set(0,-1,.1).normalize();const cloud=a.f.G.projectiles.throwBomb(a.o);assert.ok(cloud);for(let i=0;i<120&&cloud.phase!=='deployed';i++){a.f.G.time+=1/60;a.f.G.projectiles.update(1/60);}assert.equal(cloud.phase,'deployed');a.v.pos.copy(cloud.pos);b.v.pos.copy(cloud.pos);a.f.G.time+=1/60;a.f.G.projectiles.update(1/60);
 const rows=tx.out.filter(e=>e[1]==='ac'&&e[2]==='sub');assert.ok(rows.some(e=>e[5].phase==='spawn'));assert.ok(rows.some(e=>e[5].phase==='deploy'));assert.ok(rows.some(e=>e[5].phase==='status'));rx._peer('a');
 for(const e of rows){const row=JSON.parse(JSON.stringify(e));row._netSeq=e._netSeq;row._netTick=e._netTick;rx._play('a',row);}near(b.f.toxicMistScale(b.v),1-.28*gearCurve(ap,...MIST_RESISTANCE_CURVE));near(a.f.toxicMistScale(a.v),1,'sender does not mutate its remote victim');
 const before=b.v.ink;b.f.G.time+=1/60;b.f.G.projectiles.update(1/60);near(before-b.v.ink,.1);b.v.pos.x+=20;const outside=b.v.ink;b.f.G.time+=1/60;b.f.G.projectiles.update(1/60);near(b.v.ink,outside);near(b.f.toxicMistScale(b.v),1);
});
test('actual splat and respawn remove old membership, then current-cloud re-entry applies fresh equipment',async()=>{const {f,o,v,c}=await world();equip(v,57);v.invuln=0;v.splat(o);assert.equal(v.alive,false);near(f.toxicMistScale(v),1);v.respawn();f.tick(v);assert.equal(v.alive,true);near(f.toxicMistScale(v),1);v.pos.copy(c.pos);near(f.toxicMistScale(v),.86);equip(v,0);near(f.toxicMistScale(v),.72);});
test('native jump admission and landing preserve vertical trajectory inside versus outside Mist',async()=>{
 const {f,v,c}=await world(),outside=f.make();outside.team=1;outside.isLocal=false;outside.pos.copy(c.pos);outside.pos.x+=20;equip(v,57);equip(outside,57);
 for(const a of[v,outside]){a._integrate=f.Actor.prototype._integrate;a.intent.move.set(0,0,0);a.intent.jump=false;f.tick(a);a.grounded=true;a.intent.jump=true;}
 const insideY=[],outsideY=[];
 for(let i=0;i<70;i++){f.G.time+=1/60;for(const a of[v,outside])a.update(1/60);if(i===0)for(const a of[v,outside])a.intent.jump=false;insideY.push(v.pos.y);outsideY.push(outside.pos.y);}
 assert.ok(v.s3JumpSerial>0&&outside.s3JumpSerial>0,'both native jump requests admitted');assert.ok(Math.max(...insideY)>.1);for(let i=0;i<insideY.length;i++)near(insideY[i],outsideY[i]);assert.equal(v.grounded,true);near(f.toxicMistScale(v),.86);near(f.toxicMistScale(outside),1);
});
