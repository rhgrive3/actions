// Shooter family models (Splatoon 3 Ver.11.3.0 main weapons). Shapes follow the
// official per-weapon 3D renders and the turntable videos on Inkipedia; scale is
// set by the pistol handle (11 cm), which every reference shows at the same
// hand size. Internal model names come from Leanny/splat3 ActorInfo (Fmdb).
import { Pieces, M, V, box, sphere, zlathe, zcyl, ring, pipe, slab, rotateAbout, pistolGrip, gripSpec,
  part, rebuild, TRIGGER_PIVOT } from './kit.mjs';

// Reference pixel → weapon space helper for a side render (muzzle right, 400 px frame).
// (gx, gy) = handle centre in the image, s = metres per pixel.
const px = (gx, gy, s) => (x, y) => [(x - gx) * s, (gy - y) * s];

function splattershot(d) {
  // Wmn_Shooter_Normal(+T, +B): purple pistol frame, ink tank lying along the
  // top with a blue screw cap at the back, yellow strap and carry loop, yellow
  // ribbed fore-end and a flared yellow nozzle with a blue tip.
  const C = { purple: '#3d2ba0', yellow: '#efbf2a', blue: '#2d63e0', black: '#1c1d22', steel: '#9aa0a8' };
  const s = 0.11 / 120, P = px(118, 265, s);
  const body = new Pieces(), ink = new Pieces(), can = new Pieces(), trig = pistolGrip(body, { color: C.purple, triggerColor: C.purple, guardColor: C.purple });
  // purple receiver over the grip (side outline from the render)
  body.add(slab([P(80, 200), P(205, 200), P(205, 222), P(185, 230), P(150, 232), P(120, 226), P(92, 222), P(80, 212)], 0.032, 0, 0.004), C.purple, M.satin);
  for (const sx of [-1, 1]) for (const [x, y] of [[106, 219], [176, 219]]) {
    const [z, yy] = P(x, y); body.add(sphere(0.0035, 0.0035, 0.002, sx * 0.0165, yy, z), C.steel, M.metal);
  }
  // ink tank (team colour, pulses per shot): capsule from the rear cap to the fore-end
  const [tz0] = P(52, 0), [tz1] = P(290, 0), [, ty] = P(0, 148), tr = 52 * s, tc = (tz0 + tz1) / 2;
  can.add(zlathe([[0, tz0], [tr * 0.55, tz0 + tr * 0.08], [tr * 0.86, tz0 + tr * 0.3], [tr, tz0 + tr * 0.7], [tr, tz1 - tr * 0.7], [tr * 0.86, tz1 - tr * 0.3], [tr * 0.55, tz1 - tr * 0.08], [0, tz1]], 0, ty, 0, 28));
  // blue ribbed screw cap pointing back and slightly up
  const cap = new Pieces();
  cap.add(zlathe([[0, -0.019], [0.012, -0.019], [0.021, 0.02], [0.023, 0.026], [0, 0.026]], 0, 0, 0, 16), C.blue, M.gloss);
  for (let k = 0; k < 4; k++) cap.add(ring(0.0145 + k * 0.0021, 0.0016, 0, 0, -0.012 + k * 0.009, 'z', 4, 18), C.blue, M.gloss);
  body.merge(cap.transform(g => g.rotateX(0.12).translate(0, ty + 0.002, tz0 - 0.012)));
  // yellow strap: carry loop standing up at the rear, band wrapping both flanks
  // flat carry loop standing on the tank's rear shoulder, leaning back
  body.merge(new Pieces().add(ring(0.021, 0.0042, 0, 0, 0, 'x', 6, 26), C.yellow, M.gloss)
    .transform(g => g.scale(1, 1.25, 0.8).rotateX(-0.45).translate(0, ty + tr + 0.004, tz0 + 0.012)));
  for (const sx of [-1, 1]) {
    const side = []; for (let k = 0; k <= 12; k++) {
      const u = k / 12, z = tz0 + 0.05 + u * (tz1 - tz0 - 0.07), a = Math.PI * (0.62 - 0.55 * Math.sin(u * Math.PI * 1.15));
      side.push([sx * Math.sin(a) * (tr + 0.003), ty + Math.cos(a) * (tr + 0.003), z]);
    }
    body.add(pipe(side, 0.0034, 36, 6), C.yellow, M.gloss);
  }
  body.add(ring(tr + 0.003, 0.0034, 0, ty, tz0 + 0.05, 'z', 5, 28), C.yellow, M.gloss);
  // fore-end: yellow block with finger ribs underneath, black linkage, yellow front plate
  body.add(slab([P(197, 212), P(262, 212), P(300, 222), P(300, 250), P(282, 262), P(240, 268), P(205, 262), P(197, 240)], 0.038, 0, 0.005), C.yellow, M.gloss);
  for (let k = 0; k < 4; k++) { const [z, y] = P(246 + k * 12, 252); body.add(box(0.034, 0.012, 0.0075, 0, y, z, 0.5), C.yellow, M.gloss); }
  for (const sx of [-1, 1]) { const [z0, y0] = P(268, 212), [z1, y1] = P(296, 170); body.add(pipe([[sx * 0.017, y0, z0], [sx * 0.017, y1, z1]], 0.0035), C.black, M.metal); }
  body.add(slab([P(292, 162), P(312, 158), P(318, 170), P(318, 245), P(306, 252), P(292, 246)], 0.04, 0, 0.006), C.yellow, M.gloss);
  for (const sx of [-1, 1]) { const [z, y] = P(312, 230); body.add(zcyl(0.007, z - 0.003, z + 0.004, sx * 0.012, y, 14).rotateX(0), C.black, M.metal); }
  // short barrel and flared nozzle with a blue core
  const [bz0, by] = P(304, 184), [bz1] = P(325, 0), [nz1] = P(386, 0);
  body.add(zcyl(0.0085, bz0, bz1 + 0.004, 0, by, 14), C.black, M.metal);
  body.add(zlathe([[0.0085, bz1], [0.011, bz1], [0.026, nz1 - 0.004], [0.029, nz1], [0.022, nz1 + 0.0015], [0.0105, nz1 + 0.001], [0, nz1 + 0.001]], 0, by, 0, 24), C.yellow, M.gloss);
  body.add(zlathe([[0, nz1], [0.0095, nz1], [0.0095, nz1 + 0.0035], [0, nz1 + 0.0042]], 0, by, 0, 16), C.blue, M.gloss);
  return rebuild(d, {
    body, ink,
    parts: { can: part(can, [0, ty, tc], 'ink'), trigger: part(trig, TRIGGER_PIVOT) },
    // the support hand closes on the ribbed fore-end from below
    gripL: gripSpec([0, 0.024, 0.125], [0, 1, -0.12], [0.45, -0.05, -1]),
    muzzle: [0, by, nz1 + 0.004],
  });
}

export const MODELS = {
  shooter: { sourceModel: 'Wmn_Shooter_Normal', build: splattershot },
};
