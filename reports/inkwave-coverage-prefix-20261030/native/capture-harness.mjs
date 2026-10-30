import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { verifyRuntimeBuild, hash, indexPrebuiltRuntimeAssets, persistentBrowserTemp } from '../scripts/lib/inkwave-runtime-evidence.mjs';
import { launchSandboxBrowser } from '../scripts/lib/inkwave-sandbox-browser.mjs';

const root = path.resolve(import.meta.dirname, '..'), site = root + '/_site';
const sourceSha = '6c5c2738f73a00bc32561080dc90cee77338438a';
const evidence = root + '/.ci-scratch/coverage-capture'; fs.mkdirSync(evidence, {recursive:true});
const build = verifyRuntimeBuild(site, root, sourceSha), privateAssets = indexPrebuiltRuntimeAssets(site, build);
const reference = fs.readFileSync(root + '/patches/splatoon3/tests/fixtures/scoring-before-5637c803.mjs.txt');
assert.equal(hash(reference), 'ac919d24d6af33eba196c4e3f19d3253c23998586040eb0d4a90b9206b30ad11');
for (const name of ['TMPDIR','TMP','TEMP']) process.env[name] = persistentBrowserTemp(root+'/.ci-scratch/cov-tmp');
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{try{
  const url=new URL(req.url,'http://local');
  if(url.pathname==='/coverage-reference.mjs'){res.writeHead(200,{'content-type':'text/javascript'});res.end(reference);return;}
  const file=path.resolve(site,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
  if(!file.startsWith(site+'/'))throw Error('path');
  const bytes=fs.readFileSync(file), rel=path.relative(site,file), expected=build.artifacts[rel]||privateAssets[rel];
  if(!expected||hash(bytes)!==expected)throw Error('artifact '+rel);
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(bytes);
}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
const result={schema:1,purpose:'Non-timing native coverage correctness, applicability and persistent memory inspection. No elapsed-time measurement.',
  sourceSha,contentHash:build.contentHash,referenceSha256:hash(reference),errors:[],browserClosed:false,serverClosed:false};
try{
  browser=await launchSandboxBrowser(chromium,{CHROMIUM_EXECUTABLE_PATH:'/usr/bin/chromium'});
  result.browser=browser.version();const page=await browser.newPage({viewport:{width:960,height:640}});
  page.on('pageerror',error=>result.errors.push(error.message));
  await page.addInitScript(()=>{
    localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',musicVolume:0,audioVolume:0}));
    let seed=987654321;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__G?.mode==='menu',null,{timeout:300000});
  console.log('menu ready');
  result.native=await page.evaluate(async()=>{
    const G=window.__G,g=G.game,old=await import('/coverage-reference.mjs');
    g.debug.freeze();g._skipRender=true;g.menus.wipe.cancel();G.time=0;g.s3Clock.reset();
    let seed=11223;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    await g.startMatch({mapId:'hagglefish',mode:'turf',duration:180,difficulty:'normal'});
    await Promise.all(G.actors.map(a=>a.character._sourceMotionLoader));
    await Promise.all(G.actors.map(a=>a.character.sourceMotion?.ready));
    g._skipRender=true;
    const paint=G.paint,native=paint.coverage,stats={calls:0,recomputes:0,full:0,verifiedUnchanged:0,partial:0,suffixCells:0,fullCells:0,cadences:[]};
    let capture=null,previousGrid=null,previousVersion=paint.version;
    const base64=view=>{const bytes=new Uint8Array(view.buffer,view.byteOffset,view.byteLength);let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);};
    paint.coverage=function(...args){
      const priorIndex=this._s3CoverageIndex,replay=priorIndex?.replay;
      const kind=this._s3ObservedPaintVersion!==this.version?'unknown':this._s3CoverageVersion!==this._s3TurfVersion?'turf':previousVersion!==this.version?'wall':'read';
      const changed=this._s3CoverageVersion!==this._s3TurfVersion||this._s3CoverageGrid!==this.grid||this._s3CoverageDead!==this.dead||this._s3CoverageFaces!==this.paintFaces;
      const full=this._s3CoverageFullScan||this._s3ObservedPaintVersion!==this.version||this._s3CoverageGrid!==this.grid||this._s3CoverageDead!==this.dead||this._s3CoverageFaces!==this.paintFaces;
      let suffix=null;
      if(changed&&replay?.valid&&!full){
        let first=0;
        for(;first<replay.groups.length;first++){
          const group=replay.groups[first],value=group<0?this.grid[~group]:replay.words[group];
          if(value!==replay.ownership[first])break;
        }
        suffix=first===replay.groups.length?0:priorIndex.cells.length-replay.checkpoints[first>>>8];
      }
      const actual=native.apply(this,args),expected=old.indexedFloorCoverage(this);stats.calls++;
      if(!Object.is(actual[0],expected[0])||!Object.is(actual[1],expected[1]))throw Error('Coverage changed at call '+stats.calls+': '+actual+' vs '+expected);
      if(changed){
        stats.recomputes++;stats.fullCells+=this._s3CoverageIndex.cells.length;
        if(suffix===null){stats.full++;stats.suffixCells+=this._s3CoverageIndex.cells.length;}
        else{stats.suffixCells+=suffix;if(suffix===0)stats.verifiedUnchanged++;else stats.partial++;}
      }
      if(!capture){
        const index=this._s3CoverageIndex;
        capture={schema:1,stage:'hagglefish',grid:base64(this.grid),cells:base64(index.cells),weights:base64(index.weights),area:index.area,
          gridLength:this.grid.length,eligibleCells:index.cells.length,initialResult:[...actual],initialUsesOut:!!args[0],events:[],
          limits:['Eligible-cell ownership deltas and actual coverage call/publication classes from one native browser match. Noneligible ownership edits are excluded because they cannot affect the indexed sum.','The capture instruments coverage and compares the old full scan; it contains no timing measurements.']};
        previousGrid=this.grid.slice();
      }else{
        const writes=[];
        for(const cell of this._s3CoverageIndex.cells)if(previousGrid[cell]!==this.grid[cell]){writes.push(cell,this.grid[cell]);previousGrid[cell]=this.grid[cell];}
        capture.events.push({kind,writes,usesOut:!!args[0],expected:[...actual]});
      }
      previousVersion=this.version;
      return actual;
    };
    for(let i=0,n=(g.match.turfIntroFrames??253)+47;i<n;i++)g._frame(1/60);
    g.debug.fire(true);for(let i=0;i<3;i++)g._frame(1/60);g.debug.fire(false);
    for(let i=0;i<120;i++)g._frame(1/60);
    g.debug.key('KeyW',true);g.debug.fire(true);
    for(const hz of [30,60,120]){
      const before=stats.calls;
      for(let i=0;i<120;i++){seed=(24680+Math.imul(i,2654435761))>>>0;g.rig.yaw+=.6/hz;g._frame(1/hz);}
      stats.cadences.push({hz,frames:120,comparedCalls:stats.calls-before});
    }
    g.debug.key('KeyW',false);g.debug.fire(false);
    const index=paint._s3CoverageIndex,r=index.replay;
    if(!r?.valid)throw Error('Native coverage replay did not activate');
    return {capture,native:!!G.level.native,sourceMode:G.level.manifest.sourceMode,sourceSha256:G.level.manifest.sourceSha256,
      actors:G.actors.length,bots:G.actors.filter(a=>a.bot).length,state:G.match.state,gridCells:paint.grid.length,
      paintFaces:paint.paintFaces.length,eligibleCells:index.cells.length,groups:r.groups.length,
      fourByteGroups:Array.from(r.groups).filter(n=>n>=0).length,singleCellGroups:Array.from(r.groups).filter(n=>n<0).length,
      checkpointCount:r.checkpoints.length,persistentExtraBytes:r.groups.byteLength+r.ownership.byteLength+r.checkpoints.byteLength+r.prefix0.byteLength+r.prefix1.byteLength,
      originalIndexBytes:index.cells.byteLength+index.weights.byteLength,stats,coverage:paint.coverage(),contextLost:G.renderer.getContext().isContextLost()};
  });
  assert.equal(result.native.native,true);assert.equal(result.native.actors,8);assert.equal(result.native.bots,7);
  assert.equal(result.native.contextLost,false);assert.equal(result.native.state,'playing');assert.deepEqual(result.errors,[]);
  assert.ok(result.native.stats.partial>0);result.status='passed';
  const capture=result.native.capture;delete result.native.capture;
  capture.sourceSha=sourceSha;capture.contentHash=build.contentHash;capture.nativeSourceSha256=result.native.sourceSha256;
  fs.writeFileSync(evidence+'/ownership.json',JSON.stringify(capture)+'\n');
}catch(error){result.status='failed';result.error=error.stack;process.exitCode=1;}
finally{
  if(browser){await browser.close();result.browserClosed=true;}
  await new Promise(resolve=>server.close(resolve));result.serverClosed=true;
  fs.writeFileSync(evidence+'/result.json',JSON.stringify(result,null,2)+'\n');
}
console.log(JSON.stringify(result));
