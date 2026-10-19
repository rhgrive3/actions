import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';
const WEAPONS=['shooter','dualies','charger','roller','blaster','slosher','splatling',
  's3-brush-normal','s3-shelter-normal','s3-saber-normal','s3-stringer-normal'];
async function setup(source=false){
  const f=await sourceLoadedActorFixture({random:()=>.5,extraExports:`export {RankedWorld} from './patches/splatoon3/runtime/ranked/world.mjs';`});
  const stage={id:'clam-muzzle-staged',clams:{spawns:[],goals:[[0,0,80],[0,0,-80]]}};
  f.presentThrow=a=>{
    const e=new f.RankedEngine('clams',stage),m=f.G.match={mode:'clams',state:'playing',ranked:e,actors:[a],playing:()=>true,rankedGains:[0,0],rankedEffects:{event(){}}};
    const w=m.rankedWorld=new f.RankedWorld(f.installedRuntime||f,m,stage),c=a.character,id=String(a.nid??a.id??1);a.nid=id;
    e.rule.state.inventories[id]={team:0,power:true,small:0};assert.equal(e.rule._throw({id,team:0,alive:true,pos:a.pos.toArray()},{aim:[0,0,1]},{actors:[],floorAt:()=>0}),true);
    const before=c.boneList.map(b=>b.quaternion.toArray()),hand=c.bones.handL.getWorldPosition(new f.THREE.Vector3());let solves=0;const solve=c._solveLimb;
    c._solveLimb=function(...args){solves++;return solve.apply(this,args);};
    try{f.Match.prototype.playRankedEvents.call(m,e.events.splice(0));assert.equal(solves,0,'Clam success adds no solve');assert.deepEqual(c.boneList.map(b=>b.quaternion.toArray()),before);assert.ok(c.bones.handL.getWorldPosition(new f.THREE.Vector3()).equals(hand),'No event-frame wrist jump');}
    finally{c._solveLimb=solve;w.dispose();}
  };
  f.G.match={mode:'clams',playing:()=>true};
  f.pairActor=async(weapon,pitch=0)=>{
    const a=await f.make();if(!source)a.character.sourceMotion.setEnabled(false);assert.equal(a.character.sourceMotion.enabled,source);
    a.setWeapon(weapon);
    a.character.actor=a;a.character.onEvent=null;a.grounded=true;a.ground.hit=true;a.aimPitch=pitch;
    a.aimDir.set(0,-Math.sin(pitch),Math.cos(pitch));a.aimPoint.copy(a.aimDir).multiplyScalar(20).add(a.pos);
    f.G.scene.add(a.character.root);return a;
  };
  f.advancePair=(a,b)=>{f.G.time+=1/60;a._finishFrame(1/60);b._finishFrame(1/60);};
  return f;
}
function sameArray(a,b,message){assert.deepEqual(Array.from(a),Array.from(b),message);}
for(const source of [false,true])test(`staged Clam delivery keeps all bones, actual muzzles and simulation identical across 11 families / 3 pitches (${source?'loaded Player00':'native'})`,async t=>{
  const f=await setup(source),projectiles=new f.Projectiles(f.G.scene),rows=[];
  const va=new f.THREE.Vector3(),vb=new f.THREE.Vector3(),da=new f.THREE.Vector3(),db=new f.THREE.Vector3();
  for(const weapon of WEAPONS)for(const pitch of [-1.05,0,1.15]){
    const a=await f.pairActor(weapon,pitch),b=await f.pairActor(weapon,pitch);f.G.actors=[a,b];
    a.weaponRunner.firingPose=b.weaponRunner.firingPose=()=>true;
    for(let i=0;i<60;i++)f.advancePair(a,b);
    a.character.getMuzzle(va);b.character.getMuzzle(vb);assert.ok(va.equals(vb),'Matched actors start with equal actual gun position');
    const beforeTimers=Array.from(b.character.tr);
    f.presentThrow(b);
    assert.equal(!!b.character.s3ClamGripActive,false,'Every family retains its main-only arms');
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
      for(const name of Object.keys(a.character.bones)){
        assert.ok(a.character.bones[name].quaternion.equals(b.character.bones[name].quaternion),`${at} ${name}`);
      }
      assert.ok(a.pos.equals(b.pos)&&a.vel.equals(b.vel),`${at} Actor position and velocity`);
      for(const key of ['ink','hp','alive','form','special'])assert.equal(a[key],b[key],`${at} Actor ${key}`);
      f.advancePair(a,b);
    }
    assert.equal(!!b.character.s3ClamGripActive,false,'No deferred arm state appears after the event');
    rows.push({weapon,pitch,samples:49,maximumMuzzleDifference:0});
    a.character.dispose();b.character.dispose();f.G.scene.clear();
  }
  t.diagnostic(JSON.stringify({source,rows}));
});

test('real main-shot emissions preserve origins, directions and round velocities after real Clam delivery, including both dual guns',async t=>{
  const f=await setup(),events=[],rows=[];
  f.on('weapon:fire',e=>{if(e.muzzle&&e.dir)events.push({actor:e.actor,weapon:e.weapon,muzzle:e.muzzle.toArray(),dir:e.dir.toArray(),hand:e.hand});});
  for(const weapon of WEAPONS.slice(0,7)){
    const a=await f.pairActor(weapon),b=await f.pairActor(weapon);f.G.actors=[a,b];
    a.isLocal=b.isLocal=true;f.G.projectiles=new f.Projectiles(f.G.scene);
    for(let i=0;i<60;i++)f.advancePair(a,b);
    f.presentThrow(b);events.length=0;
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
