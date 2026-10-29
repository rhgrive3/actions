import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {pausedWorldFrame} from '../idle-resources.mjs';
import {createPresentationClock} from '../presentation-clock.mjs';

const source = rel => adaptBuildSource(rel, fs.readFileSync(new URL('../../../inkwave-public/'+rel, import.meta.url),'utf8'));
function wipeFixture() {
  const code=source('src/ui/menu-art.js');
  const declaration=parse(code,{ecmaVersion:'latest',sourceType:'module'}).body.find(n=>n.declaration?.id?.name==='InkWipe').declaration;
  let next=0;const rafs=new Set(),timers=new Set(),clears=[];
  const context=vm.createContext({innerWidth:1194,innerHeight:834,devicePixelRatio:2,performance:{now:()=>0},
    cancelAnimationFrame:id=>rafs.delete(id),clearTimeout:id=>timers.delete(id),safeCall:fn=>fn?.(),
    requestAnimationFrame:()=>{rafs.add(++next);return next;},setTimeout:()=>{timers.add(++next);return next;},
    rng:()=>()=>.5,shade:()=>'',TAU:Math.PI*2,WIPE:{mid:380,total:1000}});
  context.createPresentationClock=()=>createPresentationClock(context);
  const Wipe=vm.runInContext('('+code.slice(declaration.start,declaration.end)+')',context);
  const owner=Object.assign(Object.create(Wipe.prototype),{
    r:null,cv:{width:1,height:1},ctx:{setTransform(){},clearRect(...args){clears.push(args);}},
    host:{classList:{add(){},remove(){}},dataset:{}},mark:{classList:{add(){},remove(){}},offsetWidth:0},
    _setupFull(){},_setupLight(){},_frame(){},
  });
  return {owner,rafs,timers,clears};
}
for(const mode of ['full','light','fade']) test(`completed/cancelled ${mode} wipe releases iPad backing storage and all callbacks`,()=>{
  const f=wipeFixture(),w=f.owner;
  for(let i=0;i<12;i++) {
    let mid=0,done=0;
    w.run({mode,onMid(){mid++;},onDone(){done++;}});
    assert.deepEqual([w.cv.width,w.cv.height],[1791,1251]);
    w._pat={};w.cancel();w.cancel();
    assert.equal(mid,1);assert.equal(done,1);
    assert.deepEqual([w.cv.width,w.cv.height],[1,1]);assert.equal(w._pat,null);
    assert.equal(f.rafs.size,0);assert.equal(f.timers.size,0);
  }
});
test('onMid or onDone may start another wipe without its canvas being cleared or parked',()=>{
  for(const callback of ['onMid','onDone']) {
    const f=wipeFixture(),w=f.owner;
    w.run({mode:'full',[callback](){w.run({mode:'light'});}});
    w.cancel();
    assert.equal(w.r.mode,'light');assert.deepEqual([w.cv.width,w.cv.height],[1791,1251]);
    if(callback==='onMid')assert.equal(f.clears.length,0);
    assert.equal(f.rafs.size,1);assert.equal(f.timers.size,1);
    w.cancel();assert.deepEqual([w.cv.width,w.cv.height],[1,1]);
  }
});

test('backgrounding a paused page releases its snapshot without RAF and recaptures on return',()=>{
  const target=()=>({events:new Map(),addEventListener(k,fn){this.events.set(k,fn);},removeEventListener(k,fn){if(this.events.get(k)===fn)this.events.delete(k);}});
  const document=target(),canvas={...target(),ownerDocument:document},G={renderer:{domElement:canvas}};
  let releases=0;
  const game={match:{paused:true},R:{releasePausedFrame(){releases++;}}};
  pausedWorldFrame(game,G).commit();
  for(let i=0;i<60;i++)assert.equal(pausedWorldFrame(game,G).draw,false);
  document.hidden=true;document.events.get('visibilitychange')();
  assert.equal(releases,1);assert.equal(game._pausedWorld,null);
  document.hidden=false;document.events.get('visibilitychange')();
  const frame=pausedWorldFrame(game,G);assert.equal(frame.draw,true);frame.commit();
  assert.equal(pausedWorldFrame(game,G).draw,false);
  const oldReleases=releases;
  G.renderer.domElement={...target(),ownerDocument:target()};
  pausedWorldFrame(game,G);
  assert.equal(canvas.events.size,0);assert.equal(document.events.size,0);
  assert.equal(releases,oldReleases);assert.equal(G.renderer.domElement.ownerDocument.events.size,1);
});

test('paused invalidation frees the superseded snapshot before allocating real frame targets',()=>{
  const code=source('src/main.js'), matches=[];
  const visit=node=>{
    if(!node||typeof node!=='object')return;
    if(node.type==='IfStatement'&&code.slice(node.test.start,node.test.end)==='!this._skipRender && !document.hidden')matches.push(node);
    for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
  };
  visit(parse(code,{ecmaVersion:'latest',sourceType:'module'}));
  assert.equal(matches.length,1,'one complete native render guard');
  const render=new Function('setUp','menuAttractBudget','pausedFrame','sm','document',code.slice(matches[0].start,matches[0].end));
  const events=[],game={R:{releasePausedFrame(){events.push('release');},render(){events.push('render');},capturePausedFrame(){events.push('capture');return true;}},showcase:{render(){}}};
  render.call(game,false,false,{paused:true,draw:true,commit(){events.push('commit');}},{},{hidden:false});
  assert.deepEqual(events,['release','render','capture','commit']);
});

test('snapshot allocation follows composer disposal, including fallback after copy failure',()=>{
  const text=fs.readFileSync(new URL('../pause-frame-retention.mjs',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'').replace('export function','function');
  const events=[];
  class Vector2{}
  class FramebufferTexture{constructor(w,h){events.push('allocate');this.image={width:w,height:h};}dispose(){events.push('dispose');}}
  class Renderer{}
  new Function('THREE','FullScreenQuad','Renderer',text+';installPausedFrameRetention(Renderer);')({Vector2,FramebufferTexture},class{},Renderer);
  const R=new Renderer();
  R.renderer={getContext:()=>({isContextLost:()=>false}),getDrawingBufferSize:v=>Object.assign(v,{x:1194,y:834}),getRenderTarget:()=>null,copyFramebufferToTexture(){events.push('copy');}};
  R.composer={renderToScreen:true,releaseInactiveTargets(){events.push('release-composer');}};
  assert.equal(R.capturePausedFrame(),true);assert.deepEqual(events,['release-composer','allocate','copy']);
  R.releasePausedFrame();events.length=0;R.renderer.copyFramebufferToTexture=()=>{throw Error('copy failed');};
  assert.equal(R.capturePausedFrame(),false);assert.equal(R._pauseSnapshot,null);
  assert.deepEqual(events,['release-composer','allocate','dispose']);
});
