import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './weapon-edgecases-fixture.mjs';
async function setup(weapon='shooter',wallDistance=null){
 const f=await fixture(),a=f.make(weapon),e=f.make();
 e.team=1;e.pos.set(.2,0,8);f.G.actors=[];f.G.settings={aimAssist:0};
 const cam=new f.THREE.PerspectiveCamera(60,16/9,.1,1000);
 cam.position.set(0,1.05,-4);cam.lookAt(0,1.05,20);cam.updateMatrixWorld();
 f.G.camera=cam;f.G.rig={gameCam:cam,yaw:0,pitch:0};
 f.G.physics.raycast=(start,dir,range,h)=>{h.hit=wallDistance!==null;h.dist=wallDistance??range;if(h.hit)h.point.copy(start).addScaledVector(dir,h.dist);return h;};
 const c=new f.PlayerController(a,f.G.rig,{}),p=new f.Projectiles(new f.THREE.Scene());f.G.projectiles=p;return {...f,a,e,c,p};
}
test('#413 inserting a reticle target never mutates world aim or any shared pre-spread launch direction',async()=>{for(const weapon of ['shooter','dualies','splatling','blaster','charger','roller','slosher']){const f=await setup(weapon);f.c.computeAim();const before=f.a.aimPoint.clone(),muzzle=new f.THREE.Vector3(.25,1.05,.3),direction=f.p._aimFrom(f.a,muzzle,new f.THREE.Vector3()).clone();f.G.actors=[f.e];f.c.computeAim();assert.equal(f.c.onTarget,f.e);assert.ok(f.a.aimPoint.distanceTo(before)<1e-12);assert.ok(f.p._aimFrom(f.a,muzzle,new f.THREE.Vector3()).distanceTo(direction)<1e-12);}});
test('#413 actual zero-spread shooter launch is unchanged by target insertion',async()=>{const f=await setup();f.setRandom(()=>.5);f.c.computeAim();f.p.fireShooter(f.a,f.a.weapon,0);const before=f.p.list.at(-1)?.vel.clone();assert.ok(before);f.G.actors=[f.e];f.c.computeAim();f.p.fireShooter(f.a,f.a.weapon,0);assert.ok(f.p.list.at(-1).vel.distanceTo(before)<1e-12);});
test('#413 nearer world cover still owns the aim point and blocks reticle acquisition',async()=>{const f=await setup('shooter',3);f.G.actors=[f.e];f.c.computeAim();assert.equal(f.c.onTarget,null);assert.ok(Math.abs(f.a.aimPoint.z-3)<1e-9);});
