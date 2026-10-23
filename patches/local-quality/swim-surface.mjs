// Continuous ink film, not a particle emitter. Shapes are INKWAVE approximations
// of the connected, torn liquid crests in Nintendo's JP squid-swimming footage.
import * as THREE from 'three';
import { G } from '../../src/core/ctx.js';
import { swimSplashVisible } from '../splatoon3/runtime/swim-stealth.mjs';

const LIMIT=4, TAU=Math.PI*2;
const PRE_RENDER=Symbol.for('inkwave.swim-film.pre-render.v1');
const _frustum=new THREE.Frustum(),_view=new THREE.Matrix4(),_sphere=new THREE.Sphere();
const fract=x=>x-Math.floor(x);
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));

export function createSwimFilmGeometry() {
  const positions=[],data=[],indices=[],patches=[];
  // A breaking bow, swept-back shoulders and a perforated trailing web.
  const grid=(kind,nu,nv)=>{
    const start=positions.length/3;
    for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){positions.push(0,0,0);data.push(i/nu,j/nv,kind);}
    for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){
      const a=start+j*(nu+1)+i,b=a+1,c=a+nu+1,d=c+1;
      indices.push(a,c,b,b,c,d);
    }
    patches.push({kind,start,nu,nv});
  };
  grid(0,48,6);grid(1,40,6);grid(2,24,8);grid(3,24,8);
  // Forked ribbons stay rooted on the film and collapse into the surface.
  for(const kind of [4,5,7,8])grid(kind,12,4);grid(6,32,9);
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('filmData',new THREE.Float32BufferAttribute(data,3));
  g.setIndex(indices);g.userData.patches=patches;g.userData.filmHoles=Array.from({length:6},()=>new THREE.Vector4());
  g.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,.2,-.25),1.6);
  updateSwimFilmGeometry(g,0,1);
  return g;
}

export function updateSwimFilmGeometry(g,time,speedK,turn=0) {
  const p=g.attributes.position.array,k=clamp(speedK),flow=time*24;
  const holes=g.userData.filmHoles;
  // Openings travel aft and grow as the skin stretches. Wrap beyond the
  // chart's ends so a tear cannot abruptly pop into the middle of a sheet.
  for(let i=0;i<6;i++){
    const age=fract(time*(.63+i*.047)+i*.381966);
    holes[i].set(-.3+age*1.6,.48+.29*fract(i*.618034)+.06*Math.sin(time*3.7+i*2.3),.045+age*.09,.07+age*.13);
  }
  for(const patch of g.userData.patches){
    const {kind,start,nu,nv}=patch;
    for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){
      const u=i/nu,v=j/nv;let x,y,z;
      if(kind<2){
        // Curling shoulder curtains with an overhang, not a height field or
        // a closed mound. Asymmetric profiles prevent a crown/fence outline.
        const side=kind===0?1:-1;
        const edge=.58+.38*(.5+.5*Math.sin(u*19-flow*.74+.7*Math.sin(u*13+flow*.22+kind)))**3;
        const curve=v*Math.PI*.94*edge,along=Math.sin(Math.PI*u);
        const lift=(kind===0?.16:.14)+k*.06+.035*Math.sin(u*13-flow*.7+kind*2.1);
        x=side*(.25+.05*along-.13*Math.sin(curve));
        z=.32-u*(kind===0?.86:.96)-.04*v+.035*Math.sin(u*17-flow)*v;
        y=.006+lift*(1-Math.cos(curve))*.5*(.45+.55*along);
        x+=side*.015*Math.sin(u*19+v*11-flow*.8)*v;
        for(const hole of holes){const d=Math.hypot((u-hole.x)/(hole.z*1.3),(v-hole.y)/(hole.w*1.3));y+=.009*k*Math.exp(-(((d-1)/.3)**2));}
      }else if(kind===2){
        const angle=(u-.5)*1.8,curve=v*Math.PI*.78;
        const radius=.18-.10*Math.sin(curve);
        x=Math.sin(angle)*(radius+.12);
        z=.10+Math.cos(angle)*(radius+.15);
        y=.006+(.08+.08*k+.025*Math.sin(u*13-flow))*(1-Math.cos(curve))*.5;
      }else if(kind===3){
        // A very open stretched wake joins the two shoulders behind the bow.
        x=(u*2-1)*(.28-.08*v+.04*Math.sin(v*11-flow));z=.12-v*1.12;
        y=.006+Math.sin(Math.PI*u)*Math.sin(Math.PI*v)*(.04+.05*k+.035*k*Math.sin(u*11+v*13-flow*.7));
        x+=turn*.04*v*v;
      }else if(kind===6){
        const a=u*Math.PI*2,r=v,edge=1-r*r;
        x=Math.sin(a)*r*.22;z=.21+Math.cos(a)*r*.25;
        y=.006+(.09+.035*k+.015*Math.sin(flow*1.3))*edge*edge+.025*k*Math.sin(a*4-flow*1.1)*Math.sin(Math.PI*r)**2;
      }else{
        const piece=kind<6?kind-4:kind-5,side=piece%2?-1:1;
        const age=fract(time*(1.7+piece*.137)+piece*.269);
        const pulse=Math.sin(Math.PI*age)**2,fan=piece<2?1:-.35;
        const width=(.025+.065*pulse)*Math.sin(Math.PI*u)**.6;
        x=side*(.23+u*(.18+.13*pulse)*fan)+width*(v-.5);
        z=-.24-piece*.045-u*(.48+.16*pulse);
        // Roots stay on the main film; thin forks stretch, sag and return to
        // the ink, with each branch on a different smooth time envelope.
        y=.007+Math.sin(Math.PI*u)*(.03+.08*k)*pulse*Math.sin(Math.PI*v);
        x+=turn*.035*u*u;
      }
      const n=(start+j*(nu+1)+i)*3;p[n]=x;p[n+1]=y;p[n+2]=z;
    }
  }
  g.attributes.position.needsUpdate=true;g.computeVertexNormals();
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
      if(vFilmData.z<1.5 || (vFilmData.z>2.5 && vFilmData.z<3.5)){
        float u=vFilmData.x,v=vFilmData.y;
        // Uneven openings in one continuous skin, staggered rather than rows
        // of identical scallops. The leading bow remains a filled liquid fold.
        for(int i=0;i<6;i++){
          float f=float(i);
          vec4 hole=uFilmHoles[i];
          if(vFilmData.z>2.5){
            hole=vec4(.5+.23*sin(f*2.4+uFilmTime*2.0),-.3+1.6*fract(uFilmTime*(.51+f*.037)+f*.618034),.13,.17);
          }
          if(vFilmData.z>2.5 && abs(u-.5-.06*sin(v*13.0+uFilmTime*9.0))>.28+.14*sin(v*19.0-uFilmTime*12.0))discard;
          float scale=vFilmData.z>2.5?1.75:1.3;
          vec2 q=(vec2(u,v)-hole.xy)/(hole.zw*scale);
          float torn=1.0+.16*sin(q.x*3.0+q.y*5.0+uFilmTime*4.0+f);
          if(dot(q,q)<torn)discard;
        }
      }
      if(vFilmData.z>3.5 && abs(vFilmData.z-6.0)>.25){
        float split=smoothstep(.38,.95,vFilmData.x)*.23;
        if(abs(vFilmData.y-.5)<split)discard;
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

// The film's bounding sphere (r 1.6) holds every shape the generator can make (vertices stay within ~0.91 of its
// centre) and the vertex shader does not move them, so a camera whose frustum misses the sphere cannot see the film.
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
  touch(actor,fx){
    if(!actor||!actor.pos||!actor.vel||this.disposed)return;
    if(G.camera?.position?.distanceToSquared(actor.pos)>35*35)return;
    let s=this.slots.find(s=>s.actor===actor);
    if(!s)s=this.slots.find(s=>!s.actor);
    if(!s&&this.slots.length<LIMIT){
      const geometry=createSwimFilmGeometry(),mesh=new THREE.Mesh(geometry,material(fx._light,geometry.userData.filmHoles));
      mesh.name='InkSwimFilm';mesh.frustumCulled=false;mesh.visible=false;mesh.castShadow=false;mesh.receiveShadow=false;
      this.root.add(mesh);s={actor:null,mesh,last:0,yaw:0,phase:this.slots.length*1.37,basis:new THREE.Matrix4(),up:new THREE.Vector3(),forward:new THREE.Vector3(),right:new THREE.Vector3()};this.slots.push(s);
    }
    if(!s&&actor.isLocal)s=this.slots.find(s=>!s.actor?.isLocal);
    if(s){if(s.actor!==actor)s.yaw=Math.atan2(actor.vel.x,actor.vel.z);s.actor=actor;s.last=fx._time;}
  }
  update(fx,camera){
    this.time=fx._time;
    for(const s of this.slots){
      const a=s.actor,sp=a?Math.hypot(a.vel.x,a.vel.z):0;
      const alive=a&&a.alive!==false&&a.form==='squid'&&a.submerged&&a.grounded&&!a.climbing&&sp>2&&swimSplashVisible(a)&&this.time-s.last<.08&&(!G.actors||G.actors.includes(a));
      s.mesh.visible=!!alive;
      if(!alive){s.actor=null;s.pending=false;continue;}
      const yaw=Math.atan2(a.vel.x,a.vel.z),delta=Math.atan2(Math.sin(yaw-s.yaw),Math.cos(yaw-s.yaw));s.yaw=yaw;
      s.up.copy(a.groundN||THREE.Object3D.DEFAULT_UP).normalize();
      s.forward.set(a.vel.x,0,a.vel.z).addScaledVector(s.up,-s.up.dot(a.vel)).normalize();
      s.right.crossVectors(s.up,s.forward).normalize();s.forward.crossVectors(s.right,s.up).normalize();
      s.basis.makeBasis(s.right,s.up,s.forward);
      s.mesh.position.copy(a.pos);s.mesh.quaternion.setFromRotationMatrix(s.basis);s.mesh.material.color.copy(a.color);s.mesh.material.emissive.copy(a.color).multiplyScalar(.06);
      const t=this.time+s.phase;s.mesh.material.userData.filmTime.value=t;

      // Rebuilding ~1,700 vertices and their normals is the film's whole CPU cost; skip it while no camera sees it.
      s.shapeTime=this.time+s.phase;s.shapeSpeed=sp/11.8;s.shapeTurn=clamp(delta/Math.max(1e-4,fx._dt)*.04,-1,1);s.pending=true;
      if(camera===undefined||(s.mesh.updateMatrixWorld(),seenBy(camera,s.mesh)))this.shape(s);
    }
  }
  shape(s){s.pending=false;updateSwimFilmGeometry(s.mesh.geometry,s.shapeTime,s.shapeSpeed,s.shapeTurn);}
  flush(camera){for(const s of this.slots)if(s.pending&&s.mesh.visible&&seenBy(camera,s.mesh))this.shape(s);}
  clear(){for(const s of this.slots){s.actor=null;s.mesh.visible=false;s.pending=false;}}
  dispose(){if(this.disposed)return;this.disposed=true;this.scene?.[PRE_RENDER]?.delete(this);this.root.removeFromParent();for(const s of this.slots){s.mesh.geometry.dispose();s.mesh.material.dispose();s.actor=null;}this.slots.length=0;}
}

export function touchSwimSurface(fx,actor){
  // Warm-up calls and legacy users without an Actor cannot create a free-floating film.
  if(!actor||fx._inkVolumeDisposed)return;
  (fx.swimSurface||=(new SwimSurface(fx))).touch(actor,fx);
}
export function updateSwimSurface(fx,camera){fx.swimSurface?.update(fx,camera);}
export function clearSwimSurface(fx){fx.swimSurface?.clear();}
export function disposeSwimSurface(fx){fx.swimSurface?.dispose();fx.swimSurface=null;}
