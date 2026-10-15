import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {adaptMinimapDirty as baseline} from '../../patches/splatoon3/tests/fixtures/minimap-dirty-before-noop.mjs';
import {adaptMinimapDirty as candidate} from '../../patches/splatoon3/minimap-dirty-adapter.mjs';
import {adaptMinimapResources} from '../../patches/local-quality/minimap-resource-adapter.mjs';
export async function runMinimapCanvasProbe(page,{root,evidence,sourceSha,contentHash,manifest}){
 const read=p=>fs.readFileSync(path.join(root,p),'utf8');
 const raw=read('inkwave-public/src/game/minimap.js'),runtime=read('patches/splatoon3/runtime/minimap-dirty.mjs').replace(/export /g,'');
 const once=(s,a,b)=>{if(s.split(a).length!==2)throw Error('Minimap source anchor mismatch');return s.replace(a,b);};
 const compose=adapt=>adaptMinimapResources('src/game/minimap.js',adapt('src/game/minimap.js',raw,once)).replace("import { G, on } from '../core/ctx.js';",'').replace("import { SPECIALS, SUB } from '../config.js';",'').replace('export class Minimap','class Minimap');
 const sources={baseline:compose(baseline),candidate:compose(candidate)};
 const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
 if(hash(read('patches/splatoon3/tests/fixtures/minimap-dirty-before-noop.mjs'))!=='6310a58e1ad59bfab2bf8af4b5dcd2327ee4b94ce0f76d913538569c5387bda1')throw Error('Baseline minimap adapter binding mismatch');
 const sourceHashes=Object.fromEntries(['inkwave-public/src/game/minimap.js','patches/splatoon3/runtime/minimap-dirty.mjs','patches/splatoon3/minimap-dirty-adapter.mjs','patches/local-quality/minimap-resource-adapter.mjs','patches/splatoon3/tests/fixtures/minimap-dirty-before-noop.mjs'].map(p=>[p,hash(read(p))]));
 for(const [p,expected] of Object.entries({"inkwave-public/src/game/minimap.js": "0bc4585280c9f5fd11ea859b5e745be531ad75120f7dcecc4a25346629e7b662", "patches/splatoon3/runtime/minimap-dirty.mjs": "88ba5df106df11aad4f3eb53b045b1419f972e5b35775a43f52a6c74f8d1a75e", "patches/splatoon3/minimap-dirty-adapter.mjs": "ad1304e79293b4337bd2b375fc449351fb9e4ad9218992b3c0069340331fa92f", "patches/local-quality/minimap-resource-adapter.mjs": "89ee10db310f4e541219edb0ee16b09d77a3a0e35cabe764a550bd3d665a5538"}))if(sourceHashes[p]!==expected)throw Error('Minimap source pin mismatch: '+p);
 if(!/^[a-f0-9]{64}$/.test(manifest.build?.revision||''))throw Error('Invalid build revision');
 const prefix='_versions/'+manifest.build.revision+'/';
 const emitted={};
 for(const [name,suffix] of Object.entries({minimap:'src/game/minimap.js',ctx:'src/core/ctx.js',config:'src/config.js',dirty:'patches/splatoon3/runtime/minimap-dirty.mjs',three:'vendor/three/build/three.module.js'})){
  const keys=Object.keys(manifest.artifacts).filter(p=>p===prefix+suffix);
  if(keys.length!==1)throw Error('Unique versioned minimap dependency required: '+suffix);
  emitted[name]={path:keys[0],sha256:manifest.artifacts[keys[0]]};
 }
 const result=await page.evaluate(async ({sources,runtime,emitted})=>{
 let failureComparison=null;const completedCases=[];
 const assert=(v,m='assertion')=>{if(!v)throw Error(m);};assert.equal=(a,b,m)=>assert(a===b,m);assert.deepEqual=(a,b,m)=>{if(JSON.stringify(a)!==JSON.stringify(b)){failureComparison={label:m,actual:a,expected:b};throw Error(m);}};
 const images=[];
 const frame=document.createElement('iframe');frame.hidden=true;document.body.appendChild(frame);
 try {
 const load=frame.contentWindow.Function('url','return import(url)');
 const origin=location.origin+'/';
 // about:blank frames do not inherit the parent import map. Bind the same emitted Three before any module import.
 const threeURL=new URL(emitted.three.path,origin).href;
 const importMap=frame.contentDocument.createElement('script');importMap.type='importmap';
 importMap.textContent=JSON.stringify({imports:{three:threeURL}});frame.contentDocument.head.appendChild(importMap);
 for(const item of Object.values(emitted)){
  const response=await fetch(new URL(item.path,origin));if(!response.ok)throw Error('Emitted dependency HTTP failure');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await response.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');
  assert.equal(digest,item.sha256,'served emitted dependency hash');
 }
 const [emittedMap,emittedCtx,emittedConfig,emittedDirty]=await Promise.all(['minimap','ctx','config','dirty'].map(name=>load(new URL(emitted[name].path,origin).href)));

class EmittedPaint{};emittedDirty.installMinimapDirty({Minimap:emittedMap.Minimap,PaintSystem:EmittedPaint});
function harness(adapt){
 const events={};let G={settings:{minimap:true},teamHex:['#ff8a14','#2f5bff'],game:{theme:'day'},match:{attract:false},projectiles:{bombs:[],clouds:[]}};
 const code=sources[adapt];
 const M=adapt==='emitted'?{M:emittedMap.Minimap,...emittedDirty}:new Function('G','on','requestIdleCallback','setTimeout','SPECIALS','SUB',code+'\n'+runtime+'\nreturn {M:Minimap,installMinimapDirty,_emptyInkDirty};')(G,(n,f)=>events[n]=f,()=>1,()=>1,emittedConfig.SPECIALS,emittedConfig.SUB);
 if(adapt==='emitted'){Object.assign(emittedCtx.G,G);G=emittedCtx.G;events['bomb:explode']=payload=>emittedCtx.emit('bomb:explode',payload);}
 const ctx={M:M.M},installMinimapDirty=M.installMinimapDirty,_emptyInkDirty=M._emptyInkDirty;
 const Paint=adapt==='emitted'?EmittedPaint:class {};installMinimapDirty({Minimap:ctx.M,PaintSystem:Paint});const paint=new Paint();Object.assign(paint,{grid:new Uint8Array(16),dead:new Uint8Array(16),paintFaces:[],version:0,cell:1,inkDirty:_emptyInkDirty()});
 const face={origin:{x:0,y:0,z:0},n:{x:0,y:1,z:0},u:{x:1,y:0,z:0},v:{x:0,y:0,z:1},su:4,sv:4,nu:4,nv:4,cu:1,cv:1,grid:0,turf:true};paint.paintFaces=[face];const level={bounds:{minX:0,maxX:4,minZ:0,maxZ:4},blocks:[],spawnPads:[]};G.level=level;
 const m=new ctx.M(level,paint,4);let composes=0,rasters=0;const compose=m._compose,ink=m._drawInk;m._compose=function(dt){composes++;return compose.call(this,dt);};m._drawInk=function(...args){rasters++;return ink.apply(this,args);};
 const snapshot=()=>JSON.parse(JSON.stringify({time:m.time,timer:m.timer,flashT:m.flashT,acc:m._composeAcc,dirty:m._composeDirty,animated:m._animatedLast,band:m._band,version:m.version,inkGen:m._inkGen,ink:Array.from(m.inkImg.data),flash:Array.from(m.flashImg.data),owner:Array.from(m.owner),output:Array.from(m.ctx.getImageData(0,0,m.w,m.h).data)}));
 m.update(0,true);return{m,G,paint,face,events,snapshot,restore:()=>{m._compose=compose;m._drawInk=ink;},counts:()=>({composes,rasters})};
}
function pixels(h){return Array.from(h.m.ctx.getImageData(0,0,h.m.w,h.m.h).data);}
function observeAll(hs){return hs.map(h=>h.snapshot());}
function encodeAll(hs){return hs.map(h=>h.m.canvas.toDataURL('image/png'));}
function visible(a){const colors=new Set();for(let i=0;i<a.length;i+=4)if(a[i+3])colors.add(a.slice(i,i+4).join(','));assert(colors.size>1,'nonempty multicolor canvas required');}
function run(name,steps){
 const a=harness('baseline'),b=harness('candidate'),e=harness('emitted');let observedOwner=false,observedFlash=false,overlayChanged=false,hiddenStable=true,flashFrame=null,clearedFlash=false;const hs=[a,b,e];let observed=observeAll(hs);const initial=observed[1].output;visible(initial);for(const h of hs)visible(Array.from(h.m.bctx.getImageData(0,0,h.m.w,h.m.h).data));
 const saveImage=name=>{const pngs=encodeAll(hs);images.push({name,png:pngs[1]});};
 try { for(let i=0;i<steps.length;i++){
  const step=steps[i],before=observed[1].output;
  for(const h of[a,b,e]){step(h);h.m[step.hidden?'tickHidden':'update'](step.dt??1/60,step.force??false);}
  observed=observeAll(hs);
  assert.deepEqual(observed[1],observed[0],name+' source frame '+i);assert.deepEqual(observed[2],observed[1],name+' emitted frame '+i);
  const after=observed[1].output;visible(after);
  if(step.hidden){assert.deepEqual(after,before,'hidden canvas must remain untouched');hiddenStable&&=true;}
  if(step===bomb||step===fx)overlayChanged ||= JSON.stringify(after)!==JSON.stringify(before);
  if(!flashFrame && b.m.flashT<.45 && b.m.flashImg.data.some((x,j)=>j%4===3&&x)){flashFrame=after;saveImage(name+'-flash-active');}
  if(flashFrame&&!clearedFlash&&b.m.flashT>=.45){clearedFlash=true;saveImage(name+'-flash-cleared');}
  if(name==='hidden-reopen'&&i===20)saveImage(name+'-reopen');
  observedOwner ||= b.m.owner.some(x=>x!==0);observedFlash ||= b.m.flashImg.data.some((x,i)=>i%4===3&&x!==0);
  if(i===0 || step===turf || step===bomb || step===fx || i===steps.length-1)saveImage(name+'-'+i);
 }
 assert.deepEqual(e.counts(),b.counts(),'emitted compose/raster counts');
 if(name.includes('overlay')){assert(overlayChanged,'overlay must visibly change pixels');assert.deepEqual(observed[1].output,initial,'expired overlay must clear');}
 if(name==='turf-flash'||name==='hidden-reopen'){assert(observedOwner,'real owner pixels');assert(observedFlash,'real flash pixels');assert(flashFrame&&clearedFlash,'flash display and expiry required');assert(JSON.stringify(flashFrame)!==JSON.stringify(observed[1].output),'flash must visibly clear');assert(JSON.stringify(observed[1].output)!==JSON.stringify(initial),'turf must change final pixels');}
 return{name,frames:steps.length,observedOwner,observedFlash,overlayChanged,hiddenStable,baseline:a.counts(),candidate:b.counts(),emitted:e.counts()};
 } finally {a.restore();b.restore();e.restore();}
}
const tick=()=>{},wall=h=>h.paint.version++,turf=h=>{h.paint.grid[5]=h.paint.grid[5]===1?2:1;h.paint.version++;h.paint._inkMark(h.face,1,1);};const bomb=h=>h.G.projectiles.bombs=[{pos:{x:1,z:2},team:0,fuse:.6,age:.2}],cloud=h=>h.G.projectiles.clouds=[{group:{position:{x:1,z:1}},team:1,t:.1,dur:2}],clear=h=>{h.G.projectiles.bombs=[];h.G.projectiles.clouds=[];};const fx=h=>h.events['bomb:explode']({pos:{x:1,z:1},team:0,radius:2});

const cases=completedCases;cases.push(run('wall-only',Array.from({length:120},(_,i)=>i%10===0?wall:tick)));cases.push(
 run('overlay-bomb',[h=>{h.m._composeAcc=0;wall(h);h.m.timer=0;},bomb,...Array(60).fill(tick),clear,...Array(40).fill(tick)]));cases.push(
 run('overlay-FX',[h=>{h.m._composeAcc=0;wall(h);h.m.timer=0;},fx,...Array(100).fill(tick)]));cases.push(
 run('turf-flash',[turf,...Array(60).fill(tick),wall,...Array(40).fill(tick)]));cases.push(
 run('hidden-reopen',[...Array.from({length:20},(_,i)=>Object.assign(h=>{if(i===0)turf(h);else wall(h);},{hidden:true})),tick,...Array(60).fill(tick)]));
assert(cases[0].candidate.composes<cases[0].baseline.composes,'empty refresh composition reduced');for(const c of cases)assert.equal(c.baseline.rasters,c.candidate.rasters);
let blankRejected=false,corruptionRejected=false,clockRejected=false;
try{visible(Array(1024).fill(0));}catch{blankRejected=true;}
const a=harness('baseline'),b=harness('candidate');try{b.m.ctx.clearRect(0,0,b.m.w,b.m.h);try{assert.deepEqual(b.snapshot(),a.snapshot());}catch{corruptionRejected=true;}}finally{a.restore();b.restore();}
sources.naive=sources.candidate.replace('      this._composeAcc = 0;','      if (!_inkNoop) this._composeAcc = 0;');
const x=harness('baseline'),y=harness('naive');try{for(let i=0;i<20;i++)for(const h of[x,y])h.m.update(1/60);for(const h of[x,y]){wall(h);h.m.update(1/60);bomb(h);h.m.update(1/60);}try{assert.deepEqual(y.snapshot(),x.snapshot());}catch{clockRejected=true;}}finally{x.restore();y.restore();}
assert(blankRejected&&corruptionRejected&&clockRejected,'negative controls must fail');
return {cases,negativeControls:{blankRejected,corruptionRejected,clockRejected},images,emitted};
 } catch(error) {return {failed:true,error:String(error),comparison:failureComparison,cases:completedCases,images,emitted};} finally {frame.remove();}
 },{sources,runtime,emitted});
 for(const item of result.images)fs.writeFileSync(path.join(evidence,'minimap-'+item.name+'.png'),Buffer.from(item.png.split(',')[1],'base64'));
 if(result.failed){fs.writeFileSync(path.join(evidence,'minimap-canvas-failure.json'),JSON.stringify({...result,sourceSha,contentHash,sourceHashes,images:result.images.map(x=>x.name)},null,2));throw Error(result.error);}
 const images=result.images.map(x=>'minimap-'+x.name+'.png');delete result.images;
 return {...result,images,sourceSha,contentHash,sourceHashes,composedHashes:{baseline:hash(sources.baseline),candidate:hash(sources.candidate)},scope:'Synthetic real Canvas2D fixture comparing source baseline/candidate against actual versioned Minimap and dependency imports in an isolated iframe. Exact per-tick RGBA/state comparison; no whole-Game or device performance claim.'};
}

