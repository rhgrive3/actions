import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const dependency="import { closeReceiverSprinklers } from './sprinkler-contact-commit.mjs';";
let birthSource=readFileSync(new URL('../sub-birth-commit.mjs',import.meta.url),'utf8');
assert.equal(birthSource.split(dependency).length,2,'exact audited lifecycle dependency');
birthSource=birthSource.replace(dependency,'').replaceAll('export function ','function ');
const contactSource=readFileSync(new URL('../sprinkler-contact-commit.mjs',import.meta.url),'utf8').replaceAll('export function ','function ');
for(const code of [birthSource,contactSource])assert.doesNotMatch(code,/\b(?:import|require|process|fetch|WebSocket|globalThis|eval|Function)\s*(?:[.(]|\{)/,'new capabilities require a fresh boundary audit');
// Execute the actual lifecycle helper in its own lexical scope, not a no-op stub.
const source='const closeReceiverSprinklers=(()=>{'+contactSource+';return closeReceiverSprinklers;})();\n'+birthSource;
const setup=`
const actor={nid:1,owner:'peer',remote:true,net:{buf:[{t:1,life:2,x:0,y:1,z:0}]}},peer={};
const nm={match:{},cfg:{id:'match'},s:{_members:new Set(['peer'])},byNid:new Map([[1,actor]]),peers:new Map([['peer',peer]])};
const event=[1,'ac','sub',1,2,{v:1,phase:'spawn',subId:'torpedo',seq:3,life:2,sourceLife:2,seed:7,charge:0,x:0,y:1,z:0,vx:0,vy:1,vz:2},5,6];
event._netPeer='peer';event._netTick=5;event._netSeq=6;
let commits=0,flushes=0,receipt=null,nativeCalls=0;
bindSubBirthCommit(nm,r=>{commits++;flushes++;receipt=r;});
const stage=()=>stageAcceptedSubBirth(nm,'peer',event,1,5);
const created={owner:actor,seq:3,sourceLife:2,subId:'torpedo'};
const replay=(status='created',result=true)=>replayWithSubBirthCommit(nm,'peer',event,report=>{nativeCalls++;report?.(status,created);return result;});
`;
function check(name,body){test(name,()=>{const c=vm.createContext({assert});new vm.Script(source+'\n'+setup+'\n'+body).runInContext(c,{timeout:100});});}
check('valid accepted queue token has no proof before replay',`assert.equal(stage(),true);assert.equal(commits,0);assert.equal(flushes,0);`);
check('created native result commits and flushes exactly once',`stage();assert.equal(replay(),true);assert.equal(commits,1);assert.equal(flushes,1);replay();assert.equal(commits,1);`);
check('reused native object never mints',`stage();assert.equal(replay('reused'),true);assert.equal(commits,0);assert.equal(flushes,0);`);
check('native false never commits',`stage();assert.equal(replay('created',false),false);assert.equal(commits,0);`);
check('native exception preserved and token consumed',`stage();const err=new Error('native');assert.throws(()=>replayWithSubBirthCommit(nm,'peer',event,()=>{throw err}),e=>e===err);replay();assert.equal(commits,0);`);
check('no FIFO admission means no token even with forged packet authority',`event.authority=true;event.created=true;assert.equal(replay(),true);assert.equal(commits,0);`);
check('invalid owner tick fails',`assert.equal(stageAcceptedSubBirth(nm,'peer',event,1,4),false);replay();assert.equal(commits,0);`);
check('invalid transport seq fails',`event._netSeq=0;assert.equal(stage(),false);replay();assert.equal(commits,0);`);
check('invalid transport tick fails',`event._netTick=4;assert.equal(stage(),false);replay();assert.equal(commits,0);`);
check('missing accepted snapshot cannot use current actor position',`actor.pos={x:0,y:1,z:0};actor.net.buf=[];assert.equal(stage(),false);replay();assert.equal(commits,0);`);
check('sourceLife mismatch fails',`event[5].sourceLife=1;assert.equal(stage(),false);`);
check('native missing seed charge rejection does not commit',`delete event[5].seed;delete event[5].charge;stage();replay('rejected',false);assert.equal(commits,0);`);
check('event mutation after stage fails',`stage();event[5].seq=99;replay();assert.equal(commits,0);`);
check('peer replacement after stage fails',`stage();nm.peers.set('peer',{});replay();assert.equal(commits,0);`);
check('match replacement after stage fails',`stage();nm.match={};replay();assert.equal(commits,0);`);
check('actor replacement after stage fails',`stage();nm.byNid.set(1,{...actor});replay();assert.equal(commits,0);`);
check('event mutation during replay fails',`stage();replayWithSubBirthCommit(nm,'peer',event,report=>{report('created',created);event[5].seed=8;return true;});assert.equal(commits,0);`);
check('unrelated created object cannot commit',`stage();created.seq=4;replay();assert.equal(commits,0);`);
check('birth pose is frozen and unrelated current movement is irrelevant',`stage();actor.pos={x:20,y:10,z:30};actor.net.buf[0].x=99;replay();assert.equal(commits,1);assert.equal(receipt.pose[0],0);assert.equal(Object.isFrozen(receipt.pose),true);`);
check('new wire identity with reused birth still cannot mint again',`stage();replay();event[7]=7;event._netSeq=7;event[0]=1;stage();replay('reused');assert.equal(commits,1);assert.equal(flushes,1);`);
check('owner change invalidates staged token',`stage();actor.owner='other';replay();assert.equal(commits,0);`);
check('explicit lifecycle close invalidates staged token',`stage();closeSubBirthCommit(nm);bindSubBirthCommit(nm,()=>{commits++;});replay();assert.equal(commits,0);`);

check('close during native replay prevents stale commit',`stage();replayWithSubBirthCommit(nm,'peer',event,report=>{report('created',created);closeSubBirthCommit(nm);return true;});assert.equal(commits,0);`);
check('close and rebind during native replay prevents old-state commit',`stage();replayWithSubBirthCommit(nm,'peer',event,report=>{report('created',created);closeSubBirthCommit(nm);bindSubBirthCommit(nm,()=>{commits++;});return true;});assert.equal(commits,0);`);
