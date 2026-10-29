// Reference: the carried Rainmaker in Nintendo's Splatoon 3 beginner guide
// (03_en.html) and Famitsu's 2022-09-28 gameplay screenshots. A white anchor
// sits inside a gold shield, with the remaining carry seconds above it.
// Procedural approximation, not an extracted Nintendo texture or font.
export function createRainmakerCarrierMarker(THREE) {
  const material = new THREE.ShaderMaterial({
    uniforms: { uSeconds: { value: 60 } },
    vertexShader: `varying vec2 vMarkerUv;
      void main(){
        vMarkerUv=uv;
        vec4 p=modelViewMatrix*vec4(0.,0.,0.,1.);
        p.xy+=position.xy*vec2(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz));
        gl_Position=projectionMatrix*p;
      }`,
    fragmentShader: `varying vec2 vMarkerUv; uniform float uSeconds;
      float segment(vec2 p, vec2 a, vec2 b){
        vec2 ab=b-a;return length(p-a-ab*clamp(dot(p-a,ab)/dot(ab,ab),0.,1.));
      }
      float cross2(vec2 a,vec2 b){return a.x*b.y-a.y*b.x;}
      float triangle(vec2 p,vec2 a,vec2 b,vec2 c){
        vec3 s=vec3(cross2(b-a,p-a),cross2(c-b,p-b),cross2(a-c,p-c));
        return min(s.x,min(s.y,s.z))>=0.||max(s.x,max(s.y,s.z))<=0.?1.:0.;
      }
      float digitRow(float digit,float row){
        vec4 a;vec3 b;
        if(digit<.5){a=vec4(14.,17.,17.,17.);b=vec3(17.,17.,14.);}
        else if(digit<1.5){a=vec4(4.,12.,4.,4.);b=vec3(4.,4.,14.);}
        else if(digit<2.5){a=vec4(14.,17.,1.,2.);b=vec3(4.,8.,31.);}
        else if(digit<3.5){a=vec4(30.,1.,1.,14.);b=vec3(1.,1.,30.);}
        else if(digit<4.5){a=vec4(2.,6.,10.,18.);b=vec3(31.,2.,2.);}
        else if(digit<5.5){a=vec4(31.,16.,16.,30.);b=vec3(1.,1.,30.);}
        else if(digit<6.5){a=vec4(14.,16.,16.,30.);b=vec3(17.,17.,14.);}
        else if(digit<7.5){a=vec4(31.,1.,2.,4.);b=vec3(8.,8.,8.);}
        else if(digit<8.5){a=vec4(14.,17.,17.,14.);b=vec3(17.,17.,14.);}
        else{a=vec4(14.,17.,17.,15.);b=vec3(1.,1.,14.);}
        if(row<.5)return a.x;if(row<1.5)return a.y;if(row<2.5)return a.z;
        if(row<3.5)return a.w;if(row<4.5)return b.x;if(row<5.5)return b.y;return b.z;
      }
      float digitMask(vec2 uv,float digit){
        if(uv.x<0.||uv.x>=1.||uv.y<0.||uv.y>=1.)return 0.;
        vec2 cell=floor(uv*vec2(5.,7.));
        return mod(floor(digitRow(digit,6.-cell.y)/exp2(4.-cell.x)),2.);
      }
      float timer(vec2 p){
        float seconds=floor(uSeconds+.01);
        if(seconds<10.)return digitMask((p-vec2(-.085,.33))/vec2(.17,.28),seconds);
        return max(digitMask((p-vec2(-.19,.33))/vec2(.17,.28),floor(seconds/10.)),
          digitMask((p-vec2(.02,.33))/vec2(.17,.28),mod(seconds,10.)));
      }
      void main(){
        vec2 p=(vMarkerUv-.5)*vec2(1.,1.42);
        float shield=max(abs(p.x)-.34,max((p.y+.35*abs(p.x)-.26)/1.0595,
          (-p.y+.76*abs(p.x)-.49)/1.256));
        float face=1.-smoothstep(-.006,.006,shield);
        float edge=1.-smoothstep(.009,.018,abs(shield));
        vec3 color=mix(vec3(.68,.49,.025),vec3(.85,.65,.055),clamp(p.y+.6,0.,1.));
        color=mix(color,vec3(1.,.94,.62),edge);
        float alpha=max(face*.9,exp(-max(0.,shield)*45.)*.18);
        float d=segment(p,vec2(0.,.10),vec2(0.,-.21))-.023;
        d=min(d,abs(length(p-vec2(0.,.15))-.055)-.017);
        d=min(d,segment(p,vec2(-.065,.045),vec2(.065,.045))-.019);
        for(int i=0;i<2;i++){
          vec2 q=vec2(p.x*(i==0?1.:-1.),p.y);
          d=min(d,segment(q,vec2(0.,-.265),vec2(.09,-.245))-.029);
          d=min(d,segment(q,vec2(.09,-.245),vec2(.17,-.185))-.029);
          d=min(d,segment(q,vec2(.17,-.185),vec2(.22,-.075))-.029);
        }
        if(p.y<-.285&&abs(p.x)<.205)d=min(d,abs(length(p-vec2(0.,-.10))-.25)-.01);
        if(p.y<-.345&&abs(p.x)<.15)d=min(d,abs(length(p-vec2(0.,-.10))-.29)-.009);
        float anchor=1.-smoothstep(-.004,.004,d);
        anchor=max(anchor,triangle(p,vec2(.23,-.025),vec2(.255,-.16),vec2(.135,-.105)));
        anchor=max(anchor,triangle(p,vec2(-.23,-.025),vec2(-.255,-.16),vec2(-.135,-.105)));
        color=mix(color,vec3(1.),anchor);alpha=max(alpha,anchor);
        float text=timer(p);
        float shadow=max(max(timer(p+vec2(.009,0.)),timer(p-vec2(.009,0.))),
          max(timer(p+vec2(0.,.009)),timer(p-vec2(0.,.009))));
        color=mix(color,vec3(.16,.12,.025),shadow);color=mix(color,vec3(1.),text);
        alpha=max(alpha,max(text,shadow*.8));
        if(alpha<.01)discard;gl_FragColor=vec4(color,alpha);
      }`,
    transparent: true, depthWrite: false, depthTest: true, toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(.58, .82), material);
  mesh.name = 'rainmaker-carrier-marker'; mesh.visible = false;
  mesh.frustumCulled = false; mesh.renderOrder = 12;
  mesh.userData.symbol = 'anchor-shield';
  function update(carrier, remaining) {
    mesh.visible = !!carrier && carrier.alive !== false;
    const seconds = Number.isFinite(remaining) ? Math.ceil(Math.max(0, Math.min(60, remaining))) : 60;
    if (material.uniforms.uSeconds.value !== seconds) material.uniforms.uSeconds.value = seconds;
    mesh.userData.seconds = seconds;
  }
  return { mesh, update };
}
