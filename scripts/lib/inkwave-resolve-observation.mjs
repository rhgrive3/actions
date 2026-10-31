// Opt-in diagnostic metadata observer. Install on a fresh context before storage.
// No pixel readback, GL state mutation, extra resolve/draw, or getError call.
// Native sample/depth/stencil bits remain UNOBSERVED, including after a blit.
export function installResolveObservation(gl, { maxEvents = 4096, maxObjects = 4096 } = {}) {
  if (!Number.isSafeInteger(maxEvents) || maxEvents < 1 || !Number.isSafeInteger(maxObjects) || maxObjects < 1) throw new TypeError('Invalid diagnostic budget');
  // Structural WebGL2 preflight MUST precede every hook and diagnostic query.
  // getError nonconsumption alone would not prevent an undefined-enum query.
  const requiredEnums = ['NONE', 'TEXTURE', 'RENDERBUFFER', 'READ_FRAMEBUFFER', 'DRAW_FRAMEBUFFER', 'FRAMEBUFFER', 'READ_FRAMEBUFFER_BINDING', 'DRAW_FRAMEBUFFER_BINDING', 'RENDERBUFFER_BINDING', 'MAX_COLOR_ATTACHMENTS', 'MAX_DRAW_BUFFERS', 'READ_BUFFER', 'DRAW_BUFFER0', 'COLOR_ATTACHMENT0', 'DEPTH_ATTACHMENT', 'STENCIL_ATTACHMENT', 'DEPTH_STENCIL_ATTACHMENT', 'FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE', 'FRAMEBUFFER_ATTACHMENT_OBJECT_NAME', 'FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL', 'FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE', 'FRAMEBUFFER_ATTACHMENT_TEXTURE_LAYER', 'TEXTURE_2D', 'TEXTURE_3D', 'TEXTURE_2D_ARRAY', 'TEXTURE_CUBE_MAP', 'TEXTURE_CUBE_MAP_POSITIVE_X', 'TEXTURE_CUBE_MAP_NEGATIVE_Z', 'TEXTURE_BINDING_2D', 'TEXTURE_BINDING_3D', 'TEXTURE_BINDING_2D_ARRAY', 'TEXTURE_BINDING_CUBE_MAP', 'RENDERBUFFER_WIDTH', 'RENDERBUFFER_HEIGHT', 'RENDERBUFFER_INTERNAL_FORMAT', 'RENDERBUFFER_SAMPLES', 'RENDERBUFFER_RED_SIZE', 'RENDERBUFFER_GREEN_SIZE', 'RENDERBUFFER_BLUE_SIZE', 'RENDERBUFFER_ALPHA_SIZE', 'RENDERBUFFER_DEPTH_SIZE', 'RENDERBUFFER_STENCIL_SIZE', 'COLOR', 'DEPTH', 'STENCIL', 'DEPTH_STENCIL', 'COLOR_BUFFER_BIT', 'DEPTH_BUFFER_BIT', 'STENCIL_BUFFER_BIT'];
  const requiredMethods = ['getParameter', 'getFramebufferAttachmentParameter', 'getRenderbufferParameter', 'getExtension', 'bindFramebuffer', 'framebufferTexture2D', 'framebufferTextureLayer', 'framebufferRenderbuffer', 'renderbufferStorage', 'renderbufferStorageMultisample', 'texStorage2D', 'texStorage3D', 'texImage2D', 'texImage3D', 'texSubImage2D', 'texSubImage3D', 'copyTexSubImage2D', 'copyTexSubImage3D', 'generateMipmap', 'copyTexImage2D', 'compressedTexImage2D', 'compressedTexImage3D', 'compressedTexSubImage2D', 'compressedTexSubImage3D', 'blitFramebuffer', 'drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'clear', 'clearBufferfv', 'clearBufferiv', 'clearBufferuiv', 'clearBufferfi', 'invalidateFramebuffer', 'invalidateSubFramebuffer'];
  if (!gl || requiredEnums.some(name => !Number.isInteger(gl[name]) || gl[name] < 0) || requiredMethods.some(name => typeof gl[name] !== 'function')) throw new TypeError('Complete WebGL2 API capability required before installing resolve observer');
  const rows = [], failures = [], saved = [], objects = new WeakMap(), resources = new Map(), extensions = new Map(), attachmentModes = new WeakMap();
  const raw = Object.fromEntries(['getParameter', 'getFramebufferAttachmentParameter', 'getRenderbufferParameter'].map(k => [k, gl[k]]));
  let nextObject = 1, sequence = 0, dropped = 0, active = true;
  const call = (name, ...args) => Reflect.apply(raw[name], gl, args);
  const parameter = name => { if (typeof gl[name] !== 'number') throw Error('Missing enum ' + name); return call('getParameter', gl[name]); };
  const describe = error => { try { return String(error?.message ?? error); } catch { return 'Unserializable exception (identity preserved)'; } };
  const fail = (stage, error) => { if (failures.length < maxEvents) failures.push({ stage, error: describe(error) }); else dropped++; };
  const attempt = (stage, fn) => { try { return fn(); } catch (error) { fail(stage, error); return null; } };
  const record = row => { if (rows.length < maxEvents) rows.push(row); else dropped++; };
  const numeric = (args, indices) => {
    if (indices.some(i => typeof args[i] !== 'number' || !Number.isFinite(args[i]))) throw Error('Nonprimitive or unsupported numeric arguments remain unobserved; native conversion untouched');
  };
  const object = (value, kind) => {
    if (value == null) return null;
    if ((typeof value !== 'object' && typeof value !== 'function')) throw Error('Non-object GL identity');
    let id = objects.get(value);
    if (!id) {
      if (resources.size >= maxObjects) throw Error('Object budget exhausted');
      id = nextObject++; objects.set(value, id);
      resources.set(id, { id, kind, allocationGeneration: 0, attachmentAttemptGeneration: 0, writeAttemptGeneration: 0, invalidationAttemptGeneration: 0, owner: null, levels: new Map() });
    }
    const row = resources.get(id);
    if (row.kind !== kind) throw Error('Conflicting GL object kind');
    return row;
  };
  const reference = row => row && ({ id: row.id, kind: row.kind, owner: row.owner, allocationGeneration: row.allocationGeneration, attachmentAttemptGeneration: row.attachmentAttemptGeneration,
    writeAttemptGeneration: row.writeAttemptGeneration, invalidationAttemptGeneration: row.invalidationAttemptGeneration });
  const framebufferTarget = target => {
    if (![gl.READ_FRAMEBUFFER, gl.DRAW_FRAMEBUFFER, gl.FRAMEBUFFER].includes(target)) throw Error('Unsupported framebuffer target');
    return target;
  };
  const boundFramebuffer = target => parameter(framebufferTarget(target) === gl.READ_FRAMEBUFFER ? 'READ_FRAMEBUFFER_BINDING' : 'DRAW_FRAMEBUFFER_BINDING');
  const attachmentPoints = () => {
    const count = parameter('MAX_COLOR_ATTACHMENTS');
    if (!Number.isInteger(count) || count < 1 || count > 32) throw Error('Unsupported attachment count');
    return [...Array.from({ length: count }, (_, i) => gl.COLOR_ATTACHMENT0 + i), gl.DEPTH_ATTACHMENT, gl.STENCIL_ATTACHMENT];
  };
  const selectors = () => {
    const count = parameter('MAX_DRAW_BUFFERS');
    if (!Number.isInteger(count) || count < 1 || count > 32) throw Error('Unsupported draw-buffer count');
    return { readBuffer: parameter('READ_BUFFER'), drawBuffers: Array.from({ length: count }, (_, i) => call('getParameter', gl.DRAW_BUFFER0 + i)) };
  };
  const attachment = (target, point) => {
    const get = name => { if (typeof gl[name] !== 'number') throw Error('Missing enum ' + name); return call('getFramebufferAttachmentParameter', target, point, gl[name]); };
    const kind = get('FRAMEBUFFER_ATTACHMENT_OBJECT_TYPE');
    if (kind === gl.NONE) return null;
    if (kind !== gl.TEXTURE && kind !== gl.RENDERBUFFER) throw Error('Unsupported attachment object kind');
    const obj = get('FRAMEBUFFER_ATTACHMENT_OBJECT_NAME'), resource = object(obj, kind === gl.TEXTURE ? 'texture' : 'renderbuffer');
    if (!resource) throw Error('Missing attachment object');
    const row = { point, resource: reference(resource), nativeStorageBits: 'unobserved' };
    if (kind === gl.TEXTURE) {
      row.level = get('FRAMEBUFFER_ATTACHMENT_TEXTURE_LEVEL');
      row.face = get('FRAMEBUFFER_ATTACHMENT_TEXTURE_CUBE_MAP_FACE');
      row.layer = get('FRAMEBUFFER_ATTACHMENT_TEXTURE_LAYER');
      row.allocation = resource.levels.get((row.face || resource.target) + '/' + row.level) ?? null;
      const candidate = attachmentModes.get(boundFramebuffer(target))?.get(point);
      const mode = candidate?.resourceID === resource.id ? candidate : null;
      row.implicitRTT = mode?.implicitRTT ?? null;
      // A native return is not GL success. Never relabel a core reattachment
      // attempt as queried zero samples: an earlier implicit attachment may live.
      const queryExtension = [...extensions].map(([name, value]) => ({ name, enumValue: value.object?.FRAMEBUFFER_ATTACHMENT_TEXTURE_SAMPLES_EXT })).find(value => Number.isInteger(value.enumValue) && value.enumValue >= 0);
      if (queryExtension) {
        row.queriedSamples = call('getFramebufferAttachmentParameter', target, point, queryExtension.enumValue);
        row.sampleQueryExtension = queryExtension.name;
      } else row.queriedSamples = { unobserved: 'No actual extension sample-query capability observed; core zero is not inferred' };
      row.attachmentAttempt = mode ? { coreAttachment: mode.coreAttachment ?? false, implicitRTT: mode.implicitRTT ?? null } : null;
    } else row.allocation = resource.storage ?? null;
    row.metadataComplete = !!row.resource.owner && row.resource.allocationGeneration > 0 && !!row.allocation && !resource.unsupportedAllocation && (kind !== gl.TEXTURE || typeof row.queriedSamples === 'number');
    return row;
  };
  const framebuffer = target => {
    const value = boundFramebuffer(target);
    if (value === null) return { defaultFramebuffer: true, metadataComplete: false, nativeStorageBits: 'unobserved' };
    const resource = object(value, 'framebuffer');
    const attachments = attachmentPoints().map(point => attachment(target, point)).filter(Boolean);
    return { resource: reference(resource), attachments, metadataComplete: !!resource.owner && attachments.length > 0 && attachments.every(a => a.metadataComplete) };
  };
  const snapshot = () => ({ ...selectors(), read: framebuffer(gl.READ_FRAMEBUFFER), draw: framebuffer(gl.DRAW_FRAMEBUFFER),
    nativeStorageBits: 'unobserved', destinationBytes: 'unobserved', glErrorState: 'unobserved; getError is never consumed' });
  const write = (mask, invalidation = false, points = null) => {
    const fb = framebuffer(gl.DRAW_FRAMEBUFFER), selected = selectors().drawBuffers;
    if (fb.resource) resources.get(fb.resource.id)[invalidation ? 'invalidationAttemptGeneration' : 'writeAttemptGeneration']++;
    const changed = new Set();
    for (const a of fb.attachments ?? []) {
      const selectedColor = selected.includes(a.point) && (mask & gl.COLOR_BUFFER_BIT);
      const depth = a.point === gl.DEPTH_ATTACHMENT && (mask & gl.DEPTH_BUFFER_BIT);
      const stencil = a.point === gl.STENCIL_ATTACHMENT && (mask & gl.STENCIL_BUFFER_BIT);
      if (points ? points.includes(a.point) || points.includes(gl.DEPTH_STENCIL_ATTACHMENT) && [gl.DEPTH_ATTACHMENT, gl.STENCIL_ATTACHMENT].includes(a.point) : selectedColor || depth || stencil) {
        const row = resources.get(a.resource.id);
        if (!changed.has(row.id)) { row[invalidation ? 'invalidationAttemptGeneration' : 'writeAttemptGeneration']++; changed.add(row.id); }
      }
    }
  };
  const boundTexture = target => {
    if (![gl.TEXTURE_2D, gl.TEXTURE_3D, gl.TEXTURE_2D_ARRAY, gl.TEXTURE_CUBE_MAP].includes(target) && !(Number.isInteger(target) && target >= gl.TEXTURE_CUBE_MAP_POSITIVE_X && target <= gl.TEXTURE_CUBE_MAP_NEGATIVE_Z)) throw Error('Unsupported texture target');
    const cube = target === gl.TEXTURE_CUBE_MAP || target >= gl.TEXTURE_CUBE_MAP_POSITIVE_X && target <= gl.TEXTURE_CUBE_MAP_NEGATIVE_Z;
    const name = cube ? 'TEXTURE_BINDING_CUBE_MAP' : target === gl.TEXTURE_3D ? 'TEXTURE_BINDING_3D' : target === gl.TEXTURE_2D_ARRAY ? 'TEXTURE_BINDING_2D_ARRAY' : 'TEXTURE_BINDING_2D';
    const row = object(parameter(name), 'texture');
    if (!row) throw Error('Texture storage without tracked binding');
    row.target = cube ? gl.TEXTURE_CUBE_MAP : target;
    return row;
  };
  const allocation = (name, a) => {
    if (name.startsWith('renderbufferStorage')) {
      numeric(a, name === 'renderbufferStorage' ? [0, 1, 2, 3] : [0, 1, 2, 3, 4]);
      if (a[0] !== gl.RENDERBUFFER) throw Error('Unsupported renderbuffer target');
      const row = object(parameter('RENDERBUFFER_BINDING'), 'renderbuffer');
      if (!row) throw Error('Renderbuffer storage without binding');
      const multi = name !== 'renderbufferStorage';
      row.allocationGeneration++; row.writeAttemptGeneration++;
      row.storage = { glCallSamples: multi ? a[1] : 0, rendererRequestedSamples: 'unobserved', rendererClampedSamples: 'unobserved' };
      for (const key of ['WIDTH', 'HEIGHT', 'INTERNAL_FORMAT', 'SAMPLES', 'RED_SIZE', 'GREEN_SIZE', 'BLUE_SIZE', 'ALPHA_SIZE', 'DEPTH_SIZE', 'STENCIL_SIZE']) {
        const enumName = 'RENDERBUFFER_' + key;
        if (typeof gl[enumName] !== 'number') throw Error('Missing enum ' + enumName);
        row.storage[key] = call('getRenderbufferParameter', gl.RENDERBUFFER, gl[enumName]);
      }
      return;
    }
    numeric(a, name.startsWith('texStorage') ? name === 'texStorage2D' ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5] : name === 'texImage2D' ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const row = boundTexture(a[0]);
    row.unsupportedAllocation = false;
    row.allocationGeneration++; row.writeAttemptGeneration++;
    if (name === 'texStorage2D' || name === 'texStorage3D') {
      row.levels.clear();
      if (!Number.isInteger(a[1]) || a[1] < 1 || a[1] > 32) throw Error('Unsupported mip-level count');
      const faces = a[0] === gl.TEXTURE_CUBE_MAP ? Array.from({ length: 6 }, (_, i) => gl.TEXTURE_CUBE_MAP_POSITIVE_X + i) : [a[0]];
      for (const face of faces) for (let level = 0; level < a[1]; level++) row.levels.set(face + '/' + level,
        { width: Math.max(1, a[3] >> level), height: Math.max(1, a[4] >> level), depth: name === 'texStorage3D' ? a[0] === gl.TEXTURE_3D ? Math.max(1, a[5] >> level) : a[5] : 1, internalFormat: a[2] });
    } else {
      row.levels.delete(a[0] + '/' + a[1]);
      if (typeof a[3] !== 'number' || (name === 'texImage2D' && a.length < 9)) throw Error('Unsupported image-source allocation overload');
      if (![a[1], a[3], a[4], ...(name === 'texImage3D' ? [a[5]] : [])].every(v => Number.isSafeInteger(v) && v >= 0)) throw Error('Invalid allocation dimensions');
      row.levels.set(a[0] + '/' + a[1], { width: a[3], height: a[4], depth: name === 'texImage3D' ? a[5] : 1, internalFormat: a[2] });
    }
  };
  const install = (target, name, before, after) => {
    const original = target[name];
    if (typeof original !== 'function') { fail('install:' + name, 'Missing function'); return; }
    const descriptor = Object.getOwnPropertyDescriptor(target, name);
    const wrapper = function (...args) {
      if (!active || this !== target) return Reflect.apply(original, this, args);
      const index = ++sequence, pre = attempt('before:' + name, () => before?.(args, index));
      let result;
      try { result = Reflect.apply(original, this, args); }
      catch (error) { record({ sequence: index, kind: 'native-throw', method: name, before: pre, error: describe(error), after: null }); throw error; }
      attempt('after:' + name, () => after?.(args, index, pre, result));
      return result;
    };
    try { Object.defineProperty(target, name, { configurable: true, writable: true, enumerable: descriptor?.enumerable ?? false, value: wrapper }); saved.push({ target, name, descriptor, wrapper }); }
    catch (error) { fail('install:' + name, error); }
  };
  const storage = ['renderbufferStorage', 'renderbufferStorageMultisample', 'texStorage2D', 'texStorage3D', 'texImage2D', 'texImage3D'];
  for (const name of storage) install(gl, name, null, a => allocation(name, a));
  for (const name of ['framebufferTexture2D', 'framebufferTextureLayer', 'framebufferRenderbuffer']) install(gl, name, null, a => {
    numeric(a, name === 'framebufferTexture2D' ? [0, 1, 2, 4] : name === 'framebufferTextureLayer' ? [0, 1, 3, 4] : [0, 1, 2]);
    const fb = boundFramebuffer(a[0]);
    if (fb === null) throw Error('Attachment API on default framebuffer');
    if (!attachmentModes.has(fb)) attachmentModes.set(fb, new Map());
    object(fb, 'framebuffer').attachmentAttemptGeneration++;
    const value = name === 'framebufferTextureLayer' ? a[2] : a[3];
    const resource = object(value, name === 'framebufferRenderbuffer' ? 'renderbuffer' : 'texture');
    attachmentModes.get(fb).set(a[1], { coreAttachment: true, resourceID: resource?.id ?? null });
  });
  const updates = ['texSubImage2D', 'texSubImage3D', 'copyTexSubImage2D', 'copyTexSubImage3D', 'generateMipmap'];
  for (const name of updates) install(gl, name, null, a => { boundTexture(a[0]).writeAttemptGeneration++; });
  for (const name of ['copyTexImage2D', 'compressedTexImage2D', 'compressedTexImage3D']) install(gl, name, null, a => {
    const row = boundTexture(a[0]); row.allocationGeneration++; row.writeAttemptGeneration++; row.unsupportedAllocation = true;
    fail('allocation:' + name, 'Unsupported allocation; metadata coverage is incomplete');
  });
  for (const name of ['compressedTexSubImage2D', 'compressedTexSubImage3D']) install(gl, name, null, a => { boundTexture(a[0]).writeAttemptGeneration++; });
  install(gl, 'blitFramebuffer', (args, index) => {
    numeric(args, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const row = { sequence: index, kind: 'explicit-blit', method: 'blitFramebuffer', srcRect: args.slice(0, 4), dstRect: args.slice(4, 8), mask: args[8], filter: args[9], before: snapshot(), after: null,
      nativeCallReturned: false, nativeStorageBits: 'unobserved', storageEqualityEligible: false };
    record(row); return row;
  }, (args, index, row) => {
    if (!row) { fail('after:blitFramebuffer', 'Before boundary unavailable; native arguments left untouched'); return; }
    row.nativeCallReturned = true;
    write(args[8]);
    const after = snapshot();
    row.after = after;
    row.metadataComplete = row.before.read.metadataComplete && row.before.draw.metadataComplete && after.read.metadataComplete && after.draw.metadataComplete;
  });
  for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) install(gl, name, null, () => write(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT));
  install(gl, 'clear', null, a => { numeric(a, [0]); write(a[0]); });
  for (const name of ['clearBufferfv', 'clearBufferiv', 'clearBufferuiv', 'clearBufferfi']) install(gl, name, null, a => {
    numeric(a, [0, 1]);
    if (![gl.COLOR, gl.DEPTH, gl.STENCIL, gl.DEPTH_STENCIL].includes(a[0])) throw Error('Unsupported clear buffer selector');
    const mask = a[0] === gl.COLOR ? gl.COLOR_BUFFER_BIT : a[0] === gl.DEPTH ? gl.DEPTH_BUFFER_BIT : a[0] === gl.STENCIL ? gl.STENCIL_BUFFER_BIT : gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT;
    write(mask, false, a[0] === gl.COLOR ? [selectors().drawBuffers[a[1]]] : null);
  });
  for (const name of ['invalidateFramebuffer', 'invalidateSubFramebuffer']) install(gl, name, (args, index) => {
    numeric(args, name === 'invalidateSubFramebuffer' ? [0, 2, 3, 4, 5] : [0]);
    const target = args[0], prior = framebuffer(target);
    // WebIDL consumes sequence<GLenum> only in the original native function.
    // Even an Array may have proxy/getter effects, so never inspect it twice.
    const row = { sequence: index, kind: 'invalidation-attempt', method: name, target, attachments: 'unobserved; native sequence left untouched', before: prior, metadataComplete: false };
    fail('invalidation:' + name, 'Attachment sequence conversion not observable without interference');
    record(row); return row;
  }, (args, index, row) => {
    if (row?.before.resource) resources.get(row.before.resource.id).invalidationAttemptGeneration++;
    // The framebuffer call envelope is known; selected attachment generations
    // are intentionally not invented from an unobserved native sequence.
    if (row) row.nativeCallReturned = true;
  });
  // Observe the extension the application actually requests; never enable one.
  install(gl, 'getExtension', null, (args, index, pre, result) => {
    if (typeof args[0] !== 'string') throw Error('Nonprimitive extension name unobserved; native conversion untouched');
    if (!/^(WEBGL|EXT)_multisampled_render_to_texture2?$/.test(args[0])) return;
    const name = args[0];
    record({ sequence: index, kind: 'extension-availability', name, available: result !== null });
    if (result) observeExtension(name, result);
  });
  function observeExtension(name, ext) {
    if (extensions.has(name)) { if (extensions.get(name).object !== ext) fail('extension', 'Extension object changed'); return; }
    extensions.set(name, { object: ext });
    for (const method of ['renderbufferStorageMultisampleEXT', 'framebufferTexture2DMultisampleEXT']) install(ext, method,
      (args, index) => {
        numeric(args, method.startsWith('renderbuffer') ? [0, 1, 2, 3, 4] : [0, 1, 2, 4, 5]);
        if (method.startsWith('renderbuffer')) { if (args[0] !== gl.RENDERBUFFER) throw Error('Unsupported renderbuffer target'); }
        else framebufferTarget(args[0]);
        const row = { sequence: index, kind: 'implicit-rtt-api', extension: name, method, target: args[0],
        parameters: method.startsWith('renderbuffer') ? { internalFormat: args[2], width: args[3], height: args[4] } : { attachment: args[1], textureTarget: args[2], level: args[4] },
        glCallSamples: args[method.startsWith('renderbuffer') ? 1 : 5], before: snapshot(), after: null,
        actualImplicitResolvePoint: 'unobserved', nativeStorageBits: 'unobserved', storageEqualityEligible: false, nativeCallReturned: false }; record(row); return row; },
      (args, index, row) => {
        if (!row) { fail('after:' + method, 'Before boundary unavailable; native arguments left untouched'); return; }
        row.nativeCallReturned = true;
        if (method.startsWith('renderbuffer')) allocation(method, args);
        else {
          const fb = boundFramebuffer(args[0]);
          if (fb === null) throw Error('Implicit attachment on default framebuffer');
          if (!attachmentModes.has(fb)) attachmentModes.set(fb, new Map());
          object(fb, 'framebuffer').attachmentAttemptGeneration++;
          const resource = object(args[3], 'texture');
          attachmentModes.get(fb).set(args[1], { resourceID: resource?.id ?? null, implicitRTT: { extension: name, glCallSamples: args[5], rendererRequestedSamples: 'unobserved', rendererClampedSamples: 'unobserved' } });
        }
        row.after = snapshot();
      });
  }
  // Binding away is only a transition witness, NOT a certified implicit resolve.
  install(gl, 'bindFramebuffer', (args, index) => {
    const prior = framebuffer(args[0]);
    const implicit = prior.attachments?.some(a => a.implicitRTT);
    if (!implicit) return null;
    const row = { sequence: index, kind: 'implicit-rtt-transition', before: prior, beforeSelectors: selectors(), after: null, target: args[0], actualImplicitResolvePoint: 'unobserved', nativeStorageBits: 'unobserved', storageEqualityEligible: false };
    record(row); return row;
  }, (args, index, row) => { if (row) { row.after = framebuffer(args[0]); row.afterSelectors = selectors(); } });
  return {
    registerOwner(value, kind, owner) {
      if (!active) throw Error('Observer stopped');
      if (typeof owner !== 'string' || !owner.trim() || !['texture', 'renderbuffer', 'framebuffer'].includes(kind)) throw TypeError('Invalid owner identity');
      const row = object(value, kind); if (!row) throw TypeError('Null owner object');
      if (row.owner !== null && row.owner !== owner) throw Error('Owner identity changed');
      row.owner = owner; return row.id;
    },
    stop() {
      if (active) {
        active = false;
        for (const { target, name, descriptor, wrapper } of saved.reverse()) {
          try { if (target[name] !== wrapper) throw Error('Hook replaced by another owner'); if (descriptor) Object.defineProperty(target, name, descriptor); else delete target[name]; }
          catch (error) { fail('restore:' + name, error); }
        }
      }
      return { contract: 'issue1434-resolve-metadata-v1', diagnosticOnly: true, storageEqualityEligible: false, events: structuredClone(rows), failures: structuredClone(failures), dropped,
        coreBlitMetadataComplete: failures.length === 0 && dropped === 0 && !rows.some(r => r.kind === 'native-throw') && rows.some(r => r.kind === 'explicit-blit') && rows.filter(r => r.kind === 'explicit-blit').every(r => r.nativeCallReturned && r.metadataComplete),
        implicitApiCallReturnedWitnessed: rows.some(r => r.kind === 'implicit-rtt-api' && r.nativeCallReturned), actualImplicitBranch: 'unobserved; native return does not prove GL success', implicitResolveComplete: false,
        nativeStorageBits: 'unobserved', implicitResolvePoints: 'unobserved', glErrorState: 'unobserved; native GL error queue untouched',
        limits: ['Install before all storage and getExtension calls; cached extension methods and prior storage cannot be recovered.', 'Object/allocation/write/invalidation generations identify observed API attempts, not confirmed GL success or content equality.',
          'Only metadata is captured. Native MSAA samples, depth/stencil bits, source/destination bytes and implicit resolve timing remain unobserved.', 'Renderer-requested/clamped sample values are not inferred from GL-call arguments.',
          'Synchronous read-only queries add overhead; no timing/performance or calibration acceptance claim.'] };
    },
  };
}
