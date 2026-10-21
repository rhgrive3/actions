import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const original=fs.readFileSync(new URL('../../inkwave-public/src/core/renderer.js',import.meta.url),'utf8');
const classSource=original.slice(original.indexOf('export class Renderer {'))
  .replace('export class Renderer {','class Renderer {') + '\nglobalThis.Renderer=Renderer;';
function element() {
  return {listeners:{},children:[],style:{},setAttribute(){},append(...x){this.children.push(...x);},
    appendChild(x){this.children.push(x);},addEventListener(k,fn){this.listeners[k]=fn;},
    focus(){},textContent:'',className:''};
}
function init() {
  const canvas=element(),body=element(), container=element();
  const renderer={domElement:canvas,debug:{},info:{},shadowMap:{},setClearColor(){}};
  const net={active:true,departed:0,leave(){this.departed++;this.active=false}};
  const G={match:{paused:false},net,mobile:{touch:true}};
  const window={location:{reloads:0,reload(){this.reloads++}}};
  const document={body,createElement:element};
  const THREE={WebGLRenderer:class{constructor(){return renderer}},SRGBColorSpace:1,NeutralToneMapping:2,PCFShadowMap:3};
  const ctx=vm.createContext({THREE,G,window,document,location:{search:''},
    URLSearchParams,effectiveQuality:()=>({}),deviceProfile:()=>({touch:true}),console});
  vm.runInContext(classSource,ctx);
  return {unit:new ctx.Renderer(container,{}),canvas,renderer,net,G,window,body};
}
test('context loss pauses match and explicitly offers consistent reload',()=>{
  const f=init();
  let prevented=0;
  f.canvas.listeners.webglcontextlost({preventDefault(){prevented++}});
  assert.equal(prevented,1);
  assert.equal(f.unit._contextLost,true);
  assert.equal(f.G.match.paused,true);
  assert.equal(f.net.departed,1);
  assert.equal(f.body.children.length,1);
  const overlay=f.body.children[0];
  assert.equal(overlay.children.length,2);
  assert.match(overlay.children[0].textContent,/再読み込み/);
  overlay.children[1].listeners.click();
  assert.equal(f.window.location.reloads,1);
});
test('restoration never resumes empty GPU ink without reload',()=>{
  const f=init();
  f.canvas.listeners.webglcontextlost({preventDefault(){}});
  f.canvas.listeners.webglcontextrestored({});
  assert.equal(f.unit._contextLost,true);
  assert.equal(f.net.departed,1);
  assert.equal(f.body.children.length,1,'only one overlay');
  f.unit.resize=()=>{throw Error('invalid resumed rendering')};
  assert.doesNotThrow(()=>f.unit.render());
});
