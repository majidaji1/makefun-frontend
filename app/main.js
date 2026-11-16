// Router and shell. One static page holds the header, the crumbs, a single
// view slot and the footer; only the view slot is ever replaced, and each
// view repaints its own nodes when fresh data arrives.

import { everySecond, el, fill, errorPanel, setText } from "./lib/dom.js";
import { clockUTC } from "./lib/format.js";

window.__shotReady = false;

const SHELL = {
  view: document.getElementById("view"),
  live: document.getElementById("live"),
  crumbs: document.getElementById("crumbs"),
  clock: document.getElementById("clock"),
  nav: Array.from(document.querySelectorAll("[data-nav]")),
};

const ROUTES = [
  { name: "board", pattern: /^\/?$/ },
  { name: "leaderboard", pattern: /^\/bounty\/([^/]+)\/leaderboard\/?$/ },
  { name: "bounty", pattern: /^\/bounty\/([^/]+)\/?$/ },
  { name: "profile", pattern: /^\/u\/([^/]+)\/?$/ },
];

const LOADERS = {
  board: () => import("./views/board.js"),
  bounty: () => import("./views/bounty.js"),
  leaderboard: () => import("./views/leaderboard.js"),
  profile: () => import("./views/profile.js"),
};

function parseHash(hash) {
  const raw = String(hash || "").replace(/^#/, "");
  const cut = raw.indexOf("?");
  const path = cut === -1 ? raw : raw.slice(0, cut);
  const query = new URLSearchParams(cut === -1 ? "" : raw.slice(cut + 1));
  return { path: path || "/", query };
}

function match(path) {
  for (const route of ROUTES) {
    const found = route.pattern.exec(path);
    if (!found) continue;
    const params = found.slice(1).map((value) => decodeURIComponent(value));
    return { route: route.name, params };
  }
  return null;
}

let current = null;
let generation = 0;

function setLive(text) {
  setText(SHELL.live, text);
}

function setCrumbs(items) {
  if (!items || !items.length) {
    SHELL.crumbs.replaceChildren();
    return;
  }
  const nodes = [];
  items.forEach((item, index) => {
    if (index) nodes.push(el("span", { class: "sep", "aria-hidden": "true" }, "/"));
    if (item.href) nodes.push(el("a", { href: item.href, text: item.label }));
    else nodes.push(el("span", { text: item.label }));
  });
  fill(SHELL.crumbs, nodes);
}

function mark(route) {
  for (const link of SHELL.nav) {
    if (link.dataset.nav === route) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

function notFound(path) {
  SHELL.view.replaceChildren(
    el(
      "div",
      { class: "err" },
      el("h1", { text: "No such view" }),
      el("p", {}, "The route ", el("code", { text: path }), " is not one this client renders."),
      el("p", { class: "note", text: "Try the board, a bounty page, its leaderboard, or a profile." })
    ),
    el("p", {}, el("a", { class: "btn primary", href: "#/", text: "Back to the board" }))
  );
  setCrumbs(null);
  document.title = "Not found · make.fun board";
}

async function render(options = {}) {
  const { path, query } = parseHash(location.hash);
  const found = match(path);
  const mine = ++generation;

  window.__shotReady = false;
  SHELL.view.setAttribute("aria-busy", "true");

  if (current) {
    try { current.destroy(); } catch { /* a dying view must not block the next */ }
    current = null;
  }
  mark(found ? found.route : null);

  if (!found) {
    notFound(path);
    SHELL.view.removeAttribute("aria-busy");
    SHELL.view.focus({ preventScroll: true });
    window.__shotReady = true;
    return;
  }

  SHELL.view.replaceChildren(
    el("div", { class: "boot" }, el("p", { class: "boot-line", text: "Loading…" }))
  );

  const context = {
    params: found.params,
    query,
    route: found.route,
    force: options.force === true,
    live: setLive,
    crumbs: setCrumbs,
    title(title) {
      document.title = title ? title + " · make.fun board" : "make.fun board";
    },
    ready() {
      if (mine !== generation) return;
      SHELL.view.removeAttribute("aria-busy");
      window.__shotReady = true;
    },
    reload() {
      render({ force: true });
    },
  };

  try {
    const module = await LOADERS[found.route]();
    if (mine !== generation) return;
    current = (await module.default(SHELL.view, context)) || null;
  } catch (error) {
    if (mine !== generation) return;
    SHELL.view.replaceChildren(errorPanel(error, () => context.reload()));
    SHELL.view.removeAttribute("aria-busy");
    window.__shotReady = true;
  }

  if (mine === generation) {
    SHELL.view.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

window.addEventListener("hashchange", () => render());
window.addEventListener("online", () => render({ force: true }));

if (!location.hash) location.replace("#/");

everySecond(() => setText(SHELL.clock, clockUTC(Date.now())));
setText(SHELL.clock, clockUTC(Date.now()));
render();
