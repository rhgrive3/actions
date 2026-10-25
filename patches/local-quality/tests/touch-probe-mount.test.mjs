import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
const root=new URL('../../../',import.meta.url),helper=fs.readFileSync(new URL('scripts/check-inkwave-hud-authority.mjs',root),'utf8');
const native=fs.readFileSync(new URL('inkwave-public/src/core/mobile.js',root),'utf8');
const ast=parse(native,{ecmaVersion:'latest',sourceType:'module'}),cls=ast.body.find(n=>n.type==='ExportNamedDeclaration'&&n.declaration?.id?.name==='MobileInput').declaration;
const method=name=>{const n=cls.body.body.find(n=>n.key?.name===name);return '(function'+native.slice(n.value.start,n.value.end)+')';};
const setup=helper.slice(helper.indexOf('      const m=original.root?'),helper.indexOf('      if(resumeForTouch)'));
const cleanup=helper.slice(helper.indexOf('      G.game.input.mobile=s.original;'),helper.indexOf('\n    });',helper.indexOf('      G.game.input.mobile=s.original;')));
assert(setup&&cleanup);
function world(){
 const roots=[],classes=()=>({add(){},remove(){},toggle(){},contains(){return false;}});
 const events=new EventTarget(),frames=new Map();let frame=0;
 const node=()=>({style:{setProperty(){}},dataset:{},classList:classes(),addEventListener(){},querySelectorAll(selector){if(selector==='[data-c]')return ['stick','fire','squid','jump','sub','special','map','gyro','pause'].map(c=>Object.assign(node(),{dataset:{c}}));return [];},querySelector(){return node();},remove(){const i=roots.indexOf(this);if(i>=0)roots.splice(i,1);}});
 const doc={documentElement:{lang:'en',classList:classes()},body:{appendChild(n){roots.push(n);}},createElement:node,addEventListener(){}};
 // In a browser, bare viewport globals and window properties share one object.
 const ctx={document:doc,innerWidth:844,innerHeight:390,visualViewport:{width:844,height:390,scale:1},addEventListener:events.addEventListener.bind(events),screen:{orientation:{addEventListener(){}}},requestAnimationFrame(callback){frames.set(++frame,callback);return frame;},cancelAnimationFrame(id){frames.delete(id);},t:s=>s,JA_LABEL:{},EN_LABEL:{},WEAPON_ICONS:{},SUB_ICONS:{},SQUID:'',JUMP_ICON:'',MAP_ICON:'',GYRO_ICON:'',PAUSE_ICON:'',specialIcon:()=>'',stop(){}};
 ctx.window=ctx;
 const context=vm.createContext(ctx);const install=vm.runInContext(method('_install'),context),visible=vm.runInContext(method('setVisible'),context),destroy=vm.runInContext(method('destroy'),context);
 class Mobile {
  constructor(canvas,owner){const calls={layout:0,resync:0,pointers:0};Object.assign(this,{canvas,owner,calls,active:false,visible:false,s:{touchOpacity:.85},_abort:new AbortController(),_relayoutRaf:null,gyro:{stop(){},resync(){calls.resync++;}},_layoutAll(){calls.layout++;},resetPointers(){calls.pointers++;},_syncVisible(){},reset(){},_install:install,setVisible:visible,destroy});}
 }
 const original=new Mobile({},{}),a={special:23,specialActive:null},g={input:{mobile:original,lastDevice:'kbm'},match:{local:a},_updateHud(){}};
 Object.assign(ctx,{MobileInput:Mobile,original,a,g,G:{game:g}});
 return {ctx,roots,original,g,frames,resize(){events.dispatchEvent(new Event('resize'));},flush(){const callbacks=[...frames.values()];frames.clear();for(const callback of callbacks)callback();},run(before=false){let s=setup;if(before)s=s.replace('m.active=true;if(!m.root)m._install();','if(!m.active){m.active=true;m._install();}');vm.runInContext('{'+s+'}',context);return ctx.__hudTouchFixture;},restore(){ctx.s=ctx.__hudTouchFixture;vm.runInContext(cleanup,context);}};
}
test('old authority setup reinstalls an already mounted inactive desktop Mobile',()=>{const w=world();w.original._install();assert.equal(w.roots.length,1);assert.equal(w.original.active,false);w.run(true);assert.equal(w.roots.length,2);});
test('full sub-HUD then authority reuses the existing native DOM across repeated captures',()=>{const w=world();w.original._install();const dom=w.original.root;for(let i=0;i<20;i++){const s=w.run();assert.equal(s.m,w.original);assert.equal(w.roots.length,1);assert.equal(w.original.root,dom);assert.equal(w.original.active,true);w.restore();assert.equal(w.original.active,false);assert.equal(w.original.visible,false);assert.equal(w.g.input.mobile,w.original);assert.equal(w.g.input.lastDevice,'kbm');assert.equal(w.roots.length,1);}});
test('UI-only temporary Mobile mounts once and destroys only its own DOM',()=>{const w=world();const s=w.run();assert.notEqual(s.m,w.original);assert.equal(w.roots.length,1);w.restore();assert.equal(w.roots.length,0);assert.equal(w.g.input.mobile,w.original);assert.equal(w.original.active,false);});
test('already active real owner retains its active and visible state',()=>{const w=world();w.original.active=true;w.original.visible=true;w.original._install();w.run();assert.equal(w.roots.length,1);w.restore();assert.equal(w.original.active,true);assert.equal(w.original.visible,true);assert.equal(w.roots.length,1);});
test('mounted probe ignores redundant resize but invalidates each changed viewport component',()=>{
 const w=world(),m=w.original;m._install();const dom=m.root;
 assert.equal(w.ctx.window,w.ctx);assert.equal(m.calls.layout,1);
 w.resize();assert.deepEqual(m.calls,{layout:1,resync:0,pointers:0});assert.equal(w.frames.size,0);
 for(const [target,key] of [[w.ctx,'innerWidth'],[w.ctx,'innerHeight'],[w.ctx.visualViewport,'width'],[w.ctx.visualViewport,'height'],[w.ctx.visualViewport,'scale']]){
  const before={...m.calls};target[key]+=1;w.resize();
  assert.equal(m.calls.resync,before.resync+1,key);assert.equal(m.calls.pointers,before.pointers+1,key);
  assert.equal(m.calls.layout,before.layout,key);assert.equal(w.frames.size,1,key);
  w.resize();assert.equal(m.calls.resync,before.resync+1,key);assert.equal(w.frames.size,1,key);
  w.flush();assert.equal(m.calls.layout,before.layout+1,key);assert.equal(m.root,dom);assert.equal(w.roots.length,1);
 }
 m.destroy();const before={...m.calls};w.ctx.innerWidth+=1;w.resize();assert.deepEqual(m.calls,before);assert.equal(w.frames.size,0);assert.equal(w.roots.length,0);
});
