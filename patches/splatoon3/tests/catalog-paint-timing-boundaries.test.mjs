import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {makePaintWorld} from './paint-authority-fixture.mjs';

async function setup(id='s3-stringer-short',{wall=false}={}){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
  extraExports:"export {spawnSplashDrop,advanceSplashDrops} from './patches/splatoon3/runtime/blaster-flight-paint.mjs';"});
 const {paint}=makePaintWorld(f,{wall});f.G.settings={};f.setRandom(()=>.37);
 const a=f.make(id);a.form='kid';a.pos.set(0,8,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,9.05,100);
 a.character.getMuzzle=out=>out.copy(a.pos).add(new f.THREE.Vector3(0,1.05,.3));
 const stamps=[],raw=paint.splat;paint.splat=function(at,r,team,opts={}){stamps.push({at:at.clone(),r,opts:{...opts}});return raw.call(this,at,r,team,opts);};
 return {f,a,paint,stamps};
}
function fire(a,frames=1){for(let i=0;i<frames;i++)a.weaponRunner.update(1/60,{fire:true,firePressed:i===0});for(let i=0;i<50;i++)a.weaponRunner.update(1/60,{fire:false});}
const round=x=>+x.toFixed(8);
function dropsSnapshot(system){return Array.from(system._s3SplashDrops||[],d=>[round(d.releaseX),round(d.releaseZ),d.radius,d.seed,d.frames,...d.pos.toArray().map(round)]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));}
function snapshot(x){
 const queue=dropsSnapshot(x.f.G.projectiles);
 assert.deepEqual(x.drawnDrops,queue,'the visible stream observes the caught-up positions before draw');
 return {queue,landed:x.stamps.length,grid:Array.from(x.paint.grid),turf:x.a.stats.turf};
}
for(const id of ['s3-stringer-short','s3-saber-lite','s3-shelter-normal','s3-shelter-wide','s3-shelter-compact','s3-shelter-focus'])test(id+' matches airborne position, landing time and intermediate ownership at equal 30/60/120Hz times',async()=>{
 const traces=[];
 for(const hz of [30,60,120]){
  const x=await setup(id);fire(x.a);const trace=[];
  const draw=x.f.G.projectiles._draw;x.f.G.projectiles._draw=function(...args){x.drawnDrops=dropsSnapshot(this);return draw.apply(this,args);};
  for(let n=0;n<30;n++){
   for(let i=0;i<hz/30;i++){x.f.G.time+=1/hz;x.f.G.projectiles.update(1/hz);x.paint.advanceSimulation(1/hz);}
   trace.push(snapshot(x));
  }
  traces.push(trace);
 }
 // Equality before every projectile has landed catches a full-render-frame
 // delay that final grid comparisons alone cannot observe.
 for(let i=0;i<traces[0].length;i++){
  assert.deepEqual(traces[0][i],traces[1][i],`${id} 30/60Hz at ${(i+1)/30}s`);
  assert.deepEqual(traces[1][i],traces[2][i],`${id} 60/120Hz at ${(i+1)/30}s`);
 }
});

test('more than 512 admitted falling drops retain every authoritative landing',async()=>{
 const x=await setup(),{f,a}=x;
 const spec={gravity:.016*3600,drag:.02,surfaceOnly:true,randomVelocity:null,depthScaleMax:1,depthScaleMin:1,dropHeightMax:0,dropHeightMin:0};
 for(let i=0;i<600;i++)f.spawnSplashDrop(f.G,{owner:a,team:0,seed:i/600,from:new f.THREE.Vector3(i%50-25,8,Math.floor(i/50)*2+5),radius:.3,spec});
 assert.equal(f.G.projectiles._s3SplashDrops.length,600,'the rendering capacity cannot erase queued paint');
 for(let n=0;n<240;n++)f.advanceSplashDrops(f.G.projectiles,1/60,f.G);
 assert.equal(f.G.projectiles._s3SplashDrops.length,0);assert.equal(x.stamps.length,600,'all admitted masks eventually land');
 for(let n=0;n<120;n++)x.paint.advanceSimulation(1/60);
 assert.equal(a.stats.turf,x.paint.counts[0]*.0625);
});

test('landing and remote retirement preserve queue identity and the order of surviving drops',async()=>{
 const x=await setup(),{f,a}=x,spec={gravity:57.6,drag:0,surfaceOnly:true,randomVelocity:null};
 const drops=Array.from({length:5},(_,i)=>f.spawnSplashDrop(f.G,{owner:a,team:0,seed:i/10,from:new f.THREE.Vector3(i,i%2?8:.005,5),radius:.3,spec}));
 const queue=f.G.projectiles._s3SplashDrops;
 f.advanceSplashDrops(f.G.projectiles,1/60,f.G);
 assert.equal(f.G.projectiles._s3SplashDrops,queue);assert.deepEqual(Array.from(queue),[drops[1],drops[3]]);
 const remote={...a,remote:true};drops[1].owner=remote;f.advanceSplashDrops(f.G.projectiles,1/60,f.G);
 assert.deepEqual(Array.from(queue),[drops[3]]);
});

test('a charged arrow stuck high on a wall paints its offset detonation there exactly once',async()=>{
 const x=await setup('s3-stringer-normal',{wall:true});fire(x.a,72);
 const rounds=x.f.G.projectiles.list.filter(p=>p.catalog);assert.equal(rounds.length,3);
 for(let i=0;i<15&&!rounds.every(p=>p.catalog.stuck);i++)x.f.G.projectiles.update(1/60);
 assert.ok(rounds.every(p=>p.catalog.stuck));const stuck=rounds.map(p=>p.pos.clone());
 const initial=x.stamps.length;assert.ok(initial>=3);
 for(let i=0;i<70;i++)x.f.G.projectiles.update(1/60);
 const blasts=x.stamps.slice(initial).filter(s=>s.r===2&&s.opts.kind==='source-shot');
 assert.equal(blasts.length,3,'wall detonations are not discarded by an unrelated downward probe');
 for(const at of stuck)assert.ok(blasts.some(b=>b.at.distanceTo(at.clone().add(new x.f.THREE.Vector3(0,.6,0)))<1e-8));
 assert.equal(x.a.stats.turf,0,'a wall more than two units above the floor cannot award floor turf');
 assert.equal(x.paint.counts[0],0);
});

for(const id of ['s3-saber-lite','s3-saber-heavy'])test(id+' does not fall through the generic Shooter foot-paint branch on the eighth airborne swing',async()=>{
 const x=await setup(id);x.a.pos.y=2;x.a.grounded=false;x.a.aimPoint.y=3.05;
 for(let i=0;i<8;i++)fire(x.a);
 assert.equal(x.f.G.projectiles.list.filter(p=>p.catalog).length,8,'eight funded waves emitted');
 assert.equal(x.stamps.length,0,'the lower floor is painted only after actual drop contact');
});

for(const ending of ['chain','sub'])test('catalog Dualies preserve the last stroke endpoint before '+ending,async()=>{
 const x=await setup('s3-maneuver-short'),a=x.a;a.pos.set(0,0,0);a.intent.fire=true;
 a.weaponRunner.update(1/60,{fire:false});assert.equal(a.weaponRunner.tryDodge(new x.f.THREE.Vector3(0,0,1)),true);
 const p=a.weapon.catalogRecord.parameters.SideStepParam;
 for(let i=0;i<p.MoveFrame;i++){a.pos.z+=p.MoveDist/p.MoveFrame;a.weaponRunner.update(1/60,{fire:false});}
 assert.equal(a.weaponRunner.catalogState.roll,null);
 assert.ok(!x.stamps.some(s=>s.opts.kind==='roll'&&Math.abs(s.at.z-p.MoveDist)<1e-8),'endpoint lies between regular distance samples');
 if(ending==='chain')assert.equal(a.weaponRunner.tryDodge(new x.f.THREE.Vector3(1,0,0)),true);
 else a.weaponRunner.update(1/60,{fire:false,sub:true});
 assert.ok(x.stamps.some(s=>s.opts.kind==='roll'&&Math.abs(s.at.z-p.MoveDist)<1e-8),'last grounded endpoint retained');
});

for(const id of ['s3-shelter-focus','s3-shelter-compact'])test(id+' held canopy uses its explicit foot wait/span and requires close grounded floor',async()=>{
 for(const state of ['floor','air','high']){
  const x=await setup(id),a=x.a;a.pos.set(0,state==='high'?2:0,0);a.grounded=state!=='air';
  let frame=0;x.f.G.time=0;
  const p=a.weapon.catalogRecord.parameters.spl__BulletShelterCanopyParam;
  const stamps=[],splat=x.paint.splat;x.paint.splat=function(at,r,t,o){stamps.push({frame,at:at.clone(),r});return splat.call(this,at,r,t,o);};
  let opened=null;
  for(frame=0;frame<47;frame++){
   a.weaponRunner.update(1/60,{fire:true,firePressed:frame===0});
   if(opened===null&&a.weaponRunner.catalogState.canopy?.open)opened=frame;
  }
  assert.notEqual(opened,null);
  const foot=stamps.filter(s=>s.r===p.FootSplashPaintRadius);
  if(state!=='floor')assert.equal(foot.length,0,state+' does not project onto a lower floor');
  else{
   assert.ok(foot.length>0,'explicit source foot mask is connected');
   assert.equal(foot[0].frame-opened,p.FootSplashWaitFrame);
   if(p.FootSplashSpanFrame===0)assert.equal(foot.length,1,'zero span is bounded to one attempt per opening');
   else for(let i=1;i<foot.length;i++)assert.equal(foot[i].frame-foot[i-1].frame,p.FootSplashSpanFrame);
  }
 }
});

test('opposing splash landings are applied by reference collision time within a low-rate frame',async()=>{
 const grids=[];
 for(const hz of [30,60,120]){
  const x=await setup(),f=x.f,a=x.a,b=f.make('shooter');b.team=1;
  const spec={gravity:57.6,drag:0,surfaceOnly:true,randomVelocity:null,depthScaleMax:1,depthScaleMin:1,dropHeightMax:0,dropHeightMin:0};
  // Queue order is deliberately the reverse of landing order. The blue drop
  // reaches the floor on tick 1; orange reaches it later on tick 2.
  f.spawnSplashDrop(f.G,{owner:a,team:0,seed:.37,from:new f.THREE.Vector3(0,.03,5),radius:1,spec});
  f.spawnSplashDrop(f.G,{owner:b,team:1,seed:.37,from:new f.THREE.Vector3(0,.015,5),radius:1,spec});
  for(let i=0;i<hz/30;i++)f.advanceSplashDrops(f.G.projectiles,1/hz,f.G);
  const order=x.stamps.map(s=>s.opts.claimOwner.team);assert.deepEqual(order,[1,0],hz+' applies older collision first');
  for(let i=0;i<120;i++)x.paint.advanceSimulation(1/60);
  grids.push(Array.from(x.paint.grid));assert.ok(x.paint.counts[0]>0);assert.equal(x.paint.counts[1],0);
  assert.equal(a.stats.turf,x.paint.counts[0]*.0625);
  // Turf stats credit the area each actor actually painted over time; blue's
  // legitimate earlier paint credit remains after orange takes ownership.
  assert.equal(b.stats.turf,a.stats.turf);
 }
 assert.deepEqual(grids[0],grids[1]);assert.deepEqual(grids[1],grids[2]);
});
