import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {geometryFixture} from './geometry-build-fixture.mjs';
import {rememberLegacyProjection,reuseLegacyProjectionFlip} from '../legacy-minimap-projection.mjs';
const arrays=['hgt','topBlock','pixCell','pixFx','pixFy','pixSx','pixSy'];
let code=adaptBuildSource('src/game/minimap.js',fs.readFileSync(new URL('../../../inkwave-public/src/game/minimap.js',import.meta.url),'utf8'));
const edits=parse(code,{ecmaVersion:'latest',sourceType:'module'}).body.flatMap(n=>n.type==='ImportDeclaration'?[[n.start,n.end]]:n.type==='ExportNamedDeclaration'?[[n.start,n.declaration.start]]:[]);
for(const[a,b]of edits.reverse())code=code.slice(0,a)+code.slice(b);
const G={settings:{minimap:true}},document={createElement(){const context=new Proxy({createImageData(w,h){return{width:w,height:h,data:new Uint8ClampedArray(w*h*4)}},putImageData(image){this.image=image}},{get(o,k){return k in o?o[k]:()=>{}}});return{width:0,height:0,getContext(){return context}}}};
const C=new Function('G','on','document','requestIdleCallback','rememberLegacyProjection','reuseLegacyProjectionFlip',code+'\nreturn Minimap;')(G,()=>{},document,()=>1,rememberLegacyProjection,reuseLegacyProjectionFlip);
const geometry=await geometryFixture();
function fixture(id='range',scale=1,mask=false){
 const level=new geometry.Level(geometry.MAP_LAYOUTS[id]);let off=0;
 for(const face of level.faces){face.nu=Math.max(1,Math.round(face.su/.25));face.nv=Math.max(1,Math.round(face.sv/.25));face.grid=off;face.cu=face.su/face.nu;face.cv=face.sv/face.nv;off+=face.nu*face.nv;}
 const paint={paintFaces:level.faces,cell:.25,dead:new Uint8Array(off)};
 if(mask)for(let i=0;i<paint.dead.length;i+=137)paint.dead.fill(1,i,Math.min(i+7,paint.dead.length));
 const map=new C(level,paint,scale,{deferActivation:true});map._build();return map;
}
function equal(a,b){for(const key of arrays)assert.deepEqual(a[key],b[key],key);assert.deepEqual(a.bctx.image.data,b.bctx.image.data,'base RGBA');assert.deepEqual(a.owner,b.owner,'cleared owner');assert.equal(a.version,b.version);}
test('legacy viewer flips preserve all seven projection arrays and shaded RGBA for five shipped layouts and three scales',()=>{
 let samples=0;for(const id of ['tidewater','kelpline','halyard','cargo','range'])for(const scale of [1,3.5,7])for(const flip of [false,true]){
  const a=fixture(id,scale),b=fixture(id,scale);a.flip=flip;a._build();a.version=-1;
  b.flip=!flip;b._build();const cache=b._legacyProjectionCache,owned=arrays.map(key=>b[key]);b.owner.fill(1);b.setViewerTeam(flip?1:0);
  equal(a,b);assert.equal(b._legacyProjectionCache,cache,'the cached projection was reused');arrays.forEach((key,i)=>assert.equal(b[key],owned[i]));samples+=a.w*a.h;
 }assert.equal(samples,3814092);
});
test('dead mask runs preserve exact terrain cells, invalidate byte mutations, and bound retained proof',()=>{
 const a=fixture('range',3.5,true),b=fixture('range',3.5,true);a.flip=true;a._build();b.setViewerTeam(1);equal(a,b);
 assert(b._legacyProjectionCache.mask.byteLength<=32768);const cached=b._legacyProjectionCache;b.paint.dead[0]^=1;b.setViewerTeam(0);assert.notEqual(b._legacyProjectionCache,cached);
 const c=fixture();c.paint.dead=new Uint8Array(10000);for(let i=0;i<c.paint.dead.length;i+=2)c.paint.dead[i]=1;
 assert.equal(rememberLegacyProjection(c,true),false);assert.equal(c._legacyProjectionCache,null);
});
test('geometry/resource/custom-projection mutations take the original full build path',()=>{
 const mutations=[m=>m.level.blocks[0].center.x+=.001,m=>m.level.blocks[0].axes[0].x+=.001,m=>m.paint.paintFaces[0].grid++,m=>m.paint.paintFaces[0].turf=!m.paint.paintFaces[0].turf,m=>m.level.bounds.minX-=.01,m=>m.canvas.width=1,m=>m.inkImg={width:1,height:1},m=>m._worldX=function(x){return C.prototype._worldX.call(this,x);},m=>m.toCanvas=function(...a){return C.prototype.toCanvas.call(this,...a);}];
 for(const mutate of mutations){const m=fixture();const old=m._legacyProjectionCache;mutate(m);m.setViewerTeam(1);assert.notEqual(m._legacyProjectionCache,old);}
 const custom=fixture();let calls=0;custom._build=function(){calls++;return C.prototype._build.call(this);};custom.setViewerTeam(1);assert.equal(calls,1);assert.equal(custom._legacyProjectionCache,null);
 const retired=fixture();assert(retired._legacyProjectionCache);assert(retired.dispose());assert.equal(retired._legacyProjectionCache,null);
});
test('off/minimized native paths cannot use stale legacy projections',()=>{
 const m=fixture();G.settings.minimap=false;m.setViewerTeam(1);assert.equal(m._built,false);G.settings.minimap=true;m.ensure();assert.equal(m._built,true);assert.equal(m._legacyProjectionCache.flip,true);
 m.level.native={};assert.equal(reuseLegacyProjectionFlip(m,false,true),false);m.level.native=null;
 assert.equal(reuseLegacyProjectionFlip(m,false,false),false);m.owner=null;assert.equal(reuseLegacyProjectionFlip(m,false,true),false);
});
