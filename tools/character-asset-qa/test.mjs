import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectGLB,hash,assertScenarioMatrix,assertLifecycle} from './glb.mjs';
import {syntheticGLB} from './synthetic.mjs';
import {containedFile,verifyBuild} from './run.mjs';
import {threeImports} from './core.mjs';
function mutateJSON(bytes,fn){const n=bytes.readUInt32LE(12),g=JSON.parse(bytes.subarray(20,20+n)),bin=bytes.subarray(20+n);fn(g);const raw=Buffer.from(JSON.stringify(g)),j=Buffer.alloc(Math.ceil(raw.length/4)*4,32);raw.copy(j);const out=Buffer.concat([bytes.subarray(0,20),j,bin]);out.writeUInt32LE(out.length,8);out.writeUInt32LE(j.length,12);return out;}
test('original synthetic fixture has deterministic geometry/maps and both UV sets',()=>{const a=syntheticGLB();assert.deepEqual(a,syntheticGLB());const r=inspectGLB(a,hash(a));assert.equal(r.triangles,24);assert.equal(r.images,3);assert.deepEqual(r.uvSets,['TEXCOORD_0','TEXCOORD_1']);assert.equal(r.skins,0);});
test('reject wrong identity, truncated buffers, unsafe texture URIs and invalid indices',()=>{
 const b=syntheticGLB();assert.throws(()=>inspectGLB(b,'0'.repeat(64)),/SHA256/);assert.throws(()=>inspectGLB(b.subarray(0,-4)),/length/);
 assert.throws(()=>inspectGLB(mutateJSON(b,g=>g.images[0].uri='https://example.com/private.png')),/embedded/);
 assert.throws(()=>inspectGLB(mutateJSON(b,g=>g.bufferViews[0].byteLength=1)),/accessor exceeds/);
 const n=b.readUInt32LE(12),g=JSON.parse(b.subarray(20,20+n)),idx=g.accessors[g.meshes[0].primitives[0].indices],v=g.bufferViews[idx.bufferView],bad=Buffer.from(b);bad.writeUInt16LE(65535,28+n+v.byteOffset);assert.throws(()=>inspectGLB(bad),/indices/);
});
test('reject NaN, wrong scene graph, hidden external buffers, skin or morph claims',()=>{
 const b=syntheticGLB(),n=b.readUInt32LE(12),bad=Buffer.from(b);bad.writeFloatLE(NaN,28+n);assert.throws(()=>inspectGLB(bad),/finite/);
 for(const fn of [g=>g.nodes[0].children=[0],g=>g.buffers[0].uri='file:///etc/passwd',g=>g.skins=[{}],g=>g.meshes[0].primitives[0].targets=[{}]])assert.throws(()=>inspectGLB(mutateJSON(b,fn)));
});
const rows=()=>{const r=[];for(const count of [1,8])for(const light of ['day','shade'])for(const view of ['front','side65','back'])for(const shadows of [false,true])r.push({count,nativeCharacters:count,light,view,shadows,calls:12,triangles:100,loadMs:2,compileMs:3,p50Ms:1,p95Ms:2,renderSamples:12,changedPixels:99});return r;};
test('scenario gate requires the exact 24 rendered cases and nonblank pixels',()=>{assertScenarioMatrix(rows());assert.throws(()=>assertScenarioMatrix(rows().slice(1)));const duplicate=rows();duplicate[0]=duplicate[1];assert.throws(()=>assertScenarioMatrix(duplicate));const blank=rows();blank[3].changedPixels=0;assert.throws(()=>assertScenarioMatrix(blank));const nan=rows();nan[2].p95Ms=NaN;assert.throws(()=>assertScenarioMatrix(nan));});
const cycles=()=>Array.from({length:10},(_,cycle)=>({cycle,count:cycle%2?8:1,disposed:{geometry:1,material:1,texture:3},memoryAfter:{geometries:3,textures:2},remainingCandidates:0}));
test('lifecycle gate rejects missing cycles, retained resources and skipped disposal',()=>{assertLifecycle(cycles());assert.throws(()=>assertLifecycle(cycles().slice(1)));const leak=cycles();leak[9].memoryAfter.textures++;assert.throws(()=>assertLifecycle(leak));const skip=cycles();skip[3].disposed.texture=0;assert.throws(()=>assertLifecycle(skip));});
test('file server rejects directory traversal',()=>{const here=path.dirname(fileURLToPath(import.meta.url));assert.throws(()=>containedFile(here,'../../../../etc/passwd'),/Outside/);assert.equal(containedFile(here,'glb.mjs'),path.join(here,'glb.mjs'));});
test('explicit actual candidate is optional local-only structural evidence', {skip:!process.env.CHARACTER_QA_LOCAL_GLB},()=>{const file=process.env.CHARACTER_QA_LOCAL_GLB;assert(process.env.CHARACTER_QA_LOCAL_SHA);const r=inspectGLB(fs.readFileSync(file),process.env.CHARACTER_QA_LOCAL_SHA);assert.equal(r.triangles,1624);assert.equal(r.images,3);});
test('existing production build identity is optional read-only local evidence', {skip:!process.env.INKWAVE_BUILT_SITE},()=>{const m=verifyBuild(fs.realpathSync(process.env.INKWAVE_BUILT_SITE));assert.match(m.contentHash,/^[a-f0-9]{64}$/);});

test('core planner merges named and namespace imports without aliasing duplicate exports',()=>{assert.deepEqual(threeImports("import {Mesh, Bone as B, MeshPhysicalMaterial} from 'three'; const m = new THREE.Mesh(); THREE.REVISION;"),['Bone','Mesh','MeshPhysicalMaterial','REVISION']);});
