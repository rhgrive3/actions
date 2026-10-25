// Full candidate compiler + actual installed _updCrosshair, with display plumbing doubled.
// This is module/owner integration evidence, not browser or retail pixel parity.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';

const candidate=fileURLToPath(new URL('../../../',import.meta.url));
// Normal repository execution needs neither private paths nor a provenance manifest.
// An optional distinct external baseline enables the stronger pinned comparison.
const baseline=process.env.INKWAVE_RETICLE_BASELINE_ROOT || candidate;
const externalBaseline=fs.realpathSync(baseline)!==fs.realpathSync(candidate);
const manifestPath=externalBaseline && (process.env.INKWAVE_RETICLE_OFFICIAL_MANIFEST || path.join(baseline,'official-blob-manifest.json'));
const official=manifestPath && fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath,'utf8')) : null;
const {parse}=await import(pathToFileURL(path.join(baseline,'patches/loading-cache/vendor/acorn.mjs')));
const overlay=fs.mkdtempSync(path.join(os.tmpdir(),'reticle-candidate-composition-'));
const cleanup=()=>fs.rmSync(overlay,{recursive:true,force:true});
after(cleanup);
// Module-initialization failures happen before the test runner's after hook.
// Remove only this invocation's own mkdtemp directory in that case as well.
process.once('exit',cleanup);
const changed=new Set(['patches/splatoon3/weapon-catalog-adapter.mjs',
  ...['presentation','geometry','installer'].map(n=>`patches/local-quality/weapon-reticle-${n}.mjs`),
  'patches/local-quality/splatling-reticle-corners.mjs']);
const copied=new Set();let verified=0;
const blob=bytes=>crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
function copyModule(rel){
  if(copied.has(rel))return;copied.add(rel);
  const bytes=fs.readFileSync(path.join(changed.has(rel)?candidate:baseline,rel));
  if(official&&!changed.has(rel)){assert.equal(blob(bytes),official[rel],'immutable official input '+rel);verified++;}
  const dest=path.join(overlay,rel);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,bytes);
  const ast=parse(bytes.toString(),{sourceType:'module',ecmaVersion:'latest'});
  for(const n of ast.body)if(n.source?.value?.startsWith('.')){
    const dependency=path.posix.normalize(path.posix.join(path.posix.dirname(rel),n.source.value));
    assert(!dependency.startsWith('../'),'dependency stays inside source root');copyModule(dependency);
  }
}
copyModule('scripts/inkwave-source-composition.mjs');
for(const rel of changed)copyModule(rel);
// The official net-hit adapter reads this data at module initialization.
for(const rel of ['patches/splatoon3/profile.json']){
  const bytes=fs.readFileSync(path.join(baseline,rel));
  if(official){assert.equal(blob(bytes),official[rel],rel);verified++;}
  fs.mkdirSync(path.dirname(path.join(overlay,rel)),{recursive:true});fs.writeFileSync(path.join(overlay,rel),bytes);
}
const {adaptBuildSource}=await import(pathToFileURL(path.join(overlay,'scripts/inkwave-source-composition.mjs')));
const baselineCompose=externalBaseline
  ? (await import(pathToFileURL(path.join(baseline,'scripts/inkwave-source-composition.mjs')))).adaptBuildSource : null;
const read=rel=>{const name='inkwave-public/'+rel,bytes=fs.readFileSync(path.join(baseline,name));
  if(official)assert.equal(blob(bytes),official[name],name);return bytes.toString();};
const source=adaptBuildSource('src/ui/hud.js',read('src/ui/hud.js'));
const composedCss=adaptBuildSource('styles/hud.css',read('styles/hud.css'));
const ast=parse(source,{sourceType:'module',ecmaVersion:'latest'});
const declaration=ast.body.map(n=>n.declaration||n).find(n=>n.type==='ClassDeclaration'&&n.id.name==='HUD');
assert(declaration,'actual fully composed HUD class');
const {installWeaponReticlePresentation}=await import(pathToFileURL(path.join(overlay,'patches/local-quality/weapon-reticle-installer.mjs')));
const {installSplatlingReticleCorners,SPLATLING_RETICLE_CORNER_CSS}=await import(pathToFileURL(path.join(overlay,'patches/local-quality/splatling-reticle-corners.mjs')));
const {applyShotGuide}=await import(pathToFileURL(path.join(baseline,'patches/splatoon3/runtime/weapons-fidelity.mjs')));
const {selectedSub,selectedSubCost}=await import(pathToFileURL(path.join(baseline,'patches/splatoon3/runtime/kit-composition.mjs')));
const {updateSplatlingStages}=await import(pathToFileURL(path.join(baseline,'patches/local-quality/splatling-reticle.mjs')));
const {chargerScopeFactor}=await import(pathToFileURL(path.join(baseline,'inkwave-public/src/game/chargerTuning.js')));
// Reuse only the existing test DOM plumbing, never a copied production HUD method.
const fixtureSource=fs.readFileSync(new URL('./splatling-reticle-corners.test.mjs',import.meta.url),'utf8');
const fixtureStart=fixtureSource.indexOf('class Style {'),fixtureEnd=fixtureSource.indexOf('const runtime=',fixtureStart);
assert(fixtureStart>=0&&fixtureEnd>fixtureStart);
const {Element}=Function('assert',fixtureSource.slice(fixtureStart,fixtureEnd)+'return {Element};')(assert);
const catalog=(family,id)=>({id,kind:'catalog',behaviorKind:family,catalogRecord:{id,family},chargeTime:1,special:'slam'});
const WEAPONS={shooter:{id:'shooter',kind:'shooter'},roller:{id:'roller',kind:'roller'},
  brella:catalog('brella','brella'),wiper:catalog('splatana','s3-saber-lite'),stamper:catalog('splatana','s3-saber-normal'),
  decavitator:catalog('splatana','s3-saber-heavy'),stringer:catalog('stringer','stringer'),
  charger:{id:'charger',kind:'charger',scoped:true,chargeTime:1},splatling:{id:'splatling',kind:'splatling',chargeTime:1}};
const runtime=path.join(baseline,'patches/splatoon3/runtime');
const {MAIN_WEAPON_CATALOG}=await import(pathToFileURL(path.join(runtime,'main-weapon-catalog-data.mjs')));
const {ALTERNATE_WEAPON_KITS}=await import(pathToFileURL(path.join(runtime,'alternate-weapon-kits-data.mjs')));
const {registerAlternateWeaponKits}=await import(pathToFileURL(path.join(runtime,'alternate-weapon-kits.mjs')));
const registered={};
for(const record of MAIN_WEAPON_CATALOG.records){
  registered[record.id]={id:record.id,kind:record.legacy||'catalog',behaviorKind:record.family,
    modelKind:record.modelKind,catalogRecord:record,chargeTime:(record.parameters.WeaponParam?.ChargeFrame_Second??60)/60};
}
const kitSubs={},kitSpecials={};for(const kit of ALTERNATE_WEAPON_KITS){kitSubs[kit.sub]={};kitSpecials[kit.special]={};}
registerAlternateWeaponKits({WEAPONS:registered,WEAPON_ORDER:Object.keys(registered),SUB:kitSubs,SPECIALS:kitSpecials,LANG:'en'});
const spinnerIds=Object.keys(registered).filter(id=>registered[id].catalogRecord?.family==='splatling');
for(const id of spinnerIds)WEAPONS[id]=registered[id];
// Sub-chip display plumbing only; this reticle test does not measure sub costs.
const displaySubs={bomb:{id:'bomb',inkCost:70,name:'Bomb'}};
for(const id of Object.keys(kitSubs))displaySubs[id]={id,inkCost:70,name:id};
function rig(){
  const runner={charge:0,chargeT:0,charging:false,streaming:false},actor={alive:true,form:'kid',invuln:0,weaponRunner:runner,weapon:WEAPONS.shooter};
  const G={match:{local:actor},camera:null};
  const values={G,WEAPONS,SUB:displaySubs,SUB_ICONS:{bomb:''},PLAYER:{respawnTime:5},MATCH:{},
    clamp:(x,a=0,b=1)=>Math.min(b,Math.max(a,x)),innerWidth:1280,innerHeight:720,
    applyShotGuide,selectedSub,selectedSubCost,updateSplatlingStages,chargerScopeFactor,installWeaponReticlePresentation,installSplatlingReticleCorners,
    specialIcon:()=>'',t:x=>x,on:()=>()=>{},removeEventListener(){},cancelAnimationFrame(){}};
  const bindings={...values};let executable=source;
  for(const n of [...ast.body].reverse()){
    if(n.type==='ImportDeclaration'){
      for(const spec of n.specifiers)bindings[spec.local.name]=values[spec.imported?.name]||(()=>{});
      executable=executable.slice(0,n.start)+executable.slice(n.end);
    }else if(n.type==='ExportNamedDeclaration'){
      executable=executable.slice(0,n.start)+(n.declaration?executable.slice(n.declaration.start):executable.slice(n.end));
    }
  }
  const HUD=Function(...Object.keys(bindings),executable+'\nreturn HUD;')(...Object.values(bindings));
  const h=Object.assign(Object.create(HUD.prototype),{_L:{},_bloom:0,_kick:0,_fxTime:0,_visible:true,
    ret:new Element(),xh:new Element(),spIcon:new Element(),scopeMask:new Element(),shield:new Element(),subChip:new Element(),
    _local:()=>actor,_snd(){},_restart(el,name){el.classList.add(name);},clearCalls:0,_clearReticleFeedback(){this.clearCalls++;}});
  h.subChip.appendChild(new Element('i'));h.subChip.appendChild(new Element('b'));
  const draw=(weapon,charge=0,extra={})=>{actor.weapon=WEAPONS[weapon];h._updCrosshair({weapon,charge,crosshair:{spread:18.3,inRange:true,guide:{x:677,y:341}},...extra},1/60);};
  const overlay=()=>h.ret.children.find(n=>n.classList.contains('iw-reticle-presentation-svg'));
  return {h,actor,runner,draw,overlay};
}

test('candidate hook composes once after HUD class and does not change main/player/bot branches',()=>{
  assert(copied.size>100,'actual compiler dependency closure used, not a parallel adapter');
  if(official)assert(verified>100,'external pinned inputs retain their official blob identities');
  const imports=ast.body.filter(n=>n.type==='ImportDeclaration'&&n.source.value.endsWith('/weapon-reticle-installer.mjs'));
  assert.equal(imports.length,1);
  const calls=ast.body.filter(n=>n.type==='ExpressionStatement'&&n.expression.type==='CallExpression'&&n.expression.callee.name==='installWeaponReticlePresentation');
  assert.equal(calls.length,1);assert(calls[0].start>declaration.end);
  assert.equal(ast.body.filter(n=>n.type==='ImportDeclaration'&&n.source.value.endsWith('/splatling-reticle-corners.mjs')).length,1);
  const cornerCalls=ast.body.filter(n=>n.type==='ExpressionStatement'&&n.expression.type==='CallExpression'&&n.expression.callee.name==='installSplatlingReticleCorners');
  assert.equal(cornerCalls.length,1);assert(cornerCalls[0].start>declaration.end);
  const assertNoHook=code=>{
    const module=parse(code,{sourceType:'module',ecmaVersion:'latest'});
    assert(!module.body.some(n=>n.type==='ImportDeclaration'&&/weapon-reticle-installer|splatling-reticle-corners/.test(n.source.value)),'non-HUD installer import');
    assert(!module.body.some(n=>n.type==='ExpressionStatement'&&n.expression.type==='CallExpression'&&['installWeaponReticlePresentation','installSplatlingReticleCorners'].includes(n.expression.callee.name)),'non-HUD installer call');
  };
  for(const rel of ['src/main.js','src/game/player.js','src/game/bots.js']){
    const raw=read(rel),output=adaptBuildSource(rel,raw);assertNoHook(output);
    if(baselineCompose)assert.equal(output,baselineCompose(rel,raw),rel+' unchanged against a distinct external baseline');
    assert.throws(()=>assertNoHook("import { installWeaponReticlePresentation } from './weapon-reticle-installer.mjs';\n"+output),/non-HUD installer import/);
    assert.throws(()=>assertNoHook(output+'\ninstallWeaponReticlePresentation(HUD, WEAPONS);'),/non-HUD installer call/);
  }
});

test('actual compiled Splatling CSS uses more-specific class-only border suppression without changing raw-angle owners',()=>{
  assert.equal(composedCss.split(SPLATLING_RETICLE_CORNER_CSS).length-1,1,'CSS export is actually installed once');
  const specificity=s=>(s.match(/\.[a-z_-][\w-]*|\[[^\]]+\]/gi)||[]).length;
  const selector=SPLATLING_RETICLE_CORNER_CSS.split('{')[0];assert.equal(specificity(selector),4);
  const native=[...composedCss.matchAll(/(\.iw-ret--splatling \.iw-ret__tick\[style\*="--a:[^"]+"\]) \{([^}]+)\}/g)];
  assert.equal(native.length,4);
  for(const [,rule,body]of native){assert.equal(specificity(rule),3);assert.match(body,/border-(?:top|right|bottom|left)-width: 2px/);}
  assert.match(SPLATLING_RETICLE_CORNER_CSS,/border-width: 0;/);
  assert.match(composedCss,/--iw-x: calc\(58px \+ var\(--sp, 0\) \* 0\.7071px\)/);
  assert.match(composedCss,/--iw-y: calc\(40px \+ var\(--sp, 0\) \* 0\.7071px\)/);
});

test('actual compiled Splatling updater supports all fourteen registered IDs with unchanged two-ring stages and literal selectors',()=>{
  assert.equal(spinnerIds.length,14,'six actual base records plus eight registered kits');
  const before=JSON.stringify(WEAPONS);
  for(const id of spinnerIds){
    const f=rig(),weapon=WEAPONS[id],record=weapon.catalogRecord;
    f.draw(id);assert.equal(f.h._L.weapon,id);assert.equal(f.h._L.kind,'splatling');assert.equal(f.overlay(),undefined);
    const handles=[f.h._chargeEl,f.h._chargeSecond],ticks=f.h.ret.querySelectorAll('.iw-ret__tick');
    assert.equal(ticks.length,4);assert.equal(f.h.ret.querySelectorAll('.iw-ret__splatling-corner').length,4,id);
    assert.deepEqual(ticks.map(t=>t.attrs.style),['--a:45deg','--a:135deg','--a:225deg','--a:315deg']);
    const tickWrites=ticks.map(t=>t.style.writes.length),rawStyles=ticks.map(t=>t.attrs.style),children=[...f.h.ret.children];
    const ratio=record.parameters.WeaponParam.ChargeFrame_First/record.parameters.WeaponParam.ChargeFrame_Second;
    for(const [charge,offsets]of [[0,['100.00','100.00']],[ratio,['0.00','100.00']],[1,['0.00','0.00']]]){
      Object.assign(f.runner,{charging:true,charge});f.draw(id,charge);
      assert.equal(f.h._chargeEl,handles[0]);assert.equal(f.h._chargeSecond,handles[1]);
      assert(handles.every(n=>f.h.ret.contains(n)));assert.deepEqual(handles.map(n=>n.style.strokeDashoffset),offsets,id+' charge='+charge);
      assert.equal(f.h.ret.style.getPropertyValue('--sp'),'18.3');
    }
    const params=record.parameters,last=(params.WeaponFullChargeParam?.MaxShootingFrame_Second??params.WeaponParam.MaxShootingFrame_Second)/60;
    Object.assign(f.runner,{charging:false,charge:0,streaming:true,catalogState:{id:record.id,streamTime:last,streamElapsed:0}});
    if(record.legacy)Object.assign(f.runner,{burstT:last,burstDur:last});
    f.draw(id,0);assert.equal(f.h.ret.classList.contains('is-idle'),false);assert(f.h.ret.classList.contains('is-streaming'));
    assert.deepEqual(handles.map(n=>n.style.strokeDashoffset),['0.00','0.00'],id+' initial paid full stream');
    f.actor.form='squid';f.draw(id,0);assert.equal(f.h.ret.style.visibility,'hidden');
    f.actor.form='kid';f.runner.streaming=false;f.draw(id,0);assert.equal(f.h.ret.style.visibility,'');assert(f.h.ret.classList.contains('is-idle'));
    assert.deepEqual(handles.map(n=>n.style.strokeDashoffset),['100.00','100.00'],id+' stream-ended empty rings');
    assert.deepEqual([...f.h.ret.children],children);assert.deepEqual(ticks.map(t=>t.style.writes.length),tickWrites);
    assert.deepEqual(ticks.map(t=>t.attrs.style),rawStyles,'no CSSOM reserialization of native angle selectors');
    assert(ticks.every(t=>t.classList.contains('iw-reticle-splatling-chamfer')&&t.children.length===1));
  }
  assert.equal(JSON.stringify(WEAPONS),before,'no weapon/catalog/kit mutation');
});

test('actual installed updater switches active families, holds native charge handles, and restores unknown fallback',()=>{
  const f=rig();
  for(const weapon of ['roller','brella','wiper','stamper']){
    f.draw(weapon);assert(f.overlay(),weapon);
    if(weapon==='wiper'||weapon==='stamper'){
      assert(f.h.ret.contains(f.h._chargeEl));assert.equal(f.h._chargeEl.parentNode.style.getPropertyValue('display'),'none');
      assert.equal(f.h._L.kind,'charger');assert(!f.h.ret.classList.contains('iw-ret--charger'));
      const handle=f.h._chargeEl;
      for(const [charging,charge]of [[true,.5],[true,1],[false,0]]){
        Object.assign(f.runner,{charging,charge,chargeT:charge});f.draw(weapon,charge);
        assert.equal(f.h._chargeEl,handle);assert(f.h.ret.contains(handle));assert(f.overlay());assert(!f.h.ret.classList.contains('is-flash'));
      }
    }
  }
  f.draw('decavitator');assert.equal(f.overlay(),undefined);assert(f.h.ret.classList.contains('iw-ret--charger'));
  assert.equal(f.h._chargeEl.parentNode.style.getPropertyValue('display'),'');
  f.draw('stringer');assert.equal(f.overlay(),undefined);assert(f.h.ret.classList.contains('iw-ret--charger'));
  f.draw('unknown');assert.equal(f.overlay(),undefined);assert(f.h.ret.classList.contains('iw-ret--unknown'));
});

test('actual installed Brella updater retains authoritative spread, guide, target range and stable DOM',()=>{
  const f=rig();f.draw('brella');const nodes=[...f.h.ret.children],ticks=f.h.ret.querySelectorAll('.iw-ret__tick');
  const initial={assignments:f.h.ret.assignments,insertions:f.h.ret.insertions};
  const before=JSON.stringify({weapon:f.actor.weapon,runner:f.runner});
  for(let n=0;n<120;n++)f.draw('brella');
  assert.deepEqual([...f.h.ret.children],nodes);assert.equal(f.h.ret.assignments,initial.assignments);assert.equal(f.h.ret.insertions,initial.insertions);
  assert.equal(JSON.stringify({weapon:f.actor.weapon,runner:f.runner}),before);
  assert.equal(f.h.ret.style.getPropertyValue('--sp'),'18.3');assert.equal(f.h.ret.style.translate,'37.0px -19.0px');
  ticks.forEach((tick,i)=>assert.equal(f.h.ret.children[i+2],tick));
  f.draw('brella',0,{crosshair:{spread:30,inRange:false,onTarget:'enemy'}});
  assert.equal(f.h.ret.style.getPropertyValue('--sp'),'30.0');assert(!f.h.xh.classList.contains('is-target'));assert(f.h.xh.classList.contains('is-far'));
});

test('actual updater keeps native scope, squid visibility, dead feedback cleanup and detached-ring recovery',()=>{
  const f=rig();Object.assign(f.runner,{charging:true,charge:1,chargeT:1});f.draw('charger',1);
  assert.equal(f.h.scopeMask.style.opacity,'1.000');assert.equal(f.overlay(),undefined);
  f.runner.charging=false;f.draw('charger',1);assert.equal(f.h.scopeMask.style.opacity,'0.000');
  f.draw('wiper',0);const old=f.h._chargeEl;f.h.ret.innerHTML='';assert(!f.h.ret.contains(old));f.draw('wiper',0);
  assert.notEqual(f.h._chargeEl,old);assert(f.h.ret.contains(f.h._chargeEl));assert(f.overlay());
  f.actor.form='squid';f.draw('wiper',0);assert.equal(f.h.ret.style.visibility,'hidden');
  f.actor.form='kid';f.draw('wiper',0);assert.equal(f.h.ret.style.visibility,'');
  const clears=f.h.clearCalls;f.actor.alive=false;f.draw('wiper',0);assert.equal(f.h.clearCalls,clears+1);
  f.actor.alive=true;f.draw('wiper',0);assert.equal(f.h._L.feedbackDead,false);
});
