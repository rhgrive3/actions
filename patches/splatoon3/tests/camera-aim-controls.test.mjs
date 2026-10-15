import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';
import { adaptCameraAimControls } from '../camera-aim-controls-adapter.mjs';
import { simulateMatchInterval } from '../runtime/turf-finish.mjs';

const close = (x, y, eps = 1e-9) => assert.ok(Math.abs(x - y) <= eps, `${x} != ${y}`);
async function world(weapon = 'shooter') {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true,
    extraExports: "export * from './patches/splatoon3/runtime/camera-aim-controls.mjs';" });
  const a = f.make(weapon);
  f.G.settings = { aimAssist: 0, sensitivity: 1, padSensitivity: 0, gyro: false };
  f.G.physics.cameraProbe = (_o, _d, want, _r, out) => Object.assign(out, { hard: want, soft: want, floor: false });
  const cam = new f.THREE.PerspectiveCamera(55, 16 / 9, .15, 1000);
  const rig = f.G.rig = new f.CameraRig(cam); f.G.camera = cam;
  rig.follow(a, true); rig._prevMode = 'follow'; rig.pitch = 0; rig.update(1 / 60);
  const pressed = new Set(), padPressed = new Set(), keys = new Set();
  const input = { lastDevice: 'kbm', mouse: { dx: 0, dy: 0 }, pressed, padPressed, _padEpoch: 0,
    down: key => keys.has(key), wasPressed: key => pressed.has(key),
    padButton: () => false, padValue: () => 0, padAxis: () => 0,
    padStick: (_x, _y, out) => Object.assign(out, { x: 0, y: 0, mag: 0 }) };
  const controller = new f.PlayerController(a, rig, input);
  return { ...f, a, cam, rig, controller, input, keys };
}

test('exact look integral: start/hold/stop agrees at 30/60/120Hz', async () => {
  const f = await world();
  const values = [];
  for (const hz of [30, 60, 120]) {
    const state = { x: 0 }; let angle = 0;
    for (let i = 0; i < hz * 2; i++) angle += f.integrateLookAxis(state, 'x', i < hz ? 1 : 0, 1 / hz);
    close(angle, 1); values.push(angle);
  }
  close(Math.max(...values) - Math.min(...values), 0);
});

test('look integrator rejects invalid time/input without poisoning future input', async () => {
  const f = await world(), state = { x: NaN };
  for (const dt of [NaN, Infinity, -1, 0]) assert.equal(f.integrateLookAxis(state, 'x', 1, dt), 0);
  close(f.integrateLookAxis(state, 'x', NaN, 1 / 60), 0);
  assert.ok(Number.isFinite(state.x));
});

test('full production: every unscoped charging family keeps the normal FOV', async () => {
  const f = await world();
  for (const id of ['charger', 'splatling', 's3-charger-long', 's3-charger-pencil']) {
    const a = f.make(id); a.weaponRunner.charging = true; a.weaponRunner.charge = 1;
    f.rig.follow(a, true); f.rig.zoom = 20;
    f.rig.update(1 / 60);
    close(f.rig.zoom, 0); close(f.cam.fov, 55);
  }
});

test('catalog scopes are recognized from sparse source capability; E-liter uses CameraFovy=20', async () => {
  const f = await world('s3-charger-longscope');
  assert.equal(f.a.weapon.scopedCharge, true);
  assert.equal(f.isScopedCharger(f.WEAPONS['s3-charger-normalscope']), true);
  assert.equal(f.scopeVerticalFov(f.a.weapon), 20);
  f.a.weaponRunner.charging = true; f.a.weaponRunner.charge = 1;
  for (let i = 0; i < 300; i++) f.rig.update(1 / 60);
  close(f.cam.fov, 20, 1e-9);
  f.a.weaponRunner.charging = false;
  for (let i = 0; i < 300; i++) f.rig.update(1 / 60);
  close(f.cam.fov, 55, 1e-9);
});

test('scope zoom has no charge=0.99 discontinuity and resets on squid/weapon change', async () => {
  const f = await world('s3-charger-longscope'); f.a.weaponRunner.charging = true;
  const values = [];
  for (const charge of [.98999, .99, .99001]) {
    const mock = { zoom: 0 }; f.a.weaponRunner.charge = charge;
    f.updateScopeZoom(mock, f.a, 1); values.push(mock.zoom);
  }
  assert.ok(values[2] - values[0] < .001);
  f.rig.zoom = 20; f.a.form = 'squid'; f.rig.update(1 / 60); close(f.rig.zoom, 0);
});

test('hard boom collision never allows the old 1.6m penetration or a 0.45m minimum through a wall', async () => {
  const f = await world();
  for (const hard of [2, .1, 0]) {
    f.rig.boom.reset(4.5); f.rig._inkwaveCameraProbeCache = null;
    f.G.physics.cameraProbe = (_o, _d, _w, _r, out) => Object.assign(out, { hard, soft: hard, floor: false });
    f.rig.update(1 / 60);
    assert.ok(f.rig.curDist <= hard + 1e-12, `${f.rig.curDist} > ${hard}`);
    assert.ok(Number.isFinite(f.cam.position.length()));
  }
});

test('final lens sweep constrains shoulder/shake and the visible near-plane corners', async () => {
  const f = await world();
  f.rig.pivot.set(0, 1.85, 0); f.cam.position.set(.4, 2, -4.5); f.cam.lookAt(.4, 2, 10);
  // Real rectangular wall via native Physics, not an alternate ray solver.
  const V = f.THREE.Vector3;
  const block = { id: 0, solid: true, grate: false, center: new V(0, 2, -2), half: new V(2, 2, .1),
    axes: [new V(1,0,0),new V(0,1,0),new V(0,0,1)], faces: [-1,-1,-1,-1,-1,-1] };
  const level = { blocks: [block], faces: [], queryBlocks: (_a,_b,_c,_d,out) => { out.length=0;out.push(0);return out; } };
  const physics = new f.Physics(level);
  f.constrainCameraLens(f.rig, physics, 55);
  assert.ok(f.cam.position.z > -1.9, `lens behind wall: ${f.cam.position.z}`);
  assert.ok(f.rig.cameraClearanceCorrection > 2);
  const lens = f.cam.position.clone(); f.constrainCameraLens(f.rig, physics, 55);
  assert.ok(lens.distanceTo(f.cam.position) < 1e-9, 'second application must not drift');
});

test('current tick input reaches world aim before actor/weapon simulation; rendered camera is not mutated', async () => {
  const f = await world();
  const beforePosition = f.rig.gameCam.position.clone(), beforeQuaternion = f.rig.gameCam.quaternion.clone();
  const rays = [];
  const raycast = f.G.physics.raycast;
  f.G.physics.raycast = (o,d,l,h,...rest) => { if (l===70) rays.push(d.clone()); return raycast(o,d,l,h,...rest); };
  const match = { paused: false, state:'playing', time:180, mode:'turf', controller:f.controller,
    updateController() { f.rig.yaw += .4; f.a.aimYaw = f.rig.yaw; f.a.aimDir.set(Math.sin(f.rig.yaw),0,Math.cos(f.rig.yaw)); },
    update() { assert.ok(rays.length); close(rays.at(-1).x, Math.sin(f.rig.yaw)); } };
  const original = f.G.projectiles.update; f.G.projectiles.update = () => {};
  simulateMatchInterval(match, 1/60, f.G); simulateMatchInterval(match, 1/60, f.G);
  f.G.projectiles.update = original;
  close(beforePosition.distanceTo(f.rig.gameCam.position), 0);
  close(beforeQuaternion.angleTo(f.rig.gameCam.quaternion), 0);
});

test('no simulation input delta preserves the rendered recoil ray exactly', async () => {
  const f = await world();f.rig.recoil(.02);f.rig.addShake(.3);f.rig.update(1/60);
  const ray = f.rig.gameCam.getWorldDirection(new f.THREE.Vector3());
  const simulated = f.simulationAimCamera(f.controller).getWorldDirection(new f.THREE.Vector3());
  close(ray.distanceTo(simulated), 0);
});

test('near muzzle parallax converges at positive targets; zero/behind targets never reverse a shot', async () => {
  const f = await world(), V=f.THREE.Vector3, p=f.G.projectiles;
  f.a.aimDir.set(0,0,1);
  const muzzle = new V(.3,1.05,.3), target = new V(0,1.05,1), expected=target.clone().sub(muzzle).normalize();
  close(p._aimFrom(f.a,muzzle,new V(),target).distanceTo(expected),0);
  for (const t of [muzzle.clone(),new V(.3,1.05,.1)]) close(p._aimFrom(f.a,muzzle,new V(),t).distanceTo(f.a.aimDir),0);
});

test('invalid and occluded muzzle fallback remains in front of a thin close wall', async () => {
  const f = await world(), V=f.THREE.Vector3;
  f.a.aimDir.set(0,0,1);
  f.a.character.getMuzzle = out => out.set(0,Infinity,1);
  f.G.physics.los = () => false;
  f.G.physics.raycast=(o,d,l,h)=>{h.hit=d.z>0&&o.z<=.1&&o.z+d.z*l>=.1;h.dist=h.hit?(.1-o.z)/d.z:l;return h;};
  const out=f.G.projectiles._muzzle(f.a,new V());
  assert.ok(Number.isFinite(out.length()));assert.ok(out.z<=.08+1e-12);
});

test('rendered and gameplay projection matrices agree exactly at all tested aspect ratios', async () => {
  const f = await world();
  for (const aspect of [16/9,4/3,21/9,9/16]) {
    f.cam.aspect=aspect;
    for(let i=0;i<9;i++){f.rig.fovKick=.009-i*.0001;f.rig.update(1/120);
      assert.deepEqual(Array.from(f.cam.projectionMatrix.elements),Array.from(f.rig.gameCam.projectionMatrix.elements));}
  }
});

test('mouse displacement is not multiplied by dt; stick traces agree across direct 30/60/120 updates', async () => {
  const f=await world();
  f.input.mouse.dx=100;f.controller.update(1/120);close(f.rig.yaw,-.21);
  f.input.mouse.dx=0;f.controller.update(1/120);close(f.rig.yaw,-.21);
  const values=[];
  for(const hz of [30,60,120]){
    f.rig.yaw=0;f.rig.pitch=0;f.controller.padLook.x=f.controller.padLook.y=0;
    f.input.lastDevice='pad';f.input.pad={connected:true,mapping:'standard',index:0};
    f.input.padStick=(x,_y,o)=>Object.assign(o,x===2?{x:1,y:0,mag:1}:{x:0,y:0,mag:0});
    for(let i=0;i<hz;i++)f.controller.update(1/hz);
    values.push(f.rig.yaw);
  }
  close(Math.max(...values)-Math.min(...values),0);
});

test('camera final pass fails closed on incompatible/duplicate upstream anchors', () => {
  assert.throws(()=>adaptCameraAimControls('src/game/player.js',''),/missing/);
  assert.equal(adaptCameraAimControls('src/game/actor.js','unchanged'),'unchanged');
  const s=fs.readFileSync(new URL('../../../scripts/inkwave-source-composition.mjs',import.meta.url),'utf8');
  const range=s.indexOf('code = adaptRange');
  const visuals=s.indexOf('code = adaptProjectileVisuals');
  const camera=s.indexOf('return adaptCameraAimControls');
  assert.ok(range>=0&&visuals>range,'VFX observes the composed range and gameplay adapters');
  assert.ok(camera>visuals,'the fail-closed camera and aim pass remains terminal after presentation VFX');
  assert.equal((s.match(/return adaptCameraAimControls\(/g)||[]).length,1,
    'one terminal camera composition owns its fail-closed anchor');
});

test('same-tick optical origin cannot rotate through a nearby wall before the render step',async()=>{
 const f=await world(),V=f.THREE.Vector3;
 const block={id:0,solid:true,grate:false,center:new V(-2,2,0),half:new V(.1,2,2),
  axes:[new V(1,0,0),new V(0,1,0),new V(0,0,1)],faces:[-1,-1,-1,-1,-1,-1]};
 const physics=new f.Physics({blocks:[block],faces:[],queryBlocks(_a,_b,_c,_d,out){out.length=0;out.push(0);return out;}});
 f.rig.yaw=Math.PI/2;
 const position=f.rig.gameCam.position.clone(),quat=f.rig.gameCam.quaternion.clone();
 const sim=f.simulationAimCamera(f.controller,physics);
 assert.ok(sim.position.x>-1.9,`simulation lens behind wall: ${sim.position.x}`);
 close(position.distanceTo(f.rig.gameCam.position),0);close(quat.angleTo(f.rig.gameCam.quaternion),0);
});

test('follow transitions stay finite for jump, swim, wall, roll and scoped charge at each render cadence',async()=>{
 const f=await world('s3-charger-longscope');
 for(const hz of [30,60,120]){
  f.rig.follow(f.a,true);f.rig._prevMode='follow';f.rig.yaw=0;f.rig.pitch=.2;
  for(let i=0;i<hz*2;i++){
   const t=i/hz,phase=Math.floor(t*3)%6;f.a.pos.set(Math.sin(t)*2,phase===2||phase===3?Math.sin(t)*2:0,t*2);
   f.a.smoothY=f.a.pos.y;f.a.vel.set(Math.cos(t)*2,phase===2?3:0,2);f.a.grounded=phase!==2&&phase!==3;
   f.a.form=phase===1||phase===3?'squid':'kid';f.a.anim.form=phase===3?'climb':phase===1?'swim':'kid';
   f.a.weaponRunner.charging=phase===5;f.a.weaponRunner.charge=phase===5?.75:0;
   f.a.rollT=phase===4?.1:0;f.rig.update(1/hz);f.controller.computeAim(true);
   assert.ok([...f.cam.position.toArray(),...f.cam.quaternion.toArray(),f.cam.fov,...f.a.aimPoint.toArray()].every(Number.isFinite));
   assert.ok(f.cam.fov>0&&f.cam.fov<180);
  }
 }
});
