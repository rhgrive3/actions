import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
const [base,source,target]=process.argv.slice(2).map(x=>path.resolve(x));
const git=(d,...args)=>execFileSync('git',['-C',d,...args],{encoding:'utf8'}).trim();
for(const [d,head,tree]of [[base,'a262d8bcd2c8e95d6fef76e6081d89c33aea25de','b5a46abb5be10288151579f1105cdc634f235b40'],[source,'8e55bfcbcdf9cd82df76dbf1a6948f9a075b6719','787d85f262f9124840344a3a88b783c16e903787']]){if(git(d,'rev-parse','HEAD')!==head||git(d,'rev-parse','HEAD^{tree}')!==tree)throw Error('Checkout pin');git(d,'diff','--exit-code','HEAD','--');}
const here=path.dirname(new URL(import.meta.url).pathname),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const packageRoot=path.resolve(here,'../..'),pkg=JSON.parse(fs.readFileSync(path.join(here,'package.json')));
for(const row of pkg.files){const file=path.resolve(packageRoot,row.path);if(!file.startsWith(packageRoot+path.sep)||hash(fs.readFileSync(file))!==row.sha256)throw Error('Diagnostic package hash '+row.path);}
if(hash(fs.readFileSync(path.join(source,'scripts/check-inkwave-projectile-visuals.mjs')))!=='eb7ee2e48983b69f1c30f79fb177f4e908d6a05d195f3c2b7b9f3ad7967425c7')throw Error('Original helper pin');
if(fs.existsSync(target)||[base,source].some(d=>target===d||target.startsWith(d+path.sep)))throw Error('Separate execution required');
fs.mkdirSync(path.join(target,'scripts/lib'),{recursive:true});fs.symlinkSync(path.join(source,'patches'),path.join(target,'patches'),'dir');
fs.symlinkSync(path.join(source,'scripts/lib/inkwave-projectile-ci-intro.mjs'),path.join(target,'scripts/lib/inkwave-projectile-ci-intro.mjs'));
fs.copyFileSync(path.join(here,'observe.mjs'),path.join(target,'scripts/lib/projectile-collision-observer.mjs'));fs.copyFileSync(path.join(here,'check-inkwave-projectile-visuals.mjs'),path.join(target,'scripts/check-inkwave-projectile-visuals.mjs'));
for(const d of [base,source])git(d,'diff','--exit-code','HEAD','--');
