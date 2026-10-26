#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {BASE,hash,verifySourcePair,assertSourceReceipt,verifyBuildInventory,assertReceiptOutside,writeReceipt} from './lib/inkwave-pr1869-current-pair.mjs';
const allowed=new Set(['--phase','--baseline','--candidate','--event','--receipt','--source-receipt','--side','--site']),options=new Map();
const args=process.argv.slice(2);
for(let i=0;i<args.length;i+=2){assert(allowed.has(args[i])&&!options.has(args[i]),'known unique argument');assert(typeof args[i+1]==='string'&&!args[i+1].startsWith('--'),'argument value required');options.set(args[i],args[i+1]);}
for(const key of ['--phase','--baseline','--candidate','--event','--receipt'])assert(options.has(key),'required '+key);
const phase=options.get('--phase');assert(['source','build'].includes(phase),'explicit verification phase');
if(phase==='source')for(const key of ['--source-receipt','--side','--site'])assert(!options.has(key),'build-only '+key);
else for(const key of ['--source-receipt','--side','--site'])assert(options.has(key),'required '+key);
const baseline=fs.realpathSync(options.get('--baseline')),candidate=fs.realpathSync(options.get('--candidate')),eventFile=fs.realpathSync(options.get('--event'));
const receipt=assertReceiptOutside(options.get('--receipt'),[baseline,candidate],eventFile);
const rawEvent=fs.readFileSync(eventFile,'utf8'),event=JSON.parse(rawEvent);
const input={baseline,candidate,event,eventName:process.env.GITHUB_EVENT_NAME,repository:process.env.GITHUB_REPOSITORY};
const source=verifySourcePair(input);let output=source;
if(phase==='build'){
 const sourceReceipt=assertReceiptOutside(options.get('--source-receipt'),[baseline,candidate],eventFile);assert.notEqual(sourceReceipt,receipt,'separate source/build receipts');
 const sourceRaw=fs.readFileSync(sourceReceipt,'utf8');assertSourceReceipt(JSON.parse(sourceRaw),source);
 const side=options.get('--side');assert(['before','after'].includes(side),'explicit capture side');
 const root=side==='before'?baseline:candidate,commit=side==='before'?BASE:source.route.head;
 const build=verifyBuildInventory({root,commit,site:path.resolve(options.get('--site'))});
 assert.deepEqual(verifySourcePair(input),source,'both sources unchanged through build verification');
 assert.equal(fs.readFileSync(sourceReceipt,'utf8'),sourceRaw,'source receipt stable');
 output={schema:1,mode:'pr1869-reviewed-current-no-replay-build',side,sourceReceiptSha256:hash(sourceRaw),source,build,changes:[],writtenPaths:[],limitation:'Verified source and build identity only; original physical and image comparison remains mandatory.'};
}
assert.equal(fs.readFileSync(eventFile,'utf8'),rawEvent,'event unchanged during verification');
assertReceiptOutside(receipt,[baseline,candidate],eventFile);writeReceipt(receipt,output);
console.log(JSON.stringify({receipt,phase,mode:output.mode,sourceBase:source.route.base,sourceHead:source.route.head,writtenPaths:[]}));
