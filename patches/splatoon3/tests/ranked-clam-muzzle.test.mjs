import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';
const WEAPONS=['shooter','dualies','charger','roller','blaster','slosher','splatling',
  's3-brush-normal','s3-shelter-normal','s3-saber-normal','s3-stringer-normal'];
async function setup(source=false){
  const f=source?await sourceLoadedActorFixture({random:()=>.5}):await fixture({fullRuntime:true,productionComposition:true,includeCharacter:true,vmMathRandom:()=>.5});
  if(!source){
    f.G.scene=new f.THREE.Scene();
    f.G.level={blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out;}};
    f.G.physics=new f.Physics(f.G.level);
  }
  f.G.match={mode:'clams',playing:()=>true};
  class NativeCharacter extends f.Character{constructor(options){super({...options,sourceMotion:false});}}
  f.pairActor=async(weapon,pitch=0)=>{
    const a=source?await f.make():new f.Actor({team:0,name:'matched-clam-muzzle',weapon,CharacterClass:NativeCharacter,style:{hair:0,skin:2,outfit:0,eyes:0}});
    if(source)a.setWeapon(weapon);
    a.character.actor=a;a.character.onEvent=null;a.grounded=true;a.ground.hit=true;a.aimPitch=pitch;
    a.aimDir.set(0,-Math.sin(pitch),Math.cos(pitch));a.aimPoint.copy(a.aimDir).multiplyScalar(20).add(a.pos);
    f.G.scene.add(a.character.root);return a;
  };
  f.advancePair=(a,b)=>{f.G.time+=1/60;a._finishFrame(1/60);b._finishFrame(1/60);};
  return f;
}
function sameArray(a,b,message){assert.deepEqual(Array.from(a),Array.from(b),message);}
for(const source of [false,true])test(`clam-only left-arm presentation keeps actual muzzles and simulation identical across 11 families / 3 pitches (${source?'loaded Player00':'native'})`,async t=>{
  const f=await setup(source),projectiles=new f.Projectiles(f.G.scene),rows=[];
  const va=new f.THREE.Vector3(),vb=new f.THREE.Vector3(),da=new f.THREE.Vector3(),db=new f.THREE.Vector3();
  for(const weapon of WEAPONS)for(const pitch of [-1.05,0,1.15]){
    const a=await f.pairActor(weapon,pitch),b=await f.pairActor(weapon,pitch);f.G.actors=[a,b];
    a.weaponRunner.firingPose=b.weaponRunner.firingPose=()=>true;
    for(let i=0;i<60;i++)f.advancePair(a,b);
    a.character.getMuzzle(va);b.character.getMuzzle(vb);assert.ok(va.equals(vb),'Matched actors start with equal actual gun position');
    const beforeTimers=Array.from(b.character.tr);
    b.character.trigger('clam-throw',{clamRelease:{kind:'power',pos:[0,1.15,0]}});
    assert.equal(b.character.s3ClamGripActive,weapon!=='dualies','Dualies arm motion remains deferred, not a displaced shot hidden by a getter');
    sameArray(b.character.tr,beforeTimers,'Clam success never resets native T_THROW or other action clocks');
    for(let i=0;i<=48;i++){
      const at=`${weapon} pitch=${pitch} tick=${i} source=${source}`;
      a.character.getMuzzle(va);b.character.getMuzzle(vb);assert.ok(va.equals(vb),`${at} visible main muzzle`);
      projectiles._muzzle(a,va);projectiles._muzzle(b,vb);assert.ok(va.equals(vb),`${at} actual shot origin`);
      projectiles._aimFrom(a,va,da);projectiles._aimFrom(b,vb,db);assert.ok(da.equals(db),`${at} actual shot direction`);
      projectiles._muzzleHand(a,1,va);projectiles._muzzleHand(b,1,vb);assert.ok(va.equals(vb),`${at} alternate muzzle`);
      sameArray(a.character.P,b.character.P,`${at} native pose channels`);
      sameArray(a.character.tr,b.character.tr,`${at} native clocks`);
      sameArray(a.character.sp,b.character.sp,`${at} native springs`);
      sameArray(a.character.ikErr,b.character.ikErr,`${at} next-frame IK feedback`);
      for(const name of ['spine','chest','clavR','uArmR','fArmR','handR']){
        assert.ok(a.character.bones[name].quaternion.equals(b.character.bones[name].quaternion),`${at} ${name}`);
      }
      assert.ok(a.pos.equals(b.pos)&&a.vel.equals(b.vel),`${at} Actor position and velocity`);
      for(const key of ['ink','hp','alive','form','special'])assert.equal(a[key],b[key],`${at} Actor ${key}`);
      f.advancePair(a,b);
    }
    assert.equal(b.character.s3ClamGripActive,false,'Presentation retires by the end of the full recovery window');
    rows.push({weapon,pitch,samples:49,maximumMuzzleDifference:0});
    a.character.dispose();b.character.dispose();f.G.scene.clear();
  }
  t.diagnostic(JSON.stringify({source,rows}));
});

test('real main-shot emissions preserve origins, directions and round velocities during clam recovery, including both dual guns',async t=>{
  const f=await setup(),events=[],rows=[];
  f.on('weapon:fire',e=>{if(e.muzzle&&e.dir)events.push({actor:e.actor,weapon:e.weapon,muzzle:e.muzzle.toArray(),dir:e.dir.toArray(),hand:e.hand});});
  for(const weapon of WEAPONS.slice(0,7)){
    const a=await f.pairActor(weapon),b=await f.pairActor(weapon);f.G.actors=[a,b];
    a.isLocal=b.isLocal=true;f.G.projectiles=new f.Projectiles(f.G.scene);
    for(let i=0;i<60;i++)f.advancePair(a,b);
    b.character.trigger('clam-throw',{clamRelease:{kind:'power',pos:[0,1.15,0]}});events.length=0;
    for(let i=0;i<100;i++){
      f.G.time+=1/60;
      const input={fire:i<70,firePressed:i===0,fireReleased:i===70,sub:false,subPressed:false,subReleased:false,moveX:0,moveY:0};
      for(const actor of [a,b]){
        actor.ink=100;actor.weaponRunner.update(1/60,input);
        // The isolated runner fixture does not provide the charger's Player
        // input-release handoff. Exercise its real beam emitter explicitly.
        if(weapon==='charger'&&i===6)f.G.projectiles.fireCharger(actor,actor.weapon,.5);
        actor._finishFrame(1/60);
      }
    }
    const shots=actor=>events.filter(e=>e.actor===actor).map(({actor,...e})=>e);
    const rounds=actor=>f.G.projectiles.list.filter(p=>p.owner===actor).map(p=>({type:p.type,pos:p.pos.toArray(),vel:p.vel.toArray(),start:p.start.toArray()}));
    const left=shots(a),right=shots(b);assert.ok(left.length>0,`${weapon} actually emitted`);
    assert.deepEqual(left,right,`${weapon} real fire event origin and direction`);
    assert.deepEqual(rounds(a),rounds(b),`${weapon} real round spawn and velocity`);
    if(weapon==='dualies')assert.deepEqual([...new Set(left.map(e=>e.hand))].sort(),[0,1]);
    rows.push({weapon,events:left.length,rounds:rounds(a).length});
    a.character.dispose();b.character.dispose();f.G.projectiles.clear();f.G.scene.clear();
  }
  t.diagnostic(JSON.stringify(rows));
});
