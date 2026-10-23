import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {MAIN_WEAPON_CATALOG} from '../runtime/main-weapon-catalog-data.mjs';
import {saberSlashShape,saberSlashContact,saberSlashContactBasis,saberSlashWallContact,saberSlashWallContactBasis,placeSaberSlash} from '../runtime/saber-melee.mjs';
import {installSlosherIntermediatePaint} from '../runtime/slosher-intermediate-paint.mjs';

test('activation-owned Saber basis preserves actor/wall contact points across weapon, swing and target orientation',()=>{
  for(const record of MAIN_WEAPON_CATALOG.records.filter(r=>r.family==='splatana'))
    for(const key of ['saber-horizontal','saber-vertical'])for(let ordinal=0;ordinal<2;ordinal++){
      const shape=saberSlashShape(record,key,ordinal),basis={},origin=new THREE.Vector3();
      for(let i=0;i<80;i++){
        const yaw=i*.713,actor={pos:new THREE.Vector3(1,2,3),aimDir:new THREE.Vector3(Math.sin(yaw),.3,Math.cos(yaw))};
        const placedYaw=placeSaberSlash(actor,shape,origin,basis),feet=new THREE.Vector3((i%13)-5,(i%7)-1,(i%17)-6),a=new THREE.Vector3(),b=new THREE.Vector3();
        const old=saberSlashContact(shape,origin,placedYaw,feet,.35,1.7,a),now=saberSlashContactBasis(shape,origin,basis.cy,basis.sy,feet,.35,1.7,b);
        assert.equal(now,old);if(now)assert.deepEqual(b,a);
        const oldWall=saberSlashWallContact(shape,origin,placedYaw,feet,yaw+.2,5,3,a),newWall=saberSlashWallContactBasis(shape,origin,basis.cy,basis.sy,feet,yaw+.2,5,3,b);
        assert.equal(newWall,oldWall);if(newWall)assert.deepEqual(b,a);
      }
    }
});

test('held-sub visibility snapshots restore old pivots before native update and release detached references',()=>{
  const source=fs.readFileSync(new URL('../runtime/bomb-motion.mjs',import.meta.url),'utf8');
  const prefix=source.slice(source.indexOf('const stowedWeapons='),source.indexOf('const RELEASE_AGE'));
  const update=source.slice(source.indexOf('  const updateCharacter=C.update;'),source.indexOf('  const throwing = C._poseThrow'));
  let check=()=>{};const C={update(){check(this);return 7;}};
  const install=new Function('C','state','enabled',prefix+update+'return {restoreMainWeapon,saved:ch=>stowedWeapons.get(ch)};');
  const helpers=install(C,()=>({throwing:false}),()=>true),a={visible:true},left={visible:false},ch={weapon:{pivot:a,left:{pivot:left}},kidForm:true,bombHeld:true};
  assert.equal(C.update.call(ch),7);assert.equal(a.visible,false);assert.equal(left.visible,false);
  const next={visible:true};check=()=>{assert.equal(a.visible,true);assert.equal(left.visible,false);ch.weapon={pivot:next};};
  C.update.call(ch);assert.equal(next.visible,false);assert.equal(a.visible,true);
  helpers.restoreMainWeapon(ch);assert.equal(next.visible,true);assert.equal(helpers.saved(ch).pivot0,null);assert.equal(helpers.saved(ch).pivot1,null);
  check=()=>{};ch.weapon={pivot:a,left:{pivot:a}};C.update.call(ch);helpers.restoreMainWeapon(ch);assert.equal(a.visible,true,'shared pivots restore the same original value');
});

test('spent Slosher intermediate ticks retain native stepping and handled state while skipping before-vector copies',()=>{
  const profile=JSON.parse(fs.readFileSync(new URL('../profile.json',import.meta.url),'utf8')),vectors=[];
  class Vector3 extends THREE.Vector3{constructor(...args){super(...args);this.copies=0;vectors.push(this);}copy(...args){this.copies++;return super.copy(...args);}}
  let calls=0;
  class Projectiles{_step(p){calls++;p.pos.x+=.1;return false;}}
  const G={},system=new Projectiles();G.projectiles=system;
  installSlosherIntermediatePaint({Projectiles,G,THREE:{Vector3}},profile);
  const p={type:'slosh',owner:{remote:false},ghost:false,fidelitySloshUnit:profile.weaponsFidelityCompletion.weapons.slosher.UnitGroupParam.Unit[2],fidelitySloshIndex:3,
    seed:.5,s3SloshIntermediateSeed:.5,s3SloshIntermediateCount:1,pos:new THREE.Vector3(),vel:new THREE.Vector3(1,0,0),trailEvery:1};
  for(let i=0;i<20;i++){system._step(p,1/60);assert.equal(p.s3SloshIntermediateSegmentHandled,true);}
  assert.equal(calls,20);assert.equal(vectors[2].copies,0);assert.equal(p.trailEvery,0);
  p.seed=.25;system._step(p,1/60);assert.equal(vectors[2].copies,1,'new seed resumes regular segment bookkeeping');assert.equal(p.s3SloshIntermediateCount,0);
});
