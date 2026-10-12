#!/usr/bin/env node
// Local-only original assets. Source RGBA and provenance stay unchanged;
// these rounder heights are art settings, never source/official parameters.
import path from 'node:path';
import { bakeVolumes } from './bake-inkwave-volumes.mjs';
const [sourceRoot,out]=process.argv.slice(2);
if(!sourceRoot||!out)throw Error('Usage: node scripts/bake-inkwave-projectile-volumes.mjs <SplatoonSWEPs> <private-output>');
await bakeVolumes(['line','dot'].map(name=>({file:path.resolve(sourceRoot,'materials/splatoonsweps/crosshair/'+name+'.vtf'),shape:{thickness:1,backRatio:1,upperBias:0,interiorStep:2,fringePixels:1.1,edgeTaper:1,uvWindow:name==='line'?[.3,0,.7,1]:[0,0,1,1]}})),path.resolve(out));
