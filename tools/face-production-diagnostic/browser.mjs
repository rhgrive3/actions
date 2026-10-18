import * as THREE from 'three';
const check = (v, message) => { if (!v) throw Error(message); };
export async function run(config) {
  const progress = globalThis.__headgearQA = { stage: 'init', rows: [] };
  const { G } = await import(config.prefix + 'src/core/ctx.js');
  const profile = await fetch(config.prefix + 'patches/splatoon3/profile.json').then(r => r.json());
  const { install } = await import(config.prefix + 'patches/splatoon3/runtime/install.mjs');
  install(profile);
  const { Character } = await import(config.prefix + 'src/game/character.js');
  const { headgearState } = await import(config.prefix + 'patches/local-quality/headgear/lifecycle.mjs');
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(720, 720); renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = .94;
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#79828c');
  // Face-centric orthographic crop, same scale in every view.
  const camera = new THREE.OrthographicCamera(-.29, .29, .29, -.29, .01, 30);
  Object.assign(G, { scene, camera, renderer, settings: { quality: 'high', shadows: false }, mode: 'match', actors: [], time: 0 });
  const hemi = new THREE.HemisphereLight('#f4f6ff', '#485266', 2.2);
  const sun = new THREE.DirectionalLight('#fff2dd', 2.5);
  scene.add(hemi, sun, sun.target);
  let character;
  try {
    character = new Character({ name: 'headgear-qa-fixed', sourceMotion: false, style: { hat: 0, hair: 0, skin: 2, outfit: 0, eyes: 0, brows: 0 } });
    character.setLod('hero'); character.setColor(0x19ae96); character.onEvent = null;
    scene.add(character.root);
    const state = { form: 'kid', grounded: true, speed: 0, localMove: { x: 0, z: 0 }, firing: false, charge: 0, ink: 1, hp: 1, vy: 0 };
    for (let i = 0; i < 60; i++) character.update(1 / 60, state);
    character.root.updateMatrixWorld(true);
    check(character.style.hat === 0, 'native hat 0 (none)');
    check(!headgearState(character)?.groups?.length, 'no production extra headgear');
    check(character.skeleton.bones.length === 87, 'native canonical rig');
    // Keep the native pose and all geometry unchanged. Rotate only the camera,
    // using the actual head WORLD quaternion (including neck/chest ancestry).
    const q = character.bones.head.getWorldQuaternion(new THREE.Quaternion());
    const target = character.getHeadPosition(new THREE.Vector3());
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(q).normalize();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q).normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q).normalize();
    const poseBefore = character.skeleton.bones.map(b => b.matrixWorld.toArray());
    const gl = renderer.getContext();
    const cases = [ ['front-natural', 0, false], ['front-soft-light', 0, true], ['quarter-natural', Math.PI / 4, false], ['side-natural', Math.PI / 2, false] ];
    for (const [name, angle, soft] of cases) {
      progress.stage = name;
      const direction = forward.clone().multiplyScalar(Math.cos(angle)).addScaledVector(right, Math.sin(angle));
      camera.position.copy(target).addScaledVector(direction, 3);
      camera.up.copy(up); camera.lookAt(target); camera.updateMatrixWorld(true);
      // Natural = same light colors/intensities as the earlier headgear images,
      // with directions made head-relative for a controlled shape comparison.
      // Soft = broad ambient fill and weaker key; native material/AO unchanged.
      hemi.color.set(soft ? '#ffffff' : '#f4f6ff');
      hemi.groundColor.set(soft ? '#ffffff' : '#485266');
      hemi.intensity = soft ? 2.8 : 2.2; hemi.position.copy(up);
      sun.intensity = soft ? .5 : 2.5;
      sun.position.copy(target).add(new THREE.Vector3(3, 5, 4).applyQuaternion(q));
      sun.target.position.copy(target); sun.target.updateMatrixWorld(true);
      await renderer.compileAsync(scene, camera);
      renderer.render(scene, camera); gl.finish();
      check(!gl.isContextLost() && gl.getError() === gl.NO_ERROR, 'WebGL clean');
      const optical = camera.getWorldDirection(new THREE.Vector3());
      const alignment = optical.dot(direction.clone().negate());
      check(alignment > .999999, 'camera exactly aligns with selected head-local view');
      const leftMark = target.clone().addScaledVector(right, -.1).project(camera);
      const rightMark = target.clone().addScaledVector(right, .1).project(camera);
      if (angle === 0) check(Math.abs(leftMark.y - rightMark.y) < 1e-8, 'front has no head-relative roll');
      await globalThis.__saveHeadgearFrame(name, renderer.domElement.toDataURL('image/png'));
      progress.rows.push({ name, viewDegrees: angle * 180 / Math.PI, hat: 0, hair: 0, lod: 'hero', quality: 'high',
        headWorldQuaternion: q.toArray(), headLocalQuaternion: character.bones.head.quaternion.toArray(),
        neckLocalQuaternion: character.bones.neck.quaternion.toArray(), headCenter: target.toArray(),
        cameraPosition: camera.position.toArray(), cameraUp: camera.up.toArray(), cameraAlignment: alignment,
        projection: 'orthographic', cropWorldWidth: .58, headForward: forward.toArray(), headUp: up.toArray(),
        lighting: soft ? 'uniform white hemisphere 2.8 + warm directional 0.5; native material and baked AO retained' : 'cool hemisphere 2.2 + warm directional 2.5; head-relative key (3,5,4)',
        shadowMaps: false, exposure: .94, triangles: renderer.info.render.triangles, expression: 'native idle after 60 updates, frozen identically in all views',
        faceChannels: { ...character.face }, gaze: character.u.uGaze?.value?.toArray?.() ?? null });
    }
    character.root.updateMatrixWorld(true);
    check(JSON.stringify(poseBefore) === JSON.stringify(character.skeleton.bones.map(b => b.matrixWorld.toArray())), 'all native bone transforms unchanged between views');
    return { status: 'rendered-awaiting-visual-review', rows: progress.rows, renderer: renderer.getContext().getParameter(renderer.getContext().RENDERER),
      limitations: 'Camera is exactly head-aligned; eyes retain native idle gaze/expression. No shape, skeleton, material, hair, or production code changes. Hat 0 is the actual native no-hat hairstyle, not a hidden helmet. Soft-light reduces lighting contrast but retains baked AO and native skin shader.' };
  } finally { if (character) { scene.remove(character.root); character.dispose(); } renderer.dispose(); }
}
