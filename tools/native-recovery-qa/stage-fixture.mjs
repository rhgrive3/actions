// Explicit prepared-world inputs for the browser recovery lane. Production
// native-world/render/ink/Minimap and WebGL are loaded unchanged by the page.
import * as THREE from '/vendor/three/build/three.module.js';
export const state={paintCreated:0,paintDisposed:0,oldPaintDisposed:0};
export class PaintSystem{
 constructor(_renderer,_level,options={}){this.old=!!options.old;this.rt=new THREE.WebGLRenderTarget(32,32);this.texture=this.rt.texture;this.scene=new THREE.Scene();this.cam=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);this.cam.position.z=2;this.dryMesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({color:'#446688'}));this.dryMesh.visible=false;this.scene.add(this.dryMesh);this.grid=new Uint8Array(4);this.counts=new Uint32Array(2);this.size=32;this.ppm=1;this.paintFaces=[];if(!this.old)state.paintCreated++;}
 _pushQuad(){} clear(){} dispose(){if(this.old)state.oldPaintDisposed++;else state.paintDisposed++;this.rt.dispose();this.dryMesh.geometry.dispose();this.dryMesh.material.dispose();}
}
export class NativeLevel{constructor(){this.bounds={minX:-4,maxX:4,minZ:-4,maxZ:4};this.faces=[];this.blocks=[];this.spawnPads=[];}}
export class NativePhysics{constructor(level){this.level=level;}}
export class NavGraph{constructor(level,physics){this.level=level;this.physics=physics;}}
export async function loadNativeData(){return{manifest:{geometry:{vertices:3,triangles:1},objects:[{active:true,material:'test',vo:0,vc:3,io:0,ic:3}],materials:{test:{tint:'#3987df'}}},vertices:new Float32Array([-2,0,-2,0,1,0,0,0,2,0,-2,0,1,0,1,0,0,0,2,0,1,0,.5,1]),indices:new Uint32Array([0,1,2])};}
export async function loadNativeTextures(){return new Map();}
