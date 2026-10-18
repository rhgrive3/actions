// Optional presentation-only metadata. Gameplay timing is always reconstructed
// from the receiving client's pinned source row, never sender-supplied frames.
// [version, stepped(0/1), horizontal side(0/1)] leaves s3Catalog's5 fields intact.
export function encodeSaberSwingVisual(record,key,swing){
  if(record?.family!=='splatana'||!swing||swing.key!==key)return null;
  return [1,swing.stepped?1:0,swing.ordinal%2];
}
export function decodeSaberSwingVisual(record,key,charge,wire,fallbackOrdinal=0){
  if(record?.family!=='splatana'||!['saber-horizontal','saber-vertical'].includes(key))return null;
  const vertical=key==='saber-vertical',legacy=wire===undefined;
  let stepped=false,ordinal=fallbackOrdinal;
  if(!legacy){
    if(!Array.isArray(wire)||wire.length!==3||wire[0]!==1||![0,1].includes(wire[1])||![0,1].includes(wire[2]))return null;
    stepped=wire[1]===1;ordinal=wire[2];
    if(stepped&&!vertical||vertical&&!(charge+1e-9>=1)||!vertical&&charge>=1)return null;
  }
  const p=record.parameters.spl__WeaponSaberParam.SwingParam;
  const frames=vertical?(stepped?p.ChargeSwingStepShotBulletFrame:p.ChargeSwingShotBulletFrame):p.WeakSwingShotBulletFrame;
  //10F is the catalog's existing sparse step-addition interpretation for
  //Wiper/Stamper, not a recovered Nintendo default; Dental exports23F.
  const sourceExtra=Number.isFinite(p.ChargeSwingFrameStepAdd)?p.ChargeSwingFrameStepAdd:10;
  const duration=(vertical?p.ChargeSwingFrame:p.WeakSwingFrame)+(stepped?sourceExtra:0);
  if(!Number.isFinite(frames)||frames<0||frames>120||!Number.isFinite(duration)||duration<1||duration>180||frames>duration)return null;
  return {key,ordinal,stepped,ageOffset:frames/60,duration:duration/60,legacy};
}
