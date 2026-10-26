import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {loadNative} from '../../patches/local-quality/tests/prop-retention-fixture.mjs';
const root=new URL('../../',import.meta.url),base='dd90aa241aabd5f0b972cc3471386ba3d4da86dc';
const {THREE,SRC,PropKit,dressingFor}=await loadNative(true);
const {setPropInstanceEnvelope:after}=await import(pathToFileURL(SRC+'src/world/render-bounds.js'));
const source=execFileSync('git',['show',`${base}:inkwave-public/src/world/render-bounds.js`],{cwd:fileURLToPath(root),encoding:'utf8'});
const before=new Function('THREE',source.replace(/^import .*;\n/m,'').replace(/^export /gm,'')+'\nreturn setPropInstanceEnvelope;')(THREE);
const kit=new PropKit(new THREE.Scene(),{quality:'high'});
for(const p of dressingFor('halyard'))kit.add(p.type,p);
kit.build();
const meshes=kit._inst.filter(mesh=>!mesh.userData.axis);
assert.ok(meshes.length>0);
const snapshot=mesh=>({sphere:mesh.boundingSphere?.clone(),culled:mesh.frustumCulled});
const parity=[];
for(const mesh of kit._inst){
 before(mesh);const expected=snapshot(mesh);after(mesh);assert.deepEqual(snapshot(mesh),expected);
 parity.push({name:mesh.name,axis:mesh.userData.axis||null,records:mesh.userData.recs.length,culled:mesh.frustumCulled,sphere:mesh.boundingSphere?{center:mesh.boundingSphere.center.toArray(),radius:mesh.boundingSphere.radius}:null});
}
const cloneCounts={};
for(const [name,fn] of [['before',before],['after',after]]){
 const clone=THREE.Box3.prototype.clone;let count=0;
 THREE.Box3.prototype.clone=function(){count++;return clone.call(this);};
 try{for(const mesh of meshes)fn(mesh);}finally{THREE.Box3.prototype.clone=clone;}
 cloneCounts[name]=count;
}
const repetitions=Number(process.argv[2]||5000),times={before:[],after:[]};
const run=fn=>{for(let i=0;i<repetitions;i++)for(const mesh of meshes)fn(mesh);};
run(before);run(after);
for(let round=0;round<9;round++)for(const name of round%2?['after','before']:['before','after']){
 const start=performance.now();run(name==='before'?before:after);times[name].push(performance.now()-start);
}
const median=a=>a.slice().sort((a,b)=>a-b)[a.length>>1];
console.log(JSON.stringify({base,node:process.version,stage:'halyard',parity,cloneCounts,repetitions,times,medianBefore:median(times.before),medianAfter:median(times.after)},null,2));
kit.dispose();
