import test from 'node:test';import assert from 'node:assert/strict';
import {convertSource} from '../runtime/source-convert.mjs';
import {nativeTowerBoarding} from '../runtime/native-tower-boarding.mjs';
import {nativeTowerClearance} from '../runtime/native-tower-clearance.mjs';
import {nativeFixture} from './fixture.mjs';
const obj=`o Fld_Test_Floor
v -20 0 -20
v 20 0 -20
v 20 0 20
v -20 0 20
vn 0 1 0
vn 0 1 0
vn 0 1 0
vn 0 1 0
usemtl Floor
f 1//1 3//3 2//2
f 1//1 4//4 3//3
`;
function data(){return convertSource({id:'tower-input-unit',internal:'Vss_Test',bounds:{minX:-20,minZ:-20,maxX:20,maxZ:20},spawnPads:[[-15,.08,0],[15,.08,0]],spawnBarrier:1},obj,'newmtl Floor\nKd 1 1 1\n',{});}
for(const halfSize of [1.2,.8])test('clear hovering deck requires source input approach at30/60/120, half-size '+halfSize,async()=>{
 const f=await nativeFixture(),{G,THREE,PLAYER}=f;G.level=new f.NativeLevel(data());G.physics=new f.NativePhysics(G.level);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 G.paint=new Cpu(null,G.level,{atlasSize:512,maxDensity:4,cell:.25});G.nav=new f.NavGraph(G.level,G.physics);G.match.mode='turf';G.match.opts={};
 const id=G.nav.nearest(new THREE.Vector3(0,0,0),1),node=G.nav.nodes[id],check=nativeTowerClearance(G.level,PLAYER),boarding=nativeTowerBoarding(G,G.nav.validIds,PLAYER,halfSize);
 const high=[node.x,3.3,node.z],low=[node.x,1.2,node.z];assert.equal(check.clear(high),true,'clearance alone permits an unreachable hovering deck');assert.equal(boarding.find(id,high),null);
 const approach=boarding.find(id,low);assert(approach);assert.equal(approach.jumping,true);
 G.level._addBlock({kind:'obox',center:[low[0],low[1]-.12,low[2]],size:[halfSize*2,.24,halfSize*2],rotY:0,paint:false,hidden:true});const deck=G.level.blocks.at(-1).id;
 G.level._addBlock({kind:'obox',center:[low[0],low[1]+.945,low[2]],size:[.56,2.13,.56],rotY:0,paint:false,hidden:true});
 const proofs=[];for(const hz of [30,60,120]){
  const a=f.make();a._integrate=f.Actor.prototype._integrate;a.spawnAt(new THREE.Vector3(...approach.start),0);a._resolve(false,a.pos.y,false);assert(a.grounded&&a.ground.hit);
  const direction=new THREE.Vector3(approach.end[0]-a.pos.x,0,approach.end[2]-a.pos.z).normalize();a.vel.set(0,0,0);
  let boarded=false;for(let i=0;i<hz;i++){a.intent.jump=i<hz*.4;a.intent.move.copy(direction);if(Math.hypot(a.pos.x-approach.end[0],a.pos.z-approach.end[2])<.15)a.intent.move.set(0,0,0);G.time+=1/hz;a.update(1/hz);if(a.grounded&&a.ground.hit&&a.ground.block===deck){boarded=true;break;}}
  assert(boarded,'real Actor input reaches deck at '+hz+'Hz '+JSON.stringify(a.pos.toArray()));proofs.push({hz,boarded,position:a.pos.toArray(),ground:deck});
 }
 console.log(JSON.stringify({normalInputBoarding:proofs,sourceApproach:approach,maxJumpHeight:boarding.maxJumpHeight}));
});
