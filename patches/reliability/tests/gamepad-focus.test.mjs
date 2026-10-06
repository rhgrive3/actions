import test from 'node:test';
import assert from 'node:assert/strict';
import {boot,pad,STEP} from './pause-fixture.mjs';
import {installInputPlatform} from '../../local-quality/platform-input.mjs';
import {installPlatformGame} from '../../local-quality/platform-game.mjs';

async function setup(){
 const h=await boot(),env=new EventTarget();
 env.document=new EventTarget();env.document.hidden=false;
 env.performance=performance;env.requestAnimationFrame=()=>1;env.cancelAnimationFrame=()=>{};
 env.screen={orientation:new EventTarget()};env.console=console;
 installInputPlatform(h.input.constructor,env);installPlatformGame(h.game.constructor,h.G,env);
 h.game.settings={};h.game._loop();const owner=h.game.platform.owner;
 const poll=()=>{h.input.pollPad();h.controller.update(STEP);};
 h.setPads(pad());poll();h.input.endFrame();
 return {...h,env,owner,poll,signal:n=>env.dispatchEvent(new Event(n)),close(){h.game.disposePlatform();owner.dispose();}};
}
const active=()=>{const p=pad([0,3,5,6,7,11]);p[0].axes=[.8,-.5,.9,.6,-1];return p;};
function neutral(h){
 assert.equal(h.rig.yaw,0);assert.equal(h.rig.pitch,0);assert.equal(h.actor.intent.move.length(),0);
 for(const k of ['jump','fire','sub','squid','special'])assert.equal(h.actor.intent[k],false,k);
 assert.equal(h.input.padPressed.size,0);assert.equal(h.input.padMenuPressed.size,0);
}

for(const hz of [30,60,120])test(`${hz}Hz visible blur rejects fresh pad authority and rebases held return`,async()=>{
 const h=await setup();try{
  h.input.lastDevice='touch';h.signal('blur');h.poll();h.input.endFrame();
  h.setPads(active());for(let i=0;i<hz;i++){h.poll();h.frame(1/hz);neutral(h);}
  assert.equal(h.owner.focused,false);assert.equal(h.owner.state,'ACTIVE');assert.equal(h.input.lastDevice,'touch');
  h.signal('focus');for(let i=0;i<3;i++){h.poll();neutral(h);assert.equal(h.input.lastDevice,'touch');}
  h.setPads(pad());h.poll();h.input.endFrame();h.setPads(active());h.poll();
  assert.notEqual(h.rig.yaw,0);assert.notEqual(h.rig.pitch,0);assert.ok(h.actor.intent.move.length()>0);
  for(const k of ['jump','fire','sub','squid','special'])assert.equal(h.actor.intent[k],true,k);
  assert.equal(h.input.lastDevice,'pad');assert.ok(h.input.padMenuPressed.size>0);
 }finally{h.close();}
});

test('blur/focus between polls still blocks held controls and render-pending edges',async()=>{
 const h=await setup();try{
  h.actor.special=h.actor.specialCost();h.setPads(pad([11]));h.input.pollPad();
  assert.ok(h.input.padPressed.has(11));const epoch=h.input._padEpoch;
  h.signal('blur');h.signal('focus');h.frame(1/120);h.frame(1/120);
  assert.ok(h.input._padEpoch>epoch);assert.equal(h.actor.specialReady(),true);assert.equal(h.actor.specialActive,null);
  assert.equal(h.input.padValue(11),0);
 }finally{h.close();}
});

test('analog holds and a controller replaced while unfocused need real release',async()=>{
 const h=await setup();try{
  h.signal('blur');h.poll();const p=active();p[0].index=1;p[0].id='replacement';p[0].mapping='';
  for(const i of [6,7])p[0].buttons[i]={pressed:false,value:.4};h.setPads(p);h.poll();h.signal('focus');h.poll();neutral(h);
  for(const i of [6,7])p[0].buttons[i].value=.3;p[0].buttons=p[0].buttons.map((b,i)=>i===6||i===7?b:{pressed:false,value:0});
  p[0].axes=[0,0,0,0,-1];h.poll();p[0].buttons[7].value=.4;h.poll();assert.equal(h.actor.intent.fire,true);
 }finally{h.close();}
});

test('no exposed pad on focus preserves the rebase until the first available device',async()=>{
 const h=await setup();try{
  h.signal('blur');h.setPads([]);h.poll();h.signal('focus');h.poll();
  h.setPads(active());h.poll();neutral(h);
  h.setPads(pad());h.poll();h.setPads(pad([0]));h.poll();assert.equal(h.actor.intent.jump,true);
 }finally{h.close();}
});

test('twenty blur/focus cycles retain lifecycle owners and hidden/pagehide/freeze behavior',async()=>{
 const h=await setup();try{
  const before=h.owner.snapshot();
  for(let i=0;i<20;i++){h.signal('blur');h.poll();h.signal('focus');h.setPads(pad());h.poll();}
  const after=h.owner.snapshot();assert.equal(after.listeners,before.listeners);assert.equal(after.subscribers,before.subscribers);
  assert.equal(after.errors,0);assert.equal(after.blurs,20);
  h.env.document.hidden=true;h.env.document.dispatchEvent(new Event('visibilitychange'));assert.equal(h.owner.state,'SUSPENDED');
  h.env.document.hidden=false;h.env.document.dispatchEvent(new Event('visibilitychange'));assert.equal(h.owner.state,'ACTIVE');
  h.signal('pagehide');assert.equal(h.owner.state,'SUSPENDED');h.signal('pageshow');assert.equal(h.owner.state,'ACTIVE');
  h.env.document.dispatchEvent(new Event('freeze'));assert.equal(h.owner.state,'SUSPENDED');
  h.env.document.dispatchEvent(new Event('resume'));assert.equal(h.owner.state,'ACTIVE');
  h.setPads(pad());h.poll();h.setPads(pad([0]));h.poll();assert.equal(h.actor.intent.jump,true);
 }finally{h.close();}
});
