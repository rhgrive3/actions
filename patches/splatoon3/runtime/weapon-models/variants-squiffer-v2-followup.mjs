// S3 New Squiffer geometry and color-role correction, variant-only.
// Official reference manifest: ../../reference/weapon-variant-new-squiffer-v2.json.
// The adopted Classic Squiffer builder and native gameplay remain unchanged.
import { THREE, Pieces, M, V, box, sphere, zlathe, ylathe, zcyl, ycyl, xcyl, cyl, ring, pipe, slab, smoothOutline, pistolGrip, gripSpec,
  part, rebuild, glowGeometry, sweep, GRIP_PISTOL, PISTOL_AXIS } from './kit.mjs';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Reference pixel → weapon space: (gx, gy) = handle axis point in the levelled frame, s = m/px.
const px = (gx, gy, s) => (x, y) => [(x - gx) * s, (gy - y) * s];
const outline = (P, pts) => pts.map(([x, y]) => P(x, y));
/** Weapon-space point [0, y, z] on the centre plane for reference pixel (x, y). */
const piv = (P, x, y, X = 0) => { const [z, yy] = P(x, y); return [X, yy, z]; };
// Lamp channels keep the native look (character-weapons.js buildCharger) so animateWeapon can drive them.
const LENS_LAMP = { color: '#0b0f16', emissive: '#ffffff', intensity: 0.2, roughness: 0.06 };
const EYE_LAMP = { color: '#0b0f16', emissive: '#ffffff', intensity: 0.05, roughness: 0.06 };
const PORT_LAMP = { color: '#1b1e25', emissive: '#ffffff', intensity: 0, roughness: 0.5 };

/** Muzzle heat ring (native `ports` channel lights on release) just inside the nozzle exit. */
function ports(z, y, r) {
  const p = new Pieces().add(zlathe([[r * 0.45, z - 0.004], [r, z - 0.004], [r, z], [r * 0.45, z]], 0, y, 0, 16), '#1b1e25', M.satin);
  return part(p, [0, y, z], 'lamp', PORT_LAMP);
}
import { MODELS as CHARGERS } from './chargers.mjs';

const NEW_SQUIFF = {blue:'#789780',white:'#b6c9cd',grey:'#8b9291',brown:'#79574a',dark:'#202626'};
function newSquiffer(d) {
  const C = NEW_SQUIFF, s = 0.00105, P = px(486, 446, s), Y = (446 - 398) * s, H = (x, y, X = 0) => piv(P, x, y, X);
  const body = new Pieces(), ink = new Pieces();
  // Curved visible shell around the unchanged native hand axis. This replaces
  // the short rectangular-looking inherited grip, not the character's anchor.
  const gripContour=[[480,420],[502,430],[500,445],[491,455],[481,474],
    [474,490],[461,491],[452,478],[457,459],[470,444],[471,431]];
  body.add(slab(smoothOutline(outline(P,gripContour),48),.027,0,.007),C.white,M.gloss);
  // The S3 New bottle is flattened and tapered, with a grey fixed shell.
  // Official Feb 2024 rotation: broad planar sides, narrow rounded end, no
  // rotationally symmetric tank. Dimensions remain procedural estimates.
  const [b0z,b0y]=P(214,316),pitch=Math.atan2(79,186),bottle=new Pieces();
  const shape=[[0,-.047],[0,.047],[.012,.057],[.035,.055],[.118,.031],
    [.134,.038],[.15,.032],[.169,.017],[.188,.017],[.188,-.017],
    [.164,-.025],[.14,-.038],[.035,-.055],[.012,-.057]];
  bottle.add(slab(shape,.046,0,.006),C.grey,M.satin);
  // Neck seam and slim moulding around the flattened back. The original
  // Classic's three full cylindrical rings would protrude through this shape.
  bottle.add(zcyl(.019,.168,.19,0,0,18),C.grey,M.satin);
  bottle.add(slab([[.003,-.045],[.003,.045],[.013,.052],[.024,.05],
    [.024,-.05],[.013,-.052]],.049,0,.003),'#676d70',M.satin);
  for(const side of [-1,1]) {
    const x=side*.0237;
    // A large dark bordered label and outlined abstract white strokes occupy
    // the back half. These are procedural marks, not copied retail lettering.
    bottle.add(slab([[.022,-.04],[.022,.04],[.085,.024],[.086,-.043]],.001,x,.0001),'#d5d9d8',M.print);
    bottle.add(slab([[.026,-.036],[.026,.035],[.081,.021],[.082,-.038]],.001,x+side*.0006,.0001),'#303738',M.print);
    for(let j=0;j<3;j++){
      const z=.034+j*.014,y=.019-j*.004;
      bottle.add(slab([[z,y],[z+.009,y],[z+.009,y-.005],[z+.003,y-.005],
        [z+.003,y-.016],[z+.011,y-.016],[z+.011,y-.021],[z,y-.021]],.001,x+side*.0012,0),'#e1e3df',M.print);
    }
    // Starburst sticker straddles the forward shoulder on both sides in the
    // official rotating source. It is not a generic rectangle.
    const star=(r)=>Array.from({length:24},(_,i)=>{
      const a=i*Math.PI/12,k=i%2?.67:1;
      return [.128+Math.cos(a)*r*k, -.002+Math.sin(a)*r*k];
    });
    bottle.add(slab(star(.034),.001,x+side*.0019,0),'#f2d24b',M.print);
    bottle.add(slab(star(.028),.001,x+side*.0025,0),'#ce392b',M.print);
    bottle.add(box(.001,.012,.046,x+side*.0032,-.002,.128,.05,4,4),'#202627',M.print);
    for(let j=0;j<6;j++) bottle.add(box(.001,.006,.0025,x+side*.0038,-.001+(j%2)*.001,.11+j*.006,.05,4,4),'#f2f0df',M.print);
  }
  body.merge(bottle.transform(g=>g.rotateX(pitch).translate(0,b0y,b0z)));
  // ribbed grey spout and white collar into the receiver
  body.add(cyl(0.014, H(350, 372), H(412, 400), 14), C.grey, M.metal);
  for (let k = 0; k < 4; k++) { const u = 0.15 + k * 0.2, a = H(350 + 62 * u, 372 + 28 * u); body.add(cyl(0.0165, a, H(352 + 62 * u, 373 + 28 * u), 14), C.grey, M.metal); }
  ink.add(cyl(0.018, H(400, 395), H(416, 402), 16), '#ffffff', M.gloss);
  // Rounded shoulder and tapering keel observed in the 1812px official
  // render. V1 inherited a long parallel-sided slab that hid the grip root.
  const receiverContour=[[414,390],[436,378],[480,377],[503,385],[522,405],
    [552,421],[600,431],[650,429],[680,425],[708,421],[718,429],
    [680,437],[638,444],[604,452],[576,456],[554,440],[528,433],
    [500,422],[470,415],[440,415],[420,409]];
  body.add(slab(smoothOutline(outline(P,receiverContour),64),.033,0,.008),C.blue,M.gloss);
  const bar = (pts) => body.add(pipe(pts.map(([x, y]) => H(x, y)), 0.0048, 60, 6).scale(1.5, 1, 1), C.blue, M.gloss);
  bar([[543, 344], [550, 358], [566, 367], [700, 369], [900, 368], [938, 362], [958, 351], [980, 359], [1047, 366], [1120, 371]]);
  bar([[1120, 371], [1104, 381], [1068, 387], [1036, 395], [1000, 406], [966, 413], [935, 422], [900, 433], [868, 446], [845, 455], [818, 451], [770, 438], [718, 429]]);
  // ink rod barrel, white clips, leather strap, white muzzle block
  const [rz0] = P(416, 0), [rz1] = P(1090, 0), [nz] = P(1129, 0);
  body.add(zcyl(0.0068, rz0, rz1, 0, Y, 14), C.white, M.gloss);
  for (const x of [690, 868]) {
    const [z] = P(x, 0);
    ink.add(box(0.012, (398 - 368) * s + 0.01, 0.016, 0, Y + (398 - 368) * s / 2, z, 0.3), C.white, M.gloss);
    ink.add(zcyl(0.011, z - 0.009, z + 0.009, 0, Y, 16), C.white, M.gloss);
  }
  { const [z] = P(731, 0); body.add(zcyl(0.0105, z - 0.008, z + 0.008, 0, Y, 16), C.brown, M.satin); body.add(box(0.006, 0.026, 0.016, -0.009, Y - 0.012, z, 0.3), C.brown, M.satin); }
  ink.add(slab(outline(P, [[1088, 386], [1122, 386], [1129, 392], [1129, 420], [1122, 424], [1088, 424]]), 0.03, 0, 0.005), C.white, M.gloss);
  body.add(zlathe([[0, nz - 0.002], [0.0065, nz - 0.002], [0.0065, nz + 0.0008], [0, nz + 0.0008]], 0, Y, 0, 14), C.dark, M.satin);
  const trig = new Pieces().add(slab(outline(P, [[523, 430], [538, 430], [541, 458], [533, 462], [526, 446]]), 0.007, 0, 0.002), C.white, M.gloss);
  // charge coil: slim bands round the rod between the receiver and the muzzle block
  const g = new Pieces();
  for (let k = 0; k < 8; k++) { const [z] = P(640 + k * 55, 0); g.add(zcyl(0.0074, z - 0.007, z + 0.007, 0, Y, 12), '#ffffff', M.led); }
  return rebuild(d, {
    body, ink, glow: glowGeometry(g, P(630, 0)[0], P(1035, 0)[0]),
    parts: { trigger: part(trig, H(523, 430), 'ink'), ports: ports(nz - 0.001, Y, 0.0065) },
    gripL: gripSpec(H(640, 424), [0, 0, 1], [0.75, -0.62, -0.1]),
    muzzle: [0, Y, nz + 0.002],
  });
}

const base=CHARGERS['s3-charger-quick'];
export const FOLLOWUP_MODELS=Object.freeze({Charger_Quick_01:Object.freeze({
  ...base,sourceRow:'Charger_Quick_01',baseId:'s3-charger-quick',name:'New Squiffer',
  sourceUrl:'https://splatoonwiki.org/wiki/File:S3_New_Squiffer_Promotional_3D_Render.png',
  build:newSquiffer,
})});
