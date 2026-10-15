import fs from 'node:fs';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
export function validateTestCounts(text,expected){
 assert.ok(Number.isInteger(expected)&&expected>0,'positive expected test count');
 for(const [key,value] of Object.entries({tests:expected,pass:expected,fail:0,cancelled:0,skipped:0,todo:0})){
  const matches=[...text.matchAll(new RegExp('^# '+key+' (\\d+)$','gm'))];
  assert.equal(matches.length,1,'one TAP summary '+key);assert.equal(Number(matches[0][1]),value,key);
 }
 return true;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)validateTestCounts(fs.readFileSync(process.argv[2],'utf8'),Number(process.argv[3]));
