import { stageKit } from './authoring.js';
export function build(meta, rule) {
  const k=stageKit(meta,rule,{bounds:[-28,28,-46,46],spawn:[6,7,-39],focus:[0,1,0]});
  k.floor('launch',-4,23,-44,-33,7,'brick');
  k.floor('upper-onsen',-13,22,-33,-26,4.6,'brick');
  k.ramp('long-onsen-slope',[7,0,-8],[7,4.6,-26],17,'brick');
  k.floor('left-garden',-24,-11,-26,-4,0,'brick');
  k.floor('right-terrace',16,25,-29,-11,2.3,'brick');
  k.ramp('terrace-ramp',[20,0,-5],[20,2.3,-14],6,'brick');
  k.floor('garden-link',-13,-1,-12,-3,0,'brick');
  k.cover('garden-wall',-16,-15,0,1.2,7,2.3,'plaster');
  k.cover('onsen-sign',17,-29,4.6,2.4,1.3,2,'wood');
  k.cover('low-rework-box',-20,-6,0,2.4,2.4,1.1,'uninkable');
  k.cover('slope-cover',9,-17,2.3,2,2,1,'uninkable');
  k.once(()=>{
    k.floor('central-court',-17,17,-8,8,0,'brick');
    if(rule==='clams') {
      k.box('clam-central-wall',-1,1,-4,4,0,1.4,'plaster');
      k.ramp('clam-central-ramp',[-7,0,0],[-1,1.4,0],5,'brick');
    } else if(rule!=='tower') k.cover('center-cover',0,0,0,3,3,1.2,'plaster');
  });
  if(rule==='rainmaker') k.ramp('goal-ramp',[0,3,-20],[0,4.6,-27],6,'brick');
  if(rule==='clams') k.box('basket-flat-landing',2,11,-22,-17,0,3,'brick');
  k.feature('long-descent',[7,2.3,-17],'A long descending slope; original 8.0 layout rework is not dimensionally calibrated.');
  return k.finish({battleAnchor:[0,0,-5],environment:'hot-spring',objectiveSpec:{zones:[{center:[0,0,0],size:[18,12]}],
    tower:{pathToA:[[0,0.6,0],[-8,0.6,-6],[7,1.2,-12],[7,3.1,-20],[7,4.8,-29]],checkpointIndices:[1,3]},
    rainmaker:{center:[0,1.2,0],checkpointsA:[[3,0,-7]],goalA:[0,4.6,-29]},
    clams:{basketA:[6,5.2,-19],spawnsA:[[-20,0,-20],[-8,0,-7],[7,1,-12],[20,2.3,-20]]}
  }});
}
