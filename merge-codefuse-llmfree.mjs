#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const dir=path.resolve(process.argv[2]||'.');
const files=fs.readdirSync(dir).filter(n=>/^rows-.+\.json$/.test(n)).sort();
const rows=[]; const parts=[];
for (const f of files) {
  const d=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
  parts.push({src:d.src,caseCount:d.caseCount});
  rows.push(...d.rows);
}
const order=['hex','ida','ghidra','retdec','angr','binaryai'];
function pct(a,b){return b?100*a/b:null;}
function fmt(v){return v==null?'N/A':v.toFixed(2)+'%';}
const decompilers={};
for (const dec of order) {
  const r=rows.filter(x=>x.decompiler===dec);
  const total=r.length;
  const present=r.filter(x=>x.artifactState==='PRESENT');
  const compiled=present.filter(x=>x.compile?.state==='COMPILE_PASS');
  const comparable=compiled.filter(x=>x.runtime && !['INFRA_ERROR','ORIGINAL_TIMEOUT'].includes(x.runtime.state));
  const exact=comparable.filter(x=>x.runtime.state==='EXACT');
  const funcs=present.reduce((s,x)=>s+(x.metrics?.functionCount||0),0);
  const sum=(k)=>present.reduce((s,x)=>s+(x.metrics?.[k]||0),0);
  const hexStates={};
  if(dec==='hex') for(const x of r){const s=x.hexSubject?.state||'UNKNOWN';hexStates[s]=(hexStates[s]||0)+1;}
  decompilers[dec]={
    cases:total,
    artifactPresent:present.length,
    artifactCoverage:pct(present.length,total),
    parsedFunctions:funcs,
    directCompilePass:compiled.length,
    directRecompilability:pct(compiled.length,present.length),
    runtimeComparable:comparable.length,
    exact:exact.length,
    exactAmongCompiled:pct(exact.length,comparable.length),
    endToEndExact:pct(exact.length,present.length),
    avgLOCPerFunction:funcs?sum('nonEmptyLines')/funcs:null,
    gotoPerFunction:funcs?sum('gotoCount')/funcs:null,
    castsPerFunction:funcs?sum('castCount')/funcs:null,
    generatedTempsPerFunction:funcs?sum('generatedTempCount')/funcs:null,
    hexStates:dec==='hex'?hexStates:undefined
  };
}
const expectedSrc=['1','2','3','4','5-1','5-23','6','7'];
const presentSrc=new Set(parts.map(x=>x.src));
const missingSrc=expectedSrc.filter(x=>!presentSrc.has(x));
const summary={
  schema:'hex-codefuse-llmfree-actions/v1',
  architecture:'arm64',
  llmUsed:false,
  sourceRepair:false,
  competitorMode:'published artifacts only',
  compiler:'aarch64-linux-gnu-gcc',
  runtime:'qemu-aarch64 -L /usr/aarch64-linux-gnu',
  definitions:{
    artifactCoverage:'artifact-present cases / all discovered cases',
    directRecompilability:'unchanged artifact compile+link PASS / artifact-present cases',
    exactAmongCompiled:'same exit status and identical stdout / runtime-comparable compiled cases',
    endToEndExact:'EXACT cases / artifact-present cases',
    partialFunctionality:'UNMEASURED',
    structuralReadability:'mechanical syntax density only; no LLM score'
  },
  parts,
  missingSrc,
  totalRows:rows.length,
  decompilers
};
fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify(summary,null,2));
let md='# CodeFuse-DeBench ARM64 LLM-free Comparison\n\n';
md+='- LLM/API used: **NO**\n- Source repair: **NO**\n- Compiler: aarch64-linux-gnu-gcc\n- Runtime: qemu-aarch64\n- Missing source groups: '+(missingSrc.length?missingSrc.join(', '):'none')+'\n\n';
md+='| Decompiler | Artifact coverage | Parsed functions | Direct recompilability | Exact among compiled | End-to-end exact | LOC/function | goto/function | casts/function | temps/function |\n';
md+='|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n';
for(const dec of order){
  const d=decompilers[dec];
  const n=v=>v==null?'N/A':Number(v).toFixed(3);
  md+='| '+dec+' | '+fmt(d.artifactCoverage)+' | '+d.parsedFunctions+' | '+fmt(d.directRecompilability)+' | '+fmt(d.exactAmongCompiled)+' | '+fmt(d.endToEndExact)+' | '+n(d.avgLOCPerFunction)+' | '+n(d.gotoPerFunction)+' | '+n(d.castsPerFunction)+' | '+n(d.generatedTempsPerFunction)+' |\n';
}
md+='\n## Definitions\n\n';
md+='- Direct recompilability is raw, unchanged artifact compilation/linking. No repair, header injection, typedef shim, or LLM is used.\n';
md+='- Exact functionality requires identical stdout and exit status under qemu-aarch64.\n';
md+='- Structural metrics are descriptive mechanical counts only; lower/higher is not an overall quality verdict.\n';
if(decompilers.hex.hexStates) md+='- Hex case states: '+JSON.stringify(decompilers.hex.hexStates)+'\n';
fs.writeFileSync(path.join(dir,'comparison.md'),md);
console.log(JSON.stringify({parts,missingSrc,decompilers},null,2));
