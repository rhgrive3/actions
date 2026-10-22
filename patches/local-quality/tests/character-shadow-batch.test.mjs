import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {createCharacterShadowBatch,registerCharacterWarmBatch} from '../character-shadow-batch.mjs';
function fixture(count=8,{failDraw=false}={}) {
 const sun={isDirectionalLight:true},camera={},target={},world=new THREE.Group(),draws=[],compiled=[],oldTarget={},state={target:oldTarget};
 const renderer={shadowMap:{enabled:true,needsUpdate:false,render(lights,scene,cam){assert.equal(this,renderer.shadowMap);draws.push(scene);scene.traverse(o=>{if(o.userData.probe)o.userData.probe.call(o);});if(failDraw)throw Error('draw fault');}},
 getRenderTarget(){assert.equal(this,renderer);return state.target;},setRenderTarget(t){assert.equal(this,renderer);state.target=t;},compileAsync(root){assert.equal(this,renderer);compiled.push(root);return Promise.resolve();}};
 class Character{constructor(){this.root=new THREE.Group();this.kid=new THREE.Group();this.root.add(this.kid);world.add(this.root);this.kid.visible=false;this.mesh=new THREE.Mesh();this.kid.add(this.mesh);this.mesh.visible=false;let self=this;this.mesh.userData.probe=function(){assert.equal(this,self.mesh);assert.equal(this.parent,self.kid);};}
 async warmAll(r=renderer,c=camera,t=target){const group=new THREE.Group();group.name='warm';group.add(new THREE.Mesh());this.kid.add(group);const vis=[];this.root.traverse(o=>{vis.push(o,o.visible);o.visible=true;});let p;
  try{const prev=r.getRenderTarget();try{r.setRenderTarget(target);p=r.compileAsync(this.root,c,t);}finally{r.setRenderTarget(prev);}const sm=r.shadowMap,nu=sm.needsUpdate;try{sm.needsUpdate=true;sm.render([sun],this.root,c,group,this.kid);}finally{sm.needsUpdate=nu;}}
  finally{for(let i=0;i<vis.length;i+=2)vis[i].visible=vis[i+1];this.kid.remove(group);group.clear();}await p;return 'high';}}
 registerCharacterWarmBatch(Character);const chars=Array.from({length:count},()=>new Character());
 return{renderer,chars,draws,compiled,world,camera,target,state,oldTarget};
}
for(const n of [1,4,8])test(`${n} real graph roots retain every compile and share one shadow draw`,async()=>{
 const f=fixture(n),batch=createCharacterShadowBatch(f.renderer,()=>new THREE.Group());const parents=f.chars.map(c=>c.root.parent);
 assert.deepEqual(await Promise.all(f.chars.map(c=>batch.warm(c,f.camera,f.target))),Array(n).fill('high'));assert.equal(f.compiled.length,n);assert.equal(f.draws.length,0);batch.flush();assert.equal(f.draws.length,1);
 f.chars.forEach((c,i)=>{assert.equal(c.root.parent,parents[i]);assert.equal(c.kid.visible,false);assert.equal(c.mesh.visible,false);assert.equal(c.kid.children.length,1);});assert.equal(f.state.target,f.oldTarget);assert.equal(f.renderer.shadowMap.needsUpdate,false);batch.flush();assert.equal(f.draws.length,1);
});
test('draw faults restore visibility, groups, render target and shadow update flag',async()=>{const f=fixture(8,{failDraw:true}),errors=[],b=createCharacterShadowBatch(f.renderer,()=>new THREE.Group(),()=>true,(...a)=>errors.push(a));await Promise.all(f.chars.map(c=>b.warm(c,f.camera,f.target)));b.flush();assert.equal(errors.length,9);assert.deepEqual(f.draws.slice(1),f.chars.map(c=>c.root));for(const c of f.chars){assert.equal(c.kid.visible,false);assert.equal(c.mesh.visible,false);assert.equal(c.kid.children.length,1);}assert.equal(f.renderer.shadowMap.needsUpdate,false);assert.equal(f.state.target,f.oldTarget);});
test('timeout closes queue: late ready character executes immediate native fallback',async()=>{const f=fixture(1),b=createCharacterShadowBatch(f.renderer,()=>new THREE.Group());b.flush();await b.warm(f.chars[0],f.camera,f.target);assert.equal(f.draws.length,1);assert.equal(f.draws[0],f.chars[0].root);});
test('canceled owner never resurrects character warm groups',async()=>{const f=fixture(1);let current=true;const b=createCharacterShadowBatch(f.renderer,()=>new THREE.Group(),()=>current);await b.warm(f.chars[0],f.camera,f.target);current=false;b.flush();assert.equal(f.draws.length,0);assert.equal(f.chars[0].kid.children.length,1);});
test('unregistered custom warmers retain exact zero-argument invocation',()=>{const f=fixture(0),b=createCharacterShadowBatch(f.renderer,()=>new THREE.Group());assert.equal(b.warm({warmAll(...args){assert.equal(args.length,0);return 23;}},f.camera,f.target),23);b.flush();});

test('registered presentation wrappers retain canonical warm ownership',async()=>{const f=fixture(4);const original=Object.getPrototypeOf(f.chars[0]).warmAll;const proto=Object.getPrototypeOf(f.chars[0]);proto.warmAll=function(...args){return original.apply(this,args);};Object.defineProperty(proto.warmAll,Symbol.for('inkwave.characterWarmParent'),{value:original});const b=createCharacterShadowBatch(f.renderer,()=>new THREE.Group());await Promise.all(f.chars.map(c=>b.warm(c,f.camera,f.target)));b.flush();assert.equal(f.draws.length,1);});
