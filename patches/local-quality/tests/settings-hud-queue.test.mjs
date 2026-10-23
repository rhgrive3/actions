import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import {parse} from '../../loading-cache/vendor/acorn.mjs';import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
const before=JSON.parse(fs.readFileSync(new URL('./fixtures/settings-hud-queue-before.json',import.meta.url)));
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
function current(name){const {file,klass}=before.rows[name],source=adaptBuildSource('src/ui/'+file,fs.readFileSync(new URL('../../../inkwave-public/src/ui/'+file,import.meta.url),'utf8'));const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),nodes=ast.body.map(n=>n.declaration||n);const node=klass?nodes.find(n=>n.type==='ClassDeclaration'&&n.id.name===klass).body.body.find(n=>n.key.name===name):nodes.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);return source.slice(node.start,node.end);}
function compile(name,source,bindings={}){return new Function(...Object.keys(bindings),before.rows[name].klass?'return ({'+source+'}).'+name:source+';return '+name)(...Object.values(bindings));}
function node(){const values={},classes=new Set(),children=new Map(),attrs={},counts={writes:0,queries:0,reads:0};let text='';const style={};Object.defineProperty(style,'transform',{enumerable:true,get:()=>values.transform||'',set:v=>{counts.writes++;values.transform=v;}});return{style,counts,values,classes,attrs,dataset:{},classList:{toggle(k,v){if(v)classes.add(k);else classes.delete(k);}},querySelector(s){counts.queries++;if(!children.has(s))children.set(s,node());return children.get(s);},setAttribute(k,v){attrs[k]=v;},getAttribute(k){counts.reads++;return attrs[k];},get textContent(){return text;},set textContent(v){counts.writes++;text=v;},get firstChild(){return this.querySelector('first');}};}
for(const row of Object.values(before.rows))test('frozen composed UI oracle '+row.file+' has its recorded digest',()=>assert.equal(crypto.createHash('sha256').update(row.source).digest('hex'),row.sha256));
function aim(source){const root=node(),trail=root.querySelector('.iw-pv-aim__trail');trail.attrs.d='M20 90 L300 90';let exp=0;const math=Object.create(Math);math.exp=v=>{exp++;return Math.exp(v);};const factory=compile('previewAimAssist',source,{h:()=>root,frameSVG:x=>x,SQUID:'',K:'#000',clamp,tr:x=>x,Math:math});return{preview:factory({value:0}),root,trail,exp:()=>exp};}
for(const hz of [12,30,60,120])test('actual aim preview retains every SVG frame at '+hz+'Hz without path reads',()=>{
 const a=aim(before.rows.previewAimAssist.source),b=aim(current('previewAimAssist'));
 for(let frame=0;frame<hz*12;frame++){const value=frame<hz*3?0:frame<hz*6?.6:frame<hz*9?1:0;a.preview.set(value);b.preview.set(value);const dt=frame%71===0?.19:1/hz;a.preview.tick(dt);b.preview.tick(dt);assert.deepEqual(b.trail.attrs,a.trail.attrs);assert.deepEqual(b.root.querySelector('.iw-pv-aim__x').attrs,a.root.querySelector('.iw-pv-aim__x').attrs);}
 assert.equal(b.trail.counts.reads,0);assert.ok(a.trail.counts.reads>0);assert.ok(b.exp()<a.exp());
});
function boss(source){const G={camera:null};let point={x:400,y:280,behind:false};const fn=compile('_placeCall',source,{G,innerWidth:800,innerHeight:600});const h={S:{L:{}},_tmp:{},call:node(),callEdge:node(),callArrow:node(),_u:()=>1,_anchor:()=>point,_screen:(p,out)=>Object.assign(out,{x:p.x,y:p.y,behind:!!p.behind}),_b:()=>({pos:{x:40,y:0,z:3},yaw:0})};return{h,frame(p,move,dt){point=p;h.call.dataset.move=move;fn.call(h,dt);}};}
for(const hz of [30,60,120])test('actual boss callout final CSS and edge/charge flags match at '+hz+'Hz',()=>{
 const a=boss(before.rows._placeCall.source),b=boss(current('_placeCall'));
 for(let frame=0;frame<hz*4;frame++){const moving=frame>hz&&frame<hz*2,edge=frame>=hz*2;const p={x:edge?1000:moving?400+frame:400,y:280,behind:frame>hz*3};for(const f of[a,b])f.frame(p,edge?'charge':'slam',1/hz);for(const k of['call','callEdge','callArrow']){assert.deepEqual(b.h[k].values,a.h[k].values);assert.deepEqual([...b.h[k].classes],[...a.h[k].classes]);}}
 assert.ok(b.h.call.counts.writes<a.h.call.counts.writes);assert.ok(b.h.callEdge.counts.writes<a.h.callEdge.counts.writes);
 b.h.call=node();b.frame({x:1000,y:280},'charge',1/hz);assert.ok(b.h.call.values.transform,'replaced element gets its first write');
});
function beacons(source){let targets=[];const fn=compile('_updBeacons',source,{G:{input:null},clamp,weaponIcon:x=>x,kindOf:x=>x,BUBBLER_ICON:'bubbler',richText:x=>x,tr:x=>x});const h={_map:{open:true,hover:-1,pressT:0,sx:null},_L:{},_mapT:1,map:node(),mapCursor:node(),mapLegend:node(),mapJumpLine:node(),lab:true,beacons:[node(),node(),node(),node()],_local:()=>null,_ensureJumpSlots(){},_updLegendRow(){},_beaconTargets:()=>targets};return{h,frame(rows,dt){targets=rows;fn.call(h,600,400,dt,10);}};}
for(const hz of [30,60,120])test('moving beacon text and geometry match without repeated label lookup/write at '+hz+'Hz',()=>{
 const a=beacons(before.rows._updBeacons.source),b=beacons(current('_updBeacons'));
 for(let i=0;i<hz*3;i++){
  const rows=[{x:.2+i/(hz*30),y:.4,name:i>hz*2?'Renamed':'Player',ok:i<hz||i>hz*2,dead:i>=hz&&i<hz*2,weapon:'shooter',kind:'actor'},null,null,{x:.9,y:.9,home:true,ok:true,name:'Base'}];
  a.frame(rows,1/hz);b.frame(rows,1/hz);
  assert.equal(b.h.beacons[0]._queueBeaconLabel.textContent,a.h.beacons[0].querySelector('.iw-bcn__label b').textContent);assert.deepEqual(b.h.beacons[0].values,a.h.beacons[0].values);assert.deepEqual([...b.h.beacons[0].classes],[...a.h.beacons[0].classes]);
 }
 const old=a.h.beacons[0].querySelector('.iw-bcn__label b'),next=b.h.beacons[0]._queueBeaconLabel;assert.ok(next.counts.writes<old.counts.writes);assert.equal(next.counts.writes,4); // one existing beacon initialization plus three label transitions
});
test('composed settings screen already reads scroll geometry only after invalidation and cleans up',()=>{
 const source=adaptBuildSource('src/ui/menus.js',fs.readFileSync(new URL('../../../inkwave-public/src/ui/menus.js',import.meta.url),'utf8'));
 const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});let block;
 const visit=n=>{if(!n||typeof n!=='object')return;if(n.type==='IfStatement'&&source.slice(n.test.start,n.test.end)==='layoutDirty || !layoutObserver')block=source.slice(n.start,n.end);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')visit(v);};visit(ast);assert.ok(block);
 let reads=0;const rows={_up:undefined,_down:undefined,top:0,height:200,client:100,classList:{toggle(){}}};for(const [name,key]of[['scrollHeight','height'],['clientHeight','client'],['scrollTop','top']])Object.defineProperty(rows,name,{get(){reads++;return this[key];}});
 const make=new Function('rowsEl','layoutObserver','movePill','let layoutDirty=true; return {tick(){'+block+'},dirty(){layoutDirty=true;}}');const probe=make(rows,{},()=>{});
 probe.tick();const first=reads;for(let i=0;i<240;i++)probe.tick();assert.equal(reads,first);rows.top=100;probe.dirty();probe.tick();assert.equal(rows._up,true);assert.equal(rows._down,false);
 assert.ok(source.includes("rowsEl.addEventListener('scroll', invalidateLayout, { passive: true })"));assert.ok(source.includes('layoutObserver?.disconnect()'));assert.ok(source.includes("rowsEl.removeEventListener('scroll', invalidateLayout)"));
});

test('boss callout caches authored and Chromium serialized transforms and restores external writers', async t=>{
 const {chromium}=await import('playwright');
 const executablePath=process.env.CHROMIUM_EXECUTABLE || (fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
 if(!executablePath&&!fs.existsSync(chromium.executablePath()))return t.skip('Chromium is not installed');
 const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{const page=await browser.newPage({viewport:{width:800,height:600}});
 const result=await page.evaluate(({source,baseline})=>{
  function make(src){let point={x:400,y:280,behind:false};const counts={};const h={S:{L:{}},_tmp:{},_u:()=>1,_anchor:()=>point,_screen:(p,out)=>Object.assign(out,p),_b:()=>({pos:{x:40,y:0,z:3},yaw:0})};
   for(const key of ['call','callEdge','callArrow']){const el=document.createElement('div');document.body.append(el);h[key]=el;counts[key]=0;const style=el.style;Object.defineProperty(style,'transform',{get:()=>style.getPropertyValue('transform'),set:v=>{counts[key]++;style.setProperty('transform',v);}});}
   const fn=new Function('G','return ({'+src+'})._placeCall')({camera:null});
   return {h,counts,frame(p,move='charge'){point=p;h.call.dataset.move=move;fn.call(h,1/60);}};
  }
  const a=make(baseline),b=make(source);const snapshots=[];
  for(const point of [{x:400,y:280,behind:false},{x:1000,y:280,behind:false},{x:1000,y:280,behind:true}]){
   const start={...b.counts};for(let i=0;i<120;i++){a.frame(point);b.frame(point);for(const key of ['call','callEdge','callArrow'])if(a.h[key].style.transform!==b.h[key].style.transform)throw Error('CSS mismatch '+key);}
   const settled={...b.counts};for(let i=0;i<120;i++){a.frame(point);b.frame(point);for(const key of ['call','callEdge','callArrow'])if(a.h[key].style.transform!==b.h[key].style.transform)throw Error('settled CSS mismatch '+key);}
   snapshots.push({point,writes:Object.fromEntries(Object.keys(start).map(k=>[k,b.counts[k]-start[k]])),settledWrites:Object.fromEntries(Object.keys(start).map(k=>[k,b.counts[k]-settled[k]]))});
  }
  const old=b.counts.call;b.h.call.style.setProperty('transform','scale(2)');b.frame({x:1000,y:280,behind:true});
  return {snapshots,restored:b.counts.call===old+1,serialized:b.h.call.style.transform,authored:b.h.call._queueCallTransform};
 },{source:current('_placeCall'),baseline:before.rows._placeCall.source});
 assert.ok(result.restored);for(const snapshot of result.snapshots)for(const n of Object.values(snapshot.settledWrites))assert.equal(n,0,JSON.stringify(result));
 assert.notEqual(result.serialized,result.authored,'the fixture exercises native CSS canonicalization');
 t.diagnostic(JSON.stringify({browser:browser.version(),...result}));
 }finally{await browser.close();}
});
