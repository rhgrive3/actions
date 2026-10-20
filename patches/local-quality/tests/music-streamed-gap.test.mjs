import test from 'node:test';
import assert from 'node:assert/strict';
import { idleFixture, audioFixture } from './idle-fixture.mjs';

async function rig({ pending = false, streamed = true } = {}) {
  const f = audioFixture(), media = [], listeners = new Map();
  const document = { hidden: false, hasFocus: () => true,
    addEventListener(type, fn) { listeners.set(type, fn); }, removeEventListener() {} };
  class Audio {
    constructor() { Object.assign(this, { currentTime: 0, src: '', paused: true, ended: false, error: null, events: new Map() }); media.push(this); }
    addEventListener(type, fn) { this.events.set(type, fn); }
    removeEventListener(type, fn) { assert.equal(this.events.get(type), fn); this.events.delete(type); }
    play() { this.paused = false; return pending ? new Promise(() => {}) : Promise.resolve(); }
    pause() { this.paused = true; }
    removeAttribute(name) { assert.equal(name, 'src'); this.src = ''; }
    load() {}
  }
  const api = await idleFixture({ globals: { ...f.globals, ...(streamed ? { Audio } : {}), window: {}, document, addEventListener() {}, removeEventListener() {} } });
  const music = new api.MusicEngine(); music._init(f.ctx, f.ctx.createGain()); music.play(streamed ? 'battle' : 'title', { fade: 0 });
  // Constructor names are minified in production; check the actual media owner.
  assert.equal(music.current.element instanceof Audio, streamed);
  music._tick();
  return { ...f, music, media, document, listeners, gap(seconds) { f.ctx.currentTime += seconds; music._tick(); } };
}

for (const pending of [false, true]) test(`streamed music retains its element across foreground scheduler gaps (pending=${pending})`, async () => {
  const f = await rig({ pending });
  try {
    const player = f.music.current, element = player.element; element.currentTime = 17.25;
    for (const seconds of [.025, .25, .250001, 2.3, .025]) {
      f.gap(seconds);
      assert.ok(f.music.current === player); assert.equal(player.disposed, false);
      assert.equal(element.currentTime, 17.25); assert.equal(f.media.length, 1);
      assert.equal(f.music._platformMusic.restarts, 0);
    }
    assert.equal(f.music._fileRetryCount, 0);
    f.music.setMusicEnabled(false); assert.equal(f.music.current, null);
    f.music.setMusicEnabled(true); assert.equal(f.media.length, 2);
    const failed = f.music.current; failed.element.events.get('error')();
    assert.equal(failed.failed, true); assert.equal(f.music._fileRetryCount, 1);
  } finally { f.music.dispose(); }
});

for (const state of ['paused', 'ended', 'error']) test(`streamed ${state} state does not bypass existing gap recovery`, async () => {
  const f = await rig();
  try {
    const old = f.music.current; old.element[state] = state === 'error' ? { code: 3 } : true;
    f.gap(1); assert.notEqual(f.music.current, old); assert.equal(old.disposed, true);
    assert.equal(f.music._platformMusic.restarts, 1);
  } finally { f.music.dispose(); }
});

test('streamed clock rollback still rebases playback', async () => {
  const f = await rig();
  try {
    f.gap(.1); const old = f.music.current;
    f.ctx.currentTime = 0; f.music._tick();
    assert.notEqual(f.music.current, old); assert.equal(old.disposed, true);
    assert.equal(f.music._platformMusic.restarts, 1);
  } finally { f.music.dispose(); }
});

test('explicit hidden/resume lifecycle still rebases a streamed track', async () => {
  const f = await rig();
  try {
    const old = f.music.current;
    f.document.hidden = true; f.listeners.get('visibilitychange')();
    f.gap(1); assert.equal(f.music.current, old);
    f.document.hidden = false; f.listeners.get('visibilitychange')();
    assert.notEqual(f.music.current, old); assert.equal(old.disposed, true);
    assert.equal(f.music._platformMusic.restarts, 1);
  } finally { f.music.dispose(); }
});

for (const flag of ['failed', 'disposed']) test(`streamed ${flag} owner does not bypass gap recovery`, async () => {
  const f = await rig();
  try {
    const old = f.music.current; old[flag] = true;
    f.gap(1); assert.notEqual(f.music.current, old);
    assert.equal(f.music._platformMusic.restarts, 1);
    // Restore the artificial disposed flag so the fixture's old resources close.
    if (flag === 'disposed') { old.disposed = false; old.dispose(); }
  } finally { f.music.dispose(); }
});

test('native synthesized player is not restarted by foreground scheduler gaps', async () => {
  const f = await rig({ streamed: false });
  try {
    const old = f.music.current; assert.equal(old.element, undefined);
    // Every tick of a starved main thread (frames >250 ms) used to replay the song from bar 0.
    for (const seconds of [.025, .25, .250001, 1, 2.3, .3, .3, .3]) {
      f.gap(seconds);
      assert.ok(f.music.current === old); assert.equal(old.disposed, false);
      assert.equal(f.music._platformMusic.restarts, 0);
    }
  } finally { f.music.dispose(); }
});

test('native synthesized player still rebases on clock rollback and hidden/resume', async () => {
  const f = await rig({ streamed: false });
  try {
    f.gap(.1); const old = f.music.current;
    f.ctx.currentTime = 0; f.music._tick();
    assert.notEqual(f.music.current, old); assert.equal(old.disposed, true);
    assert.equal(f.music._platformMusic.restarts, 1);
    const hidden = f.music.current;
    f.document.hidden = true; f.listeners.get('visibilitychange')();
    f.gap(1); assert.equal(f.music.current, hidden);
    f.document.hidden = false; f.listeners.get('visibilitychange')();
    assert.notEqual(f.music.current, hidden); assert.equal(hidden.disposed, true);
    assert.equal(f.music._platformMusic.restarts, 2);
  } finally { f.music.dispose(); }
});

for (const pending of [false,true]) test(`primed battle survives procedural menu rebase pending=${pending}`,async()=>{
 const f=await rig({pending});try{
 f.music.play('menu',{fade:0});f.music.preloadFile('battle',{prime:true});
 const preload=f.music._preloadedFile, player=preload.player, menu=f.music.current;
 f.gap(4.15);assert.ok(f.music._preloadedFile===preload);assert.equal(player.disposed,false);
 assert.equal(f.music.current,menu);assert.equal(f.music._platformMusic.restarts,0);
 f.music.stop(.3);f.music.preloadFile('battle',{prime:true});f.music.play('opening',{fade:0});f.gap(1);
 assert.ok(f.music._preloadedFile===preload);f.music.play('battle',{fade:0});
 assert.equal(f.music.current,player);assert.equal(f.music._preloadedFile,null);
 }finally{f.music.dispose()}
});
for(const action of ['explicit-menu','hidden-resume','rollback']) test(`preload is not protected on ${action}`,async()=>{
 const f=await rig();try{
 f.music.play('menu',{fade:0});f.music.preloadFile('battle',{prime:true});const p=f.music._preloadedFile.player;
 if(action==='explicit-menu')f.music.play('menu');
 else if(action==='hidden-resume'){f.document.hidden=true;f.listeners.get('visibilitychange')();f.gap(1);f.document.hidden=false;f.listeners.get('visibilitychange')()}
 else if(action==='rollback'){f.gap(.1);f.ctx.currentTime=0;f.music._tick()}
 assert.equal(f.music._preloadedFile,null);assert.equal(p.disposed,true);
 }finally{f.music.dispose()}
});
// A late scheduler tick never recycles the running menu song or touches the primed recording,
// whatever state that recording is in; its own error/GO handling owns recovery.
for(const state of ['failed','paused','ended','error']) test(`scheduler gap leaves menu music and primed preload alone (${state})`,async()=>{
 const f=await rig();try{
 f.music.play('menu',{fade:0});f.music.preloadFile('battle',{prime:true});
 const menu=f.music.current,preload=f.music._preloadedFile,p=preload.player;
 if(state==='failed')p.failed=true;else p.element[state]=state==='error'?{code:3}:true;
 f.gap(1);
 assert.equal(f.music.current,menu);assert.equal(menu.disposed,false);
 assert.ok(f.music._preloadedFile===preload);assert.equal(p.disposed,false);
 assert.equal(f.music._platformMusic.restarts,0);
 }finally{f.music.dispose()}
});

test('scheduler gap does not leak a preload token into a later music toggle',async()=>{
 const f=await rig();try{
 f.music.play('menu',{fade:0});f.music.preloadFile('battle',{prime:true});const p=f.music._preloadedFile.player;
 f.gap(1);assert.equal(p.disposed,false);assert.equal(f.music._platformPreloadReplay,undefined);
 f.music.setMusicEnabled(false);f.music.setMusicEnabled(true);
 assert.equal(f.music._preloadedFile,null);assert.equal(p.disposed,true);
 }finally{f.music.dispose()}
});
test('rollback replay remapped to another track drops primed battle',async()=>{
 const f=await rig();try{
 f.music.play('menu',{fade:0});f.music.preloadFile('battle',{prime:true});const p=f.music._preloadedFile.player;
 f.music.remap=track=>track==='menu'?'title':track;f.gap(.1);f.ctx.currentTime=0;f.music._tick();
 assert.equal(f.music._preloadedFile,null);assert.equal(p.disposed,true);
 assert.equal(f.music._platformPreloadReplay,undefined);
 }finally{f.music.dispose()}
});
