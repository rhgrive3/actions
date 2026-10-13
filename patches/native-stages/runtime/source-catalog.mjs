// References and inferred support estimates only. No source geometry or pixels.
import {nativeStageBuild} from './build-config.mjs';
export const SOURCE_COMMIT = '0611f51b35c9736ee986fb2218461e2585b7875e';
export const SOURCE_RECIPE = 'inkwave-browser-source-v3';
export const BASE_SOURCE_STAGES = [
 ['scorch','Vss_Yunohana','ユノハナ大渓谷','c8d0e21345ff9f4eb528e699de2ad9c478af78d7284f347399cc59ab94eb4cd8','c5e8f6e5aa14b97a87210ad5df1c91c05b1ab451',[-36,-82.5,36,82.5],[7.5,13.5904,-70.95]],
 ['hagglefish','Vss_Yagara','ヤガラ市場','1da0c775b47e42e9bc8657675034e935c672866ee109c13896283b3bbe7c77f4','96fbd9ec8b6eb57996236fa56bb7511009ebc0c5',[-52.9357,-78,52.9357,78],[0,13.58,-67.08]],
 ['inkblot','Vss_Upland03','海女美術大学','bef74ead213cfc4c041820319dbac7ab702d5f0f2df86db8369b162879f8b4f3','ffa36b9ffb6e80907594776996b94d00b0cbacde',[-46,-68.1673,46,68.1673],[17.5,15.64415,-58.62388]],
 ['mako','Vss_Line03','ザトウマーケット','27f6ed7271c652d7a2f6306ed7ebd9ea46076affd9edecb30d5a607ba4a520ad','eac91de4a0c7d5d55c52dbf7d09a9c4f7d94a011',[-33.5,-67.5,33.5,67.5],[-7.5,14.08,-58.05]],
 ['brinewater','Vss_BigSlope00','クサヤ温泉','3b1d042105ca2918a3abe3efcf7d2eb8c0239bc542712b23f87ffaef8854612e','1b814a810bc1012c7cf16f469f81ee532e860bfd',[-47.5,-69,47.5,69],[-12.5,18.08,-59.34]],
].map(([id,internal,name,sourceSha256,tree,b,pad])=>({
 id,internal,name,sourceSha256,tree,
 bounds:{minX:b[0],minZ:b[1],maxX:b[2],maxZ:b[3]},
 spawnPads:[pad,[-pad[0],pad[1],-pad[2]]],spawnBarrier:2.5,
 version1130Verified:false,placementStatus:'R6 inferred support; retail placement unverified',
 ...(id==='hagglefish'?{ruleAvailability:{tower:{supported:false,status:'source-route-unverified',reason:'安全なヤグラ経路を確認できないため、このステージではガチヤグラを利用できません。',evidence:'Pinned unlayered OBJ has no Vlf layer. Current source-floor navigation cannot provide a route clearing the full swept deck/pole/capsule from opposing supports. Compound human jump/climb connectivity and retail tower placement remain unverified.'}}}:{}),
}));
// The builder discovers independent definitions/*.json. Its sealed build config
// is the same catalog in the game and worker, including local single-stage builds.
export const SOURCE_STAGES = nativeStageBuild?.stages || BASE_SOURCE_STAGES;
export function sourceURL(stage,file){
 if(!stage||!/^[-a-z0-9]+$/.test(stage.id)||!/^Vss_[A-Za-z0-9]+$/.test(stage.internal)||! /^[a-f0-9]{64}$/.test(stage.sourceSha256)||! /^[a-f0-9]{40}$/.test(stage.tree)||typeof file!=='string'||file.startsWith('/')||file.includes('\\')||file.split('/').some(p=>p==='..'||p==='.'||p===''))throw Error('Invalid source reference');
 const host=file.endsWith('.obj')?'https://media.githubusercontent.com/media/kirakira-dev/KiTrix/':'https://raw.githubusercontent.com/kirakira-dev/KiTrix/';
 return host+SOURCE_COMMIT+'/stages/'+stage.internal+'/'+file.split('/').map(encodeURIComponent).join('/');
}
