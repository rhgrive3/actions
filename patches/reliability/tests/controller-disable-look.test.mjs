import { blockExpiredGuestInput } from '../../splatoon3/runtime/turf-finish.mjs';
import fs from 'node:fs';import vm from 'node:vm';import {adaptSource} from '../../splatoon3/adapter.mjs';import {adaptTouchLayout} from '../../touch-layout/adapter.mjs';import {adaptReliability} from '../adapter.mjs';import {adaptQualitySource} from '../../local-quality/adapter.mjs';
import {test} from 'node:test';import assert from 'node:assert/strict';import {fixture} from './controls-fixture.mjs';
const pad=(x=0,y=0,held=[])=>[{index:0,id:'pad',mapping:'standard',connected:true,axes:[0,0,x,y],buttons:Array.from({length:17},(_,i)=>({pressed:held.includes(i),value:held.includes(i)?1:0}))}];
async function setup(){const f=await fixture(),input=new f.Input({}),a=f.make(),rig={yaw:0,pitch:0},c=new f.PlayerController(a,rig,input);c.computeAim=()=>{};f.G.settings={...f.DEFAULT_SETTINGS,aimAssist:0};f.G.rig=rig;f.G.actors=[a];return {...f,input,a,rig,c,frame(x=0,y=0,dt=1/60,held=[]){f.setPads(pad(x,y,held));input.pollPad();c.update(dt);input.endFrame();}};}
test('#521 saturated X/Y and rim boost clear once on disable, before any disabled update',async()=>{
 for(const [x,y] of [[1,0],[0,1],[1,1]]){const f=await setup();for(let n=0;n<60;n++)f.frame(x,y);assert.ok(Math.abs(f.c.padLook.x)+Math.abs(f.c.padLook.y)>.5);
  assert.equal(f.c.edgeT,0,'S3 right-stick yaw is capped, not accelerated by a rim boost');
  f.c.edgeT=.5; // Inject a stale pre-S3 transient to verify disable clears it.
  let clears=0;const original=f.c._s3ClearDisabledLook;f.c._s3ClearDisabledLook=function(){clears++;return original.call(this);};f.c.enabled=false;assert.equal(f.c.padLook.x,0);assert.equal(f.c.padLook.y,0);assert.equal(f.c.edgeT,0);
  const {yaw,pitch}=f.rig;for(let n=0;n<300;n++){f.c.enabled=false;f.frame();}assert.equal(clears,1);f.c.enabled=true;for(let n=0;n<30;n++)f.frame();assert.deepEqual(f.rig,{yaw,pitch});
 }
});
test('#521 no-update disable/re-enable interval cannot resurrect look, held current stick still turns normally',async()=>{
 const f=await setup();for(let n=0;n<30;n++)f.frame(1,.5);f.c.enabled=false;f.c.enabled=true;const yaw=f.rig.yaw,pitch=f.rig.pitch;f.frame();assert.equal(f.rig.yaw,yaw);assert.equal(f.rig.pitch,pitch);f.frame(1,0);assert.ok(f.rig.yaw<yaw);assert.equal(f.input.lastDevice,'pad');
});
test('#521 resume is neutral at30/60/120/144Hz and does not synthesize button edges',async()=>{
 for(const hz of [30,60,120,144]){const f=await setup();for(let n=0;n<hz;n++)f.frame(1,0,1/hz,[7]);f.c.enabled=false;const held=[...f.input.padPrev];assert.equal(f.input.padButton(7),true);f.frame(0,0,1/hz,[7]);f.c.enabled=true;const yaw=f.rig.yaw;f.frame(0,0,1/hz,[7]);assert.equal(f.rig.yaw,yaw);assert.equal(f.input.padPressed.size,0);assert.deepEqual([...f.input.padPrev],held);assert.equal(f.input.padButton(7),true);}
});
test('#521 only transient look/assist state is changed; actor gameplay and current input stay intact',async()=>{
 const f=await setup();f.c.padLook={x:1,y:1};f.c.edgeT=.5;f.c.assist.has=true;f.a.ink=43;f.a.weaponRunner.cooldown=.3;f.input.mouse.dx=17;f.input.mouse.dy=-9;const padOwner=f.input.lastDevice;
 f.c.enabled=false;assert.equal(f.c.assist.has,false);assert.equal(f.a.ink,43);assert.equal(f.a.weaponRunner.cooldown,.3);assert.equal(f.input.mouse.dx,17);assert.equal(f.input.mouse.dy,-9);assert.equal(f.input.lastDevice,padOwner);
});

test('#521 actual Match disable predicates cover death, offline pause, online menu and finish',async()=>{
 const raw=fs.readFileSync('inkwave-public/src/game/match.js','utf8'),rel='src/game/match.js';const source=adaptQualitySource(rel,adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,raw))));
 const a=source.indexOf('  updateController(dt) {'),b=source.indexOf('\n  _judge()',a);assert.ok(a>=0&&b>a);const Match=vm.runInNewContext(`class Match {${source.slice(a,b)}};Match`,{blockExpiredGuestInput});
 for(const reason of ['death','pause','menu','finish']){const f=await setup(),m=Object.assign(new Match(),{controller:f.c,local:f.a,state:'playing',paused:false});for(let n=0;n<40;n++)f.frame(1,1);const yaw=f.rig.yaw,pitch=f.rig.pitch;
  if(reason==='death')f.a.alive=false;if(reason==='pause')m.paused=true;if(reason==='menu')f.c.menuBlocked=true;if(reason==='finish')m.state='finish';m.updateController(1/60);assert.equal(f.c.enabled,false);assert.equal(f.c.edgeT,0);
  f.setPads(pad());f.input.pollPad();f.a.alive=true;m.paused=false;f.c.menuBlocked=false;m.state='playing';m.updateController(1/60);assert.equal(f.c.enabled,true);assert.equal(f.rig.yaw,yaw);assert.equal(f.rig.pitch,pitch);
 }
});
