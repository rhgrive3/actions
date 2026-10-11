import { stageKit } from './authoring.js';
export function build(meta, rule) {
  const k=stageKit(meta,rule,{bounds:[-31,31,-49,49],spawn:[0,5.6,-42],focus:[0,1.5,0]});
  k.floor('launch',-16,20,-47,-35,5.6,'container');
  k.floor('spawn-trench',-14,15,-35,-22,0,'steel');
  k.floor('left-entry-ledge',-24,-14,-32,-14,2.6,'container');
  k.floor('right-entry-ledge',15,26,-34,-18,2.6,'container');
  k.floor('right-low-dock',16,29,-18,-2,0,'steel');
  k.floor('left-low-dock',-26,-14,-18,-2,0,'steel');
  k.floor('main-deck',-16,16,-22,0,0,'steel');
  k.ramp('left-arch-ramp',[-19,0,-18],[-19,2.6,-27],7,'steel');
  k.ramp('right-arch-ramp',[21,0,-15],[21,2.6,-23],7,'steel');
  k.box('arch-left-pillar',-14,-11,-25,-20,0,3.8,'container');
  if(rule!=='zones') k.box('arch-right-pillar',8,11,-25,-20,0,3.8,'container');
  k.deck('spawn-arch',-14,11,-25,-20,3.8,'container');
  k.box('right-island',18,26,-14,-6,0,2.8,'container');
  k.deck('island-grate',12,20,-10,-5,2.8,'grate');
  k.cover('cargo-cover',-8,-15,0,3.5,3.5,1.2,'container');
  k.ramp('central-arch-ascent',[9,0,-15],[9,3.8,-5],6,'steel');
  k.once(()=>{
    k.deck('central-arch-west',-16,-3,-4,4,3.8,'container');
    k.deck('central-arch-east',3,16,-4,4,3.8,'container');
    k.box('center-west-support',-16,-13,-4,4,0,3.8,'container');
    k.box('center-east-support',13,16,-4,4,0,3.8,'container');
    if(rule==='tower') k.box('tower-center-rise',-3,3,-3,3,0,0.5,'steel');
    else if(rule!=='zones') k.cover('center-bumper',0,0,0,1.6,1.6,1.3,'rubber');
  });
  if(rule==='rainmaker'||rule==='clams'||rule==='tower') k.deck('left-objective-grate',-22,-12,-15,-10,2.6,'grate');
  if(rule==='rainmaker') k.ramp('center-objective-ramp',[-9,0,-10],[-9,3.8,-3],6,'steel');
  if(rule==='clams') k.cover('basket-step',-16,-16,0,3,4,1.2,'container');
  return k.finish({battleAnchor:[0,0,-5],objectiveSpec:{zones:[{center:[0,0,0],size:[23,14]}],
    tower:{pathToA:[[0,0.8,0],[-9,4,-3],[-5,0.7,-13],[6,0.7,-23],[6,0.7,-31]],checkpointIndices:[1,3],holdSeconds:[7.5,5],timingVerified:false},
    rainmaker:{center:[0,1.3,0],checkpointsA:[[4,0,-18],[-20,2.6,-17]],goalA:[4,0,-31]},
    clams:{basketA:[-20,4.8,-16],spawnsA:[[-7,0,-18],[9,0,-17],[22,0,-4],[-22,0,-8]]}
  }});
}
