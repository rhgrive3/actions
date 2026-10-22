import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createLazyComposerTarget} from '../composer-target-adapter.mjs';
const source=fs.readFileSync(new URL('../../../inkwave-public/src/core/renderer.js',import.meta.url),'utf8');
const begin=source.indexOf('  setExtraPass(pass) {'),end=source.indexOf('  applySettings(settings)',begin);
const setExtraPass=vm.runInNewContext('('+source.slice(begin,end).trim().replace(/^setExtraPass\(/,'function(')+')');
test('ScreenFX enters after grade without constructing or disposing the native post stack',()=>{
 let constructions=0,builds=0;
 const native={passes:[],addPass(p){this.passes.push(p);},insertPass(p,i){this.passes.splice(i,0,p);},removePass(p){this.passes.splice(this.passes.indexOf(p),1);},render(){},dispose(){throw Error('unexpected dispose');}};
 const comp=createLazyComposerTarget(()=>{constructions++;return native;});
 const render={},grade={},output={},fxaa={},screen={},replacement={};
 for(const pass of [render,grade,output,fxaa])comp.addPass(pass);
 const owner={scene:{},composer:comp,grade,_buildComposer(){builds++;}};
 setExtraPass.call(owner,screen);
 assert.equal(constructions,0);assert.equal(builds,0);
 assert.deepEqual(comp.passes,[render,grade,screen,output,fxaa]);
 comp.render();assert.equal(constructions,1);assert.deepEqual(native.passes,comp.passes);
 setExtraPass.call(owner,replacement);
 assert.equal(builds,0);assert.equal(constructions,1);assert.deepEqual(native.passes,[render,grade,replacement,output,fxaa]);
 setExtraPass.call(owner,null);assert.deepEqual(native.passes,[render,grade,output,fxaa]);
});
test('unsafe packed-target replacement uses the existing full format selection path',()=>{
 let builds=0;const owner={scene:{},grade:{},_composerUsesPackedTarget:true,_buildComposer(){builds++;}};
 owner.composer={passes:[owner.grade],insertPass(){throw Error('unsafe insertion');},removePass(){}};
 setExtraPass.call(owner,{});assert.equal(builds,1);
});
