// Source artwork and S3 presentation are distinct. Roller/Brush/SplatoonSWEPs
// Slosher share its two animated sheets; Shooter uses crosshair line + dot.
// Sizes/tail timing come from INKWAVE's existing S3 renderer, not OSS physics.
import * as THREE from 'three';
import { INK_LOOK, shotTailFrames, fidelitySlosherDrawRadius, fidelitySlosherDrawTail } from '../../splatoon3/runtime/weapons-fidelity.mjs';
import { captureRollerVolume, ROLLER_VOLUME } from './roller.mjs';
import { usesBucketSlosherSheet } from '../../splatoon3/runtime/projectile-visuals.mjs';

const states = new WeakMap();
const X = new THREE.Vector3(1,0,0), Y = new THREE.Vector3(0,1,0), Z = new THREE.Vector3(0,0,1);
export function captureInkVolume(p, weapon = p.owner?.weapon, packet = null) {
  captureRollerVolume(p, weapon);
  const family=weapon?.behaviorKind||weapon?.kind;
  const key=p.catalog?.descriptor?.key||packet?.[27]?.s3Catalog?.[1];
  const catalogBirth=!!p.catalog||(weapon?.kind==='catalog'&&['horizontal','vertical','brush','slosh'].includes(key));
  const vertical=key==='vertical'||(!key&&p.s3Vertical===true);
  p._inkVolumeRecipe=null;
  if(!p.s3SpecialWeapon) {
    if((family==='roller'||family==='brush')&&(p.type==='drop'||catalogBirth))p._inkVolumeRecipe=vertical?'roller-vertical':family==='brush'?'brush':'roller-horizontal';
    // Shooter rounds use the S3 rod silhouette (splatoon3/runtime/s3-projectile-shapes.mjs).
    else if(['dualies','splatling'].includes(family)&&p.type==='shot')p._inkVolumeRecipe='shooter';
    else if(family==='slosher'&&(p.type==='slosh'||catalogBirth))p._inkVolumeRecipe='slosher';
  }
  p._inkVolumeAssetName=p._inkVolumeRecipe?'projectile:'+p.wid+':'+p._inkVolumeRecipe:null;
  p._inkVolumeHorizontal=p._inkVolumeRecipe==='roller-horizontal';
  if(p._inkVolumeRecipe) {p._inkVolumeDirection ||= p.vel.clone();p._inkVolumeDirection.copy(p.vel);}
}
function state(engine,p) {
  let map=states.get(engine);if(!map){map=new WeakMap();states.set(engine,map);}
  let s=map.get(p);if(!s){
    const part=()=>({name:'',size:1,pattern:0,position:new THREE.Vector3(),stretch:new THREE.Vector3(1,1,1),rotation:new THREE.Quaternion()});
    s={parts:[part(),part(),part()],single:[],generation:null,age:Infinity,dir:new THREE.Vector3(),right:new THREE.Vector3(),normal:new THREE.Vector3(),matrix:new THREE.Matrix4(),rotation:new THREE.Quaternion()};s.single=[s.parts[0]];map.set(p,s);
  }
  const generation=p.generation??p._qualityGeneration??0;
  if(s.generation!==generation||p.age<s.age){
    s.dir.copy(p._inkVolumeDirection||p.vel);if(s.dir.lengthSq()<1e-10)s.dir.set(0,0,1);s.dir.normalize();
    // Sheet lies in the launch plane; its thin axis is world-up relative to
    // that plane. Never use the viewer. Stable even for a vertical launch.
    s.right.crossVectors(s.dir,Y);if(s.right.lengthSq()<1e-8)s.right.copy(X);s.right.normalize();
    s.normal.crossVectors(s.right,s.dir).normalize();s.matrix.makeBasis(s.right,s.dir,s.normal);s.rotation.setFromRotationMatrix(s.matrix);
    s.generation=generation;
  }
  s.age=p.age;return s;
}
function nativeRadius(p) {
  const d=p.fidelityDrawRadius;if(d)return d.initRadius+(d.endRadius-d.initRadius)*(d.changeTime>0?Math.min(1,Math.max(0,p.age)/d.changeTime):1);
  const d2=p.catalog?.descriptor?.b?.DrawSizeParam;
  if(d2&&Number.isFinite(d2.InitRadius)){const index=p.catalog.descriptor.index||0,init=d2.InitRadius+index*(d2.AfterOffsetInitRadius||0),end=(Number.isFinite(d2.EndRadius)?d2.EndRadius:d2.InitRadius)+index*(d2.AfterOffsetEndRadius||0),t=d2.ChangeFrame>0?Math.min(1,p.age*60/d2.ChangeFrame):1;return init+(end-init)*t;}
  return p.vis||p.size;
}
export function submitInkVolume(engine,p) {
  if(!engine||!p._inkVolumeRecipe||p._qualityDead||p.delay>0)return false;
  const recipe=p._inkVolumeRecipe,pattern=p.seed<.5?0:1;
  const specific=p._inkVolumeAssetName;
  if(recipe==='roller-horizontal'||recipe==='roller-vertical'||recipe==='brush') {
    const name=engine.assets.has(specific)?specific:ROLLER_VOLUME.asset;
    return engine.submit(name,p,nativeRadius(p)*ROLLER_VOLUME.visualScale,pattern);
  }
  const s=state(engine,p),part=s.parts[0];part.position.copy(p.pos);
  if(recipe==='slosher') {
    // Machine/vortex, bouncing bubbles and explosive Sloshers own different
    // artwork. Do not relabel the Roller sheet as those assets. Bucket,
    // Tri-Slosher, Dread Wringer and their alternate kits share Bucket's sheet.
    const name=engine.assets.has(specific)?specific:(usesBucketSlosherSheet(p.wid)?'roller':null);
    if(!name)return false;
    const radius=p.fidelitySloshDraw?fidelitySlosherDrawRadius(p):nativeRadius(p),width=radius*2*INK_LOOK.slosh[4];
    const d=p.catalog?.descriptor?.b?.DrawSizeParam,min=Math.max(0,d?.TailLengthMin||0),max=Math.max(min,d?.TailLengthMax||0),solid=Math.max(0,(d?.TailSolidFrame||0)/60);
    const tail=p.fidelitySloshDraw?(fidelitySlosherDrawTail(p,p.vel.length())-1)*radius:Math.max(min,Math.min(max,p.vel.length()*Math.min(p.age,solid)));
    part.name=name;part.pattern=pattern;part.size=1;part.rotation.copy(s.rotation);
    part.stretch.set(width,width+tail,width*INK_LOOK.slosh[2]);part.position.addScaledVector(s.dir,-tail*.5);
    return engine.submitComposite(p,s.single);
  }
  if(recipe==='shooter') {
    const name=engine.assets.has(specific)?specific:'shooter',asset=engine.assets.get(name);
    if(!asset||asset.patterns.length!==2)return false;
    const g=Math.min(1,p.age*20),radius=nativeRadius(p)*g*(1+.3*Math.sin(g*Math.PI))*INK_LOOK.shot[4];
    if(!(radius>0))return false;
    const speed=p.vel.length();s.dir.copy(p.vel);if(speed>1e-8)s.dir.multiplyScalar(1/speed);else s.dir.copy(p._inkVolumeDirection).normalize();
    const frame=p.catalog?.r?.parameters?.spl__BulletShooterTailLengthParam?.MaxLengthFrame,frames=Number.isFinite(frame)&&frame>0?frame:shotTailFrames(p);
    const length=Math.max(0,Math.min(p.start.distanceTo(p.pos),speed*frames/60)-radius);
    // RenderGeneral's tip sprite is 0.75 of beam width. Keep that source
    // artwork ratio, while the world's rod width/timing stays the S3 recipe.
    for(const a of s.parts){a.name=name;a.size=radius*2*.75;a.stretch.set(1,1,1);a.rotation.setFromUnitVectors(Z,s.dir);}
    part.pattern=1;part.position.copy(p.pos);
    if(length<1e-6)return engine.submitComposite(p,s.single);
    const back=s.parts[1],rod=s.parts[2];back.pattern=1;back.position.copy(p.pos).addScaledVector(s.dir,-length);
    rod.pattern=0;rod.size=radius*2;rod.position.copy(p.pos).addScaledVector(s.dir,-length*.5);rod.rotation.setFromUnitVectors(X,s.dir);
    const image=asset.patterns[0];rod.stretch.x=length/(radius*2*image.aspect);
    return engine.submitComposite(p,s.parts);
  }
  return false;
}
