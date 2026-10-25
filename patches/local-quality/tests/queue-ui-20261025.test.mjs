import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {adaptQueueUi20261025} from '../queue-ui-20261025-adapter.mjs';

const before = JSON.parse(fs.readFileSync(new URL('./fixtures/queue-ui-before.json', import.meta.url)));
const marks = {'hud.js':'if (dy !== 0)', 'hud-boss.js':'this.hud._bossSquadViews?', 'menus.js':'const netOff = this._netOff;', 'news.js':'this._nextTimer = setTimeout', 'menu-art.js':'r._queuePaintT', 'mobile.js':'el._queueStickTransform', 'minimap.js':'let queueJumpPulse', 'showcase.js':'this._queueFirstFree = 0;'};
function composed(rel) {
  let code = adaptBuildSource(rel, fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8'));
  if (!code.includes(marks[rel.split('/').at(-1)])) code = adaptQueueUi20261025(rel, code);
  return code;
}
function between(code, start, end) { const a=code.indexOf(start), b=code.indexOf(end,a); assert(a>=0 && b>a,start); return code.slice(a,b); }
function fn(body, name, env={}) { return vm.runInNewContext(`({${body}}).${name}`,env); }
const clamp = (v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const copy = x=>structuredClone(x);

test('actual HUD ink state is exact at 30/60/120Hz and keeps invalid-dt behavior',()=>{
  const after=between(composed('src/ui/hud.js'),'  _updTank(f, dt) {','  _s3TankTube(');
  for (const hz of [30,60,120]) {
    const G={rig:{yaw:0},camera:{matrixWorld:{elements:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}}};
    const initial={t:0,prevYaw:null,prevVx:0,prevVz:0,slosh:0,sloshV:0,wobble:0,empty:0,bubbles:[],prevInk:1,level:1};
    const math=Object.create(Math); math.random=()=>1;
    const make=body=>({update:fn(body,'_updTank',{G,clamp,Math:math}),_L:{},_tank:copy(initial),tank:{style:{},classList:{toggle(){}}},_local:()=>null,_drawTank(){}});
    const a=make(before.tank),b=make(after);
    for(let i=0;i<hz*30;i++) {
      G.rig.yaw=i<hz*3?0:i<hz*8?i*.017:2;
      const f={ink:i<hz*5?1:i<hz*10?.3:i<hz*20?.8:1,inkLow:false};
      for(const owner of [a,b])owner.update.call(owner,f,1/hz);
      assert.deepEqual(copy(b._tank),copy(a._tank));
    }
    for(const dt of [-1,NaN,Infinity,-Infinity,-0,0]) {
      a._tank=copy(initial); b._tank=copy(initial);
      a.update.call(a,{ink:1},dt); b.update.call(b,{ink:1},dt);assert.deepEqual(copy(b._tank),copy(a._tank));
    }
  }
});

function element() {
  const values={},classes=new Set();let writes=0,toggles=0;
  const style=new Proxy(values,{set(o,k,v){writes++;o[k]=v;return true;}});
  return {style,classList:{contains:x=>classes.has(x),toggle(x,on){toggles++;on?classes.add(x):classes.delete(x);}},snapshot:()=>({style:Object.fromEntries(Object.entries(values).filter(([,v])=>typeof v!=='function')),classes:[...classes].sort()}),counts:()=>({writes,toggles})};
}
test('real stick renderer preserves DOM through layout overrides, state changes and node replacement',()=>{
  const body=between(composed('src/core/mobile.js'),'  _drawStick(on,','  // ------------------------------------------------------------------------------------------ layout editor');
  const make=code=>({draw:fn(code,'_drawStick'),stickEl:element(),knob:element(),dirEl:element(),_stick:{ox:50,oy:90},_stickHome:{x:30,y:40,d:70}});
  const a=make(before.stick), b=make(body);
  for(let i=0;i<5000;i++) {
    if(i===1000 || i===3000) for(const o of [a,b]){o.stickEl.style.transform='external layout';o.stickEl.classList.toggle('is-on',false);}
    if(i===2000)for(const o of [a,b])o.stickEl=element();
    const on=i%100!==0,dx=i%17,dy=i%11,mag=i%300<150?1:.5;
    for(const o of [a,b])o.draw.call(o,on,dx,dy,mag);
    for(const key of ['stickEl','knob','dirEl'])assert.deepEqual(b[key].snapshot(),a[key].snapshot());
  }
  assert(b.stickEl.counts().writes<a.stickEl.counts().writes/20);
  assert(b.stickEl.counts().toggles<a.stickEl.counts().toggles/20);
});

test('frozen wipe skips only repeated successful bitmap paints and still advances lifecycle',()=>{
  const body=between(composed('src/ui/menu-art.js'),'  _frame(now) {','  _finish() {');
  for(const mode of ['full','light','fade']) {
    const make=(code)=>{
      let frozen=true; const paints=[],events=[];
      const owner={r:{mode,t:100,dur:1000,midAt:400,midDone:false,onMid(){events.push('mid');}},timeScale:1,_last:0,cv:{width:700,height:500},ctx:{},isFrozen:()=>frozen,_frame(){},_finish(){events.push('finish');this.r=null;}};
      for(const name of ['Full','Light','Fade'])owner['_draw'+name]=r=>paints.push(r.t);
      const run=fn(code,'_frame',{requestAnimationFrame:()=>1,safeCall:f=>f?.(),console});
      return {owner,paints,events,freeze:v=>frozen=v,tick:t=>run.call(owner,t)};
    };
    const a=make(before.wipe),b=make(body);
    for(let i=0;i<320;i++) {
      if(i===120)for(const o of [a,b])o.owner.cv.width=800;
      if(i===240)for(const o of [a,b])o.freeze(false);
      a.tick(i*1000/120);b.tick(i*1000/120);
      assert.deepEqual(b.events,a.events);assert.equal(b.owner.r?.t,a.owner.r?.t);
      assert.equal(b.paints.at(-1),a.paints.at(-1));
    }
    assert.equal(a.paints.length,320);assert.equal(b.paints.length,82);
    for(let i=320;i<400;i++){a.tick(i*1000/120);b.tick(i*1000/120);assert.deepEqual(b.events,a.events);}
    assert.deepEqual(b.events,['mid','finish']);
  }
});

function canvasRecorder() {
  let path=[];const commands=[];
  const c={globalAlpha:1,lineWidth:1,fillStyle:'',strokeStyle:'',beginPath(){path=[];},arc(...a){path.push(['arc',...a]);},moveTo(...a){path.push(['moveTo',...a]);},lineTo(...a){path.push(['lineTo',...a]);},fill(p){commands.push(['fill',p?.commands||copy(path),this.fillStyle,this.globalAlpha]);},stroke(p){commands.push(['stroke',p?.commands||copy(path),this.strokeStyle,this.globalAlpha,this.lineWidth]);},drawImage(...a){commands.push(['image',...a]);},setLineDash(){}};
  return {c,commands};
}
test('composed minimap keeps exact paint commands, dynamic pads, jump expiry and no-Path2D fallback',()=>{
  const body=between(composed('src/game/minimap.js'),'  _compose(dt) {','  _cross(');
  for(const paths of [false,true]) {
    let built=0; class Path {constructor(){this.commands=[];built++;}arc(...a){this.commands.push(['arc',...a]);}}
    const make=code=>{
      const fxList=[{kind:'jump',x:1,z:2,team:0,t:0,life:3},{kind:'jump',x:-1,z:1,team:1,t:0,life:3}];
      const G={teamHex:['#f80','#08f'],projectiles:{clouds:[],bombs:[]}};
      const draw=fn(code,'_compose',{G,fxList,TAU:Math.PI*2,Path2D:paths?Path:undefined});
      const r=canvasRecorder(),owner={ctx:r.c,w:512,h:512,s:4,time:0,base:'base',inkC:'ink',flashC:'flash',flashT:0,level:{spawnPads:[{x:1,z:2},{x:3,z:-1}],spawnBarrier:4},toCanvas(x,z,out){out.x=this.flip?-x*4:x*4;out.y=z*4;}};
      return {G,owner,draw,fxList,...r};
    };
    const a=make(before.minimap),b=make(body);
    for(let i=0;i<200;i++) {
      if(i===50)for(const o of [a,b])o.owner.flip=true;
      if(i===70)for(const o of [a,b])o.owner.level.spawnPads[1].z=3;
      if(i===90)for(const o of [a,b])o.owner.level.spawnBarrier=5;
      if(i===110)for(const o of [a,b])o.G.teamHex=['#b00','#abc'];
      if(i===130)for(const o of [a,b])o.owner.level.spawnPads[1]=null;
      for(const o of [a,b]){o.commands.length=0;o.owner.time=i/60;o.draw.call(o.owner,1/60);}
      assert.deepEqual(b.commands,a.commands);assert.deepEqual(b.fxList,a.fxList);
    }
    if(paths)assert.equal(built,14,'initial pads and only the changed geometry rebuild paths');
  }
});

test('FOV preview keeps every wedge, caption and target boundary while avoiding repeated class writes',()=>{
  const code=between(composed('src/ui/menu-art.js'),'function previewFov(ctx) {','function previewQuality(');
  const make=source=>{
    const targets=Array.from({length:10},element),attrs=new Map();const cap={innerHTML:''};
    const el={querySelector:s=>s.includes('wedge')?{setAttribute:(k,v)=>attrs.set(k,v)}:cap,querySelectorAll:()=>targets};
    const preview=vm.runInNewContext(`(${source})`,{h:()=>el,K:'#15121c',SQUID:'',TAU:Math.PI*2,tr:(s,v)=>s+JSON.stringify(v)} )({value:82});
    return {preview,targets,attrs,cap};
  };
  const a=make(before.fov),b=make(code);
  for(let i=0;i<2130;i++) {
    if(i%400===0)for(const o of [a,b])o.preview.set([110,40,120,82,60][Math.floor(i/400)%5]);
    const dt=i%17===0?0:1/[30,60,120][i%3];
    for(const o of [a,b])o.preview.tick(dt);
    assert.deepEqual(b.attrs,a.attrs);assert.equal(b.cap.innerHTML,a.cap.innerHTML);
    assert.deepEqual(b.targets.map(e=>e.snapshot()),a.targets.map(e=>e.snapshot()));
  }
  assert(b.targets.reduce((n,e)=>n+e.counts().toggles,0)<a.targets.reduce((n,e)=>n+e.counts().toggles,0)/20);
});

test('frozen gyro and touch previews keep first paint, setting repaint and resumed frames exactly',()=>{
  const source=composed('src/ui/menu-art.js'),start=source.indexOf('function queueFreezePreview(');
  const wrap=vm.runInNewContext(`(${source.slice(start,source.indexOf('\n}',start)+2)})`);
  for(const key of ['gyro','gyroSens','gyroInvertX','gyroInvertY','touchSens','stickMode','fireAim','_layout']) {
    const make=()=>{
      const nodes=new Map();let writes=0;
      const node=()=>{const attrs={};return {style:new Proxy({},{set(o,k,v){writes++;o[k]=v;return true;}}),classList:{toggle(){}},setAttribute(k,v){writes++;attrs[k]=v;},getAttribute:k=>attrs[k]??null,attrs};};
      const root={querySelector(s){if(!nodes.has(s))nodes.set(s,node());return nodes.get(s);},classList:{toggle(){}}};
      const env={h:()=>root,K:'#15121c',PHONE:()=>'',frameSVG:x=>x,skyline:()=>'',SQUID:'',GLYPHS:{},innerWidth:1000,innerHeight:700,tr:(s,v)=>s+JSON.stringify(v),gyroTurnDeg:v=>v*10,touchSensMul:v=>Math.pow(1.16,+v||0),fmtInt:String,clamp,smooth:(a,b,v)=>clamp((v-a)/(b-a)),easeOutBack:x=>x};
      const factory=vm.runInNewContext(`(${key.startsWith('gyro')?before.gyro:before.touch})`,env);
      return {p:factory({value:key==='stickMode'?'floating':1},key),snapshot:()=>JSON.stringify([...nodes].map(([s,n])=>[s,n.style,n.attrs,n.innerHTML])),writes:()=>writes};
    };
    const a=make(),b=make();b.p=wrap(b.p,key);
    for(let i=0;i<500;i++) {
      if(i===200)for(const o of [a,b])o.p.set(key==='stickMode'?'fixed':0,{touchScale:1,touchOpacity:.8});
      const dt=i<300?0:1/60;
      a.p.tick(dt);b.p.tick(dt);assert.equal(b.snapshot(),a.snapshot(),key+' '+i);
    }
    assert(b.writes()<a.writes()*.6,key);
  }
});

test('HUD remote yaw churn leaves all actual map DOM unchanged while self, visibility and positions still update',()=>{
  const after=between(composed('src/ui/hud.js'),'  _updMap(m, dt) {','  _beaconTargets() {');
  const make=code=>{
    const G={input:{lastDevice:'kbm'},match:{state:'playing'}};
    const update=fn(code,'_updMap',{G,innerWidth:1000,innerHeight:700,clamp,lerp:(a,b,t)=>a+(b-a)*t});
    const dots=Array.from({length:8},()=>{const d=element();d.style.setProperty=function(k,v){this[k]=v;};return d;});
    const owner={_L:{},_map:{},_mapT:0,_mapV:0,map:element(),mapDim:element(),el:element(),mapLegend:element(),mapSlot:{appendChild(){}},mapDots:dots,_updBeacons(){},_myTeam:()=>0,_snd(){}};
    owner.map.style.setProperty=()=>{}; const canvas={width:256,height:256,classList:{add(){}}};
    return {owner,dots,m:{canvas,players:Array.from({length:8},(_,i)=>({x:.1+i/10,y:.2,team:i%2,alive:true,isSelf:i===0,yaw:0}))},update};
  };
  const a=make(before.map),b=make(after);
  for(let i=0;i<2000;i++){
    for(const o of [a,b]){
      for(let j=0;j<8;j++)if(o.m.players[j])o.m.players[j].yaw=i*.01+j;
      if(i===300)o.m.players[2].alive=false;
      if(i===500)o.m.players[2].x=.7;
      if(i===700)o.m.players[2]=null;
      if(i===900)o.m.players[2]={x:.7,y:.2,team:1,alive:true,isSelf:false,yaw:i};
      if(i===1100){o.m.players[0].isSelf=false;o.m.players[2].isSelf=true;}
      if(i===1300)o.m.expanded=true;
      if(i===1500)o.m.expanded=false;
      o.update.call(o.owner,o.m,1/60);
    }
    assert.deepEqual(b.dots.map(e=>[e.snapshot(),e.className]),a.dots.map(e=>[e.snapshot(),e.className]));
  }
  assert(b.dots.slice(3).every((e,i)=>e.counts().writes<a.dots[i+3].counts().writes/4));
});

test('menu engine takeover never disposes news; disposal unregisters each owned callback once despite errors',()=>{
  const code=composed('src/ui/menus.js');
  const update=fn(between(code,'  update(dt) {','  handleKey(e) {'),'update',{performance:{now:()=>1},cancelAnimationFrame(){},clamp});
  const owner={_news:{dispose(){throw Error('engine takeover must retain news');}},_tick(){}};update.call(owner,1/60);
  const events=[],safeCall=f=>{try{f?.();}catch{}};
  const dispose=fn(between(code,'  dispose() {','  // ================================================================ internals: loop'),'dispose',{safeCall,clearContinuation(){},clearTimeout(){},cancelAnimationFrame(){},window:{removeEventListener(){}},document:{fonts:{removeEventListener(){}}}});
  Object.assign(owner,{_netOff:[()=>events.push('off1'),()=>{events.push('off2');throw Error('expected');},()=>events.push('off3')],_netBound:{},_news:{dispose:()=>events.push('news')},_cur:{},_swapToken:0,wipe:{cancel(){}},el:{remove(){}}});
  dispose.call(owner);dispose.call(owner);
  assert.deepEqual(events,['off1','off2','off3','news']);assert.equal(owner._netBound,null);assert.equal(owner._news,null);
});

test('news disposal cancels page/close/open timers, RAF, tween closures and modal ownership',()=>{
  const code=composed('src/ui/news.js'),cancelled=[],timers=[];
  const dispose=fn(between(code,'  dispose() {','\n}'),'dispose',{clearTimeout:x=>timers.push(x),cancelAnimationFrame:x=>cancelled.push(x)});
  const el={remove(){this.removed=true;}},M={_modal:el};
  const o={M,el,_pre:[{}],_t:1,_nextTimer:2,_closeTimer:3,_raf:4,_tweens:[()=>{}],card:{},inkHost:{},confetti:{},_busy:true};
  dispose.call(o);dispose.call(o);
  assert.deepEqual(timers.slice(0,3),[1,2,3]);assert.equal(cancelled[0],4);assert.equal(M._modal,null);assert.equal(o.el,null);assert.equal(o._tweens.length,0);assert.equal(o.card,null);
});

function inkFxClass(source) {
  const env={THREE,TAU:Math.PI*2,UPV:new THREE.Vector3(0,1,0),ZERO_M:new THREE.Matrix4().makeScale(0,0,0),_m4:new THREE.Matrix4(),_q:new THREE.Quaternion(),_d:new THREE.Vector3(),_v:new THREE.Vector3(),_s:new THREE.Vector3(),eOut3:x=>1-Math.pow(1-clamp(x),3),eInOut:x=>{x=clamp(x);return x*x*(3-2*x);},backOut:(x,s)=>{x=clamp(x)-1;return 1+x*x*((s+1)*x+s);},lerp:(a,b,t)=>a+(b-a)*t,splatGeometry:()=>new THREE.PlaneGeometry(1,1)};
  return vm.runInNewContext(`(${source.slice(0,source.lastIndexOf('}')+1)})`,env);
}
test('actual InkFX lowest-free allocation preserves RNG, matrices and landing reentry at 30/60/120Hz',()=>{
  const body=between(composed('src/game/showcase.js'),'class InkFX {','class Confetti {');
  const A=inkFxClass(before.inkfx),B=inkFxClass(body);
  const make=C=>{let seed=7;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);const o=new C({add(){}},new THREE.MeshBasicMaterial(),random);return {o,seed:()=>seed};};
  for(const hz of [30,60,120]){
    const a=make(A),b=make(B);
    for(let i=0;i<hz*15;i++) {
      if(i%100===0)for(const x of [a,b])x.o.clear();
      if(i%2===0)for(const x of [a,b])for(let j=0;j<8;j++)x.o.drop(j*.01,1,0,0,-1,0,.1,1+i%4,.5+(j%3)*.1);
      for(const x of [a,b])x.o.update(1/hz,[{x:0,z:0,r:10,y:0}]);
      assert.equal(b.seed(),a.seed());
      for(const key of ['K','P','V','R','A','L','S','SA','RA','SP','RP'])assert.deepEqual(copy(b.o[key]),copy(a.o[key]));
      for(const key of ['mesh','splats','rings']){assert.equal(b.o[key].count,a.o[key].count);assert.deepEqual(b.o[key].instanceMatrix.array,a.o[key].instanceMatrix.array);}
    }
    for(const x of [a,b])x.o.clear();
    for(let i=0;i<150;i++)assert.equal(b.o.drop(0,0,0,0,0,0,1),a.o.drop(0,0,0,0,0,0,1));
    assert.equal(b.o.drop(0,0,0,0,0,0,1),-1);
    for(const x of [a,b])x.o.clear();
    assert.equal(b.o.drop(0,0,0,0,0,0,1,0),a.o.drop(0,0,0,0,0,0,1,0));
    assert.equal(b.o.drop(0,0,0,0,0,0,1),a.o.drop(0,0,0,0,0,0,1));
  }
});
