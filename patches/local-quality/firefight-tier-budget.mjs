/**
 * Fidelity-limited crowd optimizations. This is a build-time adapter only;
 * upstream source under inkwave-public/ remains unmodified.
 *
 * Gameplay-affecting paint, projectile, weapon, camera, root transforms,
 * and player-controlled actors are never rate-limited.
 */

/**
 * Prune only the *total* low-contribution tail, preserving clip order and
 * movement cadence (which is calculated before this call).
 * Do not prune when the discarded total is material: 0.35/0.34/0.31 must stay.
 */
export function selectNearInvisibleClipTail(list, maxTail) {
  if (!(maxTail > 0) || list.length <= 2) return false;
  // Allocation-free O(n) selection. Sorting and spreading a fresh array on
  // every enemy's 60Hz motion tick would itself become a new hotspot.
  let a = -1, b = -1, sum = 0;
  for (let i = 0; i < list.length; i++) {
    const w = list[i].weight;
    if (!(w >= 0) || !Number.isFinite(w)) return false;
    sum += w;
    if (a < 0 || w > list[a].weight) { b = a; a = i; }
    else if (b < 0 || w > list[b].weight) b = i;
  }
  if (b < 0 || !Number.isFinite(sum)) return false;
  const kept = list[a].weight + list[b].weight;
  const tail = Math.max(0, sum - kept);
  if (!(kept > 0) || tail > maxTail) return false;
  const first = list[a], second = list[b];
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i] !== first && list[i] !== second) list.splice(i, 1);
  }
  for (const item of list) item.weight /= kept;
  return true;
}

// Flags match the native FX module: F_PAINT=1, F_RING=2, F_NOCOL=4.
// An omitted ray must be revisited over the WHOLE path from dK to current dP;
// an expired droplet or imminent water crossing is always tested now.
export function shouldDeferCosmeticDrop(flags, size, remainingLife, yBefore, yAfter, waterY, dt, count, i, phase) {
  return count > 32 && dt > 0 && dt <= 1 / 45 &&
    !(flags & 7) && size <= 0.035 && remainingLife > 3 * dt &&
    yBefore > waterY + 0.25 && yAfter > waterY + 0.25 &&
    (i + phase) % 3 !== 0;
}


/** A sampled flat foot patch is reusable only inside its very small observed envelope. */
export function flatFootHeightAt(f, x, z) {
  return f._iwFlatY !== null && f._iwFlatY !== undefined &&
    x >= f._iwFlatMinX && x <= f._iwFlatMaxX &&
    z >= f._iwFlatMinZ && z <= f._iwFlatMaxZ ? f._iwFlatY : null;
}

/** Only copy source substrings when a unique upstream anchor is present. */
export function adaptFirefightTierBudget(rel, code, replaceOnce) {
  if (rel === 'src/game/motion/source-controller.js') {
    code = replaceOnce(code,
      '  else if(moving){\n   let total=0;\n   for(const item of list){',
      `  else if(moving){
   // The cadence and stride were evaluated from the full list above.
   // Prune only a sub-pixel cosmetic tail, never a substantial third axis.
   const _px=c.lod?.px||0;
   const _budget=s.isBot===true&&!s.isLocal&&c.inWorld&&!this.pivoting&&
      this.grounded&&!this.action&&this.transitionTime>=HOST_MOTION.transitionSeconds&&_px>0
      ? (_px<110?0.018:0.006) : 0;
   selectNearInvisibleClipTail(list,_budget);
   let total=0;
   for(const item of list){`,
      'bound bot locomotion clip pruning by discarded total weight');
    code = `${selectNearInvisibleClipTail.toString()}\n${code}`;
  }
  if (rel === 'src/fx/fx.js') {
    code = replaceOnce(code,
      '    const col = this.collider, drag = 1 - 0.35 * dt;\n    for (let i = 0; i < this.dN; i++) {',
      `    const col = this.collider, drag = 1 - 0.35 * dt;
    const _dropPhase = this._iwCosmeticPhase = ((this._iwCosmeticPhase || 0) + 1) % 3;
    for (let i = 0; i < this.dN; i++) {`,
      'phase tiny FX droplet queries without affecting simulation');
    code = replaceOnce(code,
      '      if (!(flags & F_NOCOL) && col && this._checks < this.maxChecks) {',
      `      // Gameplay paint/rings, imminent water impacts, large particles and
      // final-life steps retain exact per-frame collision. The saved dK point
      // ensures deferred cosmetic queries sweep the full intervening path.
      const _defer = shouldDeferCosmeticDrop(flags, A[i8], A[i8 + 2] - A[i8 + 1], oy, ny, wy, dt, this.dN, i, _dropPhase);
      if (!(flags & F_NOCOL) && !_defer && col && this._checks < this.maxChecks) {`,
      'bounded non-paint tiny droplet raycast deferral');
    code = `${shouldDeferCosmeticDrop.toString()}\n${code}`;
  }
  if (rel === 'src/game/motion/retarget.js') {
    code = replaceOnce(code,
      '   c._ground(p.x,p.z,f.normal);if(f.normal.lengthSq()<.5)f.normal.copy(UP);else f.normal.normalize();',
      '   const _iwAnkleH=c._ground(p.x,p.z,f.normal);if(f.normal.lengthSq()<.5)f.normal.copy(UP);else f.normal.normalize();',
      'capture actual ankle height when normal is requested');
    code = replaceOnce(code,
      '   const gh=c._ground(p.x+f.heel.x,p.z+f.heel.z,this.v),gb=c._ground(p.x+f.ball.x,p.z+f.ball.z,this.v);',
      `   const _iwHeelX=p.x+f.heel.x,_iwHeelZ=p.z+f.heel.z,_iwBallX=p.x+f.ball.x,_iwBallZ=p.z+f.ball.z;
   const gh=c._ground(_iwHeelX,_iwHeelZ,this.v),gb=c._ground(_iwBallX,_iwBallZ,this.v);
   // Confirm both ends of the same small foot support have the same floor
   // elevation before reusing the result for a point within their bounds.
   // The rest of the map, curbs and outward-moving feet keep full raycasts.
   f._iwFlatY=c._owner?.()?.isBot===true&&c.inWorld&&f.normal.y>0.99999&&
     Math.abs(gh-_iwAnkleH)<1e-5&&Math.abs(gb-_iwAnkleH)<1e-5&&
     Math.abs(_iwAnkleH-c.root.position.y)<1e-4?_iwAnkleH:null;
   f._iwFlatMinX=Math.min(_iwHeelX,_iwBallX,p.x)-0.005;
   f._iwFlatMaxX=Math.max(_iwHeelX,_iwBallX,p.x)+0.005;
   f._iwFlatMinZ=Math.min(_iwHeelZ,_iwBallZ,p.z)-0.005;
   f._iwFlatMaxZ=Math.max(_iwHeelZ,_iwBallZ,p.z)+0.005;`,
      'bound flat bot footprint to three sampled floor heights');
    code = replaceOnce(code,
      '    f.anchor.add(this.v.subVectors(f.offset,f.lastOffset));\n    f.anchor.y=c._ground(f.anchor.x,f.anchor.z,this.v);',
      `    f.anchor.add(this.v.subVectors(f.offset,f.lastOffset));
    const _iwAnchorY=flatFootHeightAt(f,f.anchor.x,f.anchor.z);
    f.anchor.y=_iwAnchorY===null?c._ground(f.anchor.x,f.anchor.z,this.v):_iwAnchorY;`,
      'reuse only flat in-envelope anchor heights');
    code = replaceOnce(code,
      '   const minimumSole=c._ground(f.support.x,f.support.z,this.v)+f.airLift;',
      `   const _iwSupportY=flatFootHeightAt(f,f.support.x,f.support.z);
   const minimumSole=(_iwSupportY===null?c._ground(f.support.x,f.support.z,this.v):_iwSupportY)+f.airLift;`,
      'reuse only flat in-envelope support heights');
    code = replaceOnce(code,
      `   f.lastClearance=f.actual.y-c._ground(f.actual.x,f.actual.z,this.v);
   if(f.lastClearance<-.002){this.liftFreeFoot(f,f.lastClearance);f.bone.getWorldPosition(f.actual);f.actual.add(f.offset);f.lastClearance=f.actual.y-c._ground(f.actual.x,f.actual.z,this.v);}`,
      `   const _iwActualY=flatFootHeightAt(f,f.actual.x,f.actual.z);
   f.lastClearance=f.actual.y-(_iwActualY===null?c._ground(f.actual.x,f.actual.z,this.v):_iwActualY);
   if(f.lastClearance<-.002){this.liftFreeFoot(f,f.lastClearance);f.bone.getWorldPosition(f.actual);f.actual.add(f.offset);f.lastClearance=f.actual.y-c._ground(f.actual.x,f.actual.z,this.v);}`,
      'reuse flat in-envelope clearance only on the first nonpenetration probe');
    code = `${flatFootHeightAt.toString()}\n${code}`;
  }
  if (rel === 'src/game/character.js') {
    // The source retarget overwrites the pelvis and legs before the live
    // weapon rig is evaluated. Do not skip the weapon, face, head or hands.
    code = replaceOnce(code,
      '    const plant = this.plantW;\n    for (let i = 0; i < 2; i++) {',
      `    const _sourceLegsOwnPose = !!(this.sourceMotion?.active && this.sourceMotion.pose &&
      this.sourceMotion.activationPose && this.sourceMotion.activationTime >= 0.12);
    const plant = this.plantW;
    if (!_sourceLegsOwnPose) for (let i = 0; i < 2; i++) {`,
      'skip native foot-target work only after source motion fully owns legs');
    code = replaceOnce(code,
      '    // ---- pelvis: pose offsets, then drop just enough that both ankles are reachable\n    B.hips.position.copy(this.rest.hips); B.hips.position.x += P[HIPS_P]; B.hips.position.y += P[HIPS_P + 1]; B.hips.position.z += P[HIPS_P + 2];\n    B.hips.rotation.set(P[HIPS], P[HIPS + 1], P[HIPS + 2]);\n    {',
      `    // ---- pelvis: overwritten by source retarget when fully activated.
    if (!_sourceLegsOwnPose) {
      B.hips.position.copy(this.rest.hips); B.hips.position.x += P[HIPS_P]; B.hips.position.y += P[HIPS_P + 1]; B.hips.position.z += P[HIPS_P + 2];
      B.hips.rotation.set(P[HIPS], P[HIPS + 1], P[HIPS + 2]);
    }
    if (!_sourceLegsOwnPose) {`,
      'skip procedural pelvis/drop computation only while source owns it');
    code = replaceOnce(code,
      `    // ---- torso FK
    B.spine.rotation.set(P[SPINE], P[SPINE + 1], P[SPINE + 2]);
    B.chest.rotation.set(P[CHEST], P[CHEST + 1], P[CHEST + 2]);
    B.neck.rotation.set(P[NECK], P[NECK + 1], P[NECK + 2]);
    B.clavL.rotation.set(P[CLAVL], P[CLAVL + 1], P[CLAVL + 2]);
    B.clavR.rotation.set(P[CLAVR], P[CLAVR + 1], P[CLAVR + 2]);
    B.uArmL.rotation.set(P[UARML], P[UARML + 1], P[UARML + 2]);
    B.uArmR.rotation.set(P[UARMR], P[UARMR + 1], P[UARMR + 2]);
    B.fArmL.rotation.set(P[FARML], P[FARML + 1], P[FARML + 2]);
    B.fArmR.rotation.set(P[FARMR], P[FARMR + 1], P[FARMR + 2]);
    B.handL.rotation.set(P[HANDL], P[HANDL + 1], P[HANDL + 2]);
    B.handR.rotation.set(P[HANDR], P[HANDR + 1], P[HANDR + 2]);

    // ---- head: stabilised look (kid-space yaw/pitch) blended with the FK head
    _e1.set(P[HEAD], P[HEAD + 1], P[HEAD + 2], 'YXZ'); _q1.setFromEuler(_e1);
    if (P[STAB] > 0.001) {
      this._kidXform(B.neck, _v1, _q2);
      const tp = P[HIPS] + P[SPINE] + P[CHEST] + P[NECK], trl = P[HIPS + 2] + P[SPINE + 2] + P[CHEST + 2];
      _e1.set(-P[HLP] + P[HEAD] * 0.5 + tp * 0.4, P[HLY], P[HEAD + 2] + trl * 0.35, 'YXZ'); _q3.setFromEuler(_e1);
      _q2.invert().multiply(_q3);
      _q1.slerp(_q2, P[STAB]);
    } else if (Math.abs(P[HLY]) + Math.abs(P[HLP]) > 1e-4) {
      _e1.set(-P[HLP], P[HLY], 0, 'YXZ'); _q2.setFromEuler(_e1); _q1.premultiply(_q2);
    }
    B.head.quaternion.copy(_q1);`,
      `    if (!(_sourceLegsOwnPose && this.sourceMotion.sourceUpper)) {
      // ---- torso FK
      B.spine.rotation.set(P[SPINE], P[SPINE + 1], P[SPINE + 2]);
      B.chest.rotation.set(P[CHEST], P[CHEST + 1], P[CHEST + 2]);
      B.neck.rotation.set(P[NECK], P[NECK + 1], P[NECK + 2]);
      B.clavL.rotation.set(P[CLAVL], P[CLAVL + 1], P[CLAVL + 2]);
      B.clavR.rotation.set(P[CLAVR], P[CLAVR + 1], P[CLAVR + 2]);
      B.uArmL.rotation.set(P[UARML], P[UARML + 1], P[UARML + 2]);
      B.uArmR.rotation.set(P[UARMR], P[UARMR + 1], P[UARMR + 2]);
      B.fArmL.rotation.set(P[FARML], P[FARML + 1], P[FARML + 2]);
      B.fArmR.rotation.set(P[FARMR], P[FARMR + 1], P[FARMR + 2]);
      B.handL.rotation.set(P[HANDL], P[HANDL + 1], P[HANDL + 2]);
      B.handR.rotation.set(P[HANDR], P[HANDR + 1], P[HANDR + 2]);

      // ---- head: stabilised look (kid-space yaw/pitch) blended with the FK head
      _e1.set(P[HEAD], P[HEAD + 1], P[HEAD + 2], 'YXZ'); _q1.setFromEuler(_e1);
      if (P[STAB] > 0.001) {
        this._kidXform(B.neck, _v1, _q2);
        const tp = P[HIPS] + P[SPINE] + P[CHEST] + P[NECK], trl = P[HIPS + 2] + P[SPINE + 2] + P[CHEST + 2];
        _e1.set(-P[HLP] + P[HEAD] * 0.5 + tp * 0.4, P[HLY], P[HEAD + 2] + trl * 0.35, 'YXZ'); _q3.setFromEuler(_e1);
        _q2.invert().multiply(_q3);
        _q1.slerp(_q2, P[STAB]);
      } else if (Math.abs(P[HLY]) + Math.abs(P[HLP]) > 1e-4) {
        _e1.set(-P[HLP], P[HLY], 0, 'YXZ'); _q2.setFromEuler(_e1); _q1.premultiply(_q2);
      }
      B.head.quaternion.copy(_q1);
    }`,
      'skip procedural torso/arm/head FK when sourceMotion.sourceUpper overwrites upper body');
    code = replaceOnce(code,
      '    const hyw = P[HIPS + 1];\n    if (!this._oobPoseTailSkip || this.replant || !this.feetValid) for (let i = 0; i < 2; i++) {\n      const leg = i === 0 ? this.limbs.legL : this.limbs.legR, sd = i === 0 ? 1 : -1;',
      `    const hyw = P[HIPS + 1];
    if (!_sourceLegsOwnPose && (!this._oobPoseTailSkip || this.replant || !this.feetValid)) for (let i = 0; i < 2; i++) {
      const leg = i === 0 ? this.limbs.legL : this.limbs.legR, sd = i === 0 ? 1 : -1;`,
      'preserve current offscreen IK behavior while skipping overwritten leg IK');
  }
  return code;
}
