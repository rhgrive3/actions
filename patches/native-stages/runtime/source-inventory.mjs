// Authenticated metadata only: names, modes, byte counts and Git object IDs.
// No model, image, sound or other source asset payload is bundled here.
const encoder=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,'0')).join('');
const fromHex=value=>Uint8Array.from(value.match(/../g),byte=>parseInt(byte,16));
const modes=new Map([['040000','tree'],['100644','blob'],['100755','blob'],['120000','blob'],['160000','commit']]);
const compareBytes=(a,b)=>{for(let i=0;i<Math.min(a.length,b.length);i++)if(a[i]!==b[i])return a[i]-b[i];return a.length-b.length;};
async function gitTreeHash(entries){
 const rows=entries.map(entry=>({entry,sort:encoder.encode(entry.name+(entry.type==='tree'?'/':''))}));rows.sort((a,b)=>compareBytes(a.sort,b.sort));
 const chunks=rows.map(({entry})=>{const prefix=encoder.encode(entry.mode.replace(/^0+/,'')+' '+entry.name+'\0'),bytes=new Uint8Array(prefix.length+20);bytes.set(prefix);bytes.set(fromHex(entry.sha),prefix.length);return bytes;});
 const size=chunks.reduce((sum,row)=>sum+row.length,0),header=encoder.encode('tree '+size+'\0'),bytes=new Uint8Array(header.length+size);bytes.set(header);let offset=header.length;for(const row of chunks){bytes.set(row,offset);offset+=row.length;}
 return hex(await crypto.subtle.digest('SHA-1',bytes));
}
/** Reconstruct every Git tree object; an echoed JSON sha field is not proof. */
export async function validateSourceInventory(pinned,bytes,expectedSha256){
 if(!/^[a-f0-9]{40}$/.test(pinned)||!/^[a-f0-9]{64}$/.test(expectedSha256))throw Error('Unpinned source inventory');
 if(hex(await crypto.subtle.digest('SHA-256',bytes))!==expectedSha256)throw Error('Source inventory byte integrity mismatch');
 const value=JSON.parse(new TextDecoder().decode(bytes));
 if(value?.schema!==1||value.tree!==pinned||!Array.isArray(value.entries))throw Error('Foreign or unsupported source inventory');
 const entries=[],byPath=new Map(),directories=new Map([['',[]]]);
 for(const row of value.entries){
  if(!Array.isArray(row)||row.length!==4)throw Error('Invalid source inventory entry');
  const [mode,path,sha,size]=row,type=modes.get(mode);
  if(!type||typeof path!=='string'||path.includes('\\')||path.includes('\0')||path.startsWith('/')||path.split('/').some(p=>!p||p==='.'||p==='..')||byPath.has(path)||typeof sha!=='string'||!/^[a-f0-9]{40}$/.test(sha)||
    (type==='blob'?(!Number.isSafeInteger(size)||size<0):size!==null))throw Error('Unsafe or invalid source inventory metadata');
  const slash=path.lastIndexOf('/'),parent=slash<0?'':path.slice(0,slash),name=path.slice(slash+1),entry={path,mode,type,sha,...(type==='blob'?{size}:{})};
  byPath.set(path,entry);entries.push(entry);
  if(!directories.has(parent))directories.set(parent,[]);directories.get(parent).push({...entry,name});
  if(type==='tree'&&!directories.has(path))directories.set(path,[]);
 }
 for(const parent of directories.keys())if(parent&&byPath.get(parent)?.type!=='tree')throw Error('Source inventory missing parent tree');
 // Validate descendants too: root-only hashing would miss altered contents
 // beneath an unchanged directory hash in a recursive API response.
 for(const [path,children] of directories){const expected=path?byPath.get(path).sha:pinned;if(await gitTreeHash(children)!==expected)throw Error('Source inventory Git tree mismatch: '+(path||'/'));}
 return {sha:pinned,truncated:false,tree:entries};
}
export async function loadPinnedSourceTree(pinned,expectedSha256,url,signal){
 if(signal?.aborted)throw new DOMException('Aborted','AbortError');
 const response=await fetch(url,{signal,credentials:'omit',mode:'same-origin',referrerPolicy:'no-referrer'});
 if(!response.ok)throw Error('Bundled source inventory unavailable ('+response.status+')');
 const tree=await validateSourceInventory(pinned,await response.arrayBuffer(),expectedSha256);
 if(signal?.aborted)throw new DOMException('Aborted','AbortError');
 return tree;
}
