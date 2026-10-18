import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {replaceOnce} from '../adapter.mjs';
export function baselineSourceContact(rel,raw){
 let code=adaptBuildSource(rel,raw);
 if(rel==='src/game/motion/contact-transition.js'){
  const block=s=>{const start=s.indexOf('  this.age+=Math.max(0,dt);');return s.slice(start,s.indexOf('\n }',start));};
  code=replaceOnce(code,block(code),block(raw),'baseline transition');
 }
 return code;
}
/** Rejected quality experiment, available only to the audit regression. A
 * zero-bias support proxy is insufficient when the real toe mesh clips. */
export function rejectedSoleSource(rel,raw){
 let code=adaptBuildSource(rel,raw);
 if(rel==='src/game/motion/retarget.js')code=replaceOnce(code,
  'soleSoft=.010+(1-f.weight)*walkEase*.022',
  'soleSoft=(1-f.weight)*(.010+walkEase*.022)','rejected sole experiment');
 return code;
}
/** Actual indexed/skinned shoe vertices, selected by the production foot/toe
 * bone influences. Geometry and skeleton must already have current matrices. */
export function indexedSoleGeometry(ch,THREE,ground=(x,z)=>0){
 const result=['L','R'].map(side=>({side,vertices:0,minimum:Infinity}));
 const point=new THREE.Vector3();
 for(const mesh of ch.lodSets[ch.lod.tier].list){
  if(!mesh.isSkinnedMesh||!mesh.geometry.index)continue;
  const g=mesh.geometry,ids=g.getAttribute('skinIndex'),weights=g.getAttribute('skinWeight');if(!ids||!weights)continue;
  const selected=new Set(Array.from(g.index.array));
  for(const i of selected)for(let side=0;side<2;side++){
   let influence=0;for(let k=0;k<4;k++){const bone=mesh.skeleton.bones[ids.getComponent(i,k)];if(bone&&['foot'+result[side].side,'toe'+result[side].side].includes(bone.name))influence+=weights.getComponent(i,k);}
   if(influence<.999)continue;
   mesh.getVertexPosition(i,point);point.applyMatrix4(mesh.matrixWorld);
   result[side].vertices++;result[side].minimum=Math.min(result[side].minimum,point.y-ground(point.x,point.z));
  }
 }
 return result;
}
export function contactPoseSnapshot(ch){
 const pose=p=>p&&({p:p.p.map(v=>v.toArray()),q:p.q.map(v=>v.toArray()),s:p.s.map(v=>v.toArray()),world:p.world.map(m=>Array.from(m.elements))});
 const c=ch.sourceMotion,nodes=[];ch.root.traverse(b=>nodes.push([b.name,...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray(),...b.matrixWorld.elements]));
 return JSON.parse(JSON.stringify({nodes,skeleton:Array.from(ch.skeleton.boneMatrices),pose:pose(c.pose),body:pose(c.bodyPose),phase:c.phase,cadence:c.debug.cadenceHz,
  contact:c.contact,gait:c.gaitTargets.indices.map(i=>[...c.gaitTargets.wp[i].toArray(),...c.gaitTargets.wq[i].toArray()]),
  contacts:c.retarget.contacts.map(f=>({locked:f.locked,weight:f.weight,slip:f.slip,reach:f.reachError,clearance:f.lastClearance,
   actual:f.actual.toArray(),anchor:f.anchor.toArray(),target:f.target.toArray(),filter:[...f.filter.position.toArray(),...f.filter.velocity.toArray(),...f.filter.offset.toArray(),...f.filter.offsetVelocity.toArray(),f.filter.age,f.filter.duration]})),
  muzzle:ch.getMuzzle(new ch.root.position.constructor()).toArray()}));
}
