function once(code,before,after,rel){const at=code.indexOf(before);if(at<0||code.indexOf(before,at+before.length)>=0)throw Error(`Queue bots 20261030 anchor mismatch: ${rel}`);return code.slice(0,at)+after+code.slice(at+before.length);}
export function adaptQueueBots20261030(rel,code){
 if(rel!=='src/game/bots.js')return code;
 code=once(code,`      const swimming = e.anim.form === 'swim';
      if (swimming && d > 3 && !(d < 9 && Math.hypot(e.vel.x, e.vel.z) > 7)) continue;
      // A worse candidate cannot replace the best even if visible. Avoid its expensive raycast.
      // Preserve the -4 existing-target bias and the original strict tie break.
      const score = d - (e === this.target ? 4 : 0);
      if (score >= bd) continue;`,
 `      // Neither a losing score nor a non-swimming actor needs swim speed.
      const score = d - (e === this.target ? 4 : 0);
      if (score >= bd) continue;
      if (e.anim.form === 'swim' && d > 3 && !(d < 9 && Math.hypot(e.vel.x, e.vel.z) > 7)) continue;`,rel);
 code=once(code,`    const choices = this._paintChoices || (this._paintChoices = []); choices.length = 0;
    const choicePool = this._paintChoicePool || (this._paintChoicePool = []);`,
 `    const nested = this._paintChoicesBusy === true;
    const choices = nested ? [] : this._paintChoices || (this._paintChoices = []); choices.length = 0;
    const choicePool = nested ? [] : this._paintChoicePool || (this._paintChoicePool = []);
    const tried = nested ? new Set() : this._triedGoals || (this._triedGoals = new Set());
    let mates;
    if (!nested) this._paintChoicesBusy = true;
    try {`,rel);
 code=once(code,`    const mates = this._mates || (this._mates = []); mates.length = 0;`,
 `    mates = nested ? [] : this._mates || (this._mates = []); mates.length = 0;`,rel);
 code=once(code,`    const tried = this._triedGoals || (this._triedGoals = new Set()); tried.clear();`,`    tried.clear();`,rel);
 code=once(code,`    this.goalTimer = 0.6 + Math.random() * 0.4;
  }

  _pickRefill()`,
 `    this.goalTimer = 0.6 + Math.random() * 0.4;
    } finally {
      choices.length=0;tried.clear();if(mates)mates.length=0;
      if(!nested)this._paintChoicesBusy=false;
    }
  }

  _pickRefill()`,rel);
 return code;
}
