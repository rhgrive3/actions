import test from 'node:test';
import assert from 'node:assert/strict';
import {applyNativeShadeFill,nativeShadeFillFor,NATIVE_SHADE_FILL_CONFIG} from '../runtime/native-lighting.mjs';
const NATIVE_SHADE_FILL=.35;
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
 const data={manifest:{id:'inkblot',materials:{floor:source,glass:source},objects:['floor','glass'].map((material,i)=>({active:true,material,name:material,glass:!!i,vo:0,vc:3,io:0,ic:3,collidable:true}))},vertices:new Float32Array([0,0,0,0,1,0,0,0,1,0,0,0,1,0,1,0,0,0,1,0,1,0,0,1]),indices:new Uint32Array([0,1,2])};
 const d=f.nativeDisplay(data,textures,'high',{inkblot:{day:.35,sunset:.2}});d.setLighting('day');
 for(const [i,m] of d.group.children.entries()){
  const mat=m.material,shader={uniforms:{},fragmentShader:THREE.ShaderLib.standard.fragmentShader};mat.onBeforeCompile(shader);
  assert.equal(shader.uniforms.uNativeShadeFill.value,i?0:.35);assert.equal(shader.uniforms.uNativeShadeFill,mat.userData.nativeShadeFill);
  assert.match(shader.fragmentShader,/texture2D\( alphaMap, vAlphaMapUv \)\.r/);assert.match(shader.fragmentShader,/max\(texelRoughness.r, 0.55\)/);
  assert.equal(mat.normalMap,tex);assert.match(mat.customProgramCacheKey(),/shade-fill-v1/);
  const basic={uniforms:{},fragmentShader:THREE.ShaderLib.basic.fragmentShader};mat.userData.nativeChannelHook(basic);assert.match(basic.fragmentShader,/texture2D\( alphaMap, vAlphaMapUv \)\.r/);
 }
 d.dispose();
});
test('scoped configuration defaults off and rejects every unverified stage/theme',()=>{
 const cfg={inkblot:{day:.35,sunset:.2,night:.5,dusk:.5},scorch:{day:.5}};
 for(const stage of ['inkblot','scorch','mako',undefined,''])for(const theme of ['day','sunset','dusk','night','unknown',undefined]){
  assert.equal(nativeShadeFillFor(stage,theme),0,'production coefficients remain disabled');
  const expected=stage==='inkblot'&&theme==='day'?.35:stage==='inkblot'&&theme==='sunset'?.2:0;
  assert.equal(nativeShadeFillFor(stage,theme,cfg),expected);
 }
 for(const v of [NaN,Infinity,-1,2,undefined,'0.35'])assert.equal(nativeShadeFillFor('inkblot','day',{inkblot:{day:v}}),Number.isFinite(v)?Math.max(0,Math.min(.5,v)):0);
 assert.ok(Object.isFrozen(NATIVE_SHADE_FILL_CONFIG));assert.ok(Object.isFrozen(NATIVE_SHADE_FILL_CONFIG.inkblot));
});
test('real native decor initializes new worlds and resets live theme without stale uniform state',async()=>{
 const {fixture}=await import('../../splatoon3/tests/source-fixture.mjs');
 const f=await fixture({extraExports:"export {nativeDisplay} from './patches/native-stages/runtime/native-render.mjs'; export {createNativeDecor} from './patches/native-stages/runtime/native-world.mjs';"}),{THREE}=f;
 const cfg={inkblot:{day:.35,sunset:.2}},make=(id='inkblot')=>f.nativeDisplay({manifest:{id,materials:{floor:{albedo:'a',maps:{},channels:{}}},objects:[{active:true,material:'floor',name:'floor',vo:0,vc:3,io:0,ic:3,collidable:true}]},vertices:new Float32Array([0,0,0,0,1,0,0,0,1,0,0,0,1,0,1,0,0,0,1,0,1,0,0,1]),indices:new Uint32Array([0,1,2])},new Map([['a',new THREE.Texture()]]),'high',cfg);
 const game={theme:'day',mapDef:{id:'scorch'}},first=make(),mat=first.group.children[0].material,u=mat.userData.nativeShadeFill;
 assert.equal(u.value,0,'detached display starts disabled');game.decor=f.createNativeDecor(game,first);assert.equal(u.value,.35,'manifest id, not previous mapDef, selects scope');
 for(const [theme,value] of [['sunset',.2],['night',0],['day',.35],['unknown',0],[undefined,0],['sunset',.2]]){game.theme=theme;game.decor.setNight(1);assert.equal(u.value,value);}
 game.theme='day';game.decor.setNight(0);game.decor.setTeamColors(new THREE.Color('red'),new THREE.Color('blue'));assert.equal(u.value,.35);
 for(const q of ['low','high','balanced']){first.updateTextures(new Map([['a',new THREE.Texture()]]),q);assert.equal(first.group.children[0].material,mat);assert.equal(mat.userData.nativeShadeFill,u);assert.equal(u.value,.35);}
 const rebuilt=make();game.decor=f.createNativeDecor(game,rebuilt);assert.equal(rebuilt.group.children[0].material.userData.nativeShadeFill.value,.35,'same-theme new world initialized');
 const other=make('scorch');game.decor=f.createNativeDecor(game,other);assert.equal(other.group.children[0].material.userData.nativeShadeFill.value,0);game.theme='sunset';game.decor.setNight(1);assert.equal(other.group.children[0].material.userData.nativeShadeFill.value,0);
 game.decor=f.createNativeDecor(game,rebuilt);assert.equal(rebuilt.group.children[0].material.userData.nativeShadeFill.value,.2,'return to verified stage reads current theme');
 first.dispose();rebuilt.dispose();other.dispose();
});
