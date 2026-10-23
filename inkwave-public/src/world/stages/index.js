// Stage modules (src/world/stages/<id>/): a stage that owns its whole folder — layout.js (LAYOUT), props.js (register,
// PLACEMENTS), surfaces.js (SURF, SURFACES) and murals.js (drawMurals). Only Cargo Terminal is built this way (ported
// from PR #8); the original stages keep their data in maps.js / dressing.js / murals.js. Static imports: a stage that
// is explicitly requested through this compatibility facade loads all of its modules.
// Production world presentation uses data.js and prepares selected builders through prop-packs.js.
import * as cargoLayout from './cargo/layout.js';
import * as cargoProps from './cargo/props.js';
import * as cargoSurfaces from './cargo/surfaces.js';
import * as cargoMurals from './cargo/murals.js';
import * as rangeLayout from '../../../patches/practice-range/stage/layout.mjs';
import * as rangeProps from '../../../patches/practice-range/stage/props.mjs';
import * as rangeSurfaces from '../../../patches/practice-range/stage/surfaces.mjs';
import * as rangeMurals from '../../../patches/practice-range/stage/murals.mjs';

// STAGES[id] = { LAYOUT, register, PLACEMENTS, SURF, SURFACES, drawMurals }
export const STAGES = {
  cargo: { ...cargoLayout, ...cargoProps, ...cargoSurfaces, ...cargoMurals },
  range: { ...rangeLayout, ...rangeProps, ...rangeSurfaces, ...rangeMurals },
};
