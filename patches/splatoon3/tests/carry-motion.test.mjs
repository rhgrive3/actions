import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptSource } from '../adapter.mjs';
import { installCarryMotion as secondRealm } from '../runtime/carry-motion.mjs';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const SRC=path.resolve(process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT,'inkwave-public'));
let loaded;
async function production() {
  if(loaded)return loaded;
  const context=vm.createContext({console,performance,URL}), modules=new Map();
  const load=requested=>{
    let file=requested.startsWith(path.join(SRC,'patches')+path.sep)?path.join(ROOT,path.relative(SRC,requested)):requested;
    if(file.startsWith(path.join(ROOT,'src')+path.sep))file=path.join(SRC,path.relative(ROOT,file));
    if(modules.has(file))return modules.get(file);
    const source=fs.readFileSync(file,'utf8');
    const m=new vm.SourceTextModule(file.startsWith(SRC+path.sep)?adaptSource(path.relative(SRC,file),source):source,
      {context,identifier:file,initializeImportMeta(meta){meta.url=pathToFileURL(file).href;}});
    modules.set(file,m);return m;
  };
  const entry=new vm.SourceTextModule(`export {install} from './patches/splatoon3/runtime/install.mjs';
    export {carryMotionSnapshot} from './patches/splatoon3/runtime/carry-motion.mjs';`,
    {context,identifier:path.join(ROOT,'carry-composition-entry.mjs')});
  await entry.link((s,f)=>load(s==='three'?path.join(SRC,'vendor/three/build/three.module.js'):
    s.startsWith('three/addons/')?path.join(SRC,'vendor/three/jsm',s.slice(13)):path.resolve(path.dirname(f.identifier),s)));
  await entry.evaluate();
  const api={...entry.namespace.install(JSON.parse(fs.readFileSync(path.join(ROOT,'patches/splatoon3/profile.json')))),...entry.namespace};
  const {G,THREE}=api;G.scene=new THREE.Scene();G.teamColors=[new THREE.Color('#ff8a14'),new THREE.Color('#2f5bff')];
  G.level={blocks:[],spawnPads:[new THREE.Vector3(),new THREE.Vector3(0,0,20)],groundHeight:()=>0};
  G.paint={sample:()=>1,splat:()=>0};G.match={playing:()=>true,canRespawn:()=>false};
  G.physics={los:()=>true,raycast:(_a,_b,_c,hit)=>{hit.hit=false;return hit;}};
  G.projectiles=Object.fromEntries(['fireShooter','fireDualies','fireCharger','fireSplatling','fireBlaster','fireSlosh','throwBomb','fireFlick'].map(n=>[n,()=>{}]));
  G.actors=[];G.time=0;loaded=api;return api;
}
function rig(api,enabled=true,kind='shooter') {
  const {Actor,Character,THREE,G}=api;
  const a=new Actor({team:0,name:'carry regression',weapon:kind,CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
  const ch=a.character;ch.actor=a;ch.onEvent=null;ch.s3CarryMotionEnabled=enabled;
  G.scene.add(ch.root);G.actors=[a];a.grounded=a.ground.hit=true;
  const step=(speed=0,fire=false,sub=false)=>{
    const dt=1/60;a.pos.z+=speed*dt;a.vel.z=speed;a.intent.fire=fire;a.intent.sub=sub;
    G.time+=dt;a.weaponRunner.update(dt,{fire,sub});a._finishFrame(dt);ch.root.updateMatrixWorld(true);ch.skeleton.update();
  };
  const gap=()=>ch.weapon.off.localToWorld(ch.weapon.def.handL.pos.clone()).distanceTo(ch.bones.handL.getWorldPosition(new THREE.Vector3()));
  for(let i=0;i<90;i++)step();
  return {a,ch,step,gap,close(){G.scene.remove(ch.root);ch.dispose();G.actors=[];}};
}
test('native supported shooter carry stays on its actual foregrip through idle, walk, aim and return',async()=>{
  const api=await production(), baseline=rig(api,false);const before=baseline.gap();baseline.close();
  const r=rig(api);let max=0;
  try {
    const nativeHold=r.ch.hold;
    for(let i=0;i<240;i++){
      const speed=i<30?0:i<70?1.2:i<110?4.5:i<180?2:0;
      r.step(speed,i>=110&&i<150);
      assert.equal(r.ch.hold,nativeHold,'shared hold restored after native calculation');
      assert.equal(r.ch.hold.twoCarry,0,'original core hold is unchanged');
      assert.ok(r.ch.P[api.CHARACTER_CHANNELS.IKL]>.99);
      max=Math.max(max,r.gap());
      assert.ok(r.ch.ikErr[0]<.01,'actual native left arm reach');
      assert.ok(Array.from(r.ch.P).every(Number.isFinite));
    }
    assert.ok(before>.2,'reproduce unsupported native quiet carry');
    assert.ok(max<.015,`native drawn weapon foregrip error ${max}`);
    assert.ok(max<before*.1);
  } finally {r.close();}
});
test('held sub detaches support and reset/dispose/second realm preserve native ownership',async()=>{
  const api=await production(),r=rig(api);
  try {
    const method=api.Character.prototype._poseWeapon;secondRealm(api);assert.equal(api.Character.prototype._poseWeapon,method);
    const hold=r.ch.hold;
    for(let i=0;i<35;i++)r.step(1.2,false,true);
    assert.ok(r.ch.bombHeld&&r.ch.P[api.CHARACTER_CHANNELS.IKL]<.1);
    assert.equal(r.ch.hold,hold);
    r.a.reset();assert.equal(api.carryMotionSnapshot(r.ch),null);
    r.ch.setWeapon('dualies');r.step();assert.equal(api.carryMotionSnapshot(r.ch),null);
    assert.ok(Array.from(r.ch.P).every(Number.isFinite));
  } finally {r.close();}
  assert.equal(api.carryMotionSnapshot(r.ch),null);
});
