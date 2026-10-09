// Special movement must enforce the same world boundary as ordinary movement.
// Reuse the native clamp once, after collision resolution and before impact.
import {replaceOnce} from './input-adapter.mjs';
export function adaptSpecialBarrier(rel,code){
 if(rel!=='src/game/actor.js')return code;
 code=replaceOnce(code,'      this._resolve(false, py, stick);\n      return;',
  '      this._resolve(false, py, stick);\n      this._spawnBarrier();\n      return;','Storm movement spawn boundary');
 return replaceOnce(code,"    this._resolve(false, py, false);\n    if (s.phase === 'fall'",
  "    this._resolve(false, py, false);\n    this._spawnBarrier();\n    if (s.phase === 'fall'",'Slam movement boundary before impact');
}
