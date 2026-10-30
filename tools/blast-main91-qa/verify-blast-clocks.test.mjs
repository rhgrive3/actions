import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./verify-blast-artifacts.mjs',import.meta.url),'utf8');
const line=source.split('\n').find(s=>s.includes(' const verifyFxClock='));
assert.ok(line,'actual verifier clock validator required');
const arrow=line.trim().replace(/^const verifyFxClock=/,'').replace(/;$/,'');
const verify=new Function('assert','return '+arrow)(assert);
const frames=[0,1,3,5,9,13,21,29];
function clock(frame){let t=0;for(let i=0;i<=frame;i++)t+=1/60;return{time:t,shell:t,ring:t,beam:t,mote:t,dt:1/60};}
test('all capture shader clocks follow actual repeated dt addition',()=>{for(const f of frames)verify(clock(f),f);assert.notEqual(clock(5).time,6/60,'analytic quotient is not the update operation order');});
test('missing nonfinite divergent and stale shader clocks fail closed',()=>{for(const f of frames)for(const key of ['time','shell','ring','beam','mote','dt'])for(const value of [undefined,NaN,Infinity,clock(f)[key]+.001])assert.throws(()=>verify({...clock(f),[key]:value},f));assert.throws(()=>verify(undefined,0));assert.throws(()=>verify(clock(0),1));});
