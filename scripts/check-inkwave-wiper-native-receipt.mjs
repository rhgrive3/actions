#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {hash} from './lib/inkwave-runtime-evidence.mjs';
import {assertWiperCaptureReceipt,wiperBuildReceiptBinding} from './lib/inkwave-wiper-acceptance-contract.mjs';

export function verifyWiperCaptureFiles(out, {sourceSha, manifestBytes}, read=fs.readFileSync) {
  const receipt=JSON.parse(read(path.join(out,'wiper-native-result.json')));
  assertWiperCaptureReceipt(receipt,{sourceSha,...wiperBuildReceiptBinding(manifestBytes)});
  for(const [key,file] of [['harnessSha256','./check-inkwave-wiper-native-acceptance.mjs'],['contractSha256','./lib/inkwave-wiper-acceptance-contract.mjs'],['launcherSha256','./lib/inkwave-sandbox-browser.mjs']])
    assert.equal(receipt[key],hash(fs.readFileSync(new URL(file,import.meta.url))),'Current QA helper bytes '+key);
  const seen=new Set();
  for(const c of receipt.cases)for(const f of c.frames)for(const im of f.images){
    assert.ok(!seen.has(im.file),'Each case/phase/view needs its own original PNG');seen.add(im.file);
    const bytes=read(path.join(out,im.file));
    assert.equal(bytes.length,im.bytes);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(hash(bytes),im.sha256,'Original screenshot hash '+im.file);
  }
  assert.equal(seen.size,36);
  return receipt;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [site,out,sourceSha]=process.argv.slice(2);assert.equal(process.argv.slice(2).length,3);
  verifyWiperCaptureFiles(out,{sourceSha,manifestBytes:fs.readFileSync(path.join(site,'inkwave-build.json'))});
  console.log('Verified 36 original Wiper PNGs, all six source-bound controlled cases and exact source/build identity');
}
