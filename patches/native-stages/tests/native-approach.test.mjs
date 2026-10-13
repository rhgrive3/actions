import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {nativeStageCatalog,nativeBrowserStageIntegrity} from '../../../scripts/lib/inkwave-native-stages.mjs';
import {BASE_SOURCE_STAGES} from '../runtime/source-catalog.mjs';
import {nativeFixture} from './fixture.mjs';

test('source approach opt-in is strict and belongs to source cache identity',()=>{
 const dir=fs.mkdtempSync(path.resolve('.ci-scratch/source-approach-catalog-')),base={id:'probe',internal:'Vss_Probe00',name:'Probe',tree:'b'.repeat(40),sourceSha256:'a'.repeat(64),bounds:{minX:-10,minZ:-10,maxX:10,maxZ:10},spawnPads:[[0,1,-8],[0,1,8]],spawnBarrier:2.5,placementStatus:'inferred source supports',version1130Verified:false},write=value=>fs.writeFileSync(path.join(dir,'probe.json'),JSON.stringify({...base,sourceNavigation:value}));
 try{for(const value of [{wallApproach:true},{wallClimb:true,highDrops:true,wallApproach:true}]){write(value);assert.deepEqual(nativeStageCatalog(dir).stages.at(-1).sourceNavigation,value);assert.notEqual(nativeBrowserStageIntegrity(base),nativeBrowserStageIntegrity({...base,sourceNavigation:value}));}for(const value of [{wallApproach:false},{wallApproach:1},{wallApproach:true,hover:true}]){write(value);assert.throws(()=>nativeStageCatalog(dir),/source navigation/);}for(const s of BASE_SOURCE_STAGES)assert.equal(s.sourceNavigation?.wallApproach,undefined);}finally{fs.rmSync(dir,{recursive:true});}
});

test('source approach leaves legacy input and body ownership unchanged',async()=>{
 const f=await nativeFixture(),a=f.make('shooter'),b=new f.BotBrain(a,'normal');a.intent.move.set(1,0,0);a.intent.fire=a.intent.jump=a.intent.squid=true;const snapshot=()=>JSON.stringify({input:a.intent,position:a.pos,velocity:a.vel,ink:a.ink,serial:a.s3JumpSerial}),before=snapshot();
 assert.equal(f.updateNativeApproach(b,f.G,1/60),false);assert.equal(snapshot(),before);assert.equal(Object.hasOwn(b,'_nativeApproach'),false);
 const manifest=f.G.level.manifest;f.G.level.manifest={sourceNavigation:{wallApproach:true}};assert.equal(f.updateNativeApproach(b,f.G,1/60),false);assert.equal(snapshot(),before);f.G.level.manifest=manifest;
});

test('opted source approach releases special, launch and missing-path ownership without body changes',async()=>{
 const f=await nativeFixture(),a=f.make('shooter'),b=new f.BotBrain(a,'normal');f.G.level.native=true;f.G.level.manifest={sourceNavigation:{wallApproach:true}};a.intent.move.set(1,0,0);a.intent.fire=a.intent.jump=a.intent.squid=true;
 b.path=[0,1];for(const field of ['superJumpState','specialActive']){const before=JSON.stringify({input:a.intent,position:a.pos,velocity:a.vel,ink:a.ink});a[field]={};assert.equal(f.updateNativeApproach(b,f.G,1/60),false);assert.equal(JSON.stringify({input:a.intent,position:a.pos,velocity:a.vel,ink:a.ink}),before);a[field]=null;}
 b.path=null;const before=JSON.stringify(a.intent);assert.equal(f.updateNativeApproach(b,f.G,1/60),false);assert.equal(JSON.stringify(a.intent),before);
});


test('source approach profile filter rejects unqualified weapon and gear without changing ordinary edges',async()=>{
 const f=await nativeFixture(),a=f.make('shooter'),edge={climb:{kind:'approach'}};assert(f.nativeApproachEdgeAllowed(a,edge));assert(f.nativeApproachEdgeAllowed(a,{type:'walk'}));assert(!f.nativeApproachEdgeAllowed(f.make('roller'),edge));assert(!f.nativeApproachEdgeAllowed({...a,s3:{abilityPoints:{runSpeedUp:3}}},edge));assert(f.nativeApproachEdgeAllowed(f.make('roller'),{type:'climb',climb:{kind:'straight'}}));
});
