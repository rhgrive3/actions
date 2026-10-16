// Animated loadout cards remain valid pointer targets while their bounds move.
// Use native mouse input at an independently hit-tested point and retain the
// document's trusted-event receipt; never dispatch a synthetic click.
export function readKitCardTarget(id){
 const m=globalThis.s3ProbeG?.game?.menus,root=m?._scr?.el;
 const card=root?.querySelector('[data-id="w-'+id+'"]');
 if(!card||m.current!=='loadout'||m._scr.name!==m.current||!root.isConnected||root.inert||m._modal||card.disabled||!m._binds.has(card))throw Error('Kit card is not admitted: '+id);
 card.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
 let opacity=1;
 for(let el=card;el;el=el.parentElement){const style=getComputedStyle(el);if(style.display==='none'||style.visibility==='hidden')throw Error('Kit card is hidden: '+id);opacity*=Number(style.opacity);if(el===root)break;}
 if(opacity<=.6)throw Error('Kit card entrance is not admitted: '+id);
 const rect=card.getBoundingClientRect(),x=rect.x+rect.width/2,y=rect.y+rect.height/2;
 if(!(rect.width>0&&rect.height>0&&x>0&&y>0&&x<innerWidth&&y<innerHeight&&card.contains(document.elementFromPoint(x,y))))throw Error('Kit card is covered or outside the viewport: '+id);
 return{x,y,opacity};
}

export async function clickNativeKitCard(page,id){
 const first=await page.evaluate(readKitCardTarget,id);await page.mouse.move(first.x,first.y);
 const point=await page.evaluate(readKitCardTarget,id),start=await page.evaluate(()=>globalThis.s3KitInputTrace.length);
 await page.mouse.click(point.x,point.y);
 const events=await page.evaluate(start=>globalThis.s3KitInputTrace.slice(start),start);
 for(const type of ['pointerdown','pointerup','click'])if(!events.some(e=>e.type===type&&e.id==='w-'+id&&e.trust===true))throw Error('Native kit pointer receipt missing '+type+': '+id);
 return{point,trustedEvents:events.filter(e=>e.id==='w-'+id&&e.trust===true).map(e=>e.type)};
}
