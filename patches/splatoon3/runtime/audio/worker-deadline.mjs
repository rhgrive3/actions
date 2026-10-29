// A response deadline measures foreground opportunity. Hidden browser pages can
// suspend Worker and timer delivery together; resume grants a fresh full bound.
// Each owner gets one timer/listener, both removed on settlement or disposal.
export function audioWorkerDeadline(current,onTimeout,{timeoutMs=20000,document=globalThis.document}={}){
  let timer=null,live=true;
  const cancel=()=>{
    if(!live)return;
    live=false;clearTimeout(timer);timer=null;
    document?.removeEventListener?.('visibilitychange',visibility);
  };
  const arm=()=>{
    clearTimeout(timer);timer=null;
    if(!live)return;
    if(!current()){cancel();return;}
    if(document?.hidden)return;
    timer=setTimeout(()=>{
      timer=null;
      if(document?.hidden)return;
      const owned=live&&current();cancel();if(owned)onTimeout();
    },timeoutMs);
    timer.unref?.();
  };
  function visibility(){arm();}
  document?.addEventListener?.('visibilitychange',visibility);
  arm();return cancel;
}
