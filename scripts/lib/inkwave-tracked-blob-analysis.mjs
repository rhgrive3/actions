import {verifyServedRenderer} from './inkwave-verified-renderer.mjs';
import {THREE,mapHead,screenBounds,isolatedHead} from './inkwave-tracked-blob-mapping.mjs';
export function analyzeReadback(before,after,expected){
 try {
  if(!before||!after||JSON.stringify(before)!==JSON.stringify(after))throw Error('Frame, camera or sampled state changed');
  if(before.frame!==expected.frame||JSON.stringify(before.binding)!==JSON.stringify(expected.binding))throw Error('Wrong frame or source binding');
  verifyServedRenderer(before.binding);
  if(!Number.isSafeInteger(before.tick)||!Number.isFinite(before.time))throw Error('Missing simulation identity');
  if(before.otherProjectileBatches.length)throw Error('Other projectile batches lack bounds');
  if(!before.blob.visible||!before.tracked.live)throw Error('Invisible or dead tracked head');
  const b=before.blob,t=before.tracked,p={...t,pos:new THREE.Vector3(...t.pos),vel:new THREE.Vector3(...t.vel)};
  // Undefined optionals were encoded as null, matching native ??/|| defaults.
  const index=mapHead(p,b.matrices,b.shapes,b.count),geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(b.normals,3));
  const vp=new THREE.Matrix4().fromArray(before.camera.projection).multiply(new THREE.Matrix4().fromArray(before.camera.view)).multiply(new THREE.Matrix4().fromArray(b.matrixWorld));
  const bounds=Array.from({length:b.count},(_,i)=>screenBounds(geometry,b.matrices.slice(i*16,i*16+16),b.shapes.slice(i*4,i*4+4),vp,before.viewport.width,before.viewport.height));
  const roi=isolatedHead(index,bounds);
  if(roi.maxX<0||roi.maxY<0||roi.minX>=before.viewport.width||roi.minY>=before.viewport.height)throw Error('ROI outside viewport');
  return {status:'mapped-geometric-roi-only',index,roi,visibilityEstablished:false,scope:'CPU mapping and geometric bounds; no GPU visibility acceptance or calibrated postprocess margin'};
 }catch(error){return {status:'unresolved',reason:String(error.message),visibilityEstablished:false};}
}
