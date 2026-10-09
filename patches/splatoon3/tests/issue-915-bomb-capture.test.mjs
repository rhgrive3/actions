import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const DT = 1 / 60;
const RELEASE_INPUT_FRAME = 30;

async function nativeBombCapture(driver) {
  const f = await fixture({ productionComposition: true, fullRuntime: true, realProjectiles: true });
  const actor = f.make('shooter');
  const projectiles = f.G.projectiles;
  const throws = [];
  let frame = -1;
  let releasePreparation = null;
  const nativeThrow = projectiles.throwBomb;
  projectiles.throwBomb = function (owner, ...args) {
    const result = nativeThrow.call(this, owner, ...args);
    if (owner === actor) throws.push({ frame, bomb: this.bombs.at(-1) });
    return result;
  };

  for (frame = 0; frame <= RELEASE_INPUT_FRAME + 1; frame++) {
    actor.ink = 100;
    actor.intent.sub = frame < RELEASE_INPUT_FRAME;
    if (driver === 'Actor.update') {
      f.tick(actor);
    } else {
      f.G.time += DT;
      actor.weaponRunner.update(DT, {
        fire: false,
        sub: actor.intent.sub,
        subReleased: frame === RELEASE_INPUT_FRAME,
      });
      actor._finishFrame(DT);
    }
    if (frame === RELEASE_INPUT_FRAME) {
      const pending = actor.weaponRunner.s3SubReady;
      releasePreparation = {
        pending: pending?.pending === true,
        aimingSub: actor.weaponRunner.aimingSub === true,
        useStartupSeconds: pending?.useStartup,
      };
      assert.equal(projectiles.bombs.length, 0, `${driver}: no bomb exists on the release-input frame`);
    }
  }

  assert.equal(releasePreparation?.pending, true, `${driver}: prepared release stays pending`);
  assert.equal(releasePreparation.aimingSub, true, `${driver}: native runner remains in sub-aim during startup`);
  assert.ok(Number.isFinite(releasePreparation.useStartupSeconds));
  assert.ok(Math.abs(releasePreparation.useStartupSeconds - DT) < 1e-12, `${driver}: configured startup is one native tick`);
  assert.equal(throws.length, 1, `${driver}: exactly one native throw event`);
  assert.equal(throws[0].frame - RELEASE_INPUT_FRAME, releasePreparation.useStartupSeconds / DT,
    `${driver}: measured preparation-to-release delay matches configured useStartup`);
  assert.equal(throws[0].frame, RELEASE_INPUT_FRAME + 1);
  assert.equal(projectiles.bombs.length, 1);
  assert.strictEqual(throws[0].bomb.owner, actor);
  assert.equal(throws[0].bomb.mesh?.type, 'Group', `${driver}: native bomb owns its real Three Group`);
  assert.equal(throws[0].bomb.mesh?.isGroup, true);
}

test('#915 motion detail captures the first native bomb birth after measured use startup', async () => {
  await nativeBombCapture('WeaponRunner.update');
  await nativeBombCapture('Actor.update');
});
