import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('../check-inkwave-native-source-browser.mjs',import.meta.url));
for(const ids of ['',',','eeltail,','unknown-stage','scorch,unknown-stage'])test('source browser CLI rejects invalid stage selection before browser startup: '+JSON.stringify(ids),()=>{
 const p=spawnSync(process.execPath,[script,'/no-site-required-for-id-rejection'],{env:{...process.env,NATIVE_STAGE_IDS:ids},encoding:'utf8',timeout:10000});
 assert.equal(p.status,1,p.stderr);assert.match(p.stderr,/Native stage selection contains an empty id|Unknown playable native stage/);
 assert.doesNotMatch(p.stderr,/page\.goto|browserType\.launch|ENOENT/);
});
