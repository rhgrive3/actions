// Exact minimum of the existing immutable model sample, with conservative
// block bounds. IEEE addition/multiplication are monotone for finite values;
// non-finite bounds fall through to the original per-point expression.
const BLOCK_POINTS=32;
export function buildPointBlocks(points){
  const bounds=new Float64Array(Math.ceil(points.length/(BLOCK_POINTS*3))*6);
  for(let b=0,start=0;start<points.length;b+=6,start+=BLOCK_POINTS*3){
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    for(let i=start,end=Math.min(points.length,start+BLOCK_POINTS*3);i<end;i+=3){
      minX=Math.min(minX,points[i]);maxX=Math.max(maxX,points[i]);
      minY=Math.min(minY,points[i+1]);maxY=Math.max(maxY,points[i+1]);
      minZ=Math.min(minZ,points[i+2]);maxZ=Math.max(maxZ,points[i+2]);
    }
    bounds[b]=minX;bounds[b+1]=maxX;bounds[b+2]=minY;bounds[b+3]=maxY;bounds[b+4]=minZ;bounds[b+5]=maxZ;
  }
  return {points,bounds};
}
export function pointBlockMinimum(cache,ax,ay,az,stats=null){
  const {points,bounds}=cache;let minimum=Infinity;
  for(let b=0,start=0;start<points.length;b+=6,start+=BLOCK_POINTS*3){
    const lower=ax*bounds[b+(ax<0?1:0)]+ay*bounds[b+2+(ay<0?1:0)]+az*bounds[b+4+(az<0?1:0)];
    if(Number.isFinite(lower)&&lower>=minimum){if(stats)stats.skipped++;continue;}
    const end=Math.min(points.length,start+BLOCK_POINTS*3);if(stats)stats.points+=(end-start)/3;
    for(let i=start;i<end;i+=3){const y=ax*points[i]+ay*points[i+1]+az*points[i+2];if(y<minimum)minimum=y;}
  }
  return minimum;
}
