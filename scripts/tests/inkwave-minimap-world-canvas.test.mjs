import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import {parse} from '../../patches/loading-cache/vendor/acorn.mjs';import {geometryFixture} from '../../patches/local-quality/tests/geometry-build-fixture.mjs';
const raw=fs.readFileSync(new URL('../../inkwave-public/src/game/minimap.js',import.meta.url),'utf8'),frozen=JSON.parse(fs.readFileSync(new URL('../../patches/local-quality/tests/fixtures/world-queue/baseline.json',import.meta.url)))['game/minimap.js'];
let previous=raw;for(const [name,body]of Object.entries(frozen)){const ast=parse(previous,{ecmaVersion:'latest',sourceType:'module'}),klass=ast.body.find(n=>n.type==='ExportNamedDeclaration'&&n.declaration?.id?.name==='Minimap').declaration,node=klass.body.body.find(n=>n.key.name===name);previous=previous.slice(0,node.start)+body+previous.slice(node.end);}
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
test('independent pre-world minimap oracle reconstructs the already-reviewed source pin',()=>assert.equal(digest(previous),'ead39a1ac28c0095672394b19a2ae8d141adf1144e51f8c1b0e4f18078a21df6'));
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
