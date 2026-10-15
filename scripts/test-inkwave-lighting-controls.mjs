import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {INKBLOT_SOURCE,verifyLightingIdentity,collectFrozenLighting} from './lib/inkwave-lighting-controls.mjs';
const manifest={contentHash:'fixture-content',inputHash:'fixture-input',build:{revision:'fixture',nativeStages:{stages:[{id:'inkblot',sourceSha256:INKBLOT_SOURCE}]}}};
const options={manifest,expectedSourceSha:INKBLOT_SOURCE};
function fixture(){const capture={png:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHUlEQVR4nGP8//+/FgMFgIkSzaMGjBowasBgMgAADaEDR3mgsLUAAAAASUVORK5CYII=',rawRGBA:Buffer.alloc(16*16*4,42).toString('base64'),glError:0,capture:{preReadError:0,width:16,height:16,orientation:'bottom-up',format:'RGBA8',state:{contextAttributes:{alpha:true,premultipliedAlpha:true},drawingBufferColorSpace:'srgb'}}};return {quality:'high',theme:'day',settings:{shadowMapEnabled:true},applicability:{nativeMeshes:1,shadowReceivers:1,shadowCastingLights:1,normalMapMaterials:1,roughnessMapMaterials:1,environmentMaterials:1,neutralToneMapping:true},stage:'inkblot',source:INKBLOT_SOURCE,baseURI:'http://localhost/_versions/fixture/',camera:Array(16).fill(0),projection:Array(16).fill(0),rows:['baseline','no-ink','no-receive-shadow','no-normal-map','no-roughness-map','no-environment','unlit-albedo','linear-tone-control','restored-baseline'].map(mode=>({mode,capture:structuredClone(capture)}))};}
test('synthetic serialization fixture passes, not GPU evidence',()=>assert.equal(verifyLightingIdentity(fixture(),options),true));
for(const [name,change] of [['low quality',r=>r.quality='low'],['wrong theme',r=>r.theme='sunset'],['disabled shadows',r=>r.settings.shadowMapEnabled=false],['absent normal maps',r=>r.applicability.normalMapMaterials=0],['absent roughness maps',r=>r.applicability.roughnessMapMaterials=0],['absent shadow receivers',r=>r.applicability.shadowReceivers=0],['absent shadow lights',r=>r.applicability.shadowCastingLights=0],['absent environment',r=>r.applicability.environmentMaterials=0],['wrong source',r=>r.source='wrong'],['wrong build',r=>r.baseURI='http://localhost/_versions/wrong/'],['missing control',r=>r.rows.pop()],['GL error',r=>r.rows[2].capture.glError=1282],['PNG mismatch',r=>r.rows[2].capture.rawRGBA=Buffer.alloc(1024,255).toString('base64')],['restored raw differs',r=>{const b=Buffer.alloc(1024,42);b[0]=43;r.rows.at(-1).capture.rawRGBA=b.toString('base64');}]])test('rejects '+name,()=>{const r=fixture();change(r);assert.throws(()=>verifyLightingIdentity(r,options));});
test('persists byte-identical original PNG and raw evidence',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lighting-controls-test-')),r=fixture();const report=await collectFrozenLighting({evaluate:async()=>r},dir,options);assert.equal(report.status,'collected');assert.deepEqual(fs.readFileSync(path.join(dir,'baseline.png')),Buffer.from(r.rows[0].capture.png.slice(22),'base64'));assert.deepEqual(fs.readFileSync(path.join(dir,'baseline.rgba')),Buffer.from(r.rows[0].capture.rawRGBA,'base64'));assert.equal(report.rows[0].capture.png,undefined);});
test('preserves evidence when verification fails',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lighting-controls-rejected-')),r=fixture();r.source='wrong';const report=await collectFrozenLighting({evaluate:async()=>r},dir,options);assert.equal(report.status,'incomplete');assert.ok(fs.existsSync(path.join(dir,'baseline.png')));assert.match(report.error,/wrong/);});
test('serialized browser callback has no Node closures and restores after success or capture failure',async()=>{
 const vm=await import('node:vm');
 const T=await import(process.env.INKWAVE_LIGHTING_THREE_MODULE||new URL('../inkwave-public/vendor/three/build/three.module.js',import.meta.url).href);
 const {runFrozenComposerControls}=await import('./lib/inkwave-frozen-composer-controls.mjs');
 for(const fail of [false,true]){
  const group=new T.Group(),mat=new T.MeshStandardMaterial({map:new T.Texture(),normalMap:new T.Texture(),roughnessMap:new T.Texture()}),mesh=new T.Mesh(new T.BoxGeometry(),mat);mesh.receiveShadow=true;group.add(mesh);
  const camera=new T.PerspectiveCamera(),scene=new T.Scene();scene.environment=new T.Texture();const light=new T.DirectionalLight();light.castShadow=true;scene.add(light);
  const level={manifest:{id:'inkblot',sourceSha256:INKBLOT_SOURCE}},renderer={toneMapping:T.NeutralToneMapping,toneMappingExposure:.94,shadowMap:{enabled:true,type:T.PCFShadowMap},outputColorSpace:T.SRGBColorSpace};
  let count=0,renders=0;
  const game={nativeWorld:{display:{group}},_skipRender:true,levelMesh:{visible:true},settings:{quality:'high'},theme:'day',R:{render(){renders++;}}};
  const G={game,renderer,level,camera,scene,paint:{grid:new Uint8Array(4)}};
  const context=vm.createContext({NG:G,T,document:{baseURI:'http://localhost/_versions/fixture/'},__captureNativeCanvas:async()=>{if(fail&&++count===3)throw Error('injected capture failure');return fixture().rows[0].capture;}});
  const invoke=vm.runInContext('('+runFrozenComposerControls.toString()+')',context);
  if(fail)await assert.rejects(invoke(),/injected/);else{const r=await invoke();assert.equal(r.rows.length,9);assert.equal(r.source,INKBLOT_SOURCE);}
  assert.equal(mesh.material,mat);assert.equal(mesh.receiveShadow,true);assert.equal(game.levelMesh.visible,true);assert.equal(renderer.toneMapping,T.NeutralToneMapping);assert.equal(renderer.toneMappingExposure,.94);assert.ok(renders>=4);
 }
});
