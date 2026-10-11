import { stageKit } from './authoring.js';
export function build(meta, rule) {
  const k=stageKit(meta,rule,{bounds:[-33,33,-44,44],spawn:[10,7,-37],focus:[0,0.5,0]});
  k.floor('launch',0,26,-42,-31,7,'brick');
  k.floor('mine-terrace',-24,27,-31,-21,4.2,'brick');
  k.floor('left-mine-level',-27,-4,-21,-12,2.2,'brick');
  k.floor('right-mine-level',4,27,-21,-12,2.2,'brick');
  k.ramp('terrace-access',[15,2.2,-16],[15,4.2,-24],8,'brick');
  k.ramp('west-descent',[-16,0,-5],[-16,2.2,-14],7,'brick');
  k.ramp('east-descent',[16,0,-5],[16,2.2,-14],7,'brick');
  k.floor('upper-crossing',-4,4,-25,-17,4.2,'brick');
  k.wall('terrace-divider',-0.45,0.45,-31,-25,4.2,2.1,'uninkable');
  k.cover('mine-cover',-20,-16,2.2,3,3,1.4,'steel');
  k.cover('museum-board',15,-27,4.2,4,1.4,2,'steel');
  k.deck('left-edge-grate',-31,-24,-22,-11,2.2,'grate');
  const lift={id:'mine-elevator',kind:'translate',pivot:[0,0,0],offset:[0,2.2,0],periodSeconds:18,holdSeconds:6,transitionSeconds:3,timingVerified:false};
  k.deck('mine-elevator',-11,-5,-17,-11,0,'steel',{dynamic:lift});
  k.once(()=>{
    k.floor('western-waterfront',-28,-4,-12,12,0,'brick');
    k.floor('eastern-waterfront',4,28,-12,12,0,'brick');
    if(rule==='zones') {
      k.deck('moving-zone',-8,8,-5,5,0.6,'steel',{dynamic:{id:'moving-zone',kind:'controlled',control:'zoneOwner',pivot:[0,0,0],offset:[0,0,8],speed:2,timingVerified:false}});
    } else if(rule!=='turf') k.deck('central-rule-bridge',-5,5,-4,4,0.6,'steel');
  });
  if(rule==='rainmaker'||rule==='clams'||rule==='zones') k.floor('left-invasion-extension',-30,-22,-30,-19,4.2,'brick');
  if(rule==='rainmaker') k.ramp('rainmaker-stair',[7,2.2,-17],[7,4.2,-24],6,'uninkable');
  if(rule==='clams'||rule==='tower') k.deck('rule-access-grate',-5,5,-7,-4,0.6,'grate');
  k.feature('water-channel',[0,-1.6,0],'The central water gap is real; Turf War has no invented floor filling it.');
  return k.finish({battleAnchor:[-12,0,0],gimmicks:[{id:'mine-elevators',type:'elevators',implementation:'kinematic',timingVerified:false},...(rule==='zones'?[{id:'zone-shift',type:'owner-driven-platform',implementation:'mode-event-contract',pathVerified:false}]:[])],objectiveSpec:{zones:[{center:[0,0.6,0],size:[15,9]}],
    tower:{pathToA:[[0,0.9,0],[-13,0.6,-4],[-21,2.5,-16],[-23,4.4,-24],[-15,4.4,-28]],checkpointIndices:[1,3],holdSeconds:[7.5,6],timingVerified:false},
    rainmaker:{center:[0,0.6,0],checkpointsA:[[-14,0,-5],[15,2.2,-16]],goalA:[6,4.2,-27]},
    clams:{basketA:[11,6.4,-26],spawnsA:[[-16,0,-4],[19,0,-9],[-16,2.2,-18],[18,4.2,-29]]}
  }});
}
