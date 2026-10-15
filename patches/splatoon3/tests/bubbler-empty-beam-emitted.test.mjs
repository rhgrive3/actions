// All helper exports come from the fixture's VM graph. With INKWAVE_BUILT_SITE,
// source-fixture resolves these imports to the actual emitted modules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fixture} from './source-fixture.mjs';
import {adaptKitSource} from './kit-composed-fixture.mjs';
const EXTRA=`export {installKitBigBubbler,clearBigBubblers,bigBubblerDomes,bigBubblerRemoteDomes,bigBubblerSnapshot,replayBigBubbler,damageBigBubblerFromBeam} from './patches/splatoon3/runtime/kit-big-bubbler.mjs';
export {installWeaponsFidelity} from './patches/splatoon3/runtime/weapons-fidelity.mjs';`;
test('fixture-graph beam helper preserves empty, real activation, remote-only proposal and clear',async()=>{
 if(process.env.INKWAVE_BUILT_SITE){
  const site=path.resolve(process.env.INKWAVE_BUILT_SITE),manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
  const helper=fs.readFileSync(path.join(site,'patches/splatoon3/runtime/kit-big-bubbler.mjs'));
  const helperSHA256=crypto.createHash('sha256').update(helper).digest('hex');
  const sourceSHA256=crypto.createHash('sha256').update(fs.readFileSync(new URL('../runtime/kit-big-bubbler.mjs',import.meta.url))).digest('hex');
  assert.equal(manifest.files['patch/runtime/kit-big-bubbler.mjs'],sourceSHA256,'emitted build must derive from this helper source');
  assert.equal(manifest.artifacts['patches/splatoon3/runtime/kit-big-bubbler.mjs'],helperSHA256,'tested helper must match emitted artifact manifest');
  console.log('BUBBLER_EMITTED_RECEIPT',JSON.stringify({contentHash:manifest.contentHash,inputHash:manifest.inputHash,helperSHA256,helperBytes:helper.length}));
 }
 const f=await fixture({adaptNative:adaptKitSource,extraExports:EXTRA});
 f.installSubSpecialFidelity(f,f.profile);f.installWeaponsFidelity(f,f.profile);
 f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 const scene=new f.THREE.Scene();f.G.scene=scene;f.G.projectiles=new f.Projectiles(scene);
 f.installKitBigBubbler(f,{...f.profile,kits:{bigBubbler:{timeDamageIntervalSeconds:1e9}}});
 f.clearBigBubblers('setup');
 const attacker=f.make('charger');attacker.team=1;attacker.alive=true;
 const start=new f.THREE.Vector3(0,1.2,-10),end=new f.THREE.Vector3(0,1.2,10);
 const before=JSON.stringify({start:start.toArray(),end:end.toArray(),ink:attacker.ink,special:attacker.special});
 const hits=[],proposals=[];const off=f.on('kit:bubbler:hit',e=>hits.push(e)),stop=f.on('kit:bubbler:damage-proposal',e=>proposals.push(e));
 for(let i=0;i<1000;i++)assert.equal(f.G.projectiles.damageBigBubblerFromBeam(attacker,start,end,3.5),0);
 assert.equal(JSON.stringify({start:start.toArray(),end:end.toArray(),ink:attacker.ink,special:attacker.special}),before);
 assert.equal(hits.length,0);assert.equal(proposals.length,0);
 const owner=f.make('roller');owner.team=0;owner.pos.set(0,0,0);owner.yaw=owner.aimYaw=0;owner.weapon={...owner.weapon,special:'bubbler'};owner.special=owner.specialCost();owner._startSpecial();
 const dome=f.bigBubblerDomes()[0];assert.ok(dome);start.x=end.x=dome.pos.x;start.z=dome.pos.z-10;end.z=dome.pos.z+10;
 const hp=dome.hp,applied=f.G.projectiles.damageBigBubblerFromBeam(attacker,start,end,3.5);assert.ok(applied>0);assert.equal(dome.hp,hp-applied);assert.equal(hits.length,1);
 const snapshot=f.bigBubblerSnapshot()[0];f.clearBigBubblers('clear');
 const remote={...owner,remote:true,nid:'remote-bubbler',owner:'peer'};
 assert.equal(f.replayBigBubbler('deploy',remote,{...snapshot,id:'remote-beam',domeId:'remote-beam'}).ok,true);
 assert.equal(f.bigBubblerDomes().length,0);const replica=f.bigBubblerRemoteDomes()[0],remoteHp=replica.hp;
 f.G.projectiles.damageBigBubblerFromBeam(attacker,start,end,3.5);assert.equal(replica.hp,remoteHp);assert.equal(proposals.length,1);
 f.clearBigBubblers('finish');assert.equal(f.G.projectiles.damageBigBubblerFromBeam(attacker,start,end,3.5),0);
 assert.equal(f.bigBubblerRemoteDomes().length,0);assert.equal(hits.length,1);assert.equal(proposals.length,1);off();stop();
});
