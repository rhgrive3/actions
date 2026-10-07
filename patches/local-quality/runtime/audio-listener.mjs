const caches = new WeakMap();

function validPos(value) {
  return !!value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function listenerCache(engine, context, listener) {
  let cache = caches.get(engine);
  if (!cache) {
    cache = { context: null, listener: null, contextState: undefined, stateListener: null,
      force: true, positionReady: false, orientationReady: false,
      px: 0, py: 0, pz: 0, fx: 0, fy: 0, fz: 0, ux: 0, uy: 0, uz: 0 };
    caches.set(engine, cache);
  }
  if (cache.context !== context || cache.listener !== listener) {
    if (cache.context && cache.stateListener) {
      cache.context.removeEventListener?.('statechange', cache.stateListener);
    }
    cache.context = context;
    cache.listener = listener;
    cache.contextState = context.state;
    cache.stateListener = null;
    cache.force = true;
    cache.positionReady = false;
    cache.orientationReady = false;
    if (typeof context.addEventListener === 'function') {
      cache.stateListener = () => {
        if (context.state === 'running') cache.force = true;
      };
      context.addEventListener('statechange', cache.stateListener);
    }
  }
  if (cache.contextState !== context.state) {
    if (cache.contextState !== 'running' && context.state === 'running') cache.force = true;
    cache.contextState = context.state;
  }
  return cache;
}

export function updateAudioListener(engine, pos, forward, up) {
  const context = engine.ctx;
  if (!context || !validPos(pos)) return;
  engine.L.x = pos.x; engine.L.y = pos.y; engine.L.z = pos.z;
  const listener = context.listener, cache = listenerCache(engine, context, listener);
  const time = context.currentTime, force = cache.force;
  const modern = !!listener.positionX;
  if (modern) {
    if (force || !cache.positionReady || cache.px !== pos.x) {
      listener.positionX.setTargetAtTime(pos.x, time, 0.01);
      cache.px = pos.x;
    }
    if (force || !cache.positionReady || cache.py !== pos.y) {
      listener.positionY.setTargetAtTime(pos.y, time, 0.01);
      cache.py = pos.y;
    }
    if (force || !cache.positionReady || cache.pz !== pos.z) {
      listener.positionZ.setTargetAtTime(pos.z, time, 0.01);
      cache.pz = pos.z;
    }
    cache.positionReady = true;
    const okForward = validPos(forward) && (forward.x || forward.y || forward.z);
    if (okForward) {
      const useDefaultUp = !validPos(up) || !(up.x || up.y || up.z);
      const ux = useDefaultUp ? 0 : up.x;
      const uy = useDefaultUp ? 1 : up.y;
      const uz = useDefaultUp ? 0 : up.z;
      if (force || !cache.orientationReady || cache.fx !== forward.x) {
        listener.forwardX.setTargetAtTime(forward.x, time, 0.01);
        cache.fx = forward.x;
      }
      if (force || !cache.orientationReady || cache.fy !== forward.y) {
        listener.forwardY.setTargetAtTime(forward.y, time, 0.01);
        cache.fy = forward.y;
      }
      if (force || !cache.orientationReady || cache.fz !== forward.z) {
        listener.forwardZ.setTargetAtTime(forward.z, time, 0.01);
        cache.fz = forward.z;
      }
      if (force || !cache.orientationReady || cache.ux !== ux) {
        listener.upX.setTargetAtTime(ux, time, 0.01);
        cache.ux = ux;
      }
      if (force || !cache.orientationReady || cache.uy !== uy) {
        listener.upY.setTargetAtTime(uy, time, 0.01);
        cache.uy = uy;
      }
      if (force || !cache.orientationReady || cache.uz !== uz) {
        listener.upZ.setTargetAtTime(uz, time, 0.01);
        cache.uz = uz;
      }
      cache.orientationReady = true;
    }
  } else {
    const positionChanged = force || !cache.positionReady || cache.px !== pos.x ||
      cache.py !== pos.y || cache.pz !== pos.z;
    if (positionChanged && listener.setPosition) {
      listener.setPosition(pos.x, pos.y, pos.z);
      cache.px = pos.x; cache.py = pos.y; cache.pz = pos.z;
      cache.positionReady = true;
    }
    const okForward = validPos(forward) && (forward.x || forward.y || forward.z);
    if (okForward && listener.setOrientation) {
      const useDefaultUp = !validPos(up) || !(up.x || up.y || up.z);
      const ux = useDefaultUp ? 0 : up.x;
      const uy = useDefaultUp ? 1 : up.y;
      const uz = useDefaultUp ? 0 : up.z;
      const orientationChanged = force || !cache.orientationReady || cache.fx !== forward.x ||
        cache.fy !== forward.y || cache.fz !== forward.z || cache.ux !== ux ||
        cache.uy !== uy || cache.uz !== uz;
      if (orientationChanged) {
        listener.setOrientation(forward.x, forward.y, forward.z, ux, uy, uz);
        cache.fx = forward.x; cache.fy = forward.y; cache.fz = forward.z;
        cache.ux = ux; cache.uy = uy; cache.uz = uz;
        cache.orientationReady = true;
      }
    }
  }
  cache.force = false;
}
