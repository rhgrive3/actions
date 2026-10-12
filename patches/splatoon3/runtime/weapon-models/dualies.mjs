// Dualies family models (Splatoon 3 Ver.11.3.0 main weapons). Each model is ONE pistol; the game puts a copy
// in each hand, so d.dual stays true and gripR / gripL stay the native pistol grip (handle axis through the
// origin, leaning forward). Rebuilt with Opus from the official 3D renders and the turntable sheets (the
// renders show the pair overlapped; the turntables show single pistols). Parts the turntable shows in team
// colour are ink. The native recoil `slide` / `slideInk` / `led` channels are kept (hidden: no real dualie
// has a sliding top). Scale: the pistol handle is 0.11 m. Everything is procedural geometry.
import { THREE, Pieces, M, V, box, sphere, zlathe, ylathe, zcyl, ring, cyl, pipe, sweep, slab, smoothOutline, pistolGrip, TRIGGER_PIVOT,
  part, rebuild } from './kit.mjs';

const finish = (d, body, ink, trig, muzzle) => rebuild(d, { body, ink, parts: { trigger: part(trig, TRIGGER_PIVOT) }, muzzle });
/** Side-profile shell: outline [[z, y], ...] (muzzle +Z) extruded `t` across X. */
const shell = (pts, t, bevel = 0.004, n = 0) => slab(n ? smoothOutline(pts, n) : pts, t, 0, bevel);

function splatDualies(d) {
  // Wmn_Maneuver_NormalT: black top shell over a green pistol grip, a green cone nozzle with a magenta tip
  // and collar, an ink canister (white in the render, ink in the turntable) hung behind the grip on a hose.
  const C = { black: '#1d1e22', green: '#2f8a3a', magenta: '#c02a8e', grey: '#8a8f96' };
  const body = new Pieces(), ink = new Pieces();
  const trig = pistolGrip(body, { color: C.green, triggerColor: C.black, guardColor: C.green });
  body.add(shell([[-0.078, 0.1], [-0.064, 0.098], [-0.02, 0.09], [0.08, 0.084], [0.116, 0.074], [0.114, 0.054], [0.04, 0.05],
    [-0.01, 0.052], [-0.045, 0.062], [-0.066, 0.08]], 0.024, 0.005, 24), C.black, M.satin);                   // thin top frame, tail up
  body.add(zlathe([[0, 0.11], [0.014, 0.11], [0.016, 0.125], [0.029, 0.17], [0.03, 0.178], [0.012, 0.18], [0, 0.18]], 0, 0.068, 0, 20), C.green, M.gloss);
  body.add(ring(0.018, 0.004, 0, 0.068, 0.118, 'z', 5, 18), C.magenta, M.gloss);
  ink.add(zlathe([[0, 0.176], [0.03, 0.176], [0.031, 0.182], [0, 0.183]], 0, 0.068, 0, 20));                     // tip in ink
  ink.add(zlathe([[0, -0.03], [0.026, -0.03], [0.028, -0.02], [0.028, 0.03], [0.026, 0.038], [0, 0.038]], 0, 0, 0, 20).rotateX(0.25).translate(0, -0.075, -0.07));
  body.add(zlathe([[0.029, -0.035], [0.029, -0.026]], 0, 0, 0, 20).rotateX(0.25).translate(0, -0.075, -0.07), C.black, M.satin);
  body.add(zcyl(0.006, -0.042, -0.02, 0, -0.068, 10), C.black, M.satin);                                // tank outlet
  body.add(pipe([[0, -0.068, -0.02], [0, -0.06, 0.03], [0, -0.02, 0.07], [0, 0.03, 0.098], [0, 0.05, 0.112]], 0.0028, 20, 6), C.grey, M.rubber);
  return finish(d, body, ink, trig, [0, 0.068, 0.184]);
}

function dapple(d) {
  // Wmn_Maneuver_Short: a magenta C-frame (top bar, front drop, forward foot) round a black grip, a black
  // round nozzle drum with a grey face at the front top, a toothbrush clipped to the back (ink bristles).
  const C = { magenta: '#a01a5c', black: '#1a1b1f', grey: '#9aa0a6', white: '#ecebe6', blue: '#2f6fd0' };
  const body = new Pieces(), ink = new Pieces();
  const trig = pistolGrip(body, { color: C.black, triggerColor: C.black, guardColor: C.magenta });
  body.add(shell([[-0.045, 0.06], [-0.03, 0.09], [0.03, 0.1], [0.075, 0.095], [0.105, 0.07], [0.112, 0.02], [0.108, -0.045],
    [0.09, -0.05], [0.085, 0.0], [0.075, 0.05], [0.04, 0.06], [0, 0.056]], 0.03, 0.006, 32), C.magenta, M.gloss);   // top bar + front drop
  body.add(shell([[0.125, -0.04], [0.132, -0.072], [0.06, -0.088], [-0.04, -0.092], [-0.1, -0.086], [-0.128, -0.06], [-0.116, -0.054],
    [-0.096, -0.07], [-0.04, -0.077], [0.06, -0.073], [0.104, -0.056]], 0.03, 0.005, 32), C.magenta, M.gloss);      // skid
  for (const sx of [-1, 1]) ink.add(box(0.002, 0.008, 0.07, sx * 0.0155, 0.082, 0.03, 0.3));                      // ink strip
  body.add(zlathe([[0, 0.085], [0.028, 0.085], [0.031, 0.095], [0.031, 0.118], [0.026, 0.124], [0, 0.124]], 0, 0.066, 0, 22), C.black, M.satin);
  body.add(zlathe([[0, 0.123], [0.02, 0.123], [0.02, 0.127], [0, 0.128]], 0, 0.066, 0, 18), C.grey, M.satin);
  for (const z of [0.0, 0.03]) { body.add(cyl(0.005, [0, 0.095, z], [0, 0.118, z], 10), C.black, M.satin); body.add(sphere(0.004, 0.004, 0.004, 0, 0.12, z, 8, 4), C.grey, M.satin); }
  // toothbrush: striped handle rising from the skid's rear curl, bristles (ink) at the top; a wire to the top bar
  const brush = [[0, -0.062, -0.122], [0, -0.01, -0.13], [0, 0.04, -0.125]];
  body.add(pipe(brush, 0.006, 16, 6), C.white, M.gloss);
  body.add(pipe(brush.map(([x, y, z]) => [x + 0.004, y, z + 0.002]), 0.003, 16, 5), C.blue, M.gloss);
  ink.add(box(0.016, 0.032, 0.02, 0, 0.062, -0.136, 0.3));
  body.add(pipe([[0, 0.08, -0.04], [0, 0.074, -0.09], [0, 0.07, -0.124]], 0.001, 8, 4), C.grey, M.satin);
  return finish(d, body, ink, trig, [0, 0.066, 0.13]);
}

function glooga(d) {
  // Wmn_Maneuver_Gallon: a blue boxy upper body with vent slots on two legs (the grip and a squared front
  // leg), red foot plates, a silver drum canister on the back with an ink window, wire hooks on top.
  const C = { blue: '#2346c0', red: '#b8262c', silver: '#c3c6ca', dark: '#26282d', white: '#e8e8e4' };
  const body = new Pieces(), ink = new Pieces();
  const trig = pistolGrip(ink, { color: '#ffffff', triggerColor: C.dark, base: false });                                             // grip leg is ink
  ink.add(box(0.06, 0.06, 0.2, 0, 0.07, 0.04, 0.2));
  for (let k = 0; k < 4; k++) for (const sx of [-1, 1]) body.add(box(0.002, 0.008, 0.03, sx * 0.031, 0.08, 0.0 + k * 0.035, 0.4), C.dark, M.satin);
  ink.add(shell([[0.09, 0.05], [0.13, 0.05], [0.13, -0.06], [0.115, -0.06], [0.115, 0.0], [0.105, 0.0], [0.105, -0.06], [0.09, -0.06]], 0.045, 0.004));  // front leg
  body.add(box(0.05, 0.012, 0.17, 0, -0.068, 0.05, 0.3), C.red, M.satin);                                         // foot plate under both legs
  body.add(zcyl(0.03, -0.12, -0.06, 0, 0.07, 22), C.silver, M.satin);                                             // rear canister
  for (const z of [-0.11, -0.07]) body.add(ring(0.031, 0.003, 0, 0.07, z, 'z', 4, 22), C.dark, M.satin);
  body.add(zlathe([[0, -0.13], [0.02, -0.13], [0.022, -0.122], [0, -0.12]], 0, 0.07, 0, 16), C.dark, M.satin);       // rear gear disc
  ink.add(box(0.008, 0.02, 0.03, -0.03, 0.07, -0.09, 0.4));                                                      // ink window
  body.add(pipe([[0, 0.1, -0.02], [0, 0.135, 0.0], [0, 0.14, 0.03], [0, 0.12, 0.04]], 0.0025, 16, 5), C.silver, M.satin);
  body.add(pipe([[0, 0.1, 0.1], [0, 0.135, 0.12], [0, 0.14, 0.15], [0, 0.12, 0.16]], 0.0025, 16, 5), C.silver, M.satin);
  body.add(zlathe([[0, 0.14], [0.022, 0.14], [0.024, 0.15], [0.02, 0.16], [0, 0.16]], 0, 0.07, 0, 18), C.silver, M.satin);  // mesh nozzle
  body.add(ring(0.016, 0.002, 0, 0.07, 0.16, 'z', 4, 16), C.dark, M.satin);
  body.add(pipe([[0, 0.1, -0.1], [0, 0.135, -0.075], [0, 0.11, -0.04]], 0.004, 14, 6), C.white, M.rubber);         // hose loop over the back
  return finish(d, body, ink, trig, [0, 0.07, 0.162]);
}

function squelchers(d) {
  // Wmn_Maneuver_Dual_L: a red power-drill body (wedge top sloping to the front), a raked red grip with a
  // black battery pack under it, a black ribbed hose nozzle reaching forward with an ink tip.
  const C = { red: '#c0281e', black: '#1b1c20', grey: '#6c7077' };
  const body = new Pieces(), ink = new Pieces();
  const trig = pistolGrip(body, { color: C.red, triggerColor: C.black, guardColor: C.red, base: false });
  body.add(shell([[-0.07, 0.04], [-0.07, 0.11], [-0.04, 0.12], [0.06, 0.095], [0.1, 0.07], [0.1, 0.045], [0.0, 0.035]], 0.042, 0.007, 24), C.red, M.satin);
  body.add(box(0.044, 0.012, 0.12, 0, 0.037, 0.01, 0.4), C.black, M.satin);
  body.add(box(0.05, 0.034, 0.075, 0, -0.08, -0.025, 0.3), C.black, M.satin);                                   // battery
  body.add(box(0.052, 0.008, 0.078, 0, -0.064, -0.025, 0.3), C.red, M.satin);
  const hose = [[0, 0.07, 0.095], [0, 0.072, 0.13], [0, 0.07, 0.17], [0, 0.068, 0.21]];
  body.add(pipe(hose, 0.007, 20, 8), C.black, M.rubber);
  for (let k = 0; k < 6; k++) body.add(ring(0.0078, 0.0016, 0, 0.071, 0.11 + k * 0.016, 'z', 4, 12), C.grey, M.satin);
  ink.add(zlathe([[0, 0.205], [0.011, 0.205], [0.012, 0.235], [0.009, 0.24], [0, 0.24]], 0, 0.068, 0, 16));      // ink nozzle tip
  return finish(d, body, ink, trig, [0, 0.068, 0.242]);
}

function darkTetra(d) {
  // Wmn_Maneuver_Stepper. Single pistol, reconstructed from side, rear, front and oblique turntable views.
  // Dark target colours come from its official render; the stored Light rotation sheet is geometry-only.
  // Anchor frames and the existing muzzle remain native; these are merged static construction pieces.
  const C={white:'#e8e8e1',silver:'#9ba2a4',black:'#202328',rubber:'#15191d',purple:'#702891',grey:'#757c80'};
  const body=new Pieces(),ink=new Pieces();
  const trig=pistolGrip(body,{color:C.rubber,triggerColor:C.black,guard:false,base:false});
  // Dark variant: black rear cheeks on both sides, with separate grey kidney-shaped pads.
  const rear=[[-.050,.065],[-.041,.096],[-.022,.108],[.012,.100],[.019,.071],[.006,.032],[-.001,-.025],[-.022,-.065],[-.059,-.079],[-.064,-.064],[-.043,-.048],[-.043,.004]];
  body.add(shell(rear,.027,.003,36),C.black,M.satin);
  body.add(ylathe([[0,-.078],[.023,-.078],[.035,-.064],[.043,-.044],[.039,-.025],[.020,-.004],[.013,.012],[0,.012]],0,0,0,18).scale(1,1,.48).translate(0,0,-.038),C.black,M.rubber);
  for(const sx of[-1,1]){
    const cheek=[[-.035,.088],[-.020,.099],[.015,.091],[.016,.060],[.002,.026],[-.007,-.034],[-.026,-.065],[-.055,-.077],[-.052,-.059],[-.031,-.043],[-.026,.005]];
    body.add(shell(cheek,.003,.0015,30).translate(sx*.015,0,0),C.black,M.satin);
    const pad=[[-.019,.044],[-.034,.030],[-.038,.002],[-.029,-.030],[-.017,-.045],[-.006,-.033],[-.001,-.006],[-.005,.023]];
    body.add(shell(pad,.0035,.0012,28).translate(sx*.018,.022,0),C.black,M.rubber);
    body.add(shell(pad.map(([z,y])=>[-.019+(z+.019)*.73,y*.80]),.0018,.0006,24).translate(sx*.020,.022,0),C.grey,M.satin);
    for(const y of[-.004,.047]){body.add(cyl(.004,[sx*.020,y,-.021],[sx*.022,y,-.021],10),C.silver,M.satin);body.add(box(.001,.0012,.005,sx*.023,y,-.021,.15,6,4),C.black,M.print);}
    // Fine grip ribs follow the curved grey pad, without changing its hand-contact thickness.
    if(sx<0)for(let i=0;i<8;i++)body.add(cyl(.0007,[sx*.022,.002+i*.006,-.031],[sx*.022,.005+i*.005,-.010],6),C.silver,M.satin);
  }
  // Dark receiver: a rounded mechanical rear housing and one broad recessed central band.
  // The earlier two-slot rectangular cheek read as a thin ladder and hid the chamber's volume.
  body.add(box(.044,.042,.076,0,.069,.009,.38,12,8),C.black,M.satin);
  body.add(box(.036,.011,.042,0,.094,.003,.28,10,6),C.white,M.satin);
  for(const y of[.079,.052]){
    body.add(zlathe([[0,.034],[.016,.034],[.018,.041],[.018,.124],[.015,.134],[0,.134]],0,y,0,12),C.black,M.satin);
    body.add(zlathe([[.004,.132],[.016,.132],[.018,.137],[.017,.144],[.006,.146],[.004,.143]],0,y,0,22),C.white,M.satin);
    body.add(zlathe([[0,.141],[.005,.141],[.005,.146],[0,.146]],0,y,0,12),C.grey,M.satin);
    body.add(ring(.006,.0013,0,y,.146,'z',4,14),C.white,M.satin);
  }
  const chamber=[[.033,.051],[.041,.041],[.070,.035],[.111,.036],[.122,.045],[.122,.092],[.041,.096],[.030,.085]];
  const slot=[[[.039,.058],[.116,.058],[.116,.074],[.036,.074]]];
  for(const sx of[-1,1]){
    const cover=slab(chamber,.003,sx*.022,0,slot),pos=cover.attributes.position;
    // The rounded rear is wider than the front collar. This thickness is visible in front/oblique views.
    for(let i=0;i<pos.count;i++){const t=Math.max(0,Math.min(1,(pos.getZ(i)-.033)/.089));pos.setX(i,pos.getX(i)-sx*t*.003);}
    cover.computeVertexNormals();body.add(cover,C.white,M.satin);
    body.add(box(.003,.016,.073,sx*.022,.066,.078,.16,8,4),C.black,M.rubber);
    for(let k=0;k<6;k++)body.add(new THREE.BoxGeometry(.001,.012,.0013).translate(sx*.024,.066,.063+k*.008),C.grey,M.satin);
    for(const y of[.066,.086]){body.add(cyl(.004,[sx*.023,y,.043],[sx*.025,y,.043],10),C.silver,M.satin);body.add(new THREE.BoxGeometry(.0008,.001,.005).translate(sx*.0258,y,.043),C.black,M.print);}
    body.add(slab([[.124,.038],[.130,.037],[.132,.098],[.124,.100]],.0018,sx*.018,0),C.purple,M.gloss);
  }
  body.add(box(.035,.007,.076,0,.098,.079,.3,10,4),C.white,M.satin);
  body.add(box(.032,.068,.009,0,.067,.128,.25,10,6),C.purple,M.gloss);
  // The front leg is a curved black load-bearing core with two thin white cheeks and rounded ankle covers.
  const leg=[[.118,.102],[.133,.098],[.136,.038],[.126,.005],[.110,-.022],[.095,-.051],[.077,-.060],[.068,-.052],[.085,-.029],[.103,.010],[.109,.053]];
  body.add(shell(leg,.024,.002,32),C.black,M.satin);
  const face=[[.129,.100],[.140,.096],[.138,.040],[.126,.009],[.111,-.025],[.103,-.057],[.085,-.068],[.074,-.058],[.090,-.034],[.109,.012],[.119,.045]];
  for(const sx of[-1,1]){
    body.add(shell(face,.004,.0016,32).translate(sx*.014,0,0),C.white,M.satin);
    body.add(sphere(.013,.020,.024,sx*.020,-.060,.090,14,10),C.white,M.satin);
    body.add(cyl(.006,[sx*.022,-.059,.092],[sx*.034,-.059,.092],12),C.silver,M.satin);
  }
  const loop=[[0,.102,.132],[0,.131,.134],[0,.165,.148],[0,.179,.163],[0,.177,.174],[0,.164,.178],[0,.148,.163],[0,.119,.141],[0,.103,.137]];
  body.add(sweep(loop.map(p=>V(...p)),{seg:30,radial:8,capSteps:2,radius:()=>.0038,flat:1.75,outward:(_p,out)=>out.set(1,0,0)}).geo,C.white,M.satin);
  // Swept shoe: width and pitch change along its length. Side profile alone cannot describe this volume.
  const deck=[[-.098,-.069,.024],[-.073,-.083,.029],[-.025,-.088,.033],[.035,-.083,.036],[.087,-.064,.049],[.126,-.050,.056],[.141,-.040,.050]];
  const p=[],idx=[];for(const[z,y,w]of deck){for(const[x,dy]of[[-w+.002,.004],[w-.002,.004],[w,.001],[w,-.004],[w-.002,-.006],[-w+.002,-.006],[-w,-.004],[-w,.001]])p.push(x,y+dy,z);}
  for(let j=0;j<deck.length-1;j++)for(let k=0;k<8;k++){const a=j*8+k,b=j*8+(k+1)%8,c=b+8,e=a+8;idx.push(a,c,b,a,e,c);}for(let k=1;k<7;k++){idx.push(0,k,k+1);const a=(deck.length-1)*8;idx.push(a,a+k+1,a+k);}
  const shoe=new THREE.BufferGeometry();shoe.setAttribute('position',new THREE.Float32BufferAttribute(p,3));shoe.setIndex(idx);shoe.computeVertexNormals();body.add(shoe,C.black,M.rubber);
  for(const sx of[-1,1])body.add(pipe(deck.map(([z,y,w])=>[sx*(w-.001),y+.004,z]),.0027,32,5),C.white,M.satin);
  ink.add(slab([[-.070,-.019],[-.020,0],[-.070,.019]],.001,0,.0004).rotateZ(Math.PI/2).translate(0,-.078,0));
  // Dark variant rebound cushions are pale rubber, not the ink-coloured cushions of the Light reference.
  for(const[x,z,y]of[[0,-.056,-.096],[-.032,.082,-.080],[.032,.082,-.080]]){
    const spring=ylathe([[0,-.014],[.014,-.014],[.022,-.010],[.022,-.006],[.017,-.004],[.022,0],[.022,.005],[.017,.008],[.018,.013],[0,.013]],0,0,0,18).scale(1,1,.78).translate(x,y,z);body.add(spring,C.white,M.satin);
    for(const dy of[-.012,.004,.012])body.add(ylathe([[.014,dy],[.022,dy],[.022,dy+.0018],[.014,dy+.0018]],0,0,0,18).scale(1,1,.78).translate(x,y,z),C.white,M.satin);
  }
  // Front rebound faces are the raised ends of long black blades, not detached round buttons.
  for(const sx of[-1,1]){
    const x=sx*.036,y=-.044,z=.153,foot=new Pieces(),col=new Pieces();
    const contour=Array.from({length:18},(_,i)=>{const a=i*Math.PI/9;return[Math.cos(a)*.024,Math.sin(a)*.027*(Math.sin(a)<0?2:1)];});
    foot.add(slab(contour,.004,0,0).rotateY(Math.PI/2),C.white,M.satin);
    foot.add(slab(contour.map(([u,v])=>[u*.985,v*.985]),.004,-.003,0).rotateY(Math.PI/2),C.black,M.rubber);
    col.add(zlathe([[0,.007],[.012,.007],[.013,.0085],[0,.009]],0,0,0,18));
    foot.add(ring(.008,.0012,0,0,.010,'z',4,16),C.grey,M.satin);
    const bendBlade=g=>{
      const p=g.attributes.position,along=Array.from({length:p.count},(_,i)=>p.getY(i));g.rotateX(-.45).rotateY(sx*.52);
      for(let i=0;i<p.count;i++){const t=Math.max(0,Math.min(1,(-along[i]-.014)/.040));p.setY(i,p.getY(i)+.020*t);p.setZ(i,p.getZ(i)-.103*t);}
      g.computeVertexNormals();return g.translate(x,y,z);
    };
    body.merge(foot.transform(bendBlade));ink.merge(col.transform(bendBlade));
  }
  return finish(d,body,ink,trig,[0,.065,.147]);
}

function douser(d) {
  // Wmn_Maneuver_Long: a black flat top shell, a silver barrel with a red fire-hose nozzle (silver ring,
  // ink face), a yellow D-ring guard in front of the grip, a red extinguisher canister hung below on a hose.
  const C = { black: '#1b1c20', silver: '#c2c5c9', red: '#c4272b', yellow: '#e8c21c', green: '#2f9a4a', white: '#ecebe6' };
  const body = new Pieces(), ink = new Pieces();
  const trig = pistolGrip(body, { color: C.black, triggerColor: C.black, guardColor: C.black });
  body.add(shell([[-0.07, 0.06], [-0.06, 0.088], [0.09, 0.098], [0.12, 0.085], [0.11, 0.06], [-0.02, 0.048]], 0.04, 0.006, 24), C.black, M.satin);
  body.add(zcyl(0.014, 0.1, 0.22, 0, 0.07, 16), C.silver, M.satin);
  body.add(zlathe([[0, 0.215], [0.02, 0.215], [0.026, 0.235], [0.026, 0.262], [0.02, 0.268], [0, 0.268]], 0, 0.07, 0, 22), C.red, M.gloss);
  body.add(ring(0.024, 0.0035, 0, 0.07, 0.24, 'z', 5, 22), C.silver, M.metal);
  ink.add(zlathe([[0, 0.266], [0.016, 0.266], [0.016, 0.272], [0, 0.273]], 0, 0.07, 0, 18));
  body.add(ring(0.035, 0.007, 0, 0.0, 0.07, 'x', 8, 28).scale(1, 1.25, 1), C.yellow, M.gloss);                  // D-ring guard
  body.add(zlathe([[0, -0.035], [0.024, -0.035], [0.025, 0.03], [0.018, 0.04], [0, 0.04]], 0, 0, 0, 18).rotateX(-0.3).translate(0, -0.09, -0.03), C.red, M.gloss);
  body.add(zlathe([[0.0255, -0.012], [0.0255, 0.004]], 0, 0, 0, 18).rotateX(-0.3).translate(0, -0.09, -0.03), C.green, M.gloss);
  body.add(pipe([[0, -0.06, -0.01], [0, -0.072, -0.0], [0, -0.078, 0.008]], 0.004, 10, 5), C.black, M.rubber);
  return finish(d, body, ink, trig, [0, 0.07, 0.274]);
}

export const MODELS = {
  'dualies': { sourceModel: 'Wmn_Maneuver_NormalT', build: splatDualies },
  's3-maneuver-short': { sourceModel: 'Wmn_Maneuver_Short', build: dapple },
  's3-maneuver-gallon': { sourceModel: 'Wmn_Maneuver_Gallon', build: glooga },
  's3-maneuver-dual': { sourceModel: 'Wmn_Maneuver_Dual_L', build: squelchers },
  's3-maneuver-stepper': { sourceModel: 'Wmn_Maneuver_Stepper', build: darkTetra },
  's3-maneuver-long': { sourceModel: 'Wmn_Maneuver_Long', build: douser },
};
