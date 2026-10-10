// Special movement must enforce the same world boundary as ordinary movement.
// Reuse the native clamp once, after collision resolution and before impact.
import {replaceOnce} from './input-adapter.mjs';
export function adaptSpecialBarrier(rel,code){
 if(rel!=='src/game/actor.js')return code;
 code=replaceOnce(code,'      this._resolve(false, py, stick);\n      return;',
  '      this._resolve(false, py, stick);\n      this._spawnBarrier();\n      return;','Storm movement spawn boundary');
 // The gauge runs after native resolution; boundary enforcement must precede
 // both the gauge forecast and impact, regardless of whether that layer exists.
 const gauge = '    updateTidalSlamGauge(this, s, sp, dt, G, PLAYER);\n';
 const tail = code.includes(gauge) ? gauge : "    if (s.phase === 'fall'";
 return replaceOnce(code, '    this._resolve(false, py, false);\n' + tail,
  '    this._resolve(false, py, false);\n    this._spawnBarrier();\n' + tail,
  'Slam movement boundary before impact');
}
