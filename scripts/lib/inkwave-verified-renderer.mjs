import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath,pathToFileURL} from 'node:url';import {execFileSync} from 'node:child_process';
export const rendererPins=JSON.parse(fs.readFileSync(new URL('./inkwave-tracked-renderer-pins.json',import.meta.url)));
const sha=(b,kind='sha256')=>crypto.createHash(kind).update(b).digest('hex');
export function verifyRendererInputs(root,{head=null}={}) {
 if(head){if(![rendererPins.baseline,rendererPins.candidate].includes(head))throw Error('Unexpected renderer source head');const actual=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();if(actual!==head)throw Error('Renderer checkout head mismatch');}
 const verified={};for(const [p,pin]of Object.entries(rendererPins.inputs)){const bytes=fs.readFileSync(path.join(root,p)),blob=sha(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`),bytes]),'sha1');if(bytes.length!==pin.bytes||sha(bytes)!==pin.sha256||blob!==pin.gitBlobSHA1)throw Error('Renderer input hash mismatch: '+p);verified[p]={...pin};}
 const source=fs.readFileSync(path.join(root,'inkwave-public/src/game/weapons.js'),'utf8');const start=source.indexOf('  _draw() {'),draw=source.slice(start,source.indexOf('\n  }\n}',start)+4),materialStart=source.indexOf('function makeBlobMaterial()'),material=source.slice(materialStart,source.indexOf('\n}',materialStart)+2);if(sha(draw)!==rendererPins.drawSHA256||sha(material)!==rendererPins.fullMaterialSHA256)throw Error('Draw/shader extraction mismatch');
 return {verified:true,head,inputs:verified,drawSHA256:rendererPins.drawSHA256,fullMaterialSHA256:rendererPins.fullMaterialSHA256};
}
const repositoryRoot=fileURLToPath(new URL('../../',import.meta.url));
// Verify existing repository inputs before loading Three; no registry dependency.
export const harnessRendererVerification=verifyRendererInputs(repositoryRoot);
export const THREE=await import(pathToFileURL(path.join(repositoryRoot,'inkwave-public/vendor/three/build/three.module.js')).href);
export function verifyServedRenderer(binding){
 if(!binding.rendererSourceVerification?.verified)throw Error('Unverified renderer source');
 for(const[p,pin]of Object.entries(rendererPins.inputs))if(binding.rendererSourceVerification.inputs?.[p]?.sha256!==pin.sha256||binding.rendererSourceVerification.inputs?.[p]?.gitBlobSHA1!==pin.gitBlobSHA1)throw Error('Renderer input receipt mismatch');
 if(binding.rendererSourceVerification.head!==binding.head||![rendererPins.baseline,rendererPins.candidate].includes(binding.head))throw Error('Renderer head receipt mismatch');
 if(binding.rendererSourceVerification.drawSHA256!==rendererPins.drawSHA256||binding.rendererSourceVerification.fullMaterialSHA256!==rendererPins.fullMaterialSHA256)throw Error('Renderer shader receipt mismatch');
 if(binding.rendererEmitted?.length!==1)throw Error('Missing unique served renderer');const row=binding.rendererEmitted[0];if(!row.match||row.sha256!==row.expected||row.sha256!==rendererPins.emittedWeaponsSHA256||!/^_versions\/[a-f0-9]{64}\/src\/game\/weapons\.js$/.test(row.path))throw Error('Served renderer hash mismatch');return true;
}
