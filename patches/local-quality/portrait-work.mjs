import { cachePortrait, releasePortrait } from './resource-budget.mjs';

const STRUCTURAL = new Set([
  'root', 'model', 'kid', 'squidRoot', 'u', 'mats', 'matsD', '_ownMats', 'skeleton', 'bones', 'boneList',
  'lodSets', 'meshes', 'weapons', 'weapon', 'weaponKind', 'hold', 'dual', 'style', 'rest', 'hairMeta', 'limbs',
  'legReach', 'faceRest', 'cheekRest', 'xb', 'fing', 'hairBones', 'hairIn', 'hairAx', 'hairA1', 'hairA2',
  'hairPh', 'hairTips', 'hairSpring', '_portraitAppliedStyle', '_portraitSkins', '_portraitState',
  '_portraitObjects', '_portraitWeaponStates',
  '_portraitUniformState',
]);

function copyState(value, seen = new Map()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  if (ArrayBuffer.isView(value)) {
    const copy = new value.constructor(value);
    seen.set(value, copy);
    return copy;
  }
  if (value.isColor || value.isVector2 || value.isVector3 || value.isVector4 || value.isQuaternion || value.isEuler || value.isMatrix3 || value.isMatrix4) {
    const copy = value.clone();
    seen.set(value, copy);
    return copy;
  }
  if (Array.isArray(value)) {
    const copy = [];
    seen.set(value, copy);
    for (const item of value) copy.push(copyState(item, seen));
    return copy;
  }
  if (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) {
    const copy = Object.create(Object.getPrototypeOf(value));
    seen.set(value, copy);
    for (const key of Object.keys(value)) copy[key] = copyState(value[key], seen);
    return copy;
  }
  return value;
}

function styleKey(style) {
  return ['hair', 'skin', 'outfit', 'eyes', 'hat', 'brows'].map((key) => style[key]).join(':');
}

function snapshotUniforms(uniforms) {
  const values = {}, seen = new Map();
  for (const key of Object.keys(uniforms)) values[key] = copyState(uniforms[key]?.value, seen);
  return values;
}

function restoreUniforms(uniforms, snapshot) {
  for (const key of Object.keys(snapshot)) {
    const uniform = uniforms[key];
    if (!uniform) continue;
    const current = uniform.value, saved = snapshot[key];
    if (current && saved && typeof current.copy === 'function') current.copy(saved);
    else if (ArrayBuffer.isView(current) && ArrayBuffer.isView(saved) && current.length === saved.length) current.set(saved);
    else uniform.value = copyState(saved);
  }
}

function rememberObject(c, object) {
  if (c._portraitObjects.has(object)) return;
  c._portraitObjects.set(object, {
    position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone(),
    visible: object.visible, matrixAutoUpdate: object.matrixAutoUpdate, castShadow: object.castShadow,
    receiveShadow: object.receiveShadow, frustumCulled: object.frustumCulled, renderOrder: object.renderOrder,
  });
}

function restoreObjects(c) {
  c.root.traverse((object) => {
    rememberObject(c, object);
    const state = c._portraitObjects.get(object);
    object.position.copy(state.position);
    object.quaternion.copy(state.quaternion);
    object.scale.copy(state.scale);
    object.visible = state.visible;
    object.matrixAutoUpdate = state.matrixAutoUpdate;
    object.castShadow = state.castShadow;
    object.receiveShadow = state.receiveShadow;
    object.frustumCulled = state.frustumCulled;
    object.renderOrder = state.renderOrder;
    object.updateMatrix();
  });
}

function snapshotWeapon(c, weapon) {
  if (!weapon || c._portraitWeaponStates.has(weapon)) return;
  const state = {};
  for (const key of Object.keys(weapon)) {
    const value = weapon[key];
    if (key === 'left') continue;
    if (value === null || ['string', 'number', 'boolean'].includes(typeof value) || ArrayBuffer.isView(value)) state[key] = copyState(value);
  }
  c._portraitWeaponStates.set(weapon, state);
  snapshotWeapon(c, weapon.left);
}

function restoreWeapon(c, weapon) {
  if (!weapon) return;
  const state = c._portraitWeaponStates.get(weapon);
  if (state) {
    for (const key of Object.keys(weapon)) {
      const value = weapon[key];
      if (key !== 'left' && !(key in state) && (value === null || ['string', 'number', 'boolean'].includes(typeof value) || ArrayBuffer.isView(value))) delete weapon[key];
    }
    for (const key of Object.keys(state)) weapon[key] = copyState(state[key]);
  }
  restoreWeapon(c, weapon.left);
}

function refreshStyleRig(c, style, api) {
  c.style = style;
  const rest = api.getRestPositions(style);
  c.rest = rest;
  for (const name of api.BONE_NAMES) {
    const parent = api.BONE_PARENT[name];
    const bone = c.bones[name];
    if (parent) bone.position.copy(rest[name]).sub(rest[parent]);
    else bone.position.copy(rest[name]);
  }
  c.skeleton.boneInverses = api.getBoneInverses(style).map((matrix) => matrix.clone());
  c.skeleton.update();

  const hair = api.getHairStyle(style);
  c.hairMeta = hair.meta;
  const v1 = new api.THREE.Vector3(), v2 = new api.THREE.Vector3(), v3 = new api.THREE.Vector3(), v4 = new api.THREE.Vector3();
  const hc = rest.head.clone().add(api.HEAD_CTR);
  c.hairIn.fill(0); c.hairAx.fill(0); c.hairA1.fill(0); c.hairA2.fill(0);
  for (let strand = 0; strand < c.hairMeta.length; strand++) {
    const root = rest[`hair${strand}_0`];
    if (root) {
      v1.subVectors(hc, root).normalize();
      c.hairIn[strand * 3] = v1.x; c.hairIn[strand * 3 + 1] = v1.y; c.hairIn[strand * 3 + 2] = v1.z;
    }
    for (let segment = 0; segment <= api.HAIR_SEGS; segment++) {
      const a = rest[segment < api.HAIR_SEGS ? `hair${strand}_${segment}` : `hairTip${strand}`];
      const b = segment < api.HAIR_SEGS - 1 ? rest[`hair${strand}_${segment + 1}`] : segment === api.HAIR_SEGS - 1 ? rest[`hairTip${strand}`] : null;
      if (!a) continue;
      if (b) v1.subVectors(b, a);
      else {
        const previous = (strand * (api.HAIR_SEGS + 1) + segment - 1) * 3;
        v1.set(c.hairAx[previous], c.hairAx[previous + 1], c.hairAx[previous + 2]);
      }
      if (v1.lengthSq() < 1e-10) v1.set(0, -1, 0);
      v1.normalize(); v2.subVectors(a, hc).normalize();
      v3.crossVectors(v1, v2); if (v3.lengthSq() < 1e-8) v3.set(1, 0, 0); v3.normalize();
      v4.crossVectors(v1, v3).normalize();
      const index = (strand * (api.HAIR_SEGS + 1) + segment) * 3;
      c.hairAx[index] = v1.x; c.hairAx[index + 1] = v1.y; c.hairAx[index + 2] = v1.z;
      c.hairA1[index] = v3.x; c.hairA1[index + 1] = v3.y; c.hairA1[index + 2] = v3.z;
      c.hairA2[index] = v4.x; c.hairA2[index + 1] = v4.y; c.hairA2[index + 2] = v4.z;
    }
  }
  c.hairBones = [];
  for (let strand = 0; strand < api.HAIR_MAX; strand++) for (let segment = 0; segment < api.HAIR_SEGS; segment++) c.hairBones.push(c.bones[`hair${strand}_${segment}`]);
  c.hairTips = [];
  for (let strand = 0; strand < api.HAIR_MAX; strand++) c.hairTips.push(c.bones[`hairTip${strand}`] || null);
  c.xb = {
    jaw: c.bones.jaw || null, lidL: c.bones.lidL || null, lidR: c.bones.lidR || null, tank: c.bones.tank || null,
    hem: c.bones.hem || null, hemF: c.bones.hemF || null, hemB: c.bones.hemB || null, toeL: c.bones.toeL || null,
    toeR: c.bones.toeR || null, earL: c.bones.earL || null, earR: c.bones.earR || null,
    cheekL: c.bones.cheekL || null, cheekR: c.bones.cheekR || null,
  };
  c.faceRest = { browL: c.bones.browL.position.clone(), browR: c.bones.browR.position.clone() };
  c.cheekRest = [c.xb.cheekL?.position.clone() || null, c.xb.cheekR?.position.clone() || null];
  const lim = (up, lo, end, side) => {
    const a = c.bones[lo].position.length(), b = c.bones[end].position.length();
    const direction = c.bones[lo].position.clone().normalize();
    const h0 = new api.THREE.Vector3(side, 0, 0);
    const basis = (v) => {
      const axis = h0.clone().addScaledVector(v, -h0.dot(v)).normalize();
      const normal = new api.THREE.Vector3().crossVectors(v, axis);
      return new api.THREE.Matrix4().makeBasis(v, axis, normal).transpose();
    };
    return { up: c.bones[up], lo: c.bones[lo], end: c.bones[end], a, b, Mu0T: basis(direction), Mf0T: basis(c.bones[end].position.clone().normalize()) };
  };
  c.limbs = {
    armL: lim('uArmL', 'fArmL', 'handL', -1), armR: lim('uArmR', 'fArmR', 'handR', -1),
    legL: lim('thighL', 'shinL', 'footL', 1), legR: lim('thighR', 'shinR', 'footR', 1),
  };
  c.legReach = (c.limbs.legL.a + c.limbs.legL.b) * 0.985;

  for (const set of c.lodSets) if (set) for (const mesh of set.list) c.kid.remove(mesh);
  for (const side of c.matsD) for (const key of Object.keys(side)) side[key].dispose();
  c.matsD = [{}, {}]; c.lodSets = [null, null, null]; c.lod.tier = -1;
  c._setTier(api.T_GAME);
  c.root.updateMatrixWorld(true);
  c.skeleton.update();
}

export function installPortraitCharacterReuse(Character, api) {
  Character.prototype.preparePortraitReuse = function preparePortraitReuse() {
    if (this._portraitState) return;
    this._portraitState = {};
    const seen = new Map();
    for (const key of Object.keys(this)) if (!STRUCTURAL.has(key)) this._portraitState[key] = copyState(this[key], seen);
    this._portraitObjects = new WeakMap();
    this.root.traverse((object) => rememberObject(this, object));
    this._portraitUniformState = snapshotUniforms(this.u);
    this._portraitWeaponStates = new WeakMap();
    this._portraitSkins = new Map([[this.style.skin, this.mats.skin]]);
    this._portraitAppliedStyle = styleKey(this.style);
    this._rendered = false; this._camOK = false; this._camFrame = -1;
    for (const kind of Object.keys(this.weapons)) snapshotWeapon(this, this.weapons[kind]);
  };

  Character.prototype.resetPortraitForRequest = function resetPortraitForRequest(request) {
    this.preparePortraitReuse();
    const weapons = this.weapons;
    for (const kind of Object.keys(weapons)) {
      const weapon = weapons[kind];
      this.bones.handR.remove(weapon.pivot);
      if (weapon.left) this.bones.handL.remove(weapon.left.pivot);
      restoreWeapon(this, weapon);
    }
    const seen = new Map();
    for (const key of Object.keys(this._portraitState)) this[key] = copyState(this._portraitState[key], seen);
    this.weapons = weapons; this.weapon = null; this.weaponKind = null; this.hold = null; this.dual = false;
    restoreUniforms(this.u, this._portraitUniformState);
    this._wst.color = this.color;
    this._rendered = false; this._camOK = false; this._camFrame = -1;
    restoreObjects(this);
    const style = api.resolveStyle(request.style || {}, this.seed);
    if (styleKey(style) !== this._portraitAppliedStyle) {
      refreshStyleRig(this, style, api);
      this._portraitAppliedStyle = styleKey(style);
    } else this.style = style;
    api.STYLE.applyStyleUniforms(this.u, style);
    const skin = this._portraitSkins.get(style.skin) || api.makeSkinMaterial(this.u, api.SKIN_TONES[style.skin]);
    this.u.uFreckle.value = skin.userData.iwLum != null && Math.abs(skin.userData.iwLum - 0.5) < 0.2 && new api.THREE.Color(api.SKIN_TONES[style.skin]).r > 0.8 ? 1 : 0;
    this._portraitSkins.set(style.skin, skin); this.mats.skin = skin;
    for (const set of this.lodSets) if (set) for (const mesh of set.list) mesh.material = this._matFor(mesh.userData.iwMat);
    this.setColor(request.color || this.color);
    this.setWeapon(request.weapon || 'shooter');
    snapshotWeapon(this, this.weapon);
    this.root.traverse((object) => rememberObject(this, object));
    const random = api.mulberry(this.seed);
    for (let i = 0; i < this.hairMeta.length; i++) this.hairPh[i] = random() * api.TAU;
    this.shufT = 4 + random() * 6; this.shiftT = 2 + random() * 3; this.nextFidget = 3 + random() * 3;
    this.bl.next = 0.6 + random() * 2.5; this.att.t = 0.3 + random() * 0.8; this.mxT = 2 + random() * 4;
    this.sighT = 4 + random() * 5; this.gripT = 4 + random() * 5; this.lookT = 0.5 + random(); this.earT = 3 + random() * 4;
    this.rng = random;
    this.setDance(request.kind === 'body' ? 'lobby_pose' : 'menu_idle');
    return this;
  };

  const dispose = Character.prototype.dispose;
  Character.prototype.dispose = function disposePortraitSkins() {
    if (this._portraitSkins) {
      for (const material of new Set(this._portraitSkins.values())) if (material !== this.mats.skin) material.dispose();
      this._portraitSkins.clear();
    }
    return dispose.call(this);
  };
}

function scheduleIdle(owner, callback) {
  if (typeof globalThis.requestIdleCallback === 'function') {
    const id = globalThis.requestIdleCallback(callback, { timeout: 120 });
    return { type: 'idle', id };
  }
  return { type: 'timeout', id: globalThis.setTimeout(() => callback({ didTimeout: true, timeRemaining: () => 0 }), 0) };
}

function cancelIdle(task) {
  if (!task) return;
  if (task.type === 'idle' && typeof globalThis.cancelIdleCallback === 'function') globalThis.cancelIdleCallback(task.id);
  else globalThis.clearTimeout(task.id);
}

function portraitModeProtected(showcase, overlayModes) {
  return showcase.mode === 'results' || (!overlayModes.has(showcase.mode) && showcase._out > 0 && showcase._lastMode === 'results');
}

function clearPortraitPointers(showcase) {
  showcase._portraitPreparedCharacter = null;
  showcase._portraitActiveCharacter = null;
}

function requeuePortraitJob(showcase, job) {
  if (showcase._portraitJob !== job) return;
  if (!job.cbs.length) {
    showcase._portraitJob = null;
    clearPortraitPointers(showcase);
    return;
  }
  const duplicate = showcase._pq.findIndex((queued) => queued !== job && queued.key === job.key);
  if (duplicate >= 0) job.cbs.push(...showcase._pq.splice(duplicate, 1)[0].cbs);
  const existing = showcase._pq.indexOf(job);
  if (existing >= 0) showcase._pq.splice(existing, 1);
  showcase._pq.unshift(job);
  showcase._portraitJob = null;
  clearPortraitPointers(showcase);
}

export function installPortraitWork(Showcase, G, copyCanvas, overlayModes) {
  const nativePortraitStep = Showcase.prototype._portraitStep;
  Showcase.prototype._portraitStep = function stagedPortraitStep() {
    if (!this._portraitCharacter) return nativePortraitStep.call(this);
    if (portraitModeProtected(this, overlayModes)) return;
    if (this._warmState !== 'done' || (this._pflight || 0) >= 2 || this._portraitTask) return;
    if (!this._portraitJob) {
      while (this._pq.length && !this._pq[0].cbs.length) this._pq.shift();
      this._portraitJob = this._pq.shift() || null;
    }
    const job = this._portraitJob;
    if (!job) return;
    if (job._portraitCacheEpoch == null) job._portraitCacheEpoch = this._portraitCacheEpoch || 0;
    const cacheEpoch = job._portraitCacheEpoch;
    const started = performance.now();
    let step = 0;
    let animation = null;
    const run = (callback) => {
      this._portraitTask = scheduleIdle(this, (deadline) => {
        this._portraitTask = null;
        if (this._portraitJob !== job) return;
        if (job.cbs.length === 0) {
          this._portraitJob = null;
          clearPortraitPointers(this);
          return;
        }
        if (portraitModeProtected(this, overlayModes)) {
          requeuePortraitJob(this, job);
          return;
        }
        try { callback(deadline); } catch (error) {
          console.error('[showcase] staged portrait', error);
          if (this._portraitJob === job) this._portraitJob = null;
          clearPortraitPointers(this);
          finish(null);
        }
      });
    };
    const finish = (canvas) => {
      this.portraitMs = performance.now() - started;
      for (const cb of job.cbs) { try { cb(canvas ? copyCanvas(canvas) : null); } catch (error) { console.error('[showcase] portrait cb', error); } }
      const retained = canvas && cachePortrait(this, job.key, canvas, !!G.game?.mobile?.touch, cacheEpoch);
      if (canvas && !retained) releasePortrait(canvas);
      if (this._portraitJob === job) this._portraitJob = null;
    };
    const render = () => {
      if (portraitModeProtected(this, overlayModes)) {
        requeuePortraitJob(this, job);
        return;
      }
      let read;
      try {
        this._portraitActiveCharacter = this._portraitCharacter || null;
        read = this._renderPortrait(job.req);
      } catch (error) {
        console.error('[showcase] portrait', error);
        clearPortraitPointers(this);
        finish(null);
        return;
      }
      clearPortraitPointers(this);
      if (!read) { finish(null); return; }
      this._pflight = (this._pflight || 0) + 1;
      if (this._portraitJob === job) this._portraitJob = null;
      Promise.resolve(read).then((canvas) => {
        this._pflight--; finish(canvas);
      }, (error) => {
        this._pflight--; console.error('[showcase] portrait read', error); finish(null);
      });
    };
    const update = () => {
      const character = this._portraitCharacter;
      animation.time = step / 30;
      character.update(1 / 30, animation);
      step++;
      if (step < 14) run(update); else run(render);
    };
    run(() => {
      const character = this._portraitCharacter;
      if (!character || typeof character.resetPortraitForRequest !== 'function') throw new Error('portrait pool not ready');
      character.resetPortraitForRequest(job.req);
      animation = this._anim();
      this._portraitPreparedCharacter = character;
      step = 0;
      run(update);
    });
  };

  const renderPortraitRun = Showcase.prototype._renderPortraitRun;
  Showcase.prototype._renderPortraitRun = function renderPooledPortrait(req, size, kind, renderer) {
    this._portraitActiveCharacter = this._portraitPreparedCharacter || null;
    try { return renderPortraitRun.call(this, req, size, kind, renderer); }
    finally { this._portraitPreparedCharacter = null; this._portraitActiveCharacter = null; }
  };

  const dispose = Showcase.prototype.dispose;
  Showcase.prototype.dispose = function disposePortraitPool() {
    cancelIdle(this._portraitTask); this._portraitTask = null; this._portraitJob = null;
    clearPortraitPointers(this);
    if (this._portraitCharacter) {
      this.scene.remove(this._portraitCharacter.root);
      this._portraitCharacter.dispose?.();
      this._portraitCharacter = null;
    }
    return dispose.call(this);
  };
}
