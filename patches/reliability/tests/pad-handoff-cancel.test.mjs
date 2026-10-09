import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
const exports = `
  export { Input } from './inkwave-public/src/core/input.js';
  export { PlayerController } from './inkwave-public/src/game/player.js';
  export { installIssueFiveHotfixA } from './patches/splatoon3/runtime/issue-five-hotfix-a.mjs';
  export { installIssueFiveHotfixB } from './patches/splatoon3/runtime/issue-five-hotfix-b.mjs';
  export { installIssueFiveHotfixC } from './patches/splatoon3/runtime/issue-five-hotfix-c.mjs';
  export { installDisconnectFidelity } from './patches/splatoon3/runtime/disconnect-fidelity.mjs';
  export { installSlosherIntermediatePaint } from './patches/splatoon3/runtime/slosher-intermediate-paint.mjs';
  export { installQuality } from './patches/local-quality/install.mjs';
  export { installWeaponsFidelity } from './patches/splatoon3/runtime/weapons-fidelity.mjs';
  export { installIssueEightFollowup } from './patches/splatoon3/runtime/issue-eight-followup.mjs';
`;
async function rig(weapon = 'charger', negative = false) {
  const adapt=(rel,source)=>{
    const out=adaptBuildSource(rel,source);
    if(!negative || rel!=='src/core/input.js')return out;
    const gate="      if (previous && this.lastDevice === 'pad') this._s3PadCanceled = true;";
    assert.ok(out.includes(gate));return out.replace(gate,'');
  };
  const f = await fixture({ fullRuntime:true, adapt, adaptRuntime:adapt, extraExports:exports });
  const source = fs.readFileSync(new URL('../../splatoon3/bootstrap.mjs', import.meta.url), 'utf8');
  let previous = source.indexOf('const context = install(profile);'); assert.ok(previous >= 0);
  for (const name of ['installIssueFiveHotfixA', 'installIssueFiveHotfixB', 'installIssueFiveHotfixC',
    'installDisconnectFidelity', 'installSlosherIntermediatePaint', 'installQuality',
    'installWeaponsFidelity', 'installIssueEightFollowup']) {
    const index = source.indexOf(`  ${name}(`, previous); assert.ok(index > previous); previous = index;
    if (name === 'installQuality') f[name](f.profile); else f[name](f.installedRuntime, f.profile);
  }

  const listeners = new Map(); let pads=[];
  Object.assign(f.context, {AbortController,screen:{width:1280,height:720,orientation:{angle:0}},
    localStorage:{getItem:()=>null}, navigator:{getGamepads:()=>pads},
    window:{addEventListener(n,fn){listeners.set(n,[...(listeners.get(n)||[]),fn]);}},
    document:{documentElement:{classList:{add(){},remove(){},toggle(){}}},addEventListener(){},pointerLockElement:null}});
  const input = new f.Input({}), actor=f.make(weapon), camera={yaw:0,pitch:0}; actor.isLocal=true;
  const controller = new f.PlayerController(actor,camera,input); controller.computeAim=()=>{};
  Object.assign(f.G,{settings:{...f.DEFAULT_SETTINGS,aimAssist:0},rig:camera,actors:[actor],mode:'match',netm:null});
  f.G.match={state:'playing',playing:()=>true}; let bombs=0;
  f.G.projectiles.throwBomb=()=>bombs++;
  const step=(n=1)=>{for(let i=0;i<n;i++){input.pollPad();controller.update(1/60);f.tick(actor);input.endFrame();}};
  return {...f,input,actor,controller,step,bombs:()=>bombs,setPads:v=>pads=v,
    event(n,e){for(const fn of listeners.get(n)||[])fn(e);}};
}
function pad(index, held = []) {return {connected:true,index,id:'pad-'+index,mapping:'standard',axes:[0,0,0,0],
  buttons:Array.from({length:16},(_,i)=>({pressed:held.includes(i),value:held.includes(i)?1:0}))};}

const weapons=['charger','splatling','shooter'];
async function holding(weapon,negative=false) {
  const f=await rig(weapon,negative),button=weapon==='shooter'?5:7,a=pad(0,[button]),b=pad(1);
  f.setPads([a,b]);f.step(weapon==='splatling'?55:15);
  const r=f.actor.weaponRunner;
  assert.equal(weapon==='shooter'?r.aimingSub:r.charging,true);
  assert.equal(f.shots.length,0);assert.equal(f.bombs(),0);
  return {...f,a,b,button};
}
test('#1024 old direct replacement releases held Charger, Splatling and SUB',async()=>{
  for(const weapon of weapons) {
    const f=await holding(weapon,true);f.setPads([null,f.b]);f.event('gamepaddisconnected',{gamepad:f.a});f.step(2);
    assert.equal(weapon==='shooter'?f.bombs():f.shots.length,1);
  }
});

test('#1024 active-pad replacement cancels old held actions before a synthetic release',async()=>{
  for(const weapon of weapons) for(const notification of [false,true]) {
    const f=await holding(weapon);if(notification)f.event('gamepaddisconnected',{gamepad:f.a});
    f.setPads([null,f.b]);f.step(2);
    assert.equal(f.shots.length,0);assert.equal(f.bombs(),0);
    assert.equal(f.actor.weaponRunner.charging,false);assert.equal(f.actor.weaponRunner.streaming,false);
    assert.equal(f.actor.weaponRunner.aimingSub,false);
  }
});

test('#1024 a real same-pad release and fresh replacement press still release normally',async()=>{
  for(const weapon of weapons) for(const replace of [false,true]) {
    const f=await holding(weapon);let active=f.a;
    if(replace) {
      active=f.b;active.buttons[f.button]={pressed:true,value:1};f.setPads([null,active]);f.step(2);
      assert.equal(f.shots.length,0);assert.equal(f.bombs(),0,'replacement held control cannot auto-release old action');
      active.buttons[f.button]={pressed:false,value:0};f.step();
      active.buttons[f.button]={pressed:true,value:1};f.step(weapon==='splatling'?55:15);
      assert.equal(weapon==='shooter'?f.actor.weaponRunner.aimingSub:f.actor.weaponRunner.charging,true);
    }
    active.buttons[f.button]={pressed:false,value:0};f.step(2);
    assert.equal(weapon==='shooter'?f.bombs():f.shots.length,1);
  }
});

test('#1024 handoff while keyboard/mouse owns the charge cannot cancel that action',async()=>{
  for(const weapon of weapons) {
    const f=await holding(weapon);f.input.lastDevice='kbm';f.input.locked=true;
    if(weapon==='shooter')f.input.mouse.right=true;else f.input.mouse.left=true;
    f.setPads([null,f.b]);f.step(2);
    assert.equal(weapon==='shooter'?f.actor.weaponRunner.aimingSub:f.actor.weaponRunner.charging,true);
    f.input.mouse.left=f.input.mouse.right=false;f.step(2);
    assert.equal(weapon==='shooter'?f.bombs():f.shots.length,1);
  }
});

test('#1024 replacement cancels once and preserves recovery resources and accepted projectiles',async()=>{
  const f=await holding('charger'),r=f.actor.weaponRunner;let cancels=0;
  const cancel=r.cancelPendingInput;r.cancelPendingInput=function(){cancels++;return cancel.call(this);};
  const live={};f.G.projectiles.list=[live];r.cooldown=.4;r.lockT=.3;r.rollsLeft=0;
  f.setPads([null,f.b]);f.input.pollPad();f.controller.update(1/60);
  assert.equal(cancels,1);assert.equal(r.cooldown,.4);assert.equal(r.lockT,.3);assert.equal(r.rollsLeft,0);
  assert.equal(f.G.projectiles.list[0],live);
  for(let i=0;i<5;i++){f.input.pollPad();f.controller.update(1/60);}
  assert.equal(cancels,1);assert.equal(f.shots.length,0);
});

test('#1024 direct-handoff cancellation has identical fixed-step results at 30/60/120 Hz',async()=>{
  const results=[];
  for(const hz of [30,60,120]) {
    const f=await holding('charger'),clock=new f.FixedClock();f.setPads([null,f.b]);
    for(let frame=0;frame<hz/2;frame++)clock.advance(1/hz,()=>f.step());
    results.push({shots:f.shots.length,bombs:f.bombs(),charging:f.actor.weaponRunner.charging,ink:f.actor.ink});
  }
  assert.deepEqual(results[0],results[1]);assert.deepEqual(results[1],results[2]);assert.equal(results[0].shots,0);
});
