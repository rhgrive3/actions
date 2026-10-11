import { stageKit } from './authoring.js';
export function build(meta, rule) {
  const k=stageKit(meta,rule,{bounds:[-32,32,-50,50],spawn:[6,5.8,-43],focus:[0,0.8,0]});
  k.floor('launch',-5,26,-48,-36,5.8,'asphalt');
  k.floor('airport-landing',-20,27,-36,-25,3,'asphalt');
  k.floor('courtyard',-19,20,-25,-11,0,'asphalt');
  k.floor('right-runway',20,29,-30,-4,0,'asphalt');
  k.floor('left-loading-ledge',-29,-19,-27,-9,2.4,'steel');
  if(rule!=='tower') k.ramp('courtyard-return',[12,0,-19],[12,3,-28],7,'uninkable');
  else k.ramp('tower-return',[21,0,-19],[21,3,-28],7,'asphalt');
  k.ramp('left-ledge-access',[-24,0,-5],[-24,2.4,-15],6,'steel');
  k.cover('airport-crate',-9,-18,0,3.5,3.5,1.2,'steel');
  k.cover('runway-cover',23,-12,0,2.5,3.5,1.2,'steel');
  k.cover('boarding-sign',15,-30,3,4,1.3,2.3,'steel');
  const lift={id:'ink-powered-lift',kind:'controlled',control:'ink',pivot:[0,0,0],offset:[0,2.8,0],speed:1.6,returnSpeed:0.65,decaySeconds:2,timingVerified:false};
  k.deck('ink-powered-lift',-14,-6,-30,-23,0,'steel',{dynamic:lift});
  k.cover('lift-fan',-10,-24,0,2.2,1.1,1.1,'uninkable',{actuator:lift.id,dynamic:lift,noNav:true});
  const moving={id:'forward-propellervator',kind:'controlled',control:'ink',pivot:[0,0,0],offset:[0,0,-6],speed:1.4,returnSpeed:0.6,decaySeconds:2,timingVerified:false};
  k.deck('forward-propellervator',14,23,-7,-1,0.7,'steel',{dynamic:moving});
  k.cover('forward-fan',19,-5,0.7,2.2,1.1,1.1,'uninkable',{actuator:moving.id,dynamic:moving,noNav:true});
  k.once(()=>{
    k.floor('central-airfield',-20,20,-11,11,0,'asphalt');
    if(rule!=='tower') k.cover('central-crate-stack',0,0,0,4,4,1.7,'steel');
    if(rule!=='tower') k.deck('grated-overlook',-18,-9,-5,5,3.2,'grate');
  });
  if(rule==='rainmaker'||rule==='clams') k.ramp('goal-entry',[5,0,-18],[5,3,-28],6,'asphalt');
  if(rule!=='clams') k.cover('fan-access-box',12,-4,0,3,3,0.7,'steel');
  k.feature('ink-driven-fans',[-10,0,-24],'Fans have hit-driven stage actuators; original dimensions and response curves remain unmeasured.');
  return k.finish({battleAnchor:[0,0,-6],gimmicks:[{id:'propellervators',type:'ink-actuated-platforms',implementation:'kinematic-prototype',responseVerified:false}],objectiveSpec:{zones:[{center:[0,0,0],size:[13,13]}],
    tower:{pathToA:[[0,0.5,0],[13,0.5,-8],[16,0.7,-19],[-14,3.3,-28],[-5,3.3,-31]],checkpointIndices:[1,2,3]},
    rainmaker:{center:[0,1.7,0],checkpointsA:[[18,0.7,-3]],goalA:[5,3,-31]},
    clams:{basketA:[-6,2.3,-20],spawnsA:[[-14,0,-14],[8,0,-16],[24,0,-19],[-22,2.4,-23]]}
  }});
}
