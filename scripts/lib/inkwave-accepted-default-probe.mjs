import fs from 'node:fs';
export const ACCEPTED_DEFAULT_ROWS = Object.freeze([
 'Spinner_Serein_01','Spinner_Hyper_01','Spinner_Hyper_02',
 'Shooter_Expert_01','Shooter_QuickLong_01','Shooter_Long_01',
 'Maneuver_Gallon_01','Maneuver_Normal_02','Shelter_Compact_01',
 'Spinner_Downpour_01','Spinner_HyperShort_01','Spinner_Standard_01',
 'Spinner_Quick_01','Spinner_Quick_02',
 'Shooter_Heavy_02','Maneuver_Dual_01','Maneuver_Dual_02','Shooter_Long_02',
 'Brush_Heavy_01','Brush_Heavy_02','Slosher_Double_01','Slosher_Diffusion_02',
 'Shooter_TripleMiddle_02','Shooter_Precision_02','Shooter_TripleQuick_02',
 'Blaster_Short_01','Roller_Compact_01','Roller_Compact_02',
 'Blaster_LightLong_01','Blaster_LightLong_02',
 'Shooter_Blaze_02','Shooter_Expert_02','Shooter_Flash_01',
 'Brush_Mini_01',
 'Shooter_Gravity_01','Shooter_Heavy_01','Saber_Lite_01',
 'Shooter_First_01','Shooter_Normal_01','Shooter_Normal_02',
 'Blaster_Long_01','Blaster_Middle_02',
 'Roller_Normal_01','Roller_Wide_01','Roller_Wide_02','Brush_Normal_01','Brush_Normal_02','Roller_Heavy_02','Slosher_Double_02','Shelter_Compact_02',
]);
// Called with the actual loaded game's public appearance/registry modules and
// native Showcase. No replacement Character, renderer, geometry or selection.
export function observeAcceptedDefaults({G,AP,R,kits,WEAPONS,storage,rows}) {
 const check=(ok,label)=>{if(!ok)throw Error('Accepted default: '+label);};
 const sc=G.game.showcase,key=AP.WEAPON_APPEARANCE_STORAGE_KEY;
 const original={storage:storage.getItem(key),weapon:sc.weapon,color:sc.color,style:sc.style,opponentColor:sc.weaponOpponentColor};
 const out={selectedCount:R.registeredWeaponVariantModels().length,manualCount:R.registeredWeaponVariants().length,rows:[]};
 check(out.selectedCount===95&&out.manualCount===95,'registry denominator');
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
   sc.showLoadout(kit.id,original.color,original.style,original.opponentColor??G.teamColors?.[1]);
   // Native loadout hop changes the held weapon partway through its update.
   // Advance its existing owner, never force Character.setWeapon or visibility.
   for(let i=0;i<180;i++)sc.update(1/60);
   const ch=sc.chars[0],w=ch?.weapon;
   out.current={row,kit:kit.id,phase:sc.phase,pending:sc.hopWeapon,weapon:sc.weapon,model:ch?.weaponModel,appearance:ch?.weaponAppearanceModel,modelId:w?.def?.modelId,modelVariantId:w?.def?.modelVariantId,mounted:ch?.root?.parent===sc.scene,bodyMatches:w?.body?.geometry===w?.def?.body,staticBodyMatches:w?.body?.geometry===w?.def?.bodyStatic};
   check(sc.weapon===kit.id&&ch?.weaponAppearancePreview===true,'preview routing '+row);
   check(ch.weaponModel===row&&ch.weaponAppearanceModel===row&&w?.def?.modelId===kit.baseId&&w.def.modelVariantId===row,'Character consumed default '+row);
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
   out.rows.push({row,kit:kit.id,base:kit.baseId,preference:AP.weaponAppearancePreference(kit.id,storage),selected:AP.selectedWeaponAppearance(kit.id,storage),weaponModel:ch.weaponModel,appearance:ch.weaponAppearanceModel,modelId:w.def.modelId,modelVariantId:w.def.modelVariantId,drawn,poseFinite:true});
   delete out.current;
  }
  check(out.rows.length===50&&new Set(out.rows.map(x=>x.row)).size===50,'fifty default receipts');
  return out;
 }catch(error){primary=error;error.defaultPartial=out;throw error;}
 finally{
  const errors=[];const attempt=f=>{try{f();}catch(e){errors.push(e);}};
  attempt(()=>{if(original.storage===null)storage.removeItem(key);else storage.setItem(key,original.storage);});
  // Resynchronise the module's session fallback from the restored storage.
  attempt(()=>AP.setWeaponAppearance(original.weapon,AP.weaponAppearancePreference(original.weapon,storage)??'',storage));
  attempt(()=>{if(original.storage===null)storage.removeItem(key);else storage.setItem(key,original.storage);});
  attempt(()=>{sc.showLoadout(original.weapon,original.color,original.style,original.opponentColor);for(let i=0;i<180;i++)sc.update(1/60);});
  if(errors.length){const e=new AggregateError([...(primary?[primary]:[]),...errors],'default probe restoration',{cause:primary});e.defaultPartial=out;throw e;}
 }
}
// Static decorative menus deliberately hide the native Showcase. This
// observation fixture prepares its real public owner solely for the existing
// geometry/render proof; it does not claim the menu allocated a 3D preview.
export function withNativeAcceptedDefaultFixture({G,WEAPONS},observe) {
 const game=G?.game,m=game?.menus,sc=game?.showcase,profile=game?.profile;
 const check=(ok,label)=>{if(!ok)throw Error('Default fixture: '+label);};
 check(m?.current==='loadout'&&m._scr?.name==='loadout'&&m._scr.el?.isConnected,'live loadout menu');
 check(game.api===m.api&&typeof game.api?.getLoadout==='function','native loadout API owner');
 check(profile&&typeof profile.weapon==='string'&&WEAPONS?.[profile.weapon]&&game.api.getLoadout().weapon===profile.weapon,'actual profile weapon');
 check(G.teamColors?.[0]&&G.teamColors?.[1],'actual team palette');
 check(sc&&typeof sc.showLoadout==='function'&&typeof sc.update==='function'&&typeof sc.hide==='function'&&Array.isArray(sc.chars),'native Showcase API');
 check(sc.mode==null||sc.mode==='loadout','hidden or loadout Showcase');
 const original={menu:m,screen:m._scr,current:m.current,api:game.api,profile,weapon:profile.weapon,style:profile.style,
  colors:G.teamColors,team0:G.teamColors[0],team1:G.teamColors[1],mode:sc.mode,showcaseWeapon:sc.weapon,chars:sc.chars.length,
  showcaseColor:sc.color,showcaseColorValue:sc.color?.clone?.()??sc.color,showcaseStyle:sc.style,
  opponentColor:sc.weaponOpponentColor?.clone?.()??sc.weaponOpponentColor};
 const fixture={purpose:'explicit native Showcase observation; not automatic static-menu preview',initialMode:sc.mode??null,
  initialCharacters:sc.chars.length,prepared:false,restored:false};
 let primary;
 const advance=()=>{for(let i=0;i<180;i++)sc.update(1/60);};
 try {
  if(original.mode==null){
   // Mark before invoking the real API so partial construction also retires.
   fixture.prepared=true;
   sc.showLoadout(original.weapon,original.team0,original.style,original.team1);
   advance();
  }
  const value=observe();
  return {value,fixture};
 }catch(error){primary=error;throw error;}
 finally {
  const errors=[],attempt=fn=>{try{fn();}catch(error){errors.push(error);}};
  if(fixture.prepared){
   // _setColor uses Color.copy: restore the saved value through the public
   // owner before hiding. A hidden constructor weapon may legitimately be
   // null; use the actual profile weapon rather than manufacturing that state.
   attempt(()=>sc.showLoadout(original.weapon,original.showcaseColorValue,original.showcaseStyle,original.opponentColor??original.team1));
   attempt(()=>sc.hide());attempt(advance);
  }
  attempt(()=>check(game.showcase===sc&&game.menus===original.menu&&m._scr===original.screen&&m.current===original.current&&game.api===original.api&&m.api===original.api,'menu owner restored'));
  attempt(()=>check(game.profile===original.profile&&profile.weapon===original.weapon&&profile.style===original.style&&game.api.getLoadout().weapon===original.weapon,'profile unchanged'));
  attempt(()=>check(G.teamColors===original.colors&&G.teamColors[0]===original.team0&&G.teamColors[1]===original.team1,'team palette unchanged'));
  attempt(()=>check(original.mode==null?sc.mode==null&&sc.chars.length===0:sc.mode===original.mode&&sc.weapon===original.showcaseWeapon&&sc.chars.length===original.chars,'Showcase visibility restored'));
  attempt(()=>check(sc.color===original.showcaseColor&&(!sc.color?.equals||sc.color.equals(original.showcaseColorValue)),'Showcase color restored'));
  fixture.finalMode=sc.mode??null;fixture.finalCharacters=sc.chars.length;fixture.restored=errors.length===0;
  if(primary)primary.defaultFixture=fixture;
  if(errors.length){
   const error=new AggregateError([...(primary?[primary]:[]),...errors],'default fixture restoration'+(primary?': '+primary.message:''),{cause:primary});
   error.defaultPartial=primary?.defaultPartial??null;error.defaultFixture=fixture;throw error;
  }
 }
}
export function acceptedDefaultErrorDetails(error,depth=0) {
 const out={name:error?.name??'Error',message:error?.message??String(error),stack:typeof error?.stack==='string'?error.stack.slice(0,4000):null};
 if(depth<4){
  if(error?.cause)out.cause=acceptedDefaultErrorDetails(error.cause,depth+1);
  if(Array.isArray(error?.errors))out.errors=error.errors.map(e=>acceptedDefaultErrorDetails(e,depth+1));
 }
 return out;
}
export async function checkAcceptedDefaultConsumption({page,evidence,manifest}) {
 const revision=manifest?.build?.revision;
 if(!/^[a-f0-9]{64}$/.test(revision??''))throw Error('Default probe revision missing');
 const required=['src/core/ctx.js','src/config.js','src/game/showcase.js','patches/splatoon3/runtime/weapon-appearance.mjs','patches/splatoon3/runtime/weapon-models/registry.mjs','patches/splatoon3/runtime/alternate-weapon-kits-data.mjs'];
 for(const rel of required)if(!/^[a-f0-9]{64}$/.test(manifest.artifacts?.['_versions/'+revision+'/'+rel]??''))throw Error('Default probe artifact missing: '+rel);
 const result=await page.evaluate(async({rows,source,fixtureSource,errorSource,revision})=>{
  if(new URL(document.baseURI).pathname!=='/_versions/'+revision+'/')throw Error('Default probe versioned base mismatch');
  const url=p=>new URL(p,document.baseURI).href;
  const {G}=await import(url('src/core/ctx.js'));if(G!==globalThis.s3ProbeG)throw Error('Default probe public ctx mismatch');
  const [AP,R,{ALTERNATE_WEAPON_KITS:kits},{WEAPONS}]=await Promise.all([
   import(url('patches/splatoon3/runtime/weapon-appearance.mjs')),import(url('patches/splatoon3/runtime/weapon-models/registry.mjs')),
   import(url('patches/splatoon3/runtime/alternate-weapon-kits-data.mjs')),import(url('src/config.js'))]);
  try{
   const observed=(0,eval)('('+fixtureSource+')')({G,WEAPONS},()=>
    (0,eval)('('+source+')')({G,AP,R,kits,WEAPONS,storage:localStorage,rows}));
   return {ok:true,value:observed.value,fixture:observed.fixture};
  }catch(error){return {ok:false,error:String(error),failure:(0,eval)('('+errorSource+')')(error),partial:error.defaultPartial??null,fixture:error.defaultFixture??null};}
 },{rows:ACCEPTED_DEFAULT_ROWS,source:observeAcceptedDefaults.toString(),fixtureSource:withNativeAcceptedDefaultFixture.toString(),errorSource:acceptedDefaultErrorDetails.toString(),revision});
 if(evidence)fs.writeFileSync(evidence+'/accepted-default-consumption.json',JSON.stringify(result,null,2));
 if(!result.ok)throw Error(result.error);
 return {...result.value,observationFixture:result.fixture};
}
