// Future-only generated QA candidate. Does not modify source, captures or acceptance gates.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const INPUT_SHA256='615741ef771d6e92da0fcf1a3b592954ff55b37eb6f478eacc24d5ab5481377b';
export const OLD=' let rawEqual=true;try{assert.deepEqual(actual,expected);}catch{rawEqual=false;}';
export const NEW=' const rawEqual=isDeepStrictEqual(actual,expected);';
export const IMPORT="import {isDeepStrictEqual} from 'node:util';\n";
export const NORMALIZED_INPUT_SHA256='5198356bfa59b98211026e64641931015bde5e1ee77b7542e466209cb41abc98';
export function normalizePaired(source,helperUrl){
 assert.equal(new URL(helperUrl).protocol,'file:');const needle='from '+JSON.stringify(helperUrl);assert.equal(source.split(needle).length,2,'unique reviewed admission import');
 return source.replace(needle,"from './lib/inkwave-material-normal-admission.mjs'");
}
export function prepare(source,helperUrl){
 assert.equal(createHash('sha256').update(helperUrl?normalizePaired(source,helperUrl):source).digest('hex'),helperUrl?NORMALIZED_INPUT_SHA256:INPUT_SHA256,'exact retained generated paired input');
 assert.equal(source.split(OLD).length,2);assert.equal(source.includes(IMPORT),false);
 return source.replace("import {createHash}",IMPORT+"import {createHash}").replace(OLD,NEW);
}
export function inverse(source){return source.replace(IMPORT,'').replace(NEW,OLD);}
