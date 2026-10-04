// Transfer the original death-burst paint reward; never repaint to score it.
import { replaceOnce } from './input-adapter.mjs';

export function adaptCombatCredit(rel, code) {
  const patch = (before, after, label) => {
    code = replaceOnce(code, before, after, 'combat credit: ' + label);
  };
  if (rel === 'src/game/actor.js') {
    patch("  splat(attacker, cause = 'weapon') {\n    if (!this.alive) return;",
      "  splat(attacker, cause = 'weapon') {\n    if (!this.alive) return;\n    let burstArea = 0;", 'original paint result');
    patch('      attacker.addTurf(G.paint.splat(_v, 1.7, attacker.team, { seed: Math.random() }));',
      '      burstArea = G.paint.splat(_v, 1.7, attacker.team, { seed: Math.random() });\n' +
      '      if (!G.netm || !attacker.remote) attacker.addTurf(burstArea);', 'scorer ownership');
    patch("    emit('splatted', { victim: this, attacker, cause });",
      "    emit('splatted', { victim: this, attacker, cause, burstArea: String(burstArea), victimLife: this.netLife ?? 0, victimOwner: this.owner });", 'exact credit event');
  }
  if (rel !== 'src/net/netmatch.js') return code;
  // Admit terminal attribution on the actual sender's channel before queuing.
  // Keep the native queue and playback call anchors for the replication adapter.
  patch('    // events → the sender\'s queue (played on its timeline)',
    '    if (d.e) d = { ...d, e: d.e.filter(e => e[1] !== "ev" || e[2] !== "splatted" ||\n' +
    '      (e[3]?.victimOwner === from && this.byNid.get(e[3]?.victim?.n)?.owner === from)) };\n' +
    '    // events → the sender\'s queue (played on its timeline)', 'terminal sender');
  patch('    const a = e.actor || e.victim;\n    if (!a || !a.remote) return;',
    '    const a = e.actor || e.victim;\n    if (!a || !a.remote) return;\n' +
    '    if (name === "splatted") {\n' +
    '      const life = e.victimLife, area = typeof e.burstArea === "string" ? Number(e.burstArea) : NaN;\n' +
    '      if (e.victimOwner !== a.owner || !Number.isSafeInteger(life) || life < 0 || life > (a.net.lastLife ?? a.netLife ?? 0) || !Number.isFinite(area) || area < 0 || life <= (a._combatCreditLife ?? -1)) return;\n' +
    '      a._combatCreditLife = life;\n' +
    '      if (e.attacker && e.attacker.team !== a.team) {\n' +
    '        e.attacker.stats.splats++;\n' +
    '        if (!e.attacker.remote) e.attacker.addTurf(area);\n' +
    '      }\n' +
    '      // A delayed confirmation may still owe reward, but cannot splat a newer life.\n' +
    '      if (life !== (a.net.cur?.life ?? a.netLife ?? 0)) return;\n' +
    '    }', 'once-only independent reward');
  patch('    if (attacker) attacker.stats.splats++;',
    '    if (attacker && victim._combatCreditLife === undefined) attacker.stats.splats++;', 'no duplicate splat count');
  return code;
}
