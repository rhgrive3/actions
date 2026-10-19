import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {REVIEWED_PAIR,planPrDiffBaseline}from '../lib/inkwave-projectile-pr-diff-baseline.mjs';
const base=process.env.INKWAVE_PR_DIFF_BASELINE,after=process.env.INKWAVE_PR_DIFF_CANDIDATE||process.cwd();
assert(base,'INKWAVE_PR_DIFF_BASELINE must point to the verified separate official checkout');
const before=new Map(REVIEWED_PAIR.paths.map(r=>[r.path,fs.readFileSync(base+'/'+r.path,'utf8')])),candidate=new Map(REVIEWED_PAIR.paths.map(r=>[r.path,fs.readFileSync(after+'/'+r.path,'utf8')]));
test('official d42 versus610 pair preserves all29before sources and3real differences',()=>{const snapshot=[...before],c=[...candidate],p=planPrDiffBaseline(before,candidate);assert.deepEqual([...p.sources],snapshot);assert.deepEqual(p.changes,[]);assert.deepEqual([...before],snapshot);assert.deepEqual([...candidate],c);assert.equal(p.evidence.paths.filter(r=>r.changed).length,3);});
test('every before/after one-byte mutation and missing path fails',()=>{for(const row of REVIEWED_PAIR.paths)for(const side of ['before','after'])for(const mutation of ['byte','missing']){const b=new Map(before),a=new Map(candidate),map=side==='before'?b:a;if(mutation==='byte')map.set(row.path,map.get(row.path)+' ');else map.delete(row.path);assert.throws(()=>planPrDiffBaseline(b,a));}});
test('swapped or candidate-copied before cannot hide PR difference',()=>{assert.throws(()=>planPrDiffBaseline(candidate,before));assert.throws(()=>planPrDiffBaseline(candidate,candidate));});
