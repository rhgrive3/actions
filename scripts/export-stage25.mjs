// Export the stage-authoring contract and collision-derived orthographic diagnostics.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]||'/mnt/data/inkwave-stage-site'),out=path.resolve('reports/stage25');
const load=p=>import(pathToFileURL(path.join(root,p)));
const {STAGE25_CATALOG,STAGE_RULES,getStageLayout,getStageRuleData,stageDescriptor}=await load('src/world/stages/splatoon3/index.js');
const {Level}=await load('src/world/level.js');
const {StageRuntime}=await load('src/world/stages/splatoon3/runtime.js');
const T=await load('vendor/three/build/three.module.js');
const catalog=[];let count=0;
for(const meta of STAGE25_CATALOG){
 const row={...meta,rules:{}};
 for(const rule of STAGE_RULES){
 const layout=getStageLayout(meta.id,rule),level=new Level(layout),dir=path.join(out,'layouts',meta.id);fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,rule+'.json'),JSON.stringify({descriptor:stageDescriptor(meta.id,rule),layout,ruleData:getStageRuleData(meta.id,rule)},null,2)+'\n');
 const b=level.bounds,margin=2,vx=b.maxX-b.minX,vz=b.maxZ-b.minZ,polys=[];
 for(const f of level.faces){if(f.n.y<.45||f.exposedArea<.01)continue;const block=level.blocks[f.block];for(const poly of f.renderPolygons||[[[0,0],[f.su,0],[f.su,f.sv],[0,f.sv]]]){
  const points=poly.map(([u,v])=>f.origin.clone().addScaledVector(f.u,u).addScaledVector(f.v,v));
  polys.push({y:Math.max(...points.map(p=>p.y)),svg:`<polygon points="${points.map(p=>`${(p.x-b.minX+margin).toFixed(3)},${(p.z-b.minZ+margin).toFixed(3)}`).join(' ')}" fill="#${block.color.getHexString()}" stroke="${block.grate?'#bfedf5':block.paint?'#4c6470':'#e89b6c'}" stroke-width=".12"><title>${block.stageKey}; top ${f.origin.y.toFixed(2)} world units; ${block.paint?'inkable':'not inkable'}</title></polygon>`});
 }}
 polys.sort((a,b)=>a.y-b.y);
 const pads=level.spawnPads.map((p,i)=>`<circle cx="${p.x-b.minX+margin}" cy="${p.z-b.minZ+margin}" r="1.25" fill="${i?'#e97948':'#51becf'}"/><text x="${p.x-b.minX+margin}" y="${p.z-b.minZ+margin+.6}" text-anchor="middle" font-size="1.6" fill="#102b3e">${i?'B':'A'}</text>`).join('');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vx+margin*2} ${vz+margin*2}"><title>${meta.nameJa} / ${rule}; authored, not measured original geometry</title><rect width="100%" height="100%" fill="#142a38"/>${polys.map(p=>p.svg).join('')}${pads}</svg>`;
 fs.writeFileSync(path.join(dir,rule+'.svg'),svg);row.rules[rule]={bounds:layout.bounds,hash:layout.compatibilityHash,blocks:level.blocks.length,faces:level.faces.length,objectives:layout.ruleData.objectives,footprint:svg};count++;
 }
 catalog.push(row);
}
fs.writeFileSync(path.join(out,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');
console.log(`Exported ${catalog.length} stage records, ${count} layouts and ${count} collision-derived SVGs.`);
