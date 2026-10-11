import { stageKit } from './authoring.js';
export function build(meta, rule) {
  const k=stageKit(meta,rule,{bounds:[-29,29,-50,50],spawn:[0,5.5,-43],focus:[0,2,0]});
  k.floor('launch',-9,10,-48,-36,5.5,'sandstone');
  k.floor('first-drop',-16,17,-36,-27,2.8,'sandstone');
  k.floor('approach',-14,16,-27,-10,0,'sandstone');
  k.floor('left-ridge',-24,-14,-32,-3,1.1,'sandstone');
  k.ramp('left-entry',[-18,0,-12],[-18,1.1,-22],6,'sandstone');
  k.floor('right-perch',14,24,-28,-12,2.8,'sandstone');
  k.ramp('right-ramp',[11,0,-16],[11,2.8,-27],6,'sandstone');
  k.wall('spawn-side',-16,-15,-36,-29,2.8,1.4,'uninkable');
  k.cover('approach-pillar',-7,-21,0,3,4,2.1,'sandstone');
  k.cover('left-crate',-19,-7,1.1,2.4,2.4,1.2,'steel');
  k.cover('right-crate',19,-18,2.8,2,3,1.2,'steel');
  k.once(()=>{
    k.floor('central-basin',-14,14,-10,10,0,'sandstone');
    k.floor('left-shoulder',-24,-14,-3,11,0,'sandstone');
    k.floor('right-shoulder',14,24,-11,3,0,'sandstone');
    if(rule==='tower') {k.floor('tower-plinth',-4,4,-4,4,0.65,'sandstone');}
    else {k.box('central-tower',-4.6,4.6,-4.6,4.6,0,3.6,'sandstone');}
  });
  if(rule!=='tower') k.deck('cross-grate',4.6,19,-2.5,2.5,3.6,'grate');
  else {k.ramp('tower-left-access',[-19,1.1,-12],[-19,2.8,-27],5,'sandstone');}
  if(rule==='rainmaker'||rule==='clams') k.ramp('objective-base-access',[6,0,-22],[6,2.8,-29],6,'sandstone');
  k.feature('central-tower',[0,3.6,0],'Climbable central rock; Tower Control lowers it. Dimensions are authored.');
  return k.finish({battleAnchor:[0,0,-8],objectiveSpec:{
    zones:[{center:[0,3.6,0],size:[9,9]}],
    tower:{pathToA:[[0,0.8,0],[8,0.8,-8],[8,1.2,-17],[-6,2.9,-29],[-6,2.9,-32]],checkpointIndices:[1,2,3],holdSeconds:[6,5,3],timingVerified:false},
    rainmaker:{center:[0,3.6,0],checkpointsA:[[19,2.8,-16],[-18,1.1,-16]],goalA:[6,2.8,-31]},
    clams:{basketA:[-9,5,-30],spawnsA:[[-10,0,-15],[5,0,-18],[-18,1.1,-18],[16,2.8,-20]]}
  }});
}
