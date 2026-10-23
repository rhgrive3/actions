#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {parseSourceAdmissionArgs,assertReceiptSeparate} from './lib/inkwave-source-admission-cli.mjs';
import {rollerProjectileManifest,verifyRollerProjectilePair} from './lib/inkwave-roller-pr1856-projectile-pair.mjs';
const flags=['--baseline','--candidate','--base-sha','--candidate-sha','--event','--receipt'];
const args=parseSourceAdmissionArgs(process.argv.slice(2),flags,flags);
const baseline=path.resolve(args.get('--baseline')),candidate=path.resolve(args.get('--candidate')),receipt=path.resolve(args.get('--receipt'));
const manifest=rollerProjectileManifest(),inputs=[...new Set([...manifest.baseline.leaves,...manifest.candidate.leaves].map(r=>r.path))];
assertReceiptSeparate(receipt,[baseline,candidate],inputs);
const evidence=verifyRollerProjectilePair({baseline,candidate,baseSha:args.get('--base-sha'),candidateSha:args.get('--candidate-sha'),event:JSON.parse(fs.readFileSync(args.get('--event'),'utf8')),eventName:process.env.GITHUB_EVENT_NAME});
assert.deepEqual(evidence.writtenPaths,[]);
assertReceiptSeparate(receipt,[baseline,candidate],inputs);
fs.mkdirSync(path.dirname(receipt),{recursive:true});fs.writeFileSync(receipt,JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(evidence));
