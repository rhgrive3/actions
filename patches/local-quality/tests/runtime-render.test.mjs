import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.core.js';
import {adaptQualitySource} from '../adapter.mjs';
const raw=fs.readFileSync(new URL('../../../inkwave-public/src/core/renderer.js',import.meta.url),'utf8');
function render(patched=true){
 const source=patched?adaptQualitySource('src/core/renderer.js',raw):raw;
 const method=source.slice(source.indexOf('  render() {'),source.lastIndexOf('\n}'));
 return vm.runInNewContext('class R {'+method+'};R.prototype.render',{G:{},GradeShader:{},BLOOM:[]});
}
function fixture(patched=true){
 const scene=new THREE.Scene(),root=new THREE.Group(),child=new THREE.Object3D();scene.add(root);root.add(child);
 child.position.set(1,2,3);let traversals=0;const native=scene.updateMatrixWorld;
 scene.updateMatrixWorld=function(...args){traversals++;return native.apply(this,args);};
 const seen=[],r={scene,resize(){},composer:{render(){for(let i=0;i<3;i++){if(scene.matrixWorldAutoUpdate)scene.updateMatrixWorld();seen.push(child.matrixWorld.elements.slice());}}}};
 r.render=render(patched);return{scene,root,child,r,seen,count:()=>traversals};
}
test('beauty/GTAO/reflection share one real Three matrix update with identical matrices',()=>{
 const old=fixture(false),next=fixture();old.r.render();next.r.render();
 assert.equal(old.count(),3);assert.equal(next.count(),1);assert.deepEqual(next.seen,old.seen);assert.equal(next.scene.matrixWorldAutoUpdate,true);
 old.root.position.x=5;next.root.position.x=5;old.child.position.y=8;next.child.position.y=8;
 old.r.render();next.r.render();assert.deepEqual(next.seen,old.seen);assert.equal(next.count(),2);
});
test('explicit manual scene ownership is honored and pass exceptions restore automatic ownership',()=>{
 const f=fixture();f.scene.matrixWorldAutoUpdate=false;f.r.render();assert.equal(f.count(),0);assert.equal(f.scene.matrixWorldAutoUpdate,false);
 f.scene.matrixWorldAutoUpdate=true;f.r.composer.render=()=>{throw Error('pass failed');};assert.throws(()=>f.r.render(),/pass failed/);assert.equal(f.scene.matrixWorldAutoUpdate,true);
});
test('render connection rejects drift and repeated adaptation',()=>{
 assert.throws(()=>adaptQualitySource('src/core/renderer.js',raw.replace('    this.composer.render();','    this.composer.render(1);')),/patch conflict/);
 assert.throws(()=>adaptQualitySource('src/core/renderer.js',adaptQualitySource('src/core/renderer.js',raw)),/patch conflict/);
});
