import { stageKit } from './authoring.js';
export function build(meta, rule) {
  const k=stageKit(meta,rule,{bounds:[-30,30,-50,50],spawn:[0,5.8,-43],focus:[0,1.3,0]});
  k.floor('launch',-10,11,-48,-36,5.8,'steel');
  k.floor('upper-yard',-22,23,-36,-23,3,'concrete');
  k.floor('lower-yard',-22,23,-23,-8,0,'concrete');
  k.floor('outer-left',-28,-22,-28,7,0,'concrete');
  k.floor('outer-right',23,28,-33,-1,0,'concrete');
  k.ramp('yard-entry',[13,0,-17],[13,3,-26],7,'steel');
  k.ramp('left-entry',[-14,0,-16],[-14,3,-26],6,'steel');
  k.cover('yard-container',-8,-28,3,4,5,2,'container');
  k.cover('yard-divider',6,-17,0,3,5,1.4,'container');
  k.cover('edge-crate',-24,-11,0,3,3,1.2,'container');
  const bridge=(key,x,z,y,len)=>k.deck(key,x-3,x+3,z-len,z,y,'steel',{dynamic:{id:key,kind:'hinge',axis:[1,0,0],pivot:[x,y,z],angle:0.72,periodSeconds:40,phaseSeconds:0,timingVerified:false},thickness:0.35});
  bridge('base-drawbridge',-7,-20,3,8);
  bridge('center-drawbridge',-15,-2,2.2,9);
  k.once(()=>{
    k.floor('central-basin',-22,23,-8,8,0,'concrete');
    k.deck('central-bridge',-6,6,-8,8,2.2,'steel');
    k.deck('underpass-grate',-15,-6,-3,3,2.2,'grate');
    k.deck('opposite-grate',6,15,-3,3,2.2,'grate');
  });
  k.ramp('bridge-main-ramp',[0,0,-18],[0,2.2,-8],8,'steel');
  if(rule==='zones') k.cover('zone-divider',3,-4,2.2,2,3,0.8,'steel');
  if(rule==='rainmaker'||rule==='clams') k.ramp('invasion-ramp',[-5,0,-17],[-5,3,-27],7,'steel');
  k.feature('drawbridges',[0,2.2,0],'Four hinged bridge slabs; motion period is provisional, not a measured original curve.');
  return k.finish({battleAnchor:[0,2.2,0],gimmicks:[{id:'drawbridges',type:'drawbridges',implementation:'kinematic',timingVerified:false}],objectiveSpec:{zones:[{center:[0,2.2,0],size:[12,15]}],
    tower:{pathToA:[[0,2.5,0],[13,0.6,-9],[13,0.7,-19],[-7,3.2,-28],[-7,3.2,-32]],checkpointIndices:[1,2,3]},
    rainmaker:{center:[0,2.2,0],checkpointsA:[[-15,2.2,-4],[10,0,-16]],goalA:[-5,3,-30]},
    clams:{basketA:[-9,2.3,-20],spawnsA:[[-16,0,-15],[16,0,-12],[8,3,-30],[-24,0,-6]]}
  }});
}
