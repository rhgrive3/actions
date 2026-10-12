import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fixture} from './source-fixture.mjs';
const BASELINE=new URL('../reference/weapon-models/shooters-b-baseline.mjs.txt',import.meta.url);
const TARGETS=['s3-shooter-quicklong','s3-shooter-heavy','s3-shooter-triplequick','s3-shooter-triplemiddle','s3-shooter-flash'];
const extraExports="export {getWeaponDef,animateWeapon} from './inkwave-public/src/game/character-weapons.js'; export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs'; export * as REG from './patches/splatoon3/runtime/weapon-models/registry.mjs';";
let loaded;const production=()=>loaded??=fixture({fullRuntime:true,includeCharacter:true,productionComposition:true,realProjectiles:true,extraExports}).then(f=>{f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);return f;});
function shapeHash(d){const h=createHash('sha256');for(const [key,g]of Object.entries({body:d.body,ink:d.ink,bodyStatic:d.bodyStatic,inkStatic:d.inkStatic,...Object.fromEntries(Object.entries(d.parts).map(([k,p])=>[k,p.geo]))})){h.update(key);if(!g)continue;for(const[n,a]of Object.entries(g.attributes)){h.update(n);h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));}if(g.index)h.update(Buffer.from(g.index.array.buffer));}return h.digest('hex');}
function frame(d){return {muzzle:d.muzzle.toArray(),gripR:{pos:d.gripR.pos.toArray(),z:d.gripR.handZ.toArray(),y:d.gripR.handY.toArray()},gripL:{pos:d.gripL.pos.toArray(),z:d.gripL.handZ.toArray(),y:d.gripL.handY.toArray()}};}
test('five-shooter pass preserves the shipped gameplay sockets and all unrequested family models',async()=>{
 const f=await production();
 if(process.env.INKWAVE_BUILT_SITE)return; // Source baseline comparison is separate from emitted contracts.
 const text=fs.readFileSync(BASELINE,'utf8');
 const b=await fixture({fullRuntime:true,includeCharacter:true,productionComposition:true,realProjectiles:true,extraExports,adaptRuntime:(rel,code)=>rel==='patches/splatoon3/runtime/weapon-models/shooters-b.mjs'?text:code});b.installMainWeaponCatalogRuntime(b.installedRuntime,b.profile);
 for(const id of ['s3-shooter-heavy','s3-shooter-expert','s3-shooter-long','s3-shooter-quicklong','s3-shooter-triplequick','s3-shooter-triplemiddle','s3-shooter-flash']){
  const d=f.getWeaponDef(id),old=b.getWeaponDef(id);assert.deepEqual(JSON.parse(JSON.stringify(frame(d))),JSON.parse(JSON.stringify(frame(old))),id+' exact prior gameplay frame');
  if(!TARGETS.includes(id))assert.equal(shapeHash(d),shapeHash(old),id+' untouched geometry');
 }
});
test('measured .96 silhouette proportions and packed purifier stay finite and within budget',async()=>{
 const f=await production(),d=f.getWeaponDef('s3-shooter-heavy');let triangles=0;for(const g of[d.body,d.ink]){triangles+=g.index.count/3;assert.equal(g.groups.length,0);for(const a of Object.values(g.attributes))for(const v of a.array)assert.ok(Number.isFinite(v));}
 assert.ok(triangles<=16000,'triangle budget '+triangles);assert.deepEqual(Array.from(d.muzzle.toArray()),[0,.065,.38625]);
 const tank=d.parts.can.geo; tank.computeBoundingBox();const sz=tank.boundingBox.getSize(new f.THREE.Vector3());
 assert.ok(Math.abs(sz.z/sz.y-268/214)<.12,'measured water tank length/diameter within stated runtime fit');
 console.log('GAL_GEOMETRY '+JSON.stringify({triangles,tankSize:sz.toArray(),frame:frame(d)}));
});
test('real rebuilt Actors emit and retains both-hand attachment at 30, 60 and 120 Hz',async()=>{
 const f=await production(),{G,THREE}=f;G.scene=new THREE.Scene();G.physics=new f.Physics(G.level);G.level.queryBlocks=(_a,_b,_c,_d,o)=>{o.length=0;return o};G.physics.segment=(_a,_b,h)=>{h.hit=false;return h};
 for(const id of TARGETS)for(const hz of[30,60,120]){const a=new f.Actor({team:0,weapon:id,CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),ch=a.character;ch.actor=a;ch.onEvent=null;a.grounded=a.ground.hit=true;G.actors=[a];G.scene.add(ch.root);const before=G.projectiles.list.length;let maxGrip=0;
  for(let n=0;n<4*hz;n++){const fire=n>=hz&&n<3*hz;a.ink=100;a.intent.fire=fire;G.time+=1/hz;a.weaponRunner.update(1/hz,{fire,firePressed:n===hz});a._finishFrame(1/hz);ch.root.updateMatrixWorld(true);assert.ok([...ch.P].every(Number.isFinite));if(n>hz/2&&ch.P[f.CHARACTER_CHANNELS.IKL]>.99&&ch.P[f.CHARACTER_CHANNELS.LTW]<.001)maxGrip=Math.max(maxGrip,ch.weapon.off.localToWorld(ch.weapon.def.handL.pos.clone()).distanceTo(ch.bones.handL.getWorldPosition(new THREE.Vector3())));}
  assert.ok(G.projectiles.list.length>before,'actual emission '+hz);assert.ok(maxGrip<.008,'support hand '+hz+': '+maxGrip);a.weaponRunner.reset();ch.dispose();G.scene.remove(ch.root);console.log('GAL_ACTOR '+JSON.stringify({id,hz,maxGrip}));}
});

test('two .96 label instances follow peak/rest can transforms and far-near ownership without shared-state leaks',async()=>{
 const f=await production(),actors=[0,1].map(team=>new f.Actor({team,weapon:'s3-shooter-heavy',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}}));
 const weapons=actors.map(a=>a.character.weapon),[a,b]=weapons;
 assert.ok(a.parts.canLabel&&b.parts.canLabel,'label part exists in actual Character');
 assert.notEqual(a.parts.canLabel,b.parts.canLabel);assert.equal(a.parts.canLabel.userData.mesh.geometry,b.parts.canLabel.userData.mesh.geometry,'immutable cached geometry shared');
 assert.equal(a.parts.canLabel.userData.mesh.material,b.parts.canLabel.userData.mesh.material,'shared native plastic material');const geo=a.parts.canLabel.userData.mesh.geometry;
 const before=Array.from(geo.attributes.position.array);let disposals=0;geo.addEventListener('dispose',()=>disposals++);
 const transform=o=>[...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray()];
 for(const [near,since]of[[true,99],[true,.01],[true,.05],[false,.03],[true,.03],[true,99]]){
  for(let i=0;i<actors.length;i++){
   const actor=actors[i],w=weapons[i];actor.character.actor=actor;actor.character.onEvent=null;actor.grounded=actor.ground.hit=true;
   actor.character.setLod(near?'game':'far');actor._finishFrame(1/60);
   // Actual source callback is invoked by the production animateWeapon after native can.
   f.animateWeapon(w,{t:f.G.time,dt:1/60,color:f.G.teamColors[i],sinceShoot:i?99:since,near,firing:since<1});
   assert.equal(w.bodyFar.visible,!near);assert.equal(w.parts.canLabel.visible,near);assert.equal(w.body.visible,near);
   if(near)assert.deepEqual(transform(w.parts.canLabel),transform(w.parts.can),'same pivot/scale/rotation at peak and rest');
   assert.equal(w.parts.canLabel.parent,w.off,'no new parent contract');assert.ok(w.partList.includes(w.parts.canLabel));
  }
  if(near&&since===.01)assert.notEqual(a.parts.can.scale.x,b.parts.can.scale.x,'each Actor keeps its own pulse');
 }
 assert.deepEqual(Array.from(geo.attributes.position.array),before,'no source-geometry edits during animation');
 for(const actor of actors)actor.character.dispose();assert.equal(disposals,0,'instance disposal does not destroy shared geometry');
 const third=new f.Actor({team:0,weapon:'s3-shooter-heavy',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});assert.equal(third.character.weapon.parts.canLabel.userData.mesh.geometry,geo);assert.notEqual(third.character.weapon.parts.canLabel,a.parts.canLabel);third.character.dispose();
});
