// Original, hand-authored collision-first reconstructions, not extracted Nintendo geometry.
// All coordinates are INKWAVE world units. See each stage's fidelity record before reusing numbers.
import { B, R, O, OCT, ARC, PATTERN } from '../../mapkit.js';

export const MATERIALS = Object.freeze({
  concrete: { color: '#b6b9b7', pattern: PATTERN.concrete },
  sandstone: { color: '#b9936a', pattern: PATTERN.stonestep },
  plaster: { color: '#d2c6ae', pattern: PATTERN.render },
  asphalt: { color: '#536169', pattern: PATTERN.asphalt },
  tile: { color: '#d0d5d0', pattern: PATTERN.tiles },
  brick: { color: '#a77f69', pattern: PATTERN.brick },
  steel: { color: '#667c84', pattern: PATTERN.metalpanel },
  wood: { color: '#aa8056', pattern: PATTERN.planks },
  track: { color: '#a78361', pattern: PATTERN.nonslip },
  container: { color: '#648b92', pattern: PATTERN.container },
  uninkable: { color: '#263c44', pattern: PATTERN.metal, paint: false },
  grate: { color: '#859b9e', pattern: PATTERN.grate, grate: true, paint: false, bevel: 0.015 },
  glass: { color: '#b0d8d4', pattern: PATTERN.plain, paint: false, glass: true, bevel: 0 },
  rubber: { color: '#bd6651', pattern: PATTERN.rubber, paint: false },
});

export function material(name = 'concrete', options = {}) {
  if (!(name in MATERIALS)) throw new Error(`Unknown stage material: ${name}`);
  return { bevel: 0.035, ...MATERIALS[name], surface: name, ...options };
}
export function mirrorPoint(p, symmetry = 'rotate180') {
  return symmetry === 'reflectX' ? [-p[0], p[1], p[2]] : [-p[0], p[1], -p[2]];
}
export function mirrorPrimitive(d, symmetry = 'rotate180') {
  const f = p => mirrorPoint(p, symmetry);
  const o = { ...d, stageKey: `${d.stageKey}:B`, tag: d.tag ? `${d.tag}:B` : null };
  if (d.noPaint) o.noPaint = d.noPaint.map(f);
  if (d.kind === 'box') {
    const a=f(d.min), b=f(d.max);
    o.min=a.map((v,i)=>Math.min(v,b[i])); o.max=a.map((v,i)=>Math.max(v,b[i]));
  } else if (d.kind === 'obox') {
    o.center=f(d.center); o.rotY=symmetry==='reflectX' ? -d.rotY : d.rotY;
  } else { o.low=f(d.low); o.high=f(d.high); }
  if(d.dynamic) {
    o.dynamic={...d.dynamic,id:`${d.dynamic.id}:B`,pivot:f(d.dynamic.pivot)};
    if(d.dynamic.offset) o.dynamic.offset=f(d.dynamic.offset);
    if(d.dynamic.axis) o.dynamic.axis=f(d.dynamic.axis);
    if(symmetry==='reflectX' && d.dynamic.kind==='rotate') o.dynamic.angle=-d.dynamic.angle;
  }
  if(d.conveyor) o.conveyor={...d.conveyor,id:`${d.conveyor.id}:B`,velocity:f(d.conveyor.velocity)};
  if(d.actuator) o.actuator=`${d.actuator}:B`;
  return o;
}

/** Author primitives once; expand explicitly so minimap, physics and render cannot disagree on symmetry. */
export function stageKit(meta, rule, spec) {
  const single=[], half=[], landmarks=[];
  let target=half;
  let serial=0;
  const symmetry=spec.symmetry || 'rotate180';
  const add=(key,def)=>{const d={...def,stageKey:key||`part-${serial++}`};target.push(d);return d;};
  const api={
    rule, meta, single, half, landmarks, symmetry,
    once(fn){const old=target;target=single;try{fn(api);}finally{target=old;}return api;},
    box(key,x0,x1,z0,z1,y0,y1,mat='concrete',opts={}) {return add(key,B(x0,x1,y0,y1,z0,z1,material(mat,opts)));},
    floor(key,x0,x1,z0,z1,y=0,mat='concrete',opts={}) {return api.box(key,x0,x1,z0,z1,Math.min(-3,y-0.55),y,mat,opts);},
    deck(key,x0,x1,z0,z1,y,mat='concrete',opts={}) {return api.box(key,x0,x1,z0,z1,y-(opts.thickness??0.45),y,mat,opts);},
    ramp(key,low,high,width,mat='concrete',opts={}) {return add(key,R(low,high,width,material(mat,opts)));},
    turned(key,cx,cz,w,d,y0,y1,deg,mat='concrete',opts={}) {return add(key,O(cx,cz,w,d,y0,y1,deg,material(mat,opts)));},
    octagon(key,x,z,r,y0,y1,mat='concrete',opts={}) {return OCT(x,z,r,y0,y1,material(mat,opts)).map((d,i)=>add(`${key}:${i}`,d));},
    arc(key,x,z,r,t,y0,y1,a0,a1,n,mat='concrete',opts={}) {return ARC(x,z,r,t,y0,y1,a0,a1,n,material(mat,opts)).map((d,i)=>add(`${key}:${i}`,d));},
    wall(key,x0,x1,z0,z1,y=0,h=2,mat='concrete',opts={}) {return api.box(key,x0,x1,z0,z1,y,y+h,mat,{noNav:true,...opts});},
    cover(key,x,z,y=0,w=2,d=2,h=1.2,mat='concrete',opts={}) {return api.box(key,x-w/2,x+w/2,z-d/2,z+d/2,y,y+h,mat,opts);},
    feature(key,p,note){landmarks.push({key,position:p,note});},
    finish(options={}) {
      const spawnA=spec.spawn;
      const spawns=[spawnA,mirrorPoint(spawnA,symmetry)];
      const bounds=Array.isArray(spec.bounds)?{minX:spec.bounds[0],maxX:spec.bounds[1],minZ:spec.bounds[2],maxZ:spec.bounds[3]}:spec.bounds;
      const layout={
        id:meta.id, stageId:meta.id, internalId:meta.internalId, gameVersion:'11.3.0', schemaVersion:1,
        layoutRule:rule, revision:'stage25-r1', bounds,
        spawnPads:spawns, spawnBarrier:spec.spawnBarrier??3.8,
        spawnYaw:spec.spawnYaw || (symmetry==='reflectX'?[Math.PI/2,-Math.PI/2]:[0,Math.PI]),
        single:[...single,...half,...half.map(d=>mirrorPrimitive(d,symmetry))],half:[],
        decor:{lamps:[],palms:[],flags:[]},
        symmetry, focus:spec.focus || [0,0,0], environment:meta.environment,
        hazard:{kind:meta.hazard,killY:meta.hazard==='water'?-2.25:-5,waterY:-1.6},
        landmarks, fidelity:{geometry:'authored-approximation',dimensions:'unmeasured',
          materials:'authored-approximation',collision:'shared-with-render',originalVerified:false,
          sources:[meta.reference], limitation:meta.limitations},
        ...options,
      };
      // Key uniqueness makes object replacement independent of fragile array positions.
      const keys=new Set(); for(const d of layout.single){if(keys.has(d.stageKey))throw new Error(`${meta.id}: duplicate ${d.stageKey}`);keys.add(d.stageKey);}
      return layout;
    }
  };
  return api;
}

/** Top support in the authored primitives, without Three.js or a GPU. */
export function topAt(layout,x,z,maxY=Infinity,skipGrates=false) {
  let top=-Infinity;
  for(const b of layout.single) {
    if(b.solid===false || (skipGrates && b.grate))continue;
    let y=-Infinity;
    if(b.kind==='box') {
      if(x>=b.min[0]-1e-7&&x<=b.max[0]+1e-7&&z>=b.min[2]-1e-7&&z<=b.max[2]+1e-7)y=b.max[1];
    } else if(b.kind==='obox') {
      const a=b.rotY*Math.PI/180,c=Math.cos(a),s=Math.sin(a),dx=x-b.center[0],dz=z-b.center[2];
      if(Math.abs(dx*c-dz*s)<=b.size[0]/2+1e-7&&Math.abs(dx*s+dz*c)<=b.size[2]/2+1e-7)y=b.center[1]+b.size[1]/2;
    } else {
      const dx=b.high[0]-b.low[0],dz=b.high[2]-b.low[2],len=Math.hypot(dx,dz);
      const t=((x-b.low[0])*dx+(z-b.low[2])*dz)/(len*len);
      const side=Math.abs((x-b.low[0])*(-dz/len)+(z-b.low[2])*(dx/len));
      if(t>=-0.6/len&&t<=1+1e-7&&side<=b.width/2+1e-7)y=b.low[1]+t*(b.high[1]-b.low[1]);
    }
    if(y<=maxY+1e-7&&y>top)top=y;
  }
  return top;
}
