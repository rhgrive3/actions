// Existing MIL-K v6 isolated from base Stringer builders; geometry and motion preserved.
import { THREE, Pieces, M, V, box, sphere, zlathe, zcyl, xcyl, ycyl, ring, pipe, pipeR, slab, part, rebuild, gripSpec,
  pistolGrip, glowGeometry, clamp, damp, smooth } from './kit.mjs';
const YC = .085, DRAW = .17;
function limbPoints(side, cfg) {
  const { span, back, riserZ, bulge = 0 } = cfg;
  return [[0, YC + side * 0.06, riserZ], [0, YC + side * span * 0.45, riserZ - back * 0.38 + bulge], [0, YC + side * span * 0.75, riserZ - back * 0.72 + bulge * 0.4], [0, YC + side * span, riserZ - back]];
}

/** Shared bow: limbs (wood / white), tip caps, riser plate, grip, string halves, arrow + nock parts. */
function bow(d, cfg, extra) {
  const C = cfg.C, body = new Pieces(), ink = new Pieces();
  const tr = pistolGrip(body, { color: C.grip ?? C.dark, triggerColor: C.black, guardColor: C.dark, baseColor: C.dark });
  const tipZ = cfg.riserZ - cfg.back, span = cfg.span;
  for (const s of [1, -1]) {
    if (cfg.limbR > 0) body.add(pipeR(limbPoints(s, cfg), t => cfg.limbR * (1 - 0.35 * t), 22, 10), C.limb, M.satin);
    if (cfg.limbR > 0) body.add(box(cfg.capW ?? 0.03, 0.026, 0.03, 0, YC + s * span, tipZ, 0.35), C.steel, M.satin);   // tip cap / nock block
  }
  body.add(box(0.034, 0.17, 0.04, 0, YC, cfg.riserZ, 0.3), C.steel, M.satin);                         // riser plate
  body.add(box(0.026, 0.07, 0.07, 0, YC - 0.04, 0.0, 0.3), C.dark, M.satin);                          // body-to-grip block
  extra(body, ink, C, cfg);
  // string halves hinged at the tips, pointing at the rest nock; re-aimed and scaled per frame
  const s1 = new Pieces(), s2 = new Pieces(), nock = new Pieces(), arrow = new Pieces();
  s1.add(ycyl(cfg.stringR ?? 0.0016, YC, YC + span, 0, tipZ, 5), C.string, M.satin);
  s2.add(ycyl(cfg.stringR ?? 0.0016, YC - span, YC, 0, tipZ, 5), C.string, M.satin);
  nock.add(box(0.012, 0.03, 0.012, 0, YC, tipZ, 0.5), C.steel, M.satin);
  // MIL-K seats the shaft at the nock front; original builders retain their offset.
  arrow.add(zcyl(0.0035, tipZ + (cfg.arrowNockFit ? 0.006 : 0.012), cfg.arrowFront, 0, YC, 8), C.black, M.satin);
  d.bowCfg = { span, tipZ, arrowFront: cfg.arrowFront };
  if (cfg.arrowNockFit) d.bowCfg.arrowNockFit = true;
  const parts = {
    trigger: part(tr, [0, 0.0315, 0.0282]),
    string: part(s1, [0, YC + span, tipZ], 'ink'),
    stringL: part(s2, [0, YC - span, tipZ], 'ink'),
    nock: part(nock, [0, YC, tipZ]),
    arrow: part(arrow, [0, YC, cfg.arrowFront]),
  };
  const rings = new Pieces();
  for (let k = 0; k < 6; k++) rings.add(ring(cfg.coilR, 0.0016, 0, YC, cfg.coil0 + (cfg.coil1 - cfg.coil0) * k / 5, 'z', 4, 18), '#ffffff', M.led);
  return rebuild(d, { body, ink, parts, gripL: cfg.gripL, muzzle: [0, YC, cfg.muzzleZ],
    glow: glowGeometry(rings, cfg.coil0 - 0.002, cfg.coil1 + 0.002, 'z') });
}

// ------------------------------------------------------------------------------------------ Tri-Stringer
function reefMilK(d) {
  const C = { limb: '#e4e0d4', steel: '#a9adb4', dark: '#2a2b30', black: '#17181b', string: '#cfd6c4', grip: '#2a2b30' };
  const cfg = { C, span: 0.3, back: 0.14, riserZ: -0.03, limbR: 0, stringR: 0.0025, arrowNockFit: true, coilR: 0.056, coil0: -0.01, coil1: 0.09,
    arrowFront: 0.02, muzzleZ: 0.15, gripL: gripSpec([0, 0.0, 0.095], [0, 0, 1], [0.75, -0.62, -0.1]) };
  return bow(d, cfg, (body, ink) => {
    // HD02/06 projected ratios: rear body/shoulder about 0.8, rear carriage/bow 0.20-0.25.
    // Shorter, flatter shoulder and flared rear closure replace v4's bulbous connector.
    const bottle=zlathe([[0,-0.13],[0.047,-0.13],[0.053,-0.126],[0.053,-0.118],
      [0.049,-0.109],[0.05,-0.032],[0.052,-0.009],[0.052,0.006],[0,0.006]],0,YC,0,32);
    const bp=bottle.attributes.position;
    for(let i=0;i<bp.count;i++){
      const x=bp.getX(i),y=bp.getY(i)-YC,r=Math.hypot(x,y);
      if(r>1e-6){const a=Math.atan2(y,x),cs=Math.cos(a),sn=Math.sin(a);
        // Subtle broad side panels; not a perfectly round tube or a sharp rectangular box.
        bp.setXY(i,Math.sign(cs)*Math.abs(cs)**0.88*r*0.94,YC+Math.sign(sn)*Math.abs(sn)**0.88*r);}
    }
    bottle.computeVertexNormals();body.add(bottle,'#e1e1d6',M.satin);
    body.add(ring(0.051,0.0025,0,YC,-0.124,'z',5,24),C.limb,M.satin);
    for(const r of [0.014,0.025,0.036,0.045])body.add(ring(r,0.0018,0,YC,-0.133,'z',4,20),C.limb,M.satin);
    const shoulder=zlathe([[0.049,-0.005],[0.058,-0.005],[0.064,0.006],[0.065,0.013],
      [0.065,0.046],[0.06,0.058],[0.048,0.069],[0.036,0.085],[0,0.095]],0,YC,0,48);
    const cp=shoulder.attributes.position;
    for(let i=0;i<cp.count;i++){
      const x=cp.getX(i),y=cp.getY(i)-YC,z=cp.getZ(i),r=Math.hypot(x,y);
      if(r>.06&&z>.005&&z<.05){const nr=r-.0012*(.5+.5*Math.cos(Math.atan2(y,x)*12));cp.setXY(i,x*nr/r,YC+y*nr/r);}
    }
    shoulder.computeVertexNormals();body.add(shoulder,'#c9cbbd',M.satin);
    body.add(ring(0.058,0.0025,0,YC,-0.003,'z',4,24),'#d5d7c9',M.satin);
    // A distinct front band has straighter sides than the shoulder taper.
    body.add(zlathe([[0.052,0.054],[0.062,0.054],[0.064,0.058],[0.064,0.064],
      [0.059,0.069],[0.049,0.069],[0.052,0.054]],0,YC,0,32),'#e4e3d6',M.satin);
    // HD 10s: broad stepped outer coupling and a longitudinally fluted front sleeve.
    // Their native fixed finish stays neutral; video team color/translucency is a separate gap.
    body.add(zlathe([[0.034,0.086],[0.049,0.086],[0.053,0.091],[0.053,0.098],
      [0.049,0.101],[0.049,0.108],[0.052,0.111],[0.052,0.117],
      [0.047,0.12],[0.034,0.12],[0.034,0.086]],0,YC,0,32),'#92978c',M.satin);
    const sleeve=zlathe([[0.023,0.115],[0.046,0.115],[0.05,0.12],[0.05,0.139],
      [0.046,0.146],[0.041,0.15],[0.023,0.15],[0.023,0.115]],0,YC,0,48);
    const sp=sleeve.attributes.position;
    for(let i=0;i<sp.count;i++){
      const x=sp.getX(i),y=sp.getY(i)-YC,z=sp.getZ(i),r=Math.hypot(x,y);
      if(r>0.04&&z>0.118&&z<0.147){
        // Twelve shallow axial scallops cut the silhouette, not just color stripes.
        const nr=r-0.004*(0.5+0.5*Math.cos(Math.atan2(y,x)*12));
        sp.setXY(i,x*nr/r,YC+y*nr/r);
      }
    }
    sleeve.computeVertexNormals();body.add(sleeve,'#727970',M.satin);
    // Small concentric metal nozzle remains distinct from the broad outer coupling.
    body.add(zlathe([[0.006,0.141],[0.018,0.141],[0.019,0.146],
      [0.014,0.155],[0.006,0.155],[0.006,0.141]],0,YC,0,16),C.limb,M.satin);
    body.add(zlathe([[0.004,0.143],[0.006,0.143],[0.006,0.154],[0.004,0.154]],0,YC,0,12),'#555e5b',M.satin);
    ink.add(ring(0.03,0.004,0,YC,0.152,'z',4,18));
    for (const s of [1,-1]) {
      // The rotating edge view resolves two thin rails, with a long opening in each side profile.
      const edge=[[-0.01,0.06],[-0.012,0.12],[-0.025,0.19],[-0.06,0.25],[-0.115,0.287],[-0.16,0.31],
        [-0.177,0.29],[-0.13,0.26],[-0.088,0.225],[-0.062,0.174],[-0.05,0.112],[-0.05,0.06]];
      const slot=[[-0.028,0.116],[-0.039,0.184],[-0.074,0.241],[-0.128,0.275],
        [-0.12,0.263],[-0.083,0.229],[-0.051,0.178],[-0.04,0.115]];
      for(const x of [-0.015,0.015])body.add(slab(edge.map(([z,y])=>[z,YC+s*y]),0.009,x,0.0015,[slot.map(([z,y])=>[z,YC+s*y])]),C.limb,M.satin);
      const y=YC+s*cfg.span,z=cfg.riserZ-cfg.back+0.01;
      // Solid, layered octagonal pulley with central bolt, not an open ring.
      body.add(xcyl(0.031,-0.012,0.012,y,z,8),C.limb,M.satin);
      for(const side of [-1,1]) {
        const x=side*0.017;
        body.add(xcyl(0.026,x-0.003,x+0.003,y,z,8),C.limb,M.satin);
        body.add(xcyl(0.007,x-0.006,x+0.006,y,z,6),'#707773',M.satin);
      }
      body.add(zcyl(0.009,0,0.065,0,YC+s*0.15,10),C.steel,M.satin);
      body.add(zcyl(0.011,0.048,0.067,0,YC+s*0.15,10),C.limb,M.satin);
      body.add(pipe([[0,y,z],[0,YC+s*0.14,cfg.riserZ-0.02]],0.0028,8,6),'#cf744b',M.satin);
      // Missing in v3: root-to-rear-carriage brace closes the visible triangle.
      // Static support cables, separate from the untouched native animated draw string.
      body.add(pipe([[0,YC+s*0.14,cfg.riserZ-0.02],[0,YC+s*0.06,cfg.riserZ-cfg.back]],0.0028,8,6),'#cf744b',M.satin);
      // Attachment block and visible side screw where the limb meets the bottle.
      body.add(box(0.047,0.049,0.04,0,YC+s*0.092,-0.025,0.4),C.limb,M.satin);
      for(const x of [-0.026,0.026])body.add(xcyl(0.003,x-0.001,x+0.001,YC+s*0.092,-0.025,8),'#707773',M.satin);
    }
    // Upper-only metal squid-outline clip, resolved in both side and edge video views.
    const clip=[[-0.04,0.24],[-0.005,0.25],[0.005,0.22],[-0.008,0.208],[-0.006,0.198],
      [-0.016,0.193],[-0.014,0.185],[-0.023,0.183],[-0.03,0.192],[-0.035,0.185],[-0.044,0.19],[-0.04,0.204],[-0.048,0.219],[-0.04,0.24]];
    body.add(pipe(clip.map(([z,y])=>[0.029,YC+y,z]),0.003,28,6),'#545f59',M.satin);
    body.add(pipe([[0.029,YC+0.239,-0.035],[0.029,YC+0.247,-0.01]],0.0032,3,6),'#8c9351',M.satin);
    // Lower-only white perforated wrap: geometry for bands, small dark inset marks for the holes.
    const wrap=[[-0.008,0.116],[-0.021,0.178],[-0.038,0.205],[-0.063,0.194],[-0.049,0.165],[-0.04,0.111]];
    body.add(slab(wrap.map(([z,y])=>[z,YC-y]),0.045,0,0.002),'#efeee7',M.rubber);
    for(const side of [-1,1])for(let row=0;row<6;row++)for(let col=0;col<3;col++) {
      const y=0.122+row*0.011,z=-0.017-row*0.003-col*0.008;
      body.add(xcyl(0.0009,side*0.023-0.0003,side*0.023+0.0003,YC-y,z,5),'#a9aba3',M.rubber);
    }
    // Broad shallow plate, not a tube: HD rear carriage is about one fifth of the bow span.
    const carriage=[[-0.165,-0.065],[-0.179,-0.059],[-0.19,-0.032],[-0.193,0],[-0.19,0.032],[-0.179,0.059],
      [-0.165,0.065],[-0.158,0.05],[-0.17,0.026],[-0.175,0],[-0.17,-0.026],[-0.158,-0.05]];
    body.add(slab(carriage.map(([z,y])=>[z,YC+y]),0.036,0,0.0025),C.limb,M.satin);
  });
}

// ------------------------------------------------------------------------------------------ Wellstring V
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
  // Scale the MIL-K shaft about its fixed front using its actual rest length.
  if (arr) arr.scale.z = 1 + draw / (c.arrowFront - c.tipZ - (c.arrowNockFit ? 0.006 : 0));
}

const colors = new Map();
const color = value => { if (!colors.has(value)) colors.set(value,new THREE.Color(value)); return colors.get(value); };
const close = (a, i, c) => Math.abs(a.getX(i)-c.r)<1e-6 && Math.abs(a.getY(i)-c.g)<1e-6 && Math.abs(a.getZ(i)-c.b)<1e-6;
/** Fresh-definition-only finish. Never visits team ink, lamps, charge glow or materials.
 * Color arrays are copied so even an externally shared attribute cannot be modified. */
function finish(d, palette, detail) {
  const changes = Object.entries(palette).map(([from,to]) => [color(from),color(to)]);
  for (const [channel,g] of [['body',d.body], ...Object.entries(d.parts ?? {}).filter(([,p])=>p.mat==='body'&&!p.hidden).map(([n,p])=>[n,p.src])]) {
    if (!g?.attributes?.color) continue;
    const original=g.attributes.color, next=original.clone(), pos=g.attributes.position;
    for(let i=0;i<next.count;i++) {
      for(const [from,to] of changes) if(close(original,i,from)) { next.setXYZ(i,to.r,to.g,to.b); break; }
      const extra=detail?.(channel,pos,i,original);
      if(extra) { const c=color(extra); next.setXYZ(i,c.r,c.g,c.b); }
    }
    g.setAttribute('color',next);
  }
  return d;
}
const definitions = [];
{
  const base={sourceModel:'Wmn_Stringer_Short',animate:animateBow};
  definitions.push(['Stringer_Short_02',Object.freeze({...base,baseId:'s3-stringer-short',sourceRow:'Stringer_Short_02',name:'REEF-LUX 450 MIL-K',shapeRevision:'video-bottle-slotted-rails-octagonal-pulleys',
    sourceUrl:'https://splatoonwiki.org/wiki/REEF-LUX_450_MIL-K',inkPartition:'redString',
    build(d){d=finish(reefMilK(d),{'#17181b':'#d5d5c9','#2a2b30':'#dadad0','#a9adb4':'#d3d2c8','#9a9ea6':'#b76d61'});
      for(const n of ['string','stringL']){const p=d.parts[n];p.mat='body';const c=p.src.attributes.color.clone(),red=color('#cf744b');for(let i=0;i<c.count;i++)c.setXYZ(i,red.r,red.g,red.b);p.src.setAttribute('color',c);}return d;}})]);
}
export const FOLLOWUP_MODELS = Object.freeze(Object.fromEntries(definitions));
