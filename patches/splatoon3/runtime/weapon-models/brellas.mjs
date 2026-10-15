import { BRELLA_APERTURE } from '../brella-aperture.mjs';
// Brella family models (Splatoon 3 Ver.11.3.0): Splat Brella, Tenta Brella, Undercover Brella,
// Recycled Brella 24 Mk I. The catalogue gives them the shooter model kind (pistol grip, trigger / led channels);
// each model is the gun body (pistol or crook grip, shaft = shotgun barrel, hub with the nozzle) plus a separate
// canopy part built from the official 3D renders (Inkipedia "S3 Weapon Main <name> 3D") and turntable videos.
//
// Weapon space: the handle axis goes through the origin, +Z = forward. The shaft runs along +Z at height SH above the
// grip and the canopy is an umbrella whose apex hub sits at the shaft tip (the nozzle), ribs fanning backwards.
// Scale: the pistol handle is 0.11 m; the open canopy radius follows the render's canopy-to-handle ratio.
//
// Canopy motion (read-only gameplay state, WeaponRunner.catalogState.canopy):
//   folded along the shaft at rest, opens while the shot is held (canopy.open), folds when released, hidden while the
//   canopy is launched (Splat / Tenta / Recycled) or while the weapon is naked (catalogState.naked > 0).
// The geometry is baked in the folded pose, so far LOD / unanimated rendering shows a closed umbrella; the animation
// scales the part about the apex hub (x/y: width, z: length along the shaft).
import { THREE, Pieces, M, V, box, sphere, zlathe, zcyl, ring, pipe, lathe, pistolGrip, gripSpec, part, rebuild,
  TRIGGER_PIVOT, damp, smooth, cyl } from './kit.mjs';

const TAU = Math.PI * 2, SH = 0.075, K_FOLD = 0.11;
const GRIP_L = z => gripSpec([0, SH, z], [0, 0, 1], [0.5, 1, 0]);

const flip = g => { const ix = g.index.array; for (let q = 0; q < ix.length; q += 3) { const t = ix[q + 1]; ix[q + 1] = ix[q + 2]; ix[q + 2] = t; } g.computeVertexNormals(); return g; };

/** Umbrella shell (double layer) between radius fractions u0..u1. n = number of gores (polygonal rim). */
function domeShell(R, depth, zH, u0, u1, n, thick = 0.004, p = 1.8, steps = 8) {
  const w = TAU / n, poly = a => { const m = ((a % w) + w) % w; return Math.cos(Math.PI / n) / Math.cos(m - Math.PI / n); };
  const prof = d => { const o = []; for (let i = 0; i <= steps; i++) { const u = u0 + (u1 - u0) * i / steps; o.push([R * u, zH - depth * u ** p - d]); } return o; };
  const deform = v => { const r = Math.hypot(v.x, v.z), f = 1 + (poly(Math.atan2(v.z, v.x)) - 1) * Math.min(1, r / R); v.x *= f; v.z *= f; };
  const out = lathe(prof(0), n * 2, deform).rotateX(Math.PI / 2);
  const inn = flip(lathe(prof(thick), n * 2, deform).rotateX(Math.PI / 2));
  return [out.translate(0, SH, 0), inn.translate(0, SH, 0)];
}
/** Rib curves apex → rim corner, plus slider struts from the shaft. */
function ribs(P, R, depth, zH, n, color, rr = 0.0045, strut = true, jut = 0) {
  for (let k = 0; k < n; k++) {
    const a = k * TAU / n, c = Math.cos(a), s = Math.sin(a), pts = [];
    for (let i = 0; i <= 5; i++) { const u = i / 5; pts.push([c * (R + jut * u) * u, SH + s * (R + jut * u) * u, zH - depth * u ** 1.8 - 0.006]); }
    P.add(pipe(pts, rr, 6, 5), color, M.satin);
    if (strut && k % (n > 12 ? 2 : 1) === 0) P.add(pipe([[0, SH, zH - depth * 0.62], [c * R * 0.5, SH + s * R * 0.5, zH - depth * 0.5 ** 1.8 - 0.006]], rr * 0.7, 2, 4), color, M.satin);
  }
}
/** Fold a canopy's geometry (about the apex, on the shaft axis) into the closed pose: width ×K, length ×sz. */
function fold(P, zH, sz) {
  return P.transform(g => { g.translate(0, -SH, -zH).scale(K_FOLD, K_FOLD, sz).translate(0, SH, zH); g.computeVertexNormals(); });
}
/** Two-sided sewn fabric, sampled rather than making each face a flat triangle.
 * Both skins are real indexed geometry; no extra material groups or double-sided draw. */
function fabric(map, u0 = 0, u1 = 1, v0 = 0, v1 = 1, nu = 6, nv = 3, thickness = 0.002) {
  const pos = [], ix = [], row = nv + 1, count = (nu + 1) * row;
  for (let skin = 0; skin < 2; skin++) for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
    const q = map(u0 + (u1 - u0) * i / nu, v0 + (v1 - v0) * j / nv);
    pos.push(q[0], q[1], q[2] - skin * thickness);
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * row + j, b = a + row, c = b + 1, d = a + 1;
    ix.push(a, b, d, b, c, d, a + count, d + count, b + count, b + count, d + count, c + count);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(ix); g.computeVertexNormals(); return g;
}
/** A polygonal gore: sewn radial edges and a lightly hollowed hem, not a round disc. */
function gore(k, R, depth, zH, n, power = 1.6, billow = 0.014, hemInset = 0.018) {
  const a = k * TAU / n, b = (k + 1) * TAU / n;
  return (u, t) => {
    const hem = 1 - hemInset * Math.sin(Math.PI * t) * u ** 3;
    return [R * u * hem * ((1 - t) * Math.cos(a) + t * Math.cos(b)),
      SH + R * u * hem * ((1 - t) * Math.sin(a) + t * Math.sin(b)),
      zH - depth * u ** power + billow * Math.sin(Math.PI * t) * Math.sin(Math.PI * u)];
  };
}
/** A small inlaid cloth mark, mapped onto the same curved panel. */
function clothMark(P, map, poly, color, lift = 0.0012) {
  // Triangulate the concave ink marks in cloth coordinates, then subdivide before mapping.
  // A single planar fan would cut through the domed cloth and lose the middle of the print.
  const pos = [];
  const emit = (a, b, c, depth) => {
    if (depth) {
      const mid = (x, y) => [(x[0] + y[0]) / 2, (x[1] + y[1]) / 2];
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      emit(a, ab, ca, depth - 1); emit(ab, b, bc, depth - 1);
      emit(ca, bc, c, depth - 1); emit(ab, bc, ca, depth - 1); return;
    }
    for (const [u, t] of [a, b, c]) { const q = map(u, t); pos.push(q[0], q[1], q[2] + lift); }
    for (const [u, t] of [c, b, a]) { const q = map(u, t); pos.push(q[0], q[1], q[2] - .002 - lift); }
  };
  for (const ids of THREE.ShapeUtils.triangulateShape(poly.map(([u,t]) => new THREE.Vector2(u,t)), [])) {
    let [a,b,c] = ids.map(i => poly[i]);
    if ((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])<0) [b,c]=[c,b];
    emit(a,b,c,1);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // Pieces finalizes this triangle list into welded indexed vertices before merging.
  P.add(g, color, M.print);
}
function radialRib(P, k, n, R, depth, zH, color, radius = 0.0032, power = 1.6, segments = 8, radial = 5) {
  const a = k * TAU / n, c = Math.cos(a), s = Math.sin(a), q = u => [c * R * u, SH + s * R * u, zH - depth * u ** power - 0.004];
  P.add(pipe([q(0), q(.25), q(.55), q(.8), q(1.015)], radius, segments, radial), color, M.satin);
  return q;
}

// ------------------------------------------------------------------------------------------ canopy animation
function makeAnimate(cfg) {
  return function animateCanopy(w, st) {
    const cs = st.runner && st.runner.catalogState, c = cs && cs.canopy, ps = w.ps, dt = Math.min(0.1, Math.max(0, st.dt || 0));
    const hidden = !!cs && ((!!c && c.launched) || (!c && cs.naked > 0));
    const want = c && !c.launched && c.open ? 1 : 0;
    ps.bo = damp(ps.bo || 0, want, want ? cfg.openRate : cfg.foldRate, dt);
    ps.bv = damp(ps.bv === undefined ? 1 : ps.bv, hidden ? 0 : 1, 28, dt);
    // overshoot a little when the ribs snap open
    const e = smooth(ps.bo) + (want ? 0.05 * Math.sin(Math.PI * ps.bo) : 0), vis = ps.bv;
    const sx = (1 + (BRELLA_APERTURE[w.def.modelId].scale / K_FOLD - 1) * e) * vis, sz = (1 + (1 / cfg.sz - 1) * e) * (vis > 0.5 ? 1 : 0.2 + vis * 1.6);
    for (const name of ['canopy', 'canopyInk']) {
      const g = w.parts[name]; if (!g) continue;
      g.visible = vis > 0.02; g.scale.set(Math.max(1e-3, sx), Math.max(1e-3, sx), Math.max(1e-3, sz));
    }
    // Recycled has no other ink shell. Reuse its native ink draw for the moving
    // paper rather than paying for an additional canopyInk mesh on every actor.
    if (cfg.bodyInk && w.ink) {
      const g=w.ink,p=w.def.parts.canopy.pivot;
      g.visible=vis>.02;g.scale.set(Math.max(1e-3,sx),Math.max(1e-3,sx),Math.max(1e-3,sz));
      g.position.set(p.x*(1-g.scale.x),p.y*(1-g.scale.y),p.z*(1-g.scale.z));
    }
  };
}

// ------------------------------------------------------------------------------------------ Splat Brella
function splat(d) {
  // Eight sewn parasol gores, stepped pale hems, radial stays and a blue open trigger guard.
  // The reference is mostly ink-coloured cloth with separate pale panels, not concentric discs.
  const C = { grip: '#e2e4dc', blue: '#283bc1', black: '#171a1c', white: '#d2d7ce', rib: '#333938', red: '#b82030', print: '#44353d' };
  const zH = 0.6, R = 0.4, depth = 0.2, n = 8, SZ = 2.15;
  const body = new Pieces(), canopy = new Pieces(), inkP = new Pieces();
  const trig = pistolGrip(body, { color: C.grip, triggerColor: C.blue, guard: false, baseColor: C.black, mat: M.satin });
  body.add(pipe([[0, .035, .02], [0, .033, .053], [0, -.006, .047], [0, -.015, .013]], .0045, 12, 6), C.blue, M.gloss);
  body.add(box(.032, .026, .083, 0, .059, .005, .25), C.grip, M.satin);
  body.add(zcyl(.0125, -.06, zH + .01, 0, SH, 14), C.black, M.satin);
  body.add(zcyl(.016, .048, .165, 0, SH, 14), C.black, M.rubber);
  for (const z of [.025, .164, .325]) body.add(zcyl(.016, z, z + .009, 0, SH, 14), C.white, M.metal);
  body.add(box(.03, .004, .064, 0, SH + .013, .265, .15, 8, 4), C.white, M.print);
  for (let k = 0; k < 5; k++) body.add(box(.026, .005, .004, 0, SH + .015, .239 + k * .012, .2, 6, 4), C.black, M.print);
  // Stepped runner below the canopy and a hollow-looking flared nozzle, at the existing socket.
  body.add(zlathe([[.012, .40], [.024, .403], [.027, .42], [.017, .43]], 0, SH, 0, 16), C.black, M.satin);
  body.add(zlathe([[.012, zH-.024], [.027, zH-.025], [.032, zH-.010], [.024, zH+.014], [.012, zH+.020], [.008, zH+.016]], 0, SH, 0, 20), C.black, M.satin);
  body.add(zcyl(.008, zH+.010, zH+.016, 0, SH, 12), '#050609', M.rubber);
  for (let k = 0; k < n; k++) {
    const map = gore(k, R, depth, zH, n);
    inkP.add(fabric(map, .02, k % 2 === 0 ? .67 : 1, 0, 1, 8, 3), '#69cbb1', M.satin);
    if (k % 2 === 0) canopy.add(fabric(map, .67, 1, 0, 1, 3, 3), C.white, M.satin);
    // Distinct dark/red radial crest, cloth label and parallel print strokes, authored procedurally.
    if (k === 1 || k === 5) {
      clothMark(canopy, map, [[.17,.35],[.32,.42],[.37,.15],[.45,.4],[.62,.32],[.53,.58],[.64,.77],[.42,.7],[.34,.9],[.3,.63]], C.print);
      clothMark(canopy, map, [[.23,.42],[.35,.5],[.4,.32],[.45,.48],[.54,.45],[.47,.59],[.53,.68],[.4,.62],[.34,.75]], C.red, .0018);
    }
    if (k === 3 || k === 7) {
      clothMark(canopy,map,[[.42,.37],[.49,.23],[.65,.25],[.72,.4],[.69,.65],[.54,.76],[.45,.64]],C.white);
      clothMark(canopy,map,[[.44,.39],[.51,.27],[.64,.29],[.69,.42],[.67,.62],[.54,.71],[.48,.62]],C.print,.0018);
      for(let j=0;j<4;j++) clothMark(canopy,map,[[.48+j*.046,.28],[.488+j*.046,.28],[.488+j*.046,.68],[.48+j*.046,.68]],C.white,.0023);
    }
    const q=radialRib(canopy,k,n,R,depth,zH,C.rib,.0033);
    const brace=q(.48); canopy.add(cyl(.0026,[0,SH,.415],brace,6),C.rib,M.metal);
    const end=q(1.018); inkP.add(sphere(.009,.009,.014,...end,8,5),'#69cbb1',M.satin);
    canopy.add(sphere(.006,.006,.008,...brace,7,5),C.black,M.satin);
    const a=map(1,0),m=map(1,.5),b=map(1,1);canopy.add(pipe([a,m,b],.0022,5,4),C.rib,M.satin);
  }
  fold(canopy,zH,SZ);fold(inkP,zH,SZ);
  return rebuild(d,{body,ink:new Pieces(),parts:{trigger:part(trig,TRIGGER_PIVOT),canopy:part(canopy,[0,SH,zH],'body'),canopyInk:part(inkP,[0,SH,zH],'ink')},gripL:GRIP_L(.09),muzzle:[0,SH,zH+.02]});
}

// ------------------------------------------------------------------------------------------ Tenta Brella
function tenta(d) {
  // Tensioned tent fabric: curved hems, separate window/appliqué panels, bowed red poles
  // standing clear of the fabric, clips and ferrules. Existing grip/muzzle/launch geometry retained.
  const C={black:'#202322',red:'#b72328',olive:'#48503b',grey:'#92978b',edge:'#b0afa0',dark:'#30352e',metal:'#444b45'};
  const zH=.85,a=.52,b=.32,depth=.22,SZ=2.9;
  const body=new Pieces(),canopy=new Pieces(),inkP=new Pieces();
  const trig=pistolGrip(body,{color:C.black,triggerColor:'#899287',guard:false,baseColor:C.black});
  body.add(box(.045,.023,.046,0,.045,.008,.2),C.black,M.rubber);
  body.add(box(.052,.013,.037,0,-.062,-.016,.35),C.black,M.rubber);
  body.add(zcyl(.0125,-.06,zH+.01,0,SH,14),C.dark,M.satin);
  body.add(zcyl(.017,.07,.20,0,SH,14),C.black,M.rubber);
  for(const z of [.055,.205,.47])body.add(zcyl(.020,z,z+.012,0,SH,12),C.metal,M.metal);
  body.add(zlathe([[.012,zH-.05],[.035,zH-.036],[.04,zH-.02],[.031,zH+.014],[.015,zH+.022],[.009,zH+.015]],0,SH,0,20),C.black,M.satin);
  body.add(zcyl(.01,zH+.010,zH+.018,0,SH,12),'#090c0b',M.rubber);
  const point=(x,y,lift=0)=>[a*x*(1-.06*(1-y*y)),SH+b*y*(1-.085*(1-x*x)),zH-depth*(.28*(x*x+y*y)+.44*Math.max(Math.abs(x),Math.abs(y)))+lift];
  const corners=[[-1,-1],[1,-1],[1,1],[-1,1]];
  for(let k=0;k<4;k++){
    const A=corners[k],B=corners[(k+1)%4],map=(u,t)=>point(u*(A[0]*(1-t)+B[0]*t),u*(A[1]*(1-t)+B[1]*t));
    (k%2?inkP:canopy).add(fabric(map,.025,1,0,1,8,6),k%2?'#528e40':k===0?C.olive:C.grey,M.satin);
    canopy.add(fabric((u,t)=>{const q=map(u,t);q[2]+=.0015;return q;},.87,1,0,1,2,8),k===0?'#242c29':C.edge,M.satin);
    canopy.add(pipe([map(1,0),map(1,.25),map(1,.5),map(1,.75),map(1,1)],.003,10,5),C.dark,M.satin);
  }
  // Rounded rectangular window appliqués follow the non-planar fabric (both sides, no floating slab).
  for(const side of [-1,1]){
    const cx=side*.69,cy=0,rx=.22,ry=.43,shape=t=>{const x=Math.cos(t),y=Math.sin(t);return[cx+rx*Math.sign(x)*Math.abs(x)**.55,cy+ry*Math.sign(y)*Math.abs(y)**.55];};
    for(const back of [false,true]){
      const offset=back?-.004:.002;
      const win=(r,t)=>{const p=shape(t*TAU);return point(cx+(p[0]-cx)*r,cy+(p[1]-cy)*r,offset);};
      canopy.add(fabric(win,0,.89,0,1,2,16,.0005),back?'#6c7465':'#626d5a',M.rubber);
      canopy.add(fabric(win,.89,1,0,1,1,16,.0005),C.edge,M.satin);
      const edge=[];for(let j=0;j<=16;j++){const q=shape(j*TAU/16);edge.push(point(q[0],q[1],offset+.0006));}canopy.add(pipe(edge,.002,16,4),C.dark,M.satin);
    }
    for(const y of [-.79,.79]){
      const c=point(side*.80,y,.005);canopy.add(box(.037,.035,.008,...c,.12,8,4),C.edge,M.satin);
    }
  }
  // Curved external tent poles with eight black clips and two silver ferrules each.
  for(const [sx,sy] of corners){
    const q=u=>[sx*a*u,SH+sy*b*u,zH-depth*u**2+.03*Math.sin(Math.PI*u)];
    canopy.add(pipe([q(0),q(.28),q(.58),q(.82),q(1.025)],.006,10,5),C.red,M.gloss);
    for(const u of [.25,.5,.75,.97]){const p=q(u),q0=q(u-.026),q1=q(u+.026);canopy.add(cyl(.010,q0,q1,6),C.black,M.rubber);canopy.add(cyl(.0025,p,point(sx*u,sy*u,-.004),5),C.metal,M.metal);}
    for(const u of [.37,.65])canopy.add(cyl(.0068,q(u-.03),q(u+.03),7),C.grey,M.metal);
    canopy.add(sphere(.009,.009,.011,...q(1.025),8,5),C.black,M.rubber);
    canopy.add(cyl(.003,[0,SH,zH-.17],point(sx*.35,sy*.35,-.009),6),C.black,M.metal);
  }
  // Mechanical central crossing plate travels with the canopy, unlike the nozzle/shaft.
  canopy.add(box(.10,.067,.018,0,SH,zH-.008,.3,10,6),C.black,M.satin);
  for(const x of [-.032,.032])for(const y of [-.02,.02])canopy.add(zcyl(.006,zH-.005,zH+.004,x,SH+y,7),C.grey,M.metal);
  fold(canopy,zH,SZ);fold(inkP,zH,SZ);
  return rebuild(d,{body,ink:new Pieces(),parts:{trigger:part(trig,TRIGGER_PIVOT),canopy:part(canopy,[0,SH,zH],'body'),canopyInk:part(inkP,[0,SH,zH],'ink')},gripL:GRIP_L(.14),muzzle:[0,SH,zH+.022]});
}

// ------------------------------------------------------------------------------------------ Undercover Brella
function undercover(d) {
  // Wmn_Shelter_Compact: a plain black umbrella (8 ribs, thin metal tip), white shaft with gold ferrules and a green
  // status lamp, a brown wooden crook handle. The canopy is never launched.
  const C = { wood: '#7a5230', woodD: '#4a2f1a', white: '#e6e6e0', gold: '#c9a24a', cloth: '#2b2d33', rib: '#4a4d55' };
  const zH = 0.58, R = 0.38, depth = 0.17, n = 8, SZ = 2.3;
  const body = new Pieces(), canopy = new Pieces(), led = new Pieces();
  const trig = pistolGrip(body, { color: C.wood, triggerColor: C.gold, guard: false, base: false });
  body.add(pipe([[0, -0.056, -0.014], [0, -0.086, -0.03], [0, -0.078, -0.066], [0, -0.046, -0.074]], 0.0115, 10, 8), C.wood, M.satin);
  for (const t of [-0.02, 0.0, 0.02]) body.add(ring(0.013, 0.0012, 0, -0.03 + t, 0, 'y', 4, 12), C.woodD, M.satin);
  body.add(zcyl(0.011, -0.04, zH + 0.01, 0, SH, 12), C.white, M.satin);
  body.add(box(0.026, 0.02, 0.1, 0, 0.066, 0.0, 0.3), C.woodD, M.satin);
  body.add(zcyl(0.0145, 0.04, 0.05, 0, SH, 12), C.gold, M.metal).add(zcyl(0.0145, 0.2, 0.208, 0, SH, 12), C.gold, M.metal);
  body.add(zcyl(0.0135, 0.3, 0.45, 0, SH, 12), C.gold, M.metal);
  body.add(zlathe([[0, zH - 0.03], [0.018, zH - 0.03], [0.016, zH + 0.01], [0.006, zH + 0.025], [0, zH + 0.025]], 0, SH, 0, 12), C.gold, M.metal);
  led.add(sphere(0.004, 0.004, 0.004, 0.012, SH + 0.006, 0.18, 8, 6), '#3dff7a', M.led);
  const [o, i] = domeShell(R, depth, zH, 0, 1, n);
  canopy.add(o, C.cloth, M.satin).add(i, '#1b1c20', M.satin);
  ribs(canopy, R, depth, zH, n, C.rib, 0.0035, true, 0.02);
  for (let k = 0; k < n; k++) { const a = k * TAU / n; canopy.add(sphere(0.007, 0.007, 0.007, Math.cos(a) * (R + 0.02), SH + Math.sin(a) * (R + 0.02), zH - depth, 8, 6), C.rib, M.metal); }
  fold(canopy, zH, SZ);
  return rebuild(d, {
    body, ink: new Pieces(),
    parts: { trigger: part(trig, TRIGGER_PIVOT), led: part(led, [0.012, SH + 0.006, 0.18], 'lamp', { color: '#0f2a18', emissive: '#3dff7a', intensity: 1.2 }),
      canopy: part(canopy, [0, SH, zH], 'body') },
    gripL: GRIP_L(0.09), muzzle: [0, SH, zH + 0.025],
  });
}

// ------------------------------------------------------------------------------------------ Recycled Brella 24 Mk I
function recycled(d) {
  // Wagasa: 24 individual paper gores, dark perimeter and pale registration ring, full
  // bamboo spokes with the smaller conical stretcher cage, and a red mechanical hub.
  const C={red:'#bd4728',black:'#242925',paper:'#bfc6bd',rim:'#42483e',bamboo:'#423d31',silver:'#b8b6a1'};
  const zH=.6,R=.44,depth=.15,n=24,SZ=3;
  const body=new Pieces(),canopy=new Pieces(),inkP=new Pieces(),led=new Pieces();
  const trig=pistolGrip(body,{color:C.red,triggerColor:C.black,guard:false,base:false,mat:M.gloss});
  // Lacquered bent butt, with the dark exposed shaft and bright ferrules seen in the underside render.
  body.add(pipe([[0,-.043,-.011],[0,-.071,-.022],[0,-.087,-.055],[0,-.078,-.090],[0,-.057,-.112]],.012,14,8),C.red,M.gloss);
  for(const [y,z]of[[-.079,-.053],[-.060,-.108]])body.add(cyl(.013,[0,y-.004,z-.004],[0,y+.004,z+.004],10),C.silver,M.metal);
  body.add(box(.028,.023,.075,0,.059,.002,.3),C.red,M.gloss);
  body.add(zcyl(.0115,-.04,zH+.01,0,SH,12),C.black,M.satin);
  body.add(zlathe([[.011,.04],[.019,.04],[.018,.13],[.027,.15],[.026,.174],[.013,.174]],0,SH,0,16),C.red,M.gloss);
  body.add(zcyl(.017,.027,.046,0,SH,14),C.silver,M.metal);
  // Conical runner/cage seat under the paper and a chunky black/red cylindrical muzzle housing.
  body.add(zlathe([[.011,.335],[.029,.338],[.027,.36],[.013,.38]],0,SH,0,16),C.red,M.gloss);
  body.add(zlathe([[.013,zH-.045],[.039,zH-.044],[.041,zH-.018],[.029,zH+.012],[.012,zH+.022],[.009,zH+.016]],0,SH,0,20),C.red,M.gloss);
  for(const z of[zH-.038,zH-.015])body.add(ring(.041,.003,0,SH,z,'z',5,20),C.black,M.rubber);
  for(const x of[-.032,.032])body.add(box(.014,.049,.035,x,SH,zH-.019,.3,8,5),C.black,M.satin);
  led.add(ring(.026,.005,0,SH,zH+.014,'z',5,20),'#27e0a0',M.led);
  body.add(zcyl(.015,zH+.010,zH+.019,0,SH,14),'#091411',M.rubber);
  // Reinforced square collar in the cloth, kept on the disappearing canopy channel.
  canopy.add(box(.096,.096,.008,0,SH,zH-.006,.12,8,4),C.rim,M.rubber);
  for(let k=0;k<n;k++){
    const map=gore(k,R,depth,zH,n,1.7,.0015,.004);
    inkP.add(fabric(map,.10,.865,0,1,6,2),'#9b8bc6',M.satin);
    canopy.add(fabric(map,.865,.898,0,1,1,2),C.paper,M.satin);
    canopy.add(fabric(map,.898,1,0,1,2,2),C.rim,M.satin);
    const q=radialRib(canopy,k,n,R,depth,zH,C.bamboo,.003,1.7,7,4);
    canopy.add(cyl(.0027,[Math.cos(k*TAU/n)*.021,SH+Math.sin(k*TAU/n)*.021,.353],q(.46),5),C.bamboo,M.satin);
    const end=q(1.014);canopy.add(sphere(.0045,.0045,.007,...end,6,4),C.black,M.rubber);
  }
  fold(canopy,zH,SZ);fold(inkP,zH,SZ);
  return rebuild(d,{body,ink:inkP,parts:{trigger:part(trig,TRIGGER_PIVOT),led:part(led,[0,SH,zH+.014],'lamp',{color:'#0a2a20',emissive:'#27e0a0',intensity:1.3}),canopy:part(canopy,[0,SH,zH],'body')},gripL:GRIP_L(.08),muzzle:[0,SH,zH+.022]});
}

// An open shield is still being actively held after a single-shot firingPose expires.
// Preserve the native firing/recoil pose; only the sustained guard is authored here.
// The existing shield centre/direction are read, never resized or written. The render
// surface is centred on that plane; capsule-vs-cloth outline differences remain gameplay policy.
const guardStates = new WeakMap(), guardInv = new THREE.Matrix4(), guardCentre = V(), guardDir = V(), guardOffset = V();
const guardEuler = new THREE.Euler(0,0,0,'YXZ'), guardQ = new THREE.Quaternion();
const GUARD_PLANE = { 's3-shelter-normal': .5, 's3-shelter-wide': .74, 's3-shelter-focus': .525 };
function guardPose(ch, dt, s, C) {
  const plane = GUARD_PLANE[ch.weapon?.def?.modelId ?? ch.weaponModel]; if (plane === undefined) return;
  const r = ch._runner?.(s), canopy = r?.catalogState?.canopy;
  let m = guardStates.get(ch);
  const active = !!canopy?.open && !canopy.launched;
  if (!m && !active) return;
  if (!m || m.weapon !== ch.weapon) { m = { weapon:ch.weapon, w:0, p:[0,0,0], r:[0,0,0] }; guardStates.set(ch,m); }
  if (!ch.kidForm || ch.dance || r?.a?.specialActive || s.subAim || (ch.wSub || 0) > .01 || s.firing) { m.w = 0; return; }
  m.w = damp(m.w, active ? 1 : 0, active ? 22 : 14, Math.min(.1,Math.max(0,dt||0)));
  if (m.w < .001) { m.w = 0; return; }
  if (active) {
    ch.kid.updateWorldMatrix(true,false); guardInv.copy(ch.kid.matrixWorld).invert();
    guardCentre.copy(canopy.pos).applyMatrix4(guardInv); guardDir.copy(canopy.dir).transformDirection(guardInv);
    guardEuler.set(-Math.atan2(guardDir.y,Math.hypot(guardDir.x,guardDir.z)),Math.atan2(guardDir.x,guardDir.z),0,'YXZ');
    guardQ.setFromEuler(guardEuler); guardOffset.set(0,SH,plane).applyQuaternion(guardQ); guardCentre.sub(guardOffset);
    m.p[0]=guardCentre.x;m.p[1]=guardCentre.y;m.p[2]=guardCentre.z;
    m.r[0]=guardEuler.x;m.r[1]=guardEuler.y;m.r[2]=0;
  }
  const P=ch.P,k=m.w;
  for(let i=0;i<3;i++){P[C.ANC+i]+=(m.p[i]-P[C.ANC+i])*k;P[C.ANCR+i]+=(m.r[i]-P[C.ANCR+i])*k;}
  P[C.AFOLT]*=1-k;P[C.AFOLR]*=1-k;P[C.IKR]=Math.max(P[C.IKR],k);P[C.IKL]=Math.max(P[C.IKL],k);P[C.LTW]*=1-k;
  // During a strafe, the native carry turns toward travel after firing expires.
  // Turn the upper body toward the shield while the native feet keep walking.
  const yaw=Math.max(-Math.PI/2,Math.min(Math.PI/2,m.r[1])),two=k*(1-ch.wTwo);
  P[C.HIPS+1]+=.25*yaw*k;P[C.SPINE+1]+=.25*yaw*k;P[C.CHEST+1]+=.5*yaw*k;
  P[C.CLAVL+1]-=.28*two;P[C.CLAVR+1]+=.1*two;P[C.CLAVL+2]+=.04*two;
  ch.wTwo=Math.max(ch.wTwo,k);
}

export const MODELS = {
  's3-shelter-normal': { sourceModel: 'Wmn_Shelter_Normal', build: splat, pose: guardPose, animate: makeAnimate({ sz: 2.15, openRate: 16, foldRate: 9 }) },
  's3-shelter-wide': { sourceModel: 'Wmn_Shelter_Wide', build: tenta, pose: guardPose, animate: makeAnimate({ sz: 2.9, openRate: 10, foldRate: 7 }) },
  's3-shelter-compact': { sourceModel: 'Wmn_Shelter_Compact', build: undercover, animate: makeAnimate({ sz: 2.3, openRate: 16, foldRate: 9 }) },
  's3-shelter-focus': { sourceModel: 'Wmn_Shelter_Focus', build: recycled, pose: guardPose, animate: makeAnimate({ sz: 3.0, openRate: 16, foldRate: 9, bodyInk: true }) },
};
