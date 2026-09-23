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
const [{openProduct},rtti]=await Promise.all([
  import(pathToFileURL(path.join(targetRoot,'tools/validation/public-benchmark/product-host.mjs')).href),
  import(pathToFileURL(path.join(targetRoot,'js/rtti.js')).href),
]);
const bytes=fs.readFileSync(binary), sha256=createHash('sha256').update(bytes).digest('hex');
const product=await openProduct(binary);
if(product.unsupported) throw new Error(`unsupported:${product.reason}`);
const read=(addr,len)=>product.app.backend.readAt(addr,len).then(r=>r?.found?r.bytes:null).catch(()=>null);
const classes=rtti.findCxxClasses(product.app.symbols,10000);
const classRows=[];
try {
  for(const cls of classes.slice(0,300)) {
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
  }
  const snapshot=await product.query.snapshot();
  const functions=[]; let offset=0;
  while(functions.length<12000){const page=await product.query.functions(snapshot,{}, {offset,limit:1000}); functions.push(...(page.value??[])); if(page.page?.next==null) break; offset=page.page.next;}
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
  const decompiled=[];
  for(const target of targets.slice(0,20)){
    const t=performance.now(); let response=null,error=null;
    try{response=await product.query.decompile(snapshot,Number(target.address),{profile:'fast'});}catch(e){error=String(e?.message||e).slice(0,200);}
    const code=typeof response?.value==='string'?response.value:'';
    const members=memberNames(code);
    const classMentions=classes.filter(c=>c.name && code.includes(c.name)).slice(0,30).map(c=>c.name);
    decompiled.push({
      address:target.address,name:target.name,source:target.source,
      elapsedMs:round(performance.now()-t),completeness:response?.status?.completeness??(error?'CRASH':null),error,
      indirectCallMarkers:(code.match(/\(\*\*|\(\*[^\n]{0,80}\)\s*\(/g)||[]).length,
      memberAccessMarkers:members.length,memberNames:members,classMentions,
      gotoCount:(code.match(/\bgoto\b/g)||[]).length,
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
  fs.mkdirSync(path.dirname(a.out),{recursive:true}); fs.writeFileSync(a.out,JSON.stringify(out,null,2)+'\n');
  console.log(JSON.stringify({game:out.game,binary:out.binary,sha256,totals,setup:out.setup},null,2));
} finally { await product.close?.(); }
