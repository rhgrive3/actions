export function adaptGearSub(rel,code,replace){
 const patch=(before,after,label)=>{code=replace(code,before,after,'gear/sub: '+label);};
 if(rel==='src/main.js'){
  if(code.includes('    const frame = hudFrameSnapshot(')){
   patch('showMinimap, PLAYER, SUB, SUB.bomb.inkCost', 'showMinimap, PLAYER, SUB, subInkSpec(a, SUB.bomb).inkCost', 'equipped persistent HUD sub cost');
  }else{
  patch('    const frame = {\n      time: m.time,', '    const subCost = subInkSpec(a, SUB.bomb).inkCost;\n    const frame = {\n      time: m.time,','equipped HUD sub cost');
  patch('subCost: SUB.bomb.inkCost / PLAYER.inkMax,', 'subCost: subCost / PLAYER.inkMax, subReady: a.ink >= subCost,','raw admission and normalized mark');
  patch('ink: frame.ink, subCost: frame.subCost });', 'ink: frame.ink, subCost: frame.subCost, subReady: frame.subReady });','same readiness for mobile');
  }
  return "import { subInkSpec } from '../patches/splatoon3/runtime/sub-ready.mjs';\n"+code;
 }
 if(rel==='src/ui/hud.js'){
  patch('    const aim = !!(a && a.alive && a.weaponRunner && a.weaponRunner.aimingSub) || !!f.subAim;',
   "    const costPct = Math.round((f.subCost ?? .7) * 100);\n    if (L.subCostPct !== costPct) { L.subCostPct = costPct; this.subChip.querySelector('b').textContent = costPct + '%'; }\n    const aim = !!(a && a.alive && a.weaponRunner && a.weaponRunner.aimingSub) || !!f.subAim;",'live numeric label');
  patch('const ok = (f.ink ?? 1) >= (f.subCost ?? 0.7) - 1e-3;', 'const ok = f.subReady ?? ((f.ink ?? 1) >= (f.subCost ?? 0.7));','exact sub aim admission');
  patch('const nosub = sub > 0 && ink < sub;', 'const nosub = sub > 0 && !(f.subReady ?? (ink >= sub));','tank readiness shares raw admission');
 }
 if(rel==='src/core/mobile.js'){
  patch('ink = 1, subCost = 0.7 } = {}) {', 'ink = 1, subCost = 0.7, subReady = null } = {}) {','optional actor readiness input');
  patch('const noSub = ink < subCost - 1e-3;', 'const noSub = !(subReady ?? (ink >= subCost));','exact mobile sub admission');
 }
 if(rel==='src/game/actor.js'){
  patch('const wantSquid = intent.squid && !fireWins && !this.weaponRunner.busy() && !chargerSwimLocked(this);', 'const wantSquid = intent.squid && !intent.sub && !fireWins && !this.weaponRunner.busy() && !chargerSwimLocked(this);','sub press + charger swim gate composition');
 }
 if(rel==='src/game/weapons.js'){
  patch('  throwBomb(a) {\n    const b = SUB.bomb;', '  throwBomb(a) {\n    const b = subThrowSpec(a, SUB.bomb);','actor-local bomb launch speed');
  patch('this.throwVelocity(a, SUB.bomb.throwSpeed, vel);','this.throwVelocity(a, subThrowSpec(a, SUB.bomb).throwSpeed, vel);','same equipped speed for arc');
  patch('    const bomb = SUB.bomb;', '    const bomb = subInkSpec(a, SUB.bomb);','actor-local sub cost');
  patch('if (c.t >= c.dur)', 'if (c.t + 1e-10 >= c.dur)','integer rain-duration boundary');
  patch('  throwStorm(a) {\n    const sp = SPECIALS.storm;', '  throwStorm(a) {\n    const sp = stormLaunchSpec(a, SPECIALS.storm);','actor storm launch snapshot');
  patch("beepT: 0, dir: new THREE.Vector3(vel.x, 0, vel.z).normalize()", "beepT: 0, s3StormDuration: sp.duration, dir: new THREE.Vector3(vel.x, 0, vel.z).normalize()",'duration before send');
  patch('  _spawnCloud(b) {\n    const sp = SPECIALS.storm;', '  _spawnCloud(b) {\n    const sp = stormCloudSpec(b, SPECIALS.storm);','immutable cloud duration');
  patch('ghostBomb(a, kind, px, py, pz, vx, vy, vz) {','ghostBomb(a, kind, px, py, pz, vx, vy, vz, metadata) {','optional storm metadata');
  patch('    b.ghost = true;\n    b.pos.set(px, py, pz);', "    b.ghost = true;\n    if (kind === 'storm' && Number.isFinite(metadata?.stormDuration)) b.s3StormDuration = Math.max(8, Math.min(10, metadata.stormDuration));\n    b.pos.set(px, py, pz);",'remote duration snapshot');
  return "import { subInkSpec, subThrowSpec } from '../../patches/splatoon3/runtime/sub-ready.mjs';\nimport { stormLaunchSpec, stormCloudSpec } from '../../patches/splatoon3/runtime/storm-power.mjs';\n"+code;
 }
 if(rel==='src/net/netmatch.js'){
  patch("r2(b.vel.y), r2(b.vel.z)]);", "r2(b.vel.y), r2(b.vel.z), b.kind === 'storm' ? { stormDuration: b.s3StormDuration } : null]);",'storm packet duration');
  patch('G.projectiles?.ghostBomb(a, e[3], e[4], e[5], e[6], e[7], e[8], e[9]);', 'G.projectiles?.ghostBomb(a, e[3], e[4], e[5], e[6], e[7], e[8], e[9], e[10]);','storm packet receive');
 }
 // Optional composition with the existing PR #259 implementation. Its
 // explicit vector owns Z/Y/inheritance; scale ONLY Z before pitch rotation.
 if(rel==='patches/splatoon3/runtime/sub-special-fidelity.mjs'){
  patch('  const horizontal = p.spawnSpeedZ * cp - p.spawnSpeedY * sp;', "  const spawnZ = p.spawnSpeedZ * (kind === 'storm' ? actor.s3?.stormPowerSnapshot?.throwScale ?? 1 : actor.s3?.modifiers?.subPower ?? 1);\n  const horizontal = spawnZ * cp - p.spawnSpeedY * sp;",'PR259 sub/special forward component');
  patch('  let vy = p.spawnSpeedZ * sp + p.spawnSpeedY * cp;', '  let vy = spawnZ * sp + p.spawnSpeedY * cp;','PR259 power pitch component');
 }
 return code;
}
