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
 const node=()=>({style:{setProperty(){}},dataset:{},classList:classes(),addEventListener(){},querySelectorAll(selector){if(selector==='[data-c]')return ['stick','fire','squid','jump','sub','special','map','gyro','pause'].map(c=>Object.assign(node(),{dataset:{c}}));return [];},querySelector(){return node();},remove(){const i=roots.indexOf(this);if(i>=0)roots.splice(i,1);}});
 const doc={documentElement:{lang:'en',classList:classes()},body:{appendChild(n){roots.push(n);}},createElement:node,addEventListener(){}};
 const ctx={document:doc,window:{addEventListener(){}},screen:{orientation:{addEventListener(){}}},requestAnimationFrame(){},t:s=>s,JA_LABEL:{},EN_LABEL:{},WEAPON_ICONS:{},SUB_ICONS:{},SQUID:'',JUMP_ICON:'',MAP_ICON:'',GYRO_ICON:'',PAUSE_ICON:'',specialIcon:()=>'',stop(){}};
 const context=vm.createContext(ctx);const install=vm.runInContext(method('_install'),context),visible=vm.runInContext(method('setVisible'),context),destroy=vm.runInContext(method('destroy'),context);
 class Mobile {
  constructor(canvas,owner){Object.assign(this,{canvas,owner,active:false,visible:false,s:{touchOpacity:.85},_abort:new AbortController(),gyro:{stop(){}},_layoutAll(){},_syncVisible(){},reset(){},_install:install,setVisible:visible,destroy});}
 }
 const original=new Mobile({},{}),a={special:23,specialActive:null},g={input:{mobile:original,lastDevice:'kbm'},match:{local:a},_updateHud(){}};
 Object.assign(ctx,{MobileInput:Mobile,original,a,g,G:{game:g}});
 return {ctx,roots,original,g,run(before=false){let s=setup;if(before)s=s.replace('m.active=true;if(!m.root)m._install();','if(!m.active){m.active=true;m._install();}');vm.runInContext('{'+s+'}',context);return ctx.__hudTouchFixture;},restore(){ctx.s=ctx.__hudTouchFixture;vm.runInContext(cleanup,context);}};
}
test('old authority setup reinstalls an already mounted inactive desktop Mobile',()=>{const w=world();w.original._install();assert.equal(w.roots.length,1);assert.equal(w.original.active,false);w.run(true);assert.equal(w.roots.length,2);});
test('full sub-HUD then authority reuses the existing native DOM across repeated captures',()=>{const w=world();w.original._install();const dom=w.original.root;for(let i=0;i<20;i++){const s=w.run();assert.equal(s.m,w.original);assert.equal(w.roots.length,1);assert.equal(w.original.root,dom);assert.equal(w.original.active,true);w.restore();assert.equal(w.original.active,false);assert.equal(w.original.visible,false);assert.equal(w.g.input.mobile,w.original);assert.equal(w.g.input.lastDevice,'kbm');assert.equal(w.roots.length,1);}});
test('UI-only temporary Mobile mounts once and destroys only its own DOM',()=>{const w=world();const s=w.run();assert.notEqual(s.m,w.original);assert.equal(w.roots.length,1);w.restore();assert.equal(w.roots.length,0);assert.equal(w.g.input.mobile,w.original);assert.equal(w.original.active,false);});
test('already active real owner retains its active and visible state',()=>{const w=world();w.original.active=true;w.original.visible=true;w.original._install();w.run();assert.equal(w.roots.length,1);w.restore();assert.equal(w.original.active,true);assert.equal(w.original.visible,true);assert.equal(w.roots.length,1);});
