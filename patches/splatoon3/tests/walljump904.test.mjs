import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import {adaptTouchLayout} from '../../touch-layout/adapter.mjs';
import {adaptReliability} from '../../reliability/adapter.mjs';
import {adaptQualitySource} from '../../local-quality/adapter.mjs';
import {adaptNetworkSource} from '../../network-replication/adapter.mjs';
import {adaptRange} from '../../practice-range/adapter.mjs';
const compose=(rel,s)=>adaptRange(rel,adaptNetworkSource(rel,adaptQualitySource(rel,adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,s))))));
import { installSuperjumpMotion as secondRealmInstall, superjumpMotionSnapshot as secondRealmSnapshot } from '../runtime/superjump-motion.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT, 'inkwave-public'));
let cached;
async function production() {
  if (cached) return cached;
  const clock={ms:1000000},context = vm.createContext({ console, performance:{now:()=>clock.ms}, URL }), modules = new Map();
  const load = requested => {
    let file = requested.startsWith(path.join(SRC, 'patches') + path.sep)
      ? path.join(ROOT, path.relative(SRC, requested)) : requested;
    if (file.startsWith(path.join(ROOT, 'src') + path.sep)) file = path.join(SRC, path.relative(ROOT, file));
    if (modules.has(file)) return modules.get(file);
    const source = fs.readFileSync(file, 'utf8');
    const module = new vm.SourceTextModule(compose(file.startsWith(SRC+path.sep)?path.relative(SRC,file):path.relative(ROOT,file),source),
      { context, identifier: file, initializeImportMeta(meta) { meta.url = pathToFileURL(file).href; } });
    modules.set(file, module); return module;
  };
  const entry = new vm.SourceTextModule(`
    export { install } from './patches/splatoon3/runtime/install.mjs';
    export {NetMatch} from './inkwave-public/src/net/netmatch.js';
    export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';
    export { installSuperjumpMotion, superjumpMotionSnapshot } from './patches/splatoon3/runtime/superjump-motion.mjs';
  `, { context, identifier: path.join(ROOT, 'superjump-composition-entry.mjs') });
  await entry.link((specifier, from) => load(specifier === 'three'
    ? path.join(SRC, 'vendor/three/build/three.module.js')
    : specifier.startsWith('three/addons/') ? path.join(SRC, 'vendor/three/jsm', specifier.slice('three/addons/'.length))
      : path.resolve(path.dirname(from.identifier), specifier)));
  await entry.evaluate();
  const profile = JSON.parse(fs.readFileSync(path.join(ROOT, 'patches/splatoon3/profile.json')));
  const api = { ...entry.namespace.install(profile), ...entry.namespace, profile, clock };
  api.installSuperjumpMotion(api, profile);
  const methods = [api.Character.prototype.update, api.Character.prototype._updateSquid, api.Actor.prototype._finishFrame];
  api.installSuperjumpMotion(api, profile); secondRealmInstall(api, profile);
  assert.deepEqual([api.Character.prototype.update, api.Character.prototype._updateSquid, api.Actor.prototype._finishFrame], methods);
  const { G, THREE } = api, V = THREE.Vector3, center = new V(0, -.1, 0), half = new V(100, .1, 100);
  const floor = { id: 0, solid: true, center, half, axes: [new V(1, 0, 0), new V(0, 1, 0), new V(0, 0, 1)],
    faces: [-1, -1, 0, -1, -1, -1], aabbMin: center.clone().sub(half), aabbMax: center.clone().add(half) };
  G.level = { blocks: [floor], faces: [{ origin: new V(-100, 0, -100), u: new V(1, 0, 0), v: new V(0, 0, 1) }],
    hasRails: false, groundHeight: () => 0, pointInside: () => false,
    spawnPads: [new V(), new V(80, 0, 80)], spawnBarrier: 1,
    queryBlocks: (_x, _z, _xx, _zz, out) => { out.length = 0; out.push(0); return out; } };
  G.scene = new THREE.Scene(); G.settings = { quality: 'high' }; G.time = 0;
  G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')];
  G.physics = new api.Physics(G.level);
  G.paint = { sample: () => 0, splat: () => 0 };
  G.match = { playing: () => true, canRespawn: () => false };
  G.projectiles = Object.fromEntries(['fireShooter', 'fireDualies', 'fireCharger', 'fireSplatling', 'fireBlaster',
    'fireSlosh', 'throwBomb', 'fireFlick'].map(name => [name, () => {}]));
  Object.assign(G.projectiles,{list:[],bombs:[],clouds:[],beams:[],sights:new Map()});
  G.actors = []; cached = api; return api;
}
function rig(api, enabled = true, weapon = 'shooter') {
  const { Actor, Character, G, THREE } = api;
  G.physics=new api.Physics(G.level);G.paint.sample=()=>0;
  const a = new Actor({ team: 0, name: 'superjump native regression', weapon,
    CharacterClass: Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = a.character; ch.actor = a; ch.onEvent = null; ch.s3SuperjumpMotionEnabled = enabled;
  G.scene.add(ch.root); G.actors.push(a); a.grounded = true;
  G.physics.groundProbe(0, 0, 0, .4, .35, .24, a.ground, false);
  const step = (dt = 1 / 60) => { G.time += dt; a.intent.squid = a.form === 'squid'; a.update(dt); ch.root.updateMatrixWorld(true); };
  const visual = (dt = 1 / 60) => { a._finishFrame(dt); ch.root.updateMatrixWorld(true); };
  for (let i = 0; i < 90; i++) step();
  assert.equal(ch._owner(), a); assert.equal(ch._runner(), a.weaponRunner);
  assert.equal(a.grounded, true);
  const direction = () => new THREE.Vector3(0, 1, 0).applyQuaternion(ch.squid.pivot.getWorldQuaternion(new THREE.Quaternion()));
  return { api, a, ch, step, visual, direction, snapshot: () => api.superjumpMotionSnapshot(ch),
    close() { G.actors = G.actors.filter(x => x !== a); G.scene.remove(ch.root); ch.dispose(); } };
}

function wall(r){const {a,api}=r,V=api.THREE.Vector3;a.reset();a.form='squid';a.climbing=true;a.grounded=false;a.pos.set(0,2,0);a.wallN.set(0,0,-1);a.intent.squid=true;a.intent.move.set(0,0,0);
 api.G.paint.sample=()=>1;api.G.physics.raycast=(_o,_d,_r,h)=>{h.hit=true;h.face=0;h.normal.set(0,0,-1);h.u=h.v=.5;return h;};for(let i=0;i<60;i++)r.visual();
 const q=r.ch.squid.pivot.getWorldQuaternion(new api.THREE.Quaternion());assert.equal(a.superJump(new V(10,0,10)),true);return q;}
const pose=r=>r.ch.squid.pivot.getWorldQuaternion(new r.api.THREE.Quaternion());
test('#904 full installed native wall charge keeps the wall basis, locked position and existing launch at every render cadence',async t=>{
 const api=await production(),r=rig(api);t.after(()=>r.close());const outcomes=[];
 for(const hz of [30,60,120]){const before=wall(r),position=r.a.pos.clone(),clock=new api.FixedClock();let chargeTicks=0,launch=null;
  for(let frame=0;frame<hz*4&&launch===null;frame++)clock.advance(1/hz,()=>{if(launch!==null)return;r.step();if(r.a.superJumpState.phase==='charge'){chargeTicks++;assert.equal(r.a.climbing,false);assert.ok(r.a.pos.distanceTo(position)<1e-10);assert.ok(before.angleTo(pose(r))<1e-6,'wall basis rotated '+before.angleTo(pose(r)));assert.equal(r.ch.form,'climb');assert.equal(r.a.anim.form,'squid','borrowed presentation frame is restored');assert.equal(r.snapshot().phase,'charge');}else{launch=clock.ticks;assert.equal(r.ch.form,'squid');assert.notEqual(r.snapshot().phase,'charge');}});
  assert(launch!==null);assert(chargeTicks>0);outcomes.push({chargeTicks,launch});
 }
 assert.deepEqual(outcomes[0],outcomes[1]);assert.deepEqual(outcomes[1],outcomes[2]);
});
test('#904 lost wall support retires the wall basis while ground charge and ordinary wall swim keep native owners',async t=>{
 const api=await production(),r=rig(api);t.after(()=>r.close());wall(r);r.step();assert.equal(r.ch.form,'climb');
 const borrowed=r.a.anim.wallNormal,updateSquid=r.ch._updateSquid;r.ch._updateSquid=()=>{throw Error('presentation failed');};assert.throws(()=>r.visual(),/presentation failed/);r.ch._updateSquid=updateSquid;assert.equal(r.a.anim.form,'squid');assert.equal(r.a.anim.wallNormal,borrowed);
 api.G.paint.sample=()=>2;r.step();assert.equal(r.a.superJumpState.wallSupport,null);assert.equal(r.ch.form,'squid');assert.equal(r.a.climbing,false);assert(r.a.vel.y<0,'existing unsupported gravity continues');
 r.a.reset();r.a.form='squid';r.a.grounded=true;r.a.pos.set(0,0,0);r.a.climbing=false;assert.equal(r.a.superJump(new api.THREE.Vector3(10,0,10)),true);r.step();assert.equal(r.a.superJumpState.wallSupport,null);assert.equal(r.ch.form,'squid');
 r.a.reset();r.a.form='squid';r.a.climbing=true;r.a.wallN.set(1,0,0);r.visual();assert.equal(r.ch.form,'climb');assert.equal(r.a.climbing,true);assert.equal(r.a.superJumpState,null);
});
test('#904 actual existing snapshot fields preserve wall charge normal and retire it at support loss/flight',async t=>{
 const api=await production(),r=rig(api);t.after(()=>r.close());const {a}=r,V=api.THREE.Vector3;wall(r);r.step();a.nid=7;a.owner='A';a.remote=false;
 const ghost=new api.Actor({team:0,name:'proxy',weapon:'shooter',CharacterClass:api.Character});ghost.character.actor=ghost;api.G.scene.add(ghost.character.root);t.after(()=>{api.G.scene.remove(ghost.character.root);ghost.character.dispose();});ghost.nid=7;ghost.owner='A';ghost.remote=true;
 const session=id=>({myId:id,hostId:'C',isHost:false,_members:new Map([['A','A'],['B','B'],['C','C']]),tr:{broadcast(){},sendTo(){}}});
 const sender=new api.NetMatch(session('A'),{}),receiver=new api.NetMatch(session('B'),{});t.after(()=>{sender.dispose();receiver.dispose();});sender.byNid.set(7,a);sender._setupActor(a);receiver.byNid.set(7,ghost);receiver._setupActor(ghost);
 let packet;sender.s.tr.broadcast=m=>{packet=JSON.parse(JSON.stringify(m));};
 function deliver(){api.clock.ms+=100;sender._sendTick();receiver.onMessage('A',packet);receiver.peers.get('A').tr=packet.ts;receiver._sample(ghost,packet.ts,0);receiver.applyRemote(ghost,1/60);}
 deliver();assert.deepEqual(Array.from(packet.a[0].slice(17,20)),[0,0,-1]);assert.equal(ghost.superJumpState.phase,'charge');assert.equal(ghost.climbing,false);assert.deepEqual(Array.from(ghost.superJumpState.wallSupport.toArray()),[0,0,-1]);assert.equal(ghost.anim.movementMotion.superJump,ghost.superJumpState);assert.equal(ghost.character.form,'climb');
 api.G.paint.sample=()=>2;r.step();deliver();assert.equal(ghost.superJumpState.wallSupport,null);assert.equal(ghost.climbing,false);assert.deepEqual(Array.from(packet.a[0].slice(17,20)),[0,0,0]);
 wall(r);for(let i=0;i<180&&a.superJumpState.phase==='charge';i++)r.step();assert.equal(a.superJumpState.phase,'flight');deliver();assert.equal(ghost.superJumpState.phase,'flight');assert.equal(ghost.superJumpState.wallSupport,null);assert.equal(ghost.climbing,false);
});
