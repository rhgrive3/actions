import test from 'node:test';import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';
test('compact supports retarget source pivots and keep upper joins behind mantle through actual poses',async()=>{
 const f=await sourceLoadedActorFixture({random:()=>.4});let upperChecks=0,tipChecks=0;
 for(const lod of ['hero','game','far']){
  const a=await f.make(),ch=a.character;ch.onEvent=null;ch.setLod(lod);a.form='squid';for(let j=0;j<60;j++){f.G.time+=1/60;a._finishFrame(1/60);}
  const r=ch.sourceMotion.squidRig,g=ch.squid.body.geometry,p=g.attributes.position,ex=g.attributes.aEx,col=g.attributes.color,uv=g.attributes.uv,ix=g.attributes.skinIndex,w=g.attributes.skinWeight;
  assert(g.userData.squidCompactSupports);assert.equal(r.compactLegMaps.filter(Boolean).length,8);
  const v=new f.THREE.Vector3(),out=new f.THREE.Vector3(),expected=new f.THREE.Matrix4(),rest=new f.THREE.Matrix4(),identity=new f.THREE.Matrix4();
  r.resetDeformation();for(const m of r.matrices)assert(m.elements.every((n,i)=>Math.abs(n-identity.elements[i])<1e-10));
  const triangles=[];for(let j=0;j<g.index.count;j+=3){const ids=[g.index.getX(j),g.index.getX(j+1),g.index.getX(j+2)];if(ids.every(i=>ex.getX(i)<.5))triangles.push(...ids);}
  const mantle=new f.THREE.BufferGeometry();mantle.setIndex(triangles);mantle.setAttribute('position',p.clone());const mat=new f.THREE.MeshBasicMaterial({side:f.THREE.DoubleSide}),mesh=new f.THREE.Mesh(mantle,mat);mesh.updateMatrixWorld();const ray=new f.THREE.Raycaster(),toward=new f.THREE.Vector3(0,-.42,.906).normalize();
  const upper=[],tips={4:[],6:[]};
  for(let i=0;i<p.count;i++)if(ex.getX(i)>.5&&ex.getX(i)!==2){const k=Math.round(col.getZ(i)*10)%10,u=uv.getX(i);if([2,4,6,8].includes(k)&&u<=.35){upper.push(i);assert.equal(w.array[i*4+2],1,'embedded upper support is waist-owned');}if((k===4||k===6)&&u>.9)tips[k].push(i);if(k===0||k===9)assert(Math.abs(w.array[i*4+2]-(1-Math.max(0,Math.min(1,u*5))))<1e-7,'long-arm attachment remains unchanged');}
  const spans=[];
  const mean=(attribute,list)=>{const point=new f.THREE.Vector3();for(const i of list)point.add(v.fromBufferAttribute(attribute,i));return point.divideScalar(list.length);};
  for(const k of [2,4,6,8]){const roots=[],ends=[];for(let i=0;i<p.count;i++)if(ex.getX(i)>.5&&ex.getX(i)!==2&&Math.round(col.getZ(i)*10)%10===k){if(uv.getX(i)<.015)roots.push(i);if(uv.getX(i)>.95)ends.push(i);}spans.push({k,roots,ends,restLength:mean(p,roots).distanceTo(mean(p,ends))});}
  for(const[clip,frame]of [['Sqd_Wait',0],['Sqd_Wait',15],['Sqd_Wait',30],['Sqd_Wait',45],['Sqd_Walk',0],['Sqd_Walk',10],['Sqd_Walk',15],['Sqd_Walk',16],['Sqd_Walk',20],['Sqd_Jump',0],['Sqd_Jump',2],['Sqd_Jump',5],['Sqd_Jump',11]]){
   r.bank.sample(clip,frame,ch.sourceMotion.squidPose);r.apply(ch.sourceMotion.squidPose,{form:'squid'});
   for(let b=0;b<r.bones.length;b++){
    expected.multiplyMatrices(r.map,ch.sourceMotion.squidPose.world[b]);rest.multiplyMatrices(r.map,r.bank.rest.world[b]);
    if(r.compactLegMaps[b]){expected.premultiply(r.compactLegMaps[b]);rest.premultiply(r.compactLegMaps[b]);}
    expected.multiply(rest.invert());assert(expected.elements.every((n,i)=>Math.abs(n-r.matrices[b].elements[i])<1e-9),'source pose is conjugated, never replaced or damped');
   }
   for(let i=0;i<p.count;i++){out.set(0,0,0);for(let j=0;j<4;j++)if(w.array[i*4+j])out.addScaledVector(v.fromBufferAttribute(p,i).applyMatrix4(r.matrices[ix.array[i*4+j]]),w.array[i*4+j]);mantle.attributes.position.setXYZ(i,out.x,out.y,out.z);}
   mantle.computeBoundingSphere();mantle.computeBoundingBox();
   for(const span of spans){const ratio=mean(mantle.attributes.position,span.roots).distanceTo(mean(mantle.attributes.position,span.ends))/span.restLength;assert(ratio>.5&&ratio<1.5,JSON.stringify({kind:'compact support stretched or collapsed',lod,clip,frame,k:span.k,ratio}));}
   for(const i of upper){ray.set(v.fromBufferAttribute(mantle.attributes.position,i),toward);assert(ray.intersectObject(mesh).length>0,JSON.stringify({kind:'upper short support penetrates front mantle',lod,clip,frame,k:Math.round(col.getZ(i)*10)%10,u:uv.getX(i)}));upperChecks++;}
   if(clip!=='Sqd_Walk')for(const k of [4,6]){let visible=0;for(const i of tips[k]){ray.set(v.fromBufferAttribute(mantle.attributes.position,i),toward);if(!ray.intersectObject(mesh).length)visible++;}assert(visible>0,JSON.stringify({kind:'central lobe disappeared',lod,clip,frame,k}));tipChecks++;}
  }
  mantle.dispose();mat.dispose();f.reset();
 }
 console.log('COMPACT_SUPPORT_BINDING '+JSON.stringify({lods:3,posesPerLOD:13,upperChecks,tipChecks}));
});
