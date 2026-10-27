import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {verifySourceBytes} from '../runtime/source-cache.mjs';
const source=fs.readFileSync(new URL('../runtime/source-worker.mjs',import.meta.url),'utf8');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const git=b=>crypto.createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');
const obj=Buffer.from([1,2]),mtl=Buffer.from('ABC'),treePin='b'.repeat(40);
const tree=()=>({sha:treePin,truncated:false,tree:[{type:'blob',path:'Stage.mtl',size:mtl.length,sha:git(mtl)}]});
const proof=()=>({id:'x',runtimeSha256:'r',recipe:'recipe',tree:treePin,inventory:tree()});
async function run({verifiedInventory,corruptMTL=false}={}){
 let trees=0,converted=0;const pins=[],messages=[];
 const context=vm.createContext({AbortController,TextDecoder,performance:{now:()=>0},self:{navigator:{},postMessage:value=>messages.push(value)}});
 const values={
  './source-catalog.mjs':{SOURCE_RECIPE:'recipe',SOURCE_STAGES:[{id:'x',internal:'Stage',tree:treePin,sourceSha256:sha(obj)}],sourceURL:(_s,f)=>f,sourceObjectBytes:()=>obj.length},
  './source-cache.mjs':{readDerived:async()=>null,writeDerived:async()=>{},sourceTree:async()=>{trees++;return tree();},sourceBytes:async(_id,file,pin)=>{pins.push({file,pin});const bytes=file.endsWith('.obj')?obj:corruptMTL?Buffer.from('BAD'):mtl;await verifySourceBytes(bytes,pin);return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length);}},
  './source-convert.mjs':{convertSource:()=>{converted++;return {...Object.fromEntries(['vertices','indices','triangles','normals','flags','objectIds','nodes','order','triangleFace','mask'].map(k=>[k,new Uint8Array(0)])),manifest:{objects:[],faces:[]}};}}
 };
 const module=new vm.SourceTextModule(source,{context});await module.link(p=>new vm.SyntheticModule(Object.keys(values[p]),function(){for(const[k,v]of Object.entries(values[p]))this.setExport(k,v)},{context}));await module.evaluate();
 await context.self.onmessage({data:{id:'x',runtimeSha256:'r',verifiedInventory}});return {trees,converted,pins,messages,last:messages.at(-1)};
}
test('private warm proof avoids only the tree reconstruction and retains actual per-payload integrity checks',async()=>{
 const cold=await run(),warm=await run({verifiedInventory:proof()});assert.equal(cold.trees,1);assert.equal(warm.trees,0);assert.equal(cold.converted,1);assert.equal(warm.converted,1);
 assert.deepEqual(structuredClone(warm.pins),structuredClone(cold.pins));assert.equal(warm.pins[0].pin.sha256,sha(obj));assert.equal(warm.pins[1].pin.gitSha1,git(mtl));
 const corrupt=await run({verifiedInventory:proof(),corruptMTL:true});assert.equal(corrupt.trees,0);assert.equal(corrupt.converted,0);assert.match(corrupt.last.error,/integrity mismatch/);
});
test('foreign recipe, runtime, id, tree or incomplete inventory requires the full pinned tree path',async()=>{
 for(const mutate of [p=>p.id='y',p=>p.runtimeSha256='other',p=>p.recipe='other',p=>p.tree='c'.repeat(40),p=>p.inventory.sha='c'.repeat(40),p=>p.inventory.truncated=true,p=>p.inventory.tree=null]){
  const p=proof();mutate(p);const result=await run({verifiedInventory:p});assert.equal(result.trees,1);assert.equal(result.converted,1);
 }
});
test('warm blob paths, sizes, SHA shapes and required MTL are still validated before use',async()=>{
 for(const mutate of [p=>p.inventory.tree[0].path='../Stage.mtl',p=>p.inventory.tree[0].path='bad\\name',p=>p.inventory.tree[0].path='bad\0name',p=>p.inventory.tree[0].size=-1,p=>p.inventory.tree[0].size=.5,p=>p.inventory.tree[0].sha='bad',p=>p.inventory.tree=[]]){
  const p=proof();mutate(p);const result=await run({verifiedInventory:p});assert.equal(result.trees,0);assert.equal(result.converted,0);assert.equal(result.pins.length,1);assert(result.last.error);
 }
});
