import assert from 'node:assert/strict';
const SOURCE='c0938a3f84768474df91713f7b372f9d7f8fe96a',TREE='97b9938391f156dc332f6a56ac6fe3d21d9f9dc7';
const object=(v,label)=>assert.ok(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length,label);
const string=(v,label)=>assert.ok(typeof v==='string'&&v.length,label);
const finite=(v,label)=>assert.ok(Number.isFinite(v),label);
const hash=(v,label)=>assert.match(v,/^[0-9a-f]{64}$/,label);
const vector=(v,n,label)=>{assert.ok(Array.isArray(v)&&v.length===n,label);v.forEach(x=>finite(x,label));};
const integer=(v,min,label)=>assert.ok(Number.isSafeInteger(v)&&v>=min,label);
const clocks=(v,label)=>{object(v,label);for(const k of ['game','environment','fx','paint'])finite(v[k],label+' '+k);};
const keys=(v,names,label)=>{object(v,label);for(const k of names)assert.ok(Object.hasOwn(v,k)&&v[k]!==undefined,label+'.'+k);};
export function requireNormalNativeReceipt(row,variant){
 assert.equal(row.status,'passed');assert.equal(row.variant,variant);assert.ok(['A','B'].includes(variant));
 assert.equal(row.sourceSha,SOURCE);assert.equal(row.diagnosticOnly,false);assert.equal(row.performanceAccepted,false);assert.deepEqual(row.errors,[]);
 hash(row.inputHash,'inputHash');hash(row.contentHash,'contentHash');string(row.environment?.cpu,'CPU provenance');string(row.environment?.node,'Node provenance');
 const b=row.overlay;object(b,'overlay provenance');assert.equal(b.sourceSha,SOURCE);assert.equal(b.sourceTree,TREE);assert.equal(b.inputHash,row.inputHash);assert.equal(b.contentHash,row.contentHash);
 assert.equal(b.commonVariant,'B');assert.equal(b.overlayVariant,'A');assert.equal(b.modulePath,'src/world/inkShading.js');hash(b.revision,'revision');hash(b.baselineEmittedSha256,'baseline emitted');hash(b.candidateEmittedSha256,'candidate emitted');assert.notEqual(b.baselineEmittedSha256,b.candidateEmittedSha256);
 const target='_versions/'+b.revision+'/'+b.modulePath,loadedResources=[],seen=new Set();assert.ok(Array.isArray(row.loaded)&&row.loaded.length,'loaded source provenance');
 for(const item of row.loaded){assert.ok(Array.isArray(item)&&item.length===2,'loaded pair');const[key,value]=item;string(key,'resource path');hash(value,'resource SHA');assert.ok(!seen.has(key),'duplicate loaded resource');seen.add(key);
  if(key===target){assert.equal(value,variant==='A'?b.baselineEmittedSha256:b.candidateEmittedSha256,'actual selected material body');loadedResources.push([key,b.baselineEmittedSha256]);}
  else loadedResources.push([key,value]);
 }
 assert.ok(seen.has(target),'actual material loaded');loadedResources.sort((a,b)=>a[0].localeCompare(b[0]));
 const r=row.result;object(r,'normal result');assert.equal(r.physicalDeviceMeasured,false);string(r.scope,'measurement scope');
 keys(r.initial,['fixture','motionReady','entry','clocks','character','pos'],'initial');
 for(const k of ['fixture','motionReady','entry','clocks','character'])object(r.initial[k],'initial '+k);clocks(r.initial.clocks,'initial clocks');assert.equal(r.initial.motionReady.status,'ready');for(const k of ['enabled','ownerMatches','humanBankPresent','squidBankPresent'])assert.equal(r.initial.motionReady[k],true);assert.equal(r.initial.motionReady.disposed,false);assert.equal(r.initial.motionReady.error,null);assert.equal(r.initial.entry.trusted,true);clocks(r.initial.entry.boot,'boot clocks');clocks(r.initial.entry.entry,'entry clocks');for(const k of ['time','phase','seed'])finite(r.initial.character[k],'character '+k);vector(r.initial.pos,3,'initial position');
 for(const k of ['beforeWarm','before','after']){const s=r[k];keys(s,['clocks','camera','actors','coverage','projectiles'],k);clocks(s.clocks,k+' clocks');keys(s.camera,['position','quaternion','projection'],k+' camera');vector(s.camera.position,3,k);vector(s.camera.quaternion,4,k);vector(s.camera.projection,16,k);assert.ok(Array.isArray(s.actors)&&s.actors.length,k+' actors');assert.ok(Array.isArray(s.coverage)&&s.coverage.length,k+' coverage');s.coverage.forEach(x=>finite(x,k+' coverage'));integer(s.projectiles,0,k+' projectiles');}
 assert.deepEqual(r.entry?.route,['main','mode','range']);assert.equal(r.entry.gestures?.length,2);for(const[i,id]of ['play','mode-range'].entries()){const gesture=r.entry.gestures[i];assert.equal(gesture.trusted,true);assert.equal(gesture.type,'click');assert.equal(gesture.selector,'.iw-ui [data-id="'+id+'"]');}
 hash(r.atlasHash,'actual atlas hash');assert.ok(Array.isArray(r.placements)&&r.placements.length>=16,'paint placements');for(const p of r.placements){vector(p.point,3,'paint point');finite(p.seed,'paint seed');finite(p.area,'paint area');}
 const c=r.conditions;keys(c,['fixture','atlas','viewport','quality','dynamicScale','gelLayer','lights','environmentIntensity','environmentPresent','toneMapping','outputColorSpace','exposure'],'conditions');object(c.fixture,'fixture');assert.equal(c.quality,'high');assert.deepEqual(c.viewport,[960,600]);
 const a=c.atlas;for(const k of ['size','width','height','uniformSize'])assert.equal(a?.[k],4096,'high atlas '+k);assert.equal(a.textureBinding,true);assert.equal(a.texel,1/4096);assert.equal(a.pixelRatio,1);assert.equal(a.devicePixelRatio,1);assert.deepEqual(a.viewport,[960,600]);
 for(const k of ['dynamicScale','gelLayer','environmentIntensity','toneMapping','exposure'])finite(c[k],'condition '+k);assert.equal(typeof c.environmentPresent,'boolean');string(c.outputColorSpace,'color space');assert.ok(Array.isArray(c.lights)&&c.lights.length,'light provenance');for(const light of c.lights){string(light.type,'light type');assert.equal(typeof light.name,'string');vector(light.color,3,'light color');vector(light.position,3,'light position');finite(light.intensity,'light intensity');}
 string(r.gpu?.renderer,'GPU renderer provenance');assert.equal(typeof r.gpu.timerQueryAvailable,'boolean');assert.equal(r.gpu.measured,false);
 assert.equal(r.allocations?.allocatedBytesPerFrame,null);assert.ok(r.allocations.heapAfter===null||Number.isFinite(r.allocations.heapAfter));string(r.allocations.note,'allocation scope');
 hash(r.pixels?.unpainted,'unpainted SHA');hash(r.pixels.painted,'painted SHA');integer(r.pixels.paintSignal?.changed,1001,'paint signal');integer(r.pixels.paintSignal.max,1,'paint signal maximum');assert.deepEqual(r.pixels.repeatSignal,{changed:0,max:0});
 assert.ok(Array.isArray(r.samples)&&r.samples.length===120,'120 actual samples');
 const workload=r.samples.map((s,i)=>{assert.equal(s.frame,i,'frame ordinal');for(const k of ['frameCpuMs','renderCpuMs','webglSubmitMs']){finite(s[k],k);assert.ok(s[k]>=0,k);}assert.ok(s.frameCpuMs>0);assert.equal(s.renderCalls,1);for(const k of ['webglPasses','drawCalls'])integer(s[k],1,k);integer(s.triangles,0,'triangles');for(const k of ['textures','geometries','programs'])integer(s.resources?.[k],0,'resource '+k);return{frame:s.frame,renderCalls:s.renderCalls,webglPasses:s.webglPasses,drawCalls:s.drawCalls,triangles:s.triangles,resources:s.resources};});
 finite(r.completionDrainMs,'completion drain');assert.ok(r.completionDrainMs>=0);finite(r.completedTransactionMsPerFrame,'completed duration');assert.ok(r.completedTransactionMsPerFrame>0);
 return{loadedResources,workload};
}
export function requireAllUnpainted(rows){assert.equal(rows.length,4);for(const row of rows){hash(row.pixels?.unpainted,'unpainted SHA');assert.equal(row.pixels.unpainted,rows[0].pixels.unpainted,'all four unpainted observations must match');}}
