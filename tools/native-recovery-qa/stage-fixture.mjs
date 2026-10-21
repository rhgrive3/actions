// Explicit prepared-world inputs for the browser recovery lane. Production
// native-world/render/ink/Minimap and WebGL are loaded unchanged by the page.
import * as THREE from '/vendor/three/build/three.module.js';
export const state={paintCreated:0,paintDisposed:0,oldPaintDisposed:0};
export class PaintSystem{
 constructor(_renderer,_level,options={}){this.old=!!options.old;this.rt=new THREE.WebGLRenderTarget(32,32);this.texture=this.rt.texture;this.scene=new THREE.Scene();this.cam=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);this.cam.position.z=2;this.dryMesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({color:'#446688'}));this.dryMesh.visible=false;this.scene.add(this.dryMesh);this.grid=new Uint8Array(4);this.counts=new Uint32Array(2);this.size=32;this.ppm=1;this.paintFaces=[];if(!this.old)state.paintCreated++;}
 _pushQuad(){} clear(){} dispose(){if(this.old)state.oldPaintDisposed++;else state.paintDisposed++;this.rt.dispose();this.dryMesh.geometry.dispose();this.dryMesh.material.dispose();}
}
export class NativeLevel{constructor(){this.bounds={minX:-4,maxX:4,minZ:-4,maxZ:4};this.faces=[];this.blocks=[];this.spawnPads=[];}}
export class NavGraph{constructor(level,physics){this.level=level;this.physics=physics;}}
import {preparedStageAssets,PREPARED_STAGE_ID} from './prepared-assets.mjs';
export const {config:nativeStageBuild}=await preparedStageAssets(globalThis.crypto);
export function nativeStageURL(id,file){if(id!==PREPARED_STAGE_ID||!/^[a-zA-Z.-]+$/.test(file))throw Error('Unexpected prepared asset');return new URL('/__qa/assets/'+file,location.href).href;}
