import { stageKit } from './authoring.js';
export function build(meta, rule) {
  const k=stageKit(meta,rule,{bounds:[-32,32,-47,47],spawn:[0,5.8,-40],focus:[0,1,0]});
  k.floor('launch',-12,19,-45,-34,5.8,'tile');
  k.floor('main-landing',-21,19,-34,-23,3,'tile');
  k.floor('spawn-pit',-17,14,-23,-12,0,'tile');
  k.floor('central-approach',-19,19,-12,0,1.2,'tile');
  k.floor('left-rework-pit',-28,-19,-20,-2,0,'tile');
  k.floor('right-high-shopfront',19,28,-32,-16,4,'uninkable');
  k.deck('right-bridge',12,24,-17,-11,3,'tower'===rule?'glass':'wood');
  k.ramp('pit-main-ramp',[9,0,-19],[9,1.2,-12],7,'tile');
  k.ramp('pit-return',[-8,0,-18],[-8,3,-26],6,'tile');
  k.ramp('rework-left-entry',[-24,0,-11],[-18,1.2,-11],6,'tile');
  k.box('snipe-stack',-7,1,-15,-8,1.2,3.7,'tile');
  k.ramp('snipe-ramp',[-4,1.2,-21],[-4,3.7,-14],6,'tile');
  k.deck('snipe-grate',-21,-7,-11,-7,3.7,'grate');
  k.cover('rework-pole',-23,-15,0,0.8,0.8,6,'steel',{noNav:true});
  k.cover('shop-sign',9,-28,3,3.2,1.2,2.3,'plaster');
  k.once(()=>{
    if(rule==='clams') k.cover('small-center-box',0,0,1.2,3,4,1.2,'plaster');
    else if(rule!=='tower') {
      k.turned('diagonal-center-box',0,0,4.5,9,1.2,3.1,35,'plaster');
      k.turned('center-step-west',-4,-1,2,4,1.2,2,35,'plaster');
      k.turned('center-step-east',4,1,2,4,1.2,2,35,'plaster');
    }
  });
  if(rule==='rainmaker') k.ramp('pedestal-stair',[10,0,-20],[10,3,-26],6,'uninkable');
  if(rule==='clams') k.ramp('basket-approach',[-9,0,-19],[-9,0.8,-16],5,'tile');
  k.feature('renovated-bridge',[18,3,-14],'Wooden bridge in Turf/Zones; the Tower layout uses uninkable glass.');
  return k.finish({battleAnchor:[9,1.2,0],objectiveSpec:{zones:[{center:[0,1.2,0],size:[22,15]}],
    tower:{pathToA:[[0,1.6,0],[-11,1.6,-6],[-13,0.5,-17],[-9,3.2,-27],[-9,3.2,-30]],checkpointIndices:[1,3]},
    rainmaker:{center:[0,3.1,0],checkpointsA:[[9,1.2,-11]],goalA:[10,3,-29]},
    clams:{basketA:[-9,3,-17],spawnsA:[[11,0,-18],[-13,0,-17],[-24,0,-8],[10,1.2,-7]]}
  }});
}
