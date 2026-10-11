// Lossless event encoding. Membership comes from the relay-backed session.
// A caller must negotiate this exact version with every current recipient;
// mixed/unknown peers keep the original rows. Existing sender/HLC admission
// must run on decoded rows, using the transport sender, never payload identity.
export const PAINT_PACKET_CODEC_VERSION = 'inkwave-paint-dictionary-v1';
export const PAINT_PACKET_LIMITS = Object.freeze({ rows:512, dictionary:64, nodes:65536, depth:8, string:1024 });
const COMMON=[5,6,8,9,10,11,12,13];
function bounded(value){
 let left=PAINT_PACKET_LIMITS.nodes;
 function visit(v,depth){
  if(--left<0||depth>PAINT_PACKET_LIMITS.depth)return false;
  if(v===null||typeof v==='boolean')return true;
  if(typeof v==='number')return Number.isFinite(v)&&Math.abs(v)<=1e12;
  if(typeof v==='string')return v.length<=PAINT_PACKET_LIMITS.string;
  if(Array.isArray(v))return v.length<=512&&Object.keys(v).length===v.length&&v.every(x=>visit(x,depth+1));
  if(!v||typeof v!=='object'||Object.getPrototypeOf(v)!==Object.prototype)return false;
  const keys=Object.keys(v);return keys.length<=64&&keys.every(k=>k!=='__proto__'&&k!=='constructor'&&k!=='prototype'&&k.length<=128&&visit(v[k],depth+1));
 }
 return visit(value,0);
}
function paint(row){return Array.isArray(row)&&row.length===17&&row[1]==='s'&&Array.isArray(row[14])&&row[14].length===4&&row[14][0]==='inkwave-paint-order-v1'&&typeof row[14][1]==='string';}
/** Returns null when the unchanged legacy encoding is preferable or required. */
export function encodePaintEvents(rows){
 if(!Array.isArray(rows)||rows.length>512)return null;
 // Native rows carry local _netTick/_netSeq properties that JSON omits.
 // Strip only array properties; the indexed wire values remain exact.
 rows=rows.map(r=>Array.isArray(r)?r.slice():r);
 if(!bounded(rows))return null;
 const dict=[],index=new Map(),out=[];
 for(const row of rows){
  if(!paint(row)){out.push([0,row]);continue;}
  const c=[...COMMON.map(i=>row[i]),row[14][0],row[14][1],row[14][3]],key=JSON.stringify(c);
  let id=index.get(key);if(id===undefined){if(dict.length>=64)return null;id=dict.length;index.set(key,id);dict.push(c);}
  // No delta arithmetic or quantization. Each original value is preserved.
  out.push([1,id,row[0],row[2],row[3],row[4],row[7],row[14][2],row[15],row[16]]);
 }
 if(!dict.length)return null;
 const result=[PAINT_PACKET_CODEC_VERSION,dict,out];
 return JSON.stringify(result).length<JSON.stringify(rows).length?result:null;
}
/** Fail closed before expanding. Null means reject this compressed event set. */
export function decodePaintEvents(payload){
 if(!Array.isArray(payload)||payload.length!==3||payload[0]!==PAINT_PACKET_CODEC_VERSION||!bounded(payload))return null;
 const [,dict,rows]=payload;
 if(!Array.isArray(dict)||dict.length>64||!Array.isArray(rows)||rows.length>512)return null;
 if(dict.some(c=>!Array.isArray(c)||c.length!==11||c[8]!=='inkwave-paint-order-v1'||typeof c[9]!=='string'))return null;
 // Validate every reference before allocating expanded rows; preserve order.
 for(const r of rows){if(!Array.isArray(r))return null;if(r[0]===0){if(r.length!==2||!Array.isArray(r[1]))return null;}
  else if(r[0]!==1||r.length!==10||!Number.isInteger(r[1])||r[1]<0||r[1]>=dict.length)return null;
 }
 return rows.map(r=>{if(r[0]===0)return r[1];const c=dict[r[1]];return[r[2],'s',r[3],r[4],r[5],c[0],c[1],r[6],c[2],c[3],c[4],c[5],c[6],c[7],[c[8],c[9],r[7],c[10]],r[8],r[9]];});
}

// Membership must come from the relay-backed session, never the incoming tick.
// Capability negotiation changes the wire representation only, not authority.
export class PaintPacketNegotiation {
 constructor(){this.matchId=null;this.myId=null;this.members=new Map();}
 sync(matchId,myId,memberIds){
  if(typeof matchId!=='string'||!matchId||matchId.length>128||typeof myId!=='string'||!Array.isArray(memberIds)||memberIds.length>16||memberIds.some(id=>typeof id!=='string'||!id||id.length>128)){
   this.matchId=null;this.myId=null;this.members.clear();return false;
  }
  if(this.matchId!==matchId||this.myId!==myId)this.members.clear();
  this.matchId=matchId;this.myId=myId;const ids=new Set(memberIds.filter(id=>id!==myId));
  for(const id of this.members.keys())if(!ids.has(id))this.members.delete(id);
  for(const id of ids)if(!this.members.has(id))this.members.set(id,false);
  return true;
 }
 observe(from,header){
  if(!this.matchId||!this.members.has(from))return false;
  const supported=Array.isArray(header)&&header.length===2&&header[0]===PAINT_PACKET_CODEC_VERSION&&header[1]===this.matchId;
  this.members.set(from,supported);return supported;
 }
 canEncode(){return !!this.matchId&&this.members.size>0&&[...this.members.values()].every(Boolean);}
 packTick(tick){
  if(!this.matchId||tick?.k!=='t')return tick;
  const out={...tick,pc:[PAINT_PACKET_CODEC_VERSION,this.matchId]};
  if(this.canEncode()){const payload=encodePaintEvents(tick.e);if(payload){delete out.e;out.pe=payload;}}
  return out;
 }
 acceptTick(from,tick){
  if(tick?.k!=='t')return tick;
  const accepted=this.observe(from,tick.pc);
  if(!Object.hasOwn(tick,'pe'))return tick; // Legacy admission stays authoritative.
  if(!accepted||Object.hasOwn(tick,'e'))return null;
  const rows=decodePaintEvents(tick.pe);if(!rows)return null;
  const {pe,...out}=tick;out.e=rows;return out;
 }
 clear(){this.matchId=null;this.myId=null;this.members.clear();}
}

const negotiations = new WeakMap();
function sessionNegotiation(nm){
 let n=negotiations.get(nm);if(!n){n=new PaintPacketNegotiation();negotiations.set(nm,n);}
 const members=nm?.s?._members;
 let ids=null;try { ids=[...Map.prototype.keys.call(members)]; } catch {}
 n.sync(nm?.cfg?.id,nm?.s?.myId,ids);
 return n;
}
export function packPaintTick(nm,tick){return sessionNegotiation(nm).packTick(tick);}
export function acceptPaintTick(nm,from,tick){
 if(tick?.k!=='t')return tick;
 return sessionNegotiation(nm).acceptTick(from,tick);
}
