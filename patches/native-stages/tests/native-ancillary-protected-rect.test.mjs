import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {adaptNativeStages} from '../adapter.mjs';
import * as helpers from '../runtime/native-paint.mjs';

const raw=fs.readFileSync(new URL('../../splatoon3/runtime/paint-ownership.mjs',import.meta.url),'utf8');
const gate='    if (paint.level?.native && order && nativeAncillaryRectBlocked(paint,face,order,i0,i1,j0,j1)) continue;';
assert.equal(raw.split(gate).length,2,'one explicit protected-rectangle optimization');
const load=code=>{
  code=adaptNativeStages('patches/splatoon3/runtime/paint-ownership.mjs',code)
    .replace(/import .*native-paint.*;\n/,Object.values(helpers).filter(f=>typeof f==='function').map(f=>f.toString()).join('\n')+'\n')
    .replace(/from '(\.\/[^']+)'/g,(_,rel)=>'from '+JSON.stringify(new URL('../../splatoon3/runtime/'+rel,import.meta.url).href))
    .replace('function prepareAncillary(g, face, lu, lv, dn, sdu, sdv, sa, tn, dT, contract) {',
      'function prepareAncillary(g, face, lu, lv, dn, sdu, sdv, sa, tn, dT, contract) { prepareCalls++;');
  return import('data:text/javascript;base64,'+Buffer.from('let prepareCalls=0;\n'+code+'\nexport {claimAncillaryCells,ensureOwnershipState,nativeAncillaryRectBlocked};export const countPrepares=()=>prepareCalls;').toString('base64'));
};
const before=await load(raw.replace(gate,'')),after=await load(raw);
const contract={kind:{speck:7},shapes:[[5,0,0,3],[3,0,0,2],[7,0,0,4],[10,0,0,5],[3,0,0,2],[2,0,0,1],[0,0,0,0],[0,0,0,0]],reach:[2.8,3,2.8,2.8,3,2.8,1,1],dripReach:3.9};
function setup(mod,{native=true,side=4}={}){
  const cells=side*side;
  const faces=Array.from({length:12},(_,i)=>({atlas:{ppm:4,pad:2},su:side*.25,sv:side*.25,nu:side,nv:side,cu:.25,cv:.25,grid:i*cells,wall:i%3!==0,turf:i%3===0}));
  const paint={level:{native},grid:new Uint8Array(cells*faces.length),dead:new Uint8Array(cells*faces.length),counts:[0,0],version:0};mod.ensureOwnershipState(paint);
  paint._paintOrderRecords.push(1,2,3);
  const entries=[];faces.forEach((f,i)=>entries.push(f,.5,.5,(i%4)*.1,i%2?.6:0,i%2?.8:0,i%2?.4:0));
  return {paint,faces,g:{R:2.7,kind:3,seed:.37,team:0,paintOrder:2,entries,dripDur:3.3,dur:.27,age:0}};
}
function same(a,b){
  assert.deepEqual(b.paint.grid,a.paint.grid);assert.deepEqual(b.paint._paintOwnershipOrder,a.paint._paintOwnershipOrder);
  assert.deepEqual(b.paint.counts,a.paint.counts);assert.equal(b.paint.version,a.paint.version);
}
test('already protected tiny native charts avoid all ancillary mask preparation',()=>{
  const a=setup(before),b=setup(after),ac=before.countPrepares(),bc=after.countPrepares();
  for(const world of [a,b])for(let i=0;i<world.paint.grid.length;i++){
    world.paint.grid[i]=i%2+1;world.paint._paintOwnershipOrder[i]=i%3===0?3:2;
    if(i%7===0){world.paint.dead[i]=1;world.paint._paintOwnershipOrder[i]=0;}
  }
  assert.equal(before.claimAncillaryCells(a.paint,a.g,.8,.2,contract),after.claimAncillaryCells(b.paint,b.g,.8,.2,contract));same(a,b);
  assert.ok(before.countPrepares()>ac);assert.equal(after.countPrepares(),bc);
});
test('600 native growth ticks preserve claims across clear, replacement, callback mutation and pooled reuse',()=>{
  const a=setup(before),b=setup(after);let callbacksA=0,callbacksB=0;
  for(const [world,mark]of [[a,()=>callbacksA++],[b,()=>callbacksB++]]){
    world.paint._inkMark=(f,i,j)=>{
      mark();
      // Later faces observe writes made by an earlier face's real callback.
      if(f===world.faces[0]&&i===0&&j===0){const next=world.faces[1];for(let k=next.grid;k<next.grid+16;k++){world.paint.grid[k]=2;world.paint._paintOwnershipOrder[k]=3;}}
    };
  }
  for(let tick=0;tick<600;tick++){
    for(const world of [a,b]){
      const {paint,g,faces}=world;
      if(tick%90===0){paint.grid.fill(0);paint._paintOwnershipOrder.fill(0);delete g._ancillaryAllDone;delete g._ancillaryFloorDone;g.age=0;}
      if(tick%90===30)for(let k=0;k<paint.grid.length;k+=3){paint.grid[k]=2;paint._paintOwnershipOrder[k]=3;}
      if(tick%90===45)for(let k=0;k<paint.grid.length;k+=7){paint.grid[k]=0;paint._paintOwnershipOrder[k]=0;}
      if(tick%90===60){g.R=tick%180?1.8:2.7;g.seed=(tick%100)/100;faces[3].atlas={ppm:tick%180?8:4,pad:2};}
      g.age+=1/60;
    }
    const tn=Math.min(3,a.g.age/a.g.dur),dT=1-Math.pow(1-Math.min(1,a.g.age/a.g.dripDur),2.2);
    assert.equal(after.claimAncillaryCells(b.paint,b.g,tn,dT,contract),before.claimAncillaryCells(a.paint,a.g,tn,dT,contract),`tick ${tick}`);same(a,b);
  }
  assert.equal(callbacksB,callbacksA);assert.ok(callbacksA>0);
});
test('large charts, legacy levels and unordered stamps retain their ordinary mask paths',()=>{
  for(const opts of [{native:false},{side:16},{}]){
    const a=setup(before,opts),b=setup(after,opts);if(!opts.native&&opts.side===undefined){a.g.paintOrder=b.g.paintOrder=0;}
    const ac=before.countPrepares(),bc=after.countPrepares();
    for(const world of [a,b]){world.paint.grid.fill(1);world.paint._paintOwnershipOrder.fill(2);}
    assert.equal(after.claimAncillaryCells(b.paint,b.g,.8,.2,contract),before.claimAncillaryCells(a.paint,a.g,.8,.2,contract));same(a,b);
    assert.equal(after.countPrepares()-bc,before.countPrepares()-ac);
  }
});

test('local/network order precedence is read live before deciding a rectangle is protected',()=>{
  const network=(clock,peer='a',legacy=false)=>({clock,peer,seq:1,tie:'',legacy});
  for(const records of [
    [null,1,2,3],
    [null,network(1),network(2),network(3)],
    [null,network(1),2,network(3)],
    [null,1,network(2),3],
    [null,network(2,'a'),network(2,'b'),network(2,'c')],
    [null,network(2,'a',true),network(2,'a'),network(3,'a',true)],
    [null,network('9007199254740993'),network('9007199254740994'),network('9007199254740995')],
  ])for(const previous of [0,1,2,3,99]){
    const a=setup(before),b=setup(after);
    for(const w of [a,b]){w.paint._paintOrderRecords=records;w.paint._paintOwnershipOrder.fill(previous);w.paint.grid.fill(previous?2:0);}
    assert.equal(after.claimAncillaryCells(b.paint,b.g,.8,.2,contract),before.claimAncillaryCells(a.paint,a.g,.8,.2,contract));same(a,b);
  }
});

test('unprotected rectangles stop at the first writable cell and large rectangles never scan',()=>{
  const {paint,faces}=setup(after);const face=faces[0];let reads=0;
  paint._paintOwnershipOrder=new Proxy(Array(256).fill(2),{get(target,key){if(/^\d+$/.test(String(key)))reads++;return target[key];}});
  paint._paintOwnershipOrder[0]=0;
  assert.equal(after.nativeAncillaryRectBlocked(paint,face,2,0,3,0,3),false);
  assert.equal(reads,1,'first unprotected cell ends the check');
  reads=0;
  assert.equal(after.nativeAncillaryRectBlocked(paint,face,2,0,8,0,8),false);
  assert.equal(reads,0,'81-cell rectangle keeps the original sparse walk');
  paint._paintOwnershipOrder[0]=2;reads=0;
  assert.equal(after.nativeAncillaryRectBlocked(paint,face,2,0,3,0,3),true);
  assert.equal(reads,16,'tiny protected rectangle reads only its own cells');
});
