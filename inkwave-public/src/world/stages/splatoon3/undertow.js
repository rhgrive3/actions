import { stageKit } from './authoring.js';
export function build(meta, rule) {
  const k=stageKit(meta,rule,{bounds:[-30,30,-47,47],spawn:[7,6,-40],focus:[0,1,0]});
  k.floor('launch',-2,22,-45,-34,6,'concrete');
  k.floor('upper-court',-16,22,-34,-24,3.2,'concrete');
  k.floor('approach',-18,18,-24,-9,0,'concrete');
  k.floor('right-low-court',18,27,-28,-2,0,'concrete');
  k.floor('left-high-route',-27,-18,-26,-2,2.5,'concrete');
  k.ramp('right-descent',[13,0,-17],[13,3.2,-28],8,'uninkable');
  k.ramp('left-ascent',[-22,0,-8],[-22,2.5,-19],6,'concrete');
  k.cover('right-bollard',21,-15,0,2.6,2.6,2,'uninkable');
  k.cover('snipe-divider',-8,-27,3.2,3,5,2,'concrete');
  k.once(()=>{
    k.floor('west-spillway',-18,-0.35,-9,9,0,'concrete');
    k.floor('east-spillway',0.35,18,-9,9,0,'concrete');
    k.wall('central-divider',-0.35,0.35,-7,7,0,1.9,'uninkable');
    k.floor('north-divider-opening',-0.35,0.35,-9,-7,0,'concrete');
    k.floor('south-divider-opening',-0.35,0.35,7,9,0,'concrete');
    if(rule!=='tower') {
      k.deck('central-glass',-12,12,-3.8,3.8,3.7,'glass');
      k.box('glass-rim-west',-12.3,-12,-3.8,3.8,3.4,3.85,'steel');
      k.box('glass-rim-east',12,12.3,-3.8,3.8,3.4,3.85,'steel');
    }
  });
  if(rule!=='tower') k.ramp('glass-access',[-7,0,-16],[-7,3.7,-3.8],6,'glass',{thin:true,thickness:0.3});
  if(rule==='tower') k.cover('tower-low-cover',-5,-5,0,2.2,2.2,1,'concrete');
  if(rule==='zones'||rule==='rainmaker'||rule==='clams') k.ramp('low-invasion',[-12,0,-18],[-12,3.2,-26],5,'uninkable');
  k.feature('glass-underpass',[0,3.7,0],'Opaque divider below transparent, uninkable upper glass.');
  return k.finish({battleAnchor:[6,0,0],objectiveSpec:{zones:[{center:[-7,0,0],size:[10,12]},{center:[7,0,0],size:[10,12]}],
    tower:{pathToA:[[4,0.5,0],[-7,0.5,-10],[-7,0.5,-19],[9,3.3,-28],[9,3.3,-31]],checkpointIndices:[1,2,3],holdSeconds:[5,6,6],timingVerified:false},
    rainmaker:{center:[0,3.7,0],checkpointsA:[[21,0,-12],[-22,2.5,-19]],goalA:[7,3.2,-30]},
    clams:{basketA:[-12,2.3,-18],spawnsA:[[7,0,-12],[-10,0,-12],[20,0,-21],[-22,2.5,-15]]}
  }});
}
