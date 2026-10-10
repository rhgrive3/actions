import test from 'node:test';
import assert from 'node:assert/strict';
import { menuNavigationFixture } from './menu-navigation-fixture.mjs';

// Preserve PR #1182's title acceptance assertions against the actual composed
// Menus implementation, instead of a fake _titleGo replaced by the installer.
function fixture() {
  const f = menuNavigationFixture();
  f.show('title');
  const advance = ms => { f.advance(ms); f.mid(); };
  return { ...f, advance, tasks: f.timers };
}
test('#950 title confirmation transitions once after its original 200ms',()=>{
 const f=fixture();f.m._titleGo();f.m._titleGo();assert.equal(f.tasks.size,1);
 f.advance(199);assert.equal(f.m.current,'title');
 f.advance(1);assert.equal(f.m.current,'main');
 assert.equal(f.calls.filter(s=>s==='main').length,1);
});
test('#950 subsequent navigation and re-entered title cannot be stolen by the previous timer',()=>{
 const f=fixture();f.m._titleGo();f.m.show('settings', { wipe: false });
 f.advance(200);assert.equal(f.m.current,'settings');
 f.m.show('title', { wipe: false });f.m._shownAt=0;f.m._titleGo();
 f.m.show('main', { wipe: false });f.m.show('title', { wipe: false });f.advance(200);
 assert.equal(f.m.current,'title');
});
test('#950 dispose clears pending title timeout and prevents screen resurrection',()=>{
 const f=fixture();f.m._titleGo();f.m.dispose();
 assert.equal(f.tasks.size,0);f.advance(200);
 assert.equal(f.m.current,'title');f.m.show('main');
 assert.equal(f.m.current,'title');
 assert.deepEqual(f.calls.filter(s=>s==='main'),[]);
});
