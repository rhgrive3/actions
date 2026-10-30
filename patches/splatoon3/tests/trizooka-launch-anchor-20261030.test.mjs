import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';

const f=await sourceLoadedActorFixture({random:()=>.5,extraExports:`
 export {trizookaPresentationMuzzle} from './patches/splatoon3/runtime/special-motion.mjs';
 export {throwVolley,TRIZOOKA,disposeTrizooka} from './patches/splatoon3/runtime/kit-trizooka.mjs';
`});
const {G,THREE:T}=f,baselinePath=new URL('./fixtures/trizooka-anchor-scalars-before-67f708b6.json',import.meta.url);
const floorLevel=G.level,floorPhysics=G.physics;
const capturing=process.env.INKWAVE_TRIZOOKA_ANCHOR_CAPTURE;
const baseline=capturing?null:JSON.parse(fs.readFileSync(baselinePath,'utf8'));
const traces={};
after(()=>{f.reset();G.netm=null;if(capturing)fs.writeFileSync(capturing,JSON.stringify({source:'67f708b6',scope:'native cadence, combat and network scalar fields; origin/direction intentionally excluded',traces},null,2)+'\n');});
const close=(a,b,message)=>assert.ok(a.distanceTo(b)<1e-9,`${message}: ${a.toArray()} / ${b.toArray()}`);
async function make(hz=60){
 f.reset();G.netm=null;G.time=0;G.level=floorLevel;G.physics=floorPhysics;const a=await f.make();a.owner='local';
 for(let i=0;i<hz;i++)f.tick(a,1/hz);
 a.weapon={...a.weapon,special:'trizooka'};a.special=a.specialCost();return a;
}
function start(a){a._startSpecial();assert.equal(a.specialActive?.id,'trizooka');}
function rawNozzle(ch){const out=new T.Vector3();assert.equal(f.trizookaPresentationMuzzle(ch,out),true);return out;}
function assertBirth(p,expected,aim){
 close(p.start,expected,'real projectile starts at the actual safe muzzle');
 if(p.s3VolleyIndex===0)close(p.vel.clone().normalize(),aim,'central glob follows native camera-ray convergence');
}

for(const hz of [30,60,120])test(`Trizooka actual nozzle, recoil and native packet/scalar trace at ${hz}Hz`,async()=>{
 const a=await make(hz),ch=a.character,ps=G.projectiles,births=[],packets=[];
 const nm=new f.NetMatch({myId:'local',hostId:'peer',isHost:false,_members:new Map()},{}),rec=nm._rec;
 const activeAt=G.time;nm._rec=function(e){if(e[0]==='p'&&e[3]==='trizooka')packets.push({tick:Math.round((G.time-activeAt)*hz),kind:e.slice(2,4),length:e.length,fields:e.slice(10)});return rec.call(this,e);};G.netm=nm;
 const push=ps._push;
 ps._push=function(p,...args){
  if(p.wid==='trizooka'){
   const nozzle=rawNozzle(ch),origin=this._muzzle(a,new T.Vector3()),aim=this._aimFrom(a,origin,new T.Vector3());
   close(origin,nozzle,'open range has no invisible legacy origin');assertBirth(p,origin,aim);
   assert.ok(ch.sourceMotion.active&&!ch.sourceMotion.sourceUpper,'source bank advances while native special owns upper body');
   births.push({tick:Math.round((G.time-activeAt)*hz),action:p.s3ActionIndex,index:p.s3VolleyIndex,
    delay:p.delay,life:p.life,straight:p.straight,damage:p.damage,radius:p.radius,size:p.size,grav:p.grav,drag:p.drag,seed:p.seed,
    speed:Math.round(p.vel.length()*1e8)/1e8,authority:p.damageOwner,ghost:p.ghost});
  }
  return push.call(this,p,...args);
 };
 try{
  start(a);a.intent.fire=true;
  for(let i=0;i<Math.ceil(hz*2.7);i++){
   const t=i/hz,yaw=.9*Math.sin(t*1.7),pitch=.5*Math.sin(t*2.8);
   a.aimYaw=yaw;a.aimPitch=pitch;a.aimDir.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
   a.aimPoint.copy(a.pos).add(new T.Vector3(0,1.05,0)).addScaledVector(a.aimDir,20);
   a.intent.move.set(.4,0,.5);f.tick(a,1/hz);ps.update(1/hz);
  }
  assert.equal(births.length,9,'three native volleys of three globs');assert.equal(packets.length,9,'0/4/8F native births each publish once');
  for(const packet of packets){assert.equal(packet.kind[1],'trizooka');assert.equal(packet.fields[0],0,'true-birth packets carry no second delay');}
  traces[hz]=JSON.parse(JSON.stringify({births,packets,actor:{ink:a.ink,hp:a.hp,special:a.special,position:a.pos.toArray(),velocity:a.vel.toArray()}}));
  if(!capturing)assert.deepEqual(traces[hz],baseline.traces[hz],'legacy combat/cadence/movement/network scalars stay intact');
 }finally{ps._push=push;nm.dispose();G.netm=null;}
});

test('before-first-pose and inactive/disabled main aim getters retain the native pitch path',async()=>{
 const a=await make(),ch=a.character;
 const sample=()=>[-.65,0,.65].map(pitch=>{const out=new T.Vector3();return {ok:ch.getAimMuzzle(out,pitch),point:out.toArray()};});
 const before=sample();start(a);assert.deepEqual(sample(),before,'activation before its first drawn hold uses native main aim');
 const beforePose=G.projectiles._muzzle(a,new T.Vector3()),first=f.throwVolley(G.projectiles,a,a.s3Trizooka.descriptor)[0];
 close(first.start,beforePose,'a real volley before the first pose uses the native fallback origin');
 for(let i=0;i<30;i++)f.tick(a);
 const held=rawNozzle(ch);close(ch.getMuzzle(new T.Vector3()),held,'active getter follows drawn nozzle');
 ch.root.visible=false;const hidden=sample();ch.root.visible=true;
 ch.s3SpecialPresentationEnabled=false;const disabled=sample();assert.deepEqual(hidden,disabled,'hidden hold also delegates the native getter');assert.notDeepEqual(disabled[0].point,disabled[2].point,'main aim still responds to pitch');
 f.disposeTrizooka(a);assert.deepEqual(sample(),disabled,'cleared special delegates the same native aim path');
 ch.form='swim';assert.equal(ch.getAimMuzzle(new T.Vector3(),.5),false,'nonhuman native getter returns false');
});

test('actual close-wall LOS fallback and near/behind aim rules survive corrected hold',async()=>{
 const a=await make(),ch=a.character,ps=G.projectiles;start(a);for(let i=0;i<30;i++)f.tick(a);
 const nozzle=rawNozzle(ch),eye=a.pos.clone().add(new T.Vector3(0,1.05,0)),center=eye.clone().lerp(nozzle,.65),half=new T.Vector3(.025,.08,.025);
 G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[
  {kind:'box',min:center.clone().sub(half).toArray(),max:center.clone().add(half).toArray()}]});G.physics=new f.Physics(G.level);
 assert.equal(G.physics.los(eye,nozzle),false,'real wall occludes barrel from body origin');
 const safe=ps._muzzle(a,new T.Vector3()),expected=eye.clone().addScaledVector(a.aimDir,.3);close(safe,expected,'native LOS fallback');
 assert.ok(safe.distanceTo(nozzle)>.05,'fallback is a measured gameplay safety adjustment');
 for(const point of [safe.clone().addScaledVector(a.aimDir,20),safe.clone().addScaledVector(a.aimDir,.5),safe.clone().addScaledVector(a.aimDir,-4)]){
  a.aimPoint.copy(point);const aim=ps._aimFrom(a,safe,new T.Vector3()),globs=f.throwVolley(ps,a,a.s3Trizooka.descriptor);
  for(const p of globs)assertBirth(p,safe,aim);
  if(point.distanceTo(safe)<2||point.clone().sub(safe).dot(a.aimDir)<0)close(aim,a.aimDir,'native close/behind aim fallback');
 }
});

test('origin assertion rejects a real off-barrel birth through the native volley path',async()=>{
 const a=await make(),ch=a.character;start(a);for(let i=0;i<30;i++)f.tick(a);
 const nozzle=rawNozzle(ch),get=ch.getMuzzle;
 ch.getMuzzle=function(out){get.call(this,out);return out.add(new T.Vector3(.35,0,0));};
 try{const p=f.throwVolley(G.projectiles,a,a.s3Trizooka.descriptor)[0];assert.ok(p.start.distanceTo(nozzle)>.3);assert.throws(()=>assertBirth(p,nozzle,a.aimDir));}
 finally{delete ch.getMuzzle;}
});
