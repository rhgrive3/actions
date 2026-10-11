import { stageKit } from './authoring.js';
export function build(meta, rule) {
  const k=stageKit(meta,rule,{bounds:[-27,27,-49,49],spawn:[4,6,-41],focus:[0,1,0]});
  k.floor('launch',-5,17,-47,-35,6,'steel');
  k.floor('first-court',-17,19,-35,-24,3,'concrete');
  k.floor('low-scrapyard',-17,18,-24,-7,0,'concrete');
  k.floor('left-flank',-25,-17,-28,4,0,'asphalt');
  k.floor('right-flank',18,25,-32,-1,1.2,'asphalt');
  k.ramp('main-descent',[10,0,-17],[10,3,-26],7,'steel');
  k.ramp('grate-ascent',[20,1.2,-18],[20,4.2,-29],5,'steel');
  k.deck('high-grate',14,24,-13,0,4.2,'grate');
  k.deck('high-grate-connection',18,24,-29,-13,4.2,'grate');
  k.box('scrap-perch',-12,-4,-12,-4,0,2.8,'container');
  k.deck('perch-grate',-4,14,-7,-3,2.8,'grate');
  k.cover('car-stack',-10,-28,3,4.5,5,2.2,'container');
  k.cover('scrap-box',4,-16,0,3.8,2.7,1.2,'container');
  k.cover('flank-shield',-21,-15,0,2.2,4.4,2,'steel');
  k.once(()=>{
    k.floor('middle-yard',-17,18,-7,7,0,'concrete');
    if(rule==='tower') k.cover('tower-block',0,0,0,3.2,3.2,0.6,'steel');
    else k.cover('middle-shield',1,0,0,3,4,1.1,'container');
  });
  if(rule==='zones') k.cover('zone-cover',12,-9,0,2,3,1,'steel');
  if(rule==='rainmaker'||rule==='clams') k.ramp('objective-invasion',[-9,0,-18],[-9,3,-27],6,'steel');
  k.feature('grate-lanes',[18,4.2,-8],'Raised grates remain non-paintable and permeable to shots and squid form.');
  return k.finish({battleAnchor:[0,0,-5],objectiveSpec:{zones:[{center:[0,0,0],size:[15,10]}],
    tower:{pathToA:[[0,0.8,0],[-3,0.8,-13],[9,0.8,-19],[9,3.2,-28],[-3,3.2,-31]],checkpointIndices:[1,2,3]},
    rainmaker:{center:[1,1.1,0],checkpointsA:[[8,0,-18],[-8,2.8,-8]],goalA:[-6,3,-30]},
    clams:{basketA:[-8,5.2,-28],spawnsA:[[8,0,-12],[-15,0,-18],[21,1.2,-21],[-21,0,-5]]}
  }});
}
