import {nativeFixture,readStage} from '../patches/native-stages/tests/fixture.mjs';
const f=await nativeFixture(),{G,THREE}=f,L=G.level=new f.NativeLevel(readStage(process.env.INKWAVE_NATIVE_STAGE_ASSETS,'shipshape'));G.physics=new f.NativePhysics(L);
class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});const cases=[];
for(const sign of [-1,1])for(const hz of [30,60,120]){
 const from=new THREE.Vector3(-sign*4.5,9,sign*40),to=new THREE.Vector3(-sign*4.5,6,sign*41),linear=G.physics.los(from.clone().add(new THREE.Vector3(0,1.5,0)),to.clone().add(new THREE.Vector3(0,1.5,0))),a=f.make('shooter');a._integrate=f.Actor.prototype._integrate;a.spawnAt(from,sign<0?Math.PI:0);a.intent.move.set(0,0,sign);a.intent.fire=false;a.intent.squid=false;let maxY=a.pos.y;
 for(let i=0;i<hz*1.5;i++){G.time+=1/hz;a.update(1/hz);maxY=Math.max(maxY,a.pos.y);}
 const h=G.physics.raycast(a.pos.clone().add(new THREE.Vector3(0,.15,0)),new THREE.Vector3(0,-1,0),1);const row={sourceTriangle:h.triangle,sourceSupport:h.hit,sign,hz,from:from.toArray(),to:to.toArray(),linearLOS:linear,end:a.pos.toArray(),alive:a.alive,grounded:a.grounded,maxY,supportObject:h.triangle>=0?L.manifest.objects[L.triangleWorld.objectIds[h.triangle]].name:null};cases.push(row);
}
console.log(JSON.stringify(cases));
