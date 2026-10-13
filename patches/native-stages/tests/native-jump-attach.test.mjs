import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {nativeStageCatalog,nativeBrowserStageIntegrity} from '../../../scripts/lib/inkwave-native-stages.mjs';
import {nativeFixture} from './fixture.mjs';

test('normal-jump attachment is explicit and invalidates the source navigation cache',()=>{
 const dir=fs.mkdtempSync(path.resolve('.ci-scratch/jump-attach-catalog-')),base={id:'probe',internal:'Vss_Probe00',name:'Probe',tree:'b'.repeat(40),sourceSha256:'a'.repeat(64),bounds:{minX:-10,minZ:-10,maxX:10,maxZ:10},spawnPads:[[0,1,-8],[0,1,8]],spawnBarrier:2.5,placementStatus:'inferred source supports',version1130Verified:false},write=value=>fs.writeFileSync(path.join(dir,'probe.json'),JSON.stringify({...base,sourceNavigation:value}));
 try{for(const value of [{wallJumpAttach:true},{wallClimb:true,wallJumpAttach:true},{wallClimb:true,wallJumpAttach:true,wallSurge:true,highDrops:true}]){write(value);assert.deepEqual(nativeStageCatalog(dir).stages.at(-1).sourceNavigation,value);assert.notEqual(nativeBrowserStageIntegrity(base),nativeBrowserStageIntegrity({...base,sourceNavigation:value}));}for(const value of [{wallJumpAttach:false},{wallJumpAttach:1},{wallJumpAttach:true,fly:true}]){write(value);assert.throws(()=>nativeStageCatalog(dir),/source navigation/);}for(const s of nativeStageCatalog().stages)assert.equal(s.sourceNavigation?.wallJumpAttach,undefined);}finally{fs.rmSync(dir,{recursive:true});}
});

test('legacy and unopted native brains keep their selected ordinary inputs',async()=>{
 const f=await nativeFixture(),a=f.make('shooter'),brain=new f.BotBrain(a,'normal');a.intent.fire=a.intent.jump=a.intent.squid=true;a.intent.move.set(1,0,0);const before=a.pos.toArray(),velocity=a.vel.toArray();
 for(const manifest of [undefined,{sourceNavigation:{wallClimb:true,highDrops:true}}]){f.G.level.manifest=manifest;assert.equal(f.updateNativeJumpAttach(brain,f.G,1/60),false);assert.deepEqual(Array.from(a.intent.move.toArray()),[1,0,0]);assert.equal(a.intent.fire,true);assert.equal(a.intent.jump,true);assert.equal(a.intent.squid,true);assert.deepEqual(Array.from(a.pos.toArray()),Array.from(before));assert.deepEqual(Array.from(a.vel.toArray()),Array.from(velocity));}
});

test('plain source climb never consumes a different or unknown traversal kind',async()=>{
 const f=await nativeFixture(),a=f.make('shooter'),brain=new f.BotBrain(a,'normal');f.G.level.manifest={sourceNavigation:{wallClimb:true,wallJumpAttach:true}};a.intent.fire=a.intent.jump=true;a.intent.move.set(1,0,0);brain.path=[0,1];brain.pi=1;
 for(const kind of ['jump-attach','surge','approach','unknown']){f.G.nav={nodes:[{id:0,x:0,y:0,z:0,nb:[{to:1,type:'climb',climb:{kind}}]},{id:1,x:1,y:4,z:0,nb:[]}]};assert.equal(f.updateNativeClimb(brain,f.G,1/60),false);assert.equal(a.intent.fire,true);assert.equal(a.intent.jump,true);assert.deepEqual(Array.from(a.intent.move.toArray()),[1,0,0]);}
});
