import fs from 'node:fs';
import path from 'node:path';
import {preparePhaseControl,verifyPhaseBuilds,verifyPhaseTrees} from './lib/inkwave-slosher-phase-control.mjs';
const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,all)=>{if(i%2===0)a.push([v.replace(/^--/,''),all[i+1]]);return a;},[]));
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
let result;
if(args.verify){result=read(args.receipt);verifyPhaseTrees(result);result.builds=verifyPhaseBuilds(result,read(args['original-build']),read(args['control-build']));}
else result=preparePhaseControl({baseline:args.baseline,derived:args.derived,candidate:args.candidate,event:read(args.event||process.env.GITHUB_EVENT_PATH),repository:process.env.GITHUB_REPOSITORY,eventName:process.env.GITHUB_EVENT_NAME});
fs.mkdirSync(path.dirname(args.receipt),{recursive:true});fs.writeFileSync(args.receipt,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({kind:result.kind,baseSha:result.baseSha,targetSha:result.targetSha,changedPaths:result.changedPaths,builds:result.builds}));
