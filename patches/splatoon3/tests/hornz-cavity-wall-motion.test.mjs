import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import { fixture } from './source-fixture.mjs';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function bindBuild(){
 const root=fileURLToPath(new URL('../../../',import.meta.url)),sourceHashes={};
 for(const name of ['registry','kit','hornz-dread-wringer','variants-melee']){const rel='patches/splatoon3/runtime/weapon-models/'+name+'.mjs';sourceHashes[rel]=hash(fs.readFileSync(path.join(root,rel)));}
 if(process.env.INKWAVE_BUILT_SITE){
  const site=path.resolve(process.env.INKWAVE_BUILT_SITE),manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
  assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash);
  for(const [rel,digest]of Object.entries(sourceHashes))assert.equal(manifest.files[rel.replace('patches/splatoon3/','patch/')],digest,'built input '+rel);
  for(const name of ['registry','kit']){const rel='patches/splatoon3/runtime/weapon-models/'+name+'.mjs';assert.ok(manifest.artifacts[rel]);assert.equal(hash(fs.readFileSync(path.join(site,rel))),manifest.artifacts[rel]);const versioned='_versions/'+manifest.build.revision+'/'+rel;assert.equal(manifest.artifacts[versioned],manifest.artifacts[rel]);assert.equal(hash(fs.readFileSync(path.join(site,versioned))),manifest.artifacts[versioned]);}
 }
 console.log('Hornz cavity source binding',JSON.stringify(sourceHashes));
}
// Both tests run against source and emitted production modules, without
// private-function export injection or emitted skips.
function extent(mesh) {
  const g = mesh.geometry, p = g.attributes.position, ix = g.index;
  const count = ix ? ix.count : p.count, start = Math.max(0, g.drawRange.start || 0);
  const end = Math.min(count, start + g.drawRange.count), ys = [];
  for (let i = start; i < end; i++) ys.push(p.getY(ix ? ix.getX(i) : i) * mesh.scale.y + mesh.position.y);
  assert.ok(ys.length); return { top: Math.max(...ys), bottom: Math.min(...ys) };
}
// Far ink also contains the unchanged front liquid at lower Y. Restrict
// containment to the rear footprint rather than comparing unrelated front ink
// against the rear hopper floor.
function rearBottom(m){const p=m.geometry.attributes.position;let low=Infinity;for(let i=0;i<p.count;i++)if(p.getZ(i)<.12)low=Math.min(low,p.getY(i)*m.scale.y+m.position.y);assert.ok(Number.isFinite(low));return low;}
test('Hornz matched inner/outer hopper deformation retains positive lower-wall thickness',async()=>{
 bindBuild();
 const f=await fixture({extraExports:`export { Pieces } from './patches/splatoon3/runtime/weapon-models/kit.mjs';export { weaponVariantSpec } from './patches/splatoon3/runtime/weapon-models/registry.mjs';`});
 const {THREE:T,Pieces}=f,saved=Pieces.prototype.add;let hopper;
 Pieces.prototype.add=function(g,c,...rest){if(c==='#96978a'&&!hopper)hopper=g.clone();return saved.call(this,g,c,...rest);};
 try{f.weaponVariantSpec('Slosher_Double_02').build({parts:{}});}finally{Pieces.prototype.add=saved;}
 assert.ok(hopper);const n=hopper.attributes.position.count/6,indices=Array.from(hopper.index.array),outer=hopper.clone();assert.equal(n,32);
 outer.setIndex([...indices.slice(0,2*n*6),...indices.slice(5*n*6,5*n*6+(n-2)*3)]);
 const material=new T.MeshBasicMaterial({side:T.DoubleSide}),m=new T.Mesh(outer,material);m.updateMatrixWorld(true);const p=hopper.attributes.position;let samples=0;
 try{for(const loop of [4,5])for(let j=0;j<n;j++){
  const i=loop*n+j,x=p.getX(i),y=p.getY(i),z=p.getZ(i);if(y>(loop===4?.072:.059))continue;
  const h=new T.Raycaster(new T.Vector3(x,-.2,z),new T.Vector3(0,1,0)).intersectObject(m)[0];assert.ok(h,'inner wall must have an enclosing outer floor');
  assert.ok(y-h.point.y>.003,`wall thickness ${y-h.point.y} at ${x},${y},${z}`);samples++;
 }assert.equal(samples,32);}finally{hopper.dispose();outer.dispose();material.dispose();}
});
test('Expanded Hornz pool remains above floor throughout actual catalog drain and reset', async () => {
  bindBuild();
  const f = await fixture({ includeCharacter: true, fullRuntime: true, extraExports: `
    export { weaponVariantSpec } from './patches/splatoon3/runtime/weapon-models/registry.mjs';
    export { weaponDetailMotionSnapshot } from './patches/splatoon3/runtime/weapon-detail-motion.mjs';
    export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';` });
  const api = f.installedRuntime, { G, Actor, Character, THREE } = api;
  f.installMainWeaponCatalogRuntime(api, f.profile);
  G.scene = new THREE.Scene(); G.teamColors = [new THREE.Color('#ff8825'), new THREE.Color('#484ce8')];
  G.level = { blocks: [], groundHeight: () => 0, queryBlocks: (_a, _b, _c, _d, o) => { o.length = 0; return o; } };
  G.physics = new api.Physics(G.level); G.paint = { sample: () => 1, splat: () => 0 }; G.match = { playing: () => true }; G.time = 0; G.actors = [];
  const projectiles = new api.Projectiles(G.scene); G.projectiles = projectiles;
  const a = new Actor({ team: 0, weapon: 's3-slosher-double-02', isLocal: false, name: 'Hornz liquid regression', CharacterClass: Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
  const ch = a.character; ch.actor = a; ch.onEvent = null; a.grounded = true; a.ground.hit = true; G.actors = [a]; G.scene.add(ch.root);
  const w = ch.weapon;
  const d=f.weaponVariantSpec('Slosher_Double_02').build({parts:{}}),floorMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),body=new THREE.Mesh(d.body,floorMaterial);body.updateMatrixWorld(true);
  d.ink.computeBoundingBox();const box=d.ink.boundingBox;
  assert.ok(Math.abs(box.max.x-box.min.x-.090)<1e-6);assert.ok(Math.abs(box.max.z-box.min.z-.060)<1e-6);assert.ok(Math.abs(box.max.y-box.min.y-.002)<1e-6);
  const positions=d.ink.attributes.position;let highestFloor=-Infinity;
  for(let i=0;i<positions.count;i++){
   const hit=new THREE.Raycaster(new THREE.Vector3(positions.getX(i),.075,positions.getZ(i)),new THREE.Vector3(0,-1,0)).intersectObject(body)[0];assert.ok(hit);highestFloor=Math.max(highestFloor,hit.point.y);
  }
  // The whole translated sheet, including every sampled footprint vertex,
  // must stay clear at full native depth as well as at all runtime samples.
  assert.ok(box.min.y-.012-highestFloor>.0004);

  assert.equal(w.def.modelVariantId, 'Slosher_Double_02'); assert.equal(w.def.slosherInkSurfaceOnly, true);
  assert.ok(w.ink && w.inkFar); const rest = extent(w.ink), surfaceRest = w.parts.surface.userData.rest.y; let peak = 0;
  try {
    for (let i = 0; i < 170; i++) {
      const input = { fire: i === 90 }; a.ink = 100; a.intent.fire = input.fire; G.time += 1 / 60;
      a.weaponRunner.update(1 / 60, input); a._finishFrame(1 / 60);
      const drain = f.weaponDetailMotionSnapshot(ch).bucketDrain; peak = Math.max(peak, drain);
      if (!projectiles.list.length) assert.equal(drain, 0, 'no drain during unadmitted reservation');
      assert.ok(Math.abs(w.parts.surface.position.y - surfaceRest + .012 * drain) < 1e-7);
      for (const m of [w.ink, w.inkFar]) {assert.ok(Math.abs(extent(m).top - rest.top + .012 * drain) < 1e-7);assert.ok(rearBottom(m)-highestFloor>.0004);}
    }
    assert.ok(projectiles.list.length > 0); assert.ok(peak > .95, `catalog emitted ${projectiles.list.length} projectiles but peak drain was ${peak}`);
    a.weaponRunner.reset(); a._finishFrame(0);
    for (const m of [w.ink, w.inkFar]) assert.ok(Math.abs(extent(m).top - rest.top) < 1e-8);
  } finally { d.body.dispose();d.ink.dispose();floorMaterial.dispose();G.scene.remove(ch.root); ch.dispose(); projectiles.clear(); G.scene.remove(projectiles.blobs, projectiles.arcLine, projectiles.arcRing); }
});
