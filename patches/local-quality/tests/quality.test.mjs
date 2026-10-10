import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../adapter.mjs';
import { inkSlopeScale, INK_FILM_HEIGHT, onSupportPlane } from '../surface.mjs';
import { verticalSwingAngle, verticalSwingCorrection } from '../roller-motion.mjs';
import { preparePreviewRoot, clearPreviewRoot, guardPreview } from '../menu-preview.mjs';
import { rollerCurtainSources, bindRollerDrop } from '../roller-visual.mjs';

const ROOT = new URL('../../../', import.meta.url);
const read = rel => fs.readFileSync(new URL(rel, ROOT), 'utf8');
const compose = (rel, code = read('inkwave-public/' + rel)) =>
  adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))));

test('quality adapter composes after gameplay/touch/reliability without duplicate imports', () => {
  const gyro = compose('src/core/gyro.js');
  assert.equal((gyro.match(/installGyroQuality/g) || []).length, 2); // import + call
  assert.equal((gyro.match(/_permissionRequest/g) || []).length >= 3, true);
  const art = compose('src/ui/menu-art.js');
  assert.equal((art.match(/import \{ t as tr \}/g) || []).length, 1);
  assert.equal((art.match(/gyroTurnDeg, touchSensMul/g) || []).length, 1);
  assert.equal((art.match(/guardPreview/g) || []).length, 2);
  for (const rel of ['src/world/inkShading.js','src/world/levelMaterial.js','src/fx/fx.js','src/fx/fxHooks.js']) {
    const out = compose(rel);
    assert.notEqual(out, read('inkwave-public/' + rel));
  }
});

test('walk build-only transform uses scalar root speed through a reversal', () => {
  const raw = read('patches/splatoon3/runtime/walk.mjs');
  const out = adaptQualitySource('patches/splatoon3/runtime/walk.mjs', raw);
  assert.match(out, /w\.scalarSpeed=w\.rootMotionKnown/);
  assert.match(out, /const v=state\(this\)\.scalarSpeed\?\?this\.gv/);
  assert.throws(() => adaptQualitySource('patches/splatoon3/runtime/walk.mjs', out), /quality patch conflict/);
});

test('ink film slope is world-scaled and only the actual support plane is exempt', () => {
  for (const ppm of [8, 12, 20, 30]) {
    const gradient = .5 / ppm;
    assert.ok(Math.abs(gradient * 1.9 * inkSlopeScale(ppm) - .5 * INK_FILM_HEIGHT) < 1e-12);
  }
  const n = { x:0, y:Math.SQRT1_2, z:-Math.SQRT1_2 }, feet = { x:0, y:2, z:0 };
  assert.equal(onSupportPlane({x:0,y:3,z:1}, n, feet, n), true);
  assert.equal(onSupportPlane({x:0,y:3.2,z:1}, n, feet, n), false);
});

test('vertical roller correction keeps a continuous non-zero release velocity', () => {
  const w = 26/60, interval = 47/60, h = 1e-6;
  const left = (verticalSwingAngle(w,w) - verticalSwingAngle(w-h,w)) / h;
  const right = (verticalSwingAngle(w+h,w) - verticalSwingAngle(w,w)) / h;
  assert.ok(left > 10 && right > 10);
  assert.ok(Math.abs(left-right) < .02, `${left} ${right}`);
  assert.ok(Math.abs(verticalSwingAngle(w,w) + .04) < 1e-12);
  assert.ok(Number.isFinite(verticalSwingCorrection(w,w,interval)));
});

test('vertical roller curtain links only non-scoring visuals to fresh real projectiles', () => {
  const actor={weaponRunner:{s3FlickVertical:true}};
  const source={owner:actor,type:'drop',age:1/120,_qualityDead:false,_qualityGeneration:7,ghost:false};
  const G={projectiles:{list:[source,{owner:actor,type:'drop',age:.2,_qualityDead:false}]}};
  const fx={dCap:8,dA:new Float32Array(8*8)};
  const sources=rollerCurtainSources(G,actor,fx);
  assert.deepEqual(sources,[source]);
  assert.equal(bindRollerDrop(fx,2,source),true);
  assert.equal(fx._qualityDropSource[2],source);
  assert.equal(fx._qualityDropGeneration[2],7);
  fx.dA[3*8+7]=1;
  assert.equal(bindRollerDrop(fx,3,source),false);
});

test('offscreen menu preview stops only tick work and resumes before reveal', () => {
  let observer;
  class IO {
    constructor(cb, options) { this.cb=cb; this.options=options; this.targets=new Set(); observer=this; }
    observe(x){this.targets.add(x);} unobserve(x){this.targets.delete(x);} disconnect(){this.targets.clear();}
  }
  const root = {};
  preparePreviewRoot(root, { IntersectionObserver: IO });
  let ticks=0, sets=0;
  const el={ closest:()=>root };
  const preview=guardPreview({el,tick(dt){ticks+=dt;},set(){sets++;}});
  preview.tick(1);
  observer.cb([{target:el,isIntersecting:false,intersectionRect:{width:0,height:0}}]);
  for(let i=0;i<600;i++) preview.tick(1/60);
  preview.set();
  assert.equal(ticks,1); assert.equal(sets,1);
  observer.cb([{target:el,isIntersecting:true,intersectionRect:{width:300,height:180}}]);
  preview.tick(.02); assert.equal(ticks,1.02);
  clearPreviewRoot(root,true); assert.equal(observer.targets.size,0);
});

test('Android gyro never promotes raw rotationRate after calibration and stationary bias stays still', async () => {
  const raw = read('inkwave-public/src/core/gyro.js');
  const code = compose('src/core/gyro.js', raw);
  const context = vm.createContext({
    console,
    performance: { now: () => 1 },
    navigator: { userAgent: 'Android Chrome' },
    isSecureContext: true,
    DeviceOrientationEvent: function(){},
    DeviceMotionEvent: function(){},
    window: { DeviceOrientationEvent: function(){}, DeviceMotionEvent: function(){} },
    setTimeout, clearTimeout,
    addEventListener(){}, removeEventListener(){}, __angle:0,
  });
  const entry = new vm.SourceTextModule(code,{context,identifier:'src/core/gyro.js'});
  await entry.link(async spec => {
    if (spec === './device.js') return new vm.SourceTextModule('export function screenAngle(){return globalThis.__angle||0;}',{context,identifier:'src/core/device.js'});
    if (spec === '../../patches/local-quality/gyro.mjs') return new vm.SourceTextModule(read('patches/local-quality/gyro.mjs'),{context,identifier:'patches/local-quality/gyro.mjs'});
    if (spec === '../../patches/local-quality/screen-angle.mjs') return new vm.SourceTextModule(read('patches/local-quality/screen-angle.mjs'),{context,identifier:'patches/local-quality/screen-angle.mjs'});
    if (spec === './platform-lifecycle.mjs') return new vm.SourceTextModule(read('patches/local-quality/platform-lifecycle.mjs'),{context,identifier:'patches/local-quality/platform-lifecycle.mjs'});
    if (spec === './gyro-permission.mjs') return new vm.SourceTextModule(read('patches/local-quality/gyro-permission.mjs'),{context,identifier:'patches/local-quality/gyro-permission.mjs'});
    throw new Error('unexpected import '+spec);
  });
  await entry.evaluate();
  const g = new entry.namespace.Gyro(); g.start();
  let time=100,beta=25;
  const tick=(delta=0,bias=0)=>{
    time+=1000/60; beta+=delta;
    g._motion({timeStamp:time,rotationRate:{alpha:0,beta:delta*60+bias,gamma:0}});
    g._orientation({timeStamp:time,alpha:0,beta,gamma:0});
    return g.consume({});
  };
  for(let i=0;i<45;i++) tick(1);
  assert.equal(g._src,'ori');
  let yaw=0,pitch=0;
  for(let i=0;i<3600;i++){const d=tick(0,2);yaw+=d.yaw;pitch+=d.pitch;}
  assert.ok(Math.abs(yaw)<1e-9 && Math.abs(pitch)<1e-9, JSON.stringify({yaw,pitch}));
  g.dYaw=.5; g.dPitch=.2; context.__angle=90; const d=tick(35,2);
  assert.equal(d.yaw,0); assert.equal(d.pitch,0); assert.equal(g._src,'ori');
});


test('all exact-source verifiers recognize the local-quality identity namespace', () => {
  const expected = [
    ['scripts/check-inkwave-browser.mjs', /local-quality\//],
    ['scripts/check-inkwave-motion-catalog.mjs', /'local-quality': 'patches\/local-quality'/],
    ['scripts/check-inkwave-touch-layout-identity.mjs', /patches\/local-quality/],
    ['scripts/check-inkwave-flow-render.mjs', /key\.startsWith\('local-quality\/'\)/],
    ['scripts/check-inkwave-wall-render.mjs', /key\.startsWith\('local-quality\/'\)/],
  ];
  for (const [file, pattern] of expected) assert.match(read(file), pattern, file);
});
