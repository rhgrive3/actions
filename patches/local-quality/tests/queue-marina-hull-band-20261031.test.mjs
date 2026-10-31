import test from 'node:test';
import assert from 'node:assert/strict';
import {hullFactory,specFor,geometrySnapshot} from './queue-marina-hull-band-20261031.fixture.mjs';

test('real hull bands preserve Float64 winding inputs and every published attribute/index byte',()=>{
 const pair=[false,true].map(after=>hullFactory(after,{staging:true}));
 for(const name of ['sailboat','motorYacht','fishingBoat'])for(const L of [5,7.2,9.5,10,14,20]){
  const h=pair.map(x=>x.makeHull(specFor(name,L)));
  const cases=[[-.2,0],[0,.07],[0,.1],[0,.08],['sheer',.17,.13],['sheer',.62,.5],['sheer',.24,.02],['limits'],[1e6,1e6+1],[-0,0],[NaN,NaN]];
  for(const sample of cases)for(const off of [.004,-.004]){
   const trace=[[],[]];
   const geometries=h.map((owner,i)=>{
    let args;
    if(sample[0]==='sheer')args=[t=>{trace[i].push(['low',t]);return owner.top(t)-sample[1];},t=>{trace[i].push(['high',t]);return owner.top(t)-sample[2];}];
    else if(sample[0]==='limits')args=[t=>{trace[i].push(['low',t]);return owner.bot(t)+.001;},t=>{trace[i].push(['high',t]);return owner.top(t);}];
    else args=sample;
    return owner.band(args[0],args[1],off);
   });
   assert.deepEqual(trace[1],trace[0],'Y callbacks retain order and count');
   assert.deepEqual(pair[1].stats.staging.pop(),pair[0].stats.staging.pop(),name+'/'+L+'/'+sample[0]+' double staging');
   assert.deepEqual(geometrySnapshot(geometries[1]),geometrySnapshot(geometries[0]),name+'/'+L+'/'+sample[0]+' published geometry');
   for(const g of geometries)g.dispose();
  }
 }
});

test('height search keeps 24 iterations and removes exactly 48 point evaluations per accepted row',()=>{
 const pair=[false,true].map(after=>hullFactory(after,{instrument:true}));
 for(const name of ['sailboat','motorYacht','fishingBoat']){
  const h=pair.map(x=>x.makeHull(specFor(name,10)));
  const before=pair.map(x=>({...x.stats}));
  h.forEach(x=>x.band(-.2,0).dispose());
  const oldAt=pair[0].stats.at-before[0].at,newAt=pair[1].stats.at-before[1].at;
  const oldY=pair[0].stats.yAt-before[0].yAt,newY=pair[1].stats.yAt-before[1].yAt,rows=newY/2;
  assert(rows>0);assert.equal(oldY,rows*4);assert.equal(newY,rows*2);assert.equal(oldAt,rows*100);assert.equal(newAt,rows*52);
  const saved=pair.map(x=>({...x.stats}));h.forEach(x=>x.band(1e6,1e6+1).dispose());
  pair.forEach((x,i)=>{assert.equal(x.stats.at,saved[i].at);assert.equal(x.stats.yAt,saved[i].yAt);});
 }
});

test('whole hull bodies, decks and public section queries retain their original geometry',()=>{
 const factories=[false,true].map(after=>hullFactory(after));
 for(const name of ['sailboat','motorYacht','fishingBoat'])for(const L of [7.2,14]){
  const spec=specFor(name,L),h=factories.map(f=>f.makeHull(spec));
  h.forEach(x=>assert.equal(x.spec,spec));
  for(const operation of [x=>x.geo(),x=>x.deck(),x=>x.deck(.07,.02)]){
   const gs=h.map(operation);assert.deepEqual(geometrySnapshot(gs[1]),geometrySnapshot(gs[0]));gs.forEach(x=>x.dispose());
  }
  for(const t of [0,.06,.46,.55,.995])for(const s of [0,.5,1])for(const side of [-1,1]){
   assert.deepEqual(h[1].at(t,s,side),h[0].at(t,s,side));assert.equal(h[1].yAt(t,s),h[0].yAt(t,s));
  }
 }
});
