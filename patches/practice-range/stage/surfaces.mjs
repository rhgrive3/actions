// Practice Range — stage surface materials (texlib layers `range:<name>`) on the range's three reserved PATTERN slots
// (31–33, adapter.mjs → src/world/stages/surfaces.js). Same contract as Cargo Terminal's surfaces.js: SURF maps names to
// slot ids for layout.mjs, SURFACES says what each slot holds (prep: up to 4 fbm + 2 worley requests; surf writes
// s.alb / s.a / s.h / s.rough / s.metal / s.cav; heights in metres).
//
//   court   poured sports resin: an even, faintly speckled tinted surface — the zone colour does the talking. The
//           measuring grid is NOT baked in here: it is drawn in world space by the level shader (adapter.mjs adds a
//           branch for slot 31), so its lines sit exactly on world whole metres whatever the slab's edges are.
//   panel   lab wall cladding: 2 × 1 m tinted composite panels with shallow V-joints; walls on slot 32 also get world
//           height lines (every 0.5 m, bold each metre) from the same shader branch.
//   rubber  dark poured-rubber granulate for the zone frames, plinths and kerbs (never inkable).
import { PATTERN } from '../../../src/world/mapkit.js';

// (slots 31–33 belong to this stage: STAGE_SLOTS.range)
export const SURF = { court: 31, panel: 32, rubber: 33 };

const GRID = 1, HEX = 2;

export const SURFACES = [
  {
    slot: 31, name: 'court', onWall: PATTERN.concrete,
    mat: {
      detail: 0.35, scale: 4.0, tint: true, alpha: false, mode: HEX, sym: 7, hr: [-0.001, 0.0006], ao: 0.25,
      prep: `f[0] = FB(uv, ivec2(3), 4, 0.5, 4101u); f[1] = FB(uv, ivec2(24), 2, 0.5, 4103u); w[0] = WO(uv, ivec2(220), 1.0, 4107u);`,
      surf: /* glsl */`
  // resin court: low-contrast mottling and a fine colour-fleck aggregate, satin finish
  float mott = n[0], fine = n[1];
  vec4 fl = c[0];
  float fleck = step(0.86, fl.z) * (1.0 - smoothstep(0.0, 0.25, fl.x * 0.06));
  float tone = 0.84 * (1.0 + 0.035 * mott + 0.015 * fine);
  tone *= 1.0 + 0.09 * fleck * (fract(fl.z * 31.7) - 0.4);
  s.alb = vec3(tone);
  s.h = 0.00012 * mott + 0.00008 * fine + 0.00006 * fleck;
  s.rough = 0.62 + 0.05 * mott;
  s.cav = 1.0;`,
    },
  },
  {
    slot: 32, name: 'panel', onTop: PATTERN.metalpanel,
    mat: {
      detail: 0.5, scale: 4.0, tint: true, alpha: false, mode: GRID, sym: 1, hr: [-0.004, 0.0006], ao: 0.4,
      prep: `f[0] = FB(uv, ivec2(4), 4, 0.5, 4201u); f[1] = FB(uv, ivec2(16), 2, 0.5, 4203u);`,
      surf: /* glsl */`
  // 2 x 1 m composite cladding panels, V-joints with a shadow line, a faint per-panel tone
  ivec2 pan = wrp(ivec2(floor(P / vec2(2.0, 1.0))), ivec2(2, 4));
  float dj = min(jd(P.x, 2.0), jd(P.y, 1.0));
  float joint = 1.0 - aa(0.004, dj);
  float soft = 1.0 - smoothstep(0.0, 0.03, dj);
  float tone = 0.86 * (1.0 + 0.035 * (hf(pan, 7u) - 0.5) + 0.03 * n[0] + 0.01 * n[1]);
  s.alb = vec3(tone * (1.0 - 0.32 * joint) * (1.0 - 0.05 * soft));
  s.h = -0.003 * joint - 0.0006 * soft + 0.00015 * n[0];
  s.rough = 0.55 + 0.06 * n[0];
  s.cav = 1.0 - 0.35 * joint;`,
    },
  },
  {
    slot: 33, name: 'rubber', onWall: PATTERN.metalpanel,
    mat: {
      detail: 0.4, scale: 2.0, tint: true, alpha: false, mode: HEX, sym: 7, hr: [-0.0015, 0.0008], ao: 0.3,
      prep: `f[0] = FB(uv, ivec2(4), 3, 0.5, 4301u); w[0] = WO(uv, ivec2(260), 1.0, 4303u); w[1] = WO(uv, ivec2(90), 0.9, 4307u);`,
      surf: /* glsl */`
  // poured rubber granulate: tinted crumbs with darker binder gaps and a few lighter EPDM flecks
  vec4 g = c[0];
  float crumb = smoothstep(0.02, 0.18, g.y - g.x);
  float lightFleck = step(0.93, g.z);
  float tone = mix(0.55, 0.92 + 0.12 * fract(g.z * 13.1), crumb) * (1.0 + 0.05 * n[0]);
  tone = mix(tone, 1.35, lightFleck * crumb * 0.5);
  s.alb = vec3(tone);
  s.h = 0.0007 * crumb * (1.0 - g.x * g.x * 4.0) - 0.0004 * (1.0 - crumb);
  s.rough = 0.92 - 0.06 * crumb;
  s.cav = mix(0.7, 1.0, crumb);`,
    },
  },
];
