// Real Input -> adapted PlayerController -> fixed clock -> Actor -> WeaponRunner.
// Display/audio and ground collision are fixtures; no copied action engine.
import { boot, device } from './action-fixture.mjs';
import { STEP, FixedClock } from '../../splatoon3/runtime/clock.mjs';

export async function timingFuzz({ adapt, phases = 400 } = {}) {
  const result = { cases: 0, passed: 0, duplicates: 0, releaseFailures: 0, rows: [] };
  for (const name of ['keyboard', 'gamepad', 'touch']) {
    const h = await boot({ adapt }), set = device(h, name);
    for (const cadence of [1 / 30, 1 / 60, 1 / 120, .047, .2]) {
      for (const previousHeld of [false, true]) {
        const row = { device: name, renderInterval: cadence, previousHeld, cases: 0, passed: 0 };
        for (let phase = 0; phase < phases; phase++) {
          h.actor.weaponRunner.reset(); h.actor.character.events.length = 0;
          h.actor.ink = 100; h.actor.grounded = true; h.actor.form = 'kid';
          h.actor.jumpBuffer = h.actor.fireBuffer = 0;
          h.actor._prevIntent.jump = previousHeld; h.actor._prevIntent.fire = true;
          h.input.endFrame(); h.input.padPressed.clear();
          h.game.s3Clock = new FixedClock();
          set('fire', true);
          // Every phase relative to the next fixed tick, including the exact boundary.
          const offset = STEP * phase / phases;
          h.frame(offset);
          set('jump', true); h.frame(0); // gamepad raw sample on producer render
          set('jump', false); h.frame(0); // release before the consumer tick
          h.frame(STEP - offset);
          const count = () => h.actor.character.events.filter(e => e[0] === 'dodge').length;
          const started = count();
          // Catch-up frames vary render/simulation ratio, including a 200ms drop.
          h.frame(cadence); h.frame(STEP);
          const once = started === 1 && count() === 1;
          row.cases++; result.cases++;
          if (once) { row.passed++; result.passed++; }
          if (count() > 1) result.duplicates++;
          if (h.actor.intent.jump) result.releaseFailures++;
        }
        result.rows.push(row);
      }
    }
  }
  result.successRate = result.passed / result.cases;
  return result;
}
