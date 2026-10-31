// Residual source change after the existing adapters; no upstream snapshot edit.
export function adaptQueueWeapons20261031(rel, code) {
  if(rel!=='src/game/weapons.js')return code;
  const start=code.indexOf('  fireFlick(a, w) {'),end=code.indexOf('\n  fireCharger(',start);
  if(start<0||end<0)throw Error('weapon queue: legacy flick scope');
  let part=code.slice(start,end);
  const anchor='const up = clamp(a.aimPitch, -0.2, 0.5) + 0.32;';
  if(part.split(anchor).length!==2||part.split('Math.sin(up)').length!==3)throw Error('weapon queue: legacy flick sine anchors');
  part=part.replaceAll('Math.sin(up)','sinUp').replace(anchor,anchor+'\n    const sinUp = Math.sin(up);');
  return code.slice(0,start)+part+code.slice(end);
}
