// Slosher family models (Splatoon 3 Ver.11.3.0 main weapons): Slosher (Bucket), Tri-Slosher, Sloshing Machine,
// Bloblobber, Explosher, Dread Wringer. Each body is the side silhouette of the official 3D render (400 px,
// Inkipedia "S3 <Name> 3D"), traced from its alpha channel and extruded across X. The ink surface is a flat disc
// lying on the silhouette's top edge above the opening (kept level by animateWeapon), and the native pitcher
// handle, its thumb lever and the native right-hand grip are kept at the origin. Scale is an estimate (see the
// reference doc). Everything is procedural geometry.
import { GRIP_HOLE_L, GRIP_HOLE_R } from '../../../../src/game/character-weapons.js';
import { THREE, Pieces, M, V, box, sphere, slab, part, rebuild, pipe, pipeR, cyl, ring, zlathe, ylathe, rotateAbout, sweep } from './kit.mjs';

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
  // Wmn_Slosher_Washtub. Rebuilt from all stored turntable quadrants, not a front-facing can decal.
  // The cast can has a sloped shoulder, real lower slots, a rear box and a separate rectangular-section cage.
  // Reference display tilt is handled by the review camera; gameplay hand and launch frames are unchanged.
  const C={olive:'#59632f',ridge:'#69783a',darkOlive:'#435128',brass:'#ac8c48',brassEdge:'#d1b76e',silver:'#c2cbcf',steel:'#58646b',black:'#242b31',orange:'#f07931',panel:'#343943'};
  const body=new Pieces(),ink=new Pieces(),cy=BY-.004,cz=BZ+.010;
  const beam=(pts,r=.006,seg=24)=>{const g=sweep(pts.map(p=>V(...p)),{seg,radial:4,capSteps:1,radius:()=>r,flat:.75,outward:(_p,out)=>out.set(1,0,0),section:(c,s)=>[c-s,c+s]}).geo.toNonIndexed();g.computeVertexNormals();return g;};
  const outline=[[cz-.096,cy-.071],[cz-.094,cy+.066],[cz-.079,cy+.089],[cz+.042,cy+.091],[cz+.085,cy+.058],[cz+.111,cy+.014],[cz+.106,cy-.071],[cz+.086,cy-.080],[cz-.075,cy-.080]];
  body.add(slab(outline,.147,0,.008),C.olive,M.satin);
  // Pressed broad faces follow the shoulder, with four chamfered arms around a small centre diamond.
  for(const sx of[-1,1]){
    const x=sx*.073;
    const panel=[[cz-.075,cy-.056],[cz-.075,cy+.047],[cz-.058,cy+.065],[cz+.031,cy+.067],[cz+.077,cy+.031],[cz+.083,cy-.051],[cz+.063,cy-.064],[cz-.058,cy-.064]];
    body.add(slab(panel,.002,x,.0007),C.darkOlive,M.satin);
    body.add(slab(panel.map(([z,y])=>[cz+(z-cz)*.94,cy+(y-cy)*.90]),.002,x+sx*.0018,.0007),C.olive,M.satin);
    for(const [y,z,yy,zz]of[[cy-.046,cz-.056,cy-.010,cz-.014],[cy+.047,cz-.052,cy+.006,cz-.009],[cy-.046,cz+.064,cy-.009,cz+.014],[cy+.039,cz+.052,cy+.006,cz+.011]])body.add(cyl(.0022,[x+sx*.004,y,z],[x+sx*.004,yy,zz],8),C.ridge,M.satin);
    body.add(slab([[cz-.013,cy],[cz,cy+.013],[cz+.013,cy],[cz,cy-.013]],.003,x+sx*.004,.0006),C.ridge,M.satin);
    // Two genuine lower handle slots. They are openings between the cast body and bottom runner.
    body.add(box(.014,.011,.172,sx*.059,cy-.099,cz+.002,.23,12,4),C.olive,M.satin);
    for(const z of[cz-.077,cz+.080])body.add(box(.022,.023,.019,sx*.059,cy-.088,z,.3,8,6),C.olive,M.satin);
  }
  // Pale stencilled side motif, traced as four coarse visible glyph silhouettes; no external texture.
  const glyphs=[[[0,0],[6,0],[6,2],[4,2],[4,4],[6,4],[6,7],[0,7],[0,5],[3,5],[3,4],[0,4]],[[0,0],[2,0],[2,3],[5,3],[5,0],[7,0],[7,7],[5,7],[5,5],[2,5],[2,7],[0,7]],[[0,0],[7,0],[7,2],[4,2],[4,4],[7,4],[7,7],[0,7],[0,5],[2,5],[2,3],[0,3]],[[0,0],[7,0],[7,2],[2,2],[2,4],[6,4],[6,6],[2,6],[2,7],[0,7]]];
  for(const sx of[-1,1])for(let i=0;i<glyphs.length;i++)body.add(slab(glyphs[i].map(([z,y])=>[cz+.065+i*.002+(z-3.5)*.0018,cy+.069-i*.017-y*.0018]),.0007,sx*.0775,0),'#b4baa0',M.print);
  // Rear electronics is shorter than the tank, with a bevelled perimeter, warning plate and ventilation slots.
  body.add(box(.119,.133,.032,0,cy-.001,cz-.103,.23,14,8),C.black,M.satin);
  body.add(box(.109,.124,.017,0,cy-.001,cz-.120,.2,12,8),C.panel,M.satin);
  body.add(box(.038,.045,.0018,-.027,cy+.007,cz-.130,.15,8,4),'#d7d5c7',M.print);
  body.add(box(.034,.009,.002,-.027,cy+.025,cz-.131,.15,8,4),'#ab3735',M.print);
  body.add(slab([[-.020,-.009],[-.006,.015],[.008,-.009]],.002,0,.0001).rotateY(Math.PI/2).translate(-.021,cy,cz-.132),'#d5bd4e',M.print);
  for(let i=0;i<6;i++)body.add(box(.033,.0027,.002,.023,cy+.027-i*.0095,cz-.131,.1,8,4),C.black,M.satin);
  // Cast rear carry aperture and large ribbed filler cap on the flat part of the shoulder.
  for(const x of[-.044,.044])body.add(box(.010,.031,.016,x,cy+.100,cz-.073,.2,8,6),C.olive,M.satin);
  body.add(box(.096,.010,.017,0,cy+.119,cz-.073,.2,12,4),C.olive,M.satin);
  body.add(ylathe([[0,.090],[.017,.090],[.022,.096],[.023,.109],[.020,.116],[0,.116]],-.026,cy,cz-.004,20),C.olive,M.satin);
  for(let i=0;i<10;i++){const a=i*Math.PI/5;body.add(box(.004,.012,.004,-.026+Math.cos(a)*.021,cy+.106,cz-.004+Math.sin(a)*.021,.16,6,4),C.darkOlive,M.satin);}
  // Burner bolts onto the sloped shoulder. The silver yoke is open-sided; bronze remains visible within it.
  // Angle-only candidate: keep the fe242 lip-plane centre fixed while pivoting the burner.
  // The -0.70 rad trial is not inferred directly from a projected 2D reference angle.
  const tilt=-.70,lipDepth=.076*.72;
  const lipY=cy+.061-Math.sin(-.48)*lipDepth,lipZ=cz+.091+Math.cos(-.48)*lipDepth;
  const by=lipY+Math.sin(tilt)*lipDepth,bz=lipZ-Math.cos(tilt)*lipDepth,burner=new Pieces();
  burner.add(box(.120,.109,.005,0,0,-.018,.38,12,6),C.silver,M.metal);
  // Thin mounting plate plus annular socket. The old broad dark square obscured this round junction.
  burner.add(zlathe([[.043,-.020],[.058,-.020],[.061,-.014],[.060,-.009],[.051,-.008],[.043,-.008]],0,0,0,24),C.silver,M.metal);
  burner.add(ring(.055,.0023,0,0,-.006,'z',4,24),C.steel,M.satin);
  burner.add(zlathe([[.040,-.014],[.041,.012],[.051,.064],[.058,.076],[.054,.078],[.048,.055],[.038,-.014],[.040,-.014]],0,0,0,24),C.brass,M.metal);
  burner.add(zlathe([[.043,-.008],[.049,-.008],[.050,.038],[.053,.055],[.051,.060],[.047,.041],[.040,-.004],[.043,-.008]],0,0,0,24),C.black,M.satin);
  burner.add(ring(.056,.0021,0,0,.076,'z',5,30),C.brassEdge,M.metal);
  // Dark burner body and the four machined silver retaining rails are separate volumes.
  for(const sx of[-1,1]){
    for(const sy of[-1,1])burner.add(box(.009,.010,.069,sx*.040,sy*.034,.023,.22,10,4),C.silver,M.metal);
    for(const y of[-.034,.034])burner.add(zlathe([[0,.047],[.004,.047],[.004,.052],[0,.052]],sx*.050,y,0,10),C.steel,M.satin);
    // Orange spring wire, elbow and brass gas fitting are anchored to the yoke rather than floating rings.
    burner.add(pipe([[sx*.044,-.025,-.009],[sx*.052,-.025,.001],[sx*.053,-.018,.018],[sx*.054,.006,.040]],.0017,16,5),C.orange,M.gloss);
    burner.add(box(.012,.010,.013,sx*.043,-.027,-.002,.12,8,4),C.brassEdge,M.metal);
  }
  for(const y of[-.033,0,.033]){const half=Math.sqrt(.054*.054-y*y);burner.add(box(half*2,.0035,.008,0,y,.078,.12,10,4),C.brassEdge,M.metal);}
  burner.add(zlathe([[0,.037],[.043,.037],[.043,.039],[0,.039]],0,0,0,24),'#453c26',M.satin);
  ink.add(sphere(.027,.009,.0015,0,-.016,.041,18,8).scale(1,1,.72).rotateX(tilt).translate(0,by,bz));
  body.merge(burner.transform(g=>g.scale(1,1,.72).rotateX(tilt).translate(0,by,bz)));
  // Gauge has a bevelled body, pale dial, red needle and two short connector stems.
  body.add(cyl(.004,[-.048,cy+.081,cz+.054],[-.062,cy+.096,cz+.066],10),C.silver,M.metal);
  body.add(zlathe([[0,0],[.013,0],[.014,.004],[.014,.010],[.011,.012],[0,.012]],0,0,0,20).rotateX(-.65).translate(-.064,cy+.097,cz+.066),C.silver,M.metal);
  body.add(zlathe([[0,.012],[.010,.012],[.010,.013],[0,.013]],0,0,0,18).rotateX(-.65).translate(-.064,cy+.097,cz+.066),'#e0e3d9',M.print);
  body.add(cyl(.001,[-.064,cy+.105,cz+.077],[-.068,cy+.109,cz+.076],6),'#b84032',M.print);
  // Brushed rectangular-section crash frame: U side loops, reinforced front bumper and upright carry hoop.
  for(const sx of[-1,1]){
    const x=sx*.088;
    body.add(beam([[x,cy+.024,cz+.068],[x,cy+.030,cz-.065],[x,cy+.013,cz-.094],[x,cy-.041,cz-.094],[x,cy-.064,cz-.071],[x,cy-.064,cz+.070]],.0064,34),C.silver,M.metal);
    body.add(cyl(.0077,[x,cy-.064,cz-.037],[x,cy-.064,cz+.064],12),C.black,M.rubber);
    body.add(beam([[x,cy+.028,cz-.063],[sx*.079,cy+.125,cz-.071],[sx*.066,cy+.144,cz-.064]],.0056,20),C.silver,M.metal);
    body.add(beam([[x,cy-.064,cz+.069],[sx*.095,cy-.050,cz+.124],[sx*.082,cy-.042,cz+.139]],.0058,18),C.silver,M.metal);
    for(const z of[cz-.064,cz+.061]){body.add(cyl(.006,[sx*.087,cy+.024,z],[sx*.099,cy+.024,z],12),C.steel,M.satin);body.add(cyl(.0025,[sx*.099,cy+.024,z],[sx*.101,cy+.024,z],8),C.black,M.satin);}
    // Diagonal external shock, measured from the side turntable view. Both orange anchors meet the frame.
    const low=[x,cy+.023,cz+.004],high=[x,cy+.063,cz+.072];body.add(cyl(.0047,low,high,10),C.black,M.rubber);
    for(const p of[low,high])body.add(box(.017,.018,.009,...p,.16,8,4).rotateX(0),C.orange,M.gloss);
    const pts=[];for(let i=0;i<=48;i++){const t=i/48,a=t*Math.PI*10;pts.push([x+Math.cos(a)*.0085,cy+.028+t*.031+Math.sin(a)*.0073,cz+.012+t*.052-Math.sin(a)*.0044]);}body.add(pipe(pts,.0017,56,5),C.steel,M.satin);
  }
  body.add(cyl(.009,[-.066,cy+.144,cz-.064],[.066,cy+.144,cz-.064],14),C.black,M.rubber);
  body.add(beam([[-.082,cy-.042,cz+.139],[.082,cy-.042,cz+.139]],.0058,6),C.silver,M.metal);
  // The native hand grip is retained at the origin; it is not the high reference carry handle.
  wireHandle(body,cz-.107,C.black);
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
// ------------------------------------------------------------------------------------- Slosher (Bucket)
// Wmn_Slosher_StrongT (Splatoon 3): a black round pail lying on its side, its open mouth cut on a slant so it
// faces forward and up; a glossy lavender frame — a side plate under each flank that rises along the lower
// half of the mouth into an upright arm, a band round the lower lip, a rear U-frame behind the base — a black
// top handle with chrome elbows over the mouth, and a gold coil-over shock on each flank between the arm
// and the lower rail. Proportions from the official turntable (S3 Slosher Deco model rotating.mp4: front
// t = 2 s, sides t = 5 / 11 s, back t = 8 s; Deco is the same shape) and colours from the base render
// (refs/slosher.3d.png). Scale: pail Ø ≈ 0.19 m (image-derived). The native grips stay: the right fist on a
// black upright grip in the rear U-frame (INKWAVE keeps the native pitcher-grip hold; the real kid holds the
// top handle — recorded as a difference), the left hand on a rubber bar under the pail, the native muzzle
// just inside the upper lip.
const BUCKET = { yc: 0.03, R: 0.094, wall: 0.007, zb: 0.035, top: 0.235, bottom: 0.335, fill: 0.04 };
/** Mouth plane: z of the slanted lip at height y (upper lip z = top, lower lip z = bottom). */
const lipZ = (B, y) => B.top + ((B.yc + B.R - y) / (2 * B.R)) * (B.bottom - B.top);
/** Lying pail shell with a slanted mouth: outer + inner wall, base, floor and the lip between them. */
function pailShell(B, seg = 36, rows = 5) {
  const pos = [], idx = [], Ri = B.R - B.wall, ring = (r, z0, lip) => {
    const base = pos.length / 3;
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2, x = Math.cos(a) * r, y = B.yc + Math.sin(a) * r;
      pos.push(x, y, lip ? lipZ(B, y) - (r < B.R ? 0.002 : 0) : z0);
    }
    return base;
  };
  const strip = (r, z0, inward) => {
    const rs = [];
    for (let i = 0; i <= rows; i++) {
      const base = pos.length / 3;
      for (let j = 0; j < seg; j++) {
        const a = (j / seg) * Math.PI * 2, x = Math.cos(a) * r, y = B.yc + Math.sin(a) * r;
        pos.push(x, y, z0 + (i / rows) * (lipZ(B, y) - z0));
      }
      rs.push(base);
    }
    for (let i = 0; i < rows; i++) for (let j = 0; j < seg; j++) {
      const j1 = (j + 1) % seg, a = rs[i] + j, b = rs[i] + j1, c = rs[i + 1] + j, d = rs[i + 1] + j1;
      if (inward) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
    return rs;
  };
  const outer = strip(B.R, B.zb, false), inner = strip(Ri, B.zb + B.wall, true);
  const o = outer[rows], n = inner[rows];
  for (let j = 0; j < seg; j++) { const j1 = (j + 1) % seg; idx.push(o + j, o + j1, n + j, o + j1, n + j1, n + j); }
  for (const [r0, z, face] of [[outer[0], B.zb, -1], [inner[0], B.zb + B.wall, 1]]) {
    const c = pos.length / 3; pos.push(0, B.yc, z);
    for (let j = 0; j < seg; j++) { const j1 = (j + 1) % seg; if (face < 0) idx.push(c, r0 + j1, r0 + j); else idx.push(c, r0 + j, r0 + j1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** Ink pooled in the lower part of the lying pail up to y = B.fill, its front cut by the mouth plane. */
function pailFill(B) {
  const Ri = B.R - B.wall - 0.0015, h = B.fill - B.yc, a = Math.asin(Math.max(-1, Math.min(1, h / Ri))), sh = new THREE.Shape();
  const n = 20, a0 = Math.PI - a, a1 = 2 * Math.PI + a;
  for (let k = 0; k <= n; k++) { const t = a0 + (a1 - a0) * (k / n), x = Math.cos(t) * Ri, y = B.yc + Math.sin(t) * Ri; k ? sh.lineTo(x, y) : sh.moveTo(x, y); }
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, curveSegments: 4 }), p = g.attributes.position;
  const z0 = B.zb + B.wall + 0.001;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, z0 + p.getZ(i) * (lipZ(B, y) - 0.004 - z0)); }
  g.computeVertexNormals(); return g;
}
/** Gold coil spring over a chrome damper rod between points a (upper) and b (lower), with black eyes. */
function shock(p, a, b, C) {
  const A = V(...a), Bv = V(...b), ax = Bv.clone().sub(A), L = ax.length(); ax.normalize();
  const u = Math.abs(ax.x) < 0.9 ? V(1, 0, 0) : V(0, 1, 0), e1 = u.clone().cross(ax).normalize(), e2 = ax.clone().cross(e1);
  const coil = [], turns = 7, r = 0.016;
  for (let k = 0; k <= turns * 14; k++) {
    const t = k / (turns * 14), w = t * turns * Math.PI * 2, s = 0.18 + 0.64 * t;
    coil.push(A.clone().addScaledVector(ax, s * L).addScaledVector(e1, Math.cos(w) * r).addScaledVector(e2, Math.sin(w) * r));
  }
  p.add(pipe(coil, 0.0032, turns * 14, 5), C.gold, M.metal);
  p.add(cyl(0.0065, a, b, 12), C.chrome, M.metal);
  for (const [s, rr] of [[0.15, 0.013], [0.86, 0.011]]) { const c = A.clone().addScaledVector(ax, s * L); p.add(cyl(rr, c.clone().addScaledVector(ax, -0.008).toArray(), c.clone().addScaledVector(ax, 0.008).toArray(), 14), C.black, M.satin); }
  for (const q of [A, Bv]) p.add(sphere(0.009, 0.009, 0.009, q.x, q.y, q.z, 12, 8), C.black, M.satin);
}
function bucketSlosher(d) {
  const B = BUCKET, C = { pail: '#1d1e22', inner: '#2a2b30', frame: '#a07fd2', frameD: '#7653b0', black: '#18191d', chrome: '#c9ccd0', gold: '#c7ae63', white: '#eceaf0' };
  const body = new Pieces(), ink = new Pieces();
  body.add(pailShell(B), C.pail, M.gloss);
  // rolled lip round the slanted mouth and the squid-wave logo on the inner upper wall
  const lip = [];
  for (let k = 0; k <= 40; k++) { const a = (k / 40) * Math.PI * 2, r = B.R - B.wall * 0.5, y = B.yc + Math.sin(a) * r; lip.push([Math.cos(a) * r, y, lipZ(B, y)]); }
  body.add(pipe(lip, 0.0055, 72, 6), C.pail, M.gloss);
  body.add(box(0.05, 0.0015, 0.04, 0, B.yc + B.R - B.wall - 0.0012, B.top - 0.05, 0.3), C.white, M.print);
  // lavender side plates: lower rail under each flank rising along the lower lip into the upright arm
  const X = B.R + 0.012, plate = [[0.03, -0.118], [0.33, -0.118], [0.357, -0.1], [0.352, -0.076], [0.322, -0.03], [0.302, 0.012], [0.292, 0.09],
    [0.282, 0.17], [0.27, 0.222], [0.243, 0.232], [0.25, 0.19], [0.258, 0.1], [0.262, 0.03], [0.266, -0.012], [0.235, -0.055], [0.19, -0.07],
    [0.17, -0.05], [0.14, -0.05], [0.125, -0.074], [0.05, -0.076], [0.03, -0.092]];
  for (const sx of [-1, 1]) body.add(slab(plate, 0.016, sx * X, 0.004), C.frame, M.gloss);
  // band round the lower half of the lip, joining the plates
  const band = [];
  for (let k = 0; k <= 20; k++) { const a = Math.PI + (k / 20) * Math.PI, r = B.R + 0.008, y = B.yc + Math.sin(a) * r; band.push([Math.cos(a) * (X - 0.002), y, lipZ(B, y) - 0.014]); }
  body.add(pipe(band, 0.011, 40, 8), C.frame, M.gloss);
  // rear U-frame behind the base: two uprights and a top bar, a lower cross rail joining the side rails
  const UX = 0.066, UZ = 0.018, UT = 0.158;
  body.add(pipe([[-UX, -0.1, UZ + 0.01], [-UX, UT - 0.012, UZ], [-UX + 0.012, UT, UZ], [UX - 0.012, UT, UZ], [UX, UT - 0.012, UZ], [UX, -0.1, UZ + 0.01]], 0.0105, 60, 8), C.frame, M.gloss);
  body.add(box(2 * X, 0.026, 0.03, 0, -0.106, 0.04, 0.35), C.frameD, M.gloss);
  // black right-hand grip upright in the U-frame (native pitcher grip at the origin)
  body.add(cyl(0.0125, [0, -0.052, 0], [0, 0.052, 0], 16), C.black, M.rubber);
  for (let k = -3; k <= 3; k++) body.add(ring(0.0128, 0.0014, 0, k * 0.013, 0, 'y', 4, 16), C.black, M.rubber);
  body.add(pipe([[0, 0.05, 0], [0, 0.1, 0.006], [0, UT, UZ]], 0.008, 16, 6), C.frame, M.gloss);
  body.add(pipe([[0, -0.05, 0], [0, -0.085, 0.01], [0, -0.1, 0.03]], 0.008, 16, 6), C.frame, M.gloss);
  // left-hand rubber bar under the pail (native support grip) between the side rails
  body.add(cyl(0.0115, [-X, -0.088, 0.2], [X, -0.088, 0.2], 16), C.black, M.rubber);
  // top handle: black bar with chrome elbows down into the arms
  const HY = 0.246, HZ = 0.252;
  body.add(cyl(0.0125, [-X + 0.016, HY, HZ], [X - 0.016, HY, HZ], 16), C.black, M.rubber);
  for (const sx of [-1, 1]) body.add(pipe([[sx * (X - 0.02), HY, HZ], [sx * (X - 0.004), HY - 0.004, HZ], [sx * X, HY - 0.018, HZ + 0.004], [sx * X, HY - 0.03, HZ + 0.008]], 0.0085, 14, 8), C.chrome, M.metal);
  // coil-over shocks on the flanks, arm (upper, front) to the lower rail (rear)
  for (const sx of [-1, 1]) shock(body, [sx * (X + 0.02), 0.1, 0.24], [sx * (X + 0.02), -0.062, 0.15], C);
  ink.add(pailFill(B));
  const zs = B.zb + B.wall + 0.003, ze = lipZ(B, B.fill) - 0.006, w = 2 * Math.sqrt((B.R - B.wall) ** 2 - (B.fill - B.yc) ** 2) - 0.006;
  const surface = part(new Pieces().add(box(w, 0.003, ze - zs, 0, B.fill, (zs + ze) / 2, 0.22, 16, 4), '#ffffff', M.satin), [0, B.fill, (zs + ze) / 2], 'ink');
  const out = rebuild(d, { body, ink, parts: { surface } });
  // Carry grip (FAMILY_POSE): the right fist stays on the rear upright grip and the left hand reaches
  // across the body onto the top handle, overhand (official movie xnGkyA7kgWr 0.5-1.1 s at rest; owner
  // review 2026-10-18). The heave keeps the native under-bar support grip, so the attack is unchanged.
  // handZ: thumb side along the bar (toward the kid's right); handY: from the fist back to the wrist.
  out.s3CarryGrip = { L: { pos: V(0.085, HY, HZ), handZ: V(-1, 0, 0), handY: V(0.55, 0.35, -0.75) } };
  return out;
}

const BUILD3D = { 'slosher': bucketSlosher, 's3-slosher-diffusion': triSlosher, 's3-slosher-launcher': slosherMachine, 's3-slosher-bathtub': bloblobber,
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

// Free (left) arm while carrying a slosher at the right hip. The native run
// pumps the empty fist forward-in to chin height (elbow ~83 deg) on every
// step; with the bucket hanging one-handed that read as a hand raised to the
// mouth from every angle (owner review 2026-10-18). Keep a loose run swing:
// part of the shoulder swing and of the extra run elbow bend. INKWAVE
// calibration, not an extracted Splatoon 3 joint curve.
export const SLOSHER_FREE_ARM = Object.freeze({ swingKeep: 0.55, runBendKeep: 0.45 });
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
// Hand frame (wrist origin) in weapon space for a grip spec (as character-weapons handInWeapon).
const _m4 = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
function handFrame(grip, hole) {
  _y.copy(grip.handY).normalize(); _z.copy(grip.handZ).addScaledVector(_y, -grip.handZ.dot(_y)).normalize();
  _x.crossVectors(_y, _z).normalize();
  const quat = new THREE.Quaternion().setFromRotationMatrix(_m4.makeBasis(_x, _y, _z));
  return { pos: grip.pos.clone().sub(hole.clone().applyQuaternion(quat)), quat };
}
// Seconds the hands take to slide from the carry grips to the native heave grips once a slosh starts
// (well inside the 12F SwingLiftFrame windup, so the released wave leaves from the unchanged pose), and
// to slide back once the native recovery has settled.
export const SLOSHER_CARRY_GRIP = Object.freeze({ toAttack: 0.1, settle: 0.75, back: 0.3 });
/** Per-instance grips blended between the native heave grips (k = 0) and the carry grips (k = 1). */
function carryGrip(ch, dt, P, C) {
  const w = ch.weapon, base = w?.s3BaseDef || w?.def, cg = base?.s3CarryGrip;
  if (!cg || !w.off) return;
  if (!w.s3BaseDef) {
    w.s3BaseDef = base;
    w.def = Object.create(base, {
      handR: { value: { pos: base.handR.pos.clone(), quat: base.handR.quat.clone() }, writable: true },
      handL: { value: { pos: base.handL.pos.clone(), quat: base.handL.quat.clone() }, writable: true },
    });
    w.s3Grip = { k: 0, R: cg.R ? handFrame(cg.R, GRIP_HOLE_R) : null, L: cg.L ? handFrame(cg.L, GRIP_HOLE_L) : null, off: w.off.position.clone() };
  }
  const g = w.s3Grip, T = SLOSHER_CARRY_GRIP, since = ch.lastShot ?? 9, step = Math.min(0.1, Math.max(0, dt || 0));
  const carrying = ch.kidForm && !ch.dance && !ch.showcase && !(ch.wSub > 0.01) && !ch.bombHeld;
  if (!carrying) g.k = 0;
  else if (since < T.settle) g.k = Math.min(g.k, since >= T.toAttack - 1e-9 ? 0 : 1 - since / T.toAttack);
  else g.k = Math.min(1, g.k + step / T.back);
  const k = g.k * g.k * (3 - 2 * g.k), d = w.def;
  // Walking, the pail moves further out so the swinging right thigh passes inside it; at a full-tilt
  // walk the native run hold places it (owner review 2026-10-18: both hands stay on while moving).
  const gw = clamp01(ch.gaitW || 0), run = clamp01(ch.runW || 0);
  const H = ch.hold, walk = gw * (1 - run) * k;
  if (P && C && H?.walk && H.carry && walk > 1e-4) for (let i = 0; i < 3; i++) {
    P[C.ANC + i] += (H.walk.p[i] - H.carry.p[i]) * walk; P[C.ANCR + i] += (H.walk.r[i] - H.carry.r[i]) * walk;
  }
  if (g.L) { d.handL.pos.lerpVectors(base.handL.pos, g.L.pos, k); d.handL.quat.slerpQuaternions(base.handL.quat, g.L.quat, k); }
  if (g.R) {
    d.handR.pos.lerpVectors(base.handR.pos, g.R.pos, k); d.handR.quat.slerpQuaternions(base.handR.quat, g.R.quat, k);
    // The weapon hangs from the right fist: keep it at the same anchor by re-seating it in the hand.
    _m4.compose(d.handR.pos, d.handR.quat, _x.set(1, 1, 1)).invert().decompose(_y, w.off.quaternion, _z);
    w.off.position.copy(g.off).add(_y).sub(base.inHand.pos);
  }
}
/** Read-only view for regressions. */
export function slosherCarryGripSnapshot(ch) { return ch.weapon?.s3Grip ? { k: ch.weapon.s3Grip.k } : null; }
export function FAMILY_POSE(ch, dt, s, C) {
  carryGrip(ch, dt, ch.P, C);
  if (!C || !ch.kidForm || ch.dance || ch.showcase) return;
  const P = ch.P;
  // Only the gait swing the native layer added this frame: a support hand,
  // a thrown sub, the heave and its recovery own the left arm themselves.
  const free = (1 - clamp01(ch.wTwo || 0)) * (1 - clamp01(Math.max(P[C.IKL], P[C.LTW]))) *
    clamp01(((ch.lastShot ?? 9) - 0.35) / 0.3);
  const gw = clamp01(ch.gaitW || 0), rn = clamp01(ch.runW || 0), aL = ch.armL || 0;
  if (free <= 1e-4 || gw <= 1e-4) return;
  const k = SLOSHER_FREE_ARM, fwd = Math.max(0, -aL) * rn;
  P[C.UARML] -= (1 - k.swingKeep) * aL * free;
  P[C.UARML + 1] -= (1 - k.swingKeep) * 0.18 * fwd * free;
  P[C.FARML] += ((1 - k.runBendKeep) * 1.15 * rn * gw + (1 - k.swingKeep) * 0.4 * fwd) * free;
}

// Left-hand carry grips on each slosher's top handle (weapon space; the right fist keeps the native rear
// grip). Official movies at rest (owner review 2026-10-18), identified by the weapon's look: Tri-Slosher
// 1enjE6BlKzy (left hand on the yellow bail), Sloshing Machine b1dl7E3DXYr (on the top handle), Explosher
// 0zGjN9QDoNb, Dread Wringer OgdjmEejALb (on the front top). No Bloblobber movie was found; it follows
// the others on its front-left rim (no modelled top handle). handZ: thumb side; handY: fist to wrist.
const acrossBar = (x, y, z) => ({ pos: V(x, y, z), handZ: V(-1, 0, 0), handY: V(0.55, 0.35, -0.75) });
const CARRY_GRIP = {
  's3-slosher-diffusion': acrossBar(0.03, 0.217, 0.091),
  's3-slosher-launcher': { pos: V(0.012, 0.15, 0.19), handZ: V(0, 0, 1), handY: V(0.6, 0.5, -0.6) },
  's3-slosher-bathtub': { pos: V(0.063, 0.083, 0.273), handZ: V(-0.6, 0, 0.8), handY: V(0.6, 0.5, -0.6) },
  's3-slosher-washtub': acrossBar(0.03, 0.152, 0.094),
  's3-slosher-double': acrossBar(0.03, 0.102, 0.258),
};
// Two-handed carry placement per slosher (weapon-origin anchor at rest / walking / full-tilt walk), for
// the 1.6x family model scale. INKWAVE calibration: on the right side, searched for no leg or torso
// penetration with the left hand still on the handle (an anchor out of reach rests where the arms allow).
const CARRY_HOLD = {
  's3-slosher-diffusion': { carry: { p: [-0.3, 0.48, 0.1], r: [0, 0.2, 0] }, walk: { p: [-0.3, 0.64, 0], r: [0, -0.1, 0] }, run: { p: [-0.36, 0.56, -0.1], r: [0, -0.1, 0] } },
  's3-slosher-launcher': { carry: { p: [-0.3, 0.64, 0.1], r: [0, 0.2, 0] }, walk: { p: [-0.36, 0.64, -0.1], r: [0, -0.1, 0] }, run: { p: [-0.42, 0.72, -0.14], r: [0, -0.2, 0] } },
  's3-slosher-bathtub': { carry: { p: [-0.3, 0.48, 0.1], r: [0, 0.5, 0] }, walk: { p: [-0.42, 0.64, -0.1], r: [0, 0.2, 0] }, run: { p: [-0.48, 0.64, -0.1], r: [0, -0.1, 0] } },
  's3-slosher-washtub': { carry: { p: [-0.3, 0.48, 0.1], r: [0, 0.2, 0] }, walk: { p: [-0.3, 0.64, 0], r: [0, -0.1, 0] }, run: { p: [-0.36, 0.56, -0.1], r: [0, -0.1, 0] } },
  's3-slosher-double': { carry: { p: [-0.42, 0.64, -0.1], r: [0, 0.5, 0] }, walk: { p: [-0.48, 0.64, -0.1], r: [0, 0.2, 0] }, run: { p: [-0.42, 0.8, -0.14], r: [0, -0.2, 0] } },
};
export const MODELS = Object.fromEntries(Object.entries(CFG).map(([id, c]) => [id, {
  sourceModel: id === 'slosher' ? 'Wmn_Slosher_StrongT'
    : id === 's3-slosher-diffusion' ? 'Wmn_Slosher_Diffusion'
    : id === 's3-slosher-launcher' ? 'Wmn_Slosher_Launcher'
    : id === 's3-slosher-bathtub' ? 'Wmn_Slosher_Bathtub'
    : id === 's3-slosher-washtub' ? 'Wmn_Slosher_Washtub' : 'Wmn_Slosher_Double',
  build: d => {
    const out = (BUILD3D[id] || (dd => model(dd, c)))(d);
    if (CARRY_GRIP[id]) out.s3CarryGrip = { L: CARRY_GRIP[id] };
    return out;
  },
  ...(CARRY_HOLD[id] ? { nativeCarry: true, hold: { twoCarry: 1, ...CARRY_HOLD[id] } } : {}),
  // The Bucket's mouth faces forward (not up like the Wii U pitcher the source carry clips hold), so it keeps
  // the native data carry: the pail hangs level at the right side with its mouth to the front.
  // While sloshing, the native heave pitches the bucket ~1.5–1.95 rad down (tuned for an upward-facing pitcher
  // mouth). The Bucket's mouth already faces forward, so its aim tilts the mouth up 0.8 rad first: the ink
  // still leaves with the mouth to the front instead of pointing at the ground.
  // Carried in both hands (official movie xnGkyA7kgWr at rest; owner review 2026-10-18): the right fist
  // on the rear grip at the right hip, the pail out at the right side in front of the right leg with
  // its mouth to the front, the left hand across on the top handle. Placement is INKWAVE calibration
  // read from the movie by eye; walking with it is not in the official movies.
  ...(id === 'slosher' ? { nativeCarry: true, hold: { aim: { r: [-0.8, 0.05, 0] }, twoCarry: 1,
    carry: { p: [-0.48, 0.56, 0], r: [0.2, 0.5, 0] }, walk: { p: [-0.58, 0.72, -0.08], r: [0.2, 0.4, 0] }, run: { p: [-0.6, 0.74, -0.06], r: [0.2, 0.3, -0.25] } } } : {}),
}]));
