#!/usr/bin/env node
// Test-only pinned Scorch conversion. Nothing here is copied into the public
// build; the ordinary runtime continues its existing browser-direct loading.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {SOURCE_STAGES,sourceURL,SOURCE_COMMIT} from '../patches/native-stages/runtime/source-catalog.mjs';
import {convertSource} from '../patches/native-stages/runtime/source-convert.mjs';
const args=process.argv.slice(2),arg=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
const out=arg('--out'),local=arg('--source-dir');
assert.ok(out,'--out is required');assert.ok(!fs.existsSync(out),'refuse an existing output directory');
const stage=SOURCE_STAGES.find(s=>s.id==='scorch'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
async function read(name,url){
 if(local)return fs.readFileSync(path.join(local,name));
 const response=await fetch(url,{signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw Error(`${name}: HTTP ${response.status}`);
 return Buffer.from(await response.arrayBuffer());
}
const obj=await read(stage.internal+'.obj',sourceURL(stage,stage.internal+'.obj'));
assert.equal(hash(obj),stage.sourceSha256,'pinned OBJ SHA-256');
const treeBytes=await read('tree.json',`https://api.github.com/repos/kirakira-dev/KiTrix/git/trees/${stage.tree}?recursive=1`);
const tree=JSON.parse(treeBytes);assert.equal(tree.sha,stage.tree,'pinned tree');assert.equal(tree.truncated,false,'complete tree');
const files={};for(const row of tree.tree)if(row.type==='blob')files[row.path]={bytes:row.size,gitSha1:row.sha};
const mtl=await read(stage.internal+'.mtl',sourceURL(stage,stage.internal+'.mtl'));
const expected=files[stage.internal+'.mtl'];assert.ok(expected,'pinned MTL entry');assert.equal(mtl.length,expected.bytes);
assert.equal(crypto.createHash('sha1').update('blob '+mtl.length+'\0').update(mtl).digest('hex'),expected.gitSha1,'pinned MTL Git blob');
const data=convertSource(stage,obj.toString(),mtl.toString(),files);
assert.equal(data.triangles.length/9,133737,'reviewed Scorch collision input');
fs.mkdirSync(out);const dir=path.join(out,stage.id);fs.mkdirSync(dir);
const names={triangles:'collision',objectIds:'objects',nodes:'bvh'},written={};
for(const key of ['vertices','indices','triangles','normals','flags','objectIds','nodes','order','triangleFace','mask']){
 const v=data[key],bytes=Buffer.from(v.buffer,v.byteOffset,v.byteLength),name=(names[key]||key)+'.bin';fs.writeFileSync(path.join(dir,name),bytes,{flag:'wx'});written[name]=hash(bytes);
}
const manifest=Buffer.from(JSON.stringify(data.manifest));fs.writeFileSync(path.join(dir,'manifest.json'),manifest,{flag:'wx'});written['manifest.json']=hash(manifest);
const receipt={schema:1,stage:stage.id,sourceCommit:SOURCE_COMMIT,objSha256:hash(obj),tree:tree.sha,mtlGitSha1:expected.gitSha1,collisionTriangles:data.triangles.length/9,files:written,limits:'Pinned display geometry converted through the production recipe; retail collision, scale and placement parity remain unverified. Test-only assets must not be included in the public build.'};
fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(receipt));
