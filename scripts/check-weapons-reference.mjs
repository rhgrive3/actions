#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const dir=process.argv[2];
if(!dir){console.error('Usage: node scripts/check-weapons-reference.mjs <raw-primary-data-directory>');process.exit(2);}
const ref=JSON.parse(fs.readFileSync(path.join(ROOT,'patches/splatoon3/reference/weapons-fidelity-reference.json'))),raw=new Map();
for(const source of ref.sources.filter(s=>s.expectedFileSha256)){
  const file=path.join(dir,path.basename(new URL(source.url).pathname)),bytes=fs.readFileSync(file);
  assert.equal(sha256(bytes),source.expectedFileSha256,'Raw source hash '+source.id);
  raw.set(source.id,JSON.parse(bytes));
}
for(const field of ref.explicitFields){
  let v=raw.get(field.sourceId);
  for(const part of field.pointer.split('/').slice(1))v=v?.[part.replace(/~1/g,'/').replace(/~0/g,'~')];
  assert.deepEqual(v,field.value,field.sourceId+field.pointer);
}
console.log(JSON.stringify({status:'passed',files:raw.size,explicitFields:ref.explicitFields.length,analystDefaultsVerified:false,engineParityCertified:false}));
