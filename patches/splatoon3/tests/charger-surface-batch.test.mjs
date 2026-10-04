import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {chargerLinePaint, mainPlayerRadius} from '../runtime/charger-surface.mjs';
import {FixedClock} from '../runtime/clock.mjs';
const DT=1/60,near=(a,b,eps=1e-8)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
function system(f){
 const ps=new f.Projectiles(new f.THREE.Scene());f.G.projectiles=ps;f.G.actors=[];
 ps._muzzle=(_a,out)=>out.set(0,.8,0);ps._aimFrom=(_a,_m,out)=>out.set(0,0,1);
 return ps;
}

test('#107: actual camera keeps unscoped FOV/boom fixed through charge, release and repeated charging',async()=>{
 const f=await fixture(),a=f.make('charger'),camera=new f.THREE.PerspectiveCamera(60,16/9),rig=new f.CameraRig(camera);
 f.G.physics.cameraProbe=(_p,_b,d,_r,out)=>Object.assign(out,{soft:d,hard:d});f.G.settings={fov:82,cameraShake:0};
 rig.follow(a,true);for(let i=0;i<120;i++)rig.update(DT);const base=camera.fov,boom=rig.wantDist;
 for(const c of [0,.3,.5,.999,1,0,1]){a.weaponRunner.charging=c>0;a.weaponRunner.charge=c;for(let i=0;i<90;i++)rig.update(DT);near(rig.zoom,0);near(camera.fov,base);near(rig.wantDist,boom);}
 a.weapon.kind='splatling';a.weaponRunner.charging=true;a.weaponRunner.charge=1;for(let i=0;i<180;i++)rig.update(DT);assert.ok(rig.zoom>13.99);
 a.weapon.kind='charger';a.weapon.scopedCharge=true;a.weaponRunner.charging=true;a.weaponRunner.charge=1;
 for(let i=0;i<180;i++)rig.update(DT);assert.ok(rig.zoom>13.99);assert.ok(rig.wantDist<boom-.59);
});

test('#107: unscoped charge leaves native camera collision, swim boom and user FOV alive',async()=>{
 const f=await fixture(),a=f.make('charger'),cam=new f.THREE.PerspectiveCamera(),rig=new f.CameraRig(cam);
 f.G.physics.cameraProbe=(_p,_b,_d,_r,out)=>Object.assign(out,{soft:2,hard:2});f.G.settings={fov:90};rig.follow(a,true);
 a.weaponRunner.charging=true;a.weaponRunner.charge=1;for(let i=0;i<180;i++)rig.update(DT);
 assert.ok(rig.curDist<2.01);near(rig.gameCam.fov,2*Math.atan(Math.tan(Math.PI/4)/(16/9))*180/Math.PI);near(cam.fov,2*Math.atan(Math.tan(Math.PI/4)/(16/9))*180/Math.PI,.003);
 a.form='squid';for(let i=0;i<180;i++)rig.update(DT);near(rig.wantDist,4.1,1e-6);
});

test('#122: partial/full real shots block swim through14F, allow15F without changing recharge or ink-lock values',async()=>{
 for(const charge of [.3,1]){
  const f=await fixture(),a=f.make('charger'),ps=system(f);a.weaponRunner.cooldown=.28;const recover=a.weapon.inkRecoverStop;
  ps.fireCharger(a,a.weapon,charge);a.intent.squid=true;a.intent.fire=false;
  for(let i=1;i<15;i++){f.tick(a);assert.equal(a.form,'kid',String(i));}
  f.tick(a);assert.equal(a.form,'squid');near(a.weapon.inkRecoverStop,recover);near(a.weaponRunner.cooldown,.28-15*DT);
 }
});

test('#122: swim lock is independent of lastFire, resets with lifecycle, and does not alter stored charge',async()=>{
 const f=await fixture(),a=f.make('charger'),ps=system(f);ps.fireCharger(a,a.weapon,.3);a.lastFire=99;a.intent.squid=true;
 f.tick(a,8);assert.equal(a.form,'kid');a.lastFire=0;f.tick(a,7);assert.equal(a.form,'squid');
 a.weaponRunner.reset();near(a.weaponRunner.s3ChargerSwimRemaining,0);
 a.form='kid';a.weaponRunner.charging=true;a.weaponRunner.charge=1;a._squidPressT=10;a._firePressT=0;
 f.tick(a);assert.equal(a.form,'squid');assert.equal(a.weaponRunner.s3Stored.charge,1);
});

test('#194: collision radius is axis distance plus actor radius once; Shooter anchor and source ratio retained',async()=>{
 const f=await fixture(),w=f.WEAPONS;near(w.charger.playerHitRadius/w.shooter.playerHitRadius,.125/.285);
 near(f.PLAYER.radius+w.shooter.playerHitRadius,f.PLAYER.radius*.95+.15);
 near(mainPlayerRadius({size:.15,s3Weapon:w.shooter},f.PLAYER),.131);
 const p=new f.THREE.Vector3(.515,.7,0),base=new f.THREE.Vector3();
 near(f.Physics.pointCapsuleDist(p,base,f.PLAYER.radius,f.PLAYER.height),.515);
});

test('#194: real partial/full Charger graze sweep is tighter than Shooter at mid-body and capsule caps',async()=>{
 for(const charge of [.3,1])for(const height of [.8,.05,1.4]){
  const f=await fixture(),a=f.make('charger'),ps=system(f),enemy=f.make();enemy.team=1;f.G.actors=[enemy];let hits=0;ps.applyHit=()=>hits++;
  ps._muzzle=(_a,out)=>out.set(0,height,0);
  const capY=Math.min(Math.max(height,f.PLAYER.radius),Math.max(f.PLAYER.radius,f.PLAYER.height-f.PLAYER.radius));
  const threshold=f.PLAYER.radius+a.weapon.playerHitRadius,dy=height-capY;
  assert.ok(Math.abs(dy)<threshold);
  // Resolve the exact native sampled sweep boundary rather than assume its
  // approximate closest-point result equals the ideal analytic capsule.
  const from=new f.THREE.Vector3(0,height,0),end=new f.THREE.Vector3(0,height,a.weapon.rangeMin+(a.weapon.rangeMax-a.weapon.rangeMin)*charge);
  let lo=0,hi=threshold;for(let i=0;i<40;i++){const mid=(lo+hi)/2;enemy.pos.set(mid,0,5);const result={};f.Physics.segmentCapsuleDist(from,end,enemy.pos,f.PLAYER.radius,f.PLAYER.height,result);if(result.dist<threshold)lo=mid;else hi=mid;}
  const x=(lo+hi)/2;
  for(const [off,expected]of [[-.004,1],[.004,0]]){enemy.pos.set(x+off,0,5);hits=0;ps.fireCharger(a,a.weapon,charge);assert.equal(hits,expected,`${charge}/${height}/${off}`);}
 }
 const f=await fixture(),a=f.make('charger'),ps=system(f),e=f.make();e.team=1;e.pos.set(.515,0,5);f.G.actors=[e];let hits=0;ps.applyHit=()=>hits++;ps.fireCharger(a,a.weapon,1);assert.equal(hits,0);
});

test('#194: full-charge piercing retains sorted recipients and world obstruction truncation',async()=>{
 const f=await fixture(),a=f.make('charger'),ps=system(f),e1=f.make(),e2=f.make();e1.team=e2.team=1;e1.pos.set(0,0,4);e2.pos.set(0,0,7);f.G.actors=[e2,e1];let hit=[];ps.applyHit=(_a,e)=>hit.push(e);
 ps.fireCharger(a,a.weapon,1);assert.deepEqual(hit,[e1,e2]);
 f.G.physics.raycast=(from,dir,_range,out)=>{out.hit=dir.z>.5;if(out.hit){out.dist=6;out.point.copy(from).addScaledVector(dir,6);out.normal.set(0,0,-1);}return out;};
 hit=[];ps.fireCharger(a,a.weapon,1);assert.deepEqual(hit,[e1]);
});

test('#279: real line-paint calls transfer2x width and varying aspect without changing damage/range/impact',async()=>{
 const f=await fixture(),a=f.make('charger'),ps=system(f),rows=[];
 f.G.physics.raycast=(from,dir,_range,out)=>{out.hit=dir.y<-.9;if(out.hit){out.point.copy(from).setY(0);out.normal.set(0,1,0);out.dist=from.y;}return out;};
 f.G.paint.splat=(p,r,_t,opt)=>{rows.push({r,opt,p:p.clone()});return 0;};
 let previous=0;
 for(const c of [0,.5,.999,1]){rows.length=0;ps.fireCharger(a,a.weapon,c);assert.ok(rows.length>0);const expected=chargerLinePaint(a.weapon,c);for(const row of rows){near(row.r,expected.radius);near(row.opt.stretchAmt,expected.stretchAmt);}assert.ok(rows[0].r>=previous);previous=rows[0].r;}
 near(chargerLinePaint(a.weapon,1).radius/chargerLinePaint(a.weapon,0).radius,2);
 near(chargerLinePaint(a.weapon,0).stretchAmt,2.5);near(chargerLinePaint(a.weapon,1).stretchAmt,0);
 near(a.weapon.damageMax,160);near(a.weapon.rangeMax,f.profile.weapons.charger.rangeMax);
});

test('#279: isolated actual CPU paint footprints widen at full charge with independently changing depth/width',async()=>{
 const f=await fixture(),w=f.WEAPONS.charger,extents=[];
 for(const c of [0,.5,.999,1]){
  const shape=chargerLinePaint(w,c),size=600,cell=.01,face={nu:size,nv:size,cu:cell,cv:cell,grid:0,turf:true};
  const paint=Object.create(f.PaintSystem.prototype);Object.assign(paint,{grid:new Uint8Array(size*size),dead:new Uint8Array(size*size),counts:[0,0],version:0});
  paint._cpuSplat(face,3,3,shape.radius,0,.25,0,1,shape.stretchAmt,0);
  let x0=size,x1=0,y0=size,y1=0;for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(paint.grid[y*size+x]){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  extents.push([(x1-x0+1)*cell,(y1-y0+1)*cell]);
 }
 near(extents[3][0]/extents[0][0],2,.04);assert.ok(extents[0][1]/extents[0][0]>extents[3][1]/extents[3][0]);
});

test('#122: fixed60Hz swim boundary is identical at30/60/120Hz rendering',async()=>{
 const rows=[];
 for(const hz of [30,60,120]){const f=await fixture(),a=f.make('charger'),ps=system(f),clock=new FixedClock(),trace=[];ps.fireCharger(a,a.weapon,1);a.intent.squid=true;
 for(let i=0;i<hz/2;i++)clock.advance(1/hz,dt=>{a.update(dt);trace.push(a.form);});rows.push(trace);}
 assert.deepEqual(rows[0],rows[1]);assert.deepEqual(rows[1],rows[2]);assert.equal(rows[0].findIndex(x=>x==='squid'),14);
});
