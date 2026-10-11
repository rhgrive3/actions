import { stageKit } from './authoring.js';
export function build(meta, rule) {
  const k=stageKit(meta,rule,{bounds:[-36,36,-42,42],spawn:[0,5.2,-35],focus:[0,2,0]});
  k.floor('launch',-10,11,-40,-29,5.2,'track');
  k.floor('outer-start',-24,25,-29,-19,2.8,'track');
  k.ramp('right-bank',[25,0,-9],[25,2.8,-22],10,'track');
  k.ramp('left-bank',[-24,0,-9],[-24,2.8,-22],9,'track');
  k.floor('right-turn',20,32,-11,4,0,'track');
  k.floor('left-turn',-32,-20,-11,4,0,'track');
  k.floor('approach-bowl',-20,20,-19,-12,0,'track');
  k.cover('track-divider',14,-22,2.8,4,3,1.3,'rubber');
  k.cover('infield-barrier',-14,-15,0,3,4,1.1,'rubber');
  k.once(()=>{
    // A deterministic sampled ridge: same analytic strips feed mesh, ink faces and collision.
    // It is not a claim that the original BMX surface is a cosine height field.
    const length=24, n=16, halfWidth=13;
    for(let i=0;i<n;i++) {
      const z0=-length/2+i*length/n,z1=-length/2+(i+1)*length/n;
      const y0=2.6*Math.pow(Math.cos(Math.PI*z0/length),2),y1=2.6*Math.pow(Math.cos(Math.PI*z1/length),2);
      if(Math.abs(y1-y0)<1e-7) k.floor(`hump-${i}`,-halfWidth,halfWidth,z0,z1,y0,'track');
      else k.ramp(`hump-${i}`,y0<y1?[0,y0,z0]:[0,y1,z1],y0<y1?[0,y1,z1]:[0,y0,z0],2*halfWidth,'track');
    }
    k.floor('left-flat-infield',-21,-13,-12,12,0,'track');
    k.floor('right-flat-infield',13,21,-12,12,0,'track');
  });
  if(rule==='rainmaker'||rule==='clams') k.ramp('goal-bank',[7,0,-17],[7,2.8,-25],8,'track');
  if(rule==='tower') k.cover('tower-bank-cover',-24,-5,0,2.2,3,1.1,'rubber');
  if(rule==='zones') k.cover('zone-bank-cover',17,-4,0,2,3,1,'rubber');
  k.feature('sampled-hump',[0,2.6,0],'16 collision-aligned slope strips approximate the central rounded hump; original curvature not measured.');
  return k.finish({battleAnchor:[0,2.6,0],objectiveSpec:{zones:[{center:[0,2.6,0],size:[21,13]}],
    tower:{pathToA:[[0,2.9,0],[-20,0.5,-3],[-24,0.5,-10],[-24,1.8,-17],[6,3,-25]],checkpointIndices:[1,2,3],holdSeconds:[6,5,4],timingVerified:false},
    rainmaker:{center:[0,2.6,0],checkpointsA:[[-25,0,-8],[25,0,-8]],goalA:[7,2.8,-25]},
    clams:{basketA:[18,2.3,-13],spawnsA:[[-17,0,-10],[18,0,-7],[0,0,-16],[22,2.8,-25]]}
  }});
}
