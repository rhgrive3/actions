#!/usr/bin/env node
// Private pinned OBJ/MTL inputs only; summary JSON never contains model data.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
import {nativeStageCatalog} from './lib/inkwave-native-stages.mjs';
import {convertSource} from '../patches/native-stages/runtime/source-convert.mjs';
import {SOURCE_COMMIT} from '../patches/native-stages/runtime/source-catalog.mjs';
import {validateNativeGeometry} from '../patches/native-stages/tools/validate-geometry.mjs';
const [rootArg,outArg,assetsArg,baselineArg]=process.argv.slice(2);
assert(rootArg&&outArg,'Usage: check-inkwave-terrain.mjs <private-sources-by-id> <summary.json> [private-derived-output] [baseline-converter.mjs]');
const root=path.resolve(rootArg),out=path.resolve(outArg),assets=assetsArg&&path.resolve(assetsArg),baseline=baselineArg?await import(pathToFileURL(path.resolve(baselineArg))):null;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),catalog=nativeStageCatalog(),summary={schema:1,sourceCommit:SOURCE_COMMIT,stages:[],unavailable:catalog.unavailableStages.map(s=>({id:s.id,reason:s.reason})),status:'running'};
fs.mkdirSync(path.dirname(out),{recursive:true});const save=()=>fs.writeFileSync(out,JSON.stringify(summary,null,2)+'\n');
try{
 for(const s of catalog.stages){
  const dir=path.join(root,s.id),obj=fs.readFileSync(path.join(dir,s.internal+'.obj')),mtl=fs.readFileSync(path.join(dir,s.internal+'.mtl')),tree=JSON.parse(fs.readFileSync(path.join(dir,'tree.json')));
  assert.equal(hash(obj),s.sourceSha256);assert.equal(tree.sha,s.tree);assert.equal(tree.truncated,false);
  const files=Object.fromEntries(tree.tree.filter(f=>f.type==='blob').map(f=>[f.path,{bytes:f.size,gitSha1:f.sha}])),pin=files[s.internal+'.mtl'];
  assert.equal(crypto.createHash('sha1').update('blob '+mtl.length+'\0').update(mtl).digest('hex'),pin.gitSha1);
  const start=performance.now(),data=convertSource(s,obj.toString(),mtl.toString(),files),audit=validateNativeGeometry(data),restored=[];
  if(baseline){
   const before=baseline.parseSourceOBJ(obj.toString(),s.sourceSemantics);
   assert.equal(hash(Buffer.from(data.vertices.buffer)),hash(Buffer.from(before.vertices.buffer)),'source vertices/normals/UV changed');
   assert.equal(hash(Buffer.from(data.indices.buffer)),hash(Buffer.from(before.indices.buffer)),'source topology/holes/boundaries changed');
   for(let i=0;i<before.objects.length;i++){
    const a=before.objects[i],b=data.manifest.objects[i];if(JSON.stringify(a)===JSON.stringify(b))continue;
    assert(!a.collidable&&b.collidable&&b.active&&!b.background&&/groundgrass/i.test(b.material),'unexpected semantic change: '+b.name);
    assert.deepEqual({...a,collidable:b.collidable,paintable:b.paintable},b,'only ground collision/paint semantics may change');
    restored.push({name:b.name,sourceTriangles:b.ic/3,collisionTriangles:data.objectIds.reduce((n,id)=>n+(id===i),0)});
   }
  }
  if(assets){
   const target=path.join(assets,s.id);fs.mkdirSync(target,{recursive:true});
   for(const [key,file] of Object.entries({vertices:'vertices',indices:'indices',triangles:'collision',normals:'normals',flags:'flags',objectIds:'objects',nodes:'bvh',order:'order',triangleFace:'triangleFace',mask:'mask'}))fs.writeFileSync(path.join(target,file+'.bin'),new Uint8Array(data[key].buffer));
   fs.writeFileSync(path.join(target,'manifest.json'),JSON.stringify(data.manifest));
  }
  summary.stages.push({id:s.id,sourceSha256:s.sourceSha256,...audit,sourceGeometrySha256:hash(Buffer.from(data.vertices.buffer)),sourceIndexSha256:hash(Buffer.from(data.indices.buffer)),displayTopologyUnchanged:baseline?true:null,restored,conversionAndAuditMilliseconds:performance.now()-start});save();console.log(s.id+' audited; restored objects '+restored.length);
 }
 assert.equal(summary.stages.length,catalog.stages.length);summary.status='passed';
}catch(error){summary.status='failed';summary.error=error.stack;throw error;}finally{save();}
