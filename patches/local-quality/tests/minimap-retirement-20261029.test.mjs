import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {createRecoveryFixture} from '../../native-stages/tests/native-world-recovery-fixture.mjs';
const read=rel=>adaptBuildSource(rel,fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8'));
function minimaps(){
 let code=read('src/game/minimap.js');
 const edits=parse(code,{ecmaVersion:'latest',sourceType:'module'}).body.flatMap(n=>n.type==='ImportDeclaration'?[[n.start,n.end]]:n.type==='ExportNamedDeclaration'?[[n.start,n.declaration.start]]:[]);
 for(const[a,b]of edits.reverse())code=code.slice(0,a)+code.slice(b);
 const callbacks=new Map(),cancelled=[],G={settings:{minimap:true}},document={createElement(){return{width:0,height:0,getContext(){return{createImageData(w,h){return{data:new Uint8ClampedArray(w*h*4)}}}}}}};
 let serial=0;const requestIdleCallback=f=>{callbacks.set(++serial,f);return serial},cancelIdleCallback=id=>{cancelled.push(id);callbacks.delete(id)};
 const api=new Function('G','on','document','requestIdleCallback','globalThis',code+'\nreturn {Minimap,getCurrent:()=>CURRENT,fxList};')(G,()=>{},document,requestIdleCallback,{cancelIdleCallback});
 const level={bounds:{minX:0,maxX:2,minZ:0,maxZ:3}},make=deferred=>new api.Minimap(level,{},7,{deferActivation:deferred});
 return {...api,make,callbacks,cancelled};
}
test('actual Minimap retires only inactive canvases and buffers, cancels idle work and cannot clear new FX',()=>{
 const f=minimaps(),a=f.make(false),oldCallbacks=[...f.callbacks.values()];
 a.hgt=new Float32Array(294);a._nativeSupportCache={values:new Float64Array(10)};
 assert.equal(a.dispose(),false);assert.equal(a.canvas.width,14);
 const b=f.make(true);assert.equal(f.getCurrent(),a);assert.equal(b.dispose(),true);assert.equal(b.canvas.width,0);assert.throws(()=>b.activate(),/retired/);
 const c=f.make(false);f.fxList.push({kind:'new'});let builds=0;a._build=()=>{builds++};
 assert.equal(a.dispose(),true);assert.equal(a.dispose(),false);for(const canvas of [a.canvas,a.base,a.inkC,a.flashC])assert.equal(canvas.width+canvas.height,0);
 assert.equal(a.inkImg,null);assert.equal(a.hgt,null);assert.equal(a._nativeSupportCache,null);assert.equal(f.cancelled.length,1);
 oldCallbacks.forEach(fn=>fn());assert.equal(builds,0);assert.equal(f.getCurrent(),c);assert.deepEqual(f.fxList,[{kind:'new'}]);assert.equal(c.canvas.width,14);
});
test('native successful commit retires old minimap only after candidate activation; publication failure preserves old backing',async()=>{
 for(const fail of [{},{env:1},{shadow:1},{activate:1},{wake:1}]){
  const events=[],f=await createRecoveryFixture({...fail},{modify({mock,oldMinimap}){
   oldMinimap.canvas={width:64};oldMinimap.dispose=()=>{events.push('old-dispose');oldMinimap.canvas.width=0};
   oldMinimap.activate=()=>events.push('old-activate');
   const Base=mock.Minimap;mock.Minimap=class extends Base{activate(){events.push('new-activate');if(fail.activate)throw Error('activate injected')}dispose(){events.push('new-dispose')}};
   mock.SwimWake=class{reset(){if(fail.wake)throw Error('wake injected')}};
  }});
  if(Object.keys(fail).length){await assert.rejects(f.build(f.game,{id:'new'},()=>true));assert.equal(f.oldMinimap.canvas.width,64);assert.ok(!events.includes('old-dispose'));assert.ok(events.includes('new-dispose'));assert.equal(f.game.minimap,f.oldMinimap);}
  else {await f.build(f.game,{id:'new'},()=>true);assert.equal(f.oldMinimap.canvas.width,0);assert.deepEqual(events,['new-activate','old-dispose']);}
 }
});
test('legacy retirement is sequenced after replacement and all fallible world publication',()=>{
 const source=read('src/main.js'),start=source.indexOf('async _buildWorld('),end=source.indexOf('\n  _shadowRoots()',start),body=source.slice(start,end);
 assert.ok(body.indexOf('const retiredMinimap = this.minimap;')<body.indexOf('this.minimap = new Minimap'));
 assert.ok(body.indexOf('retiredMinimap?.dispose?.();')>body.indexOf('this._setPalette(this.palette'));
 assert.equal(body.split('retiredMinimap?.dispose?.();').length,2);
});
