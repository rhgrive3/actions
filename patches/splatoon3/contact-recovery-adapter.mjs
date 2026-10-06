export function adaptContactRecovery(rel,code,replace){
 if(rel!=='src/game/weapons.js')return code;
 code=replace(code,'Math.abs(dy) < 1.2 && hs > 1.0) {','Math.abs(dy) < 1.2 && hs > 1.0 && rollerContactClear(a, e, w, G.physics, PLAYER)) {','roller stage-contact visibility');
 code=replace(code,'if (d > w.splashRadius) continue;','if (d > w.splashRadius * blasterPlayerRadiusRate(p, w)) continue;','blaster terrain-only player radius');
 return "import { rollerContactClear, blasterPlayerRadiusRate } from '../../patches/splatoon3/runtime/contact-recovery.mjs';\n"+code;
}
