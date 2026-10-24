#!/usr/bin/env node
// Match native input/physics/camera conditions from two independently built
// sites. Diagnostic module overlays are deliberately ineligible for this gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const [beforePath,afterPath,output]=process.argv.slice(2).map(p=>path.resolve(p));
assert(beforePath&&afterPath&&output,'Expected before-directory after-directory output.json');
assert(!fs.existsSync(output),'Preserve earlier comparison results');
const read=dir=>JSON.parse(fs.readFileSync(path.join(dir,'receipt.json')));
const before=read(beforePath),after=read(afterPath);
for(const r of [before,after]){
 assert.equal(r.status,'captured');assert.deepEqual(r.errors,[]);
 assert.equal(r.overlay,null,'Normal builds must not use a module overlay');
 assert.deepEqual(r.servedOverrides,[]);assert.equal(r.rows.length,11);
 assert.equal(r.runtimeResponses.filter(x=>x.path.startsWith('/_versions/')).length,4,'Record actual versioned runtime responses');
 assert(r.runtimeResponses.every(x=>x.status===200));
}
assert.deepEqual(after.setup,before.setup,'Identical native avatar/palette/seed/camera and setup state');
const keys=['tick','state','phase','alive','fire','physical','previous','grounded','groundHit','position','velocity','rolling','flick','charge','firing','ink','turf','shotCount','paintCalls','projectileCount','wRoll','spawnTime','source','camera','seed','palette'];
const rows=before.rows.map((b,i)=>{
 const a=after.rows[i];assert.equal(a.label,b.label);
 for(const key of keys)assert.deepEqual(a[key],b[key],`${a.label}: unmatched ${key}`);
 for(const r of [b,a]){assert.equal(r.shotCount,0);assert.equal(r.paintCalls,0);assert.equal(r.projectileCount,0);assert.equal(r.ink,100);assert.equal(r.rolling,false);assert.equal(r.flick,-1);}
 return {label:a.label,matched:true,beforeRotation:b.rotation,afterRotation:a.rotation};
});
const old=before.rows.find(r=>r.label==='flight-61'),fixed=after.rows.find(r=>r.label==='flight-61');
assert(old.grounded&&fixed.grounded);assert(old.spawnTime<1.4&&fixed.spawnTime<1.4);
assert.deepEqual(old.rotation,[Math.fround(.8),Math.fround(.1),0]);
assert.deepEqual(fixed.rotation,[-2.5,Math.fround(.04),1]);
const images=[];
for(const frame of [49,59,60,61,67,85,110,145])for(const [variant,dir] of [['before',beforePath],['after',afterPath]]){
 const filename=`flight-${frame}.png`,bytes=fs.readFileSync(path.join(dir,filename));
 assert.equal(bytes.subarray(1,4).toString(),'PNG');
 assert.equal(bytes.readUInt32BE(16),1000);assert.equal(bytes.readUInt32BE(20),760);
 images.push({variant,filename,sha256:createHash('sha256').update(bytes).digest('hex')});
}
const result={status:'passed',scope:'matched native offline Game at fixed simulation steps; normal independently built versioned sites, not display FPS or real transport',beforeBuild:before.build,afterBuild:after.build,setup:after.setup,rows,images};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,checkpoints:rows.length,images:images.length,beforeBuild:before.build,afterBuild:after.build}));
