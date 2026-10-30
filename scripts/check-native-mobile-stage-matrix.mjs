// Verify all converted native-stage arrays and exact ground-batch parity,
// then inventory mobile geometry/texture costs without changing game content.
// Run after git lfs pull: node --experimental-vm-modules scripts/check-native-mobile-stage-matrix.mjs [report.json]
// NATIVE_MATRIX_BASELINE selects the immutable pre-change GPU-budget source.
// Texture bytes are modelled mip/block storage, not device RAM/VRAM measurements.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {nativeStageCatalog,nativeBrowserStageIntegrity} from './lib/inkwave-native-stages.mjs';
import {setup} from '../patches/native-stages/tests/fixtures/bvh-query-fixture.mjs';
import {nativeStageTextureCaps} from '../patches/native-stages/runtime/native-texture-budget.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const {stages,unavailableStages}=nativeStageCatalog();
const baselineCommit=process.env.NATIVE_MATRIX_BASELINE||'23cb6847ab38466adf735ee5dd6da789701490dd';
const baselineBudgetSource=execFileSync('git',['show',baselineCommit+':patches/native-stages/runtime/native-gpu-budget.mjs'],{encoding:'utf8'});
const candidateBudgetSource=fs.readFileSync('patches/native-stages/runtime/native-gpu-budget.mjs','utf8');
const loadSource=source=>import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const {nativeTextureProfile:baselineTextureProfile}=await loadSource(baselineBudgetSource);
const {nativeTextureProfile}=await loadSource(candidateBudgetSource);
const fixture=await setup();
const collisionNames=new Set(['triangles','normals','flags','objectIds','nodes','order','mask','triangleFace']);
const flatten=h=>h&&({triangle:h.triangle,distance:h.distance,point:Array.from(h.point.toArray()),normal:Array.from(h.normal.toArray()),u:h.u,v:h.v,flags:h.flags,object:h.object});
function groundMatrix(data,seed){
 const scalar=new fixture.CurrentWorld(data),batch=new fixture.CurrentWorld(data),down=fixture.V(0,-1,0);
 let hasWalkable=false;for(let i=0;i<data.flags.length;i++)if(data.normals[i*3+1]>=.68){hasWalkable=true;break;}
 assert.ok(hasWalkable,'native stage has no walkable triangle for the ground matrix');
 const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296),poses=[];
 for(let i=0;i<64;i++){
  let id;do{id=Math.floor(random()*data.flags.length);}while(data.normals[id*3+1]<.68);
  const p=id*9,a=data.triangles;poses.push([(a[p]+a[p+3]+a[p+6])/3,(a[p+1]+a[p+4]+a[p+7])/3+1.05,(a[p+2]+a[p+5]+a[p+8])/3]);
 }
 const origins=Array.from({length:9},()=>fixture.V()),outputs=origins.map(()=>({point:fixture.V(),normal:fixture.V()}));let hits=0;
 for(let row=0;row<poses.length;row++){
  const p=poses[row],options={ignoreGrates:!!(row%2),minNormalY:row%3===0?.68:-2};
  origins[0].set(...p);for(let k=1;k<9;k++){const angle=(k-1)*Math.PI/4;origins[k].set(p[0]+Math.cos(angle)*.28,p[1],p[2]+Math.sin(angle)*.28);}
  const expected=origins.map(o=>flatten(scalar.ray(o,down,2,options)));
  batch.rayDownBatch(origins,2,options,outputs);assert.deepEqual(outputs.map(h=>h.hit?flatten(h):null),expected);
  assert.equal(batch.queryCount,scalar.queryCount);assert.equal(batch.triangleTests,scalar.triangleTests);hits+=expected.filter(Boolean).length;
 }
 return {status:'passed',poses:poses.length,rays:scalar.queryCount,hits,triangleTests:scalar.triangleTests,inputSha256:sha(JSON.stringify(poses))};
}
const lfs=new Map(JSON.parse(execFileSync('git',['lfs','ls-files','--json'],{encoding:'utf8'})).files.map(e=>[e.name,e]));
const miB=n=>+(n/1048576).toFixed(3),percentile=(a,p)=>a[Math.min(a.length-1,Math.floor(a.length*p))]??0;
function blockBytes(width,height,compressed){let bytes=0;while(true){bytes+=compressed?Math.ceil(width/4)*Math.ceil(height/4)*16:width*height*4;if(width===1&&height===1)break;width=Math.max(1,width>>1);height=Math.max(1,height>>1);}return bytes;}
function textures(manifest,settingsQuality,compressed,memory=null,profileFn=nativeTextureProfile){
 const profile=profileFn({settingsQuality,tier:0,touch:true,compressed,stageCaps:q=>nativeStageTextureCaps(manifest,q,{mobile:true,deviceMemoryGB:memory,maxTextureSize:4096})});
 const active=new Set(manifest.objects.filter(o=>o.active).map(o=>o.material)),jobs=new Map();
 for(const [name,m]of Object.entries(manifest.materials))if(active.has(name)){
  const roles={albedo:m.albedo,opacity:m.maps?.opacity};if(profile.quality==='high')Object.assign(roles,{normal:m.maps?.normal,roughness:m.maps?.roughness,emissive:m.maps?.emissive});
  for(const [role,file]of Object.entries(roles))if(file){const limit=Math.min(profile.caps.maxDimension,profile.caps.perRole?.[role]??Infinity,profile.quality==='low'?512:profile.quality==='high'?4096:1024);jobs.set(file,{role,limit:Math.max(jobs.get(file)?.limit||0,limit)});}
 }
 let rgba=0,blocks=0,unknown=0,details=0;const roles={};
 for(const [file,job]of jobs){roles[job.role]=(roles[job.role]||0)+1;if(['normal','roughness','emissive'].includes(job.role))details++;
  const v=manifest.prebuiltTextures?.[file]?.[job.role];if(!v){unknown++;continue;}let w=v.width,h=v.height;while(Math.max(w,h)>job.limit&&(w>1||h>1)){w=Math.max(1,w>>1);h=Math.max(1,h>>1);}rgba+=blockBytes(w,h,false);blocks+=blockBytes(w,h,true);
 }
 return{settingsQuality,compressed,memory,quality:profile.quality,caps:profile.caps,activeMaterials:active.size,jobs:jobs.size,details,roles,unknown,rgbaMipMiB:miB(rgba),block4x4MipEstimateMiB:miB(blocks)};
}
const rows=[];
for(const s of stages){
 const base='native-prebuilt/'+s.id,recordBytes=fs.readFileSync(base+'/stage.json');assert.equal(sha(recordBytes),lfs.get(base+'/stage.json').oid);const record=JSON.parse(recordBytes);
 assert.equal(record.sourceSha256,s.sourceSha256);assert.equal(record.stageIntegritySha256,nativeBrowserStageIntegrity(s));const m=record.manifest;
 const arrays={},hashes={},sizes={};for(const [name,spec]of Object.entries(record.arrays)){
  const parts=spec.chunks.map(c=>{const b=fs.readFileSync(base+'/'+c.file);assert.equal(b.length,c.bytes);assert.equal(sha(b),c.sha256);return b;});const b=Buffer.concat(parts),Type=globalThis[spec.type];assert.equal(b.length,spec.length*Type.BYTES_PER_ELEMENT);sizes[name]=b.length;hashes[name]=sha(b);
  if(collisionNames.has(name)||['faceTriangleOffsets','faceI32'].includes(name))arrays[name]=new Type(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
 }
 const matrix=groundMatrix({...arrays,manifest:m},1984+rows.length);
 const {mask,faceTriangleOffsets:offsets,faceI32:i32}=arrays;const sizesFaces=[],liveFaces=[];let empty=0,live=0;
 for(let i=0;i<offsets.length-1;i++){sizesFaces.push(offsets[i+1]-offsets[i]);let n=0;for(let k=i32[i*4+2],end=k+i32[i*4]*i32[i*4+1];k<end;k++)n+=mask[k]?1:0;if(n)liveFaces.push(n);else empty++;live+=n;}
 sizesFaces.sort((a,b)=>a-b);liveFaces.sort((a,b)=>a-b);
 const retainedNames=['triangles','normals','flags','objectIds','nodes','order','mask','triangleFace','faceTriangles'];
 rows.push({id:s.id,name:s.name,stageRecordSha256:sha(recordBytes),geometry:m.geometry,sourceGeometry:m.sourceGeometry,allMaterials:Object.keys(m.materials).length,activeObjects:m.objects.filter(o=>o.active).length,faces:offsets.length-1,emptyFaces:empty,maskCells:mask.length,liveCells:live,chartTriangles:{median:percentile(sizesFaces,.5),p90:percentile(sizesFaces,.9),p99:percentile(sizesFaces,.99),max:sizesFaces.at(-1)},liveChartCells:{median:percentile(liveFaces,.5),p99:percentile(liveFaces,.99),max:liveFaces.at(-1)},serializedArraysMiB:miB(Object.values(sizes).reduce((a,b)=>a+b,0)),retainedCollisionAndMaskMiB:miB(retainedNames.reduce((n,k)=>n+(sizes[k]||0),0)),nativeInkAttributeMiB:miB(record.arrays.faceTriangles.length*3*61),nativeInkIndexMiB:miB(record.arrays.faceTriangles.length*3*4),arrayBytes:sizes,arrayHashes:hashes,groundMatrix:matrix,baselineHighCompressed:textures(m,'high',true,null,baselineTextureProfile),mobileProfiles:[textures(m,'high',true),textures(m,'high',false),textures(m,'medium',true),textures(m,'low',true),textures(m,'high',true,2)]});
}
const report={schema:1,baselineCommit,baselineBudgetSha256:sha(baselineBudgetSource),candidateBudgetSha256:sha(candidateBudgetSource),triangleWorldSha256:sha(fs.readFileSync('patches/native-stages/runtime/triangle-world.mjs')),base:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),stageCount:rows.length,unavailable:unavailableStages.map(s=>({id:s.id,reason:s.reason})),limits:['All converted geometry arrays verified against manifest SHA256; no original OBJ/MTL/PNG fetched.','Serialized/derived-array sizes are not total process RAM or GPU VRAM; JS objects, driver copies, decoded upload peaks and shared backing stores differ.','4x4 GPU-block estimate assumes16bytes/block across mip chain (BC7/ASTC4x4/etc); actual device target not measured.','Texture jobs emulate active-material last-role loading semantics; source/runtime pixel equality not assessed here.'],rows};
const out=process.argv[2]||'reports/native-mobile-20261030/all-stages.json';fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({out,stages:rows.length,summary:rows.map(r=>({id:r.id,collisionTriangles:r.geometry.collisionTriangles,faces:r.faces,serializedMiB:r.serializedArraysMiB,inkAttributesMiB:r.nativeInkAttributeMiB,baselineHighJobs:r.baselineHighCompressed.jobs,candidateHighJobs:r.mobileProfiles[0].jobs,baselineHighDetailJobs:r.baselineHighCompressed.details,baselineHighBlockMiB:r.baselineHighCompressed.block4x4MipEstimateMiB,candidateHighBlockMiB:r.mobileProfiles[0].block4x4MipEstimateMiB,groundMatrix:r.groundMatrix.status}))},null,2));
