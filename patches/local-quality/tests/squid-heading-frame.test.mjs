import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';
import {FixedClock} from '../../splatoon3/runtime/clock.mjs';
import {measureSkinnedHeading} from '../../../tools/squid-heading-qa/axes.mjs';

const angle=x=>Math.atan2(Math.sin(x),Math.cos(x));
const input=()=>({keys:new Set(),pressed:new Set(),padPressed:new Set(),mouse:{dx:0,dy:0,left:false,right:false},down(k){return this.keys.has(k);},wasPressed(k){return this.pressed.has(k);},padButton:()=>false,padValue:()=>0});
const directions=[['stop',[]],['forward',['KeyW']],['forward-right',['KeyW','KeyA']],['right',['KeyA']],['back-right',['KeyS','KeyA']],['back',['KeyS']],['back-left',['KeyS','KeyD']],['left',['KeyD']],['forward-left',['KeyW','KeyD']]];
function axis(f,ch){const r=ch.sourceMotion.squidRig,v=n=>r.bones[r.index[n]].getWorldPosition(new f.THREE.Vector3());ch.root.updateMatrixWorld(true);r.skeleton.update();return v('Sqd_head2').sub(v('Sqd_head0')).normalize();}
function setupController(f,a,yaw=0){const raw=input(),rig={yaw,pitch:0,mode:'follow',target:a,gameCam:new f.THREE.PerspectiveCamera(60,1,.1,100)};f.G.rig=rig;const controller=new f.PlayerController(a,rig,raw);return{raw,rig,controller};}

test('normal controller and physics keep newly-dived squid within its travel turn at every fixed-clock render cadence',async()=>{
 const f=await sourceLoadedActorFixture({random:()=>.4,transform:process.env.INKWAVE_BUILT_SITE?()=>{throw Error('emitted heading test cannot use authored-source adaptation');}:undefined});const traces=new Map();let scenes=0,simulationTicks=0;
 for(const hz of [30,60,120])for(const surface of [0,1])for(const [name,keys]of directions){
  f.G.time=0;f.G.paint.sample=()=>surface;const a=await f.make(),ch=a.character,{raw,controller}=setupController(f,a),clock=new FixedClock(),trace=[];
  const target=new f.THREE.Vector3();let desired=0;
  while(clock.ticks<108)clock.advance(1/hz,dt=>{
   const tick=clock.ticks;raw.keys.clear();if(tick>=12){raw.keys.add('ShiftLeft');if(tick<60)for(const k of keys)raw.keys.add(k);}
   controller.update(dt);if(tick===12){target.copy(a.intent.move);desired=Math.atan2(target.x,target.z);}
   f.tick(a,dt);simulationTicks++;
   assert(a.grounded);assert.deepEqual(Array.from(a.groundN.toArray()),[0,1,0]);
   const v=axis(f,ch),heading=Math.atan2(v.x,v.z),entered=tick-11;
   if(entered>=3&&entered<=12&&name!=='stop'){
    const signed=angle(heading),sign=Math.sign(desired);
    if(Math.abs(desired)<1e-8)assert(Math.abs(signed)<1e-6,'forward remains forward');
    else assert(sign*signed>=-1e-7&&sign*signed<=Math.abs(desired)+1e-7,JSON.stringify({hz,surface,name,entered,heading,desired,reason:'root turn must not be counted twice'}));
   }
   // Idle Sqd_Wait bends the mantle; its surface heading need not equal the
   // straight bone chord. Gate the fresh-dive drawn heading, record every phase.
   if([12,13,14,17,23,35,59,83,107].includes(tick)){const skinned=measureSkinnedHeading(f.THREE,ch);if(entered>=3&&entered<=12&&name!=='stop'){const h=angle(skinned.heading),sign=Math.sign(desired);if(Math.abs(desired)<1e-8)assert(Math.abs(h)<1e-6);else assert(sign*h>=-1e-7&&sign*h<=Math.abs(desired)+1e-7,'drawn mantle cannot overshoot input during a fresh dive');}assert([...skinned.mantle,...skinned.width,skinned.pitch,skinned.roll].every(Number.isFinite));trace.push({tick,form:a.form,shown:ch.form,pos:Array.from(a.pos.toArray()),velocity:Array.from(a.vel.toArray()),rootYaw:a.yaw,groundNormal:Array.from(a.groundN.toArray()),mantle:Array.from(v.toArray()),skinned,sourceClip:{...ch.sourceMotion.debug.squid},ink:a.ink,hp:a.hp});}
  });
  const key=surface+'/'+name;if(hz===30)traces.set(key,trace);else assert.deepEqual(trace,traces.get(key),'same simulation ticks at '+hz+' Hz: '+key);
  assert.equal(a.form,'squid');assert.equal(a.submerged,!!surface);assert.equal(a.vel.length(),0);scenes++;f.reset();
 }
 console.log('SQUID_HEADING_FIXED_INPUT '+JSON.stringify({scenes,simulationTicks,renderHz:[30,60,120],input:'PlayerController raw Shift/WASD',physics:'real Level/Physics',sourceReady:true}));
});

test('actual remote presentation ignores sub-threshold positional correction headings',async()=>{
 const f=await sourceLoadedActorFixture({random:()=>.4,transform:process.env.INKWAVE_BUILT_SITE?()=>{throw Error('emitted heading test cannot use authored-source adaptation');}:undefined}),a=await f.make(),c=a.character;f.G.rig=null;f.G.camera=new f.THREE.PerspectiveCamera(60,1,.1,100);a.owner='peer';
 const nm=new f.NetMatch({myId:'local',isHost:false,_members:new Map([['peer',{}]])},{map:'fixture'});nm._setupActor(a);a.net.ready=true;
 // Existing NET_FLAGS: alive 1 | squid 2 | grounded 16. This is a local
 // remote-sample fixture, never a packet sent to a real peer.
 const sample={x:0,y:0,z:0,vx:0,vy:0,vz:0,yaw:0,aimYaw:0,aimPitch:0,f:19,hp:100,ink:100,sp:0,ch:0,turf:0,tp:0,wx:0,wy:0,wz:1,lock:0,sjT:0};a.net.cur=sample;
 const tick=()=>{f.G.time+=1/60;nm.applyRemote(a,1/60);c.root.updateMatrixWorld(true);};
 for(let i=0;i<60;i++){sample.z+=.1;sample.vz=6;tick();}sample.vz=0;for(let i=0;i<60;i++)tick();const before=c.sourceMotion.squidYaw;
 for(let i=0;i<60;i++){sample.x=i%2?.0001:0;sample.vx=i%2?.006:-.006;tick();assert(c.sourceMotion.speed<.06);assert(Math.abs(angle(c.sourceMotion.squidYaw-before))<1e-9,'sub-threshold net correction cannot steer squid heading');}
 nm.dispose();f.reset();
});
