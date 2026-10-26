// S3 11.3.0 charger stripe and impact fields have different meanings.
// PaintParam.Radius* describes a contact blot; SplashPaintParam.WidthHalf*
// describes the transverse half-width along the shot. Never use the former
// to stamp every point of the flight line.
// Source: Leanny/splat3 data/parameter/1130/weapon/WeaponCharger*.json.
const finite = (n, fallback) => Number.isFinite(n) ? n : fallback;
const clamp = n => Math.max(0, Math.min(1, n));

export function catalogChargerPaintParameters(parameters, charge) {
  const p = parameters?.SplashPaintParam, spawn = parameters?.SplashSpawnParam;
  const impact = parameters?.PaintParam, weapon = parameters?.WeaponParam;
  if (!p || !spawn || !impact) return null;
  const fullFrames = finite(weapon?.ChargeFrameFullCharge, 60);
  const minimum = finite(weapon?.ChargeFrameMinCharge, 8);
  const c = clamp(finite(charge, 0));
  const partial = clamp((c * fullFrames - minimum) / Math.max(1, fullFrames - minimum));
  const full = c + 1e-9 >= 1;
  const endpoint = (row, key) => full ? row[key + 'FullCharge']
    : row[key + 'MinCharge'] + (row[key + 'MaxCharge'] - row[key + 'MinCharge']) * partial;
  const width = endpoint(p, 'WidthHalf'), depth = endpoint(p, 'DepthHalf');
  const onTop = endpoint(spawn, 'OnTopRate');
  return {
    width, depth, impact: endpoint(impact, 'Radius'),
    interval: 2 * depth * (1 - onTop) * Math.max(1, finite(spawn.SkipNum, 1)),
    // Same first forward sample as the established native Charger path.
    // This is an INKWAVE placement policy, not a recovered source default.
    first: 1.2,
  };
}
