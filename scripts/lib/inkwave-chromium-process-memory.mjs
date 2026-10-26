import fs from 'node:fs';
import path from 'node:path';

// CDP omits Linux zygotes. Discover only the selected browser's descendants;
// never add an unrelated Chromium merely because its command name matches.
export function sampleChromiumProcessMemory(processInfo,{procRoot='/proc',maxDiagnostics=32}={}) {
 if(!Array.isArray(processInfo))throw new TypeError('CDP processInfo must be an array');
 if(!Number.isInteger(maxDiagnostics)||maxDiagnostics<0)throw new RangeError('Invalid diagnostic limit');
 const validPid=value=>Number.isSafeInteger(value)&&value>0;
 const browser=processInfo.filter(p=>p.type==='browser'&&validPid(p.id));
 if(browser.length!==1)throw new Error('Exactly one browser CDP PID required');
 const metadata=new Map(processInfo.filter(p=>validPid(p.id)).map(p=>[p.id,p]));
 const diagnostics=[],statusFailures=new Set(),skipped={status:0,memory:0,command:0};
 const note=(pid,stage,error)=>{if(stage==='status')statusFailures.add(pid);skipped[stage]++;if(diagnostics.length<maxDiagnostics)diagnostics.push({pid,stage,reason:error?.code||'invalid-data'});};
 const parents=new Map();
 for(const entry of fs.readdirSync(procRoot)){
  if(!/^[1-9]\d*$/.test(entry))continue;const pid=Number(entry);if(!validPid(pid))continue;
  try{const text=fs.readFileSync(path.join(procRoot,entry,'status'),'utf8'),match=/^PPid:\s+(\d+)\s*$/m.exec(text);if(!match)throw new Error('Missing parent');parents.set(pid,Number(match[1]));}
  catch(error){if(metadata.has(pid))note(pid,'status',error);}
 }
 // CDP can report a process that exits before the proc directory enumeration.
 for(const pid of metadata.keys())if(!parents.has(pid)&&!statusFailures.has(pid))note(pid,'status',{code:'not-present'});
 const selected=new Set();
 if(parents.has(browser[0].id))selected.add(browser[0].id);
 const children=new Map();
 for(const [pid,parent]of parents){if(!children.has(parent))children.set(parent,[]);children.get(parent).push(pid);}
 const pending=[...selected];
 for(let i=0;i<pending.length;i++)for(const pid of children.get(pending[i])||[])if(!selected.has(pid)){selected.add(pid);pending.push(pid);}
 const processes=[];
 for(const pid of [...selected].sort((a,b)=>a-b)){
  let values;
  try{
   const text=fs.readFileSync(path.join(procRoot,String(pid),'smaps_rollup'),'utf8');
   values=Object.fromEntries([...text.matchAll(/^(Rss|Pss|Private_Clean|Private_Dirty|Private_Hugetlb):\s+(\d+)\s+kB\s*$/gm)].map(m=>[m[1],Number(m[2])]));
   if(!Number.isFinite(values.Rss)||!Number.isFinite(values.Pss)||!Number.isFinite(values.Private_Clean)||!Number.isFinite(values.Private_Dirty))throw new Error('Incomplete memory receipt');
  }catch(error){note(pid,'memory',error);continue;}
  const cdp=metadata.get(pid);let type=cdp?.type;
  if(!type){
   try{const args=fs.readFileSync(path.join(procRoot,String(pid),'cmdline'),'utf8').split('\0');const kind=args.map(arg=>/(?:^|\s)--type=([a-zA-Z0-9_.-]+)(?=\s|$)/.exec(arg)).find(Boolean);type=kind?kind[1]:'browser-child';}
   catch(error){note(pid,'command',error);type='browser-child';}
  }
  processes.push({pid,ppid:parents.get(pid),type,source:cdp?'cdp':'proc-descendant',cpuSeconds:cdp?.cpuTime??null,rssKiB:values.Rss,pssKiB:values.Pss,ussKiB:values.Private_Clean+values.Private_Dirty+(values.Private_Hugetlb||0)});
 }
 return {browserPid:browser[0].id,processes,diagnostics,skipped,diagnosticsTruncated:Object.values(skipped).reduce((a,b)=>a+b,0)>diagnostics.length};
}
