import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

const EXTRA="export {killerWailLockOnEligible} from './patches/splatoon3/runtime/all-specials.mjs';";
function equip(a) {
  a.weapon={...a.weapon,special:'killerWail',specialCost:100};
  a.special=100;a.alive=true;a.remote=false;a._resolve=()=>{};
  a.intent.fire=false;a.intent.sub=false;a.intent.jump=false;
  a._prevIntent||={};Object.assign(a._prevIntent,{fire:false,sub:false,jump:false});
}
async function world() {
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:EXTRA});
  f.G.physics.segment=(_a,_b,hit)=>{hit.hit=false;return hit;};
  return f;
}
test('11.3.0 MicroLaser supports the source 160-degree frontal lock cone (±80°)',async()=>{
  const f=await world(),admit=f.killerWailLockOnEligible;
  assert.equal(admit(1),true);
  assert.equal(admit(Math.cos(60*Math.PI/180)),true,'60° target should lock');
  assert.equal(admit(Math.cos(80*Math.PI/180)),true,'source 80° edge');
  assert.equal(admit(Math.cos(81*Math.PI/180)),false,'outside source cone');
  assert.equal(admit(-1),false,'behind');
  assert.equal(admit(NaN),false);
});
test('actual Killer Wail chooses a target 60 degrees off-axis, not the 20-degree generic cone',async()=>{
  const f=await world(),owner=f.make(),victim=f.make();
  equip(owner);owner.aimYaw=0;owner.aimDir.set(0,0,1);
  owner.aimPoint.set(0,1,30);
  victim.team=1;victim.pos.set(Math.sqrt(3)*5,0,5);
  f.G.actors=[owner,victim];
  const events=[];f.on('all:special',e=>{if(e.id==='killerWail'&&e.action==='target')events.push(e);});
  owner._startSpecial();
  for(let i=0;i<42&&events.length===0;i++)owner._updateSpecial(1/60);
  assert.ok(events.length>0,'real runtime acquired a target');
  const first=events[0];
  assert.ok(Math.abs(first.target[0]-victim.pos.x)<1e-8,'locked actual off-axis opponent');
  assert.ok(Math.abs(first.target[2]-victim.pos.z)<1e-8);
});
