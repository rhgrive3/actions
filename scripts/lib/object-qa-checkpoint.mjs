import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
export const stages = Object.freeze({
  source: ['rainmaker/emitted-source-face.log'],
  aim: ['rainmaker/emitted-aim-native.log', 'rainmaker/emitted-aim-source.log'],
  spawner: ['spawner/result.json'],
  rainmaker: ['rainmaker/result.json'],
  clam: ['clam/result.json'],
  air: ['rainmaker/air/result.json'],
  form: ['rainmaker/form/result.json'],
});
export function checkpoint(root, destination, stage, identity) {
  if (!Object.hasOwn(stages,stage)) throw Error('Unknown checkpoint stage');
  if (!/^[a-f0-9]{40}$/.test(identity.sourceSha) || !/^\d+$/.test(identity.runId) || !/^\d+$/.test(identity.attempt)) throw Error('Exact checkpoint identity required');
  if (fs.existsSync(destination)) throw Error('Checkpoint destination exists');
  const files=[];let total=0;
  for(const relative of stages[stage]) {
    const file=path.join(root,relative);
    if(!fs.existsSync(file)) continue;
    let part=path.resolve(root);
    for(const segment of ['',...relative.split('/')]) { if(segment) part=path.join(part,segment);if(fs.lstatSync(part).isSymbolicLink()) throw Error('Checkpoint symlink rejected'); }
    const stat=fs.statSync(file),limit=relative.endsWith('.json')?2*1024*1024:1024*1024;
    if(!stat.isFile()||stat.size>limit) throw Error('Checkpoint file exceeds bounded size or is not regular');
    const bytes=fs.readFileSync(file);total+=bytes.length;if(total>3*1024*1024)throw Error('Checkpoint exceeds 3 MiB');
    if(relative.endsWith('.json'))JSON.parse(bytes.toString());
    files.push({relative,bytes,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
  }
  if(!files.length)return false;
  fs.mkdirSync(destination,{recursive:false});
  for(const f of files)fs.writeFileSync(path.join(destination,path.basename(f.relative)),f.bytes,{flag:'wx'});
  fs.writeFileSync(path.join(destination,'checkpoint.json'),JSON.stringify({schema:1,...identity,stage,completeArtifact:false,acceptance:false,includesImages:false,files:files.map(({relative,bytes,sha256})=>({path:relative,bytes:bytes.length,sha256}))},null,2)+'\n',{flag:'wx'});
  return true;
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const stage=process.argv[2];const ready=checkpoint('.qa-evidence',`.qa-checkpoint-${stage}`,stage,{sourceSha:process.env.SOURCE_SHA,runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT});
  fs.appendFileSync(process.env.GITHUB_OUTPUT,`ready=${ready}\n`);
}
