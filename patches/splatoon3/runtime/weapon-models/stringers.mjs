// Independent volumetric reconstructions from the PR1246 3D renders and twelve-view turntables.
// Geometry remains cached/merged by the existing registry. Existing sockets and animation are retained.
import { THREE, Pieces, M, V, box, sphere, zlathe, zcyl, xcyl, ycyl, ring, pipe, slab, part, rebuild, gripSpec,
  pistolGrip, glowGeometry, clamp, damp, smooth } from './kit.mjs';
const YC=.085, GROUND_ROLL=1.25;
const rb=(w,h,d,x,y,z,e=.3)=>box(w,h,d,x,y,z,e,8,4);
const badge=(w,h,d,x,y,z)=>new THREE.BoxGeometry(w,h,d).translate(x,y,z);

// Rectangular laminated limb; four flat faces, separately coloured edges, rather than a round hose.
function ribbon(body, stations, color, edgeColor) {
  const verts=[],indices=[];
  for(const[y,z,w,t]of stations)for(const[x,dz]of[[-w/2,-t/2],[w/2,-t/2],[w/2,t/2],[-w/2,t/2]])verts.push(x,YC+y,z+dz);
  for(let j=0;j<stations.length-1;j++)for(let k=0;k<4;k++){
    const a=j*4+k,b=j*4+(k+1)%4,c=b+4,d=a+4;indices.push(a,b,c,a,c,d);
  }
  indices.push(0,2,1,0,3,2);const n=verts.length/3-4;indices.push(n,n+1,n+2,n,n+2,n+3);
  if(stations.at(-1)[0]<stations[0][0])for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.setIndex(indices);
  const flat=geo.toNonIndexed();flat.computeVertexNormals();geo.dispose();body.add(flat,color,M.satin);
  if(edgeColor)for(const s of[-1,1])body.add(pipe(stations.map(([y,z,w])=>[s*w/2,YC+y,z]),.0016,18,4),edgeColor,M.metal);
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
  arrow.add(zcyl(.003,tipZ+.012,arrowFront,0,YC,8),'#353b3c',M.satin);
  d.bowCfg={span,tipZ,arrowFront};
  const parts={trigger:part(tr,[0,.0315,.0282]),string:part(s1,[0,YC+span,tipZ],'ink'),stringL:part(s2,[0,YC-span,tipZ],'ink'),
    nock:part(nock,[0,YC,tipZ]),arrow:part(arrow,[0,YC,arrowFront])};
  const rings=new Pieces();
  for(let k=0;k<6;k++)rings.add(ring(cfg.coilR,.0016,0,YC,cfg.coil0+(cfg.coil1-cfg.coil0)*k/5,'z',4,18),'#fff',M.led);
  return rebuild(d,{body,ink,parts,gripL:cfg.gripL,muzzle:[0,YC,cfg.muzzleZ],glow:glowGeometry(rings,cfg.coil0-.002,cfg.coil1+.002,'z')});
}
function tri(d){
  const C={wood:'#65412d',steel:'#adb5b7',dark:'#34393c',black:'#1d2124'};
  const body=new Pieces(),ink=new Pieces(),tr=pistolGrip(body,{color:C.black,guardColor:C.dark});
  const cfg={span:.4,tipZ:-.24,arrowFront:.02,coilR:.062,coil0:-.070,coil1:.065,muzzleZ:.178,
    gripL:gripSpec([0,0,.11],[0,0,1],[.75,-.62,-.1])};
  for(const s of[-1,1]){
    // Tapered wooden laminations with squared metal sockets at both ends.
    ribbon(body,[[s*.063,-.041,.045,.021],[s*.14,-.077,.041,.018],[s*.23,-.125,.034,.014],[s*.32,-.181,.027,.012],[s*.4,-.240,.022,.011]],C.wood,C.steel);
    ribbon(body,[[s*.055,-.035,.049,.028],[s*.11,-.061,.046,.025]],C.steel);
    body.add(rb(.027,.031,.024,0,YC+s*.388,-.230),C.steel,M.metal);
    body.add(xcyl(.007,-.017,.017,YC+s*.389,-.235,10),C.dark,M.satin);
    body.add(xcyl(.003,-.018,.018,YC+s*.389,-.235,8),C.steel,M.metal);
    // Each outer cartridge is a complete separate barrel, clamped to a forked bridge.
    ink.add(zcyl(.021,-.048,.093,0,YC+s*.104,18));
    for(const z of[-.040,.068])body.add(zcyl(.023,z,z+.018,0,YC+s*.104,16),C.dark,M.satin);
    body.add(zlathe([[0,.092],[.021,.092],[.019,.127],[.013,.141],[0,.143]],0,YC+s*.104,0,16),C.black,M.rubber);
    nozzle(body,0,YC+s*.104,.131,.155,.012,C.steel);
    body.add(pipe([[-.023,YC,-.005],[-.034,YC+s*.065,.023],[0,YC+s*.104,.036]],.008,12,6),C.steel,M.metal);
    body.add(pipe([[.023,YC,-.005],[.034,YC+s*.065,.023],[0,YC+s*.104,.036]],.008,12,6),C.steel,M.metal);
  }
  // Central reel has exposed ink surface and two thick collars; not ink buried in an opaque can.
  ink.add(zcyl(.059,-.100,.102,0,YC,24));
  for(const z of[-.100,-.022,.079])body.add(zlathe([[0,z],[.059,z],[.063,z+.005],[.063,z+.023],[.055,z+.029],[0,z+.029]],0,YC,0,24),C.dark,M.satin);
  body.add(zlathe([[0,.107],[.049,.107],[.052,.135],[.048,.163],[.017,.178],[0,.178]],0,YC,0,8),C.steel,M.metal);
  nozzle(body,0,YC,.158,.179,.014,C.dark);
  for(const sx of[-1,1]){
    body.add(pipe([[sx*.027,YC-.028,-.100],[sx*.017,YC-.018,-.19],[sx*.010,YC,-.24]],.005,15,6),C.steel,M.metal);
    body.add(pipe([[sx*.028,YC+.028,-.100],[sx*.017,YC+.018,-.19],[sx*.010,YC,-.24]],.005,15,6),C.dark,M.satin);
    body.add(badge(.002,.026,.039,sx*.060,YC,.035), '#606b6e',M.print);
  }
  // A narrow mechanical support grip encloses the retained IK anchor.
  body.add(zcyl(.014,.079,.139,0,0,12),C.black,M.rubber);
  body.add(pipe([[0,YC-.04,.047],[0,.016,.094],[0,0,.12]],.005,10,6),C.steel,M.metal);
  return finishBow(d,cfg,body,ink,tr);
}
function reef(d){
  const C={white:'#d8d9ce',edge:'#929b98',steel:'#aab4b4',black:'#24292d',dark:'#42494a'};
  const body=new Pieces(),ink=new Pieces(),tr=pistolGrip(body,{color:C.black,guardColor:C.black});
  const cfg={span:.3,tipZ:-.17,arrowFront:.02,coilR:.056,coil0:-.01,coil1:.09,muzzleZ:.15,
    gripL:gripSpec([0,0,.095],[0,0,1],[.75,-.62,-.1])};
  for(const s of[-1,1]){
    const ss=[[s*.062,-.025,.055,.039],[s*.135,-.006,.045,.026],[s*.211,-.036,.040,.023],[s*.269,-.101,.033,.022],[s*.300,-.170,.031,.021]];
    ribbon(body,ss,C.white,C.edge);
    // Long dark recessed channel on the broad curved limbs.
    ribbon(body,ss.slice(1).map(([y,z,w,t])=>[y,z-t*.53,w*.48,.0015]),'#8a9391');
    for(const x of[-.022,.022]){
      body.add(pipe([[x,YC+s*.286,-.158],[x,YC+s*.12,-.170],[-x,YC,-.167]],.0012,10,4),'#a9b2a4',M.metal);
    }
    body.add(xcyl(.027,-.017,.017,YC+s*.3,-.17,18),C.white,M.satin);
    for(const sx of[-1,1]){
      body.add(ring(.020,.002,sx*.018,YC+s*.3,-.17,'x',4,18),C.edge,M.metal);
      body.add(xcyl(.008,sx>0?.018:-.021,sx>0?.021:-.018,YC+s*.3,-.17,10),C.steel,M.metal);
    }
    body.add(zcyl(.009,-.019,.064,0,YC+s*.155,12),C.white,M.satin);
    body.add(ring(.009,.0015,0,YC+s*.155,.055,'z',4,14),C.edge,M.metal);
    body.add(xcyl(.005,-.028,.028,YC+s*.093,-.015,8),C.steel,M.metal);
  }
  // Cast black cartridge with a beveled shoulder, rear circular vent and front threaded coupler.
  body.add(zlathe([[0,-.090],[.040,-.090],[.050,-.073],[.058,-.020],[.057,.066],[.046,.090],[0,.090]],0,YC,0,28),C.black,M.satin);
  body.add(zcyl(.040,-.092,-.088,0,YC,24),C.dark,M.satin);
  for(let k=-3;k<=3;k++)body.add(rb(.059-Math.abs(k)*.007,.002,.001,0,YC+k*.009,-.093),C.edge,M.satin);
  body.add(zlathe([[.012,.089],[.045,.089],[.045,.117],[.037,.126],[.035,.145],[.012,.15]],0,YC,0,24),C.steel,M.metal);
  for(let k=0;k<5;k++)body.add(ring(.044-k*.001,.0016,0,YC,.094+k*.008,'z',4,24),C.white,M.metal);
  for(let k=0;k<12;k++){const a=k*Math.PI/6;body.add(rb(.005,.005,.018,Math.cos(a)*.035,YC+Math.sin(a)*.035,.133),C.edge,M.metal);}
  nozzle(body,0,YC,.137,.151,.016,C.dark);ink.add(ring(.030,.0028,0,YC,.151,'z',4,18));
  for(const s of[-1,1]){
    body.add(badge(.0018,.023,.045,s*.057,YC,.007),C.edge,M.print);
    body.add(badge(.002,.015,.038,s*.0585,YC,.007),C.black,M.print);
    for(let k=0;k<3;k++)body.add(badge(.002,.002,.014,s*.060,YC-.005+k*.005,.018),C.white,M.print);
    ink.add(rb(.002,.006,.025,s*.055,YC+.027,.020));
  }
  body.add(zcyl(.014,.068,.125,0,0,12),C.black,M.rubber);
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
