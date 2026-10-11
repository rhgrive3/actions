#!/usr/bin/env node
// Extract only kit facts from the pinned original table. No inferred/default kit.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { MAIN_WEAPON_CATALOG } from '../patches/splatoon3/runtime/main-weapon-catalog-data.mjs';
const input=process.argv[2];
if(!input)throw Error('Usage: node scripts/generate-inkwave-canonical-kits.mjs <pinned WeaponInfoMain.json>');
const bytes=fs.readFileSync(input),rows=JSON.parse(bytes);
if(crypto.createHash('sha256').update(bytes).digest('hex')!=='53641c4b4c96d56d3ed4ca8d4c7426d83a0bf28af6f85e9eafc391b2ae9f663e')throw Error('Pinned WeaponInfoMain source hash mismatch');
const subs={Bomb_Splash:'bomb',Bomb_Suction:'suction',Bomb_Quick:'burst',Bomb_Curling:'curling',Bomb_Robot:'autobomb',Bomb_Fizzy:'fizzy',Bomb_Torpedo:'torpedo',Trap:'inkMine',PoisonMist:'toxicMist',PointSensor:'pointSensor',Shield:'splashWall',Sprinkler:'sprinkler',Beacon:'beakon',LineMarker:'angleShooter'};
const specials={SpUltraShot:'trizooka',SpGreatBarrier:'bubbler',SpSuperHook:'zipcaster',SpMultiMissile:'tentaMissiles',SpJetpack:'inkjet',SpInkStorm:'storm',SpNiceBall:'booyahBomb',SpUltraStamp:'ultraStamp',SpMicroLaser:'killerWail',SpBlower:'inkVac',SpChariot:'crabTank',SpSkewer:'reefslider',SpTripleTornado:'tripleInkstrike',SpEnergyStand:'tacticooler',SpFirework:'superChump',SpCastle:'krakenRoyale',SpChimney:'splattercolorScreen',SpShockSonar:'waveBreaker',SpPogo:'tripleSplashdown'};
const key=s=>s.match(/^Work\/Gyml\/([^/.]+)\.spl__WeaponInfo(?:Sub|Special)\.gyml$/)?.[1];
const records=MAIN_WEAPON_CATALOG.records.map(r=>{
 const matches=rows.map((x,i)=>[x,i]).filter(([x])=>x.__RowId===r.sourceRow);
 if(matches.length!==1)throw Error('Ambiguous/missing row '+r.sourceRow);
 const [row,index]=matches[0],sub=subs[key(row.SubWeapon)],special=specials[key(row.SpecialWeapon)];
 if(!sub||!special||!Number.isInteger(row.SpecialPoint)||row.SpecialPoint<=0)throw Error('Unresolved kit '+r.id);
 return {id:r.id,sourceRow:row.__RowId,rowPointer:'/'+index,SubWeapon:row.SubWeapon,SpecialWeapon:row.SpecialWeapon,SpecialPoint:row.SpecialPoint,sub,special,specialCost:row.SpecialPoint};
});
const reference={referenceVersion:'11.3.0',sourceCommit:'7280ff9cde8bb1c5dcef46c700c326471584d2e6',sourceUrl:'https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/mush/1130/WeaponInfoMain.json',sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'),records};
fs.writeFileSync('patches/splatoon3/reference/canonical-kits-1130.json',JSON.stringify(reference,null,2)+'\n');
const compact=records.map(r=>[r.id,r.sourceRow,r.sub,r.special,r.specialCost]);
fs.writeFileSync('patches/splatoon3/runtime/canonical-kits-data.mjs',`// Generated from pinned WeaponInfoMain 11.3.0; see reference/canonical-kits-1130.json.\n// Kit identity only: this does not certify every sub/special mechanic.\nexport const CANONICAL_KITS = Object.freeze(Object.fromEntries(${JSON.stringify(compact,null,2)}.map(([id,main,sub,special,specialCost])=>[id,Object.freeze({main,sub,special,specialCost})])));\n`);
console.log('Extracted '+records.length+' exact base kit rows; SHA256 '+reference.sourceSha256);
