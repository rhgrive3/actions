// Synthetic CPU fixture executing the actual driver's unchanged result/receipt producers.
// It is not browser evidence, GPU timing, or a genuine successful normal capture.
import fs from 'node:fs';import {createHash} from 'node:crypto';
const source=fs.readFileSync(new URL('../../check-inkwave-material-native-frame.mjs',import.meta.url),'utf8');
const marker='  // Warm the actual full-game renderer and shaders after native painting.';
const body=source.slice(source.indexOf(marker),source.indexOf(' },{diagnostic,settledDiagnostic});'));
const measure=new Function('g','G','r','gl','frame','fixture','state','performance','initial','placements','pixels','atlasHash','beforeWarm','atlasConditions','THREE',body);
const receiptSource=source.slice(source.lastIndexOf(' const receipt=')+' const receipt='.length).split(';\n fs.writeFileSync')[0];
const wrap=new Function('diagnostic','failure','sourceSha','variant','manifest','bound','loaded','os','process','result','errors','return '+receiptSource);
export const hash=x=>createHash('sha256').update(x).digest('hex');
export function generatedReceipt(variant='A',factor=1){
 let now=0,t=0;const performance={now:()=>now+=.01};
 const r={info:{render:{calls:0,triangles:0},memory:{textures:8,geometries:4},programs:[{}]},toneMapping:4,outputColorSpace:'srgb',toneMappingExposure:1,render(){now+=.2;this.info.render.calls++;this.info.render.triangles+=12;}};
 const g={settings:{quality:'high'},R:{dynScale:1,render(){for(let i=0;i<3;i++)r.render();}},levelMat:{userData:{uniforms:{uGel:{value:1}}}}};
 const fixture=()=>({style:{hair:0,skin:7,outfit:5,eyes:1,hat:0,brows:3},profileStyle:{hair:0,skin:7,outfit:5,eyes:1,hat:0,brows:3},colorblind:true,paletteId:'cb-yellow-blue',teamHex:['#ffd21a','#2a52ff'],teamColors:['ffd21a','2a52ff'],localColor:'ffd21a'});
 const state=()=>({clocks:{game:t,environment:t,fx:t,paint:t},camera:{position:[0,1,2],quaternion:[0,0,0,1],projection:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]},actors:[{name:'fixture',pos:[0,1,2],hp:100,ink:100,weapon:'shooter'}],coverage:[.2,.1],projectiles:0});
 const initial={fixture:fixture(),motionReady:{status:'ready',enabled:true,ownerMatches:true,humanBankPresent:true,squidBankPresent:true,disposed:false,error:null},entry:{trusted:true,boot:{game:0,environment:0,fx:0,paint:0},entry:{game:0,environment:0,fx:0,paint:0}},clocks:{game:0,environment:0,fx:0,paint:0},character:{time:0,phase:0,seed:1},pos:[0,1,2]};
 const frame=()=>{t+=1/60;r.info.render.calls=0;r.info.render.triangles=0;g.R.render();};
 const gl={finish(){now+=.05;},getError:()=>0,getExtension:name=>name==='WEBGL_debug_renderer_info'?{UNMASKED_RENDERER_WEBGL:1}:null,getParameter:()=> 'SwiftShader synthetic fixture',drawingBufferWidth:960,drawingBufferHeight:600};
 const G={scene:{environment:{},environmentIntensity:1,traverse(fn){fn({isLight:true,type:'DirectionalLight',name:'Sun',color:{toArray:()=>[1,1,1]},intensity:1,getWorldPosition:v=>v});}}};
 const THREE={Vector3:class{toArray(){return[0,10,0];}}};
 const placements=Array.from({length:16},(_,i)=>({point:[i,0,0],seed:(i+1)/100,area:0}));
 const pixels={unpainted:hash('unpainted'),painted:hash('painted '+variant),paintSignal:{changed:2000,max:255},repeatSignal:{changed:0,max:0}};
 const atlasConditions={size:4096,width:4096,height:4096,textureBinding:true,uniformSize:4096,texel:1/4096,pixelRatio:1,devicePixelRatio:1,viewport:[960,600]};
 const result=measure(g,G,r,gl,frame,fixture,state,performance,initial,placements,pixels,hash('atlas'),state(),atlasConditions,THREE);
 // Counterfactual timing factors are explicit synthetic test data, never measurement claims.
 for(const s of result.samples)for(const k of ['frameCpuMs','renderCpuMs','webglSubmitMs'])s[k]*=factor;
 result.completedTransactionMsPerFrame*=factor;result.entry={route:['main','mode','range'],gestures:['play','mode-range'].map(id=>({type:'click',trusted:true,selector:'.iw-ui [data-id="'+id+'"]'}))};
 const sourceSha='c0938a3f84768474df91713f7b372f9d7f8fe96a',manifest={inputHash:hash('input'),contentHash:hash('content')};
 const bound={sourceSha,sourceTree:'97b9938391f156dc332f6a56ac6fe3d21d9f9dc7',...manifest,revision:hash('revision'),commonVariant:'B',overlayVariant:'A',modulePath:'src/world/inkShading.js',baselineEmittedSha256:hash('baseline'),candidateEmittedSha256:hash('candidate')};
 const loaded=new Map([['_versions/'+bound.revision+'/'+bound.modulePath,variant==='A'?bound.baselineEmittedSha256:bound.candidateEmittedSha256],['index.html',hash('html')]]);
 return JSON.parse(JSON.stringify(wrap(false,undefined,sourceSha,variant,manifest,bound,loaded,{cpus:()=>[{model:'synthetic CPU'}]},{version:process.version},result,[])));
}
export const generatedRows=(percent=[2,2,2])=>Array.from({length:12},(_,i)=>{const variant=['A','B','B','A'][i%4];return generatedReceipt(variant,variant==='B'?1+percent[Math.floor(i/4)]/100:1);});
