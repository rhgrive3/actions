// Legacy source locomotion can supply legs/carry, but cannot own the current
// weapon attack: alignWeapon otherwise discards native recoil and slosh retiming.
// Read actual action state; never restart attacks or write runner/gameplay clocks.
export function nativeWeaponPoseRequired(ch,input={}){
  const r=ch._runner?.(input),a=ch._owner?.();
  if(ch.dual)return true; // no Dualies upper body in the Wii U source bank
  if(ch.dance||ch.showcase||a?.alive===false||a?.specialActive)return true;
  // The first Charger input frame may still be in admission delay, before
  // firing/charge reaches AnimState. It still belongs to the native windup.
  if(a?.intent?.fire||a?.intent?.sub||input.firing||Number(input.charge)>0||r?.charging||r?.streaming||r?.aimingSub||r?.dodge)return true;
  if(ch.wSub>.001||ch.bombHeld||ch.bombSwap>.001)return true;
  if(r?.s3BlasterWindup>0||r?.slosh>=0||r?.flick>=0||r?.rolling)return true;
  if(ch.weaponKind==='charger')return ch.lastRelease<.4||r?.s3Stored>0;
  if(ch.weaponKind==='slosher')return ch.lastShot<Math.max(.5,a?.weapon?.fireInterval||0);
  return ch.lastShot<.25||ch.lockW>.001;
}
