import test from 'node:test';
import assert from 'node:assert/strict';
import {viabilityFixture} from './gyro-viability-fixture.mjs';
import {GYRO_STALE_MS} from '../gyro-permission.mjs';
const consume=g=>g.consume({yaw:0,pitch:0});

for(const hz of [30,60,120])test(`#1151 ${hz} Hz orientation remains healthy; silence is soft and recoverable`,async t=>{
  const h=await viabilityFixture({permission:'granted'});t.after(h.close);
  await h.m.setGyro(true);
  for(let i=0;i<hz*32;i++){
    await h.advance(1000/hz);
    h.fire('deviceorientation',{alpha:i/10,beta:0,gamma:0,timeStamp:h.env.performance.now()});
  }
  assert.equal(h.m.gyro.platformStatus.availability,'active');assert.equal(h.notices.length,0);
  for(let outage=0;outage<3;outage++){
    consume(h.m.gyro);await h.advance(GYRO_STALE_MS+1);
    const s=h.m.gyro.platformStatus;
    assert.equal(s.availability,'stale');assert.equal(s.state,'supported-stale');
    assert.equal(s.reason,'sensor-data-stale');assert.equal(s.permission,'granted');
    assert.equal(h.m.gyro.enabled,true);assert.equal(h.m.s.gyro,true);assert.equal(h.m._gyroWanted,true);
    assert.equal(h.m.els.gyro.attrs['aria-pressed'],'true');assert.match(h.m.els.gyro.title,/No recent gyro samples/);
    assert.equal(h.listenerCount('deviceorientation'),1);assert.equal(h.prompts.length,1);
    assert.equal(h.notices.length,outage+1);await h.advance(60000);assert.equal(h.notices.length,outage+1);
    h.orientation({alpha:100});assert.deepEqual(consume(h.m.gyro),{yaw:0,pitch:0});
    h.orientation({alpha:110});assert.notEqual(consume(h.m.gyro).yaw,0);
    assert.equal(h.m.gyro.platformStatus.availability,'active');
  }
});

for(const transition of ['focus','visibility','screen'])test(`#1151 ${transition} revalidates an established stream without clearing intent`,async t=>{
  const h=await viabilityFixture({permission:'granted'});t.after(h.close);
  await h.m.setGyro(true);h.orientation();h.orientation({alpha:20});consume(h.m.gyro);
  if(transition==='focus'){h.fire('blur');await h.advance(60000);assert.equal(h.notices.length,0);h.fire('focus');}
  if(transition==='visibility'){h.hide(true);await h.advance(60000);assert.equal(h.notices.length,0);h.hide(false);}
  if(transition==='screen'){h.env.screen.orientation.angle=90;h.fire('orientationchange');}
  assert.equal(h.m.gyro.platformStatus.availability,'waiting');await h.advance(2100);
  assert.equal(h.m.gyro.platformStatus.availability,'stale');assert.equal(h.m.gyro.enabled,true);
  assert.equal(h.m.s.gyro,true);assert.equal(h.m.gyro.platformStatus.permission,'granted');
  h.orientation({alpha:150});assert.deepEqual(consume(h.m.gyro),{yaw:0,pitch:0});
  h.orientation({alpha:165});assert.ok(Math.abs(h.m.gyro.dYaw)+Math.abs(h.m.gyro.dPitch)>0);
  assert.equal(h.listenerCount('deviceorientation'),1);assert.equal(h.prompts.length,1);
});

test('#1151 explicit retry preserves permission, off/dispose cancel all health probes',async t=>{
  const h=await viabilityFixture({permission:'granted'});t.after(h.close);
  await h.m.setGyro(true);h.orientation();await h.advance(GYRO_STALE_MS+1);
  h.m._toggleGyroFromTap();await Promise.resolve();await Promise.resolve();
  assert.equal(h.m._gyroWanted,true);assert.equal(h.m.gyro.platformStatus.availability,'waiting');
  assert.equal(h.prompts.length,1);assert.equal(h.listenerCount('deviceorientation'),1);
  h.orientation();await h.m.setGyro(false);const notices=h.notices.length;await h.advance(60000);
  assert.equal(h.m.gyro.platformStatus.availability,'idle');assert.equal(h.notices.length,notices);
  assert.equal(h.listenerCount('deviceorientation'),0);
  await h.m.setGyro(true);h.orientation();h.close();await h.advance(60000);
  assert.equal(h.listenerCount('deviceorientation'),0);assert.equal(h.m.gyro._platformGyroAccess.healthProbe,null);
});
