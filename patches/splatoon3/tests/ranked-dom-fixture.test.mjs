import test from 'node:test';
import assert from 'node:assert/strict';
import { installRankedDocument } from './ranked-dom-fixture.mjs';
import { installRankedUi } from '../runtime/ranked/ui.mjs';

test('ranked DOM fixture distinguishes detached, document, fragment, shadow and adopted roots', () => {
  const a = installRankedDocument({}), b = installRankedDocument({});
  const style = a.createElement('style');
  assert.equal(style.tagName, 'STYLE'); assert.equal(style.ownerDocument, a);
  assert.equal(style.getRootNode(), style); assert.equal(style.isConnected, false);
  a.head.appendChild(style);
  assert.equal(style.getRootNode(), a); assert.equal(style.isConnected, true);
  style.remove();
  assert.equal(style.getRootNode(), style); assert.equal(style.ownerDocument, a); assert.equal(style.isConnected, false);
  const fragment = a.createDocumentFragment(); fragment.appendChild(style);
  assert.equal(style.getRootNode(), fragment); assert.equal(style.isConnected, false);
  const host = a.createElement('div'); a.body.appendChild(host);
  const shadow = host.attachShadow({mode:'open'}); shadow.appendChild(style);
  style.dataset.iwRankedRuntime = '1';
  assert.equal(style.hasAttribute('data-iw-ranked-runtime'), true);
  assert.equal(style.getRootNode(), shadow); assert.equal(style.getRootNode({composed:true}), a);
  assert.equal(style.isConnected, true); assert.equal(a.querySelector('style[data-iw-ranked-runtime]'), null);
  host.remove(); assert.equal(style.isConnected, false); assert.equal(style.getRootNode({composed:true}), host);
  b.head.appendChild(style);
  assert.equal(style.ownerDocument, b); assert.equal(style.getRootNode(), b); assert.equal(style.isConnected, true);
  assert.equal(shadow.children.length, 0); assert.equal(b.querySelector('style[data-iw-ranked-runtime]'), style);
  delete style.dataset.iwRankedRuntime;
  assert.equal(style.hasAttribute('data-iw-ranked-runtime'), false);
  assert.equal(b.querySelector('style[data-iw-ranked-runtime]'), null);
});

test('actual ranked style cache reuses connected styles but replaces detached, shadowed and adopted entries', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  try {
    const a = installRankedDocument({}), b = installRankedDocument({});
    globalThis.document = a; installRankedUi();
    let style = a.querySelector('style[data-iw-ranked-runtime]');
    assert.ok(style); assert.ok(style.textContent.includes('.iw-ranked-hud'));
    for (let i=0;i<5;i++) installRankedUi();
    assert.deepEqual(a.head.children, [style]);
    style.remove(); installRankedUi();
    const replacement = a.querySelector('style[data-iw-ranked-runtime]');
    assert.notEqual(replacement, style); assert.equal(style.isConnected, false);
    style = replacement;
    const host = a.createElement('div'); a.body.appendChild(host);
    host.attachShadow({mode:'open'}).appendChild(style);
    assert.equal(style.isConnected, true); assert.notEqual(style.getRootNode(), a);
    installRankedUi();
    const lightStyle = a.querySelector('style[data-iw-ranked-runtime]');
    assert.notEqual(lightStyle, style); assert.deepEqual(a.head.children, [lightStyle]);
    b.head.appendChild(lightStyle); installRankedUi();
    assert.notEqual(a.querySelector('style[data-iw-ranked-runtime]'), lightStyle);
    globalThis.document = b; installRankedUi(); installRankedUi();
    assert.deepEqual(b.head.children, [lightStyle]);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete globalThis.document;
  }
});
