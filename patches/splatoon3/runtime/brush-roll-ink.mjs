// S3 11.3.0 WeaponBrushMini.WeaponRollParam.NoOpInkEffect=true.
// The verification Wiki's Inkbrush test describes moving with ZR held over
// enemy ink (including turns / brush against a wall): no slow or floor damage.
// Other Brushes do not export this capability. A held but stationary brush,
// a swing, a sub/special, and an airborne body are separate actions.
export function brushRollIgnoresEnemyInk(a) {
  const runner=a?.weaponRunner;
  return a?.weapon?.catalogRecord?.parameters?.WeaponRollParam?.NoOpInkEffect===true &&
    a.alive!==false && a.form==='kid' && a.grounded && !a.climbing &&
    !a.specialActive && !a.superJumpState && a.ink>0 &&
    !!runner?.rolling && !runner.aimingSub && !runner.catalogState?.pending &&
    !!a.intent?.fire && !a.intent.sub &&
    Math.hypot(a.intent.move?.x||0,a.intent.move?.z||0)>1e-9 &&
    Math.hypot(a.vel?.x||0,a.vel?.z||0)>1e-9;
}
