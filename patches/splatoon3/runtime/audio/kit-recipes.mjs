// Original sound design; these are synthesis controls, NOT extracted game parameters.
const sub={
 bomb:[180,.14,4300,.72,700,14,2300,25,.23,2.10,.18,1.9],
 suction:[150,.16,3600,.69,580,12,2900,17,.36,2.71,.22,1.8],
 curling:[280,.11,5900,.54,980,7,3800,11,.39,3.13,.28,1.6],
 burst:[340,.07,8100,.85,1470,16,4000,5,.10,1.73,.11,1.5],
 autobomb:[210,.12,3800,.44,750,8,1850,28,.45,4.31,.32,1.7],
 fizzy:[460,.08,8500,.78,1600,22,4900,9,.21,3.17,.14,1.4],
 torpedo:[510,.10,5600,.42,1800,10,3100,13,.40,1.51,.42,1.8],
 inkMine:[95,.19,3000,.82,490,18,1250,42,.34,2.83,.27,2.0],
 toxicMist:[230,.21,5900,.90,950,24,3800,32,.09,1.38,.10,1.1],
 angleShooter:[1220,.055,9000,.25,2400,2,5500,4,.47,2.11,.44,1.7],
 splashWall:[140,.18,4800,.68,670,21,1920,39,.29,2.37,.26,1.5],
 sprinkler:[580,.07,7800,.61,1900,17,4250,18,.25,3.01,.31,1.3],
 beakon:[850,.09,3200,.18,1350,4,3600,22,.44,1.50,.46,1.3],
 pointSensor:[1020,.10,5200,.29,1850,6,2800,15,.31,2.00,.48,1.4]
};
const special={
 slam:[72,.25,3600,.78,510,23,980,47,.43,1.63,.32,2.2],
 storm:[230,.23,6200,.82,1120,30,2860,25,.10,2.19,.15,1.2],
 bubbler:[300,.20,2800,.21,910,9,1900,30,.26,1.49,.51,1.4],
 trizooka:[95,.22,4200,.60,560,16,2130,33,.51,2.89,.28,2.4],
 inkVac:[130,.24,2300,.41,480,18,1410,57,.20,3.33,.39,1.5],
 tacticooler:[790,.10,3900,.20,1610,5,4900,17,.38,1.51,.43,1.2],
 tentaMissiles:[420,.11,6700,.62,1820,12,3600,19,.36,2.79,.26,1.8],
 inkjet:[190,.20,4700,.86,670,25,2230,34,.33,3.21,.21,1.9],
 booyahBomb:[89,.25,3500,.36,510,12,1880,63,.23,1.50,.57,1.7],
 ultraStamp:[66,.19,3100,.72,380,10,740,38,.63,2.31,.27,2.3],
 zipcaster:[710,.08,9200,.31,2800,5,5100,9,.33,1.73,.40,1.5],
 killerWail:[390,.25,4300,.24,1300,4,1420,27,.37,1.25,.60,1.6],
 crabTank:[112,.14,5100,.42,630,7,1800,14,.66,3.93,.35,2.1],
 reefslider:[175,.21,4500,.65,750,14,2700,39,.43,2.83,.37,1.9],
 tripleInkstrike:[145,.22,7300,.84,1800,27,3300,44,.26,1.78,.22,1.8],
 superChump:[480,.14,4700,.32,2100,18,4100,21,.22,2.67,.39,1.4],
 krakenRoyale:[84,.25,2750,.50,350,18,1120,48,.32,1.61,.53,2.0],
 splattercolorScreen:[250,.23,7100,.92,1610,30,3470,15,.13,2.31,.15,1.2],
 waveBreaker:[540,.17,2400,.16,950,5,2700,29,.38,1.50,.55,1.5]
};
export const SUB_AUDIO_IDS=Object.freeze(Object.keys(sub));
export const SPECIAL_AUDIO_IDS=Object.freeze(Object.keys(special));
export const KIT_AUDIO=Object.freeze(Object.fromEntries([...Object.entries(sub).map(([id,c],i)=>['sub:'+id,{id:'sub:'+id,family:'sub',coefficients:Object.freeze(c),seed:0xacc0+i*4789,
  events:Object.freeze(['fire','impact','shield_hit','explosion','open','ready','release','spin','break']),reference:'original-unverified'}]),
 ...Object.entries(special).map(([id,c],i)=>['special:'+id,{id:'special:'+id,family:'special',coefficients:Object.freeze(c),seed:0xfec0+i*6113,
  events:Object.freeze(['fire','fire_alt','impact','shield_hit','explosion','open','charge','ready','release','spin','dodge','break']),reference:'original-unverified'}])].map(([id,r])=>[id,Object.freeze(r)])));
