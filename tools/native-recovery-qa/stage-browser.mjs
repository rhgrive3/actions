import * as THREE from '/vendor/three/build/three.module.js';
import {G} from '/src/core/ctx.js';
import {Minimap} from '/src/game/minimap.js';
import {buildNativeWorld} from '/patches/native-stages/runtime/native-world.mjs';
import {installClock,installGame} from '/patches/splatoon3/runtime/clock.mjs';
import {state,PaintSystem,NativeLevel} from './stage-fixture.mjs';
const check=(value,message)=>{if(!value)throw Error(message);};
export async function runStageRecovery(cause){
 check(cause==='recoverable'||cause==='rollback-fatal','unknown stage test cause');
 const counts={oldWorld:0,oldGeometry:0,oldMaterial:0,displayGeometry:0,displayMaterial:0,inkGeometry:0,inkMaterial:0,shadowCalls:0,envCalls:0,renderCalls:0};
 const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(960,640);renderer.setPixelRatio(1);renderer.setClearColor('#182236');document.body.appendChild(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,1.5,.1,100);camera.position.set(7,6,9);camera.lookAt(0,0,0);scene.add(new THREE.HemisphereLight(0xffffff,0x334455,3));
 const oldLevel=new NativeLevel(),oldPaint=new PaintSystem(renderer,oldLevel,{old:true});
 const oldGroup=new THREE.Group(),oldMesh=new THREE.Mesh(new THREE.BoxGeometry(4,.6,4),new THREE.MeshStandardMaterial({color:'#39bb74'}));oldGroup.add(oldMesh);scene.add(oldGroup);oldMesh.geometry.addEventListener('dispose',()=>counts.oldGeometry++);oldMesh.material.addEventListener('dispose',()=>counts.oldMaterial++);
 Object.assign(G,{renderer,scene,camera,level:oldLevel,physics:{old:true},paint:oldPaint,nav:{old:true},settings:{minimap:false},teamColors:[],actors:[],match:null,mode:'menu'});
 const oldMinimap=new Minimap(oldLevel,oldPaint,3);const originalActivate=oldMinimap.activate;
 if(cause==='rollback-fatal')oldMinimap.activate=function(){throw Error('QA previous Minimap activation failed');};
 const add=scene.add;scene.add=function(...objects){for(const object of objects){if(object.name==='native-source-display')object.traverse(x=>{if(x.isMesh){x.geometry.addEventListener('dispose',()=>counts.displayGeometry++);x.material.addEventListener('dispose',()=>counts.displayMaterial++);}});if(object.name==='native-game-ink'){object.geometry.addEventListener('dispose',()=>counts.inkGeometry++);object.material.addEventListener('dispose',()=>counts.inkMaterial++);}}return add.apply(this,objects);};
 class StageDriver{_frame(){counts.renderCalls++;renderer.render(scene,camera);}_loop(){this._frame();}}
 installClock({G});installGame(StageDriver);const game=new StageDriver();G.game=game;
 const oldWorld={dispose(){counts.oldWorld++;oldGroup.removeFromParent();oldMesh.geometry.dispose();oldMesh.material.dispose();}};
 Object.assign(game,{R:{renderer},settings:{quality:'low'},mobile:{touch:true},layoutId:'previous',mapDef:{id:'previous'},levelMesh:oldMesh,minimap:oldMinimap,nativeWorld:oldWorld,decor:{dispose(){}},swimWake:{reset(){}},_footprint(){return{};},_shadowRoots(){if(++counts.shadowCalls===1)throw Error('QA stage shadow publication failed');},timer:{update(){}}});
 G.env={rebuildForArena(){counts.envCalls++;}};
 game._frame(1/60);check(counts.renderCalls===1,'initial real WebGL render missing');
 const initialMemory={...renderer.info.memory};let originalError;try{await buildNativeWorld(game,{id:'synthetic-recovery',name:'Recovery test'},()=>true);}catch(error){originalError=error;}
 check(originalError?.message==='QA stage shadow publication failed','original publication exception was replaced');
 check(G.paint===oldPaint&&G.level===oldLevel&&game.nativeWorld===oldWorld&&game.minimap===oldMinimap,'previous world ownership not restored');
 check(state.paintCreated===1&&state.paintDisposed===1&&state.oldPaintDisposed===0,'paint cleanup counts');
 for(const key of['displayGeometry','displayMaterial','inkGeometry','inkMaterial'])check(counts[key]===1,key+' must dispose once');
 check(counts.oldWorld===0&&counts.oldGeometry===0&&counts.oldMaterial===0,'old GPU resources were disposed');
 check(counts.envCalls===2&&counts.shadowCalls===2,'publication and recovery must both run');
 const beforeFrames=counts.renderCalls;game.frozen=false;for(let i=0;i<4;i++)game._frame(1/60);
 const dialog=document.querySelectorAll('.iw-native-world-recovery'),fatal=cause==='rollback-fatal';
 check(!!game._nativeWorldRecoveryFatal===fatal,'terminal flag mismatch');check(dialog.length===(fatal?1:0),'recovery UI count');
 check(counts.renderCalls===beforeFrames+(fatal?0:4),'terminal frame gate / normal render admission');
 if(fatal){check(game._nativeWorldRecoveryFatal.error===originalError,'original exception identity');check(dialog[0].getAttribute('role')==='alertdialog','accessible recovery dialog');check(game.R._contextRecoveryOverlay===dialog[0],'shared dialog latch');check(dialog[0].textContent.includes('再読み込み'),'manual reload instruction');}
 check(!document.getElementById('native-stage-loading'),'loading status leaked');
 const gl=renderer.getContext();check(!gl.isContextLost(),'this lane must not inject WebGL context loss');gl.finish();
 const receipt={status:'passed',cause,scope:'Exact emitted world publication, native display/ink/Minimap and real WebGL; synthetic level/physics/navigation/paint preparation; not a full native stage download',ownershipRestored:G.paint===oldPaint&&G.level===oldLevel&&game.nativeWorld===oldWorld&&game.minimap===oldMinimap,loadingStatusCleared:!document.getElementById('native-stage-loading'),sharedOverlay:!!dialog[0]&&game.R._contextRecoveryOverlay===dialog[0],dialogRole:dialog[0]?.getAttribute('role')??null,dialogModal:dialog[0]?.getAttribute('aria-modal')??null,originalError:originalError.message,recoveryErrors:Array.from(game._nativeWorldRecoveryFatal?.recoveryErrors||[],e=>e.message),fatal,counts:{...counts},paint:{...state},initialMemory,finalMemory:{...renderer.info.memory},dialogCount:dialog.length,dialogText:dialog[0]?.textContent||'',renderer:renderer.info.render,contextLost:gl.isContextLost(),canvas:{width:renderer.domElement.width,height:renderer.domElement.height}};
 oldMinimap.activate=originalActivate;return receipt;
}
