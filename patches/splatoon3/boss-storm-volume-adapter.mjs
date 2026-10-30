// Candidate only. Reuse the existing native rain-ray interval, never the
// Actor feet offset or a new guessed Boss/Splatoon height. No model is changed.
function once(code, before, after, label) {
  if (code.split(before).length !== 2) throw Error('Boss Storm volume: expected one '+label);
  return code.replace(before, after);
}
export function adaptBossStormVolume(rel, code) {
  if (rel === 'src/game/weapons.js') {
    const call='G.boss?.rain(c.owner, c.group.position.x, c.group.position.z, sp.radius * s, sp.dps * stepDt);';
    return once(code, call, call.replace('stepDt);','stepDt, c);'), 'native cloud/Boss call');
  }
  if (rel !== 'src/boss/boss.js') return code;
  const signature='  rain(owner, cx, cz, R, dmg) {';
  code=once(code, signature, '  rain(owner, cx, cz, R, dmg, cloud = null) {', 'Boss rain signature');
  const start=code.indexOf('  rain(owner, cx, cz, R, dmg, cloud = null) {'),end=code.indexOf('\n  _flushRain(dt)',start);
  if(start<0||end<start)throw Error('Boss Storm volume: missing rain method boundary');
  const part=code.slice(start,end),guard='    if (!owner || owner.remote || this.dead || !this.visible) return;';
  const next=once(part,guard,guard+`
    if (cloud) {
      // Same origin and reach as the native downward paint ray. Its 12 WU
      // reach remains INKWAVE calibration, not a verified Nintendo value.
      const top = cloud.group?.position?.y - 0.8;
      if (bossRainVerticalOverlap(this.model?.hitShapes, top - STORM_RAIN_REACH, top) === false) return;
    }`,'existing authority/visibility guard');
  code=code.slice(0,start)+next+code.slice(end);
  return "import { bossRainVerticalOverlap } from '../../patches/splatoon3/runtime/boss-storm-volume.mjs';\n"+
    "import { STORM_RAIN_REACH } from '../../patches/splatoon3/runtime/storm-effects.mjs';\n"+code;
}
