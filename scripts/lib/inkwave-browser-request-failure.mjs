// Changing a loadout can cancel an HTML audio fetch after its entire response
// has already passed the immutable-build hash check. Record that lifecycle
// event separately; unverified aborts and real transport failures still fail CI.
export function verifiedAudioCancellation({url,error},verified) {
 if(!verified||error!=='net::ERR_ABORTED')return false;
 const path=new URL(url).pathname;
 return /^\/_versions\/[a-f0-9]{64}\/assets\/audio\/[^/]+\.mp3$/.test(path);
}
