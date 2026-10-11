import { stageKit } from './authoring.js';
export function build(meta, rule) {
  const k=stageKit(meta,rule,{bounds:[-29,29,-56,56],spawn:[0,5.8,-48],focus:[0,1.1,0]});
  k.floor('launch',-10,10,-54,-42,5.8,'wood');
  k.floor('quarterdeck',-20,20,-42,-29,3,'wood');
  k.floor('main-deck',-23,23,-29,0,0,'wood');
  k.ramp('starboard-stairs',[15,0,-21],[15,3,-33],7,'wood');
  k.ramp('port-stairs',[-15,0,-21],[-15,3,-33],6,'wood');
  k.box('bunker-port-wall',-11,-9,-25,-13,0,3.3,'wood');
  k.box('bunker-starboard-wall',-1,1,-25,-13,0,3.3,'wood');
  k.deck('bunker-top',-11,1,-25,-13,3.3,'wood');
  k.ramp('bunker-access',[-5,0,-34],[-5,3.3,-25],8,'wood');
  k.cover('foremast',11,-23,0,1.4,1.4,11,'wood',{noNav:true});
  k.deck('foremast-grate',7,15,-26,-20,3.1,'grate');
  k.cover('deck-cargo',-17,-12,0,3.2,4,1.3,'wood');
  k.cover('starboard-cargo',17,-7,0,3.3,3.3,1.4,'wood');
  k.wall('port-bulwark',-24,-23,-40,0,0,0.9,'wood');
  k.wall('starboard-bulwark',23,24,-40,0,0,0.9,'wood');
  k.once(()=>{
    if(rule!=='rainmaker') k.cover('mainmast',0,0,0,1.7,1.7,13,'wood',{noNav:true});
    else k.cover('rainmaker-plinth',0,0,0,3.2,3.2,0.6,'wood');
    k.deck('mainmast-grate-west',-7,-1,-3,3,3.2,'grate');
    k.deck('mainmast-grate-east',1,7,-3,3,3.2,'grate');
  });
  if(rule==='rainmaker'||rule==='clams') k.ramp('boarding-ramp',[5,0,-24],[5,3,-33],7,'wood');
  if(rule==='tower') k.cover('tower-lane-crate',4,-14,0,3,3,1,'wood');
  if(rule==='zones') k.cover('zone-screen',-8,-4,0,2,2,1,'wood');
  return k.finish({battleAnchor:[4,0,-5],objectiveSpec:{zones:[{center:[0,0,0],size:[18,13]}],
    tower:{pathToA:[[4,0.5,0],[13,0.7,-12],[13,0.7,-23],[5,3.2,-32],[5,3.2,-36]],checkpointIndices:[1,2,3],holdSeconds:[5,5,4],timingVerified:false},
    rainmaker:{center:[0,0.6,0],checkpointsA:[[13,0,-19],[-5,3.3,-15]],goalA:[5,3,-36]},
    clams:{basketA:[-5,2.3,-28],spawnsA:[[-17,0,-20],[15,0,-17],[4,0,-9],[-16,3,-35]]}
  }});
}
