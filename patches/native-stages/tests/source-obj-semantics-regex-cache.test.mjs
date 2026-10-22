import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSourceOBJ} from '../runtime/source-convert.mjs';

function obj(names){
 return names.map((name,i)=>{
  const k=3*i+1;
  return 'o '+name+'\nusemtl Concrete00\n'+
   'v 0 0 0\nv 1 0 0\nv 0 0 1\n'+
   'vn 0 1 0\nvn 0 1 0\nvn 0 1 0\n'+
   'f '+k+'//'+k+' '+(k+1)+'//'+(k+1)+' '+(k+2)+'//'+(k+2)+'\n';
 }).join('');
}
const semantics={
 inactiveObjectPatterns:['^Fld_Inactive$'],
 nonCollidableObjectPatterns:['NoCollision'],
 nonPaintableObjectPatterns:['NoPaint']
};
test('real source OBJ parser classifies stage rules unchanged for repeated objects',()=>{
 const names=['Fld_Active','Fld_NoCollision','Fld_NoPaint','Fld_Inactive','Fld_Active','Fld_NoCollision'];
 const parsed=parseSourceOBJ(obj(names),semantics);
 assert.deepEqual(parsed.objects.map(o=>[o.name,o.active,o.collidable,o.paintable]),[
  ['Fld_Active',true,true,true],
  ['Fld_NoCollision',true,false,false],
  ['Fld_NoPaint',true,true,false],
  ['Fld_Inactive',false,false,false],
  ['Fld_Active',true,true,true],
  ['Fld_NoCollision',true,false,false]
 ]);
 assert.equal(parsed.vertices.length,names.length*3*8);
 assert.equal(parsed.indices.length,names.length*3);
});
test('one parse compiles each stage rule only once even with many objects',()=>{
 const RealRegExp=globalThis.RegExp;
 let constructed=0;
 globalThis.RegExp=class CountingRegExp extends RealRegExp{
  constructor(...args){super(...args);constructed++;}
 };
 try {parseSourceOBJ(obj(Array(50).fill('Fld_Active')),semantics);}
 finally {globalThis.RegExp=RealRegExp;}
 assert.equal(constructed,3);
});
test('new stage load never inherits rule cache from a previous stage',()=>{
 parseSourceOBJ(obj(['Fld_Active']),{inactiveObjectPatterns:['^Fld_Active$']});
 const now=parseSourceOBJ(obj(['Fld_Active']),{inactiveObjectPatterns:['^Other$']});
 assert.equal(now.objects[0].active,true);
});
test('short-circuit pattern order keeps malformed later patterns dormant until needed',()=>{
 assert.doesNotThrow(()=>parseSourceOBJ(obj(['Fld_Inactive','Fld_Inactive']),{inactiveObjectPatterns:['^Fld_Inactive$','[']}));
 assert.throws(()=>parseSourceOBJ(obj(['Fld_Active']),{inactiveObjectPatterns:['^Fld_Inactive$','[']}),SyntaxError);
});
test('no stage-specific patterns retains legacy classification and independent calls',()=>{
 const result=parseSourceOBJ(obj(['Fld_Active','Fld_NoPaint']),undefined);
 assert.equal(result.objects[0].collidable,true);
 assert.equal(result.objects[1].active,true);
});
