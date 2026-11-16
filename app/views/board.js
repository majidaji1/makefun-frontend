// The board: every competition make.fun lists, with what a reader needs to
// judge it at a glance — prize, pot, entry fee, time left, entries.

import { apiURL, getJSON, peek, ageLabel } from "../lib/net.js";
import {
  el, frag, fill, clear, everySecond, pill, statTerm, errorPanel, skeletons, setText,
} from "../lib/dom.js";
import { money, num, compact, remaining, stamp, clip, plural } from "../lib/format.js";

const KEY = "board";

export default async function board(root, ctx) {
  const state = { items: [], cursor: null, more: false, loading: false, force: ctx.force };

  const search = el("input", {
    type: "search",
    placeholder: "Filter by title, sponsor, skill, category…",
    "aria-label": "Filter the board",
    autocomplete: "off",
  });

  const sort = el(
    "select",
    { "aria-label": "Sort the board" },
    el("option", { value: "closing", text: "Closing soonest" }),
    el("option", { value: "pot", text: "Biggest pot" }),
    el("option", { value: "entries", text: "Most entries" }),
    el("option", { value: "reward", text: "Biggest listed prize" }),
    el("option", { value: "newest", text: "Newest first" })
  );

  const tabOpen = el("button", { type: "button", text: "Open", "aria-pressed": "true" });
  const tabEnded = el("button", { type: "button", text: "Closed", "aria-pressed": "false" });
  const tabAll = el("button", { type: "button", text: "All", "aria-pressed": "false" });
  const tabs = el("div", { class: "tabs", role: "group", "aria-label": "Which bounties" }, tabOpen, tabEnded, tabAll);

  const refresh = el("button", {
    class: "btn",
    type: "button",
    text: "Refresh",
    title: "Revalidate the board with make.fun",
    on: { click: () => ctx.reload() },
  });

  const stats = el("div", { class: "stats" });
  const count = el("p", { class: "note", "aria-live": "polite" });
  const grid = el("div", { class: "grid" });
  const more = el("button", { class: "btn", type: "button", text: "Load more bounties" });
  const updated = el("span", { class: "note" });

  fill(
    root,
    el(
      "div",
      { class: "head" },
      el("h1", { text: "Open bounties" }),
      el(
        "p",
        { class: "sub" },
        "Live from the public make.fun API. A bounty is open while its deadline is ahead — ",
        "the status field alone does not say so."
      )
    ),
    el("div", { class: "toolbar" }, search, sort, tabs, refresh),
    stats,
    count,
    grid,
    el("div", { class: "head" }, more, updated)
  );

  let mode = "open";
  let query = "";
  let order = "closing";

  ctx.title("Board");
  ctx.crumbs([{ label: "Board" }]);
  skeletons(grid, "cards");

  const unsub = everySecond(() => {
    const now = Date.now();
    for (const node of grid.querySelectorAll("[data-deadline]")) {
      const info = remaining(node.dataset.deadline, now);
      setText(node, info.text);
      node.className = "pill " + info.tone;
    }
    setText(updated, "updated " + ageLabel(lastLoad));
  });

  let lastLoad = 0;

  function visible() {
    const now = Date.now();
    const needle = query.trim().toLowerCase();
    return state.items
      .filter((item) => {
        const open = Date.parse(item.deadline) > now;
        if (mode === "open" && !open) return false;
        if (mode === "ended" && open) return false;
        if (!needle) return true;
        return (
          item.title.toLowerCase().includes(needle) ||
          (item.sponsorName || "").toLowerCase().includes(needle) ||
          (item.category || "").toLowerCase().includes(needle) ||
          item.skills.join(" ").toLowerCase().includes(needle) ||
          item.blurb.toLowerCase().includes(needle)
        );
      })
      .sort(comparators(order, now));
  }

  function drawStats() {
    const list = visible();
    const pot = list.reduce((sum, item) => sum + (Number(item.potUsd) || 0), 0);
    const entries = list.reduce((sum, item) => sum + (Number(item.submissionCount) || 0), 0);
    const soon = list.filter((item) => {
      const left = Date.parse(item.deadline) - Date.now();
      return left > 0 && left < 86400000;
    }).length;
    const free = list.filter((item) => !item.entryFeeUsd).length;

    fill(
      stats,
      statTerm("Shown", num(list.length), plural(list.length, "bounty", "bounties")),
      statTerm("Pot", money(pot)),
      statTerm("Entries in", compact(entries)),
      statTerm("Closing <24h", num(soon)),
      statTerm("Free entry", num(free))
    );
    setText(
      count,
      list.length === state.items.length
        ? `${num(list.length)} bounties on the board.`
        : `${num(list.length)} of ${num(state.items.length)} bounties match.`
    );
  }

  function card(item, now) {
    const left = remaining(item.deadline, now);
    const open = left.open;
    const fee = Number(item.entryFeeUsd) || 0;
    const pot = Number(item.potUsd) || 0;
    const reward = Number(item.rewardAmount) || 0;
    const showPot = pot > 0 && pot !== reward;

    const top = el(
      "div",
      { class: "top-row" },
      el(
        "span",
        { class: "sponsor" },
        item.sponsorName || "unsponsored",
        item.sponsorVerified ? el("span", { class: "pill ok", text: "✓", title: "verified sponsor" }) : null
      ),
      el("span", { "aria-hidden": "true" }, "·"),
      el("span", { text: item.category || "uncategorised" }),
      el("span", { class: "spacer" }),
      el("span", { class: "pill " + left.tone, "data-deadline": item.deadline, title: stamp(item.deadline) }, left.text)
    );

    const prices = el(
      "div",
      { class: "prices" },
      el("span", { class: "price", text: money(reward) }),
      el("span", { class: "note", text: "listed prize" })
    );
    if (showPot) {
      prices.appendChild(el("span", { class: "price pot", text: money(pot) }));
      prices.appendChild(el("span", { class: "note", text: "pot" }));
    }
    prices.appendChild(
      fee > 0
        ? pill(money(fee) + " entry", "warm", "cost to enter")
        : pill("free entry", "ok", "no entry fee")
    );

    const facts = el(
      "div",
      { class: "facts" },
      pill(compact(item.submissionCount) + " " + plural(Number(item.submissionCount), "entry", "entries"), "cool"),
      pill(item.harnessKind || "harness", "quiet"),
      el("span", { class: "spacer" })
    );
    for (const skill of item.skills.slice(0, 2)) facts.appendChild(pill(skill, "quiet"));

    const foot = el(
      "p",
      { class: "note" },
      "Closes ",
      el("time", { datetime: item.deadline, text: stamp(item.deadline) }),
      open ? "" : " · closed"
    );

    return el(
      "article",
      { class: "card bcard" + (open ? "" : " ended") },
      top,
      el("h3", { class: "title" }, el("a", { href: "#/bounty/" + item.slug, text: item.title })),
      el("p", { class: "desc", text: item.blurb }),
      prices,
      facts,
      foot,
      el(
        "div",
        { class: "facts" },
        el("a", { class: "btn", href: "#/bounty/" + item.slug, text: "Bounty" }),
        el("a", { class: "btn", href: "#/bounty/" + item.slug + "/leaderboard", text: "Leaderboard" }),
        el("span", { class: "spacer" }),
        el("a", { class: "btn", href: "https://make.fun/bounty/" + item.slug, rel: "noopener noreferrer", target: "_blank", text: "make.fun ↗" })
      )
    );
  }

  function draw() {
    const list = visible();
    const now = Date.now();
    if (!list.length) {
      fill(grid, el("p", { class: "note", text: "Nothing matches that filter. Clear the search or switch tab." }));
    } else {
      fill(grid, list.map((item) => card(item, now)));
    }
    drawStats();
    more.hidden = !state.more;
    more.disabled = state.loading;
    setText(updated, lastLoad ? "updated " + ageLabel(lastLoad) : "waiting for make.fun");
  }

  function accept(payload, page) {
    const rows = (payload.items || []).map(project);
    if (page === 0) state.items = rows;
    else state.items = state.items.concat(rows.filter((row) => !state.items.some((seen) => seen.slug === row.slug)));
    state.cursor = payload.next_cursor || null;
    state.more = Boolean(state.cursor);
  }

  async function load(page, force) {
    state.loading = true;
    more.disabled = true;
    const cursor = page === 0 ? null : state.cursor;
    const url = apiURL("/competitions", { status: "open", limit: 60, cursor });
    const key = cursor ? "board:" + cursor : KEY;
    try {
      const answer = await getJSON(url, { key, persist: !cursor, force });
      accept(answer.data, page);
      lastLoad = Date.now();
      draw();
      announce();
    } catch (error) {
      if (!state.items.length) {
        fill(grid, errorPanel(error, () => ctx.reload()));
        setText(updated, "make.fun unreachable");
      } else {
        setText(updated, "kept the last answer: " + (error.message || "request failed"));
      }
    } finally {
      state.loading = false;
      more.disabled = false;
      ctx.ready();
    }
  }

  function announce() {
    const now = Date.now();
    const open = state.items.filter((item) => Date.parse(item.deadline) > now).length;
    const pot = state.items
      .filter((item) => Date.parse(item.deadline) > now)
      .reduce((sum, item) => sum + (Number(item.potUsd) || 0), 0);
    ctx.live(`${num(open)} open · ${money(pot)} in pots · updated ${ageLabel(lastLoad)}`);
  }

  search.addEventListener("input", () => {
    query = search.value;
    draw();
  });
  sort.addEventListener("change", () => {
    order = sort.value;
    draw();
  });
  const setTab = (next) => {
    mode = next;
    tabOpen.setAttribute("aria-pressed", String(next === "open"));
    tabEnded.setAttribute("aria-pressed", String(next === "ended"));
    tabAll.setAttribute("aria-pressed", String(next === "all"));
    draw();
  };
  tabOpen.addEventListener("click", () => setTab("open"));
  tabEnded.addEventListener("click", () => setTab("ended"));
  tabAll.addEventListener("click", () => setTab("all"));
  more.addEventListener("click", () => load(1, false));

  const cached = peek(KEY);
  if (cached && cached.data && cached.data.items) {
    accept(cached.data, 0);
    lastLoad = cached.at;
    draw();
    announce();
    ctx.ready();
  }

  await load(0, state.force);

  return {
    destroy() {
      unsub();
      clear(grid);
    },
  };
}

function project(item) {
  return {
    slug: item.slug,
    title: item.title || item.slug,
    category: item.category || "",
    deadline: item.deadline,
    publishedAt: item.publishedAt || null,
    rewardAmount: item.rewardAmount,
    potUsd: item.potUsd,
    entryFeeUsd: item.entryFeeUsd,
    submissionCount: item.submissionCount || 0,
    harnessKind: item.harnessKind || "",
    status: item.status,
    sponsorName: item.sponsor ? item.sponsor.name : "",
    sponsorVerified: Boolean(item.sponsor && item.sponsor.isVerified),
    skills: Array.isArray(item.skills) ? item.skills.slice(0, 6) : [],
    blurb: clip(item.summary || item.description || "", 170),
  };
}

function comparators(order, now) {
  if (order === "pot") return (a, b) => (Number(b.potUsd) || 0) - (Number(a.potUsd) || 0);
  if (order === "reward") return (a, b) => (Number(b.rewardAmount) || 0) - (Number(a.rewardAmount) || 0);
  if (order === "entries") return (a, b) => (Number(b.submissionCount) || 0) - (Number(a.submissionCount) || 0);
  if (order === "newest") return (a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0);
  return (a, b) => {
    const leftA = Date.parse(a.deadline) - now;
    const leftB = Date.parse(b.deadline) - now;
    const liveA = leftA > 0 ? leftA : Infinity;
    const liveB = leftB > 0 ? leftB : Infinity;
    if (liveA !== liveB) return liveA - liveB;
    return (Number(b.potUsd) || 0) - (Number(a.potUsd) || 0);
  };
}
