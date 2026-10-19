import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
const extremeAim=process.env.INKWAVE_RAINMAKER_AIM_EXTREMES==='1';
const sourceEnabled=process.env.INKWAVE_RAINMAKER_SOURCE==='1';
const f=sourceEnabled?await (await import('./source-loaded-actor-fixture.mjs')).sourceLoadedActorFixture({random:()=>.5,extraExports:`export {RankedWorld} from './patches/splatoon3/runtime/ranked/world.mjs';`}):await fixture({fullRuntime:true,productionComposition:true,includeCharacter:true,realProjectiles:true,vmMathRandom:()=>.5,extraExports:`export {RankedWorld} from './patches/splatoon3/runtime/ranked/world.mjs';`});
if(sourceEnabled)f.installedRuntime=f;

const {G,THREE}=f;
function triangleIntersects(a,b,THREE,epsilon=1e-8){
 const ae=[a.b.clone().sub(a.a),a.c.clone().sub(a.b),a.a.clone().sub(a.c)],be=[b.b.clone().sub(b.a),b.c.clone().sub(b.b),b.a.clone().sub(b.c)];
 const an=ae[0].clone().cross(ae[1]),bn=be[0].clone().cross(be[1]),axes=[an,bn];
 for(const x of ae)for(const y of be)axes.push(x.clone().cross(y));
 for(const x of [...ae,...be])axes.push(an.clone().cross(x),bn.clone().cross(x));
 for(const axis of axes){const length=axis.length();if(length<1e-12)continue;const x=[a.a.dot(axis),a.b.dot(axis),a.c.dot(axis)],y=[b.a.dot(axis),b.b.dot(axis),b.c.dot(axis)],e=epsilon*length;if(Math.max(...x)<Math.min(...y)-e||Math.max(...y)<Math.min(...x)-e)return false;}
 return true;
}

const floor={id:0,solid:true,grate:false,faces:[-1,-1,-1,-1,-1,-1],center:new THREE.Vector3(0,-1,0),half:new THREE.Vector3(100,1,100),axes:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)],aabbMin:new THREE.Vector3(-100,-2,-100),aabbMax:new THREE.Vector3(100,0,100)};
G.level={...G.level,blocks:[floor],groundHeight:()=>0,queryBlocks(_x,_z,_xx,_zz,out){out.length=0;out.push(0);return out;}};G.physics=new f.installedRuntime.Physics(G.level);
for(const weapon of (extremeAim?['shooter','roller']:['shooter','roller','dualies']))test(weapon+' actual Actor hand anchor and primary/left visibility ownership',async()=>{
 for(const team of [0,1]){
  G.scene=new THREE.Scene();G.camera=new THREE.PerspectiveCamera(60,1,.1,100);G.camera.position.set(0,2,5);G.camera.updateMatrixWorld();G.actors=[];G.time=0;
  const a=new f.Actor({team,weapon,isLocal:true,CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),ch=a.character;a.nid='carrier';ch.actor=a;ch.onEvent=null;G.actors=[a];G.scene.add(ch.root);a.form='kid';a.kidT=10;a.grounded=a.ground.hit=true;a.pos.set(0,0,0);a.vel.set(0,0,0);
  if(sourceEnabled){await ch._sourceMotionLoader;await ch.sourceMotion?.ready;assert.equal(ch.sourceMotion?.status,'ready');}
  const state={pos:[0,0,0],carrier:'carrier',barrier:{active:false,max:1000,health:0},charge:{value:0},checkpoint:{passed:[[],[]],goalOpen:[false,false]}};
  const match={mode:'rainmaker',actors:[a],state:'playing',ranked:{rule:{state}},playing:()=>true};G.match=match;
  const world=new f.RankedWorld({...f.installedRuntime,G,THREE},match,{rainmaker:{center:[0,0,0],checkpoints:[[],[]],goals:[]}});
  const pivots=[];for(let w=ch.weapon;w;w=w.left)pivots.push([w.pivot,w.pivot.visible]);assert.equal(pivots.length,weapon==='dualies'?2:1);
  let g=0,m=0;world.rainmakerCore.geometry.addEventListener('dispose',()=>g++);world.rainmakerCore.material.addEventListener('dispose',()=>m++);
  const geo=world.rainmakerCore.geometry,attr=geo.attributes.position;
  const triangles=Array.from({length:geo.index.count/3},(_,i)=>new THREE.Triangle(...[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(attr,geo.index.getX(i*3+j)))));
  const solids=[[0,64],[64,64],[236,36],[272,20],[292,8],[300,36],[336,20],[356,8],[364,36],[420,12],[432,12]].map(([start,len])=>{const ts=triangles.slice(start,start+len),box=new THREE.Box3().setFromPoints(ts.flatMap(t=>[t.a,t.b,t.c])),center=box.getCenter(new THREE.Vector3());return{box,planes:ts.map(t=>{const pl=new THREE.Plane().setFromCoplanarPoints(t.a,t.b,t.c);if(pl.distanceToPoint(center)>0)pl.negate();return pl;})};});
  const tail=[[.40,-.46],[.82,-.72],[.90,-.97],[.63,-.85],[.52,-1],[.32,-.62]];
  function inTail(p){const x=p.x/.6,y=(p.y+.20)/.6,z=(p.z-.59)/.6;if(Math.abs(x)>=.0225||y<=.32||y>=.9||z<=-1||z>=-.46)return false;let inside=false;for(let i=0,j=tail.length-1;i<tail.length;j=i++){const[a,b]=tail[i],[c,d]=tail[j];if((a>y)!==(c>y)&&z<(d-b)*(y-a)/(c-a)+b)inside=!inside;}return inside;}
  const regions={head:[],chest:[]};ch.root.traverseVisible(mesh=>{if(!mesh.isSkinnedMesh||!['skin','cloth'].includes(mesh.userData.iwMat))return;const attrs=mesh.geometry.attributes;for(let i=0;i<attrs.position.count;i++){const w={head:0,chest:0};for(let j=0;j<4;j++){const n=ch.skeleton.bones[attrs.skinIndex.getComponent(i,j)].name,v=attrs.skinWeight.getComponent(i,j);if(/^(head|eye|brow|mouth|jaw|cheek|ear)/.test(n))w.head+=v;if(['chest','spine','neck'].includes(n))w.chest+=v;}for(const k of['head','chest'])if(w[k]>=.5)regions[k].push([mesh,i]);}});
  const fishBoxes=triangles.map(t=>new THREE.Box3().setFromPoints([t.a,t.b,t.c]));const regionMaps=new Map();for(const points of Object.values(regions))for(const[mesh,i]of points){if(!regionMaps.has(mesh))regionMaps.set(mesh,new Set());regionMaps.get(mesh).add(i);}
  const fishBounds=new THREE.Box3().setFromBufferAttribute(attr),nearest=new THREE.Vector3(),worstSnapshots={};
  const result={extremeAim,faceChecks:[],vertexSurfaceMinimum:{head:{distance:Infinity,tick:-1},chest:{distance:Infinity,tick:-1}},weapon,team,sourceReceipt:{requested:sourceEnabled,status:ch.sourceMotion?.status??null,activeAfterFrame:false},counts:Object.fromEntries(Object.entries(regions).map(([k,p])=>[k,p.length])),minConvexPlaneValue:{head:Infinity,chest:Infinity},maxInside:{head:0,chest:0},samples:[]};
  assert.ok(regions.head.length>0&&regions.chest.length>0);const vertex=new THREE.Vector3();
  function checkSnapshot({tick,data}){let skinFaces=0,pairs=0,intersections=0;const examples=[],t=new THREE.Triangle(),box=new THREE.Box3();for(let i=0;i<data.length;i+=9){t.a.fromArray(data,i);t.b.fromArray(data,i+3);t.c.fromArray(data,i+6);skinFaces++;box.setFromPoints([t.a,t.b,t.c]);for(let fi=0;fi<triangles.length;fi++){if(!box.intersectsBox(fishBoxes[fi]))continue;pairs++;if(triangleIntersects(t,triangles[fi],THREE)){intersections++;if(examples.length<5)examples.push({skinFace:i/9,fishFace:fi});}}}assert.ok(skinFaces>0);return{tick,skinFaces,fishFaces:triangles.length,pairs,intersections,examples};}
  try{
   for(let tick=0;tick<(extremeAim?6:90);tick++){
    state.charge=extremeAim?{value:tick>=2&&tick<4?1:0,recovery:tick>=4?20/60:0}:{value:tick>=30&&tick<60?1:0,recovery:tick>=60&&tick<80?(80-tick)/60:0};
    a.intent.fire=false;a.intent.move.set(0,0,0);a.aimPitch=extremeAim?[-1.05,1.15][tick%2]:.15*Math.sin(tick*.08);a.yaw=extremeAim?team*Math.PI:tick*.015;
    if(extremeAim)a.aimYaw=a.yaw;
    if(extremeAim)a.aimDir.set(Math.sin(a.yaw)*Math.cos(a.aimPitch),Math.sin(a.aimPitch),Math.cos(a.yaw)*Math.cos(a.aimPitch));
    // Isolated surface snapshots at authority phases, with settled source pose.
    if(extremeAim)for(let settle=0;settle<45;settle++){G.time+=1/60;a.update(1/60);world.update(match.ranked,1/60);}
    G.time+=1/60;a.update(1/60);ch.root.updateMatrixWorld(true);
    result.sourceReceipt.activeAfterFrame=!!ch.sourceMotion?.active;
    const pose=Array.from(ch.P),position=a.pos.toArray(),hand=ch.weapon.pivot.getWorldPosition(new THREE.Vector3()),handsBefore=['handR','handL'].map(k=>ch.bones[k].matrixWorld.elements.slice()),aimBefore=a.aimDir.toArray();world.update(match.ranked,1/60);world.group.updateMatrixWorld(true);
    assert.deepEqual(Array.from(ch.P),pose,'objective never overwrites native pose');assert.deepEqual(a.pos.toArray(),position,'objective does not move Actor');assert.deepEqual(a.aimDir.toArray(),aimBefore,'aim unchanged');assert.deepEqual(['handR','handL'].map(k=>ch.bones[k].matrixWorld.elements.slice()),handsBefore,'both hand matrices unchanged');
    const grip=world.rainmakerCore.getWorldPosition(new THREE.Vector3());assert.ok(grip.distanceTo(hand)<1e-6,'actual hand attachment');assert.ok(world.rainmakerCore.matrixWorld.elements.every(Number.isFinite));
    for(const[p]of pivots)assert.equal(p.visible,false);assert.equal(world.rainmakerShield.visible,false);
    ch.skeleton.update();const core=world.rainmakerCore;const surfaceChanged=new Set();
    for(const[k,points]of Object.entries(regions)){let inside=0,min=Infinity;for(const[mesh,i]of points){mesh.getVertexPosition(i,vertex);mesh.localToWorld(vertex);core.worldToLocal(vertex);let union=Infinity;for(const{planes}of solids){let d=-Infinity;for(const pl of planes)d=Math.max(d,pl.distanceToPoint(vertex));union=Math.min(union,d);}min=Math.min(min,union);if(union< -1e-6||inTail(vertex))inside++;
      let distance=result.vertexSurfaceMinimum[k].distance;if(fishBounds.distanceToPoint(vertex)<distance){for(let fi=0;fi<triangles.length;fi++){if(fishBoxes[fi].distanceToPoint(vertex)>=distance)continue;triangles[fi].closestPointToPoint(vertex,nearest);const d=nearest.distanceTo(vertex);if(d<distance){distance=d;result.vertexSurfaceMinimum[k]={distance,tick};surfaceChanged.add(k);}}}
}result.minConvexPlaneValue[k]=Math.min(result.minConvexPlaneValue[k],min);result.maxInside[k]=Math.max(result.maxInside[k],inside);if(inside)result.samples.push({tick,region:k,inside,min});}
    if(extremeAim||[0,30,60,89].includes(tick)||surfaceChanged.size){
     const data=[];for(const[mesh,selected]of regionMaps){const attr=mesh.geometry.attributes.position,index=mesh.geometry.index,n=index?index.count:attr.count,cache=new Map();const get=i=>{if(!cache.has(i)){const v=new THREE.Vector3();mesh.getVertexPosition(i,v);mesh.localToWorld(v);core.worldToLocal(v);cache.set(i,v);}return cache.get(i);};
      for(let j=0;j<n;j+=3){const ids=[0,1,2].map(k=>index?index.getX(j+k):j+k);if(!ids.some(i=>selected.has(i)))continue;for(const i of ids)data.push(...get(i).toArray());}
     }
     const snapshot={tick,data:new Float64Array(data)};
     for(const k of surfaceChanged)worstSnapshots[k]=snapshot;
     if(extremeAim||[0,30,60,89].includes(tick))result.faceChecks.push(checkSnapshot(snapshot));
    }
   }
   for(const[k,snapshot]of Object.entries(worstSnapshots)){assert.equal(snapshot.tick,result.vertexSurfaceMinimum[k].tick);if(!result.faceChecks.some(x=>x.tick===snapshot.tick))result.faceChecks.push(checkSnapshot(snapshot));assert.ok(result.vertexSurfaceMinimum[k].distance>1e-6,'strict positive actual skin-vertex to all-fish-surface distance');}
   console.log(JSON.stringify(result));assert.deepEqual(result.maxInside,{head:0,chest:0},'no actual head/chest vertices inside fish solids');assert.ok(result.faceChecks.length>=(extremeAim?6:4)&&result.faceChecks.length<=6);assert.ok(result.faceChecks.every(r=>r.intersections===0),'no selected skin face intersects any of the 444 fish/support faces');
   state.carrier=null;state.pos=[2,0,-3];world.update(match.ranked,1/60);for(const[p,v]of pivots)assert.equal(p.visible,v);assert.deepEqual(Array.from(world.rainmakerCore.position.toArray()),[0,1,0]);
   state.carrier='carrier';world.update(match.ranked,1/60);world.dispose();world.dispose();for(const[p,v]of pivots)assert.equal(p.visible,v);assert.equal(g,1);assert.equal(m,1);assert.equal(world.group.parent,null);
   console.log(JSON.stringify({weapon,team,ticks:extremeAim?6:90,handAttachment:true,restored:true,geometryDispose:g,materialDispose:m}));
  }finally{world.dispose();ch.dispose();G.actors=[];G.projectiles.clear();G.match=null;}
 }
});
