import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
test('identity checkout copies every static dependency before running the exact-source verifier',()=>{
 const identity=fs.readFileSync(path.join(ROOT,'scripts/check-inkwave-touch-layout-identity.mjs'),'utf8');
 const match=identity.match(/for \(const file of (\[[^\n]+\])\) \{/);assert.ok(match,'read the production fixture copy list');
 const files=vm.runInNewContext(match[1]);assert.ok(files.includes('scripts/lib/inkwave-respawn-hud.mjs'));
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-identity-import-'));
 for(const f of files){const dest=path.join(root,f);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(ROOT,f),dest);}
 const run=()=>spawnSync(process.execPath,[path.join(root,'scripts/check-inkwave-browser.mjs')],{encoding:'utf8'});
 const linked=run();assert.notEqual(linked.status,0);assert.match(linked.stderr,/Required --site/);assert.doesNotMatch(linked.stderr,/ERR_MODULE_NOT_FOUND/);
 // Keep the isolated helper under a different name for the negative control.
 const helper=path.join(root,'scripts/lib/inkwave-respawn-hud.mjs');fs.renameSync(helper,helper+'.held');
 const absent=run();assert.notEqual(absent.status,0);assert.match(absent.stderr,/ERR_MODULE_NOT_FOUND/);assert.doesNotMatch(absent.stderr,/Required --site/);
});
