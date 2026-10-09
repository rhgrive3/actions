import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  tripleSlamFistCenters, tripleSlamFistDamage, tickTripleSlamFists,
  installTripleSlamFists, FIST_TRAVEL,
} from '../runtime/triple-slam-fists.mjs';

function world({ wall = false } = {}) {
  const blasts=[],hits=[],paint=[],events=[];
  class Vec {
    constructor(x=0,y=0,z=0){this.set(x,y,z);}
    set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
  }
  class Actor {
    constructor(){
      this.alive=true;this.remote=false;this.team=0;this.weapon={special:'slam'};
      this.pos=new Vec();this.yaw=0;this.superJumpState=null;this.specialActive=null;
      this.color='orange';this.turf=0;this.mainImpacts=0;this.ticks=0;
    }
    _startSpecial(){this.specialActive={id:'slam',phase:'rise'};}
    _slamImpact(){this.mainImpacts++;}
    update(dt){this.ticks++;return dt;}
    reset(){this.specialActive=null;}
    addTurfNoSpecial(amount){this.turf+=amount;}
  }
  const victim={alive:true,team:1,pos:new Vec(0,0,5.6)};
  const G={
    level:{groundHeight(){return 0;}},
    paint:{splat(pos,radius,team){paint.push([pos.x,pos.z,radius,team]);return 2;}},
    physics:{los(from,to){return !wall || !(from.z < 3 && to.x<0);}},
    actors:[victim],
    projectiles:{applyHit(attacker,target,damage,weapon){hits.push([attacker,target,damage,weapon]);}},
    fx:{explosion(pos,color,scale){blasts.push([pos.x,pos.z,scale]);}},
  };
  const THREE={Vector3:Vec};
  installTripleSlamFists({Actor,G,THREE,emit:(type,payload)=>events.push({type,payload})},{weaponsFidelityCompletion:{worldUnitsPerSourceUnit:1}});
  return { Actor,G,THREE,victim,blasts,hits,paint,events };
}

test('#912 pinned 11.3.0 symmetric fist centers and near/far damage endpoints',()=>{
  const c=tripleSlamFistCenters({x:0,y:0,z:0},0,1);
  assert.equal(c.length,2);
  assert.ok(Math.abs(c[0].x+3.27)<1e-8);
  assert.ok(Math.abs(c[1].x-3.27)<1e-8);
  assert.ok(Math.abs(c[0].z-c[1].z)<1e-8);
  assert.ok(Math.abs(Math.hypot(c[0].x,c[0].z)-6.54)<1e-8);
  assert.equal(tripleSlamFistDamage(0),220);
  assert.equal(tripleSlamFistDamage(6.4),220);
  assert.equal(tripleSlamFistDamage(9.6),60);
  assert.equal(tripleSlamFistDamage(9.600001),0);
});

test('#912 native actor impact is separate from the two fists, delayed by exactly 15F',()=>{
  const w=world(),a=new w.Actor();
  a._startSpecial();assert.equal(a.mainImpacts,0);assert.equal(w.hits.length,0);
  for(let i=0;i<70;i++)a.update(1/60);
  assert.equal(w.hits.length,0,'fists must not damage before impact');
  a._slamImpact();assert.equal(a.mainImpacts,1);
  for(let i=0;i<14;i++)a.update(1/60);
  assert.equal(w.hits.length,0);
  a.update(1/60);
  assert.equal(w.hits.length,2,'both fist contact zones independently damage');
  assert.ok(w.hits.every(h=>h[2]===220&&h[3]==='slam'));
  assert.equal(w.paint.length,2);
  assert.equal(a.turf,4,'fist paint accrues personal turf but never refills special');
  assert.equal(w.blasts.length,2);
  assert.equal(w.events.length,2,'existing special:slam owner event is reused for remote fist presentation');
  assert.ok(w.events.every(e=>e.type==='special:slam'&&e.payload.actor===a&&e.payload.fist===true));
  assert.equal(a._s3TripleSlamFists,null);
  a.update(1/60);assert.equal(w.hits.length,2,'no second impact on later ticks');
  assert.equal(FIST_TRAVEL,15/60);
});

test('#912 wall cover suppresses blocked fist while other fist remains active',()=>{
  const w=world({wall:true}),a=new w.Actor();
  a._startSpecial();a._slamImpact();
  for(let i=0;i<15;i++)a.update(1/60);
  assert.equal(w.hits.length,1);
  assert.equal(w.paint.length,1);
});

test('#912 Super Jump Slam and remotely presented actors never instantiate new fists',()=>{
  const w=world(),a=new w.Actor();a.superJumpState={phase:'flight'};
  a._startSpecial();a._slamImpact();
  for(let i=0;i<100;i++)a.update(1/60);
  assert.equal(w.hits.length,0);
  const proxy=new w.Actor();proxy.remote=true;proxy._startSpecial();proxy._slamImpact();
  for(let i=0;i<100;i++)proxy.update(1/60);
  assert.equal(w.hits.length,0);
});

test('#912 fist action remains independent if the owner is splatted before landing',()=>{
  const w=world(),a=new w.Actor();a._startSpecial();a.alive=false;
  for(let i=0;i<84;i++)a.update(1/60);
  assert.equal(w.hits.length,0);
  a.update(1/60);assert.equal(w.hits.length,2);
});

test('#912 S3 production bootstrap installs fist owner after ordinary special phases',()=>{
  const file=fileURLToPath(new URL('../runtime/install.mjs',import.meta.url));
  const code=fs.readFileSync(file,'utf8');
  assert.match(code,/installTripleSlamFists\(api, profile\)/);
});
