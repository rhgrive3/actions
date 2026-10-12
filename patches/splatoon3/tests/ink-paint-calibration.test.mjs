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
 const mask=paint.growing[0];
 const expected=directFloorFootprint(radius,stretch);
 assert.ok(Math.abs(mask.R-expected.radius)<1e-8,'real production radius is lateral-constrained');
 assert.ok(Math.abs(mask.entries[6]-expected.stretchAmt)<1e-8,'shader/CPU receive the same stretch');
 const firstCredit=a.stats.turf;
 paint.splat(at,radius,a.team,{kind:'shot',face:0,seed:.37,stretch:dir,stretchAmt:stretch,claimOwner:a});
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
 paint.splat(V(0,.005,5),2,0,{kind:'shot',face:0,seed:.19,claimOwner:owner,claimMode:'no-special'});
 for(let i=0;i<210;i++)paint.advanceSimulation(1/60);
 assert.ok(paint.counts[0]>0);
 assert.ok(Math.abs(owner.stats.turf-inkPaintPoints(paint.counts[0]*face.cu*face.cv))<1e-7);
 assert.equal(owner.special,0);
});
