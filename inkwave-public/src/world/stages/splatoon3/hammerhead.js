import { stageKit } from './authoring.js';
export function build(meta, rule) {
  const k=stageKit(meta,rule,{bounds:[-21,21,-57,57],spawn:[0,5.2,-49],focus:[0,0.8,0]});
  k.floor('launch',-9,10,-55,-43,5.2,'asphalt');
  k.floor('bridge-entry',-17,17,-43,-29,2.6,'concrete');
  k.floor('bridge-deck',-17,17,-29,0,0,'concrete');
  k.floor('right-snipe',8,17,-29,-17,2.6,'concrete');
  k.ramp('snipe-ramp',[12,0,-10],[12,2.6,-18],7,'concrete');
  k.ramp('left-entry-ramp',[-10,0,-21],[-10,2.6,-31],7,'concrete');
  k.wall('safety-wall',-18,-17,-41,0,0,1.15,'uninkable');
  k.wall('right-safety-wall',17,18,-29,0,0,1.15,'uninkable');
  k.cover('bridge-pier',-5,-15,0,2.6,4,8,'uninkable',{noNav:true});
  k.cover('road-block',4,-22,0,3,5,1.3,'concrete');
  k.cover('left-snipe-cover',-12,-34,2.6,3,3,1.2,'concrete');
  k.cover('center-cover',8,-5,0,3,3,1.2,'concrete');
  k.once(()=>{
    if(rule==='rainmaker') k.cover('rainmaker-pedestal',0,0,0,3.4,3.4,0.8,'concrete');
    else if(rule!=='tower') k.cover('central-road-divider',0,0,0,2.6,3.4,0.9,'concrete');
  });
  if(rule==='rainmaker'||rule==='clams') k.ramp('goal-ramp',[4,0,-23],[4,2.6,-32],6,'concrete');
  if(rule==='tower') k.cover('tower-ledge',-3,-35,2.6,4,5,0.7,'concrete');
  k.feature('completed-bridge',[0,0,0],'Uses the completed Splatoon 3 roadway, not the earlier all-grate bridge.');
  return k.finish({battleAnchor:[0,0,-5],objectiveSpec:{zones:[{center:[0,0,0],size:[20,13]}],
    tower:{pathToA:[[0,0.5,0],[-9,0.5,-10],[-10,1.3,-25],[7,2.9,-32],[-3,3.4,-35]],checkpointIndices:[1,2,3],holdSeconds:[5,6,6],timingVerified:false},
    rainmaker:{center:[0,0.8,0],checkpointsA:[[-10,0,-17]],goalA:[3,2.6,-36]},
    clams:{basketA:[-11,4.8,-32],spawnsA:[[-11,0,-10],[4,0,-14],[13,2.6,-23],[-5,2.6,-38]]}
  }});
}
