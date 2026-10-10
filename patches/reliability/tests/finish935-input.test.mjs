import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './controls-fixture.mjs';
import {FixedClock} from '../../splatoon3/runtime/clock.mjs';
const STEP=1/60;
async function rig(weapon='shooter'){
 const f=await fixture({match:true,fidelity:true,network:true});f.installWeaponsFidelity(f,f.profile);
 const input=new f.Input({}),a=f.make(weapon),camera={yaw:0,pitch:0},controller=new f.PlayerController(a,camera,input);controller.computeAim=()=>{};a.isLocal=true;a.nid=1;a.owner='B';
 const m=new f.Match({duration:100,mode:'turf'});Object.assign(m,{local:a,actors:[a],controller,follower:true,time:100,state:'playing'});Object.assign(f.G,{match:m,rig:camera,actors:[a],settings:{...f.DEFAULT_SETTINGS,aimAssist:0},mode:'match'});input.lastDevice='kbm';input.locked=true;
 let bombs=0,steps=0;Object.assign(f.G.projectiles,{throwBomb(){bombs++;},update(){steps++;},list:[],bombs:[],clouds:[],beams:[],sights:new Map()});f.G.paint.coverage=()=>[.9,.1];
 const frame=(n=1)=>{for(let i=0;i<n;i++){f.G.time+=STEP;m.updateController(STEP);m.update(STEP);input.endFrame();}};
 return {...f,input,a,camera,controller,m,frame,bombs:()=>bombs,projectileSteps:()=>steps};
}


for(const hz of [30,60,120])for(const online of [false,true])test(`#935 held charge/sub does not release at TIME UP ${hz}Hz ${online?'host':'offline'}`,async()=>{
 for(const weapon of ['charger','splatling','shooter']){
  const h=await rig(weapon);h.m.follower=false;
  if(online){const session={myId:'B',hostId:'B',isHost:true,tr:{broadcast(){},send(){}}};const nm=new h.NetMatch(session,{map:'reef'});nm.match=h.m;nm.byNid.set(1,h.a);h.G.netm=nm;}
  if(weapon==='shooter')h.input.mouse.right=true;else h.input.mouse.left=true;
  h.frame(weapon==='splatling'?55:15);const r=h.a.weaponRunner;
  if(weapon==='shooter')assert.equal(r.aimingSub,true);else assert.equal(r.charging,true);
  assert.equal(h.shots.length,0);const before=h.a.ink,unspent=r.s3Spin?.unspent||0;
  h.m.time=STEP/2;const clock=new FixedClock();for(let i=0;i<hz/4;i++)clock.advance(1/hz,()=>h.frame());
  assert.equal(h.m.state,'finish');assert.equal(h.shots.length,0,weapon);assert.equal(h.bombs(),0);assert.equal(r.streaming,false);assert.equal(r.charging,false);assert.equal(r.s3SubReady,null);
  assert(h.a.ink>=before,'finish cannot spend new offensive ink');if(weapon==='splatling')assert(h.a.ink>=Math.min(100,before+unspent)-1e-8,'original unspent refund owner survives');
  h.G.netm?.dispose();
 }
});
test('#935 intentional playing releases still create their original actions once',async()=>{
 for(const weapon of ['charger','splatling','shooter']){const h=await rig(weapon);h.m.follower=false;
  if(weapon==='shooter')h.input.mouse.right=true;else h.input.mouse.left=true;
  h.frame(weapon==='splatling'?55:15);h.input.mouse.left=h.input.mouse.right=false;h.frame(2);
  assert.equal(h.m.state,'playing');if(weapon==='shooter'){assert.equal(h.bombs(),1);assert.equal(h.shots.length,0);}else{assert.equal(h.shots.length,1);assert.equal(h.bombs(),0);}
 }
});
test('#935 transition cancellation is once-only and does not reset cooldown, roll state or accepted projectiles',async()=>{
 const h=await rig('dualies');h.m.follower=false;const r=h.a.weaponRunner,dodge={t:.03,dur:.2};
 r.dodge=dodge;r.cooldown=.4;r.lockT=.3;r.rollsLeft=0;r.s3ChargerPostShot=.2;r.rollHits.set({},7);const hits=r.rollHits;
 const shot={},bomb={},cloud={};h.G.projectiles.list.push(shot);h.G.projectiles.bombs.push(bomb);h.G.projectiles.clouds.push(cloud);
 let cancels=0;const cancel=r.cancelPendingInput;r.cancelPendingInput=function(){cancels++;return cancel.call(this);};
 h.m.setState('finish');assert.equal(cancels,1);assert.equal(r.dodge,dodge);assert.equal(r.cooldown,.4);assert.equal(r.lockT,.3);assert.equal(r.rollsLeft,0);assert.equal(r.s3ChargerPostShot,.2);assert.equal(r.rollHits,hits);assert.equal(hits.size,1);
 assert.equal(h.G.projectiles.list[0],shot);assert.equal(h.G.projectiles.bombs[0],bomb);assert.equal(h.G.projectiles.clouds[0],cloud);
 h.m.setState('finish');assert.equal(cancels,1);assert.ok(Object.isFrozen(h.m.s3FinishCoverage));
});
test('#935 pause/resume keeps held Charger, Splatling and SUB without a synthetic release; a later real release acts once',async()=>{
 for(const weapon of ['charger','splatling','shooter']){
  const h=await rig(weapon);h.m.follower=false;const r=h.a.weaponRunner;
  const held=()=>weapon==='shooter'?r.aimingSub===true:r.charging===true;
  const setHeld=v=>{if(weapon==='shooter')h.input.mouse.right=v;else h.input.mouse.left=v;};
  setHeld(true);h.frame(weapon==='splatling'?55:15);assert.equal(held(),true,weapon);
  h.m.paused=true;h.frame(30);
  assert.equal(held(),true,`${weapon} stays held through pause`);assert.equal(h.shots.length,0);assert.equal(h.bombs(),0);
  h.m.paused=false;h.frame(2);
  assert.equal(held(),true,`${weapon} resumes still held`);assert.equal(h.shots.length,0);assert.equal(h.bombs(),0);
  setHeld(false);h.frame(2);
  if(weapon==='shooter'){assert.equal(h.bombs(),1);assert.equal(h.shots.length,0);}else{assert.equal(h.shots.length,1);assert.equal(h.bombs(),0);}
 }
});
