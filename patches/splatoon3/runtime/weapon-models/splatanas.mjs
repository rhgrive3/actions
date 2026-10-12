// Reconstructed from both the 3D references and the twelve-view turntables in PR1246.
// Separate shells, open frames, cross sections and hardware; no imported meshes or textures.
// The existing hand anchors, muzzle sockets and slash/charge state below are deliberately retained.
import { THREE, Pieces, M, box, sphere, zlathe, zcyl, xcyl, ring, pipe, slab, rebuild, gripSpec, clamp, damp, smooth } from './kit.mjs';
const HANDLE_GRIP = () => gripSpec([0, 0, -0.01], [0, 0, 1], [-0.3, 1, 0]);
const smallBox = (w,h,d,x,y,z,e=.25) => box(w,h,d,x,y,z,e,8,4);
const badge=(w,h,d,x,y,z)=>new THREE.BoxGeometry(w,h,d).translate(x,y,z);

function stamper(d) {
  const C={blue:'#283456',steel:'#8e9193',edge:'#d5d5cb',dark:'#303235',rubber:'#171a1d'};
  const body=new Pieces(),ink=new Pieces();
  // A genuinely open D-handle. The fist closes on the rear cross-member, not a solid blue stick.
  body.add(slab([[-.087,-.014],[-.078,-.020],[.025,-.018],[.047,-.005],[.047,.033],[.021,.041],[-.079,.038],[-.09,.021]],.037,0,.003,
    [[[-.066,.013],[.014,.013],[.025,.018],[.025,.027],[-.067,.027]]]),C.blue,M.rubber);
  for(let k=0;k<5;k++)body.add(smallBox(.038,.003,.008,0,.039,-.065+k*.013), '#52617b',M.satin);
  for(const x of [-.019,.019])body.add(badge(.001,.009,.038,x,-.017,-.029),'#e1e5de',M.print);
  // Wheel between both side plates; a dark rubber belt follows the nose radius.
  body.add(xcyl(.048,-.023,.023,0,.062,24),C.rubber,M.rubber);
  for(const x of [-.024,.024])body.add(ring(.042,.002,x,0,.062,'x',4,24),C.dark,M.satin);
  body.add(slab([[.036,-.031],[.331,-.031],[.353,-.023],[.361,-.008],[.359,.017],[.345,.031],[.046,.033]],.029,0,.005),C.rubber,M.rubber);
  // White rubber stamp teeth wrap both long edges and the tip, rather than one decorative comb.
  for(let k=0;k<10;k++)for(const s of [-1,1]){
    const z=.056+k*.030;
    ink.add(smallBox(.031,.014,.023,0,s*.036,z,.23));
    body.add(smallBox(.033,.004,.024,0,s*.043,z,.18),C.edge,M.satin);
    body.add(smallBox(.033,.003,.017,0,s*.046,z,.18),'#a4a79d',M.satin);
  }
  ink.add(smallBox(.030,.036,.012,0,0,.355));
  // Solid thickness is visible from the end; the side skins are independent slim stamped plates.
  const outline=[[.012,-.040],[.042,-.047],[.082,-.024],[.329,-.024],[.349,-.017],[.352,.014],[.337,.025],[.084,.025],[.04,.044],[.011,.040]];
  for(const s of [-1,1]){
    body.add(slab(outline,.005,s*.019,.0015),C.steel,M.metal);
    body.add(slab([[.083,-.019],[.329,-.019],[.344,-.012],[.344,.013],[.33,.020],[.086,.020]],.0018,s*.0228,.0003),'#505459',M.satin);
    body.add(pipe([[s*.025,-.025,.096],[s*.025,-.025,.326],[s*.025,-.019,.347],[s*.025,.017,.350],[s*.025,.027,.327],[s*.025,.027,.097]],.0018,18,4),C.edge,M.metal);
    body.add(xcyl(.018,s>0?.022:-.028,s>0?.028:-.022,0,.064,12),C.dark,M.satin);
    body.add(xcyl(.013,s>0?.028:-.031,s>0?.031:-.028,0,.064,6),C.edge,M.metal);
    body.add(xcyl(.007,s>0?.031:-.0315,s>0?.0315:-.031,0,.064,6),'#4d5053',M.satin);
    body.add(xcyl(.008,s>0?.023:-.027,s>0?.027:-.023,0,.335,6),C.steel,M.metal);
    for(let k=0;k<3;k++)body.add(badge(.001,.003,.011,s*.024,-.023+k*.006,.032+k*.002),C.edge,M.print);
  }
  return rebuild(d,{body,ink,gripR:HANDLE_GRIP(),gripL:gripSpec([0,0,-.05],[0,0,1],[.5,1,0]),muzzle:[0,0,.36]});
}

function wiper(d) {
  const C={black:'#191c20',steel:'#b9bfbc',white:'#e8e7d9',edge:'#4b4f53'};
  const body=new Pieces(),ink=new Pieces();
  // The handle sits above the blade. The offset and open spring underneath survive the end views.
  body.add(zlathe([[0,-.078],[.015,-.078],[.014,-.066],[.011,.027],[.008,.045],[0,.045]],0,0,0,16),C.black,M.rubber);
  for(let k=0;k<8;k++)body.add(ring(.012,.0014,0,0,-.062+k*.012,'z',4,12),C.edge,M.rubber);
  body.add(zcyl(.007,.036,.131,0,0,12),C.steel,M.metal);
  body.add(zcyl(.008,.061,.121,0,0,12),C.black,M.satin);
  body.add(pipe([[0,0,-.077],[0,-.017,-.080],[0,-.027,-.068]],.0028,10,5),C.steel,M.metal);
  const spring=[];
  for(let k=0;k<=40;k++){const t=k/40,a=t*Math.PI*12; spring.push([Math.sin(a)*.006,-.025+Math.cos(a)*.006,-.065+t*.055]);}
  body.add(pipe(spring,.0016,60,4),C.steel,M.metal);
  const returnWire=[[0,-.025,-.010]];
  for(let k=0;k<7;k++)returnWire.push([0,k%2?-.018:-.034,.002+k*.013]);
  returnWire.push([0,-.018,.094]);body.add(pipe(returnWire,.0018,22,4),C.steel,M.metal);
  // Broad rubber squeegee below twin rails, with a physically separate ivory insert.
  ink.add(slab([[.087,-.037],[.386,-.037],[.401,-.025],[.397,-.015],[.085,-.015]],.023,0,.002));
  body.add(slab([[.087,-.022],[.393,-.022],[.396,-.006],[.083,-.006]],.026,0,.002),C.white,M.satin);
  for(const x of [-.014,.014])body.add(slab([[.08,-.009],[.399,-.009],[.397,.009],[.081,.009]],.006,x,.001),C.black,M.satin);
  // Articulated wiper bridge: two hollow triangular trusses and pivots, not a filled flat blade.
  for(const x of [-.011,.011]){
    body.add(pipe([[x,.006,.087],[x,.018,.105],[x,.042,.178],[x,.032,.235],[x,.020,.333],[x,.007,.391]],.004,20,6),C.black,M.satin);
    body.add(pipe([[x,.012,.151],[x,.031,.201],[x,.016,.282],[x,.010,.343]],.003,16,5),C.steel,M.metal);
  }
  for(const z of [.101,.183,.260,.348]){
    body.add(xcyl(.0055,-.019,.019,.013,z,10),C.steel,M.metal);
    body.add(xcyl(.0025,-.020,.020,.013,z,8),C.edge,M.satin);
  }
  body.add(smallBox(.025,.018,.025,0,.037,.139),C.black,M.satin);
  body.add(pipe([[0,0,.113],[0,.013,.129],[0,.037,.139]],.0045,8,5),C.black,M.satin);
  body.add(pipe([[0,.034,.129],[0,.066,.139],[0,.060,.198],[0,.024,.254]],.0022,18,5),C.steel,M.metal);
  body.add(ring(.013,.0023,0,.040,.115,'x',5,16),C.steel,M.metal);
  return rebuild(d,{body,ink,gripR:HANDLE_GRIP(),gripL:gripSpec([0,0,-.045],[0,0,1],[.5,1,0]),muzzle:[0,0,.4]});
}

function decavitator(d) {
  const C={silver:'#c6cecf',white:'#f3f4e8',blue:'#67b9db',dark:'#303d47',label:'#283e87',clear:'#dde9e6',mint:'#92dcca'};
  const body=new Pieces(),ink=new Pieces();
  // Flared grip, heel ring and shallow finger recesses. The hand anchor is unchanged.
  body.add(zlathe([[0,-.087],[.020,-.087],[.024,-.074],[.020,-.053],[.017,.011],[.024,.036],[.026,.044],[0,.044]],0,0,0,18),C.silver,M.satin);
  for(const z of [-.077,.030])body.add(ring(.022,.002,0,0,z,'z',4,20),C.dark,M.satin);
  for(const s of [-1,1]){
    body.add(slab([[-.06,-.010],[.010,-.010],[.019,-.005],[.008,.007],[-.047,.010],[-.061,.005]],.002,s*.019,.001), '#a8b6b9',M.satin);
    for(let k=0;k<5;k++)body.add(smallBox(.002,.002,.004,s*.0205,-.013,-.050+k*.011),C.white,M.satin);
  }
  body.add(zlathe([[0,.035],[.041,.035],[.044,.041],[.043,.051],[.034,.057],[0,.057]],0,0,0,24),C.blue,M.gloss);
  for(let k=0;k<24;k++){const a=k*Math.PI/12;body.add(zcyl(.0012,.040,.050,Math.cos(a)*.043,Math.sin(a)*.043,4),'#94d3e7',M.satin);}
  // Pale windowed sleeve with scalloped underside. A visible mint insert is framed by silver rails.
  body.add(zlathe([[0,.053],[.030,.053],[.034,.074],[.033,.317],[.036,.340],[0,.340]],0,0,0,24),C.clear,M.gloss);
  for(const s of [-1,1]){
    body.add(slab([[.073,-.021],[.313,-.026],[.334,-.010],[.326,.021],[.091,.024]],.002,s*.033,.001),C.mint,M.gloss);
    body.add(pipe([[s*.030,.021,.066],[s*.034,.028,.103],[s*.032,.029,.309],[s*.027,.023,.340]],.003,16,5),C.white,M.gloss);
    body.add(pipe([[s*.025,-.023,.063],[s*.032,-.030,.108],[s*.026,-.031,.315],[s*.025,-.019,.340]],.003,16,5),C.silver,M.satin);
    // Printed fictional mark built from thin strokes on the shell; no blue box through its cross section.
    for(let k=0;k<6;k++){
      const z=.121+k*.029, x=s*.035;
      body.add(slab([[z,-.012],[z+.008,-.012],[z+.018,.013],[z+.010,.013]],.001,x,.0002),C.label,M.print);
      if(k%2===0)body.add(slab([[z+.006,-.012],[z+.022,-.012],[z+.019,-.005],[z+.010,-.005]],.001,x,.0002),C.label,M.print);
    }
    body.add(slab([[.112,.019],[.12,.021],[.13,.027],[.12,.029]],.001,s*.036,.0002),'#d74979',M.print);
  }
  for(let k=0;k<6;k++){
    const z=.112+k*.035;
    body.add(sphere(.024,.011,.010,0,-.030,z,10,6),C.white,M.gloss);
    ink.add(smallBox(.025,.003,.018,0,-.040,z));
  }
  // Finger loop stands clear of the housing and is readable from the other side.
  body.add(ring(.021,.0035,0,.051,.086,'x',6,24),C.silver,M.satin);
  body.add(smallBox(.015,.025,.016,0,.032,.080),C.silver,M.satin);
  body.add(zlathe([[0,.336],[.037,.336],[.041,.343],[.041,.362],[.038,.370],[.034,.373],[0,.374]],0,0,0,28),C.blue,M.gloss);
  body.add(ring(.040,.0015,0,0,.351,'z',4,28),'#97d8ed',M.gloss);
  body.add(zlathe([[0,.373],[.032,.373],[.034,.374],[.031,.375],[0,.375]],0,0,0,24),'#79c2df',M.gloss);
  body.add(zcyl(.0014,.375,.3753,.006,.003,8),'#579bbb',M.satin);
  for(const s of [-1,1])body.add(smallBox(.003,.010,.014,s*.041,0,.350,.4),'#9ddaea',M.gloss);
  return rebuild(d,{body,ink,gripR:HANDLE_GRIP(),gripL:gripSpec([0,0,-.06],[0,0,1],[.5,1,0]),muzzle:[0,0,.375]});
}

// ------------------------------------------------------------------------------------------ motion
// swing durations (s): weak / charge, the WeakSwingFrame / ChargeSwingFrame values at 60 fps
const SABER = { 's3-saber-normal': { tap: 26 / 60, full: 22 / 60 }, 's3-saber-lite': { tap: 16 / 60, full: 22 / 60 }, 's3-saber-heavy': { tap: 30 / 60, full: 32 / 60 } };
const state = new WeakMap();
function sabState(ch) { let m = state.get(ch); if (!m) state.set(ch, m = { age: 99, full: false, dur: 0.3, was: false, chg: 0, raise: 0, side: 1, k: 0 }); return m; }
export function sabreSnapshot(ch) { const m = state.get(ch); return m ? { age: m.age, full: m.full, raise: m.raise, k: m.k } : null; }

export function FAMILY_TRIGGER(ch, name) {
  // the shooter recoil is replaced by the slash played from catalogState (nothing to start here)
  return name === 'shoot';
}

const mix = (a, b, t) => a + (b - a) * t;
export function FAMILY_POSE(ch, dt, s, C) {
  const cfg = SABER[ch.weaponModel]; if (!cfg) return;
  const m = sabState(ch), r = ch._runner?.(s), cs = r?.catalogState;
  dt = Math.min(0.1, Math.max(0, dt || 0));
  const busy = !!cs && !!(cs.pending || cs.melee);
  if (busy && !m.was) {                         // release: a swing starts
    m.age = 0; m.full = m.chg > 0.97; m.dur = m.full ? cfg.full : cfg.tap; m.side = -m.side;
  }
  m.was = busy;
  m.age += dt;
  const charge = r && !busy ? clamp(r.charge || 0) : 0;
  if (!busy && r) m.chg = clamp(r.charge || 0);
  m.raise = damp(m.raise, m.full && m.age < 0.1 ? 1 : charge, 18, dt);
  if (!(ch.kidForm && !ch.dance && (ch.wSub || 0) <= 0.01)) { m.k = 0; return; }
  const P = ch.P, u = m.age / (m.dur + 0.12);       // 0..1 over the swing plus a short follow-through
  let k = 0, yaw = 0, pitch = 0, lift = 0, x = 0;
  if (u < 1) {
    const ee = smooth((u - 0.12) / 0.4);                // sweep 12..52 % of the swing
    k = Math.min(1, u * 8) * (1 - smooth((u - 0.6) / 0.4));
    if (m.full) { pitch = mix(-1.15, 0.55, ee); lift = mix(0.14, -0.05, ee); }       // raised guard → vertical chop
    else { yaw = mix(-0.9, 0.9, ee); x = mix(-0.08, 0.1, ee); pitch = 0.1; }          // right → left horizontal slash
  }
  m.k = k;
  const rs = smooth(m.raise);                           // charging guard
  const w = k;
  P[C.ANC] += x * w; P[C.ANC + 1] += lift * w + 0.12 * rs * (1 - w); P[C.ANC + 2] += 0.02 * w;
  P[C.ANCR] += pitch * w - 1.0 * rs * (1 - w);
  P[C.ANCR + 1] += yaw * w;
  P[C.ANCR + 2] += -0.5 * rs * (1 - w);
  P[C.CHEST + 1] += 0.3 * yaw * w; P[C.SPINE + 1] += 0.15 * yaw * w; P[C.SPINE] += 0.12 * (m.full ? pitch : 0) * w;
  P[C.IKL] = 0;                                         // a splatana is a one-handed weapon
}

const holdBase = { carry: { p: [-0.18, 0.78, 0.14], r: [0.35, 0.12, -0.1] }, twoCarry: 0, twoAim: 0 };
export const MODELS = {
  's3-saber-normal': { sourceModel: 'Wmn_Saber_Normal', build: stamper, hold: holdBase },
  's3-saber-lite': { sourceModel: 'Wmn_Saber_Light', build: wiper, hold: holdBase },
  's3-saber-heavy': { sourceModel: 'Wmn_Saber_Heavy', build: decavitator, hold: holdBase },
};
