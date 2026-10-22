import assert from 'node:assert/strict';
import {requireSettledMaterialEntry} from '../../scripts/tests/material-native-common/entry-observer.mjs';
export function fixture({readyAfter=3,firstCost=16,finalCost=16,lateLobby=false,change=()=>{}}={}){
 let time=.05,wall=0,yields=0,phase=null,firstYields=0,finalYields=0;
 const calls=[],settledCalls=[],checkpoints=[],rig={},character={},actor={character},g={frozen:true,rig,showcase:{_portraitCharacter:{}}},G={game:g,local:actor,renderer:{}};
 const p={hasJob:false,hasTask:false,hasActiveCharacter:false,hasPreparedCharacter:false,warmState:'done',inFlight:0,queued:1};
 const state={rngState:100,rngCount:20,rendererFrame:168,rig:{mode:'follow',previousMode:'orbit',target:{local:true},blend:null},camera:{position:[0,1,0]},input:{mouse:null,keys:[],pressed:[]},jobs:{lobby:null,portrait:p}};
 const frame=i=>{calls.push(i);time+=1/60;state.rendererFrame+=23;state.rig.previousMode='follow';state.rig.blend={active:i<26,t:(i+1)/60,dur:.45};if(i===0){p.queued=0;p.hasJob=true;p.hasTask=true;g.showcase._portraitJob={key:'existing',req:{},cbs:[()=>{}],_portraitCacheEpoch:0};}if(i===27&&lateLobby)state.jobs.lobby={ready:false,failed:false};};
 const checkpoint=(name,data)=>{checkpoints.push({name,...structuredClone(data)});if(name==='callback-phase-start')phase=data.label;if(name==='callback-phase-ready')phase=null;};
 const yieldTask=async()=>{yields++;wall+=phase?.startsWith('scheduled')?firstCost:phase?finalCost:16;
  if(phase?.startsWith('scheduled')){firstYields++;assert.equal(calls.length,1);if(firstYields>=readyAfter){p.hasJob=false;p.hasTask=false;p.inFlight=0;g.showcase._portraitJob=null;state.rngState=101;state.rngCount=21;state.rendererFrame+=2;}}
  if(phase?.startsWith('final')){finalYields++;if(state.jobs.lobby)state.jobs.lobby.ready=true;}
  change({g,G,state,p,setTime:v=>time=v,yields,phase});};
 const options={g,G,frame,observe:()=>structuredClone(state),clocks:()=>({time}),requireSettled:(s,n,expected)=>{settledCalls.push(n);assert.equal(n,28,'Global readiness must not be called at the early portrait barrier');return requireSettledMaterialEntry(s,n,expected);},yieldTask,now:()=>wall,checkpoint};
 return{g,G,state,p,calls,settledCalls,checkpoints,options,stats:()=>({time,wall,yields,firstYields,finalYields})};
}
