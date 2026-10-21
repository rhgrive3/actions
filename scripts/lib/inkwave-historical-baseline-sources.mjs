import fs from 'node:fs';import {gunzipSync}from'node:zlib';import{createHash}from'node:crypto';import assert from 'node:assert/strict';
// Official immutable source snapshots for historical baseline tests only.
// Current PR inputs are separately verified by the reviewed-pair contract.
const bytes=fs.readFileSync(new URL('../fixtures/inkwave-historical-baseline-sources.json.gz',import.meta.url));
assert.equal(createHash('sha256').update(bytes).digest('hex'),'3b70f6558a0e544b72798d2177b91cae59589639178e0dcad5839d68ad031863');
const data=JSON.parse(gunzipSync(bytes));
for(const rows of Object.values(data))for(const row of Object.values(rows)){const b=Buffer.from(row.content);if(row.sha256)assert.equal(createHash('sha256').update(b).digest('hex'),row.sha256);if(row.gitBlob)assert.equal(createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex'),row.gitBlob);}
export function historicalSource(kind,path){assert(data[kind]?.[path],kind+': missing historical source '+path);return data[kind][path].content;}
