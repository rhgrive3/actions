import * as THREE from 'three';
// Construction view only. Shared geometry and every vertex attribute remain untouched.
export function isolateHeadForDiagnostic(character){
 const head=character.bones.head,below=(o,a)=>{for(let p=o;p;p=p.parent)if(p===a)return true;return false;};
 const headBones=new Set(character.skeleton.bones.flatMap((b,i)=>below(b,head)?[i]:[]));
 const undo=[],receipt={label:'isolated-head-under-construction-only',policy:'Hide non-head attachments and triangles with no head-descendant influence; retain original head/hair/gear vertex attributes and transforms.',objects:[]};
 character.root.traverse(o=>{
  if(!o.isMesh||!o.visible||below(o,head))return;
  if(/^kid:(hair|eyes):/.test(o.name)){receipt.objects.push({name:o.name,action:'unchanged-head-hair'});return;}
  const original=o.geometry,si=original.attributes.skinIndex,sw=original.attributes.skinWeight;
  if(!o.isSkinnedMesh||!si||!sw){const v=o.visible;o.visible=false;undo.push(()=>o.visible=v);receipt.objects.push({name:o.name||o.type,action:'hidden-non-head-attachment'});return;}
  const n=original.index?.count||original.attributes.position.count,kept=[];
  const hasHead=v=>{for(let k=0;k<si.itemSize;k++)if(sw.array[v*sw.itemSize+k]>1e-6&&headBones.has(si.array[v*si.itemSize+k]))return true;return false;};
  for(let i=0;i<n;i+=3){const tri=[0,1,2].map(k=>original.index?original.index.getX(i+k):i+k);if(tri.some(hasHead))kept.push(...tri);}
  receipt.objects.push({name:o.name,action:kept.length===n?'unchanged':kept.length?'head-triangle-index-view':'hidden-below-neck',originalTriangles:n/3,retainedTriangles:kept.length/3});
  if(kept.length===n)return;
  if(!kept.length){const v=o.visible;o.visible=false;undo.push(()=>o.visible=v);return;}
  if(original.groups.length)throw Error('Unexpected grouped native skin geometry');
  const view=new THREE.BufferGeometry();for(const [name,attr]of Object.entries(original.attributes))view.setAttribute(name,attr);
  view.setIndex(kept);view.boundingBox=original.boundingBox;view.boundingSphere=original.boundingSphere;o.geometry=view;
  undo.push(()=>{o.geometry=original;view.dispose();});
 });
 let restored=false;return {receipt,restore(){if(restored)return;restored=true;for(const f of undo.reverse())f();}};
}
