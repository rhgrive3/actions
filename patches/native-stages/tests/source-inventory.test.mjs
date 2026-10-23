import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {nativeStageCatalog,nativeStageIdentity} from '../../../scripts/lib/inkwave-native-stages.mjs';
import {validateSourceInventory,loadPinnedSourceTree} from '../runtime/source-inventory.mjs';
import {sourceTree} from '../runtime/source-cache.mjs';
const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
const encode=v=>Buffer.from(JSON.stringify(v));
const file=pin=>new URL('../source-inventories/'+pin+'.json',import.meta.url);
const cache=fs.readFileSync(new URL('../runtime/source-cache.mjs',import.meta.url),'utf8');
const pins=JSON.parse(cache.match(/const PINNED_SOURCE_TREES=Object.freeze\((\{[\s\S]*?\})\);/)[1]);
const stages=nativeStageCatalog().stages;
// Git itself is an independent oracle, including its mode spelling and raw
// SHA-byte format. Names exercise directory/file prefix order and UTF-8 order.
function gitTree(rows){
 const sorted=rows.slice().sort((a,b)=>Buffer.compare(Buffer.from(a[1]+(a[0]==='040000'?'/':'')),Buffer.from(b[1]+(b[0]==='040000'?'/':''))));
 const body=Buffer.concat(sorted.map(([mode,name,sha])=>Buffer.concat([Buffer.from(mode.replace(/^0+/,'')+' '+name+'\0'),Buffer.from(sha,'hex')])));
 const result=spawnSync('git',['hash-object','-t','tree','--stdin'],{input:body,encoding:'utf8'});assert.equal(result.status,0,result.stderr);return result.stdout.trim();
}
function fixture(){
 const blob='1'.repeat(40),empty=gitTree([]),nested=gitTree([['100644','猫',blob]]);
 const rows=[['100755','a.c',blob,1],['040000','a',nested,null],['100644','a0',blob,2],['040000','empty',empty,null],['120000','link',blob,3],['160000','module',blob,null],['100644','é',blob,4]];
 const tree=gitTree(rows);return {schema:1,tree,entries:[...rows,['100644','a/猫',blob,5]]};
}
test('all 23 byte-pinned inventories reconstruct every authentic Git tree',async()=>{
 let count=0,bytes=0;assert.equal(stages.length,23);assert.equal(Object.keys(pins).length,23);
 const identity=nativeStageIdentity();for(const stage of stages)assert.equal(identity['source-inventories/'+stage.tree+'.json'],pins[stage.tree]);
 for(const stage of stages){const body=fs.readFileSync(file(stage.tree)),tree=await validateSourceInventory(stage.tree,body,pins[stage.tree]);assert.equal(tree.sha,stage.tree);assert.equal(tree.truncated,false);count+=tree.tree.length;bytes+=body.length;for(const entry of tree.tree)assert.deepEqual(Object.keys(entry).sort(),(entry.type==='blob'?['mode','path','sha','size','type']:['mode','path','sha','type']).sort());}
 assert.equal(count,8331);assert.equal(bytes,775671);
});
test('canonical Git mode/name sorting matches git hash-object for nested/empty trees and UTF8',async()=>{const value=fixture(),body=encode(value);assert.equal((await validateSourceInventory(value.tree,body,sha256(body))).tree.length,8);});
const changes={
 foreign:v=>v.tree='2'.repeat(40),schema:v=>v.schema=2,duplicate:v=>v.entries.push(v.entries[0]),
 unsafe:v=>v.entries[0][1]='../a',absolute:v=>v.entries[0][1]='/a',nul:v=>v.entries[0][1]='a\0b',backslash:v=>v.entries[0][1]='a\\b',
 missingParent:v=>v.entries=v.entries.filter(r=>r[1]!=='a'),missingNested:v=>v.entries=v.entries.filter(r=>r[1]!=='a/猫'),
 alteredNested:v=>v.entries.find(r=>r[1]==='a/猫')[2]='2'.repeat(40),alteredRoot:v=>v.entries[0][2]='2'.repeat(40),
 unknownMode:v=>v.entries[0][0]='100600',negativeSize:v=>v.entries[0][3]=-1,nonIntegerSize:v=>v.entries[0][3]=0.5,treeSize:v=>v.entries.find(r=>r[1]==='a')[3]=3,
 extraColumn:v=>v.entries[0].push('bad'),badSha:v=>v.entries[0][2]='g'.repeat(40)
};
for(const [name,change]of Object.entries(changes))test('rejects '+name+' even with a newly computed metadata SHA256',async()=>{const value=fixture(),pinned=value.tree;change(value);const body=encode(value);await assert.rejects(validateSourceInventory(pinned,body,sha256(body)));});
test('byte pin binds sizes, order and stale/corrupt payloads independently of Git IDs',async()=>{
 const stage=stages[0],body=fs.readFileSync(file(stage.tree));
 for(const mutate of [v=>v.entries.find(r=>r[0]==='100644')[3]++,v=>v.entries.reverse(),v=>v.tree='2'.repeat(40)]){const value=JSON.parse(body);mutate(value);await assert.rejects(validateSourceInventory(stage.tree,encode(value),pins[stage.tree]),/byte integrity/);}
 await assert.rejects(validateSourceInventory(stage.tree,fs.readFileSync(file(stages[1].tree)),pins[stage.tree]),/byte integrity/);
});
test('cold known stage fetches exactly its local metadata, without GitHub or cache APIs',async()=>{
 const original=globalThis.fetch,oldCaches=globalThis.caches,calls=[];globalThis.caches=new Proxy({},{get(){throw Error('cache must not be accessed');}});
 globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});return new Response(fs.readFileSync(url));};
 try{const stage=stages[0],tree=await sourceTree(stage.id,stage.tree);assert.equal(tree.sha,stage.tree);assert.equal(calls.length,1);assert.equal(calls[0].url,String(file(stage.tree)));assert.equal(calls[0].options.mode,'same-origin');assert.equal(calls[0].options.credentials,'omit');}
 finally{globalThis.fetch=original;globalThis.caches=oldCaches;}
});
test('known stage missing/corrupt payload fails closed without remote fallback',async()=>{
 const original=globalThis.fetch;try{for(const response of [()=>new Response('',{status:404}),()=>new Response('{}')]){let calls=0;globalThis.fetch=async()=>{calls++;return response();};await assert.rejects(sourceTree(stages[0].id,stages[0].tree));assert.equal(calls,1);}}finally{globalThis.fetch=original;}
});
test('inventory loader honors abort before fetch and during body read',async()=>{
 const original=globalThis.fetch;try{const controller=new AbortController();controller.abort();globalThis.fetch=()=>{throw Error('must not fetch');};await assert.rejects(loadPinnedSourceTree(stages[0].tree,pins[stages[0].tree],file(stages[0].tree),controller.signal),{name:'AbortError'});
 const mid=new AbortController();globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>{mid.abort();return fs.readFileSync(file(stages[0].tree));}});await assert.rejects(loadPinnedSourceTree(stages[0].tree,pins[stages[0].tree],file(stages[0].tree),mid.signal),{name:'AbortError'});
 }finally{globalThis.fetch=original;}
});
