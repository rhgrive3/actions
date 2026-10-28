import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { loadNative } from './prop-retention-fixture.mjs';
const fixed = await loadNative(true), raw = await loadNative(false);
const placements = fixed.dressingFor('halyard');
const parts = kit => [...kit._buckets.values()].reduce((n, a) => n + a.length, 0);
const anim = kit => [kit._spin.length, kit._blink.length, kit._flags.length, kit._banners.length];
const hash = array => crypto.createHash('sha256').update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
const allMeshes = kit => [...kit._meshes, ...kit._inst];
function materialState(material) {
  const state = {};
  for (const [key, value] of Object.entries(material)) {
    if (['id', 'uuid', 'version'].includes(key)) continue;
    if (value === null || ['number', 'string', 'boolean'].includes(typeof value)) state[key] = value;
    else if (value?.isColor || value?.isVector2 || value?.isVector3 || value?.isVector4) state[key] = value.toArray();
    else if (value?.isTexture) state[key] = Object.fromEntries(['type','format','colorSpace','channel','wrapS','wrapT','magFilter','minFilter','flipY','premultiplyAlpha','generateMipmaps','anisotropy'].map(k => [k, value[k]]));
  }
  state.program = material.customProgramCacheKey();
  state.shader = material.onBeforeCompile.toString();
  return state;
}
// Expand index order into the actual triangle stream. Index width and vertex
// reuse are storage details; positions, winding, normals, colors and mapped UVs
// are compared byte-for-byte in draw order.
function expandedAttribute(g, a) {
  const indices=g.index?.array, count=indices?indices.length:a.count;
  const expanded=new a.array.constructor(count*a.itemSize);
  for(let i=0;i<count;i++)for(let j=0;j<a.itemSize;j++)expanded[i*a.itemSize+j]=a.array[(indices?indices[i]:i)*a.itemSize+j];
  return {hash:hash(expanded),type:a.array.constructor.name,itemSize:a.itemSize,normalized:a.normalized,count};
}
const meshState = kit => [...kit._meshes, ...kit._inst].map(m => ({
  name: m.name, count: m.count ?? 1, material: materialState(m.material),
  drawRange: {...m.geometry.drawRange}, groups: m.geometry.groups.map(g=>({...g})),
  instanceMatrix: m.instanceMatrix ? hash(m.instanceMatrix.array) : null,
  attributes: Object.fromEntries(Object.entries(m.geometry.attributes).map(([k,a])=>[k,expandedAttribute(m.geometry,a)])),
}));
function sameRenderedMeshes(actual, expected) {
  const next = meshState(actual), prior = meshState(expected), a = allMeshes(actual), b = allMeshes(expected);
  assert.equal(a.length, b.length);
  let omitted = 0;
  for (let i = 0; i < a.length; i++) {
    if (!a[i].geometry.attributes.uv && b[i].geometry.attributes.uv) {
      // The optimization omits only an unused shader input. Prove both sides
      // use reviewed built-in solid shaders; mapped/custom shaders stay exact.
      for (const mesh of [a[i], b[i]]) {
        assert.ok(['MeshBasicMaterial','MeshStandardMaterial','MeshPhysicalMaterial'].includes(mesh.material.type));
        assert.equal(mesh.material.onBeforeCompile, fixed.THREE.Material.prototype.onBeforeCompile);
        assert.ok(!Object.values(mesh.material).some(value => value?.isTexture));
        assert.equal(mesh.customDepthMaterial, undefined);
        assert.equal(mesh.customDistanceMaterial, undefined);
      }
      delete prior[i].attributes.uv;
      omitted++;
    }
  }
  assert.ok(omitted > 0, 'exercise the reviewed unused UV omission');
  assert.deepEqual(next, prior, 'ordered triangle attributes, counts and material settings remain exact');
}
function make(N, list = placements) {
  const kit = new N.PropKit(new N.THREE.Scene(), { quality: 'high', castShadow: true });
  const cols = list.flatMap(p => kit.add(p.type, p).colliders);return { kit, cols };
}
test('actual Halyard final geometry, colliders and live animation match raw, static sources are released', () => {
  const a = make(raw), b = make(fixed);
  const refs = [...b.kit._buckets.values()].flat().map(p => p.g);
  const disposed = new Set();for (const g of new Set(refs)) g.addEventListener('dispose', () => disposed.add(g));
  a.kit.build();b.kit.build();
  assert.ok(parts(a.kit) > 12000);assert.equal(parts(b.kit), 0);
  sameRenderedMeshes(b.kit, a.kit);assert.deepEqual(b.cols, a.cols);
  assert.deepEqual(b.kit.stats(), a.kit.stats());assert.deepEqual(anim(b.kit), anim(a.kit));
  assert.equal(disposed.size, 0);b.kit.update(1 / 60, 1);a.kit.update(1 / 60, 1);
  assert.deepEqual(b.kit._inst.map(m => hash(m.instanceMatrix.array)), a.kit._inst.map(m => hash(m.instanceMatrix.array)));
  a.kit.dispose();b.kit.dispose();assert.ok(disposed.size > 0, 'last-user Halyard private templates now release after live instances leave');
});
test('same-instance rebuild and add-after-build retain exact instance counts, triangles and animation', () => {
  const { kit } = make(fixed);kit.build();
  const before = meshState(kit), stats = kit.stats(), animations = anim(kit);
  for (let i = 0; i < 3; i++) {
    kit.build();assert.equal(parts(kit), 0);assert.deepEqual(meshState(kit), before);
    assert.deepEqual(kit.stats(), stats);assert.deepEqual(anim(kit), animations);kit.update(1 / 60, i + 2);
  }
  const added = { ...placements[0], pos: [150, 0, 150] };kit.add(added.type, added);kit.build();
  const expected = make(fixed, [...placements, added]).kit;expected.build();
  assert.deepEqual(meshState(kit), meshState(expected));assert.deepEqual(kit.stats(), expected.stats());assert.deepEqual(anim(kit), anim(expected));
  kit.dispose();expected.dispose();
});
test('clear/rematch rebuild has bounded placement and animation records; headless accounting stays available', () => {
  const { kit } = make(fixed);kit.build();const stats = kit.stats(), animations = anim(kit);
  for (let i = 0; i < 3; i++) {
    kit.clear();assert.equal(kit._placements.length, 0);
    for (const p of placements) kit.add(p.type, p);kit.build();
    assert.equal(parts(kit), 0);assert.equal(kit._placements.length, placements.length);
    assert.deepEqual(kit.stats(), stats);assert.deepEqual(anim(kit), animations);
  }
  kit.dispose();const headless = new fixed.PropKit(null, { headless: true });
  headless.add(placements[0].type, placements[0]);const tris = headless.stats().triangles;
  headless.build();assert.equal(headless.stats().triangles, tris);assert.ok(parts(headless) > 0);headless.dispose();
});

test('pending PR183 Practice dressing remains isolated and banner instances survive repeated build', async () => {
  const { PLACEMENTS } = await import('./fixtures/pr183/props.mjs');
  const practiceFixed = await loadNative(true, true), practiceRaw = await loadNative(false, true);
  const a = make(practiceRaw, PLACEMENTS), b = make(practiceFixed, PLACEMENTS);
  a.kit.build();b.kit.build();assert.equal(parts(b.kit), 0);
  sameRenderedMeshes(b.kit, a.kit);assert.deepEqual(b.cols, a.cols);assert.deepEqual(b.kit.stats(), a.kit.stats());
  b.kit.build();assert.deepEqual(b.kit.stats(), a.kit.stats());a.kit.dispose();b.kit.dispose();
  const banner = make(fixed, [{ type: 'banner', pos: [0, 0, 0], team: 1 }]).kit;banner.build();
  const state = meshState(banner), stats = banner.stats();assert.equal(banner._banners.length, 1);
  banner.build();assert.deepEqual(meshState(banner), state);assert.deepEqual(banner.stats(), stats);assert.equal(banner._banners.length, 1);
  banner.update(1 / 60, 3);banner.dispose();
});

test('Halyard triangle comparator narrowly rejects inverse/mapped/custom UV omissions and changed streams',()=>{
 const T=fixed.THREE;
 function mesh(kind='solid',hasUv=true){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));g.setAttribute('normal',new T.Float32BufferAttribute([0,0,1,0,0,1,0,0,1],3));if(hasUv)g.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,0,1],2));g.setIndex([0,1,2]);const m=new T.MeshStandardMaterial(kind==='mapped'?{map:new T.Texture()}:{});if(kind==='custom')m.onBeforeCompile=()=>{};return new T.Mesh(g,m);}
 const kit=(...meshes)=>({_meshes:meshes,_inst:[]});
 const compare=(a,b)=>sameRenderedMeshes(kit(a),kit(b));
 assert.doesNotThrow(()=>compare(mesh('solid',false),mesh('solid',true)));
 assert.throws(()=>compare(mesh('solid',true),mesh('solid',false)),'opposite omission rejected');
 for(const kind of ['mapped','custom'])assert.throws(()=>compare(mesh(kind,false),mesh(kind,true)),kind+' UV omission rejected');
 for(const mutate of [g=>g.index.array.set([0,2,1]),g=>{g.attributes.position.array[0]=.5;},g=>{g.attributes.normal.array[2]=-1;}]){const changed=mesh('solid',false);mutate(changed.geometry);assert.throws(()=>compare(changed,mesh('solid',true)),'ordered position/normal stream');}
});
