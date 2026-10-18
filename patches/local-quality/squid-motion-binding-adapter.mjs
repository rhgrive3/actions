import {adaptSquidFormEase} from './squid-form-ease-adapter.mjs';
// Source squid presentation binding only. Existing S3 geometry places the long
// feelers at0/9 and turns body/face together; preserve those authored contracts
// when the optional source skeleton replaces the native meshes.
export function adaptSquidMotionBinding(rel,code,replaceOnce){
  code=adaptSquidFormEase(rel,code,replaceOnce);
  if(rel!=='src/game/motion/squid-rig.js')return code;
  code=replaceOnce(code,"const ARM_FOR_VERTEX=['B','B','A','A','L','C','R','D','D','C'];\n","const ARM_FOR_VERTEX=['L','B','A','A','B','C','C','D','D','R'];\n","source squid binding 0");
  code=replaceOnce(code,"  this.root=new THREE.Group();this.root.name='source-squid-rig';sq.pivot.add(this.root);this.root.add(...this.bones);\n","  this.root=new THREE.Group();this.root.name='source-squid-rig';this.root.position.copy(sq.body.position);this.root.quaternion.copy(sq.body.quaternion);this.root.scale.copy(sq.body.scale);sq.pivot.add(this.root);this.root.add(...this.bones);\n","source squid binding 1");
  code=replaceOnce(code,"  this.ownedMeshes=[];this.oldMeshes={};this.geometries=new Set();this.v=new THREE.Vector3();this.n=new THREE.Vector3();this.q=new THREE.Quaternion();this.m=new THREE.Matrix4();\n","  this.ownedMeshes=[];this.oldMeshes={};this.geometries=new Set();this.v=new THREE.Vector3();this.n=new THREE.Vector3();this.q=new THREE.Quaternion();this.m=new THREE.Matrix4();this.up=new THREE.Vector3(0,1,0);this.euler=new THREE.Euler();this.wallNormal=new THREE.Vector3();this.wallX=new THREE.Vector3();this.wallY=new THREE.Vector3();this.wallZ=new THREE.Vector3();\n","source squid binding 2");
  code=replaceOnce(code,"  sq.pivot.position.set(0,0.165,0);sq.pivot.scale.set(1,1,1);sq.pivot.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),yaw);\n","  sq.pivot.position.set(0,0.165,0);sq.pivot.scale.set(1,1,1);sq.pivot.quaternion.setFromAxisAngle(this.up,yaw);\n","source squid binding 3");
  code=replaceOnce(code,"   sq.pivot.quaternion.setFromEuler(new THREE.Euler(pitch,yaw,0,'YXZ'));sq.pivot.position.y=c.grounded?-0.085:0.22;if(c.grounded)sq.pivot.position.add(this.v.set(0,-0.12,0).applyQuaternion(sq.pivot.quaternion));\n","   sq.pivot.quaternion.setFromEuler(this.euler.set(pitch,yaw,0,'YXZ'));sq.pivot.position.y=c.grounded?-0.085:0.22;if(c.grounded)sq.pivot.position.add(this.v.set(0,-0.12,0).applyQuaternion(sq.pivot.quaternion));\n","source squid binding 4");
  code=replaceOnce(code,"   const normal=new THREE.Vector3(wallNormal.x,wallNormal.y,wallNormal.z).normalize();\n   const z=normal.clone().negate(),y=new THREE.Vector3(0,1,0).addScaledVector(z,-z.y);if(y.lengthSq()<1e-8)y.set(0,0,1);y.normalize();const x=new THREE.Vector3().crossVectors(y,z).normalize();\n","   const normal=this.wallNormal.set(wallNormal.x,wallNormal.y,wallNormal.z).normalize();\n   const z=this.wallZ.copy(normal).negate(),y=this.wallY.set(0,1,0).addScaledVector(z,-z.y);if(y.lengthSq()<1e-8)y.set(0,0,1);y.normalize();const x=this.wallX.crossVectors(y,z).normalize();\n","source squid binding 5");
  code=replaceOnce(code,'const cache = new WeakMap();','const cache = new WeakMap();\nconst sourceSkinnedGeometries = new WeakSet();','source squid geometry ownership');
  code=replaceOnce(code,'variants.set(key,g);return g;','variants.set(key,g);sourceSkinnedGeometries.add(g);return g;','mark source skin binding');
  code=replaceOnce(code,'if(!sq[name].geometry.attributes.skinIndex)','if(!sourceSkinnedGeometries.has(sq[name].geometry))','rebind native placeholder skin attributes after LOD swap');
  code=replaceOnce(code,"   if(key==='dark'){a=id('Sqd_head0');b=id('Sqd_forehead');t=clamp((pos.getY(i)-0.04)/0.16,0,0.5);}\n   else if((ex?.getX(i)||0)<0.5){","   if(key==='dark'||(ex?.getX(i)||0)<0.5){",'squid face band follows mantle skin weights');
  code=replaceOnce(code,"  }else if(form==='climb'&&wallNormal){","  }else if(form==='squid'&&!c.sourceMotion?.manual){\n   // Preserve the existing S3-look dry coordinate frame; source bones own the hop/deformation.\n   // The native dolphin branch already follows travel for a fast dry jump.\n   const dolphin=!c.grounded&&speed>3;\n   const pitch=dolphin?Math.PI/2-Math.atan2(velocityY,Math.max(speed,0.5)):Math.PI/2-0.52;\n   sq.pivot.quaternion.setFromEuler(this.euler.set(pitch,yaw,0,'YXZ'));\n   sq.pivot.position.set(0,dolphin?0.22:0.09,0);\n   if(!dolphin)sq.pivot.position.add(this.v.set(0,-0.11,0).applyQuaternion(sq.pivot.quaternion));\n  }else if(form==='climb'&&wallNormal){",'restore authored S3 dry source coordinate frame');
  code=replaceOnce(code,"  this.eyeDeform=[new THREE.Matrix4(),new THREE.Matrix4()];","  this.eyeDeform=[new THREE.Matrix4(),new THREE.Matrix4()];this.eyeV2=new THREE.Vector3();this.eyeN2=new THREE.Vector3();this.eyeHeadNormals=[new THREE.Matrix3(),new THREE.Matrix3(),new THREE.Matrix3()];",'connected squid eye scratch');
  code=replaceOnce(code,"  this.eyeGeometry=data.geometry;this.eyeBase=data.base;this.eyeNormals=data.normals;this.character.squid.eyes.geometry=this.eyeGeometry;",`  if(original.userData.squidConnectedEye&&!data.headIds){
   data.headIds=['Sqd_head0','Sqd_head1','Sqd_head2'].map(name=>this.index[name]);
   const ys=data.headIds.map(id=>this.map.clone().multiply(this.bank.rest.world[id]).elements[13]);
   const count=data.base.length/3;data.headSegments=new Uint8Array(count);data.headWeights=new Float32Array(count);
   for(let i=0;i<count;i++){const y=data.base[i*3+1],k=y<ys[1]?0:1;data.headSegments[i]=k;data.headWeights[i]=clamp((y-ys[k])/(ys[k+1]-ys[k]),0,1);}
  }
  this.eyeData=data;this.eyeGeometry=data.geometry;this.eyeBase=data.base;this.eyeNormals=data.normals;this.character.squid.eyes.geometry=this.eyeGeometry;`,'connected squid eye mantle weights');
  code=replaceOnce(code," deformEyes(){\n",` deformEyes(){
  // A connected surface must share the mantle/outline deformation across its center.
  // Retain separate-eye bone behavior for legacy geometry without this explicit tag.
  const data=this.eyeData;
  if(data.headIds){
   const p=this.eyeGeometry.attributes.position,n=this.eyeGeometry.attributes.normal;
   for(let k=0;k<3;k++)this.eyeHeadNormals[k].getNormalMatrix(this.matrices[data.headIds[k]]);
   for(let i=0;i<p.count;i++){
    const j=i*3,k=data.headSegments[i],t=data.headWeights[i];
    this.v.fromArray(this.eyeBase,j).applyMatrix4(this.matrices[data.headIds[k]]).multiplyScalar(1-t);
    this.eyeV2.fromArray(this.eyeBase,j).applyMatrix4(this.matrices[data.headIds[k+1]]);this.v.addScaledVector(this.eyeV2,t);p.setXYZ(i,this.v.x,this.v.y,this.v.z);
    this.n.fromArray(this.eyeNormals,j).applyMatrix3(this.eyeHeadNormals[k]).multiplyScalar(1-t);
    this.eyeN2.fromArray(this.eyeNormals,j).applyMatrix3(this.eyeHeadNormals[k+1]);this.n.addScaledVector(this.eyeN2,t).normalize();n.setXYZ(i,this.n.x,this.n.y,this.n.z);
   }
   p.needsUpdate=true;n.needsUpdate=true;this.eyeGeometry.computeBoundingSphere();return;
  }
`,'connected squid eye continuous deformation');
  code=replaceOnce(code,"    const waist=1-clamp(u*5,0,1);",`    const shortBlend=clamp((u-0.35)/0.5,0,1);
    const waist=(chain==='L'||chain==='R'||!original.userData.squidCompactSupports)?1-clamp(u*5,0,1):1-shortBlend*shortBlend*(3-2*shortBlend);`,'short squid lobe embedded attachment');
  code=replaceOnce(code,"  this.root=new THREE.Group();this.root.name='source-squid-rig';",`  this.compactLegMaps=new Array(this.bones.length).fill(null);
  if(base.userData.squidCompactSupports){
   const p=base.attributes.position,ex=base.attributes.aEx,col=base.attributes.color,uv=base.attributes.uv;
   const center=(k,target)=>{let error=Infinity,u=0;for(let i=0;i<p.count;i++)if(ex.getX(i)>0.5&&ex.getX(i)!==2&&Math.round(col.getZ(i)*10)%10===k){const d=Math.abs(uv.getX(i)-target);if(d<error){error=d;u=uv.getX(i);}}const lo=new THREE.Vector3(Infinity,Infinity,Infinity),hi=new THREE.Vector3(-Infinity,-Infinity,-Infinity),v=new THREE.Vector3();for(let i=0;i<p.count;i++)if(ex.getX(i)>0.5&&ex.getX(i)!==2&&Math.round(col.getZ(i)*10)%10===k&&Math.abs(uv.getX(i)-u)<1e-6){v.fromBufferAttribute(p,i);lo.min(v);hi.max(v);}return lo.add(hi).multiplyScalar(0.5);};
   for(const [k,chain]of [[2,'A'],[4,'B'],[6,'C'],[8,'D']]){
    const first=this.index['Sqd_leg'+chain+'1'],last=this.index['Sqd_leg'+chain+'2'];
    const sourceA=new THREE.Vector3().setFromMatrixPosition(this.bones[first].matrix),sourceB=new THREE.Vector3().setFromMatrixPosition(this.bones[last].matrix),hostA=center(k,0.35),hostB=center(k,0.95);
    const sourceAxis=sourceB.sub(sourceA),hostAxis=hostB.sub(hostA),scale=hostAxis.length()/sourceAxis.length();
    if(!Number.isFinite(scale)||scale<=0)throw new Error('Invalid compact squid support '+k);
    const q=new THREE.Quaternion().setFromUnitVectors(sourceAxis.normalize(),hostAxis.normalize());
    const retarget=new THREE.Matrix4().compose(hostA,q,new THREE.Vector3(scale,scale,scale)).multiply(new THREE.Matrix4().makeTranslation(-sourceA.x,-sourceA.y,-sourceA.z));
    this.compactLegMaps[first]=this.compactLegMaps[last]=retarget;this.bones[first].matrix.premultiply(retarget);this.bones[last].matrix.premultiply(retarget);
   }
  }
  this.root=new THREE.Group();this.root.name='source-squid-rig';`,'compact squid source leg rest pivots');
  code=replaceOnce(code,"this.bones[i].matrix.multiplyMatrices(this.map,pose.world[i]);this.bones[i].matrixWorldNeedsUpdate=true;","this.bones[i].matrix.multiplyMatrices(this.map,pose.world[i]);if(this.compactLegMaps[i])this.bones[i].matrix.premultiply(this.compactLegMaps[i]);this.bones[i].matrixWorldNeedsUpdate=true;",'compact squid source leg posed pivots');
  code=replaceOnce(code,"this.bones[i].matrix.multiplyMatrices(this.map,this.bank.rest.world[i]);this.bones[i].matrixWorldNeedsUpdate=true;","this.bones[i].matrix.multiplyMatrices(this.map,this.bank.rest.world[i]);if(this.compactLegMaps[i])this.bones[i].matrix.premultiply(this.compactLegMaps[i]);this.bones[i].matrixWorldNeedsUpdate=true;",'compact squid source leg reset pivots');
  return code;
}
