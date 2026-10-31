// Install the same observer in tests and Chromium. No renderer/scene mutation.
export function installCpuCounters() {
 globalThis.__iwReadCpuCounters=(renderer,scene)=>{
  const geometries=new Set(),materials=new Set(),textures=new Set();
  let objects=0,meshes=0,visibleMeshes=0,vertices=0,visibleVertices=0,indices=0,bones=0;
  scene.traverse(o=>{
   objects++;
   if(!o.isMesh&&!o.isPoints&&!o.isLine)return;
   meshes++;
   let visible=true;for(let p=o;p;p=p.parent)if(p.visible===false){visible=false;break;}
   if(visible){visibleMeshes++;visibleVertices+=o.geometry?.attributes?.position?.count||0;}
   if(o.geometry){geometries.add(o.geometry);vertices+=o.geometry.attributes?.position?.count||0;indices+=o.geometry.index?.count||0;}
   bones+=o.skeleton?.bones?.length||0;
   for(const m of Array.isArray(o.material)?o.material:[o.material]){
    if(!m)continue;materials.add(m);
    for(const v of Object.values(m))if(v?.isTexture)textures.add(v);
    for(const u of Object.values(m.uniforms||{}))if(u?.value?.isTexture)textures.add(u.value);
   }
  });
  return {draw:{...renderer.info.render},resources:{...renderer.info.memory},scene:{objects,meshes,visibleMeshes,vertices,visibleVertices,indices,bones,geometries:geometries.size,materials:materials.size,textures:textures.size}};
 };
 globalThis.__iwCpuCounterWindow=(before,after)=>({
  draw:{...after.draw,frame:after.draw.frame-before.draw.frame},
  resources:Object.fromEntries(Object.keys(after.resources).map(k=>[k,after.resources[k]-before.resources[k]])),
  scene:after.scene,
  raw:{before,after},
 });
}
