import {readStage} from '../patches/native-stages/tests/fixture.mjs';
import {fixture} from '../patches/splatoon3/tests/source-fixture.mjs';
import {adaptBuildSource} from '../scripts/inkwave-source-composition.mjs';
const f=await fixture({fullRuntime:true,adaptNative:adaptBuildSource,adaptRuntime:adaptBuildSource,extraExports:"export {NativeLevel,NativePhysics} from './patches/native-stages/runtime/engine.mjs';"}),data=readStage(process.env.INKWAVE_NATIVE_STAGE_ASSETS,'shipshape'),L=new f.NativeLevel(data),P=new f.NativePhysics(L),down=new f.THREE.Vector3(0,-1,0),results=[];
for(const team of [0,1])for(let z=60;z<=70;z+=2)for(let x=-22;x<=22;x+=2){const h=P.raycast(new f.THREE.Vector3(x,15,team?-z:z),down,20);if(h.hit&&h.normal.y>.68&&h.point.y>=0&&h.point.y<14&&P.bodyFits(h.point.clone().add(new f.THREE.Vector3(0,.08,0)),.42,.32,1.45,false,.01))results.push({point:h.point.toArray(),normal:h.normal.toArray(),triangle:h.triangle,face:h.face,sourceObject:L.manifest.objects[L.triangleWorld.objectIds[h.triangle]].name});}
console.log(JSON.stringify(results));
