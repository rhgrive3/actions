import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SITE = process.env.INKWAVE_SLOSH_RELEASE_SITE;
const SRC = path.resolve(SITE || path.join(ROOT, 'inkwave-public'));
let cached;
// One VM runs the complete production installer exactly once. Duplicate
// installers below may verify guards, but cannot repair a missing installation.
async function production() {
  if (cached) return cached;
  const context = vm.createContext({ console, performance, URL }), modules = new Map();
  const load = requested => {
    let file = requested.startsWith(path.join(SRC, 'patches') + path.sep)
      ? path.join(SITE ? SRC : ROOT, path.relative(SRC, requested)) : requested;
    if (SITE && file.startsWith(path.join(ROOT, 'patches') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const source = fs.readFileSync(file, 'utf8');
    const m = new vm.SourceTextModule(!SITE && file.startsWith(SRC + path.sep) ? adaptSource(path.relative(SRC, file), source) : source,
      { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, m); return m;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export { NetMatch } from './src/net/netmatch.js';
    export { slosherMotionSnapshot } from './patches/splatoon3/runtime/weapon-motion.mjs';
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
    export * from './patches/splatoon3/runtime/weapon-detail-motion.mjs';
  `, { context, identifier: path.join(ROOT, 'weapon-detail-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three' ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/') ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
    : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = entry.namespace.install(profile);
  const { G, THREE } = api;
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.scene = new THREE.Scene(); G.level = { blocks: [], groundHeight: () => 0, queryBlocks: (_a, _b, _c, _d, out) => { out.length = 0; return out; } };
  G.paint = { sample: () => 1, splat: () => 0 }; G.match = { playing: () => true };
  G.physics = new api.Physics(G.level);
  G.actors = []; G.time = 0;
  cached = { ...api, ...entry.namespace, profile }; return cached;
}
function rig(api, kind, enabled = true) {
  const { Actor, Character, G, THREE } = api;
  const a = new Actor({ team: 0, name: 'weapon detail regression', weapon: kind, CharacterClass: Character,
    style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = a.character; ch.onEvent = null; ch.actor = a; ch.s3WeaponDetailMotionEnabled = enabled;
  G.actors = [a]; G.scene.add(ch.root); a.grounded = true; a.ground.hit = true;
  let ticks = 0, kicks = 0;
  const events = [];
  G.projectiles = new api.Projectiles(G.scene);
  api.on('weapon:fire', e => { if(e.actor === a) events.push({tick:ticks, count:G.projectiles.list.length, muzzle:e.muzzle.toArray()}); });
  const nativeKick = ch._hairKick;
  ch._hairKick = function (...args) { if (args[0] === 0 && args[1] === 2.4 && args[2] === 1.6) kicks++; return nativeKick.apply(this, args); };
  function step(dt = 1 / 60, input = {}) {
    ticks++; a.ink = 100; a.intent.fire = !!input.fire; a.intent.sub = !!input.sub;
    G.time += dt; a.weaponRunner.update(dt, input); a._finishFrame(dt); ch.root.updateMatrixWorld(true);
    assert.ok(Array.from(ch.P).every(Number.isFinite), 'actual full Character pose is finite');
    assert.ok(ch.ikErr.every(Number.isFinite), 'native two-bone solver errors are finite');
    assert.ok(ch.getMuzzle(new THREE.Vector3()).toArray().every(Number.isFinite));
  }
  for (let i = 0; i < 90; i++) step();
  ticks = -1;
  const snapshot = () => ({ ...api.weaponDetailMotionSnapshot(ch) });
  function grip(side) {
    const hand = side === 'L' ? ch.weapon.def.handL : ch.weapon.def.handR;
    const bone = side === 'L' ? ch.bones.handL : ch.bones.handR;
    return ch.weapon.off.localToWorld(hand.pos.clone()).distanceTo(bone.getWorldPosition(new THREE.Vector3()));
  }
  return { a, ch, step, events, snapshot, grip, get kicks() { return kicks; }, get ticks() { return ticks; },
    close() { G.scene.remove(ch.root); ch.dispose(); } };
}

test('actual Slosher release reaches existing raised key at 12F and repeats at 29F', async t => {
 const api=await production(), r=rig(api,'slosher'), rows=[];
 try {
  for(let i=0;i<75;i++) {
   const n=r.events.length; r.step(1/60,{fire:true});
   if(r.events.length>n) {
    const m=api.slosherMotionSnapshot(r.ch), d=r.snapshot();
    assert.ok(m.released); assert.ok(Math.abs(m.visualAge-.25)<1e-8);
    assert.ok(Math.abs(d.sloshReleaseAge)<1e-8);
    assert.ok(Math.abs(r.ch.P[api.CHARACTER_CHANNELS.ANCR]-1.5)<1e-8, 'existing native raised key, no invented joint angle');
    rows.push({...r.events.at(-1),visualAge:m.visualAge, pitch:r.ch.P[api.CHARACTER_CHANNELS.ANCR]});
   }
  }
  assert.deepEqual(rows.map(x=>x.tick),[12,41,70]);
  assert.deepEqual(rows.map(x=>x.count),[9,18,27]);
  assert.equal(r.kicks,3);
  t.diagnostic(JSON.stringify({actualRelease:rows}));
 } finally {r.close();}
});

test('accepted native remote fire advances beyond stale windup and duplicate cannot restart it',async t=>{
 const api=await production(),r=rig(api,'slosher');
 try{
  r.a.remote=true; r.a.nid=11; r.a._nearCamera=()=>false;
  r.ch.trigger('slosh'); r.a.weaponRunner.slosh=0;
  r.a._finishFrame(1/60);
  const nm={byNid:new Map([[11,r.a]])};
  const receive=()=>api.NetMatch.prototype._playEvent.call(nm,'weapon:fire',{actor:{n:11},weapon:'slosher',muzzle:[0,1,0],dir:[0,0,1]});
  receive(); r.a._finishFrame(1/60);
  const first=api.slosherMotionSnapshot(r.ch);
  assert.ok(first.released); assert.ok(Math.abs(first.visualAge-.25)<1e-8);
  assert.equal(r.snapshot().sloshReleaseAge,0);
  for(let i=0;i<4;i++)r.a._finishFrame(1/60);
  const before=api.slosherMotionSnapshot(r.ch).elapsed;
  receive();r.a._finishFrame(1/60);
  assert.ok(api.slosherMotionSnapshot(r.ch).elapsed>before);
  assert.ok(r.snapshot().sloshReleaseAge>0);
  t.diagnostic(JSON.stringify({remoteRelease:first,afterDuplicate:api.slosherMotionSnapshot(r.ch)}));
 }finally{r.close();}
});

test('reset, death, form and admitted sub prevent stale release from reviving presentation',async()=>{
 const api=await production();
 for(const cancel of ['reset','dead','swim','sub','special','weapon']){
  const r=rig(api,'slosher');
  try{
   r.ch.trigger('slosh');r.a.weaponRunner.slosh=0;
   if(cancel==='reset')r.a.weaponRunner.reset();
   if(cancel==='dead')r.a.alive=false;
   if(cancel==='swim'){r.a.form='squid';r.ch.kidForm=false;}
   if(cancel==='sub')r.a.weaponRunner.aimingSub=true;
   if(cancel==='special')r.a.specialActive=true;
   if(cancel==='weapon')r.ch.setWeapon('shooter');
   api.emit('weapon:fire',{actor:r.a,weapon:'slosher',muzzle:new api.THREE.Vector3()});
   r.a._finishFrame(1/60);
   assert.equal(api.slosherMotionSnapshot(r.ch),null,cancel);
  }finally{r.close();}
 }
});

test('display partitions preserve real 12F release and 29F repeat',async()=>{
 const api=await production();
 for(const hz of [30,60,120,144]){
  const r=rig(api,'slosher'),clock=new api.FixedClock();
  try{
   for(let frame=0;frame<hz*1.25;frame++)clock.advance(1/hz,dt=>r.step(dt,{fire:true}));
   assert.deepEqual(r.events.slice(0,3).map(e=>e.tick),[12,41,70],`${hz}Hz`);
  }finally{r.close();}
 }
});

test('retimed actual births remain before nearby walls and each native unit enters wall-drop once',async t=>{
 const api=await production(),rows=[];
 for(const front of [.31,.35,.45,.55,1.7]){
  api.G.camera=null;
  const r=rig(api,'slosher'),V=api.THREE.Vector3;
  try{
   const wall={id:0,solid:true,center:new V(0,1,front+.05),half:new V(10,4,.05),axes:[new V(1,0,0),new V(0,1,0),new V(0,0,1)],faces:[-1,-1,-1,-1,-1,-1]};
   api.G.level={blocks:[wall],groundHeight:()=>0,queryBlocks:(_x,_z,_xx,_zz,out)=>{out.length=0;out.push(0);return out;}};
   api.G.physics=new api.Physics(api.G.level);
   for(let i=0;i<13;i++)r.step(1/60,{fire:true});
   api.G.camera={position:new V(0,2,-6)};
   const ps=api.G.projectiles,births=ps.list.map(p=>p.pos.toArray());
   assert.equal(births.length,9);assert.ok(births.every(p=>p[2]<front),`birth precedes wall ${front}`);
   // The installed Slosher wall-drop owner consumes wall contact before the
   // legacy _impact method. Observe its real per-unit state and emitted impact.
   const units=[...ps.list],seen=new Map(),impacts=[];
   const off=api.on('weapon:impact',event=>impacts.push(event));
   try {
    for(let i=0;i<120&&ps.list.length;i++){
     ps.update(1/60);
     for(const p of units)if(p.agent3SlosherWallDrop){
      if(seen.has(p))assert.equal(p.agent3SlosherWallDrop,seen.get(p),'one wall-drop admission per native unit');
      else seen.set(p,p.agent3SlosherWallDrop);
     }
    }
   }finally{off();}
   assert.equal(seen.size,9);assert.equal(impacts.length,9);assert.ok(impacts.every(e=>e.kind==='drop'&&e.victim===null));assert.equal(ps.list.length,0);
   rows.push({front,birth:births[0],impacts:impacts.length,wallDropUnits:seen.size});
  }finally{api.G.camera=null;r.close();}
 }
 t.diagnostic(JSON.stringify({nativeWallBoundary:rows}));
});

test('strict birth segments handle thin/thick angled walls and wall-parallel aim',async t=>{
 const api=await production(),V=api.THREE.Vector3,rows=[];
 for(const [name,yaw,front,half] of [['thin',0,.45,.001],['thick',0,.45,1],['angle',Math.PI/4,.25,.05],['wall-parallel',-Math.PI/2,.09,.1],['fallback-blocked',0,.2,.05]]){
  api.G.camera=null;const r=rig(api,'slosher');
  try{
   const normal=new V(Math.sin(yaw),0,Math.cos(yaw)),side=new V(Math.cos(yaw),0,-Math.sin(yaw));
   const wall={id:0,solid:true,center:normal.clone().multiplyScalar(front+half).setY(1),half:new V(10,4,half),axes:[side,new V(0,1,0),normal],faces:[-1,-1,-1,-1,-1,-1]};
   api.G.level={blocks:[wall],groundHeight:()=>0,queryBlocks:(_x,_z,_xx,_zz,out)=>{out.length=0;out.push(0);return out;}};api.G.physics=new api.Physics(api.G.level);
   for(let i=0;i<13;i++)r.step(1/60,{fire:true});
   const ps=api.G.projectiles,origin=r.a.pos.clone().add(new V(0,1.05,0));
   assert.equal(ps.list.length,9);
   for(const p of ps.list){assert.ok(p.pos.dot(normal)<front,name);assert.equal(api.G.physics.segment(origin,p.pos,new api.Hit(),true).hit,false,name);}
   if(name==='fallback-blocked')assert.ok(ps.list[0].pos.equals(origin));
   rows.push({name,birth:ps.list[0].pos.toArray()});
  }finally{r.close();}
 }
 t.diagnostic(JSON.stringify({strictMuzzleSegments:rows}));
});
