// Actual fully composed HUD, native charge helper, recovered runtime helpers and CSS.
// Controlled DOM + actor/registry fixture: owner integration, NOT browser/render/retail parity.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {WEAPONS as nativeWeapons} from '../../../inkwave-public/src/config.js';
import {MAIN_WEAPON_CATALOG} from '../../splatoon3/runtime/main-weapon-catalog-data.mjs';
import {ALTERNATE_WEAPON_KITS} from '../../splatoon3/runtime/alternate-weapon-kits-data.mjs';
import {registerAlternateWeaponKits} from '../../splatoon3/runtime/alternate-weapon-kits.mjs';
import {applyShotGuide} from '../../splatoon3/runtime/weapons-fidelity.mjs';
import {selectedSub,selectedSubCost} from '../../splatoon3/runtime/kit-composition.mjs';
import {chargerScopeFactor} from '../../../inkwave-public/src/game/chargerTuning.js';
import {updateSplatlingStages} from '../splatling-reticle.mjs';
import {installWeaponReticlePresentation} from '../weapon-reticle-installer.mjs';
import {installSplatlingReticleCorners} from '../splatling-reticle-corners.mjs';
import {installDraftChargerDecoration,css as chargerCss} from '../charger-decoration-prototype.mjs';
import {installDualiesDiagonalPrototype,DUALIES_DIAGONAL_PROTOTYPE_CSS as dualiesCss} from '../dualies-diagonal-prototype.mjs';
import {installEvidenceSlosherDiagonal} from '../slosher-diagonal-installer-prototype.mjs';
import {installEvidenceBlasterDiagonal} from '../blaster-diagonal-installer-prototype.mjs';
import {pencilLoadedReticleEligible} from '../pencil-loaded-visibility-proposal.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const compose=rel=>adaptBuildSource(rel,fs.readFileSync(path.join(root,'inkwave-public',rel),'utf8'));
const source=compose('src/ui/hud.js'),css=compose('styles/hud.css'),ast=parse(source,{sourceType:'module',ecmaVersion:'latest'});
// Reuse display plumbing, never copied production HUD/charge/visibility logic.
const dom=fs.readFileSync(new URL('./splatling-reticle-corners.test.mjs',import.meta.url),'utf8');
const start=dom.indexOf('class Style {'),end=dom.indexOf('const runtime=',start);
assert(start>=0&&end>start);
const {Element}=Function('assert',dom.slice(start,end)+'return {Element};')(assert);
Object.defineProperty(Element.prototype,'dataset',{get(){return this._dataset ||= {};}});
Element.prototype.getAttribute=function(name){return this.attrs[name]??null;};
Element.prototype.setAttribute=function(name,value){this.attrs[name]=String(value);if(name==='class')this.className=String(value);};
Element.prototype.removeAttribute=function(name){delete this.attrs[name];};
const deepFreeze=o=>{if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.freeze(o);for(const v of Object.values(o))deepFreeze(v);}return o;};
// Native base definitions, recovered source catalog identities, real alternate-kit registrar.
// This fixture does not claim to execute gameplay's complete weapon-registration startup.
const WEAPONS=Object.fromEntries(Object.entries(nativeWeapons).map(([id,w])=>[id,{...w}]));
for(const r of MAIN_WEAPON_CATALOG.records){
  if(r.legacy)Object.assign(WEAPONS[r.id],{behaviorKind:r.family,modelKind:r.modelKind,catalogRecord:r});
  else WEAPONS[r.id]={id:r.id,kind:'catalog',behaviorKind:r.family,modelKind:r.modelKind,catalogRecord:r,
    chargeTime:(r.parameters.WeaponParam?.ChargeFrame??60)/60,sub:'bomb',special:'slam'};
}
const SUB={bomb:{id:'bomb',inkCost:70,name:'Bomb'}},SPECIALS={};
for(const k of ALTERNATE_WEAPON_KITS){SUB[k.sub]={id:k.sub,inkCost:70,name:k.sub};SPECIALS[k.special]={};}
registerAlternateWeaponKits({WEAPONS,WEAPON_ORDER:Object.keys(WEAPONS),SUB,SPECIALS,LANG:'en'});
deepFreeze(WEAPONS);
const registryBefore=JSON.stringify(WEAPONS);
function rig(){
  const runner={charge:0,chargeT:0,charging:false,streaming:false,aimingSub:false,s3Turret:false};
  const actor={alive:true,form:'kid',invuln:0,weaponRunner:runner,weaponId:'shooter',weapon:WEAPONS.shooter};runner.a=actor;
  const G={match:{local:actor},camera:null};
  const values={G,WEAPONS,SUB,SUB_ICONS:{bomb:''},PLAYER:{respawnTime:5},MATCH:{},
    clamp:(x,a=0,b=1)=>Math.min(b,Math.max(a,x)),innerWidth:1280,innerHeight:720,
    applyShotGuide,selectedSub,selectedSubCost,chargerScopeFactor,updateSplatlingStages,
    installWeaponReticlePresentation,installSplatlingReticleCorners,installDraftChargerDecoration,
    installDualiesDiagonalPrototype,installEvidenceSlosherDiagonal,installEvidenceBlasterDiagonal,pencilLoadedReticleEligible,
    specialIcon:()=>'',t:x=>x,on:()=>()=>{},removeEventListener(){},cancelAnimationFrame(){}};
  const bindings={...values};let executable=source;
  for(const n of [...ast.body].reverse()){
    if(n.type==='ImportDeclaration'){
      for(const s of n.specifiers)bindings[s.local.name]=values[s.imported?.name]??(()=>{});
      executable=executable.slice(0,n.start)+executable.slice(n.end);
    }else if(n.type==='ExportNamedDeclaration')executable=executable.slice(0,n.start)+(n.declaration?executable.slice(n.declaration.start):executable.slice(n.end));
  }
  const HUD=Function(...Object.keys(bindings),executable+'\nreturn HUD;')(...Object.values(bindings));
  const h=Object.assign(Object.create(HUD.prototype),{_L:{},_bloom:0,_kick:0,_fxTime:0,_visible:true,_worldPaused:false,
    ret:new Element(),xh:new Element(),spIcon:new Element(),scopeMask:new Element(),shield:new Element(),subChip:new Element(),
    _local:()=>actor,_live:()=>true,_snd(){},_restart(el,name){el.classList.add(name);},_clearReticleFeedback(){}});
  h.subChip.appendChild(new Element('i'));h.subChip.appendChild(new Element('b'));
  const draw=(id,charge=0,extra={})=>{actor.weaponId=id;actor.weapon=WEAPONS[id];h._updCrosshair({weapon:id,charge,crosshair:{spread:18.3,inRange:true,guide:{x:677,y:341}},...extra},1/60);};
  const state=()=>JSON.stringify({actor:{...actor,weaponRunner:undefined},runner:{...runner,a:undefined}});
  return {h,actor,runner,draw,state};
}
const slosher=h=>h.ret.querySelector('.iw-reticle-slosher-diagonal-proposal');
const blaster=h=>h.ret.querySelector('.iw-reticle-blaster-diagonal-proposal');
const marked=h=>h.ret.classList.contains('iw-reticle-dualies-diagonal-prototype');
const rings=h=>h.ret.querySelectorAll('.iw-ret__ring');

test('fully composed HUD installs all next-owner hooks once and includes exact scoped CSS',()=>{
  for(const name of ['installDraftChargerDecoration','installDualiesDiagonalPrototype','installEvidenceSlosherDiagonal','installEvidenceBlasterDiagonal']){
    assert.equal(ast.body.filter(n=>n.type==='ExpressionStatement'&&n.expression?.callee?.name===name).length,1,name);
  }
  assert.equal(css.split(chargerCss).length-1,1);assert.equal(css.split(dualiesCss).length-1,1);
  assert.match(chargerCss,/data-charger-shape="bamboo"/);assert.match(chargerCss,/data-charger-shape="pencil"/);
  assert(!chargerCss.includes('iw-ret__charge'),'decoration CSS does not suppress charge handle');
  assert.equal((dualiesCss.match(/nth-child\(/g)||[]).length,4);
  assert.match(source,/const retIdle = .*pencilLoadedReticleEligible\(this,w,WEAPONS\)/);
});

test('actual updater allows only exact Slosher, Hot Blaster and Splat Dualies IDs, not whole families/kits',()=>{
  const f=rig(),seen={slosher:[],blaster:[],dualies:[]};
  for(const [id,w] of Object.entries(WEAPONS)){
    if(!['slosher','blaster','dualies'].includes(w.behaviorKind||w.kind))continue;
    f.draw(id);
    if(slosher(f.h))seen.slosher.push(id);if(blaster(f.h))seen.blaster.push(id);if(marked(f.h))seen.dualies.push(id);
    assert.equal(!!slosher(f.h),['slosher','slosher-01'].includes(id),id);
    assert.equal(!!blaster(f.h),id==='blaster',id);
    assert.equal(marked(f.h),id==='dualies',id);
  }
  assert.deepEqual(seen,{slosher:['slosher','slosher-01'],blaster:['blaster'],dualies:['dualies']});
  assert.equal(JSON.stringify(WEAPONS),registryBefore);
});

test('Slosher tick display ownership restores detached old nodes after switching and same-kind rebuild',()=>{
  const f=rig();f.draw('slosher');
  for(const next of ['shooter','slosher-01']){
    const old=f.h.ret.querySelectorAll('.iw-ret__tick');assert.equal(old.length,4);
    assert(old.every(n=>n.style.getPropertyValue('display')==='none'));
    if(next==='shooter')f.draw(next);else f.h._buildReticle('slosher');
    assert(old.every(n=>n.style.getPropertyValue('display')===''),'previous native displays restored');
    assert(old.every(n=>!f.h.ret.contains(n)));
    f.draw('slosher');
  }
  const nodes=[...f.h.ret.children],state=f.state();for(let i=0;i<30;i++)f.draw('slosher');
  assert.deepEqual(f.h.ret.children,nodes);assert.equal(f.state(),state);
});

test('Hot Blaster retains native inner-circle identity at r13 and restores r9/outer display on switch/rebuild',()=>{
  const f=rig();f.draw('blaster');
  for(const rebuild of [false,true]){
    const [outer,inner]=rings(f.h);assert.equal(inner.getAttribute('r'),'13');assert.equal(outer.getAttribute('r'),'23');
    assert.equal(outer.style.getPropertyValue('display'),'none');const nodes=[...f.h.ret.children],before=f.state();
    for(let i=0;i<30;i++)f.draw('blaster');
    assert.equal(rings(f.h)[1],inner);assert.deepEqual(f.h.ret.children,nodes);assert.equal(f.state(),before);
    if(rebuild)f.h._buildReticle('blaster');else f.draw('s3-blaster-long');
    assert.equal(inner.getAttribute('r'),'9');assert.equal(outer.style.getPropertyValue('display'),'');assert(!f.h.ret.contains(inner));
    f.draw('shooter');f.draw('blaster');
  }
});

test('Dualies merged radius13 requires native is-lock AND strict s3Turret; twins stay raw6.2 through unlock/rebuild/switch',()=>{
  const f=rig();f.draw('dualies');let merged=f.h.ret.querySelector('.iw-ret__merged');const twins=[...f.h._twin];
  assert.equal(merged.getAttribute('r'),'6.2');
  for(const [turret,radius] of [[true,'13'],[false,'6.2'],[1,'6.2'],[true,'13']]){
    f.runner.s3Turret=turret;const before=f.state();f.draw('dualies');
    assert.equal(merged.getAttribute('r'),radius);assert.equal(f.h.ret.classList.contains('is-lock'),!!turret);
    assert(twins.every(n=>n.getAttribute('r')==='6.2'));assert.deepEqual(f.h._twin,twins);assert.equal(f.state(),before);
  }
  // Keep native cached lock=true but remove its class: prototype must not invent lock.
  f.h.ret.classList.remove('is-lock');f.draw('dualies');assert.equal(merged.getAttribute('r'),'6.2');
  f.h._L.lock=null;f.draw('dualies');assert.equal(merged.getAttribute('r'),'13');
  f.h._buildReticle('dualies');assert.equal(merged.getAttribute('r'),'6.2');assert(!f.h.ret.contains(merged));
  f.h._L.lock=null;f.draw('dualies');merged=f.h.ret.querySelector('.iw-ret__merged');assert.equal(merged.getAttribute('r'),'13');
  f.draw('dualies-01');assert.equal(merged.getAttribute('r'),'6.2');assert(!marked(f.h));
  assert(f.h._twin.every(n=>n.getAttribute('r')==='6.2'));
});

test('Bamboo/Pencil decoration preserves native charge handles, gauge/full lifecycle, rebuild and unsupported cleanup',()=>{
  const f=rig();
  for(const [id,shape] of [['s3-charger-light','bamboo'],['s3-charger-pencil','pencil']]){
    f.draw(id);const handle=f.h._chargeEl;assert.equal(f.h.ret.dataset.chargerShape,shape);
    assert.equal(handle.getAttribute('r'),'25');assert(f.h.ret.contains(handle));const nodes=[...f.h.ret.children];
    for(const [charge,visible,full] of [[0,false,false],[.5,true,false],[1,true,true]]){
      Object.assign(f.runner,{charging:charge>0,charge,chargeT:charge});const before=f.state();f.draw(id,charge);
      assert.equal(f.h._chargeEl,handle);assert.equal(f.h._L.charge,charge);assert.equal(Number(handle.style.strokeDashoffset),f.h._chargeC*(1-charge));
      assert.equal(f.h.ret.classList.contains('is-charging'),visible);assert.equal(f.h.ret.classList.contains('is-full'),full);
      assert.deepEqual(f.h.ret.children,nodes);assert.equal(f.state(),before);
    }
    f.h.ret.innerHTML='';f.draw(id,1);assert.notEqual(f.h._chargeEl,handle);assert(f.h.ret.contains(f.h._chargeEl));assert.equal(f.h.ret.dataset.chargerShape,shape);
    f.draw('charger');assert.equal(f.h.ret.dataset.chargerShape,undefined);
    Object.assign(f.runner,{charging:false,charge:0,chargeT:0});
  }
  f.draw('s3-charger-pencil-01');assert.equal(f.h.ret.dataset.chargerShape,'pencil');
  f.draw('shooter');assert.equal(f.h.ret.dataset.chargerShape,undefined);
});

function loadPencil(f,rounds){
  Object.assign(f.runner,{charging:false,streaming:false,charge:0,chargeT:0,aimingSub:false,catalogState:{id:'s3-charger-pencil',chargeF:0,rounds,pending:false,stored:false}});
}
test('Pencil loaded rounds1..4 relax only native zero-charge idle gate, never gauge/full or gameplay state',()=>{
  const f=rig();
  for(const id of ['s3-charger-pencil','s3-charger-pencil-01'])for(const rounds of [0,1,2,3,4,5]){
    loadPencil(f,rounds);f.draw(id,0);const handle=f.h._chargeEl,before=f.state();f.draw(id,0);
    assert.equal(f.h.ret.classList.contains('is-idle'),rounds===0||rounds===5,id+'/'+rounds);
    assert.equal(f.h._L.charge,0);assert.equal(f.h.ret.style.getPropertyValue('--ch'),'0.000');
    assert.equal(Number(handle.style.strokeDashoffset),f.h._chargeC);assert(!f.h.ret.classList.contains('is-full'));assert(!f.h.ret.classList.contains('is-charging'));
    assert.equal(f.state(),before,'HUD never consumes rounds, charge, ink, or action state');
  }
  assert.equal(JSON.stringify(WEAPONS),registryBefore);
});

test('Pencil loaded visibility honors no-active-action, strict live/identity gates and native squid visibility',()=>{
  const changes=[
    ['sub aim',f=>f.runner.aimingSub=true],['charging',f=>f.runner.charging=true],['streaming',f=>f.runner.streaming=true],
    ['pending',f=>f.runner.catalogState.pending=true],['stored',f=>f.runner.catalogState.stored=true],
    ['chargeF',f=>f.runner.catalogState.chargeF=1],['charge',f=>f.runner.charge=.1],['wrong source',f=>f.runner.catalogState.id='charger'],
    ['dead',f=>f.actor.alive=false],['special',f=>f.actor.specialActive=true],['jump',f=>f.actor.superJumpState={}],
    ['squid',f=>f.actor.form='squid'],['hidden HUD',f=>f.h._visible=false],['world paused',f=>f.h._worldPaused=true],
    ['not live',f=>f.h._live=()=>false],['detached runner actor',f=>f.runner.a={}],
    ['actor-local weapon copy',f=>f.actor.weapon={...WEAPONS['s3-charger-pencil']}],
  ];
  for(const [label,change] of changes){
    const f=rig();loadPencil(f,2);f.draw('s3-charger-pencil',0);assert(!f.h.ret.classList.contains('is-idle'));
    change(f);const before=f.state();
    // Direct update preserves deliberately mismatched actor identity for the negative gate case.
    f.h._updCrosshair({weapon:'s3-charger-pencil',charge:0,crosshair:{spread:18.3,inRange:true}},1/60);
    assert(f.h.ret.classList.contains('is-idle'),label);assert.equal(f.state(),before,label+' state remains owned by gameplay');
    if(label==='squid')assert.equal(f.h.ret.style.visibility,'hidden');
  }
  const f=rig();loadPencil(f,2);f.draw('s3-charger-pencil');f.actor.form='squid';f.draw('s3-charger-pencil');assert.equal(f.h.ret.style.visibility,'hidden');
  f.actor.form='kid';f.draw('s3-charger-pencil');assert.equal(f.h.ret.style.visibility,'');assert(!f.h.ret.classList.contains('is-idle'));
});
