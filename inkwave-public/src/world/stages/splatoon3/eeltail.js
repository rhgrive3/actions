import { stageKit } from './authoring.js';
export function build(meta, rule) {
  const k=stageKit(meta,rule,{bounds:[-24,24,-56,56],spawn:[-4,5,-48],focus:[0,1.5,0]});
  k.floor('launch',-13,7,-54,-42,5,'asphalt');
  k.floor('courtyard',-16,15,-42,-27,2,'asphalt');
  k.floor('lower-alley',-16,14,-27,-6,0,'asphalt');
  k.floor('right-court',14,21,-35,-6,0,'asphalt');
  k.ramp('courtyard-stair',[10,0,-22],[10,2,-30],7,'plaster');
  k.ramp('bridge-entry',[1,0,-23],[1,3.2,-11],5,'concrete');
  k.deck('bridge-arm',-2.5,2.5,-11,-5,3.2,'concrete');
  k.wall('outer-left',-19,-17,-40,-10,0,3,'brick');
  k.wall('alley-divider',7,8,-20,-10,0,2.2,'uninkable');
  k.cover('corner-kiosk',-10,-31,2,3,4,2.1,'plaster');
  k.cover('alley-block',-8,-16,0,3,5,1.3,'plaster');
  k.deck('balcony',-16,-9,-10,2,2,'concrete');
  k.ramp('balcony-access',[-12,0,-19],[-12,2,-10],5,'concrete');
  k.once(()=>{
    k.floor('under-bridge',-17,17,-6,6,0,'asphalt');
    if(rule==='turf') k.deck('central-bridge',-2.5,2.5,-5,5,3.2,'concrete');
    else if(rule==='rainmaker'||rule==='clams') k.turned('lowered-diagonal-bridge',0,0,5,13,1.3,1.8,-20,'concrete');
    else if(rule==='tower') k.box('tower-island',-3,3,-3,3,0,0.65,'concrete');
    if(rule==='zones') k.turned('zone-divider',0,0,0.55,7,0,1.4,35,'uninkable');
  });
  if(rule==='rainmaker'||rule==='clams') {
    k.ramp('objective-left-entry',[-10,0,-23],[-10,2,-29],6,'concrete');
    k.ramp('low-bridge-link',[0,0,-8],[0,1.8,-4],5,'concrete');
  }
  k.feature('bridge',[0,3.2,0],'Turf War bridge and a lower street; Zones removes the middle span.');
  return k.finish({battleAnchor:[-6,0,0],objectiveSpec:{
    zones:[{center:[0,0,0],size:[22,11]}],
    tower:{pathToA:[[0,0.8,0],[5,0.8,-10],[5,0.8,-22],[-4,2.2,-30],[-4,2.2,-38]],checkpointIndices:[1,2,3],holdSeconds:[4,6,6],timingVerified:false},
    rainmaker:{center:[0,1.8,0],checkpointsA:[[1,3.2,-10],[-5,2,-31]],goalA:[-4,2,-38]},
    clams:{basketA:[-4,4.2,-31],spawnsA:[[-8,0,-12],[17,0,-15],[4,2,-34],[-13,2,-5]]}
  }});
}
