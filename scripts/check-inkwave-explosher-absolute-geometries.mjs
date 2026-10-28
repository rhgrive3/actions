#!/usr/bin/env node
// Additive historical-pair artifact guard. Never captures, mutates measurements,
// offsets cold allocations, or replaces any upstream admission/resource gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {readExplosherCaptureLane,requireExplosherStagePair} from './lib/inkwave-explosher-stage-admission.mjs';

export function requireAbsoluteExplosherGeometries(stage,before,after){
 assert(['preflight','stills'].includes(stage),'Unsupported absolute geometry stage');
 const ticks=stage==='preflight'?[0]:[0,3,8,14,22,30];
 const views=stage==='preflight'?['behind']:['behind','tele-side','tele-oblique'];
 const expected=ticks.flatMap(tick=>views.map(view=>({tick,view})));
 for(const [frames,lane] of [[before,'before'],[after,'after']]){
  assert(Array.isArray(frames),'Missing '+lane+' frames');
  assert.equal(frames.length,expected.length,'Missing or duplicate '+lane+' frames');
  for(let i=0;i<expected.length;i++){
   // Raw identity only: string ticks or coercible views cannot bypass tick0 gates.
   assert.equal(frames[i]?.tick,expected[i].tick,'Invalid/misaligned raw tick ('+lane+')');
   assert.equal(frames[i]?.view,expected[i].view,'Invalid/misaligned raw view ('+lane+')');
  }
 }
 return before.map((f,i)=>{
  const a=f?.measurement?.memory?.geometries,b=after[i]?.measurement?.memory?.geometries;
  assert(Number.isFinite(a)&&Number.isFinite(b)&&a>=0&&b>=0,'Missing/invalid absolute geometry count at '+expected[i].tick+':'+expected[i].view);
  // Exact original condition: no tolerance, baseline subtraction or override.
  assert(b<=a,'Absolute geometry regression at '+expected[i].tick+':'+expected[i].view+': '+a+' -> '+b);
  return {tick:f.tick,view:f.view,before:a,after:b};
 });
}

export function readAbsoluteExplosherGeometryAdmission(stage,beforeDir,afterDir,admissionFile){
 const bytes=fs.readFileSync(admissionFile),existing=JSON.parse(bytes);
 const lanes=[beforeDir,afterDir].map(readExplosherCaptureLane);
 const upstream={...requireExplosherStagePair(stage,lanes[0].frames,lanes[1].frames,lanes[0].r,lanes[1].r),
  before:{manifestSha256:lanes[0].manifestSha256,sourceReceiptSha256:lanes[0].sourceReceiptSha256},
  after:{manifestSha256:lanes[1].manifestSha256,sourceReceiptSha256:lanes[1].sourceReceiptSha256}};
 assert.deepEqual(existing,upstream,'Existing admission does not bind these validated capture lanes');
 const frames=requireAbsoluteExplosherGeometries(stage,lanes[0].frames,lanes[1].frames);
 return {schema:1,kind:'explosher-additional-original-absolute-geometry-admission',stage,passed:true,
  scope:'Historical same-build artifact guard only; no full-game, long-pair or retail parity acceptance',
  condition:'after.memory.geometries <= before.memory.geometries (absolute; no offset)',
  stageAdmissionSha256:createHash('sha256').update(bytes).digest('hex'),upstreamAdmission:upstream,frames};
}

export function absoluteGeometryArguments(args){
 assert(args.length===5&&!args.some(x=>x.startsWith('--')),'Usage: check-inkwave-explosher-absolute-geometries.mjs <preflight|stills> <before-dir> <after-dir> <existing-admission.json> <output.json>');
 assert(['preflight','stills'].includes(args[0]),'Unsupported absolute geometry stage');
 return args;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const [stage,before,after,admission,out]=absoluteGeometryArguments(process.argv.slice(2));
 const receipt=readAbsoluteExplosherGeometryAdmission(stage,before,after,admission);
 fs.writeFileSync(out,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 console.log('EXPLOSHER_ABSOLUTE_GEOMETRY_GATE '+JSON.stringify({stage,passed:true,frames:receipt.frames.length}));
}
