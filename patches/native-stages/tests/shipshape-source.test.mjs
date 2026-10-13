import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import {execFileSync} from 'node:child_process';
import {nativeStageCatalog} from '../../../scripts/lib/inkwave-native-stages.mjs';
import {SOURCE_COMMIT} from '../runtime/source-catalog.mjs';
import {parseSourceOBJ,buildSourceBVH} from '../runtime/source-convert.mjs';
import {nativeFixture,readStage} from './fixture.mjs';
const source=process.env.INKWAVE_NATIVE_STAGE_SOURCE,assets=process.env.INKWAVE_NATIVE_STAGE_ASSETS;
const spec=nativeStageCatalog().stages.find(s=>s.id==='shipshape');
const sha=(data,kind='sha256')=>crypto.createHash(kind).update(data).digest('hex');

test('Shipshape identity and opposing source-bank calibration remain explicit',()=>{
 assert.equal(spec.internal,'Vss_Twist00');assert.equal(spec.name,'オヒョウ海運');
 assert.equal(spec.tree,'d1b59d640b885fee46b3cb93c6dab4b38ba32019');
 assert.equal(spec.sourceSha256,'8413aae6785ae2a8cbbecf075bde9c13e0aed55e4e2a048b93c894c91c3771d9');
 assert.equal(spec.version1130Verified,false);
 assert(spec.spawnPads[0][2]<-60&&spec.spawnPads[1][2]>60,'supports retain opposing full-map banks');
 assert.deepEqual(spec.sourceSemantics,{inactiveObjectPatterns:['^FldObj_BlueCranes_Hoisting_winch_[12]__VesselCraneSet01$']},'only the two malformed, unplaced crane prototypes are selected');
});

test('Shipshape every source Float32 attribute bit and Uint32 index matches independently',{skip:!source||!assets},async()=>{
 const dir=path.join(source,spec.internal),out=path.join(assets,spec.id);
 const manifest=JSON.parse(fs.readFileSync(path.join(out,'manifest.json')));
 const vertices=fs.readFileSync(path.join(out,'vertices.bin')),indices=fs.readFileSync(path.join(out,'indices.bin'));
 const original=path.join(dir,spec.internal+'.obj');assert.equal(sha(fs.readFileSync(original)),spec.sourceSha256);
 let object=-1,v=0,n=0,uv=0,ii=0,positionBits=0,normalBits=0,uvBits=0;
 const tmp=Buffer.alloc(4),same=(offset,number,label)=>{tmp.writeFloatLE(Number(number));assert.equal(vertices.readUInt32LE(offset),tmp.readUInt32LE(),label);};
 for await(const line of readline.createInterface({input:fs.createReadStream(original),crlfDelay:Infinity})){
  if(line.startsWith('o ')){object++;assert.equal(manifest.objects[object].name,line.slice(2).trim());}
  else if(line.startsWith('v ')){const p=line.split(/\s+/).slice(1,4);for(let k=0;k<3;k++){same(v*32+k*4,p[k],'position '+v+':'+k);positionBits++;}v++;}
  else if(line.startsWith('vn ')){const p=line.split(/\s+/).slice(1,4);for(let k=0;k<3;k++){same(n*32+12+k*4,p[k],'normal '+n+':'+k);normalBits++;}n++;}
  else if(line.startsWith('vt ')){const o=manifest.objects[object],p=line.split(/\s+/).slice(1,3),previous=manifest.objects.slice(0,object).filter(o=>o.sourceHasUV).reduce((n,o)=>n+o.vc,0),row=o.vo+uv-previous;for(let k=0;k<2;k++){same(row*32+24+k*4,p[k],'UV '+uv+':'+k);uvBits++;}uv++;}
  else if(line.startsWith('f ')){
   const o=manifest.objects[object],vs=line.trim().split(/\s+/).slice(1).map(t=>Number(t.split('/')[0])-1-o.vo);
   for(let j=1;j<vs.length-1;j++)for(const local of [vs[0],vs[j],vs[j+1]]){assert.equal(indices.readUInt32LE(ii*4),local,'index '+ii);ii++;}
  }
 }
 assert.equal(v*32,vertices.length);assert.equal(n,v);assert.equal(ii*4,indices.length);
 for(const o of manifest.objects)if(!o.sourceHasUV)for(let row=o.vo;row<o.vo+o.vc;row++)for(let k=0;k<2;k++){same(row*32+24+k*4,0,'absent UV zero');uvBits++;}
 assert.equal(positionBits,v*3);assert.equal(normalBits,v*3);assert.equal(uvBits,v*2);
 console.log(JSON.stringify({id:spec.id,sourceCommit:SOURCE_COMMIT,vertices:v,positionBits,normalBits,uvBits,indices:ii,allAttributeBitsAndIndicesIdentical:true}));
});

test('Shipshape every pinned MTL and PNG matches Git blob SHA1 and byte count',{skip:!source},()=>{
 const repository=process.env.INKWAVE_PINNED_SOURCE_REPOSITORY||'/workspace/actions/.codex-stage-sources/KiTrix';
 const before=execFileSync('git',['-C',repository,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
 assert.equal(before,SOURCE_COMMIT);
 const rows=execFileSync('git',['-C',repository,'ls-tree','-rz',SOURCE_COMMIT,'stages/'+spec.internal]).toString().split('\0').filter(Boolean);
 let verified=0,bytes=0;
 for(const row of rows){const [meta,name]=row.split('\t');if(!/\.(mtl|png)$/.test(name))continue;
  const data=fs.readFileSync(path.join(source,path.relative('stages',name))),blob=crypto.createHash('sha1').update('blob '+data.length+'\0').update(data).digest('hex');
  assert.equal(blob,meta.split(' ')[2],name);const size=Number(execFileSync('git',['-C',repository,'cat-file','-s',meta.split(' ')[2]],{encoding:'utf8'}));assert.equal(data.length,size,name+' bytes');verified++;bytes+=data.length;
 }
 assert.equal(verified,304);assert.equal(execFileSync('git',['-C',repository,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),before);
 console.log(JSON.stringify({id:spec.id,pinnedMtlPngBlobs:verified,sourceBytes:bytes,allGitBlobSha1AndBytesIdentical:true}));
});

test('Shipshape every converted source PNG retains the complete original bytes',{skip:!source||!assets},()=>{
 const out=path.join(assets,spec.id),manifest=JSON.parse(fs.readFileSync(path.join(out,'manifest.json')));let files=0,bytes=0;
 for(const [name,pin] of Object.entries(manifest.textureIntegrity)){
  const original=fs.readFileSync(path.join(source,spec.internal,name)),converted=fs.readFileSync(path.join(out,name));
  assert.deepEqual(converted,original,name+' every byte');assert.equal(converted.length,pin.bytes);assert.equal(sha(converted),pin.sha256);files++;bytes+=converted.length;
 }
 assert.equal(files,237);console.log(JSON.stringify({id:spec.id,convertedSourcePngFiles:files,bytes,everyOriginalPngByteRetained:true}));
});

test('Shipshape only two malformed unplaced crane source roles change; hull and roof contacts remain',{skip:!source||!assets},async()=>{
 const f=await nativeFixture(),{THREE}=f;
 const original=parseSourceOBJ(fs.readFileSync(path.join(source,spec.internal,spec.internal+'.obj'),'utf8'));
 const data=readStage(assets,spec.id),selected=original.objects.map((o,id)=>({o,id})).filter(({o})=>new RegExp(spec.sourceSemantics.inactiveObjectPatterns[0]).test(o.name));
 assert.equal(selected.length,2);assert.equal(original.objects.length,data.manifest.objects.length);
 assert.deepEqual(Buffer.from(original.vertices.buffer),Buffer.from(data.vertices.buffer));assert.deepEqual(Buffer.from(original.indices.buffer),Buffer.from(data.indices.buffer));
 for(let id=0;id<original.objects.length;id++){
  const a=original.objects[id],b=data.manifest.objects[id];
  if(selected.some(s=>s.id===id)){assert.equal(a.active,true);assert.equal(a.collidable,true);assert.equal(b.active,false);assert.equal(b.collidable,false);}
  else for(const key of ['active','collidable','paintable'])assert.equal(b[key],a[key],a.name+' '+key+' must remain source-identical');
 }
 const world=new f.NativeLevel(data).triangleWorld,TriangleWorld=world.constructor,cases=[];
 for(const {o,id} of selected){
  const triangles=[],normals=[];
  for(let i=o.io;i<o.io+o.ic;i+=3){const points=[0,1,2].map(k=>new THREE.Vector3().fromArray(original.vertices,(original.indices[i+k]+o.vo)*8));const n=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));if(n.length()<1e-9)continue;n.normalize();triangles.push(...points.flatMap(p=>p.toArray()));normals.push(...n.toArray());}
  const t=new Float32Array(triangles),n=new Float32Array(normals),before=new TriangleWorld({triangles:t,normals:n,flags:new Uint32Array(t.length/9).fill(3),objectIds:new Uint32Array(t.length/9).fill(id),...buildSourceBVH(t)});
  let proof=null;
  for(let i=0;i<t.length/9;i++){const p=new THREE.Vector3().fromArray(t,i*9).add(new THREE.Vector3().fromArray(t,i*9+3)).add(new THREE.Vector3().fromArray(t,i*9+6)).multiplyScalar(1/3),normal=new THREE.Vector3().fromArray(n,i*3),origin=p.clone().addScaledVector(normal,.1),direction=normal.clone().negate(),hit=before.ray(origin,direction,.2);if(!hit)continue;
   const after=world.ray(origin,direction,.2);assert(after?.object!==id);proof={sourceObject:o.name,sourceBounds:o.bounds,sourceTriangles:t.length/9,beforeContactSourceRole:original.objects[hit.object].name,afterContactSourceRole:after?data.manifest.objects[after.object].name:null};break;}
  assert.ok(proof,'actual original source triangle contact');cases.push(proof);
 }
 assert.equal(data.manifest.geometry.collisionTriangles,310976);
 assert.equal(data.manifest.gridCells,14114614);
 const hull=data.manifest.objects.find(o=>o.name==='Fld_Twist00_vessel_anchorhull__VesselHull00');assert.ok(hull?.active&&hull.collidable&&hull.paintable);
 const roof=data.manifest.objects.find(o=>o.name==='Fld_Twist00_MainFloor__OilRigFloor');assert.ok(roof?.active&&roof.collidable&&roof.paintable);
 console.log(JSON.stringify({id:spec.id,rawSourceBuffersUnchanged:true,onlyTwoPrototypeRolesChanged:true,hullAndRoofPreserved:true,cases}));
});
