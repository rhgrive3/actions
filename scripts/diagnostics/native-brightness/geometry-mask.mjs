// Serializable diagnostic callback. No gameplay positions or visibility acceptance changed.
export function captureNativeGeometryMask() {
  const {NG:G,T}=globalThis,g=G?.game,r=G?.renderer;
  if(!g?.nativeWorld||G.level?.manifest?.id!=='inkblot'||g._skipRender!==true)throw Error('Frozen native Inkblot required');
  const native=new Set();g.nativeWorld.display.group.traverse(o=>{if(o.isMesh)native.add(o);});
  for(const mesh of native)if(Array.isArray(mesh.material)||!mesh.material?.isMeshStandardMaterial)throw Error('Reviewed mask requires single native MeshStandardMaterial: '+mesh.name);
  const gl=r.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
  const saved=new Map(),created=[],state={target:r.getRenderTarget(),tone:r.toneMapping,output:r.outputColorSpace,autoClear:r.autoClear,background:G.scene.background,override:G.scene.overrideMaterial,xr:r.xr.enabled,shadowEnabled:r.shadowMap.enabled};
  const viewport=r.getViewport(new T.Vector4()),scissor=r.getScissor(new T.Vector4()),scissorTest=r.getScissorTest();
  const clear=r.getClearColor(new T.Color()).clone(),alpha=r.getClearAlpha();
  const target=new T.WebGLRenderTarget(w,h,{type:T.UnsignedByteType,format:T.RGBAFormat,depthBuffer:true,stencilBuffer:false,samples:0});
  target.texture.colorSpace=T.NoColorSpace;
  const basic=new T.MeshBasicMaterial({color:0,side:T.DoubleSide,toneMapped:false,fog:false});created.push(basic);
  const classified=new T.ShaderMaterial({side:T.DoubleSide,toneMapped:false,vertexShader:'varying vec3 wp; void main(){vec4 p=modelMatrix*vec4(position,1.0);wp=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}',fragmentShader:'varying vec3 wp; void main(){vec3 n=normalize(cross(dFdx(wp),dFdy(wp)));if(dot(n,cameraPosition-wp)<0.)n=-n;float y=n.y;gl_FragColor=vec4(y>0.85?vec3(1,0,0):(abs(y)<0.25?vec3(0,1,0):vec3(0)),1);}'});created.push(classified);
  // Paint shader discards only definitely empty texels. Expand filtering footprint
  // by one texel conservatively so barely painted edges cannot enter the mask.
  const ink=new T.ShaderMaterial({side:T.DoubleSide,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,uniforms:{paint:{value:G.paint.texture},texel:{value:1/G.paint.size}},vertexShader:'attribute vec2 paintUv; varying vec2 puv; void main(){puv=paintUv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'uniform sampler2D paint;uniform float texel;varying vec2 puv;void main(){float a=0.;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++)a=max(a,texture2D(paint,puv+vec2(float(x),float(y))*texel).a);if(a<0.001)discard;gl_FragColor=vec4(0,0,0,1);}'});created.push(ink);
  let eligible=0;
  try {
    if(!G.paint.texture||!Number.isFinite(G.paint.size)||!g.levelMesh.geometry?.getAttribute('paintUv'))throw Error('Actual paint atlas and UV required');
    G.scene.traverse(o=>{
      if(!o.material)return;
      saved.set(o,o.material);
      if(o===g.levelMesh){o.material=ink;return;}
      // SpriteMaterial preserves billboarding; MeshBasicMaterial would render
      // its quad in the wrong position. Three retains skinning/morph/instancing
      // for MeshBasicMaterial automatically from the actual mesh object.
      if(o.isSprite){const old=o.material,c=new T.SpriteMaterial({color:0,rotation:old.rotation||0,sizeAttenuation:old.sizeAttenuation,depthWrite:true,depthTest:true,transparent:false,toneMapped:false,fog:false});created.push(c);o.material=c;return;}
      const mats=Array.isArray(o.material)?o.material:[o.material];
      // Exclude transparent/cutout sources entirely rather than invent alpha coverage.
      const opaque=native.has(o)&&mats.every(m=>!m.transparent&&!m.alphaTest&&!m.alphaMap);
      o.material=opaque?classified:basic;if(opaque)eligible++;
    });
    if(!eligible)throw Error('No eligible opaque native mesh');
    r.xr.enabled=false;r.shadowMap.enabled=false;r.toneMapping=T.NoToneMapping;r.outputColorSpace=T.LinearSRGBColorSpace;r.autoClear=true;
    G.scene.background=null;G.scene.overrideMaterial=null;r.setRenderTarget(target);r.setViewport(0,0,w,h);r.setScissorTest(false);r.setClearColor(0,1);r.clear();r.render(G.scene,G.camera);
    const bytes=new Uint8Array(w*h*4);r.readRenderTargetPixels(target,0,0,w,h,bytes);
    const error=gl.getError();if(error)throw Error('Geometry mask GL error '+error);
    const labels=new Uint8Array(w*h);let floor=0,wall=0;
    for(let p=0;p<labels.length;p++){const i=p*4;if(bytes[i]===255&&bytes[i+1]===0&&bytes[i+2]===0){labels[p]=1;floor++;}else if(bytes[i]===0&&bytes[i+1]===255&&bytes[i+2]===0){labels[p]=2;wall++;}}
    // Erode five pixels: production FXAA samples at most four pixels along its span.
    const eroded=labels.slice();for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=y*w+x,l=labels[p];if(!l)continue;if(x<5||y<5||x>=w-5||y>=h-5){eroded[p]=0;continue;}for(let yy=-5;yy<=5;yy++)for(let xx=-5;xx<=5;xx++)if(labels[p+yy*w+xx]!==l)eroded[p]=0;}
    let s='';for(let i=0;i<eroded.length;i+=8192)s+=String.fromCharCode(...eroded.subarray(i,i+8192));
    return {width:w,height:h,orientation:'bottom-up',labels:btoa(s),eligibleMeshes:eligible,preErosion:{floor,wall},scope:'Opaque native floor/wall geometric-normal mask; other geometry and painted texels occlude; five-pixel erosion; conservative exclusions; no DOM HUD or sky'};
  } finally {
    for(const [o,m]of saved)o.material=m;
    G.scene.background=state.background;G.scene.overrideMaterial=state.override;
    r.toneMapping=state.tone;r.outputColorSpace=state.output;r.autoClear=state.autoClear;r.xr.enabled=state.xr;r.shadowMap.enabled=state.shadowEnabled;
    r.setRenderTarget(state.target);r.setViewport(viewport);r.setScissor(scissor);r.setScissorTest(scissorTest);r.setClearColor(clear,alpha);
    target.dispose();for(const m of created)m.dispose();
  }
}
