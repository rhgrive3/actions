async function runPoseResetProof(page) {
  const rows = [];
  for (const name of ['shooter', 'slosher9', 'roller-horizontal', 'roller-vertical']) {
    const cases = [];
    for (const frames of [0, 133, 208]) {
      await page.evaluate(visualSetup, { name, seed: 0x1a2b3c4d });
      const history = await page.evaluate(({ frames }) => {
        const a = window.__G.match.local;
        for (let i = 0; i < frames; i++) a._finishFrame(1 / 60);
        a.character.update(1 / 60, { ...a.anim, firing: true });
        const ch = a.character;
        return { frames, t: ch.t, wAim: ch.wAim,
          muzzle: window.__G.projectiles._muzzle(a, new window.__G.camera.position.constructor()).toArray(),
          sourceMotion: { status: ch.sourceMotion.status, active: ch.sourceMotion.active, time: ch.sourceMotion.time } };
      }, { frames });
      const setup = await page.evaluate(visualSetup, { name, seed: 0x1a2b3c4d });
      const physical = await page.evaluate(({ name }) => {
        const G = window.__G, a = G.match.local, ch = a.character, V = G.camera.position.constructor;
        const muzzle = G.projectiles._muzzle(a, new V()).toArray();
        const rng = window.__iwResetScenarioRandom(0x1a2b3c4d);
        if (name === 'shooter') G.projectiles.fireShooter(a, a.weapon, 0);
        else if (name === 'slosher9') G.projectiles.fireSlosh(a, a.weapon);
        else { a.weaponRunner.s3FlickVertical = name === 'roller-vertical'; G.projectiles.fireFlick(a, a.weapon); }
        return { muzzle, sourceMotion: {status: ch.sourceMotion.status, active: ch.sourceMotion.active, time: ch.sourceMotion.time},
          births: G.projectiles.list.map(p => ({ type:p.type,pos:p.pos.toArray(),vel:p.vel.toArray(),seed:p.seed,age:p.age,delay:p.delay||0 })),
          rng: (({seed,draws,state}) => ({seed,draws,state}))(rng.snapshot()),
          reset: window.__iwCharacterResetReceipt };
      }, { name });
      if (physical.sourceMotion.status !== 'ready' || physical.sourceMotion.active !== !name.startsWith('roller'))
        throw new Error('Native source-motion ownership differs from production contract: '+name);
      cases.push({ history, physical, lifecycle: setup.lifecycleReset });
    }
    const canonical = JSON.stringify(cases[0].physical);
    const exact = cases.every(row => JSON.stringify(row.physical) === canonical);
    rows.push({ name, exact, cases });
    report.poseResetProof = rows;
    if (!exact) throw new Error('Startup history still affects native reset/fire: '+name);
  }
}
