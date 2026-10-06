// Reset must retire the attacker together with the cancelled damage timer.
export function adaptScreenfxDamageReset(rel, code, once) {
  if (rel !== 'src/fx/screenfx.js') return code;
  return once(code,
    'jump: null, dmgAcc: 0, dmgT: 0 });',
    'jump: null, dmgAcc: 0, dmgT: 0, dmgAng: null, dmgAtk: null });',
    'ScreenFX reset releases pending damage attacker');
}
