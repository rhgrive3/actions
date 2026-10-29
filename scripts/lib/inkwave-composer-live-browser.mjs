// Serialized into a browser by check-inkwave-offscreen-hair-reentry.mjs.
// Real emitted Renderer.render/_buildComposer and ScreenFX; only the reference
// holds its supported HDR format fixed after native creation.
export async function runComposerLive(prefix) {
  Math.random=()=>.4;
  const THREE=await import('three'),{G}=await import(prefix+'src/core/ctx.js');
  const {Renderer}=await import(prefix+'src/core/renderer.js'),{ScreenFX}=await import(prefix+'src/fx/screenfx.js');
  const settings={quality:'high',shadows:true,bloom:true,cameraShake:1};
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,0,2);camera.position.z=1;
  const material=new THREE.ShaderMaterial({toneMapped:false,
    vertexShader:'varying vec2 uv0;void main(){uv0=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:'varying vec2 uv0;void main(){vec3 c=vec3(.01+uv0.x*1.8,.02+uv0.y*1.4,.03+uv0.x*uv0.y*2.2);gl_FragColor=vec4(c,1.);}'});
  const geometry=new THREE.PlaneGeometry(2,2);scene.add(new THREE.Mesh(geometry,material));
  G.scene=scene;G.camera=camera;G.settings=settings;G.mobile={touch:true,ios:true};G.mode='menu';G.env=null;
  G.teamColors=[new THREE.Color('#ff8825'),new THREE.Color('#484ce8')];G.teamHex=['#ff8825','#484ce8'];
  const post=new Renderer(document.body,settings);post.setScene(scene,camera);G.renderer=post.renderer;G.post=post;
  const renderer=post.renderer,gl=renderer.getContext();renderer.debug.checkShaderErrors=true;
  const liveTextures=new Set(),nativeCreate=gl.createTexture,nativeDelete=gl.deleteTexture;
  gl.createTexture=function(...args){const value=nativeCreate.apply(this,args);if(value)liveTextures.add(value);return value;};
  gl.deleteTexture=function(value){liveTextures.delete(value);return nativeDelete.call(this,value);};
  const sfx=new ScreenFX(post,G),rows=[];
  let reference=null;
  const reset=()=>{sfx.reset();sfx.force=null;sfx.debugHold=0;sfx.update(0,null);};
  const image=()=>{const bytes=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
    gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return bytes;};
  const difference=(a,b)=>{const bins=new Uint32Array(256);let changed=0,sum=0,alpha=0;
    for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(i%4===3){if(d)alpha++;}else{bins[d]++;sum+=d;}if(d)changed++;}
    let total=0,p99=0;for(let d=0;d<256;d++){total+=bins[d];if(total>=a.length*.75*.99){p99=d;break;}}
    return {changedChannels:changed,mean:sum/(a.length*.75),p99,alpha};};
  const forceReference=()=>{
    // Select native HDR once, then retain it even during idle. This changes
    // only the isolated reference's adoption flag, not a production method.
    const enabled=sfx.pass.enabled;sfx.pass.enabled=true;reference.render();reference._composerPackedCapable=false;sfx.pass.enabled=enabled;
  };
  try{
    for(const quality of ['low','medium','high']){
      settings.quality=quality;G.settings=settings;reset();
      post.applySettings(settings);
      reference=Object.assign(Object.create(Object.getPrototypeOf(post)),post,{composer:null,extraPass:sfx.pass});
      reference._buildComposer();forceReference();
      let lastTarget=null,lastHdr=null;
      const capture=(name,change=null)=>{
        change?.();
        const active=sfx.pass.enabled,expectedHdr=active||(G.env?.grade?.uLift??0)<0;
        const composerBefore=post.composer,passesBefore=post.composer.passes.slice(),sceneTargetBefore=post.composer.renderTarget2;
        const targetBefore=post.composer.renderTarget1;
        reference.render();const baseline=image();reference.render();const baselineRepeat=image();
        post.render();const first=image(),target=post.composer.renderTarget1;
        post.render();const repeat=image();
        const diff=difference(baseline,first),repeatDiff=difference(first,repeat),referenceDiff=difference(baseline,baselineRepeat);
        const type=target.texture.type,correctType=type===(expectedHdr?THREE.HalfFloatType:THREE.UnsignedInt101111Type);
        const stableTarget=post.composer.renderTarget1===target;
        const preservedPasses=post.composer===composerBefore&&passesBefore.length===post.composer.passes.length&&passesBefore.every((p,i)=>p===post.composer.passes[i]);
        const preservedSceneTarget=sceneTargetBefore===null||sceneTargetBefore===post.composer.renderTarget2;
        const sameStateReuse=lastHdr===expectedHdr&&lastTarget===targetBefore&&targetBefore!==null?lastTarget===target:true;
        const pair=[post.composer.renderTarget1,post.composer.renderTarget2];
        const depthAttachments=[];
        const framebuffers=pair.map(t=>{renderer.setRenderTarget(t);depthAttachments.push(gl.getFramebufferAttachmentParameter(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE));return gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;});renderer.setRenderTarget(null);
        const correctDepthRoles=depthAttachments[0]===gl.NONE&&depthAttachments[1]===gl.RENDERBUFFER;
        const passed=correctType&&correctDepthRoles&&stableTarget&&sameStateReuse&&preservedPasses&&preservedSceneTarget&&framebuffers.every(Boolean)&&!repeatDiff.changedChannels&&!referenceDiff.changedChannels&&
          (expectedHdr?!diff.changedChannels:diff.mean<=1.25&&diff.p99<=3&&!diff.alpha);
        rows.push({name:quality+'-'+name,quality,active,expectedHdr,type,correctType,stableTarget,sameStateReuse,preservedPasses,preservedSceneTarget,liveTextures:liveTextures.size,
          framebufferComplete:framebuffers,depthAttachments,correctDepthRoles,diff,repeatDiff,referenceDiff,glError:gl.getError(),passed,bytes:[]});
        if(!passed)rows.at(-1).bytes=[renderer.domElement.toDataURL('image/png').split(',')[1]];
        lastTarget=target;lastHdr=expectedHdr;
      };
      capture('startup-active',()=>{sfx.test('damage',{amount:50,hold:8});sfx.update(1/60,null);});
      capture('idle',reset);
      capture('damage',()=>{sfx.test('damage',{amount:50,hold:8});sfx.update(1/60,null);});
      capture('damage-stable');
      capture('idle-return',reset);
      capture('lens',()=>{sfx.test('splat',{x:.73,y:.58,size:.13,hold:8});sfx.update(1/60,null);});
      capture('orientation-active',()=>{Object.defineProperty(window,'innerWidth',{configurable:true,value:180});Object.defineProperty(window,'innerHeight',{configurable:true,value:240});});
      capture('scale-active',()=>{post.setDynamicScale(.75);reference.setDynamicScale(.75);});
      capture('idle-after-resize',reset);
      capture('negative-grade-idle',()=>{G.env={grade:{uLift:-.01}};});
      capture('negative-grade-active',()=>{sfx.test('flood',{t:.64,hold:8});sfx.update(1/60,null);});
      capture('safe-grade-active',()=>{G.env={grade:{uLift:0}};});
      capture('safe-idle',reset);
      capture('inactive-release',()=>post.composer.releaseInactiveTargets());
      capture('active-again',()=>{sfx.test('damage',{amount:50,hold:8});sfx.update(1/60,null);});
      capture('native-reset',()=>post.composer.reset());
      reference._disposeComposer(sfx.pass);reference=null;
      post._disposeComposer(sfx.pass);
      G.env=null;
    }
    const beforeDispose=liveTextures.size;
    sfx.dispose();geometry.dispose();material.dispose();renderer.dispose();
    const bound=Math.max(...rows.filter(r=>r.quality==='low').map(r=>r.liveTextures));
    const resources={beforeDispose,afterDispose:liveTextures.size,bound,
      passed:liveTextures.size===0&&rows.every(r=>r.liveTextures<=bound)};
    // Context restoration intentionally requires a reload: the paint atlas
    // contents are lost. Verify that a live HDR stack keeps that production
    // guard instead of allocating/resuming after the restored notification.
    const recoveryPost=new Renderer(document.body,settings),recoveryScene=new THREE.Scene();
    const recoveryGeometry=new THREE.PlaneGeometry(2,2),recoveryMaterial=new THREE.MeshBasicMaterial({color:0x5378ab});
    recoveryScene.add(new THREE.Mesh(recoveryGeometry,recoveryMaterial));recoveryPost.setScene(recoveryScene,camera);
    const recoveryFx=new ScreenFX(recoveryPost,G);recoveryFx.pass.enabled=true;
    G.match={paused:false};recoveryPost.render();
    const recoveryGl=recoveryPost.renderer.getContext(),extension=recoveryGl.getExtension('WEBGL_lose_context');
    let contextRecovery={available:!!extension,passed:false};
    if(extension){
      const event=type=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(type+' timeout')),5000);
        recoveryPost.renderer.domElement.addEventListener(type,()=>{clearTimeout(timer);resolve();},{once:true});});
      const lost=event('webglcontextlost');extension.loseContext();await lost;
      const restored=event('webglcontextrestored');await new Promise(resolve=>setTimeout(resolve,0));extension.restoreContext();await restored;
      const frame=recoveryPost.renderer.info.render.frame,target=recoveryPost.composer.renderTarget1;
      recoveryPost.render();
      contextRecovery={available:true,restored:!recoveryGl.isContextLost(),requiresReload:recoveryPost._contextLost,
        matchPaused:G.match.paused,frameUnchanged:frame===recoveryPost.renderer.info.render.frame,
        targetUnchanged:target===recoveryPost.composer.renderTarget1};
      contextRecovery.passed=Object.values(contextRecovery).every(Boolean);
    }
    recoveryPost._disposeComposer(recoveryFx.pass);recoveryFx.dispose();
    recoveryGeometry.dispose();recoveryMaterial.dispose();recoveryPost.renderer.dispose();
    return {rows,contextLost:gl.isContextLost(),resources,contextRecovery,profile:post.mobile};
  }finally{
    reference?._disposeComposer(sfx.pass);post._disposeComposer(sfx.pass);
    gl.createTexture=nativeCreate;gl.deleteTexture=nativeDelete;
  }
}
