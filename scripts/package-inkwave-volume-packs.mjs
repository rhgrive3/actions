#!/usr/bin/env node
// Package a reviewed bake without changing a pixel, vertex or triangle.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
const [sheets,rods,destination='patches/local-quality/ink-volume/assets']=process.argv.slice(2);
if (!sheets || !rods) throw Error('Usage: package-inkwave-volume-packs.mjs <sheet-bake> <rod-bake> [output]');
for (const [slot,directory] of [['roller',sheets],['shooter',rods]]) {
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'))),binary=fs.readFileSync(path.join(directory,manifest.binary));
  if (crypto.createHash('sha256').update(binary).digest('hex')!==manifest.binarySHA256) throw Error('Unverified bake');
  const compressed=gzipSync(binary,{level:9,memLevel:4,mtime:0});
  if(compressed.length>20*1024*1024)throw Error('Compressed pack exceeds the transport budget');
  const out=path.join(destination,slot);fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'volumes.bin.gz'),compressed);
  fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({...manifest,binary:'volumes.bin.gz',compression:'gzip',cacheSlot:slot})+'\n');
  console.log(JSON.stringify({slot,binaryBytes:binary.length,transportBytes:compressed.length,SHA256:manifest.binarySHA256}));
}
