// Reuse ordinary water-death semantics after special-owned movement.
import {replaceOnce} from './input-adapter.mjs';
export function adaptSpecialWater(rel,code){
 if(rel!=='src/game/actor.js')return code;
 const start='    if (this.pos.y < P.fallDeathY && G.level.groundHeight(this.pos.x, this.pos.z, this.pos.y + 0.6) === -Infinity) {';
 const at=code.indexOf(start),end=code.indexOf('\n    }',at)+6;
 if(at<0||end<at)throw Error('Special water hazard anchor mismatch');
 const block=code.slice(at,end);
 code=replaceOnce(code,block,'    if (this._checkWaterHazard()) return;','ordinary water hazard owner');
 const method=block.replaceAll('P.fallDeathY','PLAYER.fallDeathY').replaceAll('P.waterY','PLAYER.waterY').replace('      return;','      return true;');
 code=replaceOnce(code,'  _nearCamera() {',`  _checkWaterHazard() {
    if (!this.alive) return true;
${method}
    return false;
  }

  _nearCamera() {`,'shared native water hazard');
 const plainMovement='this._updateSpecial(dt); this._finishFrame(dt); return;';
 const composedMovement='this._updateSpecial(dt); if (stormResources && this.alive) updateResources(this, dt); if (this.alive) this._finishFrame(dt); return;';
 const composedRecoveryMovement='this._updateSpecial(dt); if (this.alive) { if (stormResources) updateResources(this, dt); else if (trizookaHealth) updateSpecialHealthRecovery(this, dt); } if (this.alive) this._finishFrame(dt); return;';
 if(code.includes(composedRecoveryMovement)) code=replaceOnce(code,composedRecoveryMovement,
   'this._updateSpecial(dt); if (this.alive) { if (stormResources) updateResources(this, dt); else if (trizookaHealth) updateSpecialHealthRecovery(this, dt); } if (this._checkWaterHazard()) return; if (this.alive) this._finishFrame(dt); return;','special movement water hazard');
 else if(code.includes(composedMovement)) code=replaceOnce(code,composedMovement,
   'this._updateSpecial(dt); if (stormResources && this.alive) updateResources(this, dt); if (this._checkWaterHazard()) return; if (this.alive) this._finishFrame(dt); return;','special movement water hazard');
 else code=replaceOnce(code,plainMovement,
   'this._updateSpecial(dt); if (this._checkWaterHazard()) return; this._finishFrame(dt); return;','special movement water hazard');
 const plainActivation='this._startSpecial(); this._finishFrame(dt); return;';
 const composedActivation="this._startSpecial(); if (this.alive && this.specialActive?.id === 'storm') updateResources(this, dt); this._finishFrame(dt); return;";
 const composedRecoveryActivation="this._startSpecial(); if (this.alive) { if (this.specialActive?.id === 'storm') updateResources(this, dt); else if (this.specialActive?.id === 'trizooka' && !this.remote) updateSpecialHealthRecovery(this, dt); } this._finishFrame(dt); return;";
 if(code.includes(composedRecoveryActivation)) return replaceOnce(code,composedRecoveryActivation,
   "this._startSpecial(); if (this.alive) { if (this.specialActive?.id === 'storm') updateResources(this, dt); else if (this.specialActive?.id === 'trizooka' && !this.remote) updateSpecialHealthRecovery(this, dt); } if (this._checkWaterHazard()) return; this._finishFrame(dt); return;",'special activation water hazard');
 if(code.includes(composedActivation)) return replaceOnce(code,composedActivation,
   "this._startSpecial(); if (this.alive && this.specialActive?.id === 'storm') updateResources(this, dt); if (this._checkWaterHazard()) return; this._finishFrame(dt); return;",'special activation water hazard');
 return replaceOnce(code,plainActivation,
   'this._startSpecial(); if (this._checkWaterHazard()) return; this._finishFrame(dt); return;','special activation water hazard');
}
