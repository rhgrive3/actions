// Unapplied candidate for shared-path review. Tests may load it as a VM-only
// source overlay; it does not edit the reserved runtime paths on disk.
export function candidateTransform(rel,code){
 if(rel==='patches/splatoon3/runtime/spawn-pose-motion.mjs')code+=`
export function spawnMotionAllowsAction(ch, nativeEligible) {
 const s=hooks(ch)?.states.get(ch);
 if(!s||ch.s3SpawnPoseMotionEnabled===false||ch.s3HitSpawnMotionEnabled===false)return nativeEligible;
 return s.phase==='off';
}
`;
 if(rel==='patches/splatoon3/runtime/spawn-pose-motion.mjs')code=code.replace("if (this.character) clear(this.character, 'reset');","if (this.character) { clear(this.character, 'reset'); this.character.wRoll = 0; }");
 if(['patches/splatoon3/runtime/roller.mjs','patches/splatoon3/runtime/roller-detail-motion.mjs'].includes(rel)){
  code="import { spawnMotionAllowsAction } from './spawn-pose-motion.mjs';\n"+code;
  code=code.replace('this.tr[T.T_SPAWN] >= 1.4','spawnMotionAllowsAction(this, this.tr[T.T_SPAWN] >= 1.4)')
   .replace('tr[T.T_SPAWN] < 1.4','!spawnMotionAllowsAction(ch, tr[T.T_SPAWN] >= 1.4)');
 }
 if(rel==='patches/splatoon3/runtime/respawn-lifecycle.mjs')code=code.replace("    const spawn = this.s3?.squidSpawn;",`
    const spawn = this.s3?.squidSpawn;
    // Observe genuine releases even while Squid Spawn owns the update.
    if (spawn && this.alive && this.s3.respawnRearm) {
      for (let i = 0; i < KEYS.length; i++) {
        const key = KEYS[i];
        if (!(this.s3.physicalRespawnHeld?.[key] ?? this.intent[key])) this.s3.respawnRearm.delete(key);
      }
      if (!this.s3.respawnRearm.size) delete this.s3.respawnRearm;
    }`);
 return code;
}
