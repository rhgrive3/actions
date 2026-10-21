// Historical 0dec529d source replay; latest PR sources use the separate reviewed-pair gate.
import {historicalSource} from '../lib/inkwave-historical-baseline-sources.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {alignRollerBirthBaseline} from '../lib/inkwave-roller-birth-baseline.mjs';
import {CHARACTER_POSE_MANIFEST,planCharacterPoseBaseline} from '../lib/inkwave-character-pose-baseline.mjs';
const read=p=>historicalSource(p.endsWith('/weapons-fidelity.mjs')?'paint':'pose',p);
const physics=read('patches/splatoon3/runtime/weapons-fidelity.mjs');
const install=read('patches/splatoon3/runtime/install.mjs');
const file='patches/splatoon3/runtime/install.mjs';
const rows=CHARACTER_POSE_MANIFEST.files.filter(r=>r.path===file);
const oldInstall=install.replace("import { installBrellaNetwork } from './brella-network.mjs';\n",'').replace('  installBrellaNetwork(api);\n','');
const map=s=>new Map([[file,s],['unrelated','preserve this']]);
test('current owner birth is admitted unchanged, unrelated candidate content never copied',()=>{
 const b=physics+'\n// baseline-only context';const c=physics+'\n// candidate-only context';
 assert.deepEqual(alignRollerBirthBaseline(b,c),{source:b,changes:[]});
});
test('current owner rejects old birth, mixed, duplicate and physics mutations on either side',()=>{
 const changes=[['height: 1.35','height: 1.36'],['forward: 0.6','forward: 0.7'],['*0.5,j=','*0.6,j='],['const stacked=vertical&&','const stacked=!vertical&&'],['baseHeight+offset*perGlobHeight','baseHeight+perGlobHeight'],['out.z-=','out.z+='],['out.y+=(Math.random()*2-1)*j;','out.y+=0;'],['addRollerSpawnOffset(rollerSpawnBase(actor,p.pos),actor,unit,offset,count,vertical);','addRollerSpawnOffset(p.pos,actor,unit,offset,count,vertical);']];
 for(const [from,to]of changes){assert.ok(physics.includes(from));const bad=physics.replace(from,to);assert.throws(()=>alignRollerBirthBaseline(bad,physics));assert.throws(()=>alignRollerBirthBaseline(physics,bad));}
 for(const bad of ['',physics+physics,physics+'\nexport function addRollerSpawnOffset() {}'])assert.throws(()=>alignRollerBirthBaseline(bad,physics));
});
test('independent numeric birth cases verify base, half span, stack, Flingza fan and RNG ordering',()=>{
 const start=physics.indexOf('export const ROLLER_SPAWN_BASE'),end=physics.indexOf('export function configureFidelityFlick',start);
 const sequence=[.1,.2,.3];let calls=0;const context={Math:Object.assign(Object.create(Math),{random:()=>sequence[calls++]}),exports:{}};
 vm.runInNewContext(physics.slice(start,end).replaceAll('export ','')+';exports.base=rollerSpawnBase;exports.offset=addRollerSpawnOffset;',context);
 const actor={yaw:0,pos:{x:2,y:3,z:4}},out={set(x,y,z){Object.assign(this,{x,y,z});return this;}};
 context.exports.base(actor,out);assert.deepEqual([out.x,out.y,out.z],[2,4.35,4.6]);
 context.exports.offset(out,actor,{SpawnPositionWidth:2,SpawnPositionRandomCube:.1,SpawnPositionOffsetHeight:.4,SpawnPositionHeight:.25},1,2,false);
 assert.ok(Math.abs(out.x-2.92)<1e-9);assert.ok(Math.abs(out.z-4.54)<1e-9);assert.ok(Math.abs(out.y-4.96)<1e-9);assert.equal(calls,3);
 calls=0;out.set(0,0,0);context.exports.offset(out,actor,{SpawnPositionOffsetHeight:-1.25,SpawnPositionHeight:.25},2,3,true);assert.equal(out.y,-.75);assert.equal(calls,0);
 calls=0;out.set(0,0,0);context.exports.offset(out,actor,{SpawnWideDegree:18,SpawnPositionWidth:2,SpawnPositionRandomCube:0,SpawnPositionOffsetHeight:0,SpawnPositionHeight:1},5,6,true);assert.equal(out.y,1);assert.equal(out.x,1);assert.equal(calls,3);
});
test('Brella exact two-line migration preserves all source and actual reference hash',()=>{
 const p=planCharacterPoseBaseline(map(oldInstall),map(install),rows);assert.equal(p.sources.get(file),install);assert.equal(p.sources.get('unrelated'),'preserve this');assert.equal(p.changes.length,1);
 assert.equal(planCharacterPoseBaseline(map(install),map(install),rows).changes.length,0);
 assert.throws(()=>planCharacterPoseBaseline(map(install),map(oldInstall),rows));
});
test('Brella duplicate, partial, renamed and unrelated source mutations fail closed',()=>{
 const bad=[install+"\n  installBrellaNetwork(api);\n",install.replace('  installBrellaNetwork(api);\n',''),install.replace('installBrellaNetwork(api);','installBrellaNetwork(other);'),install+'\n// unreviewed'];
 for(const s of bad){assert.throws(()=>planCharacterPoseBaseline(map(oldInstall),map(s),rows));assert.throws(()=>planCharacterPoseBaseline(map(s),map(install),rows));}
});
test('reviewed current pose owners require identical full source and reject mutation/mixed epochs',()=>{
 for(const row of CHARACTER_POSE_MANIFEST.files.filter(r=>['roller.mjs','family-holds.mjs','kit.mjs','registry.mjs','stringers.mjs'].some(n=>r.path.endsWith('/'+n)))){
 const source=read(row.path),base=new Map([[row.path,source]]);assert.equal(planCharacterPoseBaseline(base,base,[row]).changes.length,0);
 for(const bad of [source+'\n// mutation',source.replace(/const /,'let '),'old pose']){
 assert.throws(()=>planCharacterPoseBaseline(new Map([[row.path,bad]]),base,[row]));
 assert.throws(()=>planCharacterPoseBaseline(base,new Map([[row.path,bad]]),[row]));
 }
 }
});
