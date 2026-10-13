import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fixture} from '/workspace/stage-combat-validation/patches/splatoon3/tests/source-fixture.mjs';
import {adaptBuildSource} from '/workspace/stage-combat-validation/scripts/inkwave-source-composition.mjs';
import {readStage} from '/workspace/stage-worktrees/bluefin/patches/native-stages/tests/fixture.mjs';
const dir='/workspace/stage-worktrees/humpback/.ci-scratch/bluefin-stage-peer',root='/workspace/stage-combat-validation',assets='/workspace/stage-worktrees/bluefin/.codex-stage-sources/generated';
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const before=JSON.parse(fs.readFileSync(dir+'/matched-catalogue-source-sweep.json'));
const f=await fixture({fullRuntime:true,realProjectiles:true,adaptNative:adaptBuildSource,adaptRuntime:adaptBuildSource,
 extraExports:"export {NativeLevel,NativePhysics} from './patches/native-stages/runtime/engine.mjs'; export {sweptWorldHit} from './patches/splatoon3/runtime/weapons-collision.mjs'; export {TriangleWorld} from './patches/native-stages/runtime/triangle-world.mjs';"});
const V=a=>new f.THREE.Vector3(...a),hit=()=>({point:V([0,0,0]),normal:V([0,0,0])});
const data=readStage(assets,'bluefin'),L=new f.NativeLevel(data),s=before.submittedSegment;
const sourceFiles={};for(const [name,expected] of Object.entries(before.sourceFiles)){
 const p=assets+'/bluefin/'+name+'.bin',value={sha256:sha(p),bytes:fs.statSync(p).size};assert.deepEqual(value,expected);sourceFiles[name]=value;
}
const actual=f.sweptWorldHit(new f.NativePhysics(L),V(s.from),V(s.to),s.radius0,s.radius1,hit(),true);
assert.equal(actual.hit,false);assert.equal(actual.block,-1);assert.equal(actual.face,-1);assert.equal(actual.triangle,-1);assert.ok(Math.abs(actual.dist-s.length)<1e-10);
const T=new f.TriangleWorld({triangles:new Float32Array([0,-100,-100,0,100,-100,0,0,100]),normals:new Float32Array([1,0,0]),flags:new Uint32Array([1]),objectIds:new Uint32Array([0]),nodes:new Float32Array([0,-100,-100,0,100,100,-1,1]),order:new Uint32Array([0])});
function planeEntry(x0,x1,r0,r1){
 if(Math.abs(x0)<=r0)return 0;
 const d=x1-x0,dr=r1-r0,A=d*d-dr*dr,B=2*(x0*d-r0*dr),C=x0*x0-r0*r0;
 let roots=[];
 if(Math.abs(A)<1e-14){if(Math.abs(B)>1e-14)roots=[-C/B];}
 else{const disc=B*B-4*A*C;if(disc>=0)roots=[(-B-Math.sqrt(disc))/(2*A),(-B+Math.sqrt(disc))/(2*A)];}
 const eligible=roots.filter(t=>t>=0&&t<=1).sort((a,b)=>a-b);return eligible.length?eligible[0]:null;
}
const cases=[];let seed=19491;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
const fixed=[[-3,3,.1,.8],[-3,3,.8,.1],[-.5,-.5,.1,.8],[-.5,-.5,.1,.4],[3,3,.2,.1],[-.2,3,.3,.1],[-3,-1,.2,.8],[-3,-.2,.8,.3]];
for(let i=0;i<48;i++)fixed.push([(rand()-.5)*8,(rand()-.5)*8,rand(),rand()]);
for(const [x0,x1,r0,r1] of fixed){
 const expected=planeEntry(x0,x1,r0,r1),observed=T.sweepSphere(V([x0,0,0]),V([x1,0,0]),r0,{endRadius:r1});
 assert.equal(!!observed,expected!==null,JSON.stringify({x0,x1,r0,r1,expected,observed}));
 if(observed)assert.ok(Math.abs(observed.time-expected)<2e-7,JSON.stringify({x0,x1,r0,r1,expected,time:observed.time}));
 cases.push({x0,x1,r0,r1,expected,time:observed?.time??null});
}
const files=['patches/native-stages/adapter.mjs','patches/native-stages/runtime/native-projectile-sweep.mjs','patches/native-stages/runtime/triangle-world.mjs','patches/native-stages/runtime/engine.mjs'];
const bindings=Object.fromEntries(files.map(p=>[p,sha(root+'/'+p)]));
const receipt={schema:1,status:'closed-scoped-peer',scope:'Independent read-only adapted e984 catalogue path on the exact naturally recorded Bluefin first-step source segment, plus 56 independent analytic signed-plane entry controls for linear radii. Not a browser/build/whole weapon qualification.',sourceRoot:assets,beforeCounterexampleSha256:sha(dir+'/matched-catalogue-source-sweep.json'),sourceFiles,candidateBindings:bindings,submittedSegment:s,adaptedResult:{hit:actual.hit,distance:actual.dist,block:actual.block,face:actual.face,triangle:actual.triangle},analyticControls:cases,limitations:['Actual browser burst/contact/full-grid settlement still pending on a corrected immutable Bluefin build.','Raw source naming/masks and Nintendo engine equivalence remain unverified.']};
const p=dir+'/candidate-catalogue-source-peer.json';fs.writeFileSync(p,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,path:p,sha256:sha(p),controls:cases.length,sourceSegmentClear:!actual.hit}));
