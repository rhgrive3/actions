export function adaptGearSub(rel,code,replace){
 const patch=(before,after,label)=>{code=replace(code,before,after,'gear/sub: '+label);};
 if(rel==='src/game/actor.js'){
  patch('const wantSquid = intent.squid && !fireWins && !this.weaponRunner.busy();', 'const wantSquid = intent.squid && !intent.sub && !fireWins && !this.weaponRunner.busy();','sub press emerges before 10F ready');
 }
 if(rel==='src/game/weapons.js'){
  patch('    const bomb = SUB.bomb;', '    const bomb = subInkSpec(a, SUB.bomb);','actor-local sub cost');
  patch('if (c.t >= c.dur)', 'if (c.t + 1e-10 >= c.dur)','integer rain-duration boundary');
  patch('  throwStorm(a) {\n    const sp = SPECIALS.storm;', '  throwStorm(a) {\n    const sp = stormLaunchSpec(a, SPECIALS.storm);','actor storm launch snapshot');
  patch("beepT: 0, dir: new THREE.Vector3(vel.x, 0, vel.z).normalize()", "beepT: 0, s3StormDuration: sp.duration, dir: new THREE.Vector3(vel.x, 0, vel.z).normalize()",'duration before send');
  patch('  _spawnCloud(b) {\n    const sp = SPECIALS.storm;', '  _spawnCloud(b) {\n    const sp = stormCloudSpec(b, SPECIALS.storm);','immutable cloud duration');
  patch('ghostBomb(a, kind, px, py, pz, vx, vy, vz) {','ghostBomb(a, kind, px, py, pz, vx, vy, vz, metadata) {','optional storm metadata');
  patch('    b.ghost = true;\n    b.pos.set(px, py, pz);', "    b.ghost = true;\n    if (kind === 'storm' && Number.isFinite(metadata?.stormDuration)) b.s3StormDuration = Math.max(8, Math.min(10, metadata.stormDuration));\n    b.pos.set(px, py, pz);",'remote duration snapshot');
  return "import { subInkSpec } from '../../patches/splatoon3/runtime/sub-ready.mjs';\nimport { stormLaunchSpec, stormCloudSpec } from '../../patches/splatoon3/runtime/storm-power.mjs';\n"+code;
 }
 if(rel==='src/net/netmatch.js'){
  patch("r2(b.vel.y), r2(b.vel.z)]);", "r2(b.vel.y), r2(b.vel.z), b.kind === 'storm' ? { stormDuration: b.s3StormDuration } : null]);",'storm packet duration');
  patch('G.projectiles?.ghostBomb(a, e[3], e[4], e[5], e[6], e[7], e[8], e[9]);', 'G.projectiles?.ghostBomb(a, e[3], e[4], e[5], e[6], e[7], e[8], e[9], e[10]);','storm packet receive');
 }
 // Optional composition with the existing PR #259 implementation. Its
 // explicit vector owns Z/Y/inheritance; scale ONLY Z before pitch rotation.
 if(rel==='patches/splatoon3/runtime/sub-special-fidelity.mjs'){
  patch('  const horizontal = p.spawnSpeedZ * cp - p.spawnSpeedY * sp;', "  const spawnZ = p.spawnSpeedZ * (kind === 'storm' ? actor.s3?.stormPowerSnapshot?.throwScale ?? 1 : 1);\n  const horizontal = spawnZ * cp - p.spawnSpeedY * sp;",'PR259 special-power forward component');
  patch('  let vy = p.spawnSpeedZ * sp + p.spawnSpeedY * cp;', '  let vy = spawnZ * sp + p.spawnSpeedY * cp;','PR259 power pitch component');
 }
 return code;
}
