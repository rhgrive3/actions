import { stageKit } from './authoring.js';
export function build(meta, rule) {
  const k=stageKit(meta,rule,{bounds:[-30,30,-44,44],spawn:[-3,4.6,-36],focus:[0,0.6,0]});
  k.floor('launch',-13,9,-42,-30,4.6,'tile');
  k.floor('resort-entry',-20,15,-30,-20,2,'tile');
  k.floor('main-platform',-12,12,-20,-8,0.7,'tile');
  k.floor('right-island',13,25,-24,-8,0.7,'tile');
  k.deck('right-grate',10,17,-15,-10,0.7,'grate');
  k.ramp('entry-ramp',[4,0.7,-14],[4,2,-22],7,'tile');
  k.floor('left-island',-26,-17,-21,-9,0.7,'tile');
  k.deck('left-grate',-19,-10,-13,-9,0.7,'grate');
  k.cover('resort-cover',-7,-24,2,3,3,1.1,'plaster');
  k.cover('island-cover',20,-16,0.7,2.4,2.4,1.1,'plaster');
  k.once(()=>{
    k.floor('middle-platform',-11,11,-8,8,0.7,'tile');
    if(rule==='turf') k.box('raised-middle',-3,3,-3,3,0.7,1.7,'tile');
    // These platforms emerge after the Turf War water drop. They are not a solid pool-wide floor.
    k.floor('submerged-west',-23,-11,-8,8,-0.8,'tile',{flooded:true});
    k.floor('submerged-east',11,23,-8,8,-0.8,'tile',{flooded:true});
    k.ramp('west-pool-step',[-17,-0.8,-5],[-10,0.7,-5],5,'tile',{flooded:true});
    k.ramp('east-pool-step',[17,-0.8,5],[10,0.7,5],5,'tile',{flooded:true});
  });
  if(rule==='rainmaker'||rule==='clams') k.ramp('objective-descent',[-7,0.7,-16],[-7,2,-23],6,'tile');
  if(rule==='tower') k.cover('tower-cover',-7,-11,0.7,2.2,2.2,1,'plaster');
  k.feature('pool-water',[0,0,0],'Water drops after 90 elapsed Turf War seconds. Ranked objective triggers require the mode owner.');
  return k.finish({battleAnchor:[0,0.7,-5],hazard:{kind:'water',killY:-2,waterY:0.05},gimmicks:[{id:'mahi-water',type:'water-level',high:0.05,low:-1.6,turfDropSeconds:90,transitionSeconds:4,trigger:rule==='turf'?'elapsed-time':'mode-event',triggerVerified:rule==='turf',transitionVerified:false}],objectiveSpec:{zones:[{center:[0,0.7,0],size:[19,14]}],
    tower:{pathToA:[[0,1,0],[-6,1,-9],[-6,1,-17],[8,2.2,-23],[8,2.2,-27]],checkpointIndices:[1,2,3]},
    rainmaker:{center:[0,0.7,0],checkpointsA:[[19,0.7,-16],[-5,0.7,-15]],goalA:[3,2,-26]},
    clams:{basketA:[-7,4.2,-24],spawnsA:[[-6,0.7,-12],[6,0.7,-17],[20,0.7,-20],[-21,0.7,-17]]}
  }});
}
