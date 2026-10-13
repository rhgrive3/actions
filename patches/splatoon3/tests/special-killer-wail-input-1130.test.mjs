import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

async function setup(){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 f.G.physics.segment=(_a,_b,hit)=>{hit.hit=false;return hit;};
 const actor=f.make('shooter');
 actor.weapon={...actor.weapon,special:'killerWail',specialCost:100};
 actor.special=100;actor.alive=true;actor.remote=false;
 actor._resolve=()=>{};actor.aimDir.set(0,0,1);
 f.G.actors=[actor];
 const events=[];f.on('all:special',e=>{if(e.id==='killerWail')events.push(e);});
 actor._startSpecial();
 return {f,actor,events};
}
function cannonIndices(events){
 return [...new Set(events.filter(e=>e.action==='laser').map(e=>e.index))].sort((a,b)=>a-b);
}
test('MicroLaser produces exactly three pairs of six independent source rays',async()=>{
 const {actor,events}=await setup();
 for(let i=0;i<35;i++)actor._updateSpecial(1/60);
 assert.deepEqual(cannonIndices(events),[],'no beam before the 36F charge');
 actor._updateSpecial(1/60);
 assert.deepEqual(cannonIndices(events),[0,1]);
 for(let i=36;i<72;i++)actor._updateSpecial(1/60);
 assert.deepEqual(cannonIndices(events),[0,1,2,3]);
 for(let i=72;i<108;i++)actor._updateSpecial(1/60);
 assert.deepEqual(cannonIndices(events),[0,1,2,3,4,5]);
 const laser=events.filter(e=>e.action==='laser');
 assert.ok(laser.every(e=>Number.isSafeInteger(e.tick)&&e.tick>=0&&e.pos.every(Number.isFinite)&&e.target.every(Number.isFinite)));
});
test('MicroLaser 40F source player control embargo preserves the live native shooter after release',async()=>{
 const {f,actor}=await setup();
 actor.intent.fire=true;
 for(let i=0;i<39;i++)actor._updateSpecial(1/60);
 assert.equal(f.G.projectiles.list.some(p=>p.owner===actor&&!p.s3AllSpecial),false,
   'AfterShot_NoShotFrm=40 must suppress early native main shots');
 actor._updateSpecial(1/60);
 assert.equal(f.G.projectiles.list.some(p=>p.owner===actor&&!p.s3AllSpecial),true,
   'native main shots resume without waiting for the lasers to disappear');
});
test('MicroLaser respects the sourced 40F squid-form hold while permitting movement',async()=>{
 const {actor}=await setup();
 actor.intent.squid=true;
 for(let i=0;i<39;i++)actor._updateSpecial(1/60);
 assert.equal(actor.form,'kid');
 actor._updateSpecial(1/60);
 assert.equal(actor.form,'squid');
});
