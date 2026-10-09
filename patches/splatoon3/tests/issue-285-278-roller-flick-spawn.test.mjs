import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { flickSpawnDisplacement } from '../runtime/roller-flick-spawn.mjs';
import { adaptSource } from '../adapter.mjs';
import { fixture } from '../../network-replication/tests/robustness-fixture.mjs';

const source=fileURLToPath(new URL('../../../inkwave-public/src/game/weapons.js',import.meta.url));

test('#285 and #278 source launch records yield a 12-wide fan and tiered 1+2+2 heights',async()=>{
  const f=await fixture(),w=f.WEAPONS.roller;
  assert.equal(w.horizontalSpawn.width,0.8);
  assert.equal(w.horizontalSpawn.randomCube,0.1);
  assert.deepEqual(Array.from(w.verticalSpawn.groups,g=>g.count).join(','),'1,2,2');
  const zero=()=>0.5;
  const h=Array.from({length:12},(_,i)=>flickSpawnDisplacement(w,false,i,12,zero));
  assert.ok(Math.abs(h[0].lateral+0.8)<1e-9);
  assert.ok(Math.abs(h[11].lateral-0.8)<1e-9);
  assert.ok(new Set(h.map(x=>x.lateral.toFixed(5))).size===12);
  const v=Array.from({length:5},(_,i)=>flickSpawnDisplacement(w,true,i,5,zero));
  assert.equal(v[0].height,.5);
  assert.ok(v[1].height<0 && v[2].height<0);
  assert.ok(v[3].height < v[1].height && v[4].height < v[2].height);
  assert.notEqual(v[1].height,v[2].height);
  for(const a of [...h,...v])assert.ok(Object.values(a).every(Number.isFinite));
});

test('#285/#278 offset is installed into actual base fireFlick before projectile _push',()=>{
  const raw=fs.readFileSync(source,'utf8');
  const code=adaptSource('src/game/weapons.js',raw);
  assert.match(code,/adjustFlickSpawnPosition\(p, a, w, i\)/);
  const start=code.indexOf('  fireFlick(a, w) {'),end=code.indexOf('  fireCharger(',start);
  assert.ok(start>=0 && end>start);
  const body=code.slice(start,end);
  assert.ok(body.indexOf('adjustFlickSpawnPosition(p, a, w, i)') <
    body.indexOf('this._push(p)'), 'spawn offset must precede network birth/paint');
});

test('#285/#278 actual composed Projectiles has distinct main-glob origins for both modes',async()=>{
  const f=await fixture(),actor=f.makeActor({nid:7,owner:'me',remote:false,roller:true});
  actor.pos.set(0,0,0);actor.yaw=0;actor.aimPitch=0;
  actor.weaponRunner.s3FlickVertical=false;
  f.G.actors=[actor];f.G.netm=null;
  f.projectiles.fireFlick(actor,actor.weapon);
  const horizontal=f.projectiles.list.slice(0,12);
  assert.equal(horizontal.length,12);
  const xs=horizontal.map(p=>p.start.x);
  assert.ok(Math.max(...xs)-Math.min(...xs)>1,'horizontal main globs launch across a spatial width');
  f.projectiles.clear();
  actor.weaponRunner.s3FlickVertical=true;
  f.projectiles.fireFlick(actor,actor.weapon);
  const vertical=f.projectiles.list.slice(0,5);
  assert.equal(vertical.length,5);
  const ys=vertical.map(p=>p.start.y);
  assert.ok(Math.max(...ys)-Math.min(...ys)>1,'vertical globs preserve three source group heights');
  assert.ok(vertical.every(p=>p.pos && p.start && p.prev));
});
