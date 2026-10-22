// QA-only, synchronous read-only observer. No imports, native writes, cache creation or GPU reads.
export function materialEntryObservation({g,G,r,a,rngState=null,rngCount=null},mode='state') {
 const finite=v=>v==null?null:Number.isFinite(v)?v:(()=>{throw Error('Non-finite entry observation');})();
 let valueReads=0;
 const bounded=(v,d=0)=>{
  if(++valueReads>65536)throw Error('Uniform value observation bound');
  if(d>3)return{bounded:true,reason:'depth'};
  if(v==null)return null;if(typeof v==='number')return Number.isFinite(v)?v:String(v);
  if(typeof v==='string'){if(v.length>1024)throw Error('Uniform string bound');return v;}if(typeof v==='boolean')return v;
  if(v.isTexture)return{type:'texture',uuid:v.uuid,version:v.version,sourceVersion:v.source?.version};
  if(v.elements?.length<=16)return Array.from(v.elements);
  if((v.isVector2||v.isVector3||v.isVector4||v.isQuaternion||v.isColor)&&v.toArray)return v.toArray();
  if(Array.isArray(v)||ArrayBuffer.isView(v))return{length:v.length,values:v.length<=32?Array.from(v,x=>bounded(x,d+1)):null};
  return{type:v.constructor?.name||typeof v,uninspected:true};
 };
 const vec=v=>{if(!v?.toArray)return null;const x=v.toArray();if(x.length>16||x.some(n=>!Number.isFinite(n)))throw Error('Invalid bounded vector/matrix');return x;},rig=g.rig,lob=g.showcase?.lob;
 const owner=o=>o?{uuid:o.uuid??null,name:o.name??null,local:o===a||o===a?.character?.root}:null;
 const camera=c=>c?{position:vec(c.position),quaternion:vec(c.quaternion),projection:vec(c.projectionMatrix)}:null;
 const springNames=['sx','sy','sz','boom','hgt','dipS','side','lensLift','kickS'];
 if((g.input?.keys?.size??0)>128||(g.input?.pressed?.size??0)>128)throw Error('Input key bound');
 const entry={rngState,rngCount,camera:camera(G.camera),rig:{mode:rig?.mode??null,previousMode:rig?._prevMode??null,target:owner(rig?.target),previousTarget:owner(rig?._prevTarget),
  time:finite(rig?.time),yaw:finite(rig?.yaw),pitch:finite(rig?.pitch),shakeSeed:finite(rig?.shakeSeed),trauma:finite(rig?.trauma),traumaIn:finite(rig?._traumaIn),
  pivot:vec(rig?.pivot),pivotY:finite(rig?.pivotY),curDist:finite(rig?.curDist),wantDist:finite(rig?.wantDist),
  springs:Object.fromEntries(springNames.map(k=>[k,rig?.[k]?{x:finite(rig[k].x),v:finite(rig[k].v)}:null])),
  blend:rig?.blend?{active:!!rig.blend.active,t:finite(rig.blend.t),dur:finite(rig.blend.dur),pos:vec(rig.blend.pos),quat:vec(rig.blend.quat),fov:finite(rig.blend.fov)}:null,
  orbit:rig?.orbitP?{center:vec(rig.orbitP.center),radius:finite(rig.orbitP.radius),height:finite(rig.orbitP.height),speed:finite(rig.orbitP.speed),phase:finite(rig.orbitP.phase)}:null},
  input:{locked:!!g.input?.locked,enabled:!!g.input?.enabled,mouse:g.input?.mouse?Object.fromEntries(['dx','dy','left','right','leftPressed','rightPressed'].map(k=>[k,g.input.mouse[k]])):null,keys:[...(g.input?.keys||[])].sort(),pressed:[...(g.input?.pressed||[])].sort(),controller:{yaw:finite(G.match?.controller?.yaw),pitch:finite(G.match?.controller?.pitch)}},
  jobs:{lobby:lob?{ready:!!lob.ready,failed:!!lob.failed,preload:!!lob.preload,hasSet:!!lob.set,quality:lob.quality??null}:null,
   portrait:{hasJob:!!g.showcase?._portraitJob,hasTask:!!g.showcase?._portraitTask,hasActiveCharacter:!!g.showcase?._portraitActiveCharacter,hasPreparedCharacter:!!g.showcase?._portraitPreparedCharacter,warmState:g.showcase?._warmState??null,inFlight:finite(g.showcase?._pflight??0),queued:g.showcase?._pq?.length??0}},
  rendererFrame:r.info?.render?.frame??null};
 if(mode==='state')return entry;
 if(mode!=='geometry')throw Error('Unknown entry observation mode');
 // Byte-for-byte SHA-256; verified against node:crypto by boundary/typed-array tests.
 const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
 let bytesRead=0;
 const sha=bytes=>{
  bytesRead+=bytes.byteLength;if(bytesRead>16*1024*1024)throw Error('Geometry observation byte limit');
  const n=bytes.length,p=new Uint8Array(Math.ceil((n+9)/64)*64);p.set(bytes);p[n]=128;
  const dv=new DataView(p.buffer);dv.setUint32(p.length-4,n*8);dv.setUint32(p.length-8,Math.floor(n/536870912));
  const h=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],w=new Uint32Array(64),rr=(x,k)=>(x>>>k)|(x<<(32-k));
  for(let j=0;j<p.length;j+=64){for(let i=0;i<16;i++)w[i]=dv.getUint32(j+i*4);for(let i=16;i<64;i++){const x=w[i-15],y=w[i-2];w[i]=(w[i-16]+(rr(x,7)^rr(x,18)^(x>>>3))+w[i-7]+(rr(y,17)^rr(y,19)^(y>>>10)))>>>0;}
   let [a,b,c,d,e,f,g,z]=h;for(let i=0;i<64;i++){const t1=(z+(rr(e,6)^rr(e,11)^rr(e,25))+((e&f)^((~e)&g))+K[i]+w[i])>>>0,t2=((rr(a,2)^rr(a,13)^rr(a,22))+((a&b)^(a&c)^(b&c)))>>>0;z=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
   for(const [i,x]of[a,b,c,d,e,f,g,z].entries())h[i]=(h[i]+x)>>>0;
  }return h.map(x=>x.toString(16).padStart(8,'0')).join('');
 };
 const roots=[],paths=new Map(),visit=(o,path,depth=0)=>{if(depth>64||roots.length>=2048||paths.has(o))throw Error('Geometry ownership graph bound/cycle');paths.set(o,path);roots.push(o);if((o.children?.length??0)>256)throw Error('Child count bound');for(let i=0;i<(o.children?.length??0);i++)visit(o.children[i],path+'/'+i,depth+1);};
 if(!a?.character?.root)throw Error('Missing observed Character root');visit(a.character.root,'root');
 const geometries=[],owners=[],aliases=new Map(),materials=[],seenM=new Set();let boneLinks=0;
 const attribute=x=>{if(!x)return null;const data=x.isInterleavedBufferAttribute?x.data:x,arr=data.array;if(!ArrayBuffer.isView(arr)||arr instanceof DataView)throw Error('Unsupported CPU geometry attribute');
  return{type:arr.constructor.name,itemSize:x.itemSize,count:x.count,normalized:!!x.normalized,offset:x.offset??null,stride:data.stride??null,meshPerAttribute:data.meshPerAttribute??x.meshPerAttribute??null,
   bytes:arr.byteLength,sha256:sha(new Uint8Array(arr.buffer,arr.byteOffset,arr.byteLength))};};
 for(const o of roots){const geo=o.geometry;if(geo){let id=aliases.get(geo);if(id===undefined){if(geometries.length>=128)throw Error('Geometry count bound');id=geometries.length;aliases.set(geo,id);
   const keys=Object.keys(geo.attributes||{}).sort(),mk=Object.keys(geo.morphAttributes||{}).sort();if(keys.length>64||mk.length>32||(geo.groups?.length??0)>256)throw Error('Geometry metadata bound');
   const content={type:geo.type,instanceCount:bounded(geo.instanceCount??null),boundingBox:geo.boundingBox?{min:vec(geo.boundingBox.min),max:vec(geo.boundingBox.max)}:null,boundingSphere:geo.boundingSphere?{center:vec(geo.boundingSphere.center),radius:finite(geo.boundingSphere.radius)}:null,index:attribute(geo.index),attributes:Object.fromEntries(keys.map(k=>[k,attribute(geo.attributes[k])])),morphTargetsRelative:!!geo.morphTargetsRelative,
    morph:Object.fromEntries(mk.map(k=>{const v=geo.morphAttributes[k];if(v.length>32)throw Error('Morph count bound');return[k,v.map(attribute)];})),groups:(geo.groups||[]).map(x=>({...x})),drawRange:{start:geo.drawRange.start,count:bounded(geo.drawRange.count)}};
   geometries.push({alias:id,uuid:geo.uuid,content,contentSha256:sha(new TextEncoder().encode(JSON.stringify(content)))});
  }boneLinks+=o.skeleton?.bones?.length??0;if((o.skeleton?.bones?.length??0)>512||boneLinks>4096)throw Error('Bone ownership bound');owners.push({materialUuids:(o.material?(Array.isArray(o.material)?o.material:[o.material]):[]).map(m=>m.uuid),path:paths.get(o),uuid:o.uuid,name:o.name,type:o.type,geometryAlias:id,instanceCount:o.count??null,instanceMatrix:attribute(o.instanceMatrix),instanceColor:attribute(o.instanceColor),bindMatrix:vec(o.bindMatrix),bindMatrixInverse:vec(o.bindMatrixInverse),
   morphInfluences:o.morphTargetInfluences?bounded(o.morphTargetInfluences):null,bones:o.skeleton?.bones?o.skeleton.bones.map((b,i)=>({path:paths.get(b)??null,uuid:b.uuid,name:b.name,inverse:vec(o.skeleton.boneInverses?.[i])})):null});}
  for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){if(seenM.has(m))continue;seenM.add(m);if(materials.length>=256)throw Error('Material count bound');
   // has() is mandatory: get() creates entries for previously uncompiled materials.
   const cached=!!r.properties?.has?.(m),u=cached?r.properties.get(m).uniforms:null,keys=Object.keys(u||{}).sort();if(keys.length>256)throw Error('Private uniform count bound');
   materials.push({uuid:m.uuid,owner:paths.get(o),cached,compiled:!!u,privateUniforms:cached?Object.fromEntries(keys.map(k=>[k,bounded(u[k]?.value)])):null});
  }
 }
 // Only two existing CPU noise payloads, at most 16KiB each. No GPU readback.
 const ao=g.R?.gtao,passes=g.R?.composer?.passes||[];
 if(passes.length>16)throw Error('Postprocess pass bound');
 const noise=(texture)=>{
  if(!texture)return null;const image=texture.image,data=image?.data;
  if(!(data instanceof Uint8Array)||!Number.isInteger(image.width)||!Number.isInteger(image.height)||image.width<1||image.height<1||image.width>64||image.height>64||data.byteLength!==image.width*image.height*4||data.byteLength>16384)throw Error('Bounded native noise CPU payload missing/invalid');
  return{uuid:texture.uuid,sourceUuid:texture.source?.uuid??null,version:texture.version,sourceVersion:texture.source?.version,width:image.width,height:image.height,type:texture.type,format:texture.format,wrapS:texture.wrapS,wrapT:texture.wrapT,minFilter:texture.minFilter,magFilter:texture.magFilter,bytes:data.byteLength,sourceImageIdentity:texture.source?.data===image,sha256:sha(new Uint8Array(data.buffer,data.byteOffset,data.byteLength))};
 };
 const uniforms=m=>{if(!m)return null;const keys=Object.keys(m.uniforms||{}).sort();if(keys.length>256)throw Error('Postprocess uniform bound');return{uuid:m.uuid,uniforms:Object.fromEntries(keys.map(k=>[k,bounded(m.uniforms[k]?.value)]))};};
 const postprocess={present:!!ao,aoPassOrdinal:passes.indexOf(ao),passes:passes.map((p,i)=>({ordinal:i,type:p.constructor?.name,name:p.name??null,enabled:p.enabled,needsSwap:p.needsSwap,clear:p.clear,renderToScreen:p.renderToScreen,material:uniforms(p.material)})),
  ao:ao?{gtaoNoise:noise(ao.gtaoNoiseTexture),pdNoise:noise(ao.pdNoiseTexture),gtaoBinding:ao.gtaoMaterial?.uniforms?.tNoise?.value===ao.gtaoNoiseTexture,pdBinding:ao.pdMaterial?.uniforms?.tNoise?.value===ao.pdNoiseTexture,gtao:uniforms(ao.gtaoMaterial),pd:uniforms(ao.pdMaterial),output:ao.output,blendIntensity:ao.blendIntensity}:null};
 return{entry,nodeGraph:roots.map(o=>{const path=paths.get(o);return{uuid:o.uuid,name:o.name,type:o.type,path,parentPath:path==='root'?null:path.slice(0,path.lastIndexOf('/')),children:(o.children||[]).map(c=>paths.get(c))};}),geometries,owners,materials,postprocess,bytesRead,limits:{nodes:2048,geometries:128,bytes:16777216},truncated:false};
}

export function requireSettledMaterialEntry(observation, actualOrdinal, expectedOrdinal) {
 if(!Number.isInteger(expectedOrdinal)||expectedOrdinal<1||actualOrdinal!==expectedOrdinal)throw Error('Native frame ordinal mismatch');
 const {rig,input,jobs}=observation;
 if(rig.mode!=='follow'||!rig.target?.local||rig.blend?.active)throw Error('Native camera transition incomplete');
 if(input.mouse&&(input.mouse.dx!==0||input.mouse.dy!==0||input.mouse.left||input.mouse.right||input.mouse.leftPressed||input.mouse.rightPressed)||input.keys.length||input.pressed.length)throw Error('Non-neutral native input');
 if(jobs.lobby&&(!jobs.lobby.ready||jobs.lobby.failed))throw Error('Existing native lobby job incomplete');
 if(['hasJob','hasTask','hasActiveCharacter','hasPreparedCharacter'].some(k=>jobs.portrait[k]!==false)||jobs.portrait.inFlight!==0||jobs.portrait.queued!==0||jobs.portrait.warmState!=='done')throw Error('Existing native presentation work incomplete');
 return true;
}

export function requireNativeMaterialPostprocess(p) {
 if(!p?.present||!p.ao||p.aoPassOrdinal<0||p.passes[p.aoPassOrdinal]?.enabled!==true)throw Error('Native high-quality AO pass missing');
 if(!p.ao.gtaoBinding||!p.ao.pdBinding)throw Error('Native noise uniform binding mismatch');
 for(const [name,size] of [['gtaoNoise',5],['pdNoise',64]]){
  const x=p.ao[name];if(!x||x.width!==size||x.height!==size||x.bytes!==size*size*4||!x.sourceImageIdentity||!x.uuid||!x.sourceUuid||!Number.isInteger(x.version)||x.version<1||!/^[0-9a-f]{64}$/.test(x.sha256))throw Error('Native CPU noise evidence incomplete');
 }
 if(p.ao.gtaoNoise.uuid===p.ao.pdNoise.uuid)throw Error('Native distinct noise resources aliased');
 return true;
}
