import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';
import {makePaintWorld} from '../../splatoon3/tests/paint-authority-fixture.mjs';
import {assertOpeningSpawnAtRate} from '../../../scripts/lib/inkwave-opening-spawn-contract.mjs';

async function setup(mutation=null){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
  extraExports:"export {Match} from './inkwave-public/src/game/match.js'; export {TURF_INTRO_FRAMES} from './patches/splatoon3/runtime/turf-intro-camera.mjs';"});
 const {level}=makePaintWorld(f);level.spawnPads=[{x:0,y:0,z:0},{x:0,y:0,z:30}];level.groundHeight=()=>0;
 const game={s3Clock:new f.FixedClock(),debug:{freeze(){},freezeBots(){}},menus:{wipe:{cancel(){}}},
  async startMatch(){
   const m=new f.Match({duration:180,mode:'turf'});m.state='intro';m.stateT=0;f.G.match=m;
   const actors=[];f.G.actors=[];
   for(let i=0;i<8;i++){
    const a=f.make();a.team=i<4?0:1;a.slot=i%4;a.bot=i?{update(){}}:null;
    a.isLocal=i===0;a.isBot=i>0;a.aimYaw=a.team?Math.PI:0;a.aimDir.set(0,0,a.team?-1:1);
    a.aimPoint.set(0,0,a.team?22.5:7.5);
    assert.equal(f.beginInitialSquidSpawn(a),true);
    if(mutation==='missed-launch'&&i===0)a.s3.squidSpawn.ownerReplicated=true;
    actors.push(a);
   }
   m.actors=actors;m.local=actors[0];f.G.actors=actors;f.G.local=actors[0];
   this.match=m;
  },
  _frame(dt){this.s3Clock.advance(dt,step=>{
   const tick=this.s3Clock.ticks+1;
   if(mutation==='early'&&this.match.state==='intro'&&tick===577)this.match.setState('playing');
   if(mutation==='late'&&this.match.state==='intro'&&tick===578)return;
   this.match.update(step);
  });}
 };
 f.G.game=game;
 return {f,game};
}
test('actual composed Match/Actor owners satisfy578F GO, same-tick flight and supported touchdown at30/60/120Hz',async()=>{
 const prior=[globalThis.openingContext,globalThis.openingIntroFrames];
 try{
  const {f,game}=await setup();globalThis.openingContext=f;globalThis.openingIntroFrames=f.TURF_INTRO_FRAMES.go;
  assert.equal(f.TURF_INTRO_FRAMES.go,578);
  for(const hz of [30,60,120]){
   const p=await assertOpeningSpawnAtRate(hz);assert.equal(p.goTick,578);
   assert.equal(p.launchWaitFrames,0);assert.equal(p.initial.length,8);assert.equal(p.initial.filter(a=>a.bot).length,7);
   assert.equal(p.playing.every(a=>a.phase==='flight'),true);
   assert.equal(p.landed.every(a=>!a.phase&&a.grounded&&a.supported),true);
  }
 }finally{[globalThis.openingContext,globalThis.openingIntroFrames]=prior;}
});

for(const [mutation,message] of [['early',/GO tick mismatch/],['late',/GO tick mismatch/],['missed-launch',/launch on the native GO tick/]]){
 test('opening contract rejects '+mutation+' and retires its own observer',async()=>{
  const prior=[globalThis.openingContext,globalThis.openingIntroFrames];let active=0;
  try{
   const {f}=await setup(mutation);
   globalThis.openingContext={G:f.G,on(name,fn){active++;const off=f.on(name,fn);return()=>{active--;off();};}};
   globalThis.openingIntroFrames=f.TURF_INTRO_FRAMES.go;
   await assert.rejects(assertOpeningSpawnAtRate(30),message);
   assert.equal(active,0,'failed QA must retire its event listener');
  }finally{[globalThis.openingContext,globalThis.openingIntroFrames]=prior;}
 });
}
test('legacy300F window is insufficient for actual578F production introduction',async()=>{
 const {f,game}=await setup();await game.startMatch();
 for(let i=0;i<150;i++)game._frame(1/30);
 assert.equal(f.G.match.state,'intro');assert.ok(Math.abs(f.G.match.stateT-5)<1e-9);
 assert.equal(f.G.actors.every(a=>a.s3.squidSpawn.phase==='aim'),true);
});
