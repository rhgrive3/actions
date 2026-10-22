import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

// Inkjet rounds travel from their launch point to the reticle point and burst
// at the 11.3.0 launcher range (WeaponSpJetpack MoveParam.Distance=30).
// Production composition and the real Projectiles stepper; collision is off
// so the measured course is the round's own flight.
const EXTRA=`export {INKJET_RANGE,INKJET_SPEED,inkjetLaunchDirection,inkjetLaunchOrigin} from './patches/splatoon3/runtime/all-specials.mjs';export {SPECIAL_DEVICES} from './patches/splatoon3/runtime/special-presentation.mjs';`;
async function setup(){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:EXTRA});
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  f.G.physics.raycast=(_o,_d,length,h)=>{h.hit=false;h.dist=length;return h;};
  return f;
}
function hovering(f,{aim,aimDir=[0,0,1]}){
  const a=f.make();
  a.weapon={...a.weapon,special:'inkjet',specialCost:100};a.special=100;a.alive=true;a.remote=false;a._resolve=()=>{};
  a.intent.fire=false;a.intent.sub=false;a.intent.jump=false;a.intent.squid=false;
  f.G.actors=[a];f.G.match={playing:()=>true};
  a._startSpecial();a._s3AllSpecialState.nextShot=0;
  a.pos.set(0,5,0);a.vel.set(0,0,0);f.G.level.groundHeight=()=>0;
  a.aimPoint.set(...aim);a.aimDir.set(...aimDir).normalize();
  return a;
}
function fire(f,a){
  const before=new Set(f.G.projectiles.list);
  a.intent.fire=true;a._updateSpecial(1/60);a.intent.fire=false;
  return f.G.projectiles.list.find(p=>p.s3AllSpecial==='inkjet'&&!before.has(p));
}
// Distance from point q to the segment a-b.
function segmentDistance(a,b,q){
  const ab=b.clone().sub(a),t=Math.max(0,Math.min(1,q.clone().sub(a).dot(ab)/Math.max(1e-12,ab.lengthSq())));
  return a.clone().addScaledVector(ab,t).distanceTo(q);
}
function fly(f,p,hz){
  const dt=1/hz,start=p.pos.clone();let closest=Infinity,burst=null;
  const blast=f.G.projectiles._blastBurst,target=p._target;
  f.G.projectiles._blastBurst=function(q,at,victim){if(q===p)burst=at.clone();return blast.call(this,q,at,victim);};
  try{
    for(let i=0;i<hz*3&&f.G.projectiles.list.includes(p);i++){
      const prev=p.pos.clone();f.G.projectiles.update(dt);
      if(target)closest=Math.min(closest,segmentDistance(prev,p.pos,target));
    }
  }finally{f.G.projectiles._blastBurst=blast;}
  return {start,closest,burst};
}

test('Inkjet round passes through the reticle point from a hovering launch at 30/60/120 Hz',async()=>{
  for(const hz of [30,60,120]){
    const f=await setup(),aim=[3,0,22],a=hovering(f,{aim,aimDir:[3,-6.05,22]});
    const p=fire(f,a);assert.ok(p,'Inkjet round launched');
    const mount=f.SPECIAL_DEVICES.inkjet.find(d=>d.aim).pos;
    assert.ok(Math.abs(p.start.x-mount[0])<1e-9&&Math.abs(p.start.z-mount[2])<1e-9&&Math.abs(p.start.y-a.pos.y-mount[1])<.2,'launch point is the held Inkjet cannon');
    p._target=new f.THREE.Vector3(...aim);
    const {closest}=fly(f,p,hz);
    assert.ok(closest<1e-6,`${hz} Hz: round reaches the reticle point (closest ${closest})`);
  }
});

test('Inkjet round bursts at the 30-unit launcher range when the reticle is farther',async()=>{
  for(const hz of [30,60,120]){
    const f=await setup(),a=hovering(f,{aim:[0,6.05,80]});
    assert.equal(f.INKJET_RANGE,30);
    const p=fire(f,a),{start,burst}=fly(f,p,hz);
    assert.ok(burst,`${hz} Hz: the round bursts in the air at range`);
    const travelled=burst.distanceTo(start);
    assert.ok(Math.abs(travelled-30)<=f.INKJET_SPEED/hz+1e-6,`${hz} Hz: burst at ${travelled} WU`);
    const aim=new f.THREE.Vector3(0,6.05,80),dir=aim.clone().sub(start).normalize();
    assert.ok(burst.distanceTo(start.clone().addScaledVector(dir,travelled))<1e-6,'a straight shot stays on the line to the reticle');
  }
});

test('Inkjet direction falls back to the camera ray when the reticle point is unusable',async()=>{
  const f=await setup(),V=f.THREE.Vector3,origin=new V(0,6.05,0);
  const actor=(aim,dir)=>({aimPoint:new V(...aim),aimDir:new V(...dir).normalize(),aimYaw:0});
  const near=(v,want,why)=>assert.ok(v.toArray().every((n,i)=>Math.abs(n-want[i])<1e-12),why+': '+v.toArray());
  near(f.inkjetLaunchDirection(actor([0,6.05,-10],[0,0,1]),origin,new V()),[0,0,1],'behind the view');
  near(f.inkjetLaunchDirection(actor([0,6.5,0.5],[1,0,0]),origin,new V()),[1,0,0],'inside the body');
  near(f.inkjetLaunchDirection(actor([NaN,0,0],[0,0,1]),origin,new V()),[0,0,1],'non-finite reticle');
  const d=f.inkjetLaunchDirection(actor([0,0,22],[0,-6.05,22]),origin,new V());
  assert.ok(Math.abs(d.x)<1e-12&&Math.abs(d.y/d.z+6.05/22)<1e-12,'reticle on the floor is aimed from the chest, not the feet');
});

test('Inkjet cannon mount follows the body yaw and falls back to the chest inside a wall',async()=>{
  const f=await setup(),V=f.THREE.Vector3,a=f.make(),mount=f.SPECIAL_DEVICES.inkjet.find(d=>d.aim).pos;
  a.pos.set(1,2,3);a.yaw=Math.PI/2;
  const rt={api:{G:f.G},v3:new V()};
  const o=f.inkjetLaunchOrigin(rt,a,new V());
  assert.ok(Math.abs(o.x-(1+mount[2]))<1e-9&&Math.abs(o.z-(3-mount[0]))<1e-9&&Math.abs(o.y-(2+mount[1]))<1e-9,'kid-space mount rotated by yaw: '+o.toArray());
  f.G.physics.los=()=>false;
  const chest=f.inkjetLaunchOrigin(rt,a,new V());
  assert.ok(chest.distanceTo(new V(1,3.05,3))<1e-9,'blocked mount uses the chest: '+chest.toArray());
});
