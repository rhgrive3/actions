import { stageKit } from './authoring.js';
export function build(meta, rule) {
  const k=stageKit(meta,rule,{bounds:[-29,29,-48,48],spawn:[3,6,-41],focus:[0,2,0]});
  k.floor('launch',-8,17,-46,-34,6,'tile');
  k.floor('first-landing',-20,21,-34,-23,3.1,'tile');
  k.floor('lower-court',-25,24,-23,-7,0,'tile');
  k.ramp('right-main-entry',[16,0,-14],[16,3.1,-25],7,'tile');
  k.box('main-route-left-wall',-7,-5,-23,-8,0,3.2,'plaster');
  k.box('main-route-right-wall',5,7,-23,-8,0,3.2,'plaster');
  k.deck('raised-main-route',-7,7,-23,-7,3.2,'tile');
  k.ramp('lower-court-return',[-18,0,-17],[-18,3.1,-26],7,'tile');
  k.floor('left-courtyard',-27,-16,-12,2,0,'tile');
  k.cover('restaurant-shield',12,-28,3.1,3.5,2,1.4,'plaster');
  k.cover('court-planter',-14,-13,0,3.3,3.3,1.2,'plaster');
  k.once(()=>{
    k.floor('center-lower-court',-20,20,-7,7,0,'tile');
    k.deck('center-upper-crossing',-11,11,-5,5,3.2,'tile');
    if(rule!=='tower') k.cover('center-bumper',0,0,3.2,1.8,1.8,1.2,'rubber');
    k.box('center-crossing-support',-11,-9,-5,5,0,3.2,'plaster');
    k.box('center-crossing-support-east',9,11,-5,5,0,3.2,'plaster');
  });
  k.ramp('center-ramp',[16,0,-2],[10,3.2,-2],6,'tile');
  if(rule==='rainmaker'||rule==='clams'||rule==='tower') k.deck('center-new-grate',-20,-11,-4,1,3.2,'grate');
  if(rule==='rainmaker') k.ramp('goal-return',[9,0,-18],[9,3.1,-27],7,'tile');
  if(rule==='clams') k.cover('middle-box',5,-1,3.2,2.2,2.2,1.1,'plaster');
  return k.finish({battleAnchor:[0,3.2,-5],objectiveSpec:{zones:[{center:[0,3.2,0],size:[19,9]}],
    tower:{pathToA:[[0,3.5,0],[-16,0.6,-8],[-16,0.6,-18],[-16,3.3,-27],[-5,3.3,-30]],checkpointIndices:[1,2,3],holdSeconds:[5,4,4],timingVerified:false},
    rainmaker:{center:[0,4.4,0],checkpointsA:[[3,3.2,-17],[-17,0,-13]],goalA:[8,3.1,-29]},
    clams:{basketA:[12,5.3,-27],spawnsA:[[-20,0,-18],[16,0,-12],[0,0,-14],[-23,0,-6]]}
  }});
}
