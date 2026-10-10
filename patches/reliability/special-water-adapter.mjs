// Reuse ordinary water-death semantics after special-owned movement.
import {replaceOnce} from './input-adapter.mjs';
export function adaptSpecialWater(rel,code){
 if(rel!=='src/game/actor.js')return code;
 const start='    if (this.pos.y < P.fallDeathY && G.level.groundHeight(this.pos.x, this.pos.z, this.pos.y + 0.6) === -Infinity) {';
 const at=code.indexOf(start),end=code.indexOf('\n    }',at)+6;
 if(at<0||end<at)throw Error('Special water hazard anchor mismatch');
 const block=code.slice(at,end);
 // The composed _checkFallDeath helper is a boolean admission predicate.
 // Preserve its return value; the raw Actor.update block returns void.
 const handledReturn = /return true;/.test(block) ? 'true' : '';
 code=replaceOnce(code,block,`    if (this._checkWaterHazard()) return ${handledReturn};`,'ordinary water hazard owner');
 const method=block.replaceAll('P.fallDeathY','PLAYER.fallDeathY').replaceAll('P.waterY','PLAYER.waterY').replace('      return;','      return true;');
 code=replaceOnce(code,'  _nearCamera() {',`  _checkWaterHazard() {
    if (!this.alive) return true;
${method}
    return false;
  }

  _nearCamera() {`,'shared native water hazard');
 const plainMovement='this._updateSpecial(dt); this._finishFrame(dt); return;';
 const composedSlamRecoveryMovement="this._updateSpecial(dt); if (this.alive) { if (stormResources) updateResources(this, dt); else if (slamRecovery) updateHealthRecovery(this, dt, this.grounded && this.groundTeam === 2 && !this.submerged, this.submerged); else if (trizookaHealth) updateResources(this, dt); } if (this.alive) this._finishFrame(dt); return;";
 const composedSlamMovement="this._updateSpecial(dt); if (stormResources && this.alive) updateResources(this, dt); else if (slamRecovery && this.alive) updateHealthRecovery(this, dt, this.grounded && this.groundTeam === 2 && !this.submerged, this.submerged); if (this.alive) this._finishFrame(dt); return;";
 const composedMovement='this._updateSpecial(dt); if (stormResources && this.alive) updateResources(this, dt); if (this.alive) this._finishFrame(dt); return;';
 if(code.includes(composedSlamRecoveryMovement)) code=replaceOnce(code,composedSlamRecoveryMovement,
   "this._updateSpecial(dt); if (this.alive) { if (stormResources) updateResources(this, dt); else if (slamRecovery) updateHealthRecovery(this, dt, this.grounded && this.groundTeam === 2 && !this.submerged, this.submerged); else if (trizookaHealth) updateResources(this, dt); } if (this._checkWaterHazard()) return; if (this.alive) this._finishFrame(dt); return;",'special movement water hazard');
 else if(code.includes(composedSlamMovement)) code=replaceOnce(code,composedSlamMovement,
   "this._updateSpecial(dt); if (stormResources && this.alive) updateResources(this, dt); else if (slamRecovery && this.alive) updateHealthRecovery(this, dt, this.grounded && this.groundTeam === 2 && !this.submerged, this.submerged); if (this._checkWaterHazard()) return; if (this.alive) this._finishFrame(dt); return;",'special movement water hazard');
 else if(code.includes(composedMovement)) code=replaceOnce(code,composedMovement,
   'this._updateSpecial(dt); if (stormResources && this.alive) updateResources(this, dt); if (this._checkWaterHazard()) return; if (this.alive) this._finishFrame(dt); return;','special movement water hazard');
 else code=replaceOnce(code,plainMovement,
   'this._updateSpecial(dt); if (this._checkWaterHazard()) return; this._finishFrame(dt); return;','special movement water hazard');
 // #1164: an actor already below the lethal water boundary must not run
 // the active Special's fire/emission code *before* the existing post-motion
 // water check. Preserve the post-check for actors crossing water this tick.
 code=replaceOnce(code,
   'this._updateSpecial(dt);',
   'if (this._checkWaterHazard()) return; this._updateSpecial(dt);',
   'active special pre-shot water hazard');
 // Activation must also reject an already-drowned actor before consuming
 // Special or spawning a Storm device; post-activation check is retained.
 code=replaceOnce(code,
   'this._startSpecial();',
   'if (this._checkWaterHazard()) return; this._startSpecial();',
   'special activation pre-shot water hazard');
 const plainActivation='this._startSpecial(); this._finishFrame(dt); return;';
 const composedSlamRecoveryActivation="this._startSpecial(); if (this.alive) { if (this.specialActive?.id === 'storm') updateResources(this, dt); else if (this.specialActive?.id === 'slam') updateHealthRecovery(this, dt, this.grounded && this.groundTeam === 2 && !this.submerged, this.submerged); else if (this.specialActive?.id === 'trizooka' && !this.remote) updateResources(this, dt); } this._finishFrame(dt); return;";
 const composedSlamActivation="this._startSpecial(); if (this.alive && this.specialActive?.id === 'storm') updateResources(this, dt); else if (this.alive && this.specialActive?.id === 'slam') updateHealthRecovery(this, dt, this.grounded && this.groundTeam === 2 && !this.submerged, this.submerged); this._finishFrame(dt); return;";
 const composedActivation="this._startSpecial(); if (this.alive && this.specialActive?.id === 'storm') updateResources(this, dt); this._finishFrame(dt); return;";
 if(code.includes(composedSlamRecoveryActivation)) return replaceOnce(code,composedSlamRecoveryActivation,
   "this._startSpecial(); if (this.alive) { if (this.specialActive?.id === 'storm') updateResources(this, dt); else if (this.specialActive?.id === 'slam') updateHealthRecovery(this, dt, this.grounded && this.groundTeam === 2 && !this.submerged, this.submerged); else if (this.specialActive?.id === 'trizooka' && !this.remote) updateResources(this, dt); } if (this._checkWaterHazard()) return; this._finishFrame(dt); return;",'special activation water hazard');
 if(code.includes(composedSlamActivation)) return replaceOnce(code,composedSlamActivation,
   "this._startSpecial(); if (this.alive && this.specialActive?.id === 'storm') updateResources(this, dt); else if (this.alive && this.specialActive?.id === 'slam') updateHealthRecovery(this, dt, this.grounded && this.groundTeam === 2 && !this.submerged, this.submerged); if (this._checkWaterHazard()) return; this._finishFrame(dt); return;",'special activation water hazard');
 if(code.includes(composedActivation)) return replaceOnce(code,composedActivation,
   "this._startSpecial(); if (this.alive && this.specialActive?.id === 'storm') updateResources(this, dt); if (this._checkWaterHazard()) return; this._finishFrame(dt); return;",'special activation water hazard');
 return replaceOnce(code,plainActivation,
   'this._startSpecial(); if (this._checkWaterHazard()) return; this._finishFrame(dt); return;','special activation water hazard');
}
