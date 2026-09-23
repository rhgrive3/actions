#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

function argsOf(argv){const o={};for(let i=0;i<argv.length;i+=2)o[argv[i].replace(/^--/,'')]=argv[i+1];return o;}
function round(v,n=2){return Number.isFinite(v)?Number(v.toFixed(n)):null;}
function memberNames(code){return [...new Set([...code.matchAll(/(?:->|\.)\s*([A-Za-z_][A-Za-z0-9_]*)/g)].map(m=>m[1]))].slice(0,100);}
const a=argsOf(process.argv.slice(2));
for(const k of ['target-root','binary','out']) if(!a[k]) throw new Error(`missing-${k}`);
const targetRoot=path.resolve(a['target-root']), binary=path.resolve(a.binary);
const stagesFile=path.join(path.dirname(path.resolve(a.out)), 'stages.json');

const stagesList=[];
let lastStageName=null;

function writeStages(lastStage=lastStageName){
  const payload={
    schema:'hex-realgame-stages/v1',
    stages:stagesList,
    lastStage:lastStage??null,
    memory:process.memoryUsage().rss,
  };
  const dir=path.dirname(stagesFile);
  fs.mkdirSync(dir,{recursive:true});
  const tmp=path.join(dir,`.stages.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp,JSON.stringify(payload,null,2)+'\n');
  fs.renameSync(tmp,stagesFile);
}

function recordStage(stage, ok, ms, detail=null){
  lastStageName=stage;
  stagesList.push({
    stage,
    ok,
    ms:round(ms),
    at:new Date().toISOString(),
    detail,
  });
  writeStages(lastStageName);
}

let product=null;

try {
  const [{openProduct},rtti]=await Promise.all([
    import(pathToFileURL(path.join(targetRoot,'tools/validation/public-benchmark/product-host.mjs')).href),
    import(pathToFileURL(path.join(targetRoot,'js/rtti.js')).href),
  ]);
  const bytes=fs.readFileSync(binary), sha256=createHash('sha256').update(bytes).digest('hex');

  const tOpenProduct=performance.now();
  product=await openProduct(binary);
  if(product.unsupported){
    recordStage('openProduct', false, performance.now()-tOpenProduct, {
      profile:product.profile??null,
      unsupported:true,
      reason:product.reason??null,
    });
    throw new Error(`unsupported:${product.reason}`);
  }
  recordStage('openProduct', true, performance.now()-tOpenProduct, {
    profile:product.profile??null,
    unsupported:false,
    reason:null,
  });

  const read=(addr,len)=>product.app.backend.readAt(addr,len).then(r=>r?.found?r.bytes:null).catch(()=>null);

  const tFindCxxClasses=performance.now();
  const classes=rtti.findCxxClasses(product.app.symbols,10000);
  recordStage('findCxxClasses', true, performance.now()-tFindCxxClasses, {
    classes:classes.length,
  });

  const tVtables=performance.now();
  const classRows=[];
  const classesSlice=classes.slice(0,300);
  const totalClasses=classesSlice.length;
  for(let i=0;i<totalClasses;i++) {
    const cls=classesSlice[i];
    let vt=null;
    if(cls.vtable!=null) {
      const elfPointerBits = bytes.length > 5 && bytes[0]===0x7f && bytes[1]===0x45 && bytes[2]===0x4c && bytes[3]===0x46 ? (bytes[4]===2 ? 64 : bytes[4]===1 ? 32 : null) : null;
      const basePointerContext={...(product.app.pointerResolutionContextFor?.(cls.vtable)??{}),...(elfPointerBits?{pointerBits:elfPointerBits}:{})};
      const pointerContext=rtti.rttiPointerContextForSlice(product.app.currentSlice?.(),basePointerContext);
      for(const slots of [32,16,8,4,2]) {
        vt=await rtti.readVtable(read,cls.vtable,product.app.symbols,slots,pointerContext);
        if(vt?.slots?.length) break;
      }
    }
    classRows.push({
      name:cls.name,
      vtable:cls.vtable==null?null:String(cls.vtable),
      typeinfo:cls.typeinfo==null?null:String(cls.typeinfo),
      slots:(vt?.slots??[]).length,
      resolvedSlots:(vt?.slots??[]).filter(s=>s.addr!=null&&!s.unresolved&&s.addr!==0n).length,
      namedSlots:(vt?.slots??[]).filter(s=>s.readable||s.name).length,
      slotTargets:(vt?.slots??[]).filter(s=>s.addr!=null&&!s.unresolved&&s.addr!==0n).slice(0,32).map(s=>({index:s.index,address:String(s.addr),name:s.readable||s.name||null})),
    });

    const doneCount=i+1;
    if(doneCount%50===0 || doneCount===totalClasses) {
      recordStage('vtables', true, performance.now()-tVtables, {
        done:doneCount,
        total:totalClasses,
      });
    }
  }

  const tSnapshot=performance.now();
  const snapshot=await product.query.snapshot();
  recordStage('snapshot', true, performance.now()-tSnapshot, null);

  const tFunctions=performance.now();
  const functions=[]; let offset=0;
  while(functions.length<12000){const page=await product.query.functions(snapshot,{}, {offset,limit:1000}); functions.push(...(page.value??[])); if(page.page?.next==null) break; offset=page.page.next;}
  recordStage('functions', true, performance.now()-tFunctions, {
    count:functions.length,
  });

  const tSelectTargets=performance.now();
  const byAddress=new Map(functions.map(fn=>[String(fn.address),fn]));
  const targets=[]; const seen=new Set();
  for(const cls of classRows) for(const slot of cls.slotTargets??[]) {
    if(seen.has(slot.address)) continue; seen.add(slot.address);
    const fn=byAddress.get(slot.address);
    targets.push({address:slot.address,name:slot.name||fn?.name||null,source:'vtable'});
    if(targets.length>=12) break;
  }
  for(const fn of functions.filter(fn=>typeof fn.name==='string' && /_Z|::/.test(fn.name))) {
    const key=String(fn.address); if(seen.has(key)) continue; seen.add(key);
    targets.push({address:key,name:fn.name,source:'named-cxx'}); if(targets.length>=20) break;
  }
  recordStage('selectTargets', true, performance.now()-tSelectTargets, {
    count:targets.length,
  });

  const decompiled=[];
  for(const target of targets.slice(0,20)){
    const t=performance.now(); let response=null,error=null;
    try{response=await product.query.decompile(snapshot,Number(target.address),{profile:'fast'});}catch(e){error=String(e?.message||e).slice(0,200);}
    const targetElapsed=performance.now()-t;
    const completeness=response?.status?.completeness??(error?'CRASH':null);
    const code=typeof response?.value==='string'?response.value:(typeof response?.value?.pseudocode==='string'?response.value.pseudocode:'');
    const members=memberNames(code);
    const classMentions=classes.filter(c=>c.name && code.includes(c.name)).slice(0,30).map(c=>c.name);
    decompiled.push({
      address:target.address,name:target.name,source:target.source,
      elapsedMs:round(targetElapsed),completeness,error,
      indirectCallMarkers:(code.match(/\(\*\*|\(\*[^\n]{0,80}\)\s*\(/g)||[]).length,
      memberAccessMarkers:members.length,memberNames:members,classMentions,
      gotoCount:(code.match(/\bgoto\b/g)||[]).length,
      semantic:response?.value?.semantic??null,reason:response?.status?.reason??null,
      codeChars:code.length,excerpt:code.slice(0,400),
    });
    recordStage('decompile', !error, targetElapsed, {
      address:target.address,
      ms:round(targetElapsed),
      completeness,
      error,
    });
  }
  const allMembers=[...new Set(decompiled.flatMap(x=>x.memberNames??[]))];
  const allClassMentions=[...new Set(decompiled.flatMap(x=>x.classMentions??[]))];
  const totals={
    classes:classes.length,vtables:classes.filter(c=>c.vtable!=null).length,typeinfos:classes.filter(c=>c.typeinfo!=null).length,
    vtableSlots:classRows.reduce((n,c)=>n+c.slots,0),resolvedVtableSlots:classRows.reduce((n,c)=>n+c.resolvedSlots,0),namedVtableSlots:classRows.reduce((n,c)=>n+c.namedSlots,0),
    functions:functions.length,decompileSampled:decompiled.length,virtualTargetsSampled:decompiled.filter(x=>x.source==='vtable').length,
    completeSampled:decompiled.filter(x=>x.completeness==='complete').length,completeVirtualTargets:decompiled.filter(x=>x.source==='vtable'&&x.completeness==='complete').length,
    indirectCallMarkers:decompiled.reduce((n,x)=>n+x.indirectCallMarkers,0),memberAccessNames:allMembers.length,classMentions:allClassMentions.length,
  };
  const out={schema:'hex-realgame-cxx-holdout/v2',game:a.game??null,targetSha:a['target-sha']??null,binary:path.basename(binary),sha256,bytes:bytes.length,architecture:product.architecture,setup:product.profile,totals,classes:classRows,decompiled,observed:{memberNames:allMembers,classMentions:allClassMentions}};

  const tResult=performance.now();
  fs.mkdirSync(path.dirname(a.out),{recursive:true}); fs.writeFileSync(a.out,JSON.stringify(out,null,2)+'\n');
  recordStage('result', true, performance.now()-tResult, {
    totals,
  });
  console.log(JSON.stringify({game:out.game,binary:out.binary,sha256,totals,setup:out.setup},null,2));
} catch(err) {
  const stackLines=typeof err?.stack==='string'?err.stack.split(/\r?\n/).slice(0,10).join('\n'):null;
  recordStage('error', false, 0, {
    stage:'error',
    message:err?.message||String(err),
    stack:stackLines,
    lastStage:lastStageName,
  });
  throw err;
} finally {
  await product?.close?.();
}

