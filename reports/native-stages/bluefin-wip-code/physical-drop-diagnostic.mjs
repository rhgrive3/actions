import fs from 'node:fs';
import {nativeFixture,readStage} from '../patches/native-stages/tests/fixture.mjs';
const f=await nativeFixture(),{G,THREE,PLAYER}=f,L=G.level=new f.NativeLevel(readStage('.codex-stage-sources/generated','bluefin')),P=G.physics=new f.NativePhysics(L);
class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.match.mode='turf';G.match.opts={};const result=[];
for(const x of [-25,-20,-12,12,20,25])for(const side of [-1,1])for(const jumping of [false,true])for(const hz of [30,60,120]){
 const pos=new THREE.Vector3(x,9,side*22),hit=P.raycast(pos.clone().add(new THREE.Vector3(0,2,0)),new THREE.Vector3(0,-1,0),4),fits=P.bodyFits(pos.clone().add(new THREE.Vector3(0,.01,0)),PLAYER.radius+.04,.32,PLAYER.height);
 if(!hit.hit||Math.abs(hit.point.y-pos.y)>.1||!fits){result.push({x,side,jumping,hz,skipped:true,support:hit.hit?hit.point.toArray():null,fits});continue;}
 const a=f.make('shooter');a._integrate=f.Actor.prototype._integrate;a._spawnBarrier=f.Actor.prototype._spawnBarrier;a.spawnAt(pos,side<0?0:Math.PI);a.intent.move.set(0,0,-side);a.intent.jump=jumping;let lowest=a.pos.y;
 for(let i=0;i<hz*2;i++){G.time+=1/hz;a.update(1/hz);lowest=Math.min(lowest,a.pos.y);}
 const p={x,side,jumping,hz,start:pos.toArray(),end:a.pos.toArray(),lowest,alive:a.alive,grounded:a.grounded,groundPoint:a.ground.point?.toArray?.(),sourceDropReached:lowest<4.5};result.push(p);console.log(JSON.stringify(p));
}
fs.writeFileSync('.browser-evidence/physical-drop-diagnostic.json',JSON.stringify(result,null,2));
