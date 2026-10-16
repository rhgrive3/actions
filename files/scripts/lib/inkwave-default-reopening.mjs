import fs from 'node:fs';
export const REOPEN_ROWS = Object.freeze([
 'Shooter_Heavy_02','Maneuver_Dual_01','Maneuver_Dual_02','Shooter_Long_02',
 'Brush_Heavy_01','Brush_Heavy_02','Slosher_Double_01','Slosher_Diffusion_02',
 'Shooter_TripleMiddle_02','Shooter_Precision_02','Shooter_TripleQuick_02',
 'Blaster_Short_01','Roller_Compact_01','Roller_Compact_02',
]);
// Called with the actual loaded game's public appearance/registry modules and
// native Showcase. No replacement Character, renderer, geometry or selection.
export function observeReopenedDefaults({G,AP,R,kits,WEAPONS,storage,rows}) {
 const check=(ok,label)=>{if(!ok)throw Error('Default reopen: '+label);};
 const sc=G.game.showcase,key=AP.WEAPON_APPEARANCE_STORAGE_KEY;
 const original={storage:storage.getItem(key),weapon:sc.weapon,color:sc.color,style:sc.style};
 const out={selectedCount:R.registeredWeaponVariantModels().length,manualCount:R.registeredWeaponVariants().length,rows:[]};
 check(out.selectedCount===73&&out.manualCount===94,'registry denominator');
 check(sc.mode==='loadout'&&sc.chars.length===1,'native loadout owner');
 let primary;
 try {
  check(rows.length===14&&new Set(rows).size===14,'fourteen distinct rows');
  for(const row of rows){
   const matches=kits.filter(k=>k.main===row);check(matches.length===1,'official kit '+row);
   const kit=matches[0];check(WEAPONS[kit.id]?.sourceRow===row,'installed kit '+row);
   check(R.weaponModelSpec(kit.id)===R.weaponVariantSpec(row)&&typeof R.weaponVariantSpec(row)?.build==='function','same accepted spec '+row);
   const phases=[];
   for(const phase of ['base','default']){
   const expected=phase==='base'?kit.baseId:row;
   AP.setWeaponAppearance(kit.id,phase==='base'?kit.baseId:'',storage);
   const raw=JSON.parse(storage.getItem(key)||'{}');
   check(phase==='base'?raw[kit.baseId]===kit.baseId:!Object.hasOwn(raw,kit.baseId),'persistent stored preference '+row+' '+phase);
   check(AP.weaponAppearancePreference(kit.id,storage)===(phase==='base'?kit.baseId:null),'readback preference '+row+' '+phase);
   check(R.weaponDefaultAppearance(kit.id)===row&&AP.selectedWeaponAppearance(kit.id,storage)===expected,'wrong default '+row);
   // Finish native fade/clear before reopening the same kit, otherwise native
   // showLoadout intentionally retains the existing Character for an unchanged kit.
   const retired=sc.chars[0];
   sc.hide();for(let i=0;i<30;i++)sc.update(1/60);
   check(sc.mode===null&&sc.chars.length===0,'native close completed '+row);
   sc.showLoadout(kit.id,original.color,original.style);
   // Native loadout hop changes the held weapon partway through its update.
   // Advance its existing owner, never force Character.setWeapon or visibility.
   for(let i=0;i<180;i++)sc.update(1/60);
   const ch=sc.chars[0],w=ch?.weapon;
   out.current={row,kit:kit.id,phase:sc.phase,pending:sc.hopWeapon,weapon:sc.weapon,model:ch?.weaponModel,appearance:ch?.weaponAppearanceModel,modelId:w?.def?.modelId,modelVariantId:w?.def?.modelVariantId,mounted:ch?.root?.parent===sc.scene,bodyMatches:w?.body?.geometry===w?.def?.body,staticBodyMatches:w?.body?.geometry===w?.def?.bodyStatic};
   check(sc.weapon===kit.id&&ch?.weaponAppearancePreview===true,'preview routing '+row);
   check(ch!==retired,'fresh native owner '+row);
   check(ch.weaponModel===expected&&ch.weaponAppearanceModel===expected&&w?.def?.modelId===kit.baseId&&(phase==='base'?w.def.modelVariantId==null:w.def.modelVariantId===row),'Character consumed '+phase+' '+row);
   // Native _buildWeapon uses the authored stationary channel near the camera;
   // def.body additionally merges animated parts for the far/tool representation.
   check(ch.root.parent===sc.scene&&w.body?.geometry===(w.def.bodyStatic||w.def.body),'mounted native geometry '+row);
   check(ch.P?.length>0&&Array.from(ch.P).every(Number.isFinite),'finite native pose '+row);
   const hooks=[],drawn=[];let renderFailure;
   try {
    for(const root of [w.pivot,w.left?.pivot].filter(Boolean))root.traverse(mesh=>{
     if(!mesh.isMesh)return;const old=mesh.onBeforeRender;hooks.push([mesh,old]);
     mesh.onBeforeRender=function(...args){drawn.push({body:mesh===w.body||mesh===w.bodyFar,vertices:mesh.geometry?.attributes?.position?.count??0});return old?.apply(this,args);};
    });
    sc.render();
    check(!sc.r.getContext().isContextLost(),'WebGL context '+row);
   }catch(error){renderFailure=error;throw error;}
   finally{const errors=[];for(const[mesh,old]of hooks)try{mesh.onBeforeRender=old;}catch(error){errors.push(error);}if(errors.length)throw new AggregateError([...(renderFailure?[renderFailure]:[]),...errors],'default render cleanup',{cause:renderFailure});}
   check(drawn.some(x=>x.body&&x.vertices>0),'native weapon actually rendered '+row);
   phases.push({phase,row,kit:kit.id,base:kit.baseId,preference:AP.weaponAppearancePreference(kit.id,storage),selected:AP.selectedWeaponAppearance(kit.id,storage),weaponModel:ch.weaponModel,appearance:ch.weaponAppearanceModel,modelId:w.def.modelId,modelVariantId:w.def.modelVariantId,drawn,poseFinite:true});
   delete out.current;
   }
   out.rows.push({row,kit:kit.id,base:kit.baseId,phases});
  }
  check(out.rows.length===14&&new Set(out.rows.map(x=>x.row)).size===14,'fourteen reopen receipts');
  return out;
 }catch(error){primary=error;error.defaultPartial=out;throw error;}
 finally{
  const errors=[];const attempt=f=>{try{f();}catch(e){errors.push(e);}};
  attempt(()=>{if(original.storage===null)storage.removeItem(key);else storage.setItem(key,original.storage);});
  // Resynchronise the module's session fallback from the restored storage.
  attempt(()=>AP.setWeaponAppearance(original.weapon,AP.weaponAppearancePreference(original.weapon,storage)??'',storage));
  attempt(()=>{if(original.storage===null)storage.removeItem(key);else storage.setItem(key,original.storage);});
  attempt(()=>{sc.hide();for(let i=0;i<30;i++)sc.update(1/60);sc.showLoadout(original.weapon,original.color,original.style);for(let i=0;i<180;i++)sc.update(1/60);});
  if(errors.length){const e=new AggregateError([...(primary?[primary]:[]),...errors],'default probe restoration',{cause:primary});e.defaultPartial=out;throw e;}
 }
}
export async function checkDefaultReopening({page,evidence,manifest,sourceSha}) {
 if(sourceSha!=='97c1b517182846f6abf9007b2b3315ad2aa8e1a8')throw Error('Default reopen source head mismatch');
 const revision=manifest?.build?.revision;
 if(!/^[a-f0-9]{64}$/.test(revision??''))throw Error('Default probe revision missing');
 const required=['src/core/ctx.js','src/config.js','patches/splatoon3/runtime/weapon-appearance.mjs','patches/splatoon3/runtime/weapon-models/registry.mjs','patches/splatoon3/runtime/alternate-weapon-kits-data.mjs'];
 for(const rel of required)if(!/^[a-f0-9]{64}$/.test(manifest.artifacts?.['_versions/'+revision+'/'+rel]??''))throw Error('Default probe artifact missing: '+rel);
 const result=await page.evaluate(async({rows,source,revision})=>{
  if(new URL(document.baseURI).pathname!=='/_versions/'+revision+'/')throw Error('Default probe versioned base mismatch');
  const url=p=>new URL(p,document.baseURI).href;
  const {G}=await import(url('src/core/ctx.js'));if(G!==globalThis.s3ProbeG)throw Error('Default probe public ctx mismatch');
  const [AP,R,{ALTERNATE_WEAPON_KITS:kits},{WEAPONS}]=await Promise.all([
   import(url('patches/splatoon3/runtime/weapon-appearance.mjs')),import(url('patches/splatoon3/runtime/weapon-models/registry.mjs')),
   import(url('patches/splatoon3/runtime/alternate-weapon-kits-data.mjs')),import(url('src/config.js'))]);
  try{return {ok:true,value:(0,eval)('('+source+')')({G,AP,R,kits,WEAPONS,storage:localStorage,rows})};}
  catch(error){return {ok:false,error:String(error),partial:error.defaultPartial??null};}
 },{rows:REOPEN_ROWS,source:observeReopenedDefaults.toString(),revision});
 if(evidence)fs.writeFileSync(evidence+'/accepted-default-reopening.json',JSON.stringify(result,null,2));
 if(!result.ok)throw Error(result.error);
 return result.value;
}
