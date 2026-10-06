// Actual composed HUD and native UI maths; display nodes and the FX clock are fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptSource} from '../../splatoon3/adapter.mjs';
import {adaptTouchLayout} from '../../touch-layout/adapter.mjs';
import {adaptReliability} from '../../reliability/adapter.mjs';
import {adaptQualitySource,replaceOnce,qualityIdentity} from '../adapter.mjs';
import {adaptScoreReticle} from '../score-reticle-adapter.mjs';

const ROOT=new URL('../../../',import.meta.url),read=rel=>fs.readFileSync(new URL('inkwave-public/'+rel,ROOT),'utf8');
const site=process.env.INKWAVE_SCORE_RETICLE_SITE;
const minify=process.env.INKWAVE_SCORE_RETICLE_MINIFY==='1';
const transform=minify?(await import(process.env.ESBUILD_MODULE?pathToFileURL(process.env.ESBUILD_MODULE).href:'esbuild')).transformSync:null;
class El {
  constructor(tag='div') {
    this.tag=tag;this.children=[];this.dataset={};this.style={setProperty(k,v){this[k]=v;}};this.names=new Set();this.parts=new Map();
    this.classList={add:(...ns)=>ns.forEach(n=>this.names.add(n)),remove:(...ns)=>ns.forEach(n=>this.names.delete(n)),toggle:(n,on)=>on?this.names.add(n):this.names.delete(n),contains:n=>this.names.has(n)};
  }
  set className(s){this.names=new Set(s.split(/\s+/).filter(Boolean));} get className(){return [...this.names].join(' ');}
  set innerHTML(s){this.html=s;this.parts.clear();} get innerHTML(){return this.html||'';}
  appendChild(c){c.parentNode=this;this.children.push(c);return c;} setAttribute(k,v){this[k]=v;} addEventListener(){} remove(){} animate(){return{};}
  get offsetWidth(){return 1000;}
  querySelectorAll(selector){const names=selector.split('.').filter(Boolean),out=[];for(const c of this.children){if(names.every(n=>c.names?.has(n)))out.push(c);if(c.querySelectorAll)out.push(...c.querySelectorAll(selector));}return out;}
  querySelector(selector){const found=this.querySelectorAll(selector)[0];if(found)return found;if(!this.parts.has(selector))this.parts.set(selector,new El());return this.parts.get(selector);}
}
async function fixture({baseline=false}={}) {
  const G={settings:{},match:null},nodes=[];
  const context=vm.createContext({console,performance,Math,setTimeout:()=>0,tr:(s,p)=>p?s.replace('{team}',p.team):s,document:{createElement:tag=>{const e=new El(tag);nodes.push(e);return e;},createTextNode:text=>({textContent:text})}});
  const config=new vm.SourceTextModule(read('src/config.js'),{context});await config.link(()=>{throw Error('unexpected config dependency');});await config.evaluate();
  const translate=(s,p)=>p?s.replace('{team}',p.team):s;
  const i18n=new vm.SyntheticModule(['tx','isJa'],function(){this.setExport('tx',translate);this.setExport('isJa',()=>false);},{context});
  let utilCode=site&&!baseline?fs.readFileSync(path.join(site,'src/ui/ui-util.js'),'utf8'):read('src/ui/ui-util.js');
  const util=new vm.SourceTextModule(utilCode,{context});await util.link(()=>i18n);await util.evaluate();
  let code=baseline?adaptSource('src/ui/hud.js',read('src/ui/hud.js')):site?fs.readFileSync(path.join(site,'src/ui/hud.js'),'utf8'):adaptQualitySource('src/ui/hud.js',adaptReliability('src/ui/hud.js',adaptTouchLayout('src/ui/hud.js',adaptSource('src/ui/hud.js',read('src/ui/hud.js')))));
  if(minify)code=transform(code,{loader:'js',format:'esm',minify:true}).code;
  const imports=new Map();for(const n of parse(code,{ecmaVersion:'latest',sourceType:'module'}).body)if(n.type==='ImportDeclaration'){if(!imports.has(n.source.value))imports.set(n.source.value,new Set());for(const s of n.specifiers)imports.get(n.source.value).add(s.imported?.name||'default');}
  const values={G,on:()=>()=>{},t:translate,...config.namespace,GLYPHS:{},SUB_ICONS:{},weaponIcon:x=>x,specialIcon:x=>x,keycap:x=>x,richText:x=>x};
  const mod=new vm.SourceTextModule(code,{context});await mod.link(spec=>spec==='./ui-util.js'?util:new vm.SyntheticModule([...imports.get(spec)],function(){for(const k of imports.get(spec))this.setExport(k,k in values?values[k]:()=>{});},{context}));await mod.evaluate();
  const hud=()=>Object.assign(Object.create(mod.namespace.HUD.prototype),{_L:{},_bloom:0,_kick:0,_fxTime:0,overLayer:new El(),ret:new El(),xh:new El(),spIcon:new El(),shield:new El(),subChip:new El(),_snd(){},_restart(){},_addFx(_name,fn){this.fx=fn;}});
  return {G,hud,nodes};
}
function runJudge(h,percents,hz=60,winner=0){
 const promise=h.judge({percents,winner});for(let n=1;n<=Math.ceil(5.2*hz);n++){h._fxTime=n/hz;if(h.fx(1/hz)===false)break;}
 const root=h.overLayer.children.at(-1),bars=root.querySelectorAll('.iw-jd__bar'),nums=root.querySelectorAll('.iw-jd__num');
 return {promise,root,shares:bars.map(b=>Number(b.style.transform.match(/scaleX\(([^)]+)\)/)[1])),labels:nums.map(n=>n.textContent)};
}
const near=(a,b)=>assert(Math.abs(a-b)<.000051,`${a} ~= ${b}`);

test('negative controls reproduce normalized Judd bars and visible swim reticle',async()=>{
 const f=await fixture({baseline:true}),h=f.hud();const j=runJudge(h,[48.9,43.1]);await j.promise;near(j.shares[0],.489/.92);near(j.shares[1],.431/.92);
 f.G.match={local:{form:'squid',alive:true,weaponRunner:{}}};h._updCrosshair({weapon:'shooter'},1/60);assert.notEqual(h.ret.style.visibility,'hidden');
});
for(const hz of [30,60,120])test(`#720 ${hz}Hz reveal preserves team shares, neutral gap, labels and authoritative winner`,async()=>{
 const f=await fixture();for(const [input,expected,winner] of [[[48.9,43.1],[.489,.431],0],[[40,30],[.4,.3],0],[[0,0],[0,0],0],[[0,65],[0,.65],1],[[50,50],[.5,.5],1],[[.489,.431],[.489,.431],0]]){
  const h=f.hud(),j=runJudge(h,input,hz,winner),result=await j.promise;expected.forEach((v,i)=>near(j.shares[i],v));near(1-j.shares[0]-j.shares[1],1-expected[0]-expected[1]);assert.deepEqual(j.labels,expected.map(v=>(v*100).toFixed(1)+'%'));assert.equal(result.winner,winner);
  const neutral=expected[0]+expected[1]<1;for(const e of [...j.root.querySelectorAll('.iw-jd__edge'),j.root.querySelector('.iw-jd__clash')])assert.equal(e.style.visibility,neutral?'hidden':'');
 }
});
for(const hz of [30,60,120])test(`#715 ${hz}Hz native weapon state keeps updating while only the swim reticle is hidden`,async()=>{
 const f=await fixture(),h=f.hud(),actor={form:'kid',alive:true,invuln:1,weaponRunner:{aimingSub:true}};f.G.match={local:actor};
 for(const weapon of ['shooter','blaster','roller','charger','dualies','splatling','slosher']){
  // #572 Charger HUD reads the native runner clock, not the copied HUD charge.
  Object.assign(actor.weaponRunner,{charging:true,chargeT:.2,charge:.2});
  h._updCrosshair({weapon,charge:.2,ink:1,subCost:.7},1/hz);assert.equal(h.ret.style.visibility,'');const shape=h.ret.innerHTML;
  actor.form='squid';Object.assign(actor.weaponRunner,{charging:true,chargeT:1,charge:1});h._updCrosshair({weapon,charge:1,ink:1,subCost:.7},1/hz);assert.equal(h.ret.style.visibility,'hidden');assert.equal(h.ret.innerHTML,shape);assert(h.shield.classList.contains('is-up'));assert(h.subChip.classList.contains('is-on'));
  if(weapon==='charger'||weapon==='splatling')assert.equal(h._L.charge,1);
  actor.form='kid';Object.assign(actor.weaponRunner,{charging:true,chargeT:.1,charge:.1});h._updCrosshair({weapon,charge:.1,ink:1,subCost:.7},1/hz);assert.equal(h.ret.style.visibility,'');assert.equal(h.ret.innerHTML,shape);
 }
 actor.form='squid';for(const weapon of ['charger','shooter','roller']){h._updCrosshair({weapon,charge:1},0);assert.equal(h.ret.style.visibility,'hidden');}
 f.G.match=null;h._updCrosshair({weapon:'shooter'},0);assert.equal(h.ret.style.visibility,'','lab or absent actor recovers visible native reticle');
});
test('anchors fail closed, identity includes adapter, and unrelated modules remain unchanged',()=>{
 const rel='src/ui/hud.js',raw=read(rel);assert.throws(()=>adaptScoreReticle(rel,'',replaceOnce),/conflict/);assert.throws(()=>adaptScoreReticle(rel,raw+raw,replaceOnce),/conflict/);assert.throws(()=>adaptScoreReticle(rel,adaptScoreReticle(rel,raw,replaceOnce),replaceOnce),/conflict/);assert.equal(adaptScoreReticle('src/game/weapons.js','unchanged',replaceOnce),'unchanged');assert(qualityIdentity()['score-reticle-adapter.mjs']);
});
