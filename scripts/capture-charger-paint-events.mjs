#!/usr/bin/env node
// Current native emitted Charger splat receipts, not retail or historical images.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fixture} from './weapons-fixture.mjs';
import {reset,launch,finish,SEED} from './measure-weapons-fidelity.mjs';
const arg=k=>{const i=process.argv.indexOf(k);assert(i>=0,k);return process.argv[i+1];};
const site=path.resolve(arg('--site')),out=path.resolve(arg('--out'));
const build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
const f=await fixture({site,fidelity:true,seed:SEED});
const captures=[];
for(const charge of [0,.25,.5,.75,1]){
 const c={id:'charger',charge},a=reset(f,c);launch(f,a,c);finish(f,a,240);
 const events=f.paints.map(e=>({at:e.center,R:e.radius,team:e.team,seed:e.seed,kind:e.kind,footprint:e.footprint,stretch:e.stretch,stretchAmt:e.stretchAmt,time:e.time}));
 assert(events.length>0&&events.every(e=>e.footprint==='ink-charger'));
 assert(events.some(e=>e.R===a.weapon.feetPaintRadius&&!e.stretch),'retain actual feet stamp');
 captures.push({id:'charger-'+charge,currentOnly:true,events,provenance:{kind:'current-emitted-native-splats',contentHash:build.contentHash,inputHash:build.inputHash}});
}
assert.equal(captures.reduce((n,c)=>n+c.events.length,0),37,'all actual five-charge stamps, including feet');
for(const file of f.sourceFiles){const rel=path.relative(site,file);const expected=build.artifacts[rel];assert(expected,rel);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),expected,rel);}
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(captures,null,2)+'\n');
console.log(JSON.stringify({captures:captures.length,stamps:37,contentHash:build.contentHash,output:out}));
