// Build-only hot-path optimizations applied at the end of source composition.
// Every transform preserves exact IEEE-754 arithmetic, RNG order, and visual state.
export function adaptReviewedHotpaths20261107(rel, code, replaceOnce) {
  if (rel === 'src/core/renderer.js') {
    code = replaceOnce(code,
      '    cropBattleCanvas(this.renderer.domElement, this._w, this._h, !!this.camera?.userData.s3BattleFrame);\n    this.composer.render();',
      '    cropBattleCanvas(this.renderer.domElement, this._w, this._h, !!this.camera?.userData.s3BattleFrame);\n    const _sc = this.scene;\n    if (_sc) { _sc._iwComposerPass = true; _sc._iwComposerWorldReady = false; }\n    try { this.composer.render(); }\n    finally { if (_sc) { _sc._iwComposerPass = false; _sc._iwComposerWorldReady = false; } }',
      'composer-scoped scene matrix world dedup');
  }
  if (rel === 'src/game/physics.js') {
    code = replaceOnce(code,
      `    // ring: best clear step above the centre, or (centre missing) the highest walkable sample
    let by = have ? cy + stepMin : -Infinity, bi = -1;
    const hr = this._gh2 || (this._gh2 = new Hit());
    for (let i = 0; i < RING.length; i++) {
      _go.set(x + RING[i][0] * foot, y + up, z + RING[i][1] * foot);
      this.raycast(_go, DOWNV, len, hr, skipGrates, columns?.[i + 1]);
      if (!hr.hit || hr.normal.y < WALKABLE) continue;
      if (hr.point.y > by) { by = hr.point.y; bi = i; this._fillGround(out, hr, false); }
    }`,
      `    // ring: best clear step above the centre, or (centre missing) the highest walkable sample
    let by = have ? cy + stepMin : -Infinity, bi = -1;
    if (!(have && len >= 0 && y + up <= by)) {
      const hr = this._gh2 || (this._gh2 = new Hit());
      const blocks = this.level.blocks, oyTop = y + up + 1e-6;
      for (let i = 0; i < RING.length; i++) {
        const col = columns?.[i + 1];
        if (col && have && len >= 0) {
          const minTop = by - 1e-6;
          let canBeat = false;
          for (let j = 0; j < col.length; j++) {
            const b = blocks[col[j]];
            if (!b.solid || (skipGrates && b.grate)) continue;
            if (b.aabbMax && b.aabbMax.y <= minTop) continue;
            if (b.aabbMin && b.aabbMin.y > oyTop) continue;
            canBeat = true; break;
          }
          if (!canBeat) continue;
        }
        const rLen = have && len >= 0 && Number.isFinite(by) ? Math.min(len, (y + up - by) + 1e-5) : len;
        _go.set(x + RING[i][0] * foot, y + up, z + RING[i][1] * foot);
        this.raycast(_go, DOWNV, rLen, hr, skipGrates, col);
        if (!hr.hit || hr.normal.y < WALKABLE) continue;
        if (hr.point.y > by) { by = hr.point.y; bi = i; this._fillGround(out, hr, false); }
      }
    }`,
      'physics groundProbe per-column step elevation prune');
  }
  if (rel === 'src/game/motion/gait-targets.js') {
    code = replaceOnce(code,
      '   if(!this.total){this.wp[i].copy(pos);this.wq[i].copy(pose.wq[i]);}\n   else{this.wp[i].lerp(pos,a);this.wq[i].slerp(pose.wq[i],a);}',
      '   if(!this.total){this.wp[i].copy(pos);if(pose.wq)this.wq[i].copy(pose.wq[i]);}\n   else{this.wp[i].lerp(pos,a);if(pose.wq)this.wq[i].slerp(pose.wq[i],a);}',
      'gait-targets optional world quaternion blend');
  }
  if (rel === 'src/game/motion/source-controller.js') {
    code = replaceOnce(code,
      `  const jumpBase=shooting?famTables.jump1:famTables.jump0;
  let jumpClips=shooting?famTables._driveJump1:famTables._driveJump0;
  if (!jumpClips) { jumpClips={start:this.bank.clips.get(jumpBase+'_St')||(jumpBase==='Jump_Glng00'?this.bank.clips.get('Jump_Glngl00_St'):undefined),body:this.bank.clips.get(jumpBase),end:this.bank.clips.get(jumpBase+'_Ed')}; if(shooting)famTables._driveJump1=jumpClips;else famTables._driveJump0=jumpClips; }
  if(this.formEvent&&this.formTime<this.formDuration&&sourceFormClipAdmitted(this)){
   special={name:this.formKid?'ToHuman':'ToSquid',frame:sourceFormFrame(this,this.bank.clips.get(this.formKid?'ToHuman':'ToSquid').frames)};state=special.name;
  }else if(!this.grounded){`,
      `  let jumpBase, jumpClips;
  const resolveJumpClips=()=>{
   jumpBase=shooting?famTables.jump1:famTables.jump0;
   jumpClips=shooting?famTables._driveJump1:famTables._driveJump0;
   if(!jumpClips){const end=this.bank.clips.get(jumpBase+'_Ed');jumpClips={start:this.bank.clips.get(jumpBase+'_St')||(jumpBase==='Jump_Glng00'?this.bank.clips.get('Jump_Glngl00_St'):undefined),body:this.bank.clips.get(jumpBase),end,endSec:(end?.frames||0)/HOST_MOTION.fps};if(shooting)famTables._driveJump1=jumpClips;else famTables._driveJump0=jumpClips;}
   return jumpClips;
  };
  if(this.formEvent&&this.formTime<this.formDuration&&sourceFormClipAdmitted(this)){
   special={name:this.formKid?'ToHuman':'ToSquid',frame:sourceFormFrame(this,this.bank.clips.get(this.formKid?'ToHuman':'ToSquid').frames)};state=special.name;
  }else if(!this.grounded){
   resolveJumpClips();`,
      'source-controller lazy jump clip lookup');
    code = replaceOnce(code,
      "  }else if(this.landTime<(jumpClips.end?.frames||0)/HOST_MOTION.fps){special={name:jumpBase+'_Ed',frame:this.landTime*HOST_MOTION.fps};state='land';}",
      "  }else if(this.landTime<10&&this.landTime<(resolveJumpClips().endSec??(jumpClips.end?.frames||0)/HOST_MOTION.fps)){special={name:jumpBase+'_Ed',frame:this.landTime*HOST_MOTION.fps};state='land';}",
      'source-controller lazy land clip check');
    code = replaceOnce(code,
      'if(stepAmplitude<1){const st=this._shortPoseArg||(this._shortPoseArg={wp:null,wq:null});st.wp=p.centers;st.wq=this.tmp.wq;this.shortTargets.add(st,item.weight);}',
      'if(stepAmplitude<1){const st=this._shortPoseArg||(this._shortPoseArg={wp:null,wq:null});st.wp=p.centers;st.wq=null;this.shortTargets.add(st,item.weight);}',
      'source-controller skip overwritten shortTargets wq slerp');
  }
  if (rel === 'src/game/character.js') {
    code = replaceOnce(code,
      '    const body = new THREE.Mesh(d.body, getPlasticMaterial()); body.castShadow = true;\n    const ink = new THREE.Mesh(d.ink, getInkMaterial(this.color)); ink.castShadow = true;',
      '    const body = new THREE.Mesh(d.body, getPlasticMaterial()); body.castShadow = true; body.matrixAutoUpdate = false;\n    const ink = new THREE.Mesh(d.ink, getInkMaterial(this.color)); ink.castShadow = true; ink.matrixAutoUpdate = false;',
      'character static bomb leaf mesh matrixAutoUpdate');
    code = replaceOnce(code,
      `    const body = new THREE.Mesh(d.bodyStatic || d.body, getPlasticMaterial()); body.castShadow = true;
    const ink = new THREE.Mesh(d.inkStatic || d.ink, getInkMaterial(this.color)); ink.castShadow = true;
    const bodyFar = new THREE.Mesh(d.body, getPlasticMaterial()); bodyFar.castShadow = true; bodyFar.visible = false;
    const inkFar = new THREE.Mesh(d.ink, getInkMaterial(this.color)); inkFar.castShadow = true; inkFar.visible = false;`,
      `    const body = new THREE.Mesh(d.bodyStatic || d.body, getPlasticMaterial()); body.castShadow = true; body.matrixAutoUpdate = false;
    const ink = new THREE.Mesh(d.inkStatic || d.ink, getInkMaterial(this.color)); ink.castShadow = true; ink.matrixAutoUpdate = false;
    const bodyFar = new THREE.Mesh(d.body, getPlasticMaterial()); bodyFar.castShadow = true; bodyFar.visible = false; bodyFar.matrixAutoUpdate = false;
    const inkFar = new THREE.Mesh(d.ink, getInkMaterial(this.color)); inkFar.castShadow = true; inkFar.visible = false; inkFar.matrixAutoUpdate = false;`,
      'character static weapon shell leaf mesh matrixAutoUpdate');
    code = replaceOnce(code,
      '      const m = new THREE.Mesh(pd.geo, mat); m.onBeforeRender = partGate; m.visible = pd.hidden !== true;',
      '      const m = new THREE.Mesh(pd.geo, mat); m.onBeforeRender = partGate; m.visible = pd.hidden !== true; m.matrixAutoUpdate = false;',
      'character weapon part leaf mesh matrixAutoUpdate');
    code = replaceOnce(code,
      '      m.bind(this.skeleton, IDENT);\n      m.castShadow = p.shadow; m.receiveShadow = true;',
      '      m.bind(this.skeleton, IDENT); m.matrixAutoUpdate = false;\n      m.castShadow = p.shadow; m.receiveShadow = true;',
      'character tier SkinnedMesh matrixAutoUpdate');
    code = replaceOnce(code,
      `      // trigger finger: the right index squeezes with the weapon's trigger blade (only while gripping)
      const trig = sd === 1 && this.weapon ? (this.weapon.trig || 0) * clamp(1 - Math.abs(h), 0, 1) : 0;
      for (let k = 0; k < 4; k++) {
        const casc = (k - 1.5) * 0.07 * relaxW; // the pinky side curls a little more than the index side
        const sq = k === 0 ? trig : 0;
        F.f1[k].rotation.set(FINGER_SPREAD[k] * (openW + 0.35 * relaxW), 0, side * (f1 - casc + life - 0.3 * sq));
        F.f2[k].rotation.set(0, 0, side * (f2 - casc * 0.8 + life * 0.5 - 0.35 * sq));
      }
      F.t1.rotation.set(hk(h, 0, 0, 0.35, 0.55), side * hk(h, -0.1, 0, 0, 0), side * hk(h, 0.12, 0, 0, 0));
      F.t2.rotation.set(0, 0, side * hk(h, 0.3, 0, -0.25, -0.5));`,
      `      // trigger finger: the right index squeezes with the weapon's trigger blade (only while gripping)
      const trig = sd === 1 && this.weapon ? (this.weapon.trig || 0) * clamp(1 - Math.abs(h), 0, 1) : 0;
      if (relaxW === 0 && life === 0 && F._iwSteady && Object.is(F._iwH, h) && Object.is(F._iwGq, gq) && Object.is(F._iwTrig, trig)) continue;
      for (let k = 0; k < 4; k++) {
        const casc = (k - 1.5) * 0.07 * relaxW; // the pinky side curls a little more than the index side
        const sq = k === 0 ? trig : 0;
        F.f1[k].rotation.set(FINGER_SPREAD[k] * (openW + 0.35 * relaxW), 0, side * (f1 - casc + life - 0.3 * sq));
        F.f2[k].rotation.set(0, 0, side * (f2 - casc * 0.8 + life * 0.5 - 0.35 * sq));
      }
      F.t1.rotation.set(hk(h, 0, 0, 0.35, 0.55), side * hk(h, -0.1, 0, 0, 0), side * hk(h, 0.12, 0, 0, 0));
      F.t2.rotation.set(0, 0, side * hk(h, 0.3, 0, -0.25, -0.5));
      if (relaxW === 0 && life === 0) { F._iwSteady = true; F._iwH = h; F._iwGq = gq; F._iwTrig = trig; } else F._iwSteady = false;`,
      'character steady-state finger rotation cache');
    code = replaceOnce(code,
      `    _sQb.copy(_sQp).invert().multiply(_sQa);
    L.up.quaternion.slerp(_sQb, weight);
    _by.copy(_sT).sub(_pE).normalize();
    _bz.crossVectors(_by, _pH);
    _m2.makeBasis(_by, _pH, _bz).multiply(L.Mf0T);
    _sQa.setFromRotationMatrix(_m2);
    _sQp.multiply(L.up.quaternion);
    _sQb.copy(_sQp).invert().multiply(_sQa);
    L.lo.quaternion.slerp(_sQb, weight);
    if (endQuat) {
      _sQp.multiply(L.lo.quaternion);
      _sQb.copy(_sQp).invert().multiply(_sEnd);
      L.end.quaternion.slerp(_sQb, weight);
    }`,
      `    _sQb.copy(_sQp).invert().multiply(_sQa);
    if (weight === 1) {
      const q = L.up.quaternion; let dot = q.dot(_sQb), x = _sQb._x, y = _sQb._y, z = _sQb._z, w = _sQb._w;
      if (dot < 0) { x = -x; y = -y; z = -z; w = -w; dot = -dot; }
      q._x = x + 0; q._y = y + 0; q._z = z + 0; q._w = w + 0;
      if (dot >= 0.9995) q.normalize(); else q._onChangeCallback();
    } else L.up.quaternion.slerp(_sQb, weight);
    _by.copy(_sT).sub(_pE).normalize();
    _bz.crossVectors(_by, _pH);
    _m2.makeBasis(_by, _pH, _bz).multiply(L.Mf0T);
    _sQa.setFromRotationMatrix(_m2);
    _sQp.multiply(L.up.quaternion);
    _sQb.copy(_sQp).invert().multiply(_sQa);
    if (weight === 1) {
      const q = L.lo.quaternion; let dot = q.dot(_sQb), x = _sQb._x, y = _sQb._y, z = _sQb._z, w = _sQb._w;
      if (dot < 0) { x = -x; y = -y; z = -z; w = -w; dot = -dot; }
      q._x = x + 0; q._y = y + 0; q._z = z + 0; q._w = w + 0;
      if (dot >= 0.9995) q.normalize(); else q._onChangeCallback();
    } else L.lo.quaternion.slerp(_sQb, weight);
    if (endQuat) {
      _sQp.multiply(L.lo.quaternion);
      _sQb.copy(_sQp).invert().multiply(_sEnd);
      if (weight === 1) {
        const q = L.end.quaternion; let dot = q.dot(_sQb), x = _sQb._x, y = _sQb._y, z = _sQb._z, w = _sQb._w;
        if (dot < 0) { x = -x; y = -y; z = -z; w = -w; dot = -dot; }
        q._x = x + 0; q._y = y + 0; q._z = z + 0; q._w = w + 0;
        if (dot >= 0.9995) q.normalize(); else q._onChangeCallback();
      } else L.end.quaternion.slerp(_sQb, weight);
    }`,
      'character _solveLimb exact weight===1 quaternion assign');
  }
  return code;
}
