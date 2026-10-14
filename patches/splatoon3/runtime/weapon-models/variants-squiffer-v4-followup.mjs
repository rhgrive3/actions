// S3 New Squiffer geometry and color-role correction, variant-only.
// Official reference manifest: ../../reference/weapon-variant-new-squiffer-v4.json.
// The adopted Classic Squiffer builder and native gameplay remain unchanged.
import { THREE, Pieces, M, V, box, sphere, zlathe, ylathe, zcyl, ycyl, xcyl, cyl, ring, pipe, slab, smoothOutline, pistolGrip, gripSpec,
  part, rebuild, glowGeometry, sweep, GRIP_PISTOL, PISTOL_AXIS } from './kit.mjs';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Reference pixel → weapon space: (gx, gy) = handle axis point in the levelled frame, s = m/px.
const px = (gx, gy, s) => (x, y) => [(x - gx) * s, (gy - y) * s];
const outline = (P, pts) => pts.map(([x, y]) => P(x, y));
/** Weapon-space point [0, y, z] on the centre plane for reference pixel (x, y). */
const piv = (P, x, y, X = 0) => { const [z, yy] = P(x, y); return [X, yy, z]; };
// Lamp channels keep the native look (character-weapons.js buildCharger) so animateWeapon can drive them.
const LENS_LAMP = { color: '#0b0f16', emissive: '#ffffff', intensity: 0.2, roughness: 0.06 };
const EYE_LAMP = { color: '#0b0f16', emissive: '#ffffff', intensity: 0.05, roughness: 0.06 };
const PORT_LAMP = { color: '#1b1e25', emissive: '#ffffff', intensity: 0, roughness: 0.5 };

/** Muzzle heat ring (native `ports` channel lights on release) just inside the nozzle exit. */
function ports(z, y, r) {
  const p = new Pieces().add(zlathe([[r * 0.45, z - 0.004], [r, z - 0.004], [r, z], [r * 0.45, z]], 0, y, 0, 16), '#1b1e25', M.satin);
  return part(p, [0, y, z], 'lamp', PORT_LAMP);
}
import { MODELS as CHARGERS } from './chargers.mjs';

// Registered to original 1812x1019 pixels, not an invented text string.
// Source: S3_New_Squiffer_Promotional_3D_Render.png. The natural-size browser
// image rect was (0,-102,1812,1019); viewport tracing adds102 to source Y.
export const TANK_TRACE=Object.freeze({"sourceDimensions":[1812,1019],"burst":[[476,516],[482,501],[494,503],[497,486],[508,494],[522,479],[527,497],[542,489],[541,504],[557,500],[549,514],[560,520],[549,529],[562,540],[549,545],[552,560],[534,557],[530,577],[517,568],[506,580],[499,568],[486,574],[487,554],[474,553],[479,539],[471,533]],"resolvedGlyphEdges":[[[405,435],[415,432],[426,452],[423,459],[414,455],[411,462],[400,459]],[[427,459],[451,467],[448,475],[434,470],[430,478],[447,483],[444,492],[419,484],[415,477]],[[412,493],[421,496],[418,506],[425,509],[428,498],[437,502],[432,518],[410,510]]]});
// Estimated planar registration, separately from the observed source trace.
// Rear centre (381,456), neck direction (221,101); no gameplay anchor moves.
const tankPoint=([x,y])=>[(x-381)*.00070+(y-456)*.00032,(x-381)*.00032-(y-456)*.00070];

// Adaptive outline simplification keeps samples around the sharp molded joins
// and removes redundant samples on long gentle stretches. Cache only the three
// immutable authored profiles, never character instances or built geometries.
const moldOutlines=new Map();
function moldOutline(points,tolerance=.0006){
 const key=JSON.stringify(points);if(moldOutlines.has(key))return moldOutlines.get(key);
 const dense=smoothOutline(points,256);dense.push(dense[0]);
 const dist=(p,a,b)=>{const x=b[0]-a[0],y=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[1]-a[1])*y)/(x*x+y*y||1)));return Math.hypot(p[0]-a[0]-t*x,p[1]-a[1]-t*y);};
 const reduce=(lo,hi)=>{let max=0,at=-1;for(let i=lo+1;i<hi;i++){const d=dist(dense[i],dense[lo],dense[hi]);if(d>max){max=d;at=i;}}
  return max>tolerance?[...reduce(lo,at).slice(0,-1),...reduce(at,hi)]:[dense[lo],dense[hi]];};
 const out=[...reduce(0,128).slice(0,-1),...reduce(128,256).slice(0,-1)];moldOutlines.set(key,out);return out;
}
// Variant-only molded sections. Soft silhouettes are observed in the official
// still/rotation; thickness interpolation remains a procedural estimate.
function taperThickness(g,z0,z1,endScale){
  const p=g.attributes.position;
  for(let i=0;i<p.count;i++){
    const t=Math.max(0,Math.min(1,(p.getZ(i)-z0)/(z1-z0))),u=t*t*(3-2*t);
    p.setX(i,p.getX(i)*(1+(endScale-1)*u));
  }
  p.needsUpdate=true;g.computeVertexNormals();return g;
}

// Print contours are clipped against the actual molded shell facets so the
// registered artwork follows bevels without changing its source-space outline.
const tankPrintCache=new Map();
function shellPrint(shell,outline,side,offset){
 const key=JSON.stringify([outline,side,offset]);
 if(tankPrintCache.has(key))return tankPrintCache.get(key).clone();
 const flat=slab(outline,.001,0,0),p=flat.attributes.position,idx=flat.index;
 const s=shell.attributes.position,si=shell.index,out=[];
 const cross=(a,b,c)=>(b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]);
 const vertex=(a,i)=>[a.getX(i),a.getY(i),a.getZ(i)];
 for(let i=0;i<(idx?.count||p.count);i+=3){
  const tri=[0,1,2].map(k=>vertex(p,idx?idx.getX(i+k):i+k));
  if(tri.some(v=>v[0]<0.00049))continue; // one planar face only
  for(let j=0;j<si.count;j+=3){
   const face=[0,1,2].map(k=>vertex(s,si.getX(j+k))),area=cross(...face);
   if(area*side<1e-12)continue; // only the outward-facing shell half
   let poly=tri;
   for(let e=0;e<3&&poly.length;e++){
    const a=face[e],b=face[(e+1)%3],clipped=[];
    for(let k=0;k<poly.length;k++){
     const u=poly[k],v=poly[(k+1)%poly.length],du=cross(a,b,u)*side,dv=cross(a,b,v)*side;
     if(du>=-1e-12)clipped.push(u);
     if((du<0&&dv>0)||(du>0&&dv<0)){const t=du/(du-dv);clipped.push(u.map((q,n)=>q+(v[n]-q)*t));}
    }
    poly=clipped;
   }
   if(poly.length<3)continue;
   poly=poly.map(v=>{const wa=cross(face[1],face[2],v)/area,wb=cross(face[2],face[0],v)/area,wc=1-wa-wb;return [wa*face[0][0]+wb*face[1][0]+wc*face[2][0]+side*offset,v[1],v[2]];});
   for(let k=1;k<poly.length-1;k++){
    let t=[poly[0],poly[k],poly[k+1]];if(Math.abs(cross(...t))<1e-12)continue;
    if(cross(...t)*side<0)t=[t[0],t[2],t[1]];out.push(...t.flat());
   }
  }
 }
 flat.dispose();const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(out,3));g.computeVertexNormals();
 tankPrintCache.set(key,g);return g.clone();
}

const NEW_SQUIFF = {blue:'#789780',white:'#b6c9cd',grey:'#8b9291',brown:'#79574a',dark:'#202626'};
function newSquiffer(d) {
  const C = NEW_SQUIFF, s = 0.00105, P = px(486, 446, s), Y = (446 - 398) * s, H = (x, y, X = 0) => piv(P, x, y, X);
  const body = new Pieces(), ink = new Pieces();
  // Curved visible shell around the unchanged native hand axis. This replaces
  // the short rectangular-looking inherited grip, not the character's anchor.
  const gripContour=[[480,420],[502,430],[500,445],[491,455],[481,474],
    [474,490],[461,491],[452,478],[457,459],[470,444],[471,431]];
  body.add(slab(smoothOutline(outline(P,gripContour),48),.027,0,.007),C.white,M.gloss);
  // The S3 New bottle is flattened and tapered, with a grey fixed shell.
  // Official Feb 2024 rotation: broad planar sides, narrow rounded end, no
  // rotationally symmetric tank. Dimensions remain procedural estimates.
  const [b0z,b0y]=P(214,316),pitch=Math.atan2(79,186),bottle=new Pieces();
  // Rounded rear corners and fuller, soft molded shoulder, rather than the
  // previous straight-sided polygon and sharp triangular step.
  const shape=[[-.003,-.035],[-.003,.035],[.004,.049],[.014,.055],[.033,.054],
    [.072,.044],[.108,.033],[.121,.031],[.133,.036],[.145,.034],
    [.158,.027],[.171,.019],[.188,.017],[.188,-.017],[.170,-.019],
    [.155,-.028],[.140,-.037],[.120,-.039],[.075,-.048],[.033,-.053],[.013,-.051],[.002,-.043]];
  bottle.add(slab(moldOutline(shape),.046,0,.009),C.grey,M.satin);
  bottle.add(zcyl(.019,.168,.19,0,0,18),C.grey,M.satin);
  // A rounded molded rear rim follows the bottle contour; it is not a flat
  // rectangular badge. Keep the existing dark-grey material ownership.
  const rim=[[.003,-.039],[.002,.035],[.008,.048],[.017,.051],[.024,.049],
    [.022,.042],[.016,.039],[.014,-.037],[.021,-.044],[.020,-.049],[.011,-.047]];
  bottle.add(slab(moldOutline(rim),.049,0,.005),'#676d70',M.satin);
  bottle.transform(g=>taperThickness(g,.135,.188,.70));
  for(const side of [-1,1]) {
    // Graphic contours sit directly on the shell. V1/V2's rectangular plaque
    // and repeated pseudo-letters are removed. Only resolved edge silhouettes
    // are included; ambiguous holes and the burst wordmark are intentionally blank.
    for(const points of TANK_TRACE.resolvedGlyphEdges){
      const shape=points.map(tankPoint);
      bottle.add(shellPrint(bottle.list[0],shape,side,.00015),'#dfe1dc',M.print);
    }
    const star=TANK_TRACE.burst.map(tankPoint);
    const center=star.reduce((a,p)=>[a[0]+p[0]/star.length,a[1]+p[1]/star.length],[0,0]);
    const inset=k=>star.map(p=>[center[0]+(p[0]-center[0])*k,center[1]+(p[1]-center[1])*k]);
    bottle.add(shellPrint(bottle.list[0],star,side,.00015),'#242a29',M.print);
    bottle.add(shellPrint(bottle.list[0],inset(.93),side,.00030),'#ebc139',M.print);
    bottle.add(shellPrint(bottle.list[0],inset(.79),side,.00045),'#c7372d',M.print);
    // The dark crossing strip is resolved; its white glyph interiors are not.
    bottle.add(shellPrint(bottle.list[0],[[474,516],[555,522],[553,541],[473,532]].map(tankPoint),side,.00060),'#202627',M.print);

  }
  body.merge(bottle.transform(g=>g.rotateX(pitch).translate(0,b0y,b0z)));
  // ribbed grey spout and white collar into the receiver
  body.add(cyl(0.014, H(350, 372), H(412, 400), 14), C.grey, M.metal);
  for (let k = 0; k < 4; k++) { const u = 0.15 + k * 0.2, a = H(350 + 62 * u, 372 + 28 * u); body.add(cyl(0.0165, a, H(352 + 62 * u, 373 + 28 * u), 14), C.grey, M.metal); }
  ink.add(cyl(0.018, H(400, 395), H(416, 402), 16), '#ffffff', M.gloss);
  // Rounded shoulder and tapering keel observed in the 1812px official
  // render. V1 inherited a long parallel-sided slab that hid the grip root.
  const receiverContour=[[414,390],[436,378],[480,377],[503,385],[522,405],
    [548,420],[570,427],[595,430],[625,428],[660,424],[694,422],[718,429],
    [676,434],[640,438],[606,448],[577,458],[560,451],[548,438],
    [526,431],[500,422],[470,415],[440,415],[420,409]];
  const receiver=slab(moldOutline(outline(P,receiverContour)),.033,0,.009);
  body.add(taperThickness(receiver,P(530,0)[0],P(718,0)[0],.44),C.blue,M.gloss);
  const bar = (pts) => body.add(pipe(pts.map(([x, y]) => H(x, y)), 0.0048, 60, 6).scale(1.5, 1, 1), C.blue, M.gloss);
  bar([[543, 344], [550, 358], [566, 367], [700, 369], [900, 368], [938, 362], [958, 351], [980, 359], [1047, 366], [1120, 371]]);
  bar([[1120, 371], [1104, 381], [1068, 387], [1036, 395], [1000, 406], [966, 413], [935, 422], [900, 433], [868, 446], [845, 455], [818, 451], [770, 438], [718, 429]]);
  // ink rod barrel, white clips, leather strap, white muzzle block
  const [rz0] = P(416, 0), [rz1] = P(1090, 0), [nz] = P(1129, 0);
  body.add(zcyl(0.0068, rz0, rz1, 0, Y, 14), C.white, M.gloss);
  for (const x of [690, 868]) {
    const [z] = P(x, 0);
    ink.add(box(0.012, (398 - 368) * s + 0.01, 0.016, 0, Y + (398 - 368) * s / 2, z, 0.3), C.white, M.gloss);
    ink.add(zcyl(0.011, z - 0.009, z + 0.009, 0, Y, 16), C.white, M.gloss);
  }
  { const [z] = P(731, 0); body.add(zcyl(0.0105, z - 0.008, z + 0.008, 0, Y, 16), C.brown, M.satin); body.add(box(0.006, 0.026, 0.016, -0.009, Y - 0.012, z, 0.3), C.brown, M.satin); }
  ink.add(slab(outline(P, [[1088, 386], [1122, 386], [1129, 392], [1129, 420], [1122, 424], [1088, 424]]), 0.03, 0, 0.005), C.white, M.gloss);
  body.add(zlathe([[0, nz - 0.002], [0.0065, nz - 0.002], [0.0065, nz + 0.0008], [0, nz + 0.0008]], 0, Y, 0, 14), C.dark, M.satin);
  const trig = new Pieces().add(slab(outline(P, [[523, 430], [538, 430], [541, 458], [533, 462], [526, 446]]), 0.007, 0, 0.002), C.white, M.gloss);
  // charge coil: slim bands round the rod between the receiver and the muzzle block
  const g = new Pieces();
  for (let k = 0; k < 8; k++) { const [z] = P(640 + k * 55, 0); g.add(zcyl(0.0074, z - 0.007, z + 0.007, 0, Y, 12), '#ffffff', M.led); }
  return rebuild(d, {
    body, ink, glow: glowGeometry(g, P(630, 0)[0], P(1035, 0)[0]),
    parts: { trigger: part(trig, H(523, 430), 'ink'), ports: ports(nz - 0.001, Y, 0.0065) },
    gripL: gripSpec(H(640, 424), [0, 0, 1], [0.75, -0.62, -0.1]),
    muzzle: [0, Y, nz + 0.002],
  });
}

const base=CHARGERS['s3-charger-quick'];
export const FOLLOWUP_MODELS=Object.freeze({Charger_Quick_01:Object.freeze({
  ...base,sourceRow:'Charger_Quick_01',baseId:'s3-charger-quick',name:'New Squiffer',
  sourceUrl:'https://splatoonwiki.org/wiki/File:S3_New_Squiffer_Promotional_3D_Render.png',
  build:newSquiffer,
})});
