import test from 'node:test';
import assert from 'node:assert/strict';
import {directFloorFootprint,inkPaintPoints,INKWAVE_WORLD_SQUARES_PER_TURF_POINT}
  from '../runtime/ink-paint-calibration.mjs';
import {fixture} from './source-fixture.mjs';
import {makePaintWorld} from './paint-authority-fixture.mjs';

test('direct floor impact reduces cross-width but preserves both longitudinal endpoints',()=>{
 const reusable={},baseline=2.1;
 for(const stretch of [0,.001,.2,.7,1.24,1.8,3,5]){
  const v=directFloorFootprint(baseline,stretch,reusable);
  assert.equal(v,reusable);
  const front=v.centreShift+v.radius*(1+v.stretchAmt);
  const rear=-v.centreShift+v.radius*(1+.25*v.stretchAmt);
  assert.ok(Math.abs(front-baseline*(1+stretch))<1e-12);
  assert.ok(Math.abs(rear-baseline*(1+.25*stretch))<1e-12);
  assert.ok(v.radius<=baseline && v.lateral<=1);
  assert.ok(v.stretchAmt>=stretch);
  if(stretch>0)assert.ok(v.radius<baseline);
 }
});

test('one world-square is not one S3 Turf or special gauge point',()=>{
 assert.equal(inkPaintPoints(0),0);
 assert.equal(inkPaintPoints(-3),0);
 assert.equal(inkPaintPoints(NaN),0);
 assert.ok(Math.abs(inkPaintPoints(INKWAVE_WORLD_SQUARES_PER_TURF_POINT)-1)<1e-12);
 assert.ok(INKWAVE_WORLD_SQUARES_PER_TURF_POINT>3 && INKWAVE_WORLD_SQUARES_PER_TURF_POINT<3.4);
});

test('native composed Actor and PaintSystem credit physically owned ink in point units, exactly once',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 const {paint,face,V}=makePaintWorld(f);
 const a=f.make('shooter');f.G.actors=[a];
 const at=V(0,.005,5),dir=V(0,0,1),radius=1.93,stretch=1.24;
 const before=paint.splat(at,radius,a.team,{kind:'shot',face:0,seed:.37,stretch:dir,stretchAmt:stretch,claimOwner:a});
 assert.ok(before>0 && paint.growing.length===1);
 // Native paint callers own initial body credit; claimOwner retains later growth.
 a.addTurf(before);
 const mask=paint.growing[0];
 const expected=directFloorFootprint(radius,stretch);
 assert.ok(Math.abs(mask.R-expected.radius)<1e-8,'real production radius is lateral-constrained');
 assert.ok(Math.abs(mask.entries[6]-expected.stretchAmt)<1e-8,'shader/CPU receive the same stretch');
 const firstCredit=a.stats.turf;
 a.addTurf(paint.splat(at,radius,a.team,{kind:'shot',face:0,seed:.37,stretch:dir,stretchAmt:stretch,claimOwner:a}));
 assert.equal(a.stats.turf,firstCredit,'overlapping same-team body never double scores');
 for(let i=0;i<210;i++)paint.advanceSimulation(1/60);
 const squares=paint.counts[0]*face.cu*face.cv;
 assert.ok(Math.abs(a.stats.turf-inkPaintPoints(squares))<1e-7,
  'all late rays and body cells use physical-to-turf conversion once');
 assert.ok(Math.abs(a.special-a.stats.turf)<1e-7,'special gauge consumes native points not world squares');
 assert.ok(a.stats.turf<squares*.34,'regression: world squares must not be falsely treated as points');
 const total=a.stats.turf;
 for(let i=0;i<60;i++)paint.advanceSimulation(1/60);
 assert.equal(a.stats.turf,total,'drained paint cannot earn repeated points');
});

test('no-special owner still scores physical points without recharging special',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 const {paint,face,V}=makePaintWorld(f),owner=f.make('shooter');f.G.actors=[owner];
 owner.addTurfNoSpecial(paint.splat(V(0,.005,5),2,0,{kind:'shot',face:0,seed:.19,claimOwner:owner,claimMode:'no-special'}));
 for(let i=0;i<210;i++)paint.advanceSimulation(1/60);
 assert.ok(paint.counts[0]>0);
 assert.ok(Math.abs(owner.stats.turf-inkPaintPoints(paint.counts[0]*face.cu*face.cv))<1e-7);
 assert.equal(owner.special,0);
});

test('physical Turf points respect active Storm and Tidal Slam gauge locks', async () => {
  const f = await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  const a = f.make('shooter'), area = INKWAVE_WORLD_SQUARES_PER_TURF_POINT;
  a.special = 0;
  a.specialActive = null;
  a.stormGaugeLock = 1;
  a.addTurf(area);
  assert.ok(Math.abs(a.stats.turf - 1) < 1e-12, 'Storm-locked paint still counts Turf points');
  assert.equal(a.special, 0, 'Storm lock blocks gauge charge');
  a.stormGaugeLock = 0;
  a.s3TidalSlamGaugeFinish = { pending: true };
  a.addTurf(area);
  assert.ok(Math.abs(a.stats.turf - 2) < 1e-12, 'Tidal Slam pending finish still counts Turf points');
  assert.equal(a.special, 0, 'Tidal Slam pending finish blocks gauge charge');
  a.s3TidalSlamGaugeFinish = null;
  a.addTurf(area);
  assert.ok(Math.abs(a.stats.turf - 3) < 1e-12, 'ordinary Turf remains measured in points');
  assert.ok(Math.abs(a.special - 1) < 1e-12, 'ordinary gauge charges exactly once in points');
});


test('native projectile and installed Slam callers credit initial body area exactly once', async () => {
 for(const kind of ['shot','slam']) {
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  const {paint,face,V}=makePaintWorld(f), a=f.make('shooter');
  f.G.actors=[a];f.G.settings={};f.setRandom(()=>.37);a.pos.set(0,0,8);
  const calls=[], splats=[], nativeSplat=paint.splat;
  for(const method of ['addTurf','addTurfNoSpecial']) {
   const native=a[method];a[method]=function(area){calls.push({method,area});return native.call(this,area);};
  }
  paint.splat=function(...args){const area=nativeSplat.apply(this,args);splats.push(area);return area;};
  if(kind==='shot') f.G.projectiles.inkFlight.paint({owner:a,team:a.team,seed:.37},
   {face:0,point:V(0,0,5),normal:V(0,1,0)}, {radius:1.93,stretch:1.24},V(0,0,1),'shot');
  else a._slamImpact(f.SPECIALS.slam);
  assert.equal(splats.length,kind==='shot'?1:10,'real native paint caller was exercised');
  assert.equal(calls.length,1,'body credit belongs to one caller, not the paint owner wrapper');
  assert.equal(calls[0].method,kind==='shot'?'addTurf':'addTurfNoSpecial');
  const area=splats.reduce((sum,value)=>sum+value,0);assert.ok(area>0);
  assert.equal(calls[0].area,area,'Slam aggregates every native ring splat before credit');
  assert.ok(Math.abs(a.stats.turf-inkPaintPoints(area))<1e-7);
  for(let i=0;i<210;i++)paint.advanceSimulation(1/60);
  assert.ok(Math.abs(a.stats.turf-inkPaintPoints(paint.counts[0]*face.cu*face.cv))<1e-7);
  if(kind==='slam')assert.equal(a.special,0);
  else assert.ok(Math.abs(a.special-a.stats.turf)<1e-7);
 }
});

test('missing or double initial body credit cannot satisfy the final owned-area ledger', async () => {
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 for(const mode of ['normal','no-special'])for(const credits of [0,1,2]) {
  const {paint,face,V}=makePaintWorld(f), owner=f.make('shooter');f.G.actors=[owner];
  const area=paint.splat(V(0,.005,5),1.93,0,{kind:'shot',face:0,seed:.37,
   stretch:V(0,0,1),stretchAmt:1.24,claimOwner:owner,claimMode:mode});
  assert.ok(area>0);
  for(let i=0;i<credits;i++)owner[mode==='normal'?'addTurf':'addTurfNoSpecial'](area);
  for(let i=0;i<210;i++)paint.advanceSimulation(1/60);
  const expected=inkPaintPoints(paint.counts[0]*face.cu*face.cv);
  const error=owner.stats.turf-expected;
  assert.ok(Math.abs(error-(credits-1)*inkPaintPoints(area))<1e-7);
  assert.equal(Math.abs(error)<1e-7,credits===1,'only exactly one body credit matches owned cells');
  if(mode==='no-special')assert.equal(owner.special,0);
 }
});
