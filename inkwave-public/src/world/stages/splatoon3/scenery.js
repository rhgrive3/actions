// Authored, low-draw-call environmental silhouettes. These are not Nintendo model/texture assets.
// All background props are outside the collision bounds, or explicitly beyond the walkable roof height.
import * as THREE from 'three';
const palettes={canyon:[0xbaa17d,0x92765c,0xd6bfa1],alley:[0xa7a6a0,0x6a777e,0x849f88],market:[0xcbbb9a,0x4b878b,0xc96844],underground:[0x626d76,0x929ea3,0x53888d],scrapyard:[0x899390,0x7b8f86,0xb49e6c],bridge:[0x9ba7af,0x6a838f,0xccd3ce],museum:[0xe0ded1,0x88b6b6,0xa7aaa0],resort:[0xbadfe2,0xdfdac7,0x63ae91],academy:[0xc69b82,0xe0d5bf,0x729c8a],shipyard:[0x9bacaa,0x657c91,0xc1bd9c],supermarket:[0xd9c8a7,0x5a9a80,0xca6e4d],amusement:[0xb5dad8,0xba704f,0xe9cba0],'hot-spring':[0xa4a391,0x53504a,0xbc8a66],apartments:[0xc1b89e,0xa9c0b4,0x888c81],ruins:[0xc3b89a,0x98a294,0xe2d5b7],'sailing-ship':[0x966e51,0xd8d0bd,0x656f79],mall:[0xdfdacb,0xabbcc0,0x87a28a],bmx:[0x959d9e,0xca8971,0xd8cda4],skyscraper:[0x7293a3,0xb5c7cc,0x929b99],'container-port':[0x607e9c,0xa05d45,0xc5b675],restaurant:[0xbf5540,0xe0c493,0x627e84],'coal-mine':[0x998a77,0xb4a58c,0x658393],airport:[0xd4dedb,0x5f929c,0xa1a7a6],station:[0x929e94,0xcdc99a,0x647e83],underpass:[0xa6a59b,0x79877a,0x708c95]};
export class StageScenery {
  constructor(level) {
    this.group=new THREE.Group();this.group.name='stage25-authored-background';this.resources=[];this.batches=new Map();
    const e=level.layout.environment,pal=palettes[e]||palettes.alley,B=level.bounds;
    const add=(shape,pos,size,color,rot=0)=>{const key=shape+color;let batch=this.batches.get(key);if(!batch){batch={shape,color,objects:[]};this.batches.set(key,batch);}batch.objects.push({pos,size,rot});};
    const block=(x,y,z,w,h,d,c=pal[0],a=0)=>add('box',[x,y+h/2,z],[w,h,d],c,a);
    const pole=(x,y,z,r,h,c=pal[1])=>add('cylinder',[x,y+h/2,z],[r,h,r],c);
    const tree=(x,z)=>{pole(x,0,z,.32,8,0x9a7b51);add('cone',[x,9,z],[5,4,5],0x638c67);};
    const sides=[B.minX-11,B.maxX+11];
    if(e==='canyon'||e==='ruins'||e==='hot-spring') {
      for(let i=0;i<18;i++){const x=sides[i%2]+(i%3-1)*3,z=B.minZ+8+i/2*12,h=12+(i*7%11);block(x,-5,z,14,h,11,pal[i%3],(i%3-1)*.15);block(x, h-5,z,12,2,10,pal[2],.1);}
      if(e==='ruins')for(const x of sides)for(let z=-32;z<=32;z+=16){pole(x,0,z,1,9);block(x,9,z,6,1,6,pal[2]);}
      if(e==='hot-spring')for(const x of sides){block(x,0,0,16,9,32,pal[2]);add('roof',[x,11,0],[20,5,36],pal[1]);}
    } else if(['resort','sailing-ship','shipyard','bridge','container-port','airport'].includes(e)) {
      if(e==='resort'){for(const x of sides)for(let z=-40;z<=40;z+=16)tree(x,z);block(0,-2,B.minZ-19,55,18,12,pal[2]);for(let x=-22;x<24;x+=8)block(x,2,B.minZ-12.5,6,10,.6,0xdbede5);}
      if(e==='sailing-ship'){for(const z of [B.minZ-7,B.maxZ+7]){pole(0,0,z,.6,28);block(0,22,z,28,.4,.4,pal[0]);add('sail',[6,16,z],[14,18,.25],pal[1]);}}
      if(e==='airport'){for(const x of sides){block(x,0,0,16,16,70,pal[0]);for(let z=-28;z<30;z+=8)block(x+(x<0?8.05:-8.05),8,z,.2,5,6,0x5a8593);}for(const z of [B.minZ-17,B.maxZ+17]){block(0,1,z,4,3,24,0xe1e7e1);block(0,2,z,28,.65,6,0xdbe4e0);block(0,3,z+10,1,6,4,0x8e9daa);}}
      if(e==='bridge'){for(const x of sides){pole(x,0,-22,1.7,35);pole(x,0,22,1.7,35);block(x,32,0,2,2,48);block(x,5,0,7,1,110,pal[1]);}}
      if(['shipyard','container-port'].includes(e)){for(const x of sides)for(let z=-30;z<=30;z+=12){block(x,0,z,7,5,10,pal[(z+30)/12%3]);block(x,5,z,7,3,10,pal[2]);}for(const x of sides){block(x,0,0,1.5,30,1.5,pal[1]);block(x,29,0,28,1.5,2,pal[1]);}}
    } else if(['underground','supermarket','mall','restaurant','station','bmx'].includes(e)) {
      for(const x of sides){block(x,0,0,12,18,B.maxZ-B.minZ+18,pal[0]);for(let z=B.minZ;z<B.maxZ;z+=10){block(x+(x<0?6.05:-6.05),3,z,.25,7,7,pal[1]);pole(x+(x<0?7:-7),0,z,.65,20,pal[2]);}}
      // Tall overhead structure cannot be reached; it never masquerades as an accessible floor.
      for(let z=B.minZ;z<=B.maxZ;z+=16){block(0,22,z,B.maxX-B.minX+32,.6,1,pal[1]);block(0,21.5,z,20,.25,1,0xe8e8d6);}
      if(e==='station')for(const x of sides)for(let z=-32;z<=32;z+=18){block(x,0,z,8,5,16,pal[1]);block(x+(x<0?4.05:-4.05),2,z,.15,2,12,0x536d73);}
      if(e==='restaurant')for(const x of sides)for(let z=-32;z<=32;z+=12){pole(x+(x<0?7:-7),11,z,1.2,2.3,0xda7351);}
      if(e==='bmx')for(const x of sides)for(let row=0;row<4;row++)block(x+(x<0?-row:row),row*.8,0,2,.6,80,pal[2]);
    } else {
      for(const x of sides)for(let i=0,z=B.minZ-3;z<B.maxZ+9;z+=15,i++) {
        const h=e==='skyscraper'?30+(i%4)*15:e==='museum'?10:12+(i%3)*5;
        block(x,0,z,14,h,12,pal[i%3]);
        for(let y=3;y<h-1;y+=3.5)for(let zz=z-4;zz<=z+4;zz+=4)block(x+(x<0?7.05:-7.05),y,zz,.2,2.2,2.4,0x547987);
        if(e==='market')add('roof',[x,4,z],[18,2,13],pal[2]);
      }
      if(e==='amusement') {const x=B.maxX+19;for(let i=0;i<24;i++){const a=i*Math.PI/12;pole(x,14+12*Math.sin(a),12*Math.cos(a),.35,1,pal[1]);block(x,14+12*Math.sin(a),12*Math.cos(a),3,2,2,pal[2]);}}
      if(e==='underpass'){block(0,19,0,100,2.5,18,pal[0]);for(const x of sides)for(const z of [-7,7])block(x,0,z,2.8,19,3,pal[1]);}
    }
    const geometries={box:new THREE.BoxGeometry(1,1,1),cylinder:new THREE.CylinderGeometry(1,1,1,8),cone:new THREE.ConeGeometry(1,1,8),roof:new THREE.CylinderGeometry(1,1,1,3),sail:new THREE.BoxGeometry(1,1,1)};
    const matrix=new THREE.Matrix4(),quat=new THREE.Quaternion(),position=new THREE.Vector3(),scale=new THREE.Vector3();
    for(const batch of this.batches.values()){
      const material=new THREE.MeshStandardMaterial({color:batch.color,roughness:.88});this.resources.push(material);
      const mesh=new THREE.InstancedMesh(geometries[batch.shape],material,batch.objects.length);
      mesh.name=`background-${e}-${batch.shape}`;mesh.castShadow=false;mesh.receiveShadow=true;
      batch.objects.forEach((o,i)=>{position.set(...o.pos);scale.set(...o.size);quat.setFromAxisAngle(new THREE.Vector3(0,1,0),o.rot);matrix.compose(position,quat,scale);mesh.setMatrixAt(i,matrix);});
      mesh.computeBoundingSphere();this.group.add(mesh);
    }
    this.resources.push(...Object.values(geometries));this.drawCalls=this.batches.size;
  }
  dispose(){this.group.removeFromParent();for(const r of this.resources)r.dispose();this.resources=[];}
}
