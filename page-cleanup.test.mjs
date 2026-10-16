import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const wrapper=fs.readFileSync(new URL('./capture-lightlong-integration.mjs',import.meta.url),'utf8');
const start=wrapper.indexOf('async({prefix,ids,shared,bSource,variantIds,baseModelCount})=>{');
const end=wrapper.indexOf('\n },{prefix,ids,shared,bSource,variantIds:plan.variantIds,baseModelCount:plan.baseModelCount});',start);
assert(start>=0&&end>start,'actual page callback delimiters');
const callback=wrapper.slice(start,end)+'\n }';
assert.equal((callback.match(/await import\(/g)||[]).length,8,'only actual module imports are controlled');
assert.match(fs.readFileSync(new URL('./.github/workflows/manual-lightlong-acceptance.yml',import.meta.url),'utf8'),/node --test diagnostic\/page-cleanup\.test\.mjs /,'page cleanup controls run in mandatory workflow step');
const controlled=callback.replaceAll('await import(','await load(');
function fixture(options={}){
 const calls=[],checkpoints=[],G={},ids=Array.from({length:59},(_,i)=>'variant'+i),primary=Object.assign(Error('render primary'),{capturePartial:{frames:[{id:'partial'}]}});
 const fail=name=>{calls.push(name);if(options.fail?.includes(name))throw options.errors?.[name]||Error(name);};
 class Color{toArray(){return[1,1,1];}}
 class Scene{constructor(){this.environmentIntensity=1;}add(){fail('scene.add');}remove(){fail('scene.remove');}}
 class Renderer{
  constructor(){fail('renderer.create');this.domElement={remove:()=>fail('canvas.remove')};this.debug={};}
  setSize(){fail('renderer.setSize');}
  readRenderTargetPixels(_rt,_x,_y,_w,_h,raw){fail('pmrem.read');raw.fill(0x3c00);if(options.shaderError)this.debug.onShaderError({getProgramInfoLog:()=> 'shader',getShaderInfoLog:()=> 'shader'},1,2,3);}
  getContext(){return{getError:()=>0};}
  dispose(){fail('renderer.dispose');}
 }
 const THREE={Box3:class{},Color,Group:class{},HalfFloatType:1016,NeutralToneMapping:7,PerspectiveCamera:class{},SRGBColorSpace:'srgb',Scene,Vector3:class{},WebGLRenderer:Renderer};
 class Environment{
  constructor(renderer,scene,{theme}){fail('environment.create');this.scene=scene;this.theme=theme;this._envRT={width:768,height:1024,texture:{colorSpace:'srgb-linear',type:1016,mapping:306}};this.sun={position:{toArray:()=>[1,2,3]},target:{position:{toArray:()=>[0,0,0]}},color:new Color(),intensity:1};this.hemi={color:new Color(),groundColor:new Color(),intensity:1};}
  dispose(){fail('environment.dispose');}
 }
 const api={G,Actor:class{},Character:class{},Physics:class{},WEAPONS:{},Projectiles:class{}},R={registeredWeaponModels:()=>Array(65),registeredWeaponVariantModels:()=>ids,registeredWeaponVariants:()=>Array(94)};
 const load=async url=>{
  if(url==='three')return THREE;
  if(url.endsWith('/src/world/environment.js'))return{Environment};
  if(url.endsWith('/runtime/install.mjs'))return{install:()=>api};
  if(url.endsWith('/main-weapon-catalog.mjs'))return{installMainWeaponCatalogRuntime:()=>{}};
  if(url.endsWith('/weapon-models/registry.mjs'))return R;
  if(url.endsWith('/alternate-weapon-kits-data.mjs'))return{ALTERNATE_WEAPON_KITS:[]};
  if(url.endsWith('/src/core/ctx.js'))return{G,on:()=>{}};
  if(url.endsWith('/weapon-appearance.mjs'))return{};
  throw Error('Unexpected controlled import '+url);
 };
 const run=new Function('load','fetch','window','document','return ('+controlled+');')(load,async()=>({json:async()=>({})}),{__abResetRng(){},__captureCheckpoint:async(phase,data)=>{checkpoints.push({phase,data});}},{body:{append(){fail('canvas.append');}}});
 // The production callback evals this exact helper position. The helper failure is
 // produced by the supplied real resource dependency, not by rewriting callback control flow.
 api.failure=primary;
 const bSource=options.helperFail?'async({api})=>{throw api.failure;}':'async()=>({frames:[{id:"complete"}],scope:{controlled:true}})';
 return{calls,checkpoints,primary,run:()=>run({prefix:'/version/',ids:[],shared:null,bSource,variantIds:ids,baseModelCount:65})};
}
test('actual browser callback success releases environment and renderer once',async()=>{const f=fixture(),result=await f.run();assert.equal(result.C.frames[0].id,'complete');assert.equal(f.calls.filter(x=>x==='environment.dispose').length,1);assert.equal(f.calls.filter(x=>x==='renderer.dispose').length,1);assert.equal(f.calls.filter(x=>x==='scene.remove').length,3);assert.equal(f.calls.at(-1),'canvas.remove');assert.deepEqual(f.checkpoints.map(x=>x.phase),['C']);});
test('helper failure plus both dispose failures attempts all and retains primary/partial',async()=>{const f=fixture({helperFail:true,fail:['environment.dispose','renderer.dispose']});await assert.rejects(f.run(),e=>e instanceof AggregateError&&e.cause===f.primary&&e.errors[0]===f.primary&&e.errors.length===3&&e.capturePartial===f.primary.capturePartial);assert.equal(f.calls.filter(x=>x==='environment.dispose').length,1);assert.equal(f.calls.filter(x=>x==='renderer.dispose').length,1);assert.equal(f.calls.at(-1),'canvas.remove');assert.deepEqual(f.checkpoints,[{phase:'C-failure',data:f.primary.capturePartial}]);});
test('PMREM readback failure releases both resources and preserves original error',async()=>{const primary=Error('PMREM original'),f=fixture({fail:['pmrem.read'],errors:{'pmrem.read':primary}});await assert.rejects(f.run(),e=>e===primary);assert(f.calls.includes('environment.dispose'));assert(f.calls.includes('renderer.dispose'));assert.deepEqual(f.checkpoints,[]);});
test('shader error before capture releases both resources',async()=>{const f=fixture({shaderError:true});await assert.rejects(f.run(),/GPU\/shader error/);assert(f.calls.includes('environment.dispose'));assert(f.calls.includes('renderer.dispose'));assert.deepEqual(f.checkpoints,[]);});
test('renderer setup and environment construction failures still release acquired renderer',async()=>{for(const point of ['renderer.setSize','environment.create']){const primary=Error(point),f=fixture({fail:[point],errors:{[point]:primary}});await assert.rejects(f.run(),e=>e===primary);assert.equal(f.calls.filter(x=>x==='renderer.dispose').length,1);assert(!f.calls.includes('environment.dispose'));assert.equal(f.calls.at(-1),'canvas.remove');}});
test('scene removal failures do not stop environment or renderer cleanup',async()=>{const f=fixture({helperFail:true,fail:['scene.remove','environment.dispose','renderer.dispose','canvas.remove']});await assert.rejects(f.run(),e=>e.cause===f.primary&&e.errors.length===7&&e.capturePartial===f.primary.capturePartial);assert.equal(f.calls.filter(x=>x==='scene.remove').length,3);assert.equal(f.calls.filter(x=>x==='environment.dispose').length,1);assert.equal(f.calls.filter(x=>x==='renderer.dispose').length,1);assert.equal(f.calls.at(-1),'canvas.remove');});
test('a successful capture cannot conceal cleanup failure',async()=>{const f=fixture({fail:['renderer.dispose']});await assert.rejects(f.run(),e=>e instanceof AggregateError&&e.errors.length===1&&e.errors[0].message==='renderer.dispose'&&e.cause===undefined);assert.equal(f.calls.at(-1),'canvas.remove');assert.equal(f.checkpoints[0].phase,'C');});
