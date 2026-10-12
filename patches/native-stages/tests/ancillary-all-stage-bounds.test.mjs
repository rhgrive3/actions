import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {adaptNativeStages} from '../adapter.mjs';
import {nativePieceHasInterior,nativeAncillaryCanClaim} from '../runtime/native-paint.mjs';
const raw=fs.readFileSync(new URL('../../splatoon3/runtime/paint-ownership.mjs',import.meta.url),'utf8');
const adapted=adaptNativeStages('patches/splatoon3/runtime/paint-ownership.mjs',raw);
const replace=(s,a,b)=>{assert.equal(s.split(a).length,2);return s.replace(a,b);};
const before=replace(replace(adapted,'if (!nativeAncillaryCanClaim(g.R, dn, face.atlas.ppm))','if (nativeMasks && !nativeAncillaryCanClaim(g.R, dn, face.atlas.ppm))'),'if (mask) {\n        mask.pieces','if (nativeMasks && mask) {\n        mask.pieces');
const load=s=>import('data:text/javascript;base64,'+Buffer.from(s.replace(/import .*native-paint.*;\n/,nativePieceHasInterior.toString()+'\n'+nativeAncillaryCanClaim.toString()+'\n')+'\nexport {claimAncillaryCells,ensureOwnershipState,prepareAncillary,pointInsideAncillary};').toString('base64'));
const [reference,candidate]=await Promise.all([load(before),load(adapted)]);
const contract={kind:{speck:7},shapes:[[5,7,8,3],[3,4,5,2],[7,9,10,4],[10,12,14,5],[3,4,4,2],[2,2,0,1],[0,0,0,0],[0,0,0,0]],reach:[2.45,2.1,2.7,2.75,2.3,1.9,1.25,1.35],dripReach:3.9};
function fresh(native){const p={level:{native},grid:new Uint8Array(1024),dead:new Uint8Array(1024),counts:[0,0],version:0};candidate.ensureOwnershipState(p);for(let i=0;i<1024;i++)if(i%11===0)p.dead[i]=1;return p;}
for(const native of [false,true])test(`all-kind growth keeps ${native?'native':'block'} ownership with tiny/large radii, walls, dead cells and competing orders`,()=>{
 for(const wall of [false,true])for(const kind of [0,1,2,3,4,5,6,7])for(const ppm of [.5,1,4,8,30,64])for(const R of [.021,.15,.7,2.5,8]){
  const a=fresh(native),b=fresh(native),face={atlas:{ppm},wall,turf:!wall,grid:0,nu:32,nv:32,cu:.25,cv:.25},g={entries:[face,4,4,.001,Math.sin(.37),Math.cos(.37),.8],R,team:0,seed:.4321,kind,dripDur:wall?1:0,paintOrder:1};
  for(const p of [a,b]){p._paintOrderRecords.push({clock:12,peer:'a',seq:1},{clock:13,peer:'a',seq:2});for(let k=0;k<1024;k++){if(k%13===0){p.grid[k]=2;p._paintOwnershipOrder[k]=2;}}}
  for(const [tn,dT] of [[0,0],[.2,.1],[.8,.4],[1.2,.7],[3,1]]){
   assert.equal(candidate.claimAncillaryCells(b,g,tn,dT,contract),reference.claimAncillaryCells(a,g,tn,dT,contract));
   assert.deepEqual(b.grid,a.grid);assert.deepEqual(b._paintOwnershipOrder,a._paintOwnershipOrder);assert.deepEqual(b.counts,a.counts);assert.equal(b.version,a.version);
  }
 }
});
test('margin near-equality and unknown/nonfinite pieces keep the conservative fallback',()=>{
 for(const type of [0,1,2])for(const margin of [1e-12,.01,.05,1,100]){
  const radius=margin;const p={type,ra:radius,rb:radius,radius};assert.equal(nativePieceHasInterior({margin},p),true);
  const larger={...p,ra:radius*1.000000000001,rb:radius*1.000000000001,radius:radius*1.000000000001};assert.equal(nativePieceHasInterior({margin},larger),true);
 }
 assert.equal(nativePieceHasInterior({margin:1},{type:123}),true);
 for(const r of [NaN,Infinity])assert.equal(nativeAncillaryCanClaim(r,0,30),true);
});
test('all-stage filtering keeps native-only dead-cell and shared-mask behavior scoped',()=>{
 assert.match(adapted,/const nativeMasks = paint\.level\?\.native \? new Map\(\) : null/);
 assert.match(adapted,/if \(nativeMasks && paint.dead\[index\]\)/);
 assert.match(adapted,/if \(paint.level\?\.native && paint.dead\[index\]\) return false/);
 assert.match(adapted,/if \(!nativeAncillaryCanClaim/);
 assert.doesNotMatch(adapted,/if \(nativeMasks && !nativeAncillaryCanClaim/);
});
