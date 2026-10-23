#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {verifySheetV2Epoch} from './lib/inkwave-sheet-v2-epoch.mjs';
const names={'--epoch':'epoch','--candidate-profile':'candidateProfile','--provenance':'provenance',
  '--baseline':'baseline','--candidate':'candidate','--base-sha':'baseSha','--candidate-sha':'candidateSha',
  '--base-tree':'baseTree','--candidate-tree':'candidateTree','--site':'site','--receipt':'receipt','--verifier-sha':'verifierSha','--published-heads':'publishedHeads'};
const options={};
for(let i=2;i<process.argv.length;i+=2) {
  const flag=process.argv[i],name=names[flag],value=process.argv[i+1];
  assert.ok(name,'unknown argument '+flag);assert.ok(!Object.hasOwn(options,name),'duplicate '+flag);
  assert.ok(value&&!value.startsWith('--'),'complete '+flag);options[name]=value;
}
for(const [flag,name] of Object.entries(names))assert.ok(Object.hasOwn(options,name),'required '+flag);
const {receipt,evidence}=verifySheetV2Epoch(options);
const fd=fs.openSync(receipt,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
try{fs.writeFileSync(fd,JSON.stringify(evidence,null,2)+'\n');}finally{fs.closeSync(fd);}
console.log(JSON.stringify(evidence));
