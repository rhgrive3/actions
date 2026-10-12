// Browser-only arena: native runner/projectiles/physics/FX/NetSession/Transport.
// Real Actor/Character and source motion are included. UI and audio are omitted.
import * as THREE from 'three';
import {G, emit} from '/ASSET/src/core/ctx.js';
import {WEAPONS, MAPS} from '/ASSET/src/config.js';
import {Actor} from '/ASSET/src/game/actor.js';
import {Character,CHARACTER_CHANNELS} from '/ASSET/src/game/character.js';
import {Environment} from '/ASSET/src/world/environment.js';
import {installMainWeaponCatalogRuntime} from '/ASSET/patches/splatoon3/runtime/main-weapon-catalog.mjs';
import {installWeaponsFidelity} from '/ASSET/patches/splatoon3/runtime/weapons-fidelity.mjs';
import {WeaponRunner, Projectiles} from '/ASSET/src/game/weapons.js';
import {Physics} from '/ASSET/src/game/physics.js';
import {FX} from '/ASSET/src/fx/fx.js';
import {initFxHooks} from '/ASSET/src/fx/fxHooks.js';
import {installNet} from '/ASSET/src/net/session.js';
import {install} from '/ASSET/patches/splatoon3/runtime/install.mjs';
import {installQuality} from '/ASSET/patches/local-quality/install.mjs';
const profile=await fetch('/ASSET/patches/splatoon3/profile.json').then(r=>r.json());
const api=install(profile);installWeaponsFidelity(api,profile);installMainWeaponCatalogRuntime(api,profile);installQuality(profile);
// Review-only opt-in: exercises the complete existing origin path without any visual/collision split.
if(new URLSearchParams(location.search).has('novaMouth')){const W=await import('/ASSET/src/game/character-weapons.js');W.getWeaponDef('s3-shooter-quicklong').muzzle.set(0,(475-310)*.11/130,(965-439)*.11/130);}
G.scene=new THREE.Scene();G.scene.background=new THREE.Color('#172838');
G.renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});G.renderer.setSize(1000,700);document.body.appendChild(G.renderer.domElement);
G.camera=new THREE.PerspectiveCamera(55,1000/700,.1,150);G.camera.position.set(19,17,-17);G.camera.lookAt(0,2,10);G.time=0;
const floor=new THREE.Mesh(new THREE.BoxGeometry(100,1,100),new THREE.MeshBasicMaterial({color:'#253e4f'}));floor.position.y=-.5;G.scene.add(floor);const envScene=new THREE.Scene(),env=new Environment(G.renderer,envScene);G.scene.add(env.sun,env.hemi);G.scene.environment=env.envMap;G.scene.environmentIntensity=envScene.environmentIntensity;G.renderer.toneMapping=THREE.NeutralToneMapping;G.env=env;
G.teamColors=[new THREE.Color('#ff852a'),new THREE.Color('#315cff')];
const block={id:0,solid:true,grate:false,center:new THREE.Vector3(0,-.5,0),half:new THREE.Vector3(50,.5,50),aabbMin:new THREE.Vector3(-50,-1,-50),aabbMax:new THREE.Vector3(50,0,50),axes:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)],faces:[-1,-1,-1,-1,-1,-1]};
G.level={blocks:[block],faces:[],bounds:{minX:-50,maxX:50,minZ:-50,maxZ:50},queryBlocks(_x,_z,_xx,_zz,out){out.length=0;out.push(0);return out;},groundHeight:()=>0,spawnPads:[{y:0},{y:0}]};G.physics=new Physics(G.level);
G.fx=new FX(G.scene,{quality:.25});G.fx.paintEffects=false;G.fx.onSpeck=null;G.projectiles=new Projectiles(G.scene);G.boss=null;G.actors=[];
G.paint={splat(c,r,t,o={}){const nm=G.netm;if(nm?.mute)return 0;if(nm&&!nm.applying)nm.recSplat(c,r,t,o);return Math.PI*r*r;},sample:()=>1,clear(){}};
function makeActor(r){
 const a=new Actor({team:r.team,name:'Shooter-'+r.nid,weapon:r.weapon,isLocal:r.owner===G.net.myId,CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
 a.nid=r.nid;a.owner=r.owner;a.pos.set(r.nid?1.2:-1.2,0,0);a.grounded=a.ground.hit=true;a.aimPitch=.05;a.aimDir.set(0,.05,1).normalize();a.aimPoint.set(a.pos.x,1.05,35);a.character.actor=a;a.character.onEvent=null;G.scene.add(a.character.root);return a;
}
const game=G.game={profile:{weapon:'s3-shooter-heavy',name:'Probe'},mapDef:MAPS[0],settings:{matchLength:180},menus:{launchLobby:async()=>{}},debug:{freeze(){}},paletteIndex:()=>0,rig:{mode:'follow'},
 async startNetMatch(cfg,nm){G.actors=cfg.roster.map(makeActor);G.local=G.actors.find(a=>a.isLocal);for(const a of G.actors){if(a.character._sourceMotionLoader)await a.character._sourceMotionLoader;if(a.character.sourceMotion?.ready)await a.character.sourceMotion.ready;if(a.character.sourceMotion?.status!=='ready')throw Error('source motion unavailable');}G.match=this.match={actors:G.actors,local:G.local,state:'init',time:180,attract:false,playing:()=>true,removeActor(a){this.actors.splice(this.actors.indexOf(a),1);},follower:false};nm.bind(this.match);},
 netMatchGo(){this.match.state='playing';},netMatchAborted(){},fxHooks:null};
game.fxHooks=initFxHooks(G);G.fx.onSpeck=null;installNet();G.mode='match';globalThis.NG=G;globalThis.NC=CHARACTER_CHANNELS;globalThis.NTHREE=THREE;globalThis.networkArenaReady=true;
