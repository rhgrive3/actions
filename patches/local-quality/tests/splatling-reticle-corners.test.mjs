// Real composed native builder and CSS, DOM doubles only. No browser/render parity claim.
// In an isolated review artifact, set INKWAVE_RETICLE_BASELINE_ROOT to a verified full source tree.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {installSplatlingReticleCorners as install, SPLATLING_RETICLE_CORNER_CSS} from '../splatling-reticle-corners.mjs';

const root=process.env.INKWAVE_RETICLE_BASELINE_ROOT || fileURLToPath(new URL('../../../',import.meta.url));
assert(fs.existsSync(path.join(root,'scripts/inkwave-source-composition.mjs')),
  'set INKWAVE_RETICLE_BASELINE_ROOT to the verified official source fixture');
const {adaptBuildSource}=await import(pathToFileURL(path.join(root,'scripts/inkwave-source-composition.mjs')));
const compose=rel=>adaptBuildSource(rel,fs.readFileSync(path.join(root,'inkwave-public',rel),'utf8'));
const css=compose('styles/hud.css'),hudSource=compose('src/ui/hud.js');
const a=hudSource.indexOf('  _buildReticle(kind) {'),b=hudSource.indexOf('\n  _updCrosshair(f, dt) {',a);
assert(a>=0&&b>a,'actual composed native builder boundaries');
const Native=Function('return class {'+hudSource.slice(a,b)+'}')();

class Style {
  constructor(onWrite=()=>{}){this.values=new Map();this.priorities=new Map();this.writes=[];this.onWrite=onWrite;}
  setProperty(name,value,priority=''){this.writes.push([name,String(value),priority]);this.values.set(name,String(value));this.priorities.set(name,priority);this.onWrite();}
  getPropertyValue(name){return this.values.get(name)||'';}
  getPropertyPriority(name){return this.priorities.get(name)||'';}
  removeProperty(name){this.writes.push([name,null]);const old=this.getPropertyValue(name);this.values.delete(name);this.priorities.delete(name);this.onWrite();return old;}
}
class Element {
  constructor(tag='div'){
    this.tagName=tag;this.children=[];this.parentNode=null;this.attrs={};
    this.style=new Style(()=>{this.attrs.style=[...this.style.values].map(([name,value])=>name+': '+value+';').join(' ');});
    this.names=new Set();this.classWrites=[];this.insertions=0;this.assignments=0;
    this.classList={contains:n=>this.names.has(n),add:(...ns)=>{this.classWrites.push(['add',...ns]);ns.forEach(n=>this.names.add(n));},
      remove:(...ns)=>{this.classWrites.push(['remove',...ns]);ns.forEach(n=>this.names.delete(n));},
      toggle:(n,on)=>{if(on===undefined)on=!this.names.has(n);on?this.names.add(n):this.names.delete(n);return on;}};
  }
  set className(value){this.names=new Set(value.split(/\s+/).filter(Boolean));}
  get className(){return [...this.names].join(' ');}
  appendChild(node){node.parentNode=this;this.children.push(node);return node;}
  remove(){if(this.parentNode){const p=this.parentNode;p.children.splice(p.children.indexOf(this),1);this.parentNode=null;}}
  get lastElementChild(){return this.children.at(-1)||null;}
  contains(node){return node===this||this.children.some(child=>child.contains(node));}
  querySelectorAll(selector){const matches=node=>selector.startsWith('.')?selector.slice(1).split('.').every(n=>node.names.has(n)):node.tagName===selector;
    const out=[];for(const child of this.children){if(matches(child))out.push(child);out.push(...child.querySelectorAll(selector));}return out;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  set innerHTML(html){this.assignments++;for(const c of this.children)c.parentNode=null;this.children=[];this._html=html;parse(html,this);}
  get innerHTML(){return this._html||'';}
  insertAdjacentHTML(where,html){assert.equal(where,'beforeend');this.insertions++;parse(html,this);}
}
function parse(html,root){
  const stack=[root];for(const token of html.matchAll(/<(\/?)([a-z][a-z0-9-]*)([^>]*?)(\/?)>/gi)){
    if(token[1]){assert(stack.length>1);stack.pop();continue;}
    const node=new Element(token[2]);
    for(const attr of token[3].matchAll(/([\w:-]+)="([^"]*)"/g)){
      node.attrs[attr[1]]=attr[2];if(attr[1]==='class')node.className=attr[2];
      if(attr[1]==='style')for(const part of attr[2].split(';')){const at=part.indexOf(':');if(at>0)node.style.setProperty(part.slice(0,at).trim(),part.slice(at+1).trim());}
    }
    // Parsing an attribute retains its exact raw bytes; only subsequent CSSOM
    // writes serialize declaration spacing, as browsers do.
    const rawStyle=token[3].match(/(?:^|\s)style="([^"]*)"/);
    if(rawStyle)node.attrs.style=rawStyle[1];
    stack.at(-1).appendChild(node);if(!token[4])stack.push(node);
  }
  assert.equal(stack.length,1,'balanced native/new SVG markup');
}
const runtime=path.join(root,'patches/splatoon3/runtime');
const {MAIN_WEAPON_CATALOG}=await import(pathToFileURL(path.join(runtime,'main-weapon-catalog-data.mjs')));
const {ALTERNATE_WEAPON_KITS}=await import(pathToFileURL(path.join(runtime,'alternate-weapon-kits-data.mjs')));
const {registerAlternateWeaponKits}=await import(pathToFileURL(path.join(runtime,'alternate-weapon-kits.mjs')));
const {updateSplatlingStages}=await import(pathToFileURL(path.join(root,'patches/local-quality/splatling-reticle.mjs')));
const records=MAIN_WEAPON_CATALOG.records;
const spinners=records.filter(r=>r.family==='splatling');
const deepFreeze=object=>{
  if(object&&typeof object==='object'&&!Object.isFrozen(object)){
    Object.freeze(object);for(const value of Object.values(object))deepFreeze(value);
  }
  return object;
};
const weapons={},SUB={},SPECIALS={};
for(const record of records)weapons[record.id]={id:record.id,kind:record.legacy||'catalog',
  behaviorKind:record.family,modelKind:record.modelKind,catalogRecord:record};
for(const kit of ALTERNATE_WEAPON_KITS){SUB[kit.sub]={};SPECIALS[kit.special]={};}
registerAlternateWeaponKits({WEAPONS:weapons,WEAPON_ORDER:Object.keys(weapons),SUB,SPECIALS,LANG:'en'});
deepFreeze(weapons);
const paths={'315deg':'M1 19V8L8 1H19','45deg':'M19 19V8L12 1H1',
  '135deg':'M19 1V12L12 19H1','225deg':'M1 1V12L8 19H19'};
function fixture({registry=weapons,nativeEdit}={}){
  const calls=[];
  class HUD {
    _buildReticle(...args){calls.push({method:'build',self:this,args});
      Native.prototype._buildReticle.apply(this,args);
      nativeEdit?.(this);
      this.native={children:[...this.ret.children],charge:this._chargeEl,
        second:this._chargeSecond,chargeC:this._chargeC,classes:this.ret.className,
        ticks:this.ret.querySelectorAll('.iw-ret__tick').map(element=>({element,
          styles:new Map(element.style.values),writes:element.style.writes.length,rawStyle:element.attrs.style,classWrites:element.classWrites.length}))};
      return this.buildResult;
    }
    _updCrosshair(...args){calls.push({method:'update',self:this,args});this.nativeUpdate?.(...args);return this.updateResult;}
  }
  const nativeUpdate=HUD.prototype._updCrosshair;
  install(HUD,registry);
  const h=new HUD();Object.assign(h,{ret:new Element(),_L:{},buildResult:{build:true},updateResult:{update:true}});
  h.ret.style.setProperty('translate','37px -19px');h.ret.style.setProperty('--sp','18.3');
  const build=(id,kind='splatling')=>{h._L.weapon=id;return h._buildReticle(kind);};
  const corners=()=>h.ret.querySelectorAll('.iw-ret__splatling-corner');
  return{HUD,h,calls,build,corners,nativeUpdate};
}

test('fixture is real composed Splatling CSS, with native 20px translated boxes and angle selectors',()=>{
  assert.equal(SPLATLING_RETICLE_CORNER_CSS,'.iw-ret.iw-ret--splatling .iw-ret__tick.iw-reticle-splatling-chamfer { border-width: 0; }');
  const base=css.match(/\.iw-ret--splatling \.iw-ret__tick \{([^}]+)\}/)?.[1];
  assert(base);assert.match(base,/left: -10px; top: -10px; width: 20px; height: 20px; box-sizing: border-box/);
  assert.match(base,/transform: translate\(var\(--iw-cx\), var\(--iw-cy\)\)/);
  assert.match(base,/--iw-x: calc\(58px \+ var\(--sp, 0\) \* 0\.7071px\)/);
  assert.match(base,/--iw-y: calc\(40px \+ var\(--sp, 0\) \* 0\.7071px\)/);
  const sides={'315deg':['top','left'],'45deg':['top','right'],'135deg':['bottom','right'],'225deg':['bottom','left']};
  for(const [angle,borders]of Object.entries(sides)){
    const rule=css.match(new RegExp('\\.iw-ret--splatling \\.iw-ret__tick\\[style\\*="--a:'+angle+'"\\] \\{([^}]+)\\}'))?.[1];
    assert(rule,angle);assert.match(rule,/--iw-cx:/);assert.match(rule,/--iw-cy:/);
    for(const side of borders)assert(rule.includes('border-'+side+'-width: 2px'));
  }
});

test('all six real Splatling base records and registered alternate kits get only four correctly ordered chamfers',()=>{
  assert.deepEqual(spinners.map(r=>r.id).sort(),['s3-spinner-downpour','s3-spinner-hyper','s3-spinner-hypershort',
    's3-spinner-quick','s3-spinner-serein','splatling']);
  const selected=Object.entries(weapons).filter(([,w])=>w.catalogRecord.family==='splatling');
  assert(selected.length>spinners.length,'actual alternate registration is covered');
  const before=JSON.stringify(weapons);
  for(const [id]of selected){
    const f=fixture();f.build(id);assert.equal(f.corners().length,4,id);
    assert.deepEqual(f.h.ret.children,f.h.native.children,'original direct children/order retained');
    assert.equal(f.h.ret.className,f.h.native.classes);
    assert.equal(f.h._chargeEl,f.h.native.charge);assert.equal(f.h._chargeSecond,f.h.native.second);
    assert.equal(f.h._chargeC,f.h.native.chargeC);assert(f.h.ret.contains(f.h._chargeEl));assert(f.h.ret.contains(f.h._chargeSecond));
    assert.deepEqual(f.h.native.ticks.map(t=>t.element.style.getPropertyValue('--a')),['45deg','135deg','225deg','315deg']);
    for(const {element:tick,styles,writes,rawStyle,classWrites}of f.h.native.ticks){
      assert.equal(tick.children.length,1);assert.equal(tick.style.writes.length,writes);
      assert.equal(tick.attrs.style,rawStyle,'literal native quadrant selector survives CSSOM serialization hazard');
      assert.equal(tick.style.getPropertyValue('border-width'),'');
      assert.deepEqual(tick.style.values,styles);
      assert(tick.classList.contains('iw-reticle-splatling-chamfer'));
      assert.equal(tick.classWrites.length,classWrites+1);
      const svg=tick.children[0],p=svg.children[0];
      assert.equal(svg.attrs.viewBox,'0 0 20 20');assert.equal(svg.attrs.width,'20');assert.equal(svg.attrs.height,'20');
      assert.equal(svg.attrs['aria-hidden'],'true');assert.equal(svg.attrs.focusable,'false');
      assert.equal(svg.style.getPropertyValue('transform'),'');assert(!svg.classList.contains('iw-ret__svg'));
      assert.equal(p.attrs.d,paths[tick.style.getPropertyValue('--a')]);
      assert.equal(p.attrs.fill,'none');assert.equal(p.attrs.stroke,'currentColor');assert.equal(p.attrs['stroke-width'],'2');
      assert.equal(p.attrs['stroke-linecap'],'square');
    }
    assert.equal(f.h.ret.children[0].children.length,0,'dot untouched');
    assert.equal(f.h.ret.children[1].style.writes.length,0,'charge-ring SVG style untouched');
    assert.equal(f.h.ret.style.getPropertyValue('translate'),'37px -19px');assert.equal(f.h.ret.style.getPropertyValue('--sp'),'18.3');
  }
  assert.equal(JSON.stringify(weapons),before,'no source/catalog/kit mutation');
});

test('two native charge handles, fixed-tick stage owner and visibility work unchanged through first/full/stream',()=>{
  const {h,build,HUD,nativeUpdate,corners}=fixture();build('s3-spinner-hyper');
  const handles=[h._chargeEl,h._chargeSecond],art=corners(),weapon=weapons['s3-spinner-hyper'];
  assert.equal(HUD.prototype._updCrosshair,nativeUpdate,'no per-frame wrapper');
  const runner={charging:true,charge:0,streaming:false};const before=JSON.stringify(weapon);
  h.nativeUpdate=(charge,visibility)=>{updateSplatlingStages(h,charge,runner,weapon);h.ret.style.setProperty('visibility',visibility);};
  const ratio=weapon.catalogRecord.parameters.WeaponParam.ChargeFrame_First/weapon.catalogRecord.parameters.WeaponParam.ChargeFrame_Second;
  for(const [charge,offsets]of [[0,['100.00','100.00']],[ratio,['0.00','100.00']],[1,['0.00','0.00']]]){
    h._updCrosshair(charge,'hidden');assert.equal(h._chargeEl,handles[0]);assert.equal(h._chargeSecond,handles[1]);
    assert.deepEqual(handles.map(n=>n.style.strokeDashoffset),offsets);assert.equal(h.ret.style.getPropertyValue('visibility'),'hidden');
    assert.deepEqual(corners(),art);
  }
  const p=weapon.catalogRecord.parameters,seconds=(p.WeaponFullChargeParam?.MaxShootingFrame_Second??p.WeaponParam.MaxShootingFrame_Second)/60;
  Object.assign(runner,{charging:false,streaming:true,catalogState:{streamTime:seconds,streamElapsed:seconds}});
  const frozenRunner=deepFreeze(runner);h._updCrosshair(0,'');
  assert.equal(runner,frozenRunner);assert.deepEqual(handles.map(n=>n.style.strokeDashoffset),['100.00','100.00']);
  assert.equal(JSON.stringify(weapon),before);assert.deepEqual(corners(),art);
});

test('native rebuild retires old corners/handles; unsupported/direct mismatch and unknown registry stay untouched',()=>{
  const f=fixture();f.build('splatling');const old=[...f.corners(),f.h._chargeEl,f.h._chargeSecond];
  const shooter=records.find(r=>r.family==='shooter').id;f.build(shooter,'shooter');
  assert.equal(f.corners().length,0);for(const node of old)assert(!f.h.ret.contains(node));
  f.build('splatling');assert.equal(f.corners().length,4);
  for(const [id,kind]of [['missing','splatling'],['__proto__','splatling'],[shooter,'splatling'],['splatling','shooter'],['splatling',undefined]]){
    const g=fixture();g.h._L.weapon=id;g.h._buildReticle(kind);assert.equal(g.corners().length,0,id+'/'+kind);
    for(const {element,styles,writes}of g.h.native.ticks){assert.equal(element.children.length,0);assert.deepEqual(element.style.values,styles);assert.equal(element.style.writes.length,writes);}
  }
  const inherited=Object.create({splatling:weapons.splatling}),g=fixture({registry:inherited});g.build('splatling');assert.equal(g.corners().length,0);
});

test('quadrants follow inline native angles even if tick order changes; malformed markup fails closed',()=>{
  const f=fixture({nativeEdit:h=>{const ticks=h.ret.querySelectorAll('.iw-ret__tick');for(const tick of ticks)tick.remove();
    for(const i of [3,1,0,2])h.ret.appendChild(ticks[i]);}});f.build('splatling');
  for(const tick of f.h.ret.querySelectorAll('.iw-ret__tick'))assert.equal(tick.children[0].children[0].attrs.d,paths[tick.style.getPropertyValue('--a')]);
  for(const edit of [h=>h.ret.querySelectorAll('.iw-ret__tick')[0].style.setProperty('--a','0deg'),
    h=>h.ret.querySelectorAll('.iw-ret__tick')[0].style.setProperty('--a','__proto__'),
    h=>h.ret.querySelectorAll('.iw-ret__tick')[0].style.setProperty('--a','135deg'),
    h=>h.ret.querySelectorAll('.iw-ret__tick')[0].remove()]){
    const g=fixture({nativeEdit:edit});g.build('splatling');assert.equal(g.corners().length,0);
    assert(g.h.ret.querySelectorAll('.iw-ret__tick').every(n=>n.style.getPropertyValue('border-width')===''));
  }
});

test('installation is idempotent/build-only, preserves this/args/results and native exceptions',()=>{
  const f=fixture(),build=f.HUD.prototype._buildReticle,update=f.HUD.prototype._updCrosshair;
  install(f.HUD,weapons);assert.equal(f.HUD.prototype._buildReticle,build);assert.equal(f.HUD.prototype._updCrosshair,update);
  f.h._L.weapon='splatling';const extra={tag:true};assert.equal(f.h._buildReticle('splatling',extra),f.h.buildResult);
  assert.equal(f.h._updCrosshair(extra,1/120),f.h.updateResult);assert.equal(f.calls.length,2);
  assert(f.calls.every(c=>c.self===f.h));assert.deepEqual(f.calls[0].args,['splatling',extra]);assert.deepEqual(f.calls[1].args,[extra,1/120]);
  class Broken{_buildReticle(){throw extra;}}install(Broken,weapons);assert.throws(()=>new Broken()._buildReticle('splatling'),e=>e===extra);
  assert.doesNotThrow(()=>install(null,weapons));assert.doesNotThrow(()=>install(class{},null));
  assert.throws(()=>install(class{},weapons),/native HUD builder/);
});

test('steady frames add zero decoration work and contain no frame, clock, listener or gameplay owner',()=>{
  const f=fixture();f.build('splatling');const nodes=[f.h.ret,...f.h.ret.children,...f.corners()];
  const before=nodes.map(n=>[n,n.style.writes.length,n.insertions,n.assignments]);
  for(let frame=0;frame<1000;frame++)f.h._updCrosshair({weapon:'splatling'},1/120);
  for(const [n,writes,inserts,assigns]of before){assert.equal(n.style.writes.length,writes);assert.equal(n.insertions,inserts);assert.equal(n.assignments,assigns);}
  const source=fs.readFileSync(new URL('../splatling-reticle-corners.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/_updCrosshair|Math\.random|Date\.|performance\.|addEventListener|setTimeout|setInterval|\.raycast\(|\.sweep\(/);
});

// This double deliberately models the observed browser CSSOM failure mode;
// Integration QA must additionally verify selector resolution in a real browser.
test('CSSOM-aware fixture reproduces raw-style selector loss, while class-only decoration avoids it',()=>{
  const tick=new Element('i');parse('<i class="iw-ret__tick" style="--a:315deg"></i>',tick);
  const node=tick.children[0];assert.equal(node.attrs.style,'--a:315deg');
  node.style.setProperty('border-width','0');
  assert.equal(node.attrs.style,'--a: 315deg; border-width: 0;');
  assert(!node.attrs.style.includes('--a:315deg'),'the former implementation breaks the native selector');
  const f=fixture();f.build('splatling');
  for(const {element,rawStyle,writes}of f.h.native.ticks){
    assert.equal(element.attrs.style,rawStyle);assert(element.attrs.style.includes('--a:'+element.style.getPropertyValue('--a')));
    assert.equal(element.style.writes.length,writes);assert(element.classList.contains('iw-reticle-splatling-chamfer'));
  }
});

test('corner border suppression outranks native quadrant border widths even when composed first',()=>{
  const selector=SPLATLING_RETICLE_CORNER_CSS.split('{')[0];
  const specificity=s=>(s.match(/\.[a-z_-][\w-]*|\[[^\]]+\]/gi)||[]).length;
  assert.equal(specificity(selector),4);
  const nativeRules=[...css.matchAll(/(\.iw-ret--splatling \.iw-ret__tick\[style\*="--a:[^"]+"\]) \{([^}]+)\}/g)];
  assert.equal(nativeRules.length,4);
  for(const [,nativeSelector,declarations]of nativeRules){
    assert.match(declarations,/border-(?:top|right|bottom|left)-width: 2px/);
    assert.equal(specificity(nativeSelector),3);
    assert(specificity(selector)>specificity(nativeSelector),'zero border wins regardless of source order');
  }
});
