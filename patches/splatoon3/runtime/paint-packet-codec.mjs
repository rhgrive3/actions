// Lossless event encoding. Membership comes from the relay-backed session.
// A caller must negotiate this exact version with every current recipient;
// mixed/unknown peers keep the original rows. Existing sender/HLC admission
// must run on decoded rows, using the transport sender, never payload identity.
export const PAINT_PACKET_CODEC_VERSION = 'inkwave-paint-dictionary-v1';
export const PAINT_PACKET_LIMITS = Object.freeze({ rows:512, dictionary:64, nodes:65536, depth:8, string:1024 });
const COMMON=[5,6,8,9,10,11,12,13];
function utf8Bytes(s){let size=s.length;for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);if(c<128)continue;if(c<2048)size++;else if(c>=0xd800&&c<=0xdbff&&i+1<s.length&&s.charCodeAt(i+1)>=0xdc00&&s.charCodeAt(i+1)<=0xdfff){size+=2;i++;}else size+=2;}return size;}
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
const PAINT_KINDS=new Set([0,'shot','line','blast','bomb','trail','drop','roll','rollFloor','speck']);
function common(c){return Array.isArray(c)&&c.length===11&&c.slice(0,8).every((x,i)=>i===2?PAINT_KINDS.has(x):typeof x==='number'&&Number.isFinite(x))&&c[8]==='inkwave-paint-order-v1'&&typeof c[9]==='string'&&(c[10]===0||c[10]===1);}
function paint(row){return Array.isArray(row)&&row.length===17&&row[1]==='s'&&Array.isArray(row[14])&&row[14].length===4&&row[14][0]==='inkwave-paint-order-v1'&&typeof row[14][1]==='string';}
/** Returns null when the unchanged legacy encoding is preferable or required. */
function encodePaintPayload(rows){
 if(!Array.isArray(rows)||rows.length>512)return null;
 // Native rows carry local _netTick/_netSeq properties that JSON omits.
 // Strip only array properties; the indexed wire values remain exact.
 rows=rows.map(r=>Array.isArray(r)?r.slice():r);
 if(!bounded(rows))return null;
 const dict=[],index=new Map(),out=[];
 for(const row of rows){
  if(!paint(row)){out.push([0,row]);continue;}
  const c=[...COMMON.map(i=>row[i]),row[14][0],row[14][1],row[14][3]],key=JSON.stringify(c);
  if(!common(c))return null;
  let id=index.get(key);if(id===undefined){if(dict.length>=64)return null;id=dict.length;index.set(key,id);dict.push(c);}
  // No delta arithmetic or quantization. Each original value is preserved.
  out.push([1,id,row[0],row[2],row[3],row[4],row[7],row[14][2],row[15],row[16]]);
 }
 if(!dict.length)return null;
 const result=[PAINT_PACKET_CODEC_VERSION,dict,out];
 // Wrappers add depth and nodes. Never emit a packet our decoder rejects.
 if(!bounded(result))return null;
 return {payload:result,rows};
}
export function encodePaintEvents(rows){
 const encoded=encodePaintPayload(rows);if(!encoded)return null;
 const {payload,rows:wireRows}=encoded;
 return utf8Bytes(JSON.stringify(payload))<utf8Bytes(JSON.stringify(wireRows))?payload:null;
}
/** Fail closed before expanding. Null means reject this compressed event set. */
export function decodePaintEvents(payload){
 if(!Array.isArray(payload)||payload.length!==3||payload[0]!==PAINT_PACKET_CODEC_VERSION||!bounded(payload))return null;
 const [,dict,rows]=payload;
 if(!Array.isArray(dict)||dict.length>64||!Array.isArray(rows)||rows.length>512)return null;
 if(dict.some(c=>!common(c)))return null;
 // Validate every reference before allocating expanded rows; preserve order.
 for(const r of rows){if(!Array.isArray(r))return null;if(r[0]===0){if(r.length!==2||!Array.isArray(r[1]))return null;}
  else if(r[0]!==1||r.length!==10||!Number.isInteger(r[1])||r[1]<0||r[1]>=dict.length)return null;
 }
 return rows.map(r=>{if(r[0]===0)return r[1];const c=dict[r[1]];return[r[2],'s',r[3],r[4],r[5],c[0],c[1],r[6],c[2],c[3],c[4],c[5],c[6],c[7],[c[8],c[9],r[7],c[10]],r[8],r[9]];});
}

// Membership comes from the relay. The relay silently drops failed sends, so
// a successful WebSocket.send is never treated as a capability acknowledgement.
const CONTROL='paint-codec';
const validNonce=n=>typeof n==='string'&&/^[0-9a-f]{32}$/.test(n);
function randomNonce(){try{const a=new Uint32Array(4);globalThis.crypto.getRandomValues(a);return [...a].map(x=>x.toString(16).padStart(8,'0')).join('');}catch{return null;}}
export class PaintPacketNegotiation {
 constructor(nonceFactory=randomNonce){this.nonceFactory=nonceFactory;this.matchId=null;this.myId=null;this.members=new Map();this.nonce=null;}
 reset(){this.members.clear();const n=this.nonceFactory();this.nonce=validNonce(n)?n:null;}
 sync(matchId,myId,memberIds){
  if(typeof matchId!=='string'||!matchId||matchId.length>128||typeof myId!=='string'||!Array.isArray(memberIds)||memberIds.length>16||memberIds.some(id=>typeof id!=='string'||!id||id.length>128)){
   this.clear();return false;
  }
  const ids=new Set(memberIds.filter(id=>id!==myId));
  if(this.matchId!==matchId||this.myId!==myId)this.reset();
  // Third-party membership changes must not erase an existing sender's
  // receive generation while its correctly sent paint is still in flight.
  for(const id of this.members.keys())if(!ids.has(id))this.members.delete(id);
  this.matchId=matchId;this.myId=myId;
  for(const id of ids)if(!this.members.has(id))this.members.set(id,{sent:false,challenge:this.nonceFactory(),peerNonce:null,ackNonce:null,received:false,ackSentFor:null,blocked:false});
  return !!this.nonce;
 }
 announce(send){
  if(!this.nonce||!this.matchId||typeof send!=='function')return;
  for(const [id,p]of this.members)if(!p.sent&&!p.blocked&&validNonce(p.challenge)){
   // One bounded attempt per membership epoch. Loss keeps this epoch legacy.
   p.sent=true;send(id,{k:CONTROL,v:PAINT_PACKET_CODEC_VERSION,m:this.matchId,h:this.nonce,q:p.challenge});
  }
 }
 control(from,d,send){
  if(d?.k!==CONTROL)return false;
  const p=this.members.get(from);
  if(!p||!this.nonce||d.m!==this.matchId)return true;
  if(d.v!==PAINT_PACKET_CODEC_VERSION){if(!p.blocked)p.challenge=this.nonceFactory();p.blocked=true;p.sent=false;p.ackNonce=null;p.received=false;p.peerNonce=null;p.ackSentFor=null;return true;}
  if(validNonce(d.h)&&validNonce(d.q)&&d.a===undefined){
   const changed=p.peerNonce!==null&&p.peerNonce!==d.h,unblocked=p.blocked;
   if(changed){p.challenge=this.nonceFactory();p.sent=false;p.ackNonce=null;}
   if(p.peerNonce!==d.h){p.peerNonce=d.h;p.received=false;}
   p.blocked=false;if(changed||unblocked)this.announce(send);
   // Duplicate hello is harmless, but does not produce an unbounded ack loop.
   if(p.ackSentFor!==d.q&&send?.(from,{k:CONTROL,v:PAINT_PACKET_CODEC_VERSION,m:this.matchId,a:d.q,n:this.nonce})===true){p.ackSentFor=d.q;p.received=true;}
  }else if(!p.blocked&&p.sent&&d.a===p.challenge&&validNonce(d.n)&&d.h===undefined&&(p.peerNonce===null||p.peerNonce===d.n)){
   // A matching unpredictable challenge proves the peer received our hello.
   // Its ack also carries its receive generation, even if its hello was lost.
   p.peerNonce=d.n;p.ackNonce=d.n;p.received=true;
  }
  return true;
 }
 canEncode(){return !!this.nonce&&this.members.size>0&&[...this.members.values()].every(p=>p.received&&p.peerNonce===p.ackNonce);}
 packTick(tick){
  if(!this.canEncode()||tick?.k!=='t')return tick;
  // For ordinary native ticks, replacing e with pe and adding pn can only
  // increase envelope overhead. The final exact UTF-8 whole-packet comparison
  // therefore subsumes the standalone events-only profitability comparison.
  // Reserved fields retain the original conservative standalone contract.
  const specialJson=typeof tick.toJSON==='function'||typeof tick.e?.toJSON==='function';
  const conservative=tick.e?.length<2||Object.hasOwn(tick,'pe')||Object.hasOwn(tick,'pn')||specialJson;
  const payload=conservative?encodePaintEvents(tick.e):encodePaintPayload(tick.e)?.payload;if(!payload)return tick;
  const {e,...rest}=tick,out={...rest,pe:payload,pn:this.nonce};
  // Include the generation binding and every sidecar in the actual decision.
  return utf8Bytes(JSON.stringify(out))<utf8Bytes(JSON.stringify(tick))?out:tick;
 }
 acceptTick(from,tick){
  if(tick?.k!=='t'||!Object.hasOwn(tick,'pe'))return tick;
  const p=this.members.get(from);
  if(!p?.received||!p.peerNonce||tick.pn!==p.peerNonce||Object.hasOwn(tick,'e'))return null;
  const rows=decodePaintEvents(tick.pe);if(!rows)return null;
  const {pe,pn,...out}=tick;out.e=rows;return out;
 }
 forget(id){this.members.delete(id);}
 clear(){this.matchId=null;this.myId=null;this.nonce=null;this.members.clear();}
}
const negotiations=new WeakMap();
function sessionNegotiation(nm){
 let n=negotiations.get(nm);if(!n){n=new PaintPacketNegotiation();negotiations.set(nm,n);}
 let ids=null;try{ids=[...Map.prototype.keys.call(nm?.s?._members)];}catch{}
 n.sync(nm?.cfg?.id,nm?.s?.myId,ids);return n;
}
function sender(nm){return (id,d)=>nm?.s?.tr?.sendTo?.(id,d)===true;}
export function packPaintTick(nm,tick){const n=sessionNegotiation(nm);n.announce(sender(nm));return n.packTick(tick);}
export function acceptPaintTick(nm,from,tick){
 if(tick?.k!=='t'&&tick?.k!==CONTROL)return tick;
 const n=sessionNegotiation(nm),send=sender(nm);n.announce(send);
 if(n.control(from,tick,send))return null;
 return n.acceptTick(from,tick);
}
export function forgetPaintPeer(nm,id){negotiations.get(nm)?.forget(id);}
