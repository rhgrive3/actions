import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';

async function boot(enabled = true) {
  const f = await fixture({ fullRuntime: true, includeCharacter: true, productionComposition: true,
    extraExports: "export { installKidShadowProxy, hookShadowLayer, PROXY_LAYER } from './patches/local-quality/kid-shadow-proxy.mjs';" });
  f.G.scene = new f.THREE.Scene(); f.G.settings = { quality: 'high' };
  assert.equal(f.installKidShadowProxy({ Character: f.Character }, f.G, f.THREE, () => enabled), true);
  assert.equal(f.installKidShadowProxy({ Character: f.Character }, f.G, f.THREE, () => enabled), false, 'installs once');
  return f;
}
const kid = (f) => {
  const a = new f.Actor({ team: 0, name: 'shadow proxy', weapon: 'shooter', CharacterClass: f.Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  f.G.scene.add(a.character.root);
  return a.character;
};
const tris = (m) => (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;

test('kids cast from far-tier proxies on a camera-invisible layer; displayed tiers stop casting covered parts', async () => {
  const f = await boot(), { THREE } = f, ch = kid(f);
  for (let t = 0; t < 3; t++) ch._tierSet(t);
  const proxies = ch._shadowProxies;
  assert.ok(proxies.length >= 2, 'skin and cloth at least');
  const keys = [...ch._shadowProxyKeys];
  assert.ok(keys.includes('skin') && keys.includes('cloth'));
  for (const key of keys) {
    assert.equal(ch.lodSets[1].meshes[key].userData.iwShadowNative, true, key + ' casts natively at game tier');
    for (const S of ch.lodSets) { const m = S.meshes[key]; if (!m) continue; assert.equal(m.castShadow, false); assert.equal(m.userData.iwShadow, false); }
  }
  for (const p of proxies) {
    assert.equal(p.isSkinnedMesh, true); assert.equal(p.skeleton, ch.skeleton); assert.equal(p.castShadow, true);
    assert.equal(p.parent, ch.kid, 'follows the kid group visibility and scale');
    assert.equal(p.layers.mask, 1 << f.PROXY_LAYER, 'never on a camera layer');
    const key = p.name.split(':')[1];
    assert.equal(p.geometry, ch.lodSets[2].meshes[key].geometry, 'far-tier geometry');
    assert.ok(tris(p) < tris(ch.lodSets[1].meshes[key]), key + ' proxy is lighter than the game tier');
  }
  // tier switches keep covered parts dark (native _setTier re-applies userData.iwShadow)
  ch._setTier(0); for (const key of keys) assert.equal(ch.lodSets[0].meshes[key].castShadow, false);
  ch._setTier(2); for (const key of keys) assert.equal(ch.lodSets[2].meshes[key].castShadow, false);
  // parts without a far counterpart keep their own shadow
  for (const S of ch.lodSets) for (const key in S.meshes) if (!ch._shadowProxyKeys.has(key)) assert.equal(S.meshes[key].userData.iwShadow, S.meshes[key].userData.iwShadowNative);
  // the main camera never sees PROXY_LAYER; a shadow render sees it for exactly its own duration
  const cam = new THREE.PerspectiveCamera(); assert.equal(cam.layers.test(proxies[0].layers), false);
  let seen = null; const renderer = { shadowMap: { render(lights, scene, camera) { seen = camera.layers.test(proxies[0].layers); } } };
  assert.equal(f.hookShadowLayer(renderer), true); assert.equal(f.hookShadowLayer(renderer), false);
  const mask = cam.layers.mask; renderer.shadowMap.render([], f.G.scene, cam);
  assert.equal(seen, true); assert.equal(cam.layers.mask, mask, 'view camera layers restored');
  ch.dispose();
});

test('a first far-tier build still covers the game-tier parts; a quality rebuild re-targets the proxies', async () => {
  const f = await boot(), ch = kid(f);
  ch._tierSet(2);
  assert.ok(ch._shadowProxies.length >= 2, 'built from the game tier part list even when far is built first');
  const old = ch._shadowProxies.slice();
  // native quality-change path: drop the tier sets and rebuild the shown tier
  for (const X of ch.lodSets) if (X) for (const m of X.list) ch.kid.remove(m);
  ch.lodSets = [null, null, null]; ch._tierSet(1);
  assert.notDeepEqual(ch._shadowProxies, old);
  for (const p of old) assert.equal(p.parent, null, 'stale proxies removed');
  for (const p of ch._shadowProxies) assert.equal(p.geometry, ch.lodSets[2].meshes[p.name.split(':')[1]].geometry);
  ch.dispose();
});

test('disabled (desktop default): native tier shadows, no proxies', async () => {
  const f = await boot(false), ch = kid(f);
  for (let t = 0; t < 3; t++) ch._tierSet(t);
  assert.equal(ch._shadowProxies, undefined);
  for (const S of ch.lodSets) for (const m of S.list) assert.equal(m.userData.iwShadow, m.userData.iwShadowNative);
  ch.dispose();
});
