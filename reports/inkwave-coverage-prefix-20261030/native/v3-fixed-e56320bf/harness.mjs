import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { verifyRuntimeBuild, hash, indexPrebuiltRuntimeAssets, persistentBrowserTemp } from '../scripts/lib/inkwave-runtime-evidence.mjs';
import { launchSandboxBrowser } from '../scripts/lib/inkwave-sandbox-browser.mjs';

const root = path.resolve(import.meta.dirname, '..'), site = root + '/_site';
const sourceSha = 'e56320bfd6c043187744f813c08297a3d2be9758';
const evidence = root + '/.ci-scratch/coverage-native-v3-fixed'; fs.mkdirSync(evidence, {recursive:true});
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
    const G=window.__G,g=G.game,old=await import('/coverage-reference.mjs'),current=await import('/patches/splatoon3/runtime/scoring.mjs');
    const little=new Uint8Array(new Uint32Array([1]).buffer)[0]===1;
    const masks=Uint32Array.from({length:16},(_,mask)=>{let word=0;for(let byte=0;byte<4;byte++)if(mask&1<<byte)word|=255<<(little?byte*8:(3-byte)*8);return word>>>0;});
    const bits=values=>{const buffer=new ArrayBuffer(16),view=new DataView(buffer);view.setFloat64(0,values[0],true);view.setFloat64(8,values[1],true);return Array.from(new Uint8Array(buffer),n=>n.toString(16).padStart(2,'0')).join('');};
    const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
    g.debug.freeze();g._skipRender=true;g.menus.wipe.cancel();G.time=0;g.s3Clock.reset();
    let seed=11223;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    await g.startMatch({mapId:'hagglefish',mode:'turf',duration:180,difficulty:'normal'});
    await Promise.all(G.actors.map(a=>a.character._sourceMotionLoader));
    await Promise.all(G.actors.map(a=>a.character.sourceMotion?.ready));
    g._skipRender=true;
    const paint=G.paint,native=paint.coverage,stats={calls:0,recomputes:0,full:0,verifiedUnchanged:0,partial:0,suffixCells:0,fullCells:0,cadences:[],minActors:G.actors.length,minLiving:G.actors.length};
    paint.coverage=function(...args){
      const priorIndex=this._s3CoverageIndex,replay=priorIndex?.replay;
      const changed=this._s3ObservedPaintVersion!==this.version||this._s3CoverageVersion!==this._s3TurfVersion||this._s3CoverageGrid!==this.grid||this._s3CoverageDead!==this.dead||this._s3CoverageFaces!==this.paintFaces;
      const full=this._s3CoverageFullScan||this._s3ObservedPaintVersion!==this.version||this._s3CoverageGrid!==this.grid||this._s3CoverageDead!==this.dead||this._s3CoverageFaces!==this.paintFaces;
      let suffix=null;
      if(changed&&replay?.valid&&!full){
        let first=0;
        for(;first<replay.groups.length;first++){
          const group=replay.groups[first],value=(replay.words[group>>>4]&masks[group&15])>>>0;
          if(value!==replay.ownership[first])break;
        }
        suffix=first===replay.groups.length?0:priorIndex.cells.length-replay.starts[(first>>>8)*256];
      }
      const actual=native.apply(this,args),expected=old.indexedFloorCoverage(this);stats.calls++;
      if(!Object.is(actual[0],expected[0])||!Object.is(actual[1],expected[1]))throw Error('Coverage changed at call '+stats.calls+': '+actual+' vs '+expected);
      if(changed){
        stats.recomputes++;stats.fullCells+=this._s3CoverageIndex.cells.length;
        if(suffix===null){stats.full++;stats.suffixCells+=this._s3CoverageIndex.cells.length;}
        else{stats.suffixCells+=suffix;if(suffix===0)stats.verifiedUnchanged++;else stats.partial++;}
      }
      return actual;
    };
    for(let i=0,n=(g.match.turfIntroFrames??253)+47;i<n;i++)g._frame(1/60);
    g.debug.fire(true);for(let i=0;i<3;i++)g._frame(1/60);g.debug.fire(false);
    for(let i=0;i<120;i++)g._frame(1/60);
    g.debug.key('KeyW',true);g.debug.fire(true);
    for(const hz of [30,60,120]){
      const before=stats.calls;
      for(let i=0;i<120;i++){seed=(24680+Math.imul(i,2654435761))>>>0;g.rig.yaw+=.6/hz;g._frame(1/hz);stats.minActors=Math.min(stats.minActors,G.actors.length);stats.minLiving=Math.min(stats.minLiving,G.actors.filter(a=>a.alive).length);}
      stats.cadences.push({hz,frames:120,comparedCalls:stats.calls-before,actors:G.actors.length,state:G.match.state,counts:[...paint.counts],coverage:[...paint.coverage()]});
    }
    g.debug.key('KeyW',false);g.debug.fire(false);
    const actorState=()=>G.actors.map(a=>({weapon:a.weaponId,pos:a.pos.toArray(),vel:a.vel.toArray(),hp:a.hp,ink:a.ink,alive:a.alive,stats:structuredClone(a.stats)}));
    const beforeCases={actors:actorState(),time:G.time,state:G.match.state,counts:[...paint.counts],coverage:[...paint.coverage()]};
    const identities={grid:paint.grid,dead:paint.dead,faces:paint.paintFaces},savedGrid=paint.grid.slice(),gridShaBefore=await digest(savedGrid);
    const cells=paint._s3CoverageIndex.cells,weights=paint._s3CoverageIndex.weights;
    let first=0,last=cells.length-1;while(!(weights[first]>0))first++;while(!(weights[last]>0))last--;
    const early=cells[first],late=cells[last],middle=cells[Math.floor((first+last)/2)];
    class ReferencePaint{}old.installScoring({PaintSystem:ReferencePaint});
    const referencePaint=Object.assign(new ReferencePaint(),{grid:paint.grid,dead:paint.dead,paintFaces:paint.paintFaces,version:0});
    const wrapped=paint.coverage;paint.coverage=native;
    const directCases=[];
    const compare=(label,indexed=true)=>{
      const actual=native.call(paint),expected=referencePaint.coverage();
      if(bits(actual)!==bits(expected))throw Error(label+' differs from original coverage: '+actual+' vs '+expected);
      if(indexed&&bits(actual)!==bits(old.indexedFloorCoverage(paint)))throw Error(label+' differs from original indexed scan');
      directCases.push({label,value:[...actual],bits:bits(actual),referenceBits:bits(expected),indexedCompared:indexed,hasReplay:!!paint._s3CoverageIndex.replay});
      return actual;
    };
    const initial=compare('native initial published coverage');
    const change=cell=>{paint.grid[cell]=paint.grid[cell]===1?2:1;};
    change(early);current.notePaintMutation(paint,false);old.notePaintMutation(referencePaint,false);
    const wall=compare('silent early grid mutation then known wall publication retains cached snapshot',false);
    if(bits(wall)!==bits(initial))throw Error('Known wall write changed the old published snapshot');
    change(late);current.notePaintMutation(paint,true);old.notePaintMutation(referencePaint,true);
    compare('later known turf publication observes earlier silent mutation');
    change(middle);paint.version++;referencePaint.version++;
    compare('unknown public version mutation performs full fallback');
    paint.grid=paint.grid.slice();referencePaint.grid=paint.grid;compare('grid identity full fallback');
    paint.dead=paint.dead.slice();referencePaint.dead=paint.dead;compare('dead identity full fallback');
    paint.paintFaces=paint.paintFaces.slice();referencePaint.paintFaces=paint.paintFaces;compare('faces identity full fallback');
    const backing=paint.grid;
    paint.grid=new Proxy(backing,{get(target,key){return Reflect.get(target,key,target);}});referencePaint.grid=paint.grid;
    compare('Proxy grid uses original full scan');if(paint._s3CoverageIndex.replay)throw Error('Proxy grid entered word replay');
    const disguised=new Uint16Array(backing.length);disguised.set(backing);Object.setPrototypeOf(disguised,Uint8Array.prototype);
    Object.defineProperty(disguised,Symbol.toStringTag,{value:'Uint8Array'});paint.grid=disguised;referencePaint.grid=disguised;
    compare('prototype-disguised Uint16Array uses original full scan');if(paint._s3CoverageIndex.replay)throw Error('Disguised Uint16Array entered word replay');
    const view=new DataView(new ArrayBuffer(backing.length));Object.setPrototypeOf(view,Uint8Array.prototype);
    Object.defineProperty(view,Symbol.toStringTag,{value:'Uint8Array'});paint.grid=view;referencePaint.grid=view;
    const noOwners=compare('prototype-disguised DataView uses original full scan without throwing');
    if(paint._s3CoverageIndex.replay||noOwners.some(Boolean))throw Error('Disguised DataView fallback failed');
    paint.grid=identities.grid;paint.grid.set(savedGrid);paint.dead=identities.dead;paint.paintFaces=identities.faces;paint.version++;
    const restored=native.call(paint);if(bits(restored)!==bits(old.indexedFloorCoverage(paint)))throw Error('Restored native paint differs');
    paint.coverage=wrapped;
    const afterCases={actors:actorState(),time:G.time,state:G.match.state,counts:[...paint.counts],coverage:[...paint.coverage()]},gridShaAfter=await digest(paint.grid);
    if(JSON.stringify(beforeCases)!==JSON.stringify(afterCases)||gridShaBefore!==gridShaAfter)throw Error('Fallback tests changed live native game state');
    const index=paint._s3CoverageIndex,r=index.replay;
    if(!r?.valid)throw Error('Native coverage replay did not activate');
    return {native:!!G.level.native,sourceMode:G.level.manifest.sourceMode,sourceSha256:G.level.manifest.sourceSha256,
      actors:G.actors.length,bots:G.actors.filter(a=>a.bot).length,state:G.match.state,gridCells:paint.grid.length,
      paintFaces:paint.paintFaces.length,eligibleCells:index.cells.length,groups:r.groups.length,
      fullWordGroups:Array.from(r.groups).filter(n=>(n&15)===15).length,partialWordGroups:Array.from(r.groups).filter(n=>(n&15)!==15).length,
      checkpointCount:r.prefix0.length,persistentExtraBytes:r.groups.byteLength+r.ownership.byteLength+r.starts.byteLength+r.prefix0.byteLength+r.prefix1.byteLength,
      originalIndexBytes:index.cells.byteLength+index.weights.byteLength,stats,directCases,restoration:{exact:true,gridShaBefore,gridShaAfter,before:beforeCases,after:afterCases},coverage:paint.coverage(),contextLost:G.renderer.getContext().isContextLost()};
  });
  assert.equal(result.native.native,true);assert.equal(result.native.actors,8);assert.equal(result.native.bots,7);
  assert.equal(result.native.contextLost,false);assert.equal(result.native.state,'playing');assert.deepEqual(result.errors,[]);
  assert.ok(result.native.stats.partial>0);result.status='passed';
}catch(error){result.status='failed';result.error=error.stack;process.exitCode=1;}
finally{
  if(browser){await browser.close();result.browserClosed=true;}
  await new Promise(resolve=>server.close(resolve));result.serverClosed=true;
  fs.writeFileSync(evidence+'/result.json',JSON.stringify(result,null,2)+'\n');
}
console.log(JSON.stringify(result));
