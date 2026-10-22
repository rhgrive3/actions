// Rejected full-Float64-position prototype. Test/archive only; not a production dependency.
// Build-time bridge for immutable public source; exact anchors fail closed.
export function adaptGeometryBuildStorage(rel,code,once) {
  const patch=(from,to,why)=>{code=once(code,from,to,'geometry build storage: '+why);};
  if(rel==='src/world/level.js'){
    code="import { createLevelGeometryStorage } from '../../patches/local-quality/tests/fixtures/geometry-storage/float64-chunk-runtime.mjs';\n"+code;
    patch('    const B = { pos: [], nor: [], col: [], puv: [], luv: [], fuv: [], fdat: [], fflag: [], ftan: [], idx: [] };',
      '    const B = createLevelGeometryStorage();','bounded typed chunks with double position');
    const winding=`      _a.set(pp[i1 * 3] - pp[i0 * 3], pp[i1 * 3 + 1] - pp[i0 * 3 + 1], pp[i1 * 3 + 2] - pp[i0 * 3 + 2]);
      _b.set(pp[i2 * 3] - pp[i0 * 3], pp[i2 * 3 + 1] - pp[i0 * 3 + 1], pp[i2 * 3 + 2] - pp[i0 * 3 + 2]);`;
    patch(winding,`      const p0=pp.chunks[Math.floor(i0/1024)],p1=pp.chunks[Math.floor(i1/1024)],p2=pp.chunks[Math.floor(i2/1024)];
      const o0=(i0%1024)*3,o1=(i1%1024)*3,o2=(i2%1024)*3;
      _a.set(p1[o1]-p0[o0],p1[o1+1]-p0[o0+1],p1[o1+2]-p0[o0+2]);
      _b.set(p2[o2]-p0[o0],p2[o2+1]-p0[o0+1],p2[o2+2]-p0[o0+2]);`,'preserve unrounded winding reads');
    for(const [key,width] of [['pos',3],['nor',3],['col',3],['fuv',2],['fdat',4],['fflag',3],['ftan',3]])
      patch(`B.${key}.push(`,`B.${key}.push${width}(`,'fixed-width '+key+' writes');
    for(const [from,to] of [['if (f.atlas) B.puv.push(','if (f.atlas) B.puv.push2('],['else B.puv.push(0, 0);','else B.puv.push2(0, 0);'],['if (f.light) B.luv.push(','if (f.light) B.luv.push2('],['else B.luv.push(-1, -1);','else B.luv.push2(-1, -1);']])patch(from,to,'fixed-width atlas coordinates');
    patch('if (_c.dot(n) >= 0) B.idx.push(i0, i1, i2); else B.idx.push(i0, i2, i1);',
      'if (_c.dot(n) >= 0) B.idx.push3(i0, i1, i2); else B.idx.push3(i0, i2, i1);','fixed-width winding output');
    for(const [name,key,size] of [['position','pos',3],['normal','nor',3],['color','col',3],['paintUv','puv',2],['lightUv','luv',2],['faceUv','fuv',2],['faceData','fdat',4],['faceFlags','fflag',3],['faceTan','ftan',3]])
      patch(`    g.setAttribute('${name}', new THREE.Float32BufferAttribute(B.${key}, ${size}));`,
        `    g.setAttribute('${name}', new THREE.BufferAttribute(B.${key}.finish(Float32Array), ${size}));`,'adopt final '+name+' array without a second copy');
    patch('    g.setIndex(B.idx);','    g.setIndex(new THREE.BufferAttribute(B.idx.finish(B.idx.maximum >= 65535 ? Uint32Array : Uint16Array), 1));','match vendor primitive-restart index threshold');
  }
  if(rel==='src/world/environment.js'){
    code="import { mergeOwnedSceneryGeometries } from '../../patches/local-quality/tests/fixtures/geometry-storage/float64-chunk-runtime.mjs';\n"+code;
    patch('    const geo = mergeGeometries(all);','    const geo = mergeOwnedSceneryGeometries(all, THREE, mergeGeometries);','consume private skyline attributes in order');
    patch('    this.staticScenery = new THREE.Mesh(mergeGeometries(staticParts), shoreMat);',
      '    this.staticScenery = new THREE.Mesh(mergeOwnedSceneryGeometries(staticParts, THREE, mergeGeometries), shoreMat);','consume private quay and lighthouse parts');
    patch('    const treeGeo = mergeGeometries(treeParts);','    const treeGeo = mergeOwnedSceneryGeometries(treeParts, THREE, mergeGeometries);','consume private tree template parts');
  }
  return code;
}
