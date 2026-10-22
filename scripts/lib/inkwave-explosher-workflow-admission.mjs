// Only the owned QA branch targeting the frozen common-source PR can run this initial pair.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
export const OWNED_BRANCH='inkwave/explosher-inverse-preflight-364dd0-20261022';
export const BASE_BRANCH='inkwave/runtime-main-a350-integration-20261022';
export const COMMON_HEAD='364dd0a7fad9508652b4b4c6ec3d82eb124e9c5c';
export function requireExplosherWorkflowEvent({eventName,repository,event,checkoutHead}){
 assert.equal(eventName,'pull_request','Only bounded PR event admitted');assert.equal(repository,'rhgrive3/actions');
 assert(['opened','synchronize','reopened'].includes(event.action),'Unexpected PR action');const pr=event.pull_request;assert(pr);
 assert.equal(pr.head.repo.full_name,repository,'Fork head denied');assert.equal(pr.base.repo.full_name,repository,'Foreign base denied');
 assert.equal(pr.head.ref,OWNED_BRANCH,'Unowned branch denied');assert.equal(pr.base.ref,BASE_BRANCH,'Wrong base branch');assert.equal(pr.base.sha,COMMON_HEAD,'Frozen common head moved');
 assert.match(pr.head.sha,/^[a-f0-9]{40}$/);assert.equal(checkoutHead,pr.head.sha,'QA checkout is not actual PR head');
 return{eventName,repository,action:event.action,qaHead:pr.head.sha,commonHead:COMMON_HEAD,headBranch:OWNED_BRANCH,baseBranch:BASE_BRANCH,scope:'initial-preflight-pair-only'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname){
 const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8')),git=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'});assert.equal(git.status,0);
 console.log(JSON.stringify(requireExplosherWorkflowEvent({eventName:process.env.GITHUB_EVENT_NAME,repository:process.env.GITHUB_REPOSITORY,event,checkoutHead:git.stdout.trim()})));
}
