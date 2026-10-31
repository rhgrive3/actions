#!/usr/bin/env node
// Generate the production-native engine bundle with a single source change;
// prove the corresponding unmodified bundle matches the supplied build.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import crypto from 'node:crypto';
import {build} from 'esbuild';import {NATIVE_RUNTIME_EXTERNALS} from './lib/inkwave-native-stages.mjs';
const site=path.resolve(process.argv[2]||'_site'),out=path.resolve(process.argv[3]||'.ci-scratch/native-stage-tight-engine.mjs');
const source=path.resolve('patches/native-stages/runtime/native-render.mjs'),entry=path.resolve('patches/native-stages/runtime/engine.mjs');
const base=execFileSync('git',['show','2f3acacdb5296605cdc675e4feb564dc1a491d51:patches/native-stages/runtime/native-render.mjs'],{encoding:'utf8'});
const options={entryPoints:[entry],bundle:true,format:'esm',minify:true,charset:'utf8',write:false,external:NATIVE_RUNTIME_EXTERNALS,legalComments:'inline'};
const baseline=(await build({...options,plugins:[{name:'baseline-native-display',setup(api){api.onLoad({filter:/native-render\.mjs$/},args=>args.path===source?{contents:base,loader:'js'}:null);}}]})).outputFiles[0].contents;
const expected=fs.readFileSync(path.join(site,'patches/native-stages/runtime/engine.mjs'));
assert.deepEqual(Buffer.from(baseline),expected,'unmodified native engine must match provided site');
if(!process.env.INKWAVE_NATIVE_DISPLAY_EXPERIMENT)throw Error('Set INKWAVE_NATIVE_DISPLAY_EXPERIMENT to the candidate native-render.mjs');
const changed=fs.readFileSync(path.resolve(process.env.INKWAVE_NATIVE_DISPLAY_EXPERIMENT),'utf8');
const candidate=(await build({...options,plugins:[{name:'candidate-native-display',setup(api){api.onLoad({filter:/native-render\.mjs$/},args=>args.path===source?{contents:changed,loader:'js'}:null);}}]})).outputFiles[0].contents;fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,candidate);
const sha=buf=>crypto.createHash('sha256').update(buf).digest('hex');console.log(JSON.stringify({baseline:sha(baseline),candidate:sha(candidate),out}));
