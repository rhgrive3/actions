import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
const raw=fs.readFileSync(new URL('../../../inkwave-public/src/core/shadowcache.js',import.meta.url),'utf8');
const source=adaptBuildSource('src/core/shadowcache.js',raw);
const start=source.indexOf('  _render(sm, lights, scene, camera) {'),end=source.indexOf('  _rebindTo(rt)',start);
const method=source.slice(start,end).trim().replace(/^_render\(/,'function(');
test('failed static-cache render restores dynamic caster flags before propagating',()=>{
 class GL{}
 const render=vm.runInNewContext('('+method+')',{WebGL2RenderingContext:GL});
 const dynamic={isMesh:true,castShadow:true},scene={traverse:fn=>fn(dynamic)},error=Error('render failed');
 const owner={renderer:{getContext:()=>new GL()},_orig(){assert.equal(dynamic.castShadow,false);throw error;},dirty:true,sig:'',
  _checkMoved:()=>false,_cullActors:()=>[],_collect:()=>[],stats:{rebuilds:0}};
 const sun={isDirectionalLight:true,position:{x:0,y:0,z:0},shadow:{mapSize:{x:1024},camera:{left:0,right:1,top:1,bottom:0,near:1,far:10}}};
 assert.throws(()=>render.call(owner,{},[sun],scene,{}),e=>e===error);
 assert.equal(dynamic.castShadow,true);assert.equal(owner.dirty,true);
});
