// S3 11.3.0 charger stripe and impact fields have different meanings.
// PaintParam.Radius* describes a contact blot; SplashPaintParam.WidthHalf*
// describes the transverse half-width along the shot. Never use the former
// to stamp every point of the flight line.
// Source: Leanny/splat3 data/parameter/1130/weapon/WeaponCharger*.json.
const finite = (n, fallback) => Number.isFinite(n) ? n : fallback;
const clamp = n => Math.max(0, Math.min(1, n));
const endpoint = (row, key, full, partial) => full ? row[key + 'FullCharge']
  : row[key + 'MinCharge'] + (row[key + 'MaxCharge'] - row[key + 'MinCharge']) * partial;

export function catalogChargerPaintParameters(parameters, charge) {
  const p = parameters?.SplashPaintParam, spawn = parameters?.SplashSpawnParam;
  const impact = parameters?.PaintParam, weapon = parameters?.WeaponParam;
  if (!p || !spawn || !impact) return null;
  const fullFrames = finite(weapon?.ChargeFrameFullCharge, 60);
  const minimum = finite(weapon?.ChargeFrameMinCharge, 8);
  const c = clamp(finite(charge, 0));
  const partial = clamp((c * fullFrames - minimum) / Math.max(1, fullFrames - minimum));
  const full = c + 1e-9 >= 1;
  const width = endpoint(p, 'WidthHalf', full, partial), depth = endpoint(p, 'DepthHalf', full, partial);
  const onTop = endpoint(spawn, 'OnTopRate', full, partial);
  return {
    width, depth, impact: endpoint(impact, 'Radius', full, partial),
    interval: 2 * depth * (1 - onTop) * Math.max(1, finite(spawn.SkipNum, 1)),
    // Same first forward sample as the established native Charger path.
    // This is an INKWAVE placement policy, not a recovered source default.
    first: 1.2,
  };
}
