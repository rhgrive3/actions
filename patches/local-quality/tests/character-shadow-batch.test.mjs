import fs from 'node:fs';
import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {createCharacterShadowBatch,registerCharacterWarmBatch} from '../character-shadow-batch.mjs';
function fixture(count=8,{failDraw=false}={}) {
 const sun={isDirectionalLight:true},camera={},target={},world=new THREE.Group(),draws=[],compiled=[],warmGroups=[],warmMeshes=[],oldTarget={},state={target:oldTarget};
 const renderer={shadowMap:{enabled:true,needsUpdate:false,render(lights,scene,cam){assert.equal(this,renderer.shadowMap);draws.push(scene);scene.traverse(o=>{if(o.userData.probe)o.userData.probe.call(o);});if(failDraw)throw Error('draw fault');}},
 getRenderTarget(){assert.equal(this,renderer);return state.target;},setRenderTarget(t){assert.equal(this,renderer);state.target=t;},compileAsync(root){assert.equal(this,renderer);compiled.push(root);warmGroups.push(root.getObjectByName('warm'));warmMeshes.push(root.getObjectByName('warm').children[0]);return Promise.resolve();}};
 class Character{constructor(){this.root=new THREE.Group();this.kid=new THREE.Group();this.root.add(this.kid);world.add(this.root);this.kid.visible=false;this.mesh=new THREE.Mesh();this.kid.add(this.mesh);this.mesh.visible=false;let self=this;this.mesh.userData.probe=function(){assert.equal(this,self.mesh);assert.equal(this.parent,self.kid);};}
 async warmAll(r=renderer,c=camera,t=target){const group=new THREE.Group();group.name='warm';group.add(new THREE.Mesh());this.kid.add(group);const vis=[];this.root.traverse(o=>{vis.push(o,o.visible);o.visible=true;});let p;
  try{const prev=r.getRenderTarget();try{r.setRenderTarget(target);p=r.compileAsync(this.root,c,t);}finally{r.setRenderTarget(prev);}const sm=r.shadowMap,nu=sm.needsUpdate;try{sm.needsUpdate=true;sm.render([sun],this.root,c,group,this.kid);}finally{sm.needsUpdate=nu;}}
  finally{for(let i=0;i<vis.length;i+=2)vis[i].visible=vis[i+1];this.kid.remove(group);group.clear();}await p;return 'high';}}
 registerCharacterWarmBatch(Character);const chars=Array.from({length:count},()=>new Character());
 return{renderer,chars,draws,compiled,warmGroups,warmMeshes,world,camera,target,state,oldTarget};
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

function nativeDispose(character) {
 const source=fs.readFileSync(new URL('../../../inkwave-public/src/game/character.js',import.meta.url),'utf8');
 const start=source.indexOf('  dispose() {'),end=source.indexOf('\n  }',start)+4;
 const Character=new Function('LIVE','return class {'+source.slice(start,end)+'}')(new Set([character]));
 let disposed=0;const resource={dispose(){disposed++;}};
 character.mats=Object.fromEntries(['skin','cloth','hair','eye','fill','squid','squidGhost','glow'].map(k=>[k,resource]));
 character._ownMats=[];character.matsD=[];character.weapons={};character.skeleton=resource;
 Character.prototype.dispose.call(character);assert.equal(disposed,9);
}
test('native dispose during another pending compile never resurrects its root or resources',async()=>{
 const f=fixture(2),compile=f.renderer.compileAsync;let release;
 f.renderer.compileAsync=function(root,...args){compile.call(this,root,...args);return root===f.chars[1].root?new Promise(r=>{release=r;}):Promise.resolve();};
 const b=createCharacterShadowBatch(f.renderer,()=>new THREE.Group()),jobs=f.chars.map(c=>b.warm(c,f.camera,f.target));
 nativeDispose(f.chars[0]);assert.equal(f.chars[0]._sourceMotionDisposed,true);assert.equal(f.chars[0].root.parent,null);
 let disposedDraws=0,liveDraws=0;f.chars[0].mesh.userData.probe=()=>disposedDraws++;f.chars[1].mesh.userData.probe=()=>liveDraws++;
 release();await Promise.all(jobs);b.flush();
 assert.equal(disposedDraws,0);assert.equal(liveDraws,1);assert.equal(f.draws.length,1);
 assert.equal(f.chars[0].root.parent,null);assert.equal(f.chars[0].kid.children.length,1);
 assert.equal(f.chars[1].root.parent,f.world);assert.equal(f.chars[1].kid.visible,false);assert.equal(f.chars[1].kid.children.length,1);
});
for(const change of ['root','kid','root-parent','kid-parent','group-parent','mesh-parent'])test(`changed ${change} skips only that entry without stealing ownership`,async()=>{
 const f=fixture(2),b=createCharacterShadowBatch(f.renderer,()=>new THREE.Group()),first=f.chars[0],originalRoot=first.root,originalKid=first.kid;
 const jobs=f.chars.map(c=>b.warm(c,f.camera,f.target)),group=f.warmGroups[0],mesh=f.warmMeshes[0],other=new THREE.Group();
 await Promise.all(jobs);
 if(change==='root')first.root=new THREE.Group();
 if(change==='kid')first.kid=new THREE.Group();
 if(change==='root-parent')other.add(originalRoot);
 if(change==='kid-parent')other.add(originalKid);
 if(change==='group-parent')other.add(group);
 if(change==='mesh-parent')other.add(mesh);
 let stale=0,live=0;first.mesh.userData.probe=()=>stale++;f.chars[1].mesh.userData.probe=()=>live++;
 b.flush();assert.equal(stale,0);assert.equal(live,1);assert.equal(f.draws.length,1);
 if(change==='group-parent')assert.equal(group.parent,other);
 if(change==='mesh-parent')assert.equal(mesh.parent,other);
 assert.equal(f.chars[1].kid.children.length,1);assert.equal(f.chars[1].kid.visible,false);assert.equal(f.renderer.shadowMap.needsUpdate,false);
});
test('a failed preparation does not suppress healthy queued characters',async()=>{
 const f=fixture(2),errors=[],b=createCharacterShadowBatch(f.renderer,()=>new THREE.Group(),()=>true,(...a)=>errors.push(a));
 await Promise.all(f.chars.map(c=>b.warm(c,f.camera,f.target)));f.chars[0].root.updateMatrixWorld=()=>{throw Error('preparation fault');};
 let stale=0,live=0;f.chars[0].mesh.userData.probe=()=>stale++;f.chars[1].mesh.userData.probe=()=>live++;
 b.flush();assert.equal(errors.length,1);assert.equal(stale,0);assert.equal(live,1);assert.equal(f.draws.length,1);
 for(const c of f.chars){assert.equal(c.kid.visible,false);assert.equal(c.mesh.visible,false);assert.equal(c.kid.children.length,1);}
});
test('late callbacks from a disposed character never use the immediate native fallback',async()=>{
 const f=fixture(1),b=createCharacterShadowBatch(f.renderer,()=>new THREE.Group());b.flush();nativeDispose(f.chars[0]);
 await b.warm(f.chars[0],f.camera,f.target);assert.equal(f.draws.length,0);assert.equal(f.compiled.length,0);
});
