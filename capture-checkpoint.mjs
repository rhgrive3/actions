import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';
const PHASES=new Set(['work','explosher','noct-milk','sorella','sorella-failure','A','A-failure','B','C']);
export function writeCaptureCheckpoint(out,sourceHead,phase,data){
 assert.match(sourceHead,/^[a-f0-9]{40}$/);assert.ok(PHASES.has(phase),'Known checkpoint phase');assert.ok(data&&typeof data==='object');
 const dir=path.join(out,'partial');fs.mkdirSync(dir,{recursive:true});const frames=[];
 for(const [index,frame]of (data.frames||[]).entries()){assert.ok(index<80);const {png,...row}=frame;if(png){const bytes=Buffer.from(png,'base64');assert.ok(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'PNG checkpoint bytes');const file=phase+'-'+index+'.png';fs.writeFileSync(path.join(dir,file),bytes);frames.push({...row,file,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});}else frames.push(row);}
 const {frames:ignored,...rest}=data;fs.writeFileSync(path.join(dir,phase+'.json'),JSON.stringify({...rest,frames,sourceHead,phase,partialEvidence:true,acceptanceComplete:false},null,2));return {saved:true,frames:frames.length};
}
