import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {adaptIssue479} from '../issue-479-adapter.mjs';

test('#527 current freefall owner preserves natural-fall horizontal and accepted-jump vertical squid startup',async()=>{
 for(const jumped of [false,true]){
  const f=await fixture({adaptRuntime:adaptIssue479});
  const a=f.make('roller'); a._surface=()=>{};a._horizontal=()=>{};a._updateClimb=()=>{};
  a.form='squid';a.intent.squid=true;a._prevIntent.squid=true;a._squidPressT=-1;
  if(jumped){a.intent.jump=true;f.tick(a);a.intent.jump=false;assert.equal(a.grounded,false);assert.equal(a.s3JumpAirborne,true,'native jump admission owns the launch');}
  else a.grounded=false;
  a._vertical=()=>{};
  let tick=0;const births=[];f.G.projectiles.fireFlick=()=>births.push(tick);
  for(;tick<60;tick++){a.intent.fire=tick===0;f.tick(a);if(tick===13){assert.equal(a.weaponRunner.s3RollerAttack.vertical,jumped);assert.equal(a.weaponRunner.s3RollerAttack.elapsed,0);}}
  assert.deepEqual(births,[jumped?44:34]);
 }
});
