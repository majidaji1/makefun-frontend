// The small DOM kit the views share: element building, the shared countdown clock, a markdown-lite renderer for
// make.fun's own prose, and the loading, empty and failed states.

import { deadline } from './format.js';

/** Turns children of any shape into nodes: strings become text, arrays are flattened, null is skipped. */
function append(parent, kids) {
  for (const kid of kids) {
    if (kid === null || kid === undefined || kid === false) continue;
    if (Array.isArray(kid)) append(parent, kid);
    else if (kid instanceof Node) parent.append(kid);
    else parent.append(document.createTextNode(String(kid)));
  }
  return parent;
}

/**
 * An element. `class`, `text`, `data`, `attrs` and `on` are handled; every other key is set on the node, so an
 * `<img>` gets `crossOrigin` before `src` when the call names them in that order.
 */
export function el(tag, options = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === null) continue;
    if (key === 'class') node.className = String(value);
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'data') for (const [d, v] of Object.entries(value)) node.dataset[d] = String(v);
    else if (key === 'attrs') for (const [a, v] of Object.entries(value)) node.setAttribute(a, String(v));
    else if (key === 'on') for (const [event, fn] of Object.entries(value)) node.addEventListener(event, fn);
    else if (key === 'kids') append(node, value);
    else node[key] = value;
  }
  return append(node, kids);
}

/** Empties a node without touching its identity, so a view updates in place. */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function text(value) {
  return document.createTextNode(String(value ?? ''));
}

export function pill(label, tone = 'plain', title = null) {
  return el('span', { class: `pill ${tone}`, text: label, title });
}

/** The one clock the page runs: every `[data-deadline]` node in the document is kept current in place. */
let clock = null;
let lastBeat = 0;

function paintDeadlines(now) {
  let soonest = Infinity;
  for (const node of document.querySelectorAll('[data-deadline]')) {
    const info = deadline(node.dataset.deadline, now);
    const bare = node.dataset.fmt === 'bare';
    const words = bare ? info.left.replace(/ left$| ago$/, '') : info.left;
    if (node.textContent !== words) node.textContent = words;
    node.dataset.tone = info.tone;
    if (info.open && info.ms < soonest) soonest = info.ms;
  }
  return soonest;
}

function beat() {
  if (document.hidden) return;
  const now = Date.now();
  // Seconds only matter while something is about to close; otherwise a slow beat keeps the screen still.
  const soonest = paintDeadlines(now);
  const wait = soonest < 3600000 ? 1000 : 15000;
  if (now - lastBeat < wait) return;
  lastBeat = now;
}

/** Starts the countdown clock, and paints every deadline once right away. */
export function startClock() {
  paintDeadlines(Date.now());
  if (clock === null) clock = setInterval(beat, 1000);
}

/** Repaints the deadline nodes now, for a view that has just put new ones on the page. */
export function paintNow() {
  paintDeadlines(Date.now());
}

/** An absolute URL for anything the API answers: its avatar answers are often paths of make.fun's own server. */
export function absolute(url) {
  const value = String(url ?? '');
  if (value === '') return null;
  if (value.startsWith('//')) return `https:${value}`;
  if (value.startsWith('/')) return `https://make.fun${value}`;
  return value;
}

/**
 * An avatar the API's own answer points at, resolved to an absolute URL, with the handle's letters as the fallback
 * when there is no picture or the picture will not load. `crossorigin` goes on before the src, as make.fun's images
 * ask for.
 */
export function avatar(person, size = '') {
  const handle = String(person?.handle ?? person?.name ?? '?');
  const url = absolute(person?.image ?? person?.avatar?.url ?? null);
  const box = el('span', { class: `avatar-wrap ${size}` });
  const letters = () => el('span', { class: 'initials', text: handle.slice(0, 2).toUpperCase() });
  if (url === null) {
    box.append(letters());
    return box;
  }
  const img = el('img', {
    class: 'avatar',
    alt: '',
    title: handle,
    loading: 'lazy',
    decoding: 'async',
    crossOrigin: 'anonymous',
    src: url,
  });
  img.addEventListener('error', () => img.replaceWith(letters()));
  box.append(img);
  return box;
}

/** A labelled figure: what the board and the bounty page lead with. */
export function stat(key, value, note = null, tone = '') {
  return el(
    'div',
    { class: 'stat' },
    el('span', { class: 'k', text: key }),
    el('span', { class: `v ${tone}`, text: value }),
    note === null ? null : el('span', { class: 's', text: note }),
  );
}

/** A labelled countdown: the one figure that keeps moving, painted by the page's clock. */
export function statDeadline(key, iso, note = null, tone = '') {
  return el(
    'div',
    { class: 'stat' },
    el('span', { class: 'k', text: key }),
    el('span', { class: `v ${tone}`, data: { deadline: iso } }),
    note === null ? null : el('span', { class: 's', text: note }),
  );
}

/** A figure inside a card. `deadline` makes it a live countdown instead of fixed text. */
export function fact(key, value, { tone = '', deadline: iso = null, title = null } = {}) {
  const node = el('div', { class: `fact ${tone}` }, el('span', { class: 'k', text: key }));
  if (iso === null) node.append(el('span', { class: `v ${tone}`, text: value, title }));
  else node.append(el('span', { class: 'v', data: { deadline: iso }, title }));
  return node;
}

/** A panel with a heading and a body. */
export function panel(title, ...kids) {
  const box = el('section', { class: 'panel' });
  if (title !== null) box.append(el('h2', { text: title }));
  return append(box, kids);
}

/** A key/value grid of the facts a reader scans. */
export function kv(pairs) {
  const list = el('dl', { class: 'kv' });
  for (const [key, value] of pairs) {
    if (value === null || value === undefined || value === '') continue;
    list.append(el('div', {}, el('dt', { text: key }), el('dd', {}, value)));
  }
  return list;
}

/** A bordered list of rows; `patterns` is the CSS grid each row uses. */
export function rowsTable(pattern, head, rows) {
  const box = el('div', { class: `rows ${pattern}` });
  if (head !== null && head.length > 0) {
    box.append(el('div', { class: 'row head' }, head.map((cell) => el('span', { text: cell }))));
  }
  for (const cells of rows) box.append(el('div', { class: 'row' }, cells));
  return box;
}

/** A bordered list of rows; `patterns` is the CSS grid each row uses. */
export function infoRow(cells) {
  return el('div', { class: 'row' }, cells);
}

// ── prose ────────────────────────────────────────────────────────────────────

const LINK = /\[([^\]]+)\]\((https:\/\/make\.fun[^\s)]*)\)/g;
const TOKEN = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\(https:\/\/make\.fun[^\s)]*\))/g;

/** Inline markdown as nodes: bold, code, and make.fun's own links. Everything else stays the words it is. */
function inline(source) {
  const frag = document.createDocumentFragment();
  let last = 0;
  for (const match of String(source).matchAll(TOKEN)) {
    if (match.index > last) frag.append(text(String(source).slice(last, match.index)));
    const token = match[0];
    LINK.lastIndex = 0;
    const link = LINK.exec(token);
    if (token.startsWith('**')) frag.append(el('strong', {}, text(token.slice(2, -2))));
    else if (token.startsWith('`')) frag.append(el('code', {}, text(token.slice(1, -1))));
    else if (link !== null) frag.append(el('a', { href: link[2], rel: 'noopener', text: link[1] }));
    else frag.append(text(token));
    last = match.index + token.length;
  }
  if (last < String(source).length) frag.append(text(String(source).slice(last)));
  return frag;
}

/** make.fun's prose as headings, lists and paragraphs — never as HTML it could inject. */
export function markdown(source) {
  const frag = document.createDocumentFragment();
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  let para = [];
  let list = null;

  const flushPara = () => {
    if (para.length === 0) return;
    frag.append(el('p', {}, inline(para.join(' '))));
    para = [];
  };
  const closeList = () => {
    if (list !== null) frag.append(list);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === '') {
      flushPara();
      closeList();
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading !== null) {
      flushPara();
      closeList();
      const level = Math.min(4, Math.max(3, heading[1].length + 2));
      frag.append(el(`h${level}`, {}, inline(heading[2])));
      continue;
    }
    const bullet = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(line);
    if (bullet !== null) {
      flushPara();
      const ordered = bullet[2] !== undefined;
      if (list === null || (list.tagName === 'OL') !== ordered) {
        closeList();
        list = el(ordered ? 'ol' : 'ul');
      }
      list.append(el('li', {}, inline(bullet[3])));
      continue;
    }
    para.push(line.trim());
  }
  flushPara();
  closeList();
  return frag;
}

/** Prose in a clamped box with a reader's own toggle, so a long rules sheet never swallows the page. */
export function prose(source, { clampAt = 320 } = {}) {
  const body = el('div', { class: 'prose' }, markdown(source));
  const box = el('div', {}, body);
  const length = String(source ?? '').length;
  if (length < clampAt) return box;

  body.classList.add('fade');
  const toggle = el('button', {
    class: 'btn btn-ghost',
    type: 'button',
    text: 'Show all',
    on: {
      click: () => {
        const open = body.classList.toggle('open');
        body.classList.toggle('fade', !open);
        toggle.textContent = open ? 'Show less' : 'Show all';
      },
    },
  });
  box.append(el('p', {}, toggle));
  return box;
}

// ── states ───────────────────────────────────────────────────────────────────

export function skeletonCards(n = 6) {
  const wrap = el('div', { class: 'cards', attrs: { 'aria-hidden': 'true' } });
  for (let i = 0; i < n; i += 1) {
    wrap.append(
      el('div', { class: 'skeleton sk-card' }, el('div', { class: 'skeleton sk-line sk-title' }), el('div', { class: 'skeleton sk-line' }), el('div', { class: 'skeleton sk-line' })),
    );
  }
  return el('div', { class: 'state-loading', attrs: { role: 'status', 'aria-label': 'Loading' } }, wrap);
}

export function state({ title, body, tone = '', action = null }) {
  const box = el('div', { class: `state ${tone}`, attrs: { role: tone === 'bad' ? 'alert' : undefined } });
  box.append(el('h2', { text: title }));
  if (body) box.append(el('p', { text: body }));
  if (action !== null) box.append(action);
  return box;
}

/** The failed state every view falls back on, with a retry that runs the view's own loader again. */
export function failed(error, retry) {
  const bad = error?.status;
  const body =
    bad === 404
      ? 'make.fun answers 404 for that address. It may have been renamed, or the link may be mistyped.'
      : bad === 429
        ? 'make.fun is rate limiting this client. Waiting a moment and trying again is enough.'
        : String(error?.message ?? error);
  return state({
    title: bad === 404 ? 'Not found' : 'That read failed',
    body,
    tone: 'bad',
    action: el('button', { class: 'btn btn-accent', type: 'button', text: 'Try again', on: { click: () => retry() } }),
  });
}

/** A link back to the board, the way out of every dead end. */
export function backToBoard(label = 'Back to the board') {
  return el('a', { class: 'btn', href: '#/', text: label });
}
