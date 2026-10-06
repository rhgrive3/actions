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
import {adaptMapTeammateStatus} from '../map-teammate-status-adapter.mjs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';

const ROOT=new URL('../../../',import.meta.url),read=rel=>fs.readFileSync(new URL('inkwave-public/'+rel,ROOT),'utf8');
const site=process.env.INKWAVE_MAP_STATUS_SITE;
const minify=process.env.INKWAVE_MAP_STATUS_MINIFY==='1';
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
  const G={settings:{},match:null,actors:[],teamHex:['#f80','#08f'],audio:{play(){}},rig:{dioLook:{x:0,y:0}}};
  const context=vm.createContext({console,performance,Math,innerWidth:1000,innerHeight:700,setTimeout:()=>0,document:{body:new El(),createElement:tag=>new El(tag),createTextNode:text=>({textContent:text})}});
  const config=new vm.SourceTextModule(read('src/config.js'),{context});await config.link(()=>{throw Error('config dependency');});await config.evaluate();
  const translate=s=>s,i18n=new vm.SyntheticModule(['tx','isJa'],function(){this.setExport('tx',translate);this.setExport('isJa',()=>false);},{context});
  const util=new vm.SourceTextModule(site&&!baseline?fs.readFileSync(path.join(site,'src/ui/ui-util.js'),'utf8'):read('src/ui/ui-util.js'),{context});await util.link(()=>i18n);await util.evaluate();
  const values={G,on:()=>()=>{},t:translate,...config.namespace,...THREE,GLYPHS:{},SUB_ICONS:{},weaponIcon:x=>x,specialIcon:x=>x,keycap:x=>x,richText:x=>x};
  async function load(rel){
    let code=baseline?adaptSource(rel,read(rel)):site?fs.readFileSync(path.join(site,rel),'utf8'):adaptQualitySource(rel,adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,read(rel)))));
    if(minify)code=transform(code,{loader:'js',format:'esm',minify:true}).code;
    const imports=new Map();for(const n of parse(code,{ecmaVersion:'latest',sourceType:'module'}).body)if(n.type==='ImportDeclaration'){
      if(!imports.has(n.source.value))imports.set(n.source.value,new Set());
      for(const s of n.specifiers)if(s.type==='ImportNamespaceSpecifier')Object.keys(THREE).forEach(k=>imports.get(n.source.value).add(k));else imports.get(n.source.value).add(s.imported?.name||'default');
    }
    const mod=new vm.SourceTextModule(code,{context});await mod.link(spec=>spec==='./ui-util.js'?util:new vm.SyntheticModule([...imports.get(spec)],function(){for(const k of imports.get(spec))this.setExport(k,k in values?values[k]:()=>{});},{context}));await mod.evaluate();return mod.namespace;
  }
  const {HUD}=await load('src/ui/hud.js'),{DioramaOverlay}=await load('src/ui/diorama.js');
  const hud=()=>Object.assign(Object.create(HUD.prototype),{_L:{},_fxTime:0,el:new El(),splatLayer:new El(),_kills:{lastKiller:null},map:new El(),mapCursor:new El(),mapJumpLine:new El(),_mapT:1,_map:{open:false,hover:-1,cx:.5,cy:.5,pressT:0},beacons:Array.from({length:4},()=>{const e=new El();e.appendChild(new El());return e;}),legendRows:Array.from({length:4},()=>new El()),_snd(){},_restart(){},_addFx(_name,fn){this.fx=fn;}});
  const actor=(name,team=0)=>({name,team,alive:true,weaponId:'shooter',pos:new THREE.Vector3(),respawnTimer:0,canSuperJump:()=>true,superJump(){this.jumps=(this.jumps||0)+1;return true;}});
  G.camera=new THREE.PerspectiveCamera(60,1,.1,100);G.camera.position.set(0,8,15);G.camera.lookAt(0,0,0);G.camera.updateMatrixWorld();G.level={spawnPads:[new THREE.Vector3(-5,0,0),new THREE.Vector3(5,0,0)]};G.game={minimap:{w:100,h:100,toCanvas(x,z,out){out.x=50+x;out.y=50+z;}}};
  return {G,hud,actor,DioramaOverlay};
}
function team(f,side=0,remote=false){const me=f.actor('Local',side),ally=f.actor('Ally',side),enemy=f.actor('Enemy',1-side);ally.remote=remote;ally.alive=false;ally.respawnTimer=5.2;enemy.respawnTimer=99;f.G.match={local:me};f.G.actors=[me,ally,enemy];return {me,ally,enemy};}
function labels(h){return [h.beacons[0].querySelector('.iw-bcn__label b').textContent,h.legendRows[0].querySelector('.iw-lg__st').textContent];}

test('negative control exposes exact teammate seconds through both native map renderers',async()=>{
 const f=await fixture({baseline:true}),{ally}=team(f),h=f.hud(),d=new f.DioramaOverlay(new El());h._updBeacons(600,400,1/60);d.update(1/60,1);assert.equal(h._beaconTargets()[0].respawn,6);assert.deepEqual(labels(h),['Ally · 6','6s']);assert.equal(d.pins[0].state.textContent,'6');assert.equal(ally.respawnTimer,5.2);
});
for(const hz of [30,60,120])test(`#718 ${hz}Hz local/remote and either team keep map status qualitative`,async()=>{
 for(const side of [0,1])for(const remote of [false,true]){
  const f=await fixture(),{ally}=team(f,side,remote),h=f.hud(),d=new f.DioramaOverlay(new El());
  // Both map paths must avoid even reading the clock, not merely hide its text.
  Object.defineProperty(ally,'respawnTimer',{get(){throw Error('teammate clock reached map presentation');}});
  for(let i=0;i<6;i++){h._updBeacons(600,400,1/hz);d.update(1/hz,1);const b=h._beaconTargets()[0];assert.equal('respawn'in b,false);assert.equal(b.dead,true);assert.equal(b.ok,false);assert.deepEqual(labels(h),['Ally · ×','×']);assert.equal(d.pins[0].state.textContent,'×');assert.equal(d.pins[0].ok,false);}
 }
});
test('respawn and ongoing super jump update target availability without changing admission',async()=>{
 const f=await fixture(),{me,ally}=team(f),h=f.hud(),d=new f.DioramaOverlay(new El());
 const tick=()=>{h._updBeacons(600,400,1/60);d.update(1/60,1);};tick();h._jumpTo(0);d._jump(0,me);assert.equal(me.jumps||0,0);
 ally.alive=true;ally.superJumpState={phase:'flight'};tick();assert.deepEqual(labels(h),['Ally · …','BUSY']);assert.equal(d.pins[0].state.textContent,'↑');h._jumpTo(0);d._jump(0,me);assert.equal(me.jumps||0,0);
 ally.superJumpState=null;tick();assert.deepEqual(labels(h),['Ally','READY']);assert.equal(d.pins[0].state.textContent,'');assert.equal(d.pins[0].ok,true);h._jumpTo(0);d._jump(0,me);assert.equal(me.jumps,2);
});
test('legacy/lab payload with numeric seconds cannot leak through beacon or legend rendering',async()=>{
 const f=await fixture(),h=f.hud();h.lab={beacons:[{x:.4,y:.4,name:'Ally',weapon:'shooter',ok:false,respawn:42,dead:true},null,null,null]};h._updBeacons(600,400,1/60);assert.deepEqual(labels(h),['Ally · ×','×']);const key=h.beacons[0]._key;h.lab.beacons[0].respawn=7;h._updBeacons(600,400,1/60);assert.equal(h.beacons[0]._key,key);delete h.lab.beacons[0].dead;h._updBeacons(600,400,1/60);assert.deepEqual(labels(h),['Ally · …','BUSY']);
});
test('own native respawn countdown remains numeric and independent from teammate map status',async()=>{
 const f=await fixture(),h=f.hud();team(f);h.showSplatted({respawn:4.2});assert.equal(h._splatted.num.textContent,'5');h._fxTime=1.3;h.fx();assert.equal(h._splatted.num.textContent,'3');h._fxTime=4.3;h.fx();assert.equal(h._splatted.num.textContent,'GO');
});
test('fail-closed anchors and identity; own countdown, squad HUD and jump functions are byte-preserved',()=>{
 const methods=(code)=>{const klass=parse(code,{ecmaVersion:'latest',sourceType:'module'}).body.find(n=>n.type==='ExportNamedDeclaration'&&n.declaration?.type==='ClassDeclaration').declaration;return Object.fromEntries(klass.body.body.filter(n=>n.type==='MethodDefinition').map(n=>[n.key.name,code.slice(n.start,n.end)]));};
 for(const rel of ['src/ui/hud.js','src/ui/diorama.js']){const raw=read(rel),next=adaptMapTeammateStatus(rel,raw,replaceOnce);assert.throws(()=>adaptMapTeammateStatus(rel,'',replaceOnce),/conflict/);assert.throws(()=>adaptMapTeammateStatus(rel,raw+raw,replaceOnce),/conflict/);assert.throws(()=>adaptMapTeammateStatus(rel,next,replaceOnce),/conflict/);const a=methods(raw),b=methods(next);for(const name of rel.endsWith('hud.js')?['showSplatted','hideSplatted','_updSquads','_jumpTo']:['_jump'])assert.equal(b[name],a[name]);}
 assert(qualityIdentity()['map-teammate-status-adapter.mjs']);assert.equal(adaptMapTeammateStatus('src/game/actor.js','unchanged',replaceOnce),'unchanged');
});
