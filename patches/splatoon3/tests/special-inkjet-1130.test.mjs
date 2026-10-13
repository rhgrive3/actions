import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

async function harness(){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  f.G.physics.segment=(_from,_to,hit)=>{hit.hit=false;return hit;};
  const actor=f.make();
  actor.weapon={...actor.weapon,special:'inkjet',specialCost:100};
  actor.special=100; actor.alive=true; actor.remote=false; actor._resolve=()=>{};
  f.G.actors=[actor];
  const events=[];f.on('all:special',e=>{if(e.id==='inkjet'&&e.action==='shot')events.push(e);});
  actor._startSpecial();
  return {f,actor,events};
}
test('held ZR fires the jet launcher every 60F, at most seven rounds at base 450F',async()=>{
  const {actor,events}=await harness();
  actor.intent.fire=true;
  for(let frame=1;frame<=445;frame++){
    if(actor.specialActive)actor._updateSpecial(1/60);
    if(frame===1)assert.equal(events.length,1);
    if(frame===60)assert.equal(events.length,1);
    if(frame===61)assert.equal(events.length,2);
  }
  assert.equal(events.length,7);
  assert.equal(actor._s3AllSpecialState?.inkjetShots,7);
});
test('a released jet trigger retains the 60F cooldown and squid-form cannot fire',async()=>{
 const {actor,events}=await harness();
 actor.intent.fire=true;actor._updateSpecial(1/60);
 assert.equal(events.length,1);
 actor.intent.fire=false;for(let i=0;i<10;i++)actor._updateSpecial(1/60);
 actor.intent.fire=true;actor._updateSpecial(1/60);
 assert.equal(events.length,1,'re-press does not bypass cooldown');
 actor.intent.squid=true;for(let i=0;i<70;i++)actor._updateSpecial(1/60);
 assert.equal(events.length,1,'no launcher fire while submerged');
 actor.intent.squid=false;actor._updateSpecial(1/60);
 assert.equal(events.length,2,'ready launcher resumes immediately');
});
