// Continuous ink film, not a particle emitter. Shapes are INKWAVE approximations
// of the connected, torn liquid crests in Nintendo's JP squid-swimming footage.
import * as THREE from 'three';
import { G } from '../../src/core/ctx.js';
import { swimSplashVisible } from '../splatoon3/runtime/swim-stealth.mjs';

const LIMIT=4, TAU=Math.PI*2;
const fract=x=>x-Math.floor(x);
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));

export function createSwimFilmGeometry() {
  const positions=[],data=[],indices=[],patches=[];
  // A skirt joined to the ink, a breaking bow and two swept-back shoulders.
  const grid=(kind,nu,nv)=>{
    const start=positions.length/3;
    for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){positions.push(0,0,0);data.push(i/nu,j/nv,kind);}
    for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){
      const a=start+j*(nu+1)+i,b=a+1,c=a+nu+1,d=c+1;
      indices.push(a,c,b,b,c,d);
    }
    patches.push({kind,start,nu,nv});
  };
  grid(0,48,24);
  // Small flat remnants stretch from the surface behind the main film.
  for(let k=0;k<4;k++)grid(4+k,12,4);
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('filmData',new THREE.Float32BufferAttribute(data,3));
  g.setIndex(indices);g.userData.patches=patches;
  g.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,.2,-.25),1.6);
  updateSwimFilmGeometry(g,0,1);
  return g;
}

export function updateSwimFilmGeometry(g,time,speedK,turn=0) {
  const p=g.attributes.position.array,k=clamp(speedK),flow=time*24;
  for(const patch of g.userData.patches){
    const {kind,start,nu,nv}=patch;
    for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){
      const u=i/nu,v=j/nv;let x,y,z;
      if(kind===0){
        // One open fluid skin. A broad bow folds into a torn, crumpling wake;
        // there are no parallel fins, closed domes or independent bead shapes.
        const across=u*2-1,edge=Math.sin(Math.PI*u),span=Math.sin(Math.PI*v);
        const envelope=Math.pow(Math.max(0,edge*span),.8);
        const width=(.07+.30*Math.pow(Math.max(0,span),.6))*(.96+.04*Math.sin(v*19-flow));
        x=across*width;
        z=.45-v*1.3+.025*Math.sin(u*19-flow)*span;
        const bow=(.09+.06*k)*Math.exp(-(((v-.20)/.25)**2))*Math.pow(Math.max(0,edge),.75)*Math.min(1,v/.12);
        const wrinkle=.04*k*(Math.sin(u*11+v*17-flow)+.5*Math.sin(u*17-v*9+flow*.8))*envelope;
        y=.006+bow+(.025+.04*k)*envelope+wrinkle;x+=turn*.04*v*v;
      }else{
        const piece=kind-4,side=piece%2?-1:1;
        const phase=((time*4.7+piece*.269)%1),pulse=Math.sin(Math.PI*phase);
        const width=(.10+.10*pulse)*Math.sin(Math.PI*u);
        x=side*(.22+.06*Math.floor(piece/2)+u*.14)+width*(v-.5);
        z=-.42-.21*Math.floor(piece/2)-u*(.28+.22*phase);
        y=.006+Math.sin(Math.PI*u)*(.035+.09*k)*pulse*Math.sin(Math.PI*v);
      }
      const n=(start+j*(nu+1)+i)*3;p[n]=x;p[n+1]=y;p[n+2]=z;
    }
  }
  g.attributes.position.needsUpdate=true;g.computeVertexNormals();
}

function material(light) {
  const m=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.16,metalness:0,clearcoat:1,clearcoatRoughness:.04,envMapIntensity:.9,side:THREE.DoubleSide});
  const time={value:0},holes={value:Array.from({length:6},()=>new THREE.Vector4())};m.userData.filmTime=time;m.userData.filmHoles=holes;
  m.customProgramCacheKey=()=> 'inkwave-swim-continuous-film-v1';
  m.onBeforeCompile=shader=>{
    shader.uniforms.uFilmTime=time;shader.uniforms.uFilmHoles=holes;shader.uniforms.uFilmSun={value:light.sunDir};
    shader.vertexShader='attribute vec3 filmData; varying vec3 vFilmData;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvFilmData=filmData;');
    shader.fragmentShader='uniform float uFilmTime; uniform vec4 uFilmHoles[6]; uniform vec3 uFilmSun; varying vec3 vFilmData;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
      if(vFilmData.z<.5){
        float u=vFilmData.x,v=vFilmData.y;
        // Uneven openings in one continuous skin, staggered rather than rows
        // of identical scallops. The leading bow remains a filled liquid fold.
        if(abs(u-.5)>.45+.05*sin(v*31.0-uFilmTime*11.0))discard;
        for(int i=0;i<6;i++){
          float f=float(i);
          vec4 hole=uFilmHoles[i];
          vec2 q=(vec2(u,v)-hole.xy)/hole.zw;
          float torn=1.0+.20*sin(q.x*3.0+q.y*5.0+uFilmTime*12.0+f);
          if(dot(q,q)<torn)discard;
        }
      }

    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`#include <opaque_fragment>
      vec3 filmEye=normalize(vViewPosition);
      vec3 filmHalf=normalize(filmEye+normalize(mat3(viewMatrix)*uFilmSun));
      float filmShine=pow(max(dot(normal,filmHalf),0.0),85.0);
      float filmRim=pow(1.0-abs(dot(normal,filmEye)),2.0);
      float filmBroad=pow(max(dot(normal,filmHalf),0.0),16.0);
      gl_FragColor.rgb+=vec3(1.0,.99,.94)*(filmShine*1.2+filmRim*.25+filmBroad*.15);
    `);
  };
  return m;
}

class SwimSurface {
  constructor(fx){
    this.root=new THREE.Group();this.root.name='SwimConnectedFilm';fx.root.add(this.root);
    this.slots=[];this.time=0;this.disposed=false;
  }
  touch(actor,fx){
    if(!actor||!actor.pos||!actor.vel||this.disposed)return;
    if(G.camera?.position?.distanceToSquared(actor.pos)>35*35)return;
    let s=this.slots.find(s=>s.actor===actor);
    if(!s)s=this.slots.find(s=>!s.actor);
    if(!s&&this.slots.length<LIMIT){
      const geometry=createSwimFilmGeometry(),mesh=new THREE.Mesh(geometry,material(fx._light));
      mesh.name='InkSwimFilm';mesh.frustumCulled=false;mesh.visible=false;mesh.castShadow=false;mesh.receiveShadow=false;
      this.root.add(mesh);s={actor:null,mesh,last:0,yaw:0,phase:this.slots.length*1.37,basis:new THREE.Matrix4(),up:new THREE.Vector3(),forward:new THREE.Vector3(),right:new THREE.Vector3()};this.slots.push(s);
    }
    if(!s&&actor.isLocal)s=this.slots.find(s=>!s.actor?.isLocal);
    if(s){if(s.actor!==actor)s.yaw=Math.atan2(actor.vel.x,actor.vel.z);s.actor=actor;s.last=fx._time;}
  }
  update(fx){
    this.time=fx._time;
    for(const s of this.slots){
      const a=s.actor,sp=a?Math.hypot(a.vel.x,a.vel.z):0;
      const alive=a&&a.alive!==false&&a.form==='squid'&&a.submerged&&a.grounded&&!a.climbing&&sp>2&&swimSplashVisible(a)&&this.time-s.last<.08&&(!G.actors||G.actors.includes(a));
      s.mesh.visible=!!alive;
      if(!alive){s.actor=null;continue;}
      const yaw=Math.atan2(a.vel.x,a.vel.z),delta=Math.atan2(Math.sin(yaw-s.yaw),Math.cos(yaw-s.yaw));s.yaw=yaw;
      s.up.copy(a.groundN||THREE.Object3D.DEFAULT_UP).normalize();
      s.forward.set(a.vel.x,0,a.vel.z).addScaledVector(s.up,-s.up.dot(a.vel)).normalize();
      s.right.crossVectors(s.up,s.forward).normalize();s.forward.crossVectors(s.right,s.up).normalize();
      s.basis.makeBasis(s.right,s.up,s.forward);
      s.mesh.position.copy(a.pos);s.mesh.quaternion.setFromRotationMatrix(s.basis);s.mesh.material.color.copy(a.color);
      const t=this.time+s.phase;s.mesh.material.userData.filmTime.value=t;
      for(let i=0;i<6;i++){
        s.mesh.material.userData.filmHoles.value[i].set(.12+.76*fract(i*.381966+.17)+.035*Math.sin(t*7+i*2.3),.28+.65*fract(i*.618034+.11)+.025*Math.cos(t*9+i*1.7),.065+.035*Math.sin(t*11+i*3.1),.045+.025*Math.cos(t*13+i*2.7));
      }
      updateSwimFilmGeometry(s.mesh.geometry,this.time+s.phase,sp/11.8,clamp(delta/Math.max(1e-4,fx._dt)*.04,-1,1));
    }
  }
  clear(){for(const s of this.slots){s.actor=null;s.mesh.visible=false;}}
  dispose(){if(this.disposed)return;this.disposed=true;this.root.removeFromParent();for(const s of this.slots){s.mesh.geometry.dispose();s.mesh.material.dispose();s.actor=null;}this.slots.length=0;}
}

export function touchSwimSurface(fx,actor){
  // Warm-up calls and legacy users without an Actor cannot create a free-floating film.
  if(!actor||fx._inkVolumeDisposed)return;
  (fx.swimSurface||=(new SwimSurface(fx))).touch(actor,fx);
}
export function updateSwimSurface(fx){fx.swimSurface?.update(fx);}
export function clearSwimSurface(fx){fx.swimSurface?.clear();}
export function disposeSwimSurface(fx){fx.swimSurface?.dispose();fx.swimSurface=null;}
