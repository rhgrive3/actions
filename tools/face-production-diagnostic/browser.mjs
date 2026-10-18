import * as THREE from 'three';
const check=(v,m)=>{if(!v)throw Error(m);};
export async function run(config){
 const progress=globalThis.__headgearQA={stage:'init',rows:[]};
 const {G}=await import(config.prefix+'src/core/ctx.js');const {install}=await import(config.prefix+'patches/splatoon3/runtime/install.mjs');install(await fetch(config.prefix+'patches/splatoon3/profile.json').then(r=>r.json()));
 const {Character}=await import(config.prefix+'src/game/character.js');const {headgearState}=await import(config.prefix+'patches/local-quality/headgear/lifecycle.mjs');
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(720,720);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=.94;document.body.appendChild(renderer.domElement);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#79828c');const camera=new THREE.OrthographicCamera(-.29,.29,.29,-.29,.01,30);
 Object.assign(G,{scene,camera,renderer,physics:null,settings:{quality:'high',shadows:false},mode:'match',actors:[],time:0});
 const hemi=new THREE.HemisphereLight('#f4f6ff','#485266',2.2),sun=new THREE.DirectionalLight('#fff2dd',2.5);scene.add(hemi,sun,sun.target);const gl=renderer.getContext();
 const idle={form:'kid',grounded:true,speed:0,localMove:{x:0,z:0},firing:false,charge:0,ink:1,hp:1,vy:0};
 const cases=[];for(const lod of ['hero','game','far']){
  for(const view of ['front','left-quarter','right-quarter','under'])cases.push({lod,hat:0,view,pose:'neutral'});
  for(const pose of ['open','smile'])for(const view of ['front','under'])cases.push({lod,hat:0,view,pose});
 }
 for(const pose of ['neck-left','neck-right','neck-up','neck-down'])for(const view of ['front','under'])cases.push({lod:'game',hat:0,view,pose});
 for(const hat of [4,5,6,7])for(const view of ['front','under'])cases.push({lod:'game',hat,view,pose:'neutral'});
 for(const [view,light] of [['front','soft'],['side','natural'],['side','soft']])cases.push({lod:'hero',hat:0,view,pose:'neutral',light});
 cases.push({lod:'hero',hat:0,view:'rear-quarter',pose:'neutral',light:'natural'});
 check(cases.length===44,'fixed 44-case denominator');
 let c;
 try{for(const spec of cases){
  const {lod,hat,view,pose}=spec,name=[lod,'hat'+hat,pose,view,...(spec.light?[spec.light]:[])].join('-');progress.stage=name;
  c=new Character({name:'face-regression-fixed',sourceMotion:false,style:{hat,hair:0,skin:2,outfit:0,eyes:0,brows:0}});c.onEvent=null;c.setLod(lod);c.setColor('#19ae96');scene.add(c.root);for(let i=0;i<60;i++)c.update(1/60,idle);
  check(c.skeleton.bones.length===87,'canonical rig');check(c.lodTier===lod,'requested native LOD');
  if(hat){const s=headgearState(c),g=s.groups.find(x=>x.lod===s.active).group;check(g.parent===c.bones.head&&g.visible,'native fitted gear retained');}else check(!headgearState(c),'native no-hat');
  // Controlled rig-channel probes only. No replacement face mesh or production
  // expression code: exercise existing jaw/cheek skinning and mouth uniforms.
  if(pose==='open'){check(c.xb.jaw,'jaw bone');c.xb.jaw.rotation.x=.35*.8;c.u.uMouth.value.z=.8;}
  if(pose==='smile'){c.u.uMouth.value.x=.9;c.face.smile=1;for(const [i,key] of ['cheekL','cheekR'].entries()){const b=c.xb[key],r=c.cheekRest[i];check(b&&r,'native cheek rig');b.position.set(r.x,r.y+.0035,r.z);b.scale.setScalar(1.06);}}
  if(pose==='neck-left')c.bones.neck.rotation.y+=.45;if(pose==='neck-right')c.bones.neck.rotation.y-=.45;if(pose==='neck-up')c.bones.neck.rotation.x-=.3;if(pose==='neck-down')c.bones.neck.rotation.x+=.3;
  c.root.updateMatrixWorld(true);c.skeleton.update();
  const skin=c.root.getObjectByName('kid:skin:'+lod);check(skin?.isSkinnedMesh,'actual native skin tier');const a=skin.geometry.attributes;
  let chinVertices=0,maxWeightError=0;const bounds=new THREE.Box3(),v=new THREE.Vector3();
  for(let i=0;i<a.position.count;i++){
   let sum=0;for(let k=0;k<4;k++){const w=a.skinWeight.array[i*4+k],bi=a.skinIndex.array[i*4+k];check(Number.isFinite(w)&&w>=0&&w<=1&&bi>=0&&bi<c.skeleton.bones.length,'valid skin influence');sum+=w;}
   maxWeightError=Math.max(maxWeightError,Math.abs(sum-1));v.fromBufferAttribute(a.position,i);check(v.toArray().every(Number.isFinite),'finite bind vertex');
   const chin=Math.abs(v.x)<.17&&v.y>1.0&&v.y<1.18&&v.z>-.08;
   skin.applyBoneTransform(i,v);v.applyMatrix4(skin.matrixWorld);check(v.toArray().every(Number.isFinite),'finite deformed vertex');if(chin){chinVertices++;bounds.expandByPoint(v);}
  }
  check(maxWeightError<1e-5&&chinVertices>10,'normalized skin and chin sample coverage');
  const q=c.bones.head.getWorldQuaternion(new THREE.Quaternion()),target=c.getHeadPosition(new THREE.Vector3());
  const dir=new THREE.Vector3(...({front:[0,0,1],'left-quarter':[-.7071,0,.7071],'right-quarter':[.7071,0,.7071],under:[0,-.45,1],side:[1,0,0],'rear-quarter':[.7071,0,-.7071]}[view])).normalize().applyQuaternion(q),up=new THREE.Vector3(0,1,0).applyQuaternion(q);
  camera.position.copy(target).addScaledVector(dir,3);camera.up.copy(up);camera.lookAt(target);camera.updateMatrixWorld(true);
  const soft=spec.light==='soft';hemi.color.set(soft?'#ffffff':'#f4f6ff');hemi.groundColor.set(soft?'#ffffff':'#485266');hemi.intensity=soft?2.8:2.2;sun.color.set(soft?'#ffffff':'#fff2dd');sun.intensity=soft?.5:2.5;
  hemi.position.copy(up);sun.position.copy(target).add(new THREE.Vector3(3,5,4).applyQuaternion(q));sun.target.position.copy(target);sun.target.updateMatrixWorld(true);
  const before=JSON.stringify(c.skeleton.bones.map(b=>b.matrixWorld.toArray()));await renderer.compileAsync(scene,camera);renderer.info.reset();renderer.render(scene,camera);gl.finish();check(gl.getError()===gl.NO_ERROR&&!gl.isContextLost(),'clean WebGL');
  await globalThis.__saveHeadgearFrame(name,renderer.domElement.toDataURL('image/png'));c.root.updateMatrixWorld(true);check(before===JSON.stringify(c.skeleton.bones.map(b=>b.matrixWorld.toArray())),'render does not mutate pose');
  progress.rows.push({...spec,name,skinVertices:a.position.count,chinVertices,maxWeightError,chinWorldBounds:[bounds.min.toArray(),bounds.max.toArray()],headWorldQuaternion:q.toArray(),neckQuaternion:c.bones.neck.quaternion.toArray(),jawAngle:c.xb.jaw?.rotation.x,faceUniform:c.u.uMouth.value.toArray(),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,sourceMotion:false,expressionProbe:pose==='open'||pose==='smile'?'controlled native rig/uniform channels; not full expression animation':'settled idle or neck rotation probe'});
  scene.remove(c.root);c.dispose();check(!headgearState(c),'owned gear disposal');c=null;renderer.renderLists.dispose();
 }
 return{status:'rendered-awaiting-visual-review',caseCount:44,rows:progress.rows,limitations:'Same production Character, camera and light in baseline/candidate. Synthetic jaw/cheek and neck probes exercise deformation only; not source-motion gameplay or all facial animation. Hat coverage game LOD only. Finite normalized skinning is not automatic no-intersection certification.'};
 }finally{c?.dispose();renderer.dispose();}
}
