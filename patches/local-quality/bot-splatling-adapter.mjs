// Splatling bots (owner report 2026-11-04): a charge was spent into the floor
// or into nothing, and lane painting released a partial (60 %) spin-up aimed
// 0.3 rad down, so the stream landed ~3 m ahead.
//   - Fight: a target that steps out of range mid-charge no longer forces a
//     partial release; the spin-up is held for at most HOLD seconds.
//   - Target lost while charging: hold the ready charge for HOLD seconds for
//     re-acquisition instead of releasing it at once into empty space.
//   - Paint: spin up to the bot's full release point, aim near level so the
//     stream carries to its range, and release a charge carried over from a
//     fight only after the aim has risen off the floor (bounded by HOLD).
// Bots are an INKWAVE feature; these values are project calibration, not
// Splatoon 3 data. Weapon timing, ink cost and stream physics are unchanged.
const HOLD = 1.5;
const PAINT_PITCH = -0.08;

export function adaptBotSplatling(rel, code, once) {
  if (rel !== 'src/game/bots.js') return code;
  code = once(code,
    "            const wr = a.weaponRunner, want = dist > range * 0.55 ? this.chargeRelease : 0.55 + 0.25 * this.chargeRelease;\n" +
    "            it.fire = !wr.streaming && dist < range * 1.1 && !(wr.charging && wr.charge >= want);",
    "            const wr = a.weaponRunner, want = dist > range * 0.55 ? this.chargeRelease : 0.55 + 0.25 * this.chargeRelease;\n" +
    "            // A target leaving range mid spin-up keeps the charge (bounded) rather than spending a partial stream.\n" +
    "            const outOfRange = dist >= range * 1.1;\n" +
    "            this._splatlingHold = wr.charging && outOfRange ? (this._splatlingHold || 0) + dt : 0;\n" +
    "            it.fire = !wr.streaming && (wr.charging\n" +
    `              ? (outOfRange ? this._splatlingHold < ${HOLD} : wr.charge < want)\n` +
    "              : !outOfRange);",
    'bot splatling fight range hold');
  code = once(code,
    "          this._chargeAimWait = 0;\n" +
    "          it.fire = a.weaponRunner.charge < (pencil ? 1 : this.chargeRelease);\n" +
    "        } else this._chargeAimWait = 0;",
    // The condition line above is left for the later CPU-10 rewrite; this branch
    // is the only one that ends in this exact release-and-reset pair.
    "          this._chargeAimWait = 0;\n" +
    "          if (family === 'splatling') {\n" +
    "            // Hold the ready spin-up briefly for the lost target instead of streaming into empty space.\n" +
    "            this._splatlingHold = a.weaponRunner.charge >= this.chargeRelease ? (this._splatlingHold || 0) + dt : 0;\n" +
    `            it.fire = a.weaponRunner.charge < this.chargeRelease || this._splatlingHold < ${HOLD};\n` +
    "          } else it.fire = a.weaponRunner.charge < (pencil ? 1 : this.chargeRelease);\n" +
    "        } else this._chargeAimWait = 0;",
    'bot splatling lost-target hold');
  code = once(code,
    "family === 'slosher' ? -0.16 : family === 'splatling' ? -0.3 : -0.42;",
    `family === 'slosher' ? -0.16 : family === 'splatling' ? ${PAINT_PITCH} : -0.42;`,
    'bot splatling paint pitch');
  code = once(code,
    "        else if (wr.charging) { it.fire = wr.charge < 0.6; if (!it.fire) this.paintPause = 0.25 + Math.random() * 0.3; }",
    "        else if (wr.charging) {\n" +
    "          // Full spin-up for a lane; a charge carried in from a fight waits (bounded) until the aim is off the floor.\n" +
    "          const ready = wr.charge >= this.chargeRelease, low = this.aimPitch < wantPitch - 0.15;\n" +
    "          this._splatlingHold = ready ? (this._splatlingHold || 0) + dt : 0;\n" +
    `          it.fire = !ready || (low && this._splatlingHold < ${HOLD});\n` +
    "          if (!it.fire) { this._splatlingHold = 0; this.paintPause = 0.25 + Math.random() * 0.3; }\n" +
    "        }",
    'bot splatling paint full charge');
  return code;
}
