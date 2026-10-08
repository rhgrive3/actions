import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, pad, STEP } from './pause-fixture.mjs';

const advance = (h, seconds, hz) => { for (let i = 0; i < Math.round(seconds * hz); i++) h.frame(1 / hz); };
const key = (h, code, down) => h.event(down ? 'keydown' : 'keyup', { code, repeat: false, preventDefault() {} });
function touch(h) {
  const m = h.input.mobile, classList = { add() {}, remove() {}, toggle() {} };
  Object.assign(m, { active:true, root:{classList,querySelectorAll:()=>[]},
    els:Object.fromEntries(['fire','sub','map','squid','jump','special'].map(x=>[x,{classList}])), _stickHome:{x:0,y:0,d:100},_stickR:50 });
  m._drawStick=()=>{};
  return m;
}

for (const hz of [30,60,120]) {
  for (const weapon of ['charger','splatling','shooter']) test(`#963 ${weapon} pause release cancels, fresh input works at ${hz}Hz`, async () => {
    const h=await boot(); h.actor.setWeapon(weapon);
    const button=weapon==='shooter'?'right':'left';
    h.G.projectiles.throwBomb=()=>h.shots.push({kind:'bomb'});
    h.input.mouse[button]=true; advance(h,.5,hz);
    assert.ok(weapon==='shooter'?h.actor.weaponRunner.aimingSub:h.actor.weaponRunner.charging);
    const before=h.shots.length, time=h.m.time;
    h.game.pause(); h.input.mouse[button]=false; advance(h,.2,hz);
    assert.equal(h.m.time,time);
    h.game.resume(); advance(h,.3,hz); assert.equal(h.shots.length,before);
    h.input.mouse[button]=true; advance(h,.5,hz); h.input.mouse[button]=false; advance(h,.6,hz);
    assert.ok(h.shots.length>before,'deliberate new hold/release fires');
  });
  for (const weapon of ['charger','splatling','shooter']) test(`#964 ${weapon} touch map cancels held action at ${hz}Hz`, async () => {
    const h=await boot(), m=touch(h); h.actor.setWeapon(weapon);
    const id=weapon==='shooter'?'sub':'fire';
    h.G.projectiles.throwBomb=()=>h.shots.push({kind:'bomb'});
    const press=pointerId=>m._press(id,{pointerId,clientX:700,clientY:300,preventDefault(){}});
    press(1); advance(h,.5,hz);
    assert.ok(weapon==='shooter'?h.actor.weaponRunner.aimingSub:h.actor.weaponRunner.charging);
    const before=h.shots.length;
    m.setMap(true); advance(h,.2,hz); assert.equal(h.controller.mapHeld,true);
    m.setMap(false); advance(h,.3,hz); assert.equal(h.shots.length,before);
    press(2); advance(h,.5,hz); m._up({pointerId:2,type:'pointerup'}); advance(h,.6,hz);
    assert.ok(h.shots.length>before,'fresh touch action fires');
  });
  test(`#960 keyboard tap toggles, release stays open, held FIRE is suppressed at ${hz}Hz`,async()=>{
    const h=await boot(); key(h,'Tab',true);advance(h,.1,hz);key(h,'Tab',false);advance(h,.1,hz);
    assert.equal(h.controller.mapHeld,true);
    h.input.mouse.left=true;advance(h,.2,hz);assert.equal(h.ownedShots.length,0);
    key(h,'KeyM',true);advance(h,.1,hz);key(h,'KeyM',false);advance(h,.1,hz);
    assert.equal(h.controller.mapHeld,false);assert.equal(h.ownedShots.length,0,'map hold cannot become a fresh shot');
    h.input.mouse.left=false;advance(h,.1,hz);h.input.mouse.left=true;advance(h,.1,hz);assert.ok(h.ownedShots.length>0);
  });
}

for (const mapping of ['standard','']) test(`#960 ${mapping||'raw'} pad taps share touch/keyboard latch`,async()=>{
  const h=await boot();touch(h);
  const buttons=values=>{const p=pad(values);p[0].mapping=mapping;return p;};
  const map=mapping==='standard'?3:8;
  h.setPads(buttons([map]));h.frame(STEP);h.setPads(buttons([]));h.frame(STEP);
  assert.equal(h.controller.mapHeld,true);assert.equal(h.input.mobile.mapOpen,true);
  h.input.mobile.setMap(false);h.frame(STEP);assert.equal(h.controller.mapHeld,false);
  key(h,'Tab',true);h.frame(STEP);key(h,'Tab',false);h.frame(STEP);assert.equal(h.controller.mapHeld,true);
  h.setPads(buttons([map]));h.frame(STEP);assert.equal(h.controller.mapHeld,false);
});

test('#964 a Charger release queued for its next tick is revoked by a touch map open/close',async()=>{
  const h=await boot(),m=touch(h);h.actor.setWeapon('charger');h.input.mouse.left=true;
  advance(h,.5,60);h.input.mouse.left=false;h.frame(STEP);
  assert.equal(h.actor.weaponRunner.s3ReleaseHold,true,'native one-frame delayed release');
  m.setMap(true);m.setMap(false);advance(h,.2,60);
  assert.equal(h.shots.length,0);
});
