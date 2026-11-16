// The leaderboard for one bounty. The API can send hundreds of entries, so the
// table is a fixed-height window: only the rows on screen are ever in the DOM.

import { apiURL, getJSON, peek } from "../lib/net.js";
import {
  el, fill, clear, avatar, windowed, pill, errorPanel, statTerm, setText,
} from "../lib/dom.js";
import { num, compact, stamp, plural } from "../lib/format.js";

const ROW_HEIGHT = readRowHeight();

function readRowHeight() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--rowh");
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 20 ? parsed : 56;
}

export default async function leaderboard(root, ctx) {
  const slug = ctx.params[0];
  const state = {
    payload: null,
    sort: null,
    direction: "desc",
  };

  const view = ctx.query.get("view") || "";
  const phase = ctx.query.get("phase") || "";

  const legend = el("div", { class: "stats" });
  const note = el("p", { class: "note" });
  const holder = el("div");
  const wrap = el("div", { class: "vwrap", role: "region", "aria-label": "Leaderboard rows" });

  fill(root, holder, wrap, legend, note);
  ctx.crumbs([
    { label: "Board", href: "#/" },
    { label: slug, href: "#/bounty/" + slug },
    { label: "Leaderboard" },
  ]);
  ctx.title("Leaderboard · " + slug);
  ctx.live("reading the leaderboard for " + slug);

  const KEY = "lb:" + slug + (view ? "?view=" + view : "") + (phase ? "&phase=" + phase : "");

  const list = windowed(wrap, {
    rowHeight: ROW_HEIGHT,
    overscan: 6,
    renderRow: (index) => state.rows ? state.rows[index] : null,
  });

  function columnsOf(payload) {
    return (payload.columns || []).filter((column) => !column.hidden).sort((a, b) => a.index - b.index);
  }

  // A column that carries numbers (scores, intervals, bytes, a validity flag)
  // is set in mono and flushed right so the eye can compare rows down the page.
  function numericColumn(column) {
    const source = column.source || "";
    return source === "" || source.endsWith("_micro") || source.endsWith("_bytes");
  }

  // Numbers the API keeps in micro units or bytes read badly raw, so they are
  // scaled here; everything else is shown exactly as the API displays it.
  function valueOf(entry, column) {
    const raw = entry.values ? entry.values[column.key] : null;
    const source = column.source || "";
    if (raw !== null && raw !== undefined) {
      const value = Number(raw);
      if (Number.isFinite(value)) {
        if (source.endsWith("_micro")) return (value / 10000).toFixed(2) + "%";
        if (source.endsWith("_bytes")) return compact(value) + "B";
      }
    }
    const shown = entry.display ? entry.display[column.key] : null;
    if (shown !== undefined && shown !== null && shown !== "") return shown;
    return raw === null || raw === undefined ? "—" : String(raw);
  }

  function rowsFor(payload) {
    const entries = (payload.entries || []).slice();
    if (state.sort) {
      const key = state.sort;
      const sign = state.direction === "desc" ? -1 : 1;
      entries.sort((a, b) => {
        const left = Number(a.values ? a.values[key] : NaN);
        const right = Number(b.values ? b.values[key] : NaN);
        if (!Number.isFinite(left) && !Number.isFinite(right)) return (a.rank || 0) - (b.rank || 0);
        if (!Number.isFinite(left)) return 1;
        if (!Number.isFinite(right)) return -1;
        if (left === right) return (a.rank || 0) - (b.rank || 0);
        return (left - right) * sign;
      });
    }
    return entries;
  }

  function gridTemplate(payload) {
    const columns = columnsOf(payload);
    const cell = "minmax(" + (columns.length > 4 ? 68 : 84) + "px, 1fr)";
    const wide = "52px minmax(210px, 2.4fr) " + columns.map(() => cell).join(" ") + " 118px";
    const narrow = "34px minmax(110px, 1.6fr) 62px 80px";
    return { wide, narrow };
  }

  function header(payload) {
    const columns = columnsOf(payload);
    return el(
      "div",
      { class: "lb-head" },
      el("span", { class: "rank", text: "#" }),
      el("span", { text: "Entry" }),
      columns.map((column, position) =>
        el("span", {
          class: "sortable" + (numericColumn(column) ? " num" : "") + (position > 0 ? " extra" : ""),
          text: column.title,
          title: "sort by " + column.title,
          style: { cursor: "pointer" },
          on: { click: () => sortBy(column.key) },
        })
      ),
      el("span", { text: "Flags" })
    );
  }

  function sortBy(key) {
    if (state.sort === key) state.direction = state.direction === "desc" ? "asc" : "desc";
    else {
      state.sort = key;
      state.direction = "desc";
    }
    state.rows = rowsFor(state.payload);
    list.setData(state.rows, (index) => rowNode(state.rows[index]));
    draw();
    controls(state.payload);
  }

  function rowNode(entry) {
    if (!entry) return null;
    const payload = state.payload;
    const columns = columnsOf(payload);
    const handle = entry.handle || "unknown";
    const isTop = entry.rank === 1 && !state.sort;
    const prizeRank = entry.prize_rank ?? entry.rank;

    const who = el(
      "span",
      { class: "who" },
      el(
        "span",
        { class: "h" },
        entry.image ? avatar(entry.image, 22, "avatar of " + handle) : null,
        el("a", { class: "who-name", href: "#/u/" + encodeURIComponent(handle), text: handle }),
        entry.rank_range
          ? el("span", { class: "pill quiet range", text: "#" + entry.rank_range.best + "–#" + entry.rank_range.worst })
          : null
      ),
      el("span", { class: "t", title: entry.title || "", text: entry.title || "no title" })
    );

    const flags = [];
    flags.push(entry.prize_eligible ? pill("prize #" + prizeRank, "ok") : pill("no prize", "quiet"));
    if (entry.status && entry.status !== "finished") flags.push(pill(entry.status, "warm"));
    if (entry.house) flags.push(pill("house", "cool"));
    if (entry.source_withheld) flags.push(pill("held", "quiet", "the source of this entry is not public"));

    const node = el(
      "div",
      { class: "vrow" + (isTop ? " top1" : ""), role: "row" },
      el("span", { class: "rank", text: "#" + (entry.rank ?? "—") }),
      who,
      columns.map((column, position) =>
        el("span", {
          class: "cell" + (numericColumn(column) ? " num" : "") + (position > 0 ? " extra" : ""),
          text: valueOf(entry, column),
          title: column.title + " · " + column.key,
        })
      ),
      el("span", { class: "cell flags" }, flags)
    );
    return node;
  }

  function draw() {
    const payload = state.payload;
    if (!payload) return;
    const columns = columnsOf(payload);
    const grid = gridTemplate(payload);
    root.style.setProperty("--cols", grid.wide);
    root.style.setProperty("--cols-sm", grid.narrow);
    root.querySelectorAll(".lb-head").forEach((head) => head.remove());
    wrap.parentNode.insertBefore(header(payload), wrap);

    const entries = payload.entries || [];
    const eligible = entries.filter((entry) => entry.prize_eligible).length;
    const finished = entries.filter((entry) => entry.status === "finished").length;
    const leader = entries[0];

    fill(
      legend,
      statTerm("Entries", num(entries.length)),
      statTerm("Prize eligible", num(eligible)),
      statTerm("Finished", num(finished)),
      statTerm("Top score", leader ? valueOf(leader, columns[0]) : "—"),
      statTerm("Tie break", payload.tie_break ? payload.tie_break.title : "none")
    );

    const bits = [];
    bits.push(payload.title || "Results");
    if (payload.phase) bits.push("phase " + (payload.phase.title || payload.phase.key));
    if (payload.phase && payload.phase.ends_at) bits.push("ends " + stamp(payload.phase.ends_at));
    if (payload.submission_rule) bits.push("rule " + payload.submission_rule);
    if (payload.columns) bits.push(num(payload.columns.length) + " " + plural(payload.columns.length, "column", "columns"));
    if (payload.metrics_withheld) bits.push("some metrics are withheld while scores are live");
    setText(note, bits.join(" · "));
    ctx.live(
      `${num(entries.length)} ${plural(entries.length, "entry", "entries")} · ` +
        (leader ? "top @" + (leader.handle || "unknown") : "no leader yet") +
        (payload.phase ? " · phase " + (payload.phase.title || payload.phase.key) : "")
    );
  }

  function controls(payload) {
    holder.querySelectorAll(".toolbar").forEach((bar) => bar.remove());
    const views = payload.views || [];
    if (views.length > 1) {
      const tabs = el("div", { class: "tabs", role: "group", "aria-label": "Which ranking" });
      for (const name of views) {
        tabs.appendChild(
          el("button", {
            type: "button",
            text: name,
            "aria-pressed": String(name === (payload.view || "overall")),
            on: { click: () => go({ view: name }) },
          })
        );
      }
      holder.appendChild(el("div", { class: "toolbar" }, el("span", { class: "note", text: "Ranking" }), tabs));
    }
    const phases = ["dev", "final"];
    if (payload.phase && payload.phase.key === "final") phases.reverse();
    const tabs = el("div", { class: "tabs", role: "group", "aria-label": "Which phase" });
    for (const name of phases) {
      tabs.appendChild(
        el("button", {
          type: "button",
          text: name === "dev" ? "Development" : "Final",
          "aria-pressed": String(name === (payload.phase ? payload.phase.key : "dev")),
          on: { click: () => go({ phase: name }) },
        })
      );
    }
    const link = el("a", { class: "btn", href: "#/bounty/" + slug, text: "Bounty page" });
    holder.appendChild(
      el(
        "div",
        { class: "toolbar" },
        el("span", { class: "note", text: "Phase" }),
        tabs,
        el("span", { class: "spacer" }),
        state.sort ? el("span", { class: "note", text: "sorted by " + state.sort + " " + state.direction }) : null,
        link
      )
    );
  }

  function go(changes) {
    const next = new URLSearchParams(ctx.query);
    for (const [key, value] of Object.entries(changes)) next.set(key, value);
    location.hash = "#/bounty/" + slug + "/leaderboard?" + next.toString();
  }

  async function read(force) {
    const url = apiURL("/competitions/" + encodeURIComponent(slug) + "/leaderboard", {
      view: view || undefined,
      phase: phase || undefined,
    });
    const answer = await getJSON(url, { key: KEY, force });
    state.payload = answer.data;
    state.rows = rowsFor(state.payload);
    wrap.style.height = Math.min(state.rows.length * ROW_HEIGHT + 2, 640) + "px";
    list.setData(state.rows, (index) => rowNode(state.rows[index]));
    draw();
    controls(state.payload);
    ctx.ready();
  }

  const cached = peek(KEY);
  if (cached && cached.data) {
    state.payload = cached.data;
    state.rows = rowsFor(state.payload);
    wrap.style.height = Math.min(state.rows.length * ROW_HEIGHT + 2, 640) + "px";
    list.setData(state.rows, (index) => rowNode(state.rows[index]));
    draw();
    controls(state.payload);
    ctx.ready();
  }

  try {
    await read(ctx.force);
  } catch (error) {
    if (!state.payload) {
      fill(holder, errorPanel(error, () => ctx.reload()));
      wrap.style.display = "none";
      setText(note, "the leaderboard could not be read");
    } else {
      setText(note, "kept the last answer: " + (error.message || "request failed"));
    }
    ctx.ready();
  }

  return {
    destroy() {
      list.destroy();
      clear(holder);
    },
  };
}
