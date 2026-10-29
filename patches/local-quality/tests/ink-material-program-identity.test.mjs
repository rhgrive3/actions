import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';

const materialSource=fs.readFileSync(new URL('../../../inkwave-public/src/game/character-mats.js',import.meta.url),'utf8');
const rendererSource=fs.readFileSync(new URL('../../../inkwave-public/vendor/three/build/three.module.js',import.meta.url),'utf8');
function between(source,start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a&&source.indexOf(start,a+start.length)<0,'one actual source owner');
 return source.slice(a,b);
}
const factorySource=between(materialSource,'export function getInkMaterial(color) {','\nexport function makeGlowMaterial');
const makeFactory=(legacy=false)=>{
 const source=legacy?factorySource.replace("name: 'iw-ink-physical'","name: 'iw-ink-' + hex"):factorySource;
 return new Function('THREE','_inkCache',source.replace('export function','function')+';return getInkMaterial;')(THREE,new Map());
};
const keySource=between(rendererSource,'function getProgramCacheKey( parameters ) {','\n\tfunction getProgramCacheKeyParameters(');
const parameterSource=between(rendererSource,'function getProgramCacheKeyParameters( array, parameters ) {','\n\tfunction getProgramCacheKeyBooleans(');
const booleanSource=between(rendererSource,'function getProgramCacheKeyBooleans( array, parameters ) {','\n\tfunction getUniforms(');
const acquireSource=between(rendererSource,'function acquireProgram( parameters, cacheKey ) {','\n\tfunction releaseProgram(');
const key=new Function('renderer','_programLayers',keySource+parameterSource+booleanSource+';return getProgramCacheKey;')({outputColorSpace:THREE.SRGBColorSpace},new THREE.Layers());
const parameters=m=>({shaderID:'physical',shaderName:m.name,isRawShaderMaterial:false,defines:m.defines,
 precision:'highp',outputColorSpace:THREE.LinearSRGBColorSpace,clearcoat:m.clearcoat>0,sheen:m.sheen>0,customProgramCacheKey:m.customProgramCacheKey()});
const materialValues=m=>{const data=m.toJSON();delete data.uuid;delete data.name;return data;};

test('actual ink factory keeps distinct hex-cached colors and every physical material value',()=>{
 const before=makeFactory(true),after=makeFactory(),colors=['#f2e312','#8a3cff','#ff8a14','#2f5bff','#000000','#ffffff'];
 const materials=[];
 for(const hex of colors){
  const color=new THREE.Color(hex),old=before(color),now=after(color);materials.push(old,now);
  assert.equal(old.name,'iw-ink-'+color.getHexString());assert.equal(now.name,'iw-ink-physical');
  assert.equal(after(color.clone()),now,'hex cache still reuses the same material');
  assert.notEqual(now.color,color);assert.deepEqual(materialValues(now),materialValues(old));
 }
 assert.notEqual(after(new THREE.Color(colors[0])),after(new THREE.Color(colors[1])),'actual team colors remain separate material/uniform owners');
 let disposed=0;for(const m of materials){m.addEventListener('dispose',()=>disposed++);m.dispose();}assert.equal(disposed,materials.length);
});

test('real Three cache acquisition used first-color shader names and now has order-independent identity',()=>{
 function acquireNames(factory,order){
  const compiled=[],programs=[],programsMap=new Map();
  // Execute real cache acquisition; capture its actual compiler arguments.
  function Compiler(_renderer,cacheKey,input){compiled.push(input.shaderName);this.cacheKey=cacheKey;this.usedTimes=1;}
  const acquire=new Function('programsMap','programs','WebGLProgram','renderer','bindingStates',acquireSource+';return acquireProgram;')(programsMap,programs,Compiler,{},{});
  const values=order.map(hex=>parameters(factory(new THREE.Color(hex))));
  assert.equal(key(values[0]),key(values[1]),'uniform team colors already share the physical shader program');
  const a=acquire(values[0],key(values[0])),b=acquire(values[1],key(values[1]));assert.equal(a,b);assert.equal(a.usedTimes,2);assert.equal(programs.length,1);
  return compiled;
 }
 const order=['#f2e312','#8a3cff'];
 assert.notDeepEqual(acquireNames(makeFactory(true),order),acquireNames(makeFactory(true),[...order].reverse()),'old actual constructor inputs depend on first compiled team');
 assert.deepEqual(acquireNames(makeFactory(),order),['iw-ink-physical']);
 assert.deepEqual(acquireNames(makeFactory(),[...order].reverse()),['iw-ink-physical']);
 const p=parameters(makeFactory()(new THREE.Color(order[0])));
 assert.notEqual(key({...p,clearcoat:false}),key(p),'real feature flags retain separate programs');
 assert.notEqual(key({...p,customProgramCacheKey:'different-shader-body'}),key(p),'custom shader content identity remains separate');
});

test('actual shader-name input is an unused debug macro outside program cache identity',()=>{
 assert.ok(rendererSource.includes('shaderName: material.name,'));
 assert.ok(rendererSource.includes('this.name = parameters.shaderName;'));
 const uses=rendererSource.split('\n').filter(line=>line.includes('SHADER_NAME'));
 assert.equal(uses.length,4);assert.ok(uses.every(line=>line.includes("'#define SHADER_NAME ' + parameters.shaderName")));
 assert.equal(Object.values(THREE.ShaderChunk).join('\n').includes('SHADER_NAME'),false);
 assert.equal(THREE.ShaderLib.physical.vertexShader.includes('SHADER_NAME'),false);
 assert.equal(THREE.ShaderLib.physical.fragmentShader.includes('SHADER_NAME'),false);
 assert.equal(/shaderName/.test(keySource+parameterSource+booleanSource),false,'cache key excludes debug names without this change altering that policy');
});
