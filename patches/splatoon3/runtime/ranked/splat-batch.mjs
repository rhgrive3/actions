// A batch keeps canonical stamp calls, seed/order/network recording and GPU
// blending. Only the broadphase for an explicitly restricted unique face is
// shared. Unrestricted/custom query contracts retain the ordinary query path.
export function createSplatBatch(paint,queryBlocks,queryBlocksBand){
 const level=paint.level;
 if(!level||level.queryBlocks!==queryBlocks||level.queryBlocksBand&&level.queryBlocksBand!==queryBlocksBand
  ||!Array.isArray(level.blocks)||!Array.isArray(level.faces)||!Array.isArray(level.hash)
  ||typeof level._hxi!=='function'||typeof level._hzi!=='function')return null;
 return {level,blocks:level.blocks,faces:level.faces,hash:level.hash,length:level.blocks.length,faceLength:level.faces.length,hw:level.hw,hxi:level._hxi,hzi:level._hzi,
  queryBlocks:level.queryBlocks,queryBlocksBand:level.queryBlocksBand,owners:null,queries:new Map()};
}
export function splatBatchBlocks(paint,faceId,center,reach){
 const batch=paint._orderedSplatBatch,level=paint.level;
 if(!batch||batch.level!==level||batch.blocks!==level.blocks||batch.faces!==level.faces||batch.hash!==level.hash
  ||batch.length!==level.blocks.length||batch.faceLength!==level.faces.length||batch.hw!==level.hw||batch.hxi!==level._hxi||batch.hzi!==level._hzi||batch.queryBlocks!==level.queryBlocks||batch.queryBlocksBand!==level.queryBlocksBand
  ||!Number.isInteger(faceId)||faceId<0||faceId>=level.faces.length||!Number.isFinite(reach))return null;
 if(!batch.owners){
  const owners=new Int32Array(level.faces.length).fill(-1);
  for(let bid=0;bid<level.blocks.length;bid++){
   const block=level.blocks[bid];
   if(block.id!==bid||!Array.isArray(block.faces))return null;
   for(const fid of block.faces)if(Number.isInteger(fid)&&fid>=0&&fid<owners.length)owners[fid]=owners[fid]===-1?bid:-2;
  }
  batch.owners=owners;
 }
 const bid=batch.owners[faceId];
 // A duplicated face reference can paint more than once; keep that exact
 // unusual contract through the source broadphase rather than deduplicating.
 if(bid<0)return null;
 const block=level.blocks[bid];
 if(level.faces[faceId]?.block!==bid||!block.faces.includes(faceId))return null;
 const x0=level._hxi(center.x-reach),x1=level._hxi(center.x+reach),z0=level._hzi(center.z-reach),z1=level._hzi(center.z+reach);
 const key=`${bid}:${x0}:${x1}:${z0}:${z1}`;
 let ids=batch.queries.get(key);
 if(ids)return ids;
 let present=false;
 for(let z=z0;z<=z1&&!present;z++)for(let x=x0;x<=x1;x++)if(level.hash[z*level.hw+x]?.includes(bid)){present=true;break;}
 ids=present?[bid]:[];batch.queries.set(key,ids);return ids;
}
