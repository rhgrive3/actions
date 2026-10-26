import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {adaptIosPausedMenuGpuGuard,IOS_PAUSED_MENU_CSS} from '../ios-paused-menu-gpu-guard.mjs';

const read = relative => fs.readFileSync(fileURLToPath(new URL('../../../'+relative,import.meta.url)),'utf8');
function once(s,before,after,label) {
  const i=s.indexOf(before);
  assert.notEqual(i,-1,'Missing production anchor '+label);
  assert.equal(s.indexOf(before,i+before.length),-1,'Duplicate anchor '+label);
  return s.slice(0,i)+after+s.slice(i+before.length);
}
const upstreamMenus = read('inkwave-public/src/ui/menus.js');
const upstreamCss = read('inkwave-public/styles/ui.css');

test('iOS rule is scoped to in-game menus and does not disable all blur or Android',()=>{
  const css=adaptIosPausedMenuGpuGuard('styles/ui.css',upstreamCss,once);
  assert.ok(css.endsWith(IOS_PAUSED_MENU_CSS));
  assert.ok(css.includes('html.iw-ios .iw-ui.is-ingame .iw-dimbg'));
  assert.ok(css.includes('html.iw-ios .iw-ui.is-ingame .iw-panel'));
  assert.ok(css.includes('-webkit-backdrop-filter: none !important'));
  assert.ok(css.includes('backdrop-filter: none !important'));
  assert.doesNotMatch(IOS_PAUSED_MENU_CSS,/html\.iw-android|html:not\(\.iw-ios\)/);
  assert.match(upstreamCss,/backdrop-filter: blur\(8px\)/);
  assert.throws(()=>adaptIosPausedMenuGpuGuard('styles/ui.css',css,once),/already applied/);
});

const patched = adaptIosPausedMenuGpuGuard('src/ui/menus.js',upstreamMenus,once);
function runShow({ios,from,to,stack,opts={push:true}}) {
  const begin=patched.indexOf('  show(name = null, opts = {}) {');
  const end=patched.indexOf('\n  setLoading(',begin);
  assert.ok(begin>=0&&end>begin);
  const body=patched.slice(begin,end);
  const seen=[];
  const Fake=new Function('document','SCREENS','WIPES','LIGHT','performance','safeCall',
    'prefersReducedMotion','console','return class M { '+body+' }')(
      {documentElement:{classList:{contains:s=>s==='iw-ios'&&ios}}},
      ['pause','settings','main'],new Set(),new Set(['pause','settings','main']),
      {now:()=>1},cb=>cb(),()=>false,{warn(){}});
  const m=new Fake();
  m.current=from;m._stack=[...stack];m._focus=null;m._focusMem={};
  m._swapToken=0;m.wipe={busy:false};
  m.api={onScreenChange(){}};
  m._swap=()=>{seen.push('swap');};
  m._runWipe=(cb,mode)=>{seen.push('wipe:'+(mode||'full'));cb?.();};
  m.show(to,opts);
  return seen;
}
test('iPad pause to options never starts DPR-scaled fullscreen Canvas2D wipe',()=>{
  assert.deepEqual(runShow({ios:true,from:'pause',to:'settings',stack:['pause']}),['swap']);
});
test('Android pause to options retains the original light wipe',()=>{
  assert.deepEqual(runShow({ios:false,from:'pause',to:'settings',stack:['pause']}),['swap','wipe:light']);
});
test('iOS main menu and leaving gameplay retain existing presentation',()=>{
  assert.deepEqual(runShow({ios:true,from:'main',to:'settings',stack:['main']}),['swap','wipe:light']);
  assert.deepEqual(runShow({ios:true,from:'pause',to:'main',stack:['pause'],opts:{}}),['swap','wipe:light']);
});
test('old paused page is released immediately rather than 340ms overlapping new settings',()=>{
  assert.match(patched,/this\._stack\[0\] === 'pause' &&\s*document\.documentElement\.classList\.contains\('iw-ios'\)\) oe\.remove\(\);/);
  assert.match(patched,/else setTimeout\(\(\) => oe\.remove\(\), opts\.instantLeave \? 0 : 340\);/);
});
test('all other game modules and original menu screen implementations are untouched',()=>{
  assert.equal(adaptIosPausedMenuGpuGuard('src/game/weapons.js','unmodified',once),'unmodified');
  assert.ok(patched.includes('_scr_settings() {'));
  assert.ok(patched.includes("_scr_pause() {"));
  assert.ok(patched.includes('this._runWipe(null,'));
  assert.throws(()=>adaptIosPausedMenuGpuGuard('src/ui/menus.js',patched,once),/Missing production anchor/);
});
