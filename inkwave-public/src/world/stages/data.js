// Lightweight descriptor graph used by world presentation. Keep synchronous mural
// hooks for the existing public setStage API; the large Cargo builders stay lazy.
import * as cargoLayout from './cargo/layout.js';
import * as cargoPlacements from './cargo/placements.js';
import * as cargoSurfaces from './cargo/surfaces.js';
import * as cargoMurals from './cargo/murals.js';
import * as rangeLayout from '../../../patches/practice-range/stage/layout.mjs';
import * as rangeProps from '../../../patches/practice-range/stage/props.mjs';
import * as rangeSurfaces from '../../../patches/practice-range/stage/surfaces.mjs';
import * as rangeMurals from '../../../patches/practice-range/stage/murals.mjs';
export const STAGES = {
  cargo: { ...cargoLayout, ...cargoPlacements, ...cargoSurfaces, ...cargoMurals },
  range: { ...rangeLayout, ...rangeProps, ...rangeSurfaces, ...rangeMurals },
};
