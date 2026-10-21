import fs from 'node:fs';import {gunzipSync}from'node:zlib';import{createHash}from'node:crypto';import assert from 'node:assert/strict';
// Official immutable source snapshots for historical baseline tests only.
// Current PR inputs are separately verified by the reviewed-pair contract.
const bytes=fs.readFileSync(new URL('../fixtures/inkwave-historical-baseline-sources.json.gz',import.meta.url));
assert.equal(createHash('sha256').update(bytes).digest('hex'),'0ee95a0b1419779a86c3dafcc72b4a94d0985de5a027921304a7a0034cb5ee00');
const data=JSON.parse(gunzipSync(bytes));
for(const rows of Object.values(data))for(const row of Object.values(rows)){const b=Buffer.from(row.content);if(row.sha256)assert.equal(createHash('sha256').update(b).digest('hex'),row.sha256);if(row.gitBlob)assert.equal(createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex'),row.gitBlob);}
export function historicalSource(kind,path){assert(data[kind]?.[path],kind+': missing historical source '+path);return data[kind][path].content;}
