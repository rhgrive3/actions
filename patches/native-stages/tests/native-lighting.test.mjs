import test from 'node:test';
import assert from 'node:assert/strict';
import {applyNativeShadeFill,NATIVE_SHADE_FILL} from '../runtime/native-lighting.mjs';
const weight=d=>{const x=Math.max(0,Math.min(1,(d-.05)/.30));return 1-x*x*(3-2*x);};
test('native shade fill is bounded and vanishes in directly lit materials',()=>{
 assert.equal(NATIVE_SHADE_FILL,.35);
 for(const d of [0,.01,.05,.10,.20,.30,.35,.6,1,4]){
  const f=NATIVE_SHADE_FILL*weight(d);assert.ok(f>=0&&f<=NATIVE_SHADE_FILL);
  if(d>=.35)assert.equal(f,0);
 }
 assert.equal(weight(0),1);assert.ok(Math.abs(weight(.2)-.5)<1e-12);
});
test('shade fill adds neutral albedo-scaled indirect light without changing direct light',()=>{
 const u={value:NATIVE_SHADE_FILL},shader={uniforms:{},fragmentShader:'#include <lights_fragment_end>\n#include <aomap_fragment>'};
 applyNativeShadeFill(shader,u);assert.equal(shader.uniforms.uNativeShadeFill,u);
 assert.match(shader.fragmentShader,/reflectedLight\.indirectDiffuse \+= diffuseColor\.rgb \* clamp\( uNativeShadeFill, 0\.0, 0\.5 \) \* nativeShadeWeight/);
 assert.doesNotMatch(shader.fragmentShader,/reflectedLight\.directDiffuse\s*[+*]?=/);
 assert.doesNotMatch(shader.fragmentShader,/emissive|toneMapping|exposure/);
 assert.ok(shader.fragmentShader.indexOf('nativeAlbedoLuma')<shader.fragmentShader.indexOf('#include <aomap_fragment>'));
});

test('near-black albedo stays finite and black does not emit light',()=>{
 for(const a of [0,1e-12,1e-6,.01,1])for(const direct of [0,1e-12,.1,1]){
  const ratio=direct/Math.max(a,.0001),fill=a*NATIVE_SHADE_FILL*weight(ratio);
  assert.ok(Number.isFinite(fill));assert.ok(fill>=0&&fill<=a*NATIVE_SHADE_FILL);
  if(a===0)assert.equal(fill,0);
 }
});
test('missing lighting anchor fails explicitly before mutating shader uniforms',()=>{
 const s={uniforms:{},fragmentShader:'void main() {}'};
 assert.throws(()=>applyNativeShadeFill(s,{value:.35}),/missing lighting shader anchor/);
 assert.deepEqual(s.uniforms,{});
});
test('real native material combines shade fill and source channels, excludes glass',async()=>{
 const {fixture}=await import('../../splatoon3/tests/source-fixture.mjs');
 const f=await fixture({extraExports:"export {nativeDisplay} from './patches/native-stages/runtime/native-render.mjs';"}),{THREE}=f;
 const tex=new THREE.Texture(),textures=new Map([['a',tex],['n',tex],['r',tex],['o',tex]]);
 const source={albedo:'a',maps:{normal:'n',roughness:'r',opacity:'o'},channels:{roughness:'r',opacity:'r'}};
 const data={manifest:{materials:{floor:source,glass:source},objects:['floor','glass'].map((material,i)=>({active:true,material,name:material,glass:!!i,vo:0,vc:3,io:0,ic:3,collidable:true}))},vertices:new Float32Array([0,0,0,0,1,0,0,0,1,0,0,0,1,0,1,0,0,0,1,0,1,0,0,1]),indices:new Uint32Array([0,1,2])};
 const d=f.nativeDisplay(data,textures,'high');
 for(const [i,m] of d.group.children.entries()){
  const mat=m.material,shader={uniforms:{},fragmentShader:THREE.ShaderLib.standard.fragmentShader};mat.onBeforeCompile(shader);
  assert.equal(shader.uniforms.uNativeShadeFill.value,i?0:.35);assert.equal(shader.uniforms.uNativeShadeFill,mat.userData.nativeShadeFill);
  assert.match(shader.fragmentShader,/texture2D\( alphaMap, vAlphaMapUv \)\.r/);assert.match(shader.fragmentShader,/max\(texelRoughness.r, 0.55\)/);
  assert.equal(mat.normalMap,tex);assert.match(mat.customProgramCacheKey(),/shade-fill-v1/);
  const basic={uniforms:{},fragmentShader:THREE.ShaderLib.basic.fragmentShader};mat.userData.nativeChannelHook(basic);assert.match(basic.fragmentShader,/texture2D\( alphaMap, vAlphaMapUv \)\.r/);
 }
 d.dispose();
});
