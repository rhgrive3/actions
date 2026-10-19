import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
export const audioDiagnosticURL = raw => {try{const u=new URL(String(raw));u.search='';u.hash='';return u.href;}catch{return '[invalid URL]';}};
export const sha256 = data => createHash('sha256').update(data).digest('hex');
export function audioBuildManifestReceipt(site){
 let identity;try{identity=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));}catch(error){return {error:String(error.message)}}
 const suffix='patches/splatoon3/runtime/audio/real-s3-installed.json';
 const paths=Object.keys(identity.artifacts||{}).filter(p=>p===suffix||p.endsWith('/'+suffix));
 return {buildRevision:identity.build?.revision,inputHash:identity.inputHash,manifests:paths.map(rel=>{
  const file=path.resolve(site,rel);if(!file.startsWith(path.resolve(site)+path.sep))return {path:rel,error:'outside site'};
  if(!fs.existsSync(file))return {path:rel,exists:false,expectedSha256:identity.artifacts[rel]};
  const bytes=fs.readFileSync(file);return {path:rel,exists:true,bytes:bytes.length,sha256:sha256(bytes),expectedSha256:identity.artifacts[rel]};
 })};
}
