import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';

test('connected squid eye follows mantle across center and every LOD/rate without changing legacy eyes',async()=>{
 const f=await sourceLoadedActorFixture({random:()=>.4});let checks=0,maxError=0,maxSeam=0,legacySplit=0;
 for(const hz of [30,60,120])for(const lod of ['hero','game','far']){
  const a=await f.make(),ch=a.character;ch.onEvent=null;ch.setLod(lod);a.form='squid';a.submerged=false;
  const tick=()=>{f.G.time+=1/hz;a._finishFrame(1/hz);ch.root.updateMatrixWorld(true);};
  for(let i=0;i<hz;i++)tick();
  const r=ch.sourceMotion.squidRig,original=r.eyeOriginal;
  // A connected three-column strip straddles the old x-sign discontinuity.
  const g=new f.THREE.BufferGeometry(),coords=[];
  for(const y of [.05,.09,.13])for(const x of [-1e-6,0,1e-6])coords.push(x,y,.1);
  g.setAttribute('position',new f.THREE.Float32BufferAttribute(coords,3));g.setAttribute('normal',new f.THREE.Float32BufferAttribute(coords.map((_,i)=>i%3===2?1:0),3));g.userData.squidConnectedEye=true;
  r.setEyeGeometry(g);const data=r.eyeData,segments=data.headSegments,weights=data.headWeights;
  assert(data.headIds,'explicit connected geometry enables continuous mantle binding');
  const expectedIds=['Sqd_head0','Sqd_head1','Sqd_head2'].map(name=>r.index[name]),ys=expectedIds.map(id=>new f.THREE.Matrix4().multiplyMatrices(r.map,r.bank.rest.world[id]).elements[13]);
  assert.deepEqual(Array.from(data.headIds),expectedIds);
  for(let i=0;i<9;i++){const y=coords[i*3+1],k=y<ys[1]?0:1,t=Math.max(0,Math.min(1,(y-ys[k])/(ys[k+1]-ys[k])));assert.equal(segments[i],k);assert(Math.abs(weights[i]-t)<1e-7);}
  const v=new f.THREE.Vector3(),v2=new f.THREE.Vector3(),actual=new f.THREE.Vector3();
  for(const state of ['wait','swim','jump']){
   a.submerged=state==='swim';a.grounded=a.ground.hit=state!=='jump';a.vel.set(0,state==='jump'?4:0,state==='swim'?6:0);
   for(let frame=0;frame<hz/5;frame++){
    tick();assert.equal(r.eyeData,data);assert.equal(data.headSegments,segments);assert.equal(data.headWeights,weights);
    const p=r.eyeGeometry.attributes.position,n=r.eyeGeometry.attributes.normal;
    for(let i=0;i<p.count;i++){
     const j=i*3,k=segments[i],t=weights[i];
     v.fromArray(data.base,j).applyMatrix4(r.matrices[data.headIds[k]]).multiplyScalar(1-t).addScaledVector(v2.fromArray(data.base,j).applyMatrix4(r.matrices[data.headIds[k+1]]),t);
     const error=actual.fromBufferAttribute(p,i).distanceTo(v);maxError=Math.max(maxError,error);assert(error<3e-8);
     assert(Math.abs(actual.fromBufferAttribute(n,i).length()-1)<1e-6);checks++;
    }
    for(let row=0;row<3;row++){
     const seam=v.fromBufferAttribute(p,row*3).distanceTo(v2.fromBufferAttribute(p,row*3+2));maxSeam=Math.max(maxSeam,seam);assert(seam<5e-6,'center has no left/right eye-bone split');
     const j=row*9;legacySplit=Math.max(legacySplit,v.fromArray(data.base,j).applyMatrix4(r.matrices[r.index.Sqd_eye_R]).distanceTo(v2.fromArray(data.base,j+6).applyMatrix4(r.matrices[r.index.Sqd_eye_L])));
    }
   }
  }
  // Untagged legacy geometry still selects its original left/right eye matrices.
  const legacy=g.clone();legacy.userData={};r.setEyeGeometry(legacy);r.deformEyes();assert(!r.eyeData.headIds);
  for(let i=0;i<9;i++){const j=i*3,id=r.index[coords[j]>=0?'Sqd_eye_L':'Sqd_eye_R'];v.fromArray(r.eyeBase,j).applyMatrix4(r.matrices[id]);assert(v.distanceTo(v2.fromBufferAttribute(r.eyeGeometry.attributes.position,i))<3e-8);}
  r.setEyeGeometry(original);g.dispose();legacy.dispose();f.reset();
 }
 assert(legacySplit>1e-4,'actual source poses reproduce the old center split');
 console.log('CONNECTED_EYE_BINDING '+JSON.stringify({checks,maxError,maxSeam,legacySplit,lods:3,rates:[30,60,120]}));
});

test('actual connected eye grid matches mantle deformation in wait, swim and jump',async()=>{
const f=await sourceLoadedActorFixture({random:()=>.4});
for(const lod of ['hero','game','far']){
 const a=await f.make(),ch=a.character;ch.onEvent=null;ch.setLod(lod);a.form='squid';for(let j=0;j<60;j++){f.G.time+=1/60;a._finishFrame(1/60);}
 const r=ch.sourceMotion.squidRig,data=r.eyeData,p=r.eyeGeometry.attributes.position,ids=['Sqd_head0','Sqd_head1','Sqd_head2'].map(n=>r.index[n]),ys=ids.map(id=>new f.THREE.Matrix4().multiplyMatrices(r.map,r.bank.rest.world[id]).elements[13]);
 assert(data.headIds);let max=0,oldMax=0;const v=new f.THREE.Vector3(),v2=new f.THREE.Vector3(),actual=new f.THREE.Vector3();
 for(const [clip,frame]of [['Sqd_Wait',0],['Sqd_Wait',15],['Sqd_Wait',30],['Sqd_Walk',0],['Sqd_Walk',10],['Sqd_Walk',20],['Sqd_Jump',0],['Sqd_Jump',5],['Sqd_Jump',11]]){
  r.bank.sample(clip,frame,ch.sourceMotion.squidPose);r.apply(ch.sourceMotion.squidPose,{form:'squid'});
  for(let i=0;i<p.count;i++){
   const j=i*3,y=data.base[j+1],k=y<ys[1]?0:1,t=Math.max(0,Math.min(1,(y-ys[k])/(ys[k+1]-ys[k])));
   v.fromArray(data.base,j).applyMatrix4(r.matrices[ids[k]]).multiplyScalar(1-t).addScaledVector(v2.fromArray(data.base,j).applyMatrix4(r.matrices[ids[k+1]]),t);
   max=Math.max(max,v.distanceTo(actual.fromBufferAttribute(p,i)));
   oldMax=Math.max(oldMax,v.distanceTo(v2.fromArray(data.base,j).applyMatrix4(r.matrices[r.index[data.base[j]>=0?'Sqd_eye_L':'Sqd_eye_R']])));
  }
 }
 assert(max<4e-8);console.log(JSON.stringify({lod,vertices:p.count,poses:9,maxMantleError:max,oldEyeBoneMismatch:oldMax}));f.reset();
}

});
