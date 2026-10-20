import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';
import {adaptSquidMotionBinding} from '../squid-motion-binding-adapter.mjs';import {replaceOnce} from '../adapter.mjs';
const wrap=x=>Math.atan2(Math.sin(x),Math.cos(x));
test('heading adapter is fail-closed and preserves the manual heading branch',()=>{
 const source=fs.readFileSync(new URL('../../../inkwave-public/src/game/motion/source-controller.js',import.meta.url),'utf8');
 const out=adaptSquidMotionBinding('src/game/motion/source-controller.js',source,replaceOnce);
 assert.throws(()=>adaptSquidMotionBinding('src/game/motion/source-controller.js',out,replaceOnce),/conflict/);
 assert.throws(()=>adaptSquidMotionBinding('src/game/motion/source-controller.js','',replaceOnce),/conflict/);
 const oldLine=source.split('\n').find(x=>x.includes('const wantedYaw=this.speed>1e-5'));
 assert(out.includes('  }else{\n '+oldLine+'\n  }'),'manual preview retains its original heading expression');
 assert.equal(adaptSquidMotionBinding('src/game/actor.js','unchanged',replaceOnce),'unchanged');
});
test('normal controller preserves short wraps, reverse inertia, stops, single redive reset and teleport admission',async()=>{
 const f=await sourceLoadedActorFixture({random:()=>.4,transform:process.env.INKWAVE_BUILT_SITE?()=>{throw Error('emitted heading test cannot use authored-source adaptation');}:undefined});let checks=0;
 for(const surface of [0,1]){
  f.G.time=0;f.G.paint.sample=()=>surface;const a=await f.make(),c=a.character;
  // Isolate this source owner; the full-composition 54-scene test keeps swim enabled.
  c.s3SwimMotionEnabled=false;
  const raw={keys:new Set(),pressed:new Set(),padPressed:new Set(),mouse:{dx:0,dy:0,left:false,right:false},down(k){return this.keys.has(k);},wasPressed:()=>false,padButton:()=>false,padValue:()=>0};
  const rig={yaw:179*Math.PI/180,pitch:0,mode:'follow',target:a,gameCam:new f.THREE.PerspectiveCamera(60,1,.1,100)};f.G.rig=rig;
  const controller=new f.PlayerController(a,rig,raw),tick=()=>{controller.update(1/60);f.tick(a);};
  for(let i=0;i<12;i++)tick();raw.keys=new Set(['ShiftLeft','KeyW']);for(let i=0;i<240;i++)tick();
  const state=()=>{const s=c.sourceMotion;assert([s.squidTravelYaw,s.squidYaw,c.root.rotation.y,s.speed].every(Number.isFinite));assert(Math.abs(wrap(s.squidYaw-(s.squidTravelYaw-c.root.rotation.y)))<1e-10);checks++;return s.squidTravelYaw;};
  const advanceOnce=()=>{const previous=state();tick();const now=state(),s=c.sourceMotion,confidence=Math.max(0,Math.min(1,(s.speed-.06)/.30));const expected=wrap(previous+wrap(Math.atan2(s.motionVX,s.motionVZ)-previous)*(1-Math.exp(-16/60*confidence)));assert(Math.abs(wrap(now-expected))<1e-10,'one filter from the previous scene heading');return [previous,now];};
  rig.yaw=-179*Math.PI/180;for(let i=0;i<30;i++){const [before,after]=advanceOnce();assert(Math.abs(wrap(after-before))<.1,'short path across pi');}
  rig.yaw=Math.PI/180;for(let i=0;i<90;i++)advanceOnce();
  raw.keys=new Set(['ShiftLeft']);for(let i=0;i<180;i++)tick();const stopped=state();assert(c.sourceMotion.speed<1e-5);
  // Rotate camera without movement: stationary squid keeps its travel heading.
  rig.yaw+=Math.PI/2;for(let i=0;i<12;i++){tick();assert.equal(state(),stopped);}
  raw.keys.clear();tick();raw.keys=new Set(['ShiftLeft','KeyA']);tick();state();for(let i=0;i<3;i++)advanceOnce();
  raw.keys=new Set(['ShiftLeft']);a.pos.x+=8;tick();assert.equal(c.sourceMotion.motionVX,0);assert.equal(c.sourceMotion.motionVZ,0);assert(Math.abs(wrap(state()-c.root.rotation.y))<1e-10,'teleport initializes in current root frame');
  f.reset();
 }
 console.log('SQUID_HEADING_BOUNDARIES '+JSON.stringify({surfaces:2,checks,controller:true,swimOverlay:false,liveNetwork:false}));
});
