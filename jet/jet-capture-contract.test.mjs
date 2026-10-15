import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {validateJetFrames,validateJetImages} from './jet-capture-contract.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./source-frames.json',import.meta.url)));
test('actual source eight frames satisfy exact manual tuple and native pair gates',()=>assert.equal(validateJetFrames(rows).length,8));
test('missing and duplicate frames reject',()=>{assert.throws(()=>validateJetFrames(rows.slice(1)));const x=structuredClone(rows);x[7]=structuredClone(x[0]);assert.throws(()=>validateJetFrames(x));});
test('invisible, clipped, invalid pose and pair drift reject',()=>{for(const mutate of [f=>f.animationTime=0,f=>f.kidTime=10,f=>f.foregroundPixels=0,f=>f.quantizedColors=1,f=>f.pose=[NaN],f=>f.projectedBounds.max[0]=1.1,f=>f.camera.position[0]+=1,f=>f.births=1,f=>f.variantId='wrong',f=>f.restored=false]){const x=structuredClone(rows);mutate(x.find(f=>f.role==='variant'));assert.throws(()=>validateJetFrames(x));}});

test('same PNG bytes cannot qualify base/manual appearance',()=>{const a=rows.map((f,i)=>({...f,sha256:(i+1).toString(16).padStart(64,'0')}));assert.doesNotThrow(()=>validateJetImages(a));const c=structuredClone(a);c.find(f=>f.role==='variant').sha256=c[0].sha256;assert.throws(()=>validateJetImages(c),/distinct image/);});

test('pair observations are preserved before actual image-difference gate',()=>{const s=fs.readFileSync(new URL('./capture-jet-integration.mjs',import.meta.url),'utf8');assert.ok(s.indexOf("'jet-image-observations.json'")<s.indexOf('validateJetImages(images)'));assert.ok(s.includes('acceptanceComplete:false,images'));});
