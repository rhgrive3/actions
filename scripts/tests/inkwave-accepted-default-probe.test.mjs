import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ACCEPTED_DEFAULT_ROWS as rows,observeAcceptedDefaults,withNativeAcceptedDefaultFixture,acceptedDefaultErrorDetails,checkAcceptedDefaultConsumption} from '../lib/inkwave-accepted-default-probe.mjs';
const revision='a'.repeat(64),manifest={build:{revision},artifacts:Object.fromEntries(['src/core/ctx.js','src/config.js','src/game/showcase.js','patches/splatoon3/runtime/weapon-appearance.mjs','patches/splatoon3/runtime/weapon-models/registry.mjs','patches/splatoon3/runtime/alternate-weapon-kits-data.mjs'].map(p=>['_versions/'+revision+'/'+p,'b'.repeat(64)]))};
function fixture(fault){
 const saved='{"original":"base"}',data=new Map([['preferences',saved]]),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 let prefs=JSON.parse(saved),ticks=0,renders=0;const hooks=[];
 const kits=rows.map((main,i)=>({main,id:'kit'+i,baseId:'base'+i})),WEAPONS=Object.fromEntries(kits.map(k=>[k.id,{sourceRow:k.main}]));
 const AP={WEAPON_APPEARANCE_STORAGE_KEY:'preferences',setWeaponAppearance(id,v){prefs=JSON.parse(storage.getItem('preferences')||'{}');if(v)prefs[id]=v;else delete prefs[id];storage.setItem('preferences',JSON.stringify(prefs));},weaponAppearancePreference:id=>JSON.parse(storage.getItem('preferences')||'{}')[id]??null,selectedWeaponAppearance:id=>AP.weaponAppearancePreference(id)??kits.find(k=>k.id===id)?.main};
 const spec={build(){}};
 const R={weaponModelSpec:()=>spec,weaponVariantSpec:()=>spec,registeredWeaponVariantModels:()=>Array(95),registeredWeaponVariants:()=>Array(95),weaponDefaultAppearance:id=>fault==='wrong-default'?'base':kits.find(k=>k.id===id)?.main};
 const sc={mode:'loadout',weapon:'original',color:{},style:{},scene:{},chars:[{}],r:{getContext:()=>({isContextLost:()=>fault==='context-lost'})},showLoadout(id){this.weapon=id;this.pending=id;},update(){ticks++;if(!this.pending||fault==='no-update')return;const k=kits.find(k=>k.id===this.pending);if(!k)return;const geometry={attributes:{position:{count:3}}},body={isMesh:true,geometry,onBeforeRender(){}};hooks.push([body,body.onBeforeRender]);const def={body:geometry,modelId:k.baseId,modelVariantId:fault==='wrong-def'?'base':k.main};if(fault==='static-split'){def.bodyStatic=geometry;def.body={attributes:{position:{count:9}}};}if(fault==='wrong-geometry')body.geometry={attributes:{position:{count:3}}};this.chars=[{root:{parent:fault==='unmounted'?null:this.scene},weaponAppearancePreview:true,weaponModel:k.main,weaponAppearanceModel:k.main,P:[1,2,3],weapon:{def,body,pivot:{traverse:fn=>fn(body)}}}];this.pending=null;},render(){renders++;if(fault==='render-throw')throw Error('render primary');if(fault==='no-draw')return;this.chars[0].weapon.body.onBeforeRender();}};
 const G={game:{showcase:sc}};return {args:{G,AP,R,kits,WEAPONS,storage,rows},saved,storage,sc,hooks,get ticks(){return ticks;},get renders(){return renders;}};
}
test('fifty fixed default rows consume actual native update and render, restoring preferences/hooks',()=>{const f=fixture();const out=observeAcceptedDefaults(f.args);assert.equal(out.rows.length,50);assert.equal(f.renders,50);assert.equal(f.ticks,51*180);assert.equal(f.storage.getItem('preferences'),f.saved);assert.equal(f.sc.weapon,'original');for(const[m,old]of f.hooks)assert.equal(m.onBeforeRender,old);});
for(const [fault,match]of[['wrong-default',/wrong default/],['wrong-def',/Character consumed/],['wrong-geometry',/mounted native geometry/],['unmounted',/mounted native/],['no-update',/preview routing|Character consumed/],['no-draw',/actually rendered/],['context-lost',/WebGL context/],['render-throw',/render primary/]])test('reject '+fault+' and restore',()=>{const f=fixture(fault);assert.throws(()=>observeAcceptedDefaults(f.args),match);assert.equal(f.storage.getItem('preferences'),f.saved);assert.equal(f.sc.weapon,'original');for(const[m,old]of f.hooks)assert.equal(m.onBeforeRender,old);});
test('reject leftover override rather than accepting saved manual as a default',()=>{const f=fixture();f.args.AP.weaponAppearancePreference=()=>rows[0];assert.throws(()=>observeAcceptedDefaults(f.args),/override absent/);});
test('cleanup double failure preserves primary and partial',()=>{const f=fixture('render-throw'),old=f.sc.showLoadout;f.sc.showLoadout=function(id,...a){if(id==='original')throw Error('restore secondary');return old.call(this,id,...a);};assert.throws(()=>observeAcceptedDefaults(f.args),e=>e instanceof AggregateError&&e.cause.message==='render primary'&&e.errors.length===2&&e.defaultPartial.rows.length===0);});
test('browser wrapper saves failed partial before throwing',async()=>{const dir=fs.mkdtempSync('/tmp/default-probe-control-');try{const page={evaluate:async()=>({ok:false,error:'wrong default',partial:{rows:[]}})};await assert.rejects(checkAcceptedDefaultConsumption({page,evidence:dir,manifest}),/wrong default/);assert.deepEqual(JSON.parse(fs.readFileSync(dir+'/accepted-default-consumption.json')).partial,{rows:[]});}finally{fs.rmSync(dir,{recursive:true});}});
test('active entry preserves old picker and invokes default check once afterward',()=>{const s=fs.readFileSync(new URL('../check-inkwave-browser.mjs',import.meta.url),'utf8');const old='result.weaponAppearancePicker = await checkWeaponAppearancePicker({page,evidence});';const add='result.acceptedDefaultConsumption = await checkAcceptedDefaultConsumption({page,evidence,manifest});';assert.equal(s.split(add).length,2);assert.ok(s.indexOf(add)>s.indexOf(old));});

test('missing or wrong-revision emitted registry rejected before page execution',async()=>{let called=false;const page={evaluate:async()=>{called=true;}};await assert.rejects(checkAcceptedDefaultConsumption({page,manifest:{...manifest,artifacts:{}}}),/artifact missing/);await assert.rejects(checkAcceptedDefaultConsumption({page,manifest:{...manifest,build:{revision:'c'.repeat(64)}}}),/artifact missing/);assert.equal(called,false);});

test('native split stationary geometry is consumed without substituting the merged far body',()=>{const f=fixture('static-split');const out=observeAcceptedDefaults(f.args);assert.equal(out.rows.length,50);assert.equal(f.renders,50);assert.equal(f.storage.getItem('preferences'),f.saved);});

test('four additional defaults retain prior fourteen browser rows',()=>{assert.equal(rows.length,50);assert.equal(new Set(rows).size,50);assert.deepEqual(rows.slice(14,18),['Shooter_Heavy_02','Maneuver_Dual_01','Maneuver_Dual_02','Shooter_Long_02']);const f=fixture();f.args.R.registeredWeaponVariantModels=()=>Array(59);assert.throws(()=>observeAcceptedDefaults(f.args),/registry denominator/);});

test('new Brush and Slosher rows extend old eighteen; old63 denominator is rejected',()=>{assert.deepEqual(rows.slice(18,22),['Brush_Heavy_01','Brush_Heavy_02','Slosher_Double_01','Slosher_Diffusion_02']);const f=fixture();f.args.R.registeredWeaponVariantModels=()=>Array(63);assert.throws(()=>observeAcceptedDefaults(f.args),/registry denominator/);});

test('A4 three extend the exact old twenty-two rows; old67 denominator rejects',()=>{assert.deepEqual(rows.slice(22,25),['Shooter_TripleMiddle_02', 'Shooter_Precision_02', 'Shooter_TripleQuick_02']);const f=fixture();f.args.R.registeredWeaponVariantModels=()=>Array(67);assert.throws(()=>observeAcceptedDefaults(f.args),/registry denominator/);});

test("Luna extends the twenty-five retained rows and old59 is rejected",()=>{assert.equal(rows.length,50);assert.equal(rows[25],"Blaster_Short_01");const f=fixture();f.args.R.registeredWeaponVariantModels=()=>Array(59);assert.throws(()=>observeAcceptedDefaults(f.args),/registry denominator/);});
test('Carbon rows extend former26; old67 denominator rejected',()=>{assert.deepEqual(rows.slice(26,28),['Roller_Compact_01','Roller_Compact_02']);const f=fixture();f.args.R.registeredWeaponVariantModels=()=>Array(67);assert.throws(()=>observeAcceptedDefaults(f.args),/registry denominator/);});

test('LightLong adds only two rows after the exact former28; old73 denominator rejected',()=>{assert.deepEqual(rows.slice(28,30),['Blaster_LightLong_01','Blaster_LightLong_02']);const f=fixture();f.args.R.registeredWeaponVariantModels=()=>Array(73);assert.throws(()=>observeAcceptedDefaults(f.args),/registry denominator/);});

test('Colorz FRZN Foil append only three after retained30; old75 denominator rejected',()=>{assert.deepEqual(rows.slice(30,33),['Shooter_Blaze_02','Shooter_Expert_02','Shooter_Flash_01']);const f=fixture();f.args.R.registeredWeaponVariantModels=()=>Array(75);assert.throws(()=>observeAcceptedDefaults(f.args),/registry denominator/);});

test('Mini is the fourth addition after retained thirty rows; old78 rejects',()=>{assert.equal(rows[33],'Brush_Mini_01');assert.equal(rows.length,50);const f=fixture();f.args.R.registeredWeaponVariantModels=()=>Array(78);assert.throws(()=>observeAcceptedDefaults(f.args),/registry denominator/);});

test('Gal two and Saber append exactly three rows after all retained79 rows; old79 rejects',()=>{assert.deepEqual(rows.slice(34,37),['Shooter_Gravity_01','Shooter_Heavy_01','Saber_Lite_01']);const f=fixture();f.args.R.registeredWeaponVariantModels=()=>Array(79);assert.throws(()=>observeAcceptedDefaults(f.args),/registry denominator/);});

test('basic shooters append only three after public82 rows; old82 rejects',()=>{assert.deepEqual(rows.slice(37,40),['Shooter_First_01','Shooter_Normal_01','Shooter_Normal_02']);const f=fixture();f.args.R.registeredWeaponVariantModels=()=>Array(82);assert.throws(()=>observeAcceptedDefaults(f.args),/registry denominator/);});

test('Blaster pair append after prior37 and three Shooters; old84 and85 rejected',()=>{assert.deepEqual(rows.slice(40,42),['Blaster_Long_01','Blaster_Middle_02']);for(const count of [84,85]){const f=fixture();f.args.R.registeredWeaponVariantModels=()=>Array(count);assert.throws(()=>observeAcceptedDefaults(f.args),/registry denominator/);}});

test('seven saved models append after all forty-two retained rows; old87 rejects',()=>{assert.deepEqual(rows.slice(42,49),['Roller_Normal_01','Roller_Wide_01','Roller_Wide_02','Brush_Normal_01','Brush_Normal_02','Roller_Heavy_02','Slosher_Double_02']);const f=fixture();f.args.R.registeredWeaponVariantModels=()=>Array(87);assert.throws(()=>observeAcceptedDefaults(f.args),/registry denominator/);});

test('Patternz appends after all49 retained defaults; stale94 registry rejected',()=>{assert.equal(rows[49],'Shelter_Compact_02');const f=fixture();f.args.R.registeredWeaponVariantModels=()=>Array(94);assert.throws(()=>observeAcceptedDefaults(f.args),/registry denominator/);});

for (const savedPalette of [true,false]) test('default probe supplies and restores explicit opponent palette: '+savedPalette,()=>{
 const f=fixture(), original=savedPalette?Object.freeze({isColor:true,id:'saved'}):undefined;
 const other=Object.freeze({isColor:true,id:'team1'});f.sc.weaponOpponentColor=original;f.args.G.teamColors=[{},other];
 const old=f.sc.showLoadout,calls=[];f.sc.showLoadout=function(...args){calls.push(args);this.weaponOpponentColor=args[3];return old.apply(this,args);};
 observeAcceptedDefaults(f.args);assert.equal(calls.length,51);
 for(const args of calls.slice(0,50))assert.equal(args[3],original??other,'native four-argument palette contract');
 assert.equal(calls[50][3],original,'restore exact previous palette');assert.equal(f.sc.weaponOpponentColor,original);
});

function nativeObservationFixture(fault){
 const f=fixture(fault),G=f.args.G,profile={weapon:'original',style:{nativeStyle:true}},colors=[{team:0},{team:1}];
 const api={getLoadout:()=>({weapon:profile.weapon})},screen={name:'loadout',el:{isConnected:true}};
 Object.assign(G,{teamColors:colors});Object.assign(G.game,{profile,api,menus:{api,current:'loadout',_scr:screen}});
 f.args.WEAPONS.original={};f.sc.mode=null;f.sc.chars=[];
 const calls=[],show=f.sc.showLoadout,update=f.sc.update;let retire=0;
 f.sc.showLoadout=function(...args){calls.push(['show',...args]);this.mode='loadout';this.chars=[{}];show.apply(this,args);if(fault==='prepare-throw'&&calls.filter(c=>c[0]==='show').length===1)throw Error('prepare primary');};
 f.sc.hide=function(){calls.push(['hide']);this.mode=null;retire=12;if(fault==='hide-throw')throw Error('hide secondary');};
 f.sc.update=function(dt){calls.push(['update',dt]);update.call(this,dt);if(this.mode==null&&retire>0&&!--retire)this.chars=[];};
 return {f,G,profile,colors,calls,run:fn=>withNativeAcceptedDefaultFixture({G,WEAPONS:f.args.WEAPONS},fn??(()=>observeAcceptedDefaults(f.args)))};
}
test('static menu observation prepares the real API with exact profile/palette, preserves all50 proofs, then hides and retires',()=>{
 const {f,profile,colors,calls,run}=nativeObservationFixture();const result=run();
 assert.equal(result.value.rows.length,50);assert.equal(f.renders,50);assert.deepEqual(calls[0],['show','original',colors[0],profile.style,colors[1]]);
 assert.equal(calls.filter(c=>c[0]==='show').length,53,'prepare, unchanged50 defaults, original restoration, then public color restoration');
 assert.equal(f.ticks,53*180);assert.equal(result.fixture.prepared,true);assert.equal(result.fixture.initialMode,null);assert.equal(result.fixture.finalMode,null);assert.equal(result.fixture.finalCharacters,0);assert.equal(result.fixture.restored,true);
 assert.equal(f.storage.getItem('preferences'),f.saved);assert.equal(f.sc.mode,null);assert.equal(f.sc.chars.length,0);
});
test('existing loadout owner is neither prepared nor hidden and retains its original live owner',()=>{
 const {f,calls,run}=nativeObservationFixture();f.sc.mode='loadout';f.sc.chars=[{}];
 const result=run();assert.equal(result.value.rows.length,50);assert.equal(result.fixture.prepared,false);assert.equal(calls.filter(c=>c[0]==='hide').length,0);assert.equal(calls.filter(c=>c[0]==='show').length,51);assert.equal(f.sc.mode,'loadout');assert.equal(f.sc.chars.length,1);
});
for(const fault of ['menu','screen','detached','api','profile','palette'])test('observation rejects '+fault+' mismatch before native owner mutation',()=>{
 const {f,G,calls,run}=nativeObservationFixture();
 if(fault==='menu')G.game.menus.current='settings';if(fault==='screen')G.game.menus._scr.name='settings';if(fault==='detached')G.game.menus._scr.el.isConnected=false;
 if(fault==='api')G.game.menus.api={getLoadout:()=>({weapon:'original'})};if(fault==='profile')G.game.profile.weapon='foreign';if(fault==='palette')G.teamColors[1]=null;
 assert.throws(()=>run(),/Default fixture:/);assert.equal(calls.length,0);assert.equal(f.sc.mode,null);
});
test('partial native preparation failure still hides/retires and preserves the primary error',()=>{
 const {f,calls,run}=nativeObservationFixture('prepare-throw');assert.throws(()=>run(),e=>e.message==='prepare primary'&&e.defaultFixture.prepared&&e.defaultFixture.restored);
 assert.equal(f.sc.mode,null);assert.equal(f.sc.chars.length,0);assert.equal(calls.filter(c=>c[0]==='hide').length,1);
});
test('unchanged default geometry failure remains fatal while the observation owner is retired',()=>{
 const {f,run}=nativeObservationFixture('wrong-geometry');assert.throws(()=>run(),e=>/mounted native geometry/.test(e.message)&&e.defaultPartial.rows.length===0&&e.defaultFixture.restored);
 assert.equal(f.sc.mode,null);assert.equal(f.sc.chars.length,0);assert.equal(f.storage.getItem('preferences'),f.saved);
});
test('default render error and fixture cleanup failure preserve primary, partial and both failures',()=>{
 const {f,run}=nativeObservationFixture('hide-throw');f.sc.render=()=>{throw Error('render primary');};
 assert.throws(()=>run(),e=>e instanceof AggregateError&&e.cause.message==='render primary'&&e.errors.length===2&&e.errors[0]===e.cause&&e.errors[1].message==='hide secondary'&&e.defaultPartial.rows.length===0&&!e.defaultFixture.restored);
 assert.equal(f.sc.mode,null);assert.equal(f.sc.chars.length,0);
});
test('observer cannot mutate the live menu/profile while producing otherwise successful output',()=>{
 const {G,run}=nativeObservationFixture();assert.throws(()=>run(()=>{G.game.menus.current='main';return {rows:[]};}),e=>e instanceof AggregateError&&e.errors.some(x=>/menu owner restored/.test(x.message)));
});

test('public Showcase preparation restores Color.copy values and identity before retiring a hidden owner',()=>{
 const {f,G,profile,run}=nativeObservationFixture();
 const color=value=>({value,clone(){return color(this.value);},copy(other){this.value=other.value;return this;},equals(other){return this.value===other.value;}});
 const original=color('old-native'),team0=color('actual-team0'),team1=color('actual-team1');f.sc.color=original;G.teamColors=[team0,team1];
 const show=f.sc.showLoadout;f.sc.showLoadout=function(weapon,palette,...rest){this.color.copy(palette);return show.call(this,weapon,palette,...rest);};
 const result=run(()=>{assert.equal(f.sc.color.value,'actual-team0');assert.equal(f.sc.weapon,profile.weapon);return {observed:true};});
 assert.equal(result.fixture.restored,true);assert.equal(f.sc.color,original);assert.equal(original.value,'old-native');assert.equal(f.sc.mode,null);assert.equal(f.sc.chars.length,0);
});
test('serialized cleanup failure preserves primary and secondary diagnostics across the page boundary',async()=>{
 const primary=new Error('render primary'),secondary=new Error('hide secondary'),error=new AggregateError([primary,secondary],'default fixture restoration: render primary',{cause:primary});
 const failure=acceptedDefaultErrorDetails(error);assert.equal(failure.cause.message,'render primary');assert.deepEqual(failure.errors.map(e=>e.message),['render primary','hide secondary']);
 const dir=fs.mkdtempSync('/tmp/default-fixture-failure-');
 try{await assert.rejects(checkAcceptedDefaultConsumption({page:{evaluate:async()=>({ok:false,error:String(error),failure,partial:{rows:[]}})},evidence:dir,manifest}),/render primary/);
  const saved=JSON.parse(fs.readFileSync(dir+'/accepted-default-consumption.json'));assert.equal(saved.failure.cause.message,'render primary');assert.equal(saved.failure.errors[1].message,'hide secondary');
 }finally{fs.rmSync(dir,{recursive:true});}
});
test('replacing the live Showcase cannot pass by retiring only the old observation instance',()=>{
 const {G,run}=nativeObservationFixture();assert.throws(()=>run(()=>{G.game.showcase={};return {}; }),e=>e instanceof AggregateError&&e.errors.some(x=>/menu owner restored/.test(x.message)));
});
test('hidden Patternz profile restores via an explicit opponent palette even when its previous hidden cache was empty',()=>{
 const {f,G,run}=nativeObservationFixture();const other={isColor:true,team:1};G.teamColors[1]=other;
 f.sc.weaponOpponentColor=null;f.args.WEAPONS.original.sourceRow='Shelter_Compact_02';
 const show=f.sc.showLoadout;let guardedCalls=0;
 f.sc.showLoadout=function(weapon,color,style,opponent){
  // Same public API contract as the Patternz preview palette guard.
  if(weapon==='original'&&opponent?.isColor!==true)throw Error('Explicit opponent palette Color required');
  guardedCalls++;this.weaponOpponentColor=opponent;return show.call(this,weapon,color,style,opponent);
 };
 const result=run(()=>({ok:true}));assert.equal(guardedCalls,2,'preparation and hidden restoration both traverse the real palette contract');
 assert.equal(result.fixture.restored,true);assert.equal(f.sc.weaponOpponentColor,other);assert.equal(f.sc.mode,null);assert.equal(f.sc.chars.length,0);
});
