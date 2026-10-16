import fs from 'node:fs';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
export function validateTestCounts(s){for(const[k,v]of Object.entries({tests:2,pass:2,fail:0,cancelled:0,skipped:0,todo:0})){const matches=[...s.matchAll(new RegExp('^# '+k+' (\\d+)$','gm'))];assert.equal(matches.length,1,k);assert.equal(+matches[0][1],v,k);}return true;}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)validateTestCounts(fs.readFileSync(process.argv[2],'utf8'));
