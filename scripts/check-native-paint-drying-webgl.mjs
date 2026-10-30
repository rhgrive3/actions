// Real emitted PaintSystem/Three.js RGBA8 comparison without a full game boot.
// This verifies drying and target-transfer pixels, not a real-device FPS claim.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const option=(name,value)=>{const i=process.argv.indexOf(name);return i<0?value:process.argv[i+1];};
const site=fs.realpathSync(option('--site','../site-mobile-after-all'));
const out=path.resolve(option('--out','.browser-evidence/native-paint-drying'));
const sizes=option('--sizes','256,2048').split(',').map(Number);
assert.ok(sizes.length&&sizes.every(n=>Number.isInteger(n)&&n>=256&&n<=4096));
const sha=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
const files=['src/world/paint.js','patches/local-quality/paint-dry-regions.mjs','patches/local-quality/paint-dry-region-grid.mjs'];
const hashes=Object.fromEntries(files.map(file=>[file,sha(fs.readFileSync(path.join(site,file)))]));
for(const [file,hash]of Object.entries(hashes))assert.equal(hash,manifest.artifacts[file],file+' differs from build');
fs.mkdirSync(out,{recursive:true});
const temp=path.resolve('.ci-scratch/nd');fs.mkdirSync(temp,{recursive:true});
for(const key of ['TMPDIR','TMP','TEMP'])process.env[key]=temp;
const {chromium,webkit}=await import('playwright');
const engine=option('--browser','chromium');assert.ok(['chromium','webkit'].includes(engine));
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.wasm':'application/wasm'};
const server=http.createServer((req,res)=>{
 try{
  const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(rel==='/'){
   res.setHeader('content-type','text/html');res.end('<!doctype html><meta charset="utf-8"><script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script>');return;
  }
  if(rel==='/favicon.ico'){res.writeHead(204).end();return;}
  const file=path.resolve(site,'.'+rel);if(!file.startsWith(site+path.sep))throw Error('outside site');
  res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).on('error',()=>{res.writeHead(404);res.end();}).pipe(res);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const result={status:'running',browser:engine,contentHash:manifest.contentHash,revision:manifest.build.revision,hashes,sizes,cases:[],errors:[],
 scope:'Actual emitted native PaintSystem shaders and RGBA8 atlas pixels; isolated atlas workload, not real-stage or physical-device FPS.'};
const save=()=>fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');save();
let browser;
try{
 browser=await (engine==='webkit'?webkit.launch({headless:true}):chromium.launch({
  executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
 }));
 result.browserVersion=browser.version();
 const page=await browser.newPage({viewport:{width:800,height:600}});page.setDefaultTimeout(300000);
 page.on('pageerror',error=>result.errors.push(String(error)));
 page.on('console',msg=>{if(msg.type()==='error')result.errors.push(msg.text());});
 await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
 for(const size of sizes){
  const row=await page.evaluate(async size=>{
   const THREE=await import('three'),{PaintSystem}=await import('/src/world/paint.js');
   const {updatePaintQuality}=await import('/patches/local-quality/world-quality.mjs');
   const renderer=new THREE.WebGLRenderer({antialias:false});renderer.setSize(64,64);renderer.debug.checkShaderErrors=true;
   const gl=renderer.getContext(),checks=[],pairs=[];
   const require=(yes,message)=>{if(!yes)throw Error(message);};
   const ownership=p=>JSON.stringify([Array.from(p.grid),p.counts]);
   function make(baseline){
    const p=Object.create(PaintSystem.prototype);
    Object.assign(p,{renderer,level:{native:true,faces:[],blocks:[]},size,usedHeight:size-2,
     paintFaces:[],grid:new Uint8Array([1,2,0,1]),dead:new Uint8Array(4),counts:[2,1],
     growing:[],_splatEntryPool:[],_splatGrowthPool:[],_splatPoolStats:{},clock:0,frame:0,version:0,
     _q:[],_dryAcc:0,_wetUntil:0,_fixedPaintClock:true});
    p._initGPU();
    p.texture.generateMipmaps=false;p.texture.minFilter=THREE.LinearFilter;
    if(baseline)disable(p);else require(!!p._iwPaintDryRegions,'native sparse drying was not admitted');
    return p;
   }
   function disable(p){const s=p._iwPaintDryRegions;if(s){p.dryMesh.geometry=s.original;s.geometry.dispose();delete p._iwPaintDryRegions;}}
   function snapshot(p){const bytes=new Uint8Array(p.size*p.size*4);renderer.readRenderTargetPixels(p.rt,0,0,p.size,p.size,bytes);return bytes;}
   function compare(pair,label){
    const a=snapshot(pair[0]),b=snapshot(pair[1]);let differing=0,painted=0,wet=0;
    for(let i=0;i<a.length;i++){if(a[i]!==b[i])differing++;if(i%4===3&&a[i])painted++;if(i%4===1&&a[i])wet++;}
    checks.push({label,size:pair[0].size,bytes:a.length,differing,painted,wet});
    require(differing===0,label+': '+differing+' different RGBA bytes');require(gl.getError()===0,label+': WebGL error');
    return checks.at(-1);
   }
   function stamp(p,rects){
    const owner=ownership(p);
    p.quads=rects.length;
    for(let q=0;q<rects.length;q++){
     const [x0,y0,x1,y1,team=0,kind=7]=rects[q];
     for(let c=0;c<4;c++){
      const right=c===1||c===2,top=c>=2,v=q*4+c;
      p.aPos.set([right?x1:x0,top?y1:y0],v*2);
      p.aLocal.set([right?1.15:-1.15,top?1.15:-1.15,0],v*3);
      p.aSplat.set([1,team,.375+q*.0001,kind*2],v*4);
      p.aStretch.set([1,0,0],v*3);p.aGrow.set([3,1,0,1234+q],v*4);
     }
    }
    p.dryMesh.visible=false;p._drawQuads();require(ownership(p)===owner,'stamp changed gameplay ownership');
   }
   function dry(pair,steps,amount,label){
    for(let i=1;i<=steps;i++){
     for(const p of pair){const owner=ownership(p);p._dryU.uDry.value=amount/255;p.dryMesh.visible=true;p._drawQuads();require(ownership(p)===owner,'dry pass changed gameplay ownership');}
     if([1,3,12,24,steps].includes(i))compare(pair,label+'-'+i);
    }
   }
   const pair=[make(true),make(false)];pairs.push(pair);
   try{
    compare(pair,'empty');
    const rects=[[-.1,-.12,.11,.1,0,7],[-1.03,-.8,-.92,-.66,1,7],[.89,.86,1.03,1.04,1,0]];
    for(const p of pair)stamp(p,rects);
    require(compare(pair,'sparse-stamped').painted>0,'fixture did not paint actual pixels');
    dry(pair,30,12,'sparse-dry');
    const sparse={...pair[1]._iwPaintDryRegions.counters};
    require(sparse.sparsePasses>0&&sparse.coveredPixels<sparse.baselinePixels*.35,'sparse fixture did not substantially reduce drying coverage');
    for(const p of pair)p.clear();compare(pair,'cleared');
    // One large submitted footprint must use the original full-region quad.
    for(const p of pair)stamp(p,[[-1,-1,1,1,0,7]]);dry(pair,2,2,'dense-dry');
    require(pair[1]._iwPaintDryRegions.counters.fullPasses>0,'dense fixture did not retain full draw');
    for(const p of pair)p.clear();compare(pair,'dense-cleared');
    // Exercise the actual quality-transfer owner with a full-atlas face and a
    // deterministic fixture layout. Only its face layout is supplied here.
    if(size===256){
     for(const p of pair){
      const face={su:2,sv:2,atlas:{x:0,y:0,pad:0,ppm:p.size/2}};p.paintFaces=[face];
      p._layout=function(){face.atlas={x:0,y:0,pad:0,ppm:this.size/2};this.ppm=this.size/2;this.usedHeight=this.size-2;};
      stamp(p,rects);updatePaintQuality(null,512,{paint:p},THREE);
      p.texture.generateMipmaps=false;p.texture.minFilter=THREE.LinearFilter;
     }
     require(compare(pair,'quality-transfer').painted>0,'quality transfer lost the fixture ink');
     dry(pair,25,12,'quality-dry');
     require(pair[1]._iwPaintDryRegions?.tracker.size===512,'quality transfer retained stale dry tracker');
    }
    for(const p of pair){p.dispose();p._initGPU();p.texture.generateMipmaps=false;p.texture.minFilter=THREE.LinearFilter;}
    disable(pair[0]);require(!!pair[1]._iwPaintDryRegions,'GPU reinitialization did not restore native tracker');
    compare(pair,'gpu-reinitialized');for(const p of pair)stamp(p,rects);dry(pair,3,2,'reinitialized-dry');
    require(pair.every(p=>p.grid.every(v=>v===0)&&p.counts.join(',')==='0,0'),'clear/reinitialization did not reset gameplay ownership');
    return{size,sparse,coverageReductionPercent:100*(1-sparse.coveredPixels/sparse.baselinePixels),checks,
     glVersion:gl.getParameter(gl.VERSION),glRenderer:gl.getParameter(gl.RENDERER),glError:gl.getError()};
   }finally{for(const list of pairs)for(const p of list)p.dispose();renderer.dispose();}
  },size);
  result.cases.push(row);save();console.log(JSON.stringify({size,checks:row.checks.length,coverageReductionPercent:row.coverageReductionPercent}));
 }
 assert.equal(result.errors.length,0,result.errors.join('\n'));result.status='passed';
}catch(error){result.status='failed';result.error=error.stack;process.exitCode=1;}
finally{save();await browser?.close();await new Promise(resolve=>server.close(resolve));}
console.log(JSON.stringify({status:result.status,out,error:result.error}));
