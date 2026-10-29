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
function runShow({ios,from,to,stack,opts={push:true},onCancel}) {
  const begin=patched.indexOf('  show(name = null, opts = {}) {');
  const end=patched.indexOf('\n  setLoading(',begin);
  assert.ok(begin>=0&&end>begin);
  const body=patched.slice(begin,end);
  const seen=[];
  const Fake=new Function('document','SCREENS','WIPES','LIGHT','performance','safeCall',
    'prefersReducedMotion','console','return class M { '+body+' }')(
      {documentElement:{classList:{contains:s=>s==='iw-ios'&&ios}}},
      ['pause','settings','main','title'],new Set(['pause>main','pause>title']),new Set(['pause','settings','main']),
      {now:()=>1},cb=>cb(),()=>false,{warn(){}});
  const m=new Fake();
  m.current=from;m._stack=[...stack];m._focus=null;m._focusMem={};
  m._swapToken=0;m.wipe={busy:false,cancel(){onCancel?.(m,seen);}};
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
test('iOS main menu retains existing presentation',()=>{
  assert.deepEqual(runShow({ios:true,from:'main',to:'settings',stack:['main']}),['swap','wipe:light']);
});
test('old paused page is released immediately rather than 340ms overlapping new settings',()=>{
  assert.match(patched,/\(opts\.instantLeave \|\| this\._stack\[0\] === 'pause'\) &&\s*document\.documentElement\.classList\.contains\('iw-ios'\)\) oe\.remove\(\);/);
  assert.match(patched,/else setTimeout\(\(\) => oe\.remove\(\), opts\.instantLeave \? 0 : 340\);/);
});
test('all other game modules and original menu screen implementations are untouched',()=>{
  assert.equal(adaptIosPausedMenuGpuGuard('src/game/weapons.js','unmodified',once),'unmodified');
  assert.ok(patched.includes('_scr_settings() {'));
  assert.ok(patched.includes("_scr_pause() {"));
  assert.ok(patched.includes('this._runWipe(null,'));
  assert.throws(()=>adaptIosPausedMenuGpuGuard('src/ui/menus.js',patched,once),/Missing production anchor/);
});

for (const from of ['pause', 'settings']) {
  for (const to of ['main', 'title', null]) {
    test(`iPad ${from} -> ${to}: outgoing pause owner suppresses explicit quit wipe`, () => {
      assert.deepEqual(runShow({ios:true,from,to,stack:from === 'pause' ? ['pause'] : ['pause',from],opts:{wipe:true}}), ['swap']);
    });
  }
}
test('outgoing iOS pause removes its DOM immediately after its stack is cleared', () => {
  const begin = patched.indexOf('  _swap(name, opts) {');
  const end = patched.indexOf('    this._modal = null;', begin);
  const run = new Function('safeCall','document','setTimeout',
    'return function(name,opts) {' + patched.slice(begin + '  _swap(name, opts) {'.length, end) + '}');
  for (const ios of [true, false]) {
    const events = [], stack = ['pause'];
    let transition;
    const start = patched.indexOf('  show(name = null, opts = {}) {');
    const finish = patched.indexOf('\n  setLoading(', start);
    const Menu = new Function('document','SCREENS','WIPES','LIGHT','performance','safeCall','prefersReducedMotion',
      'return class M {' + patched.slice(start,finish) + '}')(
        {documentElement:{classList:{contains:()=>ios}}}, ['pause','main'], new Set(), new Set(),
        {now:()=>0}, cb=>cb(), ()=>false);
    const menu = Object.assign(new Menu(), {current:'pause',_stack:stack,_focus:null,_swapToken:0,
      wipe:{busy:false,cancel(){}},api:{},_swap(name,opts){transition=opts;},_runWipe(){throw Error('unexpected wipe');}});
    menu.show(null);
    assert.equal(menu._stack.length,0);
    run(cb=>cb(), {documentElement:{classList:{contains:()=>ios}}}, ()=>events.push('timer'))
      .call({_stack:menu._stack,_scr:{el:{classList:{add(){}},remove(){events.push('remove');}}}},null,transition);
    assert.deepEqual(events, ios ? ['remove'] : ['timer']);
  }
});

test('entering iPad pause cancels an earlier wipe after its swap callback has been revoked',()=>{
  let calls=0;
  const seen=runShow({ios:true,from:'main',to:'pause',stack:['main'],opts:{},onCancel(menu,events){
    calls++;events.push('cancel');
    // Existing transition callbacks retain token 0; cancellation must not be
    // able to restore that screen during the newly requested pause.
    if(menu._swapToken===0)events.push('stale-swap');
  }});
  assert.equal(calls,1);assert.deepEqual(seen,['cancel','swap']);
});
