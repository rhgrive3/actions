import {coverHarness} from './boss-storm-cover-fixture.mjs';
const {covered:bossRainFullyCovered,load:loadRuntimeModule}=await coverHarness();
const {hasNativeStormDeviceCloud,observeNativeStormDeviceContacts}=await loadRuntimeModule('patches/network-replication/storm-device-contact-proof.mjs');
import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';import {fileURLToPath} from 'node:url';
import * as THREE from '../../../../inkwave-public/vendor/three/build/three.module.js';
import {adaptBuildSource} from '../../../../scripts/inkwave-source-composition.mjs';
import {bossRainVerticalOverlap} from '../../runtime/boss-storm-volume.mjs';
const root=fileURLToPath(new URL('../../../../',import.meta.url));
const runtime=fs.readFileSync(path.join(root,'patches/splatoon3/runtime/storm-effects.mjs'),'utf8');
const weapons=adaptBuildSource('src/game/weapons.js',fs.readFileSync(path.join(root,'inkwave-public/src/game/weapons.js'),'utf8'));
const rawBoss=fs.readFileSync(path.join(root,'inkwave-public/src/boss/boss.js'),'utf8');
const bossCode=adaptBuildSource('src/boss/boss.js',rawBoss);
if(!bossCode.includes('bossRainVerticalOverlap(this.model?.hitShapes'))throw Error('Boss volume adapter must be registered in production composition');
function method(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a);if(a<0||b<a)throw Error('exact composed owner missing '+start);return source.slice(a,b);}
export function fixture({y=90,x=0,z=0,cover=false,removeGate=false,bossY=null,remoteVictim=false,ghost=false,remoteOwner=false,disableBossGuard=false,hitShapes}={}){
 const clouds=method(weapons,'  _updateClouds(dt) {','\n  }\n')+'\n  }';
 const bossGate='bossRainVerticalOverlap(this.model?.hitShapes, top - STORM_RAIN_REACH, top) === false';
 if(disableBossGuard && bossCode.split(bossGate).length!==2)throw Error('exact negative-control Boss gate missing');
 const bossRain=method(disableBossGuard?bossCode.replace(bossGate,'false'):bossCode,'  rain(owner, cx, cz, R, dmg','\n  _flushRain(dt)');
 const G={actors:[],time:0,teamColors:[],fx:{rain(){}},physics:{los:()=>!cover},boss:null};
 const gate='point.y + 1.2 < p.y - 0.8 - STORM_RAIN_REACH';
 const code=runtime.replace(/^import .*;\n?/gm,'').replace(/^export /gm,'');
 const context=vm.createContext({G,bossRainVerticalOverlap,bossRainFullyCovered,hasNativeStormDeviceCloud,observeNativeStormDeviceContacts,SPECIALS:{storm:{dps:24,radius:10,driftSpeed:0}},SIM_DT:1/60,clamp:(x,a,b)=>Math.min(b,Math.max(a,x)),emit(){},_v:new THREE.Vector3(),_v2:new THREE.Vector3(),DOWN:new THREE.Vector3(0,-1,0),_hit:{}});
 vm.runInContext(removeGate?code.replaceAll(gate,'false'):code,context);
 const api=vm.runInContext('({stormRainContains,stormRainObjectContains,STORM_RAIN_REACH})',context);
 const Owner=vm.runInContext('class Owner{'+clouds+'};Owner',context),p=new Owner();
 const owner={team:0,nid:1,remote:remoteOwner};
 const cloud={owner,team:0,group:new THREE.Group(),t:1,dur:8,dir:new THREE.Vector3(),rainT:10,ghost};cloud.group.position.set(0,100,0);p.clouds=[cloud];
 let damage=0;const victim={team:1,alive:true,remote:remoteVictim,pos:new THREE.Vector3(x,y,z),damage:n=>{damage+=n;return false}};G.actors=[victim];
 if(bossY!==null){const Boss=vm.runInContext('class Boss{'+bossRain+'};Boss',context);G.boss=new Boss();Object.assign(G.boss,{pos:new THREE.Vector3(0,bossY,0),dead:false,visible:true,_rain:new Map(),model:{hitShapes:hitShapes===undefined?[{active:true,pos:new THREE.Vector3(0,bossY,0),r:2}]:hitShapes}});}
 return {p,G,owner,cloud,victim,api,total:()=>damage,bossTotal:()=>G.boss?._rain.get(owner)||0};
}

export {bossCode,rawBoss,weapons};
