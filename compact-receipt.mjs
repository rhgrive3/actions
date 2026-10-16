import crypto from 'node:crypto';
const fields=new Set(['pose','partMatrices','hands','camera','projectedBounds','hold','sun','hemi']);
export function safeJSON(value){return JSON.stringify(value,(key,v)=>fields.has(key)&&v&&typeof v==='object'?{sha256:crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex'),representation:'dynamic browser measurement digest'}:v,2);}
