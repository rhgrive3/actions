import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {readOnlineScroll,assertOnlineScrollLayout,assertOnlineScrollMovement,assertOnlineTarget,checkResponsiveOnlineScroll} from '../../../scripts/lib/inkwave-responsive-online-scroll.mjs';

const state=()=>({inputMode:'kbm',activeTag:'BUTTON',activeOwnerIndex:0,root:{overflowY:'hidden',display:'grid',visibility:'visible',opacity:1,scrollTop:0},documentScroll:0,viewport:{width:844,height:390},
 owners:[0,1].map(i=>({className:i?'iw-hub__me':'iw-hub__body',left:i?540:20,right:i?820:520,top:90,bottom:370,width:i?280:500,clientHeight:280,scrollHeight:500,scrollTop:0,overflowY:'auto',touchAction:'pan-y'})),
 target:{visible:true,owner:true,disabled:false,left:30,right:300,top:120,bottom:165,width:270,height:45,hit:true,clips:[],text:'Room not found — check the code and retry',scrollWidth:270,clientWidth:270,scrollHeight:45,clientHeight:45}});
test('short landscape requires two real, visible, touch-scrollable local owners',()=>{
 assert.doesNotThrow(()=>assertOnlineScrollLayout(state()));
 for(const mutate of [s=>s.root.overflowY='auto',s=>s.owners[0].overflowY='hidden',s=>s.owners[1].touchAction='none',s=>s.owners.pop(),s=>s.owners[0].bottom=500,s=>s.root.opacity=0,s=>s.root.scrollTop=20,s=>s.documentScroll=20]){
  const s=state();mutate(s);assert.throws(()=>assertOnlineScrollLayout(s));
 }
});
test('native input must move this owner without root, document or sibling substitution',()=>{
 const a=state(),b=state();b.owners[0].scrollTop=120;assert.doesNotThrow(()=>assertOnlineScrollMovement(a,b,0,1));
 assert.doesNotThrow(()=>assertOnlineScrollMovement(b,a,0,-1));
 assert.throws(()=>assertOnlineScrollMovement(a,a,0,1));
 for(const mutate of [s=>s.root.scrollTop=20,s=>s.documentScroll=20,s=>s.owners[1].scrollTop=20]){const c=structuredClone(b);mutate(c);assert.throws(()=>assertOnlineScrollMovement(a,c,0,1));}
});
test('all controls need full viewport and ancestor-clip admission plus real center hit',()=>{
 assert.doesNotThrow(()=>assertOnlineTarget(state(),'input'));
 for(const mutate of [s=>s.target.visible=false,s=>s.target.owner=false,s=>s.target.disabled=true,s=>s.target.bottom=410,s=>s.target.hit=false,s=>s.target.clips=[{className:'inner overflow hidden'}],s=>s.missing='code input']){
  const s=state();mutate(s);assert.throws(()=>assertOnlineTarget(s,'control'));
 }
});
test('error readiness additionally rejects absent or truncated text',()=>{
 assert.doesNotThrow(()=>assertOnlineTarget(state(),'error',{readable:true}));
 for(const mutate of [s=>s.target.text='',s=>s.target.scrollWidth=500,s=>s.target.scrollHeight=90]){const s=state();mutate(s);assert.throws(()=>assertOnlineTarget(s,'error',{readable:true}));}
});

function pageFixture({wheelWorks=true,crossScroll=false,clipped=false,allFit=false,rescueRoot=false,rescueDocument=false,engine='chromium',keyboardWorks=true,wrongFocus=false,inputMode='kbm'}={}){
 const s=state(),calls=[];s.inputMode=inputMode;let panel=0;
 if(allFit)for(const o of s.owners)o.scrollHeight=o.clientHeight;
 const page={context:()=>({browser:()=>({browserType:()=>({name:()=>engine})})}),keyboard:{press:async key=>{calls.push(['key',panel,key]);if(keyboardWorks)s.owners[panel].scrollTop=key==='Home'?0:220;if(crossScroll)s.root.scrollTop+=2;}},evaluate:async(fn,args)=>{const copy=structuredClone(s);if(args?.targetSelector){calls.push(['target',args.targetSelector]);if(clipped)copy.target.clips=[{className:'hidden ancestor'}];}return copy;},
  mouse:{move:async x=>{if(x>0)panel=x>530?1:0;calls.push(['pointer',x]);},wheel:async(_,dy)=>{calls.push(['wheel',panel,dy]);if(wheelWorks)s.owners[panel].scrollTop=Math.max(0,Math.min(220,s.owners[panel].scrollTop+dy));if(crossScroll)s.root.scrollTop+=2;}},
  waitForFunction:async()=>{},locator:selector=>({first(){return this;},focus:async()=>{panel=selector.includes('.iw-hub__me')?1:0;s.activeOwnerIndex=wrongFocus?1-panel:panel;calls.push(['focus',panel]);},scrollIntoViewIfNeeded:async()=>{calls.push(['nearest',selector]);if(rescueRoot)s.root.scrollTop=20;if(rescueDocument)s.documentScroll=20;},tap:async options=>{assert.deepEqual(options,{trial:true});calls.push(['trial',selector]);}})};
 return{page,calls};
}
test('orchestrator exercises native down/up in both owners and every action/input/back',async()=>{
 const f=pageFixture();const result=await checkResponsiveOnlineScroll(f.page,{settle:async()=>{}});
 assert.equal(result.gestures.length,2);assert.equal(result.targets.length,9);
 for(const t of ['.iw-hubcard--create','.iw-code-input','.iw-join__btns button:not(.is-go)','.iw-join__btns .is-go','.iw-name__input','.iw-hub__chip:not(.iw-lchip)','.iw-lchip','.iw-backbtn'])assert(result.targets.some(x=>x.selector===t),t);
 assert.equal(f.calls.filter(x=>x[0]==='wheel').length,6);assert.equal(f.calls.filter(x=>x[0]==='trial').length,8);
});
test('orchestrator fails if a wheel does not move, chains to root, or targets clip',async()=>{
 for(const options of [{wheelWorks:false},{crossScroll:true},{clipped:true},{allFit:true},{rescueRoot:true},{rescueDocument:true}])await assert.rejects(checkResponsiveOnlineScroll(pageFixture(options).page),/native input|root|document|clipped|overflowing/);
});
test('error-only mode checks complete real error content without activating room controls',async()=>{
 const f=pageFixture();const result=await checkResponsiveOnlineScroll(f.page,{errorOnly:true});
 assert.deepEqual(result.targets.map(x=>x.selector),['.iw-jstat.is-on .iw-jstat__txt']);
 assert(!f.calls.some(x=>x[0]==='trial'||x[0]==='wheel'));
 for(const options of [{rescueRoot:true},{rescueDocument:true}])await assert.rejects(checkResponsiveOnlineScroll(pageFixture(options).page,{errorOnly:true}),/root|document/);
});
test('runner preserves old non-short overflow gate and checks error before paste plus keyboard local owners',()=>{
 const script=fs.readFileSync(new URL('../../../scripts/check-inkwave-responsive.mjs',import.meta.url),'utf8');
 assert.match(script,/width > config\.viewport\.height && config\.viewport\.height <= 500/);
 assert.match(script,/else assert\.equal\(await page\.locator\('\.iw-online'\)\.evaluate\(\(el\) => getComputedStyle\(el\)\.overflowY\), 'auto'\)/);
 assert(script.indexOf('errorOnly: true')<script.indexOf("clipboardData.setData('text/plain', 'Join my room: BC234')"));
 assert(script.indexOf('entry.onlineLocalScroll')>script.indexOf("menus.setInputMode('kbm')"));
 assert(script.includes("'lib/inkwave-responsive-online-scroll.mjs'"),'new QA helper must be identity-pinned with original runners');
});

test('actual DOM reader detects nested paint clipping, opacity and intercepted target',()=>{
 const box=(className,left,top,width,height,css={})=>({className,offsetWidth:width,offsetHeight:height,clientLeft:0,clientTop:0,clientWidth:width,clientHeight:height,scrollWidth:width,scrollHeight:height,scrollTop:0,
  css:{overflowX:'visible',overflowY:'visible',touchAction:'pan-y',display:'block',visibility:'visible',opacity:'1',...css},getBoundingClientRect:()=>({left,top,right:left+width,bottom:top+height,width,height}),contains(el){return el===this;}});
 const root=box('iw-online iw-screen',0,0,844,390,{overflowY:'hidden'}),body=box('iw-hub__body',20,90,500,280,{overflowY:'auto'}),me=box('iw-hub__me',540,90,280,280,{overflowY:'auto'}),inner=box('inner',30,110,300,100),target=box('iw-code-input',35,120,270,45);
 target.parentElement=inner;inner.parentElement=body;body.parentElement=root;root.contains=()=>true;body.contains=()=>true;
 root.querySelector=selector=>selector==='.iw-hub__body'?body:selector==='.iw-code-input'?target:null;root.querySelectorAll=()=>[body,me];
 const globals={document:{querySelector:()=>root,scrollingElement:{scrollTop:0},elementFromPoint:()=>target},getComputedStyle:el=>el.css,innerWidth:844,innerHeight:390};
 const read=()=>vm.runInNewContext('('+readOnlineScroll.toString()+')({ownerSelector:".iw-hub__body",targetSelector:".iw-code-input"})',globals);
 assert.doesNotThrow(()=>assertOnlineTarget(read(),'input'));
 const wrapper=box('iw-ui',0,0,844,390,{overflowY:'hidden'});root.parentElement=wrapper;wrapper.clientHeight=150;assert.throws(()=>assertOnlineTarget(read(),'input'),/clipped/,'outer UI wrapper also clips despite a valid root and center hit');wrapper.clientHeight=390;
 const bodyDoc=box('BODY',0,0,844,0,{overflowY:'hidden'}),htmlDoc=box('HTML',0,0,844,0,{overflowY:'hidden'});wrapper.parentElement=bodyDoc;bodyDoc.parentElement=htmlDoc;globals.document.body=bodyDoc;globals.document.documentElement=htmlDoc;assert.doesNotThrow(()=>assertOnlineTarget(read(),'input'),'zero-flow BODY/HTML do not falsely clip fixed UI');
 root.clientHeight=150;assert.throws(()=>assertOnlineTarget(read(),'input'),/clipped/,'root edge can clip a full target while center remains hittable');root.clientHeight=390;
 inner.css.overflowY='hidden';inner.clientHeight=20;assert.throws(()=>assertOnlineTarget(read(),'input'),/clipped/);
 inner.css.overflowY='visible';inner.css.opacity='0';assert.throws(()=>assertOnlineTarget(read(),'input'),/visible/);
 inner.css.opacity='1';globals.document.elementFromPoint=()=>root;assert.throws(()=>assertOnlineTarget(read(),'input'),/intercepted/);
});

// Driver controls model input delivery only, not a rendered WebKit pass.
test('mobile WebKit attached-keyboard path uses native Home/End/Home while keeping both real owner/target gates',async()=>{
 const f=pageFixture({engine:'webkit'}),r=await checkResponsiveOnlineScroll(f.page);
 assert.equal(r.inputMethod,'native-keyboard-home-end');assert.equal(r.physicalTouchSwipeVerified,false);
 assert.equal(r.gestures.length,2);assert.equal(r.targets.length,9);
 assert.deepEqual(f.calls.filter(x=>x[0]==='key').map(x=>x[2]),['Home','End','Home','Home','End','Home']);
 assert(!f.calls.some(x=>x[0]==='wheel'));assert.equal(f.calls.filter(x=>x[0]==='focus').length,2);
 assert(r.gestures.every(x=>x.inputMethod===r.inputMethod&&x.down>x.before+1&&x.up===0));
});
test('WebKit waits for animated End to finish before sending Home',async()=>{
 const f=pageFixture({engine:'webkit'}),press=f.page.keyboard.press;let pending=false,settled=0;
 f.page.keyboard.press=async key=>{if(key==='Home')assert.equal(pending,false,'Home must not race an unfinished End');if(key==='End')pending=true;await press(key);};
 f.page.waitForFunction=async fn=>{if(String(fn).includes('scrollHeight-el.clientHeight-1')){assert(pending);pending=false;settled++;}};
 await checkResponsiveOnlineScroll(f.page);assert.equal(settled,2,'both native scroll owners settle at the End boundary');
});
test('WebKit keyboard path fails closed on swallowed keys, stolen focus, wrong mode, outer/sibling rescue, or clipping',async()=>{
 for(const options of [{keyboardWorks:false},{wrongFocus:true},{inputMode:'touch'},{crossScroll:true},{clipped:true},{rescueRoot:true},{rescueDocument:true}])
  await assert.rejects(checkResponsiveOnlineScroll(pageFixture({engine:'webkit',...options}).page),/native input|focus|keyboard state|root|document|clipped/);
});
test('native keyboard proof does not remove old wheel proof or permit profile/DOM/input-event surgery',()=>{
 const code=fs.readFileSync(new URL('../../../scripts/lib/inkwave-responsive-online-scroll.mjs',import.meta.url),'utf8');
 assert(code.includes("page.keyboard.press(delta<0?'Home':'End')"));assert(code.includes('page.mouse.wheel(0,delta)'));
 assert(!/scrollTop\s*=|scrollTo\(|scrollBy\(|dispatchEvent\(|isMobile\s*:|preventDefault\(|stopPropagation\(/.test(code));
 assert(code.includes("physicalTouchSwipeVerified:false"));
});
test('actual composed menu routing leaves Home/End defaults alone, unlike reserved PageDown navigation',async()=>{
 const path=await import('node:path'),{fileURLToPath,pathToFileURL}=await import('node:url');
 const root=path.resolve(process.env.INKWAVE_SOURCE_ROOT||fileURLToPath(new URL('../../../',import.meta.url)));
 const {adaptBuildSource}=await import(pathToFileURL(path.join(root,'scripts/inkwave-source-composition.mjs')));
 const {fixture}=await import(pathToFileURL(path.join(root,'scripts/lib/inkwave-online-controlled-fixture.mjs')));
 const code=adaptBuildSource('src/ui/menus.js',fs.readFileSync(path.join(root,'inkwave-public/src/ui/menus.js'),'utf8'));
 const a=code.indexOf('  _scr_online() {'),b=code.indexOf('  // ================================================================ SCREEN: lobby',a);
 const k=code.indexOf('  handleKey(e) {'),end=code.indexOf('\n  _modalBlocksKeys()',k);assert(a>=0&&b>a&&k>=0&&end>k);
 const f=fixture(code.slice(a,b),{touch:false}),m=f.api;let nav=0,prevented=0;
 const constants=code.slice(code.indexOf('const MENU_MODIFIERS = '),code.indexOf('\n',code.indexOf('const MENU_BY_KEY = ')));
 assert(constants.includes('MENU_BY_CODE')&&constants.includes('MENU_BY_KEY'));
 const native=vm.runInNewContext(constants+'\n({'+code.slice(k,end)+'})',{document:f.document});
 Object.assign(m,{_scr:f.screen,_modalBlocksKeys:()=>false,setInputMode(mode){this._input=mode;},_nav(){nav++;}});
 f.document.activeElement=f.find('iw-hubcard--create');
 const key=name=>({key:name,code:name,preventDefault(){prevented++;}});
 for(const stage of ['idle','entry']){
  if(stage==='entry'){const input=f.find('iw-code-input');input.value='BCEFG';input.dispatch('input');}
  for(const name of ['Home','End'])assert.equal(native.handleKey.call(m,key(name)),false,stage+' '+name+' browser default not intercepted');
 }
 assert.equal(prevented,0);assert.equal(nav,0);assert.equal(f.requests.length,0);
 assert.equal(native.handleKey.call(m,key('PageDown')),true);assert.equal(prevented,1);assert.equal(nav,1);
 f.screen.destroy();
});
