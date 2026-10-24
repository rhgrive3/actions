// No renderer or retail parity claim: actual production adapters/installer,
// native Character pose/model, and native accepted local/ghost births. Only the
// cosmetic muzzle/shell sinks are spied; projectile/gameplay code is unmodified.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fixture } from '../../network-replication/tests/robustness-fixture.mjs';
import { compactModuleStrings } from '../../../scripts/lib/inkwave-source-compaction.mjs';
const transformed = new Set();
const esbuild = process.env.SPECIAL_VFX_ESBUILD && createRequire(import.meta.url)(process.env.SPECIAL_VFX_ESBUILD);
const negativeControl = process.env.INK_VAC_MUZZLE_NEGATIVE === '1';
const aliasNegativeControl = process.env.INK_VAC_MUZZLE_OWNER_NEGATIVE === '1';
const changed = new Set(['patches/splatoon3/runtime/special-motion.mjs','patches/splatoon3/runtime/special-vfx.mjs']);
const f = await fixture({ productionComposition:true, includePresentation:true,
  transformSource: (rel, source) => {
    if (negativeControl && rel === 'patches/splatoon3/runtime/special-vfx.mjs') {
      const line = 'if (ch?.actor !== p.owner || !inkVacPresentationMuzzle(ch, m)) m.copy(p.start || p.pos);';
      assert.ok(source.includes(line),'negative control targets only cosmetic origin');
      source = source.replace(line,'m.copy(p.start || p.pos);');
    }
    if (aliasNegativeControl && rel === 'patches/splatoon3/runtime/special-vfx.mjs') {
      const guard = 'ch?.actor !== p.owner || ';
      assert.ok(source.includes(guard),'owner negative control targets only caller identity');
      source = source.replace(guard,'');
    }
    if (!esbuild || !changed.has(rel)) return source;
    transformed.add(rel);
    return compactModuleStrings(esbuild.transformSync(source,{loader:'js',minify:true,charset:'utf8',format:'esm',legalComments:'inline',sourcefile:rel}).code).code;
  } });
const { G, THREE } = f;
const fx = new f.FX(new THREE.Scene(),{quality:'low'}); G.fx = fx; fx.setCollider(()=>null);
const director = fx.s3SpecialVfx, flashes = [], shells = [];
let onMuzzle = null;
director.muzzle = (pos,dir) => { flashes.push({pos:pos.clone(),dir:dir.clone()}); onMuzzle?.(pos); };
director.shell = (_add,_life,_kind,pos) => shells.push(pos.clone());
const close = (a,b,msg) => assert.ok(a.distanceTo(b)<1e-10,`${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
function actor(remote=false) {
  const a=f.makeActor({nid:remote?8:7,owner:remote?'p3':'p2',remote,roller:false});
  a.character=new f.Character({name:remote?'Vac ghost':'Vac owner',isLocal:!remote,sourceMotion:false});
  a.character.actor=a;
  // Do not load optional source clips or require a renderer in this CPU fixture.
  // Native procedural pose + fitted special model remain the actual production code.
  a.character.sourceMotion.dispose();
  a.specialActive={id:'inkVac',phase:'exhale'};
  return a;
}
const local=actor(),remote=actor(true);
const nm=f.makeNetMatch(f.makeSession('p2','p2'));f.bind(nm,[local]);G.actors=[local,remote];
function pose(a,yaw,pitch,position=new THREE.Vector3(-3,2,4)) {
  a.pos.copy(position);a.yaw=a.aimYaw=yaw;a.aimPitch=pitch;
  a.aimDir.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
  const ch=a.character;ch.root.position.copy(a.pos);ch.root.rotation.y=yaw;
  G.time+=1/60;ch.update(1/60,{form:'kid',grounded:true,aimPitch:pitch});
  const model=ch.kid.getObjectByName('special:inkVac');assert.ok(model?.visible,'real held Ink Vac exists');
  model.updateWorldMatrix(true,false);
  return {model,nozzle:model.localToWorld(model.userData.muzzle.clone())};
}
function shot(a=local) {nm.out.length=0;return f.projectiles.fireInkVacExhale(a,{charge:.5});}
function assertFlash(nozzle,oldCount,context) {
  assert.equal(flashes.length,oldCount+1,context+' exactly one muzzle');
  close(flashes.at(-1).pos,nozzle,context+' flash is modeled nozzle');
  close(shells.at(-1),nozzle,context+' shock shell shares modeled nozzle');
}

test('actual composed local and ghost birth flashes follow the fitted nozzle across yaw and elevation',()=>{
  for (const yaw of [0,Math.PI/2,-Math.PI/2,Math.PI]) for (const pitch of [-.7,0,.7]) {
    const {nozzle}=pose(local,yaw,pitch),before=flashes.length;
    const expectedOrigin=local.pos.clone().add(new THREE.Vector3(0,f.INK_VAC_CALIBRATION.breathOriginHeight,0));
    const p=shot();assertFlash(nozzle,before,`local ${yaw}/${pitch}`);
    assert.ok(nozzle.distanceTo(p.start)>.1,'test distinguishes model nozzle from gameplay origin');
    for(const value of [p.start,p.pos,p.prev])close(value,expectedOrigin,'native coordinates unchanged');
    const expectedVelocity=local.aimDir.clone().normalize().multiplyScalar(f.exhaleSpeed(.5)).add(new THREE.Vector3(0,f.INK_VAC_CALIBRATION.spawnSpeedY*60,0));
    close(p.vel,expectedVelocity,'native trajectory unchanged');
    assert.equal(p.age,0);assert.equal(p.damage,f.exhaleDamage());assert.equal(p.life,f.INK_VAC_CALIBRATION.burstLifetimeSeconds);assert.equal(p.ghost,false);
    const packet=nm.out.find(e=>e[1]==='p');assert.ok(packet,'native birth still records');
    assert.deepEqual(Array.from(packet.slice(5,8)),[expectedOrigin.x,expectedOrigin.y,expectedOrigin.z]);
    const ghostNozzle=pose(remote,yaw+.23,pitch,new THREE.Vector3(9,3,-7)).nozzle;
    const count=flashes.length,n=f.projectiles.list.length;
    f.projectiles.ghostProjectile(remote,JSON.parse(JSON.stringify(packet)));
    assert.equal(f.projectiles.list.length,n+1);const ghost=f.projectiles.list.at(-1);
    assert.equal(ghost.ghost,true);assertFlash(ghostNozzle,count,`ghost ${yaw}/${pitch}`);
    close(ghost.start,new THREE.Vector3(...packet.slice(5,8)),'ghost wire origin unchanged');
    director.inkVacShot(p);director.inkVacShot(ghost);assert.equal(flashes.length,count+1,'native/directed observations deduplicate');
  }
});

test('accepted births fall back, never to stale or hidden Ink Vac geometry',()=>{
  pose(local,0,.2);const ch=local.character,model=ch.kid.getObjectByName('special:inkVac');
  const cases=[
    ['no character',()=>{local.character=null;},()=>{local.character=ch;}],
    ['no owned special',()=>{local.specialActive=null;},()=>{local.specialActive={id:'inkVac',phase:'exhale'};}],
    ['different owner token',()=>{local.specialActive={id:'trizooka'};},()=>{local.specialActive={id:'inkVac',phase:'exhale'};}],
    ['hidden held model',()=>{model.visible=false;},()=>{model.visible=true;}],
    ['hidden kid group',()=>{ch.kid.visible=false;},()=>{ch.kid.visible=true;}],
    ['hidden ancestor',()=>{ch.root.visible=false;},()=>{ch.root.visible=true;}],
    ['disabled presentation',()=>{ch.s3SpecialPresentationEnabled=false;},()=>{delete ch.s3SpecialPresentationEnabled;}],
    ['nonkid presentation',()=>{ch.kidForm=false;},()=>{ch.kidForm=true;}],
    ['dead owner',()=>{local.alive=false;},()=>{local.alive=true;}],
    ['detached stale model',()=>{model.removeFromParent();},()=>{ch.kid.add(model);}],
    ['invalid model transform',()=>{model.position.x=NaN;},()=>{model.position.x=-.11;}],
  ];
  for(const [label,enter,exit] of cases) {
    enter();const before=flashes.length,p=shot();assert.equal(flashes.length,before+1,label+' still emits accepted shot');
    close(flashes.at(-1).pos,p.start,label+' uses native birth fallback');exit();
  }
  const neverShown=f.makeActor({nid:9,owner:'p4',remote:true,roller:false});
  const before=flashes.length,packet=nm.out.find(e=>e[1]==='p');
  f.projectiles.ghostProjectile(neverShown,JSON.parse(JSON.stringify(packet)));
  const p=f.projectiles.list.at(-1);assert.equal(p.ghost,true);assert.equal(flashes.length,before+1);close(flashes.at(-1).pos,p.start,'absent ghost presentation state fallback');
});


test('accepted remote ghosts also fall back when the replica held model is unavailable',()=>{
  pose(remote,.5,.2);const ch=remote.character,model=ch.kid.getObjectByName('special:inkVac');
  const cases=[
    ['no character',()=>{remote.character=null;},()=>{remote.character=ch;}],
    ['ended replica token',()=>{remote.specialActive=null;},()=>{remote.specialActive={id:'inkVac',phase:'exhale'};}],
    ['hidden replica model',()=>{model.visible=false;},()=>{model.visible=true;}],
    ['disabled replica presentation',()=>{ch.s3SpecialPresentationEnabled=false;},()=>{delete ch.s3SpecialPresentationEnabled;}],
    ['detached replica model',()=>{model.removeFromParent();},()=>{ch.kid.add(model);}],
  ];
  for(const [label,enter,exit] of cases) {
    shot();const packet=nm.out.find(e=>e[1]==='p');enter();const before=flashes.length;
    f.projectiles.ghostProjectile(remote,JSON.parse(JSON.stringify(packet)));
    const p=f.projectiles.list.at(-1);assert.equal(p.ghost,true);assert.equal(flashes.length,before+1,label+' accepted');
    close(flashes.at(-1).pos,p.start,label+' uses wire birth fallback');exit();
  }
});

test('stale character aliases never borrow a foreign live model nozzle',()=>{
  pose(local,0,.2);pose(remote,1.1,.3);
  const localCharacter=local.character,remoteCharacter=remote.character;
  try {
    // The aliased character really is eligible for its own owner, so this is
    // an expected-projectile-owner check, not an absent/hidden-model fallback.
    assert.equal(f.inkVacPresentationMuzzle(remoteCharacter,new THREE.Vector3()),true);
    local.character=remoteCharacter;let before=flashes.length;
    const p=shot();assert.equal(flashes.length,before+1);close(flashes.at(-1).pos,p.start,'local alias uses projectile owner birth');
    local.character=localCharacter;
    const packet=nm.out.find(e=>e[1]==='p');
    assert.equal(f.inkVacPresentationMuzzle(localCharacter,new THREE.Vector3()),true);
    remote.character=localCharacter;before=flashes.length;
    f.projectiles.ghostProjectile(remote,JSON.parse(JSON.stringify(packet)));
    const ghost=f.projectiles.list.at(-1);assert.equal(ghost.owner,remote);assert.equal(ghost.ghost,true);
    assert.equal(flashes.length,before+1);close(flashes.at(-1).pos,ghost.start,'ghost alias uses wire birth');
  } finally {local.character=localCharacter;remote.character=remoteCharacter;}
  assert.equal(director.errors,0,'alias rejection never throws');
});

test('HOLD, cancellation, rejected ghost, and duplicate/reused rounds preserve birth guarantees',()=>{
  const nozzle=pose(local,-1,.35).nozzle;const before=flashes.length;
  director.update(1/60,G.camera);assert.equal(flashes.length,before,'HOLD has no muzzle');
  local.specialActive=null;director.update(1/60,G.camera);assert.equal(flashes.length,before,'cancellation has no muzzle');
  local.specialActive={id:'inkVac',phase:'exhale'};
  const p=shot();assertFlash(nozzle,before,'first generation');
  const packet=nm.out.find(e=>e[1]==='p');const malformed=[...packet,'bad'];
  const n=f.projectiles.list.length;assert.equal(f.projectiles.ghostProjectile(remote,malformed),null);
  assert.equal(f.projectiles.list.length,n);assert.equal(flashes.length,before+1,'rejected birth has no muzzle');
  const saved=JSON.stringify({start:p.start,pos:p.pos,vel:p.vel,damage:p.damage,life:p.life});
  director.inkVacShot(p);fx.clear();director.inkVacShot(p);assert.equal(flashes.length,before+1,'clear and duplicate do not replay');
  assert.equal(JSON.stringify({start:p.start,pos:p.pos,vel:p.vel,damage:p.damage,life:p.life}),saved,'presentation never writes native projectile');
  f.projectiles.list.splice(f.projectiles.list.indexOf(p),1);f.projectiles.pool.push(p);
  const nextNozzle=pose(local,1.4,-.5).nozzle;const next=shot();assert.equal(next,p,'actual native pool reuse');
  assertFlash(nextNozzle,before+1,'new generation');director.inkVacShot(next);assert.equal(flashes.length,before+2);
  const disabled=flashes.length;fx.s3SpecialVfxEnabled=false;shot();fx.s3SpecialVfxEnabled=true;
  assert.equal(flashes.length,disabled,'effects disable remains respected');assert.equal(director.errors,0,'no swallowed director errors');
});


test('real native activation to HOLD to release retains its nozzle during the synchronous token-clear window',()=>{
  const oldGround=G.physics.groundProbe,oldBody=G.physics.collideBody,oldActors=G.actors;
  G.physics.groundProbe=(_x,_y,_z,_up,_down,_radius,out)=>{out.hit=true;out.y=0;out.normal.set(0,1,0);out.block=-1;out.face=-1;return out;};
  G.physics.collideBody=(_pos,_rad,_lift,_height,out)=>out;
  try {
    for(const dt of [1/30,1/60,1/120]) {
      const a=new f.Actor({team:0,name:'Native Vac release '+dt,weapon:'charger',isLocal:true,CharacterClass:f.Character});
      a.character.sourceMotion.dispose();a.character.actor=a;a.owner='p2';a.nid=10;a.pos.set(1,0,-2);a.special=a.specialCost();a.grounded=true;
      a.aimYaw=.65;a.aimPitch=.25;G.actors=[a];const before=flashes.length;
      a._startSpecial();assert.equal(a.specialActive.id,'inkVac');assert.equal(f.inkVacState(a).phase,'inhale');
      let frames=0;
      while(f.inkVacState(a)?.phase==='inhale'&&frames++<1000) {G.time+=dt;a.update(dt);}
      assert.equal(f.inkVacState(a)?.phase,'exhale');
      for(let t=0;t<.5;t+=dt) {G.time+=dt;a.update(dt);}
      assert.equal(flashes.length,before,'native exhale HOLD never flashes');
      onMuzzle=pos=>{
        assert.equal(a.specialActive,null,'real kit clears token before accepted birth');
        assert.equal(f.inkVacState(a)?.phase,'done');assert.ok(!f.inkVacState(a)?.s3Retired);
        const model=a.character.kid.getObjectByName('special:inkVac');assert.ok(model?.visible);
        model.updateWorldMatrix(true,false);close(pos,model.localToWorld(model.userData.muzzle.clone()),'real release flash uses still-owned held nozzle');
      };
      a.intent.fire=true;G.time+=dt;a.update(dt);onMuzzle=null;
      assert.equal(flashes.length,before+1,'native release authors exactly one flash');
      assert.equal(f.inkVacState(a),null,'real release retires state normally');
      assert.equal(f.inkVacPresentationMuzzle(a.character,new THREE.Vector3()),false,'ended release cannot read stale model');
      const p=f.projectiles.list.at(-1);assert.equal(p.owner,a);close(p.start,a.pos.clone().add(new THREE.Vector3(0,1,0)),'real release gameplay origin unchanged');
      a.character.dispose();
    }
  } finally {onMuzzle=null;G.physics.groundProbe=oldGround;G.physics.collideBody=oldBody;G.actors=oldActors;}
  assert.equal(director.errors,0,'real owner path never throws inside director');
});

test('production transform mode covers both changed modules when requested',()=>{
  if(esbuild)assert.deepEqual([...transformed].sort(),[...changed].sort());
  for(const a of [local,remote])a.character?.dispose();
});
