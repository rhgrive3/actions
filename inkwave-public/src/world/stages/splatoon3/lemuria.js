import { stageKit } from './authoring.js';
export function build(meta, rule) {
  const k=stageKit(meta,rule,{bounds:[-49,49,-32,32],spawn:[-41,5.8,2],symmetry:'reflectX',focus:[0,1.5,0]});
  k.floor('launch',-47,-35,-9,15,5.8,'tile');
  k.floor('station-platform',-35,-23,-22,24,3,'tile');
  k.floor('lower-concourse',-23,-9,-22,24,0,'tile');
  k.ramp('platform-access',[-17,0,15],[-27,3,15],7,'tile');
  k.floor('outer-concourse',-18,-7,-29,-17,0,'tile');
  k.ramp('upper-bridge-access',[-21,0,-10],[-9,3.3,-10],7,'tile');
  k.deck('upper-bridge-arm',-9,0,-13.5,-6.5,3.3,'tile');
  const moving={id:'moving-walkway',kind:'conveyor',velocity:[rule==='tower'?0:1.1,0,0],speedVerified:false};
  k.floor('moving-walkway',-25,rule==='tower'?-13:-5,2,8,0,'rubber',{conveyor:moving});
  k.cover('station-information',-29,-12,3,3.5,1.2,2.3,'steel');
  k.cover('concourse-cover',-16,16,0,3.5,3.5,1.3,'steel');
  k.once(()=>{
    k.floor('central-concourse',-9,9,-22,24,0,'tile');
    if(rule!=='zones') k.box('central-upper-platform',-5,5,-3,8,0,1.8,'tile');
    if(rule!=='tower') k.deck('upper-link',-5,5,-7,0,3.3,'tile');
  });
  if(rule==='zones') k.cover('zone-high-cover',-11,6,0,3,4,2.3,'uninkable');
  if(rule==='rainmaker'||rule==='clams') k.ramp('objective-platform-access',[-16,0,-18],[-26,3,-18],7,'tile');
  if(rule==='clams') k.cover('outer-basket-cover',-18,21,0,3,3,1,'steel');
  k.feature('lateral-symmetry',[0,0,0],'This reconstruction mirrors X only; it is not a 180-degree copy.');
  return k.finish({battleAnchor:[0,0,16],gimmicks:[{id:'moving-walkways',type:'conveyors',implementation:'contact-velocity',speedVerified:false}],objectiveSpec:{zones:[{center:[-5,0,4],size:[8,10]},{center:[5,0,4],size:[8,10]}],
    tower:{pathToA:[[0,2.2,0],[-10,0.7,2],[-20,0.7,15],[-27,3.2,15],[-31,3.2,8]],checkpointIndices:[1,2,3]},
    rainmaker:{center:[0,3.3,-3],checkpointsA:[[-13,0,13],[-18,0,5]],goalA:[-29,3,-18]},
    clams:{basketA:[-19,2.3,21],spawnsA:[[-16,0,10],[-12,0,-19],[-29,3,6],[-10,3.3,-10]]}
  }});
}
