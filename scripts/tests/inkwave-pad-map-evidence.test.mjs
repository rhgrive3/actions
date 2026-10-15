import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {waitForNativePadMap,assertPadMapEvidence,readPadMapScreenshot} from '../lib/inkwave-pad-map-evidence.mjs';

function sample(){
 const regions=Object.fromEntries(['map','disc','label','labelText','icon','guide','row','unselectedRow'].map(k=>[k,{x:20,y:20,width:40,height:20}]));
 return {state:{status:'ready',frames:60,entrance:[{name:'iw-hud-slide',playState:'finished',currentTime:800,endTime:800}],mapT:1,mapV:0,finiteRunning:0,mapOpacity:1,rowOpacity:1,labelOpacity:1,labelTextOpacity:1,labelText:'Target 1',iconOpacity:1,discOpacity:1,guideOpacity:1,index:1,beaconIndices:[1],rowIndices:[1],controllerIndex:1,targetMatches:true,cursor:false,guide:'A confirms',regions,viewport:{width:1024,height:768}},pixels:{scaleX:2,scaleY:2,disc:{bright:200,orange:400},icon:{bright:100},labelText:{bright:100},label:{bright:100},guide:{bright:100},row:{borderOrange:100},unselectedRow:{borderOrange:0}}};
}
test('pad-map acceptance rejects class-only, faded, blank, offscreen and wrong-target evidence',()=>{
 assertPadMapEvidence(sample());
 for(const change of [
  s=>s.state.status='failed',s=>s.state.entrance=[],s=>s.state.entrance[0].playState='running',s=>s.state.entrance[0].currentTime=100,
  s=>s.state.mapT=.9,s=>s.state.mapV=.1,s=>s.state.finiteRunning=1,s=>s.state.mapOpacity=0,s=>s.state.labelOpacity=.2,
  s=>s.state.labelText='Wrong target',s=>s.state.controllerIndex=2,s=>s.state.targetMatches=false,s=>s.state.rowIndices=[2],s=>s.state.beaconIndices=[1,2],
  s=>s.state.regions.disc.x=2000,s=>s.pixels.icon.bright=0,s=>s.pixels.disc.orange=0,s=>s.pixels.labelText.bright=0,s=>s.pixels.guide.bright=0,s=>s.pixels.row.borderOrange=0,s=>s.pixels.unselectedRow.borderOrange=100,
 ]){const s=sample();change(s);assert.throws(()=>assertPadMapEvidence(s));}
});

function fakeWait(mode){
 let now=0,frames=0;const timers=new Map();let nextId=0;
 const element={textContent:'Target 1',querySelector(){return this;},parentElement:null,getBoundingClientRect:()=>({x:20,y:20,width:40,height:20}),classList:{contains:()=>true}};
 const entrance={animationName:'iw-hud-slide',currentTime:0,playState:'running',effect:{getComputedTiming:()=>({iterations:1,endTime:800})}};
 const pulse={playState:'running',effect:{getComputedTiming:()=>({iterations:Infinity})}};
 const transition={playState:mode==='paused-transition'?'paused':'finished',pending:mode==='pending-transition',effect:{getComputedTiming:()=>({iterations:1})}};
 const chosen={...element,querySelector:selector=>mode==='missing-label'&&selector==='.iw-bcn__label'?null:element},other={...element,classList:{contains:()=>false}};
 const hud={_mapT:0,_mapV:1,map:{...element,getAnimations:()=>[entrance,pulse,transition]},beacons:[other,chosen],legendRows:[other,chosen],mapCursor:other,mapLegend:{querySelector:()=>({...element,textContent:'A confirms'})},_updMap(){if(mode==='frame-error')throw Error('native update failed');frames++;this._mapT=1;this._mapV=0;entrance.currentTime=now;if(mode==='cancelled')entrance.playState='idle';else if(mode!=='paused'&&now>=800)entrance.playState='finished';}};
 const target={};const sandbox={window:{navigationHud:hud,navigationMapFrame:{},navigationMapEntrance:[entrance],navigationTargets:[{},target]},controller:{padJumpIndex:1,padJumpTarget:{actor:target}},document:{fonts:{status:'loaded'}},performance:{now:()=>now},innerWidth:1024,innerHeight:768,getComputedStyle:()=>({display:'block',visibility:'visible',opacity:mode==='hidden'?'0':'1'}),
  setTimeout(fn,delay){const id=++nextId;timers.set(id,{fn,at:now+delay});return id;},clearTimeout(id){timers.delete(id);},cancelAnimationFrame(){},requestAnimationFrame(fn){const id=++nextId;queueMicrotask(()=>{now+=16;for(const [id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}fn(now);});return id;}};
 return vm.runInNewContext('('+waitForNativePadMap.toString()+')({index:1,timeoutMs:1200})',sandbox);
}
test('native readiness observes completion rather than class readiness or an arbitrary delay',async()=>{
 const ready=await fakeWait('normal');assert.equal(ready.status,'ready');assert(ready.elapsedMs>=800);assert(ready.frames>1);assert.equal(ready.finiteRunning,0,'infinite native pulse does not block entry');
 for(const mode of ['paused','cancelled','hidden','paused-transition','pending-transition']){const result=await fakeWait(mode);assert.equal(result.status,'failed',mode);assert(result.elapsedMs<=1216,mode+' must terminate');}
 for(const mode of ['missing-label','frame-error']){const result=await fakeWait(mode);assert.equal(result.status,'failed',mode);assert.match(result.reason,/native map (frame|snapshot) failed/);assert(result.elapsedMs<1200,'callback errors terminate immediately');}
});

test('decorated beacon and label boxes cannot substitute for text or icon pixels',()=>{
 const decorated=sample();decorated.pixels.disc.bright=10000;decorated.pixels.label.bright=10000;
 for(const key of ['icon','labelText']){const hidden=structuredClone(decorated);hidden.pixels[key].bright=0;assert.throws(()=>assertPadMapEvidence(hidden),new RegExp(key));}
});

test('presentation fixture restores all controller field descriptors including originally absent state',()=>{
 const code=fs.readFileSync(new URL('../check-inkwave-reliability.mjs',import.meta.url),'utf8');
 const capture=code.match(/controllerDescriptors:(Object.fromEntries\([^\n]+?\)\)) \};/)[1];
 const restore=code.match(/for\(const \[key,descriptor\]of Object.entries\(old.controllerDescriptors\)\)\{[^\n]+?\}/)[0];
 const controller={mapHeld:false,padJumpTarget:{old:true},padJumpIndex:-1,pendingRespawnJump:{queued:true},_mapGyroYaw:.3,_mapGyroPitch:.5,mapGyroTarget:{old:true},unrelated:123};
 Object.defineProperty(controller,'_mapGyroPitch',{value:.5,writable:true,configurable:true,enumerable:false});
 const original=Object.getOwnPropertyDescriptors(controller),context={controller};
 const old=vm.runInNewContext('({controllerDescriptors:'+capture+'})',context);
 assert.deepEqual(Object.keys(old.controllerDescriptors),['mapHeld','padJumpTarget','padJumpIndex','pendingRespawnJump','_mapGyroYaw','_mapGyroPitch','_mapGyroCursor','mapGyroTarget']);
 for(const key of Object.keys(old.controllerDescriptors))controller[key]=null;
 vm.runInNewContext(restore,{controller,old});
 assert.deepEqual(Object.getOwnPropertyDescriptors(controller),original);
});

test('screenshot readback counts actual RGB and selection-border regions',async()=>{
 const rgba=new Uint8ClampedArray(40*30*4);
 for(let y=0;y<30;y++)for(let x=0;x<40;x++){const edge=y<3||y>=27||x<3||x>=37;rgba.set(edge?[255,138,20,255]:[230,230,230,255],(y*40+x)*4);}
 const sandbox={Image:class{constructor(){this.naturalWidth=40;this.naturalHeight=30;}set src(_){queueMicrotask(()=>this.onload());}},document:{createElement:()=>({getContext:()=>({drawImage(){},getImageData:()=>({data:rgba})})})}};
 const stats=await vm.runInNewContext('('+readPadMapScreenshot.toString()+')({png:"data:image/png;base64,test",regions:{row:{x:0,y:0,width:40,height:30}},viewport:{width:40,height:30}})',sandbox);
 assert(stats.row.bright>0);assert(stats.row.orange>0);assert(stats.row.borderOrange>0);
 rgba.fill(0);const blank=await vm.runInNewContext('('+readPadMapScreenshot.toString()+')({png:"data:image/png;base64,test",regions:{row:{x:0,y:0,width:40,height:30}},viewport:{width:40,height:30}})',sandbox);assert.equal(blank.row.bright,0);assert.equal(blank.row.borderOrange,0);
});

test('production verifier keeps native presentation, pixel assertion and all five life-token cases',()=>{
 const code=fs.readFileSync(new URL('../check-inkwave-reliability.mjs',import.meta.url),'utf8');
 const block=code.slice(code.indexOf('window.navigationPrevious ='),code.indexOf('const respawnNavigation ='));
 assert(block.includes('controller.updatePadMapSelection(true)'));assert(block.includes('readPadMapScreenshot'));assert(block.includes('assertPadMapEvidence(sample)'));
 assert(!block.includes('hud._mapT = 1')&&!block.includes('hud._mapT=1')&&!block.includes('waitForTimeout')&&!block.includes("animations:'disabled'"));
 for(const mode of ['same-life-teleport','recycled-target','accepted-new-life','stale-selection','fresh-selection'])assert(code.includes("mode:'"+mode+"'"),mode);
});
