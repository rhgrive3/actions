export function createAudioRequestTrace({now=()=>performance.now(),limit=256}={}) {
 let nextId=0,generation=0,phase='initializing',navigation=null,closing=false;
 const rows=new WeakMap();
 const data={schema:1,clock:'Node performance.now milliseconds',requests:[],boundaries:[],snapshots:[],droppedRequests:0,untrackedEvents:0};
 const stamp=()=>({atMs:now(),phase,generation});
 const audio=r=>/\.(?:mp3|ogg|wav)(?:[?#]|$)/i.test(r.url());
 const boundary=(kind,extra={})=>{const row={kind,...stamp(),...extra};data.boundaries.push(row);return row;};
 const ensure=r=>{if(!audio(r))return null;let row=rows.get(r);if(row)return row;if(data.requests.length>=limit){data.droppedRequests++;return null;}row={id:++nextId,url:r.url(),started:null,headers:null,finished:null,failed:null};rows.set(r,row);data.requests.push(row);return row;};
 return {data,
 setPhase(name){phase=name;boundary('phase');},
 beginNavigation(){generation++;phase='navigation';navigation=boundary('navigation-start');return navigation;},
 endNavigation(token,status='loaded'){boundary('navigation-end',{navigationAtMs:token.atMs,status});if(navigation===token)navigation=null;phase=status==='loaded'?'native-admission':'navigation-failed';},
 beginClose(){closing=true;phase='closing';boundary('close-start');},
 endClose(){boundary('close-end');phase='closed';},
 started(r){const row=ensure(r);if(!row)return false;row.started={...stamp(),closing,navigation:!!navigation};return true;},
 headers(response){const r=response.request();if(!audio(r))return false;const row=ensure(r);if(!row)return false;row.headers={...stamp(),status:response.status()};return true;},
 finished(r){if(!audio(r))return false;const row=rows.get(r);if(!row){data.untrackedEvents++;return true;}const at=stamp();row.finished={...at,elapsedMs:row.started?at.atMs-row.started.atMs:null};return true;},
 failed(r){if(!audio(r))return false;const row=rows.get(r)||ensure(r);if(!row){data.untrackedEvents++;return true;}const at=stamp(),overlap=closing?'close-boundary-overlap':navigation||row.started&&row.started.generation!==generation?'navigation-boundary-overlap':'live-active-unattributed';row.failed={...at,elapsedMs:row.started?at.atMs-row.started.atMs:null,failure:r.failure(),boundaryRelation:overlap,classification:'unresolved; boundary overlap is not a benign-error exemption'};return true;},
 snapshot(label,state){data.snapshots.push({label,...stamp(),state});},
 };
}
export function installAudioAbortTrace(){
 const env=globalThis;if(env.__blastAudioAbortTrace)return;
 const trace=env.__blastAudioAbortTrace={clock:'browser performance.now milliseconds',events:[],dropped:0};
 const nativeFetch=env.fetch;let serial=0;
 const note=(event,row,extra={})=>{try{if(trace.events.length<256)trace.events.push({event,...row,atMs:env.performance.now(),...extra});else trace.dropped++;}catch{}};
 if(typeof nativeFetch!=='function')return;
 env.fetch=function(input,options){
 const url=typeof input==='string'?input:(typeof env.URL==='function'&&input instanceof env.URL?input.href:'');
 if(!/\.(?:mp3|ogg|wav)(?:[?#]|$)/i.test(url))return Reflect.apply(nativeFetch,this,arguments);
 const row={id:++serial,url};let signal=null;
 try{const d=options&&Object.getOwnPropertyDescriptor(options,'signal');if(d&&Object.hasOwn(d,'value'))signal=d.value;}catch{}
 note('fetch-start',row,{hasSignal:!!signal});
 try{if(signal){const aborted=()=>{let reason;try{reason={name:String(signal.reason?.name||''),message:String(signal.reason?.message||signal.reason||'')};}catch{reason={name:'',message:'unavailable'};}note('signal-abort',row,{reason});};if(signal.aborted)aborted();else signal.addEventListener('abort',aborted,{once:true});}}catch{}
 return Reflect.apply(nativeFetch,this,arguments);
 };
}
