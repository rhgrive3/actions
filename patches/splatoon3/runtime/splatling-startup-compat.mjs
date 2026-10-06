// Integration candidate: the installed Splatling runner remains the sole
// owner of charge, paid ink, stream scheduling and cancellation refunds.
const EPS = 1e-10;
const INSTALLED = Symbol.for('inkwave.splatling.startup.compat.v1');
export function installSplatlingStartupCompat({WeaponRunner}) {
  const P = WeaponRunner.prototype;
  if (Object.hasOwn(P, INSTALLED)) return;
  Object.defineProperty(P, INSTALLED, {value:true});
  const clear = r => {
    r.s3SplatlingStartup = 0; r.s3SplatlingEmerging = false;
    r.s3SplatlingEmergeT = 0; r.s3SplatlingHeld = false;
  };
  const reset = P.reset;
  P.reset = function (...args) { const result=reset.apply(this,args);clear(this);return result; };
  const runner = P._splatling;
  P._splatling = function (dt,input,w) {
    if (this.a.form === 'squid') {
      clear(this);this.s3SplatlingEmerging=true;this.s3SplatlingEmergeT=6/60;
      return runner.call(this,dt,input,w);
    }
    if (input.sub || input.subReleased || this.aimingSub) {
      clear(this);return runner.call(this,dt,input,w);
    }
    if (this.s3SplatlingEmerging) {
      if (this.s3SplatlingEmergeT > 1e-5) {
        this.s3SplatlingEmergeT=Math.max(0,this.s3SplatlingEmergeT-dt);
        if(input.fire)this.s3SplatlingHeld=true;
        return;
      }
      this.s3SplatlingEmerging=false;
    }
    if (this.streaming) {
      this.s3SplatlingStartup=0;this.s3SplatlingEmerging=false;
      this.s3SplatlingHeld=!!input.fire;
      return runner.call(this,dt,input,w);
    }
    if (!input.fire) { this.s3SplatlingHeld=false;this.s3SplatlingStartup=0; }
    else if(this.cooldown<=EPS&&!this.charging) {
      if(!this.s3SplatlingHeld){this.s3SplatlingHeld=true;this.s3SplatlingStartup=1/60;}
      if(this.s3SplatlingStartup>1e-5){this.s3SplatlingStartup=Math.max(0,this.s3SplatlingStartup-dt);return;}
    }
    return runner.call(this,dt,input,w);
  };
}
