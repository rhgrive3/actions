import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {beginShadowVisibilityPass,shadowVisibleForPass} from '../shadow-visibility-pass.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
function visible(o){let last=o;for(let p=o;p;p=p.parent){if(!p.visible)return false;last=p;}return last.isScene===true;}
let seed=2;function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;}
test('pass visibility equals uncached ancestry across reparent, detach and hidden nodes',()=>{
 const owner={},nodes=Array.from({length:2500},(_,i)=>({visible:true,isScene:i<3,parent:null}));
 for(let i=3;i<nodes.length;i++)nodes[i].parent=nodes[Math.floor(random()*i)];
 for(let pass=0;pass<30;pass++){
  for(let i=3;i<nodes.length;i++){if(random()<.03)nodes[i].visible=!nodes[i].visible;if(random()<.015)nodes[i].parent=random()<.1?null:nodes[Math.floor(random()*i)];}
  const state=beginShadowVisibilityPass(owner);for(const n of nodes)assert.equal(shadowVisibleForPass(n,state),visible(n));assert.equal(state.path.length,0);
 }
 owner._visibilityPass.epoch=Number.MAX_SAFE_INTEGER;const old=owner._visibilityPass;assert.notEqual(beginShadowVisibilityPass(owner),old);
});
test('shared deep ancestors read once per pass and are reevaluated next pass',()=>{
 const owner={};let reads=0;const root={visible:true,isScene:true,parent:null},parent={get visible(){reads++;return true;},parent:root};
 const leaves=Array.from({length:1000},()=>({visible:true,parent}));
 let state=beginShadowVisibilityPass(owner);for(const x of leaves)assert.equal(shadowVisibleForPass(x,state),true);assert.equal(reads,1);
 root.visible=false;state=beginShadowVisibilityPass(owner);for(const x of leaves)assert.equal(shadowVisibleForPass(x,state),false);assert.equal(reads,2);
});
test('composed moved validation retains every matrix, geometry and visibility demotion',()=>{
 const src=adaptBuildSource('src/core/shadowcache.js',fs.readFileSync(new URL('../../../inkwave-public/src/core/shadowcache.js',import.meta.url),'utf8'));
 const a=src.indexOf('  _checkMoved() {'),b=src.indexOf('  _fbo(',a);const check=vm.runInNewContext('('+src.slice(a,b).trim().replace(/^_checkMoved\(/,'function(')+')',{beginShadowVisibilityPass,shadowVisibleForPass});
 for(const mutate of [o=>o.matrixWorld.elements[7]++,o=>o.instanceMatrix.version++,o=>o.count++,o=>o.geometry.attributes.position.version++,o=>o.castShadow=false,o=>o.parent.visible=false,o=>o.parent=null]){
  const parent={visible:true,isScene:true,parent:null},o={parent,visible:true,castShadow:true,count:3,matrixWorld:{elements:Array(16).fill(0)},instanceMatrix:{version:1},geometry:{attributes:{position:{version:2}}}};
  const owner={static:[{o,m:o.matrixWorld.elements.slice(),iv:1,pv:2,vis:true,cnt:3}],dynamic:new WeakSet()};assert.equal(check.call(owner),false);mutate(o);assert.equal(check.call(owner),true);assert.equal(owner.dynamic.has(o),true);
 }
});
