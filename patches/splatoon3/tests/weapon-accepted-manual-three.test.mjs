import fs from 'node:fs';import crypto from 'node:crypto';
const results={};
import test from 'node:test';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {fixture} from './source-fixture.mjs';
const f=await fixture({fullRuntime:true,productionComposition:true,includeCharacter:true,realProjectiles:true,vmMathRandom:()=>.5,extraExports:"export {setWeaponAppearance,selectedWeaponAppearance} from './patches/splatoon3/runtime/weapon-appearance.mjs';export * as R from './patches/splatoon3/runtime/weapon-models/registry.mjs';export {ALTERNATE_WEAPON_KITS} from './patches/splatoon3/runtime/alternate-weapon-kits-data.mjs';export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
const {G,THREE,R}=f;
const floor={id:0,solid:true,grate:false,faces:[-1,-1,-1,-1,-1,-1],center:new THREE.Vector3(0,-1,0),half:new THREE.Vector3(100,1,100),axes:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)],aabbMin:new THREE.Vector3(-100,-2,-100),aabbMax:new THREE.Vector3(100,0,100)};
G.level={...G.level,blocks:[floor],queryBlocks(_x,_z,_xx,_zz,out){out.length=0;out.push(0);return out;}};G.physics=new f.installedRuntime.Physics(G.level);
const cases=[['Maneuver_Dual_01','s3-maneuver-dual'],['Maneuver_Dual_02','s3-maneuver-dual'],['Shooter_Long_02','s3-shooter-long']];
const Preview=f.Character;
const vec=x=>Array.from(x.toArray());
function assertSame(a,b,label){assert.ok(isDeepStrictEqual(a,b),label);}
function poseState(ps){assert.ok(ps&&typeof ps==='object'&&!Array.isArray(ps),'actual pose state object');const state=Object.fromEntries(Object.entries(ps).filter(([,v])=>typeof v==='number'));assert.ok(Object.keys(state).length>0,'nonempty numeric pose state');assert.ok(Object.values(state).every(Number.isFinite),'finite pose state');return state;}
function snapshot(w,color,near){
 assert.equal(w.near,near,'actual near/far mode');assert.equal(w.body.visible,near);assert.equal(w.ink.visible,near);assert.equal(w.bodyFar.visible,!near);assert.equal(w.inkFar.visible,!near);
 assertSame(vec(w.ink.material.color),color,'owner ink');assertSame(vec(w.inkFar.material.color),color,'far owner ink');
 const materialState=m=>({type:m.type,color:m.color?vec(m.color):null,emissive:m.emissive?vec(m.emissive):null,opacity:m.opacity,transparent:m.transparent,depthWrite:m.depthWrite,vertexColors:m.vertexColors,side:m.side,roughness:m.roughness,metalness:m.metalness,uniforms:m.userData.u?Object.fromEntries(Object.entries(m.userData.u).map(([k,v])=>[k,v.value])):null});
 const parts=Object.entries(w.parts);assert.ok(parts.length);const matrices=[w.pivot,...parts.map(([,p])=>p)].map(p=>{assert.ok(p.matrixWorld);const v=vec(p.matrixWorld);assert.equal(v.length,16);assert.ok(v.every(Number.isFinite));return v;});
 const owners=parts.filter(([,p])=>p.userData.mat==='ink').map(([k,p])=>{assertSame(vec(p.userData.mesh.material.color),color,'part owner '+k);return k;});
 if(w.coil)assertSame(vec(w.coil.emissive),color,'owner coil');
 const muzzle=vec(w.muzzle.getWorldPosition(new THREE.Vector3()));assert.ok(muzzle.every(Number.isFinite));
 return{matrices,muzzle,near,parts:parts.map(([k,p])=>[k,p.visible,materialState(p.userData.mesh.material)]),owners,ink:materialState(w.ink.material),inkFar:materialState(w.inkFar.material),coil:w.coil?materialState(w.coil):null,ps:poseState(w.ps),left:w.left?snapshot(w.left,color,near):null};
}
function trackedDisposal(ch){const owned=new Set(),shared=new Set();for(let w=ch.weapon;w;w=w.left){for(const m of w.lamps)owned.add(m);if(w.coil)owned.add(w.coil);for(const p of [w.body,w.ink,w.bodyFar,w.inkFar,...Object.values(w.parts).map(p=>p.userData.mesh)]){shared.add(p.geometry);if(!owned.has(p.material))shared.add(p.material);}}const counts=new Map([...owned,...shared].map(x=>[x,0])),listeners=[];for(const x of counts.keys()){const cb=()=>counts.set(x,counts.get(x)+1);x.addEventListener('dispose',cb);listeners.push([x,cb]);}return()=>{for(const x of owned)assert.equal(counts.get(x),1,'owned material released once');for(const x of shared)assert.equal(counts.get(x),0,'shared geometry/material kept alive');for(const[x,cb]of listeners)x.removeEventListener('dispose',cb);return{owned:owned.size,shared:shared.size};};}
assert.equal(R.registeredWeaponModels().length,65);assert.equal(R.registeredWeaponVariantModels().length,82);assert.equal(R.registeredWeaponVariants().length,94);
for(const[row,baseId]of cases)test(row+' official local default preserves manual firing, ownership and geometry',()=>{
 const kit=f.ALTERNATE_WEAPON_KITS.find(k=>k.main===row);assert.ok(kit);assert.equal(kit.baseId,baseId);assert.equal(R.weaponVariantSpec(row).baseId,baseId);assert.equal(R.weaponDefaultAppearance(kit.id),row);assert.ok(R.registeredWeaponVariantModels().includes(row));
 for(const team of[0,1]){const traces=[];
  for(const role of['base','manual','default']){const id=role==='base'?baseId:row;f.setWeaponAppearance(kit.id,role==='default'?'':id,null);assert.equal(f.selectedWeaponAppearance(kit.id,null),id);G.projectiles.clear();G.scene=new THREE.Scene();G.camera=new THREE.PerspectiveCamera(60,1,.1,100);G.camera.position.set(0,2,2);G.camera.updateMatrixWorld();G.actors=[];G.time=0;
   const a=new f.Actor({team,weapon:kit.id,isLocal:true,CharacterClass:Preview,style:{hair:0,skin:2,outfit:0,eyes:0}}),ch=a.character;let born=0;const push=G.projectiles._push;G.projectiles._push=function(...args){born++;return push.apply(this,args);};let cleanup;
   try{ch.actor=a;ch.onEvent=null;G.actors=[a];G.scene.add(ch.root);a.form='kid';a.kidT=10;a.grounded=a.ground.hit=true;a.pos.set(0,0,0);a.vel.set(0,0,0);assert.equal(ch.weaponModel,row);assert.equal(ch.weaponAppearanceModel,id);assert.equal(ch.weapon.def.modelId,baseId);if(id===row)assert.equal(ch.weapon.def.modelVariantId,row);else assert.equal(ch.weapon.def.modelVariantId,undefined);assert.equal(!!ch.weapon.left,row.startsWith('Maneuver_'));cleanup=trackedDisposal(ch);
    const fullShape=shapes(ch.weapon);const fallback={grip:[1,2,3]};assert.deepEqual(R.weaponHold(row,fallback),R.weaponHold(baseId,fallback));const color=vec(G.teamColors[team]),initial=[ch.weapon,ch.weapon.left].filter(Boolean).map(w=>vec(w.parts.trigger.quaternion));const moved=initial.map(()=>false),trace=[];let nearTicks=0,farTicks=0;
    for(let i=0;i<240;i++){const near=true;if(i===0)ch.setLod('game');G.camera.position.set(0,2,near?2:40);G.camera.updateMatrixWorld();a.intent.fire=i>=15&&i<220;G.time+=1/60;a.update(1/60);ch.root.updateMatrixWorld(true);if(i===0){const actualPs=poseState(ch.weapon.ps);assert.throws(()=>poseState({}),/nonempty/);assert.throws(()=>poseState([]),/object/);assert.throws(()=>poseState({...actualPs,[Object.keys(actualPs)[0]]:NaN}),/finite/);}assert.equal(ch.inWorld,true);near?nearTicks++:farTicks++;
     const ws=[ch.weapon,ch.weapon.left].filter(Boolean);for(let n=0;n<ws.length;n++)moved[n] ||= !isDeepStrictEqual(initial[n],vec(ws[n].parts.trigger.quaternion));const pose=Array.from(ch.P);assert.ok(pose.length&&pose.every(Number.isFinite));trace.push({pose,weapon:snapshot(ch.weapon,color,near),ink:a.ink,born,sinceShoot:a.weaponRunner.sinceShoot,sinceHand:Array.from(a.weaponRunner.sinceHand||[]),hand:a.weaponRunner.hand});
    }
    assert.ok(born>0,'actual admitted projectile births');assert.ok(moved.every(Boolean),'all held triggers really move');assert.ok(trace.some(x=>x.pose.some(v=>v!==0)));assert.equal(nearTicks,240);assert.equal(farTicks,0);a.weaponRunner.reset();a._finishFrame(0);ch.root.updateMatrixWorld(true);trace.push({reset:snapshot(ch.weapon,color,true)});traces.push(trace);record(row+':'+team+':'+role,{fullShape,trace});console.log(JSON.stringify({row,kit:kit.id,id,team,ticks:240,born,moved,nearTicks,farTicks}));
   }finally{G.projectiles._push=push;G.scene.remove(ch.root);ch.dispose();G.projectiles.clear();G.actors=[];assert.equal(ch.root.parent,null);assert.equal(G.projectiles.list.length,0);if(cleanup)console.log(JSON.stringify({row,id,team,cleanup:cleanup()}));f.setWeaponAppearance(kit.id,'',null);assert.equal(f.selectedWeaponAppearance(kit.id,null),row);}
  }assertSame(traces[0],traces[1],'base/manual entire native trace');assertSame(traces[1],traces[2],'manual/default entire native trace');assert.equal(results[row+':'+team+':manual'],results[row+':'+team+':default']);
 }
});

function hash(b){return crypto.createHash('sha256').update(b).digest('hex');}
function geom(g){return g?{attrs:Object.fromEntries(Object.entries(g.attributes).map(([n,a])=>[n,{itemSize:a.itemSize,normalized:a.normalized,type:a.array.constructor.name,count:a.count,sha:hash(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength))}])),index:g.index?{type:g.index.array.constructor.name,sha:hash(Buffer.from(g.index.array.buffer,g.index.array.byteOffset,g.index.array.byteLength))}:null,groups:g.groups}:null;}
function shapes(w){return {body:geom(w.def.body),ink:geom(w.def.ink),parts:Object.fromEntries(Object.entries(w.def.parts).map(([n,p])=>[n,{geo:geom(p.src),mat:p.mat,pivot:p.pivot?.toArray(),hidden:p.hidden}])),left:w.left?shapes(w.left):null};}
function record(k,v){results[k]=hash(JSON.stringify(v));if(process.env.MANUAL_EXPECTED_SIGNATURES)assert.equal(results[k],JSON.parse(fs.readFileSync(process.env.MANUAL_EXPECTED_SIGNATURES))[k],k);if(process.env.MANUAL_SIGNATURES)fs.writeFileSync(process.env.MANUAL_SIGNATURES,JSON.stringify(results,null,2));}
