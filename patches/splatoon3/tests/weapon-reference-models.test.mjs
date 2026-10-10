import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { nativeWeaponPoseRequired } from '../runtime/source-weapon-owner.mjs';

let loaded;
const production=()=>loaded??=fixture({fullRuntime:true,includeCharacter:true,productionComposition:true,
  extraExports:"export { getWeaponDef, WEAPON_KINDS } from './inkwave-public/src/game/character-weapons.js';"});
function finiteGeometry(g,label){
  assert.ok(g?.index?.count>0,label+' indexed');
  for(const k of ['position','normal','color','aMat'])assert.ok(g.attributes[k],label+' '+k);
  for(const a of Object.values(g.attributes))assert.ok([...a.array].every(Number.isFinite),label+' finite');
  g.computeBoundingBox();assert.ok(g.boundingBox.min.toArray().every(Number.isFinite));
  for(const n of g.index.array)assert.ok(n<g.attributes.position.count,label+' valid index');
}
test('seven production base models preserve grip, animated-part and LOD contracts',async()=>{
  const f=await production();assert.equal(f.WEAPON_KINDS.length,7);
  for(const kind of f.WEAPON_KINDS){
    const d=f.getWeaponDef(kind);assert.ok(d.referenceWeapon,kind+' reference identity');
    for(const k of ['body','ink','bodyStatic','inkStatic'])finiteGeometry(d[k],kind+'.'+k);
    for(const p of Object.values(d.parts))finiteGeometry(p.geo,kind+'.part');
    for(const k of ['handR','handL']){
      assert.ok(d[k].pos.toArray().every(Number.isFinite));assert.ok(Math.abs(d[k].quat.length()-1)<1e-6);
    }
    const m=new f.THREE.Matrix4().compose(d.handR.pos,d.handR.quat,new f.THREE.Vector3(1,1,1))
      .multiply(new f.THREE.Matrix4().compose(d.inHand.pos,d.inHand.quat,new f.THREE.Vector3(1,1,1)));
    assert.ok(m.elements.every((n,i)=>Math.abs(n-(i%5===0?1:0))<1e-6),kind+' attachment roundtrip');
    assert.equal(f.getWeaponDef(kind),d,'geometry is cached per kind');
  }
  const c=f.getWeaponDef('charger');c.parts.lens.geo.computeBoundingBox();
  assert.equal(c.parts.lens.geo.boundingBox.min.distanceTo(c.parts.lens.geo.boundingBox.max),0,'unscoped kit has no visible scope');
  const b=f.getWeaponDef('blaster');assert.ok(b.parts.front.geo.attributes.position.count>100);
  const r=f.getWeaponDef('roller');assert.ok(r.parts.hinge&&r.parts.hingeInk&&r.drum,'fold and drum retained');
});
test('actual Actor/Runner attacks retain finite poses and authored grip contact on the replacement models',async()=>{
  const f=await production(),{G,THREE}=f;G.scene=new THREE.Scene();
  G.physics=new f.Physics(G.level);G.level.queryBlocks=(_a,_b,_c,_d,out)=>{out.length=0;return out;};
  G.projectiles=Object.fromEntries(['fireShooter','fireDualies','fireBlaster','fireSlosh','fireFlick','fireCharger','fireSplatling','throwBomb'].map(n=>[n,()=>{}]));
  for(const kind of f.WEAPON_KINDS){
    const a=new f.Actor({team:0,weapon:kind,CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
    const ch=a.character;ch.actor=a;ch.onEvent=null;a.grounded=a.ground.hit=true;G.actors=[a];G.scene.add(ch.root);
    if(kind==='blaster'){
      assert.equal(ch.weapon.muzzle.parent,ch.weapon.parts.front);
      const p=ch.weapon.muzzle.position.clone().add(ch.weapon.parts.front.position);
      assert.ok(p.distanceTo(ch.weapon.def.muzzle)<1e-9,'front muzzle at exact native rest socket');
    }
    for(let n=0;n<210;n++){
      const input={fire:n>=60&&n<150,sub:n>=180&&n<190};a.intent.fire=input.fire;a.intent.sub=input.sub;a.ink=100;
      a.grounded=n<110||n>=125;a.aimPitch=n>=110&&n<125?.8:0;
      G.time+=1/60;a.weaponRunner.update(1/60,input);a._finishFrame(1/60);ch.root.updateMatrixWorld(true);
      assert.ok([...ch.P].every(Number.isFinite),kind+' finite pose');assert.ok(ch.getMuzzle(new THREE.Vector3()).toArray().every(Number.isFinite));
      if(!ch.dual&&ch.P[f.CHARACTER_CHANNELS.IKL]>.99&&ch.P[f.CHARACTER_CHANNELS.LTW]<.001){
        const p=ch.weapon.off.localToWorld(ch.weapon.def.handL.pos.clone());
        assert.ok(p.distanceTo(ch.bones.handL.getWorldPosition(new THREE.Vector3()))<.006,kind+' support grip');
      }
    }
    a.weaponRunner.reset();ch.setVisible(false);ch.setVisible(true);ch.setWeapon('shooter');ch.dispose();G.scene.remove(ch.root);
  }
});
test('legacy locomotion yields upper-body ownership to current attack, charge, throw and Dualies states',()=>{
  const ch={weaponKind:'shooter',lastShot:99,lastRelease:99,wSub:0,bombSwap:0,lockW:0,
    _runner(){return this.runner;},_owner(){return this.actor;},runner:{slosh:-1,flick:-1},actor:{alive:true}};
  assert.equal(nativeWeaponPoseRequired(ch,{}),false);
  ch.actor.intent={fire:true};assert.equal(nativeWeaponPoseRequired(ch,{}),true);delete ch.actor.intent;
  assert.equal(nativeWeaponPoseRequired(ch,{firing:true}),true);
  ch.lastShot=.04;assert.equal(nativeWeaponPoseRequired(ch,{}),true);ch.lastShot=99;
  ch.runner.s3BlasterWindup=.1;assert.equal(nativeWeaponPoseRequired(ch,{}),true);delete ch.runner.s3BlasterWindup;
  ch.weaponKind='charger';ch.lastRelease=.2;assert.equal(nativeWeaponPoseRequired(ch,{}),true);ch.lastRelease=99;
  ch.runner.charging=true;assert.equal(nativeWeaponPoseRequired(ch,{}),true);ch.runner.charging=false;
  ch.wSub=.2;assert.equal(nativeWeaponPoseRequired(ch,{}),true);ch.wSub=0;
  ch.dual=true;assert.equal(nativeWeaponPoseRequired(ch,{}),true);ch.dual=false;
  ch.actor.specialActive={id:'inkvac'};assert.equal(nativeWeaponPoseRequired(ch,{}),true);
});
