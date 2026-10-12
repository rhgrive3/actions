import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {adaptNativeStages} from '../adapter.mjs';
import {nativePieceHasInterior,nativeAncillaryCanClaim} from '../runtime/native-paint.mjs';
const source=fs.readFileSync(new URL('../../splatoon3/runtime/paint-ownership.mjs',import.meta.url),'utf8');
const moduleFor=source=>import('data:text/javascript;base64,'+Buffer.from(source+'\nexport {claimAncillaryCells,ensureOwnershipState};').toString('base64'));
const [control,subject]=await Promise.all([moduleFor(source),moduleFor(adaptNativeStages('patches/splatoon3/runtime/paint-ownership.mjs',source).replace(/import .*native-paint.*;\n/, nativePieceHasInterior.toString()+'\n'+nativeAncillaryCanClaim.toString()+'\n'))]);
const contract={kind:{speck:7},shapes:[[5,7,8,3],[3,4,5,2],[7,9,10,4],[10,12,14,5],[3,4,4,2],[2,2,0,1],[0,0,0,0],[0,0,0,0]],reach:[2.45,2.1,2.7,2.75,2.3,1.9,1.25,1.35],dripReach:3.9};
const make=()=>({level:{native:true},grid:new Uint8Array(6400),dead:new Uint8Array(6400),counts:[0,0],version:0});
test('shared native plane masks preserve every live CPU ink claim and causal order',()=>{
 for(const wall of [false,true])for(const kind of [0,2,3])for(const ppm of [1.6384,4,16])for(const R of [1.2,6,12]){
  const a=make(),b=make();control.ensureOwnershipState(a);subject.ensureOwnershipState(b);const entries=[];
  for(let i=0;i<100;i++){const f={atlas:{ppm},wall,turf:!wall,grid:i*64,nu:8,nv:8,cu:.25,cv:.25};entries.push(f,.5+(i%4)*.125,.5,.03,1,0,.2);}
  const g={entries,R,team:0,seed:.4321,kind,dripDur:wall?1:0};
  for(const tn of [.2,.8,1.2,2,3]){assert.equal(subject.claimAncillaryCells(b,g,tn,.7,contract),control.claimAncillaryCells(a,g,tn,.7,contract));assert.deepEqual(b.grid,a.grid);assert.deepEqual(b.counts,a.counts);assert.deepEqual(b._paintOwnershipOrder,a._paintOwnershipOrder);assert.equal(b.version,a.version);}
 }
});
