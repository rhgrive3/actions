// Standalone real WebGL2 parity probe. Software GPU timings are diagnostics,
// never a claim about iPad hardware. Run from the repository root.
import fs from 'node:fs';import zlib from 'node:zlib';import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {adaptQueueVisualContinuationCandidates20261029 as adapt} from '../queue-visual-continuation-20261029-adapter.mjs';
const frozen=JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('./fixtures/queue-visual-continuation-20261029-before.json.gz',import.meta.url))));
function chunk(source,name){
 const start=source.indexOf('const '+name+' =');assert(start>=0,name);
 const first=source.indexOf('`',start),last=source.indexOf('`;',first);assert(last>first,name);
 return source.slice(first+1,last).replace(/\$\{([^}]+)\}/g,(_,key)=>({OUT_CHUNKS:'',INK_RIPPLES:'24',MAX_RECTS:'32',MAX_WET:'12','WATER_Y.toFixed(3)':'-1.600'}[key]??chunk(source,key)));
}
const pairs=[];
for(const [file,name,type] of [['fx.js','PUFF_FRAG','puff'],['fx.js','RING_FRAG','ring'],['screenfx.js','FRAG','screen'],['environment.js','SEA_FRAG','sea']]){
 const rel=(file==='environment.js'?'src/world/':'src/fx/')+file,old=frozen['composed-'+file],next=adapt(rel,old);
 pairs.push({type,old:chunk(old,name),next:chunk(next,name)});
}
const paintWrap=s=>`uniform sampler2D uPaint;uniform float uTexel,uAtlasSize,uPpm;uniform vec3 uTeamA,uTeamB;
 varying vec2 vPaintUv;varying vec3 vFaceData,vWNorm,vFaceTan;
 float gInkNear=0.,gInk=0.,gFresh=0.,gInkS=0.;vec2 gInkD=vec2(0.);vec3 gInkCol=vec3(0.);
 ${chunk(s,'INK_PARS')}
 void main(){vec3 base=vec3(.15,.25,.35);${chunk(s,'INK_COLOR')}gl_FragColor=vec4(base,gInk);}`;
const paint=frozen['composed-inkShading.js'];pairs.push({type:'paint',old:paintWrap(paint),next:paintWrap(adapt('src/world/inkShading.js',paint))});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage();
 const receipt=await page.evaluate(async pairs=>{
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const gl=canvas.getContext('webgl2',{antialias:false,preserveDrawingBuffer:true});if(!gl)throw Error('No WebGL2');
  const ext=gl.getExtension('EXT_disjoint_timer_query_webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');
  const stats={renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),timerQuery:!!ext,renderSize:[128,128],runs:[],compileErrors:[]};
  const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);const texels=new Uint8Array(256*256*4);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){const o=(y*256+x)*4,a=(x%64<12||y%64<8)?0:255;texels[o]=Math.floor(a*(x%53)/52);texels[o+1]=Math.floor(a*(y%47)/46);texels[o+2]=Math.floor(a*((x*17+y*13)%256)/255);texels[o+3]=a;}
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,256,256,0,gl.RGBA,gl.UNSIGNED_BYTE,texels);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
  const vertex=`#version 300 es
  precision highp float;uniform float mode,uvScale,worldScale;uniform vec4 fixtureMisc;uniform float fixtureAge;
  out vec2 vUv,vPaintUv,vSwellGrad;out vec4 vCol,vMisc;out float vT,vDeckD;out vec3 vWorld,vFaceData,vWNorm,vFaceTan;
  void main(){vec2 p=gl_VertexID==0?vec2(-1.,-1.):gl_VertexID==1?vec2(3.,-1.):vec2(-1.,3.);vec2 uv=p*.5+.5;
   gl_Position=vec4(p,0.,1.);vUv=mode<.5?p:uv;vPaintUv=uv*uvScale+vec2(.013,.027);vCol=vec4(.23,.57,.83,.87);vMisc=fixtureMisc;vT=fixtureAge;
   vWorld=vec3(p.x*worldScale,-1.6,p.y*worldScale);vSwellGrad=vec2(.03,.01);vDeckD=0.;vFaceData=vec3(0.,1.,0.);vWNorm=vec3(0.,1.,0.);vFaceTan=vec3(1.,0.,0.);}`;
  function shader(type,text){const s=gl.createShader(type);gl.shaderSource(s,text);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
  function program(source){
   source=source.replace(/#include\s*<[^>]+>/g,'').replaceAll('getShadowMask()','1.0').replaceAll('texture2D(','texture(').replaceAll('varying ','in ').replaceAll('gl_FragColor','outColor');
   const fragment='#version 300 es\nprecision highp float;precision highp int;\n#define NUM_DIR_LIGHTS 0\n#define TAPS 8\nuniform vec3 cameraPosition;out vec4 outColor;\n'+source;
   const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
   const uniforms=[];for(let i=0;i<gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);i++){const info=gl.getActiveUniform(p,i);uniforms.push({...info,name:info.name,type:info.type,size:info.size,location:gl.getUniformLocation(p,info.name)});}return {p,uniforms};
  }
  function use(prog,fixture){gl.useProgram(prog.p);for(const u of prog.uniforms){let v=fixture[u.name]??fixture[u.name.replace('[0]','')];if(v===undefined){if(u.type===gl.FLOAT)v=.3;else if(u.type===gl.SAMPLER_2D||u.type===gl.INT)v=0;else v=Array(u.size*({[gl.FLOAT_VEC2]:2,[gl.FLOAT_VEC3]:3,[gl.FLOAT_VEC4]:4}[u.type]||1)).fill(.4);}
    if(u.type===gl.FLOAT)gl.uniform1fv(u.location,Array.isArray(v)?v:[v]);else if(u.type===gl.SAMPLER_2D||u.type===gl.INT)gl.uniform1iv(u.location,Array.isArray(v)?v:[v]);else if(u.type===gl.FLOAT_VEC2)gl.uniform2fv(u.location,v);else if(u.type===gl.FLOAT_VEC3)gl.uniform3fv(u.location,v);else if(u.type===gl.FLOAT_VEC4)gl.uniform4fv(u.location,v);
   }}
  function draw(prog,fixture,read=true){use(prog,fixture);gl.clearColor(.07,.09,.11,.13);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,3);if(!read)return;const pixels=new Uint8Array(128*128*4);gl.readPixels(0,0,128,128,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;}
  async function time(prog,fixture){if(!ext)return null;const q=gl.createQuery();use(prog,fixture);gl.beginQuery(ext.TIME_ELAPSED_EXT,q);for(let i=0;i<32;i++)gl.drawArrays(gl.TRIANGLES,0,3);gl.endQuery(ext.TIME_ELAPSED_EXT);gl.flush();for(let wait=0;wait<200;wait++){if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE)){const ns=gl.getQueryParameter(q,gl.QUERY_RESULT),disjoint=gl.getParameter(ext.GPU_DISJOINT_EXT);gl.deleteQuery(q);return disjoint?null:ns/32e6;}await new Promise(r=>setTimeout(r,5));}return null;}
  const base={mode:0,uvScale:1,worldScale:12,fixtureMisc:[.271,.317,.41,0],fixtureAge:.31,uTime:1.75,uRes:[128,128],uAspect:1,uSpeed:0,uStretch:0,uPunch:0,uBlast:0,uBlastRing:0,uChroma:0,uLensOn:0,uEdgeInk:[.3,.2,.8,0],uAura:[0,0,0,0],uHeart:[0,0,0,0],uHurt:0,uUrgency:[0,0,0,0],uSwim:[0,0,0,0],uFocus:0,uShimmer:[0,0,0,0],uFlood:[.3,.5,.8,1],uFloodClear:0,uHole:0,uHoleRim:[.4,.7,.9],uFlash:[0,0,0,0],uRectCount:1,uRects:[0,0,5,6],uRectAx:[1,0],cameraPosition:[1,8,8],uSunDir:[-.41,.83,-.38],uFoamRect:[-10,-10,.05,.05],uTexel:1/256,uAtlasSize:256,uPpm:32,uTeamA:[.7,.2,.1],uTeamB:[.1,.3,.7]};
  for(const pair of pairs){let a,b;try{a=program(pair.old);b=program(pair.next);}catch(e){stats.compileErrors.push({type:pair.type,error:String(e)});continue;}
   let cases=[];
   if(pair.type==='puff')for(const k of [0,1,1.4999,1.5,1.5001,2,2.4999,2.5,2.5001,3,3.4999,3.5,3.5001,4])for(const t of [0,.31,.99])cases.push({...base,fixtureMisc:[.271,.317,t,k]});
   if(pair.type==='ring')for(const k of [0,.4999,.5,.5001,1,1.5,2,2.4999,2.5,2.5001,3,3.5,4,4.4999,4.5,4.5001,5,5.5,6,6.4999,6.5,6.5001,7])for(const t of [0,.31,.99])cases.push({...base,fixtureMisc:[.271,k,.8,.1],fixtureAge:t});
   if(pair.type==='screen')for(const hole of [0,.0001,.1,.5,1.32])for(const aspect of [1,4/3,16/9])for(const flood of [0,1])cases.push({...base,mode:1,uHole:hole,uAspect:aspect,uFlood:[.3,.5,.8,flood]});
   if(pair.type==='sea')for(const scale of [2,6,12,50,200])for(const t of [0,.5,10])cases.push({...base,mode:1,worldScale:scale,uTime:t});
   if(pair.type==='paint')for(const foot of [.8999,.9,.9001,1.2,2.3999,2.4,2.4001,4,8])cases.push({...base,mode:1,uvScale:foot/2});
   let channels=0,diffs=0,max=0,nonclear=0;for(const fixture of cases){const x=draw(a,fixture),y=draw(b,fixture);for(let i=0;i<x.length;i++){const d=Math.abs(x[i]-y[i]);channels++;if(d)diffs++;max=Math.max(max,d);if(x[i]!==[18,23,28,33][i%4])nonclear++;}}
   const bench=pair.type==='puff'?[{...base,fixtureMisc:[.271,.317,.31,2]},{...base,fixtureMisc:[.271,.317,.31,3]}]:pair.type==='ring'?[{...base,fixtureMisc:[.271,3,.8,.1]},{...base,fixtureMisc:[.271,7,.8,.1]}]:pair.type==='sea'?[cases[0],cases[6],cases.at(-1)]:[cases.at(-1)];const timing=[];for(let condition=0;condition<bench.length;condition++){const fixture=bench[condition];draw(a,fixture,false);draw(b,fixture,false);for(const reverse of [false,true,true,false,false,true,true,false]){const aa=reverse?b:a,bb=reverse?a:b;const first=await time(aa,fixture),second=await time(bb,fixture);timing.push({condition,beforeMs:reverse?second:first,afterMs:reverse?first:second});}}
   stats.runs.push({type:pair.type,cases:cases.length,channels,differingChannels:diffs,maxByteDifference:max,nonclearChannels:nonclear,softwareGpuABBA:timing});gl.deleteProgram(a.p);gl.deleteProgram(b.p);
  }
  stats.glError=gl.getError();return stats;
 },pairs);
 receipt.browser=browser.version();receipt.scope='Exact composed fragment arithmetic in standalone WebGL2 fixture; no hardware iPad/whole-game parity claim; includes unrelated pass chunks stripped symmetrically.';
 const out=process.env.VISUAL_RECEIPT||'../continuation/visual/webgl-receipt.json';fs.writeFileSync(out,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
 assert.equal(receipt.compileErrors.length,0);assert.equal(receipt.glError,0);for(const r of receipt.runs)assert.equal(r.differingChannels,0,r.type);
}finally{await browser.close();}
