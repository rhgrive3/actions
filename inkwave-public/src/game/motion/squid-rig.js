// Bind the existing INKWAVE squid mesh to the actual 23-bone source deformation.
// The mesh/weights are a host retarget, not claimed to be Nintendo's original vertex weights.
import * as THREE from 'three';
import {clamp} from './source-bank.js';
const cache = new WeakMap();
const ARM_FOR_VERTEX=['B','B','A','A','L','C','R','D','D','C'];
export class SourceSquidRig {
 constructor(character,bank){
  this.character=character;this.bank=bank;this.index=bank.index;this.disposed=false;
  const sq=character.squid,base=sq.body.geometry;
  base.computeBoundingBox();
  const size=base.boundingBox.max.y/bank.rest.wp[bank.index.Sqd_head2].z;
  // Source +Z mantle -> host +Y mantle, source +Y belly -> host +Z belly; keep a proper rotation (det +1).
  const rotation=new THREE.Matrix4().set(-1,0,0,0, 0,0,1,0, 0,1,0,0, 0,0,0,1);
  this.map=new THREE.Matrix4().makeScale(size,size,size).multiply(rotation);
  this.map.elements[14]=-bank.rest.wp[bank.index.Sqd_joint_root].y*size;
  this.bones=bank.bones.map((b,i)=>{const bone=new THREE.Bone();bone.name='source:'+b.name;bone.matrixAutoUpdate=false;bone.matrix.multiplyMatrices(this.map,bank.rest.world[i]);return bone;});
  this.root=new THREE.Group();this.root.name='source-squid-rig';sq.pivot.add(this.root);this.root.add(...this.bones);
  this.root.updateWorldMatrix(true,true);
  const inverse=this.bones.map(b=>b.matrix.clone().invert());this.skeleton=new THREE.Skeleton(this.bones,inverse);
  this.ownedMeshes=[];this.oldMeshes={};this.geometries=new Set();this.v=new THREE.Vector3();this.n=new THREE.Vector3();this.q=new THREE.Quaternion();this.m=new THREE.Matrix4();
  for(const name of ['body','ghost','dark']){
   const old=sq[name];this.oldMeshes[name]=old;
   const geo=this.skinGeometry(old.geometry,name);
   const mesh=new THREE.SkinnedMesh(geo,old.material);mesh.name=old.name;mesh.castShadow=old.castShadow;mesh.receiveShadow=old.receiveShadow;mesh.renderOrder=old.renderOrder;mesh.visible=old.visible;mesh.frustumCulled=false;
   mesh.bind(this.skeleton,new THREE.Matrix4());sq.pivot.remove(old);sq.pivot.add(mesh);sq[name]=mesh;this.ownedMeshes.push(mesh);
  }
  // Eyes use the existing facial shader, whose bone-index contract belongs to the human rig: CPU skin only these.
  this.eyeVariants=new Map();this.eyeOriginal=sq.eyes.geometry;this.setEyeGeometry(this.eyeOriginal);
  this.eyeDeform=[new THREE.Matrix4(),new THREE.Matrix4()];
  this.matrices=bank.bones.map(()=>new THREE.Matrix4());this.inverse=inverse;
 }
 skinGeometry(original,part){
  let variants=cache.get(original);if(!variants){variants=new Map();cache.set(original,variants);}const key=part==='dark'?'dark':'body';if(variants.has(key))return variants.get(key);
  const g=original.clone(),n=g.attributes.position.count,indices=new Uint16Array(n*4),weights=new Float32Array(n*4),pos=g.attributes.position,ex=g.attributes.aEx,col=g.attributes.color,uv=g.attributes.uv;
  const id=name=>{const i=this.index[name];if(i===undefined)throw new Error('Missing squid source bone '+name);return i;};
  const headY=['Sqd_head0','Sqd_head1','Sqd_head2'].map(name=>this.map.clone().multiply(this.bank.rest.world[id(name)]).elements[13]);
  for(let i=0;i<n;i++){
   let a,b,t;
   if(key==='dark'){a=id('Sqd_head0');b=id('Sqd_forehead');t=clamp((pos.getY(i)-0.04)/0.16,0,0.5);}
   else if((ex?.getX(i)||0)<0.5){
    const y=pos.getY(i),[first,middle,last]=headY;
    if(y<middle){a=id('Sqd_head0');b=id('Sqd_head1');t=clamp((y-first)/(middle-first),0,1);}else{a=id('Sqd_head1');b=id('Sqd_head2');t=clamp((y-middle)/(last-middle),0,1);}
   }else{
    const k=Math.round((col?.getZ(i)||0)*10)%10,chain=ARM_FOR_VERTEX[k],u=clamp(uv?.getX(i)||0,0,1);
    if(chain==='L'||chain==='R'){
     const segment=u<0.5?1:2;a=id(`Sqd_arm${segment}_${chain}`);b=id(`Sqd_arm${segment+1}_${chain}`);t=u<0.5?u*2:(u-0.5)*2;
    }else{a=id(`Sqd_leg${chain}1`);b=id(`Sqd_leg${chain}2`);t=u;}
    // Root of every tentacle remains attached to the waist during strong deformation.
    const waist=1-clamp(u*5,0,1);indices[i*4+2]=id('Sqd_waist');weights[i*4+2]=waist;
    indices[i*4]=a;indices[i*4+1]=b;weights[i*4]=(1-t)*(1-waist);weights[i*4+1]=t*(1-waist);continue;
   }
   indices[i*4]=a;indices[i*4+1]=b;weights[i*4]=1-t;weights[i*4+1]=t;
  }
  g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));variants.set(key,g);return g;
 }
 setEyeGeometry(original){
  if(original===this.eyeGeometry)return;
  let data=this.eyeVariants.get(original);
  if(!data){const geometry=original.clone();data={geometry,base:original.attributes.position.array.slice(),normals:original.attributes.normal.array.slice()};this.eyeVariants.set(original,data);this.geometries.add(geometry);}
  this.eyeGeometry=data.geometry;this.eyeBase=data.base;this.eyeNormals=data.normals;this.character.squid.eyes.geometry=this.eyeGeometry;
 }
 refreshGeometry(){
  const sq=this.character.squid;
  for(const name of ['body','ghost','dark'])if(!sq[name].geometry.attributes.skinIndex)sq[name].geometry=this.skinGeometry(sq[name].geometry,name);
  this.setEyeGeometry(sq.eyes.geometry);if(this.matrices)this.deformEyes();
 }
 deformEyes(){
  this.eyeNormalMatrices ||= [new THREE.Matrix3(),new THREE.Matrix3()];
  for(let i=0;i<2;i++){this.eyeDeform[i].copy(this.matrices[this.index[i?'Sqd_eye_R':'Sqd_eye_L']]);this.eyeNormalMatrices[i].getNormalMatrix(this.eyeDeform[i]);}
  const p=this.eyeGeometry.attributes.position,n=this.eyeGeometry.attributes.normal;
  for(let i=0;i<p.count;i++){
   const j=i*3,side=this.eyeBase[j]>=0?0:1,m=this.eyeDeform[side];
   this.v.fromArray(this.eyeBase,j).applyMatrix4(m);p.setXYZ(i,this.v.x,this.v.y,this.v.z);
   this.n.fromArray(this.eyeNormals,j).applyMatrix3(this.eyeNormalMatrices[side]).normalize();n.setXYZ(i,this.n.x,this.n.y,this.n.z);
  }
  p.needsUpdate=true;n.needsUpdate=true;this.eyeGeometry.computeBoundingSphere();
 }
 resetDeformation(){
  for(let i=0;i<this.bones.length;i++){this.bones[i].matrix.multiplyMatrices(this.map,this.bank.rest.world[i]);this.bones[i].matrixWorldNeedsUpdate=true;this.matrices[i].identity();}
  this.refreshGeometry();this.root.updateWorldMatrix(true,true);this.skeleton.update();
 }
 apply(pose,{form='squid',wallNormal,velocityY=0,speed=0,localX=0,localZ=1,scale=1,yaw=0}={}){
  const c=this.character,sq=c.squid;
  for(let i=0;i<this.bones.length;i++){this.bones[i].matrix.multiplyMatrices(this.map,pose.world[i]);this.bones[i].matrixWorldNeedsUpdate=true;this.matrices[i].multiplyMatrices(this.bones[i].matrix,this.inverse[i]);}
  this.refreshGeometry();
  sq.pivot.position.set(0,0.165,0);sq.pivot.scale.set(1,1,1);sq.pivot.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),yaw);
  if(form==='swim'){
   const pitch=c.grounded?Math.PI/2:Math.PI/2-Math.atan2(velocityY,Math.max(speed,1e-8));
   sq.pivot.quaternion.setFromEuler(new THREE.Euler(pitch,yaw,0,'YXZ'));sq.pivot.position.y=c.grounded?-0.085:0.22;if(c.grounded)sq.pivot.position.add(this.v.set(0,-0.12,0).applyQuaternion(sq.pivot.quaternion));
  }else if(form==='climb'&&wallNormal){
   const normal=new THREE.Vector3(wallNormal.x,wallNormal.y,wallNormal.z).normalize();
   const z=normal.clone().negate(),y=new THREE.Vector3(0,1,0).addScaledVector(z,-z.y);if(y.lengthSq()<1e-8)y.set(0,0,1);y.normalize();const x=new THREE.Vector3().crossVectors(y,z).normalize();
   this.m.makeBasis(x,y,z);sq.pivot.quaternion.setFromRotationMatrix(this.m);
   c.model.getWorldQuaternion(this.q).invert();sq.pivot.quaternion.premultiply(this.q);c.root.getWorldPosition(this.v);this.v.y+=0.26;this.v.addScaledVector(normal,-c.climbInset-0.07);sq.pivot.position.copy(c.model.worldToLocal(this.v));
  }
  c.squidRoot.scale.setScalar(Math.max(0.001,scale));c.squidRoot.position.set(0,0,0);c.squidRoot.visible=scale>0.001;
  c.u.uWig.value.set(0,0,0); // Do not add the old unsourced sinusoidal tentacle motion on top of source bones.
  const submerged=form==='swim'||form==='climb';sq.ghost.visible=submerged&&c.isLocal;sq.dark.visible=sq.eyes.visible=!(submerged&&!c.isLocal);
  sq.eyes.scale.set(1,1,1);sq.eyes.position.set(0,0,0);this.root.updateWorldMatrix(true,true);this.skeleton.update();
 }
 dispose(){
  if(this.disposed)return;this.disposed=true;
  const sq=this.character.squid;
  for(const [name,old]of Object.entries(this.oldMeshes)){sq.pivot.remove(sq[name]);sq.pivot.add(old);sq[name]=old;}
  sq.eyes.geometry=this.eyeOriginal;sq.pivot.remove(this.root);this.skeleton.dispose();for(const g of this.geometries)g.dispose();
 }
}