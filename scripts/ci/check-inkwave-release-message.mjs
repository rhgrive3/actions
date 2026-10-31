#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

// GitHub evaluates push/PR skip instructions before any workflow job can run.
// This check belongs BEFORE creating a release/main integration commit. It is
// not a substitute for an exact-SHA successful push run at the Pages barrier.
export function assertReleaseCommitMessage(message){
 if(typeof message!=='string'||!message.trim())throw Error('Release commit message is empty');
 if(/\[(?:skip ci|ci skip|no ci|skip actions|actions skip)\]/i.test(message)
   ||/(?:^|\r?\n)\s*skip-checks\s*:\s*true\s*(?:\r?\n|$)/i.test(message))
  throw Error('Release commit must not suppress GitHub push/PR validation');
 return true;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const file=process.argv[2];if(!file)throw Error('Usage: check-inkwave-release-message.mjs <commit-message-file>');assertReleaseCommitMessage(readFileSync(file,'utf8'));console.log('Release message preserves CI triggering');}
 catch(error){console.error(error.message);process.exitCode=1;}
}
