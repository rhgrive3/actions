import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {inspectTurfLeadScene,probeTurfLead} from '../lib/inkwave-turf-lead-probe.mjs';
import vm from 'node:vm';
import {inspectFrozenHudSurface, captureFrozenHud} from '../lib/inkwave-frozen-hud-capture.mjs';
import {adaptLocalBatch01} from '../../patches/splatoon3/local-batch-01-adapter.mjs';
import {cropBattleCanvas, resizeBattleCamera} from '../../patches/splatoon3/runtime/battle-framing.mjs';
import {portraitBlocked} from '../../patches/local-quality/portrait-guard.mjs';

// Execute the exact native resize/render methods after their real crop adapter.
// The GPU/DOM are deterministic fakes; this is not a browser screenshot test.
const native = fs.readFileSync(new URL('../../inkwave-public/src/core/renderer.js', import.meta.url),'utf8');
const composed = adaptLocalBatch01('src/core/renderer.js', native, (s,a,b) => {
  assert.equal(s.split(a).length,2); return s.replace(a,b);
});
const methods = composed.slice(composed.indexOf('\n  resize()'),composed.lastIndexOf('\n}'));
function fixture(ratio = 1) {
  const env = {innerWidth:1280,innerHeight:800};
  const canvas = {isConnected:true,style:{clipPath:'none'},width:0,height:0,
    box:{x:0,y:0,width:0,height:0},getBoundingClientRect(){return this.box;}};
  const camera = {aspect:1,userData:{s3BattleFrame:true,s3ReferenceVerticalFov:55},updateProjectionMatrix(){}};
  const m = {time:172,stateT:4};
  const G = {time:8,env:null,netm:null,game:{frozen:true,match:m,s3Clock:{ticks:480},_frame(){assert.fail('simulation frame forbidden');}}};
  let renderCalls=0;
  const ctx = vm.createContext({...env,window:env,cropBattleCanvas,resizeBattleCamera,G,s3ProbeG:G,
    getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1'})});
  const Renderer = vm.runInContext('(class {'+methods+'})',ctx), R=G.game.R=new Renderer();
  Object.assign(R,{_w:0,_h:0,_contextLost:false,camera,grade:{uniforms:{uAspect:{value:1}}},_fxaaTexel(){},
    renderer:{domElement:canvas,getPixelRatio:()=>ratio,getContext:()=>({isContextLost:()=>false}),
      setSize(w,h){canvas.box={x:0,y:0,width:w,height:h};canvas.width=Math.floor(w*ratio);canvas.height=Math.floor(h*ratio);}},
    composer:{setSize(){},render(){renderCalls++;}}});
  const viewport=()=>({width:env.innerWidth,height:env.innerHeight});
  const evaluate=(fn,arg)=>{ctx.arg=arg;return vm.runInContext('('+fn.toString()+')(arg)',ctx);};
  const resize=(width,height)=>{env.innerWidth=ctx.innerWidth=width;env.innerHeight=ctx.innerHeight=height;};
  const inspect=(redraw=false)=>evaluate(inspectFrozenHudSurface,{viewport:viewport(),redraw});
  const page={viewportSize:viewport,evaluate:async(fn,arg)=>evaluate(fn,arg),screenshot:async()=>{}};
  return {G,R,canvas,camera,env,ctx,viewport,resize,inspect,page,get renderCalls(){return renderCalls;}};
}
test('exact native methods reproduce stale portrait surface after old restore sequence, then redraw repairs it without ticking',()=>{
  const f=fixture();f.resize(375,812);f.R.render();
  const portrait=f.inspect();
  assert.equal(portrait.battleFrame.y,300.53125);assert.equal(portrait.battleFrame.height,210.9375);
  f.resize(1280,800); // old checker finally changes only Playwright viewport
  assert.throws(()=>f.inspect(),/stale renderer dimensions/);
  assert.equal(f.canvas.style.clipPath,'inset(300.53125px 0px)');
  const fixed=f.inspect(true);assert.equal(fixed.battleFrame.y,40);assert.equal(fixed.battleFrame.width,1280);
  assert.equal(f.canvas.style.clipPath,'inset(40px 0px)');assert.equal(f.G.time,8);assert.equal(f.G.game.s3Clock.ticks,480);
});
for(const [w,h] of [[1280,800],[375,812],[844,390]]) test(`preserve ${w}x${h} viewport and native centered crop`,()=>{
  const f=fixture(1.25);f.resize(w,h);const out=f.inspect(true);
  assert.equal(out.backing[0],Math.floor(w*1.25));assert.equal(out.backing[1],Math.floor(h*1.25));
  assert.ok(Math.abs(out.battleFrame.width/out.battleFrame.height-16/9)<1e-12);
});
test('capture brackets real screenshot with read-only verification and records identical receipts',async()=>{
  const f=fixture();let calls=0;f.page.screenshot=async()=>{calls++;f.inspect();};
  const result=await captureFrozenHud(f.page,{path:'unused.png'});
  assert.equal(calls,1);assert.equal(f.renderCalls,1);assert.deepEqual(result.before,result.after);
});
test('post-capture guard rejects viewport drift rather than repairing after screenshot',async()=>{
  const f=fixture();f.page.screenshot=async()=>f.resize(375,812);
  await assert.rejects(captureFrozenHud(f.page,{}),/viewport mismatch/);assert.equal(f.renderCalls,1);
});
for(const [name,mutate,message] of [
  ['CSS size',f=>f.canvas.box.width=375,/CSS bounds/],
  ['canvas position',f=>f.canvas.box.y=300,/CSS bounds/],
  ['backing size',f=>f.canvas.width=375,/drawing buffer/],
  ['crop',f=>f.canvas.style.clipPath='inset(300.53125px 0px)',/battle crop/],
  ['camera',f=>f.camera.aspect=375/812,/camera aspect/],
  ['context loss',f=>f.R._contextLost=true,/context lost/],
]) test('reject '+name+' without normalizing evidence',()=>{
  const f=fixture();f.inspect(true);mutate(f);assert.throws(()=>f.inspect(),message);assert.equal(f.renderCalls,1);
});
test('reject render that changes simulation and non-frozen/network fixtures',()=>{
  const f=fixture();const render=f.R.render.bind(f.R);f.R.render=()=>{render();f.G.time++;};
  assert.throws(()=>f.inspect(true),/advanced simulation/);
  const g=fixture();g.G.game.frozen=false;assert.throws(()=>g.inspect(true),/frozen offline/);
  g.G.game.frozen=true;g.G.netm={};assert.throws(()=>g.inspect(true),/frozen offline/);
});
test('portrait visual crop is distinct from touch input/simulation guard',()=>{
  const env={innerWidth:375,innerHeight:812,document:{documentElement:{classList:{contains:()=>false}}}};
  assert.equal(portraitBlocked({root:null},env),false);
  const mobile={root:{isConnected:true,classList:{contains:()=>true}}};
  assert.equal(portraitBlocked(mobile,env),false);
  env.document.documentElement.classList.contains=()=>true;assert.equal(portraitBlocked(mobile,env),true);
});
test('checker retains complete Turf and Splatling cases, real render restore and capture guards',()=>{
  const turf=fs.readFileSync(new URL('../lib/inkwave-turf-lead-probe.mjs',import.meta.url),'utf8');
  const hud=fs.readFileSync(new URL('../check-inkwave-hud-authority.mjs',import.meta.url),'utf8');
  assert.match(turf,/for \(const viewer of \[0,1\]\)/);
  assert.ok(turf.includes('[{width:1280,height:800}, {width:375,height:812}]'));
  for(const state of ['ahead','behind','below','tie'])assert.ok(turf.includes("['"+state+"',"));
  assert.match(turf,/setViewportSize\(viewport\);\s*await page.evaluate\(\(\) => globalThis.s3ProbeG.game.R.render\(\)\)/);
  assert.match(turf,/row.capture = await captureFrozenHud/);
  for(const name of ['first','second','full','partial-stream'])assert.ok(hud.includes("['"+name+"',"));
  for(const name of ['hidden','opacity','offscreen','stroke','zero-size','progress'])assert.ok(hud.includes("'"+name+"'"));
  assert.equal((hud.match(/await captureFrozenHud\(page,/g)||[]).length,5);
});

// Retain the existing exact-head Turf negative/cleanup regression verbatim.
function visibilityFixture(){
 const style=(extra={})=>({display:'flex',visibility:'visible',opacity:'1',transform:'none',...extra});
 const parent={style:style(),parentElement:null},classes=names=>({contains:n=>names.includes(n)});
 const squads=[0,1].map(i=>({parentElement:parent,style:style({transform:i?'none':'scale'}),alert:style({display:i?'block':'none',content:'"Danger!"',left:'40px',top:'35px',width:'40px',height:'15px',boxSizing:'border-box'}),dataset:{turfAlert:i?'Danger!':''},classList:classes([i?'is-turf-danger':'is-turf-leading']),children:[{},{},{},{}],querySelectorAll:()=>[],getBoundingClientRect:()=>({x:i?130:10,y:10,left:i?130:10,right:i?210:90,top:10,bottom:30,width:80,height:20})}));
 const actors=[{team:0,alive:true,isLocal:true},{team:1,alive:true,isLocal:false}],oldCoverage=()=>[.4,.4],paint=Object.create({coverage:oldCoverage});
 const g={frozen:true,match:{mode:'turf',state:'playing',actors,local:actors[0]},hud:{squads,timer:{getBoundingClientRect:()=>({left:100,right:120})}},R:{render(){}},_updateHud(){}};
 const G={game:g,paint,local:actors[0]},ctx=vm.createContext({s3ProbeG:G,turfLeadProof:{pair:[]},innerWidth:375,innerHeight:812,getComputedStyle:(el,pseudo)=>pseudo?el.alert:el.style,DOMMatrixReadOnly:class{constructor(){this.a=1.08;this.e=0;this.f=0;}}});
 const inspect=()=>vm.runInContext(`(${inspectTurfLeadScene.toString()})({name:'ahead',pair:[.6,.2],viewer:0})`,ctx);
 return{ctx,G,g,squads,parent,oldCoverage,inspect};
}
test('browser inspector rejects invisible ancestors, squads, Danger labels and offscreen labels',()=>{
 const f=visibilityFixture();assert.equal(f.inspect().squads.length,2);
 for(const [object,key,value] of [[f.parent.style,'visibility','hidden'],[f.parent.style,'opacity','0'],[f.parent.style,'display','none'],[f.squads[0].style,'visibility','hidden'],[f.squads[1].alert,'visibility','hidden'],[f.squads[1].alert,'opacity','0'],[f.squads[1].alert,'left','400px']]){
  const old=object[key];object[key]=value;assert.throws(()=>f.inspect(),/not visibly presented|not visible/,key+'='+value);object[key]=old;
 }
 assert.equal(f.inspect().squads.length,2);
});
test('browser probe saves the failed controlled scene and phase before restoring state and viewport',async()=>{
 const f=visibilityFixture(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-turf-probe-negative-')),saved={coverage:f.G.paint.coverage,local:f.g.match.local,flags:f.g.match.actors.map(a=>a.isLocal)},calls=[];
 f.parent.style.opacity='0';
 const page={viewportSize:()=>({width:900,height:600}),setViewportSize:async v=>{calls.push(['viewport',v.width]);f.ctx.innerWidth=v.width;f.ctx.innerHeight=v.height;},evaluate:async(fn,arg)=>{f.ctx.arg=arg;return vm.runInContext(`(${fn.toString()})(arg)`,f.ctx);},screenshot:async opts=>{calls.push(['screenshot',f.G.paint.coverage!==saved.coverage,opts.path]);}};
 await assert.rejects(()=>probeTurfLead(page,dir),/not visibly presented/);
 const receipt=JSON.parse(fs.readFileSync(path.join(dir,'turf-lead-failure.json'),'utf8'));
 assert.equal(receipt.phase.name,'ahead');assert.equal(receipt.phase.viewer,0);assert.equal(receipt.rows.length,0);assert.equal(receipt.screenshot,'turf-lead-failure.png');assert(calls.some(c=>c[0]==='screenshot'&&c[1]===true),'capture must precede restoring controlled coverage');
 assert.equal(f.G.paint.coverage,saved.coverage);assert.equal(Object.hasOwn(f.G.paint,'coverage'),false);assert.equal(f.g.match.local,saved.local);assert.deepEqual(f.g.match.actors.map(a=>a.isLocal),saved.flags);assert.equal(f.g.match.state,'playing');assert.equal(f.ctx.turfLeadProof,undefined);assert.equal(calls.at(-1)[1],900);
});


