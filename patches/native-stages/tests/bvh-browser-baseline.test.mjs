import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {canonicalBvhBaseline} from '../../../scripts/lib/bvh-browser-baseline.mjs';
import {setup,geometry,oldWorld,oldPhysics,unmodule,flatten} from './fixtures/bvh-query-fixture.mjs';
import {canonicalRayOracleData,traceSourceRay} from './canonical-ray-oracle.mjs';
const f=await setup(),canonical=canonicalBvhBaseline(oldWorld);
const Baseline=new Function('THREE',unmodule(canonical)+'\nreturn TriangleWorld;')(f.THREE);
test('frozen allocation baseline changes only the established canonical tie predicate',()=>{
 assert.equal(canonical.replace('||distance===best&&id>=0&&t>id',''),oldWorld);
 assert.throws(()=>canonicalBvhBaseline(oldWorld+'\n'),/Unexpected frozen/);
 assert.throws(()=>canonicalBvhBaseline(canonical),/Unexpected frozen/);
});
test('chart-seam triangle identity and ownership remain exact in either visit order',()=>{
 const data=geometry(),origin=f.V(-2.4,4,-2.4),dir=f.V(0,-1,0);
 data.flags[190]=3;data.flags[191]=1;data.objectIds[190]=7;data.objectIds[191]=9;
 for(const reverse of [false,true]){
  const d={...data,order:reverse?data.order.slice().reverse():data.order.slice()};
  // One leaf admits both seam faces regardless of BVH partition order.
  d.nodes=new Float32Array([...data.nodes.subarray(0,6),-1,d.order.length]);
  const frozen=new f.OldWorld(d),visited=traceSourceRay(frozen);frozen.ray(origin,dir,12);
  const oracle=new f.OldWorld(canonicalRayOracleData(d,visited));
  const expected=flatten(oracle.ray(origin,dir,12));
  assert.equal(expected.triangle,190);assert.equal(expected.flags,3);assert.equal(expected.object,7);
  for(const World of [Baseline,f.CurrentWorld])assert.deepEqual(flatten(new World(d).ray(origin,dir,12)),expected);
 }
 const raw=new f.OldWorld(data),fixed=new Baseline(data);
 assert.notDeepEqual(flatten(raw.ray(origin,dir,12)),flatten(fixed.ray(origin,dir,12)),'original tie behavior must be detected');
});
test('actual browser callback retains all exact ray, fit, nesting, recovery and timing gates',async()=>{
 const checker=fs.readFileSync(new URL('../../../scripts/check-inkwave-bvh-browser.mjs',import.meta.url),'utf8');
 const start='const result=await page.evaluate(',end='\n },{data,base,oldWorld:canonicalBvhBaseline(oldWorld),oldPhysics});';
 assert.equal(checker.split(start).length,2);assert.equal(checker.split(end).length,2);
 const body=checker.split(start)[1].split(end)[0]+'\n }';
 const imported="const THREE=await import('three'),{NativeLevel,NativePhysics}=await import(base+'patches/native-stages/runtime/engine.mjs'),{Physics,Hit}=await import(base+'src/game/physics.js');";
 assert.equal(body.split(imported).length,2);
 const callback=new Function('f','return ('+body.replace(imported,'const {THREE,NativeLevel,NativePhysics,Physics,Hit}=f;')+')')(f);
 const data=()=>Object.fromEntries(Object.entries(geometry()).map(([k,v])=>[k,ArrayBuffer.isView(v)?Array.from(v):v]));
 await assert.rejects(callback({data:data(),base:'/',oldWorld,oldPhysics}),/Browser result mismatch:.*"triangle":191.*"triangle":190/);
 const result=await callback({data:data(),base:'/',oldWorld:canonical,oldPhysics});
 assert.equal(result.rayChecks,3000);assert.equal(result.fitChecks,3000);assert.equal(result.nestedOrder,true);assert.equal(result.exceptionRecovery,true);
 assert.ok(result.callbackCounts.after<result.callbackCounts.before);assert.equal(result.timings.length,16);
 // A wrong triangle remains a failure, even if all geometric values agree.
 const bad=canonical.replace('triangle:id,distance:best','triangle:id+1,distance:best');
 await assert.rejects(callback({data:data(),base:'/',oldWorld:bad,oldPhysics}),/Browser result mismatch:.*triangle/);
 console.log(JSON.stringify({browserCallbackSourceReplay:result,limits:'CPU source/emitted fixture callback replay; no Chromium or browser timing qualification'}));
});

test('browser mismatch evidence retains the exact expected and actual values before rethrow',()=>{
 const checker=fs.readFileSync(new URL('../../../scripts/check-inkwave-bvh-browser.mjs',import.meta.url),'utf8');
 const start='}catch(error){\n',end='\n}finally{await browser?.close();';
 assert.equal(checker.split(start).length,2);assert.equal(checker.split(end).length,2);
 const failure=checker.split(start)[1].split(end)[0],writes=[];
 const original=Error('Browser result mismatch: '+JSON.stringify({expected:{triangle:190},actual:{triangle:191}}));
 const run=new Function('fs','path','out','manifest','receipts','error',failure);
 assert.throws(()=>run({writeFileSync:(file,bytes)=>writes.push([file,JSON.parse(bytes)])},{join:(a,b)=>a+'/'+b},'/evidence',{build:{revision:'fixed'},contentHash:'hash'},new Set(['verified-engine']),original),e=>e===original);
 assert.equal(writes.length,1);assert.equal(writes[0][0],'/evidence/bvh-browser-failure.json');
 assert.equal(writes[0][1].error,String(original));assert.deepEqual(writes[0][1].verifiedArtifacts,['verified-engine']);
 assert.equal(writes[0][1].status,'failed');
});
