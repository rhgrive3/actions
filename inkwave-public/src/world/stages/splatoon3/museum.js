import { stageKit } from './authoring.js';
export function build(meta, rule) {
  const k=stageKit(meta,rule,{bounds:[-32,32,-48,48],spawn:[0,5.2,-41],focus:[0,1,0]});
  k.floor('launch',-11,11,-46,-34,5.2,'tile');
  k.floor('exhibition-entry',-18,20,-34,-22,2.5,'tile');
  k.floor('exhibition-court',-24,24,-22,-8,0,'tile');
  k.ramp('gallery-descent',[12,0,-16],[12,2.5,-25],7,'tile');
  k.ramp('left-descent',[-13,0,-16],[-13,2.5,-25],6,'tile');
  k.floor('side-gallery',-29,-20,-14,5,0,'tile');
  k.deck('glass-pit-cover',18,29,-17,-3,0,'glass');
  k.cover('statue-plinth',-8,-28,2.5,3,3,2.2,'plaster');
  k.cover('gallery-screen',7,-18,0,2.5,4,1.7,'plaster');
  const sideDyn={id:'side-display',kind:'rotate',pivot:[-19,0,-10],periodSeconds:28,angle:Math.PI*2,continuous:true,timingVerified:false};
  k.octagon('side-display',-19,-10,4.6,0,1.4,'tile',{dynamic:sideDyn});
  k.turned('side-spoke',-19,-10,3,13,0.9,1.4,rule==='zones'?0:35,'tile',{dynamic:sideDyn});
  k.once(()=>{
    k.floor('center-court',-20,20,-8,8,0,'tile');
    const d={id:'central-display',kind:'rotate',pivot:[0,0,0],periodSeconds:24,angle:Math.PI*2,continuous:true,timingVerified:false};
    k.octagon('central-display',0,0,5,0,1.9,'tile',{dynamic:d});
    k.box('central-east-west',-8,8,-1.5,1.5,1.45,1.9,'tile',{dynamic:d});
    if(rule!=='tower') k.box('central-north-south',-1.5,1.5,-8,8,1.45,1.9,'tile',{dynamic:d});
  });
  if(rule==='rainmaker'||rule==='clams') k.ramp('goal-access',[-3,0,-15],[-3,2.5,-24],7,'tile');
  if(rule==='tower') k.floor('tower-invasion',-27,-18,-27,-17,1.3,'tile');
  k.feature('three-displays',[0,1.9,0],'One central and two side rotating displays, with provisional angular speeds.');
  return k.finish({battleAnchor:[0,0,-10],gimmicks:[{id:'museum-displays',type:'rotating-platforms',implementation:'kinematic',timingVerified:false}],objectiveSpec:{zones:[{center:[0,0,0],size:[20,15]}],
    tower:{pathToA:[[0,2.1,0],[-10,0.6,-7],[-15,0.6,-18],[-3,2.7,-26],[-3,2.7,-30]],checkpointIndices:[1,2,3],holdSeconds:[4,6,3],timingVerified:false},
    rainmaker:{center:[0,1.9,0],checkpointsA:[[-3,2.5,-25]],goalA:[-3,2.5,-30]},
    clams:{basketA:[-9,4.7,-27],spawnsA:[[11,0,-12],[-13,0,-20],[3,2.5,-30],[-25,0,-3]]}
  }});
}
