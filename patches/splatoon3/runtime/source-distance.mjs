// Splatoon 3 numerical distance convention: 5 source coordinates per range
// line. Unlike S1/S2 DU (50/line), these values need no factor of ten.
// Keep the displayed grid and the weapon profile on the same project scale.
export const SOURCE_UNITS_PER_RANGE_LINE = 5;
export const WORLD_UNITS_PER_SOURCE_UNIT = 1;
export const WORLD_UNITS_PER_RANGE_LINE =
  SOURCE_UNITS_PER_RANGE_LINE * WORLD_UNITS_PER_SOURCE_UNIT;
