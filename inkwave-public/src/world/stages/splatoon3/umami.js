import { stageKit } from './authoring.js';
export function build(meta, rule) {
  const k=stageKit(meta,rule,{bounds:[-33,33,-48,48],spawn:[0,5.8,-41],focus:[0,0.8,0]});
  k.floor('launch',-11,21,-46,-34,5.8,'sandstone');
  k.floor('temple-entry',-20,24,-34,-23,3,'sandstone');
  k.ramp('temple-descent',[7,0,-9],[7,3,-24],14,'sandstone');
  k.floor('left-excavation',-28,-13,-29,-7,0,'sandstone');
  k.floor('right-walkway',15,28,-27,-6,1.2,'sandstone');
  k.ramp('right-walkway-ramp',[21,1.2,-18],[21,3,-26],6,'sandstone');
  k.ramp('pit-return',[-19,0,-19],[-19,3,-28],6,'sandstone');
  k.deck('pit-grate',-24,-18,-11,-2,3,'grate');
  k.octagon('round-lookout',18,-10,6,0,2.4,'sandstone');
  k.floor('lookout-extension',12,25,-8,-1,0,'sandstone');
  k.cover('excavation-screen',-21,-15,0,1.1,6,2.2,'sandstone');
  k.cover('artifact-plinth',-8,-28,3,3,3,1.5,'sandstone');
  k.once(()=>{
    k.octagon('circular-center',0,0,20,-3,0,'sandstone');
    k.box('central-rectangle',-4,4,-7,7,0,1.8,'sandstone',rule==='zones'?{noPaint:[[-1,0,0],[1,0,0]]}:{});
    k.ramp('center-step-west',[-9,0,0],[-4,1.8,0],6,'uninkable');
    k.ramp('center-step-east',[9,0,0],[4,1.8,0],6,'uninkable');
    if(rule!=='tower') k.cover('central-bumper',0,0,1.8,1.5,1.5,1,'rubber');
  });
  if(rule==='rainmaker'||rule==='clams') k.deck('expanded-pit-grate',-24,-18,-22,-11,3,'grate');
  if(rule==='tower') k.cover('invasion-block',-5,-25,0,4,4,1.1,'sandstone');
  else k.ramp('left-main-entry',[-8,0,-17],[-8,3,-26],7,'sandstone');
  if(rule==='clams') k.cover('clam-cover',-10,-4,0,2.4,4,2.5,'sandstone',{noPaint:[[1,0,0],[0,0,1],[0,0,-1]]});
  return k.finish({battleAnchor:[-10,0,0],objectiveSpec:{zones:[{center:[-10,0,-2],size:[9,11]},{center:[10,0,2],size:[9,11]}],
    tower:{pathToA:[[0,2.1,0],[0,0.7,-8],[9,1.8,-17],[18,3.2,-25],[8,3.2,-29]],checkpointIndices:[1,2,3]},
    rainmaker:{center:[0,2.8,0],checkpointsA:[[7,0.3,-10]],goalA:[-7,3,-29]},
    clams:{basketA:[18,4.6,-10],spawnsA:[[-18,0,-12],[9,1,-14],[21,1.2,-22],[-10,0,-8]]}
  }});
}
