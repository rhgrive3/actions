// Repack only the compressed bytes inside PNG IDAT chunks. Image data, metadata,
// chunk order, dimensions and decoded pixels remain unchanged (lossless).
import zlib from 'node:zlib';

const SIGNATURE = Buffer.from([137,80,78,71,13,10,26,10]);
const TABLE = new Uint32Array(256);
for (let i=0;i<256;i++) {
  let x=i;
  for (let b=0;b<8;b++) x=x&1 ? (x>>>1)^0xedb88320 : x>>>1;
  TABLE[i]=x>>>0;
}
function crc32(buffer) {
  let crc=0xffffffff;
  for(const byte of buffer) crc=TABLE[(crc^byte)&255]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
}
function idatChunk(bytes) {
  const chunk=Buffer.allocUnsafe(bytes.length+12);
  chunk.writeUInt32BE(bytes.length,0);
  chunk.write('IDAT',4,4,'ascii');
  bytes.copy(chunk,8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4,bytes.length+8)),bytes.length+8);
  return chunk;
}
export function optimizePngLossless(png) {
  if (!Buffer.isBuffer(png) || png.length<33 || !png.subarray(0,8).equals(SIGNATURE))
    throw new Error('lossless PNG: invalid signature');
  let offset=8, finished=false, closedIdat=false, seenIdat=false;
  const chunks=[], sources=[];
  while(offset<png.length){
    if(offset+12>png.length)throw new Error('lossless PNG: truncated chunk');
    const length=png.readUInt32BE(offset);
    if(length>png.length-offset-12)throw new Error('lossless PNG: invalid chunk length');
    const type=png.toString('ascii',offset+4,offset+8);
    const chunk=png.subarray(offset,offset+length+12);
    if(type==='IDAT'){
      if(closedIdat)throw new Error('lossless PNG: discontiguous IDAT');
      sources.push(png.subarray(offset+8,offset+8+length));
      seenIdat=true;
    }else if(seenIdat)closedIdat=true;
    chunks.push({type,bytes:chunk});
    offset+=length+12;
    if(type==='IEND'){finished=true;break;}
  }
  if(!finished || offset!==png.length || !sources.length)
    throw new Error('lossless PNG: missing IEND or IDAT');
  const old=Buffer.concat(sources);
  const decoded=zlib.inflateSync(old);
  let best=old;
  for(const strategy of [zlib.constants.Z_DEFAULT_STRATEGY,zlib.constants.Z_FILTERED,zlib.constants.Z_RLE]){
    const candidate=zlib.deflateSync(decoded,{level:9,strategy});
    if(candidate.length<best.length)best=candidate;
  }
  if(best===old)return {bytes:png,savedBytes:0};
  if(!zlib.inflateSync(best).equals(decoded))throw new Error('lossless PNG: decoded bytes changed');
  const result=[SIGNATURE];
  let inserted=false;
  for(const chunk of chunks){
    if(chunk.type!=='IDAT')result.push(chunk.bytes);
    else if(!inserted){result.push(idatChunk(best));inserted=true;}
  }
  const bytes=Buffer.concat(result);
  return {bytes,savedBytes:png.length-bytes.length};
}
