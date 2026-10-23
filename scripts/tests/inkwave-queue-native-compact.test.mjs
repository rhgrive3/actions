import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSourceOBJ, collision, convertSource } from '../../patches/native-stages/runtime/source-convert.mjs';

// A source-ordered active / inactive / active fixture exercises global OBJ
// indices, the retained inactive ordinal, and material classification.
const OBJ = [
  'o Fld_Pnt_Floor',
  'usemtl Floor',
  'v 0 0 0', 'v 0 0 2', 'v 2 0 0',
  'vn 0 1 0', 'vn 0 1 0', 'vn 0 1 0',
  'f 1//1 2//2 3//3',
  'o Fld_Var_Poster',
  'usemtl Poster',
  'v 0 1 0', 'v 0 1 2', 'v 2 1 0',
  'vn 0 1 0', 'vn 0 1 0', 'vn 0 1 0',
  'f 4//4 5//5 6//6',
  'o Fld_Pnt_Floor2',
  'usemtl Floor',
  'v 4 0 0', 'v 4 0 2', 'v 6 0 0',
  'vn 0 1 0', 'vn 0 1 0', 'vn 0 1 0',
  'f 7//7 8//8 9//9',
].join('\n') + '\n';

function postCompact(old) {
  const original = old.manifest.objects;
  const active = original.filter(row => row.active);
  const vertices = new Float32Array(active.reduce((n,row)=>n+row.vc*8,0));
  const indices = new Uint32Array(active.reduce((n,row)=>n+row.ic,0));
  let vo=0,io=0;
  const objects=original.map(row=>{
    const packed={...row,vo,io,vc:row.active?row.vc:0,ic:row.active?row.ic:0};
    if(row.active){
      vertices.set(old.vertices.subarray(row.vo*8,(row.vo+row.vc)*8),vo*8);
      indices.set(old.indices.subarray(row.io,row.io+row.ic),io);
      vo+=row.vc;io+=row.ic;
    }
    return packed;
  });
  return {
    ...old,vertices,indices,
    manifest:{
      ...old.manifest,
      sourceGeometry:old.manifest.geometry,
      objects,
      geometry:{...old.manifest.geometry,vertices:vo,triangles:io/3},
    },
  };
}
function stage() { return { id:'fixture-native-stage', sourceSha256:'a'.repeat(64), sourceSemantics:{} }; }
function convert(obj,opt={}) { return convertSource(stage(),obj,'newmtl Floor\nnewmtl Poster\n',{},()=>{},null,opt); }

test('compact OBJ keeps active display bytes, original inactive bounds, and source ordinals',()=>{
  const old=parseSourceOBJ(OBJ,{});
  const compact=parseSourceOBJ(OBJ,{}, {compactInactiveDisplay:true});
  assert.equal(old.vertices.length,9*8);
  assert.equal(compact.vertices.length,6*8);
  assert.deepEqual(Array.from(compact.indices),[0,1,2,0,1,2]);
  assert.deepEqual(compact.objects.map(row=>[row.active,row.vo,row.vc,row.io,row.ic]),
    [[true,0,3,0,3],[false,3,0,3,0],[true,3,3,3,3]]);
  assert.deepEqual(compact.objects[1].bounds, old.objects[1].bounds);
  assert.deepEqual(Array.from(collision(old).objectIds), Array.from(collision(compact).objectIds));
  assert.deepEqual(Array.from(collision(old).triangles), Array.from(collision(compact).triangles));
  assert.deepEqual(compact.sourceGeometry,{vertices:9,triangles:3});
});

test('worker compact output is byte-identical to the old post-conversion packing',()=>{
  const old=convert(OBJ);
  const expected=postCompact(old);
  const actual=convert(new TextEncoder().encode(OBJ),{compactInactiveDisplay:true});
  for(const key of ['vertices','indices','triangles','normals','flags','objectIds','nodes','order','triangleFace','mask']){
    assert.deepEqual(actual[key],expected[key], 'mismatch in '+key);
  }
  assert.deepEqual(actual.manifest,expected.manifest);
  assert.deepEqual(actual.integrity,expected.integrity);
});

test('inactive-missing source yields original geometry with no extra manifest field',()=>{
  const noInactive=OBJ.replace(/o Fld_Var_Poster/g,'o Fld_Pnt_Poster');
  const original=convert(noInactive),compact=convert(noInactive,{compactInactiveDisplay:true});
  assert.deepEqual(compact,original);
  assert.equal(compact.manifest.sourceGeometry,undefined);
});

test('byte input CRLF, BOM, and source order preserve compact geometry',()=>{
  const crlf=OBJ.replace(/\n/g,'\r\n');
  const a=parseSourceOBJ(crlf,{}, {compactInactiveDisplay:true});
  const b=parseSourceOBJ(new TextEncoder().encode('\ufeff'+crlf),{}, {compactInactiveDisplay:true});
  assert.deepEqual(a.vertices,b.vertices);
  assert.deepEqual(a.indices,b.indices);
  assert.deepEqual(a.objects,b.objects);
});

test('malformed or nonfinite geometry in inactive source is still rejected',()=>{
  const bad=OBJ.replace('v 0 1 0','v NaN 1 0');
  assert.throws(()=>parseSourceOBJ(bad,{}),/Invalid source OBJ/);
  assert.throws(()=>parseSourceOBJ(bad,{}, {compactInactiveDisplay:true}),/Invalid source OBJ/);
  const badFace=OBJ.replace('f 4//4 5//5 6//6','f 4//4 5//5 999//6');
  assert.throws(()=>parseSourceOBJ(badFace,{}),/Unsupported separate OBJ indices/);
  assert.throws(()=>parseSourceOBJ(badFace,{}, {compactInactiveDisplay:true}),/Unsupported separate OBJ indices/);
});
