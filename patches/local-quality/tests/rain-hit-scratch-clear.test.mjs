import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { FixedClock } from '../../splatoon3/runtime/clock.mjs';
import { STORM_RAIN_REACH, stormRainScale, stormRainContains, stormRainObjectContains,
  collectStormHit, applyStormHits } from '../../splatoon3/runtime/storm-effects.mjs';

// Real production-composed methods and Storm helpers; synthetic scene/actors.
// This is reference-retirement coverage, not a heap-size/FPS or retail RainNum claim.
const source = adaptBuildSource('src/game/weapons.js', fs.readFileSync(new URL('../../../inkwave-public/src/game/weapons.js', import.meta.url), 'utf8'));
const start = source.indexOf('export class Projectiles');
function span(from, to) {
  const a = source.indexOf(from, start), b = source.indexOf(to, a);
  assert.ok(a >= start && b > a, `actual Projectiles ${from}`);
  return source.slice(a, b);
}
const update = span('  _updateClouds(dt) {', '  _updateBeams(dt) {');
const clear = span('  clear() {', '  // Bomb/cloud meshes own');
const release = span('  _releaseCloud(c, fade = 0) {', '  _new() {');
// Frozen df8a4b8f Projectiles.clear preimage, including prior resource owners.
const beforeClear = String.raw`  clear() {
    clearGhostIndex(this);
    this.shooterMuzzleDroplets.clear();
    this.projectileVisuals.clear();
    this.inkFlight.clear();
    for (const p of this.list) this._recycle(p);
    this.list.length = 0;
    for (const b of this.bombs) this._releaseBomb(b);
    this.bombs.length = 0;
    for (const c of this.clouds) this._releaseCloud(c);
    this.clouds.length = 0;
    for (const b of this.beams) { b.mesh.visible = false; this.beamPool.push(b.mesh); }
    this.beams.length = 0;
    for (const p of this.chargerDrops) { p.owner = null; this.chargerDropPool.push(p); }
    this.chargerDrops.length = 0;
    for (const [, s] of this.sights) { this.scene.remove(s); s.material.dispose(); }
    this.sights.clear();
    for (const v of this.vols) v.hits.length = 0;   // per-throw dedupe lists must not keep victims/bosses alive
    this.blobs.count = 0;
  }

`;
const STEP = 1 / 60;
function rig({ before = false } = {}) {
  const log = [], refs = [], math = Object.create(Math);
  let randomState = 0x12345678, randomCalls = 0;
  math.random = () => { randomCalls++; randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296; };
  const G = { time:0, actors:[], teamColors:[0,1], physics:{
    los(a,b) { log.push(['los',...a.toArray(),...b.toArray()]); return true; },
    raycast(a,_d,length,hit) { log.push(['ray',...a.toArray(),length]); hit.hit=true; hit.point.set(a.x,0,a.z); hit.normal.set(0,1,0); return hit; },
  }, paint:{splat(point,radius,team,options) { log.push(['paint',...point.toArray(),radius,team,options.seed]); return radius; }} };
  const context = vm.createContext({ Math:math, G, THREE, SPECIALS:{storm:{radius:5,dps:30,driftSpeed:0}},
    SIM_DT:STEP, STORM_RAIN_REACH, stormRainScale, stormRainContains, stormRainObjectContains, collectStormHit, applyStormHits,
    clamp:(v,a,b)=>Math.min(b,Math.max(a,v)), _v:new THREE.Vector3(), _v2:new THREE.Vector3(), DOWN:new THREE.Vector3(0,-1,0), _hit:{point:new THREE.Vector3(),normal:new THREE.Vector3()},
    emit:(name,event)=>log.push(['event',name,event.actor?.nid ?? event.attacker?.nid ?? null]),
    // Other clear owners are deliberately inert except for recording call order.
    clearGhostIndex(){log.push(['clear','ghost']);},
  });
  const methods = new vm.Script(`(class Receipt {${update}\n${before ? beforeClear : clear}\n${release}}).prototype`).runInContext(context);
  const owner = nid => ({nid,team:0,remote:false,turf:0,addTurf(area){this.turf+=area;log.push(['turf',nid,area]);}});
  const victim = nid => ({nid,team:1,remote:false,alive:true,pos:new THREE.Vector3(),hp:100,
    damage(amount,attacker,kind){this.hp-=amount;log.push(['damage',nid,amount,attacker.nid,kind]);return false;}});
  const p = Object.assign(Object.create(methods), {clouds:[],list:[],pool:[],bombs:[],beams:[],beamPool:[],chargerDrops:[],chargerDropPool:[],
    sights:new Map(),vols:[],blobs:{count:0},scene:new THREE.Scene(),
    inkFlight:{clear(){log.push(['clear','ink']);}}, shooterMuzzleDroplets:{clear(){log.push(['clear','muzzle']);}},
    projectileVisuals:{clear(){log.push(['clear','visuals']);}},
    s3DamageSubObjects(){},s3DamageSpecialObjects(){},
  });
  function cloud(a, {t=.1,dur=.5,rainT=0,ghost=false,peer=null}={}) {
    const group=new THREE.Group();group.position.set(0,5,0);
    const c={owner:a,team:a.team,t,dur,rainT,group,dir:new THREE.Vector3(),ghost,
      _netPeer:peer,_netBorn:0,_netBornTick:0,_netSteps:0};
    p.clouds.push(c);refs.push(c);return c;
  }
  function snapshot() {return structuredClone({log,randomCalls,randomState,
    actors:G.actors.map(a=>[a.nid,a.hp]),clouds:refs.map(c=>[c.t,c.rainT,c._netSteps,c._released??false,c.s3RainAudit??null,c.owner.turf]),
    rainHits:Array.from(p._rainHits ?? [],([a,h])=>[a.nid,h.owner.nid,h.amount])});}
  return {p,G,log,owner,victim,cloud,snapshot,randomCalls:()=>randomCalls};
}

test('composed clear adds exactly the scratch retirement to the frozen df8 preimage', () => {
  assert.equal(clear, beforeClear.replace('    this.inkFlight.clear();','    this._rainHits?.clear();\n    this.inkFlight.clear();'));
  assert.equal(source.split('    this._rainHits?.clear();').length-1,1,'several adapter passes must not duplicate cleanup');
});

test('expired rain/empty ticks keep the old active behavior; clear drops both strong references', () => {
  const r=rig(),a=r.owner(1),v=r.victim(2);r.G.actors=[v];r.cloud(a,{t:8-STEP,dur:8,rainT:1});
  r.p._updateClouds(STEP);
  assert.equal(r.p.clouds.length,0);assert.equal(r.p._rainHits.get(v).owner,a);
  const cache=r.p._rainHits,active=r.snapshot();r.p._updateClouds(STEP);
  assert.deepEqual(r.snapshot(),active,'empty tick remains the existing no-op');
  assert.equal(r.p.clear(),undefined);
  assert.equal(cache.size,0);assert.equal(cache.has(v),false);assert.equal(Array.from(cache.values()).some(x=>x.owner===a),false);
  assert.equal(r.p._rainHits,cache,'release references without allocating a replacement Map');
});

test('clear is allocation-free before the first rain and repeatable after a used Map', () => {
  const r=rig();r.p.clear();r.p.clear();r.p._updateClouds(STEP);
  assert.equal(Object.hasOwn(r.p,'_rainHits'),false);
  const a=r.owner(1),v=r.victim(2);r.G.actors=[v];r.cloud(a);r.p._updateClouds(STEP);
  const cache=r.p._rainHits;r.p.clear();r.p.clear();assert.equal(cache.size,0);assert.equal(r.p._rainHits,cache);
});

test('the next match reuses the same Map without carrying the previous victim or owner', () => {
  const r=rig(),oldOwner=r.owner(1),oldVictim=r.victim(2);r.G.actors=[oldVictim];r.cloud(oldOwner);r.p._updateClouds(STEP);
  const cache=r.p._rainHits;r.p.clear();assert.equal(cache.size,0);
  const newOwner=r.owner(3),newVictim=r.victim(4);r.G.actors=[newVictim];r.cloud(newOwner);r.p._updateClouds(STEP);
  assert.equal(r.p._rainHits,cache);assert.equal(cache.size,1);assert.equal(cache.get(newVictim).owner,newOwner);
  assert.equal(cache.has(oldVictim),false);assert.equal(Array.from(cache.values()).some(x=>x.owner===oldOwner),false);
});

test('active damage/owner order, RNG and paint remain exact at 30/60/120Hz, including remote catch-up', () => {
  let reference;
  for(const hz of [30,60,120])for(const remote of [false,true]) {
    const before=rig({before:true}),after=rig(),rows=[];
    for(const r of [before,after]) {
      r.G.actors=[r.victim(9),r.victim(10)];
      // Reverse owners: the existing arbitration must keep nid 1 attribution.
      r.cloud(r.owner(5));r.cloud(r.owner(1));
      const peer=remote?{sim:-1,tr:0,lastTs:0}:null;if(peer)r.cloud({...r.owner(7),remote:true},{ghost:true,peer});
      const clock=new FixedClock();
      for(let frame=0;frame<hz/2;frame++)clock.advance(1/hz,dt=>{r.G.time+=dt;if(peer)peer.sim++;r.p._updateClouds(dt);});
      rows.push(r.snapshot());
    }
    assert.deepEqual(rows[1],rows[0],`${hz}Hz / remote=${remote}`);
    assert.ok(rows[1].log.filter(x=>x[0]==='damage').every(x=>x[3]===1));
    if(!remote){if(reference)assert.deepEqual(rows[1],reference);else reference=rows[1];}
  }
});

test('clear releases collected references after an interrupted rain tick and before a later owner throws', () => {
  const r=rig(),a=r.owner(1),v=r.victim(2),failure=Error('controlled device owner failure');
  r.G.actors=[v];r.cloud(a,{rainT:1});r.p.s3DamageSubObjects=()=>{throw failure;};
  assert.throws(()=>r.p._updateClouds(STEP),error=>error===failure);
  const cache=r.p._rainHits;assert.equal(cache.get(v).owner,a);assert.equal(v.hp,100,'the throw precedes applying collected damage');
  r.p.inkFlight.clear=()=>{throw failure;};assert.throws(()=>r.p.clear(),error=>error===failure);
  assert.equal(cache.size,0,'scratch cleanup has run before this later clear owner');
  r.p.inkFlight.clear=()=>{};r.p.clear();assert.equal(r.p.clouds.length,0);assert.equal(cache.size,0);
});
