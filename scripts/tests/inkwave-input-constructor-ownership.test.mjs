import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {adaptBuildSource} from '../inkwave-source-composition.mjs';

// Review the actual production composition and all ten listener owners, not a
// detached mock that could keep passing after a build-only adapter drifts.
const INPUT=new URL('../../inkwave-public/src/core/input.js',import.meta.url);
const raw=()=>fs.readFileSync(INPUT,'utf8');
const compose=s=>adaptBuildSource('src/core/input.js',s);
function assertUnsupportedGuard(source){
  const guards=[...source.matchAll(/try \{ unsupported = ([^;]+); \} catch \{ \/\* unknown denial: no retry \*\//g)];
  assert.equal(guards.length,1,'one final preference-owner denial guard');
  const evaluate=new Function('ticket','error',`let unsupported=false;try{unsupported=${guards[0][1]};}catch{}return unsupported;`);
  const live={raw:true,errorObserved:true};
  assert.equal(evaluate(live,{name:'NotSupportedError'}),true,'observed unsupported raw movement permits fallback');
  for(const [ticket,error] of [
    [{...live,raw:false},{name:'NotSupportedError'}],
    [{...live,errorObserved:false},{name:'NotSupportedError'}],
    [{...live,errorObserved:1},{name:'NotSupportedError'}],
    [live,{name:'NotAllowedError'}],[live,{name:'SecurityError'}],[live,{}],[live,null],
    [live,{get name(){throw Error('unknown browser denial');}}],
  ])assert.equal(evaluate(ticket,error),false,'unobserved, non-raw or unknown denial cannot permit fallback');
  assert.match(source,/if \(!unsupported \|\| !ownerAllowed \|\| !sameOwner\(\)/,'the final fallback branch requires this guard and current owner');
}

test('current input constructor preserves ten platform-owned listeners and explicit error evidence',()=>{
  const source=compose(raw());
  const start=source.indexOf('  constructor(canvas) {');
  const stop=source.indexOf('  get lastDevice()',start);
  assert(start>=0&&stop>start,'composed native Input constructor is present');
  const section=source.slice(start,stop);
  assert.equal([...section.matchAll(/this\._listenPlatform\((?:window|document), /g)].length,10,
    'each original listener remains owned by the platform lifetime');
  assert.equal(section.split('this._inputUnsubs = []; this._disposed = false;').length-1,1,
    'queue cleanup ownership is initialized once');
  assert.match(section,/ticket\.errorObserved = true/,'browser pointer-lock denial is recorded');
  assert.match(source,/ticket\.raw && ticket\.errorObserved === true && error\?\.name === 'NotSupportedError'/,
    'downstream preference owner retains the same observed-browser-error requirement');
  assertUnsupportedGuard(source);
  assert.doesNotMatch(section,/\b(?:window|document)\.addEventListener\(/,
    'platform-owned listeners must not be duplicated by a second owner');
});

test('final unsupported-denial guard rejects each missing admission condition',()=>{
  const source=compose(raw());
  for(const needle of ['ticket.raw && ','ticket.errorObserved === true && ',"error?.name === 'NotSupportedError'"]){
    assert.equal(source.split(needle).length-1,1,'unique final guard condition');
    const changed=source.replace(needle,needle.startsWith('error')?'true':'');
    assert.throws(()=>assertUnsupportedGuard(changed),undefined,'missing '+needle+' must be detected');
  }
});

test('missing or duplicated source listener anchors fail closed',()=>{
  const input=raw();
  const needle="    window.addEventListener('keydown', (e) => {";
  assert.equal(input.split(needle).length-1,1,'fixture matches upstream Input');
  assert.throws(()=>compose(input.replace(needle,"    window.addEventListener('invalid', (e) => {")),
    /conflict|anchor|expected|source drift/i);
  assert.throws(()=>compose(input.replace(needle,needle+'\n'+needle)),
    /conflict|anchor|expected|source drift/i);
});
