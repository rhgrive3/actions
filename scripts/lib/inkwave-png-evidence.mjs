import {inflateSync} from 'node:zlib';

const signature=Buffer.from([137,80,78,71,13,10,26,10]);
function crc32(bytes){let c=0xffffffff;for(const byte of bytes){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
// Exact PNG sample decode, with no canvas, color conversion or alpha roundtrip.
// Canvas PNGs are 8-bit RGB/RGBA, non-interlaced. Reject other formats explicitly.
export function decodeCapturePng(bytes){
 if(!bytes.subarray(0,8).equals(signature))throw Error('Invalid PNG signature');
 let offset=8,width,height,bpp,ended=false,seenIDAT=false;const idat=[];
 while(offset<bytes.length){
  if(offset+12>bytes.length)throw Error('Truncated PNG chunk');
  const length=bytes.readUInt32BE(offset),end=offset+12+length;
  if(end>bytes.length)throw Error('Truncated PNG payload');
  const type=bytes.toString('ascii',offset+4,offset+8),data=bytes.subarray(offset+8,end-4);
  if(crc32(bytes.subarray(offset+4,end-4))!==bytes.readUInt32BE(end-4))throw Error('PNG CRC mismatch: '+type);
  if(type==='IHDR'){
   if(offset!==8||width!==undefined||length!==13)throw Error('Invalid PNG IHDR');
   width=data.readUInt32BE(0);height=data.readUInt32BE(4);bpp=data[9]===6?4:data[9]===2?3:0;
   if(!width||!height||width*height>32*1024*1024||data[8]!==8||!bpp||data[10]||data[11]||data[12])throw Error('Unsupported capture PNG format');
  }else if(type==='IDAT'){if(!width)throw Error('PNG IDAT before IHDR');seenIDAT=true;idat.push(data);}
  else if(type==='IEND'){if(length||!seenIDAT||end!==bytes.length)throw Error('Invalid PNG end');ended=true;break;}
  else if(type==='tRNS'||type[0]===type[0].toUpperCase())throw Error('Unsupported PNG chunk: '+type);
  offset=end;
 }
 if(!ended)throw Error('Missing PNG IEND');
 const stride=width*bpp,expected=height*(stride+1),scanlines=inflateSync(Buffer.concat(idat),{maxOutputLength:expected});
 if(scanlines.length!==expected)throw Error('PNG decoded byte length differs');
 const decoded=Buffer.alloc(width*height*bpp),rgba=Buffer.alloc(width*height*4);
 const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
 for(let y=0;y<height;y++){
  const filter=scanlines[y*(stride+1)];if(filter>4)throw Error('Unsupported PNG filter');
  for(let x=0;x<stride;x++){
   const left=x>=bpp?decoded[y*stride+x-bpp]:0,up=y?decoded[(y-1)*stride+x]:0,upperLeft=y&&x>=bpp?decoded[(y-1)*stride+x-bpp]:0;
   const predict=[0,left,up,Math.floor((left+up)/2),paeth(left,up,upperLeft)][filter];
   decoded[y*stride+x]=(scanlines[y*(stride+1)+1+x]+predict)&255;
  }
 }
 for(let i=0;i<width*height;i++){for(let k=0;k<3;k++)rgba[i*4+k]=decoded[i*bpp+k];rgba[i*4+3]=bpp===4?decoded[i*bpp+3]:255;}
 return {width,height,rgba};
}

export function verifySavedPngCapture(record){
 const meta=record.capture||record,state=meta.state,attrs=state?.contextAttributes;
 if(!attrs||typeof attrs.alpha!=='boolean'||typeof attrs.premultipliedAlpha!=='boolean')throw Error('Missing exact PNG context attributes');
 if(state.drawingBufferColorSpace!=null&&state.drawingBufferColorSpace!=='srgb')throw Error('Unsupported exact PNG color space');
 if(typeof record.png!=='string'||!record.png.startsWith('data:image/png;base64,')||typeof record.rawRGBA!=='string')throw Error('Missing exact PNG or raw RGBA evidence');
 const png=decodeCapturePng(Buffer.from(record.png.slice('data:image/png;base64,'.length),'base64')),raw=Buffer.from(record.rawRGBA,'base64');
 const w=meta.width,h=meta.height;
 if(png.width!==w||png.height!==h||raw.length!==w*h*4||meta.orientation!=='bottom-up'||meta.format!=='RGBA8')throw Error('Exact PNG/raw dimensions or layout differ');
 const demultiply=attrs.alpha&&attrs.premultipliedAlpha,expectedMax=[0,0,0,0],rawMax=[0,0,0,0],samples=[];
 let alphaMismatchPixels=0,opaqueRGBMismatchPixels=0,rgbAboveAlphaPixels=0,zeroAlphaPixels=0,zeroAlphaNonzeroRGBPixels=0;
 const expectedTop=Buffer.alloc(raw.length);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const src=(y*w+x)*4,dst=((h-1-y)*w+x)*4,a=raw[src+3];let invalid=false;
  if(!attrs.alpha&&a!==255)throw Error('Opaque context raw alpha is nonopaque');
  if(raw[src]>a||raw[src+1]>a||raw[src+2]>a)rgbAboveAlphaPixels++;
  if(a===0){zeroAlphaPixels++;if(raw[src]||raw[src+1]||raw[src+2])zeroAlphaNonzeroRGBPixels++;}
  if(a!==png.rgba[dst+3]){alphaMismatchPixels++;invalid=true;}
  if(a===255&&[0,1,2].some(k=>raw[src+k]!==png.rgba[dst+k])){opaqueRGBMismatchPixels++;invalid=true;}
  for(let k=0;k<4;k++){
   const expected=k===3||!demultiply?raw[src+k]:a===0?0:Math.min(255,Math.round(raw[src+k]*255/a));expectedTop[dst+k]=expected;
   const delta=Math.abs(expected-png.rgba[dst+k]);expectedMax[k]=Math.max(expectedMax[k],delta);rawMax[k]=Math.max(rawMax[k],Math.abs(raw[src+k]-png.rgba[dst+k]));if(delta>1)invalid=true;
  }
  if(invalid&&samples.length<16)samples.push({x,yBottomUp:y,raw:Array.from(raw.subarray(src,src+4)),png:Array.from(png.rgba.subarray(dst,dst+4)),expected:Array.from(expectedTop.subarray(dst,dst+4))});
 }
 const roiMeanDifferences={};for(const [name,[x0,y0,x1,y1]] of Object.entries({floor:[.25,0,.75,.35],walls:[.12,.35,.88,.65],sky:[.25,.75,.75,.95]})){
  let sum=0,n=0;for(let y=Math.floor(y0*h);y<y1*h;y++)for(let x=Math.floor(x0*w);x<x1*w;x++){const i=((h-1-y)*w+x)*4;sum+=.2126*(expectedTop[i]-png.rgba[i])+.7152*(expectedTop[i+1]-png.rgba[i+1])+.0722*(expectedTop[i+2]-png.rgba[i+2]);n++;}roiMeanDifferences[name]=Math.abs(sum/n);
 }
 const result={method:'exact PNG sample decode (zlib + PNG filters), no 2D canvas roundtrip',representation:demultiply?'premultiplied-RGBA8-to-straight-PNG':'straight-RGBA8-to-PNG',expectedChannelMax:expectedMax,rawChannelMax:rawMax,alphaMismatchPixels,opaqueRGBMismatchPixels,loss:{rgbAboveAlphaPixels,zeroAlphaPixels,zeroAlphaNonzeroRGBPixels},roiMeanDifferences,tolerance:1,alphaTolerance:0,opaqueRGBTolerance:0};
 if(Math.max(...expectedMax)>1||alphaMismatchPixels||opaqueRGBMismatchPixels||Object.values(roiMeanDifferences).some(v=>!Number.isFinite(v)||v>1)){
  const error=Error('Exact saved PNG differs from expected framebuffer serialization: '+JSON.stringify({...result,samples}));error.validation=result;throw error;
 }
 return result;
}
