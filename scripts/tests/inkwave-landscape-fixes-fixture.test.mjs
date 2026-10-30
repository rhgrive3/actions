import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fixtureHTML,createFixtureServer,assertBaselineReproduction,VIEWPORTS,clippingVisibility,stickyRevealDelta,groupGlyphLines,parkDrawerPointer} from '../check-inkwave-landscape-fixes.mjs';
const script=fs.readFileSync(new URL('../check-inkwave-landscape-fixes.mjs',import.meta.url),'utf8');
test('exact bounded landscape matrix has no portrait or battle case',()=>{assert.deepEqual(VIEWPORTS, [{width:844,height:390},{width:1133,height:744},{width:740,height:360},{width:915,height:412}]);assert(VIEWPORTS.every(v=>v.width>v.height));assert(!script.includes('screenshot('));assert(!script.includes('recordVideo'));assert(!script.includes('--no-sandbox'));});
test('fixture uses actual packaged stylesheet order and offline runtime, not reconstructed CSS',()=>{const s=fixtureHTML({variant:'candidate',screen:'loadout',lang:'ja'});const order=['/candidate/styles/ui.css','/candidate/styles/mobile.css','/candidate/patches/splatoon3/ui.css'];assert(order.every((v,i)=>s.indexOf(v)>=0&&(i===0||s.indexOf(order[i-1])<s.indexOf(v))));assert(s.includes('G.net=new MockNet()'));assert(s.includes('localizeGameContent({...config,LANG})'));assert(s.includes('data:,'));assert(!s.includes('classList.add(\'iw-touch\')'));assert(!s.includes('new WebSocket'));});
test('unknown fixture variants/screens/languages fail closed',()=>{for(const values of [{variant:'other',screen:'main',lang:'ja'},{variant:'candidate',screen:'match',lang:'ja'},{variant:'candidate',screen:'main',lang:'other'}])assert.throws(()=>fixtureHTML(values));});
test('server returns actual bytes/hash, rejects absent and escaping resources without listening',()=>{const parent=path.resolve(process.env.INKWAVE_QA_TEST_TMP||new URL('../../.ci-scratch/landscape-fixture-tests',import.meta.url).pathname);fs.mkdirSync(parent,{recursive:true});const root=fs.mkdtempSync(path.join(parent,'owned-'));fs.writeFileSync(path.join(root,'probe.css'),'body{}');const served=new Map(),server=createFixtureServer({baseline:root,candidate:root},served);const request=url=>{const response={status:null,headers:null,body:null,writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=body;}};server.emit('request',{url},response);return response;};try{assert.equal(request('/candidate/probe.css').status,200);assert.equal(request('/candidate/probe.css').body.toString(),'body{}');assert.equal(served.get('candidate/probe.css').sha256.length,64);assert.equal(request('/candidate/missing.css').status,404);assert.equal(request('/candidate/%2e%2e%2fprivate').status,404);assert.equal(request('/unrecognized').status,404);}finally{fs.rmSync(root,{recursive:true,force:true});server.close();}});
const action=n=>Array.from({length:7},(_,i)=>({class:'iw-btn--menu',inView:i<n,hit:i<n}));
function baselineCases(){return [{variant:'baseline',screen:'main',viewport:{width:844,height:390},lang:'ja',initial:{targets:action(3)}},{variant:'candidate',screen:'main',viewport:{width:844,height:390},lang:'ja',initial:{targets:action(7)}},{variant:'baseline',screen:'settings',viewport:{width:844,height:390},lang:'ja',initial:{settingsTabRows:2}},{variant:'baseline',screen:'online',viewport:{width:844,height:390},lang:'ja',initial:{nativeCode:{inView:false}}},{variant:'baseline',screen:'loadout',viewport:{width:1133,height:744},lang:'ja',initial:{grid:{columns:'110px 110px'},visibleNames:[{clamp:'2'}]},baselineLongNames:[{name:'Long Scope',clamp:'2',client:[90,30],scroll:[90,45],lines:['Long','Charger','Scope']}],baselineDrawer:{columns:'107px 107px',names:[{id:'shooter',lines:['スプラシュータ','ー']}]}}];}
test('baseline reproduction requires concrete historical failures plus candidate improvement',()=>{assert.equal(assertBaselineReproduction(baselineCases()).home.candidateVisible,7);const missing=baselineCases().slice(1);assert.throws(()=>assertBaselineReproduction(missing),/missing canonical/);for(const edit of [cs=>cs[0].initial.targets=action(7),cs=>cs[2].initial.settingsTabRows=1,cs=>cs[3].initial.nativeCode.inView=true,cs=>cs[4].initial.grid.columns='140px 140px',cs=>cs[4].initial.visibleNames=[{clamp:'none'}],cs=>cs[4].baselineLongNames=[{clamp:'none',client:[90,30],scroll:[90,30],lines:['Scope']}],cs=>cs[4].baselineDrawer.columns='140px 140px',cs=>cs[4].baselineDrawer.names[0].lines=['スプラシューター'],cs=>cs[1].initial.targets=action(4)]){const cs=baselineCases();edit(cs);assert.throws(()=>assertBaselineReproduction(cs));}});
test('resource/font/animation and scroll readiness are fail-closed without screenshot artifacts',()=>{assert.match(script,/required production font unavailable/);assert.match(script,/resource\/network failure/);assert.match(script,/unloaded empty menu/);assert.match(script,/unexpected websocket/);assert.match(script,/routeWebSocket\('\*\*\/\*'/);assert.match(script,/wrong mock error for/);assert.match(script,/reopen duplicate room handlers/);assert.match(script,/complete notice not readable/);assert.match(script,/t\.hit&&t\.unclipped/);assert.match(script,/external request blocked/);assert.match(script,/responsiveAnimationsSettled/);assert.match(script,/native grid warmup did not establish stable bottom/);assert.match(script,/content-visibility corrections/);assert.match(script,/await context\.close\(\)/);assert.match(script,/await browser\?\.close\(\)/);});
test('workflow is one read-only PR job on exact base/head production builds',()=>{const workflow=fs.readFileSync(new URL('../../.github/workflows/inkwave-landscape-fixes-browser.yml',import.meta.url),'utf8');assert.match(workflow,/permissions:\n  contents: read/);assert.equal((workflow.match(/^  bounded-landscape:/gm)||[]).length,1);assert(!workflow.includes('pull_request_target'));assert(!workflow.includes('secrets.'));assert(!workflow.includes('workflow_dispatch'));assert.match(workflow,/ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);assert.match(workflow,/ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);assert.match(workflow,/esbuild@0\.28\.2 playwright@1\.62\.1/);assert.match(workflow,/fonts-noto-cjk fonts-noto-cjk-extra/);assert.match(workflow,/\.build\.revision/);assert.match(workflow,/runs-on: ubuntu-22\.04/);assert.match(workflow,/github\.head_ref == 'fix\/landscape-ui-targeted-20261030'/);assert.match(workflow,/landscape-weapon-header\.test\.mjs/);assert.match(workflow,/landscape-weapon-drawer\.test\.mjs/);assert.match(workflow,/retention-days: 14/);assert.match(workflow,/if-no-files-found: error/);});

test('fixed-root document overflow uses viewport bounds but real nested scrollers still clip',()=>{
 const box=(tag,bounds,style={overflowX:'visible',overflowY:'visible'},parent=null)=>({tagName:tag,className:'test-'+tag,style,parentElement:parent,clientLeft:0,clientTop:0,clientWidth:bounds.right-bounds.left,clientHeight:bounds.bottom-bounds.top,getBoundingClientRect:()=>bounds});
 const html=box('HTML',{left:0,top:0,right:844,bottom:0});const body=box('BODY',{left:0,top:0,right:844,bottom:0},{overflowX:'hidden',overflowY:'hidden'},html);const root=box('DIV',{left:0,top:0,right:844,bottom:390},{overflowX:'hidden',overflowY:'hidden',position:'fixed'},body);
 const measure=element=>vm.runInNewContext('('+clippingVisibility.toString()+')(element)',{element,document:{body,documentElement:html},innerWidth:844,innerHeight:390,getComputedStyle:e=>e.style});
 const input=box('INPUT',{left:40,top:250,right:500,bottom:301},undefined,root);assert.equal(measure(input).unclipped,true,'zero-height body falsely rejects fully visible fixed UI');root.style.position='static';assert.equal(measure(input).unclipped,false,'non-fixed descendants must not bypass ordinary body box clipping');root.style.position='fixed';
 const scroller=box('DIV',{left:20,top:100,right:520,bottom:280},{overflowX:'hidden',overflowY:'auto'},root);input.parentElement=scroller;const clipped=measure(input);assert.equal(clipped.unclipped,false);assert.equal(clipped.clippedBy[0].tag,'DIV');assert.equal(clipped.clippedBy[0].documentViewport,false);
 const outside=box('BUTTON',{left:40,top:380,right:100,bottom:420},undefined,root);assert.equal(measure(outside).unclipped,false,'viewport bottom still clips');
});

test('drawer coverage stays within existing canonical cases and uses real offline UI lifecycle',()=>{assert.match(script,/assert\(\[844,1133\]\.includes\(v\.width\)/);assert.match(script,/drawerAcceptance\(page,v,true\)/);assert.match(script,/G\.net\.isMock===true/);assert.match(script,/drawer last weapon/);assert.match(script,/reopened drawer lost equipped state/);assert.match(script,/drawer touch close/);assert.match(script,/Escape/);assert.match(script,/roomCleanup='offline'/);assert.match(script,/wipe\?\.running/);assert(!script.includes('startMatch('));});

test('rotated clipping cards use local padding bounds and still reject real overflow',()=>{
 const angle=-3*Math.PI/180,a=Math.cos(angle),b=Math.sin(angle),c=-b,d=a;
 const node=(tag,x,y,width,height,parent,transform='none')=>{
  const points=[[x,y],[x+width,y],[x+width,y+height],[x,y+height]].map(([px,py])=>({x:100+a*px+c*py,y:80+b*px+d*py}));
  return {tagName:tag,className:tag,parentElement:parent,clientLeft:0,clientTop:0,clientWidth:width,clientHeight:height,offsetWidth:width,offsetHeight:height,
   style:{width:String(width),height:String(height),boxSizing:'border-box',overflowX:'visible',overflowY:'visible',transform},
   getBoundingClientRect:()=>({left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))})};
 };
 const card=node('BUTTON',0,0,143,112,null,`matrix(${a},${b},${c},${d},0,0)`);card.style.overflowX=card.style.overflowY='hidden';
 const name=node('SPAN',4,62,139,32,card),measure=element=>vm.runInNewContext('('+clippingVisibility.toString()+')(element)',{element,document:{},innerWidth:844,innerHeight:390,getComputedStyle:e=>e.style});
 assert(name.getBoundingClientRect().right>card.getBoundingClientRect().left+card.clientWidth+1,'reproduces the mixed-coordinate false failure');
 assert.equal(measure(name).unclipped,true);
 assert.equal(measure(node('SPAN',4,62,145,32,card)).unclipped,false,'real local right overflow still fails');
 assert.equal(measure(node('SPAN',4,100,100,20,card)).unclipped,false,'real local bottom overflow still fails');
 card.style.transform='matrix(0,0,0,0,0,0)';assert.throws(()=>measure(name),/singular/);
});

test('sticky drawer correction uses a normal bounded scroll without accepting occluded hits',()=>{const target={top:20},header={bottom:100},delta=stickyRevealDelta(target,header);assert.equal(delta,-88);assert(target.top-delta>=header.bottom+8);assert.equal(stickyRevealDelta({top:120},header),0);assert.match(script,/native-wheel-clear-sticky-header/);assert.match(script,/t\.inView&&t\.hit&&t\.unclipped/);});

const row = (text,top=0,{height=16.9,slope=.34}={})=>[...text].map((char,i)=>({char,left:i*13,top:top+i*slope,width:13,height}));
test('native tilted one-line Japanese name is not reported as many orphan fragments',()=>{
  const glyphs=row('スプラシューター');
  const old=new Map();for(const g of glyphs){const y=Math.round(g.top*2)/2;old.set(y,(old.get(y)||'')+g.char);}
  assert([...old.values()].slice(1).some(s=>s.startsWith('ー')),'reproduce old rounded-top false failure');
  assert.deepEqual(groupGlyphLines(glyphs,16.9),['スプラシューター']);
});
test('real wrapped orphan remains a second physical line and still fails the orphan policy',()=>{
  const lines=groupGlyphLines([...row('スプラシュータ'),...row('ー',16.9)],16.9);
  assert.deepEqual(lines,['スプラシュータ','ー']);
  assert(lines.slice(1).some(s=>s.startsWith('ー')));
});
test('mixed fallback glyph metrics on one row do not create phantom physical rows',()=>{
  const glyphs=row('スプラシューター').map((g,i)=>({...g,top:g.top+(i%2?1.2:0),height:i%2?14.5:16.9}));
  assert.deepEqual(groupGlyphLines(glyphs,16.9),['スプラシューター']);
});
test('successive tilted long-name lines remain distinct',()=>{
  assert.deepEqual(groupGlyphLines([...row('キャンピング',0),...row('シェルター',16.9),...row('ソレーラ',33.8)],16.9),['キャンピング','シェルター','ソレーラ']);
});
test('inverse native card rotation preserves one line and a genuine next-line orphan',()=>{
  const angle=-1.5*Math.PI/180, matrix={a:Math.cos(angle),b:Math.sin(angle),c:-Math.sin(angle),d:Math.cos(angle)};
  const rotate=gs=>gs.map(g=>{
    const x=g.left+g.width/2,y=g.top+g.height/2;
    const width=Math.abs(matrix.a)*g.width+Math.abs(matrix.c)*g.height,height=Math.abs(matrix.b)*g.width+Math.abs(matrix.d)*g.height;
    return {...g,left:400+matrix.a*x+matrix.c*y-width/2,top:200+matrix.b*x+matrix.d*y-height/2,width,height};
  });
  assert.deepEqual(groupGlyphLines(rotate(row('スプラシューター',0,{slope:0})),16.9,matrix),['スプラシューター']);
  const wrapped=rotate([...row('スプラシュータ',0,{slope:0}),...row('ー',16.9,{slope:0})]);
  assert.deepEqual(groupGlyphLines(wrapped,16.9,matrix),['スプラシュータ','ー']);
});

test('line grouping fails closed on an invalid physical transform',()=>{assert.throws(()=>groupGlyphLines([],16.9,{a:0,b:0,c:0,d:0}),/invertible/);});


test('drawer geometry observes real pointerleave neutrality without changing other screens or gates',async()=>{
 const state={hover:true,rx:'3.15deg',ry:'-2deg'},card={classList:{contains:()=>state.hover},style:{getPropertyValue:k=>k==='--rx'?state.rx:state.ry}},calls=[];
 const locator={evaluate:async()=>true};const page={mouse:{move:async(x,y)=>{calls.push([x,y]);state.hover=false;state.rx=state.ry='0deg';}},waitForFunction:async fn=>{assert(vm.runInNewContext('('+fn.toString()+')()',{document:{querySelectorAll:()=>[card]}}),'real hover owner did not clear');}};
 assert.deepEqual(await parkDrawerPointer(locator,page),{parked:true,hoverCleared:true});assert.deepEqual(calls,[[0,0]]);
 state.hover=true;const blocked={...page,mouse:{move:async()=>{}}};await assert.rejects(parkDrawerPointer(locator,blocked),/real hover owner/);
 state.hover=false;state.rx='3deg';await assert.rejects(parkDrawerPointer(locator,blocked),/real hover owner/);
 await assert.rejects(parkDrawerPointer(locator,{...blocked,waitForFunction:async fn=>{assert(vm.runInNewContext('('+fn.toString()+')()',{document:{querySelectorAll:()=>[]}}),'empty drawer must not count as neutral');}}),/empty drawer/);
 let touched=false;assert.equal(await parkDrawerPointer({evaluate:async()=>false},{mouse:{move:async()=>{touched=true;}}}),null);assert.equal(touched,false);
 assert.equal(script.split('await parkDrawerPointer(locator,page)').length-1,2,'both reachable/readable must neutralize after scrolling');
 assert.match(script,/unsupported perspective clipping transform/);assert(!script.includes("setProperty('--rx'"));assert(!script.includes("setProperty('--ry'"));assert(!script.includes("remove('is-hover')"));
});
