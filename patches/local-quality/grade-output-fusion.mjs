// Fuse GradeShader + OutputPass into a single fullscreen pass whenever extraPass
// (ScreenFX) is disabled. Keeps both passes in composer.passes (preserving pass
// array identity) and mirrors Three.js OutputPass tone-mapping & color-space
// defines dynamically for zero visual difference across all quality presets.
import * as THREE from 'three';

const FUSED_VERTEX_SHADER = /* glsl */`
precision highp float;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

attribute vec3 position;
attribute vec2 uv;

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;

const OUTPUT_TAIL_GLSL = /* glsl */`
      gl_FragColor = c;

      // tone mapping
      #ifdef LINEAR_TONE_MAPPING
        gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );
      #elif defined( REINHARD_TONE_MAPPING )
        gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );
      #elif defined( CINEON_TONE_MAPPING )
        gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );
      #elif defined( ACES_FILMIC_TONE_MAPPING )
        gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );
      #elif defined( AGX_TONE_MAPPING )
        gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );
      #elif defined( NEUTRAL_TONE_MAPPING )
        gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );
      #elif defined( CUSTOM_TONE_MAPPING )
        gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );
      #endif

      // color space
      #ifdef SRGB_TRANSFER
        gl_FragColor = sRGBTransferOETF( gl_FragColor );
      #endif`;

export function buildOutputDefines(renderer) {
  const defines = {};
  const cs = renderer?.outputColorSpace;
  const tm = renderer?.toneMapping;
  if (THREE.ColorManagement.getTransfer(cs) === THREE.SRGBTransfer) {
    defines.SRGB_TRANSFER = '';
  }
  if (tm === THREE.LinearToneMapping) defines.LINEAR_TONE_MAPPING = '';
  else if (tm === THREE.ReinhardToneMapping) defines.REINHARD_TONE_MAPPING = '';
  else if (tm === THREE.CineonToneMapping) defines.CINEON_TONE_MAPPING = '';
  else if (tm === THREE.ACESFilmicToneMapping) defines.ACES_FILMIC_TONE_MAPPING = '';
  else if (tm === THREE.AgXToneMapping) defines.AGX_TONE_MAPPING = '';
  else if (tm === THREE.NeutralToneMapping) defines.NEUTRAL_TONE_MAPPING = '';
  else if (tm === THREE.CustomToneMapping) defines.CUSTOM_TONE_MAPPING = '';
  return defines;
}

export function buildFusedFragmentShader(linearFragmentShader) {
  if (typeof linearFragmentShader !== 'string') return null;
  const anchor = 'gl_FragColor = c;';
  const at = linearFragmentShader.indexOf(anchor);
  if (at < 0 || linearFragmentShader.indexOf(anchor, at + anchor.length) !== -1) return null;
  const body = linearFragmentShader.slice(0, at) + OUTPUT_TAIL_GLSL + linearFragmentShader.slice(at + anchor.length);
  return `precision highp float;\n#include <tonemapping_pars_fragment>\n#include <colorspace_pars_fragment>\n${body}`;
}

function syncGradeOutputFusionMethod() {
  return syncGradeOutputFusion(this);
}

export function setupGradeOutputFusion(owner) {
  if (!owner?.grade?.material || !owner?.outputPass || !owner?.renderer) return false;
  const linearMat = owner.grade.material;
  const uniforms = owner.grade.uniforms || linearMat.uniforms;
  if (!uniforms) return false;
  if (!uniforms.toneMappingExposure) {
    uniforms.toneMappingExposure = { value: owner.renderer.toneMappingExposure ?? 1.0 };
  }
  const fusedFragment = buildFusedFragmentShader(linearMat.fragmentShader);
  if (!fusedFragment) {
    owner._gradeLinearMat = linearMat;
    owner._gradeOutputMat = null;
    owner._gradeOutputState = null;
    owner._syncGradeOutputFusion = null;
    return false;
  }
  const fusedMat = new THREE.RawShaderMaterial({
    name: 'GradeOutputShader',
    uniforms,
    defines: buildOutputDefines(owner.renderer),
    vertexShader: FUSED_VERTEX_SHADER,
    fragmentShader: fusedFragment,
  });
  owner._gradeLinearMat = linearMat;
  owner._gradeOutputMat = fusedMat;
  owner._gradeOutputState = {
    outputColorSpace: owner.renderer.outputColorSpace,
    toneMapping: owner.renderer.toneMapping,
  };
  owner._syncGradeOutputFusion = syncGradeOutputFusionMethod;
  syncGradeOutputFusion(owner);
  return true;
}

export function syncGradeOutputFusion(owner) {
  if (!owner?.grade || !owner?.outputPass || !owner._gradeLinearMat || !owner._gradeOutputMat) return false;
  const fuse = !owner.extraPass?.enabled;
  owner.grade.material = fuse ? owner._gradeOutputMat : owner._gradeLinearMat;
  owner.outputPass.enabled = !fuse;
  if (fuse && owner.renderer) {
    const r = owner.renderer;
    const uniforms = owner.grade.uniforms || owner._gradeOutputMat.uniforms;
    if (uniforms?.toneMappingExposure) {
      uniforms.toneMappingExposure.value = r.toneMappingExposure;
    }
    const st = owner._gradeOutputState || (owner._gradeOutputState = { outputColorSpace: null, toneMapping: null });
    if (st.outputColorSpace !== r.outputColorSpace || st.toneMapping !== r.toneMapping) {
      st.outputColorSpace = r.outputColorSpace;
      st.toneMapping = r.toneMapping;
      owner._gradeOutputMat.defines = buildOutputDefines(r);
      owner._gradeOutputMat.needsUpdate = true;
    }
  }
  return fuse;
}

export function disposeGradeOutputFusion(owner, { gradeDisposed = false } = {}) {
  if (!owner) return;
  const active = owner.grade?.material;
  const linear = owner._gradeLinearMat;
  const fused = owner._gradeOutputMat;
  if (linear && (!gradeDisposed || linear !== active)) linear.dispose?.();
  if (fused && fused !== linear && (!gradeDisposed || fused !== active)) fused.dispose?.();
  owner._gradeLinearMat = null;
  owner._gradeOutputMat = null;
  owner._gradeOutputState = null;
  owner._syncGradeOutputFusion = null;
}
