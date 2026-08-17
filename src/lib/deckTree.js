// src/lib/deckTree.js
// ساخت درخت دک‌ها از نام‌های سلسله‌مراتبی Anki («والد::فرزند») و
// جمع‌زدن شمارنده‌ها به سمت بالا (rolled-up counts) مثل خود Anki.

export const DECK_SEP = '::';

/**
 * @param {Array} decks فهرست دک‌ها ({id, name})
 * @param {Object} counts نگاشت deckId → {new, learn, review}
 * @returns {Array} گره‌های ریشه؛ هر گره: {key, title, deck, children, counts, hasChildren}
 */
export function buildDeckTree(decks, counts = {}) {
  const roots = [];
  const byPath = new Map();

  const ensure = (path) => {
    if (byPath.has(path)) return byPath.get(path);
    const parts = path.split(DECK_SEP);
    const node = {
      key: path,
      title: parts[parts.length - 1],
      depth: parts.length - 1,
      deck: null,
      children: [],
      counts: { new: 0, learn: 0, review: 0 },
    };
    byPath.set(path, node);
    if (parts.length === 1) {
      roots.push(node);
    } else {
      ensure(parts.slice(0, -1).join(DECK_SEP)).children.push(node);
    }
    return node;
  };

  for (const d of decks) {
    const node = ensure(String(d.name || 'Deck'));
    node.deck = d;
  }

  // شمارنده‌ها را از برگ‌ها به بالا جمع می‌زنیم.
  const rollUp = (node) => {
    const own = node.deck ? counts[node.deck.id] || {} : {};
    let agg = { new: own.new || 0, learn: own.learn || 0, review: own.review || 0 };
    for (const child of node.children) {
      const c = rollUp(child);
      agg = { new: agg.new + c.new, learn: agg.learn + c.learn, review: agg.review + c.review };
    }
    node.counts = agg;
    node.hasChildren = node.children.length > 0;
    return agg;
  };
  roots.forEach(rollUp);

  const sortRec = (nodes) => {
    nodes.sort((a, b) => a.title.localeCompare(b.title));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);

  return roots;
}

/** همه‌ی شناسه‌های دکِ زیرِ یک گره (خودش + فرزندان). */
export function collectDeckIds(node, out = []) {
  if (node.deck) out.push(node.deck.id);
  for (const c of node.children) collectDeckIds(c, out);
  return out;
}

/** صاف‌کردن درخت با رعایت وضعیت باز/بسته بودن گره‌ها. */
export function flattenTree(nodes, collapsed, out = []) {
  for (const n of nodes) {
    out.push(n);
    if (!collapsed.has(n.key)) flattenTree(n.children, collapsed, out);
  }
  return out;
}
