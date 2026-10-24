// Negative control: helpers import from the candidate normally. Only the actual
// checker source read by the setup regression is replaced by the preserved base.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
const target=fileURLToPath(new URL('../../scripts/check-inkwave-idle-resources.mjs',import.meta.url));
const old=execFileSync('git',['show','4d6166936eaa8058a8b936053992960b510eec88:scripts/check-inkwave-idle-resources.mjs'],{encoding:'utf8'});
const read=fs.readFileSync;
fs.readFileSync=function(p,...args){
 if(p instanceof URL&&fileURLToPath(p)===target&&args[0]==='utf8')return old;
 return read.call(this,p,...args);
};
syncBuiltinESMExports();
