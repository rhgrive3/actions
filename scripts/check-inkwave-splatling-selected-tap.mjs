#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

// One source of truth for both selection and proof that the intended leaves ran.
export const EXPECTED_NAMES=Object.freeze([
 'S3 Splatling independent signed yaw/pitch angular quantiles preserve arbitrary aim elevations',
 'S3 Splatling vertical 1.6-degree maximum does not scale with horizontal envelope',
]);
export const SELECTED_PATTERN='^(?:'+EXPECTED_NAMES.map(name=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')$';
export function verifySelectedTap(tap){
 const lines=tap.replace(/\r\n/g,'\n').split('\n');
 const matches=regex=>lines.map(line=>line.match(regex)).filter(Boolean);
 assert.deepEqual(matches(/^# Subtest: (.*)$/).map(m=>m[1]),EXPECTED_NAMES,'exact selected leaf names must execute');
 assert.deepEqual(matches(/^ok (\d+) - (.*)$/).map(m=>[+m[1],m[2]]),EXPECTED_NAMES.map((name,i)=>[i+1,name]),'every selected leaf must pass without directives');
 assert.equal(matches(/^(?:not ok\b|\s+# Subtest:|Bail out!)/).length,0,'no failure, nested substitute or bailout');
 assert.equal(matches(/^\s*(?:not )?ok .*#\s+(?:SKIP|TODO)\b/i).length,0,'no skipped or todo leaves');
 assert.deepEqual(matches(/^1\.\.(\d+)$/).map(m=>+m[1]),[EXPECTED_NAMES.length],'one exact plan is required');
 for(const [field,count] of Object.entries({tests:2,suites:0,pass:2,fail:0,cancelled:0,skipped:0,todo:0})){
  assert.deepEqual(matches(new RegExp('^# '+field+' (\\d+)$')).map(m=>+m[1]),[count],field+' must have one exact summary');
 }
 return {selected:EXPECTED_NAMES.length,pass:EXPECTED_NAMES.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 assert.equal(process.argv.length,3,'provide --pattern or one Node TAP file');
 if(process.argv[2]==='--pattern')console.log(SELECTED_PATTERN);
 else console.log(JSON.stringify(verifySelectedTap(fs.readFileSync(process.argv[2],'utf8'))));
}
