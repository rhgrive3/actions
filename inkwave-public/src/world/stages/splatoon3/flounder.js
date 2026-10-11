import { stageKit } from './authoring.js';
export function build(meta, rule) {
  const k=stageKit(meta,rule,{bounds:[-30,30,-45,45],spawn:[-8,5.7,-38],focus:[0,3,0]});
  k.floor('launch',-21,3,-43,-32,5.7,'concrete');
  k.floor('apartment-plaza',-24,20,-32,-22,2.8,'concrete');
  k.floor('outer-alley',-25,-10,-22,-5,0,'asphalt');
  k.floor('inner-alley',-10,20,-22,-8,0,'asphalt');
  k.floor('right-steps',20,27,-29,-5,1.2,'concrete');
  k.ramp('plaza-descent',[-18,0,-16],[-18,2.8,-26],7,'concrete');
  k.ramp('roof-main-access',[-14,0,-16],[-14,4.1,-4],7,'concrete');
  k.box('west-apartment',-19,-3,-5,8,0,4.1,'plaster',{noPaint:[[1,0,0]]});
  k.cover('rooftop-unit',-14,3,4.1,2.5,3,1.2,'steel');
  k.cover('alley-tree-plinth',8,-14,0,3,3,0.8,'plaster');
  k.cover('spawn-parapet',-11,-28,2.8,5,1.2,1.3,'plaster');
  k.once(()=>{
    k.floor('under-grate-alley',-3,3,-8,8,0,'asphalt');
    k.floor('outer-center-west',-27,-19,-5,5,0,'asphalt');
    k.floor('outer-center-east',19,27,-5,5,0,'asphalt');
    k.deck('central-roof-grate',-3,3,-3,3,4.1,'grate');
  });
  if(rule==='zones') k.floor('filled-pit',-10,3,-22,-16,0,'asphalt');
  if(rule==='rainmaker'||rule==='clams') k.ramp('objective-plaza-entry',[8,0,-18],[8,2.8,-26],7,'concrete');
  if(rule==='tower') k.cover('tower-lane-cover',-20,-14,0,2,2,1.2,'plaster');
  k.feature('rooftops',[0,4.1,0],'Two lowered apartment roofs joined by a grate, with a ground-level alley underneath.');
  return k.finish({battleAnchor:[0,0,0],objectiveSpec:{zones:[{center:[-10,4.1,1],size:[12,10]},{center:[10,4.1,-1],size:[12,10]}],
    tower:{pathToA:[[0,4.4,0],[-12,4.4,-3],[-14,2.4,-10],[-14,0.7,-19],[7,3,-27]],checkpointIndices:[1,2,3],holdSeconds:[5,6.5,6],timingVerified:false},
    rainmaker:{center:[0,4.1,0],checkpointsA:[[-14,2.1,-10],[9,0,-17]],goalA:[8,2.8,-27]},
    clams:{basketA:[-16,2.3,-17],spawnsA:[[0,0,-14],[15,0,-16],[-11,4.1,3],[-22,0,-13]]}
  }});
}
