// Independent volumetric reconstructions from the PR1246 3D renders and twelve-view turntables.
// Geometry remains cached/merged by the existing registry. Existing sockets and animation are retained.
import { THREE, Pieces, M, V, box, sphere, zlathe, zcyl, xcyl, ycyl, ring, pipe, slab, part, rebuild, gripSpec,
  pistolGrip, glowGeometry, clamp, damp, smooth } from './kit.mjs';
const YC=.085, GROUND_ROLL=1.25;
const rb=(w,h,d,x,y,z,e=.3)=>box(w,h,d,x,y,z,e,8,4);
const badge=(w,h,d,x,y,z)=>new THREE.BoxGeometry(w,h,d).translate(x,y,z);

// Tangent-normal sections keep real thickness through the curved tips. Fixed-Z
// thickness collapsed to 0.0086 at the old REEF tip despite a 0.021 input.
function sweptRect(body, stations, color, material=M.satin, offsetX=0) {
  const vertices=[],indices=[];
  for(let i=0;i<stations.length;i++){
    const [y,z,w,t]=stations[i],a=stations[Math.max(0,i-1)],b=stations[Math.min(stations.length-1,i+1)];
    const dy=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dy,dz),ny=-dz/len,nz=dy/len;
    const ox=typeof offsetX==='function'?offsetX(i):offsetX;
    for(const[x,n]of[[-.5,-.32],[-.32,-.5],[.32,-.5],[.5,-.32],[.5,.32],[.32,.5],[-.32,.5],[-.5,.32]])
      vertices.push(ox+x*w,YC+y+ny*n*t,z+nz*n*t);
  }
  for(let i=0;i<stations.length-1;i++)for(let k=0;k<8;k++){
    const a=i*8+k,b=i*8+(k+1)%8,c=b+8,d=a+8;indices.push(a,b,c,a,c,d);
  }
  for(let k=1;k<7;k++){indices.push(0,k+1,k);const n=(stations.length-1)*8;indices.push(n,n+k,n+k+1);}
  // This section basis follows the tangent on both mirrored limbs. Reverse the
  // inward ring ordering once, for both signs, so the casting has outward faces.
  for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();body.add(g,color,material);
}
// LACT-only cast section: a real recessed web between rounded raised rims.
// The center remains star-shaped, so a center fan closes each end without filling the grooves.
const REEF_CAST_SECTION=[[-.30,-.5],[-.44,-.46],[-.5,-.34],[-.49,-.25],[-.42,-.18],[-.40,0],[-.42,.18],[-.49,.25],[-.5,.34],[-.44,.46],[-.30,.5],[.30,.5],[.44,.46],[.5,.34],[.49,.25],[.42,.18],[.40,0],[.42,-.18],[.49,-.25],[.5,-.34],[.44,-.46],[.30,-.5]].reverse();
const REEF_ROUND_SECTION=Array.from({length:12},(_,k)=>[-.5*Math.cos(k*Math.PI/6),.5*Math.sin(k*Math.PI/6)]).reverse();
function castSection(body,stations,section,color,material=M.satin,solidRoot=false){
  const vertices=[],indices=[],r=section.length;
  for(let i=0;i<stations.length;i++){
    const[y,z,w,t]=stations[i],a=stations[Math.max(0,i-1)],b=stations[Math.min(stations.length-1,i+1)],dy=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dy,dz);
    const fill=solidRoot?1-smooth((i/(stations.length-1)-.12)/.22):0;
    for(const[x,n]of section){
      const sx=x+Math.sign(x)*(Math.abs(n)<.26?Math.max(0,.49-Math.abs(x))*fill:0);
      vertices.push(sx*w,YC+y-dz/len*n*t,z+dy/len*n*t);
    }
  }
  for(let i=0;i<stations.length-1;i++)for(let k=0;k<r;k++){
    const a=i*r+k,b=i*r+(k+1)%r,c=b+r,d=a+r;indices.push(a,c,b,a,d,c);
  }
  const first=vertices.length/3,last=first+1,a=stations[0],b=stations.at(-1),end=(stations.length-1)*r;
  vertices.push(0,YC+a[0],a[1],0,YC+b[0],b[1]);
  for(let k=0;k<r;k++)indices.push(first,k,(k+1)%r,last,end+(k+1)%r,end+k);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();body.add(g,color,material);
}
function cubicLimb(s,controls,n,width,thick){
  const out=[];for(let k=0;k<=n;k++){const t=k/n,u=1-t,p=[0,0];for(let j=0;j<2;j++)p[j]=u*u*u*controls[0][j]+3*u*u*t*controls[1][j]+3*u*t*t*controls[2][j]+t*t*t*controls[3][j];out.push([s*p[0],p[1],width(t),thick(t)]);}return out;
}
function smoothLimb(s,points,n){
  const c=new THREE.CatmullRomCurve3(points.map(([y,z])=>V(0,y,z)),false,'centripetal'),out=[];
  for(let k=0;k<=n;k++){const t=k/n,p=c.getPoint(t),f=t*(points.length-1),j=Math.min(points.length-2,Math.floor(f)),a=f-j;out.push([s*p.y,p.z,points[j][2]*(1-a)+points[j+1][2]*a,points[j][3]*(1-a)+points[j+1][3]*a]);}return out;
}
function laminateFace(limb,side){
  return limb.map(([y,z,w,t],i)=>{const a=limb[Math.max(0,i-1)],b=limb[Math.min(limb.length-1,i+1)],dy=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dy,dz);return[y-side*dz/l*t*.47,z+side*dy/l*t*.47,w*.88,.0018];});
}
function nozzle(body,x,y,z0,z1,r,C){
  body.add(zlathe([[r*.65,z0],[r,z0],[r,z1-.006],[r*.85,z1],[r*.58,z1],[r*.58,z1-.012]],x,y,0,16),C,M.metal);
  body.add(zcyl(r*.57,z1-.013,z1-.012,x,y,12),'#151a1c',M.rubber);
}
function finishBow(d,cfg,body,ink,tr){
  const {span,tipZ,arrowFront}=cfg;
  const s1=new Pieces(),s2=new Pieces(),nock=new Pieces(),arrow=new Pieces();
  s1.add(ycyl(.0013,YC,YC+span,0,tipZ,5),'#d8ddc1',M.satin);
  s2.add(ycyl(.0013,YC-span,YC,0,tipZ,5),'#d8ddc1',M.satin);
  nock.add(rb(.012,.027,.012,0,YC,tipZ),'#919998',M.metal);
  if(cfg.castNock){
    // The pale rear pull-yoke follows the existing nock motion, not the static
    // body. Its centre remains on the original string/arrow anchor.
    const yoke=smoothLimb(1,[[.080,-.155,.016,.010],[.069,-.171,.037,.020],[.036,-.185,.047,.026],[-.028,-.188,.050,.027],[-.068,-.173,.038,.021],[-.083,-.153,.016,.010]],16);
    castSection(nock,yoke,REEF_ROUND_SECTION,'#d5d5c8');
    nock.add(zlathe([[.009,tipZ-.022],[.014,tipZ-.018],[.015,tipZ-.006],[.012,tipZ+.009],[.009,tipZ+.011]],0,YC,0,14),'#d5d5c8',M.satin);
    for(const x of[-.024,.024])nock.add(xcyl(.0038,x-.001,x+.001,YC,tipZ-.014,8),'#909b98',M.metal);
  }
  if(cfg.castNock)arrow.add(zcyl(.0095,tipZ,arrowFront,0,YC,14),'#c4c8bc',M.satin);
  else arrow.add(zcyl(.003,tipZ+.012,arrowFront,0,YC,8),'#353b3c',M.satin);
  d.bowCfg={span,tipZ,arrowFront};
  const parts={trigger:part(tr,[0,.0315,.0282]),string:part(s1,[0,YC+span,tipZ],'ink'),stringL:part(s2,[0,YC-span,tipZ],'ink'),
    nock:part(nock,[0,YC,tipZ]),arrow:part(arrow,[0,YC,arrowFront])};
  const rings=new Pieces();
  for(let k=0;k<6;k++)rings.add(ring(cfg.coilR,.0016,0,YC,cfg.coil0+(cfg.coil1-cfg.coil0)*k/5,'z',4,18),'#fff',M.led);
  return rebuild(d,{body,ink,parts,gripL:cfg.gripL,muzzle:[0,YC,cfg.muzzleZ],glow:glowGeometry(rings,cfg.coil0-.002,cfg.coil1+.002,'z')});
}
const TRI_LIMB_CONTROLS=[[.063,-.041],[.170,-.050],[.318,-.145],[.400,-.240]];
const REEF_LIMB_SECTIONS=[[.068,.021,.076,.055],[.138,.028,.061,.046],[.216,-.020,.051,.039],[.272,-.106,.041,.032],[.300,-.170,.034,.028]];
function tri(d){
  const C={wood:'#68452d',steel:'#a5afb2',dark:'#30373b',black:'#1c2124'};
  const body=new Pieces(),ink=new Pieces(),tr=pistolGrip(body,{color:C.black,guardColor:C.dark});
  const cfg={span:.4,tipZ:-.24,arrowFront:.02,coilR:.0545,coil0:-.070,coil1:.065,muzzleZ:.178,
    gripL:gripSpec([0,0,.11],[0,0,1],[.75,-.62,-.1])};
  for(const s of[-1,1]){
    // 8.3% chord sag (old 3.2%): a continuously swept, tapering laminate.
    const limb=cubicLimb(s,TRI_LIMB_CONTROLS,18,t=>.050-.035*Math.pow(t,1.05),t=>.025-.0145*t);
    sweptRect(body,limb,C.wood);
    const laminate=laminateFace(limb,s);
    sweptRect(body,laminate,'#b8b5a0',M.satin);
    // The socket follows the limb rather than being an isolated straight cuff.
    sweptRect(body,[[s*.051,-.034,.067,.040],[s*.075,-.041,.060,.034],[s*.108,-.048,.049,.029]],C.steel,M.metal);
    sweptRect(body,limb.slice(-3).map(([y,z,w,t])=>[y,z,w+.009,t+.006]),C.steel,M.metal);
    body.add(xcyl(.0055,-.015,.015,YC+s*.391,-.228,10),C.dark,M.satin);
    // Outer cartridges splay away from the central barrel, as the side turntable shows.
    const shell=new Pieces(),fill=new Pieces();
    fill.add(zcyl(.020,-.054,.084,0,0,16));
    for(const z of[-.050,.060])shell.add(zcyl(.022,z,z+.019,0,0,14),C.dark,M.satin);
    shell.add(zlathe([[0,.081],[.020,.081],[.018,.119],[.013,.136],[0,.138]],0,0,0,16),C.black,M.rubber);
    nozzle(shell,0,0,.128,.150,.0115,C.steel);
    const tilt=g=>g.translate(0,0,-.020).rotateX(-s*.22).translate(0,YC+s*.105,.020);
    shell.transform(tilt);fill.transform(tilt);body.merge(shell);ink.merge(fill);
    body.add(slab([[.003,YC+s*.036],[.049,YC+s*.042],[.067,YC+s*.114],[.039,YC+s*.126],[-.011,YC+s*.095],[-.023,YC+s*.057]],.049,0,.004),C.dark,M.satin);
    for(const x of[-.026,.026])body.add(pipe([[x,YC+s*.042,-.014],[x,YC+s*.073,.005],[x,YC+s*.099,.031]],.0045,8,5),C.steel,M.metal);
  }
  // Keep the long cartridge, with a slimmer diameter relative to the long limbs.
  ink.add(zcyl(.0505,-.100,.102,0,YC,24));
  for(const z of[-.100,-.022,.079])body.add(zlathe([[0,z],[.051,z],[.055,z+.005],[.055,z+.023],[.048,z+.029],[0,z+.029]],0,YC,0,24),C.dark,M.satin);
  body.add(zlathe([[0,.107],[.044,.107],[.047,.135],[.043,.163],[.017,.178],[0,.178]],0,YC,0,12),C.steel,M.metal);
  nozzle(body,0,YC,.158,.179,.014,C.dark);
  for(const sx of[-1,1]){
    body.add(pipe([[sx*.025,YC-.040,-.100],[sx*.017,YC-.025,-.19],[sx*.010,YC,-.24]],.0055,14,6),C.steel,M.metal);
    body.add(pipe([[sx*.025,YC+.040,-.100],[sx*.017,YC+.025,-.19],[sx*.010,YC,-.24]],.0055,14,6),C.dark,M.satin);
    body.add(badge(.002,.024,.039,sx*.052,YC,.035),'#5d686a',M.print);
  }
  body.add(zcyl(.014,.079,.139,0,0,12),C.black,M.rubber);
  body.add(pipe([[0,YC-.04,.047],[0,.016,.094],[0,0,.12]],.005,10,6),C.steel,M.metal);
  return finishBow(d,cfg,body,ink,tr);
}
function reef(d){
  const C={white:'#d5d5c8',edge:'#8b9492',steel:'#aab4b4',black:'#242a2c',dark:'#42494a'};
  const body=new Pieces(),ink=new Pieces(),tr=pistolGrip(body,{color:C.white,guardColor:C.black});
  const cfg={span:.3,tipZ:-.17,arrowFront:.02,coilR:.0818,coil0:-.004,coil1:.057,muzzleZ:.15,castNock:true,
    gripL:gripSpec([0,0,.095],[0,0,1],[.75,-.62,-.1])};
  for(const s of[-1,1]){
    // The root seats in the enlarged forward receiver collar. Rounded rims and
    // recessed web are one connected solid casting, rather than a grey stripe.
    const limb=smoothLimb(s,REEF_LIMB_SECTIONS,20);
    castSection(body,limb,REEF_CAST_SECTION,C.white,M.satin,true);
    const boot=smoothLimb(s,[[.042,.017,.083,.068],[.066,.020,.089,.064],[.085,.023,.078,.053]],5);
    castSection(body,boot,REEF_ROUND_SECTION,C.black);
    for(const x of[-.023,.023])body.add(pipe([[x,YC+s*.290,-.162],[x,YC+s*.12,-.170],[-x,YC,-.167]],.0012,10,4),'#a9b2a4',M.metal);
    body.add(xcyl(.033,-.018,.018,YC+s*.3,-.17,20),C.white,M.satin);
    for(const sx of[-1,1]){
      body.add(ring(.026,.003,sx*.019,YC+s*.3,-.17,'x',5,20),C.edge,M.metal);
      body.add(xcyl(.009,sx>0?.019:-.023,sx>0?.023:-.019,YC+s*.3,-.17,12),C.steel,M.metal);
      body.add(xcyl(.004,sx>0?.022:-.024,sx>0?.024:-.022,YC+s*.3,-.17,8),C.dark,M.satin);
      body.add(xcyl(.0055,sx>0?.032:-.037,sx>0?.037:-.032,YC+s*.104,.029,10),C.steel,M.metal);
    }
    body.add(zcyl(.010,.031,.094,0,YC+s*.155,12),C.white,M.satin);
    body.add(ring(.010,.0018,0,YC+s*.155,.085,'z',4,14),C.edge,M.metal);
  }
  // Distinct rear barrel and stepped front/root collar; do not blur them into an egg.
  body.add(zlathe([[0,-.118],[.049,-.118],[.057,-.112],[.059,-.095],[.059,-.024],[.062,-.018],[.073,-.018],[.080,-.006],[.080,.058],[.075,.071],[.060,.085],[.056,.095],[0,.095]],0,YC,0,24),C.black,M.satin);
  body.add(zlathe([[.016,-.122],[.045,-.122],[.053,-.119],[.053,-.114],[.045,-.112],[.016,-.112]],0,YC,0,20),C.dark,M.satin);
  body.add(zcyl(.016,-.120,-.115,0,YC,14),C.black,M.rubber);
  for(let k=-3;k<=3;k++)if(k)body.add(badge(.078-Math.abs(k)*.009,.002,.0015,0,YC+k*.010,-.123),C.edge,M.satin);
  for(let k=0;k<8;k++){const a=k*Math.PI/4;body.add(zcyl(.0045,.068,.074,Math.cos(a)*.068,YC+Math.sin(a)*.068,8),C.dark,M.satin);}
  // The turntable's pink threaded coupler is team ink, while cast shoulders stay black/ivory.
  ink.add(zlathe([[.012,.093],[.052,.093],[.052,.117],[.044,.125],[.036,.145],[.012,.150]],0,YC,0,24));
  for(let k=0;k<5;k++)body.add(ring(.051-k*.002,.0017,0,YC,.097+k*.009,'z',4,24),C.steel,M.metal);
  for(let k=0;k<12;k++){const a=k*Math.PI/6;body.add(rb(.006,.006,.018,Math.cos(a)*.036,YC+Math.sin(a)*.036,.134),C.edge,M.metal);}
  nozzle(body,0,YC,.137,.151,.016,C.dark);
  for(const s of[-1,1]){
    body.add(badge(.0018,.032,.049,s*.059,YC,-.064),C.edge,M.print);
    body.add(badge(.002,.025,.042,s*.0602,YC,-.064),C.black,M.print);
    for(let k=0;k<3;k++)body.add(badge(.002,.002,.018,s*.0615,YC-.007+k*.006,-.053),C.white,M.print);
    ink.add(rb(.002,.008,.030,s*.056,YC+.021,-.059));
  }
  // Rounded black saddle carries into the pale lower grip without moving either IK anchor.
  body.add(sphere(.039,.028,.064,0,.012,-.019,16,8),C.black,M.rubber);
  body.add(sphere(.025,.026,.037,0,-.007,.016,12,8),C.black,M.rubber);
  body.add(zcyl(.014,.068,.125,0,0,12),C.white,M.rubber);
  return finishBow(d,cfg,body,ink,tr);
}
function wellstring(d){
  const C={green:'#28594d',hi:'#537b68',edge:'#183c35',steel:'#a8b4ac',brass:'#a49c64',black:'#252f2c',blue:'#527e91'};
  const body=new Pieces(),ink=new Pieces(),tr=pistolGrip(body,{color:C.blue,guardColor:C.edge});
  const cfg={span:.325,tipZ:-.19,arrowFront:.02,coilR:.062,coil0:-.03,coil1:.14,muzzleZ:.205,
    gripL:gripSpec([0,0,.105],[0,0,1],[.75,-.62,-.1])};
  // Hydraulic clamp arms have an open C throat, thick rectangular cast cross-section, and joint bosses.
  for(const s of[-1,1]){
    const outline=[[-.058,.047],[-.082,.105],[-.105,.220],[-.071,.281],[.034,.307],[.075,.285],[.077,.247],[.039,.235],[-.019,.248],[-.055,.218],[-.054,.112],[-.024,.055]];
    body.add(slab(outline.map(([z,y])=>[z,YC+s*y]),.046,0,.004),C.green,M.satin);
    for(const sx of[-1,1]){
      body.add(pipe(outline.slice(1,8).map(([z,y])=>[sx*.024,YC+s*y,z]),.0018,16,4),C.hi,M.satin);
      body.add(xcyl(.034,sx>0?.023:-.030,sx>0?.030:-.023,YC+s*.248,.040,16),C.green,M.satin);
      body.add(xcyl(.013,sx>0?.030:-.034,sx>0?.034:-.030,YC+s*.248,.040,6),C.steel,M.metal);
      body.add(xcyl(.027,sx>0?.023:-.030,sx>0?.030:-.023,YC+s*.225,-.076,16),C.green,M.satin);
      body.add(xcyl(.012,sx>0?.030:-.034,sx>0?.034:-.030,YC+s*.225,-.076,6),C.steel,M.metal);
    }
    body.add(pipe([[0,YC+s*.225,-.076],[0,YC+s*.275,-.137],[0,YC+s*.325,-.190]],.009,10,6),C.green,M.satin);
    body.add(ring(.020,.004,0,YC+s*.325,-.19,'x',5,20),C.green,M.satin);
    body.add(ycyl(.007,Math.min(YC+s*.076,YC+s*.248),Math.max(YC+s*.076,YC+s*.248),0,.040,12),C.steel,M.metal);
    body.add(ycyl(.017,Math.min(YC+s*.065,YC+s*.098),Math.max(YC+s*.065,YC+s*.098),0,.040,12),C.black,M.satin);
    for(let k=0;k<3;k++)body.add(ring(.014,.0025,0,YC+s*(.072+k*.008),.040,'y',4,16),k===1?'#956859':C.brass,M.satin);
  }
  body.add(zlathe([[0,-.080],[.047,-.080],[.060,-.058],[.064,-.033],[.064,.113],[.057,.143],[0,.143]],0,YC,0,28),C.green,M.satin);
  for(const z of[-.064,.127])body.add(zlathe([[0,z],[.065,z],[.071,z+.006],[.071,z+.017],[.062,z+.023],[0,z+.023]],0,YC,0,24),C.green,M.satin);
  for(let k=0;k<8;k++){const a=k*Math.PI/4;body.add(zcyl(.004,.144,.150,Math.cos(a)*.060,YC+Math.sin(a)*.060,6),C.steel,M.metal);}
  // Five real open brass outlets, as in the front turntable frame (not six around a black plug).
  for(const[x,y]of[[0,0],[-.026,.020],[.026,.020],[-.026,-.020],[.026,-.020]])nozzle(body,x,YC+y,.150,.205,.012,C.brass);
  body.add(zcyl(.007,-.157,-.076,0,YC,10),C.steel,M.metal);
  body.add(xcyl(.009,-.041,.041,YC,-.157,12),C.black,M.rubber);
  body.add(ycyl(.006,YC+.065,YC+.100,0,.109,10),C.green,M.satin);
  body.add(sphere(.014,.014,.014,0,YC+.102,.109,14,8),C.green,M.satin);
  for(const s of[-1,1]){
    body.add(rb(.002,.041,.073,s*.064,YC,.038),C.brass,M.metal);
    body.add(badge(.003,.033,.065,s*.066,YC,.038),C.edge,M.print);
    for(let k=0;k<5;k++){
      body.add(badge(.002,.016,.007,s*.068,YC,.014+k*.011),C.brass,M.print);
      body.add(badge(.003,.011,.003,s*.069,YC,.016+k*.011),C.edge,M.print);
    }
  }
  body.add(pipe([[0,YC-.048,-.004],[.018,.018,-.016],[.018,-.029,.006],[0,-.005,.059]],.010,14,8),C.blue,M.rubber);
  body.add(zcyl(.014,.074,.135,0,0,12),C.green,M.rubber);
  ink.add(rb(.003,.023,.030,-.064,YC-.033,-.013));
  return finishBow(d,cfg,body,ink,tr);
}

// ------------------------------------------------------------------------------------------ motion
const st8 = new WeakMap();
function bowState(ch) { let m = st8.get(ch); if (!m) st8.set(ch, m = { roll: 0 }); return m; }
export function FAMILY_POSE(ch, dt, s, C) {
  if (!MODELS[ch.weaponModel]) return;
  const m = bowState(ch); dt = Math.min(0.1, Math.max(0, dt || 0));
  m.roll = damp(m.roll, ch.grounded ? 1 : 0, 9, dt);
  ch.P[C.ANCR + 2] += GROUND_ROLL * m.roll;
}
export function bowRollSnapshot(ch) { return st8.get(ch)?.roll ?? null; }

const DRAW = 0.17;
function animateBow(w, st) {
  const c = w.def?.bowCfg, ps = w.ps; if (!c) return;
  const charge = smooth(st.charge || 0);
  // release: the string overshoots forward and rings out
  const sr = st.sinceRelease ?? 99, vib = sr < 0.4 ? Math.exp(-sr * 14) * Math.sin(sr * 70) : 0;
  const draw = DRAW * charge - 0.012 * vib;
  ps.draw = draw;
  const k = Math.hypot(c.span, draw) / c.span, a = Math.atan2(draw, c.span);
  const up = w.parts.string, lo = w.parts.stringL, nock = w.parts.nock, arr = w.parts.arrow;
  if (up) { up.rotation.x = a; up.scale.y = k; }
  if (lo) { lo.rotation.x = -a; lo.scale.y = k; }
  if (nock) nock.position.z = nock.userData.rest.z - draw;
  if (arr) arr.scale.z = 1 + draw / (c.arrowFront - c.tipZ);
}

export const MODELS = {
  's3-stringer-normal': { sourceModel: 'Wmn_Stringer_Normal', build: tri, animate: animateBow },
  's3-stringer-short': { sourceModel: 'Wmn_Stringer_Short', build: reef, animate: animateBow },
  's3-stringer-explosion': { sourceModel: 'Wmn_Stringer_Explosion', build: wellstring, animate: animateBow },
};
