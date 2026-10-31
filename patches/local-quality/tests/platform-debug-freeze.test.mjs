import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { createPlatformSimulationDebt } from '../platform-simulation-debt.mjs';

// Actual emitted debug hooks, fixed clock, Actor/WeaponRunner/Projectiles and
// HUD interpolation. The scene, controller input and scheduler are controlled;
// this is no browser, physical-device, or Nintendo parity claim.
const compose = rel => adaptBuildSource(rel, fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8'));
const main = compose('src/main.js'), hud = compose('src/ui/hud.js');
const debugStart = main.indexOf('    this.debug = {'), debugEnd = main.indexOf('\n    };', debugStart);
assert(debugStart > 0 && debugEnd > debugStart);
const installDebug = new Function('THREE', 'G', main.slice(debugStart, debugEnd + 7));
const tankStart = hud.indexOf('  _updTank(f, dt) {'), tankEnd = hud.indexOf('\n  _drawTank(', tankStart);
assert(tankStart > 0 && tankEnd > tankStart);

async function setup({before = false, weapon = 'shooter'} = {}) {
  const f = await fixture({fullRuntime:true, productionComposition:true, realProjectiles:true, vmMathRandom:() => .4});
  const {G} = f, actor = f.make(weapon), timers = new Map(), stale = [];
  let now = 0, id = 0, updates = 0;
  G.camera = new f.THREE.PerspectiveCamera();
  G.physics.segment = (_a, _b, hit) => {hit.hit = false; return hit;};
  const input = {padPressed:new Set(), mouse:{left:false}, pollPad(){}, endFrame(){}};
  const match = {state:'playing', range:true, attract:false, paused:false, local:actor, actors:[actor],
    playing:() => true, canRespawn:() => false, controller:{computeAim(){}},
    updateController(){actor.intent.fire = input.mouse.left;}, update(dt){actor.update(dt);}};
  G.match = match; G.mode = 'match'; G.net = G.netm = null; G.local = actor;
  const tankMethods = new Function('G', 'clamp', `return (class {${hud.slice(tankStart, tankEnd)}}).prototype`)(G, x => Math.min(1, Math.max(0, x)));
  const tank = {_L:{}, _tank:{level:1,t:0,slosh:0,sloshV:0,wobble:0,empty:0,bubbles:[],prevInk:1,prevVx:0,prevVz:0},
    tank:{style:{},classList:{toggle(){}}}, _local:() => null, _drawTank(){}};
  const game = {match,input,settings:{},showcase:{},rig:{mode:'follow',target:actor},timer:{update(){updates++;}},
    _padMenus(){},_frame(dt){f.runSimulation(this,dt);tankMethods._updTank.call(tank,{ink:actor.ink/f.PLAYER.inkMax},dt);}};
  G.game = game;
  const runtime = game.platform = {owner:{active:true}, disposed:false};
  const env = {performance:{now:() => now},setTimeout(fn){timers.set(++id,fn);return id;},
    clearTimeout(key){if(timers.has(key))stale.push(timers.get(key));timers.delete(key);}};
  runtime.simulation = createPlatformSimulationDebt(game,G,env,runtime);
  installDebug.call(game,f.THREE,G);
  if(before) game.debug.freeze = () => {game.frozen = true;}; // Exact old hook.
  game._platformSimulationOptions = runtime.simulation.beforeFrame(0,0,0);
  game._frame(0);game._platformSimulationOptions = null;runtime.simulation.afterFrame();
  function stall(seconds) {
    now += seconds*1000;
    game._platformSimulationOptions = runtime.simulation.beforeFrame(1/60,seconds,now);
    game._frame(1/60);game._platformSimulationOptions = null;runtime.simulation.afterFrame();
    assert(runtime.simulation.snapshot().pending > 0);
    assert(game.s3Clock.accumulator > 0);
  }
  return {f,G,game,actor,tank,timers,stale,stall,updates:() => updates,
    close(){runtime.simulation.dispose();G.projectiles.clear();G.actors.length=0;}};
}

test('debug freeze synchronously retires queued time before manual 30/60/120Hz steps', async () => {
  for(const hz of [30,60,120]) {
    const x = await setup();
    try {
      x.stall(10);const ticks = x.game.s3Clock.ticks;
      x.game.debug.freeze();
      assert.equal(x.game.s3Clock.accumulator,0);
      assert.equal(x.game.platform.simulation.snapshot().pending,0);
      assert.equal(x.timers.size,0);
      for(const callback of x.stale)callback();
      assert.equal(x.game.s3Clock.ticks,ticks,'canceled callback cannot advance a frozen audit');
      for(let n=0;n<hz;n++)x.game._frame(1/hz);
      assert.equal(x.game.s3Clock.ticks-ticks,60,'only the requested manual second advances');
      x.game.debug.unfreeze();assert.equal(x.game.frozen,false);assert.equal(x.updates(),1);
    } finally {x.close();}
  }
});

test('the old hook reproduces the DPR2 tank level; freeze restores six real 30Hz frames', async () => {
  const rows=[];
  for(const before of [true,false]) {
    const x=await setup({before});
    try {
      // The observed empty/half levels resolve to 240,240,240,240,221,2
      // fixed ticks during the six empty frames, after six full frames.
      x.stall(2614/60);x.game.debug.freeze();
      // The next frozen platform callback already called reset() before this
      // sample in CI. That clears the queue but the old clock still kept debt.
      x.game.platform.simulation.reset();
      const levels=[],emptyTicks=[];
      for(const ink of [100,0,50]) {
        for(let i=0;i<6;i++) {
          x.actor.ink=ink;const t=x.game.s3Clock.ticks;x.game._frame(1/30);
          if(ink===0)emptyTicks.push(x.game.s3Clock.ticks-t);
        }
        levels.push(x.tank._tank.level);
      }
      rows.push({before,levels,emptyTicks});
    } finally {x.close();}
  }
  assert.deepEqual(rows[0].emptyTicks,[240,240,240,240,221,2]);
  assert(Math.abs(rows[0].levels[1]-.2811595098606351)<1e-12);
  assert(Math.abs(rows[0].levels[2]-.48982292921427445)<1e-12);
  assert.deepEqual(rows[1].emptyTicks,[2,2,2,2,2,2]);
  assert(rows[1].levels[0]>.9&&rows[1].levels[1]<.1&&rows[1].levels[2]>.4&&rows[1].levels[2]<.6);
});

test('a frozen native Roller volley stays visible across the first explicit release frame', async () => {
  for(const before of [true,false]) {
    const x=await setup({before,weapon:'roller'});
    try {
      x.stall(10);x.game.debug.freeze();x.game.platform.simulation.reset();
      x.G.projectiles.clear();x.actor.ink=100;x.game.debug.fire(true);
      let volleys=0;
      const nativeFlick=x.G.projectiles.fireFlick;
      x.G.projectiles.fireFlick=function(...args) {
        const result=nativeFlick.apply(this,args);
        if(this.list.some(p=>p._inkVolumeHorizontal))volleys++;
        return result;
      };
      let frames=0;
      while(frames++<100&&!x.G.projectiles.list.some(p=>p._inkVolumeHorizontal))x.game._frame(1/60);
      x.game.debug.fire(false);x.game._frame(1/60);
      const horizontal=x.G.projectiles.list.filter(p=>p._inkVolumeHorizontal);
      assert(volleys>0,'the real weapon emitted a horizontal volley before the survival check');
      if(before) assert.equal(horizontal.length,0,'old debt consumes the emitted volley within a manual frame');
      else {assert(frames<100);assert(horizontal.length>0);assert(horizontal.every(p=>p.age<.1));}
    } finally {x.close();}
  }
});
