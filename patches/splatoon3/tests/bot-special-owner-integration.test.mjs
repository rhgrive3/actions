import test from 'node:test';
import assert from 'node:assert/strict';
import {makeBotSpecialFixture, STEP} from './bot-special-fixture.mjs';

test('Killer Wail never follows the current position of an enemy that moved out of sight',async()=>{
  const f=await makeBotSpecialFixture(),{a,b,enemy}=f.scenario('killerWail');
  f.tick(a,b,2);
  assert.equal(a.specialActive?.id,'killerWail');
  const oldEnemyPoint=enemy.pos.clone();
  enemy.pos.set(20,0,0);
  const los=f.G.physics.los;
  f.G.physics.los=()=>false;
  for(let frame=0;frame<90;frame++)f.tick(a,b);
  f.G.physics.los=los;
  // Wail can retain its last-seen point briefly; it must not turn toward the
  // enemy's new live coordinates through the blocked visibility query.
  const oldHeading=Math.atan2(oldEnemyPoint.x-a.pos.x,oldEnemyPoint.z-a.pos.z);
  const hiddenHeading=Math.atan2(enemy.pos.x-a.pos.x,enemy.pos.z-a.pos.z);
  const error=(one,two)=>Math.abs(Math.atan2(Math.sin(one-two),Math.cos(one-two)));
  assert.ok(error(a.aimYaw,oldHeading)<.35,'actual aim stays near the last seen direction');
  assert.ok(error(a.aimYaw,hiddenHeading)>.8,'actual aim does not track the hidden live actor');
  assert.equal(a.intent.fire,false,'ordinary fire stays suppressed without a visible enemy');
});

test('a full special meter cannot replace a Rainmaker carrier shot with special preparation',async()=>{
  const f=await makeBotSpecialFixture(),{a,b}=f.scenario('tacticooler');
  a.nid=8;
  const goal={action:'carry',pos:[0,0,20],aim:[0,.85,20]};
  Object.assign(f.G.match,{mode:'rainmaker',ranked:{mode:'rainmaker',stage:{},
    rule:{state:{carrier:'8'},botGoal:()=>goal},frame:{actors:[],inputs:{},blocked:()=>false}}});
  for(let frame=0;frame<10;frame++){
    b.update(STEP);
    assert.equal(a.intent.special,false,'carrier never queues a special');
    assert.equal(a.specialActive,null);
    assert.equal(a.intent.fire,true,'Rainmaker keeps charging its native shot');
    assert.ok(Math.abs(a.aimYaw)<.05,'carrier aim remains on the forward enemy');
  }
  assert.equal(a.special,a.specialCost(),'the AI does not spend the retained meter');
});
