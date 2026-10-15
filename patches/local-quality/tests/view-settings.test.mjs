// Run the actual composed Game boot/settings and camera. Stop at the first
// display lookup, after settings migration; rendering is outside these checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url)),built=process.env.INKWAVE_VIEW_SETTINGS_SITE;
async function fixture(stored={}){
 const base=path.resolve(built||path.join(root,'inkwave-public')),mods=new Map(),storage=new Map([['inkwave.settings',stored]]);
 const context=vm.createContext({console,performance,URL,URLSearchParams,setTimeout,clearTimeout,location:{search:''},innerWidth:1000,innerHeight:700,
  localStorage:{setItem:(k,v)=>storage.set(k,JSON.parse(v)),getItem:k=>storage.has(k)?JSON.stringify(storage.get(k)):null}});
 function load(file){
  if(mods.has(file))return mods.get(file);
  const rel=path.relative(base,file);let code=fs.readFileSync(file,'utf8');
  if(!built&&file.startsWith(base+path.sep))code=adaptBuildSource(rel,code);
  if(file===path.join(base,'src/main.js')){
   const ast=parse(code,{ecmaVersion:'latest',sourceType:'module'});
   const cls=ast.body.find(n=>n.type==='ClassDeclaration'&&n.body.body.some(m=>m.key?.name==='_setSettings'));
   const boot=ast.body.find(n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.init?.type==='NewExpression'&&d.init.callee.name===cls?.id.name));
   assert(cls&&boot,'locate actual Game bootstrap without starting renderer');
   code=code.slice(0,boot.start)+`export {${cls.id.name} as Game};`;
  }
  const mod=new vm.SourceTextModule(code,{context,identifier:file,initializeImportMeta(meta){meta.url=pathToFileURL(file).href;}});mods.set(file,mod);return mod;
 }
 const main=load(path.join(base,'src/main.js'));
 await main.link((spec,from)=>{
  let file=spec==='three'?path.join(base,'vendor/three/build/three.module.js'):spec.startsWith('three/addons/')?path.join(base,'vendor/three/jsm',spec.slice('three/addons/'.length)):path.resolve(path.dirname(from.identifier),spec);
  if(!built&&file.startsWith(path.join(base,'patches/')))file=path.join(root,path.relative(base,file));
  if(!built&&file.startsWith(path.join(root,'src/')))file=path.join(base,path.relative(root,file));
  return load(file);
 });await main.evaluate();
 const ns=rel=>mods.get(path.join(rel.startsWith('patches/')&&!built?root:base,rel)).namespace;
 context.document={getElementById(){throw new Error('fixture-display-boundary');}};
 const G=ns('src/core/ctx.js').G,game=Object.create(main.namespace.Game.prototype);
 return {game,storage,G,CameraRig:ns('src/game/cameraRig.js').CameraRig,THREE:ns('vendor/three/build/three.module.js')};
}

const boot = async f => {await assert.rejects(f.game.boot(),/fixture-display-boundary/);};
test('boot repairs corrupt persisted FOV and mouse sensitivity before renderer initialization',async()=>{
 for(const bad of ['bad',[],{},true]){
  const f=await fixture({fovMode:'h',fov:bad,sensitivity:bad});await boot(f);
  assert.equal(f.game.settings.fov,82);assert.equal(f.game.settings.sensitivity,1);
  assert.equal(f.storage.get('inkwave.settings').fov,82);assert.equal(f.storage.get('inkwave.settings').sensitivity,1);
 }
});
test('live invalid updates keep previous valid view values and do not mutate caller input',async()=>{
 const f=await fixture({fovMode:'h',fov:91,sensitivity:1.75});await boot(f);
 for(const bad of [NaN,Infinity,-Infinity,'bad',null,[],{}]){
  const partial={fov:bad,sensitivity:bad};f.game._setSettings(partial);
  assert.equal(f.game.settings.fov,91);assert.equal(f.game.settings.sensitivity,1.75);assert.equal(partial.fov,bad);
 }
 const camera=new f.THREE.PerspectiveCamera(60,16/9,.15,6500),rig=new f.CameraRig(camera);rig.update(1/60);
 assert.ok(camera.projectionMatrix.elements.every(Number.isFinite));assert.ok(rig.gameCam.projectionMatrix.elements.every(Number.isFinite));
});
test('finite view settings respect existing UI bounds at boot and during updates',async()=>{
 const f=await fixture({fovMode:'h',fov:10000,sensitivity:-5});await boot(f);
 assert.equal(f.game.settings.fov,100);assert.equal(f.game.settings.sensitivity,.2);
 f.game._setSettings({fov:1,sensitivity:99});assert.equal(f.game.settings.fov,65);assert.equal(f.game.settings.sensitivity,3);
});
test('valid FOV, global sensitivity, numeric frame cap and independent aim profiles survive boot and reload',async()=>{
 const stored={fovMode:'h',fov:91,sensitivity:1.75,frameRate:60,padSensitivityScale:'s3',aimProfile:'handheld',
  aimProfiles:{tv:{gyro:false,padSensitivity:-3},handheld:{gyro:true,padSensitivity:4}}};
 const f=await fixture(stored);await boot(f);
 assert.equal(f.game.settings.fov,91);assert.equal(f.game.settings.sensitivity,1.75);assert.equal(f.game.settings.frameRate,60);
 assert.equal(f.game.settings.aimProfiles.tv.padSensitivity,-3);assert.equal(f.game.settings.aimProfiles.handheld.padSensitivity,4);
 f.game._setSettings({aimProfile:'tv'});assert.equal(f.game.settings.sensitivity,1.75);assert.equal(f.game.settings.fov,91);
 const reloaded=await fixture(f.storage.get('inkwave.settings'));await boot(reloaded);assert.equal(reloaded.game.settings.fov,91);assert.equal(reloaded.game.settings.sensitivity,1.75);
 const legacy=await fixture({...stored,fovMode:'v'});await boot(legacy);assert.equal(legacy.game.settings.fov,82);
});
