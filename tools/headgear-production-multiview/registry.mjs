// QA-only convenience wrapper around the actual emitted production lifecycle.
// No catalog mutation, no geometry patch, no manual attachment.
export async function createFittedCharacter(options={}){
 const {prefix,hat=4,lod='game',inkColor=0x19ae96,...rest}=options;
 const {Character}=await import(prefix+'src/game/character.js');
 const {headgearState}=await import(prefix+'patches/local-quality/headgear/lifecycle.mjs');
 const character=new Character({...rest,sourceMotion:false,style:{...rest.style,hat}});
 character.setLod(lod);character.setColor(inkColor);
 return {character,get gear(){const s=headgearState(character);if(!s)throw Error('Production gear lifecycle absent');return s.groups.find(x=>x.lod===s.active)?.group;},setLod(next){character.setLod(next);},setInkColor(color){character.setColor(color);},dispose(){character.dispose();}};
}
