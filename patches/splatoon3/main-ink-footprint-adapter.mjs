import { INK_FOOTPRINT_GLSL, INK_FOOTPRINT_KINDS, INK_PROFILE_LAST_KIND } from './runtime/main-ink-footprints.mjs';

// Apply after the established quality broad phases; only the selected main
// bodies take the table path. Protected upstream modules remain immutable.
export function adaptMainInkFootprints(rel, code) {
  const once = (a, b) => {
    if (code.split(a).length !== 2) throw Error('INKWAVE main ink footprint anchor: ' + a.slice(0, 100));
    code = code.replace(a, b);
  };
  if (rel === 'src/world/paint.js') {
    code = "import { CHARGER_FOOTPRINT, INK_FOOTPRINT_KINDS, chargerInkProfileKind, inkFootprintContains, createInkProfileTexture } from '../../patches/splatoon3/runtime/main-ink-footprints.mjs';\n" + code;
    once("'source-shot': 8, 'source-splash': 9", "'source-shot': 8, 'source-splash': 9, " + INK_FOOTPRINT_KINDS.map((kind,i)=>`'${kind}': ${10+i}`).join(', '));
    once('1.25, 1.35, 1, 1];', '1.25, 1.35, 1, 1, ' + INK_FOOTPRINT_KINDS.map(()=>1.42).join(', ') + '];');
    once('float hsh(float n)', INK_FOOTPRINT_GLSL + '\nfloat hsh(float n)');
    // A section-table distance is a boundary test, not a Euclidean SDF.
    // Derivatives across a steep shoulder can otherwise turn a tiny drop
    // into a translucent stripe spanning its entire submitted rectangle.
    once('  float fw = max(fwidth(sd), 1e-5);', `  float fw = max(fwidth(sd), 1e-5);
  if (kind >= 10.0) fw = min(fw, max(tx, 1e-5));`);
    once('    } else if (kind > 7.5) {', `    } else if (kind > 9.5 && kind < ${INK_PROFILE_LAST_KIND+.5}) {\n      sd = mainInkDistance(p, dir, r * grow, kind, paintSeed);\n    } else if (kind > 7.5) {`);
    once('  splat(center, radius, team, opts = {}) {', `  splat(center, radius, team, opts = {}) {
    // Materialize the silhouette before recording the event. Receivers need
    // only the existing kind and seed fields, never the owner's current gun.
    if ((opts.kind === 'source-shot' || opts.kind === 'source-splash') &&
      (INK_FOOTPRINT_KINDS.includes(opts.footprint) || opts.footprint === CHARGER_FOOTPRINT))
      opts = { ...opts, kind: opts.footprint === CHARGER_FOOTPRINT ? chargerInkProfileKind(opts.seed) : opts.footprint };`);
    once('const sourced = kind === K_SOURCE_SHOT || kind === K_SOURCE_SPLASH;', `const sourced = kind === K_SOURCE_SHOT || kind === K_SOURCE_SPLASH || (kind >= 10 && kind <= ${INK_PROFILE_LAST_KIND});
    const stencil = kind >= 10 && kind <= ${INK_PROFILE_LAST_KIND};
    const inkWord = stencil ? paintShapeSeed(seed) : 0;
    const inkDu = sdu || sdv ? sdu : 1, inkDv = sdu || sdv ? sdv : 0;
    const inkInvR = stencil ? 1 / r : 0;
    const inkInvFront = stencil ? inkInvR / (1 + sa) : 0, inkInvRear = stencil ? inkInvR / (1 + .25 * sa) : 0;`);
    // Rounded-square lobes fit their source width/depth rectangle, whose
    // rotated corners need a sqrt(2) bound rather than the old circle bound.
    once('r * (1 + sa) * (sourced ? 1 : WOB_MAX);', 'r * (1 + sa) * (stencil ? 1.42 : sourced ? 1 : WOB_MAX);');
    // Keep generic broad-phase optimizations untouched. The profile path has
    // no inner-disc shortcut: its tapered tails and band corners are not disks.
    const start = code.indexOf('  _cpuSplat('), end = code.indexOf('\n  _pushQuad(', start);
    let body = code.slice(start, end);
    body = body.replace('    const i0 =', `    const inkExtU = stencil ? r * (Math.abs(inkDu) * (1 + sa) + Math.abs(inkDv)) : ext;
    const inkExtV = stencil ? r * (Math.abs(inkDv) * (1 + sa) + Math.abs(inkDu)) : ext;
    const i0 =`).replaceAll('(lu - ext)', '(lu - inkExtU)').replaceAll('(lu + ext)', '(lu + inkExtU)')
      .replaceAll('(lv - ext)', '(lv - inkExtV)').replaceAll('(lv + ext)', '(lv + inkExtV)');
    if (body.split('        if (roll) {').length !== 2) throw Error('INKWAVE profile CPU body anchor');
    code = code.slice(0, start) + body.replace('        if (roll) {', `        if (stencil) {
          const along = px * inkDu + py * inkDv, across = -px * inkDv + py * inkDu;
          if (!inkFootprintContains(along * (along > 0 ? inkInvFront : inkInvRear), across * inkInvR, kind, inkWord)) continue;
        } else if (roll) {`) + code.slice(end);
    once('kind !== K_SOURCE_SHOT && kind !== K_SOURCE_SPLASH ? 1 : 0;', 'kind !== K_SOURCE_SHOT && kind !== K_SOURCE_SPLASH && kind < 10 ? 1 : 0;');
    once('    this.mat = new THREE.ShaderMaterial({\n      vertexShader: PAINT_VS, fragmentShader: PAINT_FS,', `    this._mainInkProfiles = createInkProfileTexture(THREE);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMainInkProfiles: { value: this._mainInkProfiles } },
      vertexShader: PAINT_VS, fragmentShader: PAINT_FS,`);
    once('this.rt.dispose();', 'this._mainInkProfiles?.dispose(); this.rt.dispose();');
  }
  if (rel === 'src/game/inkFlightRuntime.js') {
    code = "import { mainInkFootprint } from '../../patches/splatoon3/runtime/main-ink-footprints.mjs';\n" + code;
    once('p.owner = head.owner; p.team = head.team;', 'p.inkKey = head.inkKey; p.s3Weapon = head.s3Weapon;\n    p.owner = head.owner; p.team = head.team;');
    once('kind: sourceFlightInkKind(kind), face: hit.face, claimOwner: p.owner,', 'kind: sourceFlightInkKind(kind), footprint: mainInkFootprint(p.s3Weapon || p.inkKey), face: hit.face, claimOwner: p.owner,');
  }
  if (rel === 'src/game/weapons.js') {
    code = "import { mainInkFootprint } from '../../patches/splatoon3/runtime/main-ink-footprints.mjs';\n" + code;
    once('stretchAmt: paint?.stretchAmt ?? 1.25, claimOwner: p.owner', 'stretchAmt: paint?.stretchAmt ?? 1.25, footprint: mainInkFootprint(p.s3Weapon), claimOwner: p.owner');
    once("stretchAmt: 0.7, claimOwner: p.owner,", "stretchAmt: 0.7, footprint: p.s3SpecialWeapon ? null : mainInkFootprint(p.s3Weapon), claimOwner: p.owner,");
  }
  return code;
}
