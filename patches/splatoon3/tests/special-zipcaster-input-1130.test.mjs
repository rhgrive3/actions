import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

async function setup() {
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 f.G.physics.raycast=(o,d,length,h)=>{h.hit=d.z>0;h.dist=Math.min(8,length);h.point.copy(o).addScaledVector(d,h.dist);return h;};
 const actor=f.make('shooter');
 actor.weapon={...actor.weapon,special:'zipcaster',specialCost:100};
 actor.special=100;actor.alive=true;actor.remote=false;actor._resolve=()=>{};
 actor.aimDir.set(0,0,1);actor.aimPoint=new f.THREE.Vector3(0,1,8);
 f.G.actors=[actor];actor._startSpecial();
 const inputs=[],native=actor.weaponRunner.update;
 actor.weaponRunner.update=function(dt,input){inputs.push({...input});return native.call(this,dt,input);};
 return {f,actor,state:actor._s3AllSpecialState,inputs};
}
test('Zipcaster hook flight, pull and 12F landing wait block native shooting',async()=>{
 const {actor,state,inputs}=await setup();
 actor.intent.sub=true;actor._updateSpecial(1/60);
 assert.equal(state.phase,'hookFlight');
 actor.intent.sub=false;actor.intent.fire=true;
 const visited=new Set();
 let steps=0;
 while(state.phase!=='ready'&&steps++<130){
   actor._updateSpecial(1/60);
   visited.add(state.phase);
   if(state.phase!=='ready'){
     const latest=inputs.at(-1);
     assert.equal(latest?.fire,false,`native main fired while ${state.phase}`);
     assert.equal(latest?.firePressed,false,`main pressed while ${state.phase}`);
   }
 }
 assert.equal(state.phase,'ready','real 12F post-hook wait eventually completes');
 assert.ok(visited.has('zip')&&visited.has('hookWait'),'flight and recovery phases exercised');
 actor._updateSpecial(1/60);
 assert.equal(inputs.at(-1)?.fire,true,'ready phase restores main shooting');
 assert.equal(inputs.at(-1)?.sub,false,'Zipcaster hook never becomes ordinary sub');
});
