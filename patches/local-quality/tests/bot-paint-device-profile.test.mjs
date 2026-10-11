import test from 'node:test';
import assert from 'node:assert/strict';
import { installBotPaintDeviceProfile } from '../bot-paint-device-profile.mjs';
const environment=search=>{
  let t=0;
  return {location:{search},performance:{now:()=>{t+=.25;return t;}},navigator:{userAgent:'test browser'}};
};
test('#861 profile is strictly opt-in and leaves normal Actor/PaintSystem unchanged',()=>{
  class Actor{update(){return 7;}}
  const raw=()=>({n:1}),G={paint:{regionStats:raw},match:{mode:'turf'}};
  const e=environment('?profileBotPaint=0');
  assert.equal(installBotPaintDeviceProfile({G,Actor},e),null);
  assert.equal(new Actor().update(),7);
  assert.equal(G.paint.regionStats,raw);
  assert.equal(e.__inkwaveBotPaintProfile,undefined);
});
test('#861 real regionStats call rate and CPU counters are available on-device without uploads',()=>{
  class Actor{update(){return 9;}}
  const e=environment('?profileBotPaint=1'),G={match:{mode:'turf'},paint:{regionStats(){return {own:.5};}}};
  const cli=installBotPaintDeviceProfile({G,Actor},e);
  assert.equal(new Actor().update(),9);
  for(let n=0;n<7;n++)assert.equal(G.paint.regionStats().own,.5);
  const s=cli.snapshot();
  assert.equal(s.calls,7);
  assert.equal(s.byMode.turf,7);
  assert.ok(s.cpuMs>0&&s.callsPerSecond>0);
  assert.equal(s.device,'test browser');
  assert.equal(s.hardwareFPS,'unmeasured');
  cli.reset();
  assert.equal(cli.snapshot().calls,0);
  G.paint={regionStats(){return {n:1};}};new Actor().update();
  G.paint.regionStats();
  assert.equal(cli.snapshot().calls,1,'new PaintSystem binds independently on stage change');
});
