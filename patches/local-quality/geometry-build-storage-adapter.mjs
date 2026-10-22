// Build-time bridge for immutable public source; exact anchors fail closed.
export function adaptGeometryBuildStorage(rel,code,once) {
  const patch=(from,to,why)=>{code=once(code,from,to,'geometry build storage: '+why);};
  if(rel==='src/world/level.js'){
    code="import { createLevelGeometryStorage } from '../../patches/local-quality/geometry-build-storage.mjs';\n"+code;
    patch('    const B = { pos: [], nor: [], col: [], puv: [], luv: [], fuv: [], fdat: [], fflag: [], ftan: [], idx: [] };',
      '    const B = createLevelGeometryStorage();','bounded typed chunks retaining native double position');
    for(const [key,width] of [['nor',3],['col',3],['fuv',2],['fdat',4],['fflag',3],['ftan',3]])
      patch(`B.${key}.push(`,`B.${key}.push${width}(`,'fixed-width '+key+' writes');
    for(const [from,to] of [['if (f.atlas) B.puv.push(','if (f.atlas) B.puv.push2('],['else B.puv.push(0, 0);','else B.puv.push2(0, 0);'],['if (f.light) B.luv.push(','if (f.light) B.luv.push2('],['else B.luv.push(-1, -1);','else B.luv.push2(-1, -1);']])patch(from,to,'fixed-width atlas coordinates');
    patch('if (_c.dot(n) >= 0) B.idx.push(i0, i1, i2); else B.idx.push(i0, i2, i1);',
      'if (_c.dot(n) >= 0) B.idx.push3(i0, i1, i2); else B.idx.push3(i0, i2, i1);','fixed-width winding output');
    for(const [name,key,size] of [['normal','nor',3],['color','col',3],['paintUv','puv',2],['lightUv','luv',2],['faceUv','fuv',2],['faceData','fdat',4],['faceFlags','fflag',3],['faceTan','ftan',3]])
      patch(`    g.setAttribute('${name}', new THREE.Float32BufferAttribute(B.${key}, ${size}));`,
        `    g.setAttribute('${name}', new THREE.Float32BufferAttribute(B.${key}.finish(Float32Array).buffer, ${size}));`,'adopt final '+name+' array without a second copy');
    patch('    g.setIndex(B.idx);',`    g.setIndex(B.idx.maximum >= 65535
      ? new THREE.Uint32BufferAttribute(B.idx.finish(Uint32Array).buffer, 1)
      : new THREE.Uint16BufferAttribute(B.idx.finish(Uint16Array).buffer, 1));`,'match vendor primitive-restart index threshold');
  }

  return code;
}
