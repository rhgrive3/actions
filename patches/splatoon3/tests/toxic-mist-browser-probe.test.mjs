import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {fixture} from './source-fixture.mjs';import {emptyLoadout,gearCurve} from '../runtime/gear.mjs';
test('exact browser probe admits Mist and tests victim AP0/10/57 in both grounded forms',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
 f.G.scene=new f.THREE.Scene();f.G.level={blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out;}};f.G.physics=new f.Physics(f.G.level);
 const s=fs.readFileSync(new URL('../../../scripts/check-inkwave-catalog-browser.mjs',import.meta.url),'utf8');const helpers=s.slice(s.indexOf('      class DisplayCharacter {'),s.indexOf('      const {CANONICAL_KITS}'));const block=s.slice(s.indexOf('      const mistChecks=[];'),s.indexOf('      const conditionalChecks=[];'));
 // Execute the exact async browser block, including its terrain-module import.
 const context=vm.createContext({}),imports=[];
 const levelModule=new vm.SyntheticModule(['Level'],function(){this.setExport('Level',f.Level);},{context});
 await levelModule.link(()=>{throw new Error('Unexpected Level fixture import');});await levelModule.evaluate();
 const probe=new vm.SourceTextModule('export default async function(Actor,THREE,Player,Projectiles,G,api,emptyLoadout,gearCurve,check){'+helpers+block+'return {mistChecks,mistQueryChecks};}',{
  context,importModuleDynamically:async specifier=>{assert.equal(specifier,'/src/world/level.js');imports.push(specifier);return levelModule;}
 });
 await probe.link(()=>{throw new Error('Unexpected static browser probe import');});await probe.evaluate();
 const saved={actors:f.G.actors,projectiles:f.G.projectiles,time:f.G.time,level:f.G.level,physics:f.G.physics};
 const result=await probe.namespace.default(f.Actor,f.THREE,f.PLAYER,f.Projectiles,f.G,{Physics:f.Physics},emptyLoadout,gearCurve,(v,m)=>assert.ok(v,m));
 assert.deepEqual(imports,['/src/world/level.js']);assert.equal(result.mistChecks.length,6);
 assert.deepEqual(Array.from(result.mistChecks,r=>[r.ap,r.squid]),[[0,false],[0,true],[10,false],[10,true],[57,false],[57,true]]);
 assert.deepEqual(Array.from(result.mistQueryChecks,r=>[r.volumes,r.form,r.losCalls]),[[1,'kid',1],[96,'kid',1],[96,'air-squid',0]]);
 for(const [key,value]of Object.entries(saved))assert.equal(f.G[key],value,'browser probe restores '+key);
});
