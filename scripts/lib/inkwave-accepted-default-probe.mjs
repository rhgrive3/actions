import fs from 'node:fs';
export const ACCEPTED_DEFAULT_ROWS = Object.freeze([
 'Spinner_Serein_01','Spinner_Hyper_01','Spinner_Hyper_02',
 'Shooter_Expert_01','Shooter_QuickLong_01','Shooter_Long_01',
 'Maneuver_Gallon_01','Maneuver_Normal_02','Shelter_Compact_01',
 'Spinner_Downpour_01','Spinner_HyperShort_01','Spinner_Standard_01',
]);
// Called with the actual loaded game's public appearance/registry modules and
// native Showcase. No replacement Character, renderer, geometry or selection.
export function observeAcceptedDefaults({G,AP,R,kits,WEAPONS,storage,rows}) {
 const check=(ok,label)=>{if(!ok)throw Error('Accepted default: '+label);};
 const sc=G.game.showcase,key=AP.WEAPON_APPEARANCE_STORAGE_KEY;
 const original={storage:storage.getItem(key),weapon:sc.weapon,color:sc.color,style:sc.style};
 const out={selectedCount:R.registeredWeaponVariantModels().length,manualCount:R.registeredWeaponVariants().length,rows:[]};
 check(out.selectedCount===57&&out.manualCount===94,'registry denominator');
 check(sc.mode==='loadout'&&sc.chars.length===1,'native loadout owner');
 let primary;
 try {
  for(const row of rows){
   const matches=kits.filter(k=>k.main===row);check(matches.length===1,'official kit '+row);
   const kit=matches[0];check(WEAPONS[kit.id]?.sourceRow===row,'installed kit '+row);
   check(R.weaponModelSpec(kit.id)===R.weaponVariantSpec(row)&&typeof R.weaponVariantSpec(row)?.build==='function','same accepted spec '+row);
   AP.setWeaponAppearance(kit.id,'',storage);
   check(AP.weaponAppearancePreference(kit.id,storage)===null,'override absent '+row);
   check(R.weaponDefaultAppearance(kit.id)===row&&AP.selectedWeaponAppearance(kit.id,storage)===row,'wrong default '+row);
   sc.showLoadout(kit.id,original.color,original.style);
   // Native loadout hop changes the held weapon partway through its update.
   // Advance its existing owner, never force Character.setWeapon or visibility.
   for(let i=0;i<180;i++)sc.update(1/60);
   const ch=sc.chars[0],w=ch?.weapon;
   check(sc.weapon===kit.id&&ch?.weaponAppearancePreview===true,'preview routing '+row);
   check(ch.weaponModel===row&&ch.weaponAppearanceModel===row&&w?.def?.modelId===kit.baseId&&w.def.modelVariantId===row,'Character consumed default '+row);
   check(ch.root.parent===sc.scene&&w.body?.geometry===w.def.body,'mounted native geometry '+row);
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
   out.rows.push({row,kit:kit.id,base:kit.baseId,preference:AP.weaponAppearancePreference(kit.id,storage),selected:AP.selectedWeaponAppearance(kit.id,storage),weaponModel:ch.weaponModel,appearance:ch.weaponAppearanceModel,modelId:w.def.modelId,modelVariantId:w.def.modelVariantId,drawn,poseFinite:true});
  }
  check(out.rows.length===12&&new Set(out.rows.map(x=>x.row)).size===12,'twelve default receipts');
  return out;
 }catch(error){primary=error;error.defaultPartial=out;throw error;}
 finally{
  const errors=[];const attempt=f=>{try{f();}catch(e){errors.push(e);}};
  attempt(()=>{if(original.storage===null)storage.removeItem(key);else storage.setItem(key,original.storage);});
  // Resynchronise the module's session fallback from the restored storage.
  attempt(()=>AP.setWeaponAppearance(original.weapon,AP.weaponAppearancePreference(original.weapon,storage)??'',storage));
  attempt(()=>{if(original.storage===null)storage.removeItem(key);else storage.setItem(key,original.storage);});
  attempt(()=>{sc.showLoadout(original.weapon,original.color,original.style);for(let i=0;i<180;i++)sc.update(1/60);});
  if(errors.length){const e=new AggregateError([...(primary?[primary]:[]),...errors],'default probe restoration',{cause:primary});e.defaultPartial=out;throw e;}
 }
}
export async function checkAcceptedDefaultConsumption({page,evidence,manifest}) {
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
 },{rows:ACCEPTED_DEFAULT_ROWS,source:observeAcceptedDefaults.toString(),revision});
 if(evidence)fs.writeFileSync(evidence+'/accepted-default-consumption.json',JSON.stringify(result,null,2));
 if(!result.ok)throw Error(result.error);
 return result.value;
}
