import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { installChargerSurface } from '../runtime/charger-surface.mjs';
const DT=1/60,near=(a,b,eps=1e-8)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);

test('#107: unscoped Charger charge keeps camera FOV and boom fixed', async () => {
  const f=await fixture(),a=f.make('charger'),camera=new f.THREE.PerspectiveCamera(60,16/9),rig=new f.CameraRig(camera);
  f.G.physics.cameraProbe=(_p,_b,d,_r,out)=>Object.assign(out,{soft:d,hard:d});f.G.settings={fov:82,cameraShake:0};
  rig.follow(a,true);for(let i=0;i<120;i++)rig.update(DT);const base=camera.fov,boom=rig.wantDist;
  for(const charge of [.3,.999,1]){a.weaponRunner.charging=true;a.weaponRunner.charge=charge;for(let i=0;i<90;i++)rig.update(DT);near(rig.zoom,0);near(camera.fov,base);near(rig.wantDist,boom);}
});

test('#122: current Charger fire wrapper blocks swim through14F and releases at15F', async () => {
  const f=await fixture(),a=f.make('charger'),ps=new f.Projectiles(new f.THREE.Scene());f.G.projectiles=ps;
  installChargerSurface(f);a.weapon.postShotSwimTime=.25;
  ps._muzzle=(_a,out)=>out.set(0,.8,0);ps._aimFrom=(_a,_m,out)=>out.set(0,0,1);
  ps.fireCharger(a,a.weapon,.3);a.intent.squid=true;a.intent.fire=false;
  for(let i=1;i<15;i++){f.tick(a);assert.equal(a.form,'kid',String(i));}
  f.tick(a);assert.equal(a.form,'squid');
});
