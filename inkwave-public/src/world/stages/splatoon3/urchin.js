import { stageKit } from './authoring.js';
export function build(meta, rule) {
  const k=stageKit(meta,rule,{bounds:[-33,33,-49,49],spawn:[-4,5.8,-42],focus:[0,0.8,0]});
  k.floor('new-launch',-16,9,-47,-35,5.8,'asphalt');
  k.floor('old-spawn-plaza',-22,23,-35,-24,3,'asphalt');
  k.floor('spawn-pit',-15,19,-24,-15,0,'asphalt');
  k.floor('right-high-road',19,29,-30,-10,2.4,'asphalt');
  k.ramp('right-road-entry',[23,0,-4],[23,2.4,-16],7,'asphalt');
  k.ramp('right-plaza-ramp',[23,2.4,-20],[23,3,-27],7,'asphalt');
  k.floor('left-alley',-29,-20,-24,0,0,'asphalt');
  k.floor('left-alley-rear',-23,-12,-24,-18,0,'asphalt');
  k.floor('front-road',-20,19,-15,-8,0,'asphalt');
  k.box('entrance-hill',2,14,-16,-8,0,1.6,'asphalt');
  k.ramp('hill-access',[8,0,-22],[8,1.6,-15],8,'asphalt');
  k.ramp('hill-central-descent',[8,0,-2],[8,1.6,-8],8,'asphalt');
  k.cover('underpass-pillar',-9,-12,0,2.6,3.2,8,'uninkable',{noNav:true});
  k.wall('alley-screen',-20,-19,-18,-4,0,2.4,'plaster');
  k.cover('pit-cover',-7,-22,0,3.5,3,1.2,'plaster');
  k.deck('alley-grate',-24,-17,-8,-3,2.4,'grate');
  k.once(()=>{
    k.floor('central-gorge',-20,20,-8,8,0,'asphalt');
    if(rule==='rainmaker') k.box('raised-rainmaker-center',-7,7,-5,5,0,1.6,'asphalt');
    else k.cover('center-shield',0,0,0,3,3,1,'plaster');
  });
  if(rule==='zones'||rule==='tower') k.box('alley-open-platform',-24,-15,-8,-1,0,1.2,'asphalt');
  if(rule==='rainmaker') {
    k.wall('blocked-alley-mouth',-29,-20,-1,0,0,3.2,'uninkable');
    k.ramp('goal-invasion',[0,0,-18],[0,3,-27],7,'asphalt');
    k.ramp('center-rainmaker-ramp',[-7,0,-11],[-7,1.6,-4],6,'asphalt');
  }
  if(rule==='clams') k.cover('basket-approach-cover',4,-26,3,2.5,2.5,1,'plaster');
  k.feature('two-L-shaped-halves',[0,0,0],'New 10.0 spawn extensions and widened central approach are authored, not taken from the old game map.');
  return k.finish({battleAnchor:[0,0,-5],hazard:{kind:'none',killY:-6,waterY:-20},objectiveSpec:{zones:[{center:[0,0,0],size:[15,12]}],
    tower:{pathToA:[[0,1.3,0],[8,1.8,-8],[8,1.8,-14],[-2,0.7,-21],[-2,3.2,-28]],checkpointIndices:[1,2,3]},
    rainmaker:{center:[0,1.6,0],checkpointsA:[[8,1.6,-12]],goalA:[0,3,-29]},
    clams:{basketA:[0,5.2,-27],spawnsA:[[13,0,-21],[-13,0,-13],[-24,0,-13],[23,2.4,-22]]}
  }});
}
