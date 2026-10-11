import { stageKit } from './authoring.js';
export function build(meta, rule) {
  const k=stageKit(meta,rule,{bounds:[-33,33,-48,48],spawn:[0,6,-41],focus:[0,1,0]});
  k.floor('launch',-12,18,-46,-34,6,'concrete');
  k.floor('construction-entry',-19,21,-34,-23,3.2,'concrete');
  k.floor('lower-worksite',-24,25,-23,-8,0,'concrete');
  k.floor('left-low-worksite',-29,-20,-30,-1,0,'concrete');
  k.floor('right-low-worksite',20,29,-25,-2,0,'concrete');
  k.ramp('right-descent',[17,0,-16],[17,3.2,-26],7,'steel');
  k.ramp('left-descent',[-16,0,-17],[-16,3.2,-26],6,'steel');
  k.deck('right-grate-overlook',18,27,-25,-9,4.8,'grate');
  k.deck('base-grate',-19,-11,-35,-20,6,'grate');
  k.deck('diagonal-approach',-11,-4,-25,-8,4.8,'grate');
  k.box('bridge-pier-platform',-12,-3,-12,-5,0,4.8,'concrete');
  k.cover('sheet-cover',7,-18,0,4,2,1.6,'steel');
  k.cover('rebar-cover',-19,-15,0,3,5,1.2,'concrete');
  k.once(()=>{
    k.floor('central-worksite',-24,25,-8,8,0,'concrete');
    if(rule!=='tower') k.deck('center-cross-grate',-17,17,-3.5,3.5,4.8,'grate');
    else {
      k.deck('tower-cross-left',-17,-4,-3.5,3.5,4.8,'grate');
      k.deck('tower-cross-right',4,17,-3.5,3.5,4.8,'grate');
      k.cover('tower-plinth',0,0,0,3,3,0.6,'concrete');
    }
  });
  if(rule==='rainmaker'||rule==='clams') {
    k.box('objective-step',6,11,-24,-19,0,1.4,'concrete');
    k.box('objective-upper-step',6,11,-28,-24,0,2.6,'concrete');
    k.ramp('basket-ramp',[12,0,-19],[12,3.2,-26],5,'concrete');
  }
  if(rule==='zones') k.cover('zone-low-cover',-7,-4,0,2.5,2.5,1,'concrete');
  k.feature('sky-grate',[0,4.8,0],'The high grating has inkable lower ground beneath it, not an invisible void.');
  return k.finish({battleAnchor:[0,0,0],objectiveSpec:{zones:[{center:[0,0,0],size:[23,14]}],
    tower:{pathToA:[[0,0.9,0],[10,0.9,-10],[-7,5,-8],[-7,5,-21],[-7,3.5,-30]],checkpointIndices:[1,2,3],holdSeconds:[6,7.5,4],timingVerified:false},
    rainmaker:{center:[0,0,0],checkpointsA:[[9,0,-14],[-8,4.8,-8]],goalA:[-7,3.2,-30]},
    clams:{basketA:[10,5.4,-25],spawnsA:[[13,0,-15],[-17,0,-19],[22,0,-10],[-22,0,-6]]}
  }});
}
