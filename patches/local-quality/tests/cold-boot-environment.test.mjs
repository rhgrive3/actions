import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { idleFixture } from './idle-fixture.mjs';
import { environmentBudget, refreshEnvironmentBudget } from '../idle-resources.mjs';
const root=new URL('../../../',import.meta.url);
async function environment(api){
 const {THREE,Environment}=api,e=Object.create(Environment.prototype);
 e.U={uCloudTex:{value:null},uFarOn:{value:0},uFarCube:{value:null}};e._initCloudBake();
 e._marina=true;e.scene=new THREE.Scene();e.root=new THREE.Group();e.scene.add(e.root);
 e.bounds={minX:0,maxX:4,minZ:0,maxZ:4};e.sun={shadow:{map:{}}};
 // Actual CubeCamera and targets; only GPU drawing is a stand-in here.
 e.renderer={coordinateSystem:THREE.WebGLCoordinateSystem ?? (await idleFixture({baseline:true})).THREE.WebGLCoordinateSystem,xr:{enabled:false},shadowMap:{autoUpdate:true,needsUpdate:false},autoClear:true,
  getRenderTarget:()=>null,getActiveCubeFace:()=>0,getActiveMipmapLevel:()=>0,getClearColor:c=>c.set(0),getClearAlpha:()=>1,setClearColor(){},setRenderTarget(){},render(){}};
 e._bakeFarReflection();return e;
}
function release(e){e._marina=false;e._bakeFarReflection();e._cloudRT.dispose();e._cloudMat.dispose();}

test('actual boot publishes G.mobile before Environment and G.game only afterward; default quality is high',()=>{
 const main=fs.readFileSync(new URL('inkwave-public/src/main.js',root),'utf8'),config=fs.readFileSync(new URL('inkwave-public/src/config.js',root),'utf8');
 assert(main.indexOf('this.mobile = G.mobile = deviceProfile()')<main.indexOf('G.env = new envMod.Environment'));
 assert(main.indexOf('G.env = new envMod.Environment')<main.indexOf('G.game = this'));
 assert.match(config,/quality: 'high'/);
});

test('cold touch/desktop allocations use already-published profile across all saved quality tiers',async()=>{
 const api=await idleFixture(),{G}=api;
 for(const quality of ['low','medium','high','ultra'])for(const touch of [false,true]){
  G.settings={quality};G.mobile={touch};delete G.game;
  const e=await environment(api),q=environmentBudget(G.settings,G.mobile);
  assert.equal(G.game,undefined);
  assert.deepEqual([e._cloudRT.width,e._cloudRT.height],[q.cloudWidth,q.cloudHeight]);assert.equal(e._farRT.width,q.farSize);
  assert.deepEqual([...e._cloudMat.uniforms.uRes.value.toArray()],[q.cloudWidth,q.cloudHeight]);
  assert.equal(e._cloudRT.texture.type,api.THREE.HalfFloatType);assert.equal(e._cloudRT.depthBuffer,false);assert.equal(e._cloudRT.texture.generateMipmaps,false);
  const cloud=e._cloudRT,far=e._farRT;let cloudDisposals=0,farDisposals=0;cloud.addEventListener('dispose',()=>cloudDisposals++);far.addEventListener('dispose',()=>farDisposals++);
  G.game={mobile:G.mobile};assert.equal(refreshEnvironmentBudget(e,G.settings,G.game.mobile),false);e._bakeFarReflection();
  assert.equal(e._cloudRT,cloud);assert.equal(e._farRT,far);assert.equal(cloudDisposals,0);assert.equal(farDisposals,0);
  release(e);assert.equal(cloudDisposals,1);assert.equal(farDisposals,1);
 }
});

test('published Game profile retains precedence, and absent device metadata keeps desktop behavior',async()=>{
 const api=await idleFixture(),{G}=api;
 for(const [globalTouch,gameTouch]of [[true,false],[false,true]]){
  G.settings={quality:'high'};G.mobile={touch:globalTouch};G.game={mobile:{touch:gameTouch}};const e=await environment(api);
  assert.equal(e._cloudRT.width,gameTouch?1024:2048);assert.equal(e._farRT.width,gameTouch?256:512);release(e);
 }
 delete G.mobile;delete G.game;G.settings={quality:'high'};const e=await environment(api);assert.equal(e._cloudRT.width,2048);assert.equal(e._farRT.width,512);release(e);
});

test('negative control restores only the old device lookup and reproduces default-touch oversizing',async()=>{
 let replaced=0;
 const api=await idleFixture({built:null,transform:(rel,code)=>{
  if(rel!=='src/world/environment.js')return code;
  const old='G.game?.mobile ?? G.mobile';replaced=(code.match(/G\.game\?\.mobile \?\? G\.mobile/g)||[]).length;return code.replaceAll(old,'G.game?.mobile');
 }});
 assert.equal(replaced,2);api.G.settings={quality:'high'};api.G.mobile={touch:true};delete api.G.game;
 const e=await environment(api);assert.equal(e._cloudRT.width,2048);assert.equal(e._cloudRT.height,640);assert.equal(e._farRT.width,512);
 api.G.game={mobile:api.G.mobile};e._bakeFarReflection();assert.equal(e._farRT.width,256);release(e);
});
