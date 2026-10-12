import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
const IDS = ['s3-saber-normal','s3-saber-lite','s3-saber-heavy','s3-stringer-normal','s3-stringer-short','s3-stringer-explosion'];
const options = { fullRuntime: true, includeCharacter: true, productionComposition: true, vmMathRandom: () => .25,
  extraExports: `export { getWeaponDef } from './inkwave-public/src/game/character-weapons.js';
  export { farGeometry } from './inkwave-public/src/game/character-lod.js';
  export { removeZeroAreaTriangles } from './patches/splatoon3/runtime/weapon-models/selected-zero-area.mjs';` };
let fixtures;
async function pair() {
  if(fixtures)return fixtures;
  if(process.env.INKWAVE_BUILT_SITE){
    assert.ok(process.env.INKWAVE_ZERO_AREA_BASELINE_SITE,'built comparison requires immutable baseline production site');
    const candidateSite=process.env.INKWAVE_BUILT_SITE;
    process.env.INKWAVE_BUILT_SITE=process.env.INKWAVE_ZERO_AREA_BASELINE_SITE;
    const {fixture:baselineFixture}=await import('./source-fixture.mjs?zeroAreaBaseline');
    process.env.INKWAVE_BUILT_SITE=candidateSite;
    return fixtures=Promise.all([baselineFixture({...options,extraExports:options.extraExports.replace(/  export \{ removeZeroAreaTriangles \}[^;]+;/,'')}),fixture(options)]);
  }
  return fixtures=Promise.all([fixture({ ...options, adaptRuntime: (name, source) => name.endsWith('/selected-zero-area.mjs')
    ? source.replace('  rebuild(d, spec);', '  return rebuild(d, spec);') : source }), fixture(options)]);
}
const bytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
function sameAttributes(a, b, label) {
  assert.deepEqual(Object.keys(b.attributes), Object.keys(a.attributes), label);
  for (const [name, attr] of Object.entries(a.attributes)) {
    const other = b.attributes[name];
    assert.equal(other.itemSize, attr.itemSize, label + name);
    assert.equal(other.normalized, attr.normalized, label + name);
    assert.equal(other.array.constructor.name, attr.array.constructor.name, label + name);
    assert.deepEqual(bytes(other.array), bytes(attr.array), label + name);
  }
}
function zero(g, j) {
  const p=g.attributes.position, i=g.index.array, a=i[j], b=i[j+1], c=i[j+2];
  const ux=p.getX(b)-p.getX(a),uy=p.getY(b)-p.getY(a),uz=p.getZ(b)-p.getZ(a),vx=p.getX(c)-p.getX(a),vy=p.getY(c)-p.getY(a),vz=p.getZ(c)-p.getZ(a);
  return uy*vz-uz*vy===0 && uz*vx-ux*vz===0 && ux*vy-uy*vx===0;
}
function unchangedSurface(a,b,label) {
  sameAttributes(a,b,label);
  assert.deepEqual(JSON.stringify(b.groups),JSON.stringify(a.groups),label+' groups');
  assert.deepEqual(JSON.stringify(b.drawRange),JSON.stringify(a.drawRange),label+' drawRange');
  const ai=a.index.array,bi=b.index.array;let k=0,removed=0;
  for(let j=0;j<ai.length;j+=3){
    if(k<bi.length&&ai[j]===bi[k]&&ai[j+1]===bi[k+1]&&ai[j+2]===bi[k+2])k+=3;
    else{assert.ok(zero(a,j),label+' only exactly zero-area removal '+j);removed++;}
  }
  assert.equal(k,bi.length,label+' original order and winding');
  a.computeBoundingBox();b.computeBoundingBox();a.computeBoundingSphere();b.computeBoundingSphere();
  assert.equal(JSON.stringify(b.boundingBox),JSON.stringify(a.boundingBox),label+' bounds');
  assert.equal(JSON.stringify(b.boundingSphere),JSON.stringify(a.boundingSphere),label+' sphere');
  return removed;
}

test('selected six retain every attribute, surviving triangle, placeholder and exact far-tier mesh', async () => {
  const [baseline,candidate]=await pair(), report=[];
  for(const id of IDS){
    const a=baseline.getWeaponDef(id),b=candidate.getWeaponDef(id);let removed=0;
    assert.equal(JSON.stringify(Object.keys(a.parts)),JSON.stringify(Object.keys(b.parts)),id+' part traversal');
    for(const name of ['body','ink','bodyStatic','inkStatic','drum','drumCaps','glow']){
      assert.equal(!!b[name],!!a[name],id+name+' existence');if(!a[name])continue;
      const n=unchangedSurface(a[name],b[name],id+name);if(['body','ink','drum','drumCaps','glow'].includes(name))removed+=n;
    }
    for(const name of Object.keys(a.parts)){
      unchangedSurface(a.parts[name].geo,b.parts[name].geo,id+name);
      assert.equal(JSON.stringify(a.parts[name].pivot),JSON.stringify(b.parts[name].pivot),id+name+' pivot');
      assert.equal(a.parts[name].mat,b.parts[name].mat,id+name+' material');
      if(a.parts[name].geo.index.count===3)assert.equal(b.parts[name].geo.index.count,3,id+name+' native empty channel');
    }
    const far=[];
    for(const[name,target]of[['body',700],['ink',300]]){
      const af=baseline.farGeometry(a[name],target),bf=candidate.farGeometry(b[name],target);
      sameAttributes(af,bf,id+name+' far');
      if(af.userData.iwLod==='far')assert.deepEqual(bytes(af.index.array),bytes(bf.index.array),id+name+' exact decimated far indices');
      else unchangedSurface(af,bf,id+name+' non-decimated far');
      assert.equal(JSON.stringify(af.userData),JSON.stringify(bf.userData),id+name+' far cell');
      far.push({channel:name,triangles:bf.index.count/3,cell:bf.userData.cell??null});
    }
    assert.ok(removed>0,id+' useful index reduction');report.push({id,removed,far});
  }
  console.log('ZERO_AREA_GEOMETRY '+JSON.stringify(report));
});

test('helper preserves group material/order, finite draw ranges, metadata and invisible compatibility channels', async () => {
  const [,f]=await pair();const g=new f.THREE.BufferGeometry();
  g.setAttribute('position',new f.THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0,2,0,0],3));
  g.setIndex([0,1,2,0,0,1,0,1,3,2,1,0]);g.addGroup(0,6,7);g.addGroup(6,6,9);g.setDrawRange(3,9);g.userData.test='unchanged';
  const attributes=g.attributes,position=g.attributes.position;
  assert.equal(f.removeZeroAreaTriangles(g),g);assert.equal(g.attributes,attributes);assert.equal(g.attributes.position,position);
  assert.deepEqual(Array.from(g.index.array),[0,1,2,2,1,0]);
  assert.equal(JSON.stringify(g.groups),JSON.stringify([{start:0,count:3,materialIndex:7},{start:3,count:3,materialIndex:9}]));
  assert.equal(JSON.stringify(g.drawRange),JSON.stringify({start:3,count:3}));assert.equal(g.userData.test,'unchanged');
  const empty=g.clone();empty.setIndex([0,0,0]);empty.clearGroups();empty.setDrawRange(0,Infinity);const index=empty.index;
  f.removeZeroAreaTriangles(empty);assert.equal(empty.index,index,'wholly empty channel kept byte-identical');
});
