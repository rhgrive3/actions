import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {PNG} from 'pngjs';
const root=path.resolve(process.argv[2]);const results=[];
function read(p){return PNG.sync.read(fs.readFileSync(p));}
function compare(a,b){assert.equal(a.width,b.width);assert.equal(a.height,b.height);let changed=0,maxRGBA=0,sse=0,union=0,intersection=0;const edges=[[],[]],w=a.width,h=a.height;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,hit=[a.data[i+3]>=128,b.data[i+3]>=128];if(hit[0]||hit[1])union++;if(hit[0]&&hit[1])intersection++;let any=false;for(let c=0;c<4;c++){const d=Math.abs(a.data[i+c]-b.data[i+c]);maxRGBA=Math.max(maxRGBA,d);sse+=d*d;any ||=d!==0;}if(any)changed++;
  for(let k=0;k<2;k++)if(hit[k]){const im=k?b:a;if(x===0||y===0||x===w-1||y===h-1||[-1,1,-w,w].some(off=>im.data[i+off*4+3]<128))edges[k].push([x,y]);}
 }
 let maxSilhouettePixels=0;if(changed){for(let k=0;k<2;k++){const set=new Set(edges[1-k].map(([x,y])=>x+','+y));for(const[x,y]of edges[k]){if(set.has(x+','+y))continue;let best=Infinity;for(const[u,v]of edges[1-k])best=Math.min(best,(u-x)**2+(v-y)**2);maxSilhouettePixels=Math.max(maxSilhouettePixels,Math.sqrt(best));}}}
 return {changedPixels:changed,maxRGBA,rmse:Math.sqrt(sse/(w*h*4)),silhouetteIoU:union?intersection/union:1,maxSilhouettePixels};
}
for(const f of fs.readdirSync(path.join(root,'beforeA')).filter(f=>f.endsWith('.png'))){const aa=compare(read(path.join(root,'beforeA',f)),read(path.join(root,'beforeB',f))),bb=compare(read(path.join(root,'afterA',f)),read(path.join(root,'afterB',f))),ab=compare(read(path.join(root,'beforeA',f)),read(path.join(root,'afterA',f)));results.push({image:f,beforeRepeat:aa,afterRepeat:bb,candidate:ab});}
fs.writeFileSync(path.join(root,'comparison.json'),JSON.stringify({scope:'Same camera, real native day IBL. A/A repeated browser boots isolate noise. Distance8/16 are 40deg vertical FOV at 640px from weapon centre.',results},null,2));console.log(JSON.stringify(results));
for(const r of results){assert.equal(r.beforeRepeat.changedPixels,0,'baseline determinism '+r.image);assert.equal(r.afterRepeat.changedPixels,0,'candidate determinism '+r.image);if(!r.image.includes('.far'))assert.equal(r.candidate.changedPixels,0,'near RGBA preserved '+r.image);}
