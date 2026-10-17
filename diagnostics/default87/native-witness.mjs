export function assertNativeWitness(w,e){
 const check=(ok,message)=>{if(!ok)throw Error('Native selector witness: '+message);};
 check(w.kit===e.id&&w.showcase===e.id&&w.model===e.row,'wrong equipped model owner');
 check(w.appearance===e.appearance&&w.variant===(e.appearance===e.base?null:e.appearance),'stale selected appearance');
 check(w.sameMountedWeapon&&w.sameDefinition&&w.sameBodyGeometry,'stale mounted geometry');
 check(w.draws.some(d=>d.body&&d.vertices>0&&d.submitted&&d.nativeTarget),'selected body was not drawn');
 check(w.composites.some(d=>d.opacity>0.01&&d.texture&&d.submitted&&d.selectedTargetTexture),'selected preview was not composited');
 check(!w.contextLost,'WebGL context lost');
 return w;
}
export async function observeNativeSelector(page,expected){
 const w=await page.evaluate(()=>{
  const G=globalThis.s3ProbeG,sc=G.game.showcase,ch=sc.chars[0],weapon=ch?.weapon,def=weapon?.def,geometry=weapon?.body?.geometry;
  if(!weapon||!def||!geometry)throw Error('Native weapon missing');
  const hooks=[],draws=[],composites=[];let selectedTarget=null;
  try{
   for(const root of [weapon.pivot,weapon.left?.pivot].filter(Boolean))root.traverse(mesh=>{if(!mesh.isMesh)return;const before=mesh.onBeforeRender,after=mesh.onAfterRender;hooks.push([mesh,before,after]);let draw;
    mesh.onBeforeRender=function(...args){draw={body:mesh===weapon.body||mesh===weapon.bodyFar,vertices:mesh.geometry?.attributes?.position?.count??0,callsBefore:sc.r.info.render.calls,nativeTarget:!!sc.r.getRenderTarget(),submitted:false};if(draw.body)selectedTarget=sc.r.getRenderTarget();draws.push(draw);const value=before?.apply(this,args);draw.callsBefore=sc.r.info.render.calls;return value;};
    mesh.onAfterRender=function(...args){if(draw){draw.callsAfter=sc.r.info.render.calls;draw.submitted=draw.callsAfter>draw.callsBefore;}return after?.apply(this,args);};
   });
   const quad=sc.compQuad,before=quad.onBeforeRender,after=quad.onAfterRender;hooks.push([quad,before,after]);let composite;
   quad.onBeforeRender=function(...args){composite={opacity:sc.compMat.uniforms.uOpacity.value,texture:!!sc.compMat.uniforms.tMap.value,selectedTargetTexture:!!selectedTarget&&sc.compMat.uniforms.tMap.value===selectedTarget.texture,callsBefore:sc.r.info.render.calls,submitted:false};composites.push(composite);const value=before?.apply(this,args);composite.callsBefore=sc.r.info.render.calls;composite.selectedTargetTexture=!!selectedTarget&&sc.compMat.uniforms.tMap.value===selectedTarget.texture;return value;};
   quad.onAfterRender=function(...args){if(composite){composite.callsAfter=sc.r.info.render.calls;composite.submitted=composite.callsAfter>composite.callsBefore;}return after?.apply(this,args);};
   sc.render();
   return {kit:G.game.api.getLoadout().weapon,showcase:sc.weapon,model:ch.weaponModel,appearance:ch.weaponAppearanceModel,variant:def.modelVariantId??null,sameMountedWeapon:ch.weapon===weapon,sameDefinition:weapon.def===def,sameBodyGeometry:weapon.body.geometry===geometry&&geometry===(def.bodyStatic||def.body),draws,composites,contextLost:sc.r.getContext().isContextLost()};
  }finally{for(const[mesh,before,after]of hooks){mesh.onBeforeRender=before;mesh.onAfterRender=after;}}
 });
 return assertNativeWitness(w,expected);
}
