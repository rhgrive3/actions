function once(code,before,after,label){const at=code.indexOf(before);if(at<0||code.indexOf(before,at+before.length)>=0)throw Error('native Storm device contact anchor: '+label);return code.slice(0,at)+after+code.slice(at+before.length);}
export function adaptStormDeviceContact(rel,code){
 if(rel==='src/net/netmatch.js'){
  code=once(code,'      kitPreparedEvents.push(e);','      if (ownerSimulationTickAccepted) stageNativeStormDeviceBirth(this, from, e, d.ts, d.u);\n      kitPreparedEvents.push(e);','completed native owner tick');
  code=once(code,'          commitCreatedSprinklerBirth(this, from, e, b);','          commitCreatedSprinklerBirth(this, from, e, b);\n          commitNativeStormDeviceBirth(this, from, e, b);','actual ghost creation');
  // Held Storm releases on a later native source tick than activation. Keep
  // the existing immediate path; only the fully staged paid native constructor
  // may take the later-tick branch. Budget/sequence/owner guards still run.
  const guard=/if \((!stormSnapshotAllows\(a, e\._stormSnapshot, from\)[\s\S]*?e\._netSeq <= auth\.useSeq)\) (return|break);/g;
  let count=0;code=code.replace(guard,(_all,condition,action)=>{count++;return `if ((${condition}) && !authorizeNativeStormDeviceBirth(this, from, e)) ${action};`;});
  if(count!==2)throw Error('native Storm device contact anchor: immediate-or-held guard');
  code=once(code,'          auth.used = true;','          if (auth) auth.used = true;','held native use may have no legacy immediate ticket');
  return "import { stageNativeStormDeviceBirth,authorizeNativeStormDeviceBirth,commitNativeStormDeviceBirth } from '../../patches/network-replication/storm-device-contact-proof.mjs';\n"+code;
 }
 if(rel==='src/game/weapons.js'){
  code=once(code,'        if (!c.ghost && !c.owner.remote) {','        if (!c.ghost && !c.owner.remote || hasNativeStormDeviceCloud(c)) {','native cloud source observation');
  const before="          this.s3DamageSubObjects?.(c.owner, c.group.position, objectRadius, damageStormObject, 'InkStorm', { pierceLOS: true });\n          this.s3DamageSpecialObjects?.(c.owner, c.group.position, objectRadius, damageStormObject, 'InkStorm', { pierceLOS: true });";
  code=once(code,before,"          if (c.ghost) observeNativeStormDeviceContacts(this, c, objectRadius, damageStormObject);\n          else {\n"+before+'\n          }','read-only ghost frame, original owner damage');
  return "import { attachNativeStormDeviceCloud,hasNativeStormDeviceCloud,observeNativeStormDeviceContacts } from '../../patches/network-replication/storm-device-contact-proof.mjs';\n"+code+`
const iwNativeStormCloudBirth=Projectiles.prototype._spawnCloud;
Projectiles.prototype._spawnCloud=function(b,...args){
 const before=this.clouds.length,result=iwNativeStormCloudBirth.call(this,b,...args);
 if(this.clouds.length>before)attachNativeStormDeviceCloud(this,b,this.clouds[this.clouds.length-1]);
 return result;
};
`;
 }
 return code;
}
