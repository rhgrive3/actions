import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import assert from 'node:assert/strict';
const [root,out]=process.argv.slice(2),source=process.env.SOURCE_SHA;assert(source);const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const specs=[['multi-4-5',40,80,[4,5]],['multi-6-7',44,88,[6,7]],['multi-8-9',40,80,[8,9]],['multi-10-11',40,80,[10,11]],['production',48,152,null]];
let contentHash=null,frames=0;const suites=[];const record=status=>{fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({status,sourceSha:source,expectedFrames:480,verifiedFrames:frames,contentHash,suites},null,2));};record('incomplete');
for(const [key,rows,pngs,gears]of specs){
 const base=path.join(root,`headgear-shard-${key}-${source}`),dir=path.join(base,'.qa-evidence',key),result=JSON.parse(fs.readFileSync(path.join(dir,'result.json'))),manifest=JSON.parse(fs.readFileSync(path.join(base,'_site/inkwave-build.json')));
 assert.equal(result.sourceSha,source);assert.equal(result.checkoutSha,source);assert.equal(result.browserRun,true);assert.equal(result.status,gears?'rendered-awaiting-visual-review':'passed-awaiting-pixel-review');assert.equal(result.rows.length,rows);assert.equal(result.frames,pngs);assert.equal(result.screenshots.length,pngs);assert.equal(result.errors.length,0);assert.equal(result.blocked.length,0);
 assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash);assert.equal(result.contentHash,manifest.contentHash);if(contentHash)assert.equal(result.contentHash,contentHash);else contentHash=result.contentHash;
 if(gears){assert.deepEqual(result.gearIds,gears);assert.deepEqual([...new Set(result.rows.map(r=>r.gearId))],gears);}else{assert.deepEqual([...new Set(result.rows.map(r=>r.hat))],[4,5,6,7,8,9,10,11]);assert.equal(result.lodRows.length,56);assert.equal(result.cycles.length,6);}
 const names=new Set();for(const png of result.screenshots){assert.match(png.file,/^[a-z0-9-]+\.png$/);assert(!names.has(png.file));names.add(png.file);const data=fs.readFileSync(path.join(dir,png.file));assert.equal(hash(data),png.sha256);assert.equal(data.length,png.bytes);assert.equal(data.readUInt32BE(16),720);assert.equal(data.readUInt32BE(20),720);frames++;}
 suites.push({key,status:result.status,rows,frames:pngs,buildRevision:result.buildRevision});record('incomplete');
}
assert.equal(frames,480);record('passed-awaiting-visual-review');console.log(`All ${frames} PNGs and five complete suites verified.`);
