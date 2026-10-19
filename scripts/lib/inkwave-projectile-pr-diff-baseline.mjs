import fs from 'node:fs';import assert from 'node:assert/strict';import{createHash}from'node:crypto';
const raw=fs.readFileSync(new URL('../fixtures/inkwave-projectile-pr1651-source-pair.json',import.meta.url));
assert.equal(createHash('sha256').update(raw).digest('hex'),'aa7d603ee3ede2f68ae9c53595a5d0d5892d65762c865c7db86e373f998499de','reviewed pair fixture pin');
export const REVIEWED_PAIR=Object.freeze(JSON.parse(raw));
for(const row of REVIEWED_PAIR.paths){assert(typeof row.path==='string'&&/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/.test(row.path)&&!row.path.split('/').some(x=>x==='.'||x==='..'),'reviewed path must be a safe repository-relative file');}
const blob=text=>createHash('sha1').update('blob '+Buffer.byteLength(text)+'\0').update(text).digest('hex');
export function planPrDiffBaseline(before,after){
 assert(before instanceof Map&&after instanceof Map,'two source maps required');
 assert.equal(REVIEWED_PAIR.mode,'pr-diff-unmodified-reference');assert.equal(REVIEWED_PAIR.paths.length,29);assert.equal(new Set(REVIEWED_PAIR.paths.map(r=>r.path)).size,29);
 const paths=[];for(const row of REVIEWED_PAIR.paths){const b=before.get(row.path),a=after.get(row.path);assert.equal(typeof b,'string',row.path+': missing official before');assert.equal(typeof a,'string',row.path+': missing reviewed candidate');assert.equal(blob(b),row.before,row.path+': official fixed before mismatch');assert.equal(blob(a),row.after,row.path+': reviewed candidate mismatch');paths.push({...row,changed:row.before!==row.after});}
 return {sources:new Map(before),changes:[],evidence:{schema:1,mode:REVIEWED_PAIR.mode,base:REVIEWED_PAIR.base,candidateSourceEpoch:REVIEWED_PAIR.candidate,writtenPaths:[],paths,scope:'Unmodified official PR reference versus separately reviewed candidate sources. Historical replay is not performed.',limitation:'All existing physical, paint ledger and image comparison gates remain required; intended runtime differences are recorded, never exempted here.'}};
}
