// Profile-only paint work reduction. Original vertices, fragment coordinates,
// blending order, fixed simulation, and mip regeneration cadence are retained.
import * as THREE from 'three';
import { profilePaintBounds, PROFILE_BATCH_LIMIT } from './paint-profile-bounds.mjs';
import { profileShaderSources } from './paint-profile-shader.mjs';
import { profileShaderCompatibility } from './paint-profile-compatibility.mjs';
const MATERIAL_KEYS = Object.freeze(['version','blending','blendSrc','blendDst','blendSrcAlpha','blendDstAlpha','blendEquation','blendEquationAlpha','transparent','premultipliedAlpha','depthTest','depthWrite','colorWrite','side','polygonOffset','stencilWrite','alphaTest','toneMapped','wireframe','wireframeLinewidth','alphaToCoverage','forceSinglePass','polygonOffsetFactor','polygonOffsetUnits']);
function profileTextureOkay(texture) {
  return texture?.type===THREE.UnsignedByteType && texture.format===THREE.RGBAFormat &&
    texture.colorSpace===THREE.NoColorSpace && texture.image?.width===128 && texture.image?.height===16 &&
    texture.image.data instanceof Uint8Array && texture.minFilter===THREE.NearestFilter && texture.magFilter===THREE.NearestFilter;
}
const INSTALLED = Symbol.for('inkwave.paint-profile-batch.v2'), KEY = '_iwPaintProfileBatch';

function allocate(paint) {
  const r = paint.renderer, gl = r?.getContext?.(), target = paint.rt, material = paint.mat;
  if (paint.level?.native || !gl || typeof r.renderBufferDirect !== 'function' ||
      target?.texture?.type !== THREE.UnsignedByteType || target.texture.format !== THREE.RGBAFormat ||
      target.width !== paint.size || target.height !== paint.size || target.samples !== 0 ||
      material !== paint.mesh?.material || !profileTextureOkay(paint.mat?.uniforms?.uMainInkProfiles?.value) ||
      target.texture.colorSpace!==THREE.NoColorSpace || material.side!==THREE.FrontSide ||
      material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile ||
      material.onBeforeRender !== THREE.Material.prototype.onBeforeRender ||
      paint.mesh.onAfterRender !== THREE.Object3D.prototype.onAfterRender ||
      paint.mesh.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return null;
  const sources = profileShaderSources(material);
  if (!sources) return null;
  const fast = material.clone();
  fast.name = 'INKWAVE exact profile paint'; fast.uniforms = material.uniforms;
  fast.vertexShader = sources.vertex; fast.fragmentShader = sources.fragment;
  let compatibility;
  try { compatibility = profileShaderCompatibility(r, material, fast); }
  catch { fast.dispose(); return null; }
  if (!compatibility.compatible) { fast.dispose(); return null; }
  // Prime the owned program at initialization, never on the first shot.
  const scene = new THREE.Scene(), mesh = new THREE.Mesh(paint.geo, fast);
  mesh.frustumCulled = false; scene.add(mesh);
  const beforeTarget=r.getRenderTarget(),beforeFace=r.getActiveCubeFace?.()||0,beforeMip=r.getActiveMipmapLevel?.()||0;
  try {
    r.setRenderTarget(target);
    r.compile(scene, paint.cam);
    // Finish link admission while initialization owns the cost. Never retain
    // an unused canvas-colorspace program or query it after disposal.
    r.properties.get(fast).currentProgram?.getUniforms();
  } catch (error) { fast.dispose(); return null; }
  finally { r.setRenderTarget(beforeTarget,beforeFace,beforeMip); }
  const state = { fast, compatibility, level:paint.level, target, material, materialState: MATERIAL_KEYS.map(key=>material[key]), geometry: paint.geo, mesh: paint.mesh,
    vertex: material.vertexShader, fragment: material.fragmentShader, uniforms: material.uniforms,
    profile:material.uniforms.uMainInkProfiles.value,profileVersion:material.uniforms.uMainInkProfiles.value.version,
    index: paint.geo.index, indexVersion: paint.geo.index?.version,
    positions: paint.geo.attributes.aPos?.array, local: paint.geo.attributes.aLocal?.array,
    splat: paint.geo.attributes.aSplat?.array, stretch: paint.geo.attributes.aStretch?.array,
    growth: paint.geo.attributes.aGrow?.array,
    rectangles: new Int32Array(PROFILE_BATCH_LIMIT * 4), scissor: new THREE.Vector4(),
    rangeStart: 0, rangeCount: 0, scissorTest: false, active: false, prepared: false, preparedCount: 0,
    before: material.onBeforeRender, after: paint.mesh.onAfterRender,
    counters: { batches: 0, stampDraws: 0, originalRasterPixels: 0, clippedRasterPixels: 0, fallbacks: 0 } };
  state.restore = () => {
    if (!state.active) return;
    state.active = false;
    state.geometry.setDrawRange(state.rangeStart, state.rangeCount);
    state.target.scissor.copy(state.scissor); state.target.scissorTest = state.scissorTest;
    r.setRenderTarget(state.target);
  };
  state.beforeHook = function (renderer, scene, camera, geometry, object, group) {
    state.before.apply(this, arguments);
    if (paint[KEY] !== state || scene !== paint.scene || object !== state.mesh || geometry !== state.geometry ||
        renderer !== r || r.getRenderTarget() !== state.target || group != null ||
        geometry.drawRange.start !== 0 || geometry.drawRange.count !== paint.quads * 6 ||
        !state.prepared || state.preparedCount !== paint.quads || !eligible(paint, state)) { state.counters.fallbacks++; return; }
    state.rangeStart = geometry.drawRange.start; state.rangeCount = geometry.drawRange.count;
    state.scissorTest = state.target.scissorTest; state.scissor.copy(state.target.scissor); state.active = true;
    state.counters.batches++;
    try {
      for (let q = 0; q < paint.quads; q++) {
        const i = q * 4, v = q * 8, rect = state.rectangles;
        let x = rect[i], y = rect[i + 1], right = x + rect[i + 2], top = y + rect[i + 3];
        if (state.scissorTest) {
          x = Math.max(x, state.scissor.x); y = Math.max(y, state.scissor.y);
          right = Math.min(right, state.scissor.x + state.scissor.z); top = Math.min(top, state.scissor.y + state.scissor.w);
        }
        const w = Math.max(0, right - x), h = Math.max(0, top - y);
        state.target.scissor.set(x, y, w, h); state.target.scissorTest = true;
        renderer.setRenderTarget(state.target); geometry.setDrawRange(q * 6, 6);
        renderer.renderBufferDirect(camera, scene, geometry, state.fast, object, group);
        state.counters.stampDraws++;
        state.counters.originalRasterPixels += (paint.aPos[v + 2] - paint.aPos[v]) * (paint.aPos[v + 5] - paint.aPos[v + 1]) * paint.size * paint.size * .25;
        state.counters.clippedRasterPixels += w * h;
      }
      // One outer renderer.render owns the dry pass, upload, and native mip
      // generation. Its automatic paint draw is empty, not duplicated.
      geometry.setDrawRange(0, 0);
    } catch (error) { state.restore(); throw error; }
  };
  state.afterHook = function (...args) { state.restore(); return state.after.apply(this, args); };
  material.onBeforeRender = state.beforeHook; paint.mesh.onAfterRender = state.afterHook;
  return state;
}
function eligible(p, s) {
  for(let i=0;i<MATERIAL_KEYS.length;i++)if(p.mat?.[MATERIAL_KEYS[i]]!==s.materialState[i])return false;
  if(p.rt?.scissorTest){
    const box=p.rt.scissor;
    if(!Number.isInteger(box.x)||!Number.isInteger(box.y)||!Number.isInteger(box.z)||!Number.isInteger(box.w)||box.z<0||box.w<0)return false;
  }
  return !s.active && p.level===s.level && !p.level?.native && p.rt === s.target && p.mat === s.material && p.mesh === s.mesh && p.mesh.material === s.material &&
    p.geo === s.geometry && p.mat.uniforms === s.uniforms && p.mat.vertexShader === s.vertex && p.mat.fragmentShader === s.fragment &&
    p.geo.index === s.index && p.geo.index.version === s.indexVersion &&
    p.mesh.onBeforeRender===THREE.Object3D.prototype.onBeforeRender &&
    p.mat.onBeforeRender===s.beforeHook && p.mesh.onAfterRender===s.afterHook &&
    p.aPos === s.positions && p.aLocal === s.local && p.aSplat === s.splat && p.aStretch === s.stretch && p.aGrow === s.growth &&
    p.rt.width === p.size && p.rt.height === p.size && p.rt.samples===0 &&
    p.rt.texture.type===THREE.UnsignedByteType && p.rt.texture.format===THREE.RGBAFormat && p.rt.texture.colorSpace===THREE.NoColorSpace &&
    p.rt.viewport.x===0 && p.rt.viewport.y===0 && p.rt.viewport.z===p.size && p.rt.viewport.w===p.size &&
    p.mat.uniforms.uMainInkProfiles?.value===s.profile && s.profile.version===s.profileVersion && profileTextureOkay(s.profile) &&
    !p.renderer.getContext().isContextLost();
}
function release(p) {
  const s = p[KEY]; if (!s) return;
  s.restore();
  if (s.material.onBeforeRender === s.beforeHook) s.material.onBeforeRender = s.before;
  if (s.mesh.onAfterRender === s.afterHook) s.mesh.onAfterRender = s.after;
  s.fast.dispose(); delete p[KEY];
}
export function installPaintProfileBatch(C) {
  const P = C.prototype; if (Object.hasOwn(P, INSTALLED)) return false;
  const init = P._initGPU, draw = P._drawQuads, dispose = P.dispose;
  P._initGPU = function (...args) {
    release(this); const value = init.apply(this, args);
    try { this[KEY] = allocate(this); } catch { this[KEY] = null; }
    return value;
  };
  P._drawQuads = function (...args) {
    const state=this[KEY];
    if(state){
      state.prepared=Number.isInteger(this.quads)&&this.quads>=1&&this.quads<=PROFILE_BATCH_LIMIT&&!globalThis.document?.hidden&&eligible(this,state)&&profilePaintBounds(this,state.rectangles);
      state.preparedCount=this.quads;
    }
    try{return draw.apply(this,args);}
    finally{if(state){state.restore();state.prepared=false;}}
  };
  P.dispose = function (...args) { release(this); return dispose.apply(this, args); };
  Object.defineProperty(P, INSTALLED, { value: true }); return true;
}
