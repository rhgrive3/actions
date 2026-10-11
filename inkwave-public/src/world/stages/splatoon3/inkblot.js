import { stageKit } from './authoring.js';
export function build(meta, rule) {
  const k=stageKit(meta,rule,{bounds:[-31,31,-48,48],spawn:[4,5.6,-40],focus:[0,1,0]});
  k.floor('launch',-6,16,-46,-34,5.6,'brick');
  k.floor('campus-court',-18,22,-34,-23,2.8,'tile');
  k.floor('main-entry',-16,17,-23,-8,0,'tile');
  k.floor('left-sculpture-garden',-27,-16,-23,3,0,'tile');
  k.floor('right-garden',17,27,-30,-4,0,'tile');
  k.ramp('main-ramp',[11,0,-16],[11,2.8,-25],7,'tile');
  k.ramp('garden-ramp',[-13,0,-16],[-13,2.8,-25],5,'uninkable');
  k.box('snipe-block',-8,-1,-18,-10,0,2.6,'plaster');
  k.cover('hand-plinth',21,-20,0,3,3,1.7,'plaster');
  k.cover('wall-canvas',-12,-28,2.8,4,1.2,2,'plaster');
  k.cover('middle-shield',10,-7,0,3,2.5,1.1,'plaster');
  k.once(()=>{
    k.floor('central-court',-16,17,-8,8,0,'tile');
    if(rule!=='rainmaker') k.box('central-exhibit',-4,4,-4,4,0,1.7,'plaster');
    else k.box('rainmaker-plinth',-2,2,-2,2,0,0.6,'plaster');
  });
  if(rule==='rainmaker'||rule==='clams') k.ramp('goal-entry',[-6,0,-18],[-6,2.8,-27],7,'tile');
  if(rule==='tower') k.cover('checkpoint-cover',-12,-14,0,2,3,1.2,'plaster');
  if(rule==='zones') k.cover('zone-front-cover',0,-10,0,2,2,0.8,'plaster');
  return k.finish({battleAnchor:[0,0,-7],objectiveSpec:{zones:[{center:[0,1.7,0],size:[8,8]}],
    tower:{pathToA:[[0,2,0],[-8,0.5,-8],[-10,0.7,-18],[8,3,-27],[8,3,-31]],checkpointIndices:[1,2,3],holdSeconds:[5,5,4],timingVerified:false},
    rainmaker:{center:[0,0.6,0],checkpointsA:[[11,0,-15]],goalA:[-5,2.8,-30]},
    clams:{basketA:[-5,5,-28],spawnsA:[[-20,0,-15],[7,0,-15],[21,0,-12],[-12,2.8,-31]]}
  }});
}
