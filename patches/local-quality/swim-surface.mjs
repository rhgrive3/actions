// A low bow, torn shoulder sheets and returning ligaments. These are INKWAVE visual
// settings; their curves are not claimed as extracted retail VFX parameters.
import * as THREE from 'three';
import {warmProgramReflection} from './shader-program-reflection.mjs';
import { G } from '../../src/core/ctx.js';
import { swimSplashVisible } from '../splatoon3/runtime/swim-stealth.mjs';

const LIMIT=4, TAU=Math.PI*2;
const PRE_RENDER=Symbol.for('inkwave.swim-film.pre-render.v1');
const _frustum=new THREE.Frustum(),_view=new THREE.Matrix4(),_sphere=new THREE.Sphere();
const fract=x=>x-Math.floor(x);
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));

export function createSwimFilmGeometry() {
  const positions=[],data=[],indices=[],patches=[];
  const grid=(kind,nu,nv)=>{
    const start=positions.length/3;
    for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){positions.push(0,0,0);data.push(i/nu,j/nv,kind);}
    for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){
      const a=start+j*(nu+1)+i,b=a+1,c=a+nu+1,d=c+1;
      indices.push(a,c,b,b,c,d);
    }
    patches.push({kind,start,nu,nv});
  };
  // The filled bow joins the two rooted shoulders. Four strips stretch out of
  // the rear breakup; only four small drops are detached. One draw, 687 vertices.
  grid(0,20,6);grid(1,20,6);grid(2,16,4);
  for(let i=0;i<8;i++)grid(3+i,6,i<4?6:3);
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('filmData',new THREE.Float32BufferAttribute(data,3));g.setIndex(indices);
  g.userData.patches=patches;g.userData.filmHoles=Array.from({length:6},()=>new THREE.Vector4());
  g.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,.18,-.28),1.5);
  updateSwimFilmGeometry(g,0,1);return g;
}

const hash=n=>fract(Math.sin(n*127.1+311.7)*43758.5453);
export function updateSwimFilmGeometry(g,time,speedK,turn=0) {
  const p=g.attributes.position.array,k=clamp(speedK),spread=Math.sqrt(k);
  // Openings travel from the bow towards the returning rear edge. They are
  // shared by both shoulders, with a phase offset in the shader, never the bow.
  for(let i=0;i<6;i++)g.userData.filmHoles[i].set(
    fract(time*1.25+i/6+.025*Math.sin(time*2.1+i*3.7)),.84+.17*Math.sin(time*2.7+i*2.4),
    .077+.018*(1+Math.sin(i*4.1)),.21+.045*(1+Math.cos(i*2.7)));
  for(const patch of g.userData.patches){
    const {kind,start,nu,nv}=patch;
    // Birth-to-return ballistic arcs vary per birth and actor phase. The drop
    // collapses at BOTH surface crossings, so reseeding cannot pop in midair.
    const id=kind-3,clock=time*(1.9+Math.max(0,id)*.137)+Math.max(0,id)*.618034;
    const cycle=Math.floor(clock),age=fract(clock),seed=hash(cycle*19+id*73);
    const pulse=Math.sin(Math.PI*age),side=id%2?-1:1;
    // Shoulder columns share time/u inputs. Keep each vertex's arithmetic and
    // final row-major address, while evaluating invariant sines once per column.
    if(kind<2){
      const sign=kind===0?1:-1;
      for(let i=0;i<=nu;i++){
        const u=i/nu,wave=u*15-time*14+kind*2.3,waveSin=Math.sin(wave);
        const irregular=.78+.15*waveSin+.07*Math.sin(u*25-time*9.3+kind);
        const edge=Math.sin(Math.PI*u),belly=Math.sin(Math.PI*Math.min(1,u*1.4));
        const curlK=.78+.09*Math.sin(wave*.61),height=k*(.18+.09*belly)*edge*irregular;
        for(let j=0;j<=nv;j++){
          const v=j/nv,curl=v*Math.PI*curlK,curlSin=Math.sin(curl);
          let x=sign*(.19*(1-.4*u)+.10*belly-.20*curlSin*edge+.02*v*v*waveSin);
          let z=.19-u*.78-v*.07*edge;const y=.003+height*curlSin;
          x*=spread;z*=spread;x+=turn*.10*u*u;
          const n=(start+j*(nu+1)+i)*3;p[n]=x;p[n+1]=y;p[n+2]=z;
        }
      }
      continue;
    }
    for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){
      const u=i/nu,v=j/nv;let x,y,z;
      if(kind<3){
        const shoulder=kind<2,sign=kind===0?1:-1;
        const wave=u*15-time*14+kind*2.3;
        const irregular=.78+.15*Math.sin(wave)+.07*Math.sin(u*25-time*9.3+kind);
        if(shoulder){
          const edge=Math.sin(Math.PI*u),belly=Math.sin(Math.PI*Math.min(1,u*1.4));
          const curl=v*Math.PI*(.78+.09*Math.sin(wave*.61));
          const height=k*(.18+.09*belly)*edge*irregular;
          // A curved cross-section has volume from low cameras too. The rim
          // rolls inward; its root stays on the supporting ink plane.
          x=sign*(.19*(1-.4*u)+.10*belly-.20*Math.sin(curl)*edge+.02*v*v*Math.sin(wave));
          z=.19-u*.78-v*.07*edge;
          y=.003+height*Math.sin(curl);
        }else{
          const a=(u-.5)*Math.PI;
          // A filled pressure mound, not a horseshoe with an empty centre.
          x=Math.sin(a)*.19;
          z=.19+Math.cos(a)*(.20-v*.44);
          y=.003+k*.17*Math.cos(a)*Math.sin(Math.PI*v)
            *(.80+.12*Math.sin(u*13-time*11)+.08*Math.sin(v*11+u*7-time*8));
        }
        x*=spread;z*=spread;x+=turn*.10*u*u;
      }else if(kind<7){
        // A finite sheet stretches and falls back before the next birth. Width
        // goes to zero at both crossings, preventing a midair reset/pop.
        const envelope=pulse*pulse,along=v,theta=TAU*u;
        const width=(.018+.014*seed)*envelope*Math.sin(Math.PI*along);
        const travel=age*.30+along*(.18+.11*seed)*envelope;
        const across=id<2?.11-.18*Math.sin(Math.PI*along):.11+.07*seed+age*(.05+.07*seed)+along*.04;
        x=(side*across+Math.sin(theta)*width)*spread;
        z=(-.20-id*.07-travel)*spread+turn*.12*along*envelope;
        y=.003+k*envelope*(.13+.11*seed)*Math.sin(Math.PI*along)
          +(1+Math.cos(theta))*width*.23*spread;
      }else{
        const radius=(.008+.009*seed)*spread*pulse*pulse;
        const theta=TAU*u,phi=Math.PI*v;
        // y = 4 h age(1-age) is the bounded ballistic rise and fall. A drop
        // travels away from its surface birth instead of levitating in place.
        x=side*(.13+age*(.16+.10*seed))*spread+Math.cos(theta)*Math.sin(phi)*radius;
        z=(-.05-(id-4)*.14-age*(.32+.18*seed))*spread+Math.sin(theta)*Math.sin(phi)*radius;
        y=.003+4*k*(.12+.09*seed)*age*(1-age)+(1+Math.cos(phi))*radius*.8;
      }
      const n=(start+j*(nu+1)+i)*3;p[n]=x;p[n+1]=y;p[n+2]=z;
    }
  }
  g.attributes.position.needsUpdate=true;g.computeVertexNormals();
}

// Sneaking keeps only a small local surface disturbance. Ninja Squid and an
// explicit replicated splash suppression still hide it; no gameplay flags,
// trail visibility, audio or network visibility decisions are changed here.
export function swimSurfaceSpeed(a){
  if(!a?.vel)return 0;
  if(!a.climbing)return Math.hypot(a.vel.x,a.vel.z);
  const n=a.anim?.wallNormal,nn=n?.lengthSq();
  if(!(nn>.5))return 0;
  const vn=a.vel.dot(n);return Math.sqrt(Math.max(0,a.vel.lengthSq()-vn*vn/nn));
}

export function swimSurfaceVisible(a){
  if(a.remote&&a.s3?.netSwimVisibility?.splash===false)return false;
  return !a.s3?.modifiers?.ninjaSquid||swimSplashVisible(a);
}

function material(light,filmHoles) {
  const m=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.24,metalness:0,clearcoat:1,clearcoatRoughness:.045,envMapIntensity:1.0,side:THREE.DoubleSide});
  const time={value:0},holes={value:filmHoles};m.userData.filmTime=time;m.userData.filmHoles=holes;
  m.onBeforeCompile=shader=>{
    shader.uniforms.uFilmTime=time;shader.uniforms.uFilmHoles=holes;shader.uniforms.uFilmSun={value:light.sunDir};
    shader.vertexShader='attribute vec3 filmData; varying vec3 vFilmData;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFilmData=filmData;');
    shader.fragmentShader='uniform float uFilmTime; uniform vec4 uFilmHoles[6]; uniform vec3 uFilmSun; varying vec3 vFilmData;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
      if(vFilmData.z<1.5){
        float u=vFilmData.x,v=vFilmData.y;
        float curl=3.14159265*(.78+.09*sin((u*15.0-uFilmTime*14.0+vFilmData.z*2.3)*.61));
        // Only the shoulders tear. Keep the roots and the rounded leading bow
        // filled; the opposite shoulder breaks at a different phase.
        for(int i=0;i<6;i++){
          float f=float(i);
          vec4 hole=uFilmHoles[i];
          hole.x=fract(hole.x+vFilmData.z*.31);
          hole.y+=.06*sin(f*3.7+vFilmData.z*2.1);
          // Both sides of a curled sheet use the same normalized height. A
          // UV-space cut on just one side is backed by solid liquid on the
          // other, so the tear disappears when the camera moves around it.
          vec2 q=(vec2(u,sin(v*curl))-hole.xy)/hole.zw;
          float torn=1.0+.16*sin(q.x*3.0+q.y*5.0+uFilmTime*4.0+f);
          if(v>.18 && dot(q,q)<torn)discard;
        }
        float rim=.90+.10*sin(u*39.0-uFilmTime*15.0+vFilmData.z*2.3);
        if(v>rim)discard;
      }
      if(vFilmData.z>1.5 && vFilmData.z<2.5){
        // The leading pressure mound stays filled. Its rear edge stretches
        // into the shoulder breakup instead of ending in a separate oval cap.
        float edge=.80+.15*sin(vFilmData.x*23.0-uFilmTime*12.0);
        if(vFilmData.y>edge)discard;
      }

    `);
    // Match the painted ink's pigment/coat balance. Broad white Fresnel would
    // bleach the whole membrane, especially blue and purple team colours.
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_physical_fragment>',`#include <lights_physical_fragment>
      material.specularColor *= .3;
      material.specularColorBlended *= .3;
      material.specularF90 = .35;
      material.clearcoatF0 = vec3(.055);
      material.clearcoatF90 = .3;
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_maps>',`
      irradiance = mix(irradiance, vec3(dot(irradiance, vec3(.2126,.7152,.0722))), .7);
      #include <lights_fragment_maps>
      #if defined(USE_ENVMAP) && defined(RE_IndirectSpecular) && defined(USE_CLEARCOAT)
        float coatLum=dot(clearcoatRadiance,vec3(.2126,.7152,.0722));
        vec3 inkTint=diffuse/max(dot(diffuse,vec3(.2126,.7152,.0722)),.001);
        clearcoatRadiance=mix(clearcoatRadiance,mix(vec3(coatLum),coatLum*min(inkTint,vec3(2.5)),.3),.6);
      #endif
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`#include <opaque_fragment>
      vec3 filmEye=normalize(vViewPosition);
      vec3 filmHalf=normalize(filmEye+normalize(mat3(viewMatrix)*uFilmSun));
      float filmShine=pow(max(dot(normal,filmHalf),0.0),110.0);
      // A small sharp glint on folds, rather than whitening every outer edge.
      float filmRim=pow(clamp(1.0-abs(dot(normal,filmEye)),0.0,1.0),8.0);
      gl_FragColor.rgb+=vec3(1.0,.99,.97)*(filmShine*2.4+filmRim*.18);
    `);
  };
  return m;
}

// The conservative local sphere contains the sheets, ligaments and four drops.
// The vertex shader does not move them; an unseen sphere cannot draw a splash.
function seenBy(camera,mesh){
  if(!camera?.projectionMatrix||!camera.matrixWorldInverse||camera.isArrayCamera)return true;
  _view.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_view,THREE.WebGLCoordinateSystem,camera.reversedDepth);
  return _frustum.intersectsSphere(_sphere.copy(mesh.geometry.boundingSphere).applyMatrix4(mesh.matrixWorld));
}

// three.js calls Scene.onBeforeRender before it culls the scene and uploads geometry. A film whose shape was held
// back (its camera at FX update time could not see it) is generated there for any camera that can, so every drawn
// frame shows the same shape as when it was regenerated each tick.
function preRenderSet(scene){
  let set=scene[PRE_RENDER];
  if(!set){
    set=new Set();Object.defineProperty(scene,PRE_RENDER,{value:set});
    const before=scene.onBeforeRender;
    scene.onBeforeRender=function(renderer,sc,camera,target){
      const result=before.call(this,renderer,sc,camera,target);
      for(const surface of set)surface.flush(camera);
      return result;
    };
  }
  return set;
}

class SwimSurface {
  constructor(fx){
    this.root=new THREE.Group();this.root.name='SwimConnectedFilm';fx.root.add(this.root);
    this.slots=[];this.time=0;this.disposed=false;
    this.scene=fx.scene?.isScene?fx.scene:null;this.scene&&preRenderSet(this.scene).add(this);
  }
  slot(fx){
    let s=this.slots.find(s=>!s.actor);
    if(!s&&this.slots.length<LIMIT){
      const geometry=createSwimFilmGeometry(),mesh=new THREE.Mesh(geometry,material(fx._light,geometry.userData.filmHoles));
      mesh.name='InkSwimFilm';mesh.frustumCulled=false;mesh.visible=false;mesh.castShadow=false;mesh.receiveShadow=false;
      this.root.add(mesh);s={actor:null,mesh,last:0,yaw:0,phase:this.slots.length*1.37,basis:new THREE.Matrix4(),up:new THREE.Vector3(),forward:new THREE.Vector3(),right:new THREE.Vector3()};this.slots.push(s);
    }
    return s;
  }
  touch(actor,fx){
    if(!actor||!actor.pos||!actor.vel||this.disposed)return;
    if(G.camera?.position?.distanceToSquared(actor.pos)>35*35)return;
    let s=this.slots.find(s=>s.actor===actor)||this.slot(fx);
    if(!s&&actor.isLocal)s=this.slots.find(s=>!s.actor?.isLocal);
    if(s){if(s.actor!==actor)s.yaw=Math.atan2(actor.vel.x,actor.vel.z);s.actor=actor;s.last=fx._time;}
  }
  update(fx,camera){
    this.time=fx._time;
    for(const s of this.slots){
      const a=s.actor,wall=!!a?.climbing,sp=swimSurfaceSpeed(a);
      // A touch made before this outer frame's native FX substeps still owns
      // the surface on that render. Do not expire it merely because a visible
      // frame took more than 80 ms; an untouched subsequent frame still expires.
      const touchedThisFrame=Number.isFinite(fx._fxFrameStart)&&s.last>=fx._fxFrameStart&&s.last<=this.time;
      const alive=a&&a.alive!==false&&a.form==='squid'&&(wall&&a.wallHit?.hit||a.submerged&&a.grounded)&&sp>1e-4&&swimSurfaceVisible(a)&&(this.time-s.last<.08||touchedThisFrame)&&(!G.actors||G.actors.includes(a));
      s.mesh.visible=!!alive;
      if(!alive){s.actor=null;s.pending=false;continue;}
      const yaw=Math.atan2(a.vel.x,a.vel.z),delta=Math.atan2(Math.sin(yaw-s.yaw),Math.cos(yaw-s.yaw));s.yaw=yaw;
      s.up.copy((wall?a.anim?.wallNormal:a.groundN)||THREE.Object3D.DEFAULT_UP).normalize();
      if(s.up.lengthSq()<.5){s.mesh.visible=false;s.actor=null;s.pending=false;continue;}
      s.forward.copy(a.vel).addScaledVector(s.up,-s.up.dot(a.vel));
      if(s.forward.lengthSq()<1e-8){s.mesh.visible=false;s.actor=null;s.pending=false;continue;}
      s.forward.normalize();
      s.right.crossVectors(s.up,s.forward).normalize();s.forward.crossVectors(s.right,s.up).normalize();
      s.basis.makeBasis(s.right,s.up,s.forward);
      s.mesh.position.copy(a.pos);
      if(wall)s.mesh.position.addScaledVector(s.up,s.up.dot(a.wallHit.point)-s.up.dot(a.pos));
      else{
        // Grounded Actor clearance and step presentation are not the liquid
        // plane. Anchor to the actual supporting collision face, including
        // slopes, rather than making the splash float above it.
        const face=G.level?.faces?.[a.ground?.face];
        if(face?.origin)s.mesh.position.addScaledVector(s.up,s.up.dot(face.origin)-s.up.dot(a.pos));
      }s.mesh.quaternion.setFromRotationMatrix(s.basis);s.mesh.material.color.copy(a.color);s.mesh.material.emissive.copy(a.color).multiplyScalar(.06);
      const t=this.time+s.phase;s.mesh.material.userData.filmTime.value=t;

      // Bounded pooled geometry; skip its shape update while no camera sees it.
      s.shapeTime=this.time+s.phase;s.shapeSpeed=sp/11.8;s.shapeTurn=clamp(delta/Math.max(1e-4,fx._dt)*.04,-1,1);s.pending=true;
      if(camera===undefined||(s.mesh.updateMatrixWorld(),seenBy(camera,s.mesh)))this.shape(s);
    }
  }
  shape(s){s.pending=false;updateSwimFilmGeometry(s.mesh.geometry,s.shapeTime,s.shapeSpeed,s.shapeTurn);}
  flush(camera){for(const s of this.slots)if(s.pending&&s.mesh.visible&&seenBy(camera,s.mesh))this.shape(s);}
  clear(){this.warmPromise=null;for(const s of this.slots){s.actor=null;s.mesh.visible=false;s.pending=false;}}
  dispose(){if(this.disposed)return;this.disposed=true;this.scene?.[PRE_RENDER]?.delete(this);this.root.removeFromParent();for(const s of this.slots){s.mesh.geometry.dispose();s.mesh.material.dispose();s.actor=null;}this.slots.length=0;this.warmTarget?.dispose();this.warmTarget=null;this.warmCleanup?.();this.warmCleanup=null;this.warmPromise=null;}
}

// Compile the actual FX-owned pooled geometry, including filmData and the
// physical-material hook. The first swimmer reuses this slot and material.
export function warmSwimSurface(fx,renderer,camera,target){
  if(!fx?.root||!fx._light||fx._inkVolumeDisposed||!renderer?.compileAsync||!camera||!target)return null;
  const surface=fx.swimSurface||=(new SwimSurface(fx));
  if(surface.disposed)return null;
  // Loading gives each Character a shadow-batch renderer facade. They still
  // share one GL context and one live film pool, including completed programs.
  const context=renderer.getContext?.()||renderer;
  if(surface.warmContext!==context){
    surface.warmCleanup?.();surface.warmPromise=null;surface.warmContext=context;
    const canvas=context.canvas||renderer.domElement,invalidate=()=>{surface.warmPromise=null;};
    for(const event of ['webglcontextlost','webglcontextrestored'])canvas?.addEventListener?.(event,invalidate);
    surface.warmCleanup=()=>{for(const event of ['webglcontextlost','webglcontextrestored'])canvas?.removeEventListener?.(event,invalidate);};
  }
  const slot=surface.slots[0]||surface.slot(fx);
  const renderTarget=G.post?.composer?.readBuffer||(surface.warmTarget||=(new THREE.WebGLRenderTarget(4,4,{type:THREE.HalfFloatType})));
  if(surface.warmPromise&&surface.warmScene===target&&surface.warmRenderTarget===renderTarget&&surface.warmMaterialVersion===slot.mesh.material.version)return surface.warmPromise;
  const previous=renderer.getRenderTarget();
  const face=renderer.getActiveCubeFace?.()||0,mip=renderer.getActiveMipmapLevel?.()||0;
  surface.warmPromise=null;
  let work;
  try{
    renderer.setRenderTarget(renderTarget);
    work=renderer.compileAsync(slot.mesh,camera,target);
  }finally{renderer.setRenderTarget(previous,face,mip);}
  const pending=Promise.resolve(work).then(value=>{
    if(!surface.disposed&&surface.warmContext===context&&surface.warmPromise===pending)warmProgramReflection(renderer,slot.mesh.material);
    return value;
  }).catch(error=>{if(surface.warmPromise===pending)surface.warmPromise=null;throw error;});
  surface.warmScene=target;surface.warmRenderTarget=renderTarget;surface.warmMaterialVersion=slot.mesh.material.version;surface.warmPromise=pending;
  return pending;
}

export function touchSwimSurface(fx,actor){
  // Warm-up calls and legacy users without an Actor cannot create a free-floating film.
  if(!actor||fx._inkVolumeDisposed)return;
  (fx.swimSurface||=(new SwimSurface(fx))).touch(actor,fx);
}
export function updateSwimSurface(fx,camera){fx.swimSurface?.update(fx,camera);}
export function clearSwimSurface(fx){fx.swimSurface?.clear();}
export function disposeSwimSurface(fx){fx.swimSurface?.dispose();fx.swimSurface=null;}
