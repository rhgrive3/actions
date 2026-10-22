// References and inferred support estimates only. No source geometry or pixels.
import {nativeStageBuild} from './build-config.mjs';
export const SOURCE_COMMIT = '0611f51b35c9736ee986fb2218461e2585b7875e';
export const SOURCE_RECIPE = 'inkwave-browser-source-v4';
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

// Metadata only, from Git LFS pointers at SOURCE_COMMIT. Each canonical
// pointer Git SHA-1 is checked against the authenticated bundled inventory
// by source-object-size.test.mjs; these are payload lengths, not pointer lengths.
const objectBytes = new Map([
 ['c8d0e21345ff9f4eb528e699de2ad9c478af78d7284f347399cc59ab94eb4cd8',40126181], // scorch
 ['1da0c775b47e42e9bc8657675034e935c672866ee109c13896283b3bbe7c77f4',41619132], // hagglefish
 ['bef74ead213cfc4c041820319dbac7ab702d5f0f2df86db8369b162879f8b4f3',34476411], // inkblot
 ['27f6ed7271c652d7a2f6306ed7ebd9ea46076affd9edecb30d5a607ba4a520ad',65317265], // mako
 ['3b1d042105ca2918a3abe3efcf7d2eb8c0239bc542712b23f87ffaef8854612e',63031122], // brinewater
 ['da8165322d2e1fecdc326ef1a721153f26428623958337a01460fcc45f211118',30982635], // airport
 ['2d792394f5672734b9faa0972293792f0983977318d464848f709aaec9232ad4',38771334], // barnacle
 ['e6effc27b375336108429c8c1fc7cd93dc5e8e1559b1b2e0cde6d98d65853527',123355936], // bluefin
 ['6f0c27703e7fbe5a02e442431ee88d811ac794849966a82a27b1f96b2c4578c7',100887693], // crableg
 ['5d22e97f51ed26fed86035ccff8c5d88e99798bf135b0f01b527a6f26797599f',126375025], // eeltail
 ['2cd34230fe9858e9651f0a597f8a8c740ca1067595379158dcaf64943fea384b',102761497], // flounder
 ['acc6983d529932832fbd9c5bb54c5e96fe43ccf3c9aaf5c21d3ca653af8359de',30169968], // hammerhead
 ['fcff18651320c4855b2af6278ad726aa7a8fbb4021c0329913163082a29e604d',29146955], // humpback
 ['8b7a26e0f71ed69c055e42ead154bd34bc08532ba89a95bea3a813766716ac1a',63601709], // manta
 ['11cecf76146211ac7fff04394763b0a1d883605f78136b4aee59b8e8dd076d23',44675591], // mincemeat
 ['ffe207e9b3d3eb4fc482ca45887fea1f1a131fdb2e2a0403535e1f281453bad1',41209929], // museum
 ['8dacb74311fc9af52fbcebbb37038246871dfc7ad633830b16d62eb57d7e655e',99915303], // robo
 ['8413aae6785ae2a8cbbecf075bde9c13e0aed55e4e2a048b93c894c91c3771d9',49575330], // shipshape
 ['7db028642562633eec19030d4b77219f9e5d5f2b189ce0d2a396911b7ddafb30',31263599], // sturgeon
 ['9d7c261d324d514148499d2ab804b49b05e0394bdc74e46b6e6afb0fff664d3b',59818484], // umami
 ['a32cff26b1a142d31e7658ebc48f213059b3ea42e86d32ed12cb80de5b03d046',43263289], // undertow
 ['17f3c5645505f75d58b99d5333cb8d2f710e230a3278c18a64e47258c2ec942c',64033907], // urchin
 ['0d9fc1e01e59c34301d65e8d2a8bf2aa90e0f4920f63daf4ac567df0c4ba33db',25930345], // wahoo
]);
// Unknown/new stages retain sourceBytes' checked streaming fallback.
export function sourceObjectBytes(stage){return objectBytes.get(stage.sourceSha256);}
