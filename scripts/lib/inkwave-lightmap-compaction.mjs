import { deflateSync, inflateSync } from 'node:zlib';

const signature = Buffer.from([137,80,78,71,13,10,26,10]);
function crc32(bytes) {
  let crc=0xffffffff;
  for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
function chunk(type,data) {
  const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length,0);out.write(type,4);data.copy(out,8);
  out.writeUInt32BE(crc32(out.subarray(4,-4)),out.length-4);return out;
}

// Refilter only the known non-interlaced 8-bit grayscale lightmaps. Preserve
// dimensions, every decoded pixel, and all non-IDAT chunks. No resampling.
export function compactLightmapPng(input) {
  if(!input.subarray(0,8).equals(signature))return input;
  const chunks=[];let width,height;
  for(let pos=8;pos<input.length;){
    const n=input.readUInt32BE(pos),end=pos+n+12;
    if(end>input.length)throw Error('Truncated lightmap PNG');
    const type=input.toString('ascii',pos+4,pos+8),data=input.subarray(pos+8,pos+8+n);
    if(type==='IHDR'){
      if(n!==13||data[8]!==8||data[9]!==0||data[10]||data[11]||data[12])return input;
      width=data.readUInt32BE(0);height=data.readUInt32BE(4);
    }
    chunks.push({type,data,bytes:input.subarray(pos,end)});pos=end;
  }
  if(!width||!height)return input;
  const raw=inflateSync(Buffer.concat(chunks.filter(c=>c.type==='IDAT').map(c=>c.data)));
  if(raw.length!==(width+1)*height)throw Error('Lightmap scanline size mismatch');
  for(let y=0;y<height;y++)if(raw[y*(width+1)]!==0)return input;
  const candidates=[deflateSync(raw,{level:9})];
  for(const filter of [1,2,-1]){
    const filtered=Buffer.alloc(raw.length);
    for(let y=0;y<height;y++){
      const at=y*(width+1);let chosen=filter;
      if(filter===-1){
        let sub=0,up=0;
        for(let x=0;x<width;x++){
          const value=raw[at+1+x];
          const a=(value-(x?raw[at+x]:0))&255,b=(value-(y?raw[at-width+x]:0))&255;
          sub+=Math.min(a,256-a);up+=Math.min(b,256-b);
        }
        chosen=sub<up?1:2;
      }
      filtered[at]=chosen;
      for(let x=0;x<width;x++){
        const predictor=chosen===1?(x?raw[at+x]:0):(y?raw[at-width+x]:0);
        filtered[at+1+x]=(raw[at+1+x]-predictor)&255;
      }
    }
    candidates.push(deflateSync(filtered,{level:9}));
  }
  const packed=candidates.reduce((a,b)=>a.length<=b.length?a:b);
  let inserted=false;
  const output=Buffer.concat([signature,...chunks.flatMap(c=>{
    if(c.type!=='IDAT')return[c.bytes];
    if(inserted)return[];inserted=true;return[chunk('IDAT',packed)];
  })]);
  return output.length<input.length?output:input;
}
