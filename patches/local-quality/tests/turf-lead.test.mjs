// Actual composed HUD and native UI maths; display nodes and the FX clock are fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import os from 'node:os';
import {inspectTurfLeadScene,probeTurfLead} from '../../../scripts/lib/inkwave-turf-lead-probe.mjs';
import {pathToFileURL} from 'node:url';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptSource} from '../../splatoon3/adapter.mjs';
import {adaptTouchLayout} from '../../touch-layout/adapter.mjs';
import {adaptReliability} from '../../reliability/adapter.mjs';
import {adaptQualitySource,replaceOnce,qualityIdentity} from '../adapter.mjs';
import {adaptTurfLead} from '../turf-lead-adapter.mjs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';

const ROOT=new URL('../../../',import.meta.url),read=rel=>fs.readFileSync(new URL('inkwave-public/'+rel,ROOT),'utf8');
const site=process.env.INKWAVE_TURF_LEAD_SITE;
const minify=process.env.INKWAVE_TURF_LEAD_MINIFY==='1';
const transform=minify?(await import(process.env.ESBUILD_MODULE?pathToFileURL(process.env.ESBUILD_MODULE).href:'esbuild')).transformSync:null;
class El {
  constructor(tag='div') {
    this.tag=tag;this.children=[];this.dataset={};this.style={setProperty(k,v){this[k]=v;}};this.names=new Set();this.parts=new Map();
    this.classList={add:(...ns)=>ns.forEach(n=>this.names.add(n)),remove:(...ns)=>ns.forEach(n=>this.names.delete(n)),toggle:(n,on)=>on?this.names.add(n):this.names.delete(n),contains:n=>this.names.has(n)};
  }
  set className(s){this.names=new Set(s.split(/\s+/).filter(Boolean));} get className(){return [...this.names].join(' ');}
  set innerHTML(s){this.html=s;this.parts.clear();} get innerHTML(){return this.html||'';}
  appendChild(c){c.parentNode=this;this.children.push(c);return c;} setAttribute(k,v){this[k]=v;} addEventListener(){} remove(){} animate(){return{};}
  prepend(...cs){for(const c of cs.reverse()){c.parentNode=this;this.children.unshift(c);}}
  get firstChild(){return this.children[0];}
  get textContent(){return this.text??this.children.map(c=>c.textContent||'').join('');} set textContent(s){this.text=String(s);this.children=[];}
  get offsetWidth(){return 1000;}
  querySelectorAll(selector){const names=selector.split('.').filter(Boolean),out=[];for(const c of this.children){if(names.every(n=>c.names?.has(n)))out.push(c);if(c.querySelectorAll)out.push(...c.querySelectorAll(selector));}return out;}
  querySelector(selector){const found=this.querySelectorAll(selector)[0];if(found)return found;if(!this.parts.has(selector))this.parts.set(selector,new El());return this.parts.get(selector);}
}
async function fixture({baseline=false}={}) {
  const bus=new Map();const on=(n,fn)=>{if(!bus.has(n))bus.set(n,new Set());bus.get(n).add(fn);return()=>bus.get(n).delete(fn);};const emit=(n,e)=>{for(const fn of bus.get(n)||[])fn(e);};
  const G={settings:{},match:null,actors:[],teamHex:['#f80','#08f'],audio:{play(){}},rig:{dioLook:{x:0,y:0}}};
  const context=vm.createContext({console,performance,Math,innerWidth:1000,innerHeight:700,setTimeout:()=>0,document:{body:new El(),createElement:tag=>new El(tag),createTextNode:text=>({textContent:text})}});
  const config=new vm.SourceTextModule(read('src/config.js'),{context});await config.link(()=>{throw Error('config dependency');});await config.evaluate();
  const translate=s=>s,i18n=new vm.SyntheticModule(['tx','isJa'],function(){this.setExport('tx',translate);this.setExport('isJa',()=>false);},{context});
  const util=new vm.SourceTextModule(site&&!baseline?fs.readFileSync(path.join(site,'src/ui/ui-util.js'),'utf8'):read('src/ui/ui-util.js'),{context});await util.link(()=>i18n);await util.evaluate();
  const values={G,on,t:translate,...config.namespace,...THREE,GLYPHS:{},SUB_ICONS:{},weaponIcon:x=>x,specialIcon:x=>x,keycap:x=>x,richText:x=>x};
  async function load(rel){
    let code=baseline?adaptSource(rel,read(rel)):site?fs.readFileSync(path.join(site,rel),'utf8'):adaptQualitySource(rel,adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,read(rel)))));
    if(minify)code=transform(code,{loader:'js',format:'esm',minify:true}).code;
    const imports=new Map();for(const n of parse(code,{ecmaVersion:'latest',sourceType:'module'}).body)if(n.type==='ImportDeclaration'){
      if(!imports.has(n.source.value))imports.set(n.source.value,new Set());
      for(const s of n.specifiers)if(s.type==='ImportNamespaceSpecifier')Object.keys(THREE).forEach(k=>imports.get(n.source.value).add(k));else imports.get(n.source.value).add(s.imported?.name||'default');
    }
    const mod=new vm.SourceTextModule(code,{context});await mod.link(spec=>spec==='./ui-util.js'?util:new vm.SyntheticModule([...imports.get(spec)],function(){for(const k of imports.get(spec))this.setExport(k,k in values?values[k]:()=>{});},{context}));await mod.evaluate();return mod.namespace;
  }
  const {HUD}=await load('src/ui/hud.js'),{Match}=await load('src/game/match.js');
  const hud=()=>Object.assign(Object.create(HUD.prototype),{_L:{},_fxTime:0,el:new El(),splatLayer:new El(),_kills:{lastKiller:null},map:new El(),mapCursor:new El(),mapJumpLine:new El(),_mapT:1,_map:{open:false,hover:-1,cx:.5,cy:.5,pressT:0},beacons:Array.from({length:4},()=>{const e=new El();e.appendChild(new El());return e;}),legendRows:Array.from({length:4},()=>new El()),_snd(){},_restart(){},_addFx(_name,fn){this.fx=fn;}});
  const actor=(name,team=0)=>({name,team,alive:true,weaponId:'shooter',pos:new THREE.Vector3(),respawnTimer:0,canSuperJump:()=>true,superJump(){this.jumps=(this.jumps||0)+1;return true;}});
  G.camera=new THREE.PerspectiveCamera(60,1,.1,100);G.camera.position.set(0,8,15);G.camera.lookAt(0,0,0);G.camera.updateMatrixWorld();G.level={spawnPads:[new THREE.Vector3(-5,0,0),new THREE.Vector3(5,0,0)]};G.game={minimap:{w:100,h:100,toCanvas(x,z,out){out.x=50+x;out.y=50+z;}}};
  return {G,hud,actor,Match,emit};
}
async function rig(baseline=false){
 const f=await fixture({baseline}),h=f.hud();h.squads=[new El(),new El()];h.squads.forEach(s=>{for(let i=0;i<4;i++)s.appendChild(new El());});
 let coverage=[0,0],reads=0;f.G.paint={coverage(){reads++;return coverage;}};
 const actors=Array.from({length:8},(_,i)=>Object.assign(f.actor('P'+i,i<4?0:1),{specialReady:()=>false,isLocal:i===0}));
 const m=Object.assign(Object.create(f.Match.prototype),{actors,mode:'turf',state:'playing',attract:false,local:actors[0]});f.G.match=m;f.G.actors=actors;f.G.local=m.local;f.G.mode='match';
 const view=t=>{actors.forEach(a=>a.isLocal=false);m.local=actors[t*4];m.local.isLocal=true;f.G.local=m.local;};
 const tick=(pair,viewer=0)=>{coverage=pair;view(viewer);const teams=m.teamSummary();if(viewer===1)teams.reverse();h._updSquads(teams);return teams;};
 return {...f,h,m,actors,tick,view,reads:()=>reads};
}
const status=h=>h.squads.map(s=>s.classList.contains('is-turf-danger')?-1:s.classList.contains('is-turf-leading')?1:0);

test('negative control reproduces absent lead/Danger despite opposite large live leads',async()=>{
 const f=await rig(true);for(const c of [[.6,.2],[.2,.6],[.4,.4]]){const teams=f.tick(c);assert.equal(teams[0].leading,undefined);assert.deepEqual(status(f.h),[0,0]);}assert.equal(f.reads(),0);
});
test('#99/#748 10-point threshold, neutral denominator and reversal follow physical teams at both viewer sides',async()=>{
 const f=await rig();for(const viewer of [0,1])for(const [coverage,expected]of [[[.3,.2],[1,-1]],[[.2,.3],[-1,1]],[[.3-1e-8,.2],[0,0]],[[.1,.09],[0,0]],[[.45,.15],[1,-1]],[[.25,.25],[0,0]],[[0,0],[0,0]]]){
  const copy=[...coverage],teams=f.tick(coverage,viewer);assert.deepEqual(status(f.h),viewer?[...expected].reverse():expected);assert.deepEqual(coverage,copy,'HUD reads never alter authoritative coverage');
  assert(teams.every(t=>typeof t.leading==='boolean'&&typeof t.danger==='boolean'));assert(teams.every(t=>!('coverage'in t)&&!('percent'in t)));
  for(let t=0;t<2;t++)assert.equal(f.h.squads[t].dataset.turfAlert,status(f.h)[t]===-1?'Danger!':'');
 }
});
for(const hz of [30,60,120])test(`#99/#748 ${hz}Hz lead changes bypass unchanged player-slot cache and preserve native status`,async()=>{
 const f=await rig();f.tick([.2,.2]);const before=f.h._L.sq00;for(let i=0;i<hz;i++){f.tick(i%2?[.6,.2]:[.2,.6]);assert.deepEqual(status(f.h),i%2?[1,-1]:[-1,1]);assert.equal(f.h._L.sq00,before);}
 f.actors[0].alive=false;f.actors[0].respawnTimer=3;f.actors[1].specialReady=()=>true;f.tick([.6,.2]);const slots=f.h.squads[0].children;assert(slots[0].classList.contains('is-dead'));assert.equal(slots[0].querySelector('.iw-sq__n').textContent,'3');assert(slots[1].classList.contains('is-ready'));assert.equal(slots.length,4);
 f.actors[0].alive=true;f.tick([.4,.4]);assert.deepEqual(status(f.h),[0,0]);assert.equal(slots[0].classList.contains('is-dead'),false);
});
test('Boss/attract/non-playing or invalid coverage produces no stale live Turf status',async()=>{
 const f=await rig();for(const mode of ['boss','intro','finish','judge','attract']){
  f.m.mode='turf';f.m.state='playing';f.m.attract=false;f.tick([.6,.2]);const before=f.reads();
  if(mode==='boss')f.m.mode='boss';else if(mode==='attract')f.m.attract=true;else f.m.state=mode;
  f.tick([.2,.6]);assert.deepEqual(status(f.h),[0,0],mode);assert.equal(f.reads(),before,'non-live mode never samples paint');
 }
 f.m.mode='turf';f.m.state='playing';f.m.attract=false;
 for(const c of [null,[],[NaN,.2],[Infinity,0],[-.1,.3],[.8,.6],{length:2,0:.6,1:.2}]){f.tick(c);assert.deepEqual(status(f.h),[0,0]);}
});
test('intro and finish/judge bus events clear flags without requiring a later HUD frame',async()=>{
 const f=await rig(),h=f.h;Object.assign(h,{kcards:new El(),callouts:new El(),tpops:new El(),downLayer:new El(),turfNum:new El(),_dd:[],boss:{setMode(){}},_lineup(){}});h._bindBus();
 for(const state of ['intro','finish','judge']){f.tick([.6,.2]);f.emit('match:state',{state,match:f.m});assert.deepEqual(status(h),[0,0]);assert(h.squads.every(s=>s.dataset.turfAlert===''));}
 f.tick([.6,.2]);h._updSquads([]);assert.deepEqual(status(h),[0,0],'old lab/minimal payload clears a prior live lead');
});
test('equivalent offline and follower paint inputs agree without requiring a protocol field',async()=>{
 const f=await rig();for(const follower of [false,true]){f.m.follower=follower;f.G.netm=follower?{}:null;f.tick([.18,.42],1);assert.deepEqual(status(f.h),[1,-1]);}
});
test('presentation anchors fail closed, CSS has a bounded emphasis, and scoring stays untouched',()=>{
 for(const rel of ['src/game/match.js','src/ui/hud.js','styles/hud.css','src/i18n.js']){const raw=read(rel),out=adaptTurfLead(rel,raw,replaceOnce);assert.throws(()=>adaptTurfLead(rel,'',replaceOnce),/conflict/);assert.throws(()=>adaptTurfLead(rel,raw+raw,replaceOnce),/conflict/);assert.throws(()=>adaptTurfLead(rel,out,replaceOnce),/conflict/);}
 const css=adaptTurfLead('styles/hud.css',read('styles/hud.css'),replaceOnce);assert.match(css,/\.iw-squad\.is-turf-leading \{ transform: scale\(1\.08\); \}/);assert.match(css,/content: attr\(data-turf-alert\)/);assert.match(css,/\.iw-squad\.is-turf-danger::after \{ display: block;/);
 assert.equal(adaptTurfLead('src/world/paint.js',read('src/world/paint.js'),replaceOnce),read('src/world/paint.js'));assert(qualityIdentity()['turf-lead-adapter.mjs']);
});

test('actual localisation renders Japanese and English Danger labels for keyboard and touch',async()=>{
 for(const lang of ['ja','en']){
  const context=vm.createContext({console,localStorage:{getItem:()=>JSON.stringify({lang})},document:{documentElement:{}}});
  const config=new vm.SourceTextModule(read('src/config.js'),{context});await config.link(()=>{throw Error('config dependency');});await config.evaluate();
  let code=site?fs.readFileSync(path.join(site,'src/i18n.js'),'utf8'):adaptQualitySource('src/i18n.js',adaptReliability('src/i18n.js',adaptTouchLayout('src/i18n.js',adaptSource('src/i18n.js',read('src/i18n.js')))));
  if(minify)code=transform(code,{loader:'js',format:'esm',minify:true}).code;
  const mod=new vm.SourceTextModule(code,{context});await mod.link(spec=>spec==='./config.js'?config:spec==='./core/device.js'?new vm.SyntheticModule(['touchPrimary'],function(){this.setExport('touchPrimary',false);},{context}):new vm.SyntheticModule([],()=>{},{context}));await mod.evaluate();
  for(const input of ['kbm','touch']){mod.namespace.setTextMode(input);assert.equal(mod.namespace.t('Danger!'),lang==='ja'?'ピンチ!':'Danger!');}
 }
});

test('existing UI suite invokes controlled browser probe, captures both viewports, and restores ownership',()=>{
 const script=fs.readFileSync(new URL('scripts/check-inkwave-browser.mjs',ROOT),'utf8'),probe=fs.readFileSync(new URL('scripts/lib/inkwave-turf-lead-probe.mjs',ROOT),'utf8');
 assert.match(script,/result\.turfLead = await probeTurfLead\(page, evidence\)/);
 for(const text of ['width:1280','width:375',"['ahead'","['behind'","['below'","['tie'",'g._updateHud(0)','getComputedStyle(el,\'::after\')','finally','turfLeadProof.restore()','page.setViewportSize(viewport)'])assert(probe.includes(text),text);
 assert(!/\.counts\s*=|\.turfTotal\s*=|\.team\s*=(?!=)/.test(probe),'browser fixture must not overwrite ownership cells or physical teams');
 assert(probe.includes('for (const viewer of [0,1])'));assert(probe.includes('g.match.local = local; G.local = globalLocal; g.match.state = state;'));assert(probe.includes('Range combat-bar suppression changed'));assert(probe.includes('Finish snapshot retained Turf lead'));
});

// The exact browser-serialized inspector is executed against controlled CSS
// observations here. These are verifier-negative tests, not rendered pixels.
function visibilityFixture(){
 const style=(extra={})=>({display:'flex',visibility:'visible',opacity:'1',transform:'none',...extra});
 const parent={style:style(),parentElement:null},classes=names=>({contains:n=>names.includes(n)});
 const squads=[0,1].map(i=>({parentElement:parent,style:style({transform:i?'none':'scale'}),alert:style({display:i?'block':'none',content:'"Danger!"',left:'40px',top:'35px',width:'40px',height:'15px',boxSizing:'border-box'}),dataset:{turfAlert:i?'Danger!':''},classList:classes([i?'is-turf-danger':'is-turf-leading']),children:[{},{},{},{}],querySelectorAll:()=>[],getBoundingClientRect:()=>({x:i?130:10,y:10,left:i?130:10,right:i?210:90,top:10,bottom:30,width:80,height:20})}));
 const actors=[{team:0,alive:true,isLocal:true},{team:1,alive:true,isLocal:false}],oldCoverage=()=>[.4,.4],paint=Object.create({coverage:oldCoverage});
 const g={frozen:true,match:{mode:'turf',state:'playing',actors,local:actors[0]},hud:{squads,timer:{getBoundingClientRect:()=>({left:100,right:120})}},R:{render(){}},_updateHud(){}};
 const G={game:g,paint,local:actors[0]},ctx=vm.createContext({s3ProbeG:G,turfLeadProof:{pair:[]},innerWidth:375,innerHeight:812,getComputedStyle:(el,pseudo)=>pseudo?el.alert:el.style,DOMMatrixReadOnly:class{constructor(){this.a=1.08;this.e=0;this.f=0;}}});
 const inspect=()=>vm.runInContext(`(${inspectTurfLeadScene.toString()})({name:'ahead',pair:[.6,.2],viewer:0})`,ctx);
 return{ctx,G,g,squads,parent,oldCoverage,inspect};
}
test('browser inspector rejects invisible ancestors, squads, Danger labels and offscreen labels',()=>{
 const f=visibilityFixture();assert.equal(f.inspect().squads.length,2);
 for(const [object,key,value] of [[f.parent.style,'visibility','hidden'],[f.parent.style,'opacity','0'],[f.parent.style,'display','none'],[f.squads[0].style,'visibility','hidden'],[f.squads[1].alert,'visibility','hidden'],[f.squads[1].alert,'opacity','0'],[f.squads[1].alert,'left','400px']]){
  const old=object[key];object[key]=value;assert.throws(()=>f.inspect(),/not visibly presented|not visible/,key+'='+value);object[key]=old;
 }
 assert.equal(f.inspect().squads.length,2);
});
test('browser probe saves the failed controlled scene and phase before restoring state and viewport',async()=>{
 const f=visibilityFixture(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-turf-probe-negative-')),saved={coverage:f.G.paint.coverage,local:f.g.match.local,flags:f.g.match.actors.map(a=>a.isLocal)},calls=[];
 f.parent.style.opacity='0';
 const page={viewportSize:()=>({width:900,height:600}),setViewportSize:async v=>{calls.push(['viewport',v.width]);f.ctx.innerWidth=v.width;f.ctx.innerHeight=v.height;},evaluate:async(fn,arg)=>{f.ctx.arg=arg;return vm.runInContext(`(${fn.toString()})(arg)`,f.ctx);},screenshot:async opts=>{calls.push(['screenshot',f.G.paint.coverage!==saved.coverage,opts.path]);}};
 await assert.rejects(()=>probeTurfLead(page,dir),/not visibly presented/);
 const receipt=JSON.parse(fs.readFileSync(path.join(dir,'turf-lead-failure.json'),'utf8'));
 assert.equal(receipt.phase.name,'ahead');assert.equal(receipt.phase.viewer,0);assert.equal(receipt.rows.length,0);assert.equal(receipt.screenshot,'turf-lead-failure.png');assert(calls.some(c=>c[0]==='screenshot'&&c[1]===true),'capture must precede restoring controlled coverage');
 assert.equal(f.G.paint.coverage,saved.coverage);assert.equal(Object.hasOwn(f.G.paint,'coverage'),false);assert.equal(f.g.match.local,saved.local);assert.deepEqual(f.g.match.actors.map(a=>a.isLocal),saved.flags);assert.equal(f.g.match.state,'playing');assert.equal(f.ctx.turfLeadProof,undefined);assert.equal(calls.at(-1)[1],900);
});
