// Browser-only arena: native runner/projectiles/physics/FX/NetSession/Transport.
// UI, character meshes and audio are omitted to keep software-GPU evidence bounded.
import * as THREE from 'three';
import {G, emit} from '/ASSET/src/core/ctx.js';
import {WEAPONS, MAPS} from '/ASSET/src/config.js';
import {WeaponRunner, Projectiles} from '/ASSET/src/game/weapons.js';
import {Physics} from '/ASSET/src/game/physics.js';
import {FX} from '/ASSET/src/fx/fx.js';
import {initFxHooks} from '/ASSET/src/fx/fxHooks.js';
import {installNet} from '/ASSET/src/net/session.js';
import {install} from '/ASSET/patches/splatoon3/runtime/install.mjs';
import {installQuality} from '/ASSET/patches/local-quality/install.mjs';
const profile=await fetch('/ASSET/patches/splatoon3/profile.json').then(r=>r.json());
install(profile);installQuality(profile);
G.scene=new THREE.Scene();G.scene.background=new THREE.Color('#172838');
G.renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});G.renderer.setSize(1000,700);document.body.appendChild(G.renderer.domElement);
G.camera=new THREE.PerspectiveCamera(55,1000/700,.1,150);G.camera.position.set(19,17,-17);G.camera.lookAt(0,2,10);G.time=0;
const floor=new THREE.Mesh(new THREE.BoxGeometry(100,1,100),new THREE.MeshBasicMaterial({color:'#253e4f'}));floor.position.y=-.5;G.scene.add(floor);G.scene.add(new THREE.HemisphereLight(0xffffff,0x335566,3));
G.teamColors=[new THREE.Color('#ff852a'),new THREE.Color('#315cff')];
const block={id:0,solid:true,grate:false,center:new THREE.Vector3(0,-.5,0),half:new THREE.Vector3(50,.5,50),axes:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)],faces:[-1,-1,-1,-1,-1,-1]};
G.level={blocks:[block],faces:[],bounds:{minX:-50,maxX:50,minZ:-50,maxZ:50},queryBlocks(_x,_z,_xx,_zz,out){out.length=0;out.push(0);return out;},groundHeight:()=>0,spawnPads:[{y:0},{y:0}]};G.physics=new Physics(G.level);
G.fx=new FX(G.scene,{quality:.25});G.fx.paintEffects=false;G.fx.onSpeck=null;G.projectiles=new Projectiles(G.scene);G.boss=null;G.actors=[];
G.paint={splat(c,r,t,o={}){const nm=G.netm;if(nm?.mute)return 0;if(nm&&!nm.applying)nm.recSplat(c,r,t,o);return Math.PI*r*r;},sample:()=>1,clear(){}};
function makeActor(r){const local=r.owner===G.net.myId,a={...r,nid:r.nid,isLocal:local,isBot:false,alive:true,grounded:true,form:'kid',hp:100,ink:100,special:0,invuln:0,respawnTimer:0,yaw:0,aimYaw:0,aimPitch:.05,pos:new THREE.Vector3(r.nid?5:-5,0,0),vel:new THREE.Vector3(),aimDir:new THREE.Vector3(0,.05,1).normalize(),aimPoint:new THREE.Vector3(r.nid?5:-5,1,35),color:G.teamColors[r.team],weapon:WEAPONS[r.weapon],intent:{move:new THREE.Vector3(),fire:false,squid:false,jump:false,sub:false,special:false},anim:{time:0},stats:{turf:0,splats:0,deaths:0},netTp:0,smoothY:0,addTurf(){},_nearCamera:()=>true,_finishFrame(){},character:{root:new THREE.Group(),trigger(){},setVisible(){},getMuzzle(out){out.copy(a.pos).add(new THREE.Vector3(0,1.05,.3));},_s3CancelRollerFlick(){}}};a.weaponRunner=new WeaponRunner(a);return a;}
const game=G.game={profile:{weapon:'roller',name:'Probe'},mapDef:MAPS[0],settings:{matchLength:180},menus:{launchLobby:async()=>{}},debug:{freeze(){}},paletteIndex:()=>0,rig:{mode:'follow'},
 async startNetMatch(cfg,nm){G.actors=cfg.roster.map(makeActor);G.local=G.actors.find(a=>a.isLocal);G.match=this.match={actors:G.actors,local:G.local,state:'init',time:180,attract:false,playing:()=>true,removeActor(a){this.actors.splice(this.actors.indexOf(a),1);},follower:false};nm.bind(this.match);},
 netMatchGo(){this.match.state='playing';},netMatchAborted(){},fxHooks:null};
game.fxHooks=initFxHooks(G);G.fx.onSpeck=null;installNet();G.mode='match';globalThis.NG=G;globalThis.networkArenaReady=true;
