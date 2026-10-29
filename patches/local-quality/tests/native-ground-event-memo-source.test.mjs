import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeEventMemoProbe}from'./native-ground-event-memo-fixture.mjs';
test('old source Actor bus policy reuses stale native support during a real footstep callback',async t=>{
 const out=await nativeEventMemoProbe({oldPolicy:true});
 assert.equal(out.authoritativeEqual,true);assert.ok(out.firstContact>=0);
 const[control,candidate]=out.states;assert.ok(control.events.length>0&&candidate.events.length>0);
 assert.ok(Math.abs(control.callback[0].second-.1)<1e-9);assert.equal(candidate.callback[0].second,0);
 assert.equal(candidate.callback[0].active,true,'old memo remains active inside native event listeners');
 t.diagnostic(JSON.stringify(out));
});
