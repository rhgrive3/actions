// Locker over still art: the generated locker image is drawn into the canvas
// instead of the opaque UI layer, so the native pedestal squidkid (drag to
// spin, live style changes, headgear) composites on top of it. Only the
// locker runs this; the attract world stays suspended behind every art screen.
import * as THREE from 'three';

const ART_URL = new URL('./assets/menu/locker.webp', import.meta.url).href;
const FALLBACK = new THREE.Color('#192134');
let stage = null;

function backdrop() {
  if (stage) return stage;
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false, toneMapped: false });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  stage = { scene, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), material, texture: null };
  new THREE.TextureLoader().load(ART_URL, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    stage.texture = texture;
    material.map = texture;
    material.needsUpdate = true;
  }, undefined, () => {});
  return stage;
}

// Same framing as the CSS it replaces: background-size cover, centred.
function cover(texture, width, height) {
  const image = texture.image, view = width / Math.max(1, height), art = image.width / Math.max(1, image.height);
  if (art > view) texture.repeat.set(view / art, 1);
  else texture.repeat.set(1, art / view);
  texture.offset.set((1 - texture.repeat.x) / 2, (1 - texture.repeat.y) / 2);
}

export function renderLockerStage(game, G, dt) {
  const showcase = game.showcase, renderer = G.renderer;
  showcase.update(dt);
  if (game._skipRender) return;
  const s = backdrop(), size = renderer.getSize(new THREE.Vector2());
  const autoClear = renderer.autoClear, alpha = renderer.getClearAlpha(), color = renderer.getClearColor(new THREE.Color());
  renderer.setRenderTarget(null);
  renderer.setClearColor(FALLBACK, 1);
  renderer.clear(true, true, false);
  if (s.texture) {
    cover(s.texture, size.x, size.y);
    renderer.autoClear = false;
    renderer.render(s.scene, s.camera);
  }
  renderer.autoClear = autoClear;
  renderer.setClearColor(color, alpha);
  showcase.render();
}
