import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {parseSourceOBJ,convertSource} from '../runtime/source-convert.mjs';
import {applySourcePlacements} from '../runtime/source-placement.mjs';
import {nativeFixture} from './fixture.mjs';
import {nativeStageCatalog,prepareNativeStageBuild} from '../../../scripts/lib/inkwave-native-stages.mjs';
import {SOURCE_COMMIT} from '../runtime/source-catalog.mjs';

// Synthetic source only: these values never become a stage definition.
const obj=`o Fld_Common\nv -5 0 -5\nv 5 0 -5\nv -5 0 5\nvn 0 1 0\nvn 0 1 0\nvn 0 1 0\nusemtl Floor\nf 1//1 3//3 2//2\n`+
`o FldObj_Prototype\nv 0 0 0\nv 1 0 0\nv 0 0 1\nvn 0 1 0\nvn 0 1 0\nvn 0 1 0\nusemtl Floor\nf 4//4 6//6 5//5\n`;
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const actor=(id,layer='Pnt',translate=[10,3,2])=>({id,layer,gyaml:'Work/Actor/Lft_FldObj_Hiagari04PntFloat.engine__ActorParam.gyml',translate,rotate:[0,Math.PI/2,0],scale:[2,1,3]});
const a=actor('18446744073709551614'),b=actor('18446744073709551615','Vlf',[20,6,2]);
const document=()=>({schema:1,stageId:'synthetic-placement',referenceVersion:'11.3.0',versionVerified:false,diagnosticOnly:true,sourceDocument:{format:'decoded-banc-json',sha256:'a'.repeat(64)},actors:structuredClone([a,b]),rails:[],unresolvedRailPoints:[]});
const plan=()=>({schema:1,stageId:'synthetic-placement',sourceObjSha256:sha(obj),placementSha256:'a'.repeat(64),rule:'turf',objectSpace:'actor-local',eulerOrder:'XYZ',vertexScale:1,translationScale:1,bindings:[{object:'FldObj_Prototype',actor:a.id},{object:'FldObj_Prototype',actor:b.id}]});
const stage={id:'synthetic-placement',name:'Synthetic',sourceSha256:sha(obj),bounds:{minX:-30,minZ:-30,maxX:30,maxZ:30},spawnPads:[[-4,0,0],[4,0,0]],spawnBarrier:0};

test('explicit actor-local transforms instantiate the selected rule without editing source streams',()=>{
 const raw=parseSourceOBJ(obj),vertices=raw.vertices.slice(),indices=raw.indices.slice();
 const turf=applySourcePlacements(raw,document(),plan(),sha(obj));
 assert.deepEqual(raw.vertices,vertices);assert.deepEqual(raw.indices,indices);
 assert.equal(turf.objects.length,2);assert.equal(turf.objects[1].placementActor,a.id);
 assert.deepEqual(Array.from(turf.vertices.slice(24,27)),[10,3,2]);
 assert.deepEqual(Array.from(turf.vertices.slice(32,35)),[10,3,0]);
 const tower=applySourcePlacements(raw,document(),{...plan(),rule:'tower'},sha(obj));
 assert.equal(tower.objects[1].placementActor,b.id);assert.equal(tower.vertices[25],6);
 assert.equal(tower.placementReceipt.movementSimulated,false);assert.equal(tower.placementReceipt.versionVerified,false);
});

test('nonuniform/mirrored transforms preserve normal agreement and triangle facing',()=>{
 const d=document();d.actors[0].scale=[-2,3,4];d.actors[0].rotate=[.2,.4,.6];
 const g=applySourcePlacements(parseSourceOBJ(obj),d,plan(),sha(obj)),o=g.objects[1];
 const points=Array.from(g.indices.slice(o.io,o.io+3),i=>Array.from(g.vertices.slice((o.vo+i)*8,(o.vo+i)*8+3)));
 const u=points[1].map((v,k)=>v-points[0][k]),v=points[2].map((v,k)=>v-points[0][k]);
 const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
 const n=Array.from(g.vertices.slice(o.vo*8+3,o.vo*8+6));
 assert.ok(cross.reduce((s,x,k)=>s+x*n[k],0)>0);assert.ok(Math.abs(Math.hypot(...n)-1)<1e-7);
});

test('placement convention agrees with independent Three Euler/matrix math',async()=>{
 const f=await nativeFixture(),d=document();
 for(const order of ['XYZ','XZY','YXZ','YZX','ZXY','ZYX']){
  const r=d.actors[0];r.rotate=[.37,-.84,1.16];r.scale=[2,3,.5];
  const p={...plan(),eulerOrder:order,vertexScale:.2,translationScale:.1};
  const g=applySourcePlacements(parseSourceOBJ(obj),d,p,sha(obj));
  const q=new f.THREE.Quaternion().setFromEuler(new f.THREE.Euler(...r.rotate,order));
  const expected=new f.THREE.Vector3(.4,0,0).applyQuaternion(q).add(new f.THREE.Vector3(...r.translate).multiplyScalar(.1));
  assert.ok(new f.THREE.Vector3().fromArray(g.vertices,32).distanceTo(expected)<2e-7,order);
 }
});

test('the existing converter gives render vertices, collision and paint charts the same placement',async()=>{
 const data=convertSource(stage,obj,'newmtl Floor\nKd 1 1 1\n',{},()=>{},{document:document(),plan:plan()});
 assert.equal(data.manifest.diagnosticOnly,true);assert.equal(data.manifest.placementReceipt.instances,1);
 const f=await nativeFixture(),level=new f.NativeLevel(data),physics=new f.NativePhysics(level);
 const h=physics.raycast(new f.THREE.Vector3(10.5,8,1.5),new f.THREE.Vector3(0,-1,0),10);
 assert.equal(h.hit,true);assert.ok(Math.abs(h.point.y-3)<1e-6);assert.ok(h.face>=0,'placed source retains a real paint face');
 assert.equal(data.manifest.objects[level.triangleWorld.objectIds[h.triangle]].placementActor,a.id);
});

for(const [name,change] of Object.entries({
 'wrong OBJ hash':p=>{p.sourceObjSha256='b'.repeat(64);},
 'wrong Banc hash':p=>{p.placementSha256='b'.repeat(64);},
 'unknown actor':p=>{p.bindings[0].actor='55';},
 'unknown mesh':p=>{p.bindings[0].object='Missing';},
 'ambiguous duplicate binding':p=>{p.bindings.push({...p.bindings[0]});},
 'missing coordinate scale':p=>{delete p.vertexScale;},
 'unknown rule prototype key':p=>{p.rule='toString';},
 'world-space geometry':p=>{p.objectSpace='world';},
}))test('invalid placement is rejected: '+name,()=>{
 const p=plan();change(p);assert.throws(()=>applySourcePlacements(parseSourceOBJ(obj),document(),p,sha(obj)));
});

test('unresolved rail references and singular transforms cannot silently become placed geometry',()=>{
 const d=document();d.unresolvedRailPoints.push({target:'999'});
 assert.throws(()=>applySourcePlacements(parseSourceOBJ(obj),d,plan(),sha(obj)),/Unresolved/);
 d.unresolvedRailPoints=[];d.actors[0].scale[0]=0;
 assert.throws(()=>applySourcePlacements(parseSourceOBJ(obj),d,plan(),sha(obj)),/Invalid/);
 d.actors[0].scale[0]=1;d.actors[0].layer='Unknown';
 assert.throws(()=>applySourcePlacements(parseSourceOBJ(obj),d,plan(),sha(obj)),/Unsupported bound/);
});

test('Banc JSON normalization preserves uint64 actor/rail IDs, parameter banks and exact source identity',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-banc-'));
 try{
  const v=(X,Y,Z)=>({X,Y,Z}),raw={Actors:[{Hash:a.id,Gyaml:a.gyaml,Layer:'Pnt',Translate:v(10,3,2),Rotate:v(0,0,0),Scale:v(1,1,1),spl__ailift__AILiftBancParam:{ToRailPoint:b.id}}],Rails:[{Hash:'100',Layer:'Pnt',IsClosed:false,Points:[{Hash:b.id,Translate:v(0,0,0),Control0:v(0,1,0),Control1:v(0,2,0)}]}],AiGroups:[{Hash:a.id}]};
  // Emit real JSON numeric uint64s; JavaScript itself must never parse these
  // bytes before Python has converted identifiers into decimal strings.
  const bytes=JSON.stringify(raw).replaceAll('"'+a.id+'"',a.id).replaceAll('"'+b.id+'"',b.id);
  fs.writeFileSync(path.join(dir,'input.json'),bytes);
  const run=()=>execFileSync('python3',['patches/native-stages/tools/import-banc-placement.py','--input',path.join(dir,'input.json'),'--out',path.join(dir,'output.json'),'--stage','mahi','--reference-version','11.3.0'],{stdio:'pipe'});
  run();const d=JSON.parse(fs.readFileSync(path.join(dir,'output.json')));
  assert.equal(d.actors[0].id,a.id);assert.equal(d.rails[0].points[0].id,b.id);
  assert.equal(d.actors[0].source.spl__ailift__AILiftBancParam.ToRailPoint,b.id);
  assert.deepEqual(d.rails[0].points[0].source.Control1,v(0,2,0));assert.equal(d.sourceDocument.sha256,sha(bytes));
  assert.equal(d.unresolvedRailPoints.length,0);assert.equal(d.diagnosticOnly,true);assert.equal(d.versionVerified,false);
  fs.writeFileSync(path.join(dir,'input.json'),bytes.replace('"Scale":','"ScaleMissing":'));
  assert.throws(run,/Command failed/,'missing source fields cannot be replaced with guessed defaults');
  fs.writeFileSync(path.join(dir,'input.json'),'{"Actors":[],"Actors":[],"Rails":[]}');assert.throws(run,/Command failed/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('private CLI exports posed geometry and explicit diagnostic receipts, never a playable conversion',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-placed-'));
 try{
  const files={'stage.json':stage,'placement.json':document(),'bindings.json':plan()};
  for(const [name,data] of Object.entries(files))fs.writeFileSync(path.join(dir,name),JSON.stringify(data));
  fs.writeFileSync(path.join(dir,'source.obj'),obj);fs.writeFileSync(path.join(dir,'source.mtl'),'newmtl Floor\nKd 1 1 1\n');
  const args=['patches/native-stages/tools/build-placed-source.mjs','--obj',path.join(dir,'source.obj'),'--mtl',path.join(dir,'source.mtl'),'--stage',path.join(dir,'stage.json'),'--placement',path.join(dir,'placement.json'),'--bindings',path.join(dir,'bindings.json'),'--out',path.join(dir,'export')];
  execFileSync(process.execPath,args,{stdio:'pipe'});
  const m=JSON.parse(fs.readFileSync(path.join(dir,'export/manifest.json')));
  assert.equal(m.diagnosticOnly,true);assert.equal(m.availability,'placement-unavailable');
  assert.equal(m.placementReceipt.normalizedPlacementSha256,sha(fs.readFileSync(path.join(dir,'placement.json'))));
  assert.equal(m.placementReceipt.bindingPlanSha256,sha(fs.readFileSync(path.join(dir,'bindings.json'))));
  const v=fs.readFileSync(path.join(dir,'export/vertices.bin'));
  assert.equal(v.readFloatLE(24*4),10);assert.equal(v.readFloatLE(25*4),3);
  assert.throws(()=>execFileSync(process.execPath,args,{stdio:'pipe'}),/Command failed/,'private outputs are not silently overwritten');
  const reviewed=nativeStageCatalog().stages[0],target=path.join(dir,'catalog',reviewed.id);fs.mkdirSync(target,{recursive:true});
  const bytes=JSON.stringify({...m,id:reviewed.id});fs.writeFileSync(path.join(target,'manifest.json'),bytes);
  fs.writeFileSync(path.join(target,'integrity.json'),JSON.stringify({'manifest.json':{bytes:Buffer.byteLength(bytes),sha256:sha(bytes)}}));
  fs.writeFileSync(path.join(dir,'catalog/catalog.json'),JSON.stringify({schema:1,sourceCommit:SOURCE_COMMIT,stages:[reviewed]}));
  assert.throws(()=>prepareNativeStageBuild(path.join(dir,'catalog')),/Diagnostic placement conversion cannot enable/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('the live asset loader rejects a diagnostic manifest before requesting geometry or textures',async()=>{
 const manifest=Buffer.from(JSON.stringify({schema:1,id:stage.id,diagnosticOnly:true}));
 const integrity=Buffer.from(JSON.stringify({'manifest.json':{bytes:manifest.length,sha256:sha(manifest)}}));
 const requests=[];
 const context=vm.createContext({TextDecoder,URL,crypto:crypto.webcrypto,fetch:async url=>{
  requests.push(url);const bytes=url.endsWith('integrity.json')?integrity:manifest;
  return {ok:true,arrayBuffer:async()=>Uint8Array.from(bytes).buffer};
 }});
 const modules={three:{},'./registry.mjs':{nativeStageURL:(_id,file)=>'https://native.invalid/'+file},
  './build-config.mjs':{nativeStageBuild:{mode:'local-prepared',stages:[{id:stage.id,integritySha256:sha(integrity)}]}},
  './source-data.mjs':{loadBrowserSource(){}},'./source-cache.mjs':{sourceBytes(){}}};
 const m=new vm.SourceTextModule(fs.readFileSync(new URL('../runtime/native-load.mjs',import.meta.url),'utf8'),{context});
 await m.link(spec=>{const exports=modules[spec];assert.ok(exports,spec);return new vm.SyntheticModule(Object.keys(exports),function(){for(const [k,v] of Object.entries(exports))this.setExport(k,v);},{context});});
 await m.evaluate();await assert.rejects(m.namespace.loadNativeData(stage.id),/Diagnostic placement data cannot be loaded/);
 assert.deepEqual(requests,['https://native.invalid/integrity.json','https://native.invalid/manifest.json']);
});
