import { blockExpiredGuestInput } from '../../splatoon3/runtime/turf-finish.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fixture } from './controls-fixture.mjs';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
const STEP=1/60;
const BUILT=process.env.INKWAVE_CONTROLS_SITE;
const root=new URL('../../../',import.meta.url).pathname;
function code(rel) {
 const raw=fs.readFileSync(path.join(BUILT||path.join(root,'inkwave-public'),rel),'utf8');
 return BUILT?raw:adaptQualitySource(rel,adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,raw))));
}
function method(source,start,end){const i=source.indexOf(start),j=source.indexOf(end,i);assert.ok(i>=0&&j>i,start);return source.slice(i,j);}
const pad=(held=[],mapping='standard')=>[{connected:true,mapping,axes:[.9,-.5,.8,.7],buttons:Array.from({length:17},(_,i)=>({pressed:held.includes(i),value:held.includes(i)?1:0}))}];
async function rig() {
 const f=await fixture(),input=new f.Input({}),a=f.make(),camera={yaw:.2,pitch:.3},c=new f.PlayerController(a,camera,input);c.computeAim=()=>{};
 const allies=[f.make(),f.make(),f.make()];f.G.settings={...f.DEFAULT_SETTINGS,aimAssist:0};f.G.actors=[a,...allies];f.G.rig=camera;
 f.G.level.spawnPads=[new f.THREE.Vector3(0,0,0)];f.G.physics.groundProbe=(_x,_y,_z,_r,_d,_foot,hit)=>{hit.hit=false;return hit;};
 // Extract the actual composed Match method, not a replacement gating model.
 const native=code('src/game/match.js');
 // The Node fixture extracts Match from composed source; canonical browser acceptance also executes the actual emitted Match export.
 const source=BUILT?adaptQualitySource('src/game/match.js',adaptReliability('src/game/match.js',adaptTouchLayout('src/game/match.js',adaptSource('src/game/match.js',fs.readFileSync(path.join(root,'inkwave-public/src/game/match.js'),'utf8'))))):native;
 const Match=vm.runInNewContext(`class Match {${method(source,'  updateController(dt) {','\n  _judge() {')}}; Match`,{blockExpiredGuestInput});
 const m={state:'playing',paused:false,attract:false,local:a,controller:c,playing:()=>m.state==='playing'&&!m.paused,canRespawn:()=>false,updateController:Match.prototype.updateController};f.G.match=m;
 function frame(held=[],mapping='standard'){f.setPads(pad(held,mapping));input.pollPad();m.updateController(STEP);input.endFrame();}
 function dead(){a.splat(null,'water');assert.equal(a.alive,false);}
 function touch(){const mob=input.mobile;Object.assign(mob,{active:true,visible:true,root:{classList:{toggle(){}},querySelectorAll:()=>[]}});input.lastDevice='touch';return mob;}
 return {...f,input,a,allies,c,camera,m,frame,dead,touch};
}
for(const mode of ['keyboard','pad','touch','raw'])test(`#409 ${mode} opens and closes map while dead without body or aim input`,async()=>{
 const h=await rig();h.dead();const aim=[h.camera.yaw,h.camera.pitch],pos=h.a.pos.clone();
 h.input.keys.add('KeyW');h.input.keys.add('Space');h.input.mouse.left=true;h.input.mouse.dx=200;
 let mob;
 if(mode==='keyboard'){h.input.keys.add('Tab');h.input.pressed.add('Tab');}
 if(mode==='touch'){mob=h.touch();mob.setMap(true);mob.lookDX=.4;mob.gyro.dYaw=.5;}
 if(mode==='pad'||mode==='raw')h.frame(mode==='pad'?[3,7,11]:[8,0,7,11],mode==='raw'?'':'standard');else h.m.updateController(STEP);
 assert.equal(h.c.enabled,false);assert.equal(h.c.mapHeld,true);assert.equal(h.a.intent.move.length(),0);
 for(const k of ['fire','jump','squid','sub','special'])assert.equal(h.a.intent[k],false,k);
 assert.deepEqual([h.camera.yaw,h.camera.pitch],aim);assert.ok(h.a.pos.equals(pos));assert.equal(h.a.superJumpState,null);
 if(mode==='keyboard'){h.input.keys.delete('Tab');h.input.pressed.add('KeyM');h.m.updateController(STEP);}
 if(mode==='touch'){mob.setMap(false);h.m.updateController(STEP);}
 if(mode==='pad'){h.frame([]);h.frame([3]);}
 if(mode==='raw'){h.frame([], '');h.frame([8], '');}
 assert.equal(h.c.mapHeld,false);
});
for(const mode of ['keyboard','pad','touch','raw'])test(`#409 ${mode} queues one target until real respawn lands`,async()=>{
 const h=await rig();h.dead();let mob;
 if(mode==='keyboard'){h.input.keys.add('Tab');h.input.pressed.add('Tab');h.input.pressed.add('Digit2');h.m.updateController(STEP);}
 if(mode==='pad'){h.frame([3]);h.frame([12]);assert.equal(h.c.pendingRespawnJump??null,null);h.frame([1]);}
 if(mode==='raw')h.frame([8,12],'');
 if(mode==='touch'){mob=h.touch();mob.setMap(true);mob.jumpTarget=1;h.m.updateController(STEP);}
 assert.equal(h.c.pendingRespawnJump.actor,h.allies[1]);assert.equal(h.a.superJumpState,null);
 h.a.respawn();assert.equal(h.a.grounded,false);h.m.updateController(STEP);assert.equal(h.a.superJumpState,null,'no air-charge freeze during native spawn drop');
 h.a.grounded=true;h.m.updateController(STEP);assert.ok(h.a.superJumpState.target.equals(h.allies[1].pos));assert.equal(h.c.pendingRespawnJump,null);
 const state=h.a.superJumpState;h.m.updateController(STEP);assert.equal(h.a.superJumpState,state,'no second admission');
});
for(const cancel of ['close','menu','pause','finish','attract','removed','dead','owner'])test(`#409 pending selection cancels on ${cancel}`,async()=>{
 const h=await rig();h.dead();h.frame([3]);h.frame([14]);h.frame([1]);assert.ok(h.c.pendingRespawnJump);
 if(cancel==='close'){h.frame([]);h.frame([3]);}
 if(cancel==='menu')h.c.menuBlocked=true;
 if(cancel==='pause')h.m.paused=true;
 if(cancel==='finish')h.m.state='finish';
 if(cancel==='attract')h.m.attract=true;
 if(cancel==='removed')h.G.actors=h.G.actors.filter(a=>a!==h.allies[0]);
 if(cancel==='dead')h.allies[0].alive=false;
 if(cancel==='owner')h.input.lastDevice='touch';
 h.m.updateController(STEP);h.a.respawn();h.a.grounded=true;h.m.updateController(STEP);
 assert.equal(h.a.superJumpState,null);
});
test('#409 same-frame X cancellation wins over queued respawn admission and roster reorder preserves identity',async()=>{
 const h=await rig();h.dead();h.frame([3]);h.frame([14]);h.frame([1]);h.G.actors=[h.a,h.allies[1],h.allies[0],h.allies[2]];
 h.a.respawn();h.a.grounded=true;h.frame([3]);assert.equal(h.a.superJumpState,null);
 const q=await rig();q.dead();q.frame([3]);q.frame([14]);q.frame([1]);q.G.actors=[q.a,q.allies[1],q.allies[0],q.allies[2]];
 q.a.respawn();q.a.grounded=true;q.m.updateController(STEP);assert.ok(q.a.superJumpState.target.equals(q.allies[0].pos));
});
test('#409 direct request rejects hidden, stale, enemy and unconfirmed jumping targets',async()=>{
 const h=await rig();h.dead();h.m.updateController(STEP);assert.equal(h.c.requestMapJump(h.allies[0]),false);
 h.input.keys.add('Tab');h.input.pressed.add('Tab');h.m.updateController(STEP);const stranger=h.make();stranger.team=1;
 for(const target of [null,{},stranger,h.a,new h.THREE.Vector3(NaN,0,0)])assert.equal(h.c.requestMapJump(target),false);
 h.allies[0].superJumpState={phase:'charge'};assert.equal(h.c.requestMapJump(h.allies[0]),false);
 assert.equal(h.c.requestMapJump(h.G.level.spawnPads[0]),true);assert.ok(h.c.pendingRespawnJump.point);
});
test('#409 selecting another direction clears the old confirmed target before a new confirmation',async()=>{
 const h=await rig();h.dead();h.frame([3]);h.frame([14]);h.frame([1]);assert.equal(h.c.pendingRespawnJump.actor,h.allies[0]);
 h.frame([12]);assert.equal(h.c.pendingRespawnJump,null);h.a.respawn();h.a.grounded=true;h.m.updateController(STEP);assert.equal(h.a.superJumpState,null);
});
test('#409 30/60/120/144Hz controller cadence admits once after the same landing tick',async()=>{
 let expected;
 for(const hz of [30,60,120,144]) {
  const h=await rig();h.dead();h.input.lastDevice='kbm';h.input.keys.add('Tab');h.input.pressed.add('Tab');h.input.pressed.add('Digit1');const clock=new h.FixedClock(),trace=[];
  for(let frame=0;frame<hz;frame++)clock.advance(1/hz,()=>{
    if(clock.ticks===20)h.a.respawn();if(clock.ticks===40)h.a.grounded=true;
    h.m.updateController(STEP);trace.push(!!h.a.superJumpState);h.input.endFrame();
  });
  assert.equal(trace.findIndex(Boolean),40);if(expected)assert.deepEqual(trace,expected);else expected=trace;
 }
});
test('#409 native HUD and diorama clicks route to the deferred controller owner',async()=>{
 const h=await rig();h.dead();h.input.keys.add('Tab');h.input.pressed.add('Tab');h.m.updateController(STEP);
 for(const [rel,start,end,name,args] of [
  ['src/ui/hud.js','  _jumpTo(i) {','\n  _updMarkers(', 'HUD',[0]],
  ['src/ui/diorama.js','  _jump(i, me) {','\n  _flash(', 'Diorama',[0,h.a]]
 ]) {
  // Actual source method with the same emitted controller/Actor when BUILT is set.
  const raw=fs.readFileSync(path.join(root,'inkwave-public',rel),'utf8');
  const source=adaptQualitySource(rel,adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,raw))));
  const C=vm.runInNewContext(`class ${name} {${method(source,start,end)}}; ${name}`,{G:h.G});
  const obj=new C();Object.assign(obj,{on:true,k:1,pins:[{target:h.allies[0]}],beacons:[{}],_beaconTargets:()=>[{ok:true,actor:h.allies[0]}],_local:()=>h.a,_snd(){},_restart(){},_flash(){}});
  (name==='HUD'?obj._jumpTo:obj._jump).apply(obj,args);assert.equal(h.c.pendingRespawnJump.actor,h.allies[0]);assert.equal(h.a.superJumpState,null);h.c.pendingRespawnJump=null;
 }
 const src=code('src/ui/diorama.js');if(!BUILT)assert.match(src,/mapping !== 'standard' && inp.padPressed/);
});
test('#409 a second death during spawn descent cannot carry the prior-life request',async()=>{
 const h=await rig();h.dead();h.frame([3]);h.frame([14]);h.frame([1]);assert.ok(h.c.pendingRespawnJump);
 h.a.respawn();h.a.splat(null,'water');h.m.updateController(STEP);assert.equal(h.c.pendingRespawnJump,null);
 h.a.respawn();h.a.grounded=true;h.m.updateController(STEP);assert.equal(h.a.superJumpState,null);
});
test('#409 an explicit touch choice adopts the new Input owner after keyboard opened the map',async()=>{
 const h=await rig();h.dead();h.input.lastDevice='kbm';h.input.keys.add('Tab');h.input.pressed.add('Tab');h.m.updateController(STEP);
 h.event('pointerdown',{pointerType:'touch'});assert.equal(h.input.lastDevice,'touch');
 assert.equal(h.c.requestMapJump(h.allies[0]),true);h.a.respawn();h.a.grounded=true;h.m.updateController(STEP);
 assert.ok(h.a.superJumpState?.target.equals(h.allies[0].pos));
});

test('#409 held-axis polls preserve native touch pin intent without Mobile contact',async()=>{
 for(const name of ['HUD','Diorama']){
  const h=await rig();h.dead();h.frame([3]);assert.equal(h.c.mapHeld,true);
  h.event('pointerdown',{pointerType:'touch'});assert.equal(h.input.lastDevice,'touch');assert.equal(h.input.mobile._ptr.size,0);assert.equal(h.input.mobile._stick.id,-1);
  const rel=name==='HUD'?'src/ui/hud.js':'src/ui/diorama.js',start=name==='HUD'?'  _jumpTo(i) {':'  _jump(i, me) {',end=name==='HUD'?'\n  _updMarkers(':'\n  _flash(';
  const native=adaptQualitySource(rel,adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,fs.readFileSync(path.join(root,'inkwave-public',rel),'utf8')))));
  const C=vm.runInNewContext(`class ${name} {${method(native,start,end)}};${name}`,{G:h.G});const obj=Object.assign(new C(),{on:true,k:1,pins:[{target:h.allies[0]}],beacons:[{}],_beaconTargets:()=>[{ok:true,actor:h.allies[0]}],_local:()=>h.a,_snd(){},_restart(){},_flash(){}});
  if(name==='HUD')obj._jumpTo(0);else obj._jump(0,h.a);assert.equal(h.c.pendingRespawnJump.actor,h.allies[0]);assert.equal(h.c._respawnNavigationOwner,'touch');
  h.frame([]);assert.equal(h.input.lastDevice,'pad');assert.equal(h.c.pendingRespawnJump.actor,h.allies[0]);assert.equal(h.input.navigationDevice,'touch');
  for(let i=0;i<120;i++)h.frame([]);h.a.respawn();h.a.grounded=true;h.m.updateController(STEP);assert.ok(h.a.superJumpState?.target.equals(h.allies[0].pos));
 }
});

for (const action of ['button','neutral-axis','keyboard','disconnect-axis','replacement-axis','opposite-axis','second-axis']) test(`#409 fresh ${action} cancels after automatic held-axis reacquisition`,async()=>{
 const h=await rig();h.dead();h.frame([3]);h.event('pointerdown',{pointerType:'touch'});h.c.requestMapJump(h.allies[0]);h.frame([]);
 assert.equal(h.input.lastDevice,'pad');assert.equal(h.input.navigationDevice,'touch');assert.ok(h.c.pendingRespawnJump);
 if(action==='button')h.frame([0]);
 if(action==='keyboard')h.event('keydown',{code:'KeyW',preventDefault(){}});
 if(action==='neutral-axis'){const p=pad();p[0].axes=[0,0,0,0];h.setPads(p);h.input.pollPad();h.frame([]);}
 if(action==='disconnect-axis'){h.setPads([]);h.input.pollPad();h.frame([]);}
 if(action==='opposite-axis'){const p=pad();p[0].axes[0]=-.9;h.setPads(p);h.input.pollPad();}
 if(action==='second-axis'){const p=pad();p[0].axes[1]=0;h.setPads(p);h.input.pollPad();}
 if(action==='replacement-axis'){const p=pad();p[0].id='new-pad';h.setPads(p);h.input.pollPad();}
 if(action==='disconnect-axis'||action==='replacement-axis'){
  h.m.updateController(STEP);assert.ok(h.c.pendingRespawnJump,'held reconnect is not fresh navigation input');
  const p=pad();if(action==='replacement-axis')p[0].id='new-pad';p[0].axes=[0,0,0,0];h.setPads(p);h.input.pollPad();h.input.endFrame();p[0].axes=[.9,-.5,.8,.7];h.input.pollPad();
 }
 h.m.updateController(STEP);assert.equal(h.c.pendingRespawnJump,null);h.a.respawn();h.a.grounded=true;h.m.updateController(STEP);assert.equal(h.a.superJumpState,null);
});

for (const phase of ['charge', 'flight']) test(`#412 deferred respawn revalidates a ${phase} teammate destination on confirmation`, async () => {
  const h = await rig(), ally = h.allies[0], destination = new h.THREE.Vector3(18, 0, 6);
  assert.equal(ally.superJump(destination), true);
  // This controller fixture does not integrate the ally's flight; admission
  // already owns the same immutable destination in both supported phases.
  ally.superJumpState.phase = phase;
  h.dead(); h.frame([3]); h.frame([14]); h.frame([1]);
  assert.equal(h.c.pendingRespawnJump.actor, ally);
  assert.equal(h.a.superJumpState, null);
  h.a.respawn(); h.a.grounded = true; h.m.updateController(STEP);
  assert.ok(h.a.superJumpState.to.equals(destination));
  assert.notEqual(h.a.superJumpState.to, ally.superJumpState.to);
  assert.equal(h.c.pendingRespawnJump, null);

  const q = await rig(), changed = q.allies[0];
  assert.equal(changed.superJump(new q.THREE.Vector3(18, 0, 6)), true);
  q.dead(); q.frame([3]); q.frame([14]); q.frame([1]);
  assert.equal(q.c.pendingRespawnJump.actor, changed);
  changed.superJumpState = { phase };
  q.a.respawn(); q.a.grounded = true; q.m.updateController(STEP);
  assert.equal(q.a.superJumpState, null, 'lost destination is rejected again after respawn');
  assert.equal(q.c.pendingRespawnJump, null);
});
