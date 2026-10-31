import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Keep this regression discoverable by the normal splatoon3 test collector.
// Recovery fixtures evaluate the real native-world module in a controlled VM.
if (!vm.SourceTextModule) {
  test('native loading cancellation VM subprocess', () => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    execFileSync(process.execPath, [
      '--experimental-vm-modules', '--experimental-global-webcrypto',
      '--test', fileURLToPath(import.meta.url),
    ], { env, stdio: 'pipe' });
  });
} else {
  const { createRecoveryFixture } = await import('../../native-stages/tests/native-world-recovery-fixture.mjs');
for(const [touch,memory] of [[true,16],[false,4]])test(`constrained loading remains serial touch=${touch} memory=${memory}`,async()=>{
 let release;const gate=new Promise(r=>release=r),events=[];const f=await createRecoveryFixture({}, {modify({mock,game}){game.mobile.touch=touch;mock.navigator.deviceMemory=memory;mock.loadNativeData=async(_id,_signal,options)=>{assert.equal(options.constrained,touch);return {manifest:{geometry:{vertices:3,triangles:1}}};};mock.loadNativeTextures=async()=>{events.push('textures');await gate;return new Map();};mock.NavGraph=class{static async createNative(){events.push('nav');return {};}};}});const pending=f.build(f.game,{id:'tiny',name:'tiny'},()=>true);await new Promise(r=>setImmediate(r));assert.deepEqual(events,['textures']);release();await pending;assert.deepEqual(events,['textures','nav']);
});
for(const compressed of [false,true])test('v14 compressed texture profile stays selected '+compressed,async()=>{
 let quality,caps;const f=await createRecoveryFixture({}, {modify({mock,game,G}){game.settings.quality='high';game.mobile.touch=true;G.renderer.extensions={has:()=>compressed};mock.loadNativeData=async()=>({manifest:{prebuiltTextures:compressed,geometry:{vertices:3,triangles:1}}});mock.loadNativeTextures=async(_id,_data,_r,q,_signal,c)=>{quality=q;caps=c;return new Map();};}});await f.build(f.game,{id:'tiny',name:'tiny'},()=>true);assert.equal(quality,'balanced');assert.equal(!!caps.fallback,compressed);
});
test('desktop genuine navigation failure survives consequent texture AbortError',async()=>{
 const failure=Error('nav failed');const f=await createRecoveryFixture({}, {modify({mock,game}){game.mobile.touch=false;mock.navigator.deviceMemory=16;mock.NavGraph=class{static async createNative(){throw failure;}};mock.loadNativeTextures=async(_id,_data,_r,_q,signal)=>new Promise((_resolve,reject)=>{const abort=()=>reject(new DOMException('Aborted','AbortError'));if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});});}});
 await assert.rejects(f.build(f.game,{id:'tiny',name:'tiny'},()=>true),e=>e===failure);assert.equal(f.G.level,f.oldLevel);assert.equal(f.counters.old,0);assert.equal(f.counters.statusClose,1);
});
for(const mode of ['signal','generation'])test('external cancellation suppresses later nav rejection '+mode,async()=>{
 let rejectNav,current=true;const f=await createRecoveryFixture({}, {modify({mock,game}){game.mobile.touch=false;mock.navigator.deviceMemory=16;mock.NavGraph=class{static createNative(){return new Promise((_resolve,reject)=>rejectNav=reject);}};mock.loadNativeTextures=async(_id,_data,_r,_q,signal)=>new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});});}});
 const p=f.build(f.game,{id:'tiny',name:'tiny'},()=>current);await new Promise(r=>setImmediate(r));if(mode==='signal')f.game._nativeAbort.abort();else current=false;rejectNav(Error('late failure'));await p;assert.equal(f.G.level,f.oldLevel);assert.equal(f.counters.old,0);assert.equal(f.counters.statusClose,1);
});
test('world suspended navigation frame abort settles and cleans resources without RAF',async()=>{
 let callback,cancelled=0;const f=await createRecoveryFixture({}, {modify({mock}){mock.requestAnimationFrame=cb=>{callback=cb;return 77;};mock.cancelAnimationFrame=id=>{assert.equal(id,77);cancelled++;};}});let settled=false;const p=f.build(f.game,{id:'tiny',name:'tiny'},()=>true).finally(()=>settled=true);await new Promise(r=>setImmediate(r));assert.equal(typeof callback,'function');f.game._nativeAbort.abort();await new Promise(r=>setImmediate(r));assert.equal(settled,true);await p;assert.equal(cancelled,1);assert.equal(f.G.level,f.oldLevel);assert.equal(f.counters.newPaint,1);assert.equal(f.counters.newDisplay,1);assert.equal(f.counters.statusClose,1);callback();assert.equal(f.counters.statusClose,1);
});

  test('production prepareNative reaches the engine raster hook with and without navigation', async () => {
    const { fixture } = await import('./source-fixture.mjs');
    const { buildSourceBVH } = await import('../../native-stages/runtime/source-convert.mjs');
    const f = await fixture({
      fullRuntime: true,
      productionComposition: true,
      extraExports: "export {Minimap} from './inkwave-public/src/game/minimap.js'; export {NativeLevel} from './patches/native-stages/runtime/native-level.mjs'; export {buildNativeMinimap} from './patches/native-stages/runtime/engine.mjs';",
    });
    const { THREE } = f;
function makeLevel(withNav){
 const triangles=new Float32Array([-2,0,-2,2,0,2,2,0,-2,-2,0,-2,-2,0,2,2,0,2,-2,2,-2,2,4,2,2,4,-2,-2,2,-2,-2,2,2,2,4,2]);
 const normal=new THREE.Vector3(-.5,1,0).normalize(),normals=Float32Array.from([0,1,0,0,1,0,...normal.toArray(),...normal.toArray()]);
 const faces=[{origin:[-2,0,-2],u:[1,0,0],v:[0,0,1],n:[0,1,0],su:4,sv:4,nu:4,nv:4,cu:1,cv:1,grid:0,object:0,triangles:[0,1],bounds:[[-2,0,-2],[2,0,2]]},{origin:[-2,2,-2],u:[normal.y,-normal.x,0],v:[0,0,1],n:normal.toArray(),su:Math.sqrt(20),sv:4,nu:5,nv:4,cu:Math.sqrt(20)/5,cv:1,grid:16,object:1,triangles:[2,3],bounds:[[-2,2,-2],[2,4,2]]}];
 const data={triangles,normals,flags:new Uint32Array(4).fill(3),objectIds:new Uint32Array([0,0,1,1]),...buildSourceBVH(triangles),triangleFace:new Int32Array([0,0,1,1]),mask:new Uint8Array(36).fill(1),manifest:{id:'flip-test',bounds:{minX:-2,maxX:3,minZ:-2,maxZ:2},spawnPads:[[0,0,0],[.5,0,.5]],spawnBarrier:.1,faces,objects:faces.map(face=>({collidable:true,bounds:face.bounds}))}};
 const L=new f.NativeLevel(data);
 if(withNav)L.nativeNav={level:L,x0:0,z0:0,step:10,nx:1,nz:1,validIds:[0,1],valid:new Uint8Array([1,1]),cells:[[0,1]],nodes:[{x:0,y:0,z:0,nb:[]},{x:0,y:3,z:0,nb:[]}],nearest:()=>0};
 return L;
}
function makeMap(level,w,h){
 const map={level,paint:{dead:new Uint8Array(36),grid:new Uint8Array(36).fill(1)},w,h,s:1,flip:false,_built:false,draws:0,resets:0,_worldX(px){const B=this.level.bounds;return B.maxX-(this.flip?this.w-px:px)/this.s},_worldZ(py){const B=this.level.bounds;return B.maxZ-(this.flip?this.h-py:py)/this.s},_drawBase(){this.draws++;}};
 for(const [name,ctx]of [['canvas','ctx'],['base','bctx'],['inkC','ictx'],['flashC','fctx']]){map[name]={width:w,height:h};map[ctx]={reset(){map.resets++},createImageData(w,h){return{width:w,height:h,data:new Uint8ClampedArray(w*h*4)}}};}
 return map;
}
const snapshot=map=>Object.fromEntries(['hgt','topBlock','nrm','pixCell','pixFx','pixFy','pixSx','pixSy','owner'].map(key=>[key,map[key] ? Array.from(map[key]) : null]));

    for (const nav of [false, true]) {
      const level = makeLevel(nav);
      const prepared = makeMap(level, 5, 4), synchronous = makeMap(level, 5, 4);
      for (const map of [prepared, synchronous]) {
        map._worldX = f.Minimap.prototype._worldX;
        map._worldZ = f.Minimap.prototype._worldZ;
      }
      await f.Minimap.prototype.prepareNative.call(prepared, { budgetMilliseconds: 100000 });
      f.buildNativeMinimap(synchronous, true);
      assert.deepEqual(snapshot(prepared), snapshot(synchronous));
      assert.ok(prepared._nativeSupportCache);
      assert.equal(prepared._built, true);
      assert.equal(prepared.draws, 1);
    }
  });
}
