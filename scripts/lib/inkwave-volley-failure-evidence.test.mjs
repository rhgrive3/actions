import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {persistVolleyFailure,cleanupVolleyResources,boundedVolleySnapshot} from './inkwave-volley-failure-evidence.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'volley-evidence-pure-'));
const original=Object.assign(new Error('page.waitForFunction: Timeout 30000ms exceeded.'),{name:'TimeoutError'});
test('writes original failure before enrichment, atomically preserves it if enrichment fails',()=>{
 const detail={phase:'victim damage acceptance',engine:'chromium',results:[],sourceSha:'test-only'};
 assert.equal(persistVolleyFailure(dir,detail,original).status,'written');
 const target=path.join(dir,'volley-vortex-failure.json'),first=fs.readFileSync(target,'utf8');
 const saved=JSON.parse(first);assert.equal(saved.failure.message,original.message);assert.equal(saved.phase,detail.phase);
 const io={mkdirSync:fs.mkdirSync,writeFileSync(){throw Error('disk full');},renameSync(){throw Error('must not rename');}};
 assert.equal(persistVolleyFailure(dir,{...detail,snapshots:[]},original,io).status,'unavailable');
 assert.equal(fs.readFileSync(target,'utf8'),first);
});
test('bounded observation captures values or failure without a retry',async()=>{
 let calls=0;assert.deepEqual(await boundedVolleySnapshot(()=>{calls++;return {hp:100};}),{status:'captured',value:{hp:100}});assert.equal(calls,1);
 assert.deepEqual(await boundedVolleySnapshot(()=>{throw Error('page closed');}),{status:'unavailable',error:'page closed'});
 assert.deepEqual(await boundedVolleySnapshot(()=>new Promise(()=>{}),5),{status:'timed-out',timeoutMs:5});
});
test('late snapshot rejection is observed after timeout',async()=>{
 let reject;const pending=new Promise((_,r)=>reject=r);
 assert.equal((await boundedVolleySnapshot(()=>pending,5)).status,'timed-out');reject(Error('late closed'));
 await new Promise(r=>setImmediate(r));
});
test('original failure object survives catch, evidence and teardown failures',async()=>{
 const order=[];let caught;
 try {try {throw original;}catch(error){persistVolleyFailure(dir,{},error);throw error;}finally{
  await cleanupVolleyResources([()=>{order.push('browser');throw Error('close');},()=>order.push('relay'),()=>order.push('server')],original);
 }}catch(error){caught=error;}
 assert.equal(caught,original);assert.deepEqual(order,['browser','relay','server']);
});
test('cleanup failure still fails otherwise successful tests, while trying every resource',async()=>{
 const order=[];await assert.rejects(cleanupVolleyResources([()=>{order.push(1);throw Error('close');},()=>order.push(2)],null),/close/);assert.deepEqual(order,[1,2]);
});

test('actual inline snapshot is bounded and read-only on synthetic state',async()=>{
 const vm=await import('node:vm');
 const script=fs.readFileSync(new URL('../check-inkwave-volley-vortex.mjs',import.meta.url),'utf8');
 const begin=script.indexOf('page.evaluate(()=>{\n  const g=globalThis.G');
 assert.ok(begin>=0);const body=script.slice(begin+'page.evaluate(()=>{'.length,script.indexOf('\n })).then(snapshot',begin));
 const fixture={hp:100,ink:100,nid:1,owner:'victim',netLife:1,alive:true,remote:false,pos:{x:0,y:0,z:5},aimDir:{x:0,y:0,z:1},weapon:{id:'slosher',kind:'slosh'}};
 const proofs=new Map([['host',Array.from({length:20},()=>({actor:0,origin:[30,0,0],unit:[0,0,1],reach:10,uses:0,maxUses:9}))]]);
 const pending=new Map([['host',[{type:'hit',d:{a:0,v:1,d:34.31,w:'slosher',g:2,h:1,seq:1,l:1,extra:'not copied'},at:1}]]]);
 const G={local:fixture,actors:[fixture],net:{myId:'victim',_setupReady:true,_members:new Map([['host',{}],['victim',{}]])},netm:{_combatProvenance:{proofs,pending,contacts:new Map()}},match:{state:'playing'},time:1};
 const result=vm.runInNewContext('(()=>{'+body+'})()',{G,Map,clock:1000,births:Array(9),volley:{s3DamageGroupId:2,owner:{nid:0}}});
 assert.equal(result.local.hp,100);assert.equal(result.combat.proofs.sampledPeers[0].count,20);
 assert.equal(result.combat.proofs.sampledPeers[0].sample.length,8);assert.equal(result.births,9);
 assert.equal(result.combat.pending.sampledPeers[0].sample[0].claim.extra,undefined);
 assert.equal(proofs.get('host').length,20);assert.equal(proofs.get('host')[0].uses,0);assert.equal(fixture.hp,100);
});
