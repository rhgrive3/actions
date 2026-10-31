import { BLASTER_RETICLE_CSS } from './runtime/blaster-reticle-presentation.mjs';

// Final, presentation-only pass: upstream HUD/weapon adapters retain ownership
// of live guide and accuracy state. The retail measurements live with the art.
export function adaptBlasterReticle(rel, code, replaceOnce) {
  if (rel === 'styles/hud.css') return code + '\n' + BLASTER_RETICLE_CSS +
    '\n.iw-xh .iw-ret.iw-ret--blaster { translate: 0 0; }\n';
  if (rel !== 'src/ui/hud.js') return code;
  code = replaceOnce(code, "    const w = f.weapon || 'shooter';",
    `    const w = f.weapon || 'shooter';
    const reticleActor = this._local();
    const reticleWeapon = reticleActor?.weaponId === w
      ? reticleActor.weapon || WEAPONS[w] : WEAPONS[w];`, 'Blaster live weapon presentation owner');
  code = replaceOnce(code,
    "    const reticleFamily = WEAPONS[w]?.behaviorKind || (WEAPONS[w]?.kind === 'catalog' ? WEAPONS[w]?.modelKind : WEAPONS[w]?.kind) || w;",
    "    const reticleFamily = reticleWeapon?.behaviorKind || (reticleWeapon?.kind === 'catalog' ? reticleWeapon?.modelKind : reticleWeapon?.kind) || w;",
    'Blaster live family instead of a stale catalogue shell');
  code = replaceOnce(code, '? Math.min(3, Math.max(.25, viewportScale))', '? viewportScale',
    'Blaster CSS viewport scale without DPR or artificial min/max');
  code = replaceOnce(code, '    if (w !== L.weapon) {',
    '    if (w !== L.weapon || reticleFamily !== L.weaponFamily) {\n      L.weaponFamily = reticleFamily;',
    'Rebuild artwork when a live weapon changes family');
  code = replaceOnce(code, '      const W = WEAPONS[w];', '      const W = reticleWeapon;',
    'Use the same selected weapon for family and artwork');

  const start = "    } else if (kind === 'blaster') {";
  const end = "    } else if (kind === 'roller') {";
  const from = code.indexOf(start), to = code.indexOf(end, from + start.length);
  if (from < 0 || to < 0 || code.indexOf(start, from + start.length) >= 0)
    throw new Error('Blaster reticle markup anchor changed');
  code = replaceOnce(code, code.slice(from, to), `${start}
      r.innerHTML = blasterReticleMarkup();
      bindBlasterReticle(r);
`, 'Measured Blaster tangents and separate camera/impact marks');
  code = replaceOnce(code, '    applyShotGuide(this, ch.guide, innerWidth, innerHeight);',
    `    // Blaster has two independently positioned marks. Keep its root at
    // the viewport centre; both groups read independent ballistic points.
    applyShotGuide(this, L.kind === 'blaster' ? null : ch.guide, innerWidth, innerHeight);`,
    'Blaster root cannot inherit both a shot guide and old CSS offsets');

  code = replaceOnce(code, '    let guideX = 0, guideY = 0;',
    '    let guideX = 0, guideY = 0, blasterAimX = 0, blasterAimY = 0;',
    'Blaster nominal aim and first contact are independent world projections');
  code = replaceOnce(code,
    "      const point = guideMe && guideCam && G.projectiles?.s3WeaponGuide?.(guideMe, guideMe.weapon, guideCam, innerWidth, innerHeight);",
    `      const blasterOwner = L.kind === 'blaster' && guideMe?.weaponId === w ? guideMe : null;
      const pair = blasterOwner && guideCam && G.projectiles?.s3BlasterReticleGuides?.(blasterOwner, reticleWeapon, guideCam, innerWidth, innerHeight);
      const aim = pair?.aim ? this._project(guideCam, pair.aim.x, pair.aim.y, pair.aim.z) : null;
      if (aim && aim.z < 1) {
        blasterAimX = aim.x * innerWidth * .5;
        blasterAimY = -aim.y * innerHeight * .5;
      }
      const point = pair?.impact || (guideMe && guideCam && G.projectiles?.s3WeaponGuide?.(guideMe, guideMe.weapon, guideCam, innerWidth, innerHeight));`,
    'Blaster uses unclipped nominal aim plus terrain contact from one cached trajectory');

  const cueStart = "    const jumpState = L.kind === 'blaster' ? localActor?.weaponRunner?.s3BlasterJumpState?.(localActor.weapon) : null;";
  const cueEnd = "    if (L.kind === 'shooter' || L.kind === 'blaster' || L.kind === 'dualies' || L.kind === 'splatling') {";
  const cueFrom = code.indexOf(cueStart), cueTo = code.indexOf(cueEnd, cueFrom + cueStart.length);
  if (cueFrom < 0 || cueTo < 0) throw new Error('Blaster legacy bias presentation anchor changed');
  code = replaceOnce(code, code.slice(cueFrom, cueTo), `    if (L.kind === 'blaster') {
      const view = this._blasterPresentation || (this._blasterPresentation = { guide: { x: 0, y: 0 }, camera: { x: 0, y: 0 } });
      view.weapon = reticleWeapon || w;
      view.viewportWidth = innerWidth; view.viewportHeight = innerHeight;
      const selectedActor = localActor?.weaponId === w ? localActor : null;
      view.spreadDeg = Number.isFinite(selectedActor?.weaponRunner?.spread) ? selectedActor.weaponRunner.spread
        : Number.isFinite(ch.spreadDeg) ? ch.spreadDeg : 0;
      // These projections share the live trajectory owner and same-frame cache.
      // A lab/explicit HUD frame can supply a projected guide directly.
      view.guide.x = Number.isFinite(ch.guide?.x) ? ch.guide.x : innerWidth * .5 + guideX;
      view.guide.y = Number.isFinite(ch.guide?.y) ? ch.guide.y : innerHeight * .5 + guideY;
      view.camera.x = Number.isFinite(ch.blasterAim?.x) ? ch.blasterAim.x : innerWidth * .5 + blasterAimX;
      view.camera.y = Number.isFinite(ch.blasterAim?.y) ? ch.blasterAim.y : innerHeight * .5 + blasterAimY;
      view.inRange = ch.inRange; view.onTarget = ch.onTarget;
      view.mode = selectedActor ? (selectedActor.grounded === false ? 'air' : 'ground') : ch.blasterMode || 'ground';
      updateBlasterReticle(this.ret, view);
      const impactX = view.guide.x - innerWidth * .5, impactY = view.guide.y - innerHeight * .5;
      if (impactX !== L.blasterImpactX || impactY !== L.blasterImpactY) {
        L.blasterImpactX = impactX; L.blasterImpactY = impactY;
        L.blasterImpactTranslate = \`\${impactX.toFixed(1)}px \${impactY.toFixed(1)}px\`;
      }
    }
`, 'Blaster measured artwork reads existing live guide and angular accuracy');
  for (const element of ['hitEl', 'killEl']) {
    code = replaceOnce(code, `this.${element}.style.translate = this.ret.style.translate || '';`,
      `this.${element}.style.translate = this._L.kind === 'blaster'
        ? this._L.blasterImpactTranslate || '0px 0px' : this.ret.style.translate || '';`,
      'Confirmed Blaster feedback follows impact, not the fixed camera mark');
  }
  return "import { blasterReticleMarkup, bindBlasterReticle, updateBlasterReticle } from '../../patches/splatoon3/runtime/blaster-reticle-presentation.mjs';\n" + code;
}
