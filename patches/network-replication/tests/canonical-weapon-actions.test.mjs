import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';

const EXTRA=`export {createCanonicalWeaponActions,inspectCanonicalWeaponState,
  legacyWeaponActionRequirement} from './patches/network-replication/canonical-weapon-actions.mjs';`;
let fixturePromise;
const world=()=>fixturePromise??=fixture({fullRuntime:true,productionComposition:true,
  realProjectiles:true,vmMathRandom:()=>.5,extraExports:EXTRA}).then(f=>{
    f.G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},
      spawnPads:[[-90,0,-90],[90,0,90]],spawnBarrier:0,half:[],single:[
        {kind:'box',min:[-100,-1,-100],max:[100,0,100]}]});
    f.G.physics=new f.Physics(f.G.level);
    f.G.camera=new f.THREE.PerspectiveCamera();return f;
  });
const plain=v=>JSON.parse(JSON.stringify(v));
function command(extra={}){return {nid:1,owner:'A',life:0,input:{fire:false,sub:false,jump:false,
  squid:false,special:false,move:[0,0]},aim:[0,0],aimPoint:[0,1.05,70],...extra};}
function setup(f,id='shooter',options={}){
  f.G.actors.length=0;f.G.projectiles.clear();f.G.time=0;f.G.netm=null;
  const actor=f.make(id);actor.nid=1;
  const actions=f.createCanonicalWeaponActions(f.installedRuntime);
  actions.register(actor,{owner:'A',life:0,epoch:'match-1',firstTick:0,...options});
  return{actor,actions};
}

test('all 65 source main owners and installed variant/sub/special slots resolve without copied fire/resource formulas',async()=>{
  const f=await world(),{actor,actions}=setup(f);
  assert.equal(actions.baseIds.length,65);
  const families=new Set();
  for(const id of actions.baseIds){
    const d=actions.describe(id);assert.ok(d,id);families.add(d.family);
    assert.equal(d.baseId,id);assert.equal(d.source.version,'11.3.0');
    assert.match(d.source.sha256,/^[a-f0-9]{64}$/);assert.ok(d.sourceBudgetFields.length>0,id+' source budget references');
    assert.ok(f.SUB[d.sub.id]);assert.ok(f.SPECIALS[d.special.id]);
    assert.ok(d.special.cost>0);assert.equal(d.births.includes('never one proof'),true);
    assert.ok(Object.isFrozen(d)&&Object.isFrozen(d.sourceBudgetFields));
  }
  assert.equal(families.size,11);
  for(const id of Object.keys(f.WEAPONS))if(f.WEAPONS[id].variantOf){
    const d=actions.describe(id);assert.ok(d,id);assert.equal(d.weaponId,id);
    assert.equal(d.sub.id,f.WEAPONS[id].sub);assert.equal(d.special.id,f.WEAPONS[id].special);
  }
  assert.equal(actions.describe('toString'),null);
  const before=plain(actions.inspect(actor)),raw=command({input:{...command().input,fire:true}});
  const p=actions.prepare(raw,{tick:0,from:'A'});assert.equal(p.ok,true);
  assert.deepEqual(plain(actions.inspect(actor)),before,'prepare cannot charge, refill or fire');
  assert.equal(actor.intent.fire,false);assert.equal(actions.apply(p.token).ok,true);
  assert.equal(actor.intent.fire,true);assert.deepEqual(plain(actions.inspect(actor)),before,'apply changes only input and aim');
});

test('owner results cannot hydrate charge, ink, gauge, timing, identity or births and rejection consumes no tick',async()=>{
  const f=await world(),{actor,actions}=setup(f,'charger'),before=plain(actions.inspect(actor));
  for(const key of ['ink','charge','chargeF','specialGauge','cooldown','damage','pellets','births','weaponId','modifiers']){
    const out=actions.prepare({...command(),[key]:1000},{tick:0,from:'A'});
    assert.equal(out.ok,false,key);assert.equal(out.reason,'owner-result-field');
  }
  assert.equal(actions.prepare(command({input:{...command().input,charge:1}}),{tick:0,from:'A'}).ok,false);
  for(const raw of [command({life:1}),command({owner:'B'}),command({nid:2})])
    assert.equal(actions.prepare(raw,{tick:0,from:'A'}).ok,false);
  assert.equal(actions.prepare(command(),{tick:0,from:'B'}).reason,'owner-mismatch');
  assert.equal(actions.prepare(command(),{tick:0}).reason,'invalid-envelope','principal cannot come from self-reported owner');
  assert.equal(actions.prepare(command(),{tick:2,from:'A'}).reason,'nonconsecutive-tick');
  assert.deepEqual(plain(actions.inspect(actor)),before);
  const good=actions.prepare(command(),{tick:0,from:'A'});assert.equal(good.ok,true,'rejections leave tick0 usable');
  assert.equal(actions.apply(good.token).ok,true);
  assert.equal(actions.apply(good.token).reason,'invalid-or-used-token');
});

test('tokens bind the actor life/owner/epoch, copy inputs and preserve prepare-all/apply-all semantics',async()=>{
  const f=await world(),{actor,actions}=setup(f);
  const raw=command(),a=actions.prepare(raw,{tick:0,from:'A'}),b=actions.prepare(raw,{tick:0,from:'A'});
  raw.input.fire=true;raw.input.move[0]=1;raw.aim[1]=1;raw.aimPoint[1]=999;
  assert.equal(actions.apply(a.token).ok,true);assert.equal(actor.intent.fire,false);
  assert.equal(actor.intent.move.x,0);assert.equal(actor.aimPitch,0);assert.equal(actor.aimPoint.y,1.05);
  assert.equal(actions.apply(b.token).reason,'nonconsecutive-tick');
  const old=actions.prepare(command(),{tick:1,from:'A'});assert.equal(old.ok,true);
  actions.register(actor,{owner:'B',life:1,epoch:'match-2',firstTick:1});
  assert.equal(actions.apply(old.token).reason,'retired-epoch');
  assert.equal(actions.prepare(command(),{tick:1,from:'A'}).ok,false);
  const fresh=actions.prepare(command({owner:'B',life:1}),{tick:1,from:'B'});
  assert.equal(fresh.ok,true);assert.equal(actions.apply(fresh.token).ok,true);
  assert.equal(actions.forget(actor),true);assert.equal(actions.forget(actor),false);
  assert.equal(actions.prepare(command({owner:'B',life:1}),{tick:2,from:'B'}).reason,'unregistered-actor');
});

test('commands require complete holds and finite native input vectors, while absent aimPoint preserves trusted target',async()=>{
  const f=await world(),{actor,actions}=setup(f);actor.aimPoint.set(2,3,4);
  for(const raw of [
    command({input:{fire:true,move:[0,0]}}),command({input:{...command().input,fire:1}}),
    command({input:{...command().input,move:[1,1]}}),command({input:{...command().input,move:[NaN,0]}}),
    command({aim:[0,Infinity]}),command({aimPoint:[0,0,2001]}),
  ])assert.equal(actions.prepare(raw,{tick:0,from:'A'}).ok,false);
  const raw=command();delete raw.aimPoint;
  const out=actions.prepare(raw,{tick:0,from:'A'});assert.equal(out.ok,true);actions.apply(out.token);
  assert.deepEqual(plain(actor.aimPoint.toArray()),[2,3,4]);
});

function nativeRun(f,id,{canonical=true,ink=100,ticks=240,cancelAt=null}={}){
  const {actor,actions}=setup(f,id);actor.ink=ink;
  const ps=f.G.projectiles,births=[],events=[],push=ps._push,chargerJobs=new Set();
  const off=f.on('weapon:fire',e=>{if(e.actor===actor)events.push({tick,weapon:e.weapon,charge:e.charge,hand:e.hand});});
  // _push is an allocation/queue observation, not proof of wire publication.
  // Native Slosher owners finalize some pending flags only after this call.
  ps._push=function(p){if(p.owner===actor)births.push({tick,stage:'native-allocation',wid:p.wid??null,type:p.type,ink:actor.ink,
    pos:p.pos.toArray(),vel:p.vel.toArray(),delay:p.delay,life:p.life,damage:p.damage,inkMeta:plain(p.inkMeta??null)});return push.call(this,p);};
  let tick=0;
  try{
    for(;tick<ticks;tick++){
      const hold=tick<160,raw=command({input:{...command().input,fire:hold},
        ...(tick===cancelAt?{cancel:{fire:true,sub:false}}:{})});
      if(canonical){const p=actions.prepare(raw,{tick,from:'A'});assert.equal(p.ok,true,id+' at'+tick);assert.equal(actions.apply(p.token).ok,true);}
      else{Object.assign(actor.intent,raw.input);actor.intent.move=new f.THREE.Vector3(0,0,0);actor.aimYaw=0;actor.aimPitch=0;actor.aimPoint.set(...raw.aimPoint);
        if(raw.cancel)actor.weaponRunner.cancelHold(raw.cancel.fire,raw.cancel.sub);}
      f.G.time+=1/60;actor.update(1/60);
      // Legacy Charger owns a separate finite-flight queue, not _push/list.
      // Its authoritative jobs are native emissions too, without inventing
      // an owner-authored projectile record for them.
      for(const job of ps._fidelityChargerFlights||[])if(job.owner===actor&&!chargerJobs.has(job)){
        chargerJobs.add(job);births.push({tick,stage:'native-flight-start',wid:job.weapon.id,type:'native-charger-flight',ink:actor.ink,
          pos:job.origin.toArray(),vel:job.dir.clone().multiplyScalar(job.speed).toArray(),delay:0,
          life:job.range/job.speed,damage:job.damage,charge:job.charge,chargeT:job.chargeT,inkMeta:null});
      }
      ps.update(1/60);
    }
    return plain({births,events,state:actions.inspect(actor)});
  }finally{ps._push=push;off();ps.clear();}
}

test('native cadence/resources and multi-pellet/charge/burst/roller owners retain exact results after command application',async()=>{
  const f=await world(),proof=[];
  for(const id of ['shooter','charger','splatling','roller','s3-roller-heavy','s3-slosher-double',
    's3-shelter-wide','s3-stringer-normal','s3-saber-normal','s3-maneuver-stepper']){
    const baseline=nativeRun(f,id,{canonical:false}),actual=nativeRun(f,id);
    assert.ok(actual.births.length>0,id+' native admitted births exist');
    assert.deepEqual(actual,baseline,id+' input contract preserves actual native budget and birth sequence');
    proof.push({id,births:actual.births.length,events:actual.events.length,ink:actual.state.ink});
  }
  const empty=nativeRun(f,'shooter',{ink:0});
  assert.equal(empty.births.length,0,'valid empty-ink fire requests cannot invent a native birth');
  assert.equal(empty.state.runner.charge,0);
  console.log(JSON.stringify({canonicalNativeActions:proof}));
});

test('native cancel requests preserve deliberate-release versus cancelled-hold Charger and Splatling behavior',async()=>{
  const f=await world();
  for(const id of ['charger','splatling']){
    const release=nativeRun(f,id),cancelled=nativeRun(f,id,{cancelAt:160});
    const reference=nativeRun(f,id,{canonical:false,cancelAt:160});
    assert.ok(release.events.length>0,id+' deliberate release owns an actual shot');
    assert.equal(cancelled.events.length,0,id+' native cancellation never becomes a shot release');
    assert.equal(cancelled.births.length,0);
    assert.deepEqual(cancelled,reference,id+' command calls the existing native cancellation owner');
  }
  const {actions}=setup(f);
  assert.equal(actions.prepare(command({cancel:{fire:1,sub:false}}),{tick:0,from:'A'}).reason,'invalid-cancel');
  assert.equal(actions.prepare(command({cancel:{fire:true,sub:false},input:{...command().input,fire:true}}),
    {tick:0,from:'A'}).reason,'cancelled-held-input');
});

test('legacy birth/fire/snapshot observations cannot mint complete canonical command history',async()=>{
  const f=await world();
  for(const row of [[0,'p',1,'shot','charger'],[0,'ev','weapon:fire',{charge:1}],
    [0,'b',1,'bomb'],[0,'ac','sub'],[0,'tr',1]]){
    const out=f.legacyWeaponActionRequirement(row);assert.equal(out.ok,false);
    assert.equal(out.reason,'legacy-result-is-not-input');assert.ok(out.required.length>=3);
  }
});
