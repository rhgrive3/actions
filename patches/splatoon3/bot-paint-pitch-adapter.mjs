// Owner request 2026-11-06: Shooter and Dualies Bots aimed 0.42 rad below the
// horizon while painting the ground ahead (the shared default for every
// family without its own value). They now aim -0.1 rad. Brella (folded into
// the shooter behaviour) and the other families keep their values. The
// foot-clearing aim (it needs a steep look to fire under the Bot) is unchanged.
export const BOT_PAINT_PITCH_SHOOTER = -0.1;
const SHOOTERISH = "(family === 'shooter' && a.weapon?.catalogRecord?.family !== 'brella' || family === 'dualies')";
export function adaptBotPaintPitch(rel, code, once) {
  if (rel !== 'src/game/bots.js') return code;
  code = once(code,
    "family === 'splatling' ? -0.08 : -0.42;",
    `family === 'splatling' ? -0.08 : ${SHOOTERISH} ? ${BOT_PAINT_PITCH_SHOOTER} : -0.42;`,
    'bot shooter/dualies paint pitch');
  return once(code,
    "if (this.mode !== 'fight') { wantYaw = aheadYaw + (family === 'roller' ? 0 : Math.sin(this.sweep) * 0.5); wantPitch = family === 'charger' ? -0.12 : family === 'blaster' ? -0.28 : -0.42; }",
    `if (this.mode !== 'fight') { wantYaw = aheadYaw + (family === 'roller' ? 0 : Math.sin(this.sweep) * 0.5); wantPitch = family === 'charger' ? -0.12 : family === 'blaster' ? -0.28 : ${SHOOTERISH} ? ${BOT_PAINT_PITCH_SHOOTER} : -0.42; }`,
    'bot shooter/dualies escape paint pitch');
}
