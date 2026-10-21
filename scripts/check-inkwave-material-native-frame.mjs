#!/usr/bin/env node
// QA-only full native frame transaction. No hardware GPU/FPS/allocated-byte claim.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import os from 'node:os';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {chromium} from 'playwright';
import {verifyRuntimeBuild} from './lib/inkwave-runtime-evidence.mjs';
import {enterRangeFromMenu} from './lib/inkwave-range-menu-entry.mjs';
function diagnosticPNG(width,height,rgba){
 assert.equal(rgba.length,width*height*4);
 const crc=bytes=>{let c=0xffffffff;for(const byte of bytes){c^=byte;for(let i=0;i<8;i++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;}return(c^0xffffffff)>>>0;};
 const chunk=(name,data)=>{const n=Buffer.from(name),len=Buffer.alloc(4),sum=Buffer.alloc(4);len.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([n,data])));return Buffer.concat([len,n,data,sum]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;
 const scan=Buffer.alloc(height*(width*4+1));for(let y=0;y<height;y++)rgba.copy(scan,y*(width*4+1)+1,(height-1-y)*width*4,(height-y)*width*4);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]);
}
const [siteArg,sourceArg,overlayArg,outArg,variant,mode]=process.argv.slice(2);
const diagnostic=mode==='--diagnostic';assert.ok(mode===undefined||diagnostic);
assert.ok(['A','B'].includes(variant));
const site=path.resolve(siteArg),source=path.resolve(sourceArg),out=path.resolve(outArg),hash=x=>createHash('sha256').update(x).digest('hex');
fs.mkdirSync(out,{recursive:true});
const sourceSha='429cc1352d9b13ffe83c579ed714b84acf6139ed',manifest=verifyRuntimeBuild(site,source,sourceSha);
const overlay=fs.readFileSync(overlayArg),bound=JSON.parse(fs.readFileSync(path.join(path.dirname(overlayArg),'receipt.json'),'utf8'));
assert.equal(bound.sourceSha,sourceSha);assert.equal(bound.contentHash,manifest.contentHash);assert.equal(bound.inputHash,manifest.inputHash);assert.equal(bound.revision,manifest.build.revision);assert.equal(bound.modulePath,'src/world/inkShading.js');
assert.equal(hash(overlay),bound.baselineEmittedSha256);
const prefix='/_versions/'+manifest.build.revision+'/',target=prefix+bound.modulePath;
assert.equal(hash(fs.readFileSync(path.join(site,target))),bound.candidateEmittedSha256);
const loaded=new Map(),errors=[],mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.mp3':'audio/mpeg','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{try{
 const p=new URL(req.url,'http://localhost').pathname,file=path.resolve(site,'.'+(p==='/'?'/index.html':decodeURIComponent(p)));
 if(!file.startsWith(site+path.sep))throw Error('outside site');
 const key=path.relative(site,file).split(path.sep).join('/'),original=fs.readFileSync(file);assert.equal(hash(original),manifest.artifacts[key]);
 const bytes=variant==='A'&&p===target?overlay:original;loaded.set(key,hash(bytes));
 res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');res.end(bytes);
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser,result,failure;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:960,height:600}});
 page.on('console',m=>{if(m.type()==='log'&&m.text().startsWith('MATERIAL_PHASE ')){
  const line=m.text().slice(15);fs.appendFileSync(path.join(out,'phases.jsonl'),line+'\n');console.log('MATERIAL_PHASE '+line);
 }});
 if(diagnostic)await page.exposeFunction('__materialDiagnosticImages',e=>{
  assert.equal(e.width,960);assert.equal(e.height,600);assert.deepEqual(e.images.map(x=>x.label),['unpainted','painted','repeat','repeat2']);
  const differences=(a,b,p='',out=[])=>{if(out.length>=64)return out;if(JSON.stringify(a)===JSON.stringify(b))return out;
   if(a&&b&&typeof a==='object'&&typeof b==='object'){for(const key of new Set([...Object.keys(a),...Object.keys(b)]))differences(a[key],b[key],p? p+'.'+key:key,out);}
   else out.push({path:p,before:a,after:b});return out;};
  const stateComparisons=e.renderStates.map(x=>({label:x.label,beforeHash:hash(JSON.stringify(x.before)),afterHash:hash(JSON.stringify(x.after)),first64RenderChanges:differences(x.before,x.afterRender),first64RestoredChanges:differences(x.afterRender,x.after)}));
  const files=e.images.map(({label,rgba})=>{const bytes=Buffer.from(rgba,'base64'),png=diagnosticPNG(e.width,e.height,bytes),file=label+'.png';fs.writeFileSync(path.join(out,file),png);return{file,sha256:hash(png),width:e.width,height:e.height};});
  const receipt={...e,images:files,stateComparisons,diagnosticOnly:true,performanceAccepted:false};fs.writeFileSync(path.join(out,'pixel-diagnostic.json'),JSON.stringify(receipt,null,2));
  console.log('MATERIAL_PIXEL_SIGNAL '+JSON.stringify({paintSignal:e.paintSignal,repeatSignal:e.repeatSignal,repeat2Signal:e.repeat2Signal,stateComparisons,files}));
 });
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{
  localStorage.setItem('inkwave.settings',JSON.stringify({quality:'high',shadows:true,bloom:true,frameRate:60,colorblind:true}));
  localStorage.setItem('inkwave.profile',JSON.stringify({style:{hair:0,skin:7,outfit:5,eyes:1,hat:0,brows:3}}));
  let rng=20261021;window.__materialSeed=(step)=>{rng=(20261021+Math.imul(step,2654435761))>>>0;};
  Math.random=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
  window.__rollerVideoClocks=()=>{
        const G=window.__G,g=window.__inkwave;
        const finite=(value,label,required=false)=>{
          if(value===undefined||value===null){if(required)throw Error('Missing clock '+label);return null;}
          if(!Number.isFinite(value))throw Error('Non-finite clock '+label);return value;
        };
        const uniforms=[];
        G.scene.traverse(o=>{
          for(const [slot,m]of (Array.isArray(o.material)?o.material:[o.material]).entries()){
            if(!m)continue;
            for(const [kind,bank]of [['direct',m.uniforms],['userData',m.userData?.uniforms]]){
              for(const [key,u]of Object.entries(bank||{})){
                if(/time|clock/i.test(key)&&typeof u?.value==='number')
                  uniforms.push([o.name||'',m.name||'',slot,kind,key,finite(u.value,key)]);
              }
            }
          }
        });
        uniforms.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
        return {game:finite(G.time,'game',true),environment:finite(G.env?.time,'environment',true),
          environmentUniform:finite(G.env?.U?.uTime?.value,'environmentUniform',true),
          fx:finite(G.fx?._time,'fx',true),fxHooks:finite(g.fxHooks?.time,'fxHooks'),
          paint:finite(G.paint?.clock,'paint',true),decor:finite(g.decor?.time,'decor'),
          decorUniform:finite(g.decor?.uTime?.value,'decorUniform'),propsUniform:finite(g.props?.uTime?.value,'propsUniform'),
          levelUniform:finite(g.levelMat?.userData?.uniforms?.uTime?.value,'levelUniform'),
          grateUniform:finite(g.grateMat?.userData?.uniforms?.uTime?.value,'grateUniform'),uniforms};
      };
      if(Object.hasOwn(window,'__inkwave'))throw Error('Game was already published before early-freeze hook');
      Object.defineProperty(window,'__inkwave',{configurable:true,set(game){
        Object.defineProperty(window,'__inkwave',{value:game,writable:true,configurable:true,enumerable:true});
        if(!game||typeof game!=='object')throw Error('Invalid native game publication');
        game.frozen=true;
        const boundary=window.__rollerBootFreeze={schema:1,boundary:'first-native-game-publication',clocks:null};
        queueMicrotask(()=>{
          if(window.__G?.game!==game||!game.frozen||typeof game.debug?.freeze!=='function')
            throw Error('Native game publication did not complete before first frame');
          game.debug.freeze();
          boundary.clocks=window.__rollerVideoClocks();
        });
      }});

  document.addEventListener('click',e=>{
   if(!e.isTrusted||!e.target?.closest?.('.iw-ui [data-id="mode-range"]'))return;
   const g=window.__inkwave;if(g?.menus?.current!=='mode')return;
   g.debug.freeze();const boot=window.__rollerBootFreeze?.clocks,entry=window.__rollerVideoClocks();
   if(!boot||JSON.stringify(boot)!==JSON.stringify(entry))throw Error('Publication-to-entry scene drift');
   window.__materialEntry={trusted:true,boot,entry};window.__materialSeed(0);
   g.api.setLoadout({weapon:'shooter'});
   if(g.api.getLoadout()?.weapon!=='shooter')throw Error('Native shooter selection failed');
  },true);
 });
 const entry=await enterRangeFromMenu(page,'http://127.0.0.1:'+server.address().port,{timeout:300000});
 result=await page.evaluate(async diagnostic=>{
  const checkpoint=(phase,detail={})=>{if(diagnostic)console.log('MATERIAL_PHASE '+JSON.stringify({phase,time:performance.now(),...detail}));};
  checkpoint('evaluate-enter');
  const G=window.__G,g=window.__inkwave,a=G.local;
  checkpoint('three-import-start');const THREE=await import('three');checkpoint('three-import-ready');
  if(!g.frozen||!G.match?.range||G.match.state!=='playing'||!window.__materialEntry?.trusted)throw Error('Native range admission');
  const character=a.character,warm=character._warmed,loader=character._sourceMotionLoader;
  if(!warm?.then)throw Error('Native startup warmup missing');
  if(!loader?.then)throw Error('Native local Character source loader missing');
  checkpoint('local-warm-start');await warm;checkpoint('local-warm-ready');await loader;checkpoint('local-loader-ready');
  const motion=character.sourceMotion;
  if(!motion?.ready?.then)throw Error('Native local Character source owner ready Promise missing');
  await motion.ready;checkpoint('source-motion-ready');
  if(a.character!==character||character._warmed!==warm||character._sourceMotionLoader!==loader)
   throw Error('Native local Character readiness ownership changed');
  const requireMotionReady=(character,owner)=>{
   if(!owner||owner!==character.sourceMotion||owner.character!==character||owner.status!=='ready'||owner.error||owner.disposed||!owner.enabled||!owner.bank||!owner.squidBank)
    throw Error('Native local Character source motion not ready');
  };
  requireMotionReady(character,motion);
  // Exercise the same predicate with isolated fake owners, never mutate the native Character.
  const controlCharacter={},controlOwner={character:controlCharacter,status:'ready',error:null,disposed:false,enabled:true,bank:{},squidBank:{}};
  controlCharacter.sourceMotion=controlOwner;requireMotionReady(controlCharacter,controlOwner);
  for(const override of [{status:'loading'},{status:'error',error:'load failed'},{disposed:true},{enabled:false},{bank:null},{squidBank:null},{character:{}}]){
   const owner={...controlOwner,...override};controlCharacter.sourceMotion=owner;
   let rejected=false;try{requireMotionReady(controlCharacter,owner);}catch{rejected=true;}
   if(!rejected)throw Error('Invalid source motion negative control accepted');
  }
  controlCharacter.sourceMotion=controlOwner;
  for(const owner of [null,{...controlOwner}]){
   let rejected=false;try{requireMotionReady(controlCharacter,owner);}catch{rejected=true;}
   if(!rejected)throw Error('Missing or replaced source owner negative control accepted');
  }
  const motionReady={status:motion.status,enabled:motion.enabled,error:motion.error,disposed:motion.disposed,
   ownerMatches:motion.character===a.character,variant:motion.variant,humanBankPresent:!!motion.bank,squidBankPresent:!!motion.squidBank};
  if(a.weaponId!=='shooter')throw Error('Wrong native loadout');
  g.debug.freeze();g.R.setDynamicScale(1);g.input.keys.clear();g.debug.fire(false);
  if(G.audio){let seed=20261021;G.audio.rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
  if(!(g.levelMat?.userData?.uniforms?.uGel?.value>=0))throw Error('Production gel texture inactive');
  // Existing native style/palette options, fixed before construction on both lanes. Not a material colour correction.
  const expectedStyle={hair:0,skin:7,outfit:5,eyes:1,hat:0,brows:3},styleKeys=Object.keys(expectedStyle);
  const requireFixture=fixture=>{
   if(!fixture.style||Object.keys(fixture.style).length!==6||styleKeys.some(k=>fixture.style[k]!==expectedStyle[k])||
    !fixture.profileStyle||Object.keys(fixture.profileStyle).length!==6||styleKeys.some(k=>fixture.profileStyle[k]!==expectedStyle[k])||
    fixture.colorblind!==true||fixture.paletteId!=='cb-yellow-blue'||fixture.teamHex?.join(',')!=='#ffd21a,#2a52ff'||
    fixture.teamColors?.join(',')!=='ffd21a,2a52ff'||fixture.localColor!=='ffd21a')
    throw Error('Native profile style or palette fixture mismatch');
  };
  const fixture=()=>{const value={style:{...a.character.style},profileStyle:{...g.profile.style},colorblind:g.settings.colorblind,paletteId:g.palette?.id,
   teamHex:[...G.teamHex],teamColors:G.teamColors.map(c=>c.getHexString()),localColor:a.color.getHexString()};
   requireFixture(value);return value;};
  const fixedFixture=fixture();
  for(const bad of [{...fixedFixture,profileStyle:{...fixedFixture.profileStyle,eyes:0}},{...fixedFixture,style:{...fixedFixture.style,hair:1}},{...fixedFixture,style:{...fixedFixture.style,extra:0}},
   {...fixedFixture,colorblind:false},{...fixedFixture,paletteId:'random'},{...fixedFixture,teamHex:['#000000','#2a52ff']},
   {...fixedFixture,teamColors:['000000','2a52ff']},{...fixedFixture,localColor:'000000'}]){
   let rejected=false;try{requireFixture(bad);}catch{rejected=true;}if(!rejected)throw Error('Wrong style/palette negative accepted');
  }
  const initial={fixture:fixedFixture,motionReady,entry:window.__materialEntry,clocks:window.__rollerVideoClocks(),character:{time:a.character.t,phase:a.character.phase,seed:a.character.seed,name:a.character.name},pos:a.pos.toArray()};
  const normalRender=g.R.render;
  if(diagnostic)g.R.render=function(...args){checkpoint('render-submit-start');try{return normalRender.apply(this,args);}finally{checkpoint('render-submit-end');}};
  const frame=diagnostic
   ? i=>{window.__materialSeed(i);checkpoint('native-frame-start',{frame:i});g._frame(1/60);checkpoint('native-frame-end',{frame:i});}
   : i=>{window.__materialSeed(i);g._frame(1/60);};
  for(let i=0;i<(diagnostic?3:60);i++){frame(i);fixture();}
  const r=G.renderer,gl=r.getContext();checkpoint('completion-drain-start');gl.finish();checkpoint('completion-drain-end');
  const U=g.levelMat.userData.uniforms;
  const atlasConditions={size:G.paint.size,width:G.paint.rt.width,height:G.paint.rt.height,
   textureBinding:U.uPaint.value===G.paint.texture&&G.paint.texture===G.paint.rt.texture,
   uniformSize:U.uAtlasSize.value,texel:U.uTexel.value,pixelRatio:r.getPixelRatio(),
   devicePixelRatio:window.devicePixelRatio,viewport:[gl.drawingBufferWidth,gl.drawingBufferHeight]};
  if(g.settings.quality!=='high'||atlasConditions.size!==4096||atlasConditions.width!==4096||atlasConditions.height!==4096||
   !atlasConditions.textureBinding||atlasConditions.uniformSize!==4096||atlasConditions.texel!==1/4096||
   atlasConditions.pixelRatio!==1||atlasConditions.devicePixelRatio!==1||atlasConditions.viewport[0]!==960||atlasConditions.viewport[1]!==600)
   throw Error('Actual high-quality atlas or viewport mismatch: '+JSON.stringify(atlasConditions));
  const clocks=()=>window.__rollerVideoClocks();
  const camera=()=>({position:G.camera.position.toArray(),quaternion:G.camera.quaternion.toArray(),projection:G.camera.projectionMatrix.toArray()});
  const state=()=>({clocks:clocks(),camera:camera(),actors:G.actors.map(x=>({name:x.name,pos:x.pos.toArray(),hp:x.hp,ink:x.ink,weapon:x.weaponId})),coverage:G.paint.coverage(),projectiles:G.projectiles.list.length});
  const renderStates=[];
  const boundedValue=(v,depth=0)=>{
   if(depth>3)return{bounded:true,reason:'nested-value-depth-limit'};
   if(typeof v==='number')return Number.isFinite(v)?v:String(v);
   if(v===null||['string','boolean','undefined'].includes(typeof v))return v??null;
   if(v.isTexture)return{type:'texture',uuid:v.uuid,version:v.version,sourceVersion:v.source?.version,width:v.image?.width??null,height:v.image?.height??null};
   if(v.elements&&v.elements.length<=16)return [...v.elements];
   if((v.isVector2||v.isVector3||v.isVector4||v.isQuaternion||v.isColor)&&v.toArray)return v.toArray();
   if(Array.isArray(v)||ArrayBuffer.isView(v))return{type:'array',length:v.length,values:v.length<=32?Array.from(v,x=>boundedValue(x,depth+1)):null};
   return{type:v.constructor?.name||typeof v,uninspected:true};
  };
  const snapshotRenderState=()=>{
   const ch=a.character,nodes=[],materials=new Map();let count=0,materialsTruncated=false;
   ch.root.traverse(o=>{
    count++;if(nodes.length>=2048)return;
    nodes.push({uuid:o.uuid,name:o.name,type:o.type,visible:o.visible,matrix:o.matrix.toArray(),matrixWorld:o.matrixWorld.toArray(),
     geometry:o.geometry?{uuid:o.geometry.uuid,drawRange:{start:o.geometry.drawRange.start,count:boundedValue(o.geometry.drawRange.count)},attributes:Object.fromEntries(Object.entries(o.geometry.attributes).map(([k,v])=>[k,{version:v.version,count:v.count}]))}:null});
    for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){
     if(materials.has(m.uuid))continue;if(materials.size>=256){materialsTruncated=true;continue;}
     // Do not call renderer.properties.get: it can create a cache entry on a read.
     const u=m.uniforms||m.userData?.uniforms||{};
     materials.set(m.uuid,{uuid:m.uuid,name:m.name,type:m.type,version:m.version,opacity:m.opacity,transparent:m.transparent,depthWrite:m.depthWrite,depthTest:m.depthTest,
      uniforms:Object.fromEntries(Object.entries(u).slice(0,128).map(([k,v])=>[k,boundedValue(v.value)])),uniformCount:Object.keys(u).length});
    }
   });
   const bones=ch.skeleton?.boneMatrices;
   return{clocks:clocks(),camera:camera(),rendererFrame:r.info.render.frame,
    composer:{read:g.R.composer?.readBuffer?.uuid,write:g.R.composer?.writeBuffer?.uuid},
    shadow:{needsUpdate:r.shadowMap.needsUpdate,autoUpdate:r.shadowMap.autoUpdate},
    character:{time:ch.t,phase:ch.phase,camFrame:ch._camFrame,camOK:ch._camOK,rendered:ch._rendered,camPos:ch._camPos?.toArray(),camE5:ch._camE5,camVH:ch._camVH,
     uniforms:Object.fromEntries(Object.entries(ch.u||{}).map(([k,v])=>[k,boundedValue(v.value)])),
     boneMatrices:bones?{length:bones.length,values:Array.from(bones.subarray(0,4096)),truncated:bones.length>4096}:null,
     boneTexture:boundedValue(ch.skeleton?.boneTexture),nodes,nodeCount:count,nodesTruncated:count>2048,materials:[...materials.values()],materialsTruncated},
    atlasTexture:boundedValue(G.paint.texture)};
  };
  // Capture pass is separate from timings. Fix only render ping-pong state for repeated frozen images.
  const image=label=>{
   const before=diagnostic?snapshotRenderState():null;
   const c=g.R.composer,read=c?.readBuffer,write=c?.writeBuffer;
   try{g.R.render();const p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;}
   finally{let afterRender=null;try{if(diagnostic)afterRender=snapshotRenderState();}finally{if(c){c.readBuffer=read;c.writeBuffer=write;}}if(diagnostic)renderStates.push({label,before,afterRender,after:snapshotRenderState()});}
  };
  checkpoint('clear-flush-start');G.paint.clear();G.paint.flush(0);checkpoint('unpainted-readback-start');const unpainted=image('unpainted');checkpoint('unpainted-readback-end');
  const placements=[],h={normal:new THREE.Vector3(),block:-1,face:-1};
  for(let z=-8;z<=8;z+=2)for(let x=-8;x<=8;x+=2){
   G.physics.groundProbe(a.pos.x+x,64,a.pos.z+z,0,128,.38,h,false);
   if(!h.hit||!h.center||h.grate||h.normal.y<.98)continue;
   const point=new THREE.Vector3(a.pos.x+x,h.y+.02,a.pos.z+z),seed=(placements.length+1)/100;
   const area=G.paint.splat(point,1.5,placements.length%2,{seed,kind:'shot',instant:true});
   placements.push({point:point.toArray(),seed,area});
  }
  if(placements.length<16)throw Error('Insufficient native painted floor samples');
  checkpoint('paint-flush-start');G.paint.flush(0);checkpoint('paint-readback-start');const painted=image('painted'),repeat=image('repeat'),repeat2=diagnostic?image('repeat2'):null;checkpoint('paint-readback-end');
  const difference=(x,y)=>{let changed=0,max=0;for(let i=0;i<x.length;i+=4){let any=false;for(let k=0;k<4;k++){const d=Math.abs(x[i+k]-y[i+k]);max=Math.max(max,d);any ||= d>0;}changed+=any;}return{changed,max};};
  const paintSignal=difference(unpainted,painted),repeatSignal=difference(painted,repeat),repeat2Signal=diagnostic?difference(repeat,repeat2):null;
  checkpoint('pixel-signal',{paintSignal,repeatSignal,repeat2Signal});
  if(diagnostic){
   const encode=bytes=>{let value='';for(let i=0;i<bytes.length;i+=16384)value+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(value);};
   checkpoint('capture-evidence-start');
   await window.__materialDiagnosticImages({width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,paintSignal,repeatSignal,repeat2Signal,renderStates,
    atlasConditions,fixture:fixture(),state:state(),placements,
    images:[{label:'unpainted',rgba:encode(unpainted)},{label:'painted',rgba:encode(painted)},{label:'repeat',rgba:encode(repeat)},{label:'repeat2',rgba:encode(repeat2)}]});
   checkpoint('capture-evidence-end');
  }
  if(paintSignal.changed<=1000||repeatSignal.changed!==0)throw Error('Paint visibility or frozen-repeat gate failed: '+JSON.stringify({paintSignal,repeatSignal}));
  // Fail-closed controls prove the visibility predicate does not accept an empty signal.
  const validates=x=>x.changed>1000;if(validates(difference(unpainted,unpainted)))throw Error('Blank negative accepted');
  const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  const pixels={unpainted:await digest(unpainted),painted:await digest(painted),paintSignal,repeatSignal};
  checkpoint('atlas-readback-start');const atlas=new Uint8Array(G.paint.size*G.paint.size*4);r.readRenderTargetPixels(G.paint.rt,0,0,G.paint.size,G.paint.size,atlas);
  const atlasHash=await digest(atlas),beforeWarm=state();checkpoint('atlas-readback-end');
  if(diagnostic){g.R.render=normalRender;checkpoint('diagnostic-complete');return{diagnosticOnly:true,performanceAccepted:false,
   scope:'three native warmup frames and separate native paint/readback boundary diagnosis; NOT 3ABBA or performance acceptance',
   initial,placements,pixels,atlasHash,beforeWarm,conditions:{atlas:atlasConditions,fixture:fixture()},samples:[]};}
  // Warm the actual full-game renderer and shaders after native painting.
  for(let i=60;i<90;i++){frame(i);fixture();}gl.finish();
  const before=state(),samples=[],render=g.R.render,webglRender=r.render;
  let sample=null;
  g.R.render=function(...args){const t=performance.now();try{return render.apply(this,args);}finally{if(sample){sample.renderCpuMs+=performance.now()-t;sample.renderCalls++;}}};
  r.render=function(...args){const t=performance.now();try{return webglRender.apply(this,args);}finally{if(sample){sample.webglSubmitMs+=performance.now()-t;sample.webglPasses++;}}};
  const windowStart=performance.now();
  try{
   for(let i=0;i<120;i++){
    sample={frame:i,frameCpuMs:0,renderCpuMs:0,webglSubmitMs:0,renderCalls:0,webglPasses:0,drawCalls:0,triangles:0};
    const t=performance.now();frame(90+i);sample.frameCpuMs=performance.now()-t;
    fixture(); // condition validation outside the frame CPU timing; included in whole-transaction wall time
    sample.drawCalls=r.info.render.calls;sample.triangles=r.info.render.triangles;
    sample.resources={textures:r.info.memory.textures,geometries:r.info.memory.geometries,programs:r.info.programs.length};
    samples.push(sample);sample=null;
   }
  }finally{g.R.render=render;r.render=webglRender;}
  const drainStart=performance.now();gl.finish();const completionDrainMs=performance.now()-drainStart;
  const completedTransactionMsPerFrame=(performance.now()-windowStart)/120,after=state();
  if(samples.some(s=>!(s.frameCpuMs>0)||s.renderCalls!==1||s.webglPasses<1||s.drawCalls<1)||gl.getError())throw Error('Invalid complete native frame work');
  const debug=gl.getExtension('WEBGL_debug_renderer_info'),lights=[];G.scene.traverse(o=>{if(o.isLight)lights.push({type:o.type,name:o.name,color:o.color.toArray(),intensity:o.intensity,position:o.getWorldPosition(new THREE.Vector3()).toArray()});});
  return {scope:'complete native practice-range Game._frame and normal compositor; fixed-step CPU, not live FPS or physical GPU',
   initial,placements,pixels,atlasHash,beforeWarm,before,after,samples,completionDrainMs,completedTransactionMsPerFrame,
   conditions:{fixture:fixture(),atlas:atlasConditions,viewport:[gl.drawingBufferWidth,gl.drawingBufferHeight],quality:g.settings.quality,dynamicScale:g.R.dynScale,
    gelLayer:g.levelMat.userData.uniforms.uGel.value,lights,environmentIntensity:G.scene.environmentIntensity,environmentPresent:!!G.scene.environment,toneMapping:r.toneMapping,outputColorSpace:r.outputColorSpace,exposure:r.toneMappingExposure},
   gpu:{renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),timerQueryAvailable:!!gl.getExtension('EXT_disjoint_timer_query_webgl2'),measured:false},
   allocations:{allocatedBytesPerFrame:null,heapAfter:performance.memory?.usedJSHeapSize??null,note:'heap occupancy is not allocation rate'},physicalDeviceMeasured:false};
 },diagnostic);
 assert.deepEqual(errors,[]);assert.ok(loaded.has(target.slice(1)),'actual ink module loaded');
 result.entry=entry;
}catch(e){failure=e;}
finally{
 await browser?.close();await new Promise(r=>server.close(r));
 const receipt={diagnosticOnly:diagnostic,performanceAccepted:false,status:failure?'failed':'passed',sourceSha,variant,inputHash:manifest.inputHash,contentHash:manifest.contentHash,overlay:bound,loaded:[...loaded],environment:{cpu:os.cpus()[0]?.model,node:process.version},result,errors,error:failure?.stack};
 fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));
 console.log(JSON.stringify({status:receipt.status,variant,sourceSha,error:failure?.message}));
 if(failure)process.exitCode=1;
}
