// Minimal document-tree surface for ranked style installation in CPU controls tests.
// Detached elements retain ownerDocument, but getRootNode follows attachment.
export function installRankedDocument(doc) {
  const previousQuery = doc.querySelector?.bind(doc);
  function adopt(node, ownerDocument) {
    node.ownerDocument = ownerDocument;
    for (const child of node.children) adopt(child, ownerDocument);
    if (node.shadowRoot) adopt(node.shadowRoot, ownerDocument);
  }
  class Node {
    constructor(tagName = '', nodeType = 1) {
      this.tagName = tagName.toUpperCase(); this.nodeType = nodeType;
      this.ownerDocument = doc; this.parentNode = null; this.children = [];
      this.dataset = {}; this.attributes = new Map(); this.textContent = '';
    }
    getRootNode({ composed = false } = {}) {
      let root = this;
      while (root.parentNode) root = root.parentNode;
      return composed && root.host ? root.host.getRootNode({ composed: true }) : root;
    }
    get isConnected() { return this.getRootNode({ composed: true }).nodeType === 9; }
    appendChild(child) {
      child.remove(); child.parentNode = this; this.children.push(child);
      adopt(child, this.ownerDocument); return child;
    }
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index < 0) throw new Error('NotFoundError');
      this.children.splice(index, 1); child.parentNode = null; return child;
    }
    remove() { this.parentNode?.removeChild(this); }
    hasAttribute(name) {
      if (name.startsWith('data-')) return Object.hasOwn(this.dataset, name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()));
      return this.attributes.has(name);
    }
    attachShadow() {
      if (this.shadowRoot) throw new Error('Shadow root already attached');
      const root = new Node('', 11); root.host = this; this.shadowRoot = root; return root;
    }
  }
  doc.nodeType = 9; doc.parentNode = null;
  doc.getRootNode = () => doc;
  doc.head = new Node('head'); doc.head.parentNode = doc;
  doc.body = new Node('body'); doc.body.parentNode = doc;
  doc.children = [doc.head, doc.body];
  doc.removeChild = Node.prototype.removeChild;
  doc.createElement = tag => new Node(tag);
  doc.createDocumentFragment = () => new Node('', 11);
  doc.querySelector = selector => {
    if (selector !== 'style[data-iw-ranked-runtime]') return previousQuery?.(selector) ?? null;
    const find = node => {
      for (const child of node.children) {
        if (child.tagName === 'STYLE' && child.hasAttribute('data-iw-ranked-runtime')) return child;
        const result = find(child); if (result) return result;
      }
      return null;
    };
    return find(doc);
  };
  return doc;
}
