import {fixture} from '../patches/splatoon3/tests/source-fixture.mjs';
import {readStage} from '../patches/native-stages/tests/fixture.mjs';
import {prepareNativeStageBuild} from '../scripts/lib/inkwave-native-stages.mjs';
import {adaptBuildSource} from '../scripts/inkwave-source-composition.mjs';
const labels=[],prepared=prepareNativeStageBuild(process.env.INKWAVE_NATIVE_STAGE_ASSETS);
const f=await fixture({fullRuntime:true,realProjectiles:true,includeCharacter:true,adaptNative:adaptBuildSource,adaptRuntime:(rel,source)=>{
 if(rel==='patches/native-stages/runtime/build-config.mjs')return `export const nativeStageBuild = ${JSON.stringify(prepared.config)};`;
 if(rel==='patches/native-stages/runtime/native-drop.mjs'){
  source=source.replace(/return null;/g,(text,offset)=>{const id=labels.length;labels.push(source.slice(Math.max(0,offset-180),offset).split('\n').at(-1));return `return nativeDiagnosticReject(${id});`;});
  source=source.replace('if(distance<radius-.003)fits=false;','if(distance<radius-.003){fits=false;nativeDiagnosticSweep={triangle:id,distance,radius,flags:w.flags[id],from:from.toArray(),to:to.toArray()};}');
  source=source.replace('if(!landed||landed.face<0)', 'nativeDiagnosticDetail={seconds:time,position:pos.toArray(),landing:landed?{point:landed.point.toArray(),face:landed.face,triangle:landed.triangle,flags:L.triangleWorld.flags[landed.triangle],sourceObject:L.manifest.objects[L.triangleWorld.objectIds[landed.triangle]].name}:null};if(!landed||landed.face<0)');
  source=source.replace('if(!face.turf||!L.mask[face.grid+iv*face.nu+iu])', 'Object.assign(nativeDiagnosticDetail,{faceTurf:face.turf,maskCell:L.mask[face.grid+iv*face.nu+iu],maskIndex:face.grid+iv*face.nu+iu});if(!face.turf||!L.mask[face.grid+iv*face.nu+iu])');
  source=source.replace('if(!target||target.id===upper.id)', 'nativeDiagnosticDetail.finalNode=target?{id:target.id,XYZ:[target.x,target.y,target.z],nativePaintable:target.nativePaintable}:null;if(!target||target.id===upper.id)');
  source+='\nlet nativeDiagnosticLast=-1,nativeDiagnosticSweep=null,nativeDiagnosticDetail=null;function nativeDiagnosticReject(id){nativeDiagnosticLast=id;return null;} export function nativeDropRejectReason(){return {id:nativeDiagnosticLast,sweep:nativeDiagnosticSweep,detail:nativeDiagnosticDetail};}\n';
 }
 return adaptBuildSource(rel,source);
},extraExports:"export {NativeLevel,NativePhysics,nativeDropTransition} from './patches/native-stages/runtime/engine.mjs';export {NavGraph} from './inkwave-public/src/game/nav.js';export {nativeDropRejectReason} from './patches/native-stages/runtime/native-drop.mjs';"});
const L=new f.NativeLevel(readStage(process.env.INKWAVE_NATIVE_STAGE_ASSETS,'shipshape')),P=new f.NativePhysics(L),rows=[],flags=L.manifest.sourceNavigation;
L.manifest.sourceNavigation={wallClimb:true};const N=new f.NavGraph(L,P);L.manifest.sourceNavigation=flags;
const nearest=p=>N.nodes.reduce((a,n)=>Math.hypot(n.x-p[0],n.y-p[1],n.z-p[2])<Math.hypot(a.x-p[0],a.y-p[1],a.z-p[2])?n:a,N.nodes[0]);
for(const sign of [-1,1]){
 const upper=nearest([-sign*4.5,9,sign*40]),lower=nearest([-sign*4.5,6,sign*41]),ground=new f.Hit();
 P.groundProbe(lower.x,upper.y,lower.z,f.PLAYER.stepUp,f.PLAYER.stepDown,f.PLAYER.footRadius,ground,false);
 const describe=n=>({id:n.id,XYZ:[n.x,n.y,n.z],nativePaintable:n.nativePaintable,valid:!!N.valid[n.id]}),before={...N._nativeDropClearance?.metrics},edge=f.nativeDropTransition(N,upper,lower),reason=f.nativeDropRejectReason(),s=reason.sweep;
 rows.push({sign,upper:describe(upper),lower:describe(lower),edgeGround:{hit:ground.hit,y:ground.y,normal:ground.normal.toArray()},upperBodyFits035:P.bodyFits(new f.THREE.Vector3(upper.x,upper.y,upper.z),.35,f.PLAYER.stepUp,f.PLAYER.height,false,.003),accepted:!!edge,edge,rejectId:reason.id,reason:labels[reason.id],detail:reason.detail,metricsBefore:before,metricsAfter:N._nativeDropClearance?.metrics,sweep:s?{...s,sourceObject:L.manifest.objects[L.triangleWorld.objectIds[s.triangle]].name}:null});
}

const G=f.G;G.level=L;G.physics=P;G.nav=N;G.camera=new f.THREE.PerspectiveCamera();G.match.mode='turf';G.match.opts={};
class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};} _pushQuad(){} _drawQuads(){}}
const contact=a=>{const h=P.raycast(a.pos.clone().setY(a.pos.y+.15),new f.THREE.Vector3(0,-1,0),.4);if(!h.hit)return null;const face=L.faces[h.face],cell=face?face.grid+Math.min(face.nv-1,Math.max(0,Math.floor(h.v/face.cv)))*face.nu+Math.min(face.nu-1,Math.max(0,Math.floor(h.u/face.cu))):null;return {XYZ:h.point.toArray(),triangle:h.triangle,face:h.face,flags:L.triangleWorld.flags[h.triangle],sourceObject:L.manifest.objects[L.triangleWorld.objectIds[h.triangle]].name,mask:cell!==null?L.mask[cell]:null,faceTurf:face?.turf};};
for(const row of rows){row.actualHumanCases=[];for(const hz of [30,60,120]){G.actors=[];G.projectiles.clear();G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});const a=new f.Actor({team:row.sign<0?0:1,weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});a.spawnAt(new f.THREE.Vector3(...row.upper.XYZ),row.sign<0?Math.PI:0);a.intent.move.set(0,0,row.sign);a.intent.fire=a.intent.squid=a.intent.jump=false;G.actors=[a];let upperGround=false,airborne=false,firstTouchdown=null;for(let frame=0;frame<hz*1.5;frame++){G.time+=1/hz;a.character.root.position.copy(a.pos);a.update(1/hz);G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);upperGround ||=a.grounded&&a.pos.y>row.upper.XYZ[1]-.2;if(upperGround&&!a.grounded)airborne=true;if(airborne&&a.grounded&&!firstTouchdown&&a.pos.y<row.upper.XYZ[1]-1.25)firstTouchdown={seconds:(frame+1)/hz,...contact(a)};}row.actualHumanCases.push({hz,upperGround,airborne,firstTouchdown,end:a.pos.toArray(),finalContact:contact(a),alive:a.alive,grounded:a.grounded,productionCharacter:true,gearAP:Object.keys(a.s3.abilityPoints),ordinaryMoveGravity:true});}}
console.log(JSON.stringify(rows));
