import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fixture } from './source-fixture.mjs';
import { sourceLoadedActorFixture } from './source-loaded-actor-fixture.mjs';

const extraExports = `
  export { createRankedEffects } from './patches/splatoon3/runtime/ranked/combat.mjs';
  export { createRainmakerModel, createRainmakerPresentation } from './patches/splatoon3/runtime/ranked/rainmaker-model.mjs';
  export { RAINMAKER_MUZZLE, captureRainmakerShotOrigin, validRainmakerShotOrigin } from './patches/splatoon3/runtime/ranked/rainmaker-shot-origin.mjs';
  export { RainmakerRule } from './patches/splatoon3/runtime/ranked/rainmaker.mjs';
  export { RankedEngine as OriginRankedEngine, validRankedSnapshot } from './patches/splatoon3/runtime/ranked/engine.mjs';
  export { bindRankedInput } from './patches/splatoon3/runtime/ranked/pose-admission.mjs';
  export { installRankedNetwork } from './patches/splatoon3/runtime/ranked/network.mjs';
`;
const stage = { id: 'origin-test', rainmaker: { center: [0,0,0], goals: [[0,0,100],[0,0,-100]], checkpoints: [[],[]], retreatZ: [-90,90] } };
const plain = x => JSON.parse(JSON.stringify(x));
const near = (a, b, message) => assert.ok(Math.hypot(...a.map((v, i) => v - b[i])) < 1e-10, message);
function shot(actorId = 'holder', extra = {}) {
  return { kind: 'rainmaker-shot', at: 1, id: 0, actorId, team: 0, pos: [0,0,0], aim: [0,0,1], charge: 1,
    damage: 60, blastDamage: 180, outerDamage: 40, radius: 1.4, nearRadius: .92, directRange: 4.4,
    effectiveRange: 5.8, paintRadius: 1, speed: 18, launchY: 3.36, recoil: 1.44, trailRadius: .48,
    shotOrigin: { actorId, owner: 'owner', life: 7, team: 0, body: [0,.7,0], muzzle: [0,1,1.2] }, ...extra };
}
function effectHarness(f) {
  const {G,THREE} = f, calls = { added: [], removed: [], paints: [], damage: [], rings: [], audio: [] };
  const holder = { nid: 'holder', owner: 'owner', netLife: 7, team: 0, alive: true, remote: false,
    pos: new THREE.Vector3(), vel: new THREE.Vector3() };
  const match = { mode: 'rainmaker', state: 'playing', actors: [holder], ranked: { revision: 1 } };
  G.scene = { add: v => calls.added.push(v), remove: v => calls.removed.push(v) };
  G.paint = { splat: (...a) => calls.paints.push(a) }; G.fx = { ring: (...a) => calls.rings.push(a) };
  G.audio = { play: (...a) => calls.audio.push(a) }; G.netm = null; G.projectiles = {};
  G.physics.los = () => true;
  G.physics.segment = (_a,_b,h) => { h.hit=false; return h; };
  const effects = f.createRankedEffects({ ...f, emit() {} }, match);
  const victim = (z, extra = {}) => ({ nid: 'target', team: 1, alive: true, pos: new THREE.Vector3(0,.3,z),
    damage: n => calls.damage.push(n), ...extra });
  return { G,THREE,calls,holder,match,effects,victim };
}

test('Rainmaker origin admission, immutable release, and body-to-muzzle obstruction', async t => {
  const f = await fixture({ extraExports }); f.context.structuredClone = structuredClone;
  await t.test('host event consumes the frozen muzzle, not moved actor or later live rig; range starts there', () => {
    const h=effectHarness(f), e=shot(); h.holder.pos.set(30,20,10);
    h.effects.event(e); near(h.calls.added[0].position.toArray(), [0,1,1.2]);
    e.shotOrigin.muzzle[2]=99; e.shotOrigin.body[2]=99;
    h.effects.update(.1); h.effects.update(.1); h.effects.update(.1);
    assert.ok(Math.abs(h.calls.added[0].position.z - 5.6) < 1e-12);
    assert.equal(h.holder.vel.z,-1.44); assert.equal(h.calls.audio.filter(a=>a[0]==='shoot_charger').length,1);
    h.effects.dispose();
  });
  await t.test('missing, malformed, wrong owner, wrong life and wrong team snapshots cannot emit or recoil', () => {
    const bad=[e=>delete e.shotOrigin,e=>e.shotOrigin.muzzle[0]=NaN,e=>e.shotOrigin.muzzle=[0,1,100],
      e=>e.shotOrigin.body[2]=1,e=>e.shotOrigin.actorId='other',e=>e.shotOrigin.owner='other',
      e=>e.shotOrigin.life=6,e=>e.shotOrigin.life=7.2,e=>e.shotOrigin.team=1];
    for(const mutate of bad){const h=effectHarness(f),e=shot();mutate(e);h.effects.event(e);assert.equal(h.calls.added.length,0);assert.equal(h.holder.vel.length(),0);h.effects.dispose();}
    const h=effectHarness(f);h.holder.remote=true;h.holder.net={lastLife:8};h.effects.event(shot());assert.equal(h.calls.added.length,0);h.effects.event(shot('holder',{shotOrigin:{...shot().shotOrigin,life:8}}));assert.equal(h.calls.added.length,1);h.effects.dispose();
  });
  await t.test('thin world wall between body and muzzle wins before a farther victim, with no through-wall paint', () => {
    const h=effectHarness(f), target=h.victim(2.2);h.match.actors.push(target);
    const segments=[];
    h.G.physics.segment=(a,b,hit)=>{segments.push([a.toArray(),b.toArray()]);hit.hit=a.z<.5&&b.z>=.5;
      if(hit.hit){const q=(.5-a.z)/(b.z-a.z);hit.point.copy(a).lerp(b,q);hit.dist=a.distanceTo(hit.point);}return hit;};
    h.G.physics.los=()=>false;
    h.effects.event(shot());h.effects.update(1/60);
    near(segments[0][0],[0,.7,0]);near(segments[0][1],[0,1,1.2]);
    assert.equal(h.calls.added[0].position.z,.5);assert.equal(h.calls.added[0].visible,false);
    assert.deepEqual(h.calls.damage,[]);assert.ok(h.calls.paints.every(p=>p[0].z<=.5));
    h.effects.update(.2);assert.equal(h.calls.rings.length,1);assert.deepEqual(h.calls.damage,[]);h.effects.dispose();
  });
  for(const kind of ['ink-vac','ultra-stamp-guard','shield']) await t.test(`release sweep resolves ${kind} before the muzzle`,()=>{
    const h=effectHarness(f);let contacts=0;
    h.G.projectiles.kitDefenseCandidate=p=>({distance:.2,kind,onHit:()=>contacts++});
    h.effects.event(shot());h.effects.update(1/60);
    assert.equal(contacts,1);assert.equal(h.calls.removed.length,1);assert.equal(h.calls.rings.length,kind==='shield'?1:0);h.effects.dispose();
  });
  await t.test('point-blank enemy between body and muzzle gets direct hit once; partial has no blast',()=>{
    const h=effectHarness(f);h.match.actors.push(h.victim(.6));
    h.effects.event(shot('holder',{blastDamage:0,radius:0,outerDamage:0,charge:.5}));h.effects.update(1/60);h.effects.update(1/60);
    assert.deepEqual(h.calls.damage,[60]);assert.equal(h.calls.rings.length,0);assert.equal(h.calls.removed.length,1);h.effects.dispose();
  });
  await t.test('follower uses host snapshot without resampling and has no ink or direct damage',()=>{
    const h=effectHarness(f);h.holder.pos.set(90,0,90);h.match.actors.push(h.victim(2));
    h.effects.event(shot(),true);near(h.calls.added[0].position.toArray(),[0,1,1.2]);h.effects.update(.2);h.effects.update(.2);
    assert.deepEqual(h.calls.damage,[]);assert.deepEqual(h.calls.paints,[]);h.effects.dispose();
  });
  await t.test('release snapshot survives one-frame delay and JSON roundtrip but not owner or life replacement',()=>{
    for(const change of ['none','life','owner']){
      const engine=new f.OriginRankedEngine('rainmaker',stage),a={id:'holder',owner:'owner',life:7,team:0,pos:[0,0,0],alive:true,grounded:true,rainmakerShotRequired:true,rainmakerShotOrigin:shot().shotOrigin};
      const rule=engine.rule;rule.state.carrier=a.id;rule.state.carrierTeam=0;rule.state.barrier.active=false;
      rule._updateShot(1+1/60,a,{fire:true,aim:[0,0,1]});rule._updateShot(1/120,a,{fire:false,aim:[0,0,1]});
      assert.ok(rule.state.charge.pending);a.rainmakerShotOrigin.muzzle[2]=99;
      const snapshot=engine.snapshot();assert.equal(f.validRankedSnapshot(snapshot,'rainmaker',stage.id),true);
      const bad=plain(snapshot);bad.rule.charge.pending.shotOrigin.body[0]=2;assert.equal(f.validRankedSnapshot(bad,'rainmaker',stage.id),false);
      rule.restore(plain(snapshot).rule);if(change==='life')a.life++;if(change==='owner')a.owner='replacement';
      rule._updateShot(1/120,a,{fire:false,aim:[1,0,0]});const emitted=engine.events.filter(e=>e.kind==='rainmaker-shot');
      assert.equal(emitted.length,change==='none'?1:0);if(emitted.length){near(emitted[0].shotOrigin.muzzle,[0,1,1.2]);near(emitted[0].aim,[0,0,1]);}
    }
  });
  await t.test('runtime release fails closed without an active objective socket',()=>{
    const engine=new f.OriginRankedEngine('rainmaker',stage),a={id:'holder',owner:'owner',life:7,team:0,pos:[0,0,0],alive:true,rainmakerShotRequired:true};
    engine.rule._updateShot(1+1/60,a,{fire:true,aim:[0,0,1]});engine.rule._updateShot(1/60,a,{fire:false,aim:[0,0,1]});
    assert.equal(engine.events.filter(e=>e.kind==='rainmaker-shot').length,0);
  });
  await t.test('wire admission rejects malformed snapshot before consuming event sequence',()=>{
    class NetMatch{constructor(){this.cfg={id:'match'};this.s={hostId:'host'};this.isHost=false;this.match={ranked:new f.OriginRankedEngine('rainmaker',stage),playRankedEvents:e=>this.events=e};} _sendNow(){} _sendTick(){} onMessage(){} _hostClock(){} onLeave(){} dispose(){}}
    const G={};f.installRankedNetwork({NetMatch,G});const nm=G.netm=new NetMatch();
    const good={k:'rkevent',match:'match',seq:1,events:[shot()]};
    for(const mutate of [e=>delete e.shotOrigin,e=>e.shotOrigin.muzzle[0]=Infinity,e=>e.shotOrigin.life=-1,e=>e.shotOrigin.body[1]=8]){
      const bad=plain(good);mutate(bad.events[0]);nm.onMessage('host',bad);assert.equal(nm.events,undefined);assert.equal(nm.rankedEventSeq,undefined);
    }
    nm.onMessage('intruder',good);assert.equal(nm.events,undefined);nm.onMessage('host',good);assert.equal(nm.events.length,1);assert.equal(nm.rankedEventSeq,1);
  });
});

test('production Actor final release pose agrees with the adopted displayed muzzle at 30/60/120 Hz',async t=>{
  let randomState=0x58e72,randomCalls=0;
  const random=()=>{randomCalls++;randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
  const f=await sourceLoadedActorFixture({extraExports,random}),{G,THREE}=f,a=await f.make();
  const engine=new f.OriginRankedEngine('rainmaker',stage),rule=engine.rule;
  rule.state.carrier=String(a.nid);rule.state.carrierTeam=0;rule.state.barrier.active=false;
  const match=G.match={mode:'rainmaker',state:'playing',actors:[a],ranked:engine,rankedBarrierHits:[],playing:()=>true,canRespawn:()=>false,
    rankedWorld:{zoneCoverage:()=>[],floorAt:()=>0,blocked:()=>false}};
  const core=f.createRainmakerModel(THREE),group=new THREE.Group();group.add(core);G.scene.add(group);
  const presentation=f.createRainmakerPresentation(THREE,core);assert.deepEqual(plain(core.userData.rainmakerModel.muzzle),plain(f.RAINMAKER_MUZZLE));
  let samples=0,maxOldGap=0,maxError=0;const trace=[];
  try{
    for(const hz of [30,60,120])for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2])for(const pitch of [-1.05,0,1.15]){
      rule.state.charge={seconds:1,value:1,firing:true,delay:0,recovery:0,pending:null,wasSwimming:false};a.aimYaw=yaw;a.aimPitch=pitch;a.intent.fire=false;
      f.tick(a,1/hz);assert.equal(a.character._rainmakerPose,true);
      group.position.copy(a.pos);presentation.update(a,1);group.updateMatrixWorld(true);
      const shown=core.localToWorld(new THREE.Vector3(...core.userData.rainmakerModel.muzzle));
      const before=a.character.boneList.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()]);
      const beforeRandom=randomCalls,frame=f.buildFrame(match,f),p=frame.actors[0].rainmakerShotOrigin;
      assert.equal(randomCalls,beforeRandom,'release sampling does not consume gameplay RNG');
      assert.ok(p,'real buildFrame captures the final release pose');const error=shown.distanceTo(new THREE.Vector3(...p.muzzle));maxError=Math.max(maxError,error);assert.ok(error<1e-10);
      assert.deepEqual(a.character.boneList.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()]),before,'sampling does not modify any bone');
      const expected=plain(p);rule._updateShot(1/60,frame.actors[0],frame.inputs[String(a.nid)]);const e=engine.events.filter(e=>e.kind==='rainmaker-shot').at(-1);
      assert.ok(e);assert.deepEqual(plain(e.shotOrigin),expected);trace.push({hz,yaw,pitch,origin:plain(p),aim:plain(e.aim),damage:e.damage,range:e.directRange,speed:e.speed,recoil:e.recoil});maxOldGap=Math.max(maxOldGap,shown.distanceTo(a.pos.clone().add(new THREE.Vector3(0,1,0))));samples++;
    }
    assert.equal(samples,36);assert.ok(maxOldGap>.8,'regression would reject the old actor+1 origin');
    let interruptedSamples=0;
    a.aimPitch=-1.05;
    for(let i=0;i<14;i++){
      a.intent.squid=i<4;a.intent.fire=false;
      rule.state.charge={seconds:i<4?0:1,value:i<4?0:1,firing:i>=4,delay:0,recovery:0,pending:null,wasSwimming:false};
      f.tick(a);const ch=a.character;
      if(!ch.s3RainmakerFormPending)continue;
      assert.equal(ch.sourceMotion.returnInterrupted,true);
      group.position.copy(a.pos);presentation.update(a,1);group.updateMatrixWorld(true);
      const before=ch.boneList.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()]);
      const p=f.captureRainmakerShotOrigin(THREE,a,String(a.nid),a.pos.toArray(),a.aimDir.toArray());
      assert.ok(p);near(p.muzzle,core.localToWorld(new THREE.Vector3(...core.userData.rainmakerModel.muzzle)).toArray());
      assert.deepEqual(ch.boneList.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray()]),before);
      assert.equal(ch.s3RainmakerFormPending,true,'snapshot does not consume or replace the existing transient owner');
      trace.push({interruptedFrame:i-4,scale:ch.kidScale,origin:plain(p)});interruptedSamples++;
    }
    assert.equal(interruptedSamples,9,'all existing interrupted-return display-owner frames are sampled');
    const live=f.captureRainmakerShotOrigin(THREE,a,String(a.nid),a.pos.toArray(),a.aimDir.toArray());
    const translated=f.captureRainmakerShotOrigin(THREE,a,String(a.nid),[a.pos.x+5,a.pos.y+2,a.pos.z-3],a.aimDir.toArray());
    near(translated.muzzle,live.muzzle.map((n,i)=>n+[5,2,-3][i]),'remote admitted position translates the same bounded socket');
    // The remote host uses admitted position and the bound input epoch, never
    // an owner-supplied muzzle or the interpolated proxy's absolute position.
    a.remote=true;a.owner='guest';a.net={lastLife:7};
    const nm=G.netm={isHost:true,match,s:{},cfg:{id:'origin-match'},rankedInputs:new Map(),rankedPose:new Map()};
    const id=String(a.nid),position=[a.pos.x+5,a.pos.y+2,a.pos.z-3];
    const admitted={actor:a,match,session:nm.s,owner:a.owner,life:7,last:{pos:position,grounded:true,squid:false}};
    nm.rankedPose.set(id,admitted);nm.rankedInputs.set(id,f.bindRankedInput({fire:false,throw:false,aim:a.aimDir.toArray(),at:G.time},a,match,nm));
    rule.state.charge.firing=true;
    const remote=f.buildFrame(match,f).actors[0];assert.equal(remote.alive,true);assert.ok(remote.rainmakerShotOrigin);
    near(remote.rainmakerShotOrigin.muzzle,translated.muzzle);assert.equal(remote.rainmakerShotOrigin.life,7);assert.equal(remote.rainmakerShotOrigin.owner,'guest');
    admitted.owner='other';const wrongOwner=f.buildFrame(match,f).actors[0];assert.equal(wrongOwner.alive,false);assert.equal(wrongOwner.rainmakerShotOrigin,null);
    admitted.owner='guest';a.net.lastLife=8;const wrongLife=f.buildFrame(match,f).actors[0];assert.equal(wrongLife.alive,false);assert.equal(wrongLife.rainmakerShotOrigin,null);
    G.netm=null;a.remote=false;
    const digest=createHash('sha256').update(JSON.stringify(trace)).digest('hex');
    if(process.env.INKWAVE_RAINMAKER_ORIGIN_TRACE)fs.writeFileSync(process.env.INKWAVE_RAINMAKER_ORIGIN_TRACE,JSON.stringify({trace,digest},null,2)+'\n');
    t.diagnostic(JSON.stringify({samples,interruptedSamples,maxError,maxOldActorOriginGap:maxOldGap,sourceBank:a.character.sourceMotion.status,traceSha256:digest}));
  }finally{presentation.release();core.geometry.dispose();core.material.dispose();f.reset();}
});
