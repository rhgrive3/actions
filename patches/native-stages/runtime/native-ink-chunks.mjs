import * as THREE from 'three';

/** Rendering partition only: each original triangle appears once, with shared
 * source attributes and no clipped, simplified or regenerated positions. A
 * triangle crossing a tile boundary stays whole; its actual bounds control
 * culling. The tile size has no relation to retail collision or paint cells. */
export function partitionNativeInk(geometry,tileSize=16){
 if(!Number.isFinite(tileSize)||tileSize<=0)throw new RangeError('Invalid native ink tile size');
 const p=geometry.getAttribute('position'),groups=new Map(),point=new THREE.Vector3();
 if(geometry.index||p.count%3)throw new Error('Native ink partition requires complete non-indexed triangles');
 for(let i=0;i<p.count;i+=3){
  const x=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,y=(p.getY(i)+p.getY(i+1)+p.getY(i+2))/3,z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3;
  const key=[Math.floor(x/tileSize),Math.floor(y/tileSize),Math.floor(z/tileSize)].join(',');
  let g=groups.get(key);if(!g){g={key,indices:[],bounds:new THREE.Box3()};groups.set(key,g);}
  for(let j=i;j<i+3;j++){g.indices.push(j);g.bounds.expandByPoint(point.set(p.getX(j),p.getY(j),p.getZ(j)));}
 }
 return [...groups.values()].map(({key,indices,bounds})=>{
  const g=new THREE.BufferGeometry();
  for(const [name,a] of Object.entries(geometry.attributes))g.setAttribute(name,a);
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(indices),1));
  // computeBoundingSphere() would include the entire shared attribute array.
  g.boundingBox=bounds;g.boundingSphere=bounds.getBoundingSphere(new THREE.Sphere());
  // Include the corners despite floating point cancellation at the sphere edge.
  g.boundingSphere.radius+=Math.max(1,g.boundingSphere.radius)*1e-7;g.userData.nativeTile=key;
  return g;
 });
}

/** One draw in original triangle order. Chunks only select indices for this
 * original Mesh. Attributes, full bounds, transparent sort position and material
 * stay intact, including where source triangles overlap across tile boundaries. */
export class NativeInkMesh extends THREE.Mesh{
 constructor(geometry,material,tileSize=16){
  super(geometry,material);this.name='native-game-ink';this.tileSize=tileSize;this.receiveShadow=true;
  this._view=new THREE.Matrix4();this._frustum=new THREE.Frustum();this._ready=true;this.geometry=geometry;
  this.onBeforeRender=(_renderer,_scene,camera)=>this.selectVisible(camera);
 }
 get geometry(){return this._geometry;}
 set geometry(next){
  if(!this._ready){this._geometry=next;return;}
  const chunks=partitionNativeInk(next,this.tileSize);
  this._disposeChunks();this._geometry=next;this.chunks=chunks;
  this._visible=new Uint8Array(chunks.length).fill(255);this._triangleTile=new Uint32Array(next.getAttribute('position').count/3);
  for(let tile=0;tile<chunks.length;tile++)for(let j=0;j<chunks[tile].index.count;j+=3)this._triangleTile[chunks[tile].index.getX(j)/3]=tile;
  this._drawIndex=new THREE.BufferAttribute(new Uint32Array(next.getAttribute('position').count),1).setUsage(THREE.DynamicDrawUsage);
  next.setIndex(this._drawIndex);
 }
 selectVisible(camera){
  this._view.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(this.matrixWorld);
  this._frustum.setFromProjectionMatrix(this._view,camera.coordinateSystem,camera.reversedDepth);
  let changed=false;
  for(let tile=0;tile<this.chunks.length;tile++){const visible=this._frustum.intersectsSphere(this.chunks[tile].boundingSphere)?1:0;if(visible!==this._visible[tile])changed=true;this._visible[tile]=visible;}
  if(!changed)return;
  const index=this._drawIndex.array;let count=0;
  for(let tri=0;tri<this._triangleTile.length;tri++)if(this._visible[this._triangleTile[tri]]){index[count++]=tri*3;index[count++]=tri*3+1;index[count++]=tri*3+2;}
  this.geometry.setDrawRange(0,count);this._drawIndex.clearUpdateRanges();
  if(count){this._drawIndex.addUpdateRange(0,count);this._drawIndex.needsUpdate=true;}
 }
 _disposeChunks(){for(const g of this.chunks||[])g.dispose();this.chunks=[];}
 dispose(){this.removeFromParent();this._disposeChunks();this._geometry?.dispose();this._geometry=null;}
}
