// Audio reads the amount admitted by the gameplay ink owner, not elapsed
// button-hold time or the decorative empty-tank charge animation. No cost,
// projectile, gauge or network state is changed here.
export function chargeAudioProgress(actor, progress=actor?.weaponRunner?.charge) {
  const q=Number.isFinite(progress)?Math.max(0,Math.min(1,progress)):0;
  const r=actor?.weaponRunner;
  const funded=actor?.remote!==true&&r?.charging?r?.s3ChargeAudioProgress:undefined;
  return Number.isFinite(funded)?Math.min(q,Math.max(0,Math.min(1,funded))):q;
}
