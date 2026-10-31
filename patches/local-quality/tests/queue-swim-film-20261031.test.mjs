import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
function load(file){
 const source=fs.readFileSync(new URL(file,import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export function ','function ').replaceAll('export class ','class ').replaceAll('export const ','const ');
 return new Function('THREE','G','swimSplashVisible',source+'\nreturn {createSwimFilmGeometry,updateSwimFilmGeometry};')(THREE,{},()=>false);
}
const before=load('./fixtures/swim-film-before-20261031.mjs.txt'),after=load('../swim-surface.mjs');
test('all swim-film vertices, normals, holes and topology remain byte-identical across speeds and turn/time boundaries',()=>{
 const a=before.createSwimFilmGeometry(),b=after.createSwimFilmGeometry();
 try{
  assert.deepEqual(b.index.array,a.index.array);assert.deepEqual(b.attributes.filmData.array,a.attributes.filmData.array);
  for(const time of [-10,-.001,0,.001,1/120,1/60,.999,1,10,10000])for(const speed of [-1,0,.01,.25,8/11.8,1,2])for(const turn of [-1,0,1]){
   before.updateSwimFilmGeometry(a,time,speed,turn);after.updateSwimFilmGeometry(b,time,speed,turn);
   assert.deepEqual(b.attributes.position.array,a.attributes.position.array);assert.deepEqual(b.attributes.normal.array,a.attributes.normal.array);
   assert.deepEqual(b.userData.filmHoles.map(x=>x.toArray()),a.userData.filmHoles.map(x=>x.toArray()));
  }
 }finally{a.dispose();b.dispose();}
});
test('one actual visible-film rebuild removes exactly 1848 redundant sine evaluations',()=>{
 const a=before.createSwimFilmGeometry(),b=after.createSwimFilmGeometry(),sin=Math.sin;let count=0;
 try{
  Math.sin=(...args)=>{count++;return sin(...args);};before.updateSwimFilmGeometry(a,1.2,.75,.2);const old=count;
  count=0;after.updateSwimFilmGeometry(b,1.2,.75,.2);assert.equal(old-count,1848);
 }finally{Math.sin=sin;a.dispose();b.dispose();}
});
