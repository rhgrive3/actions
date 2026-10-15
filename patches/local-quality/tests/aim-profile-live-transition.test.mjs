// Run the actual Game settings entry point with the installed MobileInput
// platform owner. Only the physical sensor and display/storage seams are spies.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url)),built=process.env.INKWAVE_AIM_PROFILE_SITE;
async function fixture({deferred=false}={}){
 const base=path.resolve(built||path.join(root,'inkwave-public')),mods=new Map(),storage=new Map(),answers=[],notices=[];
 const context=vm.createContext({console,performance,URL,URLSearchParams,setTimeout,clearTimeout,location:{search:''},innerWidth:1000,innerHeight:700,
  localStorage:{setItem:(k,v)=>storage.set(k,JSON.parse(v)),getItem:()=>null}});
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
 const G=ns('src/core/ctx.js').G,Mobile=ns('src/core/mobile.js').MobileInput,aim=ns('patches/local-quality/aim-profile.mjs');
 const gyro={enabled:false,needsPermission:deferred,supported:true,configure(){},discard(){},resync(){},
  start(){this.enabled=true;},stop(){this.enabled=false;},statusMessage:()=> 'permission denied',
  request(){return deferred?new Promise(r=>answers.push(r)):Promise.resolve(true);}};
 const mobile=Object.assign(Object.create(Mobile.prototype),{gyro,s:{},visible:true,_gyroIntent:0,_gyroWanted:false,
  _gyroBtn(){},toast:s=>notices.push(s)});
 const game=Object.assign(Object.create(main.namespace.Game.prototype),{input:{mobile},settings:aim.migrateAimProfiles({aimProfile:'tv',aimProfiles:{tv:{gyro:false},handheld:{gyro:true}}}),match:{state:'playing'},menus:{refreshSetting(){}}});
 Object.assign(G,{mode:'match',match:game.match,settings:game.settings});
 return {game,mobile,gyro,answers,storage,notices};
}
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
test('actual Game and platform sensor apply nested active-profile ON/OFF and save the final projection',async()=>{
 const f=await fixture();f.game._setSettings({aimProfiles:{tv:{gyro:true}}});await flush();assert.equal(f.gyro.enabled,true);
 f.game._setSettings({aimProfiles:{tv:{gyro:false}}});assert.equal(f.gyro.enabled,false);
 assert.equal(f.storage.get('inkwave.settings').gyro,false);assert.equal(f.game.settings.aimProfiles.handheld.gyro,true);
});
test('conflicting flat and nested changes use the final active profile for sensor admission',async()=>{
 const f=await fixture();f.game._setSettings({gyro:false,aimProfiles:{tv:{gyro:true}}});await flush();assert.equal(f.gyro.enabled,true);
 f.game._setSettings({gyro:true,aimProfiles:{tv:{gyro:false}}});await flush();assert.equal(f.gyro.enabled,false);assert.equal(f.game.settings.gyro,false);
});
test('inactive profile edits preserve the active sensor and create no permission request',async()=>{
 const f=await fixture({deferred:true});f.game._setSettings({aimProfiles:{handheld:{gyro:false}}});assert.equal(f.answers.length,0);assert.equal(f.game.settings.gyro,false);
});
test('nested OFF/ON cannot let the older permission activate the current sensor intent',async()=>{
 const f=await fixture({deferred:true});f.game._setSettings({gyro:true});f.game._setSettings({aimProfiles:{tv:{gyro:false}}});f.game._setSettings({aimProfiles:{tv:{gyro:true}}});
 assert.equal(f.answers.length,2);f.answers.shift()(true);await flush();assert.equal(f.gyro.enabled,false);
 f.answers.shift()(true);await flush();assert.equal(f.gyro.enabled,true);
});
test('denied nested ON reverts and persists only the active profile once',async()=>{
 const f=await fixture({deferred:true});f.game._setSettings({aimProfiles:{tv:{gyro:true}}});assert.equal(f.answers.length,1);f.answers.shift()(false);await flush();
 assert.equal(f.game.settings.gyro,false);assert.equal(f.storage.get('inkwave.settings').aimProfiles.tv.gyro,false);assert.equal(f.game.settings.aimProfiles.handheld.gyro,true);assert.equal(f.notices.length,1);
});
