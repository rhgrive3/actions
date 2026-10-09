import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

test('#527 a fresh held or tapped ZR after manual resurfacing survives only the remaining admission interval',async()=>{
 for(const age of [1,7,12])for(const tap of [false,true]){
  const f=await fixture(),a=f.make('roller');
  a._surface=()=>{};a._horizontal=()=>{};a._vertical=()=>{};a._updateClimb=()=>{};
  a.form='squid';a.intent.squid=true;a._prevIntent.squid=true;a._squidPressT=-1;
  a.intent.squid=false;f.tick(a,age);assert.equal(a.form,'kid');
  let tick=0,admitted=-1;const shots=[];f.G.projectiles.fireFlick=()=>shots.push(tick);
  for(;tick<60;tick++){
   a.intent.fire=tap?tick===0:tick<40;f.tick(a);
   if(admitted<0&&a.weaponRunner.s3RollerAttack){admitted=tick;assert.ok(a.kidT+1e-10>=a.weapon.squidFlickDelay);}
  }
  assert.ok(admitted>=0,`fresh ZR must be admitted after resurfacing age${age}, tap${tap}`);
  assert.deepEqual(shots,[admitted+21]);
 }
});
