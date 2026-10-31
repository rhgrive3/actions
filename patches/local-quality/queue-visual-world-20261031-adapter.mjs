// Residual 2026-10-31 queue changes, applied after all existing source adapters.
// Upstream snapshots and existing PR implementations remain untouched.
function once(code, before, after, label) {
  if (code.split(before).length !== 2) throw new Error('visual/world queue anchor: ' + label);
  return code.replace(before, after);
}
function scoped(code, start, end, edit) {
  const a = code.indexOf(start), b = code.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error('visual/world queue scope: ' + start);
  return code.slice(0, a) + edit(code.slice(a, b)) + code.slice(b);
}
export function adaptQueueVisualWorld20261031(rel, code) {
  const replace = (a, b, label) => { code = once(code, a, b, label); };
  if (rel === 'src/game/character.js') {
    replace('const lml = Math.hypot(lm.x, lm.z);', 'const lml = this.hs < 0.12 && sv > 0.4 ? Math.hypot(lm.x, lm.z) : 0;', 'unused treadmill norm');
    replace('const ex = dx - g.fx, ey = dy - g.fy, amp = Math.hypot(ex, ey);',
      'const ex = dx - g.fx, ey = dy - g.fy, ampSq = ex * ex + ey * ey;\n    const amp = dt > 0 && !(ampSq < 0.075 * 0.075 - 1e-15) ? Math.hypot(ex, ey) : 0;', 'conservative saccade norm gate');
    replace('const pump = Math.pow(Math.abs(Math.sin(Math.PI * b)), 0.6);', 'const sinBeat = Math.sin(Math.PI * b), pump = Math.pow(Math.abs(sinBeat), 0.6);', 'shared victory beat');
    replace('D[CHEST + 1] = 0.12 * Math.sin(Math.PI * b);', 'D[CHEST + 1] = 0.12 * sinBeat;', 'shared victory chest beat');
    replace('      const x = 0.07 * sd * ease(bf / 0.6);\n', '', 'unused victory ease');
    replace('      void x;\n', '', 'remove unused victory placeholder');
    replace('const life = 0.025 * Math.sin(this.t * 0.9 + sd * 2.1) * relaxW;',
      'const fingerAngle = this.t * 0.9 + sd * 2.1;\n      const life = relaxW === 0 && Number.isFinite(fingerAngle) ? 0 : 0.025 * Math.sin(fingerAngle) * relaxW;', 'zero-amplitude finger motion');
    replace('const dx = a.pos.x - R.x, dz = a.pos.z - R.z, d = Math.hypot(dx, dz);',
      `const dx = a.pos.x - R.x, dz = a.pos.z - R.z;
      // Math.max preserves the old NaN fall-through (including RNG consumption).
      if (Math.max(Math.abs(dx), Math.abs(dz)) > 18) continue;
      const d = Math.hypot(dx, dz);`, 'attention conservative axis bound');
    code = scoped(code, '  _solveLimb(', '\n  _updateHair(', part => {
      part = once(part, 'let dist = _pD.length();', 'const originalDistance = _pD.length();\n    let dist = originalDistance;', 'IK raw distance');
      return once(part, '_pD.normalize();', '_pD.divideScalar(originalDistance || 1);', 'IK unchanged normalization');
    });
    replace('if (_v4.length() > 34) _v4.setLength(34);',
      `const headAccSq = _v4.lengthSq();
    // Keep the old sqrt comparison close to the boundary and for NaN/Infinity.
    if (!(headAccSq < 1156 - 1e-8) && _v4.length() > 34) _v4.setLength(34);`, 'hair conservative acceleration gate');
  }
  if (rel === 'src/game/character-geo.js') {
    replace('const _shared = new Map();', 'const _shared = new Map();\nconst _sharedSquidVariants = new Map();', 'independent body and squid cache');
    replace('sh = { skin: buildSkin(lod), cloth: buildCloth(lod), eyes: buildEyes(lod), tank: buildTankParts(lod), squid: buildSquid(lod) };',
      'sh = { skin: buildSkin(lod), cloth: buildCloth(lod), eyes: buildEyes(lod), tank: buildTankParts(lod) };', 'retain body cache across squid quality changes');
    code = scoped(code, 'function nativeKidShared(', '\n/**', part => once(part, '  return sh;',
      `  const variantKey = key + '|' + hairDetail(lod).k;
  let variant = _sharedSquidVariants.get(variantKey);
  if (!variant) { variant = { ...sh, squid: buildSquid(lod) }; _sharedSquidVariants.set(variantKey, variant); }
  return variant;`, 'stable wrapper identity per squid detail'));
  }
  if (rel === 'src/world/environment.js') {
    code = "import { Float32Staging } from './attribute-staging.js';\n" + code;
    code = scoped(code, 'function makeIsland(o) {', '\n// ---------------------------------------------------------------------------------------------------------------\n// Environment', part => {
      const r = (a,b,label) => { part=once(part,a,b,label); };
      r('const pos = [], col = [], ao = [], idx = [], nor = [];',
        `const vertices = 1 + (R + 1) * S;
  const pos = new Float32Array(vertices * 3), col = new Float32Array(vertices * 3),
    ao = new Float32Array(vertices), nor = new Float32Array(vertices * 3),
    idx = new (vertices > 65535 ? Uint32Array : Uint16Array)(3 * S + 6 * R * S);
  let pi = 0, ci = 0, ai = 0, ni = 0, ii = 0;`, 'island exact capacity');
      r('const hW = (wx, wz) => { const [lx, lz] = toLocal(wx, wz); return hLocal(lx, lz); };',
        'const hW = (wx, wz) => { const dx = wx - cx, dz = wz - cz; return hLocal((dx * cr + dz * sr) / rx, (-dx * sr + dz * cr) / rz); };', 'island local scalar transform');
      r('const [wx, wz] = toWorld(lx, lz);', 'const wx = cx + lx * rx * cr - lz * rz * sr, wz = cz + lx * rx * sr + lz * rz * cr;', 'island world scalar transform');
      r('pos.push(wx, WATER_Y + hy, wz);', 'pos[pi++] = wx; pos[pi++] = WATER_Y + hy; pos[pi++] = wz;', 'island position staging');
      r('if (yOverride !== undefined) nor.push(0, 1, 0);', 'if (yOverride !== undefined) { nor[ni++] = 0; nor[ni++] = 1; nor[ni++] = 0; }', 'island skirt normal');
      r('nor.push(-gx * il, il, -gz * il);', 'nor[ni++] = -gx * il; nor[ni++] = il; nor[ni++] = -gz * il;', 'island normal staging');
      r('col.push(tint.r * tv, tint.g * tv, tint.b * tv);', 'col[ci++] = tint.r * tv; col[ci++] = tint.g * tv; col[ci++] = tint.b * tv;', 'island color staging');
      r('const lap = (hLocal(lx + dl, lz) + hLocal(lx - dl, lz) + hLocal(lx, lz + dl) + hLocal(lx, lz - dl)) / 4 - hy;\n    ao.push(yOverride !== undefined ? 1 : 1 - Math.min(1, Math.max(0, lap / (0.02 * h + 0.4))) * 0.42);',
        `if (yOverride !== undefined) ao[ai++] = 1;
    else {
      const lap = (hLocal(lx + dl, lz) + hLocal(lx - dl, lz) + hLocal(lx, lz + dl) + hLocal(lx, lz - dl)) / 4 - hy;
      ao[ai++] = 1 - Math.min(1, Math.max(0, lap / (0.02 * h + 0.4))) * 0.42;
    }`, 'island omit unused skirt AO');
      r('for (let sI = 0; sI < S; sI++) idx.push(0, ring(1, sI + 1), ring(1, sI));', 'for (let sI = 0; sI < S; sI++) { idx[ii++] = 0; idx[ii++] = ring(1, sI + 1); idx[ii++] = ring(1, sI); }', 'island fan index staging');
      r('idx.push(a, c, d, a, b, c);', 'idx[ii++] = a; idx[ii++] = c; idx[ii++] = d; idx[ii++] = a; idx[ii++] = b; idx[ii++] = c;', 'island ring index staging');
      for (const a of ['pos','nor','col','ao']) part=part.replace('new THREE.Float32BufferAttribute('+a+',', 'new THREE.BufferAttribute('+a+',');
      r('g.setIndex(idx);', 'g.setIndex(new THREE.BufferAttribute(idx, 1));', 'island typed index');
      r('geo: prep(g),', 'geo: g,', 'island preserve indexed terrain');
      return part;
    });
    replace('const toQ = (lx, lz) => { const c = Math.cos(qYaw), s = Math.sin(qYaw); return [qx + lx * c + lz * s, qz - lx * s + lz * c]; };',
      'const qCos = Math.cos(qYaw), qSin = Math.sin(qYaw);\n    const toQ = (lx, lz) => [qx + lx * qCos + lz * qSin, qz - lx * qSin + lz * qCos];', 'constant quay rotation');
    replace("geo.setAttribute('normal', new THREE.Int8BufferAttribute(new Int8Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3, false));",
      "const seaNormals = new Int8Array(pos.length);\n    for (let i = 1; i < seaNormals.length; i += 3) seaNormals[i] = 1;\n    geo.setAttribute('normal', new THREE.BufferAttribute(seaNormals, 3, false));", 'sea normal final storage');
    code = scoped(code, '  _buildMarinaFx(M) {', '\n  // Distance field', part => {
      const r=(a,b,label)=>{part=once(part,a,b,label);};
      r('const pos = [], nor = [], info = [];', 'const pos = new Float32Staging(3), nor = new Float32Staging(3), info = new Float32Staging(4);', 'marina final precision staging');
      r('pos.push(...a, ...b, ...c, ...a, ...c, ...d);', 'pos.push(...a); pos.push(...b); pos.push(...c); pos.push(...a); pos.push(...c); pos.push(...d);', 'marina stage each independent vertex');
      r('const under = [];', 'const under = new Float32Array(M.decks.length * 18);\n    let underOffset = 0;', 'marina exact underside capacity');
      r('under.push(...A, ...B, ...Cc, ...A, ...Cc, ...D);', 'under.set(A, underOffset); under.set(B, underOffset + 3); under.set(Cc, underOffset + 6); under.set(A, underOffset + 9); under.set(Cc, underOffset + 12); under.set(D, underOffset + 15); underOffset += 18;', 'marina underside staging');
      r('new THREE.Float32BufferAttribute(under, 3)', 'new THREE.BufferAttribute(under, 3)', 'marina underside final buffer');
      for(const [a,n] of [['pos',3],['nor',3],['info',4]]) r('new THREE.Float32BufferAttribute('+a+', '+n+')',a+'.attribute(THREE)','marina '+a+' final buffer');
      return part;
    });
    code = scoped(code, '  _buildFoamField(shapes) {', '\n  _', part => {
      part=once(part,'const reach = s.r + (s.reach ?? 3);',
        `const radius = s.r + range;
      // Padding only permits extra exact work; it can never clip a byte-changing pixel.
      const limit = Number.isFinite(s.r) && s.r >= 0 && Number.isFinite(radius)
        ? radius * radius * (1 + 1e-12) + 1e-12 : Infinity;
      const reach = s.r + (s.reach ?? 3);`, 'foam conservative bound');
      return once(part, 'const d = Math.max(0, Math.hypot(px - s.ax - dx * t, pz - s.az - dz * t) - s.r);',
        `const qx = px - s.ax - dx * t, qz = pz - s.az - dz * t;
        if (qx * qx + qz * qz > limit) continue;
        const d = Math.max(0, Math.hypot(qx, qz) - s.r);`, 'foam omit saturated distances');
    });
  }
  if (rel === 'src/world/props-marina-vessels.js') {
    replace(' _vertex(x,y,z,nx,ny,nz,r,g,b){', ` _reserveVertices(required){if(required*3<=this.p.length)return;const cap=required*3,used=this._vc*3;for(const key of ['p','n','c']){const a=new this[key].constructor(cap);a.set(this[key].subarray(0,used));this[key]=a;}}
 _vertex(x,y,z,nx,ny,nz,r,g,b){`, 'reserve known marina surface capacity');
    replace('const ni = rows.length, nj = rows[0].length, ids = [];', 'const ni = rows.length, nj = rows[0].length, ids = [];\n    mb._reserveVertices(mb._vc + ni * nj);', 'reserve before grid append');
    code = scoped(code, '  function gridSurface(', '\n  // Flat polygon', part => {
      // This private helper is called only for the local dense MB, and every
      // caller discards its result. Tests pin both contracts and emitted bytes.
      part = once(part, 'const ni = rows.length, nj = rows[0].length, ids = [];', 'const ni = rows.length, nj = rows[0].length, base = mb._vc;', 'grid dense vertex base');
      part = once(part, 'mb._reserveVertices(mb._vc + ni * nj);', 'mb._reserveVertices(base + ni * nj);', 'retain grid capacity reservation');
      part = once(part, '      const row = [];\n', '', 'omit grid ID row');
      part = once(part, 'row.push(mb.v(p[0], p[1], p[2], nx, ny, nz, colorFn ? colorFn(p[0], p[1], p[2], i, j) : null));', 'mb.v(p[0], p[1], p[2], nx, ny, nz, colorFn ? colorFn(p[0], p[1], p[2], i, j) : null);', 'retain grid vertex order');
      part = once(part, '      ids.push(row);\n', '', 'omit grid ID matrix');
      part = once(part, '    for (let i = 0; i < ni - 1; i++) for (let j = 0; j < nq; j++) mb.quad(ids[i][j], ids[i + 1][j], ids[i + 1][(j + 1) % nj], ids[i][(j + 1) % nj]);', `    for (let i = 0; i < ni - 1; i++) {
      const a = base + i * nj, b = a + nj;
      for (let j = 0; j < nq; j++) { const k = (j + 1) % nj; mb.quad(a + j, b + j, b + k, a + k); }
    }`, 'derive dense grid indices');
      return once(part, '    return ids;\n', '', 'omit unused grid return');
    });
    replace('const t = (k + 0.5) / 4.4, p = ropePts(hy0, hy1, 0.04, 40)[Math.round(t * 40)];', 'const t = (k + 0.5) / 4.4, p = pennantPoints[Math.round(t * 40)];', 'reuse pennant samples');
    replace("const pc = [C.teal, C.mustard, C.coral, C.navy];", "const pc = [C.teal, C.mustard, C.coral, C.navy];\n      const pennantPoints = ropePts(hy0, hy1, 0.04, 40);", 'one pennant sampling pass');
    code = scoped(code, '  function makeHull(sp) {', '\n  function hullOf(', part => {
      part = once(part, '        const row = [];\n        for (const side of [-1, 1]) {', '        const row = [], s0 = yAt(t, a0), s1 = yAt(t, a1);\n        for (const side of [-1, 1]) {', 'hull band shares side-independent height bisection');
      return once(part, 'const pa = at(t, yAt(t, a0), side), pb = at(t, yAt(t, a1), side);', 'const pa = at(t, s0, side), pb = at(t, s1, side);', 'hull band retains ordered side vertices');
    });
  }
  if (rel === 'src/world/props-core.js') {
    code = scoped(code, 'function* mergePartSteps(parts, withUV=true) {', '\nconst triCountOf', part => {
      part = once(part, '  let vo = 0, io = 0;', '  let vo = 0, io = 0;\n  const mergedBox = new THREE.Box3();', 'prop merge bounds owner');
      part = once(part, '      pos[o] = _v.x; pos[o + 1] = _v.y; pos[o + 2] = _v.z;',
        `      pos[o] = _v.x; pos[o + 1] = _v.y; pos[o + 2] = _v.z;
      // Match Box3.expandByPoint using the stored Float32 coordinates; _v remains double for AO.
      mergedBox.min.x = Math.min(mergedBox.min.x, pos[o]); mergedBox.min.y = Math.min(mergedBox.min.y, pos[o + 1]); mergedBox.min.z = Math.min(mergedBox.min.z, pos[o + 2]);
      mergedBox.max.x = Math.max(mergedBox.max.x, pos[o]); mergedBox.max.y = Math.max(mergedBox.max.y, pos[o + 1]); mergedBox.max.z = Math.max(mergedBox.max.z, pos[o + 2]);`, 'prop merge folded exact bounds');
      return once(part, '    const box = g.boundingBox = new THREE.Box3();\n    for (let i = 0; i < nv; i++) { box.expandByPoint(_v.fromArray(pos, i * 3)); if ((i & 1023) === 1023) yield; }',
        '    const box = g.boundingBox = mergedBox;', 'omit prop bbox-only scan');
    });
  }
  if (rel === 'src/game/motion/squid-rig.js') {
    replace("scale=1,yaw=0}={}){", "scale=1,yaw=0,deformVisibleEyes=true}={}){", 'explicit caller eye visibility contract');
    replace("if(!((form==='swim'||form==='climb')&&!c.isLocal))this.deformEyes();", "if(deformVisibleEyes&&!((form==='swim'||form==='climb')&&!c.isLocal))this.deformEyes();", 'skip hidden eyes only under caller contract');
    replace('c.model.getWorldQuaternion(this.q).invert();sq.pivot.quaternion.premultiply(this.q);c.root.getWorldPosition(this.v);this.v.y+=0.26;this.v.addScaledVector(normal,-c.climbInset-0.07);sq.pivot.position.copy(c.model.worldToLocal(this.v));',
      `c.model.getWorldQuaternion(this.q).invert();sq.pivot.quaternion.premultiply(this.q);
   // getWorldQuaternion has updated this direct parent chain. Preserve the generic API otherwise.
   if(c.model.parent===c.root)this.v.setFromMatrixPosition(c.root.matrixWorld);else c.root.getWorldPosition(this.v);
   this.v.y+=0.26;this.v.addScaledVector(normal,-c.climbInset-0.07);
   sq.pivot.position.copy(c.model.parent===c.root?this.v.applyMatrix4(this.m.copy(c.model.matrixWorld).invert()):c.model.worldToLocal(this.v));`, 'reuse current climb ancestor matrices');
  }
  if (rel === 'src/game/motion/source-controller.js') replace('this._driveSquidArgs.scale=this.character.sqScale,this._driveSquidArgs)', "this._driveSquidArgs.scale=this.character.sqScale,this._driveSquidArgs.deformVisibleEyes=!(s.form==='climb'||(s.form==='swim'&&this.character.grounded)),this._driveSquidArgs)", 'S3 final submerged-eye visibility');
  if (rel === 'src/game/bots.js') {
    code += '\nconst IW_NEAR_WATER_BASIS = Array.from({length:8}, (_, k) => { const t = (k / 8) * Math.PI * 2; return [Math.cos(t), Math.sin(t)]; });\nconst _egCos0 = Math.cos(0.8), _egSin0 = Math.sin(0.8), _egCos1 = Math.cos(1.45), _egSin1 = Math.sin(1.45);\n';
    replace('for (let k = 0; k < 8; k++) { const t = (k / 8) * Math.PI * 2; if (this._wet(a.pos.x + Math.cos(t) * r, a.pos.z + Math.sin(t) * r, a.pos.y)) return true; }',
      'for (let k = 0; k < 8; k++) { const basis = IW_NEAR_WATER_BASIS[k]; if (this._wet(a.pos.x + basis[0] * r, a.pos.z + basis[1] * r, a.pos.y)) return true; }', 'fixed near-water octants');
    replace('    const _egCos0 = Math.cos(0.8), _egSin0 = Math.sin(0.8), _egCos1 = Math.cos(1.45), _egSin1 = Math.sin(1.45);\n', '', 'fixed edge-guard coefficients initialized once');
  }
  if (rel === 'src/main.js') {
    replace('    const muralReady = createMuralTexture(map.layout || map.id).then(value => ({ ok: true, value }), error => ({ ok: false, error }));',
      `    // Native ink fixes the mural selector to -1; direct native play needs no mural canvas.
    const deferNativeMural = params.has('autostart') && nativeStageEnabled && NATIVE_IDS.includes(map.layout || map.id);
    const muralReady = deferNativeMural ? Promise.resolve({ ok: true, value: null })
      : createMuralTexture(map.layout || map.id).then(value => ({ ok: true, value }), error => ({ ok: false, error }));`, 'native direct boot defers unused mural canvas');
    replace("    try { const propRuntime = await import('./world/prop-packs.js'); this.PropKit = propRuntime.PropKit; this.preparePropPacks = propRuntime.preparePropPacks; } catch (e) { console.error('[inkwave] prop kit failed to load', e); this.PropKit = null; }", '    // Legacy prop runtime is acquired only when a legacy stage is requested.', 'native boot avoids legacy prop core');
    replace('    if (this.preparePropPacks && !await this.preparePropPacks(map.layout || map.id, worldCurrent)) return;\n', '', 'move pack preparation into legacy branch');
    replace('  async _buildWorld(map, flow = null, theme = null) {', `  async _prepareLegacyPropRuntime(layoutId, current) {
    if (!this.PropKit) {
      const pending = this._legacyPropRuntime || (this._legacyPropRuntime = import('./world/prop-packs.js'));
      let runtime;
      try { runtime = await pending; }
      catch (e) {
        if (this._legacyPropRuntime === pending) this._legacyPropRuntime = null;
        if (!current()) return false;
        console.error('[inkwave] prop kit failed to load', e); this.PropKit = null;
      }
      if (!current()) return false;
      if (runtime) { this.PropKit = runtime.PropKit; this.preparePropPacks = runtime.preparePropPacks; }
    }
    if (!current()) return false;
    return !this.preparePropPacks || await this.preparePropPacks(layoutId, current);
  }
  async _prepareLegacyMurals(layoutId, current) {
    if (!current()) return false;
    if (this.murals) return true;
    let task = this._legacyMuralTask;
    if (!task) {
      task = { users: 0, value: null, promise: null };
      this._legacyMuralTask = task;
      task.promise = createMuralTexture(layoutId).then(value => { task.value = value; return value; });
    }
    task.users++;
    try {
      const texture = await task.promise;
      if (!current()) return false;
      this.murals = texture;
      return true;
    } catch (error) {
      if (current()) throw error;
      return false;
    } finally {
      if (--task.users === 0) {
        if (this._legacyMuralTask === task) this._legacyMuralTask = null;
        if (task.value && this.murals !== task.value) task.value.dispose();
      }
    }
  }
  async _buildWorld(map, flow = null, theme = null) {`, 'cancel-safe reusable legacy import and mural owner');
    replace('    this._nativeAbort?.abort();\n    this._builtQuality', '    if (!await this._prepareLegacyPropRuntime(layoutId, worldCurrent) || !worldCurrent()) return;\n    if (!await this._prepareLegacyMurals(layoutId, worldCurrent) || !worldCurrent()) return;\n    this._nativeAbort?.abort();\n    this._builtQuality', 'legacy resources after native-stage branch');
  }
  return code;
}
