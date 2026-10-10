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
    const gate="    if (this._dev === 'pad' && v !== 'pad') {";
    assert.ok(out.includes(gate));return out.replace(gate,"    if (false) {");
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
function changeOwner(f,owner) {
  if(owner==='kbm') f.event('keydown',{code:'KeyW',repeat:false,preventDefault(){}});
  else f.event('pointerdown',{pointerType:'touch',target:f.input.canvas});
  assert.equal(f.input.lastDevice,owner);
}

test('#1187 old ownership mask turns a held pad into Charger/Splatling/SUB release through real input events',async()=>{
  for(const weapon of weapons)for(const owner of ['kbm','touch']) {
    const f=await holding(weapon,true);changeOwner(f,owner);f.step(2);
    assert.equal(weapon==='shooter'?f.bombs():f.shots.length,1);
    assert.equal(f.a.buttons[f.button].pressed,true);
    assert.equal(f.input.pad,f.a,'old controller stayed connected');
  }
});

test('#1187 keyboard and touch ownership cancel a still-held pad action without emitting',async()=>{
  for(const weapon of weapons)for(const owner of ['kbm','touch']) {
    const f=await holding(weapon);changeOwner(f,owner);f.step(2);
    assert.equal(f.shots.length,0);assert.equal(f.bombs(),0);
    const r=f.actor.weaponRunner;
    assert.equal(r.charging,false);assert.equal(r.streaming,false);assert.equal(r.aimingSub,false);
    assert.equal(f.input._holdCancelled.size,0,'cancellation is consumed with the fixed input frame');
  }
});

test('#1187 real pad release remains intentional, even if keyboard acquires ownership before the next tick',async()=>{
  for(const weapon of weapons) {
    const f=await holding(weapon);f.a.buttons[f.button]={pressed:false,value:0};changeOwner(f,'kbm');f.step(2);
    assert.equal(weapon==='shooter'?f.bombs():f.shots.length,1);
  }
});

test('#1187 a new mouse hold can continue the same action, and its later real release fires once',async()=>{
  for(const weapon of weapons) {
    const f=await holding(weapon);f.input.locked=true;changeOwner(f,'kbm');
    f.event('mousedown',{button:weapon==='shooter'?2:0});f.step(2);
    const r=f.actor.weaponRunner;
    assert.equal(weapon==='shooter'?r.aimingSub:r.charging,true);
    assert.equal(f.shots.length,0);assert.equal(f.bombs(),0);
    f.event('mouseup',{button:weapon==='shooter'?2:0});f.step(2);
    assert.equal(weapon==='shooter'?f.bombs():f.shots.length,1);
  }
});

test('#1187 cancellation does not block a fresh pad reacquisition',async()=>{
  for(const weapon of weapons) {
    const f=await holding(weapon);changeOwner(f,'kbm');f.step(2);
    f.a.buttons[f.button]={pressed:false,value:0};f.step();
    f.a.buttons[f.button]={pressed:true,value:1};f.step(weapon==='splatling'?55:15);
    assert.equal(f.input.lastDevice,'pad');
    assert.equal(weapon==='shooter'?f.actor.weaponRunner.aimingSub:f.actor.weaponRunner.charging,true);
    f.a.buttons[f.button]={pressed:false,value:0};f.step(2);
    assert.equal(weapon==='shooter'?f.bombs():f.shots.length,1);
  }
});

test('#1187 ownership cancellation retains cooldown, lock and accepted projectiles',async()=>{
  const f=await holding('charger'),r=f.actor.weaponRunner,live={};f.G.projectiles.list=[live];r.cooldown=.4;r.lockT=.3;
  changeOwner(f,'kbm');f.controller.update(1/60);
  assert.equal(r.cooldown,.4);assert.equal(r.lockT,.3);assert.equal(f.G.projectiles.list[0],live);assert.equal(r.charging,false);
});

test('#1187 event-to-fixed-step cancellation is equivalent at 30/60/120 Hz',async()=>{
  const outcomes=[];
  for(const hz of [30,60,120]) {
    const f=await holding('charger'),clock=new f.FixedClock();changeOwner(f,'kbm');
    for(let frame=0;frame<hz/2;frame++)clock.advance(1/hz,()=>f.step());
    outcomes.push({shots:f.shots.length,charging:f.actor.weaponRunner.charging,ink:f.actor.ink});
  }
  assert.deepEqual(outcomes[0],outcomes[1]);assert.deepEqual(outcomes[1],outcomes[2]);assert.equal(outcomes[0].shots,0);
});
