// Real composed native builder and CSS, DOM doubles only. No browser/render parity claim.
// In an isolated review artifact, set INKWAVE_RETICLE_BASELINE_ROOT to a verified full source tree.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {installWeaponReticlePresentation as install} from '../weapon-reticle-installer.mjs';
import {weaponReticleGeometryState as geometry} from '../weapon-reticle-geometry.mjs';

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
  constructor(){this.values=new Map();this.priorities=new Map();this.writes=[];}
  setProperty(name,value,priority=''){this.writes.push([name,String(value),priority]);this.values.set(name,String(value));this.priorities.set(name,priority);}
  getPropertyValue(name){return this.values.get(name)||'';}
  getPropertyPriority(name){return this.priorities.get(name)||'';}
  removeProperty(name){this.writes.push([name,null]);const old=this.getPropertyValue(name);this.values.delete(name);this.priorities.delete(name);return old;}
}
class Element {
  constructor(tag='div'){
    this.tagName=tag;this.children=[];this.parentNode=null;this.style=new Style();this.attrs={};
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
    stack.at(-1).appendChild(node);if(!token[4])stack.push(node);
  }
  assert.equal(stack.length,1,'balanced native/new SVG markup');
}
const catalog=(family,id)=>({id,kind:'catalog',behaviorKind:family,catalogRecord:{id,family},chargeTime:1});
const weapons=Object.freeze({
  roller:Object.freeze({id:'roller',kind:'roller'}),
  brella:Object.freeze(catalog('brella','brella')),
  wiper:Object.freeze(catalog('splatana','s3-saber-lite')),
  stamper:Object.freeze(catalog('splatana','s3-saber-normal')),
  decavitator:Object.freeze(catalog('splatana','s3-saber-heavy')),
  shooter:Object.freeze({id:'shooter',kind:'shooter'}),
  charger:Object.freeze({id:'charger',kind:'charger'}),
  stringer:Object.freeze(catalog('stringer','stringer')),
});
function fixture({runner={charge:0,charging:false},seedStyles=false}={}){
  const calls=[],actor={alive:true,form:'kid',weaponRunner:runner};
  class HUD {
    _buildReticle(...args){calls.push({method:'build',self:this,args});Native.prototype._buildReticle.apply(this,args);
      if(seedStyles)for(const tick of this.ret.querySelectorAll('.iw-ret__tick')){
        tick.style.setProperty('width','9px','important');tick.style.setProperty('background','red','important');
        tick.style.setProperty('transform','native-transform','important');tick.style.setProperty('--iw-cx','native-x');
      }
      return this.buildResult;
    }
    _updCrosshair(...args){calls.push({method:'update',self:this,args});this.nativeUpdate?.(...args);return this.updateResult;}
  }
  install(HUD,weapons);
  const h=new HUD();Object.assign(h,{ret:new Element(),_L:{},_local:()=>actor,buildResult:{build:true},updateResult:{update:true}});
  h.ret.style.setProperty('translate','37px -19px');h.ret.style.setProperty('--sp','18.3');
  const build=(id,kind)=>{h._L.weapon=id;h._L.kind=kind;return h._buildReticle(kind);};
  const overlay=()=>h.ret.children.filter(c=>c.classList.contains('iw-reticle-presentation-svg'));
  return {HUD,h,actor,runner,calls,build,overlay};
}

test('Brella keeps actual composed Shooter quadrant selectors and original tick indices/order',()=>{
  assert.match(css,/--iw-corner-x:\s*calc\(24px \+ var\(--sp, 0\) \* 1px\)/);
  assert.match(css,/transform:\s*translate\(var\(--iw-cx\), var\(--iw-cy\)\) rotate\(var\(--iw-angle\)\)/);
  const expected=[['-24px','45deg'],['-24px','-45deg'],['24px','-45deg'],['24px','45deg']];
  expected.forEach(([y,angle],i)=>{
    const rule=css.match(new RegExp('\\.iw-ret--shooter \\.iw-ret__tick:nth-child\\('+(i+3)+'\\) \\{([^}]+)\\}'))?.[1];
    assert(rule,'composed nth-child '+(i+3));assert(rule.includes('--iw-cy: '+y));assert(rule.includes('--iw-angle: '+angle));
    assert(rule.includes(i%2===0?'--iw-cx: calc(0px - var(--iw-corner-x))':'--iw-cx: var(--iw-corner-x)'));
  });
  const f=fixture();f.build('brella','shooter');const ticks=f.h.ret.querySelectorAll('.iw-ret__tick');
  assert.equal(ticks.length,4);assert.equal(f.overlay().length,1);
  ticks.forEach((tick,i)=>{assert.equal(f.h.ret.children[i+2],tick);assert.equal(tick.children.length,1);
    assert.equal(tick.style.getPropertyValue('transform'),'');assert.equal(tick.style.getPropertyValue('--iw-cx'),'');
    assert.equal(tick.style.getPropertyValue('--iw-cy'),'');assert.equal(tick.style.getPropertyValue('--iw-angle'),'');
    assert.equal(tick.style.getPropertyValue('display'),'');assert.equal(tick.style.getPropertyValue('width'),'0px');
    assert.match(tick.children[0].style.getPropertyValue('transform'),/rotate\(calc\(0deg - var\(--iw-angle,\s*0deg\)\)\)/);
  });
  assert(f.h.ret.classList.contains('iw-ret--shooter'));assert.equal(f.h.ret.style.getPropertyValue('--sp'),'18.3');
});

test('steady Brella frames reuse all nodes without DOM/style/class writes or authoritative mutations',()=>{
  const runner=Object.freeze({charge:.5,charging:false,catalogState:Object.freeze({id:'brella',canopy:Object.freeze({open:true})})});
  const f=fixture({runner});f.build('brella','shooter');const children=[...f.h.ret.children];
  const nodes=[f.h.ret,...children,...f.h.ret.querySelectorAll('.iw-ret__tick').flatMap(t=>t.children)];
  const before=nodes.map(n=>[n,n.insertions,n.assignments,n.style.writes.length,n.classWrites.length]);
  const gameplay=JSON.stringify({weapons,runner});
  for(let frame=0;frame<1000;frame++)f.h._updCrosshair({weapon:'brella'},1/120);
  assert.deepEqual([...f.h.ret.children],children);
  for(const [n,insertions,assignments,styles,classes]of before){assert.equal(n.insertions,insertions);assert.equal(n.assignments,assignments);assert.equal(n.style.writes.length,styles);assert.equal(n.classWrites.length,classes);}
  assert.equal(JSON.stringify({weapons,runner}),gameplay);assert.equal(f.calls.filter(c=>c.method==='build').length,1);
});

test('deactivation restores native tick and artwork styles including priorities, without rebuilding',()=>{
  const f=fixture({seedStyles:true});f.build('brella','shooter');const ticks=f.h.ret.querySelectorAll('.iw-ret__tick');
  const dot=f.h.ret.children[0],svg=f.h.ret.children[1],assignments=f.h.ret.assignments;
  assert.equal(dot.style.getPropertyValue('display'),'none');assert.equal(svg.style.getPropertyValue('display'),'none');
  f.h._L.weapon='shooter';f.h._updCrosshair({},0);
  assert.equal(f.overlay().length,0);assert.equal(f.h.ret.assignments,assignments);
  assert.equal(dot.style.getPropertyValue('display'),'');assert.equal(svg.style.getPropertyValue('display'),'');
  for(const tick of ticks){assert.equal(tick.children.length,0);assert.equal(tick.style.getPropertyValue('width'),'9px');
    assert.equal(tick.style.getPropertyPriority('width'),'important');assert.equal(tick.style.getPropertyValue('background'),'red');
    assert.equal(tick.style.getPropertyPriority('background'),'important');assert.equal(tick.style.getPropertyValue('left'),'');
    assert.equal(tick.style.getPropertyValue('transform'),'native-transform');assert.equal(tick.style.getPropertyPriority('transform'),'important');
    assert.equal(tick.style.getPropertyValue('--iw-cx'),'native-x');}
});

test('Wiper keeps native charge handle attached through idle/charge/full/release and restores fallback',()=>{
  const f=fixture();f.build('wiper','charger');const charge=f.h._chargeEl,nativeSvg=charge.parentNode;
  assert(f.h.ret.contains(charge));assert.equal(nativeSvg.style.getPropertyValue('display'),'none');
  assert.equal(f.h.ret.classList.contains('iw-ret--charger'),false);assert.equal(f.h._L.kind,'charger');
  f.h.nativeUpdate=()=>{charge.style.setProperty('stroke-dashoffset','42');f.h.ret.classList.add('is-flash');};
  for(const [charging,value,name]of [[true,.5,'charging'],[true,1,'full'],[false,1,'idle']]){
    f.runner.charging=charging;f.runner.charge=value;f.h._updCrosshair({},1/60);
    assert(f.h.ret.contains(charge));assert.equal(f.h._chargeEl,charge);assert.equal(f.overlay().length,1);
    const expected=geometry({family:'splatana',weaponId:'s3-saber-lite',charging,charge:value});
    assert.equal(f.overlay()[0].attrs['data-iw-reticle-presentation-profile'],expected.profileId);
    assert.equal(f.h.ret.classList.contains('is-flash'),false);assert.equal(charge.style.getPropertyValue('stroke-dashoffset'),'42');
  }
  f.h.nativeUpdate=null;f.h._L.weapon='charger';f.h._updCrosshair({},0);
  assert.equal(f.overlay().length,0);assert(f.h.ret.classList.contains('iw-ret--charger'));
  assert.equal(nativeSvg.style.getPropertyValue('display'),'');assert(f.h.ret.contains(charge));
});

test('native rebuild/weapon switch retires old artwork without leaking charger selectors or charge handles',()=>{
  const f=fixture();f.build('wiper','charger');const oldCharge=f.h._chargeEl,oldOverlay=f.overlay()[0];
  f.build('brella','shooter');assert(!f.h.ret.contains(oldCharge));assert(!f.h.ret.contains(oldOverlay));
  assert(f.h.ret.classList.contains('iw-ret--shooter'));assert(!f.h.ret.classList.contains('iw-ret--charger'));
  assert.equal(f.overlay().length,1);assert.equal(f.h.ret.querySelectorAll('.iw-ret__tick').length,4);
  f.build('roller','roller');assert(f.h.ret.classList.contains('iw-ret--roller'));assert.equal(f.overlay().length,1);
});

test('unknown registry, inherited registry keys, unsupported families and direct-kind mismatch stay native',()=>{
  for(const [id,kind]of [['missing','shooter'],['__proto__','shooter'],['stringer','charger'],['decavitator','charger'],['shooter','shooter'],['brella','roller'],['wiper','shooter'],['brella',undefined]]){
    const f=fixture();f.build(id,kind);assert.equal(f.overlay().length,0,id+'/'+kind);
    assert(f.h.ret.children.every(c=>c.style.getPropertyValue('display')!=='none'));
    assert(f.h.ret.querySelectorAll('.iw-ret__tick').every(t=>t.children.length===0));
  }
  const f=fixture();f.h._L.weapon='missing';f.h._local=()=>{throw Error('unknown registry must not read local state');};
  assert.doesNotThrow(()=>f.h._buildReticle('shooter'));
});

test('excluded Decavitator retains original attached charge artwork and charger selectors at every charge state',()=>{
  const f=fixture();f.build('decavitator','charger');const handle=f.h._chargeEl;
  for(const charging of [false,true])for(const charge of [0,.5,1]){
    Object.assign(f.runner,{charging,charge});f.h._updCrosshair({},1/60);
    assert.equal(f.overlay().length,0);assert(f.h.ret.classList.contains('iw-ret--charger'));
    assert.equal(f.h._chargeEl,handle);assert(f.h.ret.contains(handle));
    assert.equal(handle.parentNode.style.getPropertyValue('display'),'');
  }
});

test('active Stamper uses its own profile while retaining its native charge handle',()=>{
  const f=fixture();f.build('stamper','charger');const handle=f.h._chargeEl;
  for(const [charging,charge]of [[false,0],[true,.5],[true,1],[false,1]]){
    Object.assign(f.runner,{charging,charge});f.h._updCrosshair({},1/60);
    assert.equal(f.overlay().length,1);assert.equal(f.overlay()[0].attrs['data-iw-reticle-presentation-profile'],'stamper-reference-720p');
    assert.equal(f.h._chargeEl,handle);assert(f.h.ret.contains(handle));assert(!f.h.ret.classList.contains('iw-ret--charger'));
  }
});

test('installer preserves original this/args/returns and duplicate install does not wrap twice',()=>{
  const f=fixture();const build=f.HUD.prototype._buildReticle,update=f.HUD.prototype._updCrosshair;
  install(f.HUD,weapons);assert.equal(f.HUD.prototype._buildReticle,build);assert.equal(f.HUD.prototype._updCrosshair,update);
  f.h._L.weapon='brella';const extra={marker:true},frame={weapon:'brella'};
  assert.equal(f.h._buildReticle('shooter',extra),f.h.buildResult);
  assert.equal(f.h._updCrosshair(frame,.125,extra),f.h.updateResult);
  assert.equal(f.calls.length,2);assert(f.calls.every(c=>c.self===f.h));
  assert.deepEqual(f.calls[0].args,['shooter',extra]);assert.deepEqual(f.calls[1].args,[frame,.125,extra]);
  assert.equal(f.overlay().length,1);
});

test('native hide/death/squid visibility and HUD translation/spread ownership survive decoration',()=>{
  const f=fixture();f.build('wiper','charger');const hit=new Element(),kill=new Element();
  f.h.hitEl=hit;f.h.killEl=kill;hit.style.setProperty('translate','old-hit');kill.className='is-on';
  for(const visibility of ['hidden','']){
    f.h.nativeUpdate=()=>{f.h.ret.style.setProperty('visibility',visibility);};
    f.h._updCrosshair({},0);assert.equal(f.h.ret.style.getPropertyValue('visibility'),visibility);
    assert.equal(f.h.ret.style.getPropertyValue('translate'),'37px -19px');assert.equal(f.h.ret.style.getPropertyValue('--sp'),'18.3');
    assert.equal(f.h.hitEl,hit);assert.equal(f.h.killEl,kill);assert.equal(hit.style.getPropertyValue('translate'),'old-hit');assert(kill.classList.contains('is-on'));
  }
});
