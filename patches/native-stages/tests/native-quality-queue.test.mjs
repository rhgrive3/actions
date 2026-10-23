import test from 'node:test';
import * as nativeGpuBudget from '../runtime/native-gpu-budget.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

if(!vm.SourceTextModule){
 test('native quality queue subprocess',()=>{const env={...process.env};delete env.NODE_TEST_CONTEXT;execFileSync(process.execPath,['--experimental-vm-modules','--test',fileURLToPath(import.meta.url)],{env,stdio:'pipe'});});
}else{

const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture({initial='high',load,roleCap=512}={}){
 const counts={paint:0,shadows:0,fx:0,loads:0,handoffs:0,closed:0,disposed:0},pending=[],parent=new AbortController();
 const data={manifest:{id:'stage'}},G={paint:{texture:{},size:2048,ppm:8},renderer:{capabilities:{maxTextureSize:4096}},match:null};
 const caps=quality=>({maxDimension:quality==='high'?1024:512,perRole:quality==='high'?{normal:roleCap}:{}});
 const makeTextures=()=>new Map([['a',{image:{close(){counts.closed++;}},dispose(){counts.disposed++;}}]]);
 const world={level:{data,layout:{id:'stage'}},metrics:{},textureProfile:{data,quality:initial,caps:caps(initial)},display:{updateTextures(textures,quality){counts.handoffs++;world.received=textures;world.receivedQuality=quality;}}};
 const game={nativeWorld:world,_nativeAbort:parent},deps={G,q:{paintAtlas:2048,shadowSize:2048,particles:.7},updatePaintQuality(){counts.paint++;},updateEnvironmentShadowQuality(){counts.shadows++;},updateFXQuality(){counts.fx++;}};
 const context=vm.createContext({console:{warn(){}},AbortController,Promise,navigator:{deviceMemory:4}});
 const values={three:{LinearFilter:1},'./native-gpu-budget.mjs':{...nativeGpuBudget},'./native-texture-budget.mjs':{nativeStageTextureCaps:(_m,q)=>caps(q)},'./native-load.mjs':{loadNativeTextures:async(...args)=>{
  counts.loads++;if(load)return load(args,makeTextures);
  return new Promise((resolve,reject)=>pending.push({signal:args[4],resolve:()=>resolve(makeTextures()),reject}));
 }}};
 const mod=new vm.SourceTextModule(fs.readFileSync(new URL('../runtime/native-quality.mjs',import.meta.url),'utf8'),{context});
 await mod.link(spec=>{const v=values[spec];assert(v,spec);return new vm.SyntheticModule(Object.keys(v),function(){for(const k in v)this.setExport(k,v[k]);},{context});});await mod.evaluate();
 return {world,game,deps,parent,counts,pending,makeTextures,change:q=>mod.namespace.applyNativeQuality(game,{quality:q},{touch:false},deps),setRoleCap:n=>roleCap=n};
}
test('High/Ultra preserve initial textures but still apply all other quality settings',async()=>{
 const f=await fixture({load:async(_a,make)=>make()});await f.change('ultra');await f.change('high');
 assert.equal(f.counts.loads,0);assert.equal(f.counts.handoffs,0);assert.equal(f.counts.paint,2);assert.equal(f.counts.shadows,2);assert.equal(f.counts.fx,2);
});
test('rapid quality changes abort and drain old decoding before starting latest request',async()=>{
 const f=await fixture();const a=f.change('low');await tick();assert.equal(f.pending.length,1);
 const b=f.change('medium');const c=f.change('low');await tick();
 assert.equal(f.pending[0].signal.aborted,true);assert.equal(f.counts.loads,1,'not even a second pipeline while old decoder drains');
 f.pending[0].resolve();await tick();assert.equal(f.counts.loads,2);assert.equal(f.pending[1].signal.aborted,false);
 f.pending[1].resolve();await Promise.all([a,b,c]);
 assert.equal(f.counts.handoffs,1);assert.equal(f.world.receivedQuality,'low');assert.equal(f.counts.closed,1);assert.equal(f.counts.disposed,1);assert.equal(f.world.qualityOperation,null);
});
test('return to current profile cancels obsolete work without decoding replacement',async()=>{
 const f=await fixture();const a=f.change('low');await tick();const b=f.change('ultra');assert(f.pending[0].signal.aborted);
 f.pending[0].resolve();await Promise.all([a,b]);assert.equal(f.counts.loads,1);assert.equal(f.counts.handoffs,0);assert.equal(f.counts.disposed,1);
});
test('same pending texture profile coalesces and remains publishable',async()=>{
 const f=await fixture({initial:'low'});const a=f.change('high');await tick();const b=f.change('ultra');
 assert.equal(f.counts.loads,1);assert.equal(f.pending[0].signal.aborted,false);
 f.pending[0].resolve();await Promise.all([a,b]);assert.equal(f.counts.handoffs,1);assert.equal(f.game._builtQuality,'ultra');
});
test('world cancellation cannot publish and releases completed textures exactly once',async()=>{
 const f=await fixture();const a=f.change('low');await tick();f.parent.abort();assert.equal(f.pending[0].signal.aborted,true);
 f.pending[0].resolve();await a;assert.equal(f.counts.handoffs,0);assert.equal(f.counts.closed,1);assert.equal(f.counts.disposed,1);
});
test('failure keeps valid old profile, retries and clears only current error',async()=>{
 let failures=1;const f=await fixture({load:async(_a,make)=>{if(failures--)throw Error('decode');return make();}});
 await f.change('low');assert.equal(f.world.textureProfile.quality,'high');assert.equal(f.world.metrics.qualityError,'decode');
 await f.change('low');assert.equal(f.counts.loads,2);assert.equal(f.world.textureProfile.quality,'low');assert.equal(f.world.metrics.qualityError,undefined);
});
test('per-role cap change is not mistaken for the same effective texture profile',async()=>{
 const f=await fixture({load:async(_a,make)=>make()});f.setRoleCap(256);await f.change('ultra');assert.equal(f.counts.loads,1);assert.equal(f.counts.handoffs,1);
});
test('stage replacement while loading disposes stale result without rebinding either world',async()=>{
 const f=await fixture();const a=f.change('low');await tick();f.game.nativeWorld={};f.pending[0].resolve();await a;assert.equal(f.counts.handoffs,0);assert.equal(f.counts.disposed,1);
});
}
