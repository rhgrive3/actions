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

// Synthetic typed-edge lifecycle controls; source flight is covered separately.
test('ordinary approach releases stale actor and match lifetimes and boarding ownership',async()=>{
const f=await nativeFixture(),baseLevel=f.G.level,baseMatch=f.G.match,rows=[];
f.G.physics.raycast=()=>({hit:false});
function rig(){
 f.G.level=baseLevel;f.G.match=baseMatch;f.G.level.native=true;f.G.level.manifest={sourceNavigation:{wallApproach:true}};
 const a=f.make('shooter'),brain=new f.BotBrain(a,'normal'),v=a.pos.toArray(),start=[v[0]+1,v[1],v[2]],goal=[v[0]+3,v[1],v[2]],edge={to:1,type:'climb',climb:{kind:'gap-jump',lower:start,upper:goal}};
 f.G.nav={nodes:[{id:0,x:start[0],y:start[1],z:start[2],nb:[edge]},{id:1,x:goal[0],y:goal[1],z:goal[2],nb:[]}]};brain.path=[0,1];brain.pi=1;assert.equal(f.updateNativeApproach(brain,f.G,1/60),true);assert.equal(brain._nativeApproach.phase,'plant');
 a.intent.move.set(.7,0,.2);a.intent.fire=a.intent.jump=a.intent.squid=true;
 return {a,brain};
}
const snapshot=a=>JSON.stringify({intent:a.intent,pos:a.pos,vel:a.vel,serial:a.s3JumpSerial});
for(const name of ['legacy','opt-off','dead','spawn','special','super-jump','no-path','life','actor','match','mode','nav','level','boarding']){
 const h=rig(),{a,brain}=h;
 if(name==='legacy')f.G.level.native=false;
 if(name==='opt-off')f.G.level.manifest.sourceNavigation={};
 if(name==='dead')a.alive=false;
 if(name==='spawn')a.s3.squidSpawn={};
 if(name==='special')a.specialActive={};
 if(name==='super-jump')a.superJumpState={};
 if(name==='no-path')brain.path=null;
 if(name==='life')a.netLife=(a.netLife||0)+1;
 if(name==='actor')brain.a=f.make('shooter');
 if(name==='match')f.G.match={...baseMatch};
 if(name==='mode')brain.mode='peer-different-mode';
 if(name==='nav')f.G.nav={nodes:f.G.nav.nodes};
 if(name==='boarding')brain._nativeTowerBoarding={};
 if(name==='level')f.G.level={...baseLevel};
 const before=snapshot(a),handled=f.updateNativeApproach(brain,f.G,1/60),unchanged=snapshot(a)===before,cleared=brain._nativeApproach===null;
 assert.equal(handled,false,name+' ownership must release');assert(unchanged,name+' must preserve current input/physical state');assert(cleared,name+' must clear traversal phase');
 rows.push({name,handled,inputAndPhysicalStateUnchanged:unchanged,traversalCleared:cleared,pathAborted:brain.path===null});
}
assert.equal(rows.length,14);
});

test('stale replacement navigation with missing nodes aborts before any old path dereference',async()=>{
 const f=await nativeFixture(),baseLevel=f.G.level;f.G.physics.raycast=()=>({hit:false});baseLevel.native=true;baseLevel.manifest={sourceNavigation:{wallApproach:true}};
 for(const pi of [0,1]){const a=f.make('shooter'),b=new f.BotBrain(a,'normal'),v=a.pos.toArray(),start=[v[0]+1,v[1],v[2]],goal=[v[0]+3,v[1],v[2]],edge={to:1,type:'climb',climb:{kind:'gap-jump',lower:start,upper:goal}};f.G.nav={nodes:[{id:0,x:start[0],y:start[1],z:start[2],nb:[edge]},{id:1,x:goal[0],y:goal[1],z:goal[2],nb:[]}]};b.path=[0,1];b.pi=1;assert(f.updateNativeApproach(b,f.G,1/60));b.pi=pi;f.G.nav={nodes:[]};a.intent.move.set(.7,0,.2);a.intent.fire=a.intent.jump=a.intent.squid=true;const snapshot=()=>JSON.stringify({input:a.intent,position:a.pos,velocity:a.vel,serial:a.s3JumpSerial}),before=snapshot();assert.equal(f.updateNativeApproach(b,f.G,1/60),false);assert.equal(b.path,null);assert.equal(b._nativeApproach,null);assert.equal(snapshot(),before);}
});
