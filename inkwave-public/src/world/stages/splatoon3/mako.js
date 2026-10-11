import { stageKit } from './authoring.js';
export function build(meta, rule) {
  const k=stageKit(meta,rule,{bounds:[-30,30,-45,45],spawn:[0,4.8,-38],focus:[0,0.8,0]});
  k.floor('launch',-10,11,-43,-32,4.8,'tile');
  k.floor('store-entry',-22,23,-32,-21,2.1,'tile');
  k.floor('store-floor',-25,25,-21,0,0,'tile');
  k.ramp('right-aisle',[17,0,-15],[17,2.1,-24],7,'tile');
  k.ramp('left-aisle',[-16,0,-15],[-16,2.1,-24],6,'tile');
  k.box('aisle-display',-12,-3,-18,-7,0,2.2,'plaster');
  k.box('right-display',8,16,-16,-7,0,1.4,'plaster');
  k.box('spawn-screen',-5,3,-28,-23,2.1,3.9,'plaster');
  k.ramp('display-ramp',[-8,0,-23],[-8,2.2,-17],7,'tile');
  for(const [i,x] of [-20,20].entries()) k.cover(`shelf-${i}`,x,-11,0,2.5,7,1.2,'steel');
  k.cover('checkout',3,-18,0,2.8,3,1,'steel');
  k.once(()=>{
    k.box('center-display',-6,6,-5,5,0,1.2,'plaster');
    if(rule==='rainmaker') k.cover('rainmaker-plinth',0,0,1.2,2.5,2.5,0.5,'plaster');
  });
  k.ramp('center-display-access',[0,0,-11],[0,1.2,-5],5,'tile');
  if(rule==='tower') k.cover('tower-shelf',-16,-23,2.1,2.5,2.5,0.8,'steel');
  if(rule==='clams'||rule==='rainmaker') k.ramp('goal-ramp',[6,0,-17],[6,2.1,-25],6,'tile');
  if(rule==='zones') k.cover('zone-side-display',-15,-4,0,3,3,1,'plaster');
  return k.finish({battleAnchor:[0,1.2,0],objectiveSpec:{zones:[{center:[0,1.2,0],size:[12,10]}],
    tower:{pathToA:[[0,1.5,0],[-16,0.5,-6],[-16,0.7,-19],[5,2.4,-25],[5,2.4,-29]],checkpointIndices:[1,2,3]},
    rainmaker:{center:[0,1.7,0],checkpointsA:[[5,0,-16],[18,0,-12]],goalA:[5,2.1,-28]},
    clams:{basketA:[4,4.4,-25],spawnsA:[[-18,0,-18],[4,0,-12],[20,0,-6],[-15,2.1,-28]]}
  }});
}
