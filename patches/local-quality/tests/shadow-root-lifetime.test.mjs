import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resourceFixture} from './resource-fixture.mjs';
let f;
test.before(async()=>{f=await resourceFixture();});
function fixture() {
 const listeners=new Map(), original=()=>{};
 const renderer={shadowMap:{enabled:false,render:original},domElement:{addEventListener:(n,v)=>listeners.set(n,v),removeEventListener:n=>listeners.delete(n)}};
 return {cache:new f.ShadowCache(renderer),renderer,listeners,original};
}
function stage(name) {
 const scene=new f.THREE.Scene(),root=new f.THREE.Group();scene.add(root);
 const atlas=new f.THREE.CanvasTexture({width:2048,height:2048});
 const geometry=new f.THREE.BoxGeometry(1,1,1),material=new f.THREE.MeshStandardMaterial({map:atlas});
 const mesh=new f.THREE.Mesh(geometry,material);mesh.name=name;mesh.castShadow=true;root.add(mesh);
 return {scene,root,mesh,atlas,dispose(){scene.remove(root);geometry.dispose();material.dispose();atlas.dispose();}};
}
test('disabled shadows drop the previous collected caster/atlas graph immediately on root replacement',()=>{
 const {cache,renderer}=fixture(),a=stage('A'),b=stage('B');
 cache.setStaticRoots([a.root]);cache.static=cache._collect();assert.equal(cache.static[0].o.material.map,a.atlas);
 a.dispose();cache.dirty=false;cache.setStaticRoots([b.root,null]);
 assert.equal(renderer.shadowMap.enabled,false);assert.equal(cache.static.length,0);assert.equal(cache.roots.length,1);assert.equal(cache.roots[0],b.root);assert.equal(cache.dirty,true);
 renderer.shadowMap.enabled=true;cache.static=cache._collect();assert.equal(cache.static.length,1);assert.equal(cache.static[0].o,b.mesh);assert(!cache.static.some(e=>e.o===a.mesh));
 cache.dispose();b.dispose();
});
test('repeated root switches preserve depth target ownership and reset dynamic classification',()=>{
 const {cache}=fixture();let disposed=0;const target={dispose(){disposed++;}};cache.cache=target;
 let previous;
 for(let i=0;i<30;i++){
  const next=stage(String(i));cache.setStaticRoots([next.root]);assert.equal(cache.static.length,0);assert.equal(cache.cache,target);assert.equal(disposed,0);
  if(previous){assert.equal(cache.dynamic.has(previous.mesh),false);previous.dispose();}
  cache.static=cache._collect();assert.equal(cache.static[0].o,next.mesh);cache.dynamic.add(next.mesh);previous=next;
 }
 cache.setStaticRoots([]);assert.equal(cache.static.length,0);assert.equal(cache.roots.length,0);assert.equal(disposed,0);
 cache.dispose();assert.equal(disposed,1);previous.dispose();
});
test('old native root setter retains the disposed caster until a render opportunity',()=>{
 const raw=fs.readFileSync(new URL('../../../inkwave-public/src/core/shadowcache.js',import.meta.url),'utf8');
 const body=raw.match(/setStaticRoots\(roots\) \{([\s\S]*?)\n  \}/)[1];
 const old=new Function('roots',body),{cache}=fixture(),a=stage('old'),b=stage('new');
 cache.setStaticRoots([a.root]);cache.static=cache._collect();a.dispose();old.call(cache,[b.root]);
 assert.equal(cache.static.length,1);assert.equal(cache.static[0].o.material.map,a.atlas);
 cache.setStaticRoots([b.root]);assert.equal(cache.static.length,0);cache.dispose();b.dispose();
});
