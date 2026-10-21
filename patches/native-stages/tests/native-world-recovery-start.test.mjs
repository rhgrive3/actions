import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import test from 'node:test';import assert from 'node:assert/strict';import{pathToFileURL}from'node:url';import{ROOT,EMITTED}from'./native-world-recovery-fixture.mjs';
assert.equal(EMITTED,false,'Actual startup method extraction is source-only; use the native app browser lane for emitted Game');
const { nativeSpawnYaw } = await import(pathToFileURL(path.join(ROOT, 'patches/native-stages/runtime/native-spawn.mjs')).href);
const input=path.join(ROOT,'patches/reliability/tests/start.test.mjs'),url=pathToFileURL(input),text=fs.readFileSync(input,'utf8');
let harness=text.slice(0,text.indexOf("\ntest('negative proof:"));
harness=harness.replace(/from (['"])(\.[^'"\n]+)\1/g,(_all,q,spec)=>'from '+JSON.stringify(new URL(spec,url).href));
harness=harness.replaceAll('import.meta.url',JSON.stringify(url.href));
const {boot,PRODUCTION}=await import('data:text/javascript;base64,'+Buffer.from(harness+'\nexport {boot,PRODUCTION};').toString('base64'));
assert.match(PRODUCTION,/if \(this\._nativeWorldRecoveryFatal\) \{ this\.input\?\.exitLock\?\.\(\); return; \}/);
for(const fatal of [false,true])test('actual composed startMatch '+(fatal?'fatal stops without attract':'recoverable failure returns to retry menu'),async()=>{const h=boot(PRODUCTION);h.maps[1].nativeSource=true;h.game._buildWorld=async()=>{if(fatal){h.game._nativeWorldRecoveryFatal={error:Error('initial'),recoveryErrors:[Error('restore')]};h.game.frozen=true;}throw Error('publication failed');};const at=h.calls.length;await h.start(false);const calls=h.calls.slice(at);assert.equal(calls.filter(x=>x[0]==='exitLock').length,1);assert.equal(calls.filter(x=>x[0]==='attractShot').length,fatal?0:1);assert.equal(calls.filter(x=>x[0]==='fadeOut').length,fatal?0:1);assert.equal(h.game.menus.current,fatal?null:'setup');assert.equal(h.game.frozen,fatal?true:undefined);});
test('actual composed startMatch does not swallow non-native build failure',async()=>{const h=boot(PRODUCTION);h.game._buildWorld=async()=>{throw Error('legacy failure');};await assert.rejects(()=>h.start(false),/legacy failure/);});
for (const online of [false, true]) {
  test(`actual ${online ? 'online' : 'offline'} startup intentionally adopts null during world loading`, async () => {
    const h = boot(PRODUCTION, ['world']);
    h.context.nativeSpawnYaw = nativeSpawnYaw;
    if (online) h.cfg.roster = [{ nid: 1, team: 0, slot: 0, owner: h.G.net.myId, bot: false, weapon: 'shooter' }];
    let resets = 0;
    h.initial.actors.push({ weaponRunner: { reset() { resets++; } } });
    const pending = h.start(online);
    await h.reached.world.promise;
    assert.equal(h.initial.paused, true);
    assert.equal(resets, 1);
    assert.equal(h.initial.disposed, 1);
    assert.equal(h.game.match, null);
    assert.equal(h.G.match, null);
    assert.equal(h.game._matchFlow.match, null);
    assert.equal(h.game._matchFlow.current(), true);
    h.gates.world.resolve();
    await pending;
    assert.ok(h.game.match);
    assert.equal(h.game._matchFlow.match, h.game.match);
  });
  for (const change of ['new-flow-and-match', 'match', 'room', 'net', 'net-match', 'session-match']) {
    test(`actual ${online ? 'online' : 'offline'} disposal ${change} cannot be cleared by old startup`, async () => {
      const h = boot(PRODUCTION);
      if (online) h.cfg.roster = [{ nid: 1, team: 0, slot: 0, owner: h.G.net.myId, bot: false, weapon: 'shooter' }];
      let expectedMatch, expectedGlobal, expectedFlow;
      h.hooks.disposeMatch = () => {
        if (change === 'new-flow-and-match' || change === 'match') {
          h.game.match = h.G.match = { alive: true, dispose() { throw Error('new owner must survive'); } };
          if (change === 'new-flow-and-match') h.game._beginMatchFlow();
        } else if (change === 'room') h.G.net.tr = {};
        else if (change === 'net') h.G.net = { ...h.G.net };
        else if (change === 'net-match') h.G.netm = {};
        else h.G.net.match = {};
        expectedMatch = h.game.match;
        expectedGlobal = h.G.match;
        expectedFlow = h.game._matchFlow;
      };
      await h.start(online);
      assert.equal(h.initial.disposed, 1);
      assert.equal(h.game.match, expectedMatch);
      assert.equal(h.G.match, expectedGlobal);
      assert.equal(h.game._matchFlow, expectedFlow);
      assert.equal(h.count('world'), 0);
      assert.equal(h.count('setup'), 0);
    });
  }
  test(`actual ${online ? 'online' : 'offline'} fade cancellation leaves the newer owner intact`, async () => {
    const h = boot(PRODUCTION, ['fade']);
    if (online) h.cfg.roster = [{ nid: 1, team: 0, slot: 0, owner: h.G.net.myId, bot: false, weapon: 'shooter' }];
    const pending = h.start(online);
    const newer = h.game.match = h.G.match = { dispose() { throw Error('new match disposal'); } };
    const flow = h.game._beginMatchFlow();
    h.gates.fade.resolve();
    await pending;
    assert.equal(h.initial.disposed, 0);
    assert.equal(h.game.match, newer);
    assert.equal(h.G.match, newer);
    assert.equal(h.game._matchFlow, flow);
    assert.equal(h.count('world'), 0);
  });
}
test('actual Game loop with frozen fatal page never advances or renders before common core patch',()=>{const raw=fs.readFileSync(path.join(ROOT,'inkwave-public/src/main.js'),'utf8'),at=raw.indexOf('  _loop() {'),end=raw.indexOf('\n  _frame(',at);assert(at>0&&end>at);let raf=0,clock=0,frame=0;const G={};const Game=vm.runInNewContext('class Game {'+raw.slice(at,end)+'};Game',{G,requestAnimationFrame(){raf++;}});const game=new Game();game.frozen=true;game._nativeWorldRecoveryFatal={error:Error('fault')};game.timer={update(){clock++;},getDelta(){return 1/60;}};game._frame=()=>{frame++;};for(let i=0;i<3;i++)game._loop();assert.equal(raf,3);assert.equal(clock,3);assert.equal(frame,0);});
