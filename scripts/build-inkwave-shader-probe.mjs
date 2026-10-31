#!/usr/bin/env node
// Emit the three changed runtime modules with exactly the production transform.
// Verify the unchanged baseline against the reference build before doing so.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {transformSync} from 'esbuild';
import {adaptBuildSource} from './inkwave-source-composition.mjs';
import {compactModuleStrings} from './lib/inkwave-source-compaction.mjs';
const site=path.resolve(process.argv[2]||'_site'),out=path.resolve(process.argv[3]||'.ci-scratch/shader-probe');
const files=['patches/splatoon3/runtime/special-motion.mjs','patches/local-quality/swim-surface.mjs','patches/local-quality/shader-program-reflection.mjs'];
const baseRef=process.env.INKWAVE_SHADER_BASE_REF||'2f3acacdb5296605cdc675e4feb564dc1a491d51';
const hash=x=>createHash('sha256').update(x).digest('hex');
const emit=(rel,src)=>compactModuleStrings(transformSync(adaptBuildSource(rel,src),{loader:'js',format:'esm',minify:true,charset:'utf8',legalComments:'inline',sourcefile:rel}).code).code;
const summary={site,out,baseRef,files:{}};
for(const rel of files){
 let baseline=null;if(rel!==files[2]){baseline=emit(rel,execFileSync('git',['show',baseRef+':'+rel],{encoding:'utf8'}));const actual=fs.readFileSync(path.join(site,rel),'utf8');if(baseline!==actual)throw Error('reference build mismatch: '+rel);}
 const candidate=emit(rel,fs.readFileSync(rel,'utf8')),destination=path.join(out,rel);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,candidate);
 summary.files[rel]={baseline:baseline&&hash(baseline),candidate:hash(candidate)};
}
console.log(JSON.stringify(summary,null,2));
