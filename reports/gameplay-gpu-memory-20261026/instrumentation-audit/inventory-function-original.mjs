export function installInventory() {
 const G=__G,r=G.renderer,seen=new WeakMap(),records=[];
 const path=o=>{const list=[];for(let n=o;n;n=n.parent)list.push((n.name||n.type||'?')+'#'+n.id);return list.reverse().join('/');};
 const native=r.renderBufferDirect;
 r.renderBufferDirect=function(camera,scene,geometry,material,object,group){
  if(geometry&&!seen.has(geometry)){
   const rec={id:geometry.id,type:geometry.type,name:geometry.name,firstMap:__inkwave.mapDef.id,path:path(object),geometry:new WeakRef(geometry),object:new WeakRef(object),disposed:0,bytes:0};
   const arrays=new Set();for(const a of [geometry.index,...Object.values(geometry.attributes||{})])if(a?.array&&!arrays.has(a.array)){arrays.add(a.array);rec.bytes+=a.array.byteLength;}
   seen.set(geometry,rec);records.push(rec);geometry.addEventListener('dispose',()=>rec.disposed++);
  }
  return native.apply(this,arguments);
 };
 window.__inventory=()=>{
  const sceneIds=new Set();G.scene.traverse(o=>{if(o.geometry)sceneIds.add(o.geometry.id);});
  const rows=records.map(row=>{const geo=row.geometry.deref(),o=row.object.deref();let ancestor=o;while(ancestor?.parent)ancestor=ancestor.parent;return{id:row.id,type:row.type,name:row.name,firstMap:row.firstMap,initialPath:row.path,currentPath:o?path(o):null,objectRetained:!!o,geometryRetained:!!geo,inMainScene:ancestor===G.scene,geometryInMainScene:sceneIds.has(row.id),disposed:row.disposed,bytes:row.bytes};});
  return{rows,roster:G.actors.map(a=>({weapon:a.weaponId,model:a.character?.weapon?.def?.id})),geometryCount:r.info.memory.geometries};
 };
}
