#!/usr/bin/env node
// Offline/private diagnostic conversion. Never package these outputs for Pages.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {convertSource} from '../runtime/source-convert.mjs';
const args=new Map();
for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i];if(!['--obj','--mtl','--stage','--placement','--bindings','--out'].includes(key)||args.has(key)||!process.argv[i+1])throw Error('Expected unique --obj --mtl --stage --placement --bindings --out paths');args.set(key,process.argv[i+1]);}
for(const key of ['--obj','--mtl','--stage','--placement','--bindings','--out'])if(!args.has(key))throw Error('Missing '+key);
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const inputBytes=new Map();
const json=key=>{const bytes=fs.readFileSync(args.get(key));inputBytes.set(key,bytes);return JSON.parse(bytes.toString('utf8'));};
const stage=json('--stage'),document=json('--placement'),plan=json('--bindings');
const obj=fs.readFileSync(args.get('--obj')),mtl=fs.readFileSync(args.get('--mtl'));
if(digest(obj)!==stage.sourceSha256)throw Error('OBJ differs from declared stage source hash');
if(!stage.bounds||!['minX','maxX','minZ','maxZ'].every(k=>Number.isFinite(stage.bounds[k]))||stage.bounds.minX>=stage.bounds.maxX||stage.bounds.minZ>=stage.bounds.maxZ||
 !Array.isArray(stage.spawnPads)||stage.spawnPads.length!==2||stage.spawnPads.some(v=>!Array.isArray(v)||v.length!==3||!v.every(Number.isFinite)))throw Error('Diagnostic stage requires explicit bounds and trial spawn pads');
const files={},base=path.dirname(path.resolve(args.get('--mtl')));
const walk=(dir,rel='')=>{for(const f of fs.readdirSync(dir,{withFileTypes:true})){const local=path.join(dir,f.name),name=rel+f.name;if(f.isDirectory())walk(local,name+'/');else if(f.isFile()&&name.endsWith('.png')){const bytes=fs.readFileSync(local);files[name]={bytes:bytes.length,sha256:digest(bytes)};}}};
// Include texture references in the private integrity receipt; do not copy or
// decode source images. The diagnostic's useful outputs are geometry and flags.
walk(base);
const data=convertSource(stage,obj.toString('utf8'),mtl.toString('utf8'),files,()=>{},{document,plan});
const root=path.resolve(args.get('--out'));
if(fs.existsSync(root)&&fs.readdirSync(root).length)throw Error('Diagnostic output directory must be empty');
fs.mkdirSync(root,{recursive:true});
const names={vertices:'vertices',indices:'indices',triangles:'collision',normals:'normals',flags:'flags',objectIds:'objects',nodes:'bvh',order:'order',triangleFace:'triangleFace',mask:'mask'};
for(const [key,file] of Object.entries(names)){const v=data[key];fs.writeFileSync(path.join(root,file+'.bin'),Buffer.from(v.buffer,v.byteOffset,v.byteLength));}
data.manifest.diagnosticOnly=true;data.manifest.availability='placement-unavailable';
data.manifest.placementReceipt.materialDocumentSha256=digest(mtl);
data.manifest.placementReceipt.normalizedPlacementSha256=digest(inputBytes.get('--placement'));
data.manifest.placementReceipt.bindingPlanSha256=digest(inputBytes.get('--bindings'));
fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(data.manifest,null,2)+'\n');
const integrity={};for(const f of fs.readdirSync(root)){const bytes=fs.readFileSync(path.join(root,f));integrity[f]={bytes:bytes.length,sha256:digest(bytes)};}
fs.writeFileSync(path.join(root,'integrity.json'),JSON.stringify(integrity,null,2)+'\n');
fs.writeFileSync(path.join(root,'DIAGNOSTIC-ONLY.txt'),'Private source-derived geometry. Do not deploy. Actor transforms are supplied data; movement, native collision, native paint masks and retail placements are not certified.\n');
console.log(JSON.stringify({diagnosticOnly:true,...data.manifest.geometry,placementReceipt:data.manifest.placementReceipt}));
