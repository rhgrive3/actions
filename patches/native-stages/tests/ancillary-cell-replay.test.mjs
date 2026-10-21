// #1671: settled ancillary pieces replay only their non-miss cells on later
// drip ticks. Compare every claim with the frozen pre-change composition.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {adaptNativeStages} from '../adapter.mjs';
import {nativePieceHasInterior,nativeAncillaryCanClaim,nativeAncillaryMaskFind,nativeAncillaryMaskStore,nativeAncillaryMaskReplace,nativeSettledAncillarySlot,nativeSettledAncillaryMatches,nativeStoreSettledAncillary} from '../runtime/native-paint.mjs';
const load=source=>import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const oracle=await load(fs.readFileSync(new URL('./fixtures/paint-ownership-native-b77b51d.mjs.txt',import.meta.url),'utf8'));
const current=adaptNativeStages('patches/splatoon3/runtime/paint-ownership.mjs',fs.readFileSync(new URL('../../splatoon3/runtime/paint-ownership.mjs',import.meta.url),'utf8'))
 .replace(/import .*native-paint.*;\n/,[nativePieceHasInterior,nativeAncillaryCanClaim,nativeAncillaryMaskFind,nativeAncillaryMaskStore,nativeAncillaryMaskReplace,nativeSettledAncillarySlot,nativeSettledAncillaryMatches,nativeStoreSettledAncillary].map(f=>f.toString()).join('\n')+'\n');
const subject=await load(current+'\nexport {claimAncillaryCells,ensureOwnershipState};');
const contract={kind:{speck:7},shapes:[[5,0,0,3],[3,0,0,2],[7,0,0,4],[10,0,0,5],[3,0,0,2],[2,0,0,1],[0,0,0,0],[0,0,0,0]],reach:[2.8,3,2.8,2.8,3,2.8,1,1],dripReach:3.9};
const CELLS=48*48;
function paint(mod,native=true){const p={level:{native},grid:new Uint8Array(CELLS*24),dead:new Uint8Array(CELLS*24),counts:[0,0],version:0};mod.ensureOwnershipState(p);for(let i=0;i<p.dead.length;i+=11)p.dead[i]=1;return p;}
// Native charts: many small wall/floor faces sharing planes and directions.
function faces(){return Array.from({length:24},(_,i)=>({atlas:{ppm:i%3?4.096:3.2768},su:12,sv:12,nu:48,nv:48,cu:.25,cv:.25,grid:i*CELLS,wall:i%4!==0,turf:i%4===0}));}
function entries(fs,R,seed){const out=[];fs.forEach((f,i)=>out.push(f,3+(i%5)*.7+seed,6+(i%3)*.9,(i%4)*R*.07,i%2?.6:0,i%2?.8:0,i%2?.35:0));return out;}
function same(a,b,label){assert.deepEqual(b.grid,a.grid,label+' grid');assert.deepEqual(b._paintOwnershipOrder,a._paintOwnershipOrder,label+' order');assert.deepEqual(b.counts,a.counts,label+' counts');assert.equal(b.version,a.version,label+' version');}
function run(native){
 const a=paint(oracle,native),b=paint(subject,native),fs=faces();let calls=0,replayable=0;
 for(const p of [a,b])p._paintOrderRecords.push({local:true,seq:1},{local:true,seq:2},{local:true,seq:3});
 for(const [R,seed,kind] of [[2.5,.31,3],[3.74,.77,3],[5,.05,3],[1.2,.5,2]]){
  const ga={R,seed,kind,team:0,paintOrder:2,entries:entries(fs,R,seed),dripDur:3.3,dur:.27,age:0},gb={...ga,entries:ga.entries.slice()};
  for(let tick=0;tick<200;tick++){
   const age=tick/60,tn=Math.min(3,age/ga.dur),dT=1-Math.pow(1-Math.min(1,age/ga.dripDur),2.2);ga.age=gb.age=age;
   // State the replay must re-read: a newer splat, an older one and a reset.
   if(tick===70)for(const p of [a,b])for(let k=0;k<p.grid.length;k+=5){p.grid[k]=2;p._paintOwnershipOrder[k]=3;}
   if(tick===90)for(const p of [a,b])for(let k=1;k<p.grid.length;k+=9){p.grid[k]=0;p._paintOwnershipOrder[k]=0;}
   if(tick===110)for(const p of [a,b])for(let k=2;k<p.grid.length;k+=13){p.grid[k]=2;p._paintOwnershipOrder[k]=1;}
   // A quality change re-packs the atlas: same face objects, another density.
   if(tick===150)for(const f of fs)f.atlas={ppm:f.atlas.ppm*1.6};
   assert.equal(subject.claimAncillaryCells(b,gb,tn,dT,contract),oracle.claimAncillaryCells(a,ga,tn,dT,contract),'claimed '+R+'@'+tick);
   same(a,b,R+'@'+tick);calls++;
  }
  replayable+=(gb._s3AncillaryCells||[]).flat().filter(c=>c?.cells).length;
  // A pooled record reused with other values must not replay the old cells.
  ga.entries=entries(fs.slice(3),R,seed+.13);gb.entries=ga.entries.slice();ga.team=gb.team=1;ga.paintOrder=gb.paintOrder=3;
  for(const age of [.2,.5,.9,1.4,2.5,3.4]){ga.age=gb.age=age;const tn=Math.min(3,age/ga.dur),dT=1-Math.pow(1-Math.min(1,age/ga.dripDur),2.2);
   assert.equal(subject.claimAncillaryCells(b,gb,tn,dT,contract),oracle.claimAncillaryCells(a,ga,tn,dT,contract));same(a,b,'reuse '+R+'@'+age);}
 }
 return {calls,replayable};
}
test('native drip ticks replay settled pieces with the original claims, counts and order',()=>{
 const r=run(true);assert.equal(r.calls,800);assert.ok(r.replayable>100,'settled pieces were replayed: '+r.replayable);
});
test('legacy levels keep the full per-cell loop and identical claims',()=>{
 assert.deepEqual(run(false),{calls:800,replayable:0});
});
test('replay is limited to settled wall pieces of native drip growth',()=>{
 assert.match(current,/!paint\.level\?\.native \|\| tn < 1\.45 \|\| !face\.wall \|\| !g\.dripDur \|\| piece\.type === 3/);
 assert.doesNotMatch(current,/join\('\/'\)/,'mask cache no longer formats a String key per entry');
});
