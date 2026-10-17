// Retail-image-guided silhouettes, NOT recovered Nintendo stencil textures.
// See reference/main-ink-footprints-2026-10-16.md for images/conditions and
// limitations. WidthHalf/DepthScale, pellet layout and flight stay with their
// existing source owners. These profiles only replace the circular body.
// A 128 x 8 RGBA8 strip (4 KiB) stores left/right edges. One GPU lookup,
// two CPU edge reads; no per-cell trigonometry, extra stamps or simulation.
export const INK_FOOTPRINT_KINDS = Object.freeze(['ink-shot', 'ink-slosh', 'ink-brush', 'ink-flick', 'ink-contact']);
export const INK_PROFILE_SIZE = 128;
export const INK_PROFILE_HEIGHT = 8;

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
].map(sections => Object.freeze(sections.map(section => Object.freeze(section)))));

export function mainInkFootprint(weapon, contact = false) {
  const kind = typeof weapon === 'string' ? weapon : weapon?.catalogRecord?.family ?? weapon?.family ?? weapon?.kind;
  if (contact) return kind === 'brush' || kind === 'roller' ? 'ink-contact' : null;
  if (kind === 'shooter' || kind === 'dualies') return 'ink-shot';
  if (kind === 'brush') return 'ink-brush';
  if (kind === 'roller') return 'ink-flick';
  if (kind === 'slosher') {
    // Screw and bouncing Bloblobber projectiles do not form Bucket's sheet.
    const actor = weapon?.sourceActor ?? weapon?.catalogRecord?.sourceActor;
    return actor === 'WeaponSlosherLauncher' || actor === 'WeaponSlosherBathtub' ? 'ink-shot' : 'ink-slosh';
  }
  return null;
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
uniform sampler2D uMainInkProfiles;
float mainInkDistance(vec2 p, vec2 direction, float radius, float kind, float word) {
  vec2 d = dot(direction, direction) > 0.5 ? direction : vec2(1.0, 0.0);
  float along = dot(p, d) / radius;
  float across = dot(p, vec2(-d.y, d.x)) / radius;
  if (mod(word, 2.0) > 0.5) across = -across;
  float cell = (clamp(along, -1.0, 1.0) * 0.5 + 0.5) * 127.0;
  float texel = floor(cell);
  float fraction = cell - texel;
  vec4 packedEdges = texture2D(uMainInkProfiles,
    vec2((texel + 0.5) / 128.0, (kind - 10.0 + 0.5) / 8.0));
  vec2 edges = mix(packedEdges.rg, packedEdges.ba, fraction);
  // A zero-width section is empty. Its centerline is not an ink boundary:
  // returning zero there would leave a half-alpha hair beyond a contact band.
  if (edges.r + edges.g <= 0.0) return radius;
  return max(abs(along) - 1.0, max(-across - edges.r, across - edges.g)) * radius;
}`;
