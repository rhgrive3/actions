// Test-only bridge for the rejected scenery merge experiment.
export function adaptSceneryStorageCandidate(rel,code,once){
  const patch=(from,to,why)=>{code=once(code,from,to,'scenery storage candidate: '+why);};
  if(rel==='src/world/environment.js'){
    code="import { mergeOwnedSceneryGeometries } from '../../patches/local-quality/tests/fixtures/geometry-storage/scenery-owned-merge.mjs';\n"+code;
    patch('    const geo = mergeGeometries(all);','    const geo = mergeOwnedSceneryGeometries(all, THREE, mergeGeometries);','consume private skyline attributes in order');
    patch('    this.staticScenery = new THREE.Mesh(mergeGeometries(staticParts), shoreMat);',
      '    this.staticScenery = new THREE.Mesh(mergeOwnedSceneryGeometries(staticParts, THREE, mergeGeometries), shoreMat);','consume private quay and lighthouse parts');
    patch('    const treeGeo = mergeGeometries(treeParts);','    const treeGeo = mergeOwnedSceneryGeometries(treeParts, THREE, mergeGeometries);','consume private tree template parts');
  }
  return code;
}
