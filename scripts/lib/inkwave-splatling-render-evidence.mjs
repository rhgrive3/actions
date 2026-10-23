import assert from 'node:assert/strict';

// Serialized into the real emitted Game page. Match every retained native
// head to a distinct uploaded production instance, not an unrelated FX count.
export async function readSplatlingBackend() {
  const {isSplatlingCosmeticProjectile,SPLATLING_COSMETICS:C}=await import('/patches/splatoon3/runtime/splatling-cosmetics.mjs');
  const G=window.__G,ps=G.projectiles,B=ps.blobs,m=new B.matrix.constructor(),used=new Set();
  const heads=window.volumeHeads.map(p=>{
    const expectedRadius=C.radius*Math.min(1,Math.max(0,p.age)*30);
    let index=-1,matrix=null;
    for(let i=0;i<B.count;i++){
      if(used.has(i))continue;B.getMatrixAt(i,m);const a=m.elements;
      if(Math.hypot(a[12]-p.pos.x,a[13]-p.pos.y,a[14]-p.pos.z)<1e-3){index=i;matrix=Array.from(a);used.add(i);break;}
    }
    const radius=matrix?Math.hypot(...matrix.slice(0,3)):null;
    return {owned:isSplatlingCosmeticProjectile(p),index,matrix,radius,expectedRadius,
      shape:index<0?null:Array.from(ps.blobShape.array.slice(index*4,index*4+4)),
      look:index<0?null:Array.from(ps.blobInkLook.array.slice(index*4,index*4+4)),
      petals:index<0?null:Array.from(ps.blobFourPetals.array.slice(index*2,index*2+2))};
  });
  window.splatlingEvidenceIndices=heads.map(p=>p.index);
  return {backend:'splatling-shared-blob',visible:B.visible,count:B.count,capacity:B.instanceMatrix.array.length/16,
    volumeActive:G.fx.inkVolumes.metrics.active,historyOwned:window.volumeHeads.filter(p=>ps.projectileVisuals?.handles(p)).length,
    tailLength:C.tailLength,heads};
}

export function assertSplatlingBackend(data) {
  const b=data.splatling;
  assert(b&&b.backend==='splatling-shared-blob','explicit Splatling backend evidence required');
  assert(data.eligible>0&&b.visible&&b.count>0,'native Splatling bodies must remain visibly submitted');
  assert.equal(b.heads.length,data.eligible,'every retained native Splatling head is inspected');
  assert.equal(new Set(b.heads.map(p=>p.index)).size,data.eligible,'one distinct body per native head');
  assert.equal(b.capacity,700,'existing shared capacity retained');
  assert.equal(b.volumeActive,0,'Splatling cannot duplicate its old Shooter volume');
  assert.equal(b.historyOwned,0,'Splatling cannot duplicate a history body');
  for(const p of b.heads){
    assert(p.owned&&p.index>=0&&p.index<b.count,'a retained Splatling head has an uploaded owned instance');
    assert(p.matrix?.length===16&&p.matrix.every(Number.isFinite),'finite native body transform');
    assert(p.expectedRadius>0&&Math.abs(p.radius-p.expectedRadius)<1e-6,'uploaded Splatling world radius');
    assert(p.shape?.length===4&&p.shape.every(Number.isFinite)&&p.shape[0]>=1&&p.shape[0]<=1+b.tailLength/p.radius+1e-4,'compact Splatling tail');
    assert(p.look?.length===4&&p.look.every(Number.isFinite)&&p.look[1]>0,'rounded Splatling branch, not a Shooter rod');
    assert.deepEqual(p.petals,[0,0],'Splatling does not inherit Roller petals');
  }
}

// Inspector-only copies of the exact selected production matrices/attributes.
// The original Game camera, native heads, material and buffers stay unchanged.
export async function createSplatlingInspector() {
  const T=await import('three'),G=window.__G,source=G.projectiles.blobs,indices=window.splatlingEvidenceIndices;
  if(!indices?.length||indices.some(i=>i<0))throw Error('missing uploaded Splatling instances');
  const geometry=source.geometry.clone();
  for(const [name,a]of Object.entries(source.geometry.attributes))if(a.isInstancedBufferAttribute){
    const array=new a.array.constructor(indices.length*a.itemSize);
    for(const [j,i]of indices.entries())array.set(a.array.subarray(i*a.itemSize,(i+1)*a.itemSize),j*a.itemSize);
    geometry.setAttribute(name,new T.InstancedBufferAttribute(array,a.itemSize,a.normalized));
  }
  const mesh=new T.InstancedMesh(geometry,source.material,indices.length),matrix=new T.Matrix4(),color=new T.Color();
  for(const [j,i]of indices.entries()){source.getMatrixAt(i,matrix);mesh.setMatrixAt(j,matrix);source.getColorAt(i,color);mesh.setColorAt(j,color);}
  mesh.matrix.copy(source.matrixWorld);mesh.matrixAutoUpdate=false;mesh.frustumCulled=false;
  const scene=new T.Scene();scene.environment=G.scene.environment;scene.add(mesh,new T.HemisphereLight(0xffffff,0x444444,3));
  const light=new T.DirectionalLight(0xffffff,3);light.position.set(-4,9,-3);scene.add(light);
  const renderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(640,640);renderer.setClearColor(0,0);
  renderer.domElement.id='splatling-inspect';renderer.domElement.style.cssText='position:fixed;left:0;top:0;z-index:999999;background:#161c2a';document.body.append(renderer.domElement);
  const target=new T.WebGLRenderTarget(256,256),pixels=new Uint8Array(256*256*4),box=new T.Box3();
  for(const p of window.volumeHeads)box.expandByPoint(p.pos);
  const centre=box.getCenter(new T.Vector3()),span=Math.max(1,box.getSize(new T.Vector3()).length()*.6),camera=new T.PerspectiveCamera(45,1,.01,200);
  const count=()=>{renderer.readRenderTargetPixels(target,0,0,256,256,pixels);let n=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>0)n++;return n;};
  window.renderSplatlingView=xyz=>{
    camera.position.copy(centre).add(new T.Vector3(...xyz).normalize().multiplyScalar(span*2.5));camera.lookAt(centre);camera.updateMatrixWorld();
    renderer.setRenderTarget(target);mesh.visible=true;renderer.render(scene,camera);const visiblePixels=count();
    mesh.visible=false;renderer.render(scene,camera);const suppressedPixels=count();mesh.visible=true;
    renderer.setRenderTarget(null);renderer.render(scene,camera);
    return {visiblePixels,suppressedPixels,instances:mesh.count,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
  };
  window.disposeSplatlingInspector=()=>{geometry.dispose();mesh.dispose();target.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();delete window.renderSplatlingView;delete window.disposeSplatlingInspector;};
  return {instances:mesh.count,productionMaterial:true,selectedProductionAttributes:true};
}
