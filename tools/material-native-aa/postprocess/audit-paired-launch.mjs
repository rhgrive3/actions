import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
// Execute the actual generated paired program with filesystem writes and child
// execution intercepted. A missing readiness receipt deliberately ends A1.
// No native driver, browser, source build, or remote command is executed.
export function auditPairedLaunch(program, {expectedFrame, root='/review-only/no-disk-output', qa=process.cwd(), realReads=new Set(), inputs=['review-site','review-source','review-overlay']}={}) {
 const launches=[],writes=[],prints=[],directories=[];
 const sentinel=Symbol('controlled process exit');
 const scope=program.replace(/^import[^\n]*\n/gm,'').replace(/^#![^\n]*\n/,'');
 const fakeFs={...fs,mkdirSync:(...args)=>directories.push(args),writeFileSync:(...args)=>writes.push(args),writeSync:(fd,bytes,offset=0,length=bytes.length-offset)=>{assert.equal(fd,1);prints.push(Buffer.from(bytes).subarray(offset,offset+length).toString());return length;},
  readFileSync:(file,...args)=>{if(realReads.has(path.resolve(String(file))))return fs.readFileSync(file,...args);throw Error('Deliberately absent review receipt: '+file);}};
 const fakeProcess={execPath:process.execPath,argv:[process.execPath,'review-generated-paired.mjs',...inputs,root,'--settled-aa-diagnostic'],env:{...process.env},cwd:()=>qa,exitCode:0,exit:code=>{assert.equal(code,1,'missing readiness must fail');throw sentinel;}};
 const execFileSync=(command,args,options)=>{launches.push({command,args,options});const e=Error('Controlled no-browser launch stub');e.status=1;throw e;};
 const run=Function('fs','path','assert','createHash','execFileSync','process','requireNormalNativeReceipt','requireAllUnpainted',scope);
 try{run(fakeFs,path,assert,createHash,execFileSync,fakeProcess,()=>{throw Error('Normal admission must not run');},()=>{throw Error('Normal admission must not run');});}catch(e){if(e!==sentinel)throw e;}
 assert.equal(launches.length,1,'A1 failure must prevent A2 or other launches');
 const launch=launches[0];assert.equal(launch.command,process.execPath);assert.equal(launch.args[0],expectedFrame);
 assert.deepEqual(launch.args.slice(1),[...inputs,path.join(root,'A1'),'A','--settled-diagnostic']);
 assert.equal(launch.options.timeout,300000);assert.equal(launch.options.stdio,'inherit');
 return{launches,writes,directories};
}
