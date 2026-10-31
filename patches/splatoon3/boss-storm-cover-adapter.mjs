// Separate unpublished cover proposal; current1956 finite-height guard stays.
export function adaptBossStormCover(rel, code) {
  if (rel !== 'src/boss/boss.js') return code;
  const mark = 'bossRainFullyCovered(this.model?.hitShapes';
  if (code.includes(mark)) throw Error('Boss rain cover: repeated transform');
  const anchor = '    if (Math.hypot(this.pos.x - cx, this.pos.z - cz) > R + 2.4) return;';
  if (code.split(anchor).length !== 2 || !code.includes('rain(owner, cx, cz, R, dmg, cloud = null)')) throw Error('Boss rain cover: expected current native rain owner');
  return "import { bossRainFullyCovered } from '../../patches/splatoon3/runtime/boss-storm-cover.mjs';\n" + code.replace(anchor, anchor + `
    if (cloud) {
      const top = cloud.group?.position?.y - 0.8;
      if (bossRainFullyCovered(this.model?.hitShapes, G.physics, top - STORM_RAIN_REACH, top) === true) return;
    }`);
}
