import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {composed,raw,declaration} from './queue-visual-world-20261031.helper.mjs';

const rel='src/world/props-marina-vessels.js';
export const source=composed(rel);
export const baselineHull=declaration(raw(rel),null,'makeHull').source;
export const candidateHull=declaration(source,null,'makeHull').source;
const common=[declaration(source,'IWMarinaStaging',null),declaration(source,'MB',null),declaration(source,null,'gridSurface'),declaration(source,null,'polyFan')].map(x=>x.source).join('\n');

// Use the actual production MB, grid normal/winding code, and makeHull closure.
// Instrumentation is optional and absent from timing runs.
export function hullFactory(after,{instrument=false,staging=false}={}){
 let hull=after?candidateHull:baselineHull;
 if(instrument){
  hull=hull.replace('const at = (t, s, side) => {','const at = (t, s, side) => { stats.at++;');
  hull=hull.replace('const yAt = (t, y) => {','const yAt = (t, y) => { stats.yAt++;');
 }
 const trace=staging?`const geo=MB.prototype.geo;MB.prototype.geo=function(){stats.staging.push({p:Array.from(this.p.subarray(0,this._vc*3)),n:Array.from(this.n.subarray(0,this._vc*3)),c:Array.from(this.c.subarray(0,this._vc*3)),index:Array.from(this._i.subarray(0,this._ic))});return geo.call(this);};`:'';
 return new Function('THREE','PI','HP',common+'\nconst stats={at:0,yAt:0,staging:[]};\n'+trace+'\n'+hull+'\nreturn {makeHull,stats};')(THREE,Math.PI,Math.PI/2);
}

// Read each real vessel's spec expression, rather than reproducing its formula.
export function specFor(name,L){
 const fn=declaration(source,null,name),declarations=fn.body.body.filter(x=>x.type==='VariableDeclaration').flatMap(x=>x.declarations);
 const expression=id=>{const d=declarations.find(x=>x.id.type==='Identifier'&&x.id.name===id);if(!d)throw Error('missing production vessel spec '+name+'.'+id);return source.slice(d.init.start,d.init.end);};
 const Bm=new Function('L','return '+expression('Bm'))(L);
 return new Function('L','Bm','return '+expression('spec'))(L,Bm);
}

export function geometrySnapshot(g){
 return {attributes:Object.fromEntries(Object.entries(g.attributes).map(([k,a])=>[k,{itemSize:a.itemSize,normalized:a.normalized,type:a.array.constructor.name,bytes:Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength).toString('hex')}])),index:g.index?{type:g.index.array.constructor.name,values:Array.from(g.index.array)}:null};
}
