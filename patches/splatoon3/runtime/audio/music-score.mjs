// Original INKWAVE compositions, not transcriptions or arrangements of Nintendo melodies.
// Durations are sixteenth-note steps, not fractional-note denominators.
// Tempos/voicings below are authored choices. Retail tempo and mix parity are unverified.
export const AUDIO_SCORE_METADATA=Object.freeze({
  title:{name:'Chromatic Arrival',bpm:132,key:'A minor'},menu:{name:'Underpass Lounge',bpm:108,key:'F major'},
  battle:{name:'Ink Circuit',bpm:152,key:'D minor'},battle_final:{name:'Last Lap Pigment',bpm:168,key:'D minor'},
  results_win:{name:'Afterglow High Five',bpm:120,key:'C major'},results_lose:{name:'Next Round',bpm:96,key:'A minor'}
});
export function installOriginalAudioScore(songs){
  const bars=(chords,lead,kind='battle')=>({bars:4,chords,lead,crash:kind==='battle',
    drums:kind==='lobby'?{k:'X.....x...X.....',s:'....x.......x...',h:'x.c.x.c.x.c.x.oc',sh:'xcxcxcxcxcxcxcxc'}:
      {k:'X..x..x.X...x...',s:'....X.....g.X..g',h:'x.c.x.o.x.c.x.oc'},
    bass:['R..5.Rr.O..R.3.n','R.R..5..R..O.5..'],stabs:kind==='lobby'?'X---..x-..x-..x-':'X-.x..X-..x.X-..'});
  const leadA='D5/2 F5/2 A5/4 G5/2 E5/2 F5/4 | C5/4 E5/2 G5/2 A5/4 G5/4 | Bb5/2 A5/2 F5/4 D5/4 F5/4 | E5/2 G5/2 C#5/4 E5/4 A5/4';
  const leadB='A5/4 F5/2 E5/2 D5/4 A4/4 | G5/2 E5/2 C5/4 D5/2 E5/2 G5/4 | F5/4 Bb5/4 A5/2 G5/2 F5/4 | E5/4 C#5/4 A4/4 E5/4';
  const common={swing:0,pump:.22,inst:{bass:'punk',chords:'guitar',lead:'pulse',lead2:'saw',arp:'pluck'},
    mix:{bass:.29,chords:.20,lead:.18,lead2:.09,hats:.14}};
  songs.battle={...common,...AUDIO_SCORE_METADATA.battle,sections:{
    intro:{bars:1,chords:['D5'],drums:{k:'X.......X.......',s:'........xxxxXXXX'},bass:'R-------R-------',stabs:'X---------------'},
    A:bars(['Dm7','C','Bbmaj7','A7'],leadA),B:{...bars(['Dm','F','Gm7','A7'],leadB),pad:true}},order:['intro','A','B','A','B'],loopFrom:1};
  songs.battle_final={...common,...AUDIO_SCORE_METADATA.battle_final,pump:.27,sections:{
    A:{...bars(['Dm','C','Bb','A7'],leadB),harmony:true,drums:{k:'X...x.X.X...x.X.',s:'....X.......X.xx',h:'xcxcxcxcxcxcxcxo'},bass:'R.ROR.R.5.5OR.On'},
    B:{...bars(['Gm7','Bb','Dm','A7'],leadA),harmony:true}},order:['A','B'],loopFrom:0};
  songs.title={...common,...AUDIO_SCORE_METADATA.title,sections:{A:bars(['Am','F','Dm7','E7'],
    'A4/4 C5/2 E5/2 G5/4 E5/4 | F5/4 A5/4 G5/2 E5/2 C5/4 | D5/4 F5/4 A4/4 C5/4 | B4/2 D5/2 G#4/4 B4/4 E5/4')},order:['A'],loopFrom:0};
  songs.menu={...common,...AUDIO_SCORE_METADATA.menu,swing:.12,pump:.10,inst:{bass:'funk',chords:'pluck',lead:'bell',arp:'pluck'},
    mix:{bass:.23,chords:.14,lead:.14,hats:.10},sections:{A:bars(['Fmaj7','Dm7','Gm7','C9'],
      'A4/4 C5/2 E5/2 D5/4 C5/4 | F4/4 A4/4 C5/4 A4/4 | Bb4/4 A4/2 G4/2 D5/4 Bb4/4 | E5/4 D5/4 G4/4 C5/4','lobby')},order:['A'],loopFrom:0};
  songs.results_win={...common,...AUDIO_SCORE_METADATA.results_win,inst:{bass:'funk',chords:'pluck',lead:'bell',arp:'pluck'},
    sections:{A:bars(['C','Fmaj7','Dm7','G7'], 'E5/2 G5/2 C6/4 B5/4 G5/4 | A5/4 C6/4 A5/4 F5/4 | D5/4 F5/4 A5/4 C6/4 | B5/4 A5/2 G5/2 E5/4 C5/4','lobby')},order:['A'],loopFrom:0};
  songs.results_lose={...common,...AUDIO_SCORE_METADATA.results_lose,pump:.08,inst:{bass:'funk',chords:'pluck',lead:'bell',arp:'pluck'},
    mix:{lead:.12,bass:.20,chords:.13},sections:{A:bars(['Am7','Dm7','Fmaj7','E7'], 'E5/4 C5/4 A4/4 G4/4 | A4/4 D5/4 C5/4 A4/4 | C5/4 E5/4 A4/4 C5/4 | B4/4 G#4/4 E4/4 E5/4','lobby')},order:['A'],loopFrom:0};
}
