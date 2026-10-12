// Shooter family models, group B (Splatoon 3 Ver.11.3.0 main weapons): Splattershot Pro, .96 Gal,
// Jet Squelcher, Splattershot Nova, L-3 Nozzlenose, H-3 Nozzlenose, Squeezer.
// Shapes follow the official per-weapon 3D renders (Inkipedia "S3 Weapon Main <name> 3D", 400 px,
// muzzle to the right). Those renders are close perspective views, so each model traces the render's
// alpha silhouette (the IoU target) in the (z, y) plane, with the reference pixel frame of each render.
// Scale: the visible pistol handle below the receiver is 0.11 m, so s = 0.11 / handle length in
// reference pixels, with the handle centre at the origin. Internal model names come from Leanny/splat3
// ActorInfo (Fmdb). Everything is procedural geometry.
import { THREE, Pieces, M, V, zlathe, zcyl, ring, pipe, slab, smoothOutline, pistolGrip, gripSpec, part, rebuild,
  TRIGGER_PIVOT, box, xcyl, ycyl } from './kit.mjs';

// Reference pixel -> weapon space for a side render: (gx, gy) = handle centre in the image, s = metres/pixel.
// Returns [z, y] so that slab / zlathe outlines take it directly.
const px = (gx, gy, s) => (x, y) => [(x - gx) * s, (gy - y) * s];
const PISTOL_RAKE = Math.atan2(0.25, 1);

/** A grip spec along an axis raked `rake` radians from vertical (top forward), through the origin. */
const rakedGrip = rake => gripSpec([0, 0, 0], [0, Math.cos(rake), Math.sin(rake)], [0, Math.sin(rake), -Math.cos(rake)]);
/** The native support-hand spec (fist round a handle, thumb up) tilted about X by `tilt`. */
function supportGrip(pos, tilt = 0) {
  const q = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), tilt);
  return gripSpec(pos, V(0, 1, -0.12).applyQuaternion(q), V(0.45, -0.05, -1).applyQuaternion(q));
}
/** Pistol grip raked `rake` radians (top forward) about the handle centre; returns the trigger pieces. */
const raked = (body, rake, opt) => pistolGrip(body, { ...opt, rake: rake - PISTOL_RAKE });
/** A tube lying in the side plane through reference pixels; sx places it across the weapon. */
const sideTube = (P, pts, r, sx = 0, seg = 2) => pipe(pts.map(([x, y]) => { const [z, yy] = P(x, y); return [sx, yy, z]; }), r, seg, 6);
/** A side-plane outline (reference pixels) extruded across the weapon; n > 0 smooths it. */
function side(P, pts, thick, n = 0) {
  const o = pts.map(([x, y]) => P(x, y));
  return slab(n ? smoothOutline(o, n) : o, thick, 0, 0.004);
}
/** Coaxial lathe closed at both ends: cap = [[radius px, x px], ...] (radius 0 at the back, front face last). */
function capLathe(P, s, cap, yAxis, seg = 24) {
  const Z = x => P(x, 0)[0];
  const prof = [[0, Z(cap[0][1])], ...cap.map(([r, x]) => [r * s, Z(x)]), [0, Z(cap[cap.length - 1][1])]];
  return zlathe(prof, 0, yAxis, 0, seg);
}

// ------------------------------------------------------------------------------------------ Splattershot Pro
function expert(d) {
  // Wmn_Shooter_Expert: blue receiver with a fin on top and cooling fins underneath, a silver ink-tank
  // cylinder along the body, a silver spike nozzle with a red tip, a red carry hoop running down both
  // flanks of the rear half, a blue raked handle with a red trigger. Silver tank: no team colour on
  // the official render, so it is a body part (the native can channel still pulses it per shot).
  const s = 0.11 / 56, P = px(192, 253, s), Z = x => P(x, 0)[0], Y = y => P(0, y)[1];
  const C = { blue: '#2c4a8f', dkblue: '#1f3566', silver: '#a9aca9', red: '#d62e36', tip: '#ef1715' };
  const RAKE = 0.37;
  const body = new Pieces(), can = new Pieces();
  body.add(side(P, [[236, 160], [262, 146], [296, 138], [322, 130], [338, 140], [342, 170], [338, 206], [320, 224],
    [292, 226], [262, 214], [238, 198]], 0.04, 24), C.blue, M.gloss);
  const ty = Y(186), tz0 = Z(84), tz1 = Z(236), tr = 44 * s;
  can.add(zlathe([[0, tz0], [tr * 0.9, tz0], [tr, tz0 + 0.012], [tr, tz1 - 0.012], [tr * 0.92, tz1], [0, tz1]], 0, ty, 0, 24),
    C.silver, M.metal);
  body.add(zlathe([[0, Z(336)], [31 * s, Z(338)], [30 * s, Z(350)], [25 * s, Z(362)], [20 * s, Z(376)], [15 * s, Z(388)],
    [14 * s, Z(392)], [0, Z(392)]], 0, Y(183), 0, 24), C.silver, M.metal);
  body.add(zlathe([[0, Z(378)], [10 * s, Z(379)], [10 * s, Z(391)], [0, Z(392)]], 0, Y(183), 0, 16), C.tip, M.gloss);
  const hoop = [[6, 190], [30, 186], [60, 198], [96, 216], [140, 224], [190, 222], [226, 208]];
  for (const sx of [-1, 1]) body.add(sideTube(P, hoop, 6 * s, sx * 0.02, 3), C.red, M.gloss);
  const trig = raked(body, RAKE, { color: C.dkblue, triggerColor: C.red, guardColor: C.dkblue });
  return rebuild(d, {
    body, ink: new Pieces(),
    parts: { can: part(can, [0, ty, (tz0 + tz1) / 2], 'body'), trigger: part(trig, TRIGGER_PIVOT) },
    gripR: rakedGrip(RAKE),
    gripL: supportGrip([0, Y(222), Z(214)], 0),
    muzzle: [0, Y(183), Z(392)],
  });
}

// ------------------------------------------------------------------------------------------ .96 Gal
function heavy(d) {
  // S3 standard .96 Gal. Measured on the 1280x720 Nintendo turntable at 7.50 s:
  // total 820 px; tank L=268 / D=214; purifier L=280; axis (786,326)-(1061,326).
  // Preserve the already-shipped muzzle, right-hand and support-hand frames.
  // 0.0006 m/px is a visual scale, not a claim about retail world units.
  const u = .0006, AX = .065, END = .38625;
  const Z = x => END + (x - 1061) * u, Y = y => AX + (326 - y) * u;
  const C = { black:'#27282b', edge:'#484a4b', pink:'#dc167f', metal:'#a7aaa9', rim:'#c6c8c2', quartz:'#babba7' };
  const body = new Pieces(), can = new Pieces();
  const sideAt = (points, width, x = 0, bevel=.0015, holes=[]) =>
    slab(points.map(([z,y])=>[Z(z),Y(y)]),width,x,bevel,holes.map(h=>h.map(([z,y])=>[Z(z),Y(y)])));
  const tubeAt = (points, radius, x=0) => pipe(points.map(([z,y])=>[x,Y(y),Z(z)]),radius,Math.max(8,points.length*3),6);
  // The water-cooler bottle has two broad end ribs and a recessed centre belt.
  const tankProfile = [[0,491],[91,491],[101,499],[107,512],[108,560],[104,575],
    [93,590],[91,606],[91,646],[96,660],[107,674],[108,739],[102,754],[88,765],[0,768]];
  can.add(zlathe(tankProfile.map(([r,z])=>[r*u,Z(z)]),0,AX,0,40),'#f4f1e7',M.gloss);
  // Separate cast caps, two uprights and the top straps. The central gap stays open.
  for (const [a,b] of [[482,494],[763,782]]) {
    body.add(zlathe([[0,Z(a)],[103*u,Z(a)],[107*u,Z(a+3)],[107*u,Z(b-3)],[98*u,Z(b)],[0,Z(b)]],0,AX,0,32),C.black,M.satin);
  }
  for (const [a,b] of [[479,584],[662,756]]) {
    body.add(box(.037,19*u,(b-a)*u,0,Y(228),Z((a+b)/2),.16,8,4),C.black,M.satin);
    body.add(box(.038,21*u,9*u,0,Y(231),Z(b-3),.18,8,4),C.pink,M.gloss);
  }
  // Stock is an open triangular brace, with a thin curved butt and a vented upper pad.
  body.add(sideAt([[242,265],[392,233],[410,328],[304,369],[286,458],[273,452]],.044,0,.002,
    [[[307,350],[398,327],[310,409]]]),C.black,M.satin);
  body.add(sideAt([[240,264],[250,263],[293,456],[285,461]],.049,0,.001),C.edge,M.satin);
  body.add(sideAt([[395,254],[478,231],[481,250],[400,275]],.018),C.black,M.satin);
  for (const sx of [-1,1]) {
    for (const [x,y] of [[275,316],[305,310],[340,302],[283,331],[316,325],[349,318]])
      body.add(box(.001,7*u,22*u,sx*.0225,Y(y),Z(x),.2,4,4), '#101216',M.rubber);
    body.add(tubeAt([[470,224],[465,266],[480,280],[492,278]],.0024,sx*.019),C.metal,M.metal);
  }
  // Visible raked pistol and trigger retain their native attachment/recoil frame.
  const trig = raked(body,.40,{color:C.pink,triggerColor:C.black,guard:false,baseColor:C.black});
  body.add(sideAt([[382,361],[425,327],[472,303],[494,340],[491,393],[460,408],[451,383],[420,397]],.028),C.pink,M.gloss);
  // The long wire guard terminates at the tank's front saddle, not a loose V in space.
  for (const sx of [-1,1]) body.add(tubeAt([[359,479],[401,507],[617,506],[667,458],[746,458],[755,444]],.0022,sx*.013),C.metal,M.metal);
  body.add(sideAt([[666,459],[745,458],[751,471],[655,471]],.033),C.black,M.satin);
  // Upper sight is a pierced loop. Its side profile is broad only in the axial view.
  body.add(sideAt([[749,283],[761,246],[777,214],[791,176],[802,159],[817,157],[813,191],[801,241],[798,288]],.014,0,.002),C.black,M.satin);
  body.add(ring(.019,.0035,0,0,0,'z',6,28).rotateX(-.30).translate(0,Y(196),Z(794)),C.edge,M.satin);
  // Short neck, the long packed purifier and a separate circumferential front clamp.
  body.add(zcyl(50*u,Z(780),Z(853),0,AX,32),C.quartz,M.gloss);
  body.add(zlathe([[0,Z(780)],[56*u,Z(783)],[56*u,Z(800)],[48*u,Z(808)],[0,Z(808)]],0,AX,0,32),C.black,M.satin);
  body.add(zcyl(46*u,Z(808),Z(1021),0,AX,40),'#c6c3ac',M.gloss);
  // Deterministic faceted aggregate; no image texture or per-frame work.
  const pos=[],norm=[],col=[],mat=[],idx=[];
  const palette=['#e0d7bf','#b5af94','#ccc5a9','#8d917f','#e1dfc7'].map(c=>new THREE.Color(c));
  const sectors=42,rows=30;
  // 6-8 reference-pixel mineral granules, staggered and irregular rather than brick strips.
  for(let k=0;k<rows;k++)for(let j=0;j<sectors;j++){
    const seed=((k+3)*92821+(j+5)*68917)%997;
    const angle=(j+(k%2)*.5+(seed%13-6)*.019)*Math.PI*2/sectors;
    const zz=813+(1017-813)*(k+.5)/rows+(seed%7-3)*.27;
    const radius=(46.1+(seed%5)*.24)*u,c=palette[seed%palette.length];
    const points=[[angle,Z(zz)]];
    for(let e=0;e<6;e++){const t=e*Math.PI/3,sh=.83+((seed*(e+3))%19)*.013;
      points.push([angle+Math.cos(t)*(Math.PI/sectors)*sh,Z(zz+Math.sin(t)*3.6*sh)]);}
    for(let e=0;e<6;e++){
      const base=pos.length/3,shade=.88+((seed+e*7)%17)*.009;
      for(const n of[0,e+1,(e+1)%6+1]){const[t,z]=points[n],r=radius+(n===0?.4:0)*u;
        pos.push(Math.cos(t)*r,AX+Math.sin(t)*r,z);norm.push(Math.cos(t),Math.sin(t),0);
        col.push(c.r*shade,c.g*shade,c.b*shade);mat.push(M.satin);}
      idx.push(base,base+1,base+2);
    }
  }
  const gravel=new THREE.BufferGeometry();gravel.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));gravel.setAttribute('normal',new THREE.Float32BufferAttribute(norm,3));gravel.setAttribute('color',new THREE.Float32BufferAttribute(col,3));gravel.setAttribute('aMat',new THREE.Float32BufferAttribute(mat,1));gravel.setIndex(idx);body.list.push(gravel);
  body.add(zlathe([[0,Z(837)],[53*u,Z(837)],[57*u,Z(845)],[57*u,Z(881)],[50*u,Z(889)],[0,Z(889)]],0,AX,0,32),C.black,M.satin);
  // Front clamp is a wide pierced paddle; its lower eye stays open in three-quarter views.
  body.add(sideAt([[851,358],[886,357],[899,404],[925,478],[926,501],[915,516],[901,507],[883,470],[866,415]],.016,0,.003,
    [[[903,467],[914,486],[914,501],[906,496]]]),C.black,M.satin);
  body.add(zlathe([[0,Z(1016)],[51*u,Z(1016)],[54*u,Z(1020)],[54*u,Z(1058)],[49*u,Z(1061)],
    [36*u,Z(1061)],[36*u,Z(1047)],[0,Z(1047)]],0,AX,0,40),C.rim,M.metal);
  body.add(zcyl(36*u,Z(1047.2),Z(1048),0,AX,32),'#202126',M.rubber);
  body.add(ring(42*u,3.2*u,0,AX,Z(1060),'z',6,36),C.pink,M.gloss);
  body.add(zlathe([[54.4*u,Z(1021)],[54.8*u,Z(1021)],[54.8*u,Z(1034)],[54.4*u,Z(1034)]],0,AX,0,40),'#c1a839',M.satin);
  for(let j=0;j<8;j++){const a=j*Math.PI/4;body.add(box(.005,.008,.004,Math.cos(a)*55.2*u,AX+Math.sin(a)*55.2*u,Z(1028),.2,4,4),j%2?C.pink:'#68645a',M.satin);}
  for(const sx of [-1,1]){
    body.add(xcyl(.004,sx*.015,sx*.018,Y(319),Z(468),10),C.metal,M.metal);
    body.add(xcyl(.004,sx*.012,sx*.015,Y(483),Z(909),10),C.metal,M.metal);
  }
  return rebuild(d,{body,ink:new Pieces(),parts:{can:part(can,[0,AX,(Z(491)+Z(768))/2],'ink'),trigger:part(trig,TRIGGER_PIVOT)},
    gripR:rakedGrip(.40),gripL:supportGrip([0,.01,.265],0),muzzle:[0,.065,.38625]});
}

// ------------------------------------------------------------------------------------------ Jet Squelcher
function longJet(d) {
  // Wmn_Shooter_Long: a teal rear block whose front edge is the raked handle, a teal upper housing
  // (ink tank, pulses per shot), a thin black hose running out to a pale teal nozzle with a black ring.
  const s = 0.11 / 63, P = px(120, 250, s), Z = x => P(x, 0)[0], Y = y => P(0, y)[1];
  const C = { teal: '#1f6b78', dteal: '#16505b', black: '#1b1c20', pale: '#c6e3dc' };
  const RAKE = 0.30;
  const body = new Pieces(), can = new Pieces();
  body.add(side(P, [[14, 232], [30, 218], [100, 218], [130, 211], [160, 211], [190, 207], [210, 214], [226, 246], [208, 250],
    [176, 258], [144, 268], [128, 279], [100, 284], [60, 290], [32, 290], [14, 276]], 0.05), C.dteal, M.satin);
  can.add(side(P, [[96, 114], [112, 118], [128, 121], [144, 131], [176, 139], [208, 146], [232, 150], [248, 152], [256, 160],
    [248, 176], [224, 184], [192, 187], [160, 186], [128, 182], [104, 185], [96, 160]], 0.045, 16), C.teal, M.gloss);
  body.add(sideTube(P, [[240, 161], [262, 161], [290, 162], [320, 161], [330, 161]], 5.5 * s, 0, 2), C.black, M.metal);
  body.add(zlathe([[0, Z(328)], [9 * s, Z(330)], [15 * s, Z(344)], [15 * s, Z(346)], [13 * s, Z(362)], [12 * s, Z(376)],
    [11 * s, Z(392)], [11 * s, Z(396)], [0, Z(396)]], 0, Y(161), 0, 24), C.pale, M.gloss);
  body.add(zcyl(15 * s, Z(346), Z(352), 0, Y(161), 24), C.black, M.satin);
  const trig = raked(body, RAKE, { color: C.dteal, triggerColor: C.black, guardColor: C.dteal, w: 0.0135 });
  return rebuild(d, {
    body, ink: new Pieces(),
    parts: { can: part(can, [0, Y(150), Z(176)], 'body'), trigger: part(trig, TRIGGER_PIVOT) },
    gripR: rakedGrip(RAKE),
    gripL: supportGrip([0, Y(196), Z(200)], 0),
    muzzle: [0, Y(161), Z(396)],
  });
}

// ------------------------------------------------------------------------------------------ Splattershot Nova
function nova(d) {
  // Wmn_Shooter_QuickLong: white rear tank (ink tank, pulses per shot) over a dark purple front body,
  // a yellow lens on the top front, a white ribbed fore-end and a yellow nozzle tube out of its front,
  // dark purple raked grip.
  const s = 0.11 / 66, P = px(118, 265, s), Z = x => P(x, 0)[0], Y = y => P(0, y)[1];
  const C = { white: '#ececea', purple: '#3a3347', dpurple: '#2a2535', yellow: '#e9e22a', grey: '#5b5566', trig: '#7a58c8' };
  const RAKE = 0.42;
  const body = new Pieces(), can = new Pieces();
  const ty = Y(170), tz0 = Z(30), tz1 = Z(186);
  can.add(side(P, [[30, 156], [60, 128], [100, 118], [140, 118], [176, 122], [186, 150], [180, 206], [160, 228], [120, 230],
    [76, 226], [40, 206], [28, 180]], 0.06, 16), C.white, M.gloss);
  body.add(side(P, [[170, 122], [240, 120], [272, 116], [292, 128], [296, 200], [288, 246], [262, 268], [240, 254], [200, 246],
    [172, 232]], 0.07, 16), C.purple, M.satin);
  body.add(side(P, [[270, 114], [300, 102], [306, 114], [290, 122]], 0.02), C.dpurple, M.satin);
  body.add(zlathe([[0, Z(330)], [26 * s, Z(332)], [26 * s, Z(380)], [0, Z(382)]], 0, ty, 0, 24), C.yellow, M.gloss);
  body.add(zlathe([[0, Z(222)], [25 * s, Z(222)], [25 * s, Z(300)], [0, Z(300)]], 0, Y(240), 0, 24), C.white, M.gloss);
  for (const z of [236, 252, 268, 284]) body.add(zcyl(26 * s, Z(z), Z(z + 4), 0, Y(240), 20), C.dpurple, M.satin);
  body.add(zlathe([[0, Z(296)], [24 * s, Z(298)], [16 * s, Z(318)], [16 * s, Z(382)], [14 * s, Z(384)], [0, Z(384)]], 0, Y(237), 0, 22),
    C.yellow, M.gloss);
  const trig = raked(body, RAKE, { color: C.grey, triggerColor: C.trig, guardColor: C.dpurple });
  return rebuild(d, {
    body, ink: new Pieces(),
    parts: { can: part(can, [0, ty, (tz0 + tz1) / 2], 'body'), trigger: part(trig, TRIGGER_PIVOT) },
    gripR: rakedGrip(RAKE),
    gripL: supportGrip([0, Y(256), Z(246)], 0),
    muzzle: [0, Y(237), Z(384)],
  });
}

// ------------------------------------------------------------------------------------------ Nozzlenose (L-3 / H-3)
/** Shared Nozzlenose frame: a reel (blue flanges, ribbed core = the ink hose, pulses per shot), a black frame,
 *  a coupler, a collar and a big nozzle cap set higher than the reel axis. Per-model numbers in `o`. */
function nozzlenose(d, o) {
  // Measure S3 D / VIP-R turntables after 14.04 / 8.61 degree roll correction.
  // Use ONLY the common reel/frame/plumbing; base-variant finish comes from its S3 render.
  // No D logo/silver frame or VIP-R snake skin, straps or spikes are transferred.
  const h = o === H3;
  const q = h ? {end:1510,origin:480,axis:519,reelY:575,reel:[615,643,877,905],r:133,
    top:425,bottom:743,front:995,cap:[1270,1375,1510],collar:[1190,1280],scale:(388-36)*(0.11/84)/(1510-480)}
    : {end:976,origin:405,axis:310,reelY:354,reel:[459,484,680,706],r:112,
      top:239,bottom:484,front:777,cap:[842,918,976],collar:[779,844],scale:(377-60)*(0.11/100)/(976-405)};
  const oldP=px(o.gx,o.gy,o.s), muzzle=[0,oldP(0,o.nozY)[1],oldP(o.muzzleX,0)[0]],AX=muzzle[1];
  const u=q.scale,Z=x=>muzzle[2]+(x-q.end)*u,Y=y=>AX+(q.axis-y)*u;
  const C={blue:'#293b99',blueEdge:'#364cb2',black:'#202329',edge:'#363a3d',mint:'#87bbb0',metal:'#b9bfbc',hose:'#d8d6c9'};
  const body=new Pieces(),can=new Pieces(),[f0,f1,f2,f3]=q.reel,ry=Y(q.reelY),rr=q.r*u;
  const panel=(points,width,x=0,bevel=.001)=>slab(points.map(([z,y])=>[Z(z),Y(y)]),width,x,bevel);
  const tube=(points,r,x=0)=>pipe(points.map(([z,y])=>[x,Y(y),Z(z)]),r,Math.max(10,points.length*3),6);
  // Broad reel flanges with recessed dishes, raised outer rim and a real axle.
  for(const [a,b]of[[f0,f1],[f2,f3]]){
    body.add(zlathe([[0,Z(a)],[rr*.77,Z(a)],[rr*.96,Z(a+3)],[rr,Z(a+8)],[rr,Z(b-5)],[rr*.9,Z(b)],[0,Z(b)]],0,ry,0,36),C.blue,M.gloss);
    body.add(ring(rr*.88,.0018,0,ry,Z((a+b)/2),'z',5,36),C.blueEdge,M.gloss);
    body.add(zcyl(rr*.19,Z(a-1),Z(b+1),0,ry,14),C.edge,M.satin);
  }
  body.add(zcyl(rr*.28,Z(f0-47),Z(f3+5),0,ry,14),C.metal,M.metal);
  // Four thick helical hose turns, rather than a solid cylinder with many fine rings.
  const coils=h?4:4.25, hoseR=(h?25:23)*u, major=rr-hoseR-3*u,points=[];
  const start=Z(f1)+hoseR*.8,end=Z(f2)-hoseR*.8;
  for(let k=0;k<=192;k++){const t=k/192,a=t*Math.PI*2*coils;points.push([Math.cos(a)*major,ry+Math.sin(a)*major,start+(end-start)*t]);}
  can.add(pipe(points,hoseR,192,8),C.hose,M.satin);
  // Fine raised tracer follows the hose, kept below the silhouette and in the same draw.
  const trace=[];for(let k=0;k<=192;k++){const t=k/192,a=t*Math.PI*2*coils;trace.push([Math.cos(a)*(major+hoseR*.94),ry+Math.sin(a)*(major+hoseR*.94),start+(end-start)*t]);}
  can.add(pipe(trace,.0008,192,4),'#aaaec0',M.satin);
  // Narrow top/bottom rails, a raked front foot and rear axle bridge leave the reel exposed.
  const frontTop=h?985:767,frontFoot=h?940:739,rearTop=h?633:483,rearFoot=h?594:442;
  body.add(panel([[rearTop,q.top],[frontTop,q.top-4],[frontTop+9,q.top+13],[rearTop-5,q.top+15]],.023),C.black,M.satin);
  body.add(panel([[rearFoot,q.bottom-9],[frontFoot,q.bottom+10],[frontFoot+8,q.bottom+29],[rearFoot-9,q.bottom+8]],.023),C.black,M.satin);
  body.add(panel([[f3-4,q.top+18],[frontTop+12,q.top+13],[frontTop+8,q.bottom-35],[frontFoot+7,q.bottom+29],[frontFoot-13,q.bottom+18],[f3+8,q.bottom-6]],.038),C.black,M.satin);
  body.add(panel([[rearTop-16,q.top+9],[f0+13,q.top+22],[f0-11,q.bottom-16],[rearFoot-7,q.bottom+12],[rearFoot-25,q.bottom-4]],.023),C.black,M.satin);
  // Revolver-like rear hammer/lever and narrow silver linkage are visible in both side views.
  const lever=h?[[467,447],[523,473],[493,505],[472,548],[475,603],[501,634]]:[[351,251],[398,270],[373,298],[360,344],[364,382],[391,407]];
  body.add(tube(lever,.0042),C.black,M.satin);
  const endLever=lever.at(-1),linkTarget=h?[539,676]:[423,451];
  body.add(tube([endLever,linkTarget],.003),C.metal,M.metal);
  body.add(panel(h?[[460,644],[516,661],[606,603],[619,706],[572,765],[480,740]]:[[361,415],[407,437],[449,402],[459,461],[432,511],[394,493]],.032),C.black,M.satin);
  const trig=raked(body,o.rake,{color:o.gripColor,triggerColor:C.black,guardColor:C.black,w:o.w});
  for(const sx of[-1,1])body.add(xcyl(.004,sx*.016,sx*.019,h?Y(722):Y(475),h?Z(478):Z(409),10),C.metal,M.metal);
  // Standard H-3 has a prominent T-valve, forward hex union, lower bypass and top lever.
  if(h){
    body.add(zcyl(43*u,Z(996),Z(1194),0,AX,24),C.metal,M.metal);
    body.add(zcyl(70*u,Z(999),Z(1102),0,AX,6),C.metal,M.metal);
    body.add(zcyl(73*u,Z(1107),Z(1186),0,AX,6),'#a9b1b0',M.metal);
    body.add(zcyl(40*u,Z(1185),Z(1290),0,AX,24),C.metal,M.metal);
    body.add(ycyl(36*u,Y(495),Y(409),0,Z(1045),20),C.metal,M.metal);
    body.add(ycyl(52*u,Y(410),Y(387),0,Z(1045),24),'#a5adab',M.metal);
    body.add(panel([[675,319],[948,326],[995,363],[1090,376],[1110,394],[1019,420],[955,383],[680,358]],.022,0,.002),C.blue,M.gloss);
    body.add(panel([[977,367],[1033,377],[1092,377],[1110,394],[1020,410],[980,391]],.027),C.metal,M.metal);
    body.add(zcyl(16*u,Z(982),Z(1133),0,Y(619),16),C.metal,M.metal);
    body.add(zcyl(26*u,Z(1093),Z(1141),0,Y(619),18),C.black,M.satin);
    for(let k=0;k<4;k++)body.add(ring(25*u,.001,0,Y(619),Z(1101+k*9),'z',4,16),C.edge,M.satin);
  }else{
    body.add(zcyl(48*u,Z(706),Z(801),0,AX,24),C.black,M.satin);
    body.add(zcyl(17*u,Z(756),Z(801),0,Y(385),12),C.edge,M.satin);
  }
  const [ca,cb]=q.collar,[a,b,c]=q.cap;
  body.add(zlathe([[0,Z(ca)],[49*u,Z(ca)],[56*u,Z(ca+8)],[56*u,Z(cb-6)],[49*u,Z(cb)],[0,Z(cb)]],0,AX,0,32),h?C.blue:C.mint,M.gloss);
  for(const x of[ca+7,cb-7])body.add(ring(52*u,.0023,0,AX,Z(x),'z',5,28),C.blue,M.gloss);
  const capBack=h?40:65,capFront=h?111:89,capColor=h?'#292d2e':C.blue;
  // Concave neck + faceted knob; the face is recessed, with a central outlet and radial dial holes.
  body.add(zlathe([[0,Z(a)],[capBack*u,Z(a)],[capBack*u,Z(a+16)],[(capFront-12)*u,Z(b-7)],
    [capFront*u,Z(b)],[capFront*u,Z(c-8)],[(capFront-7)*u,Z(c)],[(capFront-25)*u,Z(c)],
    [(capFront-25)*u,Z(c-11)],[0,Z(c-11)]],0,AX,0,h?16:20),capColor,M.gloss);
  if(!h)body.add(zlathe([[65*u,Z(a)],[76*u,Z(a+35)],[89*u,Z(b)],[88*u,Z(b+2)]],0,AX,0,24),C.mint,M.satin);
  body.add(zcyl((capFront-28)*u,Z(c-13),Z(c-10),0,AX,32),'#17232b',M.rubber);
  body.add(ring((capFront-26)*u,.002,0,AX,Z(c-8),'z',5,32),h?C.blue:C.blueEdge,M.gloss);
  body.add(ring(17*u,4*u,0,AX,Z(c-8),'z',5,24),h?C.blue:C.mint,M.gloss);
  for(let j=0;j<(h?16:28);j++){
    const t=j*Math.PI*2/(h?16:28),r=(capFront+1)*u;
    const ridge=box(7*u,7*u,(c-b-4)*u,0,0,0,.2,4,4).rotateZ(t).translate(Math.cos(t)*r,AX+Math.sin(t)*r,Z((b+c)/2));body.add(ridge,capColor,M.satin);
  }
  for(let j=0;j<10;j++){const t=j*Math.PI/5,r=(capFront-37)*u;body.add(zcyl(5*u,Z(c-10),Z(c-8),Math.cos(t)*r,AX+Math.sin(t)*r,8),C.black,M.rubber);}
  return rebuild(d,{body,ink:new Pieces(),parts:{can:part(can,[0,ry,Z((f1+f2)/2)],'body'),trigger:part(trig,TRIGGER_PIVOT)},
    gripR:rakedGrip(o.rake),gripL:supportGrip([0,oldP(0,o.supY)[1],oldP(o.supX,0)[0]],0),muzzle});
}
const L3 = {
  s: 0.11 / 100, gx: 60, gy: 268, reelY: 181, nozY: 142, reel: [78, 98, 176, 196], reelR: 62, coreR: 50,
  coupler: [216, 252], couplerR: 22, collar: [252, 300], collarR: 27, collarColor: '#7ccfb8',
  cap: [[44, 300], [52, 312], [56, 336], [54, 360], [46, 372], [44, 376]], capColor: '#2a3ec2', muzzleX: 377,
  rake: 0.21, w: 0.014, gripColor: '#1e1f23', supY: 256, supX: 150, barColor: '#1e1f23',
  bar: [[96, 98], [236, 100], [240, 122], [104, 122]], front: [[196, 120], [216, 116], [222, 268], [204, 270]],
  rear: [[70, 126], [92, 124], [96, 262], [72, 262]],
};
const H3 = {
  s: 0.11 / 84, gx: 36, gy: 262, reelY: 187, nozY: 159, reel: [80, 100, 180, 200], reelR: 67, coreR: 49,
  coupler: [212, 256], couplerR: 25, collar: [256, 300], collarR: 22, collarColor: '#3b3d44',
  cap: [[20, 300], [32, 320], [45, 336], [53, 352], [53, 368], [46, 380], [44, 384]], capColor: '#26282d', muzzleX: 388,
  rake: 0.39, w: 0.0125, gripColor: '#2b43b8', supY: 262, supX: 170, barColor: '#2a3ec2',
  bar: [[64, 104], [192, 96], [196, 110], [72, 120]], front: [[200, 120], [216, 116], [222, 252], [206, 258]],
  rear: [[70, 124], [90, 124], [96, 252], [76, 252]],
};
const nozzleL3 = d => nozzlenose(d, L3);
const nozzleH3 = d => nozzlenose(d, H3);

// ------------------------------------------------------------------------------------------ Squeezer
function squeezer(d) {
  // S3 Foil turntable supplies the shared bottle/cage shape after 16.80° roll correction.
  // Standard S3 render supplies red/orange foil, white chevrons and SHORT cream cap.
  // Foil's green finish and long gold wrap are deliberately not imported.
  const P=px(36,274,.11/64),muzzle=[0,P(0,163)[1],P(392,0)[0]],AX=muzzle[1];
  const u=muzzle[2]/(1560-515),Z=x=>muzzle[2]+(x-1560)*u,Y=y=>AX+(540-y)*u;
  const C={red:'#b9401f',white:'#e6e7da',black:'#142323',metal:'#aab2ad',dark:'#454e4b',wood:'#a7582f'};
  const body=new Pieces(),can=new Pieces();
  const shape=[[0,608],[110,622],[166,651],[184,685],[186,770],[182,854],[171,929],[159,977],[145,1051],
    [124,1140],[100,1210],[78,1285],[65,1360],[60,1440],[59,1519]];
  const radius=x=>{for(let k=1;k<shape.length;k++)if(x<=shape[k][1]){const[a,z0]=shape[k-1],[b,z1]=shape[k];return(a+(b-a)*(x-z0)/(z1-z0))*u;}return shape.at(-1)[0]*u;};
  // Per-face painted foil patches keep hard white chevron edges, not a blank white bulb.
  const pos=[],nor=[],colors=[],materials=[],index=[],cols=64,rows=48;
  const red=new THREE.Color(C.red),white=new THREE.Color(C.white),black=new THREE.Color(C.black);
  for(let k=0;k<rows;k++)for(let j=0;j<cols;j++){
    const x0=608+(1519-608)*k/rows,x1=608+(1519-608)*(k+1)/rows,a=j*Math.PI*2/cols,b=(j+1)*Math.PI*2/cols;
    const xm=(x0+x1)/2,tm=(a+b)/2,zig=.085*Math.asin(Math.sin(tm*3))*2/Math.PI;
    const phase=(((xm-637)/238+tm/Math.PI*.56+zig)%1+1)%1;
    const whitePanel=xm<1225&&phase<.31;
    const c=whitePanel?white:xm>1195?black:red, m=whitePanel?M.satin:xm>1195?M.gloss:M.metal;
    const start=pos.length/3;
    for(const[x,t]of[[x0,a],[x0,b],[x1,b],[x1,a]]){const r=radius(x);pos.push(Math.cos(t)*r,AX+Math.sin(t)*r,Z(x));nor.push(Math.cos(t),Math.sin(t),0);colors.push(c.r,c.g,c.b);materials.push(m);}
    index.push(start,start+1,start+2,start,start+2,start+3);
  }
  const bottle=new THREE.BufferGeometry();bottle.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));bottle.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));bottle.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));bottle.setAttribute('aMat',new THREE.Float32BufferAttribute(materials,1));bottle.setIndex(index);bottle.computeVertexNormals();can.list.push(bottle);
  // Broad stainless straps conform to the bottle's actual changing radius.
  for(const[a,b]of[[771,803],[951,989]]){
    const profile=[[radius(a)+.0009,Z(a)],[radius(a)+.0042,Z(a)],[radius(b)+.0042,Z(b)],[radius(b)+.0009,Z(b)]];
    body.add(zlathe(profile,0,AX,0,48),C.metal,M.metal);
    for(const x of[a,b])body.add(ring(radius(x)+.0043,.0015,0,AX,Z(x),'z',5,36),C.metal,M.metal);
  }
  // Eight slender retaining wires stretch from the front band to the cap; four join the rear cage.
  for(let j=0;j<8;j++){
    const a=(j+.5)*Math.PI/4,points=[];
    for(const x of[969,1040,1170,1320,1492,1544]){const r=x<1000?radius(x)+.008:x<1200?radius(x)+.012:radius(x)+.004;points.push([Math.cos(a)*r,AX+Math.sin(a)*r,Z(x)]);}
    body.add(pipe(points,.0017,18,5),C.metal,M.metal);
  }
  for(let j=0;j<4;j++){
    const a=(j+.5)*Math.PI/2,points=[];for(const x of[614,650,695,785]){const r=x<650?radius(x)+.016:radius(x)+.009;points.push([Math.cos(a)*r,AX+Math.sin(a)*r,Z(x)]);}body.add(pipe(points,.0016,16,5),C.metal,M.metal);
  }
  // Side saddle, rear vertical catch and real wood grip are separate from the round bottle.
  const panel=(points,width,x=0)=>slab(points.map(([z,y])=>[Z(z),Y(y)]),width,x,.0015);
  for(const sx of[-1,1]){
    body.add(panel([[604,688],[668,708],[979,710],[1006,731],[948,723],[652,728]],.005,sx*.032),C.metal,M.metal);
    body.add(panel([[542,419],[568,411],[602,480],[589,514],[615,568],[615,694],[638,722],[610,743],[564,717],[550,553],[558,504]],.009,sx*.023),C.dark,M.metal);
    for(const x of[784,972])body.add(box(.012,.007,.018,sx*.018,AX+radius(x)+.003,Z(x),.25,6,4),C.metal,M.metal);
  }
  const trig=raked(body,.49,{color:C.wood,triggerColor:C.metal,guard:false,base:false,mat:M.satin});
  for(const sx of[-1,1])for(const[y,z]of[[.015,.006],[-.035,-.020]])body.add(xcyl(.0035,sx*.012,sx*.014,y,z,10),C.metal,M.metal);
  body.add(pipe([[0,.032,.031],[0,.011,.041],[0,-.017,.049],[0,-.043,.059]],.0032,14,6),C.metal,M.metal);
  // Standard cork-coloured collar and a short pale metal lip. The outlet is recessed.
  body.add(zcyl(59*u,Z(1492),Z(1531),0,AX,32),'#a58660',M.satin);
  body.add(zlathe([[0,Z(1529)],[65*u,Z(1529)],[68*u,Z(1537)],[68*u,Z(1558)],[60*u,Z(1560)],
    [35*u,Z(1560)],[35*u,Z(1546)],[0,Z(1546)]],0,AX,0,24),C.white,M.gloss);
  body.add(zcyl(35*u,Z(1544),Z(1547),0,AX,24),C.black,M.rubber);
  body.add(ring(48*u,.0018,0,AX,Z(1559),'z',5,28),C.metal,M.metal);
  return rebuild(d,{body,ink:new Pieces(),parts:{can:part(can,[0,AX,Z((608+1519)/2)],'body'),trigger:part(trig,TRIGGER_PIVOT)},
    gripR:rakedGrip(.49),gripL:supportGrip([0,P(0,214)[1],P(236,0)[0]],0),muzzle});
}

export const MODELS = {
  's3-shooter-expert': { sourceModel: 'Wmn_Shooter_Expert', build: expert },
  // The support hand closes on the front bracket ~0.27 m ahead of the grip: hold the gun closer to the
  // chest (stock against the shoulder) so the left arm reaches it (image-estimated, not measured).
  's3-shooter-heavy': { sourceModel: 'Wmn_Shooter_Heavy', build: heavy,
    hold: { aim: { p: [-0.04, -0.06, 0.13] }, carry: { p: [-0.16, 0.8, 0.02], r: [0.5, 0.15, -0.12] }, run: { p: [-0.16, 0.82, 0.06] } } },
  's3-shooter-long': { sourceModel: 'Wmn_Shooter_Long', build: longJet },
  's3-shooter-quicklong': { sourceModel: 'Wmn_Shooter_QuickLong', build: nova },
  's3-shooter-triplequick': { sourceModel: 'Wmn_Shooter_TripleQuick', build: nozzleL3 },
  's3-shooter-triplemiddle': { sourceModel: 'Wmn_Shooter_TripleMiddle', build: nozzleH3 },
  's3-shooter-flash': { sourceModel: 'Wmn_Shooter_Flash', build: squeezer,
    // the bottle's fore-grip is far forward: carry it closer so the support hand still reaches (image-estimated)
    hold: { carry: { p: [-0.17, 0.79, 0.05], r: [0.45, 0.14, -0.14] }, run: { p: [-0.16, 0.81, 0.09] }, aim: { p: [-0.04, -0.07, 0.15] } } },
};

