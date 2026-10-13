import test from 'node:test';
import { fixture } from './source-fixture.mjs';
import { realCharacter } from './real-character-fixture.mjs';

test('DIAGNOSTIC rolling grip clearance (non-gating; remove before merge)',async()=>{
  const f=await fixture(),{Character,THREE}=await realCharacter();
  const a=new f.Actor({team:0,name:'grip diagnostic',weapon:'roller',CharacterClass:Character});
  const c=a.character,r=a.weaponRunner;c.actor=a;
  a.intent.move.set(0,0,1);a.grounded=true; c.tr.fill(99);
  const s={form:'kid',grounded:true,speed:0,vy:0,firing:false,rolling:false,localMove:{x:0,z:0}};
  for(let n=0;n<90;n++)c.update(1/30,s);
  c.fidget=-1;c.idleT=0;c.shufT=99;
  r.reset();c.tr.fill(99);
  a.grounded=true;r.update(1/30,{fire:true,firePressed:true});
  let maxL=0,maxR=0,maxPen=0;
  for(let n=0;n<80;n++){
    if(n)r.update(1/30,{fire:false});
    s.rolling=r.rolling;s.firing=false;s.speed=2;s.localMove={x:0,z:1};
    c.root.position.z+=s.speed/30;a.pos.copy(c.root.position);a.vel.z=s.speed;
    c.update(1/30,s);c.root.updateMatrixWorld(true);
    const w=c.weapon,d=w.def;
    const l=w.off.localToWorld(d.handL.pos.clone()),right=w.off.localToWorld(d.handR.pos.clone());
    const handL=c.bones.handL.getWorldPosition(new THREE.Vector3()),handR=c.bones.handR.getWorldPosition(new THREE.Vector3());
    const shoulderL=c.bones.uArmL.getWorldPosition(new THREE.Vector3()),shoulderR=c.bones.uArmR.getWorldPosition(new THREE.Vector3());
    const errL=l.distanceTo(handL),errR=right.distanceTo(handR), reachL=l.distanceTo(shoulderL),reachR=right.distanceTo(shoulderR);
    let bottom=Infinity;const vec=new THREE.Vector3();
    w.drum.traverse(m=>{if(!m.isMesh||!m.visible)return;const p=m.geometry.attributes.position,idx=m.geometry.index;for(let k=0;k<(idx?.count??p.count);k++){vec.fromBufferAttribute(p,idx?idx.getX(k):k).applyMatrix4(m.matrixWorld);bottom=Math.min(bottom,vec.y);}});
    maxL=Math.max(maxL,errL);maxR=Math.max(maxR,errR);maxPen=Math.max(maxPen,-bottom);
    if((errL>.008||errR>.005||bottom<-.006)&&n<36)
      console.log('REACH',JSON.stringify({n,roll:r.rolling,swing:!!c.s3RollerFlick,gripL:errL,gripR:errR,reachL,reachR,limL:c.limbs.armL.a+c.limbs.armL.b,limR:c.limbs.armR.a+c.limbs.armR.b,bottom,ANC:Array.from(c.P.slice(0,0)),targetL:l.toArray(),targetR:right.toArray(),shoulderL:shoulderL.toArray(),shoulderR:shoulderR.toArray()}));
  }
  console.log('REACH_SUMMARY',JSON.stringify({maxL,maxR,maxPen}));
  c.dispose();
});
