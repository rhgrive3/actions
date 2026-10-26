import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

// Full production source composition (or INKWAVE_BUILT_SITE), native Character,
// native solid floor and actual emitted projectile collision. No renderer or
// retail parity is implied by these numerical trajectory assertions.
let compiled;
async function scene(weapon, pitch) {
  const f = await (compiled ||= fixture({ productionComposition:true, includeCharacter:true, fullRuntime:true,
    extraExports:"export { computeShotGuide } from './patches/splatoon3/runtime/weapons-fidelity.mjs';" }));
  const {G,THREE}=f;
  G.scene=new THREE.Scene();G.boss=null;G.netm=null;G.audio={play(){},loop(){return{set(){},stop(){}};}};G.fx={muzzle(){},burst(){}};
  G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-80,0,0],[80,0,0]],spawnBarrier:0,
    single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}],half:[]});
  G.physics=new f.Physics(G.level);G.projectiles=new f.Projectiles(G.scene);G.paint={sample:()=>1,splat:()=>0};
  const a=new f.Actor({team:0,name:'projection',weapon,CharacterClass:f.Character});
  a.pos.set(0,0,0);a.yaw=a.aimYaw=0;a.aimPitch=pitch;a.aimDir.set(0,Math.sin(pitch),Math.cos(pitch));a.form='kid';a.grounded=true;a.vel.set(0,0,0);
  const cam=G.camera=new THREE.PerspectiveCamera(60,16/9,.1,400);
  cam.position.set(-.28,2-4.5*Math.sin(pitch),-4.5*Math.cos(pitch));
  cam.lookAt(cam.position.clone().add(a.aimDir));cam.updateMatrixWorld(true);G.rig={gameCam:cam};
  G.actors=[a];const controller=new f.PlayerController(a,null,null);controller.computeAim();
  for(let n=0;n<45;n++)a.character.update(1/60,{form:'kid',grounded:true,firing:false,charge:0,aimPitch:pitch,speed:0,localMove:{x:0,z:0},ink:1,hp:1,vy:0});
  a.character.wAim=1;a.character.root.updateMatrixWorld(true);controller.computeAim();
  return {f,a,G,controller,ps:G.projectiles};
}

function firstHeadContact(s,hand=0,hz=60) {
  const {f,a,ps,G}=s;
  f.setRandom(()=>.5);
  try {
    if(a.weapon.kind==='dualies')ps.fireDualies(a,a.weapon,0,hand);else ps.fireShooter(a,a.weapon,0);
  } finally {f.restoreRandom();}
  const head=ps.list.at(-1);assert.ok(head?.inkProfile,'test executes the canonical emitted head');
  let contact=null,frame=0;
  const world=ps.inkFlight.world;
  ps.inkFlight.world=function(from,to,radius,hit){const result=world.call(this,from,to,radius,hit);if(result.hit&&!contact)contact=result.point.clone();return result;};
  try {while(!contact&&frame++<hz*3){ps._step(head,1/hz);G.time+=1/hz;}}finally{ps.inkFlight.world=world;}
  assert.ok(contact,'real head hits the physical floor');return {point:contact,frame:head.inkFrame};
}

test('Shooter and each Dualies guide stop at the actual downward head contact before the nominal frame',async()=>{
  for(const weapon of ['shooter','dualies'])for(const pitch of [-.45,-.8,-1.05]){
    const s=await scene(weapon,pitch),{f,a,ps}=s;
    const before={ink:a.ink,list:ps.list.length,time:s.G.time};let draws=0;
    f.setRandom(()=>{draws++;return .5;});
    const guides=weapon==='dualies'?ps.s3DualiesGuides(a,a.weapon).map(p=>p.clone()):[new f.THREE.Vector3().copy(f.computeShotGuide(a))];
    f.restoreRandom();assert.equal(draws,0);assert.equal(a.ink,before.ink);assert.equal(ps.list.length,before.list);assert.equal(s.G.time,before.time);
    for(let hand=0;hand<guides.length;hand++)for(const hz of [30,60,120]){
      const actual=firstHeadContact(s,hand,hz);
      assert.ok(actual.frame<=a.weapon.shotGuideFrame,`${weapon} ${pitch} hit lies inside the guide envelope`);
      assert.ok(guides[hand].distanceTo(actual.point)<1e-8,`${weapon} hand ${hand}: predicted ${guides[hand].toArray()} actual ${actual.point.toArray()}`);
      assert.ok(Math.abs(guides[hand].y)<1e-8,'guide lies on the solid field, never below it');
    }
  }
});

test('Shooter full-flight contact remains available without inventing an inner-marker age cutoff',async()=>{
  const s=await scene('shooter',0),{a,ps}=s;
  const impact=ps.s3ShooterImpact(a,a.weapon),actual=firstHeadContact(s);
  assert.ok(impact);assert.ok(impact.point.distanceTo(actual.point)<1e-8);
  assert.ok(impact.guideFrame>a.weapon.shotGuideFrame,'floor is reached after the aiming envelope');
  const marker=ps.muzzleBlockFeedback(a);
  assert.ok(marker?.point.distanceTo(impact.point)<1e-8,'preserve full-flight marker admission pending original UI evidence');
});

test('Dualies contact cache observes notified in-place floor geometry changes',async()=>{
  const s=await scene('dualies',-.8),{a,ps,G}=s;
  const first=ps.s3DualiesGuides(a,a.weapon).map(p=>p.clone());
  const floor=G.level.blocks[0];floor.center.y=-2;floor.aabbMin.y-=1.75;floor.aabbMax.y-=1.75;
  G.level.markCollisionChanged();
  const changed=ps.s3DualiesGuides(a,a.weapon);
  assert.ok(changed.every((p,i)=>p.distanceTo(first[i])>.5),'both hand contacts react to the changed field');
  assert.ok(changed.every(p=>Math.abs(p.y+1.75)<1e-8),'both guides remain on the new physical floor surface');
});

test('moving Shooter prediction uses the actual spawn-velocity addition and invalidates same-pose cache',async()=>{
  const s=await scene('shooter',-.45),{f,a,ps}=s;
  const stationary=ps.s3ShooterImpact(a,a.weapon).point.clone();a.vel.z=4;
  const moving=ps.s3ShooterImpact(a,a.weapon).point.clone();
  assert.ok(moving.distanceTo(stationary)>.05,'velocity change invalidates without moving the muzzle or advancing time');
  const guide=new f.THREE.Vector3().copy(f.computeShotGuide(a)),actual=firstHeadContact(s);
  assert.ok(moving.distanceTo(actual.point)<1e-8);assert.ok(guide.distanceTo(actual.point)<1e-8);
});
