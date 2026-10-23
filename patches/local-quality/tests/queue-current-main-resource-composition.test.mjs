import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
const read=rel=>fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8');
const shadow=read('src/core/shadowcache.js'),environment=read('src/world/environment.js');
test('authored first-pass caster transaction is retained and a changed restoration fails closed',()=>{
 const source=adaptBuildSource('src/core/shadowcache.js',shadow);
 assert.match(source,/for \(const \[o, wasCasting\] of dyn\) o.castShadow = wasCasting/);
 assert.throws(()=>adaptBuildSource('src/core/shadowcache.js',shadow.replace('o.castShadow = wasCasting','o.castShadow = true')),/authored first-pass caster restoration/);
});
test('authored cloud scissor and theme transactions must remain exact',()=>{
 assert.throws(()=>adaptBuildSource('src/world/environment.js',environment.replace('rt.scissor.copy(scissor); rt.scissorTest = wasScissored;','rt.scissorTest = false;')),/strip-scissor/);
 assert.throws(()=>adaptBuildSource('src/world/environment.js',environment.replace('finally { r0.setClearColor(cc, ca); }','finally { r0.setClearColor(cc); }')),/theme clear-colour/);
});
const cloud=adaptBuildSource('src/world/environment.js',environment);
const start=cloud.indexOf('  _bakeClouds(T) {'),end=cloud.indexOf('  _rebuildEnvMap()',start);
class Color { constructor(){this.value=0;} }
const Harness=new Function('THREE','lin','return class {'+cloud.slice(start,end)+'} ')({Color},()=>({}));
function fixture({failBake=false,bakeError,failTarget=false,targetError=new Error('target'),failColour=false,colourError=new Error('colour')}={}) {
 const scissor={x:4,y:5,z:6,w:7,clone(){return {...this};},copy(v){for(const k of ['x','y','z','w'])this[k]=v[k];},set(x,y,z,w){Object.assign(this,{x,y,z,w});}};
 const rt={width:100,height:90,scissorTest:true,scissor},prev={name:'original'},h=new Harness();
 let renders=0;const r=h.renderer={target:prev,face:4,mip:2,autoClear:true,xr:{enabled:true},colour:23,alpha:.7,
 getRenderTarget(){return this.target;},getActiveCubeFace(){return this.face;},getActiveMipmapLevel(){return this.mip;},getClearColor(c){c.value=this.colour;return c;},getClearAlpha(){return this.alpha;},
 setRenderTarget(t,face=0,mip=0){if(t===prev&&failTarget)throw targetError;this.target=t;this.face=face;this.mip=mip;},
 setClearColor(c,a){if(c instanceof Color&&failColour)throw colourError;this.colour=c instanceof Color?c.value:c;this.alpha=a;},clear(){},render(){renders++;if(failBake)throw bakeError;}};
 h._cloudRT=rt;h._cloudMat={uniforms:{uSunCol:{value:{copy(){}}},uCov:{},uSeed:{}}};h._cloudScene={};h._cloudCam={};
 return {h,r,rt,prev,renders:()=>renders};
}
function outcome(h){try{h._bakeClouds({sunColor:1,skySun:2});return{threw:false};}catch(error){return{threw:true,error};}}
test('composed cloud bake restores clear colour, alpha, cube face, mip, flags and scissor after ten strips',()=>{
 const f=fixture();assert.deepEqual(outcome(f.h),{threw:false});assert.equal(f.renders(),10);assert.equal(f.r.target,f.prev);assert.deepEqual([f.r.face,f.r.mip],[4,2]);assert.deepEqual([f.r.colour,f.r.alpha],[23,.7]);assert.equal(f.rt.scissorTest,true);assert.deepEqual([f.rt.scissor.x,f.rt.scissor.y,f.rt.scissor.z,f.rt.scissor.w],[4,5,6,7]);assert.equal(f.r.autoClear,true);assert.equal(f.r.xr.enabled,true);
});
for(const bakeError of [new Error('primary'),null,undefined,false,0,''])test('composed cloud bake keeps exact primary failure '+String(bakeError),()=>{
 const f=fixture({failBake:true,bakeError,failTarget:true,failColour:true}),result=outcome(f.h);
 assert.equal(result.threw,true);assert.equal(result.error,bakeError);assert.equal(f.rt.scissorTest,true);assert.deepEqual([f.rt.scissor.x,f.rt.scissor.y,f.rt.scissor.z,f.rt.scissor.w],[4,5,6,7]);assert.equal(f.r.autoClear,true);assert.equal(f.r.xr.enabled,true);
});
test('target restoration failure remains primary over clear-colour restoration failure',()=>{
 const error=new Error('original target');const f=fixture({failTarget:true,targetError:error,failColour:true});assert.equal(outcome(f.h).error,error);assert.equal(f.r.autoClear,true);assert.equal(f.r.xr.enabled,true);
});
test('a sole clear-colour restoration failure still propagates',()=>{
 const error=new Error('colour');const f=fixture({failColour:true,colourError:error});assert.equal(outcome(f.h).error,error);assert.equal(f.r.target,f.prev);assert.equal(f.r.autoClear,true);assert.equal(f.r.xr.enabled,true);
});
