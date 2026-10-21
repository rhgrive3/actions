// QA-only binding for the existing Ballpoint gallery. No renderer/model changes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const ID='s3-spinner-downpour';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const finite=(value,label)=>assert.ok(typeof value==='number'&&Number.isFinite(value),label);
const count=(value,label)=>assert.ok(Number.isSafeInteger(value)&&value>=0,label);
export function expectedBallpointPngs(){
 const names=['side','above','front','persp','rear','idle','idleSide','idleLeft','walk','walkLeft','walkRight','fire','fireSide','fireLeft','fireLate','after'];
 for(const prefix of ['glass','production'])for(const tier of ['game','far'])for(const bg of ['101321','eef3f8'])for(const team of ['ff8825','484ce8'])names.push(`${prefix}-${tier}-${bg}-${team}`);
 return names.map(n=>`${ID}.${n}.png`).sort();
}
export function validateBallpointEvidence({gallery,build,sourceSha,expectedSourceSha,artifactSourceSha,pngNames}){
 assert.match(expectedSourceSha,/^[0-9a-f]{40}$/);assert.equal(sourceSha,expectedSourceSha,'checkout head');assert.equal(artifactSourceSha,expectedSourceSha,'built artifact head');
 assert.match(build.build.revision,/^[0-9a-f]{64}$/);assert.equal(hash(JSON.stringify(build.artifacts)),build.contentHash,'artifact identity');assert.equal(gallery.revision,build.build.revision,'gallery build revision');
 assert.deepEqual(gallery.errors,[]);assert.equal(gallery.compareClearcoat,false);assert.equal(gallery.rows.length,1);
 const r=gallery.rows[0];assert.equal(r.id,ID);assert.equal(r.weaponModel,ID);assert.equal(r.own,true);assert.equal(r.weaponKind,'splatling');assert.equal(r.nonFinite,false);finite(r.maxGrip,'maxGrip');assert.ok(Number.isSafeInteger(r.firingFrames)&&r.firingFrames>0);
 const g=r.glass;assert.equal(g.triangles,256);assert.equal(g.transparent,true);assert.equal(g.depthWrite,false);assert.equal(g.depthTest,true);assert.equal(g.castShadow,false);assert.equal(g.side,0);assert.equal(g.transmission,0);finite(g.opacity,'opacity');assert.ok(g.opacity>0&&g.opacity<.4);
 assert.equal(g.gtao.sharedGeometry,true);assert.equal(g.gtao.rangeRestored,true);
 for(const key of ['Normal','Depth','AO'])assert.equal(g.gtao.safeChangedPixels[key],0,`safe ${key}`);
 count(g.gtao.safeChangedPixels.beauty,'visible beauty');assert.ok(g.gtao.safeChangedPixels.beauty>0);
 for(const key of ['Normal','Depth']){count(g.gtao.unguardedChangedPixels[key],`unguarded ${key}`);assert.ok(g.gtao.unguardedChangedPixels[key]>0,`negative must detect ${key}`);}
 const p=r.productionPipeline;assert.equal(p.quality,'high');assert.equal(p.ao,true);assert.equal(p.bloom,true);assert.deepEqual(p.failures,[]);assert.equal(p.rows.length,8);
 const seen=new Set();for(const row of p.rows){assert.ok(['game','far'].includes(row.tier));assert.ok(['#101321','#eef3f8'].includes(row.background));assert.ok(['#ff8825','#484ce8'].includes(row.inkColor));const key=[row.tier,row.background,row.inkColor].join('/');assert.ok(!seen.has(key),'duplicate post-stack condition');seen.add(key);assert.equal(row.glassVisible,true);assert.equal(row.rangeRestored,true);
  for(const k of ['drawCalls','withoutGlassDrawCalls','glNonzeroDrawCalls','glZeroCountCalls'])count(row[k],k);
  for(const k of ['nonzero','zero'])count(row.withoutGlassGlDraws[k],`hidden ${k}`);
  assert.equal(row.drawCalls,row.withoutGlassDrawCalls+2);assert.equal(row.glNonzeroDrawCalls,row.withoutGlassGlDraws.nonzero+1);assert.equal(row.glZeroCountCalls,row.withoutGlassGlDraws.zero+1);assert.equal(row.drawCalls,row.glNonzeroDrawCalls+row.glZeroCountCalls);
 }
 assert.deepEqual([...pngNames].sort(),expectedBallpointPngs(),'exact original32 PNG names');
 return {status:'passed',sourceSha,contentHash:build.contentHash,buildRevision:build.build.revision,modelId:ID,pngCount:32,postStackConditions:8,gtaoCounterexample:true,scope:'existing emitted Ballpoint only; CPU/source evidence separate; no retail or FPS parity claim'};
}
export function inspectBallpointPng(bytes,name){
 assert.ok(bytes.length>=33,`${name} PNG header`);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(bytes.readUInt32BE(8),13);assert.equal(bytes.subarray(12,16).toString(),'IHDR');const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);assert.equal(width,500);assert.equal(height,500);
 return {path:name,sha256:hash(bytes),bytes:bytes.length,width,height};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const arg=name=>{const i=process.argv.indexOf(name);assert.ok(i>=0&&process.argv[i+1],`missing ${name}`);return process.argv[i+1];};
 const site=path.resolve(arg('--site')),out=path.resolve(arg('--out')),expectedSourceSha=arg('--source-sha');
 const sourceSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),artifactSourceSha=fs.readFileSync(path.join(path.dirname(site),path.basename(site)+'-source-sha.txt'),'utf8').trim();
 const galleryBytes=fs.readFileSync(path.join(out,'gallery.json')),gallery=JSON.parse(galleryBytes),build=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))),pngNames=fs.readdirSync(out).filter(x=>x.endsWith('.png'));
 const result=validateBallpointEvidence({gallery,build,sourceSha,expectedSourceSha,artifactSourceSha,pngNames});result.images=pngNames.sort().map(name=>inspectBallpointPng(fs.readFileSync(path.join(out,name)),name));result.gallerySha256=hash(galleryBytes);
 const pending=path.join(out,'ballpoint-result.json.pending');fs.writeFileSync(pending,JSON.stringify(result,null,2)+'\n');fs.renameSync(pending,path.join(out,'ballpoint-result.json'));console.log(JSON.stringify(result));
}
