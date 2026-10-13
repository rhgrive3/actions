import {nativeFixture,readStage} from '../patches/native-stages/tests/fixture.mjs';
const f=await nativeFixture(),L=new f.NativeLevel(readStage(process.env.INKWAVE_NATIVE_STAGE_ASSETS,'bluefin')),V=f.THREE.Vector3;
const x=29,z=63.166666666666664,y=16.6018009185791,results=[];
for(const [label,above,distance,minNormalY] of [['broad-floor',.1,.3,.45],['selected-plane',.002,.004,.45],['broad-general',.1,.3,-2]]){
 const h=L.triangleWorld.ray(new V(x,y+above,z),new V(0,-1,0),distance,{minNormalY});
 results.push({label,originY:y+above,distance,hit:h?{triangle:h.triangle,point:h.point.toArray(),normal:h.normal.toArray(),flags:h.flags,sourceObject:L.manifest.objects[h.object].name}:null});
}
console.log(JSON.stringify({x,z,selectedMapHeight:y,results}));
