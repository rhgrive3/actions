import { stageKit } from './authoring.js';
export function build(meta, rule) {
  const k=stageKit(meta,rule,{bounds:[-29,29,-48,48],spawn:[-4,5,-41],focus:[0,0.5,0]});
  k.floor('launch',-14,7,-46,-35,5,'concrete');
  k.floor('market-entry',-19,16,-35,-24,2.1,'concrete');
  k.floor('main-market',-15,15,-24,-7,0,'concrete');
  k.floor('under-tents',15,25,-30,-3,0,'concrete');
  k.floor('left-stalls',-24,-15,-29,1,0.9,'concrete');
  k.ramp('main-drop-ramp',[6,0,-17],[6,2.1,-25],8,'concrete');
  k.ramp('left-stall-ramp',[-19,0,-8],[-19,0.9,-16],6,'concrete');
  k.deck('tent-walk',15,24,-25,-8,3.6,'uninkable');
  for(const [i,z] of [-23,-10].entries()) k.cover(`tent-post-${i}`,16,z,0,0.45,0.45,3.6,'steel',{noNav:true});
  k.cover('market-sign',-8,-28,2.1,2.2,2.2,2,'steel');
  k.cover('vegetable-bin',-10,-14,0,3.4,2.4,1,'plaster');
  k.cover('fish-bin',8,-11,0,2,4,1.2,'steel');
  k.once(()=>{
    k.floor('central-market',-15,15,-7,7,0,'concrete');
    k.floor('central-slab',-6,6,-5,5,0.5,'concrete');
    if(rule!=='tower') k.cover('middle-crate',0,0,0.5,2.8,2.8,1,'plaster');
  });
  if(rule==='tower') k.cover('tower-cover',-5,-9,0,2,2,1.2,'steel');
  if(rule==='rainmaker'||rule==='clams') k.ramp('deep-entry',[12,0,-21],[12,2.1,-27],5,'concrete');
  if(rule==='zones') k.cover('zone-side-cover',-17,-3,0.9,2.2,2.2,1.1,'plaster');
  return k.finish({battleAnchor:[0,0.5,-4],objectiveSpec:{zones:[{center:[0,0.5,0],size:[12,10]}],
    tower:{pathToA:[[0,0.7,0],[-7,0.7,-8],[-7,0.7,-19],[6,2.2,-28],[6,2.2,-32]],checkpointIndices:[1,2,3]},
    rainmaker:{center:[0,1.5,0],checkpointsA:[[8,0,-18],[-19,0.9,-13]],goalA:[6,2.1,-31]},
    clams:{basketA:[4,4.3,-29],spawnsA:[[-11,0,-17],[12,0,-18],[20,0,-15],[-20,0.9,-22]]}
  }});
}
