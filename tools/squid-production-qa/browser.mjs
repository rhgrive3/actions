import * as THREE from 'three';
import {createProductionLighting,PRODUCTION_LIGHTING_CONFIG,PRODUCTION_EXPOSURE} from './lighting.mjs';
export async function run({prefix}){
const progress=globalThis.__headgearQA={stage:"init",rows:[]};
const {install}=await import(prefix+'patches/splatoon3/runtime/install.mjs');const api=install(await fetch(prefix+'patches/splatoon3/profile.json').then(r=>r.json()));const {Character,Actor,G}=api;
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(900,900);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=.94;document.body.appendChild(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(25,1,.01,5000);Object.assign(G,{scene,camera,renderer,settings:{quality:'high',shadows:false},mode:'match',actors:[],time:0});
const {Environment}=await import(prefix+'src/world/environment.js');const env=createProductionLighting(Environment,renderer,scene);G.env=env;const lightingReceipt={config:PRODUCTION_LIGHTING_CONFIG,exposure:renderer.toneMappingExposure,environmentIntensity:scene.environmentIntensity,sun:{color:env.sun.color.toArray(),intensity:env.sun.intensity,position:env.sun.position.toArray()},pmrem:{width:env.envMap.image?.width,height:env.envMap.image?.height}};
const c=new Character({sourceMotion:false,name:'squid-shape-fixed',style:{hair:0,hat:0,skin:2,outfit:0,eyes:0}});c.setColor(0xe6e900);c.setLod('hero');c.onEvent=null;c.u.uWig.value.set(0,0,0);c.u.uOpacity.value=1;
// Rest-surface diagnostic from the actual composed native squid geometry/materials.
// No animation, no human geometry. Preserve source attributes and physical materials.
const root=new THREE.Group();scene.add(root);for(const key of ['body','dark','eyes']){const old=c.squid[key];root.add(new THREE.Mesh(old.geometry,old.material));}
root.rotation.y=Math.atan2(env.sun.position.x,env.sun.position.z);root.position.y=1;
const rows=progress.rows;for(const [view,v] of Object.entries({front:[0,0,2],oblique:[1.4,.55,1.4],side:[2,0,0],back:[0,0,-2]})){
 const target=new THREE.Vector3(0,1.07,0),offset=new THREE.Vector3(...v).applyAxisAngle(new THREE.Vector3(0,1,0),root.rotation.y);camera.position.copy(target).add(offset);camera.lookAt(target);camera.updateMatrixWorld(true);await renderer.compileAsync(scene,camera);renderer.render(scene,camera);renderer.getContext().finish();await globalThis.__saveHeadgearFrame('rest-'+view,renderer.domElement.toDataURL());rows.push({view,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles});}
const geometry=root.children.map(m=>({vertices:m.geometry.attributes.position.count,triangles:m.geometry.index?m.geometry.index.count/3:m.geometry.attributes.position.count/3}));scene.remove(root);c.dispose();
G.teamColors=[new THREE.Color(0xe6e900),new THREE.Color(0x6340db)];G.level={blocks:[],groundHeight:()=>0};G.paint={sample:()=>1,splat:()=>0};G.match={playing:()=>true,canRespawn:()=>false};G.physics={los:()=>true,raycast:(_a,_b,_c,hit)=>{hit.hit=false;return hit;}};G.projectiles=Object.fromEntries(['fireShooter','fireDualies','fireCharger','fireSplatling','fireBlaster','fireSlosh','throwBomb','fireFlick'].map(n=>[n,()=>{}]));
const states=[];
for(const sourceEnabled of [true,false]){
 class SelectedCharacter extends Character{constructor(opts){super({...opts,sourceMotion:sourceEnabled});}}
 const a=new Actor({team:0,isLocal:true,name:'squid-source-qa-fixed',weapon:'shooter',CharacterClass:SelectedCharacter,style:{hair:0,hat:0,skin:2,outfit:0,eyes:0}}),ch=a.character;ch.actor=a;ch.onEvent=null;scene.add(ch.root);G.actors=[a];a.grounded=a.ground.hit=true;
 const step=(speed=0,dir=[0,1])=>{const dt=1/60;a.vel.set(dir[0]*speed,0,dir[1]*speed);a.pos.addScaledVector(a.vel,dt);G.time+=dt;a._finishFrame(dt);ch.root.updateMatrixWorld(true);};
 if(sourceEnabled){await ch._sourceMotionLoader;await ch.sourceMotion?.ready;if(ch.sourceMotion?.status!=='ready')throw Error('Source controller not ready: '+ch.sourceMotion?.error);}
 for(let i=0;i<60;i++)step();
 const mode=sourceEnabled?'source':'fallback';
 for(const spec of [{name:'dry',form:'squid',sub:false,speed:0,frames:60},{name:'swim',form:'squid',sub:true,speed:6,frames:60},{name:'stop',form:'squid',sub:true,speed:0,frames:60},{name:'turn90',form:'squid',sub:true,speed:6,dir:[1,0],frames:12},{name:'turn180',form:'squid',sub:true,speed:6,dir:[0,-1],frames:12},{name:'emerge-100ms',form:'kid',sub:false,speed:0,frames:6},{name:'emerge-300ms',form:'kid',sub:false,speed:0,frames:12}]){
  a.form=spec.form;a.submerged=spec.sub;
  const samples=spec.name==='turn90'?[0,3,6,9,12]:spec.name==='emerge-100ms'?[0,3,6]:spec.name==='emerge-300ms'?[3,6]:[];
  for(let i=0;i<=spec.frames;i++){
   if(i>0)step(spec.speed,spec.dir||[0,1]);
   if(samples.includes(i)){
    const target=ch.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.4,0));camera.position.copy(target).add(new THREE.Vector3(1.3,.9,-1.3));camera.lookAt(target);camera.updateMatrixWorld(true);await renderer.compileAsync(scene,camera);renderer.render(scene,camera);renderer.getContext().finish();const name=mode+'-'+spec.name+'-temporal-'+i;progress.stage=name;await globalThis.__saveHeadgearFrame(name,renderer.domElement.toDataURL());rows.push({name,mode,state:spec.name,sampleFrame:i,temporal:true,sourceDebug:ch.sourceMotion?.debug?.squid??null,wig:ch.u.uWig.value.toArray()});
   }
  }
  const snap={mode,state:spec.name,form:ch.form,wig:ch.u.uWig.value.toArray(),pivot:{position:ch.squid.pivot.position.toArray(),quaternion:ch.squid.pivot.quaternion.toArray(),scale:ch.squid.pivot.scale.toArray()},rotations:Object.fromEntries(['body','ghost','dark','eyes'].map(k=>[k,ch.squid[k].rotation.toArray()])),sourceRigRootQuaternion:ch.sourceMotion?.squidRig?.root.quaternion.toArray()??null,sourceStatus:ch.sourceMotion?.status??null,sourceActive:!!ch.sourceMotion?.active,sourceDebug:ch.sourceMotion?.debug?.squid??null};states.push(snap);
  for(const [view,v]of Object.entries({front:[0,.25,-2],oblique:[1.3,.9,-1.3],side:[2,.4,0],back:[0,.4,2]})){
   const target=ch.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,spec.form==='kid'?.65:.12,0));camera.position.copy(target).add(new THREE.Vector3(...v));camera.lookAt(target);camera.updateMatrixWorld(true);await renderer.compileAsync(scene,camera);renderer.render(scene,camera);renderer.getContext().finish();const name=mode+'-'+spec.name+'-'+view;progress.stage=name;await globalThis.__saveHeadgearFrame(name,renderer.domElement.toDataURL());rows.push({name,mode,state:spec.name,view,sourceStatus:snap.sourceStatus,sourceActive:snap.sourceActive,sourceDebug:snap.sourceDebug});
  }
 }
 scene.remove(ch.root);ch.dispose();G.actors=[];
}
scene.environment=null;env.dispose();renderer.dispose();return {status:'rendered-awaiting-visual-review',caseCount:rows.length,scope:'actual emitted unposed squid geometry-rest surface (local placement transforms excluded) plus actual Actor source/fallback dry/swim/turn/emergence sequence; production day Environment; driven actors, not full match physics',rows,geometry,states,lightingReceipt};
}
