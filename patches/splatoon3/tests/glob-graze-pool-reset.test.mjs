import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,ROOT} from '../../../scripts/weapons-fixture.mjs';
import {reset,launch,finish,paintMetrics} from '../../../scripts/measure-weapons-fidelity.mjs';
test('recycled Slosher graze state cannot suppress a new volley',async()=>{
const f=await fixture({site:ROOT+'.pool-probe',fidelity:true});
const slosh={id:'slosher'},rh={id:'roller'},rv={id:'roller',vertical:true};
// The NearestParam stencil deliberately changes its left/right outline with
// an advancing volley sequence. Normalize only that single source-controlled
// seed while testing pool reuse. Every projectile birth, physics step, later
// paint receipt, scoring cell, RNG draw count and owner remains compared exactly.
const rawSplat=f.G.paint.splat;
let pinNearest=false;
f.G.paint.splat=function(center,radius,team,opts={}){
 if(pinNearest && opts.kind==='source-splash' && opts.footprint==='ink-slosh'){
   pinNearest=false;
   return rawSplat.call(this,center,radius,team,{...opts,seed:.375});
 }
 return rawSplat.call(this,center,radius,team,opts);
};
function run(c,{fresh=false,team=0}={}){const a=reset(f,c,null,2.2);a.team=team;pinNearest=c.id==='slosher';if(fresh)f.projectiles.pool.length=0;launch(f,a,c);assert.ok(f.projectiles.list.every(p=>p.owner===a&&p.team===team),'new owner/team on every glob');const births=f.projectiles.list.map(p=>({team:p.team,seed:p.seed,pos:p.pos.toArray(),vel:p.vel.toArray(),index:p.fidelitySloshIndex,unit:p.fidelitySloshPacketIndex}));const trace=[];finish(f,a,90,trace);if(c.id==='slosher')assert.equal(pinNearest,false,'real nearest stencil must fire');return {births,trace,paintCalls:structuredClone(f.paints),paint:paintMetrics(f),impacts:structuredClone(f.impacts),draws:f.draws()};}
const alone=run(slosh,{fresh:true});run(rh);run(rv);const reused=run(slosh);const fresh=run(slosh,{fresh:true});const recycledOnce=run(slosh);
const recycledTwice=run(slosh);const recycledThrice=run(slosh);const freshAgain=run(slosh,{fresh:true});
const result={alone,reused,fresh,recycledOnce,recycledTwice,recycledThrice,freshAgain};
for(const [name,row]of Object.entries(result)){
 assert.deepEqual(row.births,alone.births,name+' native births');
 assert.equal(row.paintCalls[0].time,0);
 const withoutNearestSeed=({seed,...rest})=>rest;
 assert.deepEqual(withoutNearestSeed(row.paintCalls[0]),withoutNearestSeed(alone.paintCalls[0]),name+' nearest paint except native volley seed');
 assert.deepEqual(row.trace,alone.trace,name+' native flight');
 assert.deepEqual(row.impacts,alone.impacts,name+' native impacts');
 assert.equal(row.draws,alone.draws,name+' RNG draws');
 assert.deepEqual(row.paint,alone.paint,name+' scoring/splash metrics');
 assert.deepEqual(row.paintCalls.slice(1),alone.paintCalls.slice(1),name+' all post-nearest paint receipts');
}
// A second owner/team at the same place must receive its own first graze.
const dirtyTeam1=run(slosh,{team:1});const freshTeam1=run(slosh,{team:1,fresh:true});
assert.ok(dirtyTeam1.paintCalls.length>1);assert.ok(dirtyTeam1.paintCalls.every(p=>p.team===1));
for(const key of ['births','trace','impacts','draws','paint'])assert.deepEqual(dirtyTeam1[key],freshTeam1[key],'new owner/team '+key);
assert.deepEqual(dirtyTeam1.paintCalls.slice(1),freshTeam1.paintCalls.slice(1),'new owner/team all graze receipts');
const recycled=f.projectiles._new();recycled.s3GrazeCount=9;recycled.s3GrazePaint={at:new f.THREE.Vector3(1,2,3),face:8};f.projectiles.pool.push(recycled);const next=f.projectiles._new();assert.equal(next,recycled);assert.equal(next.s3GrazeCount,0);assert.equal(next.s3GrazePaint,null);
console.log('POOL_REGRESSION '+JSON.stringify({volleys:9,births:alone.births.length,paintCalls:alone.paintCalls.length,draws:alone.draws}));
});
