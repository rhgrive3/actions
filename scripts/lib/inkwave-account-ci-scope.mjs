import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

export function accountTestsOnly(paths){
 return Array.isArray(paths)&&paths.length>0&&paths.every(p=>typeof p==='string'&&/^account\/tests\/[^/\r\n]+\.test\.mjs$/.test(p));
}
// Any unavailable history, invalid event SHA or Git failure keeps full validation.
export function classifyAccountChange(base,head,run=(args)=>spawnSync('git',args,{encoding:'utf8'})){
 if(!/^[a-f0-9]{40}$/.test(base||'')||!/[1-9a-f]/.test(base)||!/^[a-f0-9]{40}$/.test(head||''))return false;
 try{
  for(const sha of [base,head])if(run(['cat-file','-e',sha+'^{commit}']).status!==0){
   if(run(['fetch','--no-tags','--depth=1','origin',sha]).status!==0)return false;
  }
  const diff=run(['diff','--no-renames','--name-only','-z',base,head,'--']);
  if(diff.status!==0||typeof diff.stdout!=='string'||!diff.stdout.endsWith('\0'))return false;
  return accountTestsOnly(diff.stdout.slice(0,-1).split('\0'));
 }catch{return false;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const testOnly=classifyAccountChange(process.env.ACCOUNT_CI_BASE,process.env.ACCOUNT_CI_HEAD);
 if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'test_only='+testOnly+'\n');
 console.log(testOnly?'Account test-only diff: retain all API/bundle tests.':'Full account and Workers validation required.');
}
