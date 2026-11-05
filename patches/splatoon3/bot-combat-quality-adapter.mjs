// Bot combat quality (runtime/bot-combat-quality.mjs). Applied after the other
// bots.js passes; every anchor is the final composed text.
const IMPORT = "import { botNoteSighting, botTickAlert, botAlertPitch, botClearShot, botBlasterAimPoint, botFireReach, botStrafePlan, botCoverBomb } from '../../patches/splatoon3/runtime/bot-combat-quality.mjs';\n";
export function adaptBotCombatQuality(rel, code, replaceOnce) {
  if (rel !== 'src/game/bots.js') return code;
  if (code.includes(IMPORT)) throw new Error('INKWAVE bot combat quality: repeated bots.js transform');
  code = replaceOnce(code, '    this.acqT += dt; this.t += dt;\n',
    '    this.acqT += dt; this.t += dt;\n    botTickAlert(this, dt);\n', 'bot alert clock');
  code = replaceOnce(code, '      this.seeTimer = 1.2;\n      this.lostTimer = 0;\n',
    '      this.seeTimer = 1.2;\n      this.lostTimer = 0;\n      botNoteSighting(this, best, G.time);\n', 'bot sighting record');
  code = replaceOnce(code,
    "      _v.set(t.pos.x + t.vel.x * lead, t.pos.y + (t.smoothY || 0) + (t.form === 'squid' ? 0.3 : 0.85), t.pos.z + t.vel.z * lead);\n",
    "      _v.set(t.pos.x + t.vel.x * lead, t.pos.y + (t.smoothY || 0) + (t.form === 'squid' ? 0.3 : 0.85), t.pos.z + t.vel.z * lead);\n      botBlasterAimPoint(family, t, dist, range, _v);\n",
    'bot Blaster ground-burst aim');
  code = replaceOnce(code,
    '        if (this.strafeT <= 0) { this.strafeT = 0.6 + Math.random() * 1.2; this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeAmp = 0.5 + Math.random() * 0.5; }',
    '        if (this.strafeT <= 0) botStrafePlan(this);', 'bot purposeful strafe');
  code = replaceOnce(code,
    '        if (enemyVisible && this.react <= 0 && aimed && inkFrac > 0.02) {',
    '        if (enemyVisible && this.react <= 0 && aimed && inkFrac > 0.02 && botClearShot(this, family, G.time)) {', 'bot no shots into walls');
  code = replaceOnce(code,
    '            it.fire = dist < range * 1.08 && (!brella || botReadyPress(a));',
    '            it.fire = dist < botFireReach(family, range, w) && (!brella || botReadyPress(a));', 'bot Blaster burst reach');
  code = replaceOnce(code,
    '        } else this._chargeAimWait = 0;\n',
    '        } else this._chargeAimWait = 0;\n        if (!it.fire && !a.weaponRunner.charging) wantPitch += botCoverBomb(this, a, dist, a.ink, selectedSubCost(a, SUB), dt);\n',
    'bot cover bomb');
  code = replaceOnce(code,
    "      const aheadStats = this._observePaintRegion('turf',",
    "      wantPitch = botAlertPitch(this, wantPitch);\n      const aheadStats = this._observePaintRegion('turf',", 'bot alert pitch while painting');
  return IMPORT + code;
}
