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
 code=replaceOnce(code,'this._updateSpecial(dt); this._finishFrame(dt); return;',
 'this._updateSpecial(dt); if (this._checkWaterHazard()) return; this._finishFrame(dt); return;','special movement water hazard');
 return replaceOnce(code,'this._startSpecial(); this._finishFrame(dt); return;',
 'this._startSpecial(); if (this._checkWaterHazard()) return; this._finishFrame(dt); return;','special activation water hazard');
}
