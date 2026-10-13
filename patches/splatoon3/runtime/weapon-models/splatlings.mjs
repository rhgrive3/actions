// Splatling family models (Splatoon 3 Ver.11.3.0 spinners): Heavy Splatling, Mini Splatling, Hydra Splatling,
// Ballpoint Splatling, Nautilus 47, Heavy Edit Splatling. Shapes follow the official per-weapon 3D renders and
// the turntable frames (Inkipedia "S3 <Name> model rotating.mp4"); colours come from the 3D renders. The native
// splatling channels are kept: `trigger` (pistol trigger) and `barrels` (the spun cluster, rotating about its
// local Z through a pivot on the barrel axis). The native charge coil is kept for readability although none of the six references
// shows a charge meter. Everything is procedural geometry.
import { Pieces, M, zlathe, xlathe, ylathe, zcyl, ring, pipe, box, sphere, cyl, lathe, torus, at, pistolGrip, supportHandle, part, rebuild, TRIGGER_PIVOT, THREE, slab } from './kit.mjs';

/** Barrels on a ring of radius R about the spin axis (ay): n tubes from z0 to z1, each with a nozzle tip. */
function barrelRing(B, o) {
  for (let k = 0; k < o.n; k++) {
    const a = o.a0 + (k * 2 * Math.PI) / o.n, x = Math.cos(a) * o.R, y = o.ay + Math.sin(a) * o.R;
    B.add(zcyl(o.r, o.z0, o.z1, x, y, 10), o.barrel, M.metal);
    B.add(zcyl(o.tipR, o.z1 - o.tipL, o.z1 + 0.002, x, y, 10), o.tip, M.gloss);
  }
}
/** Shared finish: the native support hand stays on d.gripL (drawn as a foregrip), the native trigger and
 *  barrel channels take the new pieces, the native charge coil is kept (a charging splatling must stay readable
 *  to other players), the muzzle sits at the nozzle exit. */
function finish(d, body, B, tr, AX, muzzleZ, supportColor, ink = new Pieces(), glass = null) {
  supportHandle(body, d.gripL, supportColor);
  return rebuild(d, {
    body, ink, glass,
    parts: { trigger: part(tr, TRIGGER_PIVOT), barrels: part(B, [0, AX, 0.3]) },
    muzzle: [0, AX, muzzleZ],
  });
}
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ------------------------------------------------------------------------------------------ Heavy Splatling
// Wmn_Spinner_StandardT. Rear: a tall silver ink reservoir leaning outward, two straps and a feed hose.
// Front: a pink hub drum with six barrels on a ring (six dark tubes with black tips). Black motor housing,
// carry bail on top. The tank and housing dimensions come from the legacy reference model (IoU 0.57);
// the six-barrel cluster is traced from the 3D render and the turntable face view.
function heavy(d) {
  // Rebuilt (Opus): the big reservoir is a drum lying across the gun (axis X) behind the motor, in team ink
  // (the turntable shows it ink-coloured, the render translucent grey) inside a dark wire cage; a black
  // motor block with a carry handle, a pink hub with six dark barrels, a black foregrip knob.
  const AX = 0.07, C = { dark: '#2a2b30', cage: '#3a3c42', pink: '#d8287f', black: '#141518', silver: '#b8bcc2' };
  const body = new Pieces(), B = new Pieces(), ink = new Pieces();
  const tr = pistolGrip(body, { color: C.dark, triggerColor: C.pink, guardColor: C.dark });
  body.add(box(0.072, 0.085, 0.17, 0, AX, 0.095, 0.3), C.dark, M.satin);                                        // motor block
  body.add(box(0.03, 0.016, 0.06, 0, AX + 0.05, 0.16, 0.4), C.pink, M.gloss);                                     // pink latch
  body.add(pipe([[0, AX + 0.042, 0.04], [0, AX + 0.085, 0.06], [0, AX + 0.085, 0.13], [0, AX + 0.042, 0.15]], 0.0065, 18, 6), C.black, M.satin);
  const ty = AX + 0.055, tz = -0.075, tr2 = 0.088, hw = 0.07;
  ink.add(cyl(tr2, [-hw, ty, tz], [hw, ty, tz], 28));                                                            // ink reservoir
  for (const sx of [-1, 1]) body.add(ring(tr2 - 0.004, 0.008, sx * hw, ty, tz, 'x', 6, 28), C.dark, M.satin);   // drum rims
  for (const x of [-0.035, 0.035]) body.add(ring(tr2 + 0.006, 0.003, x, ty, tz, 'x', 4, 28), C.cage, M.satin);   // cage hoops
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; body.add(cyl(0.003, [-hw - 0.004, ty + Math.sin(a) * (tr2 + 0.006), tz + Math.cos(a) * (tr2 + 0.006)], [hw + 0.004, ty + Math.sin(a) * (tr2 + 0.006), tz + Math.cos(a) * (tr2 + 0.006)], 6), C.cage, M.satin); }
  body.add(box(0.05, 0.04, 0.03, 0, AX + 0.01, 0.02, 0.4), C.dark, M.satin);                                    // tank coupling
  // pink hub with six barrels
  barrelRing(B, { n: 6, a0: Math.PI / 2, R: 0.034, ay: AX, r: 0.0105, z0: 0.18, z1: 0.46, tipL: 0.022, tipR: 0.012, barrel: C.black, tip: C.dark });
  B.add(zlathe([[0, 0.175], [0.056, 0.175], [0.058, 0.2], [0.05, 0.215], [0, 0.215]], 0, AX, 0, 24), C.pink, M.gloss);
  B.add(zlathe([[0.044, 0.33], [0.05, 0.33], [0.05, 0.35], [0.044, 0.35]], 0, AX, 0, 24), C.pink, M.gloss);
  B.add(zlathe([[0.044, 0.425], [0.05, 0.425], [0.05, 0.44], [0.044, 0.44]], 0, AX, 0, 24), C.pink, M.gloss);
  B.add(zcyl(0.014, 0.18, 0.46, 0, AX, 12), C.dark, M.satin);                                                     // axle
  return finish(d, body, B, tr, AX, 0.468, C.black, ink);
}

// ------------------------------------------------------------------------------------------ Mini Splatling
// Wmn_Spinner_QuickT. A purple housing with a black carry bail, a white bulb-shaped tank at the rear and a
// yellow drum at the front. Six blue nozzles sit on a ring about a black centre.
function mini(d) {
  // Reconstructed from the PR1246 PNG and all turntable views: a motor cradled by two open side
  // cheeks, offset under-slung pump bottle, long exposed six-barrel cage, and a thick muzzle plate.
  // The legacy firing socket, native two-hand hold and Z spin pivot are deliberately unchanged.
  const AX = 0.07, C = { purple: '#493098', black: '#18191d', yellow: '#e5bc21', blue: '#255cd2', silver: '#b8bec1' };
  const body = new Pieces(), B = new Pieces(), ink = new Pieces();
  const tr = pistolGrip(body, { color: C.black, triggerColor: C.purple, guardColor: C.purple });
  body.add(zlathe([[0,-.038],[.034,-.038],[.041,-.023],[.041,.073],[.034,.086],[0,.086]],0,AX,0,24),C.black,M.satin);
  // Purple saddle rises at the front while leaving the black motor and handle opening visible.
  const cheek=[[-.045,.022],[-.058,.047],[-.054,.091],[-.037,.117],[-.022,.123],[-.024,.082],[-.013,.058],[.015,.046],[.039,.055],[.077,.102],[.096,.114],[.118,.111],[.123,.096],[.098,.092],[.062,.046],[.039,.02]];
  for(const x of[-.037,.037]) {
    body.add(slab(cheek,.01,x,.0025),C.purple,M.gloss);
    for(const [z,y] of[[-.043,.063],[.04,.033]])body.add(cyl(.0032,[x-.0055,y,z],[x+.0055,y,z],8),C.silver,M.metal);
  }
  body.add(box(.081,.014,.065,0,.018,.008,.28,8,4),C.purple,M.gloss);
  // Rear pump lever and silver neck are distinct from the reservoir, not a box on the barrel axis.
  body.add(box(.039,.023,.112,-.022,.127,-.087,.24,8,4),C.purple,M.gloss);
  body.add(box(.031,.043,.025,-.022,.103,-.039,.3,8,4),C.purple,M.gloss);
  body.add(zlathe([[.007,-.148],[.011,-.148],[.011,-.135],[.007,-.135]],-.022,.127,0,12),C.silver,M.metal);
  body.add(pipe([[0,.108,.009],[0,.177,.018],[0,.183,.034],[0,.18,.079],[0,.114,.09]],.008,18,6),C.black,M.satin);
  // The bottle is low, behind and to the holder's right. Its flattened egg section has a long axis Z.
  const tx=-.041,ty=-.004,tz=-.072;
  ink.add(zlathe([[0,-.166],[.021,-.161],[.049,-.141],[.061,-.116],[.063,-.07],[.057,-.026],[.039,-.007],[.023,0],[0,.004]],tx,ty,0,24).scale(1,.88,1));
  body.add(zlathe([[0,-.19],[.012,-.19],[.018,-.182],[.018,-.164],[.024,-.158],[0,-.158]],tx,ty,0,14),C.blue,M.gloss);
  body.add(cyl(.01,[tx,ty,-.157],[tx,.03,-.032],12),C.silver,M.metal);
  // Two broad, flat straps wrap the tank; rings have actual axial thickness, not a wire cage.
  for(const z of[-.128,-.042])body.add(zlathe([[.057,z-.005],[.064,z-.005],[.064,z+.005],[.057,z+.005]],tx,ty,0,24).scale(1,.88,1),C.yellow,M.gloss);
  body.add(pipe([[tx-.057,-.02,-.132],[tx-.058,.044,-.111],[tx-.043,.055,-.04],[-.012,.016,.082],[.011,.01,.122],[.014,.028,.166]],.006,24,6),C.yellow,M.gloss);
  body.add(pipe([[tx+.055,-.025,-.13],[tx+.056,-.054,-.103],[tx+.04,-.057,-.035],[.012,-.04,-.011]],.0055,16,6),C.yellow,M.gloss);
  // Exposed tubes and their midpoint clamp rotate together. A dark centre remains visible end-on.
  barrelRing(B,{n:6,a0:Math.PI/2,R:.027,ay:AX,r:.008,z0:.074,z1:.294,tipL:.01,tipR:.0085,barrel:C.black,tip:C.black});
  B.add(zcyl(.012,.071,.326,0,AX,12),C.black,M.satin);
  B.add(zlathe([[.032,.143],[.044,.143],[.046,.149],[.046,.168],[.041,.178],[.032,.178]],0,AX,0,24),C.purple,M.gloss);
  // Flat-annular stepped yellow plate keeps six independent open blue nozzle mouths.
  B.add(zlathe([[.013,.276],[.047,.276],[.055,.291],[.055,.314],[.052,.324],[.014,.324],[.013,.314]],0,AX,0,30),C.yellow,M.gloss);
  for(let k=0;k<6;k++) {
    const a=Math.PI/2+k*Math.PI/3,x=Math.cos(a)*.033,y=AX+Math.sin(a)*.033;
    B.add(zlathe([[.006,.32],[.01,.32],[.011,.326],[.01,.332],[.006,.332],[.006,.32]],x,y,0,12),C.blue,M.gloss);
    B.add(zcyl(.0058,.327,.328,x,y,10),C.black,M.rubber);
  }
  B.add(zlathe([[0,.316],[.014,.316],[.014,.326],[.01,.332],[0,.332]],0,AX,0,14),C.black,M.satin);
  return finish(d,body,B,tr,AX,.334,C.black,ink);
}

function hydra(d) {
  // Rebuilt (Opus): a big silver can with a red label band standing tilted back at the rear in a black
  // wire cage, a red round drum in an orange frame, four silver barrels (2×2) with gold threaded tips, a
  // yellow feed hose and a black base skid.
  const AX = 0.07, C = { silver: '#c7cacd', red: '#b5262e', maroon: '#7c1e24', orange: '#e2702a', gold: '#d2b24a', black: '#17181b', yellow: '#e8c22a' };
  const body = new Pieces(), B = new Pieces(), ink = new Pieces();
  const tr = pistolGrip(body, { color: C.black, triggerColor: C.red, guardColor: C.black });
  const can = new Pieces();
  can.add(ylathe([[0, -0.13], [0.07, -0.13], [0.074, -0.12], [0.074, 0.12], [0.06, 0.135], [0.03, 0.14], [0, 0.14]], 0, 0, 0, 28), C.silver, M.satin);
  can.add(ylathe([[0.0755, -0.04], [0.0755, 0.07]], 0, 0, 0, 28).scale(1, 1, 1), C.red, M.gloss);
  for (const y of [-0.08, 0.0, 0.08]) can.add(ring(0.078, 0.003, 0, y, 0, 'y', 4, 28), C.black, M.satin);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; can.add(cyl(0.003, [Math.cos(a) * 0.078, -0.1, Math.sin(a) * 0.078], [Math.cos(a) * 0.078, 0.1, Math.sin(a) * 0.078], 6), C.black, M.satin); }
  body.merge(can.transform(g => g.rotateX(-0.5).translate(0, AX + 0.09, -0.11)));
  body.add(box(0.07, 0.07, 0.1, 0, AX, 0.04, 0.3), C.maroon, M.satin);                                         // breech
  body.add(box(0.11, 0.1, 0.03, 0, AX, 0.105, 0.3), C.orange, M.satin);                                         // orange frame
  body.add(pipe([[0.03, -0.03, -0.05], [0.05, -0.05, 0.0], [0.02, -0.02, 0.06]], 0.007, 16, 6), C.yellow, M.gloss);  // feed hose
  body.add(box(0.07, 0.012, 0.16, 0, -0.07, 0.06, 0.3), C.black, M.satin);                                     // base skid
  B.add(zlathe([[0, 0.11], [0.06, 0.11], [0.064, 0.125], [0.064, 0.175], [0.058, 0.19], [0, 0.19]], 0, AX, 0, 28), C.red, M.gloss);
  for (const [x, y] of [[-0.026, 0.026], [0.026, 0.026], [-0.026, -0.026], [0.026, -0.026]]) {
    B.add(zcyl(0.014, 0.19, 0.29, x, AX + y, 14), C.silver, M.satin);
    B.add(zcyl(0.012, 0.29, 0.33, x, AX + y, 14), C.gold, M.metal);
    for (let k = 0; k < 4; k++) B.add(ring(0.0125, 0.0018, x, AX + y, 0.295 + k * 0.009, 'z', 4, 12), C.gold, M.metal);
  }
  return finish(d, body, B, tr, AX, 0.334, C.black, ink);
}

function ballpoint(d) {
  // Standard Ballpoint: a real transparent sleeve over separate ink barrels, a
  // black front ring and nose, a white rear cap, a black band with a
  // logo panel, a white ribbed foregrip below and a silver carry handle on top.
  const AX = 0.07, C = { white: '#eceae4', black: '#1a1b1f', silver: '#c1c4c8' };
  const body = new Pieces(), B = new Pieces(), ink = new Pieces(), glass = new Pieces();
  const tr = pistolGrip(body, { color: C.black, triggerColor: C.black, guardColor: C.black });
  body.add(zlathe([[0, -0.11], [0.03, -0.112], [0.05, -0.095], [0.052, -0.04], [0, -0.04]], 0, AX, 0, 28), C.white, M.gloss);  // rear cap
  body.add(zlathe([[0, -0.04], [0.054, -0.04], [0.054, 0.06], [0, 0.06]], 0, AX, 0, 28), C.black, M.satin);                     // black band
  // The clear sleeve continues around the rounded front shoulder. Only the
  // small central tip is black; the former opaque cone concealed this boundary.
  glass.add(zlathe([[0.05, 0.06], [0.05, 0.375], [0.048, 0.39], [0.041, 0.408], [0.03, 0.422]], 0, AX, 0, 32), '#ffffff');
  body.add(zlathe([[0, 0.422], [0.03, 0.422], [0.03, 0.43], [0, 0.43]], 0, AX, 0, 28), C.black, M.satin); // small opaque tip
  body.add(box(0.05, 0.05, 0.13, 0, -0.005, 0.16, 0.35), C.white, M.gloss);                                     // ribbed foregrip block
  for (let k = 0; k < 5; k++) body.add(box(0.054, 0.006, 0.01, 0, -0.03, 0.115 + k * 0.022, 0.5), C.white, M.gloss);
  body.add(pipe([[0, AX + 0.05, -0.02], [0, AX + 0.1, 0.0], [0, AX + 0.1, 0.06], [0, AX + 0.052, 0.07]], 0.006, 16, 6), C.silver, M.satin);
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; B.add(zcyl(0.011, 0.06, 0.37, Math.cos(a) * 0.026, AX + Math.sin(a) * 0.026, 10), '#ffffff', M.gloss); }
  finish(d, body, B, tr, AX, 0.432, C.black, ink, glass);
  d.parts.barrels.mat = 'ink'; // Each ink tube stays visible through the sleeve.
  return d;
}

function nautilus(d) {
  // S2 official 47 promotion and S3 79 rotation both show a hollow projecting coil and an inner tank.
  // These shared visible components replace the earlier mistaken concentric-disc interpretation.
  // S3 47 exact reverse geometry/materials are still unverified; no retail mesh or texture is used.
  // Silver hardware follows the Nautilus 47 still. The alternate 79 turntable is shape-only.
  // The former black-metal result came from undersized review PMREM, not the native shader.
  // Restore the 4d silver/metal finish. Coil/tank dimensions and exact S3 47 reverse remain under review.
  const AX=.07,C={dark:'#303338',black:'#181b1e',trim:'#d0d5d4',silver:'#aeb8bb'};
  const body=new Pieces(),B=new Pieces(),ink=new Pieces();
  const tr=pistolGrip(body,{color:C.black,triggerColor:C.dark,guardColor:C.dark});
  const sy=.121,sz=-.096;
  // Shape the YZ edge toward its low/front neck; all X layers share this contour, preserving volume.
  const shellShape=g=>{
    const p=g.attributes.position;for(let i=0;i<p.count;i++){
      const y=p.getY(i)-sy,z=p.getZ(i)-sz,r=Math.hypot(y,z);
      const cut=Math.max(0,(z-y)/Math.max(r,1e-8)-.68);
      p.setY(i,sy+y*(1-.15*cut));p.setZ(i,sz+z*(1-.15*cut));
    }p.needsUpdate=true;g.computeVertexNormals();return g;
  };
  // Keep the outer surface geometry fixed; the reverse is a smooth raised coil housing, not two grooves.
  // The rolled lip wraps both faces, rather than sitting behind the dark shell on the outer side.
  // Shell radius and Z length stay fixed. Only the inner (+X) coil/tank expands the transverse envelope.
  body.add(shellShape(xlathe([[0,-.041],[.053,-.041],[.073,-.036],[.099,-.023],[.121,-.003],[.132,.016],[.13,.022],[.12,.025],[.11,.032],[.103,.039],[.096,.045],[.09,.05],[.085,.054],[.078,.057],[.073,.058],[.067,.056],[.061,.05],[.054,.043],[.046,.039],[0,.037]],0,sy,sz,36)),C.silver,M.metal);
  body.add(shellShape(xlathe([[.123,.003],[.127,.005],[.133,.012],[.133,.023],[.128,.026],[.123,.026],[.123,.003]],0,sy,sz,36)),C.trim,M.metal);
  // Retain the enlarged outer-cap shape. Official47 images show reflective silver;
  // the earlier black-paint interpretation is withdrawn. The reverse housing is distinct.
  body.add(xlathe([[0,-.053],[.0538,-.053],[.0779,-.048],[.085,-.042],[.085,-.036],[0,-.036]],0,sy,sz,28),C.silver,M.metal);
  body.add(ring(.084,.0025,-.042,sy,sz,'x',4,28),C.silver,M.metal);
  // A slightly tapered roll of flat metal strip, not a round wire spring. The open mouth is narrower
  // than the base, as the return-facing source views show. The angular outer reference is approximate.
  const coil=new THREE.TorusGeometry(1,1,8,72,Math.PI*2*3.125);
  const cp=coil.attributes.position,cu=coil.attributes.uv;
  const cross=[[-.0023,-.0067],[-.0015,-.0075],[.0015,-.0075],[.0023,-.0067],[.0023,.0067],[.0015,.0075],[-.0015,.0075],[-.0023,.0067]];
  for(let i=0;i<cp.count;i++){
    const u=cu.getX(i),[axial,radial]=cross[Math.round(cu.getY(i)*8)%8],a=Math.PI*.25+Math.PI*2*3.125*u,R=.0508-.0023*u+radial;
    cp.setXYZ(i,.049+.038*u+axial,.097+Math.cos(a)*R,-.072+Math.sin(a)*R);
  }
  const ci=coil.index.array;for(let i=0;i<ci.length;i+=3){const t=ci[i+1];ci[i+1]=ci[i+2];ci[i+2]=t;}
  coil.computeVertexNormals();
  // Join both cut cross-sections to the return strip, leaving no exposed open ends.
  // The visible coil and tank-surrounding band are in both cited views; the hidden path is approximate.
  // Coil radial width is15mm, easing to8mm on the tank return; maximum coil OD remains116.6mm.
  // The return taper is an approximation to the narrower visible tank band, not a retail dimension claim.
  const start=new THREE.Vector3(.049,.097+Math.SQRT1_2*.0508,-.072+Math.SQRT1_2*.0508);
  const end=new THREE.Vector3(.087,.097,-.0235);
  // Follow the tank's chamfered outline instead of rounding across its pale face. Small
  // corner arcs soften the metal bends; exact hidden routing remains an approximation.
  const around=[[-.051,-.041],[-.035,-.057],[.039,-.057],[.053,-.044],
    [.053,.045],[.044,.06],[-.039,.06]].map(([z,y])=>new THREE.Vector3(.087,y,z).applyAxisAngle(new THREE.Vector3(1,0,0),-.18).add(new THREE.Vector3(0,.078,.029)));
  const entryTangent=new THREE.Vector3(.038,-Math.SQRT1_2*.0508*Math.PI*2*3.125,Math.SQRT1_2*.0508*Math.PI*2*3.125).normalize();
  const approach=start.clone().addScaledVector(entryTangent,-.017);
  const route=[end,...around,approach,start],returnPath=new THREE.CurvePath();let from=route[0];
  for(let i=1;i<route.length-1;i++){
    const p=route[i],prev=route[i-1],next=route[i+1],d=Math.min(.0035,p.distanceTo(prev)*.2,p.distanceTo(next)*.2);
    const before=p.clone().addScaledVector(prev.clone().sub(p).normalize(),d),after=p.clone().addScaledVector(next.clone().sub(p).normalize(),d);
    returnPath.add(new THREE.LineCurve3(from,before));let last=before;
    // Four explicit quadratic-bend chords also work in the frozen review vendor surface.
    for(let k=1;k<=4;k++){const t=k/4,q=before.clone().multiplyScalar((1-t)*(1-t)).addScaledVector(p,2*(1-t)*t).addScaledVector(after,t*t);returnPath.add(new THREE.LineCurve3(last,q));last=q;}
    from=after;
  }
  returnPath.add(new THREE.LineCurve3(from,route.at(-1)));
  const band=new THREE.TubeGeometry(returnPath,48,1,8,false),bp=band.attributes.position,bu=band.attributes.uv;
  for(let i=0;i<bp.count;i++){
    const u=bu.getX(i),j=Math.round(bu.getY(i)*8)%8,[axial,radial]=cross[j];
    if(u===0||u===1){const k=j*73+(u===0?72:0);bp.setXYZ(i,cp.getX(k),cp.getY(k),cp.getZ(k));continue;}
    const t=returnPath.getTangentAt(u),b=new THREE.Vector3(1,0,0).addScaledVector(t,-t.x).normalize(),n=new THREE.Vector3().crossVectors(t,b).normalize();
    const blend=Math.min(1,u/.12,(1-u)/.12),width=1-(1-8/15)*blend;
    const p=returnPath.getPointAt(u).addScaledVector(b,axial).addScaledVector(n,radial*width);bp.setXYZ(i,p.x,p.y,p.z);
  }
  const bi=band.index.array;for(let i=0;i<bi.length;i+=3){const t=bi[i+1];bi[i+1]=bi[i+2];bi[i+2]=t;}
  band.computeVertexNormals();body.add(coil,C.silver,M.metal);body.add(band,C.silver,M.metal);
  // Chamfered, visibly thick tank. Long side / coil OD is about .88 rather than v1's .63.
  // The profile is angular; a pale planar face and depth should remain legible at both inner obliques.
  const tank=[[-.045,.047],[-.036,.053],[.037,.053],[.046,.042],[.046,-.038],[.034,-.05],[-.03,-.05],[-.045,-.038]];
  body.add(slab(tank,.044,.062,.0015).translate(-.062,0,0).rotateX(-.18).translate(.062,.078,.029),'#e6cdd4',M.satin);
  for(let i=0;i<7;i++){
    const a=-.88+i*.19;
    body.add(box(.004,.004,.008,-.029,sy+Math.sin(a)*.09,sz-Math.cos(a)*.09,.28,6,4),C.silver,M.satin);
  }
  // A ribbed neck remains exposed between shell and sleeve; the small ink cap is attached here.
  body.add(zlathe([[0,-.06],[.026,-.06],[.03,-.037],[.029,.026],[0,.026]],0,AX,0,20),C.silver,M.metal);
  for(const z of[-.032,-.018,-.004])body.add(ring(.03,.004,0,AX,z,'z',4,18),C.dark,M.satin);
  // Base47 and the original47 still give a dial face/rim diameter ratio near .16–.17.
  // The former ellipsoid was behind the dish. The ribbed circular dial uses the silver finish visible in both 47 stills.
  // Center placement stays fixed from718b; radial scale alone brings the60deg front/rim ratio to about.162.
  const capY=.124,capZ=.082,dialScale=.94;
  const dial=xlathe([[0,-.046],[.0075,-.046],[.0075,-.051],[.016,-.051],
    [.0205,-.049],[.021,-.046],[.021,-.027],[.019,-.024],[0,-.024]],0,capY,capZ,32);
  const dp=dial.attributes.position;
  for(let i=0;i<dp.count;i++){
    const x=dp.getX(i),y=dp.getY(i)-capY,z=dp.getZ(i)-capZ,r=Math.hypot(y,z);
    if(x>-.048&&x<-.026&&r>.019){const scallop=1+.035*Math.cos(Math.atan2(z,y)*16);dp.setY(i,capY+y*scallop);dp.setZ(i,capZ+z*scallop);}
  }
  dial.translate(0,-capY,-capZ).scale(1,dialScale,dialScale).translate(0,capY,capZ);
  dial.computeVertexNormals();body.add(dial,C.silver,M.metal);
  body.add(xlathe([[0,-.048],[.0068*dialScale,-.048],[.0068*dialScale,-.046],[0,-.046]],0,capY,capZ,12),C.dark,M.rubber);
  body.add(cyl(.009,[-.01,.104,capZ-.008],[-.026,capY,capZ],12),C.silver,M.metal);
  // The shroud's sides are full cast sections with a broad faceted face and a dark top bridge.
  body.add(zlathe([[0,.026],[.032,.026],[.045,.047],[.047,.151],[.042,.171],[0,.171]],0,AX,0,12),C.silver,M.metal);
  body.add(box(.061,.009,.123,0,AX+.044,.102,.25,8,4),C.dark,M.satin);
  for(const x of[-.042,.042])body.add(slab([[.048,.055],[.06,.089],[.147,.091],[.162,.078],[.15,.049],[.064,.05]],.003,x,.001),C.silver,M.metal);
  for(const z of[.026,.171])body.add(zlathe([[.038,z-.004],[.046,z-.004],[.048,z],[.044,z+.006],[.038,z+.006]],0,AX,0,12).scale(1,1.06,1),C.trim,M.metal);
  body.add(pipe([[0,.11,.025],[0,.135,.032],[0,.139,.057],[0,.119,.069]],.004,12,6),C.silver,M.metal);
  // Exposed bearing gap precedes the hemispherical three-nozzle rotor.
  body.add(zcyl(.026,.178,.212,0,AX,20),C.black,M.satin);
  ink.add(ring(.029,.0025,0,AX,.187,'z',4,20));
  B.add(zlathe([[.022,.198],[.042,.198],[.047,.211],[.046,.229],[.04,.246],[.032,.262],[.019,.271],[0,.273]],0,AX,0,30),C.silver,M.metal);
  B.add(ring(.044,.004,0,AX,.212,'z',5,26),C.silver,M.metal);
  for(let k=0;k<3;k++){
    const a=Math.PI/2+k*Math.PI*2/3,x=Math.cos(a)*.026,y=AX+Math.sin(a)*.026;
    B.add(zlathe([[.0058,.248],[.01,.248],[.011,.258],[.01,.292],[.008,.296],[.0058,.296],[.0058,.248]],x,y,0,14),C.silver,M.metal);
    B.add(zcyl(.0056,.285,.287,x,y,12),C.black,M.rubber);
  }
  return finish(d,body,B,tr,AX,.298,C.black,ink);
}

function examiner(d) {
  // Rebuilt (Opus): a light-grey box tank low at the rear (red print), two white cylinders on top of it,
  // a silver tube frame and carry handle, a black/red centre drum, a clear sleeve (ribs) round four
  // barrels with black tips.
  const AX = 0.07, C = { grey: '#d9d8d3', white: '#efefec', red: '#d0303a', black: '#18191d', silver: '#c2c5c9', clear: '#d6dade' };
  const body = new Pieces(), B = new Pieces(), ink = new Pieces();
  const tr = pistolGrip(body, { color: C.black, triggerColor: C.red, guardColor: C.black });
  body.add(box(0.11, 0.1, 0.13, 0, 0.0, -0.075, 0.25), C.grey, M.satin);                                         // box tank
  body.add(box(0.002, 0.02, 0.08, -0.056, 0.0, -0.075, 0.2), C.red, M.print);
  for (const x of [-0.022, 0.022]) body.add(zcyl(0.018, -0.12, -0.03, x, 0.07, 16), C.white, M.gloss);        // twin cylinders
  body.add(zlathe([[0, -0.02], [0.045, -0.02], [0.05, 0.0], [0.05, 0.08], [0.04, 0.1], [0, 0.1]], 0, AX, 0, 28), C.black, M.satin); // drum
  body.add(ring(0.051, 0.008, 0, AX, 0.05, 'z', 6, 28), C.red, M.gloss);
  for (const sx of [-1, 1]) body.add(pipe([[sx * 0.04, -0.04, 0.02], [sx * 0.06, 0.0, 0.12], [sx * 0.055, AX + 0.06, 0.15], [sx * 0.03, AX + 0.07, 0.06]], 0.0055, 24, 6), C.silver, M.satin); // tube frame
  body.add(pipe([[0, AX + 0.05, 0.0], [0, AX + 0.095, 0.02], [0, AX + 0.095, 0.08], [0, AX + 0.05, 0.1]], 0.006, 16, 6), C.black, M.satin);
  for (const z of [0.1, 0.18, 0.24]) body.add(ring(0.04, 0.003, 0, AX, z, 'z', 6, 24), C.clear, M.gloss);
  for (const [x, y] of [[-0.016, 0.016], [0.016, 0.016], [-0.016, -0.016], [0.016, -0.016]]) {
    B.add(zcyl(0.01, 0.1, 0.25, x, AX + y, 10), C.red, M.gloss);
    B.add(zlathe([[0, 0.25], [0.01, 0.25], [0.006, 0.275], [0, 0.278]], x, AX + y, 0, 10), C.black, M.satin);
  }
  ink.add(zcyl(0.034, 0.105, 0.24, 0, AX, 18));
  return finish(d, body, B, tr, AX, 0.28, C.black, ink);
}

export const MODELS = {
  'splatling': { sourceModel: 'Wmn_Spinner_StandardT', build: heavy },
  's3-spinner-quick': { sourceModel: 'Wmn_Spinner_QuickT', build: mini },
  's3-spinner-hyper': { sourceModel: 'Wmn_Spinner_HyperT', build: hydra },
  's3-spinner-downpour': { sourceModel: 'Wmn_Spinner_Downpour', build: ballpoint },
  's3-spinner-hypershort': { sourceModel: 'Wmn_Spinner_HyperShort', build: examiner },
  's3-spinner-serein': { sourceModel: 'Wmn_Spinner_Serein', build: nautilus },
};
