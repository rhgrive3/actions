// Older privately prepared manifests can have valid file hashes yet still
// contain the old decorative-name classification. Reject that semantic defect
// before publishing a world; checksums alone cannot detect it.
export function assertSourceTerrainObjects(manifest) {
 const excluded=manifest.sourceSemantics?.nonCollidableObjectPatterns||[];
 for(const o of manifest.objects){
  if(!o.active||o.background||!/^Fld(?:Obj)?_/.test(o.name)||!/GroundGrass/i.test(o.material))continue;
  if(excluded.some(p=>new RegExp(p).test(o.name)))continue;
  if(!o.collidable)throw Error(`Native structural ground excluded from collision; rebuild source conversion: ${manifest.id}/${o.name}`);
 }
}
