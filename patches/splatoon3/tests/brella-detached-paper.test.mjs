import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,includeCharacter:true,vmMathRandom:()=>.5,extraExports:`export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';export {installWeaponsFidelity} from './patches/splatoon3/runtime/weapons-fidelity.mjs';export {showDetachedCanopy,retireDetachedCanopy} from './patches/splatoon3/runtime/brella-canopy-visual.mjs';`});
f.installWeaponsFidelity(f.installedRuntime,f.profile);f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);const {G,THREE}=f;
for(const id of ['s3-shelter-normal','s3-shelter-wide','s3-shelter-focus'])for(const team of [0,1])test(id+' team '+team+' native launch/ownership/retirement',()=>{
 G.scene=new THREE.Scene();G.time=0;G.actors=[];G.projectiles=new f.Projectiles({add(){},remove(){}});G.physics.segment=(_a,_b,h)=>{h.hit=false;return h};
 const a=new f.Actor({team,weapon:id,isLocal:true,CharacterClass:f.Character});G.actors=[a];a.character.actor=a;a.character.onEvent=null;G.scene.add(a.character.root);a.grounded=a.ground.hit=true;
 let born=0;const push=G.projectiles._push;G.projectiles._push=function(...args){born++;return push.apply(this,args);};
 let launched=null,frame=-1;try{
 for(let i=0;i<900;i++){const before=a.weaponRunner.catalogState?.canopy;a.ink=100;a.intent.fire=true;G.time+=1/60;a.weaponRunner.update(1/60,{fire:true,firePressed:i===0});a._finishFrame(1/60);if(before?.launched&&a.weaponRunner.catalogState.canopy===null){launched=before;frame=i;break;}}
 assert(launched,'real native launch');assert(born>0,'actual projectile births');assert.equal(launched.owner,a);const d=launched.visualSource;assert.equal(launched.mesh.parent,G.scene);assert.equal(a.weaponRunner.catalogState.canopy,null);
 console.log('NATIVE_POLICY '+JSON.stringify({id,team,frame,born,pos:launched.pos.toArray(),dir:launched.dir.toArray(),remaining:launched.remaining,radius:launched.radius,naked:a.weaponRunner.catalogState.naked}));
 const paper=launched.mesh.children.find(x=>x.name==='canopyInk');assert(paper,'detached paper exists');assert.equal(paper.material.color.getHex(),a.color.getHex());let geometryDisposals=0;paper.geometry.addEventListener('dispose',()=>geometryDisposals++);let materialDisposals=0;paper.material.addEventListener('dispose',()=>materialDisposals++);
 if(id==='s3-shelter-focus'){assert.equal(paper.geometry,d.ink);assert.equal(d.detachedCanopyInk.geo,d.ink);assert.equal(d.parts.canopyInk,undefined);assert(paper.geometry.attributes.position.count>0);assert.deepEqual(paper.position.toArray(),d.parts.canopy.pivot.clone().multiply(paper.scale).negate().toArray());assert.equal(a.character.weapon.ink.geometry,d.ink);}
 else {assert.equal(d.detachedCanopyInk,undefined);assert.equal(paper.geometry,d.parts.canopyInk.geo);}
 const mesh=launched.mesh;if(team===1){for(let i=0;i<1200&&launched.mesh;i++){G.time+=1/60;G.projectiles.update(1/60);}assert.equal(launched.mesh,null,'native expiry retires flight');}else f.retireDetachedCanopy(launched);f.retireDetachedCanopy(launched);assert.equal(mesh.parent,null);assert.equal(launched.mesh,null);assert.equal(materialDisposals,1);assert.equal(geometryDisposals,0);
 console.log(JSON.stringify({id,team,frame,paperVertices:paper.geometry.attributes.position.count,materialDisposals,geometryDisposals}));
 }finally{G.projectiles._push=push;G.projectiles.clear();a.weaponRunner.reset();a.character.root.removeFromParent();a.character.dispose();G.actors=[];}
});
