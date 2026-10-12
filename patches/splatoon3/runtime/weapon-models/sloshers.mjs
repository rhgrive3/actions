// Slosher family models (Splatoon 3 Ver.11.3.0 main weapons): Slosher (Bucket), Tri-Slosher, Sloshing Machine,
// Bloblobber, Explosher, Dread Wringer. Each body is the side silhouette of the official 3D render (400 px,
// Inkipedia "S3 <Name> 3D"), traced from its alpha channel and extruded across X. The ink surface is a flat disc
// lying on the silhouette's top edge above the opening (kept level by animateWeapon), and the native pitcher
// handle, its thumb lever and the native right-hand grip are kept at the origin. Scale is an estimate (see the
// reference doc). Everything is procedural geometry.
import { Pieces, M, V, box, sphere, slab, part, rebuild, pipe, pipeR, cyl, ring, zlathe, ylathe, rotateAbout } from './kit.mjs';

// Reference pixel -> weapon space for a side render: (gx, gy) = origin in the image, s = metres/pixel.
// Returns [z, y], the layout slab() takes directly (muzzle toward +Z, up = +Y).
const px = (gx, gy, s) => (x, y) => [(x - gx) * s, (gy - y) * s];

/** Height (reference px, smaller = higher) of the silhouette's top edge at column x. */
function topY(pts, x) {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    if (ax === bx || (ax - x) * (bx - x) > 0) continue;
    const y = ay + ((x - ax) / (bx - ax)) * (by - ay);
    if (y < best) best = y;
  }
  return Number.isFinite(best) ? best : Math.min(...pts.map(p => p[1]));
}

// Silhouette outlines, reference pixels (muzzle right, up = -y), traced from each render's alpha channel.
const OUTLINE = {
  slosher: [[175,13],[191,17],[196,27],[191,51],[194,62],[199,74],[218,95],[245,111],[256,125],[310,148],[351,178],[357,192],[354,206],[358,214],[351,242],[331,260],[288,274],[201,361],[192,368],[176,370],[166,383],[150,386],[127,369],[72,297],[69,280],[78,254],[47,221],[41,197],[72,162],[92,162],[84,130],[87,112],[104,100],[116,67],[159,19],[169,20],[174,14]],
  diffusion: [[179,13],[189,16],[197,24],[269,126],[283,147],[278,155],[346,208],[351,218],[272,337],[266,343],[256,343],[249,338],[192,386],[67,288],[104,230],[55,202],[49,195],[50,182],[62,166],[75,157],[72,149],[75,131],[117,69],[165,19],[178,14]],
  launcher: [[176,26],[232,41],[292,66],[331,104],[355,145],[366,180],[365,221],[353,244],[333,257],[316,260],[303,274],[308,280],[299,294],[303,303],[278,320],[270,309],[273,301],[214,334],[203,348],[207,356],[182,373],[175,362],[179,353],[161,362],[121,341],[89,315],[63,284],[32,227],[37,217],[92,166],[113,157],[117,149],[98,110],[104,88],[175,27]],
  bathtub: [[113,60],[127,70],[130,78],[128,87],[110,108],[113,110],[194,123],[309,132],[358,145],[382,157],[393,180],[350,257],[333,267],[281,272],[277,282],[265,281],[250,290],[220,327],[194,336],[152,333],[139,339],[132,330],[113,335],[107,332],[105,321],[60,308],[35,293],[30,278],[35,264],[14,264],[6,256],[11,241],[51,196],[51,186],[45,177],[27,164],[26,148],[95,69],[104,61],[112,61]],
  washtub: [[282,47],[306,54],[314,49],[311,57],[329,68],[338,65],[338,80],[349,93],[356,89],[353,135],[330,154],[376,166],[384,181],[343,228],[312,240],[182,350],[139,341],[125,352],[85,340],[32,281],[35,241],[15,213],[65,164],[90,174],[72,109],[82,89],[136,49],[155,52],[166,75],[190,67],[200,76],[236,74],[244,83],[266,52],[281,48]],
  double: [[202,37],[218,43],[276,83],[284,82],[293,93],[320,94],[353,111],[380,93],[399,117],[375,141],[384,159],[308,229],[295,221],[137,341],[126,336],[91,361],[72,337],[102,311],[98,305],[86,311],[94,299],[79,269],[84,262],[76,252],[55,249],[34,264],[2,255],[0,228],[11,213],[3,179],[43,137],[75,118],[85,103],[147,58],[182,40],[201,38]],
};

// Per weapon: origin (handle centre in the render, px), scale (m/px, estimated from the body size), body colour
// and surface class, handle colour, ink-surface column (px) and radius (m).
const CFG = {
  'slosher':               { o: [110, 290], s: 0.0006,  thick: 0.09, color: '#2a2b33', mat: M.gloss, handle: '#c9c9cc', outline: 'slosher',  rim: 250, R: 0.07 },
  's3-slosher-diffusion':  { o: [150, 300], s: 0.0007,  thick: 0.08, color: '#2c3f9c', mat: M.gloss, handle: '#e8c81e', outline: 'diffusion', rim: 250, R: 0.075 },
  's3-slosher-launcher':   { o: [150, 250], s: 0.00065, thick: 0.09, color: '#7d8189', mat: M.metal, handle: '#2c2d31', outline: 'launcher', rim: 280, R: 0.06 },
  's3-slosher-bathtub':    { o: [150, 300], s: 0.0008,  thick: 0.07, color: '#eeede8', mat: M.gloss, handle: '#2b2c30', outline: 'bathtub',  rim: 230, R: 0.09 },
  's3-slosher-washtub':    { o: [150, 260], s: 0.00065, thick: 0.10, color: '#5f6b30', mat: M.satin, handle: '#2b2c30', outline: 'washtub',  rim: 290, R: 0.05 },
  's3-slosher-double':     { o: [170, 250], s: 0.00075, thick: 0.07, color: '#8a8c90', mat: M.metal, handle: '#2b2c30', outline: 'double',   rim: 200, R: 0.06 },
};

// ------------------------------------------------------------------------------------------ 3D builders
// Native slosher frame (character-weapons.js buildSlosher): the right hand holds a vertical handle at the
// origin, the container is centred at (0, BY, BZ), the support hand closes under its front (native gripL),
// the muzzle stays at the native (0, BY + .1, BZ + .03) so projectile origins are unchanged.
const BY = 0.012, BZ = 0.148;
/** Open-top box container: outer w (X) × h (Y) × dep (Z), wall t, centred at (0, cy, cz). */
function openBox(p, w, h, dep, t, cy, cz, color, mat = M.gloss) {
  const e = 0.18, y0 = cy - h / 2;
  p.add(box(w, t, dep, 0, y0 + t / 2, cz, e), color, mat);                               // floor
  for (const sx of [-1, 1]) p.add(box(t, h, dep, sx * (w - t) / 2, cy, cz, e), color, mat); // side walls
  for (const sz of [-1, 1]) p.add(box(w, h, t, 0, cy, cz + sz * (dep - t) / 2, e), color, mat); // front/back
  // rolled rim
  for (const sx of [-1, 1]) p.add(box(t * 1.8, t * 1.4, dep + t * .8, sx * (w - t) / 2, cy + h / 2, cz, .5), color, mat);
  for (const sz of [-1, 1]) p.add(box(w + t * .8, t * 1.4, t * 1.8, 0, cy + h / 2, cz + sz * (dep - t) / 2, .5), color, mat);
}
/** Flat ink surface (kept level by the native animation) as a rounded rectangle slab. */
function inkRect(w, dep, y, z) {
  return part(new Pieces().add(box(w, 0.003, dep, 0, y, z, 0.25, 16, 4), '#ffffff', M.satin), [0, y, z], 'ink');
}
function inkDisc(r, y, z) {
  return part(new Pieces().add(sphere(r, 0.0015, r, 0, y, z, 24, 6), '#ffffff', M.satin), [0, y, z], 'ink');
}
/** Vertical wire D-handle the right hand holds (native gripR at the origin), joined to the back wall at zb. */
function wireHandle(p, zb, color = '#1d1e22') {
  p.add(pipe([[0, 0.058, zb], [0, 0.06, 0.004], [0, 0.03, -0.012], [0, -0.03, -0.012], [0, -0.06, 0.004], [0, -0.058, zb]], 0.0052, 24, 8), color, M.satin);
  p.add(cyl(0.0125, [0, -0.05, -0.004], [0, 0.05, -0.004], 14), color, M.rubber);           // grip sleeve on the axis
}

function triSlosher(d) {
  // Wmn_Slosher_Diffusion: blue square tub split by two dividers into three channels, a yellow swing bail
  // with finger holes pivoting on the side walls, a black wire handle on the back wall.
  const C = { blue: '#2b3cb0', yellow: '#e3e01c', black: '#1b1c20' };
  const w = 0.19, h = 0.19, dep = 0.19, t = 0.009, cy = BY + 0.004, cz = BZ;
  const body = new Pieces(), ink = new Pieces();
  openBox(body, w, h, dep, t, cy, cz, C.blue);
  for (const sx of [-1, 1]) body.add(box(0.006, h - 0.03, dep - 2 * t, sx * w / 6, cy - 0.012, cz, 0.2), C.blue, M.gloss);   // dividers
  for (const sx of [-1, 0, 1]) body.add(box(0.02, h * 0.82, 0.006, sx * w / 3, cy - 0.01, cz + dep / 2 + 0.002, 0.3), C.blue, M.gloss); // front ribs
  for (const sx of [-1, 0, 1]) ink.add(box(w / 3 - 0.014, h * 0.55, dep - 0.03, sx * w / 3, cy - h * 0.18, cz, 0.15));        // ink in each channel
  // yellow bail: flat band arching over the opening, pivots on the side walls, leaning back toward the hand
  const top = cy + h / 2 + 0.115, arch = [];
  for (let k = 0; k <= 16; k++) { const a = Math.PI * k / 16; arch.push([Math.cos(a) * (w / 2 + 0.012), cy + 0.03 + Math.sin(a) * (top - cy - 0.03), cz]); }
  const bail = new Pieces().add(pipeR(arch, () => 0.0095, 40, 10), C.yellow, M.gloss);
  for (let k = -2; k <= 1; k++) bail.add(sphere(0.006, 0.004, 0.005, (k + 0.5) * 0.024, top + 0.006, cz), '#b9b412', M.satin);
  for (const sx of [-1, 1]) bail.add(cyl(0.011, [sx * (w / 2 - 0.002), cy + 0.03, cz], [sx * (w / 2 + 0.018), cy + 0.03, cz], 12), C.yellow, M.gloss);
  body.merge(bail.transform(g => rotateAbout(g, [1, 0, 0], -0.32, [0, cy + 0.03, cz])));
  wireHandle(body, cz - dep / 2);
  return rebuild(d, { body, ink, parts: { surface: inkRect(w - 0.04, dep - 0.04, cy + h * 0.1, cz) } });
}
function slosherMachine(d) {
  // Wmn_Slosher_Launcher: graphite machine body with a rounded crown, a big silver-bezel round port on the
  // front with spiral turbine blades and a hub, a light-grey side frame and top carry handle, a cream rear
  // block with a vent grille, four brass feet. The native right-hand handle stands on the rear block.
  const C = { body: '#4c4f57', frame: '#b9b6ab', cream: '#e4d9bd', silver: '#c6c9cc', dark: '#22242a', brass: '#b08a3c', blue: '#3a62d8' };
  const cy = BY + 0.004, cz = BZ + 0.012, w = 0.17, h = 0.165, dep = 0.15;
  const body = new Pieces(), ink = new Pieces();
  body.add(box(w, h, dep, 0, cy, cz, 0.32, 16, 10), C.body, M.satin);
  body.add(box(w * 0.92, 0.05, dep * 0.9, 0, cy + h / 2 - 0.01, cz, 0.6, 14, 6), C.body, M.satin);           // rounded crown
  for (const sx of [-1, 1]) body.add(box(0.008, h * 0.92, 0.026, sx * (w / 2 + 0.002), cy, cz + dep / 2 - 0.018, 0.3), C.frame, M.satin); // front frame strips
  // front port: silver bezel, dark throat, spiral blades, hub
  const fz = cz + dep / 2;
  body.add(ring(0.068, 0.009, 0, cy, fz + 0.004, 'z', 8, 32), C.silver, M.satin);
  body.add(zlathe([[0, fz - 0.03], [0.064, fz - 0.03], [0.064, fz + 0.002], [0, fz + 0.002]], 0, cy, 0, 28), C.dark, M.satin);
  const blades = new Pieces();
  for (let k = 0; k < 14; k++) blades.add(box(0.05, 0.004, 0.022, 0.03, 0, 0, 0.4).rotateY(0.5).rotateZ(k * Math.PI * 2 / 14), C.silver, M.satin);
  body.merge(blades.transform(g => g.translate(0, cy, fz - 0.012)));
  body.add(zlathe([[0, fz - 0.02], [0.016, fz - 0.02], [0.016, fz + 0.004], [0.009, fz + 0.008], [0, fz + 0.008]], 0, cy, 0, 18), C.silver, M.metal);
  body.add(zlathe([[0, fz + 0.007], [0.007, fz + 0.007], [0, fz + 0.011]], 0, cy, 0, 12), C.blue, M.gloss);
  // top carry handle (light grey) and bolts
  for (const sz of [-1, 1]) body.add(box(0.018, 0.04, 0.016, 0, cy + h / 2 + 0.03, cz + sz * 0.045, 0.4), C.frame, M.satin);
  body.add(box(0.022, 0.016, 0.11, 0, cy + h / 2 + 0.052, cz, 0.45), C.frame, M.satin);
  // cream rear block with a vent grille
  const rz = cz - dep / 2 - 0.03;
  body.add(box(w * 0.9, h * 0.82, 0.06, 0, cy - 0.008, rz, 0.3), C.cream, M.satin);
  for (let k = 0; k < 7; k++) body.add(box(w * 0.66, 0.005, 0.004, 0, cy - 0.055 + k * 0.016, rz - 0.031, 0.5), C.dark, M.satin);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) body.add(ylathe([[0, -0.016], [0.011, -0.016], [0.013, -0.006], [0.009, 0], [0, 0]], sx * 0.06, cy - h / 2, cz + sz * 0.05, 12), C.brass, M.metal);
  wireHandle(body, rz - 0.03);
  ink.add(zlathe([[0, fz - 0.05], [0.058, fz - 0.05], [0.058, fz - 0.032], [0, fz - 0.032]], 0, cy, 0, 24));     // ink behind the turbine
  return rebuild(d, { body, ink, parts: { surface: inkDisc(0.05, cy + 0.03, cz) } });
}
function bloblobber(d) {
  // Wmn_Slosher_Bathtub: a deep white bathtub (rolled rim, drain) in a black hull with a strap round it, a
  // chrome tap bar with red/blue rings across the back end and a chrome grab rail along the side; the
  // opening tilts up toward the front as in the render.
  const C = { white: '#efeee9', hull: '#25262b', strap: '#1c1d21', chrome: '#cfd2d6', red: '#d23a3a', blue: '#3a5ad2' };
  const cy = BY - 0.01, cz = BZ + 0.035, rx = 0.092, rz = 0.15, top = cy + 0.06;
  const tub = new Pieces(), ink = new Pieces();
  tub.add(sphere(rx, 0.1, rz, 0, cy - 0.045, cz, 24, 16), C.hull, M.satin);                                     // deep hull (top stays under the rim)
  tub.add(box(rx * 2.02, 0.05, rz * 2.0, 0, top - 0.02, cz, 0.45, 24, 8), C.white, M.gloss);                    // white upper shell
  tub.add(ring(1, 0.012, 0, 0, 0, 'y', 8, 40).scale(rx * 0.97, 1, rz * 0.97).translate(0, top + 0.004, cz), C.white, M.gloss); // rolled rim
  tub.add(ring(1, 0.009, 0, 0, 0, 'y', 6, 40).scale(rx * 1.02, 1, rz * 1.02).translate(0, cy - 0.02, cz), C.strap, M.rubber); // strap
  tub.add(box(0.026, 0.006, 0.11, -(rx + 0.002), top - 0.012, cz + 0.01, 0.5), C.hull, M.satin);              // rim slot
  tub.add(pipe([[-(rx + 0.004), cy, cz - 0.07], [-(rx + 0.024), cy + 0.004, cz - 0.05], [-(rx + 0.024), cy + 0.004, cz + 0.07], [-(rx + 0.004), cy, cz + 0.09]], 0.0065, 24, 8), C.chrome, M.metal);
  const tz = cz - rz + 0.02, ty = top + 0.034;
  tub.add(cyl(0.014, [-0.07, ty, tz], [0.07, ty, tz], 18), C.chrome, M.metal);
  for (const [x, c] of [[-0.05, C.red], [0.05, C.blue]]) tub.add(ring(0.0145, 0.003, x, ty, tz, 'x', 5, 18), c, M.gloss);
  tub.add(cyl(0.008, [0.02, top, tz + 0.004], [0.02, ty, tz], 12), C.chrome, M.metal);
  tub.add(cyl(0.006, [0, ty, tz], [0, ty - 0.006, tz + 0.04], 12), C.chrome, M.metal);
  ink.add(sphere(rx * 0.9, 0.01, rz * 0.9, 0, top + 0.002, cz, 22, 6));                                        // ink filling the tub
  const tilt = g => rotateAbout(g, [1, 0, 0], -0.18, [0, cy, cz]);
  const body = new Pieces().merge(tub.transform(tilt)); ink.transform(tilt);
  wireHandle(body, cz - rz + 0.01);
  return rebuild(d, { body, ink, parts: { surface: inkDisc(0.07, top + 0.004, cz) } });
}
function explosher(d) {
  // Wmn_Slosher_Washtub: volumetric jerrycan, independent crash cage and open burner.
  // Reference: stored official 3D render plus turntable; the top handle is not the hand anchor.
  // The native rear D grip, support hand, muzzle and slosh surface channel stay in their old frame.
  const C = { olive:'#626e35', ridge:'#778348', darkOlive:'#414b28', brass:'#b09250', silver:'#aeb8bd', black:'#22262c', orange:'#ec742d', panel:'#343842' };
  const body=new Pieces(), ink=new Pieces(), cy=BY-.004, cz=BZ+.010;
  const w=.144, h=.186, dep=.170;
  body.add(box(w,h,dep,0,cy,cz,.25,16,10),C.olive,M.satin);
  // Pressed side wells with raised X ribs, separately built on the two broad faces.
  for(const sx of[-1,1]) {
    const x=sx*.073;
    body.add(box(.003,.129,.121,x,cy-.006,cz,.28,12,8),C.darkOlive,M.satin);
    body.add(box(.004,.117,.108,x+sx*.0018,cy-.006,cz,.3,12,8),C.olive,M.satin);
    for(const dir of[-1,1]) body.add(cyl(.0033,[x+sx*.004,cy-.049,cz-dir*.043],[x+sx*.004,cy+.037,cz+dir*.043],8),C.ridge,M.satin);
    body.add(box(.0035,.028,.029,x+sx*.006,cy-.006,cz,.22,8,4),C.olive,M.satin);
    // Lower moulded runner protects the can, leaving the support-hand axis unobstructed.
    body.add(box(.018,.016,.134,sx*.051,cy-.097,cz,.3,10,6),C.darkOlive,M.satin);
  }
  // Rear electrical box: chamfered volume, warning plate and a separate bank of vents.
  body.add(box(.112,.147,.033,0,cy-.003,cz-.088,.22,12,8),C.panel,M.satin);
  body.add(box(.035,.041,.0018,-.026,cy+.008,cz-.105,.15,8,4),'#dad8c6',M.print);
  body.add(box(.031,.009,.002,-.026,cy+.028,cz-.106,.15,8,4),'#a12f32',M.print);
  body.add(slab([[-.026,-.005],[-.012,.018],[.002,-.005]],.002,0,.0001).rotateY(Math.PI/2).translate(-.013,cy,cz-.107),'#d2b83d',M.print);
  for(let i=0;i<5;i++) body.add(box(.028,.003,.002,.024,cy+.023-i*.011,cz-.106,.15,8,4),C.black,M.satin);
  // Integral carry aperture at the back shoulder and a serrated filler cap.
  for(const x of[-.025,.025]) body.add(box(.008,.023,.012,x,cy+.103,cz-.055,.18,8,4),C.olive,M.satin);
  body.add(box(.058,.008,.012,0,cy+.117,cz-.055,.18,10,4),C.olive,M.satin);
  body.add(ylathe([[0,.095],[.014,.095],[.018,.100],[.018,.113],[.014,.116],[0,.116]],-.028,cy,cz+.012,16),C.olive,M.satin);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;body.add(box(.004,.011,.004,-.028+Math.cos(a)*.017,cy+.108,cz+.012+Math.sin(a)*.017,.18,6,4),C.darkOlive,M.satin);}
  // Large hollow bronze burner rises from the front shoulder; horizontal bars cross its OPEN mouth.
  const by=cy+.060,bz=cz+.069,tilt=-.62,burner=new Pieces();
  burner.add(zlathe([[.038,-.027],[.050,-.025],[.051,-.009],[.050,.032],[.057,.067],[.057,.075],[.051,.075],[.047,.064],[.041,.010],[.038,-.027]],0,0,0,28),C.brass,M.metal);
  burner.add(zlathe([[.039,-.026],[.057,-.026],[.061,-.019],[.061,-.011],[.054,-.005],[.047,-.004]],0,0,0,24),C.silver,M.metal);
  // Narrow graphite sleeve ribs and silver retaining band reveal the warm interior.
  for(const sx of[-1,1]) burner.add(box(.010,.080,.041,sx*.050,0,.020,.22,10,6),C.panel,M.satin);
  burner.add(ring(.051,.0028,0,0,.040,'z',5,24),C.silver,M.metal);
  burner.add(ring(.056,.0025,0,0,.074,'z',5,28),C.brass,M.metal);
  for(const y of[-.031,0,.031]) {
    const width=2*Math.sqrt(.051*.051-y*y);
    burner.add(box(width,.0035,.007,0,y,.074,.22,10,4),C.brass,M.metal);
  }
  for(const sx of[-1,1]) {
    burner.add(pipe([[sx*.043,-.024,-.014],[sx*.050,-.025,.005],[sx*.055,-.017,.035]],.0018,10,5),C.orange,M.gloss);
    burner.add(box(.014,.010,.012,sx*.045,-.029,.005,.15,8,4),C.brass,M.metal);
  }
  // Recessed throat clears the can's front wall. Ink is a small lower pool behind the grille.
  burner.add(zlathe([[0,.039],[.044,.039],[.044,.040],[0,.040]],0,0,0,24),C.black,M.rubber);
  ink.add(zlathe([[0,.041],[.027,.041],[.027,.042],[0,.042]],0,-.008,0,20).rotateX(tilt).translate(0,by,bz));
  body.merge(burner.transform(g=>g.rotateX(tilt).translate(0,by,bz)));
  // Pressure gauge sits outside the left side of the neck.
  body.add(zcylGauge(),C.silver,M.metal);
  function zcylGauge(){return zlathe([[0,0],[.012,0],[.012,.008],[0,.008]],0,0,0,16).rotateX(-.8).translate(-.060,cy+.095,cz+.076);}
  body.add(sphere(.009,.002,.009,-.060,cy+.103,cz+.082,12,6),'#dadfd5',M.print);
  body.add(cyl(.001,[-.060,cy+.105,cz+.082],[-.064,cy+.105,cz+.085],6),'#b74e38',M.print);
  // A single continuous side crash loop per flank, with a dark lower sleeve.
  for(const sx of[-1,1]) {
    const x=sx*.089;
    body.add(pipe([[x,cy+.032,cz+.073],[x,cy+.020,cz-.060],[x,cy-.028,cz-.099],[x,cy-.078,cz-.071],[x,cy-.079,cz+.053]],.0055,32,7),C.silver,M.metal);
    body.add(cyl(.007,[x,cy-.079,cz-.032],[x,cy-.079,cz+.056],10),C.black,M.rubber);
    body.add(pipe([[x,cy+.031,cz-.063],[sx*.079,cy+.135,cz-.060],[sx*.065,cy+.154,cz-.055]],.005,18,7),C.silver,M.metal);
    body.add(pipe([[x,cy-.079,cz+.055],[sx*.091,cy-.057,cz+.124],[sx*.060,cy-.047,cz+.140]],.005,16,7),C.silver,M.metal);
    // Orange spring anchors and a real helical shock on each shoulder.
    const start=[x,cy+.029,cz+.011],end=[x,cy+.040,cz+.072];
    body.add(cyl(.005,start,end,10),C.black,M.rubber);
    for(const z of[cz+.011,cz+.072]) body.add(box(.017,.020,.008,x,cy+.034,z,.2,8,4),C.orange,M.gloss);
    const pts=[];for(let i=0;i<=48;i++){const t=i/48,a=t*Math.PI*10;pts.push([x+Math.cos(a)*.009,cy+.029+t*.011+Math.sin(a)*.009,cz+.016+t*.050]);}
    body.add(pipe(pts,.0018,56,5),C.silver,M.metal);
  }
  body.add(cyl(.009,[-.065,cy+.154,cz-.055],[.065,cy+.154,cz-.055],14),C.black,M.rubber);
  body.add(cyl(.005,[-.060,cy-.047,cz+.140],[.060,cy-.047,cz+.140],12),C.silver,M.metal);
  wireHandle(body,cz-dep/2-.006,C.silver);
  return rebuild(d,{body,ink,parts:{surface:inkDisc(.035,BY-.004+.06,BZ+.02)}});
}

function dreadWringer(d) {
  // Wmn_Slosher_Double: a low wide mop bucket — yellow open tub at the front, a grey metal wringer housing
  // at the back with two black rubber rollers and a long grey press lever hinged over it, a flat grey base
  // tray and two small rear wheels.
  const C = { yellow: '#e4d21c', grey: '#7d8086', greyD: '#5c5f65', black: '#1d1e22', tray: '#9a9da2' };
  const cy = BY - 0.03, cz = BZ + 0.03;
  const body = new Pieces(), ink = new Pieces();
  body.add(box(0.17, 0.02, 0.31, 0, cy - 0.06, cz, 0.3), C.tray, M.satin);                                       // base tray
  openBox(body, 0.15, 0.15, 0.17, 0.008, cy + 0.02, cz + 0.06, C.yellow);                                                 // yellow tub (front)
  body.add(box(0.15, 0.13, 0.12, 0, cy + 0.012, cz - 0.085, 0.25), C.grey, M.satin);                             // wringer housing (back)
  for (const z of [-0.06, -0.025]) body.add(cyl(0.018, [-0.065, cy + 0.09, cz + z], [0.065, cy + 0.09, cz + z], 16), C.black, M.rubber); // rollers
  for (const sx of [-1, 1]) body.add(box(0.012, 0.05, 0.08, sx * 0.072, cy + 0.08, cz - 0.045, 0.3), C.greyD, M.satin);         // roller cheeks
  // press lever: two grey bars from the back hinge rising over the tub, joined by a cross bar
  for (const sx of [-1, 1]) body.add(pipe([[sx * 0.06, cy + 0.09, cz - 0.13], [sx * 0.06, cy + 0.135, cz - 0.04], [sx * 0.055, cy + 0.12, cz + 0.08]], 0.007, 20, 6), C.greyD, M.satin);
  body.add(cyl(0.009, [-0.06, cy + 0.12, cz + 0.08], [0.06, cy + 0.12, cz + 0.08], 12), C.greyD, M.satin);
  for (const sx of [-1, 1]) body.add(cyl(0.016, [sx * 0.075, cy - 0.06, cz - 0.13], [sx * 0.09, cy - 0.06, cz - 0.13], 14), C.black, M.rubber); // wheels
  wireHandle(body, cz - 0.145, C.greyD);
  ink.add(box(0.13, 0.08, 0.15, 0, cy - 0.005, cz + 0.06, 0.2));                                                  // ink in the tub
  return rebuild(d, { body, ink, parts: { surface: inkRect(0.12, 0.13, cy + 0.035, cz + 0.06) } });
}
const BUILD3D = { 's3-slosher-diffusion': triSlosher, 's3-slosher-launcher': slosherMachine, 's3-slosher-bathtub': bloblobber,
  's3-slosher-washtub': explosher, 's3-slosher-double': dreadWringer };

/** Builds one slosher on the native slosher def `d`: silhouette body, pitcher handle, ink surface and lever. */
function model(d, c) {
  const pts = OUTLINE[c.outline], P = px(c.o[0], c.o[1], c.s);
  const body = new Pieces();
  body.add(slab(pts.map(([x, y]) => P(x, y)), c.thick, 0, 0.004), c.color, c.mat);
  body.add(box(0.0236, 0.1, 0.0276, 0, 0, 0, 0.5, 12, 8), c.handle, M.rubber);   // pitcher handle at the origin
  const [z, y] = P(c.rim, topY(pts, c.rim));                                       // ink level on the rim above the opening
  // The disc goes through Pieces so it carries the colour/surface attributes finishParts merges on.
  const disc = new Pieces().add(sphere(c.R, 0.0015, c.R, 0, y + 0.002, z, 24, 6), '#ffffff', M.satin);
  const surface = part(disc, [0, y + 0.002, z], 'ink');
  // The native muzzle socket is kept: it is the real projectile origin, and the nozzle position is unverified.
  return rebuild(d, {
    body, ink: new Pieces(), keepParts: ['lever'],
    parts: { surface },
  });
}

// The legacy Slosher keeps its reference model: its verified drawn-fill drain and indexed handle
// regressions (weapon-detail-motion tests) depend on that bucket's inner fill and handles.
export const MODELS = Object.fromEntries(Object.entries(CFG).filter(([id]) => id !== 'slosher').map(([id, c]) => [id, {
  sourceModel: id === 'slosher' ? 'Wmn_Slosher_StrongT'
    : id === 's3-slosher-diffusion' ? 'Wmn_Slosher_Diffusion'
    : id === 's3-slosher-launcher' ? 'Wmn_Slosher_Launcher'
    : id === 's3-slosher-bathtub' ? 'Wmn_Slosher_Bathtub'
    : id === 's3-slosher-washtub' ? 'Wmn_Slosher_Washtub' : 'Wmn_Slosher_Double',
  build: d => (BUILD3D[id] || (dd => model(dd, c)))(d),
}]));
