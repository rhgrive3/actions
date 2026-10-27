import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { fixture } from '../../reliability/tests/hud-fixture.mjs';
import { createLazyComposerTarget } from '../composer-target-adapter.mjs';
const read = rel => fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');
const composed = rel => adaptBuildSource(rel, read(rel));
const hudSource = composed('src/ui/hud.js'), gameSource = composed('src/main.js');

test('offline HUD effects park without losing work; resume resets the wall clock and keeps debug pause independent', async () => {
  const h = await fixture({ hudSource, gameSource });
  const moving = { playState:'running', pause(){this.playState='paused';}, play(){this.playState='running';} };
  const userPaused = {playState:'paused',play(){throw Error('foreign pause ownership');}};
  h.hud.el.getAnimations = () => [moving,userPaused];
  let elapsed = 0;
  h.hud._addFx('lens', dt => { elapsed += dt; });
  await h.advance(100);
  const before = elapsed;
  h.hud.paused = true;
  h.hud.setWorldPaused(true);
  assert.equal(moving.playState,'paused','finite Web Animations/transitions also stop behind the blur');
  assert.equal(h.rafs.size, 0);
  assert.equal(h.hud.el.classList.contains('is-world-paused'), true);
  assert.equal(h.hud.overLayer.classList.contains('is-world-paused'), true);
  let lateRuns = 0;
  h.hud._addFx('late', dt => { lateRuns++; elapsed += dt; return false; });
  await h.advance(60000);
  assert.equal(elapsed, before);
  assert.equal(h.rafs.size, 0);
  // A callback already dispatched when pause took ownership stays idle too.
  h.hud._fxLoop(h.now());
  assert.equal(h.rafs.size, 0);
  h.hud.setWorldPaused(false);
  assert.equal(moving.playState,'running');
  assert.equal(h.hud.paused, true);
  assert.equal(h.rafs.size, 0, 'world resume does not wake effects still owned by the independent debug pause');
  await h.advance(5000);
  assert.equal(elapsed, before);
  assert.equal(lateRuns, 0, 'parked work remains pending through either pause owner');
  assert.equal(h.rafs.size, 0, 'debug pause no longer schedules an idle RAF loop');
  h.hud.paused = false;
  assert.equal(h.rafs.size, 1, 'releasing the final pause owner resumes exactly one effect loop');
  await h.advance(50);
  assert.equal(lateRuns, 1, 'late work resumes exactly once');
  assert.ok(elapsed > before && elapsed - before < .11, 'no accumulated pause time enters the resumed effect');
  h.hud.setWorldPaused(true);
  h.hud.setVisible(false);
  assert.equal(h.hud._worldPaused, false, 'quit/hidden HUD releases pause ownership');
});

test('the production frame freezes HUD updates only offline and refreshes with zero dt after invalidation', () => {
  const start = gameSource.indexOf('    // HUD\n'), end = gameSource.indexOf('\n    this.menus?.update?.(dt);', start);
  assert.ok(start > 0 && end > start);
  const run = new Function('m', 'pausedFrame', 'dt', gameSource.slice(start, end));
  const calls = [], hud = { setWorldPaused: on => calls.push(['paused', on]) };
  const game = { hud, _updateHud: dt => calls.push(['update', dt]) }, m = { state:'playing' };
  for (const [paused, draw, expected] of [[true,false,[]],[true,true,[0]],[false,true,[1/60]]]) {
    calls.length = 0;
    run.call(game, m, { paused, draw }, 1/60);
    assert.deepEqual(calls.filter(c => c[0] === 'update').map(c => c[1]), expected);
    assert.deepEqual(calls[0], ['paused',paused]);
  }
});

test('pause snapshot refresh stays live online but never reparses identical offline stats', () => {
  const source = composed('src/ui/menus.js');
  const start = source.indexOf('        if (snap.live &&'), end = source.indexOf('\n', start);
  assert.ok(start > 0);
  const G = { match:{paused:true}, netm:null }, snap = {live:true};
  let reads = 0;
  const tick = vm.runInNewContext('(function(){' + source.slice(start,end) + '})', {G,snap,refresh(){reads++;}});
  const menu = { _matchSnapshot: () => ({}) };
  for (let i=0;i<120;i++) tick.call(menu);
  assert.equal(reads,0);
  G.netm = {}; tick.call(menu); assert.equal(reads,1);
  G.netm = null; G.match.paused = false; tick.call(menu); assert.equal(reads,2);
});

test('composed Renderer retains a finished WebGL pause frame and releases it after resume', () => {
  const renderSource = composed('src/core/renderer.js');
  assert.match(renderSource, /installPausedFrameRetention\(Renderer\)/);
  assert.match(gameSource, /presentPausedFrame\?\.\(\)/);
  assert.match(gameSource, /releasePausedFrame\?\.\(\)/);
  const retention = fs.readFileSync(new URL('../pause-frame-retention.mjs', import.meta.url), 'utf8')
    .replace(/^import .*;\s*$/gm, '').replace('export function installPausedFrameRetention', 'function installPausedFrameRetention');
  const record = { copies: 0, draws: 0, disposed: 0, pairs: 0, released: 0 };
  let width = 320, height = 200, lost = false, target = null, copyFails = false;
  class Vector2 { set(x, y) { this.x = x; this.y = y; return this; } }
  class FramebufferTexture {
    constructor(w, h) { this.image = { width: w, height: h }; }
    dispose() { record.disposed++; }
  }
  class ShaderMaterial {
    constructor(opts) { Object.assign(this, opts); }
    dispose() { record.disposed++; }
  }
  class Quad { constructor(material) { this.material = material; } render() { record.draws++; } }
  const THREE = { Vector2, FramebufferTexture, ShaderMaterial, NoBlending: 0, NoColorSpace: '', LinearFilter: 1 };
  class RenderOwner {}
  new Function('THREE', 'FullScreenQuad', retention + '\nreturn installPausedFrameRetention;')(THREE, Quad)(RenderOwner);
  const owner = new RenderOwner();
  owner.renderer = {
    getContext: () => ({ isContextLost: () => lost }),
    getDrawingBufferSize: v => v.set(width, height),
    getRenderTarget: () => target,
    setRenderTarget(v) { target = v; },
    copyFramebufferToTexture(texture) {
      assert.equal(texture.image.width, width);
      if (copyFails) throw Error('copy unavailable');
      record.copies++;
    },
    autoClear: false,
  };
  const pass = { enabled: true };
  owner.composer = createLazyComposerTarget(() => {
    record.pairs++;
    return { addPass(p) { assert.equal(p, pass); }, render() {}, dispose() { record.released++; } };
  });
  owner.composer.addPass(pass);
  owner.composer.render();
  assert.equal(owner.presentPausedFrame(), false, 'no uncaptured frame is reused');
  assert.equal(owner.capturePausedFrame(), true);
  assert.equal(record.copies, 1);
  assert.equal(record.released, 1, 'a successful capture retires the unused native target pair');
  for (let i = 0; i < 120; i++) assert.equal(owner.presentPausedFrame(), true);
  assert.equal(record.draws, 120, 'one cheap present per frame rather than a composer pass');
  assert.equal(record.copies, 1, 'no extra frame capture in steady pause');
  assert.equal(record.pairs, 1, 'presenting the snapshot cannot recreate HDR/MSAA targets');
  assert.equal(owner.renderer.autoClear, false, 'renderer state is restored after blits');
  width++;
  assert.equal(owner.presentPausedFrame(), false, 'resize rejects a stale snapshot');
  assert.equal(owner.capturePausedFrame(), true);
  lost = true;
  assert.equal(owner.presentPausedFrame(), false, 'lost context rejects stale snapshot');
  lost = false;
  assert.equal(owner.capturePausedFrame(), true);
  owner.releasePausedFrame();
  assert.equal(owner._pauseSnapshot, null, 'resume releases full-resolution GPU texture');
  assert.equal(owner.presentPausedFrame(), false);
  assert.ok(record.disposed >= 3, 'every superseded snapshot was disposed');
  owner.composer.render();
  assert.equal(record.pairs, 2, 'resume lazily recreates exactly one pair with the original pass');
  assert.equal(owner.composer.passes[0], pass);
  copyFails = true;
  assert.equal(owner.capturePausedFrame(), false);
  assert.equal(record.released, 1, 'failed capture retains the full-render fallback targets');
  assert.equal(owner._pauseSnapshot, null);
  copyFails = false;
  owner.composer.renderToScreen = false;
  assert.equal(owner.capturePausedFrame(), true);
  assert.equal(record.released, 1, 'an explicitly offscreen composer keeps its attachments');
  owner.releasePausedFrame();
  owner.composer.dispose();
});
