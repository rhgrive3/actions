export function adaptOffscreenCharacter(rel, code, replaceOnce) {
  if (rel === 'src/game/actor.js') {
    return replaceOnce(code,
      '    ch.update(dt, a);',
      '    ch.update(dt, a, this);',
      'remote actor presentation context');
  }
  if (rel !== 'src/game/character.js') return code;

  code = replaceOnce(code,
    "import * as THREE from 'three';",
    "import * as THREE from 'three';\nimport { capturePresentationCamera, installOffscreenCharacterPresentation, restoreOffscreenCharacterPose } from '../../patches/local-quality/offscreen-character-presentation.mjs';",
    'offscreen Character presentation runtime');
  code = replaceOnce(code,
    '    this._camHook = (renderer, scene, camera) => {\n      if (!camera || !camera.isPerspectiveCamera) return;',
    '    this._camHook = (renderer, scene, camera) => {\n      capturePresentationCamera(THREE, renderer, scene, camera);\n      restoreOffscreenCharacterPose(this);\n      if (!camera || !camera.isPerspectiveCamera) return;',
    'current main camera and visible reentry hook');
  return code + '\ninstallOffscreenCharacterPresentation(Character, THREE);\n';
}
