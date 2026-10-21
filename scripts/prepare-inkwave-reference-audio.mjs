import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { prepare, verifyTrees, verifyBuilds } from './lib/inkwave-reference-audio.mjs';
const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,all)=>{if(i%2===0)a.push([v.replace(/^--/,''),all[i+1]]);return a;},[]));
const receipt=args.receipt;
if (!receipt) throw Error('--receipt required');
let result;
if (args.verify) {
  result=JSON.parse(readFileSync(receipt,'utf8'));
  result.finalSourceVerification=verifyTrees(args.original,args.derived);
  if (result.finalSourceVerification.originalSourceDigest !== result.originalSourceDigest || result.finalSourceVerification.derivedSourceDigest !== result.derivedSourceDigest) throw Error("source identity changed after preparation");
  result.buildVerification=verifyBuilds(JSON.parse(readFileSync(args['pristine-build'],'utf8')),JSON.parse(readFileSync(args['derived-build'],'utf8')));
} else result=prepare({original:args.original,derived:args.derived,candidate:args.candidate,actualBase:execFileSync('git',['-C',args.original,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),identity:{side:args.side,pr:args.pr,baseRef:args['base-ref'],baseSha:args['base-sha']}});
result.captureCheckoutShaMeaning='harness checkout only, not reference source';
result.derivedSourceCommit=null;
result.harnessCheckoutSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
mkdirSync(path.dirname(receipt),{recursive:true}); writeFileSync(receipt,JSON.stringify(result,null,2)+'\n');
