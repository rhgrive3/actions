import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath,pathToFileURL} from 'node:url';
export const SOURCE_REMAINDERS=Object.freeze({
 network:Object.freeze({directory:'patches/network-replication/tests',checkpoint:'Verify deterministic network replication',completed:Object.freeze(['queue-inkflight-owned-profile','slosher-birth-sampling','issue-1101-adoption-cooldown'].map(x=>'patches/network-replication/tests/'+x+'.test.mjs')),extra:Object.freeze([])}),
 quality:Object.freeze({directory:'patches/local-quality/tests',checkpoint:'Verify local quality regressions',completed:Object.freeze(['catalog-charge-bot-release','view-settings','gyro-stale','gyro-viability','gyro-focus','idle-attract-budget','idle-resources'].map(x=>'patches/local-quality/tests/'+x+'.test.mjs')),extra:Object.freeze(['scripts/tests/inkwave-idle-resources-gates.test.mjs'])})
});
const ROOT=fileURLToPath(new URL('../',import.meta.url));
export function planSourceRemainder(suite,root=ROOT){
 const config=SOURCE_REMAINDERS[suite];if(!config)throw Error('Unknown source suite: '+suite);
 const all=fs.readdirSync(path.join(root,config.directory)).filter(x=>x.endsWith('.test.mjs')).sort().map(x=>config.directory+'/'+x);
 if(!all.length)throw Error('Empty source suite: '+suite);
 for(const file of [...all,...config.completed,...config.extra])if(!fs.statSync(path.join(root,file)).isFile())throw Error('Missing source test: '+file);
 const tests=[...all.filter(x=>!config.completed.includes(x)),...config.extra];
 if(!tests.length||new Set(tests).size!==tests.length)throw Error('Invalid source remainder');
 return{all,completed:[...config.completed],tests};
}
// A source file can be omitted here only when an unconditional earlier step
// already ran its whole file with the identical Node test flags. Partial-name
// passes, emitted environments and continue-on-error are never completion proof.
export function assertSourceRemainderCoverage(workflow,suite,root=ROOT){
 const config=SOURCE_REMAINDERS[suite];if(!config)throw Error('Unknown source suite: '+suite);
 const core=workflow.slice(workflow.indexOf('  validate_core:'),workflow.indexOf('\n  patch_tests:'));
 const steps=core.split(/^      - /m),checkpoint=steps.findIndex(x=>x.startsWith('name: '+config.checkpoint+'\n'));
 if(checkpoint<0||!steps[checkpoint].includes('run: node scripts/run-inkwave-source-remainder.mjs '+suite+'\n'))throw Error('Missing audited source remainder invocation');
 if(/^        (?:if|env|continue-on-error):/m.test(steps[checkpoint]))throw Error('Source remainder must retain unconditional canonical environment');
 for(const file of config.completed){
  let count=0;for(const step of steps.slice(0,checkpoint)){
   if(/^        (?:if|env|continue-on-error):/m.test(step))continue;
   const commands=[...step.matchAll(/^\s*(?:run:\s*)?node --experimental-vm-modules --test (.+)$/gm)].map(m=>m[1].trim().split(/\s+/));
   count+=commands.filter(args=>!args.some(x=>x.startsWith('-'))&&args.includes(file)).length;
  }
  if(count!==1)throw Error('Source test must run fully once before remainder: '+file);
 }
 const plan=planSourceRemainder(suite,root),union=[...plan.completed,...plan.tests];
 if(new Set(union).size!==union.length||plan.all.some(x=>!union.includes(x)))throw Error('Incomplete unique source coverage');
 return plan;
}
export function runSourceRemainder(suite,{root=ROOT,spawn=spawnSync}={}){
 const workflow=fs.readFileSync(path.join(root,'.github/workflows/validate-inkwave-update.yml'),'utf8'),plan=assertSourceRemainderCoverage(workflow,suite,root);
 console.log(JSON.stringify({sourceSuite:suite,completed:plan.completed,remaining:plan.tests.length,totalUnique:plan.all.length}));
 return spawn(process.execPath,['--experimental-vm-modules','--test',...plan.tests],{cwd:root,env:process.env,stdio:'inherit'});
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){const result=runSourceRemainder(process.argv[2]);process.exitCode=result.error||result.signal?1:result.status??1;}
