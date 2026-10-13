import fs from 'node:fs';
import {convertSource} from '../../patches/native-stages/runtime/source-convert.mjs';
import {nativeStageCatalog} from '../../scripts/lib/inkwave-native-stages.mjs';
const stage=nativeStageCatalog().stages.find(s=>s.id==='scorch'),src='/workspace/actions/.codex-stage-sources/KiTrix/stages/'+stage.internal;
const files=Object.fromEntries(fs.readdirSync(src+'/textures').map(n=>['textures/'+n,{}]));
const d=convertSource(stage,fs.readFileSync(src+'/'+stage.internal+'.obj','utf8'),fs.readFileSync(src+'/'+stage.internal+'.mtl','utf8'),files),old=fs.readFileSync('.codex-stage-sources/generated/scorch/mask.bin'),m=JSON.parse(fs.readFileSync('.codex-stage-sources/generated/scorch/manifest.json'));
const diffs=[];let count=0;
for(let k=0;k<old.length;k++)if(old[k]!==d.mask[k]){
 count++;if(diffs.length>=8)continue;
 const fid=d.manifest.faces.findIndex(f=>k>=f.grid&&k<f.grid+f.nu*f.nv),f=d.manifest.faces[fid],p=m.faces[fid],i=(k-f.grid)%f.nu,j=Math.floor((k-f.grid)/f.nu),triangles=f.triangles.slice(0,3).map(id=>Array.from(d.triangles.slice(id*9,id*9+9)));
 diffs.push({k,fid,i,j,python:old[k],worker:d.mask[k],workerFace:{origin:f.origin,u:f.u,v:f.v,cu:f.cu,cv:f.cv,nu:f.nu,nv:f.nv},pythonFace:{origin:p.origin,u:p.u,v:p.v,cu:p.cu,cv:p.cv,nu:p.nu,nv:p.nv},triangles});
}
fs.writeFileSync('.ci-scratch/source-paint-coverage/parity-diagnosis.json',JSON.stringify({count,diffs},null,2));console.log(JSON.stringify({count,diffs}));
