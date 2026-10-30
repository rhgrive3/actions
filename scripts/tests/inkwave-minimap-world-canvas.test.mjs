import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import {parse} from '../../patches/loading-cache/vendor/acorn.mjs';import {geometryFixture} from '../../patches/local-quality/tests/geometry-build-fixture.mjs';
import { assertReviewedMinimapSources, REVIEWED_MINIMAP_SOURCE_EPOCHS } from '../lib/minimap-canvas-probe.mjs';
const raw=fs.readFileSync(new URL('../../inkwave-public/src/game/minimap.js',import.meta.url),'utf8'),frozen=JSON.parse(fs.readFileSync(new URL('../../patches/local-quality/tests/fixtures/world-queue/baseline.json',import.meta.url)))['game/minimap.js'];
let previous=raw;for(const [name,body]of Object.entries(frozen)){const ast=parse(previous,{ecmaVersion:'latest',sourceType:'module'}),klass=ast.body.find(n=>n.type==='ExportNamedDeclaration'&&n.declaration?.id?.name==='Minimap').declaration,node=klass.body.body.find(n=>n.key.name===name);previous=previous.slice(0,node.start)+body+previous.slice(node.end);}
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
test('independent pre-world minimap oracle reconstructs the already-reviewed source pin',()=>assert.equal(digest(previous),'ead39a1ac28c0095672394b19a2ae8d141adf1144e51f8c1b0e4f18078a21df6'));
test('abortable native minimap source epoch remains exact and rejects mixed or edited source sets',()=>{
 const sourcePaths=['inkwave-public/src/game/minimap.js','patches/local-quality/minimap-resource-adapter.mjs','patches/splatoon3/runtime/minimap-dirty.mjs','patches/splatoon3/minimap-dirty-adapter.mjs','patches/native-stages/runtime/native-minimap.mjs'];
 const pins=Object.fromEntries(sourcePaths.map(file=>[file,digest(fs.readFileSync(new URL('../../'+file,import.meta.url)))]));
 assert.equal(assertReviewedMinimapSources(pins),'library-queue-world-minimap-typed-storage-20261028');
 const old=REVIEWED_MINIMAP_SOURCE_EPOCHS.find(e=>e.name==='library-queue-world-minimap-storage-beec332');
 assert.ok(old,'previous reviewed native renderer remains admissible');
 const native='patches/native-stages/runtime/native-minimap.mjs';
 const axis=REVIEWED_MINIMAP_SOURCE_EPOCHS.find(e=>e.name==='library-queue-world-minimap-abortable-axis-prefilter-1870');
 assert.ok(axis,'historical axis-prefilter source epoch remains admissible');
 assert.equal(assertReviewedMinimapSources({...pins,[native]:axis.pins[native]}),axis.name);
 assert.equal(assertReviewedMinimapSources({...pins,[native]:old.pins[native]}),old.name);
 assert.throws(()=>assertReviewedMinimapSources({...pins,[native]:'0'.repeat(64)}),/source pin mismatch/);
 assert.throws(()=>assertReviewedMinimapSources({...pins,[native]:'47daa3d3a880e425b4a4580de56d688011d34ab7fc7ae2b7029c1c4581acc08b'}),/source pin mismatch/);
 for(const file of sourcePaths){const missing={...pins};delete missing[file];assert.throws(()=>assertReviewedMinimapSources(missing),/source pin mismatch/);}
 const mixed=REVIEWED_MINIMAP_SOURCE_EPOCHS.find(e=>e.name==='before-library-queue-c0938a3f');
 assert.throws(()=>assertReviewedMinimapSources({...pins,['patches/splatoon3/runtime/minimap-dirty.mjs']:mixed.pins['patches/splatoon3/runtime/minimap-dirty.mjs']}),/source pin mismatch/);
 assert.throws(()=>assertReviewedMinimapSources({...pins,['patches/splatoon3/runtime/minimap-dirty.mjs']:'0'.repeat(64)}),/source pin mismatch/);
});
test('abortable scheduling retains the reviewed native raster and support generator bytes',()=>{
 const source=fs.readFileSync(new URL('../../patches/native-stages/runtime/native-minimap.mjs',import.meta.url),'utf8');
 // Reverse exactly PR #1870's one authorized prefilter hunk, not arbitrary
 // normalization: every other support/raster/scheduler byte must be reviewed.
 const reviewed=reviewedNativeSource(source);
 const marker='export function buildNativeMinimap';
 assert.equal(reviewed.split(marker).length,2);
 assert.equal(digest(reviewed.split(marker)[0]),'9f5cc5efe70aefb1a648f8f8cb9a4a4bdd294b1ffaeed5111be571312b92e9b6');
});

const nativePath='../../patches/native-stages/runtime/native-minimap.mjs';
// Frozen from dd90aa241aabd5f0b972cc3471386ba3d4da86dc, before the
// subsequently reviewed typed-storage changes. Both complete source hashes
// and the exact three reversible changes are required; the historical pin is
// not relabelled as the current renderer.
const historicalNative=fs.readFileSync(new URL('../fixtures/native-minimap-axis-prefilter-1870.mjs.txt',import.meta.url),'utf8');
const historicalNativeHash='668015fd409d2bf388b54d30b269cf44792c28f45fa81e3b7a28d25cbcebf3bb';
const typedNativeHash='f2012fac76b5ea631b6ba45e4cd6f75d3d27ffe6d76f8fdcb0d491d3666d70d5';
const typedChanges=[
 [` const reachable=new Uint8Array(nav.nodes.length),queue=[];
 for(const pad of level.spawnPads){const id=nav.nearest(pad,1.2);if(id>=0&&nav.valid[id]&&!reachable[id]){reachable[id]=1;queue.push(id);}}
 for(let i=0;i<queue.length;i++)for(const edge of nav.nodes[queue[i]].nb)if(nav.valid[edge.to]&&!reachable[edge.to]){reachable[edge.to]=1;queue.push(edge.to);}`,
 ` const reachable=new Uint8Array(nav.nodes.length),queue=nav.nodes.length<=65536?new Uint16Array(nav.nodes.length):new Uint32Array(nav.nodes.length);let tail=0;
 for(const pad of level.spawnPads){const id=nav.nearest(pad,1.2);if(id>=0&&nav.valid[id]&&!reachable[id]){reachable[id]=1;queue[tail++]=id;}}
 for(let i=0;i<tail;i++)for(const edge of nav.nodes[queue[i]].nb)if(nav.valid[edge.to]&&!reachable[edge.to]){reachable[edge.to]=1;queue[tail++]=edge.to;}`],
 [` let index=0,same=true;visitSupportValues(map,layers,value=>{if(!Object.is(value,cache.values[index++]))same=false;});return same&&index===cache.values.length;
}
function rememberSupport(map,layers,hits){
 const values=[];visitSupportValues(map,layers,value=>values.push(value));`,
 ` let index=0,same=true;visitSupportValues(map,layers,value=>{if(!Object.is(value,cache.values.get(index++)))same=false;});return same&&index===cache.values.length;
}
function rememberSupport(map,layers,hits){
 const chunks=[],other=new Map();let length=0;
 visitSupportValues(map,layers,value=>{const chunk=length>>>13,slot=length&8191;if(!chunks[chunk])chunks[chunk]=new Float64Array(8192);if(typeof value==='number')chunks[chunk][slot]=value;else other.set(length,value);length++;});
 const values={length,get(i){return other.has(i)?other.get(i):i<length?chunks[i>>>13][i&8191]:undefined;}};`],
 [` if(map.topBlock?.length!==N)map.topBlock=new Int32Array(N);map.topBlock.fill(-1);`,
 ` const BlockIndex=L.staticBlockCount<=32768?Int16Array:Int32Array;
 if(map.topBlock?.length!==N||!(map.topBlock instanceof BlockIndex))map.topBlock=new BlockIndex(N);map.topBlock.fill(-1);`],
];
function replaceTypedOnce(source,from,to){
 assert.equal(source.split(from).length,2,'one exact typed-storage epoch hunk');return source.replace(from,to);
}
function restoreAxisEpoch(source){
 assert.equal(digest(source),typedNativeHash,'complete current typed-storage source');
 for(const [before,after] of [...typedChanges].reverse())source=replaceTypedOnce(source,after,before);
 assert.equal(digest(source),historicalNativeHash,'complete restored axis-prefilter source');
 assert.equal(source,historicalNative,'restoration matches independent frozen historical bytes');return source;
}
function projectTypedEpoch(source){
 assert.equal(digest(source),historicalNativeHash,'complete historical axis-prefilter source');
 for(const [before,after] of typedChanges)source=replaceTypedOnce(source,before,after);
 assert.equal(digest(source),typedNativeHash,'complete projected typed-storage source');return source;
}
const oldCandidate='   const n=nav.nodes[id];if(Math.hypot(n.x-x,n.z-z)<=nav.step*1.1)candidates.push(n);';
const filteredCandidate='   const n=nav.nodes[id],dx=n.x-x,dz=n.z-z,reach=nav.step*1.1;\n   if(Math.abs(dx)>reach||Math.abs(dz)>reach)continue;\n   if(Math.hypot(dx,dz)<=reach)candidates.push(n);';
function reviewedNativeSource(source){
 source=restoreAxisEpoch(source);
 assert.equal(source.split(filteredCandidate).length,2,'one exact reviewed axis prefilter');
 const reviewed=source.replace(filteredCandidate,oldCandidate);
 assert.equal(digest(reviewed),'5ba0e08316cc9a5e07b4f0f1e57129b9e4d355bf7684110aa95783f9007ad3ac','all other abortable-native bytes remain exact');
 return reviewed;
}
test('typed-storage source reverses exactly to the separately frozen historical owner',()=>{
 const source=fs.readFileSync(new URL(nativePath,import.meta.url),'utf8');
 assert.equal(digest(historicalNative),historicalNativeHash);
 assert.equal(restoreAxisEpoch(source),historicalNative);
 assert.equal(projectTypedEpoch(historicalNative),source);
 for(const [before,after] of typedChanges){
  assert.throws(()=>restoreAxisEpoch(source.replace(after,'')),/complete current typed-storage source/);
  assert.throws(()=>restoreAxisEpoch(source.replace(after,after+'\n'+after)),/complete current typed-storage source/);
  assert.throws(()=>projectTypedEpoch(historicalNative.replace(before,'')),/complete historical axis-prefilter source/);
  assert.throws(()=>projectTypedEpoch(historicalNative.replace(before,before+'\n'+before)),/complete historical axis-prefilter source/);
 }
});
test('merged axis-prefilter epoch rejects edited prefilter and mixed renderer sources',()=>{
 const source=fs.readFileSync(new URL(nativePath,import.meta.url),'utf8');
 reviewedNativeSource(source);
 assert.equal(digest(restoreAxisEpoch(source)),'668015fd409d2bf388b54d30b269cf44792c28f45fa81e3b7a28d25cbcebf3bb');
 const current=REVIEWED_MINIMAP_SOURCE_EPOCHS.at(-1),native='patches/native-stages/runtime/native-minimap.mjs';
 const changed=source.replace('Math.abs(dx)>reach','Math.abs(dx)>=reach');assert.notEqual(changed,source);
 assert.throws(()=>assertReviewedMinimapSources({...current.pins,[native]:digest(changed)}),/source pin mismatch/);
 assert.throws(()=>assertReviewedMinimapSources({...current.pins,['patches/splatoon3/runtime/minimap-dirty.mjs']:REVIEWED_MINIMAP_SOURCE_EPOCHS[0].pins['patches/splatoon3/runtime/minimap-dirty.mjs']}),/source pin mismatch/);
 const prior=REVIEWED_MINIMAP_SOURCE_EPOCHS.find(epoch=>epoch.name==='library-queue-world-minimap-abortable-native-20261025');
 assert.equal(assertReviewedMinimapSources({...current.pins,[native]:prior.pins[native]}),prior.name);
});
test('exact old and axis-prefilter support geometry agree on circular boundaries, signed zeros, tiny scales and slopes',async()=>{
 const source=fs.readFileSync(new URL(nativePath,import.meta.url),'utf8'),reviewed=reviewedNativeSource(source),{THREE}=await geometryFixture();
 const load=text=>new Function('THREE',text.replace(/^import .*;$/gm,'').replace(/^export /gm,'')+'\nreturn nativeMinimapSupport;')(THREE);
 const probes=[load(reviewed),load(source)];let cases=0;
 for(const step of [1e-12,.25,1,1000])for(const [x,z]of [[0,-0],[-.25,.5],[100,-100]])for(const slope of [0,.5,-.5]){
  const reach=step*1.1,offsets=[-2*reach,-reach*(1+Number.EPSILON),-reach,-reach/Math.SQRT2,-0,0,reach/Math.SQRT2,reach,reach*(1+Number.EPSILON),2*reach];
  for(const dx of offsets)for(const dz of offsets){
   const floor={point:{y:0},normal:{x:slope,y:1,z:0},triangle:1},roof={point:{y:4},normal:{x:0,y:1,z:0},triangle:2};
   const level={triangleWorld:{nodes:[0,-1,0,0,4],ray:origin=>origin.y>4?roof:origin.y>0?floor:null}};
   const nav={x0:x,z0:z,step,nx:1,nz:1,cells:[[0]],nodes:[{x:x+dx,y:-slope*dx,z:z+dz}]},layers={nav,reachable:[1]};
   const actual=probes.map(probe=>probe(level,x,z,layers));
   assert.deepEqual(actual.map(hit=>hit?.triangle),[actual[0]?.triangle,actual[0]?.triangle]);cases++;
  }
 }
 assert.equal(cases,3600);
});

test('Chromium Canvas2D retains legacy base and native nearest-cell ink pixels for reviewed world storage',async t=>{
 const {chromium}=await import('playwright'),executablePath=process.env.CHROMIUM_EXECUTABLE||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
 if(!executablePath&&!fs.existsSync(chromium.executablePath()))return t.skip('Chromium is not installed');
 const f=await geometryFixture(),levels=Object.fromEntries(['tidewater','kelpline','halyard','cargo','range'].map(id=>{const L=new f.Level(f.MAP_LAYOUTS[id]);return[id,JSON.parse(JSON.stringify({bounds:L.bounds,blocks:L.blocks,spawnPads:[],faces:L.faces}))];}));
 const plain=s=>s.replace(/^import .*;$/gm,'').replace('export class Minimap','class Minimap');
 const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{const page=await browser.newPage();const result=await page.evaluate(({sources,levels})=>{
  const same=(a,b,label)=>{if(a.length!==b.length)throw Error(label+' length');for(let i=0;i<a.length;i++)if(!Object.is(a[i],b[i]))throw Error(label+' value '+i);};
  const G={settings:{minimap:true},game:{theme:'day'},teamHex:['#ff8800','#2255ff'],match:{attract:false},projectiles:{bombs:[],clouds:[]}};
  const classes=sources.map(s=>new Function('G','on','requestIdleCallback','SPECIALS','SUB',s+'\nreturn Minimap;')(G,()=>{},()=>1,{storm:{radius:3.4}},{bomb:{radius:3,fuse:1}}));
  const pixels=m=>m.bctx.getImageData(0,0,m.w,m.h).data;let cases=0,rampNegative=false,inkNegative=false,covered=0;
  for(const [id,L]of Object.entries(levels))for(const ppm of[1,2]){
   const maps=classes.map(C=>new C(L,{paintFaces:[],dead:new Uint8Array(),grid:new Uint8Array()},ppm,{deferActivation:true}));
   for(const flip of[false,true])for(const theme of['day','sunset']){G.game.theme=theme;for(const m of maps){m.flip=flip;m._build();}same(pixels(maps[0]),pixels(maps[1]),id+' actual base RGBA');same(maps[0].hgt,maps[1].hgt,id+' heights');same(maps[0].topBlock,maps[1].topBlock,id+' block IDs');if(maps[1].nrm!==null||!(maps[1].topBlock instanceof Int16Array))throw Error('storage policy');covered+=pixels(maps[1]).filter((x,i)=>i%4===3&&x).length;cases++;}
   if(!rampNegative){const source=sources[1].replace('Math.fround(this.flip ? b.axes[1].x : -b.axes[1].x)','0.8');if(source===sources[1])throw Error('normal negative anchor');const Bad=new Function('G','on','requestIdleCallback','SPECIALS','SUB',source+'\nreturn Minimap;')(G,()=>{},()=>1,{},{}),bad=new Bad(L,{paintFaces:[],dead:[],grid:[]},ppm,{deferActivation:true});bad.flip=maps[1].flip;bad._build();try{same(pixels(bad),pixels(maps[1]),'bad normals');}catch{rampNegative=true;}}
  }
  // Native projection owns one exact cell. The prior renderer read four zero
  // interpolation arrays; the reviewed renderer accepts the same cell with no arrays.
  const L={native:true,bounds:{minX:0,maxX:8,minZ:0,maxZ:8},blocks:[],spawnPads:[]};const maps=classes.map(C=>new C(L,{grid:Uint8Array.from({length:37},(_,i)=>i%3),paintFaces:[],dead:[]},4,{deferActivation:true}));
  for(let n=0;n<maps.length;n++){const m=maps[n],N=m.w*m.h;m.pixCell=Int32Array.from({length:N},(_,i)=>i%9===0?-1:i%37);m.owner=new Uint8Array(N);m.pixFx=m.pixFy=new Uint8Array(N);m.pixSx=new Int8Array(N);m.pixSy=new Int32Array(N);if(n)m.pixFx=m.pixFy=m.pixSx=m.pixSy=null;}
  for(let frame=0;frame<90;frame++){for(const m of maps){m.paint.grid[frame%37]=(frame%3);m.flashT=frame/60;m._drawInk(frame%2?1:0,frame%2?m.h-1:m.h);}for(const field of['inkImg','flashImg'])same(maps[0][field].data,maps[1][field].data,'native '+field);same(maps[0].owner,maps[1].owner,'native ownership');}
  maps[1].inkImg.data[0]^=1;try{same(maps[0].inkImg.data,maps[1].inkImg.data,'native corruption');}catch{inkNegative=true;}
  if(!rampNegative||!inkNegative||!covered)throw Error('negative/nonblank controls');return{legacyCases:cases,nativeFrames:90,covered,rampNegative,inkNegative};
 },{sources:[plain(previous),plain(raw)],levels});assert.equal(result.legacyCases,40);assert.equal(result.nativeFrames,90);t.diagnostic(JSON.stringify({browser:browser.version(),...result}));
 }finally{await browser.close();}
});
