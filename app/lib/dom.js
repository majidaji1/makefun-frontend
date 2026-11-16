// Small DOM helpers. Everything the API sends is written as text or as
// attributes set one by one — no markup is ever parsed from API strings.

export function el(tag, props, ...children) {
  const node = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = String(value);
      else if (key === "on") {
        for (const [type, handler] of Object.entries(value)) node.addEventListener(type, handler);
      } else if (key === "data") {
        for (const [name, val] of Object.entries(value)) node.dataset[name] = String(val);
      } else if (key === "style") {
        for (const [name, val] of Object.entries(value)) node.style.setProperty(name, val);
      } else node.setAttribute(key, value === true ? "" : String(value));
    }
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(node, child);
    else if (child instanceof Node) node.appendChild(child);
    else node.appendChild(document.createTextNode(String(child)));
  }
}

export function frag(...children) {
  const box = document.createDocumentFragment();
  append(box, children);
  return box;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function fill(node, ...children) {
  clear(node);
  append(node, children);
  return node;
}

export function setText(node, value) {
  const next = String(value);
  if (node.textContent !== next) node.textContent = next;
  return node;
}

export function sanitizeURL(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^https?:\/\/[^\s]+$/i.test(trimmed)) return trimmed;
  return null;
}

export function avatar(url, size, alt) {
  if (!url) {
    return el("span", {
      class: "av",
      style: { width: size + "px", height: size + "px" },
      "aria-hidden": "true",
    });
  }
  return el("img", {
    class: "av",
    src: url,
    alt: alt || "",
    width: size,
    height: size,
    loading: "lazy",
    decoding: "async",
    crossorigin: "anonymous",
    referrerpolicy: "no-referrer",
    style: { width: size + "px", height: size + "px" },
    on: {
      error(event) {
        const node = event.currentTarget;
        const holder = el("span", { class: "av", "aria-hidden": "true" });
        node.replaceWith(holder);
      },
    },
  });
}

export function pill(label, tone, title) {
  return el("span", { class: "pill" + (tone ? " " + tone : ""), text: label, title });
}

export function statTerm(label, value, hint) {
  return el(
    "dl",
    { class: "stat" },
    el("dt", { text: label }),
    el("dd", {}, hint ? frag(value, el("small", { text: " " + hint })) : value)
  );
}

export function section(title, ...children) {
  const node = el("section", { class: "block" });
  if (title) node.appendChild(el("h2", { text: title }));
  append(node, children);
  return node;
}

export function externalLink(href, label, props) {
  const safe = sanitizeURL(href);
  if (!safe) return el("span", { text: label });
  return el("a", { ...props, href: safe, rel: "noopener noreferrer", target: "_blank" }, label);
}

// One timer for the whole page: whoever needs a per-second repaint subscribes.
const subscribers = new Set();
let timer = 0;

function beat() {
  if (document.hidden) return;
  for (const fn of subscribers) {
    try { fn(); } catch { /* a subscriber must not stop the others */ }
  }
}

export function everySecond(fn) {
  subscribers.add(fn);
  if (!timer) timer = setInterval(beat, 1000);
  return () => {
    subscribers.delete(fn);
    if (!subscribers.size && timer) {
      clearInterval(timer);
      timer = 0;
    }
  };
}

// Fixed-height windowed list: only the rows on screen are in the document.
export function windowed(parent, options) {
  const rowHeight = options.rowHeight;
  const pad = el("div", { class: "vpad" });
  const body = options.body || parent;
  let count = 0;
  let rows = new Map();
  let start = -1;
  let end = -1;
  let frame = 0;
  let renderRow = options.renderRow;

  function paint() {
    frame = 0;
    const height = body.clientHeight || 480;
    const first = Math.max(0, Math.floor(body.scrollTop / rowHeight) - options.overscan);
    const last = Math.min(count, Math.ceil((body.scrollTop + height) / rowHeight) + options.overscan);
    if (first === start && last === end) return;
    start = first;
    end = last;
    for (const [index, node] of rows) {
      if (index < first || index >= last) {
        node.remove();
        rows.delete(index);
      }
    }
    for (let index = first; index < last; index++) {
      if (rows.has(index)) continue;
      const node = renderRow(index);
      if (!node) continue;
      node.style.transform = "";
      node.style.top = index * rowHeight + "px";
      rows.set(index, node);
      pad.appendChild(node);
    }
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(paint);
  }

  parent.appendChild(pad);
  body.addEventListener("scroll", schedule, { passive: true });
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(schedule).observe(body);
  } else {
    window.addEventListener("resize", schedule);
  }

  return {
    setData(items, render) {
      renderRow = render;
      count = items.length;
      pad.style.height = count * rowHeight + "px";
      for (const [, node] of rows) node.remove();
      rows = new Map();
      start = -1;
      end = -1;
      body.scrollTop = 0;
      schedule();
    },
    destroy() {
      body.removeEventListener("scroll", schedule);
      if (frame) cancelAnimationFrame(frame);
      clear(pad);
      rows = new Map();
    },
  };
}

export function errorPanel(error, retry) {
  const missing = error && Number(error.status) === 404;
  const box = el(
    "div",
    { class: "err", role: "alert" },
    el("h2", { text: missing ? "Nothing there" : "That did not load" }),
    el("p", {
      text: missing
        ? "make.fun has no page at that address — the handle or slug may have been renamed."
        : (error && error.message) || "The make.fun API could not be reached.",
    }),
    missing
      ? el("p", { class: "note", text: "Handles and slugs are the ones make.fun shows on its own pages." })
      : el("p", { class: "note", text: "This client reads make.fun live; a retry usually fixes a blip." })
  );
  box.appendChild(el("a", { class: "btn", href: "#/", text: "Back to the board" }));
  if (retry && !missing) {
    box.appendChild(el("button", { class: "btn", text: "Try again", on: { click: retry } }));
  }
  return box;
}

export function skeletons(dad, kind) {
  const count = kind === "rows" ? 8 : 6;
  for (let i = 0; i < count; i++) dad.appendChild(el("div", { class: "skel" }));
}
