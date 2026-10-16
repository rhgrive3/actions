Existing manual BrushHeavy2 and Slosher2 public-native qualification

One production build of fixed game 9fe55aa056d6b5c31773254a4796c7db50df02f8. Existing 57 defaults, 94 manual appearance choices and 65 base models remain unchanged. This private diagnostic selects Brush_Heavy_01/02 and Slosher_Double_01/Slosher_Diffusion_02 manually through the existing public appearance API.

The two frozen family components run sequentially on the same served build: Brush12 + Slosher16 PNGs. Native day PMREM256, Neutral .94, strict served/versioned hashes, nonblank/clip/pose/owner/cleanup and per-pair visible differences are mandatory. Brush head bending and existing +48/+84 triangles remain required. Slosher60tick rest/fire requires complete ordered native bullet-unit sequences: Double16 bullets/one volley, Diffusion9 bullets/two volleys. Source Actor tests separately exercise real projectile advancement and owner ink consumption.

Each family runs two original actual Actor tests against source and full built site, with full geometry and trace signatures compared. No partial registry bundle is substituted for hosted emitted qualification. Local source helper replay uses a synthetic raster and does not establish real GPU appearance.

The infrastructure is copied from the previously published Heavy02 diagnostic, not from the canceled A4 shared package. No source-frames or precomputed coordinate/pose data is included. Only this four-model lane is in scope. No model, gameplay or default selection changes.

Rebound to main9fe. This diagnostic explicitly installs the catalog runtime and does not certify production boot (PR1510 remains separate). Source4 and limited registry-emitted4 passed on this exact main; fullsite emitted4 and 28 actual PNGs remain required.
