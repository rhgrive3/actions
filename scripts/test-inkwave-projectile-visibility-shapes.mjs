import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as T from '../inkwave-public/vendor/three/build/three.module.js';
import {captureNativeProjectileTemporal} from './lib/inkwave-projectile-visibility-probe.mjs';

test('serialized temporal control measures adopted S3 meshes and restores them on capture failure', async () => {
  for (const fail of [false,true]) {
    const camera=new T.PerspectiveCamera(),body=new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial());
    const blobs=new T.Mesh();blobs.visible=false;
    const owner={},round={pos:new T.Vector3(0,0,-2),vel:new T.Vector3(0,0,-1),age:1/60,owner};
    const system={blobs,_s3Shapes:{body,v:new T.Vector3()},list:[round],_step(){},_draw(){},inkFlight:{world(){}}};
    const rig={yaw:0,pitch:0,update(){}},game={rig,input:{mouse:{left:false}},debug:{fire(v){game.input.mouse.left=v;}},R:{render(){}}};
    const gl={drawingBufferWidth:8,drawingBufferHeight:8,RGBA:1,UNSIGNED_BYTE:2,getError:()=>0,readPixels(x,y,w,h,f,t,a){a.fill(body.visible?255:0);}};
    const G={game,camera,projectiles:system,local:{pos:new T.Vector3()},fx:{},renderer:{getContext:()=>gl}};
    let captures=0;
    const context=vm.createContext({NG:G,__projectileProbe:{rounds:[round]},__captureNativeCanvas:async()=>{if(fail&&++captures===2)throw Error('injected capture failure');return {capture:{},png:'diagnostic'};}});
    const invoke=vm.runInContext('('+captureNativeProjectileTemporal.toString()+')',context);
    const old={step:system._step,draw:system._draw,world:system.inkFlight.world,rig:rig.update};
    const result=await invoke({frames:[1]});
    if(fail){assert.equal(result.complete,false);assert.match(result.errors[0],/injected/);}
    else {assert.equal(result.complete,true);assert.equal(result.frames[0].changedPixels,64);assert.equal(result.frames[0].nativeVisibilityEstablished,true);}
    assert.equal(body.visible,true);assert.equal(blobs.visible,false);
    assert.equal(system._step,old.step);assert.equal(system._draw,old.draw);assert.equal(system.inkFlight.world,old.world);assert.equal(rig.update,old.rig);
    assert.equal(round.owner,owner);assert.deepEqual(round.pos.toArray(),[0,0,-2]);
  }
});
