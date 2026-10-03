import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { adaptHud } from '../hud-adapter.mjs';
import { adaptResults } from '../results-adapter.mjs';
import { adaptIntro } from '../intro-adapter.mjs';
import { adaptStart } from '../start-adapter.mjs';
import { fixture,readSource,existingGameSource,flush } from './hud-fixture.mjs';

const adapted = () => fixture({ hudSource:adaptHud('src/ui/hud.js',readSource('src/ui/hud.js')), gameSource:adaptHud('src/main.js',existingGameSource()) });
const deferred = () => { let resolve; const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve}; };
function noPresentation(h) {
  assert.equal(h.judges().length,0); assert.equal(h.hud._fxMap?.has('judge'),false);
  assert.equal(h.game.profile.matches,0); assert.equal(h.count('results'),0); assert.equal(h.count('save'),0);
}
function visuals(h) {
  return h.judges().map(el=>({className:el.className,nums:el.querySelectorAll('.iw-jd__num').map(n=>n.textContent),bars:el.querySelectorAll('.iw-jd__bar').map(n=>n.style.transform)}));
}

test('HUD anchors fail closed, require result ownership, and compose with start in either order', () => {
  for(const rel of ['src/ui/hud.js','src/main.js']) {
    const original=rel.endsWith('hud.js')?readSource(rel):existingGameSource();
    assert.notEqual(adaptHud(rel,original),original);
    for(const value of ['',original+original,adaptHud(rel,original)]) assert.throws(()=>adaptHud(rel,value),/HUD (anchor mismatch|owner missing)/);
  }
  assert.throws(()=>adaptHud('src/main.js',readSource('src/main.js')),/owner missing/);
  const beforeStart=adaptIntro('src/main.js',adaptResults('src/main.js',readSource('src/main.js')));
  assert.equal(adaptStart('src/main.js',adaptHud('src/main.js',beforeStart)),adaptHud('src/main.js',adaptStart('src/main.js',beforeStart)));
  assert.equal(adaptHud('src/ui/menus.js','unchanged'),'unchanged');
});

test('raw HUD negative: actual quit flow leaves old overlay, drum/reveal sounds and completion over a new intro', async () => {
  const h=await fixture(); let completed=false;
  const pending=h.game._judge().then(()=>{completed=true;}); await h.advance(200);
  await h.game.quitToMenu(); h.game.match={state:'intro'};h.game._beginMatchFlow();
  assert.equal(h.judges().length,1); await h.advance(5100); await pending;
  assert.deepEqual(h.voices.map(v=>v.name),['judge_drumroll','judge_reveal']);
  assert.equal(completed,true);assert.equal(h.judges().length,1);
  assert.equal(h.game.profile.matches,0); // earlier result guard already worked; HUD lifetime did not
});

test('raw HUD negative: overlapping judges strand the previous overlay and Promise', async () => {
  const h=await fixture(); let oldCount=0,newCount=0;
  h.hud.judge().then(()=>{oldCount++;}); await h.advance(200);
  const pending=h.hud.judge().then(()=>{newCount++;}); await h.advance(5300);await pending;
  assert.equal(oldCount,0);assert.equal(newCount,1);assert.equal(h.judges().length,2);
});

test('raw HUD negative: synchronous judge replacement at sound callback loses its new FX ownership', async () => {
  const h=await fixture();h.hud.timeScale=120;
  h.hookSound(()=>{h.hookSound(null);h.hud.judge();});h.hud.judge();await h.advance(50);
  assert.equal(h.hud._fxMap.has('judge'),false);assert.equal(h.judges().length,2);
});

test('standalone/default judging preserves visible phases, result, sounds and original delays', async () => {
  const raw=await fixture(),fixed=await adapted();
  // The pre-reveal numbers are decorative randomness, shared with both paths.
  raw.hud.timeScale=fixed.hud.timeScale=1;
  const results=[];
  for(const h of [raw,fixed]) {
    h.hud.setVisible(true);h.hud.setVisible(false);
    h.hud.judge({percents:[60,40]}).then(value=>results.push({value:{...value},at:h.now()}));
  }
  let elapsed=0;
  for(const target of [750,850,3400,3500,3800,5100,5200,5900]) {
    await raw.advance(target-elapsed);await fixed.advance(target-elapsed);elapsed=target;
    // Ignore decorative rolling values only; all final numbers, transforms and phase classes match.
    const a=visuals(raw),b=visuals(fixed);
    if(target<3450) { for(const v of [...a,...b]) v.nums=[]; }
    assert.deepEqual(b,a,`visible state at ${target}ms`);
    assert.deepEqual(fixed.calls.filter(c=>c[0]==='hudSound'),raw.calls.filter(c=>c[0]==='hudSound'));
    if(target===750) assert.equal(raw.voices.length,0);
    if(target===3400) assert.equal(raw.voices.length,1);
  }
  assert.equal(results.length,2);assert.deepEqual(results[0],results[1]);assert.deepEqual(results[0].value,{winner:0});
  assert.ok(results[0].at>5100);assert.equal(raw.judges().length,0);assert.equal(fixed.judges().length,0);
  assert.equal(fixed.rafs.size,0);assert.equal(fixed.timers.size,0);
  assert.equal(fixed.voices.some(v=>v.stopped),false); // normal one-shots are not cut off
});

test('normal Game judging remains equivalent and undefined/no-HUD fallback is still valid', async () => {
  const raw=await fixture(),fixed=await adapted();
  const a=raw.game._judge(),b=fixed.game._judge();await raw.advance(5300);await fixed.advance(5300);await Promise.all([a,b]);
  assert.deepEqual({...fixed.game.profile},{...raw.game.profile});assert.equal(fixed.game.profile.matches,1);
  assert.equal(JSON.stringify(fixed.calls.find(c=>c[0]==='results')),JSON.stringify(raw.calls.find(c=>c[0]==='results')));
  for(const fallback of ['undefined','missing','cancelled']) {
    const h=await adapted();
    h.game.hud=fallback==='missing'?null:{setVisible(){},judge:()=>Promise.resolve(fallback==='cancelled'?{cancelled:true}:undefined)};
    const p=h.game._judge();if(fallback==='missing')await h.advance(4000);await p;
    assert.equal(h.game.profile.matches,fallback==='cancelled'?0:1);
  }
});

test('quit cancels before roll, during roll, or after reveal even while the old match survives fade', async () => {
  for(const at of [200,900,3500]) {
    const h=await adapted(),fade=deferred();const pending=h.game._judge();await h.advance(at);
    const sounds=h.voices.length;h.game._fade=()=>fade.promise;
    const quit=h.game.quitToMenu();assert.equal(h.game.match,h.match);
    await h.advance(50);await pending;noPresentation(h);
    assert.equal(h.voices.length,sounds);assert.equal(h.voices.every(v=>v.stopped===1),true);
    assert.equal(h.rafs.size,0);assert.equal(h.timers.size,0);
    fade.resolve();await quit;
  }
});

test('replaced match/room owner removes obsolete judge without awarding results', async () => {
  for(const kind of ['match','room']) {
    const h=await adapted();
    if(kind==='room') {h.G.net={tr:{},state:'match'};h.G.netm={};h.game._beginMatchFlow();}
    const pending=h.game._judge();await h.advance(900);
    if(kind==='match')h.game.match={state:'intro'};else h.G.net.tr={};
    await h.advance(50);await pending;noPresentation(h);assert.equal(h.voices[0].stopped,1);
  }
});

test('overlapping same-match Game judges resolve old cancellation exactly once and award only the new result', async () => {
  const h=await adapted();const deliveries=[];const judge=h.hud.judge.bind(h.hud);
  h.hud.judge=options=>judge(options).then(value=>{deliveries.push({...value});return value;});
  const old=h.game._judge();await h.advance(900);const oldTick=h.hud._fxMap.get('judge');
  const newer=h.game._judge();await old;assert.deepEqual(deliveries,[{cancelled:true}]);
  assert.equal(h.judges().length,1);assert.equal(h.game.profile.matches,0);
  const newTick=h.hud._fxMap.get('judge');oldTick(1);assert.equal(h.hud._fxMap.get('judge'),newTick);
  await h.advance(5900);await newer;
  assert.deepEqual(deliveries,[{cancelled:true},{winner:0}]);assert.equal(h.game.profile.matches,1);assert.equal(h.count('results'),1);
  assert.equal(h.judges().length,0);assert.equal(h.rafs.size,0);
});

test('reentrant replacement at sound delivery cannot delete new FX or leak the old returned voice', async () => {
  for(const sound of ['judge_drumroll','judge_reveal']) {
    const h=await adapted();let replacement;
    h.hookSound(name=>{if(name!==sound)return;h.hookSound(null);replacement=h.hud.judge();});
    const pending=h.game._judge();await h.advance(sound==='judge_drumroll'?900:3500);await pending;
    assert.equal(h.game.profile.matches,0);assert.equal(h.count('results'),0);assert.equal(h.count('save'),0);
    assert.equal(h.judges().length,1);assert.equal(h.hud._fxMap.has('judge'),true);
    assert.equal(h.voices.find(v=>v.name===sound).stopped,1);
    await h.advance(5900);await replacement;assert.equal(h.judges().length,0);
  }
});

test('paused cancellation and disposal settle judges while retaining unrelated FX until disposal', async () => {
  const h=await adapted();let current=true;let deliveries=0;
  const pending=h.hud.judge({isCurrent:()=>current}).then(value=>{deliveries++;return value;});await h.advance(900);
  h.hud._snd('other');
  let otherTicks=0;h.hud._addFx('smear',()=>{otherTicks++;return true;});h.hud.paused=true;current=false;
  await h.advance(50);assert.equal((await pending).cancelled,true);assert.equal(h.hud._fxMap.has('smear'),true);
  assert.equal(h.hud._fxMap.has('judge'),false);assert.equal(h.judges().length,0);assert.equal(h.voices[0].stopped,1);assert.equal(h.voices[1].stopped,0);
  h.hud.paused=false;await h.advance(50);assert.ok(otherTicks>0);
  const next=h.hud.judge();h.hud.dispose();assert.equal((await next).cancelled,true);
  assert.equal(h.rafs.size,0);assert.equal(h.timers.size,0);assert.equal(h.hud._fxMap.size,0);
  assert.equal(deliveries,1);assert.equal((await h.hud.judge()).cancelled,true);assert.equal(h.judges().length,0);
});

test('outgoing fade is removed on owner departure while successful Promise stays settled once', async () => {
  const h=await adapted();let current=true;const delivered=[];
  const pending=h.hud.judge({isCurrent:()=>current,percents:[60,40]}).then(value=>{delivered.push({...value});return value;});
  await h.advance(5200);await pending;assert.deepEqual(delivered,[{winner:0}]);assert.equal(h.judges().length,1);
  current=false;await h.advance(50);assert.equal(h.judges().length,0);assert.equal(h.rafs.size,0);assert.equal(h.timers.size,0);
  await h.advance(1000);assert.deepEqual(delivered,[{winner:0}]);
});

test('actual AudioEngine.play returns a V handle and cancelling its judge disconnects only those nodes', async () => {
  const audio=readSource('src/audio/audio.js'),music=readSource('src/audio/music.js');
  const start=audio.indexOf('  play(name, o = {}) {'),end=audio.indexOf('\n  loop(name, o = {}) {',start);
  const vstart=music.indexOf('export class V {'),vend=music.indexOf('\nexport function kick(',vstart);
  assert.ok(start>=0&&end>start&&vstart>=0&&vend>vstart);
  const context=vm.createContext({console,MAX_VOICES:48});
  const api=vm.runInContext(`${music.slice(vstart,vend).replace('export class V','class V')}\nclass Audio {${audio.slice(start,end)}};({Audio,V})`,context);
  const engine=new api.Audio();const disconnected=[];
  Object.assign(engine,{ctx:{currentTime:0,sampleRate:48000},last:new Map(),byName:new Map(),voices:[],rng:()=>.5,counts:{played:0,dropped:0},
    _def:()=>({gain:1,build(){}}),_voice(){const v=new api.V(this.ctx,{},0);v.nodes.push({disconnect(){disconnected.push(v);}});return {v};},
  });
  const unrelated=engine.play('unrelated');assert.equal(unrelated,engine.voices[0]);assert.equal(unrelated.v.dead,false);
  const h=await adapted();h.hud.playSound=(name,opts)=>engine.play(name,opts);let current=true;
  const pending=h.hud.judge({isCurrent:()=>current});await h.advance(900);
  const owned=engine.voices[1];assert.equal(owned.v.dead,false);assert.equal(owned.done,undefined);
  current=false;await h.advance(50);assert.equal((await pending).cancelled,true);
  assert.equal(owned.v.dead,true);assert.equal(owned.done,true);assert.equal(unrelated.v.dead,false);
  assert.equal(disconnected.length,1);
});
