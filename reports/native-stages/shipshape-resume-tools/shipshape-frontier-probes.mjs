import {nativeFixture,readStage} from '../patches/native-stages/tests/fixture.mjs';
const f=await nativeFixture(),{THREE,PLAYER}=f,L=new f.NativeLevel(readStage(process.env.INKWAVE_NATIVE_STAGE_ASSETS,'shipshape')),P=new f.NativePhysics(L),data=L.data,results=[];
for(const sign of [-1,1])for(const z of [38,39,40]){
 const origin=new THREE.Vector3(sign*26.5,1.8,sign*z),dir=new THREE.Vector3(-sign,0,0),first=P.raycast(origin,dir,1.25),rows=[];
 if(!first.hit)continue;
 for(let y=1.8;y<6.1;y+=.15){const h=P.raycast(origin.clone().setY(y),dir,1.25),o=h.triangle>=0?L.manifest.objects[L.triangleWorld.objectIds[h.triangle]]:null;rows.push({y,hit:h.hit,face:h.face,point:h.hit?h.point.toArray():null,object:o?.name,material:o?.material,paintable:o?.paintable});}
 results.push({side:sign,z:sign*z,rows});
}
console.log(JSON.stringify(results));
