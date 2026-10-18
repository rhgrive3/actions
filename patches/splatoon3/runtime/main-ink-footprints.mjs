// Retail-image-guided silhouettes, NOT recovered Nintendo stencil textures.
// See reference/main-ink-footprints-2026-10-16.md for images/conditions and
// limitations. WidthHalf/DepthScale, pellet layout and flight stay with their
// existing source owners. These profiles only replace the circular body.
// A 128 x 16 RGBA8 strip (8 KiB) stores left/right edges. One GPU lookup,
// two CPU edge reads; no per-cell trigonometry, extra stamps or simulation.
export const CHARGER_FOOTPRINT = 'ink-charger';
export const INK_FOOTPRINT_KINDS = Object.freeze(['ink-shot', 'ink-slosh', 'ink-brush', 'ink-flick', 'ink-contact',
  'ink-charger-a', 'ink-charger-b', 'ink-charger-c', 'ink-blast']);
// Three precomputed variants retain the old seeded organic Charger character
// without the original per-pixel/per-cell trig, satellite ink or extra turf.
// Existing Charger row indices and bytes remain stable in the expanded strip.
export function chargerInkProfileKind(seed) {
  const n=Number.isFinite(seed)?Math.max(0,Math.min(1-Number.EPSILON,seed)):0;
  return INK_FOOTPRINT_KINDS[5+Math.min(2,Math.floor(n*3))];
}
export const INK_PROFILE_SIZE = 128;
export const INK_PROFILE_HEIGHT = 16;
export const INK_PROFILE_LAST_KIND = 10 + INK_FOOTPRINT_KINDS.length - 1;

// Longitudinal coordinate, left half-width, right half-width. These control
// sections describe the visible body, excluding detached drops (already real
// paint events). Small lateral asymmetries mirror with the recorded seed.
// They are calibrated outlines; perspective screenshots cannot supply exact
// source-unit dimensions or the engine's stencil sampling law.
export const INK_PROFILE_SECTIONS = Object.freeze([
  // Shooter / Dualies: blunt pool and broken shoulders, narrow trailing neck.
  [[-1,0,0],[-.94,.13,.08],[-.84,.21,.29],[-.72,.19,.22],[-.59,.46,.38],[-.47,.43,.54],[-.33,.72,.62],[-.20,.68,.76],[-.08,.92,.88],[.06,.86,.94],[.19,1,.88],[.33,.93,1],[.48,.89,.84],[.61,.70,.81],[.74,.71,.59],[.85,.43,.48],[.94,.26,.20],[1,0,0]],
  // Slosher: lobed, broad rounded-square puddles; the existing nine-unit
  // Bucket volley, rather than one giant tear stamp, makes its tapered stripe.
  [[-1,0,0],[-.92,.26,.20],[-.83,.66,.59],[-.72,.60,.76],[-.60,.85,.73],[-.47,.79,.93],[-.33,.98,.84],[-.19,.85,1],[-.05,.94,.90],[.10,1,.94],[.25,.89,.82],[.40,.95,.96],[.55,.83,.84],[.69,.88,.73],[.80,.59,.64],[.91,.30,.36],[1,0,0]],
  // Brush flick: rounded ribbon with small scallops, not a pointed leaf.
  // The isolated orange strokes in the brush reference have two broad caps.
  // The sourced
  // Mini/Normal/Heavy pellet spread and widths determine the whole fan.
  [[-1,0,0],[-.94,.45,.40],[-.84,.74,.70],[-.71,.79,.84],[-.58,.90,.82],[-.44,.83,.93],[-.30,.95,.86],[-.16,.89,.92],[0,.92,.86],[.15,.88,.96],[.29,.96,.88],[.43,.87,1],[.57,1,.91],[.70,.89,.95],[.82,.75,.77],[.93,.43,.49],[1,0,0]],
  // Roller flick: uneven broad head and tapered connecting fingers. The
  // horizontal/vertical unit distributions remain separate source volleys.
  [[-1,0,0],[-.93,.12,.09],[-.82,.21,.25],[-.69,.18,.16],[-.56,.38,.30],[-.42,.51,.60],[-.29,.47,.50],[-.16,.78,.73],[-.02,.86,.91],[.12,.81,.85],[.26,1,.93],[.40,.90,1],[.54,.91,.82],[.68,.72,.84],[.80,.61,.55],[.92,.31,.36],[1,0,0]],
  // Contact: parallel edges, short rounded ends. Half-length .58 is bounded
  // by the existing .52R contact-sampling interval, so neighboring stamps
  // overlap without drawing a disk at every sample. Literal lateral width R.
  [[-1,0,0],[-.60,0,0],[-.58,.84,.84],[-.53,.97,.97],[-.45,1,1],[.45,1,1],[.53,.97,.97],[.58,.84,.84],[.60,0,0],[1,0,0]],
  // Charger: old pre-#1443 blobWobble contour sampled at three fixed seeds
  // (.13/.47/.83), with both axes bounded by the pinned source WidthHalf
  // and DepthHalf envelope. These are silhouette approximations, not retail
  // Nintendo ink-mask textures. Source splat number/timing/radius stay intact.
  [[-1,0,0],[-.94,0,.56],[-.84,.10,.76],[-.72,.61,.91],[-.59,.62,1],[-.47,.64,.97],[-.33,.75,.88],[-.20,.81,.81],[-.08,.91,.82],[.06,.98,.86],[.19,1,.90],[.33,.92,.88],[.48,.46,.85],[.61,.40,.58],[.74,.35,.54],[.85,.24,.46],[.94,.18,.37],[1,0,0]],
  [[-1,0,0],[-.94,.74,0],[-.84,.78,0],[-.72,.80,.47],[-.59,.79,.83],[-.47,.75,.93],[-.33,.74,.96],[-.20,.85,.95],[-.08,.85,.96],[.06,.91,1],[.19,.98,.95],[.33,1,.95],[.48,.94,.87],[.61,.77,.35],[.74,.70,.30],[.85,.37,.17],[.94,.21,.09],[1,0,0]],
  [[-1,0,0],[-.94,.13,.65],[-.84,.38,.75],[-.72,.51,.77],[-.59,.54,.75],[-.47,.55,.72],[-.33,.73,.72],[-.20,.76,.71],[-.08,.81,.89],[.06,.88,.99],[.19,.98,1],[.33,.98,.96],[.48,.87,.92],[.61,.35,.89],[.74,.29,.47],[.85,.27,.17],[.94,.23,0],[1,0,0]],
  // Connected blast body measured from grizzblast.webp (image-space only).
  // See reference/added-ink-contours-20261018.json; not a Nintendo stencil.
  [
    [-1,0,0],[-0.98802395,0.13268608,0.0],[-0.9760479,0.15857605,0.0],
    [-0.96407186,0.18446602,0.0420712],[-0.95209581,0.19093851,0.05501618],[-0.94011976,0.2038835,0.07443366],
    [-0.92814371,0.21035599,0.08090615],[-0.91616766,0.21682848,0.08737864],[-0.90419162,0.22977346,0.09385113],
    [-0.89221557,0.25566343,0.10679612],[-0.88023952,0.27508091,0.11326861],[-0.86826347,0.28802589,0.1197411],
    [-0.85628743,0.28802589,0.13268608],[-0.84431138,0.29449838,0.15210356],[-0.83233533,0.30097087,0.16504854],
    [-0.82035928,0.30097087,0.197411],[-0.80838323,0.30097087,0.36569579],[-0.79640719,0.30097087,0.37864078],
    [-0.78443114,0.30097087,0.39158576],[-0.77245509,0.30744337,0.39805825],[-0.76047904,0.31391586,0.40453074],
    [-0.74850299,0.32686084,0.41100324],[-0.73652695,0.33333333,0.41747573],[-0.7245509,0.33980583,0.42394822],
    [-0.71257485,0.33980583,0.43042071],[-0.7005988,0.34627832,0.44983819],[-0.68862275,0.35275081,0.45631068],
    [-0.67664671,0.3592233,0.46278317],[-0.66467066,0.36569579,0.46278317],[-0.65269461,0.37864078,0.46925566],
    [-0.64071856,0.47572816,0.47572816],[-0.62874251,0.49514563,0.48220065],[-0.61676647,0.50161812,0.48220065],
    [-0.60479042,0.50809061,0.49514563],[-0.59281437,0.51456311,0.50161812],[-0.58083832,0.5210356,0.51456311],
    [-0.56886228,0.5210356,0.53398058],[-0.55688623,0.5210356,0.55987055],[-0.54491018,0.51456311,0.55987055],
    [-0.53293413,0.49514563,0.53398058],[-0.52095808,0.49514563,0.51456311],[-0.50898204,0.50161812,0.51456311],
    [-0.49700599,0.52750809,0.5987055],[-0.48502994,0.53398058,0.60517799],[-0.47305389,0.54045307,0.61165049],
    [-0.46107784,0.54692557,0.61165049],[-0.4491018,0.55339806,0.61812298],[-0.43712575,0.56634304,0.61812298],
    [-0.4251497,0.57928803,0.62459547],[-0.41317365,0.60517799,0.63106796],[-0.4011976,0.63106796,0.63106796],
    [-0.38922156,0.65048544,0.63106796],[-0.37724551,0.66343042,0.63754045],[-0.36526946,0.6828479,0.63754045],
    [-0.35329341,0.69579288,0.64401294],[-0.34131737,0.70226537,0.65695793],[-0.32934132,0.70226537,0.66990291],
    [-0.31736527,0.71521036,0.70226537],[-0.30538922,0.72815534,0.72168285],[-0.29341317,0.9223301,0.77993528],
    [-0.28143713,0.92880259,0.79935275],[-0.26946108,0.92880259,0.81877023],[-0.25748503,0.92880259,0.82524272],
    [-0.24550898,0.9223301,0.8381877],[-0.23353293,0.91585761,0.84466019],[-0.22155689,0.90938511,0.84466019],
    [-0.20958084,0.90291262,0.84466019],[-0.19760479,0.88996764,0.84466019],[-0.18562874,0.88349515,0.84466019],
    [-0.17365269,0.87702265,0.8381877],[-0.16167665,0.87055016,0.83171521],[-0.1497006,0.86407767,0.82524272],
    [-0.13772455,0.86407767,0.81877023],[-0.1257485,0.85760518,0.80582524],[-0.11377246,0.85113269,0.80582524],
    [-0.10179641,0.85113269,0.80582524],[-0.08982036,0.84466019,0.81229773],[-0.07784431,0.84466019,0.81877023],
    [-0.06586826,0.84466019,0.82524272],[-0.05389222,0.84466019,0.83171521],[-0.04191617,0.84466019,0.8381877],
    [-0.02994012,0.84466019,0.84466019],[-0.01796407,0.84466019,0.85113269],[-0.00598802,0.85113269,0.85760518],
    [0.00598802,0.85760518,0.85760518],[0.01796407,0.86407767,0.86407767],[0.02994012,0.87055016,0.86407767],
    [0.04191617,0.87702265,0.86407767],[0.05389222,0.88349515,0.85760518],[0.06586826,0.88996764,0.85760518],
    [0.07784431,0.96116505,0.85113269],[0.08982036,0.98705502,0.85113269],[0.10179641,0.99352751,0.85113269],
    [0.11377246,1.0,0.85113269],[0.1257485,1.0,0.85113269],[0.13772455,1.0,0.85113269],
    [0.1497006,0.99352751,0.85113269],[0.16167665,0.99352751,0.85113269],[0.17365269,0.98705502,0.85113269],
    [0.18562874,0.97411003,0.85113269],[0.19760479,0.95469256,0.84466019],[0.20958084,0.91585761,0.85113269],
    [0.22155689,0.89644013,0.85113269],[0.23353293,0.86407767,0.85113269],[0.24550898,0.85113269,0.85760518],
    [0.25748503,0.81877023,0.88349515],[0.26946108,0.81229773,0.89644013],[0.28143713,0.81229773,0.91585761],
    [0.29341317,0.80582524,0.94174757],[0.30538922,0.80582524,0.96763754],[0.31736527,0.80582524,0.98058252],
    [0.32934132,0.79935275,0.99352751],[0.34131737,0.79288026,1.0],[0.35329341,0.78640777,1.0],
    [0.36526946,0.77993528,1.0],[0.37724551,0.77346278,1.0],[0.38922156,0.7605178,0.99352751],
    [0.4011976,0.75404531,0.98058252],[0.41317365,0.74110032,0.96116505],[0.4251497,0.72815534,0.94174757],
    [0.43712575,0.72168285,0.91585761],[0.4491018,0.68932039,0.88349515],[0.46107784,0.6763754,0.87055016],
    [0.47305389,0.65695793,0.87055016],[0.48502994,0.64401294,0.86407767],[0.49700599,0.63106796,0.85760518],
    [0.50898204,0.62459547,0.85760518],[0.52095808,0.61165049,0.85113269],[0.53293413,0.60517799,0.8381877],
    [0.54491018,0.59223301,0.80582524],[0.55688623,0.58576052,0.78640777],[0.56886228,0.57281553,0.76699029],
    [0.58083832,0.55987055,0.75404531],[0.59281437,0.54045307,0.74110032],[0.60479042,0.51456311,0.74110032],
    [0.61676647,0.49514563,0.73462783],[0.62874251,0.48867314,0.72815534],[0.64071856,0.47572816,0.69579288],
    [0.65269461,0.46925566,0.6828479],[0.66467066,0.46925566,0.64401294],[0.67664671,0.46925566,0.62459547],
    [0.68862275,0.46925566,0.60517799],[0.7005988,0.46278317,0.60517799],[0.71257485,0.45631068,0.5987055],
    [0.7245509,0.44983819,0.5987055],[0.73652695,0.4368932,0.60517799],[0.74850299,0.43042071,0.60517799],
    [0.76047904,0.41747573,0.60517799],[0.77245509,0.39805825,0.61165049],[0.78443114,0.38511327,0.61812298],
    [0.79640719,0.36569579,0.61812298],[0.80838323,0.34627832,0.61812298],[0.82035928,0.33333333,0.60517799],
    [0.83233533,0.32038835,0.50161812],[0.84431138,0.32038835,0.49514563],[0.85628743,0.33980583,0.48867314],
    [0.86826347,0.34627832,0.46925566],[0.88023952,0.35275081,0.0],[0.89221557,0.35275081,0.0],
    [0.90419162,0.35275081,0.0],[0.91616766,0.34627832,0.0],[0.92814371,0.33980583,0.0],
    [0.94011976,0.33333333,0.0],[0.95209581,0.32038835,0.0],[0.96407186,0.31391586,0.0],
    [0.9760479,0.29449838,0.0],[0.98802395,0.2815534,0.0],[1,0,0],
  ],
].map(sections => Object.freeze(sections.map(section => Object.freeze(section)))));

export function mainInkFootprint(weapon, contact = false) {
  const kind = typeof weapon === 'string' ? weapon : weapon?.catalogRecord?.family ?? weapon?.family ?? weapon?.kind;
  if (contact) return kind === 'brush' || kind === 'roller' ? 'ink-contact' : null;
  if (kind === 'charger') return CHARGER_FOOTPRINT;
  if (['shooter','dualies','splatling','blaster','stringer','brella'].includes(kind)) return 'ink-shot';
  // Individual Saber drops form a scalloped ribbon; the source drop schedule
  // and depth, rather than a single giant stamp, make the complete slash.
  if (kind === 'splatana') return 'ink-brush';
  if (kind === 'brush') return 'ink-brush';
  if (kind === 'roller') return 'ink-flick';
  if (kind === 'slosher') {
    // Screw and bouncing Bloblobber projectiles do not form Bucket's sheet.
    const actor = weapon?.sourceActor ?? weapon?.catalogRecord?.sourceActor;
    return actor === 'WeaponSlosherLauncher' || actor === 'WeaponSlosherBathtub' ? 'ink-shot' : 'ink-slosh';
  }
  return null;
}

// A detonation is a rounded lobed pool, distinct from its flight drops.
// Keep phase selection explicit; do not infer from the owner's current weapon.
export function mainInkBurstFootprint(weapon) {
  const family=typeof weapon==='string'?weapon:weapon?.catalogRecord?.family??weapon?.family??weapon?.kind;
  return ['blaster','stringer','splatana','slosher'].includes(family)?'ink-blast':null;
}

// Pure data, created once, shared by every paint world. RG hold positive
// left/right widths. Explicit linear sampling also works with WebGL1 RGBA8.
export const INK_PROFILE_BYTES = new Uint8Array(INK_PROFILE_SIZE * INK_PROFILE_HEIGHT * 4);
for (let row = 0; row < INK_PROFILE_SECTIONS.length; row++) {
  const sections = INK_PROFILE_SECTIONS[row]; let segment = 0;
  for (let i = 0; i < INK_PROFILE_SIZE; i++) {
    const along = 2 * i / (INK_PROFILE_SIZE - 1) - 1;
    while (segment < sections.length - 2 && sections[segment + 1][0] < along) segment++;
    const a = sections[segment], b = sections[segment + 1], t = (along - a[0]) / (b[0] - a[0]);
    const offset = (row * INK_PROFILE_SIZE + i) * 4;
    const ease = t * t * (3 - 2 * t);
    for (let channel = 0; channel < 2; channel++) {
      const av = a[channel + 1], bv = b[channel + 1];
      // Round a closing cap instead of making each puddle a pointed polygon.
      const width = av === 0 ? bv * Math.sqrt(t) : bv === 0 ? av * Math.sqrt(1 - t) : av + (bv - av) * ease;
      INK_PROFILE_BYTES[offset + channel] = Math.round(width * 255);
    }
  }
}
// Each RGBA texel contains this section's left/right widths (RG) and the
// *next* section's widths (BA). A single nearest fetch plus explicit mix
// uses the same 8-bit profile endpoints as the CPU and avoids driver-specific
// fixed-point interpolation on the 45-degree outline boundary.
for (let row = 0; row < INK_PROFILE_SECTIONS.length; row++) {
  for (let i = 0; i < INK_PROFILE_SIZE; i++) {
    const offset = (row * INK_PROFILE_SIZE + i) * 4;
    const next = (row * INK_PROFILE_SIZE + Math.min(i + 1, INK_PROFILE_SIZE - 1)) * 4;
    INK_PROFILE_BYTES[offset + 2] = INK_PROFILE_BYTES[next];
    INK_PROFILE_BYTES[offset + 3] = INK_PROFILE_BYTES[next + 1];
  }
}

export function inkFootprintContains(along, across, kind, word) {
  if (along <= -1 || along >= 1) return false;
  if (word % 2) across = -across;
  const x = (along + 1) * .5 * (INK_PROFILE_SIZE - 1), i = Math.floor(x), t = x - i;
  const offset = ((kind - 10) * INK_PROFILE_SIZE + i) * 4;
  const channel = across < 0 ? 0 : 1;
  const width = (INK_PROFILE_BYTES[offset + channel] * (1 - t) + INK_PROFILE_BYTES[offset + 2 + channel] * t) / 255;
  return Math.abs(across) < width;
}

export function createInkProfileTexture(THREE) {
  const texture = new THREE.DataTexture(INK_PROFILE_BYTES, INK_PROFILE_SIZE, INK_PROFILE_HEIGHT, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false; texture.needsUpdate = true;
  return texture;
}

export const INK_FOOTPRINT_GLSL = `
uniform highp sampler2D uMainInkProfiles;
float mainInkDistance(vec2 p, vec2 direction, float radius, float kind, float word) {
  vec2 d = dot(direction, direction) > 0.5 ? direction : vec2(1.0, 0.0);
  float along = dot(p, d) / radius;
  float across = dot(p, vec2(-d.y, d.x)) / radius;
  if (mod(word, 2.0) > 0.5) across = -across;
  // Match the CPU coordinate and explicit blend in highp arithmetic. RG/BA
  // carry both exact RGBA8 endpoints, so one nearest fetch is sufficient.
  float x = (clamp(along, -1.0, 1.0) + 1.0) * 0.5 * 127.0;
  float i = floor(x), t = x - i;
  vec4 packedEdges = texture2D(uMainInkProfiles,
    vec2((i + 0.5) / 128.0, (kind - 10.0 + 0.5) / ${INK_PROFILE_HEIGHT}.0));
  vec2 edges = packedEdges.rg * (1.0 - t) + packedEdges.ba * t;
  // A zero-width section is empty. Its centerline is not an ink boundary:
  // returning zero there would leave a half-alpha hair beyond a contact band.
  if (edges.r + edges.g <= 0.0) return radius;
  return max(abs(along) - 1.0, max(-across - edges.r, across - edges.g)) * radius;
}`;
