import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';

export async function practiceFixture(root,lang='en') {
  const runtime=path.join(root,'patches/splatoon3/runtime');
  const {MAIN_WEAPON_CATALOG}=await import(pathToFileURL(path.join(runtime,'main-weapon-catalog-data.mjs')));
  const {ALTERNATE_WEAPON_KITS}=await import(pathToFileURL(path.join(runtime,'alternate-weapon-kits-data.mjs')));
  const bases=new Map(MAIN_WEAPON_CATALOG.records.map(w=>[w.id,w]));
  const entries=[...MAIN_WEAPON_CATALOG.records,...ALTERNATE_WEAPON_KITS.map(w=>({...w,family:bases.get(w.baseId).family}))];
  const WEAPONS=Object.fromEntries(entries.map(w=>[w.id,{...w,name:w.names[lang],class:w.family,sub:'bomb',special:'special'}]));
  class Element {
    constructor(tag,props={},...children){this.tagName=tag;this.children=[];this.dataset={};this.events={};this.parentElement=null;this.attributes={};this._class='';this._text='';this.hidden=false;this.isConnected=true;this.scrollTop=0;this.scrollHeight=1000;this.clientHeight=300;this.offsetTop=100;this.style={setProperty(){}};
      this.classList={contains:x=>this._class.split(/\s+/).includes(x),add:(...xs)=>{this._class=[...new Set([...this._class.split(/\s+/),...xs])].filter(Boolean).join(' ')},remove:x=>{this._class=this._class.split(/\s+/).filter(y=>y!==x).join(' ')},toggle:(x,on)=>{const yes=on??!this.classList.contains(x);if(yes)this.classList.add(x);else this.classList.remove(x);return yes;}};
      for(const[k,v]of Object.entries(props||{})){if(k==='class')this.className=v;else if(k==='style')Object.assign(this.style,v);else if(k.startsWith('data-'))this.dataset[k.slice(5)]=v;else this[k]=v;}this.append(...children);
    }
    set className(v){this._class=v}get className(){return this._class}
    set textContent(v){this._text=String(v);this.children=[]}get textContent(){return this._text+this.children.map(c=>typeof c==='string'?c:c.textContent).join('')}
    set innerHTML(v){this._text='';this.children=[]}get innerHTML(){return this.textContent}
    append(...xs){for(const x of xs.flat(Infinity)){if(x==null||x===false)continue;this.children.push(x);if(typeof x==='object')x.parentElement=this;}}
    appendChild(x){this.append(x);return x}
    addEventListener(k,fn){this.events[k]=fn}
    setAttribute(k,v){this.attributes[k]=String(v)}
    contains(el){for(let p=el;p;p=p.parentElement)if(p===this)return true;return false}
    matches(s){if(s.startsWith('.'))return s.slice(1).split('.').every(c=>this.classList.contains(c));if(/^\[data-[\w-]+\]$/.test(s))return Object.hasOwn(this.dataset,s.slice(6,-1));return this.tagName===s;}
    querySelectorAll(selector){const tokens=selector.trim().split(/\s+/),out=[];const visit=el=>{for(const c of el.children){if(typeof c!=='object')continue;if(c.matches(tokens.at(-1))){let p=c.parentElement,i=tokens.length-2;while(i>=0&&p){if(p.matches(tokens[i]))i--;p=p.parentElement;}if(i<0)out.push(c);}visit(c);}};visit(this);return out;}
    querySelector(s){return this.querySelectorAll(s)[0]||null}
    closest(s){for(let e=this;e;e=e.parentElement)if(e.matches(s))return e;return null}
    scrollIntoView(){this.scrolled=true}
  }
  const h=(tag,props,...children)=>new Element(tag,props,...children),calls=[];
  const session={local:{weaponId:'shooter'},movingTargets:false,setWeapon(id){calls.push({kind:'equip',id});this.local.weaponId=id},setMovingTargets(on){this.movingTargets=on},travel(id){calls.push({kind:'travel',id})}};
  const G={match:{range:session,attract:false}};
  const raw=fs.readFileSync(path.join(root,'patches/practice-range/runtime/menu.mjs'),'utf8');
  const start=raw.indexOf("const TABS = ['tools', 'travel', 'weapon'];"),end=raw.indexOf('\nexport function installRangeMenus',start);
  const create=vm.runInNewContext(raw.slice(start,end)+'; rangePause;', {h,G,WEAPONS,WEAPON_ORDER:entries.map(w=>w.id),SUB:{bomb:{name:'Bomb'}},SPECIALS:{special:{name:'Special'}},SUB_ICONS:{},GLYPHS:{},weaponIcon:()=>'',specialIcon:()=>'',padGlyph:()=>'',L:x=>x,safeCall:fn=>fn(),requestAnimationFrame:fn=>fn(),ZONE_ORDER:['lane'],ZONES:{lane:{accent:'#123',letter:'A',name:'Lane',ja:'レーン'}},zoneName:id=>id,SUB_TEXT:{lane:'Lane'}});
  const menus={_input:'touch',_focus:null,current:'pause',bindings:new Map(),api:{quitMatch(){calls.push({kind:'quit'})}},_sfx(){},_fx(){},_resume(){calls.push({kind:'resume'})},_go(screen){calls.push({kind:'go',screen});this.current=screen},_setFocus(el){this._focus=el},_bind(el,opt){el.dataset.id=opt.id;el.dataset.nav=opt.type||'button';this.bindings.set(opt.id,{el,...opt})},_panel:(cls,...children)=>h('div',{class:cls},...children),_header:()=>h('header'),_prompts:()=>h('div',{class:'iw-prompts'},h('span'),h('span',{},h('span',{class:'iw-padg'}))),_openModal(x){this.modal=x},_closeModal(){this.modal=null},show(screen){this.current=screen}};
  menus._btn=opt=>{const el=h('button',{class:opt.cls},opt.label);menus._bind(el,opt);return el;};
  const open=()=>{menus.bindings.clear();menus.current='pause';const screen=create(menus);menus._focus=screen.initial;return screen;};
  const accept=id=>{const b=menus.bindings.get(id);if(!b)throw Error('missing binding '+id);menus._setFocus(b.el);b.accept();};
  return {open,accept,menus,session,calls,WEAPONS,entries,Element,h};
}
