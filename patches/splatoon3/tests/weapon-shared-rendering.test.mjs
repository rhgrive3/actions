import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
let loaded;
const setup=()=>loaded??=fixture({fullRuntime:true,includeCharacter:true,productionComposition:true,realProjectiles:true,extraExports:"export {getWeaponDef} from './inkwave-public/src/game/character-weapons.js'; export * as Kit from './patches/splatoon3/runtime/weapon-models/kit.mjs'; export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"}).then(f=>{f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);const {G,THREE}=f;G.scene=new THREE.Scene;G.physics=new f.Physics(G.level);G.level.queryBlocks=(_a,_b,_c,_d,o)=>{o.length=0;return o};G.physics.segment=(_a,_b,h)=>{h.hit=false;return h};return f;});
const actor=(f,id)=>{const a=new f.Actor({team:0,weapon:id,CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});a.character.actor=a;a.character.onEvent=null;a.grounded=a.ground.hit=true;f.G.actors=[a];return a;};

test('Ballpoint glass is independent, cached, transparent and retained at both LODs',async()=>{
 const f=await setup(),d=f.getWeaponDef('s3-spinner-downpour');assert(d.glass);assert.equal(d.glass.index.count/3,256);d.glass.computeBoundingBox();assert(d.glass.boundingBox.max.z>.42);assert.deepEqual(Array.from(d.muzzle.toArray()),[0,.07,.432]);assert.equal(d.parts.barrels.mat,'ink');
 assert.notEqual(d.glass,d.body);assert.notEqual(d.glass,d.ink);
 const a=actor(f,'s3-spinner-downpour'),b=actor(f,'s3-spinner-downpour');
 const shell=a.character.weapon.off.getObjectByName('weapon-glass'),other=b.character.weapon.off.getObjectByName('weapon-glass');
 assert.equal(shell.geometry,d.glass);assert.equal(other.geometry,d.glass);assert.equal(shell.material,other.material);assert.equal(shell.material,f.Kit.getWeaponGlassMaterial());
 const m=shell.material;assert.equal(m.transparent,true);assert.equal(m.depthWrite,false);assert.equal(m.depthTest,true);assert.equal(m.side,f.THREE.FrontSide);assert.equal(m.transmission,0);assert.equal(m.clearcoat,.65);assert.equal(m.roughness,.16);assert(m.opacity>0&&m.opacity<.4);assert.equal(shell.castShadow,false);
 const shader={fragmentShader:'#include <opaque_fragment>'};m.onBeforeCompile(shader);assert(shader.fragmentShader.includes('iwShellEdge'));assert.equal(m.customProgramCacheKey(),'iw-weapon-glass-fresnel-1');
 // Shared geometry cannot stay suppressed after GTAO or leak into another Actor.
 const range=d.glass.drawRange.count,rangeStart=d.glass.drawRange.start,opaque={overrideMaterial:new f.THREE.MeshNormalMaterial()},beauty={overrideMaterial:null};
 for(const mesh of [shell,other,shell]){
  mesh.onBeforeRender(null,opaque,null,d.glass);assert.equal(d.glass.drawRange.count,0);
  mesh.onAfterRender(null,opaque,null,d.glass);assert.equal(d.glass.drawRange.count,range);
  mesh.onBeforeRender(null,beauty,null,d.glass);assert.equal(d.glass.drawRange.count,range);
  mesh.onAfterRender(null,beauty,null,d.glass);assert.equal(d.glass.drawRange.count,range);
 }
 // A beauty frame recovers even if an interrupted override omitted afterRender.
 shell.onBeforeRender(null,opaque,null,d.glass);other.onBeforeRender(null,beauty,null,d.glass);assert.equal(d.glass.drawRange.count,range);
 opaque.overrideMaterial.dispose();let geometryDisposed=0;d.glass.addEventListener('dispose',()=>geometryDisposed++);
 let disposed=0;m.addEventListener('dispose',()=>disposed++);
 for(const tier of ['game','far','hero','far','game']){a.character.setLod(tier);for(let n=0;n<8;n++)a._finishFrame(1/60);assert(shell.visible);assert.equal(shell.geometry,d.glass);assert.equal(shell.material,m);assert.equal(a.character.weapon.off.getObjectByName('weapon-glass'),shell);}
 const cachedWeapon=a.character.weapon;
 for(let i=0;i<3;i++){
  a.character.setWeapon('s3-maneuver-short');assert.equal(a.character.weapon.off.getObjectByName('weapon-glass'),undefined);
  a.character.setWeapon('s3-spinner-downpour');assert.equal(a.character.weapon,cachedWeapon);assert.equal(a.character.weapon.off.getObjectByName('weapon-glass'),shell);assert.equal(shell.geometry,d.glass);assert.equal(shell.material,m);
 }
 b.character.dispose();a.character.setColor('#1144ee');assert.equal(shell.material,m);assert.equal(disposed,0);a.character.dispose();assert.equal(disposed,0,'shared material survives actor disposal');assert.equal(geometryDisposed,0,'shared geometry survives actor disposal');assert.equal(d.glass.drawRange.count,range);assert.equal(d.glass.drawRange.start,rangeStart);
});

test('existing Dapple and Glooga hands keep forward muzzles and bilateral appendages',async()=>{
 const f=await setup();for(const id of ['s3-maneuver-short','s3-maneuver-gallon']){
  const a=actor(f,id),ch=a.character,d=f.getWeaponDef(id);assert.equal(ch.weapon.def,d);assert.equal(ch.weapon.left.def,d);assert.equal(ch.weapon.body.geometry,ch.weapon.left.body.geometry);assert.equal(ch.weapon.off.getObjectByName('weapon-glass'),undefined);
  for(let i=0;i<150;i++){const fire=i>=70;a.ink=100;a.intent.fire=fire;a.vel.set(0,0,i>=30&&i<60?2.4:0);f.G.time+=1/60;a.weaponRunner.update(1/60,{fire});a._finishFrame(1/60);ch.root.updateMatrixWorld(true);
   if([25,55,120].includes(i)){
    const points=[];for(let w=ch.weapon;w;w=w.left){assert(w.off.matrixWorld.determinant()>0);const center=id==='s3-maneuver-short'?[0,.062,-.136]:[0,.135,-.075];points.push(w.off.localToWorld(new f.THREE.Vector3(...center)));const expected=w.off.localToWorld(d.muzzle.clone());assert(expected.distanceTo(w.muzzle.getWorldPosition(new f.THREE.Vector3()))<1e-7);if(fire){const forward=new f.THREE.Vector3(0,0,1).transformDirection(w.off.matrixWorld);assert(forward.z>.98);}}
    assert(points[0].x<0&&points[1].x>0,id+' appendages stay in their own hands');assert(Math.abs(points[0].z-points[1].z)<.045,id+' neither rear appendage flips to a different forward depth');
   }
  }ch.dispose();
 }
});

test('standard Sloshing Machine front bezel remains neutral body material',async()=>{
 const f=await setup(),d=f.getWeaponDef('s3-slosher-launcher');assert.equal(d.glass,null);
 // The silver bezel is static vertex colour, never a team-ink channel.
 const color=new f.THREE.Color('#c6c9cc'),p=d.bodyStatic.attributes.position,c=d.bodyStatic.attributes.color;let bezel=0;
 for(let i=0;i<p.count;i++)if(Math.abs(c.getX(i)-color.r)<1e-6&&Math.abs(c.getY(i)-color.g)<1e-6&&Math.abs(c.getZ(i)-color.b)<1e-6)bezel++;
 assert(bezel>200,'the standard silver front bezel remains present');
 const a=actor(f,'s3-slosher-launcher');const mat=a.character.weapon.body.material;a.character.setColor('#14ef43');assert.equal(a.character.weapon.body.material,mat);a.character.dispose();
});
