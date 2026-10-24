#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {parseSourceAdmissionArgs,assertReceiptSeparate} from './lib/inkwave-source-admission-cli.mjs';
import {currentPairFixture,selectCurrentPair,verifyCurrentProjectilePair,currentPairNegativeControls} from './lib/inkwave-projectile-current-pair.mjs';

const options = parseSourceAdmissionArgs(process.argv.slice(2),['--baseline','--candidate','--event','--receipt','--baseline-site','--candidate-site','--expected-source-base','--expected-source-head'],['--baseline','--candidate','--event','--receipt']);
assert.equal(options.has('--baseline-site'),options.has('--candidate-site'),'both build sides required');
assert.equal(options.has('--expected-source-base'),options.has('--expected-source-head'),'both source labels required');
const baseline = path.resolve(options.get('--baseline')), candidate = path.resolve(options.get('--candidate'));
const eventFile = path.resolve(options.get('--event')), receipt = path.resolve(options.get('--receipt'));
const rawEvent = fs.readFileSync(eventFile,'utf8'), event = JSON.parse(rawEvent);
const eventName = process.env.GITHUB_EVENT_NAME, repository = process.env.GITHUB_REPOSITORY;
const route = selectCurrentPair(event,eventName,repository);
// Receipts may live in .ci-scratch, but cannot replace any production, QA,
// workflow or instruction input, including this verifier and its fixture.
const paths = [...currentPairFixture().roots,'scripts','.github','AGENTS.md'];
const separate = () => {
  assertReceiptSeparate(receipt,[baseline,candidate],paths);
  assertReceiptSeparate(receipt,[path.dirname(eventFile)],[path.basename(eventFile)]);
  for(const key of ['--baseline-site','--candidate-site'])if(options.has(key)){
    const site=path.resolve(options.get(key));assertReceiptSeparate(receipt,[path.dirname(site)],[path.basename(site)]);
  }
};
separate();
const args = {baseline,candidate,event,eventName,repository,baselineSite:options.get('--baseline-site'),candidateSite:options.get('--candidate-site'),expectedSourceBase:options.get('--expected-source-base'),expectedSourceHead:options.get('--expected-source-head')};
const evidence = verifyCurrentProjectilePair(args);
const controls = currentPairNegativeControls(route);
assert.deepEqual(verifyCurrentProjectilePair(args),evidence,'actual production bytes remain unchanged after controls');
assert.equal(fs.readFileSync(eventFile,'utf8'),rawEvent,'event input unchanged');
separate();
fs.mkdirSync(path.dirname(receipt),{recursive:true});
fs.writeFileSync(receipt,JSON.stringify({...evidence,controls},null,2)+'\n');
console.log(JSON.stringify({receipt,mode:evidence.mode,pr:evidence.pr,checkouts:evidence.checkouts,controls,writtenPaths:[]}));
