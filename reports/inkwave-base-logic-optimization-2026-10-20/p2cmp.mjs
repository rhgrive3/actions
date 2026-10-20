import fs from 'node:fs';const a=JSON.parse(fs.readFileSync(process.argv[2])),b=JSON.parse(fs.readFileSync(process.argv[3]));const skip=new Set((process.argv[4]||'').split(',').filter(Boolean).map(Number));
let act=0,pose=0,cam=0,n=0,first=null;a.hashes.forEach((h,i)=>{const y=b.hashes[i];n++;if(h.actors!==y.actors)act++;if(h.cam!==y.cam)cam++;h.per.forEach((p,k)=>{if(!skip.has(k)&&p!==y.per[k]){pose++;first??=h.f+' actor '+k;}});});
console.log(`samples ${n} actorDiff ${act} camDiff ${cam} poseDiff(excluding ${[...skip]}) ${pose} first ${first}`);
