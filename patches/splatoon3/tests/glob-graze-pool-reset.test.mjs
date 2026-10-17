import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,ROOT} from '../../../scripts/weapons-fixture.mjs';
import {reset,launch,finish,paintMetrics} from '../../../scripts/measure-weapons-fidelity.mjs';
test('recycled Slosher graze state cannot suppress a new volley',async()=>{
const f=await fixture({site:ROOT+'.pool-probe',fidelity:true});
const slosh={id:'slosher'},rh={id:'roller'},rv={id:'roller',vertical:true};
function run(c,{fresh=false,team=0}={}){const a=reset(f,c,null,2.2);a.team=team;if(fresh)f.projectiles.pool.length=0;launch(f,a,c);assert.ok(f.projectiles.list.every(p=>p.owner===a&&p.team===team),'new owner/team on every glob');const births=f.projectiles.list.map(p=>({team:p.team,seed:p.seed,pos:p.pos.toArray(),vel:p.vel.toArray(),index:p.fidelitySloshIndex,unit:p.fidelitySloshPacketIndex}));const trace=[];finish(f,a,90,trace);return {births,trace,paintCalls:structuredClone(f.paints),paint:paintMetrics(f),impacts:structuredClone(f.impacts),draws:f.draws()};}
const alone=run(slosh,{fresh:true});run(rh);run(rv);const reused=run(slosh);const fresh=run(slosh,{fresh:true});const recycledOnce=run(slosh);
const recycledTwice=run(slosh);const recycledThrice=run(slosh);const freshAgain=run(slosh,{fresh:true});
const result={alone,reused,fresh,recycledOnce,recycledTwice,recycledThrice,freshAgain};
// The first native nearest splat owns an independent seed. Pool allocation
// may advance the RNG before this seed without changing the admitted globs,
// graze events, owners or flight. A silhouette samples that seed at the edge:
// permit *only* cell differences inside the seed-varying nearest footprint.
function compareScoring(row, baseline, label) {
  if (row.paintCalls[0].seed === baseline.paintCalls[0].seed) {
    assert.deepEqual(row.paint,baseline.paint,label+' identical seed gives identical scoring');
    return;
  }
  assert.equal(row.paint.cell,baseline.paint.cell,label+' identical scoring resolution');
  const first=baseline.paintCalls[0], center=first.center;
  const maxRadius=first.radius * (1+Math.max(0,Math.abs(first.stretchAmt||0))) * 1.42 + baseline.paint.cell;
  const onlyA=new Set(row.paint.cellsXZ.map(p=>p.join(','))), onlyB=new Set(baseline.paint.cellsXZ.map(p=>p.join(',')));
  const delta=[...onlyA].filter(x=>!onlyB.has(x)).concat([...onlyB].filter(x=>!onlyA.has(x)));
  for (const cell of delta) {
    const [x,z]=cell.split(',').map(Number);
    assert.ok(Math.hypot(x-center[0],z-center[2]) <= maxRadius+1e-8,
      label+' has changed scoring outside the seed-varying nearest silhouette at '+cell);
  }
  for (const paint of [row.paint,baseline.paint]) {
    assert.equal(paint.cells,paint.cellsXZ.length,label+' scoring cell ledger stays complete');
    assert.equal(paint.area,paint.cells*paint.cell*paint.cell,label+' scoring area matches the grid');
  }
}
for(const [name,row]of Object.entries(result)){
 assert.deepEqual(row.births,alone.births,name+' native births');
 assert.equal(row.paintCalls[0].time,0);
 const withoutNearestSeed=({seed,...rest})=>rest;
 assert.deepEqual(withoutNearestSeed(row.paintCalls[0]),withoutNearestSeed(alone.paintCalls[0]),name+' nearest paint except native volley seed');
 assert.deepEqual(row.trace,alone.trace,name+' native flight');
 assert.deepEqual(row.impacts,alone.impacts,name+' native impacts');
 assert.equal(row.draws,alone.draws,name+' RNG draws');
 compareScoring(row,alone,name);
 assert.deepEqual(row.paintCalls.slice(1),alone.paintCalls.slice(1),name+' all post-nearest paint receipts');
}
// A second owner/team at the same place must receive its own first graze.
const dirtyTeam1=run(slosh,{team:1});const freshTeam1=run(slosh,{team:1,fresh:true});
assert.ok(dirtyTeam1.paintCalls.length>1);assert.ok(dirtyTeam1.paintCalls.every(p=>p.team===1));
for(const key of ['births','trace','impacts','draws'])assert.deepEqual(dirtyTeam1[key],freshTeam1[key],'new owner/team '+key);
compareScoring(dirtyTeam1,freshTeam1,'new owner/team');
assert.deepEqual(dirtyTeam1.paintCalls.slice(1),freshTeam1.paintCalls.slice(1),'new owner/team all graze receipts');
const recycled=f.projectiles._new();recycled.s3GrazeCount=9;recycled.s3GrazePaint={at:new f.THREE.Vector3(1,2,3),face:8};f.projectiles.pool.push(recycled);const next=f.projectiles._new();assert.equal(next,recycled);assert.equal(next.s3GrazeCount,0);assert.equal(next.s3GrazePaint,null);
console.log('POOL_REGRESSION '+JSON.stringify({volleys:9,births:alone.births.length,paintCalls:alone.paintCalls.length,draws:alone.draws}));
});
