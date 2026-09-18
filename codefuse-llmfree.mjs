#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

function opt(args, name, fallback=null) {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i+1];
}
function limited(s, n=1800) {
  s = String(s ?? '');
  return s.length <= n ? s : s.slice(0,n);
}
function run(cmd, args, timeout, cwd=null) {
  const r = spawnSync(cmd, args, {encoding:'utf8', timeout, cwd:cwd || undefined, maxBuffer: 4*1024*1024});
  const timedOut = r?.error?.code === 'ETIMEDOUT';
  return {status:r.status, signal:r.signal, stdout:r.stdout || '', stderr:r.stderr || '', error:r.error ? String(r.error) : null, timedOut};
}
function parseFunctions(code) {
  const re = /(?:^|\n)\s*(?!if\b|for\b|while\b|switch\b|return\b|sizeof\b)(?:[A-Za-z_$][\w$]*\s+|(?:struct|union|enum)\s+[A-Za-z_$][\w$]*\s+|[*\s])*([A-Za-z_$][\w$]*)\s*\([^;{}]*\)\s*\{/g;
  let n=0; for (const _ of String(code).matchAll(re)) n++; return n;
}
function metrics(code) {
  const text = String(code || '');
  const nonEmptyLines = text.split(/\r?\n/).filter(x=>x.trim()).length;
  const functionCount = parseFunctions(text);
  const gotoCount = (text.match(/\bgoto\b/g) || []).length;
  const castCount = (text.match(/\(\s*(?:unsigned\s+|signed\s+)?(?:char|short|int|long|float|double|void|size_t|u?int\d+_t|[A-Za-z_$][\w$]*(?:\s*\*)?)\s*\)/g) || []).length;
  const temps = new Set((text.match(/\b(?:v\d+|local_[A-Za-z0-9_]+|[ui]?Var\d+|extraout_[A-Za-z0-9_]+|tmp\d+|var_\d+)\b/g) || []);
  return {
    nonEmptyLines,functionCount,gotoCount,castCount,generatedTempCount:temps.size,
    avgLOCPerFunction:functionCount?nonEmptyLines/functionCount:null,
    gotoPerFunction:functionCount?gotoCount/functionCount:null,
    castsPerFunction:functionCount?castCount/functionCount:null,
    generatedTempsPerFunction:functionCount?temps.size/functionCount:null
  };
}
const MAP={ida:'ida_out',ghidra:'ghidra_out',retdec:'retdec_out',angr:'angr_out',binaryai:'BinaryAI_out'};
function classifyCompile(r) {
  if (r.timedOut) return 'TIMEOUT';
  if (r.error) return 'INFRA_ERROR';
  if (r.status === 0) return 'COMPILE_PASS';
  if (/undefined reference|collect2: error|ld returned|linker command failed/i.test(r.stderr)) return 'LINK_FAIL';
  return 'COMPILE_FAIL';
}
function compareRuntime(original, candidate, timeout) {
  const qemu='qemu-aarch64';
  const base=['-L','/usr/aarch64-linux-gnu'];
  const a=run(qemu,[...base,original],timeout);
  if (a.timedOut) return {state:'ORIGINAL_TIMEOUT'};
  if (a.error) return {state:'INFRA_ERROR',stderrExcerpt:limited(a.error)};
  const b=run(qemu,[...base,candidate],timeout);
  if (b.timedOut) return {state:'TIMEOUT'};
  if (b.error) return {state:'INFRA_ERROR',stderrExcerpt:limited(b.error)};
  const exact = a.status === b.status && a.stdout === b.stdout;
  return {
    state: exact?'EXACT':'FAIL',
    originalExit:a.status,candidateExit:b.status,
    stdoutEqual:a.stdout===b.stdout,
    originalStdout:limited(a.stdout,600),candidateStdout:limited(b.stdout,600),
    candidateStderr:limited(b.stderr,600)
  };
}
function hexTU(subject) {
  const out=['/* Hex-IDA raw pseudocode concatenation; no repair. */'];
  for (const fn of subject?.functions || []) {
    if (!fn?.pseudocode) continue;
    out.push('/* '+String(fn.address ?? '?')+' '+String(fn.name ?? '?')+' state='+String(fn.state ?? '?')+' */\n'+String(fn.pseudocode).trimEnd());
  }
  return out.join('\n\n')+'\n';
}
function listCases(root, src) {
  const dir=path.join(root,'build','arm64',src);
  return fs.readdirSync(dir).sort().filter(n=>fs.statSync(path.join(dir,n)).isFile()).map(n=>({id:src+'/'+n,src,name:n,binary:path.join(dir,n)}));
}

const args=process.argv.slice(2);
const hexRoot=path.resolve(opt(args,'--hex-root'));
const cfRoot=path.resolve(opt(args,'--codefuse-root'));
const src=opt(args,'--src');
const output=path.resolve(opt(args,'--output'));
const timeout=Number(opt(args,'--timeout-ms','120000'));
if (!hexRoot || !cfRoot || !src || !output || !Number.isFinite(timeout)) throw new Error('missing args');
fs.mkdirSync(output,{recursive:true});
const {runCase}=await import(pathToFileURL(path.join(hexRoot,'tools/validation/public-benchmark/run-case.mjs')).href);
const cases=listCases(cfRoot,src);
const rows=[]; const failures=[];
for (const c of cases) {
  for (const dec of ['hex','ida','ghidra','retdec','angr','binaryai']) {
    const row={caseId:c.id,decompiler:dec,artifactState:'MISSING',metrics:null,compile:null,runtime:null};
    try {
      let code=null;
      if (dec==='hex') {
        const outJson=path.join(output,'hex-subject',Buffer.from(c.id).toString('hex')+'.json');
        fs.mkdirSync(path.dirname(outJson),{recursive:true});
        const rr=await runCase({binary:c.binary,out:outJson,timeout});
        const subject=rr.row;
        code=hexTU(subject);
        row.hexSubject={state:subject.state,reason:subject.reason ?? null,functions:Array.isArray(subject.functions)?subject.functions.length:0,functionStateCounts:subject.functionStateCounts ?? null};
      } else {
        const p=path.join(cfRoot,'decompiled',MAP[dec],'arm64',c.src,c.name+'.c');
        row.artifactPath=p;
        if (fs.existsSync(p)) code=fs.readFileSync(p,'utf8');
      }
      if (code && code.trim()) {
        row.artifactState='PRESENT';
        row.metrics=metrics(code);
        const srcPath=path.join(output,'sources',dec,c.src,c.name+'.c');
        const binPath=path.join(output,'bins',dec,c.src,c.name);
        fs.mkdirSync(path.dirname(srcPath),{recursive:true});
        fs.mkdirSync(path.dirname(binPath),{recursive:true});
        fs.writeFileSync(srcPath,code);
        const cr=run('aarch64-linux-gnu-gcc',['-x','c','-std=gnu11','-w',srcPath,'-o',binPath],timeout,cfRoot);
        row.compile={state:classifyCompile(cr),exitCode:cr.status,signal:cr.signal,stderrExcerpt:limited(cr.stderr || cr.error)};
        if (row.compile.state==='COMPILE_PASS') row.runtime=compareRuntime(c.binary,binPath,timeout);
      }
    } catch(e) {
      row.error=limited(e?.stack || e);
    }
    if (row.artifactState!=='PRESENT' || row.error || (row.compile && row.compile.state!=='COMPILE_PASS') || (row.runtime && row.runtime.state!=='EXACT')) {
      failures.push({caseId:c.id,decompiler:dec,artifactState:row.artifactState,compile:row.compile?.state ?? null,runtime:row.runtime?.state ?? null,error:row.error ?? null,stderrExcerpt:row.compile?.stderrExcerpt ?? row.runtime?.stderrExcerpt ?? ''});
    }
    rows.push(row);
    console.log(c.id+' '+dec+' artifact='+row.artifactState+' compile='+(row.compile?.state ?? 'N/A')+' runtime='+(row.runtime?.state ?? 'N/A'));
  }
}
fs.writeFileSync(path.join(output,'rows-'+src+'.json'),JSON.stringify({src,caseCount:cases.length,rows},null,2));
fs.writeFileSync(path.join(output,'failures-'+src+'.json'),JSON.stringify({src,failures},null,2));
console.log('completed src='+src+' cases='+cases.length+' rows='+rows.length+' failures='+failures.length);
