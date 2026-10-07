export function adaptSplatlingReticle(rel,code,once){
 if(rel!=='src/ui/hud.js')return code;
 code="import { updateSplatlingStages } from '../../patches/local-quality/splatling-reticle.mjs';\n"+code;
 code=once(code,"      // spin-up meter (8 segments) that fills while charging and drains while the stream runs + spread ticks","      // Two stages use the live weapon profile; geometry is INKWAVE's, not a measured Nintendo replica.",'splatling staged description');
 code=once(code,'      this._chargeEl = r.querySelector(\'.iw-ret__charge\'); this._chargeC = 100;',`      r.querySelector('.iw-ret__segs').remove();
      const svg=r.querySelector('svg');
      svg.insertAdjacentHTML('beforeend','<circle r="28" class="iw-ret__track"/><circle r="28" class="iw-ret__charge iw-ret__charge-second" pathLength="100" style="stroke-dasharray:100;stroke-dashoffset:100"/>');
      this._chargeEl = r.querySelector('.iw-ret__charge'); this._chargeSecond=r.querySelector('.iw-ret__charge-second'); this._chargeC = 100;
      this._L.splatFirst=this._L.splatSecond=null;`,'splatling second ring');
 const needle='      if (L.charge == null || Math.abs(c - L.charge) > 0.004) { L.charge = c; this._chargeEl.style.strokeDashoffset = (100 * (1 - c)).toFixed(2); this.ret.style.setProperty(\'--ch\', c.toFixed(3)); }';
 return once(code,needle,"      updateSplatlingStages(this,c,lr,this._local()?.weapon || WEAPONS.splatling);\n      if (L.charge == null || Math.abs(c - L.charge) > 0.004) { L.charge = c; this.ret.style.setProperty('--ch', c.toFixed(3)); }",'splatling profile stage progress');
}
