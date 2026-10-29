// Local fault injection on the actual emitted Game and AudioSystem; never claims
// a browser permission failure or physical-device audio observation.
export async function proveMainAudioFailureRecovery(page) {
  await page.mouse.click(12, 12);
  await page.waitForFunction(() => RG.audio.ctx?.state === 'running', null, { timeout: 15000 });
  return page.evaluate(() => {
    const G = RG, game = G.game, audio = G.audio, actor = G.match?.local;
    if (!actor || typeof game._recoverMainLoop !== 'function') throw Error('Actual emitted audio recovery entrypoints unavailable');
    const check = (ok, message) => { if (!ok) throw Error(message); };
    const keys = ['_loops', '_amb', '_ambV', '_audioOn', '_mainLoopRecovery', 'showcase'];
    const saved = keys.map(key => [key, Object.getOwnPropertyDescriptor(game, key)]);
    const loopDescriptor = Object.getOwnPropertyDescriptor(audio, 'loop'), originalLoop = audio.loop;
    const actorBefore = { alive: actor.alive, form: actor.anim.form, vel: actor.vel.toArray(), groundTeam: actor.groundTeam };
    const noop = Object.freeze({ playing: false, set() {}, stop() {} });
    const attempts = [], admitted = [];
    let created = [];
    try {
      game._loops = {}; game._amb = null; game._ambV = .55; game._audioOn = true; game._mainLoopRecovery = Object.create(null);
      game.showcase = { fullFrame: true };
      actor.alive = true; actor.anim.form = 'swim'; actor.vel.set(2, 0, 0); actor.groundTeam = 0;
      audio.loop = function (name) { attempts.push(name); return noop; };
      for (let i = 0; i < 3; i++) { game._updateLocalLoops(1 / 60); game._updateAmbience(1 / 60); }
      check(attempts.includes('swim') && attempts.includes('harbor_ambience'), 'Both actual failed admission paths must execute');
      check(game._loops.swim === null && game._amb === null, 'Frozen failed handles must not be retained');
      check(!Object.hasOwn(noop, '_v'), 'Actual frozen failure handle must never receive a mutable volume field');
      audio.loop = function (name, ...args) {
        const handle = originalLoop.call(this, name, ...args);
        if (handle?.playing) { admitted.push(name); created.push(handle); }
        return handle;
      };
      for (let i = 0; i < 60; i++) { game._updateLocalLoops(1 / 60); game._updateAmbience(1 / 60); }
      const swim = game._loops.swim, ambience = game._amb;
      check(swim?.playing && ambience?.playing, 'Restored real provider must recover live swim and ambience handles');
      check(admitted.filter(name => name === 'swim').length === 1 && admitted.filter(name => name === 'harbor_ambience').length === 1, 'Recovery admits each real loop once');
      for (let i = 0; i < 30; i++) { game._updateLocalLoops(1 / 60); game._updateAmbience(1 / 60); }
      check(game._loops.swim === swim && game._amb === ambience && admitted.length === 2, 'Healthy loops retain identity without repeated admission');
      return { status: 'passed', failedAttempts: attempts, recovered: admitted, contextState: audio.ctx.state, rejectedHandlesRetained: false, frozenNoopUnmodified: true, healthyLoopIdentityStable: true, scope: 'Bounded fault injection at actual emitted AudioSystem.loop with actual Game consumers; real WebAudio recovery. Not Safari permission denial or device performance.' };
    } finally {
      for (const handle of new Set(created)) handle.stop?.(0);
      if (loopDescriptor) Object.defineProperty(audio, 'loop', loopDescriptor); else delete audio.loop;
      for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(game, key, descriptor); else delete game[key]; }
      actor.alive = actorBefore.alive; actor.anim.form = actorBefore.form; actor.vel.fromArray(actorBefore.vel); actor.groundTeam = actorBefore.groundTeam;
    }
  });
}
