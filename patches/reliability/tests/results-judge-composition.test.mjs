import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptResults } from '../results-adapter.mjs';
const rel='src/main.js';
const raw=fs.readFileSync(new URL('../../../inkwave-public/src/main.js',import.meta.url),'utf8');

test('#1131 Judd generation fence and room ownership compose before async Turf results',()=>{
 const source=adaptResults(rel,adaptTouchLayout(rel,adaptSource(rel,raw)));
 const start=source.indexOf('  async _judge() {');
 const end=source.indexOf('  _fade(',start);
 const judge=source.slice(start,end>start?end:start+20000);
 assert.match(judge,/const judgeEpoch = this\._s3JudgeEpoch/);
 assert.match(judge,/const resultsCurrent =/);
 assert.match(judge,/this\._s3JudgeEpoch !== judgeEpoch/);
 assert.match(judge,/if \(!resultsCurrent\(\)\) return;/);
 assert.throws(()=>adaptResults(rel,source),/reliability results conflict/);
});
