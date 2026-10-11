import { stageKit } from './authoring.js';
export function build(meta, rule) {
  const k=stageKit(meta,rule,{bounds:[-33,33,-49,49],spawn:[0,6,-42],focus:[0,1.8,0]});
  k.floor('launch',-9,10,-47,-35,6,'wood');
  k.octagon('base-circle',0,-29,18,-3,3,'wood');
  k.floor('front-court',-16,16,-21,-10,0,'wood');
  k.ramp('outer-ramp',[18,0,-13],[18,3,-27],7,'wood');
  k.floor('right-ramp-base',14,25,-19,-6,0,'wood');
  k.ramp('left-ramp',[-12,0,-16],[-12,3,-26],7,'wood');
  k.cover('base-cover',-8,-30,3,4,3,1.4,'plaster');
  k.ramp('permanent-entry',[21,0,-14],[21,3.6,-5],6,'steel');
  k.deck('permanent-glass',10,24,-5,0,3.6,'glass');
  const bridgeDyn={id:'retracting-bridge',kind:'translate',pivot:[0,0,0],offset:[0,0,-9],periodSeconds:60,holdSeconds:24,transitionSeconds:6,phaseSeconds:0,timingVerified:false};
  k.deck('retracting-bridge',-3.5,3.5,-19,-9,3.6,'steel',{dynamic:bridgeDyn});
  k.once(()=>{
    k.octagon('outer-center-ring',0,0,16,-3,0,'wood');
    k.octagon('rocket-upper-deck',0,0,10,0,3.6,'wood');
    const d={id:'center-carousel',kind:'rotate',pivot:[0,0,0],periodSeconds:60,angle:Math.PI*2,continuous:true,timingVerified:false};
    // Moving walls occupy the lower circular ring. The upper battle deck stays collision-aligned.
    if(rule!=='zones') {
      k.turned('moving-arch-west',-12,0,1.2,5,0,2.5,0,'plaster',{dynamic:d});
      k.turned('moving-arch-east',12,0,1.2,5,0,2.5,0,'plaster',{dynamic:d});
    }
    if(rule==='zones') {k.floor('zone-side-extension',-19,19,-7,7,0,'wood');}
  });
  k.ramp('rocket-access',[6,0,-17],[6,3.6,-8],6,'steel');
  if(rule==='rainmaker'||rule==='clams') k.ramp('goal-approach',[-5,0,-17],[-5,3,-26],7,'wood');
  if(rule==='tower') k.cover('tower-cover',-14,-15,0,2.8,3,1.1,'plaster');
  k.feature('rocket-carousel',[0,3.6,0],'Three circular areas, retracting upper bridges and permanent side glass approaches.');
  return k.finish({battleAnchor:[0,3.6,0],gimmicks:[{id:'wahoo-cycle',type:'retract-and-rotate',implementation:'kinematic-prototype',cadenceSeconds:30,travelCurveVerified:false,couplingVerified:false}],objectiveSpec:{zones:[{center:[0,3.6,0],size:[13,13]}],
    tower:{pathToA:[[0,3.9,0],[0,4,-12],[-12,0.8,-15],[-12,3.2,-26],[3,3.2,-30]],checkpointIndices:[1,2,3],holdSeconds:[6,4,3],timingVerified:false},
    rainmaker:{center:[0,3.6,0],checkpointsA:[[-12,0,-17],[0,0,-20]],goalA:[-5,3,-29]},
    clams:{basketA:[-10,5.2,-28],spawnsA:[[12,0,-13],[-9,0,-17],[4,3,-28],[20,0,-11]]}
  }});
}
