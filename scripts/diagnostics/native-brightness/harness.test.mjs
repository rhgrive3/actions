import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const T=await import(process.env.INKWAVE_LIGHTING_THREE_MODULE || new URL('../../stage-photo-verify-20261014/composer-ba8-built/vendor/three/build/three.module.js',import.meta.url).href);
import {captureNativeGeometryMask} from './geometry-mask.mjs';
import {runIndependentLightControls,maskedStatistics,collectMaskedLighting} from './masked-lighting.mjs';
import {runFrozenComposerControls} from './frozen-controls.mjs';
import {prepareLightingScene,landLightingScene} from './prepare.mjs';

function setup(theme='day'){
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(),group=new T.Group(),mat=new T.MeshStandardMaterial({normalMap:new T.Texture(),roughnessMap:new T.Texture()}),mesh=new T.Mesh(new T.BoxGeometry(),mat);mesh.receiveShadow=true;group.add(mesh);scene.add(group);
 const hemi=new T.HemisphereLight(0xffffff,0xffffff,.45),sun=new T.DirectionalLight(0xffffff,3.3);sun.castShadow=true;scene.add(hemi,sun);scene.environment=new T.Texture();scene.environmentIntensity=.45;
 const geo=new T.BufferGeometry();geo.setAttribute('paintUv',new T.Float32BufferAttribute([0,0,1,0,1,1],2));const ink=new T.Mesh(geo,new T.MeshBasicMaterial());scene.add(ink);
 const renderer={toneMapping:T.NeutralToneMapping,toneMappingExposure:1,outputColorSpace:T.SRGBColorSpace,shadowMap:{enabled:true},xr:{enabled:false}};
 const game={nativeWorld:{display:{group}},_skipRender:true,levelMesh:ink,theme,settings:{quality:'high'},R:{grade:{uniforms:{uExposure:{value:.9}}},render(){}}};
 const G={scene,camera,game,renderer,paint:{grid:new Uint8Array(10),size:16,texture:new T.Texture()},level:{manifest:{id:'inkblot',sourceSha256:'source'}}};
 return {G,mesh,mat,hemi,sun};
}
function invoke(fn,extra){return vm.runInContext('('+fn.toString()+')',vm.createContext({T,...extra}));}

test('masked stats exclude sky, HUD/non-native and ink label zero',()=>{
 const raw=Buffer.from([20,20,20,255,40,40,40,255,0,0,0,255,255,255,255,255]);
 const out=maskedStatistics({rawRGBA:raw.toString('base64'),capture:{width:2,height:2,orientation:'bottom-up'}},{width:2,height:2,orientation:'bottom-up',labels:Buffer.from([1,2,0,0]).toString('base64')});
 assert.ok(Math.abs(out.floor.mean-20)<1e-12);assert.ok(Math.abs(out.wall.mean-40)<1e-12);assert.equal(out.floor.pixels,1);
});
test('reject mismatched capture orientation or pixel lengths',()=>{
 assert.throws(()=>maskedStatistics({rawRGBA:'',capture:{width:2,height:2,orientation:'top-down'}},{width:2,height:2,orientation:'bottom-up',labels:''}));
 assert.throws(()=>maskedStatistics({rawRGBA:'',capture:{width:2,height:2,orientation:'bottom-up'}},{width:2,height:2,orientation:'bottom-up',labels:''}));
});
for(const theme of ['day','sunset'])for(const failure of [false,true])test(`${theme} independent knobs restore on ${failure?'failure':'success'}`,async()=>{
 const {G,hemi,sun}=setup(theme);let count=0;
 const callback=invoke(runIndependentLightControls,{NG:G,__captureNativeCanvas:async mode=>{if(failure&&++count===3)throw Error('injected failure');return {mode};}});
 if(failure)await assert.rejects(callback({expectedTheme:theme}),/injected/);else{
   const r=await callback({expectedTheme:theme});assert.equal(r.rows[1].settings.gradeExposure,1.125);assert.equal(r.rows[1].settings.hemisphere[0],.45);assert.equal(r.rows[2].settings.gradeExposure,.9);assert.equal(r.rows[2].settings.hemisphere[0],.9);
 }
 assert.equal(hemi.intensity,.45);assert.equal(sun.intensity,3.3);assert.equal(G.game.R.grade.uniforms.uExposure.value,.9);assert.equal(G.scene.environmentIntensity,.45);
});
for(const theme of ['day','sunset'])test(`${theme} reused nine controls restore original material and tone`,async()=>{
 const {G,mesh,mat}=setup(theme);const callback=invoke(runFrozenComposerControls,{NG:G,document:{baseURI:'fixture'},__captureNativeCanvas:async mode=>({mode})});
 const r=await callback({expectedTheme:theme});assert.equal(r.rows.length,9);assert.equal(mesh.material,mat);assert.equal(mesh.receiveShadow,true);assert.equal(G.renderer.toneMapping,T.NeutralToneMapping);
});
for(const failure of [false,true])test(`mask renderer restores state on ${failure?'readback failure':'success'}`,()=>{
 const {G,mesh,mat}=setup(),r=G.renderer;const spriteMat=new T.SpriteMaterial({rotation:.7,sizeAttenuation:false}),sprite=new T.Sprite(spriteMat);G.scene.add(sprite);let target=null,viewport=new T.Vector4(1,2,3,4),scissor=new T.Vector4(5,6,7,8),scissorTest=true,clear=new T.Color(.1,.2,.3),clearAlpha=.4;
 r.autoClear=false;const bg=new T.Color(.2,.3,.4);G.scene.background=bg;
 Object.assign(r,{getContext:()=>({drawingBufferWidth:16,drawingBufferHeight:16,getError:()=>0}),getRenderTarget:()=>target,setRenderTarget:v=>target=v,getViewport:v=>v.copy(viewport),setViewport:(...v)=>viewport=v[0]?.isVector4?v[0].clone():new T.Vector4(...v),getScissor:v=>v.copy(scissor),setScissor:v=>scissor=v.clone(),getScissorTest:()=>scissorTest,setScissorTest:v=>scissorTest=v,getClearColor:v=>v.copy(clear),getClearAlpha:()=>clearAlpha,setClearColor:(v,a)=>{clear=v?.isColor?v.clone():new T.Color(v);clearAlpha=a;},clear(){},render(){assert.notEqual(mesh.material,mat);assert.equal(sprite.material.isSpriteMaterial,true);assert.equal(sprite.material.rotation,.7);assert.equal(sprite.material.sizeAttenuation,false);assert.equal(r.shadowMap.enabled,false);},readRenderTargetPixels(t,x,y,w,h,bytes){if(failure)throw Error('readback failed');for(let i=0;i<bytes.length;i+=4){bytes[i]=255;bytes[i+3]=255;}}});
 const cb=invoke(captureNativeGeometryMask,{NG:G,btoa:s=>Buffer.from(s,'binary').toString('base64')});
 if(failure)assert.throws(cb,/readback failed/);else{const result=cb();assert.equal(result.orientation,'bottom-up');const labels=Buffer.from(result.labels,'base64');assert.equal(labels.filter(v=>v===1).length,36);}
 assert.equal(mesh.material,mat);assert.equal(sprite.material,spriteMat);assert.equal(r.shadowMap.enabled,true);assert.equal(target,null);assert.deepEqual(viewport.toArray(),[1,2,3,4]);assert.deepEqual(scissor.toArray(),[5,6,7,8]);assert.equal(scissorTest,true);assert.equal(clearAlpha,.4);assert.equal(G.scene.background,bg);assert.equal(r.outputColorSpace,T.SRGBColorSpace);assert.equal(r.toneMapping,T.NeutralToneMapping);assert.equal(r.autoClear,false);
});
test('collector rejects restored pixels mismatch even if masked means match',async()=>{
 const mask={width:16,height:16,orientation:'bottom-up',labels:Buffer.from(Array.from({length:256},(_,i)=>i<128?1:2)).toString('base64')};
 const capture={capture:{width:16,height:16,orientation:'bottom-up'},rawRGBA:Buffer.alloc(1024,20).toString('base64')};
 let call=0;const page={evaluate:async()=>{call++;if(call===1||call===4)return mask;if(call===2)return {source:'bef74ead213cfc4c041820319dbac7ab702d5f0f2df86db8369b162879f8b4f3',baseURI:'http://fixture/_versions/exact/',rows:[{mode:'baseline',capture},{mode:'restored-baseline',capture}]};const bad=structuredClone(capture);bad.rawRGBA=Buffer.alloc(1024,21).toString('base64');return {rows:[{mode:'extended-baseline',capture},{mode:'extended-restored-baseline',capture:bad}]};}};
 await assert.rejects(collectMaskedLighting(page,{expectedTheme:'day',expectedRevision:'exact',verifyCapture(){}}),/Baseline not restored/);
});
function preparationFixture({stuck=false,effects=false}={}){
 const {G}=setup();let ticks=0;const g=G.game;
 G.mode='match';G.local={alive:true,s3:{squidSpawn:{phase:'aim'}},intent:{fire:false},pos:new T.Vector3(1,2,3)};G.match={state:'intro',controller:{a:G.local}};G.screenfx={pass:{enabled:effects}};
 g.menus={current:null,wipe:{busy:false,cancel(){}}};g.input={mouse:{left:false}};
 g.debug={freeze(){g.frozen=true;},freezeBots(){},fire(v){G.local.intent.fire=v;}};
 g._setSettings=v=>Object.assign(g.settings,v);g.startMatch=async v=>{g.theme=v.time;};
 g._frame=()=>{ticks++;if(!stuck&&ticks===253)G.match.state='playing';};G.paint.flush=()=>{};
 g.R.grade.uniforms.uHurt={value:0};g.R.grade.uniforms.uFlash={value:0};G.renderer.getContext=()=>({getExtension:()=>null,getParameter:()=> 'synthetic'});
 return {G,ticks:()=>ticks};
}
test('preparation waits beyond 4.2s intro then settles, without moving camera or actor',async()=>{
 const {G,ticks}=preparationFixture(),a=G.local.pos.clone(),camera=G.camera.position.clone();
 const r=await invoke(prepareLightingScene,{NG:G,__resetPairRandom(){}})('sunset');
 assert.equal(ticks(),313);assert.equal(r.introTicks,13);assert.equal(r.phase.match,'playing');assert.deepEqual(G.local.pos,a);assert.deepEqual(G.camera.position,camera);
});
test('preparation rejects stuck intro within explicit bound',async()=>{
 const {G,ticks}=preparationFixture({stuck:true});await assert.rejects(invoke(prepareLightingScene,{NG:G,__resetPairRandom(){}})('day'),/intro did not complete/);assert.equal(ticks(),300);
});
test('AIM preparation preserves active ScreenFX for separate reference',async()=>{
 const {G}=preparationFixture({effects:true});const r=await invoke(prepareLightingScene,{NG:G,__resetPairRandom(){}})('day');assert.equal(r.phase.screenFxEnabled,true);assert.equal(G.screenfx.pass.enabled,true);
});
test('native material array is rejected before mask mutations',()=>{
 const {G,mesh,mat}=setup();mesh.material=[mat];assert.throws(()=>invoke(captureNativeGeometryMask,{NG:G})(),/single native MeshStandardMaterial/);assert.equal(mesh.material[0],mat);
});

function landingFixture({stuck=false,effectsStuck=false}={}){
 const {G}=preparationFixture({effects:true}),g=G.game,a=G.local;G.match.state='playing';g.frozen=true;g._skipRender=true;a.invuln=Infinity;G.screenfx.s={shimmer:.7};let n=0;
 g._frame=()=>{n++;a.intent.fire=g.input.mouse.left;if(g.input.mouse.left)a.s3.squidSpawn.phase='flight';if(n===4&&!stuck){delete a.s3.squidSpawn;a.grounded=true;a.ground={hit:true};a.invuln=0;}if(n===80&&!effectsStuck){G.screenfx.pass.enabled=false;G.screenfx.s.shimmer=0;}};
 return {G,ticks:()=>n};
}
test('ordinary launch preserves AIM receipt then waits for genuine landing and natural FX decay',()=>{
 const {G,ticks}=landingFixture(),pos=G.local.pos.clone(),camera=G.camera.position.clone();const r=invoke(landLightingScene,{NG:G})();
 assert.equal(r.aim.spawn,'aim');assert.equal(r.aim.shimmer,.7);assert.equal(r.aim.invuln,'Infinity');assert.equal(r.flightTicks,3);assert.equal(r.settleTicks,76);assert.equal(ticks(),80);assert.equal(r.final.screenFxEnabled,false);assert.equal(r.final.groundHit,true);assert.deepEqual(G.local.pos,pos);assert.deepEqual(G.camera.position,camera);assert.equal(G.game.input.mouse.left,false);
});
test('flight failure retains numeric trace and releases mouse',()=>{
 const {G}=landingFixture({stuck:true}),ctx={NG:G};assert.throws(()=>invoke(landLightingScene,ctx)(),/did not land/);assert.equal(G.game.input.mouse.left,false);assert.equal(G.local.s3.squidSpawn.phase,'flight');
});
test('persistent landed FX fail bounded gate without disabling effects',()=>{
 const {G,ticks}=landingFixture({effectsStuck:true});assert.throws(()=>invoke(landLightingScene,{NG:G})(),/did not decay naturally/);assert.equal(ticks(),604);assert.equal(G.screenfx.pass.enabled,true);assert.equal(G.screenfx.s.shimmer,.7);
});
