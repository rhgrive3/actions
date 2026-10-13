import fs from 'node:fs';
import {nativeFixture,readStage} from '../patches/native-stages/tests/fixture.mjs';
const f=await nativeFixture({includeCharacter:true}),{G,THREE,PLAYER}=f;
const L=G.level=new f.NativeLevel(readStage(process.env.INKWAVE_NATIVE_STAGE_ASSETS,'bluefin')),P=G.physics=new f.NativePhysics(L);
class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};} _pushQuad(){} _drawQuads(){}}
G.match.mode='turf';G.match.opts={};G.camera=new THREE.PerspectiveCamera();
const cases=[];f.setRandom(()=>.5);
try{
 for(const x of [18,19])for(const jumping of [false,true])for(const hz of [30,60,120]){
  G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.projectiles.clear();
  const start=new THREE.Vector3(x,3,-8.5),h=P.raycast(new THREE.Vector3(x,3.3,-6.5),new THREE.Vector3(0,-1,0),.6),goal=h.point.clone();
  if(!h.hit||h.normal.y<.68)throw Error('Frontier goal lacks actual source support');
  const a=new f.Actor({team:0,name:'read-only source frontier',weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});a.spawnAt(start,0);G.actors=[a];
  const clearance=f.nativeDropClearance(L),radius=PLAYER.s3HumanoidTerrainRadiusRaw*PLAYER.s3TerrainDistanceScale;
  const tick=()=>{G.time+=1/hz;a.update(1/hz);G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);};
  for(let i=0;i<6;i++)tick();
  let capsules=0,capsuleFailures=0,seconds=0,reached=false;const failures=[];a.intent.move.set(0,0,1);a.intent.squid=false;
  for(let i=0;i<hz*4;i++){
   a.intent.jump=jumping&&i===0;const previous=a.pos.clone();tick();seconds=(i+1)/hz;capsules++;
   if(!clearance.clear(previous,a.pos,radius,PLAYER.stepUp,PLAYER.height,false)){capsuleFailures++;if(failures.length<6)failures.push({from:previous.toArray(),to:a.pos.toArray(),grounded:a.grounded,form:a.form});}
   if(a.alive&&a.grounded&&Math.hypot(a.pos.x-goal.x,a.pos.z-goal.z)<.2&&Math.abs(a.pos.y-goal.y)<.2&&f.nativeSourceFootSupported(G,a,goal)){reached=true;break;}
   if(!a.alive||a.pos.z>goal.z+.8)break;
  }
  const footSupported=f.nativeSourceFootSupported(G,a,goal),foot=a._nativeWaypointGround;
  const support=P.raycast(a.pos.clone().add(new THREE.Vector3(0,.2,0)),new THREE.Vector3(0,-1,0),.4);
  cases.push({x,jumping,hz,start:start.toArray(),sourceGoal:goal.toArray(),sourceGoalTriangle:h.triangle,sourceGoalFace:h.face,sourceGoalObject:L.manifest.objects[L.data.objectIds[h.triangle]].name,seconds,reached,alive:a.alive,grounded:a.grounded,end:a.pos.toArray(),capsules,capsuleFailures,footSupported,installedFoot:foot?{hit:foot.hit,y:foot.y,block:foot.block,normal:foot.normal.toArray(),static:foot.block>=0&&foot.block<L.staticBlockCount}:null,firstFailures:failures,sourceEnd:support.hit?{triangle:support.triangle,face:support.face,point:support.point.toArray()}:null,gearAP:Object.keys(a.s3.abilityPoints).length});
 }
}finally{f.restoreRandom();}
const report={foundation:'846f0532b6b3bcde3dfed893b81ee07d3dc58cd5',sourceSha256:L.manifest.sourceSha256,recipe:'inkwave-browser-source-v4',sourceNavigation:L.manifest.sourceNavigation,cases,conditions:'Read-only stage physical input diagnosis: production Actor integration/frame finishing and Character, zeroAP Shooter, initially empty paint, source-supported initial poses, normal kid/+Z walk or one ordinary jump, no later pose/velocity/ink/ownership writes. All geometry/NoPaint/masks retained. CPU VM optional source-motion playback unavailable. No graph or running-jump edge admission.'};
fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2));
console.log(JSON.stringify(cases.map(({x,jumping,hz,seconds,reached,alive,grounded,end,capsuleFailures,footSupported})=>({x,jumping,hz,seconds,reached,alive,grounded,end,capsuleFailures,footSupported}))));
